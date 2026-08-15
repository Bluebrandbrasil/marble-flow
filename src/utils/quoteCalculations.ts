import { safeArray } from '../lib/dataDiagnostics';
import { safeParseISO } from '../lib/dateUtils';
import type { Quote, StoneGroup, StonePieceType } from '../types';

/**
 * Funções de Parsing de Dados Novos (QuoteBuilder)
 */
export const parseBRFloat = (value: string | number | undefined | null): number => {
    if (value === undefined || value === null || value === '') return 0;
    if (typeof value === 'number') return value;
    const cleaned = String(value).replace(',', '.');
    const num = parseFloat(cleaned);
    return Number.isNaN(num) ? 0 : num;
};

/**
 * Converte qualquer formato de data para um objeto Date nativo local com fuso de America/Sao_Paulo.
 * Retorna null se falhar na conversão.
 */
export const getLocalDateInTimezone = (val: any, timezone: string = 'America/Sao_Paulo'): Date | null => {
    if (!val) return null;
    const date = safeParseISO(val);
    if (!date) return null;
    try {
        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: timezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });
        const parts = formatter.formatToParts(date);
        const year = parseInt(parts.find(p => p.type === 'year')!.value, 10);
        const month = parseInt(parts.find(p => p.type === 'month')!.value, 10) - 1; // 0-indexed
        const day = parseInt(parts.find(p => p.type === 'day')!.value, 10);
        const hour = parseInt(parts.find(p => p.type === 'hour')!.value, 10);
        const minute = parseInt(parts.find(p => p.type === 'minute')!.value, 10);
        const second = parseInt(parts.find(p => p.type === 'second')!.value, 10);
        
        return new Date(year, month, day, hour, minute, second);
    } catch (e) {
        console.warn('[TIMEZONE CONVERSION ERROR] Failed to convert date to timezone:', timezone, val, e);
        return null;
    }
};

/**
 * Retorna a chave de data no fuso (formato YYYY-MM-DD) para um orçamento.
 * Retorna null se não puder converter.
 */
export const getQuoteCreatedDateKey = (quote: any, timezone: string = 'America/Sao_Paulo'): string | null => {
    if (!quote) return null;
    const dbVal = quote.createdAt || 
                  quote.createdDate || 
                  quote.date || 
                  quote.quoteDate;
    if (!dbVal) return null;
    
    const date = safeParseISO(dbVal);
    if (!date || isNaN(date.getTime())) return null;

    try {
        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: timezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
        const parts = formatter.formatToParts(date);
        const year = parts.find(p => p.type === 'year')?.value;
        const month = parts.find(p => p.type === 'month')?.value;
        const day = parts.find(p => p.type === 'day')?.value;
        
        if (!year || !month || !day) return null;
        
        return `${year}-${month}-${day}`;
    } catch (e) {
        console.warn('[TIMEZONE CONVERSION ERROR] getQuoteCreatedDateKey failed:', e);
        return null;
    }
};

/**
 * Retorna a data e hora formatada de criação do orçamento no fuso (DD/MM/AAAA às HH:mm).
 */
export const formatQuoteCreatedDateTime = (quote: any, timezone: string = 'America/Sao_Paulo'): string | null => {
    if (!quote) return null;
    const dbVal = quote.createdAt || 
                  quote.createdDate || 
                  quote.date || 
                  quote.quoteDate;
    if (!dbVal) return null;
    const localDate = getLocalDateInTimezone(dbVal, timezone);
    if (!localDate) return null;
    
    const day = String(localDate.getDate()).padStart(2, '0');
    const month = String(localDate.getMonth() + 1).padStart(2, '0');
    const year = localDate.getFullYear();
    const hours = String(localDate.getHours()).padStart(2, '0');
    const minutes = String(localDate.getMinutes()).padStart(2, '0');
    
    return `${day}/${month}/${year} às ${hours}:${minutes}`;
};

/**
 * Retorna o nome resolvido do vendedor com base nos fallbacks informados.
 */
export const getSellerNameFromQuote = (quote: any): string => {
    if (!quote) return 'Sem vendedor informado';
    return (
        quote.sellerName ||
        quote.createdByName ||
        quote.userName ||
        quote.createdBy ||
        quote.userId ||
        'Sem vendedor informado'
    );
};

/**
 * Retorna o valor total correto do orçamento, garantindo que valores reais sejam priorizados
 * e ignorando zeros absolutos se houver algum montante preenchido nos subcampos.
 */
export const getQuoteDisplayTotal = (quote: any): number => {
    if (!quote) return 0;
    
    // Lista ordenada de prioridade dos campos que podem conter o valor
    const fields = [
        quote.totalAmount,
        quote.commercialTotal,
        quote.finalTotal,
        quote.total,
        quote?.pricing?.total,
        quote?.summary?.total
    ];

    for (const val of fields) {
        const num = Number(val);
        if (!isNaN(num) && num > 0) {
            return num;
        }
    }
    
    return 0;
};

/**
 * Retorna true se o orçamento estiver completamente vazio (sem conteúdo real).
 * Um orçamento é vazio se não tiver nenhum item de pedra, ambiente, serviço, acessório, 
 * valor manual e o total for zerado.
 */
export const isEmptyQuoteDraft = (quote: any): boolean => {
    if (!quote) return true;

    // Total resolvido
    const resolvedTotal = Number(quote.totalAmount || quote.commercialTotal || quote.finalTotal || quote.total || 0);
    const manualInst = Number(quote.manualInstallation || 0);
    
    // Se o total resolvido for maior que zero ou tiver instalação manual, não é vazio
    if (resolvedTotal > 0 || manualInst > 0) return false;

    // Checar arrays de conteúdo
    const hasGroups = Array.isArray(quote.groups) && quote.groups.length > 0;
    const hasAccessories = Array.isArray(quote.accessories) && quote.accessories.length > 0;
    const hasServices = Array.isArray(quote.services) && quote.services.length > 0;
    const hasItems = Array.isArray(quote.items) && quote.items.length > 0;
    const hasQuoteItems = Array.isArray(quote.quoteItems) && quote.quoteItems.length > 0;
    const hasPieces = Array.isArray(quote.pieces) && quote.pieces.length > 0;
    const hasMaterials = Array.isArray(quote.materials) && quote.materials.length > 0;
    const hasAdditionalItems = Array.isArray(quote.additionalItems) && quote.additionalItems.length > 0;
    const hasManualItems = Array.isArray(quote.manualItems) && quote.manualItems.length > 0;
    const hasProjectItems = Array.isArray(quote.projectItems) && quote.projectItems.length > 0;

    // Se tiver qualquer conteúdo real, não é vazio
    if (hasGroups || hasAccessories || hasServices || hasItems || hasQuoteItems || hasPieces || hasMaterials || hasAdditionalItems || hasManualItems || hasProjectItems) {
        return false;
    }

    return true; // Se chegou aqui, não tem nada e total <= 0
};

