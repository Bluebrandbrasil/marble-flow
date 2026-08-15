import { safeArray } from '../lib/dataDiagnostics';

export type ContractDisplayStatus = 'em_edicao' | 'assinado_presencial' | 'assinado' | 'pendente';

export const getContractDisplayStatus = (contract: any): ContractDisplayStatus => {
    if (!contract) return 'em_edicao';
    if (contract.contractStatus === 'draft') return 'em_edicao';
    if (contract.signatureMode === 'presencial' && contract.contractStatus === 'signed') return 'assinado_presencial';
    if (contract.contractStatus === 'signed') return 'assinado';
    if (['sent', 'pending', 'viewed', 'company_signed'].includes(contract.contractStatus)) return 'pendente';
    return 'em_edicao';
};

export interface ContractLineItem {
  environmentName: string; // normalized to uppercase (e.g. "COZINHA" or "ACESSÓRIOS & SERVIÇOS GLOBAIS")
  category: string; // "PEÇAS", "ACESSÓRIOS / CUBAS", "SERVIÇOS", "FRETE", "SERVIÇOS INCLUSOS"
  description: string;
  quantity: number;
  unitValue: number;
  totalValue: number;
  included: boolean; // true if value is 0 or explicitly marked as cortesia/included
  suppliedByClient?: boolean; // true if supplied by client
}

