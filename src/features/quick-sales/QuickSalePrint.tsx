import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { QuickSalePieceDrawing } from './components/QuickSalePieceDrawing';
import { Button } from '../../components/ui/Button';
import { Printer, ArrowLeft, Loader2, Phone, MapPin, Globe, Instagram, Mail } from 'lucide-react';
import type { QuickSale, CompanyData } from '../../types';

export const QuickSalePrint: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { profile } = useAuth();

    const mode = searchParams.get('mode') === 'production' ? 'production' : 'commercial';

    const [sale, setSale] = useState<QuickSale | null>(null);
    const [company, setCompany] = useState<CompanyData | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!id) return;

        const fetchData = async () => {
            try {
                // 1. Fetch sale
                const saleSnap = await getDoc(doc(db, 'quick_sales', id));
                if (saleSnap.exists()) {
                    const saleData = saleSnap.data() as QuickSale;
                    setSale({ id: saleSnap.id, ...saleData });

                    // 2. Fetch company
                    if (saleData.companyId) {
                        const companySnap = await getDoc(doc(db, 'companies', saleData.companyId));
                        if (companySnap.exists()) {
                            setCompany({ id: companySnap.id, ...companySnap.data() } as CompanyData);
                        }
                    }
                } else {
                    alert('Venda Rápida não encontrada.');
                    navigate('/vendas-rapidas');
                }
            } catch (err) {
                console.error('Error fetching print data:', err);
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, [id, navigate]);

    useEffect(() => {
        if (sale) {
            const docTitle = mode === 'production' 
                ? `Ficha_Producao_Corte_${sale.protocolNumber || sale.id}`
                : `Pedido_Venda_Rapida_${sale.protocolNumber || sale.id}`;
            document.title = docTitle;
        }
    }, [sale, mode]);

    console.info('[QuickSalePrint] layout técnico versão 2 ativo');

    const handlePrint = () => {
        window.print();
    };

    if (isLoading) {
        return (
            <div className="min-h-screen bg-white flex items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
                    <span className="text-sm font-bold text-slate-400">Carregando layout de impressão...</span>
                </div>
            </div>
        );
    }

    if (!sale) return null;

    const formattedDate = (dateStr: any) => {
        if (!dateStr) return '';
        try {
            // If Firestore Timestamp
            if (dateStr.seconds) {
                return new Date(dateStr.seconds * 1000).toLocaleDateString('pt-BR');
            }
            return new Date(dateStr).toLocaleDateString('pt-BR');
        } catch {
            return String(dateStr);
        }
    };

    const formatItemDimensions = (item: any): string => {
        const lenM = item.lengthCm !== undefined ? item.lengthCm / 100 : (item.length > 10 ? item.length / 100 : item.length);
        const widM = item.widthCm !== undefined ? item.widthCm / 100 : (item.width > 5 ? item.width / 100 : item.width);
        return `${lenM.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m x ${widM.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m`;
    };

    const hasLongPiece = sale.items.some(item => {
        const len = item.lengthCm !== undefined ? item.lengthCm / 100 : (item.length > 10 ? item.length / 100 : item.length);
        return len >= 2.0;
    });

    return (
        <div className="min-h-screen bg-slate-100 py-8 px-4 print:bg-white print:py-0 print:px-0">
            {/* Styles to force compact printing and A4 simulation */}
            <style>{`
                /* Global rules for drawing cards */
                .print-drawing-card {
                    overflow: hidden !important;
                    max-width: 100% !important;
                    box-sizing: border-box !important;
                }
                .quick-sale-drawing {
                    display: block !important;
                    width: 100% !important;
                    max-width: none !important;
                    height: auto !important;
                    object-fit: contain !important;
                    margin: 0 auto !important;
                }
                .quick-sale-drawing svg {
                    width: 100% !important;
                    height: auto !important;
                    display: block !important;
                    overflow: hidden !important;
                }
                
                .quick-sale-pieces-grid {
                    display: grid;
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                    gap: 16px;
                    align-items: start;
                    width: 100%;
                }
                
                .quick-sale-pieces-grid.single-piece {
                    grid-template-columns: minmax(0, 1fr);
                }

                .quick-sale-piece-card {
                    width: 100%;
                    min-width: 0;
                    box-sizing: border-box;
                    break-inside: avoid;
                    page-break-inside: avoid;
                    overflow: hidden;
                }

                /* Screen Simulation of A4 */
                @media screen {
                    .print-sheet {
                        max-width: 210mm !important;
                        min-height: 297mm;
                        margin: 0 auto !important;
                        box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1) !important;
                        border: 1px solid #e2e8f0 !important;
                        border-radius: 24px !important;
                        box-sizing: border-box !important;
                    }
                }

                /* Print specific styling */
                @media print {
                    @page {
                        size: A4 portrait;
                        margin: 8mm !important;
                    }
                    body {
                        margin: 0 !important;
                        background: white !important;
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                    .quick-sale-pieces-grid {
                        grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
                        gap: 6mm !important;
                    }
                    .quick-sale-pieces-grid.single-piece {
                        grid-template-columns: minmax(0, 1fr) !important;
                    }
                    .print-sheet {
                        padding: 0 !important;
                        margin: 0 auto !important;
                        border: none !important;
                        box-shadow: none !important;
                        background: white !important;
                        max-width: 190mm !important;
                        width: 100% !important;
                        box-sizing: border-box !important;
                    }
                    .commercial-summary {
                        break-inside: avoid !important;
                        page-break-inside: avoid !important;
                        overflow: visible !important;
                    }
                    
                    /* Table pagination rules */
                    .print-table thead {
                        display: table-header-group !important;
                    }
                    .print-table tr {
                        break-inside: avoid !important;
                        page-break-inside: avoid !important;
                    }

                    .print-table {
                        table-layout: fixed !important;
                        width: 100% !important;
                        word-break: break-word !important;
                    }
                    .print-table td {
                        padding-top: 4px !important;
                        padding-bottom: 4px !important;
                        font-size: 10px !important;
                    }
                    .print-table th {
                        padding-top: 4px !important;
                        padding-bottom: 4px !important;
                        font-size: 9px !important;
                    }
                    .print-sheet * {
                        box-sizing: border-box !important;
                    }
                    footer, .print-footer {
                        position: relative !important;
                        break-inside: avoid !important;
                        page-break-inside: avoid !important;
                    }
                }
            `}</style>

            {/* Top Toolbar (Hidden on print) */}
            <div className="max-w-4xl mx-auto mb-6 flex justify-between items-center print:hidden">
                <Button 
                    variant="ghost" 
                    onClick={() => navigate('/vendas-rapidas')}
                    className="h-10 px-4 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-slate-600 gap-2 font-bold"
                >
                    <ArrowLeft className="h-4 w-4" /> Voltar
                </Button>
                <div className="flex gap-2">
                    <Button 
                        variant="outline"
                        onClick={() => navigate(`/vendas-rapidas/${id}/imprimir?mode=${mode === 'production' ? 'commercial' : 'production'}`)}
                        className="h-10 px-4 bg-white border border-slate-200 rounded-xl text-xs uppercase tracking-widest font-black text-slate-600 gap-2 shadow-sm"
                    >
                        {mode === 'production' ? 'Ver Pedido Comercial' : 'Ver Ficha de Produção'}
                    </Button>
                    <Button 
                        onClick={handlePrint}
                        className="h-10 px-5 bg-slate-900 text-white hover:bg-black rounded-xl font-bold uppercase text-xs tracking-widest gap-2 shadow"
                    >
                        <Printer className="h-4 w-4" /> {mode === 'production' ? 'Imprimir Ficha' : 'Imprimir Pedido'}
                    </Button>
                </div>
            </div>

            {/* Print Sheet */}
            <div className="print-sheet max-w-[210mm] w-full mx-auto bg-white p-8 border border-slate-200 shadow-lg rounded-3xl print:border-none print:shadow-none print:rounded-none print:p-0 print:max-w-none">
                
                {/* 1. Header (Company details) */}
                <div className="flex flex-row justify-between items-center pb-3 border-b border-slate-150 gap-4 mb-3">
                    <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                            {company?.logoUrl && (
                                <img src={company.logoUrl} alt="Logo" className="h-7 w-auto object-contain" />
                            )}
                            <h1 className="text-base font-black text-slate-950 uppercase tracking-tighter leading-none">
                                {company?.name || 'Marmoraria'}
                            </h1>
                        </div>
                        {company?.address && (
                            <p className="text-[9px] text-slate-500 font-medium max-w-md flex items-center gap-0.5 leading-none">
                                <MapPin className="h-2.5 w-2.5 text-slate-400 shrink-0" /> {company.address}
                            </p>
                        )}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[9px] font-bold text-slate-500 uppercase tracking-wide leading-none pt-0.5">
                            {company?.document && <span>CNPJ: {company.document}</span>}
                            {company?.phone && <span className="flex items-center gap-0.5"><Phone className="h-2.5 w-2.5 text-slate-400" /> {company.phone}</span>}
                            {company?.website && <span className="flex items-center gap-0.5"><Globe className="h-2.5 w-2.5 text-slate-400" /> {company.website}</span>}
                            {company?.instagram && <span className="flex items-center gap-0.5"><Instagram className="h-2.5 w-2.5 text-slate-400" /> @{company.instagram}</span>}
                        </div>
                    </div>
                    <div className="shrink-0 text-right">
                        <span className={`px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-wider ${
                            mode === 'production' 
                                ? 'bg-amber-100 text-amber-800 border border-amber-200' 
                                : 'bg-slate-900 text-white'
                        }`}>
                            {mode === 'production' ? 'Ficha de Produção / Corte' : 'Pedido de Venda Rápida'}
                        </span>
                    </div>
                </div>

                {/* 2. Metadata Section (2 columns, client and logistics) */}
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 py-3 border-b border-slate-100 text-xs">
                    {/* Left Column: Pedido & Cliente */}
                    <div className="space-y-2">
                        <div>
                            <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest block leading-none">Pedido</span>
                            <div className="font-bold text-slate-800 mt-1 leading-none">
                                <span className="text-slate-950 font-black">#{sale.protocolNumber}</span> • {formattedDate(sale.createdAt)} • Vendedor: {sale.createdByName || 'N/A'}
                            </div>
                        </div>
                        <div>
                            <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest block leading-none">Cliente</span>
                            <div className="font-black text-slate-950 uppercase mt-1 leading-none">
                                {sale.clientName} {sale.clientPhone ? `| Tel: ${sale.clientPhone}` : ''}
                            </div>
                        </div>
                    </div>

                    {/* Right Column: Modalidade & Previsão */}
                    <div className="space-y-2">
                        <div>
                            <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest block leading-none">Modalidade & Previsão</span>
                            <div className="font-bold text-slate-800 mt-1 leading-none">
                                {sale.fulfillmentType === 'entrega' ? '🚛 Entrega' : '🏭 Retirada'} • Previsão: {sale.fulfillmentType === 'retirada' ? formattedDate(sale.expectedPickupDate) : formattedDate(sale.expectedDeliveryDate)}{sale.expectedTime ? ` às ${sale.expectedTime}` : ''}
                            </div>
                            {sale.fulfillmentType === 'entrega' && sale.clientAddress && (
                                <div className="text-[10px] text-slate-500 font-medium max-w-sm flex items-start gap-0.5 mt-1.5 leading-tight">
                                    <MapPin className="h-2.5 w-2.5 text-slate-400 shrink-0 mt-0.5" />
                                    <span>{sale.clientAddress}</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* 3. Technical Drawings Section */}
                <div className="py-3 border-b border-slate-100 space-y-3">
                    <h3 className="text-[9px] font-black uppercase text-slate-400 tracking-widest leading-none">
                        Esboço Técnico & Acabamento das Peças
                    </h3>

                    <div className={`quick-sale-pieces-grid ${sale.items.length === 1 ? 'single-piece' : ''}`}>
                        {sale.items.map((item, idx) => (
                            <div key={item.id} className="quick-sale-piece-card">
                                <QuickSalePieceDrawing 
                                    length={item.lengthCm !== undefined ? item.lengthCm / 100 : (item.length > 10 ? item.length / 100 : item.length)}
                                    width={item.widthCm !== undefined ? item.widthCm / 100 : (item.width > 5 ? item.width / 100 : item.width)}
                                    type={item.type}
                                    material={item.material}
                                    quantity={item.quantity}
                                    thickness={2}
                                    finishes={item.finishes}
                                    compact={true}
                                    index={idx}
                                    observations={item.observations}
                                />
                            </div>
                        ))}
                    </div>
                </div>

                {/* 4. Items Pricing Table */}
                <div className="py-3 border-b border-slate-100">
                    <h3 className="text-[9px] font-black uppercase text-slate-400 tracking-widest leading-none mb-3">
                        {mode === 'production' ? 'Detalhamento Técnico das Peças' : 'Detalhamento Comercial'}
                    </h3>
                    <table className="print-table w-full text-xs text-left border-collapse">
                        <thead>
                            <tr className="border-b border-slate-200 text-[9px] font-black text-slate-400 uppercase tracking-wider">
                                <th className="py-1.5 w-[6%]">Item</th>
                                <th className="py-1.5 w-[24%]">Peça / Acabamento</th>
                                <th className="py-1.5 w-[25%]">{mode === 'production' ? 'Material' : 'Material / Preço m²'}</th>
                                <th className="py-1.5 w-[21%] text-center">Medidas / Área</th>
                                <th className="py-1.5 w-[6%] text-center">Qtd</th>
                                {mode === 'production' ? (
                                    <th className="py-1.5 w-[18%]">Observações</th>
                                ) : (
                                    <>
                                        <th className="py-1.5 w-[9%] text-right">Unitário</th>
                                        <th className="py-1.5 w-[9%] text-right">Total</th>
                                    </>
                                )}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-bold text-slate-700">
                            {sale.items.map((item, idx) => {
                                const materialName = item.materialName || item.material || '';
                                const materialPrice = item.materialPricePerM2 || 0;
                                const len = item.lengthCm !== undefined ? item.lengthCm : item.length;
                                const wid = item.widthCm !== undefined ? item.widthCm : item.width;
                                const areaM2 = item.areaM2 !== undefined ? item.areaM2 : ((len * wid) / 10000);
                                const totalAreaM2 = item.totalAreaM2 !== undefined ? item.totalAreaM2 : (areaM2 * item.quantity);

                                return (
                                    <tr key={item.id} className="text-slate-800">
                                        <td className="py-2 font-black">#{idx + 1}</td>
                                        <td className="py-2">
                                            <div className="flex flex-col">
                                                <span className="uppercase text-xs font-black">{item.type}</span>
                                                <span className="text-[8px] text-slate-500 font-bold uppercase mt-0.5 leading-tight">
                                                    F: {item.finishes?.frente || 'Sem'} | Fd: {item.finishes?.fundo || 'Sem'} | E: {item.finishes?.esquerda || 'Sem'} | D: {item.finishes?.direita || 'Sem'}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="py-2">
                                            <div className="flex flex-col">
                                                <span className="uppercase text-[11px] font-bold text-slate-750">{materialName}</span>
                                                {mode !== 'production' && (
                                                    <span className="text-[8px] text-slate-500 mt-0.5">
                                                        {materialPrice > 0 ? `${materialPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}/m²` : 'Preço manual'}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="py-2 text-center">
                                            <div className="flex flex-col items-center">
                                                <span className="text-[11px] font-bold tabular-nums">
                                                    {formatItemDimensions(item)}
                                                </span>
                                                <span className="text-[8px] text-slate-500 mt-0.5 font-semibold">
                                                    {totalAreaM2.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} m² (Total)
                                                </span>
                                            </div>
                                        </td>
                                        <td className="py-2 text-center tabular-nums">{item.quantity}</td>
                                        {mode === 'production' ? (
                                            <td className="py-2 text-[10px] font-medium text-slate-500 leading-tight">
                                                {item.observations || '--'}
                                            </td>
                                        ) : (
                                            <>
                                                <td className="py-2 text-right tabular-nums">
                                                    {item.unitPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                                </td>
                                                <td className="py-2 text-right font-black tabular-nums">
                                                    {item.totalPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                                </td>
                                            </>
                                        )}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {/* 5. Pricing & Finance details */}
                {mode === 'production' ? (
                    sale.observations && (
                        <div className="commercial-summary py-4">
                            <div className="space-y-1">
                                <h4 className="text-[9px] font-black uppercase text-slate-400 tracking-widest leading-none">Observações Gerais</h4>
                                <p className="text-xs font-medium text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-100 leading-tight">
                                    {sale.observations}
                                </p>
                            </div>
                        </div>
                    )
                ) : (
                    <div className="commercial-summary grid grid-cols-1 md:grid-cols-2 py-4 gap-4">
                        <div className="space-y-3">
                            {sale.observations && (
                                <div className="space-y-1">
                                    <h4 className="text-[9px] font-black uppercase text-slate-400 tracking-widest leading-none">Observações Gerais</h4>
                                    <p className="text-xs font-medium text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-100 leading-tight">
                                        {sale.observations}
                                    </p>
                                </div>
                            )}

                            <div className="text-[8px] text-slate-400 font-bold uppercase tracking-wider leading-relaxed">
                                <p>* ESTE DOCUMENTO NÃO É UM CONTRATO DE PRESTAÇÃO DE SERVIÇOS.</p>
                                <p>* MEDIÇÕES TÉCNICAS E ASSINATURAS NÃO FORAM EXIGIDAS PARA ESTE PROCESSO SIMPLIFICADO.</p>
                            </div>
                        </div>

                        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-2.5 font-bold text-slate-600 text-xs print:p-3 print:rounded-xl">
                            <div className="grid grid-cols-2 gap-4">
                                {/* Left Column: Subtotal, Delivery, Discount, Total Geral */}
                                <div className="space-y-2">
                                    <div>
                                        <span className="text-[9px] uppercase font-black text-slate-400 leading-none">Valores</span>
                                        <div className="flex justify-between text-[11px] mt-1 leading-none">
                                            <span>Subtotal</span>
                                            <span className="text-slate-900 font-black">{sale.subtotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                                        </div>
                                        {sale.fulfillmentType === 'entrega' && (
                                            <div className="flex justify-between text-[11px] text-blue-600 mt-1 leading-none">
                                                <span>Entrega</span>
                                                <span className="font-black">+ {sale.deliveryFee.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                                            </div>
                                        )}
                                        {sale.discount > 0 && (
                                            <div className="flex justify-between text-[11px] text-rose-500 mt-1 leading-none">
                                                <span>Desconto</span>
                                                <span className="font-black">- {sale.discount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                                            </div>
                                        )}
                                    </div>
                                    <div className="h-px bg-slate-200" />
                                    <div className="flex justify-between text-xs font-black leading-none">
                                        <span className="text-slate-950 uppercase tracking-tight">Total Geral</span>
                                        <span className="text-emerald-600 text-[13px] tabular-nums">{sale.totalAmount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                                    </div>
                                    <div className="h-px bg-slate-200" />
                                    <div>
                                        <span className="text-[9px] uppercase font-black text-slate-400 leading-none">Forma de Pagamento</span>
                                        <p className="text-slate-800 text-[11px] font-black mt-1 leading-none">{sale.paymentMethod}</p>
                                    </div>
                                </div>

                                {/* Right Column: Condição, Entrada, Saldo, Status */}
                                <div className="space-y-2 border-l border-slate-200 pl-4 print:pl-3">
                                    <div>
                                        <span className="text-[9px] uppercase font-black text-slate-400 leading-none">Condição de Pagamento</span>
                                        <p className="text-slate-800 text-[10px] font-black mt-1 leading-none truncate" title={sale.paymentConditionLabel}>
                                            {sale.paymentConditionLabel || '50% no ato e 50% na retirada/entrega'}
                                        </p>
                                    </div>
                                    {(() => {
                                        const totalCents = Math.round(sale.totalAmount * 100);
                                        const entryCents = sale.downPaymentAmount !== undefined 
                                            ? Math.round(sale.downPaymentAmount * 100) 
                                            : Math.floor(totalCents * 0.5);
                                        const balanceCents = sale.remainingBalanceAmount !== undefined
                                            ? Math.round(sale.remainingBalanceAmount * 100)
                                            : (totalCents - entryCents);
                                        return (
                                            <div className="grid grid-cols-2 gap-2 text-[9px] uppercase font-black text-slate-400">
                                                <div>
                                                    <p className="leading-none">Entrada</p>
                                                    <p className="text-slate-850 text-[11px] font-black mt-1 leading-none">
                                                        {(entryCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                                    </p>
                                                </div>
                                                <div>
                                                    <p className="leading-none">Saldo</p>
                                                    <p className="text-slate-850 text-[11px] font-black mt-1 leading-none">
                                                        {(balanceCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                                    </p>
                                                </div>
                                            </div>
                                        );
                                    })()}
                                    <div className="h-px bg-slate-200" />
                                    <div>
                                        <span className="text-[9px] uppercase font-black text-slate-400 leading-none">Status</span>
                                        <p className={`text-[11px] font-black mt-1 leading-none ${
                                            sale.paymentStatus === 'pago' 
                                                ? 'text-emerald-600' 
                                                : sale.paymentStatus === 'entrada_recebida' 
                                                    ? 'text-blue-500' 
                                                    : 'text-rose-500'
                                        }`}>
                                            {sale.paymentStatus === 'pago' 
                                                ? 'QUITADO' 
                                                : sale.paymentStatus === 'entrada_recebida' 
                                                    ? 'ENTRADA RECEBIDA' 
                                                    : 'PENDENTE'}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* 6. Signatures Placeholders */}
                <div className="grid grid-cols-2 gap-8 pt-6 text-center text-[9px] font-black uppercase text-slate-400 tracking-wider">
                    <div className={`${mode === 'production' ? 'col-span-2 max-w-xs mx-auto w-full' : ''} space-y-4`}>
                        <div className="border-b border-slate-200 w-3/4 mx-auto" />
                        <p>Responsável pelo Corte / Produção</p>
                    </div>
                    {mode !== 'production' && (
                        <div className="space-y-4">
                            <div className="border-b border-slate-200 w-3/4 mx-auto" />
                            <p>Assinatura do Cliente (Recebido)</p>
                        </div>
                    )}
                </div>

                {/* 7. Footer */}
                <div className="hidden print:flex justify-between items-center pt-3 border-t border-slate-100 text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-4">
                    <span>Sistema de Vendas Rápida</span>
                    <span>Página 1 de 1</span>
                </div>

            </div>
        </div>
    );
};
