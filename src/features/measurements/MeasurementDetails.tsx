import React from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { Measurement } from '../../types';
import { Calendar, MapPin, Phone, FileText, CheckCircle2, CopyPlus, Trash2, XCircle, ChevronLeft, MessageCircle } from 'lucide-react';
import { Button } from '../../components/ui/Button';

interface MeasurementDetailsProps {
    measurement: Measurement;
    onClose: () => void;
    onConvertToOrder: (measurement: Measurement) => void;
    onDecline: (measurement: Measurement, reason: string) => void;
    onDelete: () => void;
}

export const MeasurementDetails: React.FC<MeasurementDetailsProps> = ({ measurement, onClose, onConvertToOrder, onDecline, onDelete }) => {
    const [isDeclining, setIsDeclining] = React.useState(false);
    const declineReasons = ['Preço', 'Prazo', 'Concorrente', 'Cliente Desistiu', 'Fora de Área', 'Outros'];
    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between border-b pb-4 dark:border-slate-800">
                <div>
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white">{measurement.customerName}</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                        Criado em {format(new Date(measurement.createdAt), "dd 'de' MMMM 'às' HH:mm", { locale: ptBR })}
                    </p>
                </div>

                {measurement.status === 'completed' && (
                    <div className="flex items-center gap-1.5 text-sm font-medium text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full dark:bg-emerald-900/30 dark:text-emerald-400">
                        <CheckCircle2 className="w-4 h-4" />
                        Convertido
                    </div>
                )}
                {measurement.status === 'declined' && (
                    <div className="flex items-center gap-1.5 text-sm font-medium text-amber-600 bg-amber-50 px-3 py-1 rounded-full dark:bg-amber-900/30 dark:text-amber-400">
                        <XCircle className="w-4 h-4" />
                        Declinado
                    </div>
                )}
            </div>

            {isDeclining ? (
                <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                    <div>
                        <h3 className="text-base font-medium text-slate-900 dark:text-white mb-1">Motivo do Declínio</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">Selecione por que este orçamento não foi fechado.</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        {declineReasons.map(reason => (
                            <Button
                                key={reason}
                                variant="outline"
                                className="justify-start font-normal text-slate-600 dark:text-slate-300 hover:bg-amber-50 hover:text-amber-700 hover:border-amber-200 dark:hover:bg-amber-900/20 dark:hover:text-amber-400 dark:hover:border-amber-800"
                                onClick={() => onDecline(measurement, reason)}
                            >
                                {reason}
                            </Button>
                        ))}
                    </div>
                    <div className="pt-2 flex justify-start">
                        <Button variant="ghost" onClick={() => setIsDeclining(false)} className="text-slate-500">
                            <ChevronLeft className="w-4 h-4 mr-1" />
                            Voltar
                        </Button>
                    </div>
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                        <div className="space-y-4">
                            <div className="flex items-start gap-3">
                                <Phone className="w-5 h-5 text-slate-400 mt-0.5" />
                                <div>
                                    <p className="font-medium text-slate-900 dark:text-white">Telefone</p>
                                    <div className="flex items-center gap-2">
                                        <p className="text-slate-600 dark:text-slate-300">{measurement.phone || 'Não informado'}</p>
                                        {measurement.phone && measurement.status === 'scheduled' && (
                                            <button
                                                onClick={() => {
                                                    const message = `Olá ${measurement.customerName.split(' ')[0]}, tudo bem? Gostaríamos de fazer um acompanhamento sobre o seu projeto${measurement.material ? ` de ${measurement.material}` : ''}. Como podemos seguir?`;
                                                    const phone = measurement.phone.replace(/\D/g, '');
                                                    window.open(`https://wa.me/55${phone}?text=${encodeURIComponent(message)}`, '_blank');
                                                }}
                                                className="p-1 min-h-0 h-auto text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded dark:text-emerald-400 dark:bg-emerald-900/30 dark:hover:bg-emerald-900/50 transition-colors"
                                                title="Revisar no WhatsApp"
                                            >
                                                <MessageCircle className="w-3.5 h-3.5" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-start gap-3">
                                <MapPin className="w-5 h-5 text-slate-400 mt-0.5" />
                                <div>
                                    <p className="font-medium text-slate-900 dark:text-white">Local da Obra</p>
                                    <p className="text-slate-600 dark:text-slate-300">{measurement.address}</p>
                                </div>
                            </div>

                            <div className="flex items-start gap-3">
                                <Calendar className="w-5 h-5 text-slate-400 mt-0.5" />
                                <div>
                                    <p className="font-medium text-slate-900 dark:text-white">Data Agendada</p>
                                    <p className="text-slate-600 dark:text-slate-300">
                                        {format(new Date(measurement.scheduledDate), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-lg border border-slate-100 dark:border-slate-800">
                            <div className="flex items-center gap-2 mb-2 font-medium text-slate-900 dark:text-white">
                                <FileText className="w-4 h-4 text-slate-400" />
                                Observações
                            </div>
                            <p className="text-slate-600 dark:text-slate-300 whitespace-pre-wrap">
                                {measurement.observations || 'Nenhuma observação registrada.'}
                            </p>
                        </div>
                    </div>

                    <div className="flex justify-between pt-4 border-t dark:border-slate-800">
                        <Button variant="ghost" className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20" onClick={onDelete}>
                            <Trash2 className="w-4 h-4 mr-2" />
                            Excluir
                        </Button>
                        <div className="flex gap-3">
                            <Button variant="outline" onClick={onClose}>
                                Fechar
                            </Button>
                            {measurement.status === 'scheduled' && (
                                <>
                                    <Button
                                        variant="outline"
                                        className="text-amber-600 border-amber-200 hover:bg-amber-50 hover:border-amber-300 dark:border-amber-900/50 dark:text-amber-500 dark:hover:bg-amber-900/20"
                                        onClick={() => setIsDeclining(true)}
                                    >
                                        <XCircle className="w-4 h-4 mr-2" />
                                        Declinar
                                    </Button>
                                    <Button
                                        className="bg-teal-600 hover:bg-teal-700 text-white"
                                        onClick={() => onConvertToOrder(measurement)}
                                    >
                                        <CopyPlus className="w-4 h-4 mr-2" />
                                        Converter
                                    </Button>
                                </>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};
