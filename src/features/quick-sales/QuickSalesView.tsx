import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../lib/firebase';
import { 
    collection, 
    onSnapshot, 
    query, 
    where, 
    doc, 
    updateDoc,
    serverTimestamp
} from 'firebase/firestore';
import { 
    ShoppingBag, 
    Plus, 
    Search, 
    Printer, 
    Edit, 
    XCircle, 
    Clock, 
    CheckCircle, 
    Calendar,
    Truck,
    Package,
    ArrowRightLeft,
    TrendingUp,
    MoreHorizontal,
    Trash2,
    Hammer
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Card, CardContent } from '../../components/ui/Card';
import { cn } from '../../lib/utils';
import { HighlightText, calculateSearchScore, normalizeStr } from '../../lib/searchUtils';
import type { QuickSale } from '../../types';

const formatItemDimensions = (item: any): string => {
    const lenM = item.lengthCm !== undefined ? item.lengthCm / 100 : (item.length > 10 ? item.length / 100 : item.length);
    const widM = item.widthCm !== undefined ? item.widthCm / 100 : (item.width > 5 ? item.width / 100 : item.width);
    return `${lenM.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m x ${widM.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m`;
};

const getPaymentStatusBadge = (status: QuickSale['paymentStatus']) => {
    if (status === 'pago') {
        return {
            label: 'Quitado',
            classes: 'bg-emerald-50 text-emerald-600 border-emerald-100'
        };
    }
    if (status === 'entrada_recebida') {
        return {
            label: 'Entrada Recebida',
            classes: 'bg-blue-50 text-blue-600 border-blue-100'
        };
    }
    return {
        label: 'Pendente',
        classes: 'bg-rose-50 text-rose-600 border-rose-100'
    };
};

const STATUS_LABELS: Record<QuickSale['status'], string> = {
    rascunho: 'Rascunho',
    aguardando_pagamento: 'Aguardando Pagamento',
    pago: 'Pago / Pronto p/ Fila',
    em_corte: 'Em Corte',
    em_acabamento: 'Em Acabamento',
    pronto_retirada: 'Pronto p/ Retirada',
    saiu_entrega: 'Saiu p/ Entrega',
    entregue: 'Entregue',
    cancelado: 'Cancelado'
};

const STATUS_COLORS: Record<QuickSale['status'], string> = {
    rascunho: 'bg-slate-100 text-slate-600 border-slate-200',
    aguardando_pagamento: 'bg-amber-50 text-amber-600 border-amber-200',
    pago: 'bg-emerald-50 text-emerald-600 border-emerald-200',
    em_corte: 'bg-blue-50 text-blue-600 border-blue-200',
    em_acabamento: 'bg-indigo-50 text-indigo-600 border-indigo-200',
    pronto_retirada: 'bg-purple-50 text-purple-600 border-purple-200',
    saiu_entrega: 'bg-sky-50 text-sky-600 border-sky-200',
    entregue: 'bg-green-50 text-green-600 border-green-200',
    cancelado: 'bg-rose-50 text-rose-600 border-rose-200'
};