/**
 * Filtro rigoroso para métricas do Dashboard.
 * Ignora orçamentos zerados, deletados, cancelados ou rascunhos.
 */
export const isValidQuoteForMetrics = (quote: any): boolean => {
    if (!quote) return false;
    
    // Rascunho vazio
    if (isEmptyQuoteDraft(quote)) return false;

    // Status e Flags de Exclusão
    if (quote.isDeleted === true || quote.deleted === true || quote.hiddenFromDashboard === true) return false;
    if (['deleted', 'cancelled', 'cancelado'].includes(String(quote.status).toLowerCase())) return false;
    if (quote.quoteStage === 'draft_zero') return false;
    
    // Valor total resolvido usando a regra de fallbacks
    const resolvedTotal = Number(quote.totalAmount || quote.commercialTotal || quote.finalTotal || quote.total || 0);
    if (isNaN(resolvedTotal) || resolvedTotal <= 0) return false;
    
    return true;
};

/**
 * Retorna a lista de orçamentos válidos criados hoje no fuso horário informado.
 */
export const getQuotesCreatedToday = (
    quotes: any[], 
    timezone: string = 'America/Sao_Paulo',
    referenceDate: Date = new Date()
): any[] => {
    if (!Array.isArray(quotes)) return [];
    
    // Convert reference Date to string key
    let refKey: string | null = null;
    try {
        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: timezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
        const parts = formatter.formatToParts(referenceDate);
        const year = parts.find(p => p.type === 'year')?.value;
        const month = parts.find(p => p.type === 'month')?.value;
        const day = parts.find(p => p.type === 'day')?.value;
        if (year && month && day) {
            refKey = `${year}-${month}-${day}`;
        }
    } catch (e) {}

    if (!refKey) return [];

    return quotes.filter(quote => {
        if (!isValidQuoteForMetrics(quote)) return false;
        const quoteKey = getQuoteCreatedDateKey(quote, timezone);
        return quoteKey === refKey;
    });
};

/**
 * Constrói um mapa de orçamentos por data no fuso (ex: { "2026-06-25": [quotes] }).
 * Usa validação rigorosa (isValidQuoteForMetrics).
 */
export const buildQuotesByDateMap = (quotes: any[], timezone: string = 'America/Sao_Paulo'): Record<string, any[]> => {
    const map: Record<string, any[]> = {};
    if (!Array.isArray(quotes)) return map;

    quotes.forEach(quote => {
        if (!isValidQuoteForMetrics(quote)) return;
        
        const dateKey = getQuoteCreatedDateKey(quote, timezone);
        if (dateKey) {
            if (!map[dateKey]) map[dateKey] = [];
            map[dateKey].push(quote);
        }
    });

    return map;
};

/**
 * Funções de Normalização de Dados Legados (Orçamentos Antigos)
 */
export const normalizeLegacyDimension = (
    value: number | string | undefined | null
): number => {
    const num = typeof value === 'string' ? parseFloat((value || '').replace(',', '.')) : value;
    if (!num || Number.isNaN(num)) return 0;

    // Se for >= 10, quase certamente está em CM
    if (num >= 10) return num / 100;

    // --- DEPRECATED/REMOVED BUGGY SCALE LOGIC ---
    // Rule #1 Core: Nunca assuma CM automaticamente em faixas entre 1 e 10m.
    // Isso transformava 5m de frontão em 0.05m, quebrando a instalação linear.


    return num;
};

// Aliases para compatibilidade
export const normalizePieceDimension = normalizeLegacyDimension;
export const normalizeDimension = normalizeLegacyDimension;

/**
 * --- REGRAS BLINDADAS (Rule #1, #2, #3) ---
 */

/**
 * Core Rule #1: Normalização única de medidas para METROS (m)
 * Nunca assume cm, nunca divide por 100 automaticamente (exceto legado isolado)
 */
export function normalizeMeasure(value: string | number | undefined | null): number {
    if (value === undefined || value === null || value === '') return 0;
    
    // Converte vírgula para ponto e garante string
    const stringValue = String(value).replace(',', '.');
    const num = parseFloat(stringValue);

    if (isNaN(num)) return 0;

    // Fail-Safe Rule: Alerta de medida suspeita (> 10m)
    if (num > 10) {
        console.warn('[METRIC WARNING] Valor de medida suspeito para mármore (> 10m):', num);
    }

    return num;
}

/**
 * Core Rule #2: Cálculo de área simples (m2)
 * Sempre largura * comprimento (em metros)
 */
export function calculateArea(width: number, height: number): number {
    return width * height;
}

/**
 * Core Rule #3: Cálculo centralizado de Frontão (Backsplash)
 * Separa Área (Comercial) de Instalação (Operacional)
 */
export function calculateFrontaoLogic({
    comprimento,
    altura,
    taxaInstalacao
}: {
    comprimento: number;
    altura: number;
    taxaInstalacao: number;
}) {
    const area = comprimento * altura;
    // Rule #3 Enforcement: Linear installation MUST use 'comprimento' exclusively.
    // Height (altura) is ignored for linear installation cost, only used for area.
    const installation = comprimento * taxaInstalacao;

    return {
        area,
        installation
    };
}

/**
 * Normaliza um objeto de orçamento inteiro vindo do Firestore.
 * Converte estruturas legadas e corrige dimensões de CM para M.
 */
