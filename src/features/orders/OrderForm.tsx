import React from 'react';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import type { Order } from '../../types';
import { useSinkCatalog } from '../../hooks/useSinkCatalog';
import { useMaterialCatalog } from '../../hooks/useMaterialCatalog';
import { useStaffCatalog } from '../../hooks/useStaffCatalog';
import { useAccessoryCatalog } from '../../hooks/useAccessoryCatalog';
import { cn } from '../../lib/utils';

// We extend Partial<Order> with the temporary UI fields passed from Measurement conversion
interface OrderFormData extends Partial<Order> {
    startDate?: string;
    city?: string;
    region?: string;
}

interface OrderFormProps {
    onSubmit: (data: Omit<Order, 'id' | 'createdAt' | 'protocolNumber'>) => void;
    onCancel: () => void;
    initialDeadline?: Date;
    initialData?: OrderFormData;
}

export const OrderForm: React.FC<OrderFormProps> = ({ onSubmit, onCancel, initialDeadline, initialData }) => {
    const { sinks } = useSinkCatalog();
    const { materials } = useMaterialCatalog();
    const { staff } = useStaffCatalog();
    const { accessories } = useAccessoryCatalog();

    const [selectedSinkId, setSelectedSinkId] = React.useState<string>('');
    const [selectedSawyerId, setSelectedSawyerId] = React.useState<string>('');
    const [selectedAccessoryIds, setSelectedAccessoryIds] = React.useState<string[]>([]);

    // Smart Paste States
    const [smartText, setSmartText] = React.useState('');
    const [parsedName, setParsedName] = React.useState(initialData?.customerName || '');
    const [parsedObs, setParsedObs] = React.useState(initialData?.observations || '');

    const selectedSink = sinks.find(s => s.id === selectedSinkId);
    const selectedSawyer = staff.find(s => s.id === selectedSawyerId);

    const toggleAccessory = (id: string) => {
        setSelectedAccessoryIds(prev =>
            prev.includes(id) ? prev.filter(aId => aId !== id) : [...prev, id]
        );
    };

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);

        // Very basic validation and data gathering
        // In a real app, use react-hook-form + zod
        const data = {
            customerName: formData.get('customerName') as string,
            phone: formData.get('phone') as string,
            address: formData.get('address') as string,
            material: formData.get('material') as string,
            deadline: formData.get('deadline') as string,
            splashback: formData.get('splashback') as string,
            skirt: formData.get('skirt') as string,
            observations: formData.get('observations') as string,
            sinkId: selectedSinkId,
            sinkName: selectedSink?.name,
            sinkPhotoUrl: selectedSink?.photoUrl,
            sinkType: selectedSink?.type,
            sawyerId: selectedSawyerId,
            sawyerName: selectedSawyer?.name,
            accessories: accessories.filter(a => selectedAccessoryIds.includes(a.id)),
            city: initialData?.city,
            region: initialData?.region,
            status: 'production_queue' as const,
            priority: 'medium' as const, // default
            items: [
                // Mock items creation
                { id: Date.now().toString() + '1', name: 'Pia de Cozinha', completed: false },
                { id: Date.now().toString() + '2', name: 'Frontão', completed: false },
            ]
        };

        onSubmit(data);
    };

    const handleSmartPaste = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const text = e.target.value;
        setSmartText(text);

        if (text.includes('📏 MEDIÇÃO TÉCNICA')) {
            // Extract Name
            const nameMatch = text.match(/Cliente:\s*([^\n]+)/i);
            if (nameMatch && nameMatch[1]) {
                setParsedName(nameMatch[1].trim());
            }

            // Extract Date (Format expected: DD/MM/YYYY)
            // Example "Data: 21/02/2026 às 10:00"
            // Since we use defaultValue, we don't strictly auto-lock dates here in this simpler version

            // Put the rest in observations to not lose data
            setParsedObs(text);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">

            <div className="space-y-2 bg-blue-50/50 dark:bg-blue-900/10 p-3 rounded-md border border-blue-100 dark:border-blue-800/50">
                <label className="text-xs font-semibold text-blue-700 dark:text-blue-400 flex items-center gap-1.5 mb-1.5 uppercase tracking-wider">
                    <span className="text-base">⚡</span> Colar do WhatsApp (Medição Técnica)
                </label>
                <textarea
                    value={smartText}
                    onChange={handleSmartPaste}
                    className="flex min-h-[60px] w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-950 dark:placeholder:text-slate-500"
                    placeholder="Cole aqui o resumo da medição..."
                />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <label className="text-sm font-medium">Nome do Cliente</label>
                    <Input name="customerName" required placeholder="Ex: João da Silva" defaultValue={parsedName} />
                </div>
                <div className="space-y-2">
                    <label className="text-sm font-medium">Telefone</label>
                    <Input name="phone" required placeholder="(00) 00000-0000" defaultValue={initialData?.phone || ''} />
                </div>
            </div>

            <div className="space-y-2">
                <label className="text-sm font-medium">Endereço</label>
                <Input name="address" required placeholder="Endereço completo" defaultValue={initialData?.address || ''} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <label className="text-sm font-medium">Material</label>
                    <select
                        name="material"
                        required
                        className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-950 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-50 dark:focus-visible:ring-slate-300"
                    >
                        <option value="">Selecione o material...</option>
                        {materials.map(mat => (
                            <option key={mat.id} value={mat.name}>{mat.name} ({mat.type})</option>
                        ))}
                    </select>
                </div>
                <div className="space-y-2 relative">
                    <label className="text-sm font-medium">Data de Instalação</label>
                    <div className="relative">
                        <Input
                            name="deadline"
                            type="date"
                            required
                            defaultValue={initialData?.startDate || ''} // Uses measurement scheduledDate
                            className="bg-slate-50 dark:bg-black/20"
                        />
                    </div>
                </div>
            </div>

            <div className="space-y-2 bg-slate-50 dark:bg-slate-900 p-3 rounded-md border border-slate-200 dark:border-slate-800">
                <label className="text-sm font-medium block mb-2">Modelo de Cuba</label>
                <div className="flex gap-4 items-center">
                    <select
                        className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-950 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-50 dark:focus-visible:ring-slate-300"
                        value={selectedSinkId}
                        onChange={(e) => setSelectedSinkId(e.target.value)}
                    >
                        <option value="">Selecione uma cuba...</option>
                        {sinks.map(sink => (
                            <option key={sink.id} value={sink.id}>{sink.name}</option>
                        ))}
                    </select>
                    {selectedSink?.photoUrl && (
                        <div className="w-16 h-16 border rounded bg-white overflow-hidden flex-shrink-0">
                            <img src={selectedSink.photoUrl} alt="Preview" className="w-full h-full object-cover" />
                        </div>
                    )}
                </div>
            </div>

            <div className="space-y-2 bg-slate-50 dark:bg-slate-900 p-3 rounded-md border border-slate-200 dark:border-slate-800">
                <label className="text-sm font-medium block mb-2">Equipe (Serrador)</label>
                <select
                    className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-950 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-50 dark:focus-visible:ring-slate-300"
                    value={selectedSawyerId}
                    onChange={(e) => setSelectedSawyerId(e.target.value)}
                >
                    <option value="">Nenhum serrador selecionado</option>
                    {staff.filter(s => s.role === 'Serrador' || s.role === 'Outro').map(member => (
                        <option key={member.id} value={member.id}>{member.name} ({member.role})</option>
                    ))}
                </select>
            </div>

            {
                accessories.length > 0 && (
                    <div className="space-y-2 bg-slate-50 dark:bg-slate-900 p-3 rounded-md border border-slate-200 dark:border-slate-800">
                        <label className="text-sm font-medium block mb-2">Acessórios Extras</label>
                        <div className="flex flex-wrap gap-2">
                            {accessories.map(acc => {
                                const isSelected = selectedAccessoryIds.includes(acc.id);
                                return (
                                    <button
                                        key={acc.id}
                                        type="button"
                                        onClick={() => toggleAccessory(acc.id)}
                                        className={`px-3 py-2 text-sm rounded-md border text-left transition-colors flex items-center gap-2 ${isSelected
                                            ? 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/30 dark:border-blue-800 dark:text-blue-300'
                                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 dark:bg-slate-950 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-900'
                                            }`}
                                    >
                                        <div className={`w-4 h-4 rounded-sm border flex items-center justify-center ${isSelected ? 'bg-blue-500 border-blue-500' : 'border-slate-300 dark:border-slate-600'}`}>
                                            {isSelected && <span className="w-2 h-2 bg-white rounded-sm" />}
                                        </div>
                                        <span>{acc.name}</span>
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
                    name="observations"
                    defaultValue={parsedObs}
                    className="flex min-h-[80px] w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-950 dark:ring-offset-slate-950 dark:placeholder:text-slate-400 dark:focus-visible:ring-slate-300"
                    placeholder="Detalhes adicionais (cuba, acabamento, etc.)"
                />
            </div>

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