export const QuickSalesView: React.FC = () => {
    const { user, profile } = useAuth();
    const navigate = useNavigate();

    const [sales, setSales] = useState<QuickSale[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<QuickSale['status'] | 'all'>('all');
    const [actionMenuId, setActionMenuId] = useState<string | null>(null);

    // Permission Checks
    const canCreate = ['superadmin', 'company_admin', 'admin', 'vendedor'].includes(profile?.role || '');
    const canEditOrCancel = ['superadmin', 'company_admin', 'admin'].includes(profile?.role || '');
    const canDelete = ['superadmin', 'company_admin', 'admin', 'financeiro'].includes(profile?.role || '');

    useEffect(() => {
        if (!profile?.companyId) return;

        const q = query(
            collection(db, 'quick_sales'),
            where('companyId', '==', profile.companyId)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data: QuickSale[] = [];
            snapshot.forEach((docSnap) => {
                data.push({ id: docSnap.id, ...docSnap.data() } as QuickSale);
            });

            // Sort by createdAt descending
            const sorted = data.sort((a, b) => {
                const dateA = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : new Date(a.createdAt || 0).getTime();
                const dateB = b.createdAt?.seconds ? b.createdAt.seconds * 1000 : new Date(b.createdAt || 0).getTime();
                return dateB - dateA;
            });

            setSales(sorted);
            setLoading(false);
        }, (err) => {
            console.error('Error listening to quick sales:', err);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [profile?.companyId]);

    // KPI Calculations
    const kpis = useMemo(() => {
        const todayStr = new Date().toLocaleDateString('pt-BR');
        let totalSoldToday = 0;
        let totalVolume = 0;
        let awaitingPickup = 0;
        let awaitingDelivery = 0;

        sales.forEach((s) => {
            const dateStr = s.createdAt?.seconds 
                ? new Date(s.createdAt.seconds * 1000).toLocaleDateString('pt-BR') 
                : new Date(s.createdAt || 0).toLocaleDateString('pt-BR');

            // Total volume (excluding cancelled or deleted)
            const isDel = (s as any).deleted === true || (s as any).isDeleted === true || s.status === 'cancelado';
            if (!isDel) {
                totalVolume += s.totalAmount || 0;
                
                // Sold today
                if (dateStr === todayStr) {
                    totalSoldToday += s.totalAmount || 0;
                }

                // Awaiting pickup
                if (s.fulfillmentType === 'retirada' && ['pago', 'pronto_retirada', 'em_corte', 'em_acabamento'].includes(s.status)) {
                    awaitingPickup++;
                }

                // Awaiting delivery
                if (s.fulfillmentType === 'entrega' && ['pago', 'saiu_entrega', 'em_corte', 'em_acabamento', 'pronto_retirada'].includes(s.status)) {
                    awaitingDelivery++;
                }
            }
        });

        return {
            totalSoldToday,
            totalVolume,
            awaitingPickup,
            awaitingDelivery
        };
    }, [sales]);

    // Filtering logic
    const filteredSales = useMemo(() => {
        let result = sales.filter(s => {
            const isDel = (s as any).deleted === true || (s as any).isDeleted === true || s.status === 'cancelado';
            return !isDel;
        });

        if (statusFilter !== 'all') {
            result = result.filter(s => s.status === statusFilter);
        }

        const term = searchTerm.trim().toLowerCase();
        if (term) {
            result = result.map(s => {
                const nameScore = calculateSearchScore(s.clientName || '', term);
                const protoScore = calculateSearchScore(s.protocolNumber || '', term);
                
                // Match items material names
                const itemsMaterials = (s.items || []).map(i => i.material || '').join(' ');
                const materialScore = calculateSearchScore(itemsMaterials, term);

                const finalScore = Math.max(nameScore, protoScore, materialScore);
                return { ...s, _searchScore: finalScore };
            })
            .filter(s => (s._searchScore || 0) > 0)
            .sort((a, b) => (b._searchScore || 0) - (a._searchScore || 0));
        }

        return result;
    }, [sales, statusFilter, searchTerm]);

    const handleUpdateStatus = async (saleId: string, newStatus: QuickSale['status']) => {
        try {
            const docRef = doc(db, 'quick_sales', saleId);
            const updates: Partial<QuickSale> = {
                status: newStatus,
                updatedAt: serverTimestamp()
            };

            // Propagate payment status if transitioned to delivered or completed
            if (newStatus === 'entregue') {
                updates.paymentStatus = 'pago';
                updates.paymentDate = new Date().toISOString();
            }

            await updateDoc(docRef, updates);
            alert(`Status atualizado para: ${STATUS_LABELS[newStatus]}`);
        } catch (err) {
            console.error('Error updating status:', err);
            alert('Falha ao atualizar o status.');
        }
    };

    const handleRegisterPayment = async (sale: QuickSale) => {
        if (!window.confirm(`Deseja confirmar o pagamento integral do Pedido #${sale.protocolNumber}?`)) return;
        try {
            const docRef = doc(db, 'quick_sales', sale.id);
            await updateDoc(docRef, {
                paymentStatus: 'pago',
                status: 'pago',
                paymentDate: new Date().toISOString(),
                updatedAt: serverTimestamp()
            });
            alert('Pagamento registrado com sucesso!');
        } catch (err) {
            console.error('Error registering payment:', err);
        }
    };

    const handleCancelSale = async (saleId: string) => {
        if (!window.confirm('Tem certeza de que deseja cancelar esta venda rápida?')) return;
        try {
            const docRef = doc(db, 'quick_sales', saleId);
            await updateDoc(docRef, {
                status: 'cancelado',
                updatedAt: serverTimestamp()
            });
            alert('Venda cancelada com sucesso.');
        } catch (err) {
            console.error('Error cancelling sale:', err);
        }
    };

    const handleDeleteSale = async (saleId: string) => {
        const confirmed = window.confirm("Tem certeza que deseja excluir esta venda rápida? Essa ação removerá a venda da listagem.");
        if (!confirmed) return;

        try {
            const docRef = doc(db, 'quick_sales', saleId);
            await updateDoc(docRef, {
                deleted: true,
                isDeleted: true,
                deletedAt: serverTimestamp(),
                deletedBy: user?.uid || '',
                deletedByName: profile?.name || user?.email || '',
                status: 'cancelado',
                updatedAt: serverTimestamp()
            });
            alert("Venda rápida excluída com sucesso.");
        } catch (err) {
            console.error('Error deleting quick sale:', err);
            alert("Erro ao excluir a venda rápida.");
        }
    };

    const formatCurrency = (val: number) => {
        return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    };

    const formattedDate = (dateStr: any) => {
        if (!dateStr) return '';
        try {
            if (dateStr.seconds) {
                return new Date(dateStr.seconds * 1000).toLocaleDateString('pt-BR');
            }
            return new Date(dateStr).toLocaleDateString('pt-BR');
        } catch {
            return String(dateStr);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="w-10 h-10 border-4 border-brand-emerald border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-6 pb-6">
            
            {/* KPI Summary Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { label: 'Vendido Hoje', value: formatCurrency(kpis.totalSoldToday), icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                    { label: 'Volume Total Peças', value: formatCurrency(kpis.totalVolume), icon: ShoppingBag, color: 'text-brand-rocha-primary', bg: 'bg-violet-50' },
                    { label: 'Aguardando Retirada', value: kpis.awaitingPickup, icon: Calendar, color: 'text-purple-600', bg: 'bg-purple-50' },
                    { label: 'Aguardando Entrega', value: kpis.awaitingDelivery, icon: Truck, color: 'text-sky-600', bg: 'bg-sky-50' }
                ].map((kpi, idx) => (
                    <Card key={idx} className="rocha-card border-none">
                        <CardContent className="p-0 flex items-center justify-between h-full">
                            <div>
                                <p className="rocha-text-label text-slate-400 mb-1">{kpi.label}</p>
                                <p className="rocha-text-value text-lg font-black">{kpi.value}</p>
                            </div>
                            <div className={cn("p-1.5 rounded-lg", kpi.bg, kpi.color)}>
                                <kpi.icon className="h-4 w-4" />
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Filter and Search Bar */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 dark:bg-slate-900 p-0.5 rounded-lg border border-slate-200/50">
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
                    {(['rascunho', 'aguardando_pagamento', 'pago', 'em_corte', 'em_acabamento', 'pronto_retirada', 'saiu_entrega', 'entregue', 'cancelado'] as QuickSale['status'][]).map((status) => (
                        <Button 
                            key={status}
                            variant={statusFilter === status ? 'default' : 'ghost'} 
                            onClick={() => setStatusFilter(status)}
                            className={cn(
                                "h-7 px-3 rounded-md font-black text-[9px] uppercase tracking-widest transition-all",
                                statusFilter === status ? "bg-brand-rocha-primary text-white shadow-sm" : "text-slate-500 hover:bg-white hover:text-slate-900"
                            )}
                        >
                            {STATUS_LABELS[status]}
                        </Button>
                    ))}
                </div>

                <div className="flex items-center gap-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                        <Input 
                            value={searchTerm} 
                            onChange={(e) => setSearchTerm(e.target.value)} 
                            placeholder="Buscar por cliente, pedra..." 
                            className="h-10 w-64 pl-9 text-xs" 
                        />
                    </div>
                    {canCreate && (
                        <Button 
                            onClick={() => navigate('/vendas-rapidas/nova')} 
                            className="h-10 px-5 bg-brand-emerald hover:bg-emerald-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow"
                        >
                            <Plus className="h-4 w-4 mr-1.5" /> Nova Venda Rápida
                        </Button>
                    )}
                </div>
            </div>

            {/* List Table */}
            <Card className="rocha-panel bg-white p-0">
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="rocha-text-label text-slate-400 border-b border-brand-rocha-border/50 bg-slate-50/10">
                                    <th className="rocha-table-cell">Protocolo</th>
                                    <th className="rocha-table-cell">Cliente</th>
                                    <th className="rocha-table-cell">Fulfillment</th>
                                    <th className="rocha-table-cell">Peças</th>
                                    <th className="rocha-table-cell text-right">Valor Total</th>
                                    <th className="rocha-table-cell text-center">Financeiro</th>
                                    <th className="rocha-table-cell text-center">Status</th>
                                    <th className="rocha-table-cell text-right">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredSales.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} className="px-6 py-24 text-center">
                                            <div className="flex flex-col items-center justify-center space-y-4 max-w-sm mx-auto">
                                                <div className="p-6 bg-slate-50 rounded-full border border-slate-100 shadow-inner">
                                                    <ShoppingBag className="h-12 w-12 text-slate-300" />
                                                </div>
                                                <div>
                                                    <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Nenhuma venda rápida encontrada</h3>
                                                    <p className="text-sm font-medium text-slate-500 mt-1">
                                                        Selecione outro filtro ou inicie um novo pedido avulso sem burocracia.
                                                    </p>
                                                </div>
                                                {canCreate && (
                                                    <Button 
                                                        onClick={() => navigate('/vendas-rapidas/nova')}
                                                        className="bg-brand-rocha-primary hover:bg-violet-700 text-white font-black text-[10px] uppercase tracking-[0.2em] px-8 h-12 rounded-xl shadow-lg"
                                                    >
                                                        <Plus className="h-4 w-4 mr-2" /> Nova Venda Rápida
                                                    </Button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    filteredSales.map((sale) => {
                                        const statusColor = STATUS_COLORS[sale.status];
                                        return (
                                            <tr key={sale.id} className="group hover:bg-slate-50/50 bg-transparent transition-all">
                                                <td className="rocha-table-cell">
                                                    <div className="flex flex-col">
                                                        <span className="text-xs font-black text-slate-900 uppercase">
                                                            <HighlightText text={sale.protocolNumber} term={searchTerm} />
                                                        </span>
                                                        <span className="text-[9px] font-bold text-slate-400 mt-1 uppercase tracking-widest">
                                                            {formattedDate(sale.createdAt)}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="rocha-table-cell">
                                                    <div className="flex flex-col">
                                                        <span className="text-xs font-black text-slate-900 leading-none">
                                                            <HighlightText text={sale.clientName} term={searchTerm} />
                                                        </span>
                                                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-1.5">
                                                            {sale.clientPhone || 'Sem telefone'}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="rocha-table-cell">
                                                    <div className="flex flex-col">
                                                        <span className="text-[10px] font-black uppercase text-slate-700">
                                                            {sale.fulfillmentType === 'entrega' ? '🚛 ENTREGA' : '🏭 RETIRADA'}
                                                        </span>
                                                        <span className="text-[9px] text-slate-400 font-bold mt-1">
                                                            {(() => {
                                                                const dateStr = sale.fulfillmentType === 'entrega' 
                                                                    ? formattedDate(sale.expectedDeliveryDate)
                                                                    : formattedDate(sale.expectedPickupDate);
                                                                const timeStr = sale.expectedTime ? ` às ${sale.expectedTime}` : '';
                                                                return dateStr ? `Previsto: ${dateStr}${timeStr}` : '';
                                                            })()}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="rocha-table-cell">
                                                    <div className="flex flex-col gap-0.5 max-w-[220px] overflow-hidden truncate">
                                                        {(sale.items || []).map((item, idx) => (
                                                            <span key={item.id || idx} className="text-[10px] font-medium text-slate-500 uppercase">
                                                                {item.quantity}x {item.type} ({formatItemDimensions(item)}) - {item.material}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </td>
                                                <td className="rocha-table-cell text-right">
                                                    <span className="text-xs font-black text-slate-900 tabular-nums">
                                                        {formatCurrency(sale.totalAmount)}
                                                    </span>
                                                </td>
                                                <td className="rocha-table-cell text-center">
                                                    {(() => {
                                                        const badge = getPaymentStatusBadge(sale.paymentStatus);
                                                        return (
                                                            <span className={cn(
                                                                "px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border",
                                                                badge.classes
                                                            )}>
                                                                {badge.label}
                                                            </span>
                                                        );
                                                    })()}
                                                </td>
                                                <td className="rocha-table-cell text-center">
                                                    <span className={cn(
                                                        "px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border",
                                                        statusColor
                                                    )}>
                                                        {STATUS_LABELS[sale.status]}
                                                    </span>
                                                </td>
                                                <td className="rocha-table-cell text-right">
                                                    <div className="flex items-center justify-end gap-1">
                                                        <Button 
                                                            variant="ghost" 
                                                            size="icon" 
                                                            onClick={() => window.open(`/vendas-rapidas/${sale.id}/imprimir?mode=commercial`, '_blank')}
                                                            className="h-7 w-7 hover:bg-slate-100 text-slate-500"
                                                            title="Pedido Comercial"
                                                        >
                                                            <Printer className="h-3.5 w-3.5" />
                                                        </Button>

                                                        <Button 
                                                            variant="ghost" 
                                                            size="icon" 
                                                            onClick={() => window.open(`/vendas-rapidas/${sale.id}/imprimir?mode=production`, '_blank')}
                                                            className="h-7 w-7 hover:bg-slate-100 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                                                            title="Ficha de Produção"
                                                        >
                                                            <Hammer className="h-3.5 w-3.5" />
                                                        </Button>

                                                        {sale.paymentStatus !== 'pago' && sale.status !== 'cancelado' && (
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                onClick={() => handleRegisterPayment(sale)}
                                                                className="h-7 w-7 text-emerald-500 hover:bg-emerald-50"
                                                                title="Registrar Pagamento"
                                                            >
                                                                <CheckCircle className="h-3.5 w-3.5" />
                                                            </Button>
                                                        )}

                                                        {canDelete && (
                                                            <Button 
                                                                variant="ghost" 
                                                                size="icon" 
                                                                onClick={() => handleDeleteSale(sale.id)}
                                                                className="h-7 w-7 text-rose-500 hover:bg-rose-50 hover:text-rose-600"
                                                                title="Excluir venda"
                                                            >
                                                                <Trash2 className="h-3.5 w-3.5" />
                                                            </Button>
                                                        )}

                                                        <div className="relative">
                                                            <Button 
                                                                variant="ghost" 
                                                                size="icon"
                                                                onClick={() => setActionMenuId(actionMenuId === sale.id ? null : sale.id)}
                                                                className={cn(
                                                                    "h-7 w-7 hover:bg-slate-100",
                                                                    actionMenuId === sale.id && "bg-slate-100 text-slate-900"
                                                                )}
                                                            >
                                                                <MoreHorizontal className="h-3.5 w-3.5 text-slate-400" />
                                                            </Button>
                                                            
                                                            {actionMenuId === sale.id && (
                                                                <div className="absolute right-0 top-full mt-2 w-48 bg-white border border-brand-rocha-border rounded-xl shadow-2xl z-30 overflow-hidden animate-in fade-in zoom-in-95">
                                                                    <div className="p-1.5 space-y-0.5">
                                                                        {canEditOrCancel && (
                                                                            <button 
                                                                                onClick={() => {
                                                                                    setActionMenuId(null);
                                                                                    navigate(`/vendas-rapidas/${sale.id}/editar`);
                                                                                }}
                                                                                className="w-full h-10 flex items-center px-3 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 hover:text-slate-900 rounded-lg transition-colors"
                                                                            >
                                                                                <Edit className="h-3.5 w-3.5 mr-3 text-slate-400" /> Editar Detalhes
                                                                            </button>
                                                                        )}

                                                                        {canEditOrCancel && sale.status !== 'cancelado' && (
                                                                            <button 
                                                                                onClick={() => {
                                                                                    setActionMenuId(null);
                                                                                    handleCancelSale(sale.id);
                                                                                }}
                                                                                className="w-full h-10 flex items-center px-3 text-[10px] font-black uppercase tracking-widest text-rose-500 hover:bg-rose-50 hover:text-rose-600 rounded-lg transition-colors"
                                                                            >
                                                                                <XCircle className="h-3.5 w-3.5 mr-3 text-rose-400" /> Cancelar Pedido
                                                                            </button>
                                                                        )}

                                                                        <div className="h-px bg-slate-100 my-1 mx-2" />
                                                                        <div className="px-3 py-1.5 text-[8px] font-black text-slate-400 uppercase tracking-widest">Avançar Produção</div>
                                                                        
                                                                        {(['pago', 'em_corte', 'em_acabamento', 'pronto_retirada', 'saiu_entrega', 'entregue'] as QuickSale['status'][]).filter(s => s !== sale.status).map(st => (
                                                                             <button 
                                                                                key={st}
                                                                                onClick={() => {
                                                                                    handleUpdateStatus(sale.id, st);
                                                                                    setActionMenuId(null);
                                                                                }}
                                                                                className="w-full h-9 flex items-center px-3 text-[9px] font-black uppercase text-slate-500 hover:bg-slate-50 hover:text-slate-900 rounded-lg transition-colors"
                                                                            >
                                                                                <ArrowRightLeft className="h-3 w-3 mr-3 opacity-50" /> {STATUS_LABELS[st]}
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

            {/* Click backdrop to dismiss menu */}
            {actionMenuId && (
                <div 
                    className="fixed inset-0 z-20 bg-transparent" 
                    onClick={() => setActionMenuId(null)}
                />
            )}
        </div>
    );
};