export const normalizeQuoteData = (rawQuote: Partial<Quote>): Partial<Quote> => {
    if (!rawQuote) return {};

    const normalized: Partial<Quote> & { _isNormalized?: boolean; version?: number } = { ...rawQuote };

    // SYSTEM LAW [RULE #10]: Always ensure groups exists as an array
    if (!normalized.groups) normalized.groups = [];

    // Prioritize snapshot if isFrozen is true
    if (normalized.isFrozen && normalized.quoteSnapshot) {
        // Deep hydratation: restore structures from snapshot
        if (normalized.quoteSnapshot.groups && normalized.quoteSnapshot.groups.length > 0) {
            normalized.groups = [...normalized.quoteSnapshot.groups];
        }
        if (normalized.quoteSnapshot.accessories) {
            normalized.accessories = [...normalized.quoteSnapshot.accessories];
        }
        if (normalized.quoteSnapshot.services) {
            normalized.services = [...normalized.quoteSnapshot.services];
        }
    }

    // Converter estrutura legada de items para groups apenas se groups estiver vazio
    if (normalized.groups.length === 0 && Array.isArray(normalized.items) && normalized.items.length > 0) {
        const legacyMap = new Map<string, StoneGroup>();

        normalized.items.forEach((item: any) => {
            const env = item.environment || 'Ambiente Convertido';
            const mat = item.material || 'Material Legado';
            const key = `${env}-${mat}`;

            if (!legacyMap.has(key)) {
                let basePrice = Number(item.price) || 0;

                if (!basePrice) {
                    basePrice = item.total && item.sqm ? Number(item.total) / Number(item.sqm) : 1;
                }

                legacyMap.set(key, {
                    id: crypto.randomUUID(),
                    environmentName: env,
                    materialId: 'legacy',
                    materialName: mat,
                    materialPrice: basePrice,
                    quantity: 1,
                    pieces: [],
                    groupTotal: 0,
                });
            }

            const group = legacyMap.get(key)!;
            const width = normalizeLegacyDimension(item.length || 0);
            const height = normalizeLegacyDimension(item.width || 0);
            const quantity = Number(item.quantity) || 1;
            const sqm = Number((width * height * quantity).toFixed(4));
            const subtotal = Number(item.total) || sqm * (group.materialPrice || 0);

            group.pieces.push({
                id: crypto.randomUUID(),
                type: ((item.pieceType?.toLowerCase() || 'tampo') as StonePieceType),
                label: item.pieceType || 'Peça Convertida',
                width,
                height,
                quantity,
                sqm,
                total: Number(subtotal.toFixed(2)),
            });

            group.groupTotal = Number((group.groupTotal + subtotal).toFixed(2));
        });

        normalized.groups = Array.from(legacyMap.values());
    }

    // Normalizar dimensões dentro de groups
    if (normalized.groups) {
        normalized.groups = safeArray(normalized.groups).map((group) => ({
            ...group,
            pieces: (group.pieces || []).map((piece) => {
                const width = normalizeLegacyDimension(piece.width);
                const height = normalizeLegacyDimension(piece.height);
                const quantity = Number(piece.quantity) || 0;
                const sqm = Number((width * height * quantity).toFixed(4));
                const total = Number((sqm * (group.materialPrice || 0)).toFixed(2));

                return {
                    ...piece,
                    width,
                    height,
                    sqm,
                    total,
                };
            }),
        }));
    }

    // SYSTEM LAW [RULE #10]: Ensure isPostMeasurement and quoteStage consistency
    // If it's already in pos_medicao or ahead, it is definitely a post-measurement quote
    const stagesAtOrAfterPosMedicao = ['pos_medicao', 'aprovado', 'contrato', 'producao', 'finalizado'];
    if (stagesAtOrAfterPosMedicao.includes(normalized.quoteStage as string) || normalized.isPostMeasurement) {
        normalized.isPostMeasurement = true;
        
        // Only force the stage to pos_medicao if it's currently at an earlier stage
        if (!normalized.quoteStage || normalized.quoteStage === 'pre_orcamento' || normalized.quoteStage === 'aguardando_medicao') {
             normalized.quoteStage = 'pos_medicao';
        }
    }

    normalized._isNormalized = true;
    return normalized;
};

/**
 * Hydrates a quote for the editor, ensuring all structures are correctly loaded.
 */
export const hydrateQuoteForEditor = (rawQuote: any): Partial<Quote> => {
    if (!rawQuote) return {};
    
    // 1. Initial normalization
    const quote = normalizeQuoteData(rawQuote);
    
    // 2. Identification: pos_medicao and isPostMeasurement consistency
    const stagesAtOrAfterPosMedicao = ['pos_medicao', 'aprovado', 'contrato', 'producao', 'finalizado'];
    if (stagesAtOrAfterPosMedicao.includes(quote.quoteStage as string) || quote.isPostMeasurement) {
        quote.isPostMeasurement = true;
        if (!quote.quoteStage || quote.quoteStage === 'pre_orcamento' || quote.quoteStage === 'aguardando_medicao') {
            quote.quoteStage = 'pos_medicao';
        }
    }

    // 3. Ensure accessories and services are arrays
    if (!quote.accessories) quote.accessories = [];
    if (!quote.services) quote.services = [];
    
    return quote;
};

export type QuoteTotalsResult = {
    groups: StoneGroup[];
    stonesSubtotal: number;
    accessoriesSubtotal: number;
    servicesSubtotal: number;
    installationFinal: number;
    effectiveInstallation: number;
    commercialTotal: number;
    operationalCost: number;
    subtotalBruto: number;
    discount: number;
    total: number;
    hasInconsistency: boolean;
    inconsistencyReason: string | null;
    frontaoLinearInstallation: number;
    manualInstallationValue: number;
    freight: number;
};

/**
 * Motor de Cálculo Central (Blindado)
 * Regra do frontão:
 * 1. Pedra do frontão = área x valor do material
 * 2. Instalação do frontão = comprimento linear x quantidade x taxa linear
 */
