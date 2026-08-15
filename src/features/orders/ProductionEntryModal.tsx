import { safeArray } from '../../lib/dataDiagnostics';
import React, { useState, useMemo } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { SearchableSelect } from '../../components/ui/SearchableSelect';
import { useStaffCatalog } from '../../hooks/useStaffCatalog';
import type { Order } from '../../types';
import { Clock, Hammer, Truck, Info } from 'lucide-react';
import { cn } from '../../lib/utils';

interface ProductionEntryModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (data: { 
        sawyerId: string; 
        sawyerName: string;
        cutterId: string; 
        cutterName: string; 
        finisherId: string;
        finisherName: string;
        deliveryDate: string; // compatibility
        installationDate: string;
        productionDeadline: string;
        estimatedTime: number; // in minutes
    }) => void;
    order: Order | null;
}

// Helper local para manipulação de datas no modal
const adjustDeadline = (dateStr: string): string => {
    if (!dateStr) return '';
    try {
        const date = new Date(dateStr + 'T12:00:00');
        const deadline = new Date(date);
        deadline.setDate(date.getDate() - 2);
        return deadline.toISOString().split('T')[0];
    } catch (e) {
        return '';
    }
};

export const calculateSerradorTime = (order: Order): number => {
    if (!order.items || order.items.length === 0) return 60; // Default 1 hour

    let totalMinutes = 0;

    order.items.forEach((item: any) => {
        let pieceMinutes = 20; // Base: 20 min per piece

        // Adjustment by piece type (if known)
        const type = (item.pieceType || '').toLowerCase();
        if (type.includes('tampo')) pieceMinutes += 15;
        if (type.includes('frontao')) pieceMinutes += 5;
        if (type.includes('saia')) pieceMinutes += 10;
        if (type.includes('lateral')) pieceMinutes += 10;

        // Adjustment by size (complexity)
        const area = item.area || 0;
        if (area > 0.5) pieceMinutes += 10;
        if (area > 1.0) pieceMinutes += 20;

        // Adjustment by quantity
        totalMinutes += pieceMinutes * (item.quantity || 1);
    });

    // Global adjustments based on order properties
    if (order.sinkName) totalMinutes += 20; // Time for sink cutout
    
    // Check for cooktop in observations or items
    const hasCooktop = order.observations?.toLowerCase().includes('cooktop') || 
                      safeArray(order.items).some((i: any) => i.name.toLowerCase().includes('cooktop'));
    if (hasCooktop) totalMinutes += 25;

    return totalMinutes;
};

