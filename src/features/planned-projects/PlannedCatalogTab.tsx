import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../../lib/firebase';
import { 
    collection, 
    onSnapshot, 
    query, 
    where, 
    addDoc, 
    updateDoc, 
    doc, 
    serverTimestamp 
} from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { 
    Plus, Search, Edit2, Check, X, Loader2, Palette, EyeOff, Trash2, Eye, Award, Sliders, ChevronDown
} from 'lucide-react';
import type { PlannedCatalogItem } from '../../types';

const HANDLE_TYPES = ['Perfil', 'Cava', 'Alça', 'Embutido', 'Sem puxador', 'Outro'];

export const PlannedCatalogTab: React.FC = () => {
    const { user, profile } = useAuth();
    const [catalogItems, setCatalogItems] = useState<PlannedCatalogItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeSection, setActiveSection] = useState<'color_mdf' | 'handle' | 'finish' | 'mdf_thickness'>('color_mdf');

    // Drawer/Form State
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [active, setActive] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    // Color/MDF specific states
    const [code, setCode] = useState('');
    const [manufacturer, setManufacturer] = useState('');
    const [line, setLine] = useState('');

    // Handle specific states
    const [handleType, setHandleType] = useState(HANDLE_TYPES[0]);
    const [handleColor, setHandleColor] = useState('');
    const [handlePriceStr, setHandlePriceStr] = useState('0,00');

    // Finish specific states
    const [finishPriceStr, setFinishPriceStr] = useState('0,00');

    // MDF Thickness specific states
    const [thicknessStr, setThicknessStr] = useState('15');
    const [thicknessUnit, setThicknessUnit] = useState('mm');

    const canManage = ['superadmin', 'company_admin', 'admin', 'vendedor'].includes(profile?.role || '');

    // Reset fields on section change
    useEffect(() => {
        setIsFormOpen(false);
        setEditId(null);
    }, [activeSection]);

    useEffect(() => {
        if (!profile?.companyId) return;

        const q = query(
            collection(db, 'planned_catalog_items'),
            where('companyId', '==', profile.companyId)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data: PlannedCatalogItem[] = [];
            snapshot.forEach((docSnap) => {
                const item = docSnap.data() as PlannedCatalogItem;
                // Exclude soft-deleted items
                if (!(item as any).deleted && !(item as any).isDeleted) {
                    data.push({ id: docSnap.id, ...item });
                }
            });
            // Sort by name
            data.sort((a, b) => a.name.localeCompare(b.name));
            setCatalogItems(data);
            setLoading(false);
        }, (err) => {
            console.error('Error fetching planned catalog items:', err);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [profile?.companyId]);

    // Cost input formats
    const parseCurrencyToCents = (val: string): number => {
        let cleaned = val.replace(/[^\d]/g, '');
        return parseInt(cleaned, 10) || 0;
    };

    const formatCentsToBRL = (cents: number): string => {
        return (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    const handleMoneyChange = (setter: (val: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
        const digits = e.target.value.replace(/\D/g, '');
        if (!digits) {
            setter('0,00');
            return;
        }
        const numberVal = parseFloat(digits) / 100;
        setter(numberVal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    };

    const handleAddNewClick = () => {
        setEditId(null);
        setName('');
        setDescription('');
        setActive(true);
        setCode('');
        setManufacturer('');
        setLine('');
        setHandleType(HANDLE_TYPES[0]);
        setHandleColor('');
        setHandlePriceStr('0,00');
        setFinishPriceStr('0,00');
        setThicknessStr('15');
        setThicknessUnit('mm');
        setIsFormOpen(true);
    };

    const handleEditClick = (item: PlannedCatalogItem) => {
        setEditId(item.id);
        setName(item.name);
        setDescription(item.description || '');
        setActive(item.active);

        if (item.type === 'color_mdf') {
            setCode(item.code || '');
            setManufacturer(item.manufacturer || '');
            setLine(item.line || '');
        } else if (item.type === 'handle') {
            setHandleType(item.handleType || HANDLE_TYPES[0]);
            setHandleColor(item.color || '');
            setHandlePriceStr(formatCentsToBRL(item.price || 0));
        } else if (item.type === 'finish') {
            setFinishPriceStr(formatCentsToBRL(item.price || 0));
        } else if (item.type === 'mdf_thickness') {
            setThicknessStr(String(item.thickness || '15'));
            setThicknessUnit(item.unit || 'mm');
        }

        setIsFormOpen(true);
    };

    const handleToggleActive = async (item: PlannedCatalogItem) => {
        if (!canManage) return;
        try {
            const docRef = doc(db, 'planned_catalog_items', item.id);
            await updateDoc(docRef, {
                active: !item.active,
                updatedAt: serverTimestamp()
            });
        } catch (err) {
            console.error('Error toggling active status:', err);
        }
    };

    const handleSoftDelete = async (item: PlannedCatalogItem) => {
        const confirmed = window.confirm(`Deseja excluir permanentemente o cadastro de "${item.name}"?`);
        if (!confirmed) return;

        try {
            const docRef = doc(db, 'planned_catalog_items', item.id);
            await updateDoc(docRef, {
                deleted: true,
                isDeleted: true,
                active: false,
                deletedAt: serverTimestamp(),
                deletedBy: user?.uid || '',
                updatedAt: serverTimestamp()
            });
            alert('Cadastro excluído com sucesso.');
        } catch (err) {
            console.error('Error deleting catalog item:', err);
            alert('Erro ao excluir o item.');
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!canManage) return;

        let finalName = name.trim();
        if (activeSection === 'mdf_thickness') {
            finalName = `${thicknessStr.trim()} ${thicknessUnit.trim()}`;
        }

        if (!finalName && activeSection !== 'mdf_thickness') {
            alert('Por favor, preencha o nome do item.');
            return;
        }

        setIsSaving(true);
        const itemPayload: any = {
            companyId: profile?.companyId,
            type: activeSection,
            name: finalName,
            description: description.trim() || null,
            active,
            updatedBy: user?.uid || '',
            updatedAt: serverTimestamp()
        };

        // Section specific payloads
        if (activeSection === 'color_mdf') {
            itemPayload.code = code.trim() || null;
            itemPayload.manufacturer = manufacturer.trim() || null;
            itemPayload.line = line.trim() || null;
        } else if (activeSection === 'handle') {
            itemPayload.handleType = handleType;
            itemPayload.color = handleColor.trim() || null;
            itemPayload.price = parseCurrencyToCents(handlePriceStr);
        } else if (activeSection === 'finish') {
            itemPayload.price = parseCurrencyToCents(finishPriceStr);
        } else if (activeSection === 'mdf_thickness') {
            itemPayload.thickness = parseFloat(thicknessStr) || 15;
            itemPayload.unit = thicknessUnit.trim();
        }

        try {
            if (editId) {
                const docRef = doc(db, 'planned_catalog_items', editId);
                await updateDoc(docRef, itemPayload);
                alert('Cadastro atualizado com sucesso!');
            } else {
                const docRef = collection(db, 'planned_catalog_items');
                await addDoc(docRef, {
                    ...itemPayload,
                    createdAt: serverTimestamp(),
                    createdBy: user?.uid || ''
                });
                alert('Cadastro salvo com sucesso!');
            }
            setIsFormOpen(false);
        } catch (err) {
            console.error('Error saving catalog item:', err);
            alert('Erro ao salvar o item.');
        } finally {
            setIsSaving(false);
        }
    };

    // Filter Items by Section and Search Term
    const filteredItems = useMemo(() => {
        return catalogItems.filter(item => {
            const matchesSection = item.type === activeSection;
            const matchesSearch = 
                item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (item.description || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (item.manufacturer || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (item.code || '').toLowerCase().includes(searchTerm.toLowerCase());
            return matchesSection && matchesSearch;
        });
    }, [catalogItems, activeSection, searchTerm]);

    return (
        <div className="space-y-6">
            {/* Top Action Bar */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white">Especificações de Materiais e Acabamentos</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Padronize as opções de MDF, cores, puxadores e acabamentos para composição do projeto.</p>
                </div>
                {canManage && !isFormOpen && (
                    <Button
                        onClick={handleAddNewClick}
                        className="bg-brand-rocha-primary text-white hover:bg-brand-rocha-primary/90 flex items-center gap-2 h-11 px-5 rounded-xl font-bold shadow-md shadow-brand-rocha-primary/20 transition-all duration-300 active:scale-[0.98]"
                    >
                        <Plus className="h-5 w-5" />
                        Adicionar Opção
                    </Button>
                )}
            </div>

            {/* Sub-tab selection */}
            <div className="flex flex-wrap gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
                <button
                    onClick={() => setActiveSection('color_mdf')}
                    className={`h-9 px-4 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all ${activeSection === 'color_mdf' ? 'bg-brand-rocha-primary/10 text-brand-rocha-primary' : 'text-slate-500 hover:bg-slate-50'}`}
                >
                    <Palette className="h-4 w-4" />
                    Cores / MDF
                </button>
                <button
                    onClick={() => setActiveSection('handle')}
                    className={`h-9 px-4 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all ${activeSection === 'handle' ? 'bg-brand-rocha-primary/10 text-brand-rocha-primary' : 'text-slate-500 hover:bg-slate-50'}`}
                >
                    <Sliders className="h-4 w-4" />
                    Puxadores
                </button>
                <button
                    onClick={() => setActiveSection('finish')}
                    className={`h-9 px-4 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all ${activeSection === 'finish' ? 'bg-brand-rocha-primary/10 text-brand-rocha-primary' : 'text-slate-500 hover:bg-slate-50'}`}
                >
                    <Award className="h-4 w-4" />
                    Acabamentos
                </button>
                <button
                    onClick={() => setActiveSection('mdf_thickness')}
                    className={`h-9 px-4 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all ${activeSection === 'mdf_thickness' ? 'bg-brand-rocha-primary/10 text-brand-rocha-primary' : 'text-slate-500 hover:bg-slate-50'}`}
                >
                    <Sliders className="h-4 w-4" />
                    Espessura MDF
                </button>
            </div>

            {/* Form component */}
            {isFormOpen && (
                <Card className="border-brand-rocha-primary/20 bg-slate-50/50 dark:bg-slate-900/50">
                    <CardHeader className="flex flex-row justify-between items-center pb-3">
                        <div>
                            <CardTitle className="text-base font-bold text-slate-900 dark:text-white">
                                {editId ? 'Editar Cadastro' : 'Novo Cadastro Técnico'}
                            </CardTitle>
                            <CardDescription>
                                Essas opções ficarão disponíveis para autopreenchimento nos módulos dos ambientes.
                            </CardDescription>
                        </div>
                        <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => setIsFormOpen(false)}
                            className="rounded-full text-slate-400 hover:bg-slate-200/50"
                        >
                            <X className="h-5 w-5" />
                        </Button>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            
                            {/* Color/MDF specific fields */}
                            {activeSection === 'color_mdf' && (
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                    <div className="md:col-span-2">
                                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Nome da Cor / Padrão</label>
                                        <Input
                                            type="text"
                                            value={name}
                                            onChange={(e) => setName(e.target.value)}
                                            placeholder="Ex: Louro Freijó, Areia, Carvalho"
                                            required
                                            className="h-11 rounded-xl"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Código (Opcional)</label>
                                        <Input
                                            type="text"
                                            value={code}
                                            onChange={(e) => setCode(e.target.value)}
                                            placeholder="Ex: MDF-302"
                                            className="h-11 rounded-xl"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Fabricante (Opcional)</label>
                                        <Input
                                            type="text"
                                            value={manufacturer}
                                            onChange={(e) => setManufacturer(e.target.value)}
                                            placeholder="Ex: Duratex, Guararapes"
                                            className="h-11 rounded-xl"
                                        />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Linha / Coleção (Opcional)</label>
                                        <Input
                                            type="text"
                                            value={line}
                                            onChange={(e) => setLine(e.target.value)}
                                            placeholder="Ex: Essencial Wood, Coleção Alma"
                                            className="h-11 rounded-xl"
                                        />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Observação / Nota</label>
                                        <Input
                                            type="text"
                                            value={description}
                                            onChange={(e) => setDescription(e.target.value)}
                                            placeholder="Notas adicionais sobre a cor"
                                            className="h-11 rounded-xl"
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Handle specific fields */}
                            {activeSection === 'handle' && (
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Nome do Puxador</label>
                                        <Input
                                            type="text"
                                            value={name}
                                            onChange={(e) => setName(e.target.value)}
                                            placeholder="Ex: Perfil Cava, Alça Champagne"
                                            required
                                            className="h-11 rounded-xl"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Tipo de Puxador</label>
                                        <select
                                            value={handleType}
                                            onChange={(e) => setHandleType(e.target.value)}
                                            className="flex h-11 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-rocha-primary dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                                        >
                                            {HANDLE_TYPES.map(opt => (
                                                <option key={opt} value={opt}>{opt}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Cor / Acabamento</label>
                                        <Input
                                            type="text"
                                            value={handleColor}
                                            onChange={(e) => setHandleColor(e.target.value)}
                                            placeholder="Ex: Champagne, Preto Anodizado"
                                            className="h-11 rounded-xl"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Valor Unitário Sugerido (Opcional)</label>
                                        <div className="relative">
                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400 font-bold">R$</span>
                                            <Input
                                                type="text"
                                                value={handlePriceStr}
                                                onChange={handleMoneyChange(setHandlePriceStr)}
                                                className="h-11 pl-9 rounded-xl font-bold"
                                            />
                                        </div>
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Observação</label>
                                        <Input
                                            type="text"
                                            value={description}
                                            onChange={(e) => setDescription(e.target.value)}
                                            placeholder="Especificações do puxador"
                                            className="h-11 rounded-xl"
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Finish specific fields */}
                            {activeSection === 'finish' && (
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Nome do Acabamento</label>
                                        <Input
                                            type="text"
                                            value={name}
                                            onChange={(e) => setName(e.target.value)}
                                            placeholder="Ex: Laca Fosca, Ripado, Texturizado"
                                            required
                                            className="h-11 rounded-xl"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Custo Adicional Estimado (Opcional)</label>
                                        <div className="relative">
                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400 font-bold">R$</span>
                                            <Input
                                                type="text"
                                                value={finishPriceStr}
                                                onChange={handleMoneyChange(setFinishPriceStr)}
                                                className="h-11 pl-9 rounded-xl font-bold"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Descrição</label>
                                        <Input
                                            type="text"
                                            value={description}
                                            onChange={(e) => setDescription(e.target.value)}
                                            placeholder="Ex: Acabamento em Laca com brilho 20%"
                                            className="h-11 rounded-xl"
                                        />
                                    </div>
                                </div>
                            )}

                            {/* MDF Thickness specific fields */}
                            {activeSection === 'mdf_thickness' && (
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Espessura</label>
                                        <Input
                                            type="text"
                                            value={thicknessStr}
                                            onChange={(e) => setThicknessStr(e.target.value)}
                                            placeholder="Ex: 15, 18, 25"
                                            required
                                            className="h-11 rounded-xl font-bold"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Unidade</label>
                                        <Input
                                            type="text"
                                            value={thicknessUnit}
                                            onChange={(e) => setThicknessUnit(e.target.value)}
                                            placeholder="Ex: mm"
                                            required
                                            className="h-11 rounded-xl"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Observação</label>
                                        <Input
                                            type="text"
                                            value={description}
                                            onChange={(e) => setDescription(e.target.value)}
                                            placeholder="Ex: Recomendado para caixarias de armários"
                                            className="h-11 rounded-xl"
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Common Footer Actions */}
                            <div className="flex justify-between items-center pt-2">
                                <label className="flex items-center gap-2 cursor-pointer text-sm font-bold text-slate-600 dark:text-slate-300">
                                    <input 
                                        type="checkbox" 
                                        checked={active} 
                                        onChange={(e) => setActive(e.target.checked)} 
                                        className="rounded border-slate-300 text-brand-rocha-primary focus:ring-brand-rocha-primary w-4 h-4"
                                    />
                                    Opção Ativa
                                </label>
                                
                                <div className="flex gap-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => setIsFormOpen(false)}
                                        className="h-11 rounded-xl px-5 font-bold"
                                    >
                                        Cancelar
                                    </Button>
                                    <Button
                                        type="submit"
                                        disabled={isSaving}
                                        className="bg-brand-rocha-primary text-white hover:bg-brand-rocha-primary/90 h-11 px-6 rounded-xl font-bold flex items-center gap-2"
                                    >
                                        {isSaving ? (
                                            <>
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                                Salvando...
                                            </>
                                        ) : (
                                            <>
                                                <Check className="h-4 w-4" />
                                                Salvar Cadastro
                                            </>
                                        )}
                                    </Button>
                                </div>
                            </div>
                        </form>
                    </CardContent>
                </Card>
            )}

            {/* Searching controls */}
            <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                    type="text"
                    placeholder="Buscar nos cadastrados desta aba..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 h-11 rounded-xl border-slate-200"
                />
            </div>

            {/* List Table */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left text-sm">
                        <thead>
                            <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
                                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Nome</th>
                                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Detalhes / Especificações</th>
                                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Status</th>
                                {canManage && <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Ações</th>}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {filteredItems.length > 0 ? (
                                filteredItems.map((item) => (
                                    <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                                        <td className="px-6 py-4 font-bold text-slate-900 dark:text-white">
                                            {item.name}
                                        </td>
                                        <td className="px-6 py-4 text-slate-600 dark:text-slate-300 text-xs">
                                            {item.type === 'color_mdf' && (
                                                <div className="space-y-0.5">
                                                    {item.code && <div><span className="font-bold">Código:</span> {item.code}</div>}
                                                    {item.manufacturer && <div><span className="font-bold">Fabricante:</span> {item.manufacturer}</div>}
                                                    {item.line && <div><span className="font-bold">Linha:</span> {item.line}</div>}
                                                    {item.description && <div><span className="font-bold">Obs:</span> {item.description}</div>}
                                                </div>
                                            )}
                                            {item.type === 'handle' && (
                                                <div className="space-y-0.5">
                                                    <div><span className="font-bold">Tipo:</span> {item.handleType}</div>
                                                    {item.color && <div><span className="font-bold">Acabamento:</span> {item.color}</div>}
                                                    {item.price !== undefined && item.price > 0 && <div><span className="font-bold">Preço sugerido:</span> R$ {formatCentsToBRL(item.price)}</div>}
                                                    {item.description && <div><span className="font-bold">Obs:</span> {item.description}</div>}
                                                </div>
                                            )}
                                            {item.type === 'finish' && (
                                                <div className="space-y-0.5">
                                                    {item.description && <div><span className="font-bold">Descrição:</span> {item.description}</div>}
                                                    {item.price !== undefined && item.price > 0 && <div><span className="font-bold">Custo adicional:</span> R$ {formatCentsToBRL(item.price)}</div>}
                                                </div>
                                            )}
                                            {item.type === 'mdf_thickness' && (
                                                <div className="space-y-0.5">
                                                    <div><span className="font-bold">Espessura:</span> {item.thickness} {item.unit}</div>
                                                    {item.description && <div><span className="font-bold">Obs:</span> {item.description}</div>}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            <button 
                                                disabled={!canManage}
                                                onClick={() => handleToggleActive(item)}
                                                className="focus:outline-none flex items-center cursor-pointer disabled:cursor-not-allowed"
                                            >
                                                {item.active ? (
                                                    <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-600 dark:bg-emerald-900/10 dark:text-emerald-400 text-xs font-bold px-2.5 py-1 rounded-lg border border-emerald-100">
                                                        Ativo
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 text-xs font-bold px-2.5 py-1 rounded-lg border border-slate-200">
                                                        Inativo
                                                    </span>
                                                )}
                                            </button>
                                        </td>
                                        {canManage && (
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex justify-end gap-1.5">
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => handleEditClick(item)}
                                                        className="h-9 px-3 rounded-lg font-bold inline-flex items-center gap-1 hover:border-brand-rocha-primary hover:text-brand-rocha-primary transition-all duration-300"
                                                    >
                                                        <Edit2 className="h-3.5 w-3.5" />
                                                        Editar
                                                    </Button>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => handleSoftDelete(item)}
                                                        className="h-9 w-9 p-0 rounded-lg text-slate-400 hover:text-red-500 hover:border-red-500 transition-all duration-300"
                                                        title="Excluir"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </td>
                                        )}
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={canManage ? 4 : 3} className="px-6 py-12 text-center text-slate-400">
                                        Nenhuma opção cadastrada nesta categoria. Clique em "Adicionar Opção" acima.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};
