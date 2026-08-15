import React from 'react';
import type { Order } from '../../types';
import { Square, CheckSquare, Calendar, MapPin, Phone, User, FileText, Printer, CheckCircle } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { generateBatchProductionSheet, generateProductionSheet } from '../../lib/pdfGenerator';
import { useSettings } from '../../hooks/useSettings';
import { cn } from '../../lib/utils';

interface OrderDetailsProps {
    order: Order;
    onUpdateOrder?: (updatedOrder: Order) => void;
    onCompleteConference?: (order: Order) => void;
    onInternalReturnClick?: (order: Order) => void;
}

const CONFERENCE_ITEMS = [
    'Tamanho do Frontão e Saia conferidos (conforme O.S.)',
    'Tipo de Cuba e Acessórios conferidos',
    'Corte do Fogão/Cooktop realizado e conferido',
    'Cor do material e da massa plástica validados',
    'Limpeza da pedra realizada',
    'Etiquetas de identificação coladas em todas as peças',
    'Peças embaladas para transporte'
];

export const OrderDetails: React.FC<OrderDetailsProps> = ({ order, onUpdateOrder, onCompleteConference, onInternalReturnClick }) => {
    const { settings } = useSettings();
    const [copies, setCopies] = React.useState(1);

    // Checklist State
    const [checklist, setChecklist] = React.useState<Record<string, boolean>>(order.conferenceChecklist || {});
    const [isSubmitting, setIsSubmitting] = React.useState(false);

    const handleCheckToggle = (item: string) => {
        const newChecklist = { ...checklist, [item]: !checklist[item] };
        setChecklist(newChecklist);
        if (onUpdateOrder) {
            onUpdateOrder({ ...order, conferenceChecklist: newChecklist });
        }
    };

    const isChecklistComplete = CONFERENCE_ITEMS.every(item => checklist[item] === true);

    const handleCompleteClick = () => {
        if (!isChecklistComplete) {
            window.alert('⚠️ Atenção: Todos os itens do checklist devem ser conferidos antes do envio.');
            return;
        }
        setIsSubmitting(true);
        setTimeout(() => {
            if (onCompleteConference) {
                onCompleteConference(order);
            }
            setIsSubmitting(false);
        }, 800);
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-start border-b pb-4 dark:border-slate-800">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-xl font-bold">{order.customerName}</h3>
                        <Badge variant="outline">{order.protocolNumber}</Badge>
                    </div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{order.material}</p>
                </div>
                <div className="text-right print:hidden">
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        Valor Total
                    </p>
                    <p className="text-lg font-bold text-emerald-600 dark:text-emerald-500">
                        {order.totalValue !== undefined
                            ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(order.totalValue)
                            : 'Valor não informado'}
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-4">
                    <div className="space-y-3">
                        <div className="flex items-center gap-2 text-sm">
                            <User className="h-4 w-4 text-slate-400" />
                            <span>{order.customerName}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                            <Phone className="h-4 w-4 text-slate-400" />
                            <span>{order.phone}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                            <MapPin className="h-4 w-4 text-slate-400" />
                            <a
                                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.address)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:underline dark:text-blue-400"
                            >
                                {order.address}
                            </a>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                            <Calendar className="h-4 w-4 text-slate-400" />
                            <span>Instalação: {new Intl.DateTimeFormat('pt-BR').format(new Date(order.deadline))}</span>
                        </div>
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-lg">
                        <h4 className="font-semibold mb-3 flex items-center">
                            <FileText className="h-4 w-4 mr-2" />
                            Especificações Técnicas
                        </h4>
                        <ul className="space-y-2">
                            {order.items.map((item) => (
                                <li key={item.id} className="flex items-center gap-2 text-sm">
                                    {item.completed ? (
                                        <CheckSquare className="h-4 w-4 text-emerald-500" />
                                    ) : (
                                        <Square className="h-4 w-4 text-slate-300" />
                                    )}
                                    <span className={item.completed ? 'line-through text-slate-500' : ''}>
                                        {item.name}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {order.status === 'ready_for_conference' && (
                        <div className="bg-blue-50/50 dark:bg-blue-950/20 p-4 rounded-lg border border-blue-100 dark:border-blue-900/50">
                            <h4 className="font-semibold mb-3 flex items-center text-blue-800 dark:text-blue-300 text-sm">
                                <CheckSquare className="h-4 w-4 mr-2" />
                                Checklist de Conferência Obrigatório
                            </h4>
                            <ul className="space-y-2.5">
                                {CONFERENCE_ITEMS.map((item, idx) => {
                                    const isChecked = !!checklist[item];
                                    return (
                                        <li key={idx} className="flex items-start gap-2 text-sm">
                                            <button
                                                onClick={() => handleCheckToggle(item)}
                                                className={`mt-0.5 flex-shrink-0 h-4 w-4 rounded flex items-center justify-center border transition-colors ${isChecked
                                                    ? 'bg-blue-600 border-blue-600'
                                                    : 'border-slate-300 dark:border-slate-600 hover:border-blue-500'
                                                    }`}
                                            >
                                                {isChecked && <CheckSquare className="h-3 w-3 text-white absolute" />}
                                                {/* Hidden absolute check, trick to use CheckSquare icon nicely */}
                                                {!isChecked && <Square className="h-4 w-4 text-transparent absolute" />}
                                            </button>
                                            <span
                                                className={`cursor-pointer select-none leading-snug ${isChecked ? 'text-slate-500 line-through dark:text-slate-400' : 'text-slate-700 dark:text-slate-200'}`}
                                                onClick={() => handleCheckToggle(item)}
                                            >
                                                {item}
                                            </span>
                                        </li>
                                    );
                                })}
                            </ul>

                            <div className="mt-6 space-y-3 print:hidden">
                                <Button
                                    className={cn(
                                        "w-full py-6 font-bold text-base transition-all duration-300 relative overflow-hidden group/btn",
                                        !isChecklistComplete
                                            ? "opacity-50 !bg-slate-400 dark:!bg-slate-600 hover:!bg-slate-400 dark:hover:!bg-slate-600 border-none cursor-not-allowed"
                                            : "bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white shadow-lg shadow-emerald-500/30"
                                    )}
                                    disabled={!isChecklistComplete || isSubmitting}
                                    onClick={handleCompleteClick}
                                >
                                    {isSubmitting ? (
                                        <div className="flex items-center justify-center gap-2">
                                            <div className="h-6 w-6 bg-white text-emerald-600 rounded-full flex items-center justify-center animate-in zoom-in spin-in-180 duration-500 shadow-md">
                                                <CheckCircle className="h-4 w-4" />
                                            </div>
                                            <span className="animate-pulse">Confirmando Checklist e Expedição...</span>
                                        </div>
                                    ) : (
                                        <>
                                            <span className="relative z-10 flex items-center gap-2">
                                                <CheckSquare className="h-5 w-5" />
                                                Concluir e Enviar para Instalação
                                            </span>
                                            {isChecklistComplete && (
                                                <div className="absolute inset-0 h-full w-full bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-[100%] group-hover/btn:animate-[shimmer_1.5s_infinite]"></div>
                                            )}
                                        </>
                                    )}
                                </Button>
                                {onInternalReturnClick && (
                                    <Button
                                        variant="outline"
                                        className="w-full text-red-600 hover:text-red-700 hover:bg-red-50 dark:border-red-900/50 dark:hover:bg-red-950/30"
                                        onClick={() => onInternalReturnClick(order)}
                                    >
                                        Registrar Avaria/Retorno
                                    </Button>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="flex justify-between items-center pt-4 border-t dark:border-slate-800 print:hidden">
                <div className="flex items-center gap-2">
                    <label className="text-sm text-slate-500 font-medium">Cópias:</label>
                    <input
                        type="number"
                        min="1"
                        max="50"
                        className="w-16 h-9 px-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                        value={copies}
                        onChange={(e) => setCopies(Math.max(1, parseInt(e.target.value) || 1))}
                    />
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                    <Button variant="outline" className="flex-1 sm:flex-none" onClick={() => generateBatchProductionSheet(Array(copies).fill(order), settings)} title="Imprimir lote lado a lado">
                        Lote PDF
                    </Button>
                    <Button variant="outline" className="flex-1 sm:flex-none" onClick={() => generateProductionSheet(order, settings)} title="Ficha Técnica Completa">
                        Ficha PDF
                    </Button>
                    <Button className="flex-1 sm:flex-none" onClick={() => window.print()} title="Imprimir usando a janela do navegador">
                        <Printer className="w-4 h-4 mr-2" />
                        Imprimir Nativo
                    </Button>
                </div>
            </div>
        </div>
    );
};
