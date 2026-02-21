import React, { useState } from 'react';
import type { Order, Status } from '../../types';
import type { CompanySettings } from '../../hooks/useSettings';
import { generateBatchProductionSheet } from '../../lib/pdfGenerator';
import { Card, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Printer } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';

interface OrdersViewProps {
    orders: Order[];
    settings: CompanySettings;
    globalSearchText?: string;
}

export const OrdersView: React.FC<OrdersViewProps> = ({ orders, settings, globalSearchText = '' }) => {
    const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());

    const filteredOrders = React.useMemo(() => {
        if (!globalSearchText.trim()) return orders;
        const term = globalSearchText.toLowerCase();
        return orders.filter(order =>
            order.customerName.toLowerCase().includes(term) ||
            order.protocolNumber.toLowerCase().includes(term) ||
            order.address.toLowerCase().includes(term) ||
            (order.phone && order.phone.includes(term))
        );
    }, [orders, globalSearchText]);

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
        if (selectedOrderIds.size === filteredOrders.length) {
            setSelectedOrderIds(new Set());
        } else {
            setSelectedOrderIds(new Set(filteredOrders.map(o => o.id)));
        }
    };

    const [copiesPerOrder, setCopiesPerOrder] = useState(1);

    const handleBatchPrint = () => {
        const selectedOrders = orders.filter(o => selectedOrderIds.has(o.id));
        const ordersToPrint: Order[] = [];

        selectedOrders.forEach(order => {
            for (let i = 0; i < copiesPerOrder; i++) {
                ordersToPrint.push(order);
            }
        });

        generateBatchProductionSheet(ordersToPrint, settings);
    };

    const getStatusBadge = (status: Status) => {
        switch (status) {
            case 'production_queue': return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">Fila</Badge>;
            case 'ready_for_conference': return <Badge variant="secondary" className="bg-blue-100 text-blue-800">Conferência</Badge>;
            case 'installation': return <Badge variant="secondary" className="bg-purple-100 text-purple-800">Instalação</Badge>;
            case 'finished': return <Badge variant="secondary" className="bg-green-100 text-green-800">Finalizado</Badge>;
            default: return <Badge variant="outline">{status}</Badge>;
        }
    };

    return (
        <div className="space-y-6 h-full flex flex-col">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
                    Todas as Ordens
                </h2>
                <div className="flex items-center gap-2">
                    {selectedOrderIds.size > 0 && (
                        <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-4">
                            <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 p-1 px-2 rounded-md">
                                <span className="text-xs font-medium text-slate-500">Cópias/Ordem:</span>
                                <input
                                    type="number"
                                    min="1"
                                    max="50"
                                    className="w-12 h-8 px-1 text-center rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                                    value={copiesPerOrder}
                                    onChange={(e) => setCopiesPerOrder(Math.max(1, parseInt(e.target.value) || 1))}
                                />
                            </div>
                            <Button onClick={handleBatchPrint} className="flex gap-2">
                                <Printer className="h-4 w-4" />
                                Imprimir Selecionados ({selectedOrderIds.size})
                            </Button>
                        </div>
                    )}
                </div>
            </div>

            <Card className="flex-1 overflow-hidden flex flex-col">
                <CardContent className="p-0 flex-1 overflow-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 dark:bg-slate-900 text-slate-500 font-medium sticky top-0 z-10">
                            <tr>
                                <th className="px-4 py-3 w-[50px]">
                                    <input
                                        type="checkbox"
                                        className="rounded border-slate-300"
                                        checked={filteredOrders.length > 0 && selectedOrderIds.size === filteredOrders.length}
                                        onChange={toggleAll}
                                    />
                                </th>
                                <th className="px-4 py-3">O.S.</th>
                                <th className="px-4 py-3">Cliente</th>
                                <th className="px-4 py-3">Material</th>
                                <th className="px-4 py-3">Status</th>
                                <th className="px-4 py-3">Data Instalação</th>
                                <th className="px-4 py-3 text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y dark:divide-slate-800">
                            {filteredOrders.map((order) => (
                                <tr key={order.id} className={`hover:bg-slate-50 dark:hover:bg-slate-900/50 ${selectedOrderIds.has(order.id) ? 'bg-slate-50 dark:bg-slate-900/80' : ''}`}>
                                    <td className="px-4 py-3">
                                        <input
                                            type="checkbox"
                                            className="rounded border-slate-300"
                                            checked={selectedOrderIds.has(order.id)}
                                            onChange={() => toggleOrder(order.id)}
                                        />
                                    </td>
                                    <td className="px-4 py-3 font-medium">{order.protocolNumber}</td>
                                    <td className="px-4 py-3">
                                        <div className="font-medium">{order.customerName}</div>
                                        <div className="text-xs text-slate-500">{order.phone}</div>
                                    </td>
                                    <td className="px-4 py-3">{order.material}</td>
                                    <td className="px-4 py-3">
                                        {getStatusBadge(order.status)}
                                    </td>
                                    <td className="px-4 py-3">
                                        {new Date(order.deadline).toLocaleDateString()}
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => generateBatchProductionSheet([order], settings)}
                                            title="Imprimir Ficha Individual"
                                        >
                                            <Printer className="h-4 w-4 text-slate-400" />
                                        </Button>
                                    </td>
                                </tr>
                            ))}
                            {filteredOrders.length === 0 && (
                                <tr>
                                    <td colSpan={7} className="px-4 py-12 text-center text-slate-500">
                                        Nenhuma ordem encontrada.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </CardContent>
            </Card>
        </div>
    );
};