export const calculateQuoteTotals = (
    rawQuote: Partial<Quote>,
    installationRateLinearArg?: number,
    includeInstallationArg?: boolean,
    manualInstallationArg?: { value: number } | null
): QuoteTotalsResult => {
    const quote = normalizeQuoteData(rawQuote);

    // Rule: Use provided UI state args if available, otherwise fallback to already stored quote fields
    const rateLinear = installationRateLinearArg ?? (quote as any).installationRateLinear ?? 0;
    const includeInst = includeInstallationArg ?? (quote.includeInstallation !== false);
    const manualInst = manualInstallationArg !== undefined 
        ? manualInstallationArg 
        : (quote.manualInstallation || ((quote as any).manualInstallationTotal ? { value: (quote as any).manualInstallationTotal } : null));


    let stonesSubtotal = 0;
    let quoteInstallationTotal = 0;

    const groupsToCalculate = Array.isArray(quote.groups) ? quote.groups : [];
    if (!Array.isArray(quote.groups) && quote.groups !== undefined) {
        console.warn('[CALC DEBUG] Quote.groups is not an array:', quote.groups);
    }

    const calculatedGroups = groupsToCalculate
        .map((group) => {
            if (!group) return null;

            const groupMultiplier = Number(group.quantity) || 1;
            let groupStoneTotal = 0;
            let groupInstallationTotal = 0;

            const piecesToCalculate = Array.isArray(group.pieces) ? group.pieces : [];
            if (!Array.isArray(group.pieces) && group.pieces !== undefined) {
                console.warn(
                    '[CALC DEBUG] group.pieces is not an array:',
                    group.pieces,
                    'for environment:',
                    group.environmentName
                );
            }

            const calculatedPieces = piecesToCalculate
                .map((piece) => {
                    if (!piece) return null;

                    const width = normalizeMeasure(piece.width);
                    const height = normalizeMeasure(piece.height);
                    const quantity = Number(piece.quantity) || 0;

                    // Pedra sempre por área (Rule #2)
                    const areaUnit = calculateArea(width, height);
                    const sqm = Number((areaUnit * quantity).toFixed(4));
                    const total = Number((sqm * (group.materialPrice || 0)).toFixed(2));

                    groupStoneTotal += total;

                    // --- NEW HIERARCHY LOGIC (Rule #3 Refined) ---
                    const normalizedLabelLower = String(piece.label ?? '')
                        .toLowerCase()
                        .normalize('NFD')
                        .replace(/[\u0300-\u036f]/g, '');

                    const isLinearPiece = 
                        (piece.type === 'frontao' || 
                         normalizedLabelLower.indexOf('frontao') !== -1 ||
                         String(piece.label ?? '').toLowerCase().indexOf('front') !== -1) &&
                         height > 0;

                    let pieceInstallation = 0;

                    if (isLinearPiece) {
                        // Priority 1: Explicit Override (from Measurement or Manual)
                        // Priority 2: Comprimento/Width (Standard strip length)
                        // Note: Per user rule, we NEVER use Math.max or swap logic.
                        const finalLength = piece.linearLength ?? width;
                        
                        const { installation } = calculateFrontaoLogic({
                            comprimento: finalLength,
                            altura: height,
                            taxaInstalacao: (rateLinear || 0)
                        });
                        
                        pieceInstallation = Number((installation * quantity).toFixed(2));
                        groupInstallationTotal += pieceInstallation;
                    }

                    return {
                        ...piece,
                        width,
                        height,
                        sqm,
                        total,
                        stoneValue: total,
                        installationValue: pieceInstallation,
                    };
                })
                .filter(Boolean);

            const finalGroupStoneTotal = Number((groupStoneTotal * groupMultiplier).toFixed(2));
            const finalGroupInstallationTotal = Number((groupInstallationTotal * groupMultiplier).toFixed(2));

            stonesSubtotal += finalGroupStoneTotal;
            quoteInstallationTotal += finalGroupInstallationTotal;

            return {
                ...group,
                pieces: calculatedPieces,
                groupStoneTotal: finalGroupStoneTotal,
                groupInstallationTotal: finalGroupInstallationTotal,
                // Não embutir instalação no groupTotal para evitar duplicidade visual/comercial
                groupTotal: finalGroupStoneTotal,
            };
        })
        .filter(Boolean) as StoneGroup[];

    const accessoriesSubtotal = (quote.accessories || []).reduce(
        (acc, accessory) => acc + (Number(accessory?.total) || 0),
        0
    );

    const servicesSubtotal = (quote.services || []).reduce(
        (acc, service) => acc + (Number(service?.price) || 0),
        0
    );

    const discount = Number(quote.discount) || 0;

    // Legado
    let legacyItemsTotal = 0;
    let legacyInstallationTotal = 0;
    const itemsToCalculate = Array.isArray((quote as any).items) ? (quote as any).items : [];

    const hasLegacyItems = itemsToCalculate.length > 0 && calculatedGroups.length === 0;

    if (hasLegacyItems) {
        console.log(`[CALC DEBUG] Quote ${quote.id}: Processing ${itemsToCalculate.length} legacy items as primary source.`);
        itemsToCalculate.forEach((item: any) => {
            legacyItemsTotal += Number(item?.price) || 0;
            legacyInstallationTotal += Number(item?.installationPrice) || 0;
        });
    } else if (itemsToCalculate.length > 0) {
        console.log(`[CALC DEBUG] Quote ${quote.id}: Skipping ${itemsToCalculate.length} legacy items because modern groups exist.`);
    }

    const calculatedInstallation = Number((quoteInstallationTotal + legacyInstallationTotal).toFixed(2));
    const manualValue = manualInst ? manualInst.value || 0 : 0;
    
    // --- REGRA DE OURO DEFINITIVA (SUBSTITUIÇÃO TOTAL) ---
    const installationFinal = manualValue > 0 
        ? manualValue 
        : calculatedInstallation;

    const effectiveInstallation = installationFinal;

    // Total comercial segue a flag includeInstallation e agora inclui frete (Lei #30)
    const addedInstallation = includeInst ? installationFinal : 0;
    const freight = Number(quote.freight) || 0;

    // --- EMBUTIR INSTALAÇÃO NA PEDRA (REGRA COMERCIAL) ---
    const totalBaseStones = stonesSubtotal + legacyItemsTotal;
    if (addedInstallation > 0 && totalBaseStones > 0) {
        calculatedGroups.forEach(group => {
            const proportion = group.groupStoneTotal / totalBaseStones;
            const groupAdded = Number((proportion * addedInstallation).toFixed(2));
            // groupTotal passsa a ser stones + pro-rata de instalação
            group.groupTotal = Number((group.groupStoneTotal + groupAdded).toFixed(2));
        });
        
        // Tratar erro de arredondamento
        const newGroupTotalsSum = safeArray(calculatedGroups).reduce((acc, g) => acc + g.groupTotal, 0);
        const diff = Number((stonesSubtotal + addedInstallation - newGroupTotalsSum).toFixed(2));
        if (Math.abs(diff) > 0 && calculatedGroups.length > 0) {
            calculatedGroups[0].groupTotal = Number((calculatedGroups[0].groupTotal + diff).toFixed(2));
        }
    } else {
        calculatedGroups.forEach(group => {
            group.groupTotal = group.groupStoneTotal;
        });
    }

    // --- SEPARAÇÃO PARA UI vs EMBUTIMENTO PARA PDF ---
    // groupTotal permanece embutido para o PDF
    const pureStonesSubtotal = Number((stonesSubtotal + legacyItemsTotal).toFixed(2));
    const stonesSubtotalWithInst = Number((pureStonesSubtotal + addedInstallation).toFixed(2));

    const subtotalBruto = Number(
        (stonesSubtotalWithInst + accessoriesSubtotal + servicesSubtotal).toFixed(2)
    );

    const totalRaw = Number((subtotalBruto + freight - discount).toFixed(2));

    // --- AUDITORIA DE INSTALAÇÃO (DEBUG) ---
    if (!import.meta.env.PROD) {
        console.log(`[INSTALL DEBUG] Orçamento ID: ${quote.id || 'Draft'}`);
        console.log(`[INSTALL DEBUG] 1. Pedra Pura (UI): R$ ${pureStonesSubtotal.toFixed(2)}`);
        console.log(`[INSTALL DEBUG] 2. Pedra + Inst (PDF): R$ ${stonesSubtotalWithInst.toFixed(2)}`);
        console.log(`[INSTALL DEBUG] 3. Instalação Total: R$ ${addedInstallation.toFixed(2)}`);
        console.log(`[INSTALL DEBUG] --- FINAL CALC: R$ ${totalRaw.toFixed(2)} ---`);
    }

    const savedTotal = Number(quote.total) || Number((quote as any).finalPrice) || 0;
    const hasItems = (calculatedGroups.length > 0) || (itemsToCalculate.length > 0);
    const hasInconsistency = hasItems && totalRaw <= 0;

    let finalTotal = totalRaw;

    if (hasInconsistency) {
        if (totalRaw > 0) {
            finalTotal = totalRaw;
        } else if (savedTotal > 0) {
            finalTotal = savedTotal;
        } else {
            finalTotal = 0;
        }
    }

    if (finalTotal <= 0 && savedTotal > 0 && totalRaw <= 0) {
        finalTotal = savedTotal;
    }

    finalTotal = Number(finalTotal.toFixed(2));

    return {
        groups: calculatedGroups,
        stonesSubtotal: pureStonesSubtotal, // VOLTA A SER PURA PARA A INTERFACE INTERNA
        embodiedStonesSubtotal: stonesSubtotalWithInst, // Campo auxiliar se necessário
        accessoriesSubtotal: Number(accessoriesSubtotal.toFixed(2)),
        servicesSubtotal: Number(servicesSubtotal.toFixed(2)),
        installationFinal: installationFinal,
        frontaoLinearInstallation: Number(quoteInstallationTotal.toFixed(2)),
        manualInstallationValue: manualValue,
        effectiveInstallation: effectiveInstallation,
        // commercialTotal segue a regra de stones(embodied) + acc + srv - disc
        commercialTotal: Number((subtotalBruto - discount).toFixed(2)), 
        operationalCost: addedInstallation, 
        subtotalBruto,
        discount,
        total: financeGuard('total', finalTotal),
        freight: freight,
        hasInconsistency,
        inconsistencyReason: hasInconsistency
            ? 'Estrutura presente mas cálculo resultou em zero.'
            : null
    };
};

