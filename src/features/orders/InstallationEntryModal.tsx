import { safeArray } from '../../lib/dataDiagnostics';
import React, { useState, useMemo } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { SearchableSelect } from '../../components/ui/SearchableSelect';
import { useStaffCatalog } from '../../hooks/useStaffCatalog';
import { isEligibleForInstallationAssignment, getEmployeeDisplayName } from '../../lib/staffUtils';
import type { Order } from '../../types';
import { Truck, Info } from 'lucide-react';
import { cn } from '../../lib/utils';

interface InstallationEntryModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (data: { 
        installerId: string; 
        installerName: string; 
    }) => void;
    order: Order | null;
}

export const InstallationEntryModal: React.FC<InstallationEntryModalProps> = ({ isOpen, onClose, onConfirm, order }) => {
    const { staff } = useStaffCatalog();
    const [selectedInstallerId, setSelectedInstallerId] = useState('');

    const installers = useMemo(() => 
        safeArray(staff)
            .filter(s => isEligibleForInstallationAssignment(s, order?.companyId))
            .sort((a, b) => getEmployeeDisplayName(a).localeCompare(getEmployeeDisplayName(b), 'pt-BR')), 
        [staff, order]
    );

    const handleConfirm = () => {
        const installer = staff.find(s => s.id === selectedInstallerId);

        if (!installer) {
            alert("Por favor, selecione o instalador responsável.");
            return;
        }

        if (!isEligibleForInstallationAssignment(installer, order.companyId)) {
            alert("Este funcionário não está habilitado ou não pertence à mesma empresa para realizar instalações.");
            return;
        }

        onConfirm({
            installerId: installer.id,
            installerName: getEmployeeDisplayName(installer)
        });
    };

    if (!order) return null;

    const isFormValid = !!selectedInstallerId;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Entrada em Instalação" className="max-w-lg">
            <div className="space-y-6">
                <div className="bg-indigo-50 dark:bg-indigo-900/10 border border-indigo-200 dark:border-indigo-800/50 p-4 rounded-xl flex gap-3">
                    <Info className="h-5 w-5 text-indigo-600 shrink-0 mt-0.5" />
                    <div>
                        <p className="text-sm font-bold text-indigo-900 dark:text-indigo-100 uppercase tracking-tight">O.S. #{order?.protocolNumber || '???'}</p>
                        <p className="text-xs text-indigo-700 dark:text-indigo-400 font-medium mt-0.5">Selecione o instalador responsável para prosseguir com a instalação.</p>
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-xs font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                            <Truck className="h-3.5 w-3.5" /> Instalador Responsável
                        </label>
                        {installers.length === 0 ? (
                            <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/50 p-3 rounded-lg text-xs font-medium text-amber-800 dark:text-amber-400">
                                Nenhum funcionário está habilitado para instalações. Verifique os cadastros da equipe de produção ou instaladores.
                            </div>
                        ) : (
                            <SearchableSelect 
                                value={selectedInstallerId}
                                options={installers.map(s => ({ 
                                    value: s.id, 
                                    label: getEmployeeDisplayName(s), 
                                    description: `Função: ${s.role || 'Não definida'}` 
                                }))}
                                onChange={(val) => setSelectedInstallerId(val)}
                                placeholder="Selecione o instalador..."
                                emptyMessage="Nenhum funcionário encontrado para esta pesquisa."
                            />
                        )}
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
                        Confirmar Entrada em Instalação
                    </Button>
                </div>
            </div>
        </Modal>
    );
};