export const ProductionEntryModal: React.FC<ProductionEntryModalProps> = ({ isOpen, onClose, onConfirm, order }) => {
    const { staff } = useStaffCatalog();
    const [selectedCutterId, setSelectedCutterId] = useState('');
    const [selectedFinisherId, setSelectedFinisherId] = useState('');
    const [installationDate, setInstallationDate] = useState('');
    const [productionDeadline, setProductionDeadline] = useState('');

    const serradores = useMemo(() => safeArray(staff).filter(s => s.role === 'serrador' && (s.active === undefined || s.active === true)), [staff]);
    const acabadores = useMemo(() => safeArray(staff).filter(s => s.role === 'acabador' && (s.active === undefined || s.active === true)), [staff]);

    const estimatedTime = useMemo(() => {
        if (!order) return 0;
        return calculateSerradorTime(order);
    }, [order]);

    const formatTime = (minutes: number) => {
        const h = Math.floor(minutes / 60);
        const m = minutes % 60;
        if (h === 0) return `${m} minutos`;
        return `${h}h ${m > 0 ? `${m}min` : ''}`;
    };

    const handleInstallationDateChange = (val: string) => {
        setInstallationDate(val);
        if (val && !productionDeadline) {
            setProductionDeadline(adjustDeadline(val));
        }
    };

    const handleConfirm = () => {
        const cutter = staff.find(s => s.id === selectedCutterId);
        const finisher = staff.find(s => s.id === selectedFinisherId);

        if (!cutter || !finisher || !installationDate || !productionDeadline) {
            alert("Por favor, preencha todos os campos obrigatórios.");
            return;
        }

        onConfirm({
            sawyerId: cutter.id,
            sawyerName: cutter.name,
            cutterId: cutter.id,
            cutterName: cutter.name,
            finisherId: finisher.id,
            finisherName: finisher.name,
            deliveryDate: installationDate,
            installationDate,
            productionDeadline,
            estimatedTime
        });
    };

    if (!order) return null;

    const isFormValid = !!selectedCutterId && !!selectedFinisherId && !!installationDate && !!productionDeadline;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Entrada em Produção" className="max-w-lg">
            <div className="space-y-6">
                <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800/50 p-4 rounded-xl flex gap-3">
                    <Info className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
                    <div>
                        <p className="text-sm font-bold text-blue-900 dark:text-blue-100 uppercase tracking-tight">O.S. #{order?.protocolNumber || '???'}</p>
                        <p className="text-xs text-blue-700 dark:text-blue-400 font-medium mt-0.5">Defina os prazos e responsáveis para iniciar a fabricação.</p>
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                                <Truck className="h-3.5 w-3.5" /> Instalação
                            </label>
                            <Input 
                                type="date"
                                value={installationDate}
                                onChange={(e) => handleInstallationDateChange(e.target.value)}
                                className="w-full h-12 px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-bold focus:ring-2 focus:ring-brand-rocha-primary transition-all outline-none cursor-pointer"
                                onClick={(e) => (e.currentTarget as any).showPicker?.()}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                                <Hammer className="h-3.5 w-3.5" /> Prazo Fábrica
                            </label>
                            <Input 
                                type="date"
                                value={productionDeadline}
                                onChange={(e) => setProductionDeadline(e.target.value)}
                                className="w-full h-12 px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-bold focus:ring-2 focus:ring-brand-rocha-primary transition-all outline-none cursor-pointer"
                                onClick={(e) => (e.currentTarget as any).showPicker?.()}
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                            <Hammer className="h-3.5 w-3.5" /> Serrador Responsável
                        </label>
                        <SearchableSelect 
                            value={selectedCutterId}
                            options={safeArray(serradores).map(s => ({ value: s.id, label: s.name, description: 'Equipe de Produção (Serra)' }))}
                            onChange={(val) => setSelectedCutterId(val)}
                            placeholder="Selecione o serrador..."
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                            <Hammer className="h-3.5 w-3.5" /> Acabador Responsável
                        </label>
                        <SearchableSelect 
                            value={selectedFinisherId}
                            options={safeArray(acabadores).map(s => ({ value: s.id, label: s.name, description: 'Equipe de Produção (Acabamento)' }))}
                            onChange={(val) => setSelectedFinisherId(val)}
                            placeholder="Selecione o acabador..."
                        />
                    </div>
                </div>

                <div className="bg-slate-50 dark:bg-slate-800/50 p-5 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 space-y-4">
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400 font-bold uppercase text-[10px] tracking-widest">
                            <Clock className="h-4 w-4" /> Tempo Total Estimado
                        </div>
                        <span className="text-xl font-black text-slate-900 dark:text-white tracking-tighter">
                            {formatTime(estimatedTime)}
                        </span>
                    </div>

                    <div className="pt-3 border-t border-slate-200 dark:border-slate-700">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Composição da Estimativa</p>
                        <div className="grid grid-cols-2 gap-y-2 text-xs">
                            <div className="text-slate-500">Total de Peças:</div>
                            <div className="text-right font-black text-slate-900 dark:text-slate-100">{safeArray(order.items).reduce((acc, i) => acc + (i.quantity || 1), 0)} un</div>
                            
                            <div className="text-slate-500">Área Marmoraria:</div>
                            <div className="text-right font-black text-slate-900 dark:text-slate-100">{safeArray(order.items).reduce((acc, i: any) => acc + (i.area || 0), 0).toFixed(2)} m²</div>
                        </div>
                    </div>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t dark:border-white/5">
                    <Button variant="ghost" onClick={onClose} className="font-bold uppercase text-xs tracking-widest h-12 px-6">
                        Cancelar
                    </Button>
                    <Button 
                        onClick={handleConfirm}
                        disabled={!isFormValid}
                        className={cn(
                            "h-12 px-8 font-black uppercase text-xs tracking-widest rounded-xl transition-all",
                            isFormValid 
                                ? "bg-slate-900 text-white shadow-xl shadow-slate-900/20" 
                                : "bg-slate-100 text-slate-400 dark:bg-slate-800"
                        )}
                    >
                        Confirmar Entrada em Produção
                    </Button>
                </div>
            </div>
        </Modal>
    );
};