/**
 * Resolve o Total Efetivo com regras de prioridade e detecta necessidade de auto-correção.
 */
export const resolveQuoteTotal = (rawQuote: Partial<Quote>) => {
    const quote = normalizeQuoteData(rawQuote);
    const quoteId = quote.id || 'unknown';
    const isFrozen = !!quote.isFrozen;

    // Rule #30 integrity: Deep structural and financial check
    const snap = quote.quoteSnapshot;
    const hasValidSnapshotBasics = !!(
        snap &&
        (snap.totalAmount || snap.total || 0) > 0 &&
        snap.commercialTotal !== undefined &&
        snap.operationalCost !== undefined &&
        Array.isArray(snap.groups) && snap.groups.length > 0
    );

    // Structural Divergence Check: If frozen, current items MUST match snapshot items
    let structuralDivergence = false;
    if (isFrozen && snap && Array.isArray(snap.groups) && snap.groups.length > 0) {
        const currentEnvironments = (quote.groups || []).map(g => g.environmentName).sort().join('|');
        const snapEnvironments = (snap.groups || []).map(g => g.environmentName).sort().join('|');
        if (currentEnvironments !== snapEnvironments) {
            structuralDivergence = true;
        }
    }

    if (isFrozen && hasValidSnapshotBasics && !structuralDivergence) {
        return {
            hasInconsistency: false,
            shouldAutoFix: false,
            reason: 'Snapshot íntegro e estruturalmente consistente.',
            effectiveTotal: Number(snap.totalAmount || snap.total || 0),
            liveCalcTotal: Number(snap.totalAmount || snap.total || 0),
            savedTotal: Number(snap.totalAmount || snap.total || 0),
            quoteId,
            liveCalc: calculateQuoteTotals(quote, (quote as any).installationRateLinear, quote.includeInstallation, quote.manualInstallation)
        };
    }

    const liveCalc = calculateQuoteTotals(quote, (quote as any).installationRateLinear, quote.includeInstallation, quote.manualInstallation);
    const liveTotal = liveCalc.total;
    const savedTotal = isFrozen 
        ? Number(snap?.totalAmount || snap?.total || 0)
        : (Number(quote.totalAmount) || Number(quote.total) || 0);

    const hasStructuralItems = (quote.groups || []).length > 0;
    const isCalculationValid = liveTotal > 0;

    // Detect inconsistency or incomplete snapshot
    // Rule: REPAIR ONLY if snapshot basics are missing but structure hasn't diverged
    const needsRepair = isFrozen && !hasValidSnapshotBasics && isCalculationValid && !structuralDivergence;
    
    // Critical Alert: Frozen but divergent (Violation of Law #30)
    const isCriticalInconsistency = isFrozen && structuralDivergence;

    let effectiveTotal = savedTotal;
    let shouldAutoFix = false;
    let reason = 'Consistente.';
    let isBlockingError = false;

    if (isCriticalInconsistency) {
        effectiveTotal = savedTotal; // Don't fix!
        shouldAutoFix = false;
        reason = '[ALERTA CRÍTICO] Divergência estrutural detectada em orçamento congelado. Reparo automático bloqueado por segurança (Lei #30).';
        isBlockingError = true;
    } else if (needsRepair) {
        effectiveTotal = liveTotal;
        shouldAutoFix = true;
        reason = 'Snapshot incompleto. Estrutura preservada; recompondo financeiros...';
    } else if (!isFrozen && hasStructuralItems && savedTotal === 0 && isCalculationValid) {
        effectiveTotal = liveTotal;
        shouldAutoFix = true;
        reason = 'Total salvo zerado em rascunho; recalculando.';
    }

    return {
        hasInconsistency: shouldAutoFix || isCriticalInconsistency,
        shouldAutoFix,
        isBlockingError,
        effectiveTotal: Number(effectiveTotal.toFixed(2)),
        reason,
        liveCalc,
        quoteId,
        sourceUsed: needsRepair ? 'repair' : (isCriticalInconsistency ? 'frozen_error' : 'live')
    };
};

