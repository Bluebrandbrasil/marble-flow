import { safeArray } from '../../lib/dataDiagnostics';
import React, { forwardRef } from 'react';
import type { StoneGroup, QuoteAccessory, QuoteService, Quote } from '../../types';
import { Phone, Building2, Globe, Instagram, Facebook, Mail } from 'lucide-react';
import { WhatsAppIcon } from '../../components/icons/WhatsAppIcon';
import { normalizeQuoteData, calculateQuoteTotals } from '../../utils/quoteCalculations';

// --- A. PROPS INTERFACE ---
interface QuotePrintTemplateProps {
    customerName: string;
    customerPhone?: string;
    customerAddress?: string;
    sellerName?: string;
    groups?: StoneGroup[];
    quoteSnapshot?: Partial<Quote>;
    accessories: QuoteAccessory[];
    services: QuoteService[];
    discount: number;
    companyData?: {
        name?: string;
        companyName?: string;
        phone?: string;
        telefoneFixo?: string;
        street?: string;
        number?: string;
        neighborhood?: string;
        city?: string;
        state?: string;
        zipCode?: string;
        whatsapp1?: string;
        whatsapp2?: string;
        instagram?: string;
        website?: string;
        facebook?: string;
        email?: string;
        logoUrl?: string;
        companySignature?: string;
        installationRateLinear?: number | string;
    };
    totalAmount: number;
    includeInstallation?: boolean;
    manualInstallation?: { value: number; description: string } | null;
    protocolNumber?: string;
    isPostMeasurement?: boolean;
    layoutOverride?: string; // Mantido para compatibilidade
    calculatedData?: any;
}

