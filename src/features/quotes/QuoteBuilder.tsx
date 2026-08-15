import { safeArray } from '../../lib/dataDiagnostics';
import React, { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { SearchableSelect } from '../../components/ui/SearchableSelect';
import { 
    Plus, Trash2, Edit2, ArrowRight
} from 'lucide-react';
import type { StoneGroup, StonePiece, StonePieceType } from '../../types';
import { useMaterialCatalog } from '../../hooks/useMaterialCatalog';
import { useClients } from '../../hooks/useClients';
import { useStaffCatalog } from '../../hooks/useStaffCatalog';
import { normalizeMeasure, calculateArea } from '../../utils/quoteCalculations';

import { useAuth } from '../../context/AuthContext';
import { cn } from '../../lib/utils';
interface QuoteBuilderProps {
    initialData?: StoneGroup;
    isEditing?: boolean;
    onSave: (group: StoneGroup) => void;
    onCancel: () => void;
    onDraftUpdate?: (data: { 
        environmentName?: string; 
        materialName?: string; 
        materialPrice?: number; 
        pieces?: StonePiece[]; 
        quantity?: number;
        tempPiece?: {
            label: string;
            width: number;
            height: number;
            quantity: number;
            type: string;
        }
    }) => void;
    installationRateLinear?: number;
}

export const QuoteBuilder: React.FC<QuoteBuilderProps> = ({ 
    initialData, 
    isEditing = false,
    onSave, 
    onCancel,
    onDraftUpdate,
    installationRateLinear = 0
}) => {
    const { profile } = useAuth();
    const isAdmin = profile?.role === 'company_admin' || profile?.role === 'admin' || profile?.role === 'superadmin';
    const { materials, filteredMaterials, isLoading, setSearchTerm } = useMaterialCatalog();
    
    // Form State
    const fallbackEnvName = initialData?.environmentName || (initialData as any)?.name || (initialData as any)?.ambiente || (initialData as any)?.roomName || '';
    const fallbackMatName = initialData?.materialName || (initialData as any)?.material?.name || (initialData as any)?.selectedMaterial?.name || (initialData as any)?.material || '';
    
    const [environmentName, setEnvironmentName] = useState(fallbackEnvName);
    const [materialName, setMaterialName] = useState(fallbackMatName);
    const [materialPrice, setMaterialPrice] = useState(initialData?.materialPrice || 0);
    const [pieces, setPieces] = useState<StonePiece[]>(initialData?.pieces || []);
    const [edgeFinishing, setEdgeFinishing] = useState(initialData?.edgeFinishing || '');
    const [groupQuantity, setGroupQuantity] = useState(initialData?.quantity || 1);
    const [furosECortes, setFurosECortes] = useState(initialData?.furosECortes || (initialData as any)?.freebies || { cuba: false, furoTorneira: false, corteCooktop: false });
    const [itensFornecidosCliente, setItensFornecidosCliente] = useState(initialData?.itensFornecidosCliente || { cuba: false, tanque: false, cubaLavatorio: false });

    // Fallback material resolver against catalog
    React.useEffect(() => {
        if (materials.length > 0 && fallbackMatName && materialName === fallbackMatName) {
            const matById = initialData?.materialId ? materials.find(m => m.id === initialData.materialId) : null;
            if (matById) {
                setMaterialName(matById.name);
                if (!initialData?.materialPrice) setMaterialPrice(matById.price);
                return;
            }

            const normalizedFallback = fallbackMatName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
            const matByName = materials.find(m => m.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim() === normalizedFallback);
            
            if (matByName) {
                setMaterialName(matByName.name);
                if (!initialData?.materialPrice) setMaterialPrice(matByName.price);
            }
        }
    }, [materials, fallbackMatName, initialData?.materialId, materialName, initialData?.materialPrice]);
    
    // Piece Draft State
    const [draftType, setDraftType] = useState<StonePieceType>('tampo');
    const [draftLabel, setDraftLabel] = useState('Tampo');
    const [draftWidth, setDraftWidth] = useState<string>('');
    const [draftHeight, setDraftHeight] = useState<string>('');
    const [draftQty, setDraftQty] = useState<number>(1);
    const [editingPieceId, setEditingPieceId] = useState<string | null>(null);
    
    // Validation State
    const [showFormErrors, setShowFormErrors] = useState(false);
    const [showPieceErrors, setShowPieceErrors] = useState(false);

    // Notify parent for Autosave
    React.useEffect(() => {
        if (onDraftUpdate) {
            console.log("[QUOTE DEBUG] onDraftUpdate fired from QuoteBuilder");
            onDraftUpdate({ 
                environmentName, 
                materialName, 
                materialPrice,
                pieces, 
                quantity: groupQuantity,
                tempPiece: {
                    label: draftLabel,
                    width: normalizeMeasure(draftWidth),
                    height: normalizeMeasure(draftHeight),
                    quantity: draftQty,
                    type: draftType
                },
                furosECortes,
                itensFornecidosCliente,
                edgeFinishing
            });
        }
    }, [
        environmentName, materialName, materialPrice, 
        pieces, groupQuantity, draftLabel, draftWidth, draftHeight, 
        draftQty, draftType, onDraftUpdate, furosECortes, itensFornecidosCliente, edgeFinishing
    ]);

    // Cleanup states on unmount to prevent navigation locking
    React.useEffect(() => {
        return () => {
            setPieces([]);
            setEnvironmentName("");
            setMaterialName("");
            setMaterialPrice(0);
            setShowFormErrors(false);
            setShowPieceErrors(false);
            setFurosECortes({ cuba: false, furoTorneira: false, corteCooktop: false });
            setItensFornecidosCliente({ cuba: false, tanque: false, cubaLavatorio: false });
            setEdgeFinishing('');
        };
    }, []);

    // Helper logic for installation
    const calculatePieceTotal = (piece: StonePiece, price: number) => {
        return piece.sqm * price;
    };

    // When material price changes, update all existing pieces' totals
    const isInitialMount = React.useRef(true);
    React.useEffect(() => {
        if (isInitialMount.current) {
            isInitialMount.current = false;
            return;
        }
        if (pieces.length > 0 && materialPrice >= 0) {
            setPieces(prev => safeArray(prev).map(p => ({
                ...p,
                total: calculatePieceTotal(p, materialPrice)
            })));
        }
    }, [materialPrice]);


    const formatMeterMask = (value: string) => {
        const numbers = String(value || '').replace(/\D/g, '');
        if (!numbers) return '';
        const padded = numbers.padStart(3, '0');
        const intPart = padded.slice(0, -2);
        const decPart = padded.slice(-2);
        const finalInt = parseInt(intPart, 10).toString();
        return `${finalInt},${decPart}`;
    };

    const validateBeforeAddPiece = () => {
        if (!environmentName) {
            alert("Informe o nome do ambiente antes de adicionar a peça.");
            setShowFormErrors(true);
            return false;
        }
        if (!materialName) {
            alert("Selecione o material (pedra) antes de adicionar a peça.");
            setShowFormErrors(true);
            return false;
        }
        return true;
    };


    const handleAddOrUpdatePiece = () => {
        if (!validateBeforeAddPiece()) return;
        
        const w = normalizeMeasure(draftWidth);
        const h = normalizeMeasure(draftHeight);
        
        if (!draftLabel || w <= 0 || h <= 0 || draftQty <= 0) {
            setShowPieceErrors(true);
            return;
        }

        setShowPieceErrors(false);

        const sqm = Number((calculateArea(w, h) * draftQty).toFixed(4));
        const total = Number((sqm * materialPrice).toFixed(2));

        const newPiece: StonePiece = {
            id: editingPieceId || crypto.randomUUID(),
            type: draftType,
            label: draftLabel,
            width: w,
            height: h,
            quantity: draftQty,
            sqm,
            total
        };

        if (editingPieceId) {
            setPieces(prev => safeArray(prev).map(p => p.id === editingPieceId ? newPiece : p));
            setEditingPieceId(null);
        } else {
            setPieces(prev => [...prev, newPiece]);
        }

        // Reset draft
        setDraftWidth('');
        setDraftHeight('');
        setDraftQty(1);
        if (draftType !== 'outro') {
            const safeType = String(draftType || '');
            setDraftLabel(safeType.charAt(0).toUpperCase() + safeType.slice(1));
        }
    };

    const handleEditPiece = (piece: StonePiece) => {
        const safeLabel = String(piece.label ?? '').toLowerCase();
        if (piece.type === 'frontao' || safeLabel.indexOf('front') !== -1) {
            console.log("[DEBUG FRONTÃO] Carregando peça no editor:", piece);
        }
        setEditingPieceId(piece.id);
        setDraftType(piece.type);
        setDraftLabel(String(piece.label ?? '').charAt(0).toUpperCase() + String(piece.label ?? '').toLowerCase().slice(1));
        setDraftWidth(formatMeterMask(String(Number(piece.width || 0).toFixed(2)).replace('.', ',')));
        setDraftHeight(formatMeterMask(String(Number(piece.height || 0).toFixed(2)).replace('.', ',')));
        setDraftQty(Number(piece.quantity || 1));
    };

    const handleSaveGroup = () => {
        // --- DEBUG LOGGING ---
        if (!environmentName || !materialName || pieces.length === 0 || groupQuantity <= 0) {
            setShowFormErrors(true);
            return;
        }

        const stonesTotal = pieces.reduce((acc, p) => acc + (Number(p.total) || 0), 0);
        
        // Final sanity check before saving (Rule #4)
        const totalInst = pieces.reduce((acc, p) => {
            const normalizedLabel = String(p.label ?? '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            const isFrontao = normalizedLabel.indexOf('frontao') !== -1 || p.type === 'frontao';
            if (isFrontao) {
                const linearMeters = (Number(p.width) || 0) * (Number(p.quantity) || 0);
                return acc + Number((linearMeters * (Number(installationRateLinear) || 0)).toFixed(2));
            }
            return acc;
        }, 0);

        const totalEnv = Number(((stonesTotal + totalInst) * groupQuantity).toFixed(2));

        const group: StoneGroup = {
            id: initialData?.id || crypto.randomUUID(),
            environmentName,
            materialId: materials.find(m => m.name === materialName)?.id || '',
            materialName,
            materialPrice,
            quantity: groupQuantity,
            pieces,
            groupTotal: totalEnv,
            furosECortes,
            itensFornecidosCliente,
            edgeFinishing
        };
        
        console.log("DEBUG: Final group object to save:", group);
        onSave(group);
    };




    return (
        <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-900/50">
            <div className="p-6 space-y-6 overflow-y-auto flex-1">

                {/* Step 2: Environment & Material */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                    <div className="md:col-span-1">
                        <label className={`block text-xs font-black uppercase tracking-widest mb-2 ${showFormErrors && !environmentName ? 'text-red-500' : 'text-slate-400'}`}>Nome do Ambiente</label>
                        <Input 
                            value={environmentName} 
                            onChange={e => setEnvironmentName(e.target.value)} 
                            placeholder="Ex: Pia da Cozinha..."
                            className={`h-11 font-bold text-lg ${showFormErrors && !environmentName ? 'border-red-500 focus-visible:ring-red-500 shadow-sm shadow-red-500/10' : ''}`}
                        />
                        {showFormErrors && !environmentName && <span className="text-[10px] text-red-500 font-bold mt-1">Informe o nome do ambiente.</span>}
                    </div>
                    <div>
                        <label className={`block text-xs font-black uppercase tracking-widest mb-2 ${showFormErrors && !materialName ? 'text-red-500' : 'text-slate-400'}`}>Material</label>
                        <div className={showFormErrors && !materialName ? 'rounded-lg border-red-500 border-2 shadow-sm shadow-red-500/10' : ''}>
                            <SearchableSelect 
                                value={materialName}
                                options={safeArray(filteredMaterials).map(m => ({ 
                                    value: m.name, 
                                    label: m.name, 
                                    description: `R$ ${m.price}/m²`,
                                    searchValue: `${m.type || ''} ${m.color || ''}` 
                                }))}
                                onChange={(val) => {
                                    setMaterialName(val);
                                    const m = materials.find(mat => mat.name === val || mat.id === val);
                                    if (m) setMaterialPrice(m.price);
                                }}
                                onSearchChange={setSearchTerm}
                                placeholder="Escolha o material..."
                            />
                        </div>
                        {showFormErrors && !materialName && <span className="text-[10px] text-red-500 font-bold mt-1">Informe este campo</span>}
                    </div>
                    <div>
                        <label className={`block text-xs font-black uppercase tracking-widest mb-2 ${showFormErrors && groupQuantity <= 0 ? 'text-red-500' : 'text-slate-400'}`}>Qtd de Ambientes</label>
                        <Input 
                            type="number" 
                            min="1"
                            value={groupQuantity} 
                            onChange={e => setGroupQuantity(Number(e.target.value))} 
                            className={`h-11 font-bold text-lg text-center ${showFormErrors && groupQuantity <= 0 ? 'border-red-500 focus-visible:ring-red-500 shadow-sm shadow-red-500/10' : ''}`}
                        />
                        {showFormErrors && groupQuantity <= 0 && <span className="text-[10px] text-red-500 font-bold mt-1">Quantidade inválida</span>}
                    </div>
                </div>

                {/* Step 3: Piece Builder */}
                <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
                    <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 border-b pb-2">Compor Peças do Ambiente</h3>
                    
                    <div className="grid grid-cols-2 md:grid-cols-6 gap-3 items-end">
                        <div className="col-span-1">
                            <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Tipo</label>
                            <select 
                                value={draftType} 
                                onChange={e => {
                                    const val = e.target.value as StonePieceType;
                                    const safeVal = String(val || '');
                                    setDraftType(val);
                                    if (val !== 'outro') {
                                        setDraftLabel(safeVal.charAt(0).toUpperCase() + safeVal.slice(1));
                                    }
                                }}
                                className="w-full h-11 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm font-bold"
                            >
                                <option value="tampo">Tampo</option>
                                <option value="frontao">Frontão</option>
                                <option value="saia">Saia</option>
                                <option value="rodabase">Rodabase</option>
                                <option value="lateral">Lateral</option>
                                <option value="outro">Outro</option>
                            </select>
                        </div>
                        <div className="col-span-1">
                            <label className={`block text-[10px] font-black uppercase mb-1 ${showPieceErrors && !draftLabel ? 'text-red-500' : 'text-slate-500'}`}>Nome/Label</label>
                            <Input 
                                value={draftLabel} 
                                onChange={e => setDraftLabel(e.target.value)} 
                                placeholder="Nome..."
                                className={`h-11 font-bold text-sm ${showPieceErrors && !draftLabel ? 'border-red-500 focus-visible:ring-red-500 shadow-sm shadow-red-500/10' : ''}`}
                            />
                            {showPieceErrors && !draftLabel && <span className="text-[9px] text-red-500 font-bold block mt-0.5">Obrigatório</span>}
                        </div>
                        <div className="col-span-1">
                            <label className={`block text-[10px] font-black uppercase mb-1 ${showPieceErrors && normalizeMeasure(draftWidth) <= 0 ? 'text-red-500' : 'text-slate-500'}`}>Comp. (m)</label>
                            <Input 
                                value={draftWidth} 
                                onChange={e => setDraftWidth(formatMeterMask(e.target.value))} 
                                placeholder="0,00"
                                className={`h-11 text-center font-mono font-bold text-lg ${showPieceErrors && normalizeMeasure(draftWidth) <= 0 ? 'border-red-500 focus-visible:ring-red-500 shadow-sm shadow-red-500/10' : ''}`}
                            />
                            {showPieceErrors && normalizeMeasure(draftWidth) <= 0 && <span className="text-[9px] text-red-500 font-bold block mt-0.5 text-center">Informe este campo</span>}
                        </div>
                        <div className="col-span-1">
                            <label className={`block text-[10px] font-black uppercase mb-1 ${showPieceErrors && normalizeMeasure(draftHeight) <= 0 ? 'text-red-500' : 'text-slate-500'}`}>Larg. (m)</label>
                            <Input 
                                value={draftHeight} 
                                onChange={e => setDraftHeight(formatMeterMask(e.target.value))} 
                                placeholder="0,00"
                                className={`h-11 text-center font-mono font-bold text-lg ${showPieceErrors && normalizeMeasure(draftHeight) <= 0 ? 'border-red-500 focus-visible:ring-red-500 shadow-sm shadow-red-500/10' : ''}`}
                            />
                            {showPieceErrors && normalizeMeasure(draftHeight) <= 0 && <span className="text-[9px] text-red-500 font-bold block mt-0.5 text-center">Informe este campo</span>}
                        </div>
                        <div className="col-span-1">
                            <label className={`block text-[10px] font-black uppercase mb-1 ${showPieceErrors && (draftQty <= 0) ? 'text-red-500' : 'text-slate-500'}`}>Qtd</label>
                            <Input 
                                type="number" 
                                value={draftQty} 
                                onChange={e => setDraftQty(Number(e.target.value))} 
                                className={`h-11 text-center font-bold text-lg ${showPieceErrors && (draftQty <= 0) ? 'border-red-500 focus-visible:ring-red-500 shadow-sm shadow-red-500/10' : ''}`}
                            />
                            {showPieceErrors && (draftQty <= 0) && <span className="text-[9px] text-red-500 font-bold block mt-0.5 text-center">Informe este campo</span>}
                        </div>
                        <div className="col-span-2 md:col-span-1">
                            <Button 
                                type="button" 
                                onClick={handleAddOrUpdatePiece}
                                className={`w-full h-11 bg-slate-800 text-white font-bold uppercase text-xs tracking-widest ${(!draftWidth || !draftHeight || !draftLabel || draftQty <= 0) ? 'opacity-50' : ''}`}
                            >
                                {editingPieceId ? <Edit2 className="w-4 h-4 mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                                {editingPieceId ? 'Atualizar' : 'Adicionar'}
                            </Button>
                            <p className="text-[9px] text-slate-400 font-bold mt-1.5 uppercase leading-tight">
                                Adicione a peça à lista antes de salvar o ambiente
                            </p>
                        </div>
                    </div>
                    {showPieceErrors && (normalizeMeasure(draftWidth) <= 0 || normalizeMeasure(draftHeight) <= 0 || !draftLabel || draftQty <= 0) && (
                        <div className="text-[10px] font-black text-red-500 uppercase tracking-widest animate-pulse mt-2">
                            ⚠️ Informe todos os campos obrigatórios da peça antes de adicionar
                        </div>
                    )}

                    {/* Pieces List */}
                    {pieces.length > 0 && (
                        <div className="mt-6 border rounded-xl overflow-hidden">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-50 dark:bg-slate-900 border-b">
                                    <tr>
                                        <th className="px-4 py-2 font-black uppercase text-[10px] text-slate-400">Peça</th>
                                        <th className="px-4 py-2 font-black uppercase text-[10px] text-slate-400 text-center">Medidas</th>
                                        <th className="px-4 py-2 font-black uppercase text-[10px] text-slate-400 text-center">Qtd</th>
                                        <th className="px-4 py-2 font-black uppercase text-[10px] text-slate-400 text-center">M²</th>
                                        <th className="px-4 py-2 font-black uppercase text-[10px] text-slate-400 text-right">Subtotal</th>
                                        <th className="px-4 py-2 w-20"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {safeArray(pieces).map(piece => (
                                        <tr key={piece.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                            <td className="px-4 py-3 font-bold uppercase">{piece.label}</td>
                                            <td className="px-4 py-3 text-center font-mono">{String(Number(piece.width || 0).toFixed(2)).replace('.', ',')} x {String(Number(piece.height || 0).toFixed(2)).replace('.', ',')}</td>
                                            <td className="px-4 py-3 text-center font-bold">{Number(piece.quantity || 0)}</td>
                                            <td className="px-4 py-3 text-center text-slate-500">{String(Number(piece.sqm || 0).toFixed(2)).replace('.', ',')} m²</td>
                                            <td className="px-4 py-3 text-right font-black text-brand-emerald">R$ {(Number(piece.total) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                            <td className="px-4 py-3 flex justify-end gap-1">
                                                <button onClick={() => handleEditPiece(piece)} className="p-1.5 text-slate-400 hover:text-blue-600 transition-colors"><Edit2 className="w-4 h-4" /></button>
                                                <button onClick={() => setPieces(prev => safeArray(prev).filter(p => p.id !== piece.id))} className="p-1.5 text-slate-400 hover:text-red-500 transition-colors"><Trash2 className="w-4 h-4" /></button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                    
                    
                    {/* Step 4: Acabamento da Borda */}
                    <div className="mt-8 pt-6 border-t border-slate-100 dark:border-slate-800">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div>
                                <h3 className="text-sm font-black uppercase tracking-widest text-slate-800 dark:text-slate-200">Acabamento da Borda</h3>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight mt-0.5">Defina o padrão de acabamento para as bordas externas</p>
                            </div>
                            
                            <div className="w-full md:w-[350px]">
                                <select 
                                    value={edgeFinishing}
                                    onChange={e => setEdgeFinishing(e.target.value)}
                                    className="w-full h-12 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 text-sm font-bold focus:ring-2 focus:ring-brand-emerald/20 focus:border-brand-emerald transition-all outline-none"
                                >
                                    <option value="">Selecione o acabamento</option>
                                    <option value="Meia Esquadria (45º)">Meia Esquadria (45º)</option>
                                    <option value="Boleado">Boleado</option>
                                    <option value="Bisotê">Bisotê</option>
                                    <option value="Reto">Reto</option>
                                    <option value="Sanduíche (Duplo)">Sanduíche (Duplo)</option>
                                    <option value="Meia Cana">Meia Cana</option>
                                    <option value="Peito de Pombo">Peito de Pombo</option>
                                </select>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Footer Actions */}
            <div className="p-6 border-t bg-white dark:bg-slate-900 flex justify-between items-center">
                <Button variant="ghost" onClick={onCancel} className="font-bold text-slate-500">
                    Cancelar
                </Button>
                
                <div className="flex items-center gap-6">
                    {(() => {
                        const stonesTotal = (pieces || []).reduce((acc, p) => acc + (Number(p.total) || 0), 0);
                        
                        // Rule #4: Only Frontão generates installation (Matches quoteCalculations.ts)
                        const totalInst = (pieces || []).reduce((acc, p) => {
                            const normalizedLabel = String(p.label ?? '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                            const isFrontao = normalizedLabel.indexOf('frontao') !== -1 || p.type === 'frontao';
                            if (isFrontao) {
                                const linearMeters = (Number(p.width) || 0) * (Number(p.quantity) || 0);
                                return acc + Number((linearMeters * (Number(installationRateLinear) || 0)).toFixed(2));
                            }
                            return acc;
                        }, 0);

                        const totalEnv = Number(((stonesTotal + totalInst) * (Number(groupQuantity) || 0)).toFixed(2));

                        return (
                            <div className="flex items-center gap-6">
                                <div className="text-right">
                                    <span className="text-[10px] font-black uppercase text-slate-400 block">Total do Ambiente</span>
                                    <span className="text-3xl font-black text-brand-emerald">
                                        R$ {totalEnv.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    </span>
                                </div>
                            </div>
                        );
                    })()}

                    <Button 
                        onClick={handleSaveGroup}
                        className={`h-14 px-10 bg-brand-emerald hover:bg-emerald-600 text-white font-black uppercase tracking-[0.2em] shadow-xl shadow-emerald-500/20 ${(!environmentName || !materialName || pieces.length === 0 || groupQuantity <= 0) ? 'opacity-50' : ''}`}
                    >
                        Salvar Ambiente <ArrowRight className="ml-2 w-5 h-5" />
                    </Button>
                </div>
            </div>

            {/* Modal de Erro Global (Apenas se faltar peça) */}
            {showFormErrors && pieces.length === 0 && (
                <div className="px-6 pb-6 animate-in slide-in-from-bottom-2 duration-300">
                    <div className="bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/40 p-4 rounded-2xl flex items-center gap-3">
                        <span className="text-xl">⚠️</span>
                        <p className="text-[11px] font-black text-red-600 dark:text-red-400 uppercase tracking-widest">
                            Adicione pelo menos uma peça antes de salvar o ambiente.
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
};