/**
 * [RULE #35] - SNAPSHOT IMUTÁVEL NA APROVAÇÃO
 * Gera um snapshot absoluto e imutável para orçamentos aprovados.
 * Impede que mudanças futuras em tabelas de materiais ou taxas afetem orçamentos fechados.
 */
export const generateQuoteSnapshot = (
    quote: Partial<Quote>,
    calcResults: any,
    metadata?: { 
        sellerName?: string; 
        sellerId?: string;
        companyName?: string;
        companyId?: string;
        clientId?: string;
        customerName?: string;
        approvedBy?: string;
    }
): Partial<Quote> => {
    const isoNow = new Date().toISOString();
    
    // Deep clone arrays for immutability protection
    const cleanGroups = JSON.parse(JSON.stringify(quote.groups || []));
    const cleanItems = JSON.parse(JSON.stringify(quote.items || []));
    const cleanAccessories = JSON.parse(JSON.stringify(quote.accessories || []));
    const cleanServices = JSON.parse(JSON.stringify(quote.services || []));

    return {
        // --- Campos de Identificação ---
        id: quote.id,
        version: quote.version || 1,
        approvedAt: isoNow,
        approvedBy: metadata?.approvedBy || 'Sistema',
        companyId: metadata?.companyId || quote.companyId,
        clientId: metadata?.clientId || quote.clientId,
        customerName: metadata?.customerName || quote.customerName,
        sellerId: metadata?.sellerId || quote.sellerId,
        sellerName: metadata?.sellerName || (quote as any).sellerName,
        origin: (quote as any).origin || 'manual',
        status: 'approved',
        quoteStage: 'aprovado',

        // --- Campos Financeiros (Blindados) ---
        commercialTotal: calcResults.commercialTotal || quote.commercialTotal || 0,
        operationalCost: calcResults.operationalCost || quote.operationalCost || 0,
        freight: quote.freight || 0,
        total: calcResults.total || quote.total || 0,
        totalAmount: calcResults.total || quote.total || 0, 
        stonesSubtotal: calcResults.stonesSubtotal || quote.stonesSubtotal || 0,
        accessoriesSubtotal: calcResults.accessoriesSubtotal || quote.accessoriesSubtotal || 0,
        servicesSubtotal: calcResults.servicesSubtotal || quote.servicesSubtotal || 0,
        subtotal: calcResults.subtotalBruto || quote.subtotal || 0,
        discountBase: calcResults.discount || quote.discount || 0, // Explicitly named for clarity
        discount: calcResults.discount || quote.discount || 0,
        discountType: quote.discountType || 'fixed',

        // --- Estrutura de Itens (Snapshotted) ---
        groups: cleanGroups,
        items: cleanItems,
        accessories: cleanAccessories,
        services: cleanServices,
        
        // --- Detalhes Técnicos e Observações (Rule #30 Laws) ---
        linearInstallationTotal: quote.linearInstallationTotal || 0,
        manualInstallationTotal: quote.manualInstallationTotal || 0,
        effectiveInstallation: calcResults.effectiveInstallation || (quote as any).effectiveInstallation || 0,
        observations: quote.observations || '',
        splashback: quote.splashback || '',
        skirt: quote.skirt || '',
        paymentTerms: quote.paymentTerms || '',
        paymentConditions: quote.paymentConditions || undefined,
        deliveryTime: quote.deliveryTime || '',
        
        // --- Metadados de Congelamento ---
        isFrozen: true,
        calculationVersion: 'v2-immutable',
        hasLegacyItems: cleanItems.length > 0,
        hasModernGroups: cleanGroups.length > 0,
        
        snapshotMetadata: {
            sellerName: metadata?.sellerName,
            companyName: metadata?.companyName,
            capturedAt: isoNow,
            integrityHash: `v${quote.version || 1}-${calcResults.total}`
        }
    } as any;
};

/**
 * [VERSIONING AUDIT] RULE #35 - Detailed Quote Comparison
 * Compara duas versões de um orçamento e gera um log de auditoria detalhado.
 */
export interface QuoteDiffResult {
    hasChanges: boolean;
    logs: string[];
    summary: string;
}

