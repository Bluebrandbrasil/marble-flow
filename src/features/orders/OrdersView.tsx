import { safeArray } from '../../lib/dataDiagnostics';
import { safeParseISO, formatVisualDate, compareDatesSafe } from '../../lib/dateUtils';
import React, { useState } from 'react';
import type { Order, Status } from '../../types';
import type { CompanySettings } from '../../hooks/useSettings';
import { generateBatchProductionSheet } from '../../lib/pdfGenerator';
import { Card, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Printer, Eye, MoreHorizontal, Edit, ArrowRightLeft, Package, Clock, Truck, CheckCircle, Plus, Filter, FileText } from 'lucide-react';
import { useOutletContext } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { HighlightText, calculateSearchScore, normalizeStr } from '../../lib/searchUtils';

interface OrdersViewProps {
    orders: Order[];
    settings: CompanySettings;
    globalSearchText?: string;
}

export const OrdersView: React.FC<OrdersViewProps> = ({ orders, settings }) => {
    const { setSelectedOrder, handleOrderMove, navigate, isFocusMode } = useOutletContext<any>();
    const [orderSearchText, setOrderSearchText] = useState('');
    const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
    const [statusFilter, setStatusFilter] = useState<Status | 'all'>('all');
    const [actionMenuId, setActionMenuId] = useState<string | null>(null);

    // Calc KPIs
    const kpis = React.useMemo(() => ({
        total: (orders || []).length,
        inProduction: (orders || []).filter(o => o?.status === 'production' || o?.status === 'production_queue').length,
        inInstallation: (orders || []).filter(o => o?.status === 'installation').length,
        finished: (orders || []).filter(o => o?.status === 'finished').length
    }), [orders]);

    const filteredOrders = React.useMemo(() => {
        let result = (orders || []);
        
        // Status filter
        if (statusFilter !== 'all') {
            result = safeArray(result).filter(o => o?.status === statusFilter);
        }

        const term = orderSearchText?.trim() || '';

        // Search filter
        if (term) {
            const scored = (result || []).map(order => {
                const cName = order?.customerName || '';
                const cProtocol = order?.protocolNumber || '';
                const cAddress = order?.address || '';
                const cPhone = order?.phone || '';
                const cMaterial = order?.material || '';

                const scoreName = calculateSearchScore(cName, normalizeStr(term));
                const scoreProto = calculateSearchScore(cProtocol, normalizeStr(term));
                const scoreAddress = calculateSearchScore(cAddress, normalizeStr(term));
                const scorePhone = calculateSearchScore(cPhone, normalizeStr(term), true);
                const scoreMaterial = calculateSearchScore(cMaterial, normalizeStr(term));

                return { ...order, _searchScore: Math.max(scoreName, scoreProto, scoreAddress, scorePhone, scoreMaterial) };
            }).filter(o => (o?._searchScore || 0) > 0);

            return scored.sort((a, b) => {
                if (a?._searchScore !== b?._searchScore) return (b?._searchScore || 0) - (a?._searchScore || 0);
                return compareDatesSafe(a?.createdAt, b?.createdAt, 'desc');
            });
        }

        return (result || []).sort((a, b) => compareDatesSafe(a?.createdAt, b?.createdAt, 'desc'));
    }, [orders, orderSearchText, statusFilter]);

    const toggleOrder = (orderId: string) => {
        const newSelected = new Set(selectedOrderIds);
        if (newSelected.has(orderId)) {
            newSelected.delete(orderId);
        } else {
            newSelected.add(orderId);
        }
        setSelectedOrderIds(newSelected);
    };

    const toggleAll = () => {
        if (selectedOrderIds.size === (filteredOrders || []).length && (filteredOrders || []).length > 0) {
            setSelectedOrderIds(new Set());
        } else {
            setSelectedOrderIds(new Set((filteredOrders || []).map(o => o?.id).filter(Boolean) as string[]));
        }
    };

    const [copiesPerOrder, setCopiesPerOrder] = useState(1);

    const handleBatchPrint = () => {
        const selectedOrders = (orders || []).filter(o => selectedOrderIds.has(o?.id));
        const ordersToPrint: Order[] = [];

        selectedOrders.forEach(order => {
            for (let i = 0; i < copiesPerOrder; i++) {
                ordersToPrint.push(order);
            }
        });

        generateBatchProductionSheet(ordersToPrint, settings);
    };

    const getStatusLabelAndColor = (status: Status) => {
        switch (status) {
            case 'production_queue': return { label: 'Fila', bg: 'bg-amber-50 text-amber-600 border-amber-200' };
            case 'production': return { label: 'Em Produção', bg: 'bg-blue-50 text-blue-600 border-blue-200' };
            case 'ready_for_conference': return { label: 'Conferência', bg: 'bg-indigo-50 text-indigo-600 border-indigo-200' };
            case 'installation': return { label: 'Instalação', bg: 'bg-purple-50 text-purple-600 border-purple-200' };
            case 'finished': return { label: 'Finalizado', bg: 'bg-emerald-50 text-emerald-600 border-emerald-200' };
            default: return { label: status, bg: 'bg-slate-50 text-slate-600 border-slate-200' };
        }
    };

    return (
        <div className="space-y-[var(--density-gap)] animate-in fade-in duration-500 pb-4">
            
            {/* KPI ROW */}
            {!isFocusMode && (<div className="grid grid-cols-2 md:grid-cols-4 gap-[var(--density-gap)]">
                {[
                    { label: 'Total Ordens', value: kpis.total, icon: Package, color: 'text-brand-rocha-primary', bg: 'bg-violet-50' },
                    { label: 'Em Produção', value: kpis.inProduction, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
                    { label: 'Instalação', value: kpis.inInstallation, icon: Truck, color: 'text-brand-rocha-primary', bg: 'bg-violet-50' },
                    { label: 'Finalizadas', value: kpis.finished, icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-50' }
                ].map((kpi, idx) => (
                    <Card key={idx} className="rocha-card border-none">
                        <CardContent className="p-0 flex items-center justify-between h-full">
                            <div>
                                <p className="rocha-text-label text-slate-400 mb-1">{kpi.label}</p>
                                <p className="rocha-text-value text-xl">{kpi.value}</p>
                            </div>
                            <div className={cn("p-1.5 rounded-lg", kpi.bg, kpi.color)}>
                                <kpi.icon className="h-4 w-4" />
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
            )}

            {/* FILTERS & MULTI-ACTIONS */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-0.5 rounded-lg w-fit border border-slate-200/50">
                    <Button 
                        variant={statusFilter === 'all' ? 'default' : 'ghost'} 
                        onClick={() => setStatusFilter('all')}
                        className={cn(
                            "h-7 px-3 rounded-md font-black text-[9px] uppercase tracking-widest transition-all",
                            statusFilter === 'all' ? "bg-brand-rocha-primary text-white shadow-sm" : "text-slate-500 hover:bg-white hover:text-slate-900"
                        )}
                    >
                        Tudo
                    </Button>
                    {(['production_queue', 'production', 'ready_for_conference', 'installation', 'finished'] as Status[]).map((status) => {
                        const info = getStatusLabelAndColor(status);
                        return (
                            <Button 
                                key={status}
                                variant={statusFilter === status ? 'default' : 'ghost'} 
                                onClick={() => setStatusFilter(status)}
                                className={cn(
                                    "h-7 px-3 rounded-md font-black text-[9px] uppercase tracking-widest transition-all",
                                    statusFilter === status ? "bg-brand-rocha-primary text-white shadow-sm" : "text-slate-500 hover:bg-white hover:text-slate-900"
                                )}
                            >
                                {info.label}
                            </Button>
                        );
                    })}
                </div>

                <div className="flex items-center gap-2">
                    <Button 
                        variant="outline" 
                        onClick={() => navigate('/producao/historico')}
                        className="h-8 px-3 rounded-lg text-xs font-semibold text-slate-700 hover:text-brand-rocha-primary hover:bg-slate-50 border-slate-200 gap-1.5"
                    >
                        <FileText className="w-4 h-4" />
                        Histórico de Produção
                    </Button>
                </div>

                <div className="flex items-center gap-3">
                    {selectedOrderIds.size > 0 && (
                        <div className="flex items-center gap-2 pr-4 border-r border-brand-rocha-border animate-in fade-in slide-in-from-right-4">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mr-2">{selectedOrderIds.size} selecionados</span>
                            <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-brand-rocha-border shadow-sm">
                                <input
                                    type="number"
                                    min="1"
                                    className="w-10 h-7 bg-transparent text-center text-xs font-black outline-none text-slate-900"
                                    value={copiesPerOrder}
                                    onChange={(e) => setCopiesPerOrder(Math.max(1, parseInt(e.target.value) || 1))}
                                />
                                <Button onClick={handleBatchPrint} size="sm" className="h-7 px-3 bg-slate-900 text-white font-black text-[9px] uppercase tracking-widest hover:bg-black rounded-md">
                                    <Printer className="h-3 w-3 mr-1.5" /> Imprimir
                                </Button>
                            </div>
                        </div>
                    )}
                    <Button variant="outline" className="h-10 border-brand-rocha-border bg-white rounded-xl font-black text-[10px] uppercase tracking-widest text-slate-600 shadow-sm hover:bg-slate-50">
                        <Filter className="h-4 w-4 mr-2 text-slate-400" /> Exportar
                    </Button>
                </div>
            </div>

            <Card className="rocha-panel bg-white p-0">
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="rocha-text-label text-slate-400 border-b border-brand-rocha-border/50 bg-slate-50/10">
                                    <th className="rocha-table-cell w-[40px] text-center">
                                        <input
                                            type="checkbox"
                                            className="rounded border-brand-rocha-border bg-white text-brand-rocha-primary focus:ring-brand-rocha-primary h-3.5 w-3.5"
                                            checked={filteredOrders.length > 0 && selectedOrderIds.size === filteredOrders.length}
                                            onChange={toggleAll}
                                        />
                                    </th>
                                    <th className="rocha-table-cell">O.S.</th>
                                    <th className="rocha-table-cell">Cliente</th>
                                    <th className="rocha-table-cell">Material</th>
                                    <th className="rocha-table-cell">Responsável</th>
                                    <th className="rocha-table-cell">Status</th>
                                    <th className="rocha-table-cell">Entrega</th>
                                    <th className="rocha-table-cell text-right">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredOrders.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} className="px-6 py-24 text-center">
                                            <div className="flex flex-col items-center justify-center space-y-4 max-w-sm mx-auto">
                                                <div className="p-6 bg-slate-50 rounded-full border border-slate-100 shadow-inner">
                                                    <Package className="h-12 w-12 text-slate-300" />
                                                </div>
                                                <div>
                                                    <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Nenhuma ordem encontrada</h3>
                                                    <p className="text-sm font-medium text-slate-500 mt-1">
                                                        Não encontramos resultados para seu filtro ou busca. Tente ajustar os termos ou criar um novo pedido.
                                                    </p>
                                                </div>
                                                <Button 
                                                    onClick={() => navigate('/pedidos/novo')}
                                                    className="bg-brand-rocha-primary hover:bg-violet-700 text-white font-black text-[10px] uppercase tracking-[0.2em] px-8 h-12 rounded-xl shadow-lg shadow-violet-500/20"
                                                >
                                                    <Plus className="h-4 w-4 mr-2" /> Criar Novo Pedido
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    safeArray(filteredOrders).map((order) => {
                                        const statusInfo = getStatusLabelAndColor(order.status);
                                        return (
                                            <tr 
                                                key={order.id} 
                                                className={cn(
                                                    "group transition-all duration-200 hover:bg-slate-50/50",
                                                    selectedOrderIds.has(order.id) ? "bg-violet-50/50" : "bg-transparent"
                                                )}
                                            >
                                                <td className="rocha-table-cell text-center">
                                                    <input
                                                        type="checkbox"
                                                        className="rounded border-slate-300 bg-white text-brand-rocha-primary focus:ring-brand-rocha-primary h-3.5 w-3.5"
                                                        checked={selectedOrderIds.has(order.id)}
                                                        onChange={() => toggleOrder(order.id)}
                                                    />
                                                </td>
                                                <td className="rocha-table-cell">
                                                    <div className="flex flex-col">
                                                        <span className="text-xs font-black text-slate-900 uppercase leading-none">
                                                            <HighlightText text={order.protocolNumber} term={orderSearchText} />
                                                        </span>
                                                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1 leading-none">{formatVisualDate(order.createdAt, "dd/MM/yy")}</span>
                                                    </div>
                                                </td>
                                                <td className="rocha-table-cell">
                                                    <div className="flex flex-col">
                                                        <span className="text-xs font-black text-slate-900 hover:text-brand-rocha-primary transition-colors cursor-pointer leading-none" onClick={() => setSelectedOrder(order)}>
                                                            <HighlightText text={order.customerName} term={orderSearchText} />
                                                        </span>
                                                        <span className="text-[9px] font-bold text-slate-400 uppercase mt-1 leading-none">
                                                            <HighlightText text={order.phone || 'Sem contato'} term={orderSearchText} />
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="rocha-table-cell">
                                                    <span className="text-[10px] font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded uppercase leading-none">
                                                        <HighlightText text={order.material} term={orderSearchText} />
                                                    </span>
                                                </td>
                                                <td className="rocha-table-cell">
                                                    <span className={cn(
                                                        "text-[9px] font-black uppercase tracking-widest leading-none",
                                                        order?.installerName ? "text-slate-700" : "text-slate-400"
                                                    )}>
                                                        {String(order?.installerName || order?.sawyerName || 'pendente')}
                                                    </span>
                                                </td>
                                                <td className="rocha-table-cell">
                                                    <span className={cn(
                                                        "px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border",
                                                        statusInfo.bg
                                                    )}>
                                                        {statusInfo.label}
                                                    </span>
                                                </td>
                                                <td className="rocha-table-cell">
                                                    <div className="flex items-center gap-1.5 leading-none">
                                                        <Clock className={cn(
                                                            "h-3 w-3",
                                                            order?.deadline && (safeParseISO(order.deadline)?.getTime() || 0) < new Date().getTime() && order?.status !== 'finished' ? "text-rose-500" : "text-slate-400"
                                                        )} />
                                                        <span className={cn(
                                                            "text-[9px] font-black uppercase",
                                                            order.deadline && (safeParseISO(order.deadline)?.getTime() || 0) < new Date().getTime() && order.status !== 'finished'
                                                                ? "text-rose-600"
                                                                : "text-slate-700"
                                                        )}>
                                                            {order.deadline ? formatVisualDate(order.deadline, "dd/MM/yy") : 'A DEFINIR'}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="rocha-table-cell text-right">
                                                    <div className="flex items-center justify-end gap-1">
                                                        <Button 
                                                            variant="ghost" 
                                                            size="icon" 
                                                            onClick={() => setSelectedOrder(order)}
                                                            className="h-7 w-7 hover:bg-violet-50 hover:text-brand-rocha-primary transition-all"
                                                            title="Ver Detalhes"
                                                        >
                                                            <Eye className="h-3.5 w-3.5" />
                                                        </Button>
                                                        
                                                        <div className="relative">
                                                            <Button 
                                                                variant="ghost" 
                                                                size="icon"
                                                                onClick={() => setActionMenuId(actionMenuId === order.id ? null : order.id)}
                                                                className={cn(
                                                                    "h-7 w-7 hover:bg-slate-100",
                                                                    actionMenuId === order.id && "bg-slate-100 text-slate-900"
                                                                )}
                                                            >
                                                                <MoreHorizontal className="h-3.5 w-3.5 text-slate-400" />
                                                            </Button>
                                                            
                                                            {actionMenuId === order.id && (
                                                                <div className="absolute right-0 top-full mt-2 w-52 bg-white border border-brand-rocha-border rounded-xl shadow-2xl z-30 overflow-hidden animate-in fade-in zoom-in-95">
                                                                    <div className="p-1.5 space-y-0.5">
                                                                        <button 
                                                                            onClick={() => {
                                                                                setActionMenuId(null);
                                                                                navigate(`/pedidos/${order.id}/editar`);
                                                                            }}
                                                                            className="w-full h-10 flex items-center px-3 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 hover:text-slate-900 rounded-lg transition-colors"
                                                                        >
                                                                            <Edit className="h-3.5 w-3.5 mr-3 text-slate-400" /> Editar Ordem
                                                                        </button>
                                                                        <button 
                                                                            onClick={() => {
                                                                                window.open(`/order/${order.id}/contract`, '_blank');
                                                                                setActionMenuId(null);
                                                                            }}
                                                                            className="w-full h-10 flex items-center px-3 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 hover:text-slate-900 rounded-lg transition-colors"
                                                                        >
                                                                            <FileText className="h-3.5 w-3.5 mr-3 text-emerald-500" /> Imprimir Contrato
                                                                        </button>
                                                                        <button 
                                                                            onClick={() => {
                                                                                generateBatchProductionSheet([order], settings);
                                                                                setActionMenuId(null);
                                                                            }}
                                                                            className="w-full h-10 flex items-center px-3 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 hover:text-slate-900 rounded-lg transition-colors"
                                                                        >
                                                                            <Printer className="h-3.5 w-3.5 mr-3 text-slate-400" /> Imprimir Ficha
                                                                        </button>
                                                                        <div className="h-px bg-slate-100 my-1 mx-2" />
                                                                        <div className="px-3 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest">Alterar Etapa</div>
                                                                        {(['production_queue', 'production', 'ready_for_conference', 'installation', 'finished'] as Status[]).filter(s => s !== order.status).map(status => (
                                                                             <button 
                                                                                key={status}
                                                                                onClick={() => {
                                                                                    handleOrderMove(order, status);
                                                                                    setActionMenuId(null);
                                                                                }}
                                                                                className="w-full h-9 flex items-center px-3 text-[10px] font-black uppercase tracking-[0.05em] text-slate-500 hover:bg-violet-50 hover:text-brand-rocha-primary rounded-lg transition-colors"
                                                                            >
                                                                                <ArrowRightLeft className="h-3 w-3 mr-3 opacity-50" /> {getStatusLabelAndColor(status).label}
                                                                            </button>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>

            {/* CLICK-OUTSIDE BACKDROP FOR MENU */}
            {actionMenuId && (
                <div 
                    className="fixed inset-0 z-20 bg-transparent" 
                    onClick={() => setActionMenuId(null)}
                />
            )}
        </div>
    );
};