// --- B. COMPONENTE PRINCIPAL ---
export const QuotePrintTemplate = forwardRef<HTMLDivElement, QuotePrintTemplateProps>((props, ref) => {
    const {
        customerName,
        customerPhone,
        customerAddress,
        sellerName,
        groups,
        quoteSnapshot,
        accessories,
        services,
        discount,
        companyData,
        totalAmount,
        includeInstallation,
        manualInstallation,
        calculatedData,
        protocolNumber,
        isPostMeasurement
    } = props;

    // --- C. PREPARAÇÃO DE DADOS & HELPERS ---
    const today = new Date().toLocaleDateString('pt-BR');
    const compName = String(companyData?.name || companyData?.companyName || 'Marmoraria Modelo');
    const qSnap = (quoteSnapshot || {}) as any;

    // Motor de Cálculo Centralizado
    const sourceData = quoteSnapshot || { groups, accessories, services, discount, total: totalAmount };
    const safeData = normalizeQuoteData(sourceData);
    const safeIncludeInstallation = quoteSnapshot ? (qSnap.includeInstallation !== false) : (includeInstallation !== false);
    const safeManualInstallation = quoteSnapshot ? qSnap.manualInstallation : manualInstallation;
    
    const calc = calculatedData || calculateQuoteTotals(
        safeData, 
        Number(companyData?.installationRateLinear) || 0,
        safeIncludeInstallation,
        safeManualInstallation
    );

    // Variáveis de Saída Únicas
    const finalGroups = safeArray(calc?.groups || qSnap?.groups || groups);
    const renderedStonesSubtotal = safeArray(finalGroups).reduce((acc, g) => acc + (Number(g?.groupTotal || g?.groupStoneTotal || 0) || 0), 0);
    const finalDiscount = Number(calc?.discount ?? qSnap?.discount ?? discount ?? 0) || 0;
    const printTotal = Number(calc?.total ?? qSnap?.totalAmount ?? totalAmount);
    const protocol = qSnap?.protocolNumber || protocolNumber || 'DOC-ORC';

    // Helpers
    const formatCurrency = (v: number) => new Intl.NumberFormat('pt-BR', {
        style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2
    }).format(v || 0);

    const formatMeasure = (v: any) => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const standardizeNomenclature = (text: string) => {
        if (!text) return '';
        let cleanText = text.replace(/^GERAL\s*-\s*/i, '').trim();
        const lower = cleanText.toLowerCase();
        if (lower.includes('brinde') || lower.includes('cortesia')) return 'Cortesia: Cortes e Furos';
        if (lower === 'cuba' || lower === 'furo de cuba') return 'Recorte da Cuba';
        if (lower.includes('torneira')) return 'Furo para Torneira';
        if (lower.includes('cooktop')) return 'Corte para Cooktop';
        return cleanText.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
    };

    // Processamento de Itens com Distribuição de Desconto
    let distributedDiscountAccumulator = 0;
    const safeGroupsToRender = safeArray(finalGroups).map((g: any, i: number) => {
        const bruteGroupTotal = Number(g.groupTotal || g.groupStoneTotal || 0);
        let groupDiscount = 0;
        if (renderedStonesSubtotal > 0) {
            if (i === finalGroups.length - 1) {
                groupDiscount = finalDiscount - distributedDiscountAccumulator;
            } else {
                groupDiscount = Number(((bruteGroupTotal / renderedStonesSubtotal) * finalDiscount).toFixed(2));
                distributedDiscountAccumulator += groupDiscount;
            }
        }
        return {
            ...g,
            displayTotal: bruteGroupTotal - groupDiscount,
            pieces: Array.isArray(g?.pieces) ? g.pieces : []
        };
    });

    const safeAccessories = safeArray(accessories).map(a => ({
        ...a,
        description: standardizeNomenclature(a.name || 'Acessório'),
        total: Number(a.total || 0),
        quantity: Number(a.quantity || 1)
    })).filter(a => a.total > 0 || a.quantity > 0);

    const safeServices = safeArray(services).map(s => ({
        ...s,
        description: standardizeNomenclature(s.name || s.description || 'Serviço'),
        total: Number(s.price || 0)
    })).filter(s => s.total > 0);

    const formatFullAddress = () => {
        const p = companyData;
        return [p?.street, p?.number, p?.neighborhood, p?.city, p?.state, p?.zipCode].filter(Boolean).join(', ');
    };

    // --- D. JSX FINAL ---
    return (
        <div ref={ref} className="print-main-wrapper text-slate-900 bg-white w-full">
            <style dangerouslySetInnerHTML={{
                __html: `
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
                .print-main-wrapper { font-family: 'Inter', sans-serif; overflow: visible !important; }
                .print-sheet { width: 210mm; padding: 15mm; margin: 0 auto; background: white; box-sizing: border-box; overflow: visible !important; }
                @media print {
                    @page { size: A4; margin: 0; }
                    .print-main-wrapper { padding: 0 !important; }
                    .print-sheet { width: 100% !important; padding: 0 !important; }
                    .pdf-export-block { break-inside: avoid !important; page-break-inside: avoid !important; }
                }
                .pdf-export-block { width: 100%; background: white; break-inside: avoid !important; page-break-inside: avoid !important; overflow: visible !important; }
                .tabular-nums { font-variant-numeric: tabular-nums; }
                .modern-table { width: 100%; border-collapse: collapse; margin-top: 4px; }
                .modern-table th { color: #94a3b8; font-size: 9px; font-weight: 900; text-transform: uppercase; padding: 6px 10px; border-bottom: 1px solid #f1f5f9; text-align: left; letter-spacing: 0.1em; }
                .modern-table td { padding: 8px 10px; font-size: 10px; border-bottom: 1px solid #f8fafc; color: #475569; vertical-align: middle; }
                .modern-table tr:last-child td { border-bottom: none; }
                `}} />

            <section className="print-sheet">
                {/* 1. CABEÇALHO */}
                <header id="doc-header-block" className="pdf-export-block mb-10">
                    <div className="flex justify-between items-end mb-8">
                        {companyData?.logoUrl ? (
                            <img src={companyData.logoUrl} crossOrigin="anonymous" className="h-16 w-auto object-contain" />
                        ) : (
                            <Building2 className="h-12 w-12 text-slate-200" />
                        )}
                        <div className="text-right">
                            <h1 className="text-[24px] font-[950] text-slate-900 uppercase leading-none mb-1">
                                {(isPostMeasurement || qSnap?.isPostMeasurement || qSnap?.quoteStage === 'pos_medicao') ? 'ORÇAMENTO PÓS-MEDIÇÃO' : 'PRÉ-ORÇAMENTO'}
                            </h1>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">PROTOCOLO: <span className="text-slate-900">{protocol}</span></p>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-10 py-6 border-y border-slate-100">
                        <div className="space-y-1">
                            <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest block mb-2">Dados do Cliente</span>
                            <h2 className="text-[13px] font-[900] text-slate-900 uppercase tracking-wider">{customerName || 'Cliente'}</h2>
                            <p className="text-[11px] text-slate-500 font-bold uppercase">{customerAddress || 'Endereço não informado'}</p>
                            <p className="text-[11px] text-slate-500 font-bold uppercase">{customerPhone}</p>
                        </div>
                        <div className="text-right flex flex-col justify-end text-[11px] font-bold text-slate-400 uppercase space-y-1">
                            <p>Emissão: <span className="text-slate-900">{today}</span></p>
                            <p>Consultor: <span className="text-emerald-600">{sellerName || 'Venda Direta'}</span></p>
                        </div>
                    </div>
                </header>

                {/* 2. AMBIENTES */}
                <div id="doc-items-header-block" className="pdf-export-block pt-10 px-4">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 border-b border-slate-100 pb-1 mb-3">
                        ITENS EM MARMORARIA / AMBIENTES
                    </h3>
                </div>

                <div id="doc-items-list-container" className="space-y-0">
                    {(() => {
                        const seenCutoutsPerEnv = new Set<string>();
                        return safeArray(safeGroupsToRender).map((g, i) => {
                            const envNameUpper = (g.environmentName || g.name || 'Ambiente').trim().toUpperCase();
                            const showCubaCli = g.itensFornecidosCliente?.cuba && !seenCutoutsPerEnv.has(`${envNameUpper}-cubaCli`);
                            const showCubaGourmetCli = g.itensFornecidosCliente?.cubaGourmet && !seenCutoutsPerEnv.has(`${envNameUpper}-cubaGourmetCli`);
                            const showTanqueCli = g.itensFornecidosCliente?.tanque && !seenCutoutsPerEnv.has(`${envNameUpper}-tanqueCli`);
                            const showLavCli = g.itensFornecidosCliente?.cubaLavatorio && !seenCutoutsPerEnv.has(`${envNameUpper}-lavCli`);
                            const showLixeiraCli = g.itensFornecidosCliente?.lixeira && !seenCutoutsPerEnv.has(`${envNameUpper}-lixeiraCli`);

                            const showCuba = g.furosECortes?.cuba && !seenCutoutsPerEnv.has(`${envNameUpper}-cuba`);
                            const showFuro = g.furosECortes?.furoTorneira && !seenCutoutsPerEnv.has(`${envNameUpper}-furoTorneira`);
                            const showCooktop = g.furosECortes?.corteCooktop && !seenCutoutsPerEnv.has(`${envNameUpper}-corteCooktop`);

                            if (showCubaCli) seenCutoutsPerEnv.add(`${envNameUpper}-cubaCli`);
                            if (showCubaGourmetCli) seenCutoutsPerEnv.add(`${envNameUpper}-cubaGourmetCli`);
                            if (showTanqueCli) seenCutoutsPerEnv.add(`${envNameUpper}-tanqueCli`);
                            if (showLavCli) seenCutoutsPerEnv.add(`${envNameUpper}-lavCli`);
                            if (showLixeiraCli) seenCutoutsPerEnv.add(`${envNameUpper}-lixeiraCli`);

                            if (showCuba) seenCutoutsPerEnv.add(`${envNameUpper}-cuba`);
                            if (showFuro) seenCutoutsPerEnv.add(`${envNameUpper}-furoTorneira`);
                            if (showCooktop) seenCutoutsPerEnv.add(`${envNameUpper}-corteCooktop`);

                            const hasAnyDetails = showCubaCli || showCubaGourmetCli || showTanqueCli || showLavCli || showLixeiraCli || showCuba || showFuro || showCooktop || g.edgeFinishing;

                            return (
                                <div key={i} id={`doc-item-${i}`} className="pdf-export-block py-4 border-b border-slate-50 px-4">
                                    <div className="flex justify-between items-start">
                                        <div className="flex-1 space-y-0.5">
                                            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-tight">
                                                {standardizeNomenclature(g.environmentName || g.name || 'Ambiente')}
                                            </h3>

                                            <div className="text-[9px] font-medium text-slate-500 uppercase flex items-center gap-2 whitespace-nowrap leading-[1.3] mt-0.5">
                                                <span>{g.materialName || g.material?.name}</span>
                                                <span className="text-slate-200">•</span>
                                                <span>{g.quantity} {g.quantity > 1 ? 'Ambientes' : 'Ambiente'}</span>
                                            </div>
                                            <div className="flex flex-wrap items-baseline gap-x-2 text-[9px] text-slate-500 uppercase leading-normal max-w-[95%] mt-1 pb-0.5">
                                                {safeArray(g.pieces).map((p: any, pIdx: number) => {
                                                    const label = p.label || p.type || 'Peça';
                                                    const dim = p.width && p.height ? `${formatMeasure(p.width)}x${formatMeasure(p.height)}` : '';
                                                    return (
                                                        <React.Fragment key={pIdx}>
                                                            {pIdx > 0 && <span className="text-slate-200 font-normal self-center">|</span>}
                                                            <span>{label} {dim}</span>
                                                        </React.Fragment>
                                                    );
                                                })}
                                            </div>

                                            {/* TECHNICAL DETAILS SECTION (Client Items & Cutouts) */}
                                            {hasAnyDetails && (
                                                <div className="mt-3 space-y-2 pt-2 border-t border-slate-50 max-w-[90%]">
                                                    {(showCubaCli || showCubaGourmetCli || showTanqueCli || showLavCli || showLixeiraCli) && (
                                                        <div className="flex flex-col">
                                                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Itens fornecidos pelo cliente:</span>
                                                            <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                                                                {showCubaCli && <span className="text-[11px] text-[#555] font-bold uppercase tracking-tight">• Cuba</span>}
                                                                {showCubaGourmetCli && <span className="text-[11px] text-[#555] font-bold uppercase tracking-tight">• Cuba Gourmet</span>}
                                                                {showTanqueCli && <span className="text-[11px] text-[#555] font-bold uppercase tracking-tight">• Tanque</span>}
                                                                {showLavCli && <span className="text-[11px] text-[#555] font-bold uppercase tracking-tight">• Lavatório</span>}
                                                                {showLixeiraCli && <span className="text-[11px] text-[#555] font-bold uppercase tracking-tight">• Lixeira</span>}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {(showCuba || showFuro || showCooktop) && (
                                                        <div className="flex flex-col">
                                                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Furos e recortes inclusos:</span>
                                                            <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                                                                {showCuba && <span className="text-[11px] text-[#555] font-bold uppercase tracking-tight">• Recorte da cuba</span>}
                                                                {showFuro && <span className="text-[11px] text-[#555] font-bold uppercase tracking-tight">• Furo para torneira</span>}
                                                                {showCooktop && <span className="text-[11px] text-[#555] font-bold uppercase tracking-tight">• Corte para cooktop</span>}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {g.edgeFinishing && (
                                                        <div className="flex flex-col">
                                                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Acabamento de Borda:</span>
                                                            <span className="text-[11px] text-[#555] font-bold uppercase tracking-tight">• {g.edgeFinishing}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        <div className="text-sm font-bold text-slate-900 tabular-nums ml-4">
                                            {formatCurrency(g.displayTotal)}
                                        </div>
                                    </div>
                                </div>
                            );
                        });
                    })()}
                </div>

                {/* 3. EXTRAS */}
                {(safeAccessories.length > 0 || safeServices.length > 0) && (
                    <div id="doc-extras-block" className="pdf-export-block py-6 px-4">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 border-b border-slate-100 pb-1 mb-3">
                            ITENS COMPLEMENTARES / SERVIÇOS
                        </h3>
                        {safeAccessories.length > 0 && (
                            <table className="modern-table">
                                <thead>
                                    <tr>
                                        <th>Acessório / Adicional</th>
                                        <th className="text-center">Qtd</th>
                                        <th className="text-right">V. Unitário</th>
                                        <th className="text-right">Total</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {safeArray(safeAccessories).map((a, i) => (
                                        <tr key={i}>
                                            <td className="font-bold uppercase text-slate-700">{a.description}</td>
                                            <td className="text-center font-bold">{a.quantity}</td>
                                            <td className="text-right tabular-nums">{formatCurrency(a.unitPrice)}</td>
                                            <td className="text-right font-black tabular-nums">{formatCurrency(a.total)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                        {safeServices.length > 0 && (
                            <table className="modern-table mt-6">
                                <thead>
                                    <tr>
                                        <th>Serviço Técnico / Logística</th>
                                        <th className="text-right">Total</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {safeArray(safeServices).map((s, i) => (
                                        <tr key={i}>
                                            <td className="font-bold uppercase text-slate-700">{s.description}</td>
                                            <td className="text-right font-black tabular-nums">{formatCurrency(s.total)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                )}

                {/* 4. RESUMO FINANCEIRO */}
                <div id="doc-summary-block" className="pdf-export-block py-8 mt-4">
                    <div className="flex flex-col items-end">
                        <div className="w-full md:w-[350px] space-y-4">
                            <div className="h-[2px] bg-slate-100 w-full" />
                            {finalDiscount > 0 && renderedStonesSubtotal === 0 && (
                                <div className="flex justify-between items-center px-2">
                                    <span className="text-[10px] font-black text-rose-500 uppercase tracking-widest">Desconto Especial:</span>
                                    <span className="text-[12px] font-black text-rose-500 tabular-nums">- {formatCurrency(finalDiscount)}</span>
                                </div>
                            )}
                            <div className="flex justify-between items-baseline px-2 pt-2">
                                <span className="text-[15px] font-[950] text-slate-900 uppercase tracking-widest">Total Final</span>
                                <span className="text-[28px] font-[950] text-slate-900 tabular-nums tracking-tighter">
                                    {formatCurrency(printTotal)}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 5. ASSINATURA E CONTATOS */}
                <div id="doc-signature-block" className="pdf-export-block py-6 mt-8 border-t border-slate-100">
                    <div className="grid grid-cols-2 gap-8 items-start">
                        <div className="space-y-3">
                            <div>
                                <h3 className="text-[13px] font-bold text-slate-800 uppercase leading-none mb-1.5">{compName}</h3>
                                <p className="text-[9px] text-slate-500 uppercase leading-tight max-w-[90%]">{formatFullAddress()}</p>
                            </div>
                            
                            <div className="flex flex-col gap-y-1.5 pt-1">
                                {companyData?.whatsapp1 && (
                                    <div className="flex items-center gap-[6px] text-[9px] font-medium text-slate-600 uppercase leading-none min-h-fit">
                                        <WhatsAppIcon className="w-3 h-3 text-emerald-500 flex-shrink-0" /> 
                                        <span>{companyData.whatsapp1}</span>
                                    </div>
                                )}
                                {companyData?.whatsapp2 && (
                                    <div className="flex items-center gap-[6px] text-[9px] font-medium text-slate-600 uppercase leading-none min-h-fit">
                                        <WhatsAppIcon className="w-3 h-3 text-emerald-500 flex-shrink-0 opacity-70" /> 
                                        <span>{companyData.whatsapp2}</span>
                                    </div>
                                )}
                                {(companyData?.telefoneFixo || companyData?.phone) && (
                                    <div className="flex items-center gap-[6px] text-[9px] font-medium text-slate-600 uppercase leading-none min-h-fit">
                                        <Phone className="w-3 h-3 text-slate-400 flex-shrink-0" /> 
                                        <span>{companyData.telefoneFixo || companyData.phone}</span>
                                    </div>
                                )}
                                {companyData?.instagram && (
                                    <div className="flex items-center gap-[6px] text-[9px] font-medium text-slate-600 uppercase leading-none min-h-fit">
                                        <Instagram className="w-3 h-3 text-rose-500 flex-shrink-0" /> 
                                        <span>@{String(companyData.instagram).replace(/https?:\/\/(www\.)?instagram\.com\//, '').replace('@', '').split('/')[0]}</span>
                                    </div>
                                )}
                                {companyData?.facebook && (
                                    <div className="flex items-center gap-[6px] text-[9px] font-medium text-slate-600 uppercase leading-none min-h-fit">
                                        <Facebook className="w-3 h-3 text-blue-600 flex-shrink-0" /> 
                                        <span>{String(companyData.facebook).replace(/https?:\/\/(www\.)?facebook\.com\//, '').split('/')[0]}</span>
                                    </div>
                                )}
                                {companyData?.website && (
                                    <div className="flex items-center gap-[6px] text-[9px] font-medium text-slate-600 uppercase leading-none min-h-fit">
                                        <Globe className="w-3 h-3 text-slate-400 flex-shrink-0" /> 
                                        <span>{String(companyData.website).replace(/^https?:\/\//, '').replace(/\/$/, '')}</span>
                                    </div>
                                )}
                                {companyData?.email && (
                                    <div className="flex items-center gap-[6px] text-[9px] font-medium text-slate-600 uppercase leading-none min-h-fit">
                                        <Mail className="w-3 h-3 text-slate-400 flex-shrink-0" /> 
                                        <span className="lowercase">{companyData.email}</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="flex flex-col items-center justify-end pt-2">
                            <div className="w-40 h-14 border-b border-slate-200 flex items-end justify-center pb-1 relative">
                                {companyData?.companySignature && (
                                    <img src={companyData.companySignature} className="max-h-12 w-auto object-contain mix-blend-multiply absolute bottom-1" />
                                )}
                            </div>
                            <p className="text-[11px] font-semibold text-slate-700 uppercase mt-2 tracking-wider">{compName}</p>
                            <p className="text-[8px] text-slate-400 uppercase tracking-tighter">Representante Autorizado</p>
                        </div>
                    </div>
                </div>

                {/* 6. RODAPÉ SISTÊMICO */}
                <footer id="doc-footer-block" className="pdf-export-block py-4 border-t border-slate-100 flex justify-between items-center text-[8px] font-bold text-slate-300 uppercase tracking-[0.2em]">
                    <span>marbleflow.systems</span>
                    <span>Doc ID: #{protocol?.slice(0, 8)}</span>
                </footer>
            </section>
        </div>
    );
});

QuotePrintTemplate.displayName = 'QuotePrintTemplate';
