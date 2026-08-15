import { safeArray } from '../../lib/dataDiagnostics';
import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import type { Order, QuoteItemState } from '../../types';
import { useSinkCatalog } from '../../hooks/useSinkCatalog';
import { useMaterialCatalog } from '../../hooks/useMaterialCatalog';
import { useStaffCatalog } from '../../hooks/useStaffCatalog';
import { useAccessoryCatalog } from '../../hooks/useAccessoryCatalog';
import { useClients } from '../../hooks/useClients';
import { Layers, ShieldAlert } from 'lucide-react';
import { SearchableSelect } from '../../components/ui/SearchableSelect';
import { canEditOrderFields } from '../../lib/orderGovernance';
import { getClientDisplayInfo } from '../../lib/clientUtils';

// We extend Partial<Order> with the temporary UI fields passed from Measurement conversion
interface OrderFormData extends Omit<Partial<Order>, 'items'> {
    clientId?: string;
    quoteId?: string;
    measurementId?: string;
    startDate?: string;
    city?: string;
    region?: string;
    items?: QuoteItemState[] | any[];
}

interface OrderFormProps {
    onSubmit: (data: Omit<Order, 'id' | 'createdAt' | 'protocolNumber'>) => void;
    onCancel: () => void;
    initialData?: OrderFormData;
    onChange?: () => void;
}