export function buildContractLineItems(order: any): ContractLineItem[] {
    const list: ContractLineItem[] = [];
    if (!order) return list;

    // Helper to get environment name normalized or fallback to global
    const normalizeEnv = (env: string | null | undefined): string => {
        const trimmed = String(env || '').trim().toUpperCase();
        if (!trimmed || trimmed === 'NULL' || trimmed === 'UNDEFINED') {
            return 'ACESSÓRIOS & SERVIÇOS GLOBAIS';
        }
        return trimmed;
    };

    // Helper to clean accessory clean name & environment
    const getAccessoryEnvAndName = (acc: any) => {
        const name = acc.name || acc.accessoryName || 'Acessório';
        if (name.includes(' - ')) {
            const parts = name.split(' - ');
            const env = parts[0].trim();
            const cleanName = parts.slice(1).join(' - ').trim();
            return { env, cleanName };
        }
        if (acc.environment) {
            return { env: acc.environment.trim(), cleanName: name };
        }
        return { env: null, cleanName: name };
    };

    // 1. COLLECT STONES (PEÇAS)
    // We search across: order.items, contractSnapshot.items, orderSnapshot.items, quoteSnapshot.items, etc.
    const rawItems = safeArray(
        order.items && order.items.length > 0 ? order.items :
        (order.contractSnapshot?.items && order.contractSnapshot.items.length > 0 ? order.contractSnapshot.items :
        (order.orderSnapshot?.items && order.orderSnapshot.items.length > 0 ? order.orderSnapshot.items :
        (order.quoteSnapshot?.items && order.quoteSnapshot.items.length > 0 ? order.quoteSnapshot.items : [])))
    );

    rawItems.forEach((item: any) => {
        const name = item.name || 'Peça';
        const environment = item.environment || (name.includes(' - ') ? name.split(' - ')[1] : 'Ambiente');
        const envName = normalizeEnv(environment);
        const qty = item.quantity || 1;
        const total = typeof item.totalPrice === 'number' ? item.totalPrice : (item.total || 0);
        const unitVal = total / qty;

        const pieceLabel = name.includes(' - ') ? name.split(' - ')[0] : name;
        const lengthM = item.length || item.lengthM || 0;
        const widthM = item.width || item.widthM || 0;
        
        // Format dimensions helper: if > 10, assume cm and divide by 100
        const formatDim = (val: any) => {
            const num = Number(val) || 0;
            if (num <= 0) return '0,00';
            const meters = num > 10 ? num / 100 : num;
            return meters.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        };
        const dimStr = lengthM > 0 && widthM > 0 ? ` (${formatDim(lengthM)}x${formatDim(widthM)})` : '';
        const materialStr = item.material ? ` [${String(item.material).toUpperCase()}]` : '';

        list.push({
            environmentName: envName,
            category: 'PEÇAS',
            description: `${pieceLabel.toUpperCase()}${dimStr}${materialStr}`,
            quantity: qty,
            unitValue: unitVal,
            totalValue: total,
            included: total === 0,
            suppliedByClient: false
        });

        // Parse included finishings/cuts/extras as included items if they exist
        const rawServices = [
            item.finishings,
            item.extras,
            item.cuts,
            item.holes,
            item.sink,
            item.cuba
        ];

        const uniqueServices = new Set<string>();
        rawServices.forEach(val => {
            if (val === null || val === undefined) return;
            if (Array.isArray(val)) {
                val.map(v => String(v).trim()).forEach(v => uniqueServices.add(v));
            } else {
                const str = String(val).trim();
                if (str.includes('|')) {
                    str.split('|').map(s => s.trim()).forEach(v => uniqueServices.add(v));
                } else if (str.includes(',')) {
                    str.split(',').map(s => s.trim()).forEach(v => uniqueServices.add(v));
                } else {
                    uniqueServices.add(str);
                }
            }
        });

        // Normalization helper for service labels
        const normalizeServiceLabel = (value: any) => {
            const text = String(value || '').trim().toLowerCase();
            if (!text || text === 'undefined' || text === 'null') return '';
            if (text.includes('cuba')) return 'RECORTE DA CUBA';
            if (text.includes('torneira')) return 'FURO PARA TORNEIRA';
            if (text.includes('cooktop')) return 'CORTE PARA COOKTOP';
            if (text.includes('tanque')) return 'RECORTE DO TANQUE';
            if (text.includes('lavatório') || text.includes('lavatorio')) return 'RECORTE DO LAVATÓRIO';
            return text.toUpperCase();
        };

        Array.from(uniqueServices).forEach(val => {
            const text = String(val || '').trim().toLowerCase();
            if (!text || text === 'undefined' || text === 'null') return;

            // Check if this indicates a customer-provided item
            const isProvided = text.includes('fornecido') || text.includes('fornecida') || text.includes('cliente') || text.includes('provided');

            if (isProvided) {
                let desc = '';
                if (text.includes('lavatório') || text.includes('lavatorio')) {
                    desc = 'CUBA LAVATÓRIO';
                } else if (text.includes('cuba gourmet')) {
                    desc = 'CUBA GOURMET';
                } else if (text.includes('cuba')) {
                    desc = 'CUBA';
                } else if (text.includes('tanque')) {
                    desc = 'TANQUE';
                } else if (text.includes('lixeira')) {
                    desc = 'LIXEIRA';
                } else if (text.includes('cooktop')) {
                    desc = 'COOKTOP';
                } else {
                    desc = text.replace(/fornecido pelo cliente|fornecida pelo cliente|fornecido|fornecida|cliente/gi, '').trim().toUpperCase();
                }

                if (desc) {
                    list.push({
                        environmentName: envName,
                        category: 'FORNECIDO PELO CLIENTE',
                        description: desc,
                        quantity: 1,
                        unitValue: 0,
                        totalValue: 0,
                        included: true,
                        suppliedByClient: true
                    });
                }
            } else {
                const svc = normalizeServiceLabel(val);
                if (svc) {
                    list.push({
                        environmentName: envName,
                        category: 'SERVIÇOS INCLUSOS',
                        description: svc,
                        quantity: 1,
                        unitValue: 0,
                        totalValue: 0,
                        included: true,
                        suppliedByClient: false
                    });
                }
            }
        });

        // Check if item has suppliedByClient
        if (item.suppliedByClient) {
            const suppliedList = Array.isArray(item.suppliedByClient)
                ? item.suppliedByClient.map(String)
                : String(item.suppliedByClient).split('|').map(s => s.trim());

            suppliedList.filter(Boolean).forEach(supp => {
                list.push({
                    environmentName: envName,
                    category: 'FORNECIDO PELO CLIENTE',
                    description: supp.toUpperCase(),
                    quantity: 1,
                    unitValue: 0,
                    totalValue: 0,
                    included: true,
                    suppliedByClient: true
                });
            });
        }
    });

    // 2. COLLECT ACCESSORIES (ACESSÓRIOS / CUBAS)
    // We search across multiple fields: order.accessories, contractSnapshot.accessories, orderSnapshot.accessories, selectedAccessories, environmentAccessories, cubas, etc.
    const rawAccessories = safeArray(
        order.accessories && order.accessories.length > 0 ? order.accessories :
        (order.contractSnapshot?.accessories && order.contractSnapshot.accessories.length > 0 ? order.contractSnapshot.accessories :
        (order.orderSnapshot?.accessories && order.orderSnapshot.accessories.length > 0 ? order.orderSnapshot.accessories :
        (order.quoteSnapshot?.accessories && order.quoteSnapshot.accessories.length > 0 ? order.quoteSnapshot.accessories :
        (order.selectedAccessories && order.selectedAccessories.length > 0 ? order.selectedAccessories :
        (order.environmentAccessories && order.environmentAccessories.length > 0 ? order.environmentAccessories :
        (order.cubas && order.cubas.length > 0 ? order.cubas : []))))))
    );

    // Add explicit fallback for order.sinkName, order.cuba, order.accessoryName if they are not in rawAccessories
    const fallbackAccs: any[] = [];
    const lowerAccNames = rawAccessories.map(a => String(a.name || a.accessoryName || '').toLowerCase());
    
    if (order.sinkName && !lowerAccNames.some(name => name.includes(order.sinkName.toLowerCase()))) {
        fallbackAccs.push({
            name: `CUBA: ${order.sinkName}`,
            quantity: 1,
            unitPrice: 0,
            total: 0
        });
    }
    if (!order.sinkName && order.cuba && !lowerAccNames.some(name => name.includes('cuba'))) {
        fallbackAccs.push({
            name: `CUBA: ${order.cuba}`,
            quantity: 1,
            unitPrice: 0,
            total: 0
        });
    }
    if (order.accessoryName && !lowerAccNames.some(name => name.includes(order.accessoryName.toLowerCase()))) {
        fallbackAccs.push({
            name: order.accessoryName,
            quantity: 1,
            unitPrice: 0,
            total: 0
        });
    }

    const allAccessories = [...rawAccessories, ...fallbackAccs];

    allAccessories.forEach((acc: any) => {
        const { env, cleanName } = getAccessoryEnvAndName(acc);
        const envName = normalizeEnv(env);
        const qty = acc.quantity || 1;
        const unitVal = typeof acc.unitPrice === 'number' ? acc.unitPrice : (acc.price || 0);
        const total = typeof acc.total === 'number' ? acc.total : (unitVal * qty);
        
        const isClientSupplied = cleanName.toLowerCase().includes('cliente') || !!acc.suppliedByClient;

        list.push({
            environmentName: envName,
            category: 'ACESSÓRIOS / CUBAS',
            description: cleanName.toUpperCase(),
            quantity: qty,
            unitValue: isClientSupplied ? 0 : unitVal,
            totalValue: isClientSupplied ? 0 : total,
            included: total === 0 || isClientSupplied,
            suppliedByClient: isClientSupplied
        });
    });

    // 2.5 COLLECT CUSTOMER PROVIDED ITEMS FROM ENVIRONMENT GROUPS
    const rawGroups = safeArray(
        order.groups && order.groups.length > 0 ? order.groups :
        (order.contractSnapshot?.environments && order.contractSnapshot.environments.length > 0 ? order.contractSnapshot.environments :
        (order.contractSnapshot?.groups && order.contractSnapshot.groups.length > 0 ? order.contractSnapshot.groups :
        (order.orderSnapshot?.groups && order.orderSnapshot.groups.length > 0 ? order.orderSnapshot.groups :
        (order.quoteSnapshot?.groups && order.quoteSnapshot.groups.length > 0 ? order.quoteSnapshot.groups : []))))
    );

    rawGroups.forEach((g: any) => {
        const envName = normalizeEnv(g.environmentName || g.name || 'Ambiente');
        const provided = g.itensFornecidosCliente || {};
        
        if (provided.cuba) {
            list.push({
                environmentName: envName,
                category: 'FORNECIDO PELO CLIENTE',
                description: 'CUBA',
                quantity: 1,
                unitValue: 0,
                totalValue: 0,
                included: true,
                suppliedByClient: true
            });
        }
        if (provided.tanque) {
            list.push({
                environmentName: envName,
                category: 'FORNECIDO PELO CLIENTE',
                description: 'TANQUE',
                quantity: 1,
                unitValue: 0,
                totalValue: 0,
                included: true,
                suppliedByClient: true
            });
        }
        if (provided.cubaLavatorio) {
            list.push({
                environmentName: envName,
                category: 'FORNECIDO PELO CLIENTE',
                description: 'CUBA LAVATÓRIO',
                quantity: 1,
                unitValue: 0,
                totalValue: 0,
                included: true,
                suppliedByClient: true
            });
        }
        if (provided.cubaGourmet) {
            list.push({
                environmentName: envName,
                category: 'FORNECIDO PELO CLIENTE',
                description: 'CUBA GOURMET',
                quantity: 1,
                unitValue: 0,
                totalValue: 0,
                included: true,
                suppliedByClient: true
            });
        }
        if (provided.lixeira) {
            list.push({
                environmentName: envName,
                category: 'FORNECIDO PELO CLIENTE',
                description: 'LIXEIRA',
                quantity: 1,
                unitValue: 0,
                totalValue: 0,
                included: true,
                suppliedByClient: true
            });
        }
    });

    // 3. COLLECT SERVICES & FREIGHT (SERVIÇOS)
    // We search across: order.services, contractSnapshot.services, orderSnapshot.services, quoteSnapshot.services
    const rawServices = safeArray(
        order.services && order.services.length > 0 ? order.services :
        (order.contractSnapshot?.services && order.contractSnapshot.services.length > 0 ? order.contractSnapshot.services :
        (order.orderSnapshot?.services && order.orderSnapshot.services.length > 0 ? order.orderSnapshot.services :
        (order.quoteSnapshot?.services && order.quoteSnapshot.services.length > 0 ? order.quoteSnapshot.services : [])))
    );

    rawServices.forEach((srv: any) => {
        const desc = srv.description || srv.name || 'Serviço';
        const isFreight = srv.type === 'frete' || desc.toLowerCase().includes('frete');
        
        const qty = srv.quantity || 1;
        const unitVal = typeof srv.unitPrice === 'number' ? srv.unitPrice : (srv.price || 0);
        const total = typeof srv.total === 'number' ? srv.total : (unitVal * qty);
        
        list.push({
            environmentName: 'ACESSÓRIOS & SERVIÇOS GLOBAIS',
            category: isFreight ? 'FRETE' : 'SERVIÇOS',
            description: desc.toUpperCase(),
            quantity: qty,
            unitValue: unitVal,
            totalValue: total,
            included: total === 0,
            suppliedByClient: false
        });
    });

    // 4. EXPLICIT FREIGHT (If not already added as a service)
    const freightVal = Number(order.freight || order.contractSnapshot?.freight || 0);
    const hasFreightInList = list.some(item => item.category === 'FRETE');
    if (freightVal > 0 && !hasFreightInList) {
        list.push({
            environmentName: 'ACESSÓRIOS & SERVIÇOS GLOBAIS',
            category: 'FRETE',
            description: 'FRETE / ENTREGA E LOGÍSTICA',
            quantity: 1,
            unitValue: freightVal,
            totalValue: freightVal,
            included: false,
            suppliedByClient: false
        });
    }

    // Deduplicate included items and zero-value accessories/services by environment, category, and description
    const seen = new Set<string>();
    const deduplicatedList: ContractLineItem[] = [];

    list.forEach(item => {
        if (item.included || item.totalValue === 0 || item.category === 'SERVIÇOS INCLUSOS') {
            const normalizedDesc = item.description.trim().toUpperCase().replace(/\s+/g, ' ');
            const key = `${item.environmentName.trim().toUpperCase()}|${item.category}|${normalizedDesc}`;
            if (seen.has(key)) {
                return; // skip duplicate
            }
            seen.add(key);
        }
        deduplicatedList.push(item);
    });

    return deduplicatedList;
}
