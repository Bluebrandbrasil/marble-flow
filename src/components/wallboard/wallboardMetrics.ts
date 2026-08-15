import { Quote, Order, Contract, Measurement, StoneGroup, OrderItem } from '../../types';
import { safeArray } from '../../lib/dataDiagnostics';
import { safeParseISO } from '../../lib/dateUtils';
import { isWithinInterval, startOfDay, endOfDay, differenceInDays, isSameDay, startOfWeek, endOfWeek } from 'date-fns';

export interface WallboardMetricsContext {
    quotes: Quote[];
    orders: Order[];
    contracts: Contract[];
    measurements: Measurement[];
    startDate: Date;
    endDate: Date;
}

export const isValidDate = (d: any) => d instanceof Date && !isNaN(d.getTime());

export const getWallboardMetrics = (ctx: WallboardMetricsContext) => {
    const { quotes, orders, contracts, startDate, endDate } = ctx;

    const interval = { start: startOfDay(startDate), end: endOfDay(endDate) };

    // 1. Orçamentos Criados
    // Regras: deduplicar (parentQuoteId), createdAt no período, não cancelados/excluídos.
    const createdQuotesMap = new Map<string, Quote>();
    safeArray(quotes).forEach(q => {
        if (q.isDeleted || q.deleted) return;
        const status = String(q.status || q.quoteStage).toLowerCase();
        if (['cancelado', 'deleted', 'draft_zero'].includes(status)) return;
        
        const date = safeParseISO(q.createdAt);
        if (!date || !isValidDate(date) || !isWithinInterval(date, interval)) return;
        
        const key = q.parentQuoteId || q.id;
        // Keep the latest version
        if (!createdQuotesMap.has(key) || q.version > (createdQuotesMap.get(key)!.version || 0)) {
            createdQuotesMap.set(key, q);
        }
    });
    const createdQuotes = Array.from(createdQuotesMap.values());

    // 2. Contratos Gerados
    // Regras: únicos, contractId, createdAt/generatedAt no período, não cancelados
    const validContracts = safeArray(contracts).filter(c => {
        if (c.isDeleted || c.deleted) return false;
        const status = String(c.contractStatus || c.status).toLowerCase();
        if (['cancelado', 'revogado', 'deleted'].includes(status)) return false;
        return true;
    });

    const generatedContracts = validContracts.filter(c => {
        const date = safeParseISO(c.createdAt || c.osGeneratedAt || '');
        return date && isValidDate(date) && isWithinInterval(date, interval);
    });

    // 3. Contratos Assinados
    // Regras: assinados, signedAt no período
    const signedContracts = validContracts.filter(c => {
        const date = safeParseISO(c.signedAt || c.contractSignedAt || '');
        return date && isValidDate(date) && isWithinInterval(date, interval);
    });

    // Vendas e Financeiro
    const totalGeneratedAmount = generatedContracts.reduce((acc, c) => {
        return acc + Number(c.contractSignedSnapshot?.totalAmount || c.contractSnapshot?.totalAmount || c.totalAmount || 0);
    }, 0);

    const totalSignedAmount = signedContracts.reduce((acc, c) => {
        return acc + Number(c.contractSignedSnapshot?.totalAmount || c.contractSnapshot?.totalAmount || c.totalAmount || 0);
    }, 0);

    // Conversão
    const conversionToContract = createdQuotes.length > 0 ? (generatedContracts.length / createdQuotes.length) * 100 : 0;
    const conversionToSignature = generatedContracts.length > 0 ? (signedContracts.length / generatedContracts.length) * 100 : 0;

    // 4. Materiais
    const materialMap = new Map<string, { id: string; name: string; sqm: number; contractCount: number; contracts: Set<string> }>();
    generatedContracts.forEach(c => {
        const items = safeArray(c.contractSignedSnapshot?.items || c.contractSnapshot?.groups || c.contractSnapshot?.items || c.items);
        items.forEach((item: any) => {
            const mId = item.materialId || item.stoneId || item.productId || item.catalogItemId || item.name;
            if (!mId) return;
            const mName = item.materialName || item.material || item.name || 'Desconhecido';
            
            // Normalize name slightly if no id
            const normId = String(mId).toLowerCase().trim();
            const sqm = Number(item.sqm || item.area || 0) * (item.quantity || 1);

            if (!materialMap.has(normId)) {
                materialMap.set(normId, { id: normId, name: mName, sqm: 0, contractCount: 0, contracts: new Set() });
            }
            const stat = materialMap.get(normId)!;
            stat.sqm += sqm;
            stat.contracts.add(c.id);
        });
    });

    const materials = Array.from(materialMap.values()).map(m => ({
        ...m,
        contractCount: m.contracts.size
    })).sort((a, b) => b.sqm - a.sqm);

    // 5. Cidades
    const cityMap = new Map<string, { city: string; contracts: number; amount: number }>();
    generatedContracts.forEach(c => {
        const city = String(c.contractSignedSnapshot?.clientCity || c.contractSnapshot?.clientCity || c.clientCity || c.clientSnapshot?.city || 'Não informada').trim().toUpperCase();
        const amount = Number(c.contractSignedSnapshot?.totalAmount || c.contractSnapshot?.totalAmount || c.totalAmount || 0);
        
        if (!cityMap.has(city)) cityMap.set(city, { city, contracts: 0, amount: 0 });
        const stat = cityMap.get(city)!;
        stat.contracts++;
        stat.amount += amount;
    });
    
    const citiesByQty = Array.from(cityMap.values()).sort((a, b) => b.contracts - a.contracts);
    const citiesByValue = Array.from(cityMap.values()).sort((a, b) => b.amount - a.amount);

    // 6. Vendedores
    const sellerMap = new Map<string, { id: string; name: string; generated: number; signed: number; amount: number }>();
    validContracts.forEach(c => {
        // Evaluate both generated and signed for this metric
        const genDate = safeParseISO(c.createdAt || c.osGeneratedAt || '');
        const isGen = genDate && isValidDate(genDate) && isWithinInterval(genDate, interval);
        
        const signDate = safeParseISO(c.signedAt || c.contractSignedAt || '');
        const isSign = signDate && isValidDate(signDate) && isWithinInterval(signDate, interval);

        if (!isGen && !isSign) return;

        const sId = String(c.sellerId || c.contractSnapshot?.sellerId || c.orderSnapshot?.sellerId || c.quoteSnapshot?.sellerId || 'unknown');
        const sName = String(c.contractSnapshot?.sellerSnapshot?.name || c.sellerName || 'Não identificado');

        if (!sellerMap.has(sId)) sellerMap.set(sId, { id: sId, name: sName, generated: 0, signed: 0, amount: 0 });
        const stat = sellerMap.get(sId)!;
        
        if (isGen) {
            stat.generated++;
            stat.amount += Number(c.contractSignedSnapshot?.totalAmount || c.contractSnapshot?.totalAmount || c.totalAmount || 0);
        }
        if (isSign) {
            stat.signed++;
        }
    });
    const sellers = Array.from(sellerMap.values()).map(s => ({
        ...s,
        signatureRate: s.generated > 0 ? (s.signed / s.generated) * 100 : 0
    })).sort((a, b) => b.generated - a.generated);

    // 7. Produção
    const activeProduction = orders.filter(o => o.status === 'em_producao' && !o.isDeleted);
    const completedProduction = orders.filter(o => o.productionCompletedAt && o.productionStartDate && !o.isDeleted);
    
    const now = new Date();
    let currentProdTimeSum = 0;
    activeProduction.forEach(o => {
        const start = safeParseISO(o.productionStartDate || o.createdAt);
        if (start && isValidDate(start)) {
            currentProdTimeSum += differenceInDays(now, start);
        }
    });
    const avgCurrentProdTime = activeProduction.length > 0 ? currentProdTimeSum / activeProduction.length : 0;

    let totalCompletedProdTime = 0;
    const completedProdDays: number[] = [];
    completedProduction.forEach(o => {
        const start = safeParseISO(o.productionStartDate!);
        const end = safeParseISO(o.productionCompletedAt!);
        if (start && end && isValidDate(start) && isValidDate(end)) {
            const days = Math.max(0, differenceInDays(end, start));
            totalCompletedProdTime += days;
            completedProdDays.push(days);
        }
    });
    const avgCompletedProdTime = completedProdDays.length > 0 ? totalCompletedProdTime / completedProdDays.length : 0;
    completedProdDays.sort((a, b) => a - b);
    const medianCompletedProdTime = completedProdDays.length > 0 
        ? (completedProdDays.length % 2 === 0 
            ? (completedProdDays[completedProdDays.length/2 - 1] + completedProdDays[completedProdDays.length/2]) / 2 
            : completedProdDays[Math.floor(completedProdDays.length/2)]) 
        : 0;

    // 8. Instalação
    const today = startOfDay(now);
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
    
    const installationsToday = orders.filter(o => {
        if (o.isDeleted || o.status === 'cancelado') return false;
        const d = safeParseISO(o.installationDate || '');
        return d && isValidDate(d) && isSameDay(d, today);
    });

    const installationsWeek = orders.filter(o => {
        if (o.isDeleted || o.status === 'cancelado') return false;
        const d = safeParseISO(o.installationDate || '');
        return d && isValidDate(d) && isWithinInterval(d, { start: weekStart, end: weekEnd });
    });

    const completedInstallations = orders.filter(o => o.installationCompletedAt && o.installationStartDate && !o.isDeleted);
    let totalCompletedInstTime = 0;
    completedInstallations.forEach(o => {
        const start = safeParseISO(o.installationStartDate!);
        const end = safeParseISO(o.installationCompletedAt!);
        if (start && end && isValidDate(start) && isValidDate(end)) {
            totalCompletedInstTime += Math.max(0, differenceInDays(end, start));
        }
    });
    const avgInstTime = completedInstallations.length > 0 ? totalCompletedInstTime / completedInstallations.length : 0;

    return {
        commercial: {
            createdQuotes: createdQuotes.length,
            generatedContracts: generatedContracts.length,
            signedContracts: signedContracts.length,
            conversionToContract,
            conversionToSignature,
            totalGeneratedAmount,
            totalSignedAmount
        },
        materials,
        cities: {
            byQty: citiesByQty,
            byValue: citiesByValue
        },
        sellers,
        production: {
            activeCount: activeProduction.length,
            avgCurrentTime: avgCurrentProdTime,
            completedCount: completedProdDays.length,
            avgCompletedTime: avgCompletedProdTime,
            medianCompletedTime: medianCompletedProdTime
        },
        installation: {
            today: installationsToday,
            week: installationsWeek,
            completedCount: completedInstallations.length,
            avgTime: avgInstTime
        }
    };
};