export const OrderForm: React.FC<OrderFormProps> = ({ onSubmit, onCancel, initialData, onChange }) => {
    const { profile } = useAuth();
    const { sinks } = useSinkCatalog();
    const { materials } = useMaterialCatalog();
    const { staff } = useStaffCatalog();
    const { accessories } = useAccessoryCatalog();
    const { clients } = useClients();

    const [selectedClientId, setSelectedClientId] = React.useState<string>(() => {
        if (initialData?.clientId) return String(initialData.clientId);
        // Fallback for older measurements without clientId: find by name
        if (initialData?.customerName) {
            const match = safeArray(clients).find(c => String(c?.name || '').toLowerCase() === String(initialData.customerName).toLowerCase());
            return match ? match.id : '';
        }
        return '';
    });
    const inheritedItems = safeArray(initialData?.items);
    const defaultMaterial = inheritedItems.length === 1 ? String(inheritedItems[0]?.material || '') : String(initialData?.material || '');
    const [selectedMaterial, setSelectedMaterial] = React.useState(defaultMaterial);

    const [selectedSinkId, setSelectedSinkId] = React.useState<string>('');
    const [selectedSawyerId, setSelectedSawyerId] = React.useState<string>('');
    const [selectedAccessoryIds, setSelectedAccessoryIds] = React.useState<string[]>([]);
    const [editReason, setEditReason] = React.useState('');

    const isEdit = !!(initialData as any)?.id;
    const canEditSensitive = !isEdit || canEditOrderFields(initialData as any, profile as any);

    const selectedClient = safeArray(clients).find(c => c.id === selectedClientId);
    const selectedSink = safeArray(sinks).find(s => s.id === selectedSinkId);
    const selectedSawyer = safeArray(staff).find(s => s.id === selectedSawyerId);

    const toggleAccessory = (id: string) => {
        setSelectedAccessoryIds(prev =>
            prev.includes(id) ? safeArray(prev).filter(aId => aId !== id) : [...prev, id]
        );
    };

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);

        // Very basic validation and data gathering
        // In a real app, use react-hook-form + zod
        // Build actual Kanban Items
        let orderItems = [];
        if (safeArray(inheritedItems).length > 0) {
            orderItems = safeArray(inheritedItems).map((item: any) => ({
                id: String(item?.id || crypto.randomUUID()),
                name: `${String(item?.pieceType || 'Peça')} - ${String(item?.environment || 'Geral')}`,
                completed: false,
                unitPrice: Number(item?.unitPrice || item?.materialPrice || 0),
                quantity: Number(item?.quantity || 1),
                totalPrice: Number(item?.price || 0),
                unit: String((item as any)?.measureType || '') === 'area' ? 'm²' : 'ML',
                environment: String(item?.environment || ''),
                width: Number(item?.width || 0),
                length: Number(item?.length || 0),
                area: Number(item?.area || 0),
                finishings: String(item?.finishings || ''),
                material: String(item?.material || ''),
                pieceType: String((item as any)?.pieceType || '')
            }));
        } else {
            const submittedMaterial = formData.get('material') as string;
            orderItems = [{
                id: crypto.randomUUID(),
                name: submittedMaterial || 'Produção',
                completed: false
            }];
        }

        const data: Omit<Order, 'id' | 'createdAt' | 'protocolNumber'> = {
            clientId: selectedClientId,
            quoteId: initialData?.quoteId,
            customerName: selectedClient?.name || '',
            phone: selectedClient?.phone || '',
            address: selectedClient?.address || selectedClient?.street || '',
            document: selectedClient?.document || '',

            material: safeArray(inheritedItems).length > 0 ? String(inheritedItems[0]?.material || '') : String(formData.get('material') || ''),
            deadline: String(formData.get('deadline') || ''),
            splashback: String(formData.get('splashback') || ''),
            skirt: String(formData.get('skirt') || ''),
            observations: String(formData.get('observations') || ''),
            sinkId: selectedSinkId,
            sinkName: selectedSink?.name || '',
            sinkPhotoUrl: selectedSink?.photoUrl || '',
            sawyerId: selectedSawyerId,
            sawyerName: selectedSawyer?.name || '',
            accessories: safeArray(accessories).filter(a => safeArray(selectedAccessoryIds).includes(String(a?.id || ''))),
            status: 'production_queue' as const,
            priority: 'medium' as const, // default
            items: orderItems,
            totalAmount: Number(initialData?.totalAmount || 0),
            measurementId: initialData?.measurementId || '',
            userId: profile?.uid || '',
            companyId: profile?.companyId || '',
            editReason: editReason || undefined
        } as any;

        onSubmit(data);
    };

    const handleFieldChange = () => {
        if (onChange) onChange();
    };

    return (
        <form onSubmit={handleSubmit} onChange={handleFieldChange} className="space-y-4">

            <div className="space-y-3">
                <label className="text-base font-bold text-slate-900 dark:text-slate-100 uppercase tracking-tight">Cliente / Contratante</label>
                <SearchableSelect 
                    disabled={!!initialData?.clientId || !!initialData?.customerName}
                    value={selectedClientId}
                    options={safeArray(clients).map(c => {
                        const displayInfo = getClientDisplayInfo(c);
                        return {
                            value: String(c?.id || ''),
                            label: displayInfo.name,
                            description: displayInfo.formattedPhone,
                            subDescription: displayInfo.addressLabel,
                            searchValue: displayInfo.searchText
                        };
                    })}
                    onChange={(val) => setSelectedClientId(val)}
                    placeholder="Pesquisar cliente..."
                />
                {(initialData?.clientId || initialData?.customerName) && (
                    <p className="text-xs text-slate-500 mt-1">* Cliente vinculado automaticamente a partir da Medição Técnica.</p>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {inheritedItems.length > 1 ? (
                    <div className="space-y-4 md:col-span-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-xl">
                        <label className="text-sm font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                            <Layers className="w-4 h-4" /> Peças vinculadas à produção ({inheritedItems.length})
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                            {safeArray(inheritedItems).map((item: any, i: number) => (
                                <div key={i} className="flex flex-col text-sm bg-white dark:bg-slate-950 p-4 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm transition-all hover:border-blue-200">
                                    <span className="font-extrabold text-slate-900 dark:text-slate-100 text-base uppercase leading-tight">{item.quantity}x {item.pieceType}</span>
                                    <span className="text-slate-500 font-medium mt-1">{item.material} • <span className="text-blue-600 dark:text-blue-400 font-bold">{item.environment}</span></span>
                                    <span className="text-xs text-slate-400 mt-2 font-mono">{item.length}cm x {item.width}cm</span>
                                </div>
                            ))}
                        </div>
                        <input type="hidden" name="material" value="Produtos Diversos" />
                    </div>
                ) : (
                    <div className="space-y-3">
                        <label className="text-base font-bold text-slate-900 dark:text-slate-100 uppercase tracking-tight">Material da Obra</label>
                        <SearchableSelect 
                            disabled={!canEditSensitive}
                            value={selectedMaterial}
                            options={safeArray(materials).map(mat => ({
                                value: String(mat?.name || ''),
                                label: String(mat?.name || ''),
                                description: String(mat?.type || '')
                            }))}
                            onChange={(val) => setSelectedMaterial(val)}
                            placeholder="Pesquisar material..."
                        />
                        <input type="hidden" name="material" value={selectedMaterial} />
                    </div>
                )}

                <div className="space-y-3 relative">
                    <label className="text-base font-bold text-slate-900 dark:text-slate-100 uppercase tracking-tight">Data Prevista de Instalação</label>
                    <div className="relative">
                        <Input
                            disabled={!canEditSensitive}
                            name="deadline"
                            type="date"
                            required
                            defaultValue={initialData?.deadline || initialData?.startDate || ''}
                            className="bg-slate-50 dark:bg-black/20"
                        />
                    </div>
                </div>
            </div>

            <div className="space-y-3 bg-slate-50 dark:bg-slate-900/50 p-5 rounded-xl border border-slate-200 dark:border-slate-800">
                <label className="text-base font-bold text-slate-900 dark:text-slate-100 uppercase tracking-tight block mb-1">Modelo de Cuba Especificada</label>
                <div className="flex gap-4 items-center">
                    <SearchableSelect 
                        value={selectedSinkId}
                        options={safeArray(sinks).map(sink => ({
                            value: String(sink?.id || ''),
                            label: String(sink?.name || '')
                        }))}
                        onChange={(val) => setSelectedSinkId(val)}
                        placeholder="Pesquisar cuba..."
                    />
                    {selectedSink?.photoUrl && (
                        <div className="w-16 h-16 border rounded bg-white overflow-hidden flex-shrink-0">
                            <img src={selectedSink.photoUrl} alt="Preview" className="w-full h-full object-cover" />
                        </div>
                    )}
                </div>
            </div>

            <div className="space-y-3 bg-slate-50 dark:bg-slate-900/50 p-5 rounded-xl border border-slate-200 dark:border-slate-800">
                <label className="text-base font-bold text-slate-900 dark:text-slate-100 uppercase tracking-tight block mb-1">Equipe de Produção Responsável</label>
                <SearchableSelect 
                    value={selectedSawyerId}
                    options={safeArray(staff).filter(s => s?.role === 'producao' || s?.role === 'outro').map(member => ({
                        value: String(member?.id || ''),
                        label: String(member?.name || ''),
                        description: String(member?.role || '')
                    }))}
                    onChange={(val) => setSelectedSawyerId(val)}
                    placeholder="Selecione a equipe de produção..."
                />
            </div>

            {
                accessories.length > 0 && (
                    <div className="space-y-2 bg-slate-50 dark:bg-slate-900 p-3 rounded-md border border-slate-200 dark:border-slate-800">
                        <label className="text-sm font-medium block mb-2">Acessórios Extras</label>
                        <div className="flex flex-wrap gap-2">
                            {safeArray(accessories).map(acc => {
                                const accId = String(acc?.id || '');
                                const isSelected = safeArray(selectedAccessoryIds).includes(accId);
                                return (
                                    <button
                                        key={accId}
                                        type="button"
                                        onClick={() => toggleAccessory(accId)}
                                        className={`px-3 py-2 text-sm rounded-md border text-left transition-colors flex items-center gap-2 ${isSelected
                                            ? 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/30 dark:border-blue-800 dark:text-blue-300'
                                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 dark:bg-slate-950 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-900'
                                            } `}
                                    >
                                        <div className={`w-4 h-4 rounded-sm border flex items-center justify-center ${isSelected ? 'bg-blue-500 border-blue-500' : 'border-slate-300 dark:border-slate-600'} `}>
                                            {isSelected && <span className="w-2 h-2 bg-white rounded-sm" />}
                                        </div>
                                        <span>{String(acc?.name || '')}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )
            }

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <label className="text-sm font-medium">Frontão (cm)</label>
                    <Input name="splashback" placeholder="Ex: 10cm" />
                </div>
                <div className="space-y-2">
                    <label className="text-sm font-medium">Saia (cm)</label>
                    <Input name="skirt" placeholder="Ex: 4cm" />
                </div>
            </div>

            <div className="space-y-2">
                <label className="text-sm font-medium">Observações</label>
                <textarea
                    disabled={!canEditSensitive && !(profile?.role === 'company_admin' || profile?.role === 'admin' || profile?.role === 'financeiro' || profile?.role === 'superadmin')}
                    name="observations"
                    defaultValue={initialData?.observations || ''}
                    className="flex min-h-[80px] w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-950 dark:ring-offset-slate-950 dark:placeholder:text-slate-400 dark:focus-visible:ring-slate-300"
                    placeholder="Detalhes adicionais (cuba, acabamento, etc.)"
                />
            </div>

            {isEdit && !canEditOrderFields(initialData as any, { role: 'user' } as any) && (
                <div className="p-4 bg-amber-50 dark:bg-amber-500/10 border-2 border-amber-200 dark:border-amber-500/20 rounded-xl space-y-3">
                    <div className="flex items-center gap-2 text-amber-800 dark:text-amber-400">
                        <ShieldAlert className="w-5 h-5" />
                        <span className="text-sm font-black uppercase tracking-tight">Justificativa de Alteração Admin</span>
                    </div>
                    <p className="text-xs text-amber-700 dark:text-amber-500">Esta OS está em fase avançada ({initialData?.status}). Alterações manuais em campos sensíveis exigem uma justificativa para o log de auditoria.</p>
                    <Input
                        placeholder="Descreva o motivo desta alteração..."
                        value={editReason}
                        onChange={(e) => setEditReason(e.target.value)}
                        required={isEdit}
                        className="bg-white dark:bg-black/40 border-amber-200 dark:border-amber-900 focus:ring-amber-500"
                    />
                </div>
            )}

            <div className="flex justify-end gap-3 pt-4">
                <Button type="button" variant="outline" onClick={onCancel}>
                    Cancelar
                </Button>
                <Button type="submit">
                    Salvar Pedido
                </Button>
            </div>
        </form >
    );
};
