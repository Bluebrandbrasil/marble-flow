import React, { useState, useEffect } from 'react';
import { collection, query, where, orderBy, limit, startAfter, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { Card, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Order } from '../../types';
import { formatVisualDate, safeParseISO } from '../../lib/dateUtils';
import { Search, Filter, Clock, ChevronRight, FileText, CheckCircle, Package } from 'lucide-react';
import { transitionProductionStage } from '../../services/productionService';
import { useSettings } from '../../hooks/useSettings';
import { normalizeStr } from '../../lib/searchUtils';

export const ProductionHistoryView = () => {
    const { profile, user } = useAuth();
    const { settings } = useSettings();
    const [historyOrders, setHistoryOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(false);
    const [lastDoc, setLastDoc] = useState<any>(null);
    const [hasMore, setHasMore] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [searchMode, setSearchMode] = useState<'default' | 'name' | 'order' | 'contract'>('default');
    const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
    const [fetchError, setFetchError] = useState<string | null>(null);

    const fetchHistory = async (isNextPage = false) => {
        if (!profile?.companyId) return;
        setLoading(true);
        setFetchError(null);
        try {
            let baseQuery = collection(db, 'pedidos');
            let q: any;

            const normalizedTerm = normalizeStr(searchTerm);

            if (!searchTerm) {
                // Default paginated mode
                q = query(
                    baseQuery,
                    where('companyId', '==', profile.companyId),
                    where('status', '==', 'finalizado'),
                    orderBy('finalizedAt', 'desc'),
                    limit(20)
                );
            } else if (searchMode === 'order') {
                q = query(
                    baseQuery,
                    where('companyId', '==', profile.companyId),
                    where('orderNumberNormalized', '==', normalizedTerm),
                    limit(20)
                );
            } else if (searchMode === 'contract') {
                q = query(
                    baseQuery,
                    where('companyId', '==', profile.companyId),
                    where('contractNumberNormalized', '==', normalizedTerm),
                    limit(20)
                );
            } else {
                // searchMode === 'name' or anything else
                q = query(
                    baseQuery,
                    where('companyId', '==', profile.companyId),
                    where('searchTerms', 'array-contains', normalizedTerm),
                    orderBy('finalizedAt', 'desc'),
                    limit(20)
                );
            }

            if (isNextPage && lastDoc) {
                q = query(q, startAfter(lastDoc));
            }

            const snap = await getDocs(q);
            if (snap.empty) {
                setHasMore(false);
                if (!isNextPage) setHistoryOrders([]);
            } else {
                setLastDoc(snap.docs[snap.docs.length - 1]);
                const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as Order));
                // Only store valid closed orders or searched ones
                setHistoryOrders(prev => isNextPage ? [...prev, ...data] : data);
                if (snap.docs.length < 20) setHasMore(false);
            }
        } catch (error) {
            console.error('Error fetching history:', error);
            setFetchError("Não foi possível consultar o histórico. Pode ser necessário criar um índice no Firestore.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const debounce = setTimeout(() => {
            fetchHistory(false);
        }, 500);
        return () => clearTimeout(debounce);
    }, [profile?.companyId, searchTerm, searchMode]);

    const handleReopen = async (order: Order) => {
        const reason = window.prompt("Motivo da reabertura:");
        if (!reason) return;
        try {
            await transitionProductionStage({
                orderId: order.id,
                companyId: profile?.companyId || '',
                fromStage: 'finalizado',
                toStage: 'em_producao',
                userId: user?.uid || '',
                userName: profile?.name || '',
                reason
            });
            alert("O.S. reaberta com sucesso.");
            setHistoryOrders(prev => prev.filter(o => o.id !== order.id));
            setSelectedOrder(null);
        } catch (error: any) {
            alert(error.message || "Erro ao reabrir.");
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <h1 className="text-2xl font-bold text-slate-800">Histórico de Produção</h1>
                <div className="flex flex-wrap items-center gap-2">
                    <select 
                        value={searchMode}
                        onChange={(e) => setSearchMode(e.target.value as any)}
                        className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
                    >
                        <option value="default">Recentes</option>
                        <option value="name">Cliente / Palavra</option>
                        <option value="order">Nº O.S.</option>
                        <option value="contract">Nº Contrato</option>
                    </select>
                    
                    <div className="relative flex-1 min-w-[200px]">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Buscar no histórico..."
                            className="pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm w-full"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            {fetchError && (
                <div className="p-4 bg-red-50 text-red-600 rounded-lg text-sm font-medium">
                    {fetchError}
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {historyOrders.map(order => {
                    const snap = order.finalProductionSnapshot || {};
                    const isReopened = order.completionCycles && order.completionCycles.length > 0;
                    return (
                        <Card key={order.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setSelectedOrder(order)}>
                            <CardContent className="p-4">
                                <div className="flex justify-between items-start mb-2">
                                    <div className="font-medium text-slate-800">
                                        {order.protocolNumber || order.orderNumber || 'S/N'}
                                    </div>
                                    <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full font-medium flex items-center gap-1">
                                        <CheckCircle className="w-3 h-3" />
                                        Finalizado
                                    </span>
                                </div>
                                <div className="text-sm text-slate-600 mb-2">
                                    <div className="font-semibold text-slate-800">{snap.clientName || order.customerName}</div>
                                    <div>{snap.material || order.material}</div>
                                </div>
                                <div className="text-xs text-slate-500 space-y-1">
                                    <div className="flex items-center gap-1">
                                        <Package className="w-3 h-3" /> Prod: {formatVisualDate(order.productionCompletedAt) || 'Indisponível'}
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <Clock className="w-3 h-3" /> Fim: {formatVisualDate(order.finalizedAt) || 'Indisponível'}
                                    </div>
                                </div>
                                {isReopened && (
                                    <div className="mt-2 text-xs text-amber-600 font-medium">
                                        ⚠️ Reaberta {order.completionCycles?.length} vez(es)
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            {hasMore && !loading && (
                <div className="flex justify-center mt-6">
                    <Button variant="outline" onClick={() => fetchHistory(true)}>Carregar mais</Button>
                </div>
            )}
            
            {loading && <div className="text-center text-slate-500 py-4">Carregando histórico...</div>}

            {selectedOrder && (
                <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
                    <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                        <CardContent className="p-6">
                            <div className="flex justify-between items-center mb-6 border-b pb-4">
                                <h2 className="text-xl font-bold">Detalhes do Histórico - {selectedOrder.protocolNumber || selectedOrder.orderNumber}</h2>
                                <Button variant="ghost" size="sm" onClick={() => setSelectedOrder(null)}>Fechar</Button>
                            </div>
                            
                            <div className="space-y-6">
                                <div>
                                    <h3 className="font-medium text-slate-800 mb-2 border-b pb-1">Snapshot Operacional Resumido</h3>
                                    <div className="bg-slate-50 p-3 rounded-lg text-xs overflow-x-auto text-slate-700">
                                        <p>O.S.: {selectedOrder.orderNumber || selectedOrder.protocolNumber}</p>
                                        <p>Cliente: {selectedOrder.customerName || selectedOrder.finalProductionSnapshot?.clientName}</p>
                                        <p>Contrato: {selectedOrder.contractNumber || selectedOrder.contractSnapshot?.contractNumber}</p>
                                        <p>Material: {selectedOrder.material || selectedOrder.finalProductionSnapshot?.material}</p>
                                        <p>Peças: {selectedOrder.pieces}</p>
                                        <p>Finalizado em: {formatVisualDate(selectedOrder.finalizedAt)}</p>
                                    </div>
                                    <p className="text-[10px] text-slate-400 mt-1">* Nota: Valores financeiros não estão disponíveis neste painel operacional.</p>
                                </div>
                                
                                {['admin', 'company_admin', 'superadmin'].includes(profile?.role || '') && (
                                    <div className="pt-4 border-t border-slate-200">
                                        <Button variant="outline" className="w-full border-amber-200 text-amber-700 hover:bg-amber-50" onClick={() => handleReopen(selectedOrder)}>
                                            ⚠️ Reabrir O.S.
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    );
};