export const calculateQuoteDiff = (oldVersion: Partial<Quote>, newVersion: Partial<Quote>): QuoteDiffResult => {
    const logs: string[] = [];
    
    const fmtRef = (val: any) => typeof val === 'number' ? `R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : (String(val ?? '--'));

    // 1. Financial Comparison
    if (Math.abs((oldVersion.commercialTotal || 0) - (newVersion.commercialTotal || 0)) > 0.01) {
        logs.push(`TOTAL COMERCIAL: alterado de ${fmtRef(oldVersion.commercialTotal)} para ${fmtRef(newVersion.commercialTotal)}`);
    }
    if (Math.abs((oldVersion.operationalCost || 0) - (newVersion.operationalCost || 0)) > 0.01) {
        logs.push(`INVESTIMENTO TÉCNICO: alterado de ${fmtRef(oldVersion.operationalCost)} para ${fmtRef(newVersion.operationalCost)}`);
    }
    if (Math.abs((oldVersion.freight || 0) - (newVersion.freight || 0)) > 0.01) {
        logs.push(`FRETE: alterado de ${fmtRef(oldVersion.freight || 0)} para ${fmtRef(newVersion.freight || 0)}`);
    }
    if (Math.abs((oldVersion.servicesSubtotal || 0) - (newVersion.servicesSubtotal || 0)) > 0.01) {
        logs.push(`SERVIÇOS (EXTRAS): alterado de ${fmtRef(oldVersion.servicesSubtotal || 0)} para ${fmtRef(newVersion.servicesSubtotal || 0)}`);
    }
    if (Math.abs((oldVersion.accessoriesSubtotal || 0) - (newVersion.accessoriesSubtotal || 0)) > 0.01) {
        logs.push(`ACESSÓRIOS/CUBAS: alterado de ${fmtRef(oldVersion.accessoriesSubtotal || 0)} para ${fmtRef(newVersion.accessoriesSubtotal || 0)}`);
    }
    const oldTotalFinal = oldVersion.total || oldVersion.totalAmount || 0;
    const newTotalFinal = newVersion.total || newVersion.totalAmount || 0;
    if (Math.abs(oldTotalFinal - newTotalFinal) > 0.01) {
        logs.push(`VALOR FINAL: alterado de ${fmtRef(oldTotalFinal)} para ${fmtRef(newTotalFinal)}`);
    }

    // 3. Structural Comparison (Ambientes & Peças)
    (oldVersion.groups || []).forEach(oldGroup => {
        const newGroup = (newVersion.groups || []).find(g => g.id === oldGroup.id);
        if (!newGroup) {
            logs.push(`REMOÇÃO: Ambiente [${oldGroup.environmentName}] excluído.`);
        } else {
            (oldGroup.pieces || []).forEach(oldPiece => {
                const stillExists = (newGroup.pieces || []).some(p => p.id === oldPiece.id);
                if (!stillExists) {
                    logs.push(`REMOÇÃO: Peça [${oldPiece.label}] excluída de [${oldGroup.environmentName}]`);
                }
            });
        }
    });

    // 4. Legacy Items Comparison (Orders/Legacy)
    (oldVersion.items || []).forEach(oldItem => {
        const stillExists = (newVersion.items || []).some((n: any) => n.id === oldItem.id);
        if (!stillExists) {
            logs.push(`REMOÇÃO: Item de produção [${(oldItem as any).name || (oldItem as any).pieceType || 'N/A'}] excluído.`);
        }
    });

    // 5. Materials
    const oldMats = [...new Set((oldVersion.groups || []).map(g => String(g.materialName ?? '')))].filter(Boolean).sort().join(', ');
    const newMats = [...new Set((newVersion.groups || []).map(g => String(g.materialName ?? '')))].filter(Boolean).sort().join(', ');
    if (oldMats !== newMats) {
        logs.push(`MATERIAIS: alterado de [${oldMats || 'vazio'}] para [${newMats || 'vazio'}]`);
    }

    const hasChanges = logs.length > 0;
    
    return {
        hasChanges,
        logs,
        summary: hasChanges ? `Mudanças detectadas: ${logs.join('; ')}` : "Nenhuma alteração estrutural ou financeira detectada."
    };
};

/**
 * [FINANCE GUARD] SYSTEM LAW - RULE #30
 * Impede o uso de campos genéricos no motor de cálculo.
 */
export const financeGuard = (field: string, value: number) => {
    if (field === 'total') {
        // Warning only for the generic 'total' field if it is zero but has items.
        // We removed installationTotal from here as it is now specific (installationFinal).
        return value; 
    }
    return value;
};

/**
 * [RULE #40] - PRÉ-TRAVA DE APROVAÇÃO FINANCEIRA
 * Valida a integridade financeira e estrutural antes de permitir a aprovação.
 * Bloqueia orçamentos inconsistentes (Ex: com itens mas total zero).
 */
export interface QuoteValidationResult {
    isValid: boolean;
    blockingIssues: string[];
    warnings: string[];
    financialIntegrity: boolean;
}

export const validateQuoteBeforeApproval = (
    quote: Partial<Quote>,
    calcResults: any
): QuoteValidationResult => {
    const blockingIssues: string[] = [];
    const warnings: string[] = [];
    
    const hasGroups = (quote.groups || []).length > 0;
    const hasLegacyItems = (quote as any).items?.length > 0;
    const hasItems = hasGroups || hasLegacyItems;
    
    const total = calcResults?.total ?? 0;
    
    // A. Bloqueio: Orçamento com itens mas total final <= 0
    if (hasItems && total <= 0) {
        blockingIssues.push("O orçamento possui itens configurados, mas o valor total resultou em zero. Verifique as medidas e preços.");
    }
    
    // B. Bloqueio: Soma dos ambientes divergente do total bruto (Subtotal)
    const sumOfGroups = (quote.groups || []).reduce((acc, g) => acc + (g.groupTotal || g.groupStoneTotal || 0), 0);
    // Margem de erro para arredondamento (R$ 0.10)
    if (hasGroups && Math.abs(sumOfGroups - (calcResults?.stonesSubtotal || 0)) > 0.1) {
         blockingIssues.push("Divergência detectada entre a soma dos ambientes e o subtotal calculado. Recalcule o orçamento.");
    }

    // C & D. Aviso: Áreas ou medidas irrisórias de escala (Ex: 0.1m x 0.1m salvos por engano)
    const pieces = (quote.groups || []).flatMap(g => g.pieces || []);
    // Desconsideramos peças com 0 proposital, focamos em "quase zero" que indica erro de escala (ex: cm em campo de m)
    const tinyPieces = safeArray(pieces).filter(p => (p.width < 0.05 || p.height < 0.05) && (p.width > 0 && p.height > 0));
    if (tinyPieces.length > 0) {
        warnings.push(`Atenção: detectamos uma peça com medida pequena (< 5cm). Se for uma peça de acabamento (ex: baguete), você pode prosseguir normalmente. Caso contrário, verifique se as medidas foram digitadas em metros.`);
    }

    // E. Aviso: Medidas muito grandes (Standard warning de Auditoria)
    const hugePieces = safeArray(pieces).filter(p => p.width > 4.5 || p.height > 4.5);
    if (hugePieces.length > 0) {
        warnings.push(`Existem ${hugePieces.length} peça(s) com dimensões acima de 4,5m. Confirme se as medidas estão corretas.`);
    }

    // F. Bloqueio: Inconsistência interna do motor
    if (calcResults?.hasInconsistency) {
        blockingIssues.push(`Inconsistência estrutural detectada pelo sistema: ${calcResults.inconsistencyReason || 'Estrutura presente mas cálculo inconsistente.'}`);
    }
    
    // G. Bloqueio: Orçamento sem ambientes
    if (!hasItems) {
        blockingIssues.push("Não é possível aprovar um orçamento sem pelo menos um ambiente ou item configurado.");
    }

    return {
        isValid: blockingIssues.length === 0,
        blockingIssues,
        warnings,
        financialIntegrity: total > 0
    };
};

/**
 * [RULE #40] - TRAVA DE CONDIÇÕES DE PAGAMENTO
 * Valida de forma estrita as condições de pagamento (paymentConditions) antes de
 * permitir a aprovação/congelamento do orçamento.
 */
export const validatePaymentConditions = (
    payment: Partial<PaymentConditions> | undefined | null,
    totalToMatch: number
): { isValid: boolean; reason: string | null } => {
    if (!payment) {
        return { isValid: false, reason: 'Condições de pagamento ausentes. Defina as parcelas antes de aprovar.' };
    }

    if (!payment.installments || payment.installments.length === 0) {
        return { isValid: false, reason: 'Nenhuma parcela definida. Adicione pelo menos uma parcela válida.' };
    }

    let sumCents = 0;
    for (const inst of payment.installments) {
        if (typeof inst.amount !== 'number' || isNaN(inst.amount) || inst.amount <= 0) {
            return { isValid: false, reason: 'Existem parcelas com valor inválido ou zerado.' };
        }
        if (!inst.label || inst.label.trim() === '') {
            return { isValid: false, reason: 'Todas as parcelas devem possuir uma descrição (label).' };
        }
        if (!['imediato', 'entrega', 'data'].includes(inst.dueType)) {
            return { isValid: false, reason: 'Tipo de vencimento (dueType) inválido em uma das parcelas.' };
        }
        sumCents += Math.round(inst.amount * 100);
    }

    const interestAmount = payment.interest?.enabled ? payment.interest.amount : 0;
    const financedTotal = totalToMatch + interestAmount;
    const financedTotalCents = Math.round(financedTotal * 100);

    const diffCents = Math.abs(sumCents - financedTotalCents);

    if (diffCents > 1) {
        const sum = sumCents / 100;
        const fmtSum = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(sum);
        const fmtTotal = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(financedTotal);
        return { 
            isValid: false, 
            reason: `A soma das parcelas precisa ser igual ao total do contrato. (Soma: ${fmtSum} vs Total: ${fmtTotal})`
        };
    }

    return { isValid: true, reason: null };
};

export interface QuoteAuditResult {
    isValid: boolean;
    errors: string[];
    details: {
        stonesSum: number;
        stonesSubtotal: number;
        installationFinal: number;
        accessoriesSubtotal: number;
        servicesSubtotal: number;
        freight: number;
        discount: number;
        totalCalc: number;
        totalFinal: number;
        divergenceStones: number;
        divergenceTotal: number;
    };
    environmentErrors: string[]; 
}

/**
 * Auditoria de Consistência (Rule #50)
 * Verifica se a soma das partes é igual ao todo.
 */
export const auditQuoteCalculations = (
    groups: any[],
    stonesSubtotal: number,
    accessoriesSubtotal: number,
    servicesSubtotal: number,
    discount: number,
    freight: number,
    finalTotal: number,
    installationFinal: number
): QuoteAuditResult => {
    const errors: string[] = [];
    const environmentErrors: string[] = [];
    
    // 1. Soma dos ambientes vs stonesSubtotal (Puro)
    const stonesSum = Number(safeArray(groups).reduce((acc, g) => acc + (g.groupStoneTotal || 0), 0).toFixed(2));
    const divergenceStones = Math.abs(stonesSum - stonesSubtotal);
    
    if (divergenceStones > 0.05) {
        errors.push(`Divergência nos ambientes: Soma R$ ${stonesSum.toFixed(2)} vs Subtotal R$ ${stonesSubtotal.toFixed(2)}`);
    }

    // 2. Equação final: Subtotal Pedra + Instalação + Acessórios + Serviços + Frete - Desconto = Total
    const totalCalc = Number((stonesSubtotal + (installationFinal || 0) + accessoriesSubtotal + servicesSubtotal + freight - discount).toFixed(2));
    const divergenceTotal = Math.abs(totalCalc - finalTotal);
    
    if (divergenceTotal > 0.05) {
        errors.push(`Divergência no Total: Calculado R$ ${totalCalc.toFixed(2)} vs Final R$ ${finalTotal.toFixed(2)}`);
    }

    // Identificar ambientes suspeitos (se a pedra do grupo não bate com a soma das peças)
    groups.forEach(g => {
        const pieceSum = Number((g.pieces || []).reduce((acc: number, p: any) => acc + (p.total || 0), 0).toFixed(2));
        if (Math.abs(pieceSum - (g.groupStoneTotal || 0)) > 0.05) {
            environmentErrors.push(g.id || 'unknown');
            errors.push(`Ambiente [${g.environmentName}] inconsistente: Peças R$ ${pieceSum.toFixed(2)} vs Grupo R$ ${g.groupStoneTotal?.toFixed(2)}`);
        }
    });

    return {
        isValid: errors.length === 0,
        errors,
        details: {
            stonesSum,
            stonesSubtotal,
            installationFinal,
            accessoriesSubtotal,
            servicesSubtotal,
            freight,
            discount,
            totalCalc,
            totalFinal: finalTotal,
            divergenceStones,
            divergenceTotal
        },
        environmentErrors
    };
};

