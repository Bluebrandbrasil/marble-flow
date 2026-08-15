import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useClients } from '../../hooks/useClients';
import { useCompanyData } from '../../hooks/useCompanyData';
import { getClientDisplayInfo } from '../../lib/clientUtils';
import { useMaterialCatalog } from '../../hooks/useMaterialCatalog';
import { QuickSalePieceDrawing } from './components/QuickSalePieceDrawing';
import { getNextQuickSaleProtocolNumber } from '../../lib/protocolGenerator';
import { db } from '../../lib/firebase';
import { 
    doc, 
    getDoc, 
    addDoc, 
    updateDoc, 
    collection, 
    serverTimestamp 
} from 'firebase/firestore';
import { 
    Input 
} from '../../components/ui/Input';
import { 
    Button 
} from '../../components/ui/Button';
import { SearchableSelect } from '../../components/ui/SearchableSelect';
import { 
    Search, 
    Trash2, 
    Plus, 
    MapPin, 
    ArrowLeft, 
    FileText, 
    HelpCircle, 
    Check, 
    Calendar, 
    Clock,
    DollarSign,
    Loader2
} from 'lucide-react';
import { cn } from '../../lib/utils';
import type { Client, QuickSale, QuickSaleItem } from '../../types';

// Helper functions for BRL currency handling and dimensions
const getSaoPauloDateTime = () => {
    const d = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        hour12: false
    });
    
    const parts = formatter.formatToParts(d);
    const getVal = (type: string) => parts.find(p => p.type === type)?.value || '';
    
    const year = getVal('year');
    const month = getVal('month').padStart(2, '0');
    const day = getVal('day').padStart(2, '0');
    let hour = getVal('hour').padStart(2, '0');
    if (hour === '24') hour = '00';
    const minute = getVal('minute').padStart(2, '0');
    
    return {
        dateKey: `${year}-${month}-${day}`,
        timeKey: `${hour}:${minute}`
    };
};

function generateUniqueId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

function cleanMonetaryInput(val: string): string {
    let cleaned = val.replace(/[^\d.,]/g, '');
    if (cleaned.startsWith('0') && cleaned.length > 1 && cleaned[1] !== ',' && cleaned[1] !== '.') {
        cleaned = cleaned.replace(/^0+/, '');
    }
    return cleaned;
}

function parseBRLToFloat(value: string | number | undefined | null): number {
    if (value === undefined || value === null) return 0;
    if (typeof value === 'number') return value;
    
    let str = String(value).trim();
    if (!str) return 0;

    str = str.replace(/R\$\s*/g, '');
    if (str.includes(',')) {
        str = str.replace(/\./g, '');
        str = str.replace(',', '.');
    } else {
        const parts = str.split('.');
        if (parts.length === 2 && parts[1].length <= 2) {
            // keep dot as decimal
        } else {
            str = str.replace(/\./g, '');
        }
    }
    str = str.replace(/[^\d.]/g, '');
    const parsed = parseFloat(str);
    return isNaN(parsed) ? 0 : parsed;
}

function formatFloatToBRL(value: number | string | undefined | null): string {
    if (value === undefined || value === null) return '0,00';
    const num = typeof value === 'number' ? value : parseBRLToFloat(value);
    if (isNaN(num)) return '0,00';
    return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseMeasureInput(value: string | number | undefined | null): number {
    if (value === undefined || value === null) return 0;
    if (typeof value === 'number') return value;
    
    let str = String(value).trim();
    if (!str) return 0;

    // Replace comma with dot
    str = str.replace(',', '.');
    // Remove all characters except digits and dots
    str = str.replace(/[^\d.]/g, '');
    
    // Handle multiple dots (keep only the first dot)
    const firstDotIndex = str.indexOf('.');
    if (firstDotIndex !== -1) {
        str = str.substring(0, firstDotIndex + 1) + str.substring(firstDotIndex + 1).replace(/\./g, '');
    }
    
    const parsed = parseFloat(str);
    return isNaN(parsed) ? 0 : parsed;
}

function formatMeasureInput(value: number | string | undefined | null): string {
    if (value === undefined || value === null) return '0,00';
    const num = typeof value === 'number' ? value : parseMeasureInput(value);
    if (isNaN(num)) return '0,00';
    return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatMeasureMask(value: string): string {
    const digits = value.replace(/\D/g, "");
    if (!digits) return "0,00";
    const numberValue = Number(digits) / 100;
    return numberValue.toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function formatDisplayBRL(value: number | string | undefined | null): string {
    if (value === undefined || value === null) return 'R$ 0,00';
    const num = typeof value === 'number' ? value : parseBRLToFloat(value);
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatItemDimensions(item: QuickSaleItem): string {
    const lenM = item.lengthCm !== undefined ? item.lengthCm / 100 : (item.length > 10 ? item.length / 100 : item.length);
    const widM = item.widthCm !== undefined ? item.widthCm / 100 : (item.width > 5 ? item.width / 100 : item.width);
    return `${lenM.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m x ${widM.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m`;
}

function calculatePaymentSplit(totalAmount: number) {
    const totalCents = Math.round(totalAmount * 100);
    const entradaCents = Math.floor(totalCents * 0.5);
    const saldoCents = totalCents - entradaCents;
    return {
        downPayment: entradaCents / 100,
        remainingBalance: saldoCents / 100
    };
}

export const QuickSaleForm: React.FC = () => {
    const { user, profile } = useAuth();
    const navigate = useNavigate();
    const { id } = useParams<{ id: string }>();
    const isEditMode = !!id;

    // Custom Hooks
    const { clients, addClient } = useClients();
    const { materials } = useMaterialCatalog();

    // Hooks - useState
    const [isLoading, setIsLoading] = useState(isEditMode);
    const [isSaving, setIsSaving] = useState(false);
    const [isItemFormOpen, setIsItemFormOpen] = useState(false);

    // Client State
    const [selectedClientId, setSelectedClientId] = useState<string>('');
    const [selectedClient, setSelectedClient] = useState<Client | null>(null);
    const [clientSearchTerm, setClientSearchTerm] = useState('');
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);

    // Inline New Client State
    const [isCreatingNewClient, setIsCreatingNewClient] = useState(false);
    const [newClientName, setNewClientName] = useState('');
    const [newClientPhone, setNewClientPhone] = useState('');
    const [newClientEmail, setNewClientEmail] = useState('');

    // Address State (used for Delivery or New Client)
    const [zipCode, setZipCode] = useState('');
    const [street, setStreet] = useState('');
    const [number, setNumber] = useState('');
    const [complement, setComplement] = useState('');
    const [neighborhood, setNeighborhood] = useState('');
    const [city, setCity] = useState('');
    const [state, setState] = useState('');
    const [cepWarning, setCepWarning] = useState('');

    // Quick Sale Items State
    const [items, setItems] = useState<QuickSaleItem[]>([]);
    const [activeItemIndex, setActiveItemIndex] = useState<number>(0);

    // New Item Form State (Current item being added/edited in detail)
    const [itemType, setItemType] = useState<QuickSaleItem['type']>('soleira');
    const [itemMaterial, setItemMaterial] = useState('');
    const [itemMaterialId, setItemMaterialId] = useState('');
    const [itemMaterialPricePerM2, setItemMaterialPricePerM2] = useState<number>(0);
    const [itemMaterialType, setItemMaterialType] = useState('');
    const [itemLength, setItemLength] = useState('1,00');
    const [itemWidth, setItemWidth] = useState('0,40');
    const [itemQuantity, setItemQuantity] = useState('1');
    const [itemUnitPrice, setItemUnitPrice] = useState('0');
    const [itemManualPriceOverride, setItemManualPriceOverride] = useState<boolean>(false);
    const [itemObservations, setItemObservations] = useState('');

    // Item Finishes Form State
    const [finishFrente, setFinishFrente] = useState('Sem acabamento');
    const [finishFundo, setFinishFundo] = useState('Sem acabamento');
    const [finishEsquerda, setFinishEsquerda] = useState('Sem acabamento');
    const [finishDireita, setFinishDireita] = useState('Sem acabamento');

    // Logistics & Dates State
    const [fulfillmentType, setFulfillmentType] = useState<'retirada' | 'entrega'>('retirada');
    const [deliveryFee, setDeliveryFee] = useState('');
    const [expectedPickupDate, setExpectedPickupDate] = useState('');
    const [expectedDeliveryDate, setExpectedDeliveryDate] = useState('');
    const [expectedTime, setExpectedTime] = useState('');

    const handlePickupDateChange = (val: string) => {
        setExpectedPickupDate(val);
        if (val) {
            const { dateKey, timeKey } = getSaoPauloDateTime();
            if (val < dateKey) {
                alert("A data prevista não pode ser anterior à data de hoje.");
                setExpectedPickupDate(dateKey);
                if (expectedTime && expectedTime < timeKey) {
                    setExpectedTime('');
                }
            } else if (val === dateKey && expectedTime && expectedTime < timeKey) {
                alert("O horário previsto não pode ser anterior ao horário atual.");
                setExpectedTime('');
            }
        }
    };

    const handleDeliveryDateChange = (val: string) => {
        setExpectedDeliveryDate(val);
        if (val) {
            const { dateKey, timeKey } = getSaoPauloDateTime();
            if (val < dateKey) {
                alert("A data prevista não pode ser anterior à data de hoje.");
                setExpectedDeliveryDate(dateKey);
                if (expectedTime && expectedTime < timeKey) {
                    setExpectedTime('');
                }
            } else if (val === dateKey && expectedTime && expectedTime < timeKey) {
                alert("O horário previsto não pode ser anterior ao horário atual.");
                setExpectedTime('');
            }
        }
    };

    const handleTimeChange = (val: string) => {
        setExpectedTime(val);
        if (val) {
            const targetDate = fulfillmentType === 'retirada' ? expectedPickupDate : expectedDeliveryDate;
            const { dateKey, timeKey } = getSaoPauloDateTime();
            if (targetDate === dateKey && val < timeKey) {
                alert("O horário previsto não pode ser anterior ao horário atual.");
                setExpectedTime('');
            }
        }
    };

    // Finance State
    const [status, setStatus] = useState<QuickSale['status']>('rascunho');
    const [paymentStatus, setPaymentStatus] = useState<QuickSale['paymentStatus']>('pendente');
    const [paymentMethod, setPaymentMethod] = useState('PIX');
    const [discount, setDiscount] = useState('');
    const [paymentCondition, setPaymentCondition] = useState('50_50');
    const [downPaymentAmount, setDownPaymentAmount] = useState('0,00');
    const [remainingBalanceAmount, setRemainingBalanceAmount] = useState('0,00');
    const [isManualPaymentOverride, setIsManualPaymentOverride] = useState(false);
    const [observations, setObservations] = useState('');
    const [protocolNumber, setProtocolNumber] = useState('');

    // Refs
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Hooks - useMemo
    const filteredClients = useMemo(() => {
        const term = selectedClient ? '' : clientSearchTerm.toLowerCase().trim();
        if (!term) return clients || [];
        
        const termWords = term.split(' ').filter(Boolean);
        
        return (clients || []).filter(c => {
            const displayInfo = getClientDisplayInfo(c);
            return termWords.every(w => displayInfo.searchText.includes(w));
        });
    }, [clients, clientSearchTerm, selectedClient]);

    const subtotal = useMemo(() => {
        return items.reduce((acc, item) => {
            const priceCents = Math.round((item.totalPrice || 0) * 100);
            return acc + priceCents;
        }, 0) / 100;
    }, [items]);

    const totalAmount = useMemo(() => {
        const subtotalCents = Math.round(subtotal * 100);
        const discountCents = Math.round(parseBRLToFloat(discount) * 100);
        const deliveryCents = Math.round((fulfillmentType === 'entrega' ? parseBRLToFloat(deliveryFee) : 0) * 100);

        const totalCents = subtotalCents - discountCents + deliveryCents;
        return Math.max(0, totalCents) / 100;
    }, [subtotal, discount, deliveryFee, fulfillmentType]);

    // Helper state populator (declared before useEffect)
    function populateItemForm(item: QuickSaleItem) {
        setItemType(item.type);
        setItemMaterial(item.materialName || item.material || '');
        setItemMaterialId(item.materialId || '');
        setItemMaterialPricePerM2(item.materialPricePerM2 || 0);
        setItemMaterialType(item.materialType || '');
        const lengthM = item.lengthCm !== undefined ? item.lengthCm / 100 : (item.length > 10 ? item.length / 100 : item.length);
        const widthM = item.widthCm !== undefined ? item.widthCm / 100 : (item.width > 5 ? item.width / 100 : item.width);
        setItemLength(formatMeasureInput(lengthM));
        setItemWidth(formatMeasureInput(widthM));
        setItemQuantity(String(item.quantity));
        setItemUnitPrice(formatFloatToBRL(item.unitPrice) || '0,00');
        setItemManualPriceOverride(item.manualPriceOverride !== undefined ? item.manualPriceOverride : false);
        setItemObservations(item.observations || '');
        setFinishFrente(item.finishes.frente || 'Sem acabamento');
        setFinishFundo(item.finishes.fundo || 'Sem acabamento');
        setFinishEsquerda(item.finishes.esquerda || 'Sem acabamento');
        setFinishDireita(item.finishes.direita || 'Sem acabamento');
    }

    // Hooks - useEffect
    useEffect(() => {
        if (import.meta.env.DEV) {
            console.log("QuickSaleForm mounted");
        }
    }, []);

    // Load data if editing
    useEffect(() => {
        if (!isEditMode || !id) return;

        const loadQuickSale = async () => {
            try {
                const docRef = doc(db, 'quick_sales', id);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    const data = docSnap.data() as QuickSale;
                    if (import.meta.env.DEV) {
                        console.log("QuickSale loaded data:", data);
                    }
                    
                    // Client details
                    if (data.clientId) {
                        setSelectedClientId(data.clientId);
                        const clientFound = (clients || []).find(c => c.id === data.clientId);
                        if (clientFound) {
                            setSelectedClient(clientFound);
                            setClientSearchTerm(clientFound.name || '');
                        } else {
                            setSelectedClient({
                                id: data.clientId,
                                name: data.clientName,
                                phone: data.clientPhone,
                                address: data.clientAddress,
                                zipCode: data.clientZipCode,
                                street: data.clientAddress?.split(',')[0] || '',
                                neighborhood: data.clientNeighborhood,
                                city: data.clientCity,
                                state: data.clientState,
                                userId: data.createdBy,
                                companyId: data.companyId,
                                createdAt: null
                            });
                            setClientSearchTerm(data.clientName);
                        }
                    } else {
                        setIsCreatingNewClient(true);
                        setNewClientName(data.clientName);
                        setNewClientPhone(data.clientPhone || '');
                        setZipCode(data.clientZipCode || '');
                        setStreet(data.clientAddress?.split(',')[0] || '');
                        setNumber(data.clientNumber || '');
                        setNeighborhood(data.clientNeighborhood || '');
                        setCity(data.clientCity || '');
                        setState(data.clientState || '');
                    }

                    setProtocolNumber(data.protocolNumber || '');
                    const itemsHydrated = (data.items || []).map(item => ({
                        ...item,
                        materialId: item.materialId || '',
                        materialName: item.materialName || item.material || '',
                        materialPricePerM2: item.materialPricePerM2 || 0,
                        materialType: item.materialType || '',
                        lengthCm: item.lengthCm !== undefined ? item.lengthCm : (item.length ? (item.length > 10 ? item.length : item.length * 100) : 0),
                        widthCm: item.widthCm !== undefined ? item.widthCm : (item.width ? (item.width > 5 ? item.width : item.width * 100) : 0),
                        thicknessCm: item.thicknessCm !== undefined ? item.thicknessCm : (item.thickness || 0),
                        areaM2: item.areaM2 !== undefined ? item.areaM2 : (((item.length || 0) * (item.width || 0)) / 10000),
                        totalAreaM2: item.totalAreaM2 !== undefined ? item.totalAreaM2 : ((((item.length || 0) * (item.width || 0)) / 10000) * (item.quantity || 1)),
                        materialTotal: item.materialTotal !== undefined ? item.materialTotal : (item.totalPrice || 0),
                        finishTotal: item.finishTotal !== undefined ? item.finishTotal : 0,
                        manualPriceOverride: item.manualPriceOverride !== undefined ? item.manualPriceOverride : false,
                    }));
                    setItems(itemsHydrated);
                    setFulfillmentType(data.fulfillmentType || 'retirada');
                    setDeliveryFee(data.deliveryFee ? formatFloatToBRL(data.deliveryFee) : '');
                    if (data.expectedPickupDate) setExpectedPickupDate(data.expectedPickupDate);
                    if (data.expectedDeliveryDate) {
                        setExpectedDeliveryDate(data.expectedDeliveryDate);
                        setZipCode(data.clientZipCode || '');
                        setStreet(data.clientAddress?.split(',')[0] || '');
                        setNumber(data.clientNumber || '');
                        setNeighborhood(data.clientNeighborhood || '');
                        setCity(data.clientCity || '');
                        setState(data.clientState || '');
                    }
                    setExpectedTime(data.expectedTime || '');
                    setStatus(data.status || 'rascunho');
                    setPaymentStatus(data.paymentStatus || 'pendente');
                    setPaymentMethod(data.paymentMethod || 'PIX');
                    setDiscount(data.discount ? formatFloatToBRL(data.discount) : '');
                    setObservations(data.observations || '');
                    setPaymentCondition(data.paymentCondition || '50_50');
                    if (data.paymentCondition === 'personalizado') {
                        setIsManualPaymentOverride(true);
                    } else {
                        setIsManualPaymentOverride(false);
                    }
                    setDownPaymentAmount(data.downPaymentAmount !== undefined ? formatFloatToBRL(data.downPaymentAmount) : '0,00');
                    setRemainingBalanceAmount(data.remainingBalanceAmount !== undefined ? formatFloatToBRL(data.remainingBalanceAmount) : '0,00');

                    if (itemsHydrated.length > 0) {
                        setActiveItemIndex(0);
                        populateItemForm(itemsHydrated[0]);
                    }
                } else {
                    alert('Pedido de Venda Rápida não encontrado.');
                    navigate('/vendas-rapidas');
                }
            } catch (err) {
                console.error('Error loading quick sale:', err);
                alert('Erro ao carregar os dados.');
            } finally {
                setIsLoading(false);
            }
        };

        loadQuickSale();
    }, [isEditMode, id, clients]);

    // Pricing calculation effect
    useEffect(() => {
        if (itemManualPriceOverride) return;

        const len = parseMeasureInput(itemLength);
        const wid = parseMeasureInput(itemWidth);
        const qty = Number(itemQuantity) || 0;
        
        if (
            itemMaterialId && 
            itemMaterialPricePerM2 > 0 && 
            len > 0 && 
            wid > 0 && 
            qty > 0
        ) {
            const areaM2 = len * wid;
            const computedUnitPrice = areaM2 * itemMaterialPricePerM2;
            setItemUnitPrice(formatFloatToBRL(computedUnitPrice));
        } else {
            setItemUnitPrice('');
        }
    }, [itemLength, itemWidth, itemQuantity, itemMaterialPricePerM2, itemManualPriceOverride, itemMaterialId]);

    // Payment Condition 50/50 automatic calculation effect
    useEffect(() => {
        if (!Number.isFinite(totalAmount)) return;
        if (!isManualPaymentOverride) {
            const { downPayment, remainingBalance } = calculatePaymentSplit(totalAmount);
            setDownPaymentAmount(formatFloatToBRL(downPayment));
            setRemainingBalanceAmount(formatFloatToBRL(remainingBalance));
        }
    }, [totalAmount, isManualPaymentOverride]);

    // Close client search on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Handlers
    const handleSelectClient = (client: Client) => {
        setSelectedClient(client);
        setSelectedClientId(client.id);
        setClientSearchTerm(client.name || '');
        setIsDropdownOpen(false);

        setZipCode(client.zipCode || '');
        setStreet(client.street || '');
        setNumber(client.number || '');
        setComplement(client.complement || '');
        setNeighborhood(client.neighborhood || '');
        setCity(client.city || '');
        setState(client.state || '');
    };

    const handleClearClient = () => {
        setSelectedClient(null);
        setSelectedClientId('');
        setClientSearchTerm('');
        setIsDropdownOpen(true);
    };

    const handleToggleNewClient = () => {
        const nextState = !isCreatingNewClient;
        setIsCreatingNewClient(nextState);
        if (nextState) {
            setSelectedClient(null);
            setSelectedClientId('');
            setClientSearchTerm('');
            setIsDropdownOpen(false);
        }
    };

    const handleZipCodeLookup = async (value: string) => {
        const cleanCEP = String(value || '').replace(/\D/g, '');
        setZipCode(cleanCEP);
        if (cleanCEP.length !== 8) return;

        try {
            const response = await fetch(`https://viacep.com.br/ws/${cleanCEP}/json/`);
            const data = await response.json();
            if (!data.erro) {
                setStreet(data.logradouro || '');
                setNeighborhood(data.bairro || '');
                setCity(data.localidade || '');
                setState(data.uf || '');
                setCepWarning('');
            } else {
                setCepWarning('CEP não encontrado.');
            }
        } catch (error) {
            console.error('Error fetching CEP:', error);
            setCepWarning('Erro ao buscar o CEP.');
        }
    };

    const handleSaveItemToList = () => {
        if (!itemType) {
            alert('Selecione o tipo da peça.');
            return;
        }

        if (!itemMaterial.trim() || !itemMaterialId) {
            alert('Selecione a pedra/material antes de adicionar a peça.');
            return;
        }

        const len = parseMeasureInput(itemLength);
        const wid = parseMeasureInput(itemWidth);
        const thick = 2;
        const qty = Number(itemQuantity) || 0;
        const price = parseBRLToFloat(itemUnitPrice);

        if (len <= 0) {
            alert('O comprimento deve ser maior que zero.');
            return;
        }
        if (wid <= 0) {
            alert('A largura deve ser maior que zero.');
            return;
        }
        if (qty <= 0) {
            alert('A quantidade deve ser maior que zero.');
            return;
        }

        const areaM2 = len * wid;
        const totalAreaM2 = areaM2 * qty;
        const materialPricePerM2 = itemMaterialPricePerM2;
        const materialTotalCents = Math.round(totalAreaM2 * materialPricePerM2 * 100);
        const materialTotal = materialTotalCents / 100;
        const finishTotal = 0;
        const unitPriceCents = Math.round(price * 100);
        const totalPriceCents = unitPriceCents * qty;
        const totalPrice = totalPriceCents / 100;

        if (status !== 'rascunho' && totalPrice <= 0) {
            alert('O valor total da peça deve ser maior que zero.');
            return;
        }

        setItems(prev => {
            const itemId = prev[activeItemIndex]?.id || generateUniqueId();
            const updatedItem: QuickSaleItem = {
                id: itemId,
                type: itemType,
                material: itemMaterial.trim(),
                length: len,
                width: wid,
                thickness: thick,
                quantity: qty,
                unitPrice: price,
                totalPrice: totalPrice,
                observations: itemObservations,
                finishes: {
                    frente: finishFrente,
                    fundo: finishFundo,
                    esquerda: finishEsquerda,
                    direita: finishDireita
                },
                materialId: itemMaterialId,
                materialName: itemMaterial.trim(),
                materialPricePerM2: materialPricePerM2,
                materialType: itemMaterialType || '',
                lengthCm: len * 100,
                widthCm: wid * 100,
                thicknessCm: thick,
                areaM2: Number(areaM2.toFixed(4)),
                totalAreaM2: Number(totalAreaM2.toFixed(4)),
                materialTotal: materialTotal,
                finishTotal: finishTotal,
                manualPriceOverride: itemManualPriceOverride
            };

            const newList = [...prev];
            if (activeItemIndex < prev.length) {
                newList[activeItemIndex] = updatedItem;
            } else {
                newList.push(updatedItem);
            }
            return newList;
        });

        setIsItemFormOpen(false);
        alert('Item salvo com sucesso na lista do pedido.');
    };

    const handleAddNewItemPlaceholder = () => {
        setItemType('soleira');
        setItemMaterial('');
        setItemMaterialId('');
        setItemMaterialPricePerM2(0);
        setItemMaterialType('');
        setItemLength('1,00');
        setItemWidth('0,40');
        setItemQuantity('1');
        setItemUnitPrice('0,00');
        setItemManualPriceOverride(false);
        setItemObservations('');
        setFinishFrente('Sem acabamento');
        setFinishFundo('Sem acabamento');
        setFinishEsquerda('Sem acabamento');
        setFinishDireita('Sem acabamento');

        setActiveItemIndex(items.length);
        setIsItemFormOpen(true);
    };

    const handleSelectItemFromList = (index: number) => {
        setActiveItemIndex(index);
        populateItemForm(items[index]);
        setIsItemFormOpen(true);
    };

    const handleDeleteItemFromList = (index: number, e: React.MouseEvent) => {
        e.stopPropagation();
        const filtered = items.filter((_, i) => i !== index);
        setItems(filtered);
        
        const nextIndex = Math.max(0, filtered.length - 1);
        setActiveItemIndex(nextIndex);
        if (filtered.length > 0) {
            populateItemForm(filtered[nextIndex]);
        } else {
            handleAddNewItemPlaceholder();
        }
    };

    // Submit handler
    const handleSave = async (isDraft: boolean) => {
        // Timezone validation for fulfillment date and time
        const targetDate = fulfillmentType === 'retirada' ? expectedPickupDate : expectedDeliveryDate;
        if (targetDate) {
            const { dateKey, timeKey } = getSaoPauloDateTime();
            if (targetDate < dateKey) {
                alert("A data prevista não pode ser anterior à data de hoje.");
                return;
            }
            if (targetDate === dateKey && expectedTime) {
                if (expectedTime < timeKey) {
                    alert("O horário previsto não pode ser anterior ao horário atual.");
                    return;
                }
            }
        }

        // Parse monetary values using cents
        const subtotalCents = Math.round(subtotal * 100);
        const discountCents = Math.round(parseBRLToFloat(discount) * 100);
        const deliveryCents = Math.round((fulfillmentType === 'entrega' ? parseBRLToFloat(deliveryFee) : 0) * 100);

        // Desconto não pode ser maior que subtotal + frete
        if (discountCents > (subtotalCents + deliveryCents)) {
            alert("O desconto não pode ser maior que o total da venda.");
            return;
        }

        const totalAmountCents = subtotalCents - discountCents + deliveryCents;
        const finalTotalAmount = Math.max(0, totalAmountCents) / 100;
        const finalSubtotal = subtotalCents / 100;
        const finalDiscount = discountCents / 100;
        const finalDeliveryFee = deliveryCents / 100;

        const parsedDownPayment = parseBRLToFloat(downPaymentAmount);
        if (parsedDownPayment > finalTotalAmount) {
            alert("A entrada não pode ser maior que o total da venda.");
            return;
        }

        // Strict validation for final sale
        if (!isDraft) {
            // 1. Cliente obrigatório
            const hasNewClient = isCreatingNewClient && newClientName.trim() !== '' && newClientPhone.trim() !== '';
            const hasExistingClient = !isCreatingNewClient && selectedClient !== null && selectedClient !== undefined;

            if (!hasNewClient && !hasExistingClient) {
                alert("Selecione ou cadastre um cliente antes de salvar a venda.");
                return;
            }

            // 2. Pelo menos uma peça
            if (items.length === 0) {
                alert("Adicione pelo menos uma peça antes de finalizar a venda.");
                return;
            }

            // 3. Material nas peças
            if (items.some(item => !item.materialId || !item.materialName)) {
                alert("Todos os itens devem ter um material selecionado.");
                return;
            }
            if (items.some(item => (item.totalPrice || 0) <= 0)) {
                alert("Todos os itens devem ter um valor total maior que zero para a venda final.");
                return;
            }

            // 4. totalAmount > 0
            if (finalTotalAmount <= 0) {
                alert("Não é possível salvar uma venda final com valor total igual a R$ 0,00. Para salvar sem preço, salve como Rascunho.");
                return;
            }

            // 5. Retirada ou entrega preenchida
            if (fulfillmentType === 'retirada') {
                if (!expectedPickupDate) {
                    alert("Informe a data prevista de retirada.");
                    return;
                }
            } else {
                if (!expectedDeliveryDate) {
                    alert("Informe a data prevista de entrega.");
                    return;
                }
                if (!street.trim() || !number.trim() || !neighborhood.trim() || !city.trim() || !state.trim()) {
                    alert("Preencha todos os campos do endereço e data de entrega.");
                    return;
                }
            }

            // 6. Forma de pagamento
            if (!paymentMethod) {
                alert("Selecione a forma de pagamento.");
                return;
            }
        }

        // Validate and setup client info for saving
        let clientName = '';
        let clientPhone = '';
        let clientEmail = '';
        let finalClientId = selectedClientId;

        if (isCreatingNewClient) {
            clientName = newClientName.trim() || (isDraft ? 'Rascunho Sem Nome' : '');
            clientPhone = newClientPhone.trim();
            clientEmail = newClientEmail.trim();
        } else {
            if (selectedClient) {
                clientName = selectedClient.name;
                clientPhone = selectedClient.phone || '';
                clientEmail = selectedClient.email || '';
            } else {
                clientName = isDraft ? 'Rascunho Sem Nome' : '';
            }
        }

        // Address compiled
        const cleanNumber = number.trim();
        const compiledAddress = `${street}${cleanNumber ? `, ${cleanNumber}` : ''}${complement ? ` - ${complement}` : ''}${neighborhood ? ` - ${neighborhood}` : ''}${city ? ` - ${city}` : ''}${state ? ` - ${state}` : ''}`;

        setIsSaving(true);

        try {
            // 1. Create client in DB if new (and client name is filled)
            if (isCreatingNewClient && !isEditMode && clientName && clientName !== 'Rascunho Sem Nome') {
                const generatedClientId = await addClient({
                    name: clientName,
                    phone: clientPhone,
                    email: clientEmail,
                    zipCode,
                    street,
                    number: cleanNumber,
                    complement,
                    neighborhood,
                    city,
                    state,
                    status: 'active'
                });
                finalClientId = generatedClientId;
            }

            // 2. Generate protocol code if creating
            let finalProtocol = protocolNumber;
            if (!isEditMode) {
                if (!profile?.companyId) throw new Error('Company ID not found in profile.');
                finalProtocol = await getNextQuickSaleProtocolNumber(profile.companyId);
            }

            // Determine status based on logistics and payment
            let finalStatus: QuickSale['status'] = status;
            if (isDraft) {
                finalStatus = 'rascunho';
            } else if (status === 'rascunho') {
                finalStatus = paymentStatus === 'pago' ? 'pago' : 'aguardando_pagamento';
            }

            const saleData = {
                companyId: profile?.companyId,
                protocolNumber: finalProtocol,
                status: finalStatus,
                paymentStatus: isDraft ? 'pendente' : paymentStatus,
                clientId: finalClientId || null,
                clientName,
                clientPhone,
                clientAddress: compiledAddress,
                clientZipCode: zipCode || null,
                clientNumber: cleanNumber || null,
                clientNeighborhood: neighborhood || null,
                clientCity: city || null,
                clientState: state || null,
                fulfillmentType,
                deliveryFee: finalDeliveryFee,
                expectedPickupDate: fulfillmentType === 'retirada' ? expectedPickupDate : null,
                expectedDeliveryDate: fulfillmentType === 'entrega' ? expectedDeliveryDate : null,
                expectedTime: expectedTime || null,
                paymentCondition,
                paymentConditionLabel: paymentCondition === '50_50' ? '50% no ato e 50% na retirada/entrega' : 'Personalizado',
                downPaymentAmount: parsedDownPayment,
                remainingBalanceAmount: parseBRLToFloat(remainingBalanceAmount),
                paymentMethod,
                paymentDate: (!isDraft && paymentStatus === 'pago') ? new Date().toISOString() : null,
                subtotal: finalSubtotal,
                discount: finalDiscount,
                totalAmount: finalTotalAmount,
                items,
                observations,
                updatedAt: serverTimestamp(),
                createdBy: user?.uid,
                createdByName: profile?.name || 'Sistema'
            };

            if (isEditMode && id) {
                const docRef = doc(db, 'quick_sales', id);
                await updateDoc(docRef, saleData);
                alert('Pedido de Venda Rápida atualizado com sucesso!');
            } else {
                const docRef = await addDoc(collection(db, 'quick_sales'), {
                    ...saleData,
                    createdAt: serverTimestamp()
                });
                alert(`Pedido de Venda Rápida #${finalProtocol} criado com sucesso!`);
            }

            navigate('/vendas-rapidas');
        } catch (err) {
            console.error('Error saving quick sale:', err);
            alert('Ocorreu um erro ao salvar a venda rápida.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        await handleSave(false);
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="w-10 h-10 border-4 border-brand-emerald border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="flex flex-col bg-slate-50 dark:bg-[#050505] p-6 gap-6 min-h-screen">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => navigate('/vendas-rapidas')}
                    className="h-10 w-10 p-0 rounded-xl"
                >
                    <ArrowLeft className="h-5 w-5" />
                </Button>
                <div>
                    <h1 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">
                        {isEditMode ? `Editar Venda Rápida #${protocolNumber}` : 'Nova Venda Rápida'}
                    </h1>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                        Mapeamento instantâneo de soleiras, baguetes e peças retas
                    </p>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* LEFT COLUMNS: CLIENT & LOGISTICS & ITEMS */}
                <div className="lg:col-span-2 space-y-6">

                    {/* SECTION 1: CLIENT IDENTIFICATION */}
                    <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-xs font-black uppercase tracking-widest text-slate-800 dark:text-slate-200">
                                1. Identificação do Cliente
                            </h3>
                            <button
                                type="button"
                                onClick={handleToggleNewClient}
                                className="text-[10px] font-black uppercase text-emerald-600 hover:text-emerald-700 underline"
                            >
                                {isCreatingNewClient ? 'Selecionar da base' : 'Cadastrar Novo na Venda'}
                            </button>
                        </div>

                        {isCreatingNewClient ? (
                            <div className="space-y-4 p-4 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl bg-slate-50/50 dark:bg-slate-950/20 animate-in fade-in duration-300">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-slate-400 uppercase">Nome Completo *</label>
                                        <Input 
                                            value={newClientName} 
                                            onChange={(e) => setNewClientName(e.target.value)} 
                                            required={isCreatingNewClient} 
                                            placeholder="Nome do cliente" 
                                            className="h-11 rounded-xl"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-slate-400 uppercase">Telefone / WhatsApp</label>
                                        <Input 
                                            value={newClientPhone} 
                                            onChange={(e) => setNewClientPhone(e.target.value)} 
                                            placeholder="(11) 99999-9999" 
                                            className="h-11 rounded-xl"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-slate-400 uppercase">E-mail</label>
                                        <Input 
                                            value={newClientEmail} 
                                            onChange={(e) => setNewClientEmail(e.target.value)} 
                                            placeholder="cliente@email.com" 
                                            className="h-11 rounded-xl"
                                        />
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="relative" ref={dropdownRef}>
                                <div className="relative flex items-center">
                                    <Search className="absolute left-4 h-4 w-4 text-slate-400" />
                                    <Input
                                        type="text"
                                        placeholder="Digite o nome ou telefone do cliente..."
                                        value={selectedClient ? selectedClient.name : clientSearchTerm}
                                        onChange={(e) => {
                                            setClientSearchTerm(e.target.value);
                                            setIsDropdownOpen(true);
                                            if (selectedClient) {
                                                setSelectedClient(null);
                                                setSelectedClientId('');
                                            }
                                        }}
                                        onClick={() => setIsDropdownOpen(true)}
                                        className="pl-11 pr-28 h-12 rounded-2xl font-bold bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800 focus:border-brand-emerald"
                                    />
                                    {selectedClient && (
                                        <button
                                            type="button"
                                            onClick={handleClearClient}
                                            className="absolute right-3 px-2 py-1 text-[10px] uppercase font-black bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-600 dark:text-slate-300 rounded-lg transition-colors"
                                        >
                                            Trocar
                                        </button>
                                    )}
                                </div>

                                {isDropdownOpen && !isCreatingNewClient && (
                                    <div className="absolute z-50 mt-2 w-full min-w-[300px] rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl p-2 max-h-[250px] overflow-y-auto">
                                        {filteredClients.length > 0 ? (
                                            filteredClients.map((c) => {
                                                const displayInfo = getClientDisplayInfo(c);
                                                return (
                                                    <div
                                                        key={c.id}
                                                        onClick={() => handleSelectClient(c)}
                                                        className="px-4 py-3 rounded-xl cursor-pointer text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors mb-0.5"
                                                    >
                                                        <div className="flex flex-col">
                                                            <span className="font-bold text-slate-800 dark:text-slate-200">{displayInfo.name}</span>
                                                            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wide mt-1">
                                                                {displayInfo.formattedPhone}
                                                            </span>
                                                            {displayInfo.addressLabel && (
                                                                <span className="text-[9px] text-slate-400 font-medium uppercase mt-0.5 tracking-wide">
                                                                    {displayInfo.addressLabel}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        ) : (
                                            <div className="px-3 py-6 text-center text-slate-400 text-sm">
                                                Nenhum cliente encontrado
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* SECTION 2: PIECES LIST & TECHNICAL DRAWER */}
                    <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 space-y-6">
                        <div className="flex items-center justify-between">
                            <h3 className="text-xs font-black uppercase tracking-widest text-slate-800 dark:text-slate-200">
                                2. Configuração das Peças
                            </h3>
                            <Button 
                                type="button" 
                                size="sm" 
                                onClick={handleAddNewItemPlaceholder}
                                className="h-8 px-3 text-[9px] font-black uppercase tracking-widest bg-slate-900 text-white hover:bg-black rounded-lg gap-1.5"
                            >
                                <Plus className="h-3.5 w-3.5" /> Adicionar Peça
                            </Button>
                        </div>

                        {/* List of current pieces */}
                        {items.length > 0 ? (
                            <div className="flex flex-wrap gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
                                {items.map((item, idx) => (
                                    <div
                                        key={item.id}
                                        onClick={() => handleSelectItemFromList(idx)}
                                        className={cn(
                                            "flex items-center gap-3 px-4 py-2.5 rounded-xl border-2 cursor-pointer transition-all",
                                            activeItemIndex === idx 
                                                ? "border-emerald-500 bg-emerald-50/50 text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-400 font-bold"
                                                : "border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                                        )}
                                    >
                                        <div className="flex flex-col leading-none">
                                            <span className="text-[10px] uppercase font-black">{item.type} {idx + 1}</span>
                                            <span className="text-[9px] text-slate-400 font-bold mt-1">{formatItemDimensions(item)} • {item.quantity}x</span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={(e) => handleDeleteItemFromList(idx, e)}
                                            className="text-slate-400 hover:text-rose-500 transition-colors"
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-6 text-xs text-slate-400 font-bold uppercase tracking-wider bg-slate-50 dark:bg-slate-950/20 rounded-2xl">
                                Nenhuma peça na lista. Configure os detalhes abaixo para adicionar.
                            </div>
                        )}

                        {/* Config Form for Active Item */}
                        {isItemFormOpen && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                                {/* Editor Fields */}
                                <div className="space-y-4">
                                    <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                                        Detalhamento da Peça {activeItemIndex + 1}
                                    </h4>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-slate-400 uppercase">Tipo de Peça</label>
                                            <select
                                                value={itemType}
                                                onChange={(e) => setItemType(e.target.value as any)}
                                                className="flex h-11 w-full rounded-xl border-2 border-slate-100 bg-white dark:bg-slate-900 px-3 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-brand-emerald"
                                            >
                                                <option value="soleira">Soleira</option>
                                                <option value="baguete">Baguete</option>
                                                <option value="pingadeira">Pingadeira</option>
                                                <option value="peitoril">Peitoril</option>
                                                <option value="filete">Filete</option>
                                                <option value="rodapé">Rodapé</option>
                                                <option value="outro">Outro (Peça Avulsa)</option>
                                            </select>
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-slate-400 uppercase">Pedra / Material</label>
                                            <SearchableSelect
                                                options={(materials || []).map(m => ({
                                                    value: m.name,
                                                    label: m.name,
                                                    description: m.price ? `R$ ${m.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/m²` : 'Sem preço cadastrado'
                                                }))}
                                                value={itemMaterial}
                                                onChange={(val) => {
                                                    setItemMaterial(val);
                                                    const selectedMat = (materials || []).find(m => m.name === val);
                                                    if (selectedMat) {
                                                        setItemMaterialId(selectedMat.id);
                                                        const price = selectedMat.price || 0;
                                                        setItemMaterialPricePerM2(price);
                                                        setItemMaterialType(selectedMat.type || '');
                                                        // If price is 0, auto-enable manual override and alert
                                                        if (price <= 0) {
                                                            setItemManualPriceOverride(true);
                                                            alert("Este material não possui preço cadastrado. Informe o valor manualmente.");
                                                        }
                                                    } else {
                                                        setItemMaterialId('');
                                                        setItemMaterialPricePerM2(0);
                                                        setItemMaterialType('');
                                                        setItemManualPriceOverride(true);
                                                    }
                                                }}
                                                placeholder="Selecione o material..."
                                                compact={true}
                                            />
                                            {itemMaterialId && itemMaterialPricePerM2 > 0 && (
                                                <div className="text-[10px] font-bold text-slate-500 uppercase mt-1">
                                                    Preço do m² da pedra: {formatDisplayBRL(itemMaterialPricePerM2)}
                                                </div>
                                            )}
                                            {itemMaterialId && itemMaterialPricePerM2 <= 0 && (
                                                <div className="mt-1 px-3 py-2 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 rounded-xl text-[10px] text-amber-700 dark:text-amber-400 font-bold uppercase tracking-wider flex items-center gap-1.5 animate-in fade-in duration-200">
                                                    ⚠️ Este material não possui preço cadastrado.
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-3 gap-2">
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-slate-400 uppercase">Compr. (m)</label>
                                            <Input 
                                                type="text" 
                                                value={itemLength} 
                                                onChange={(e) => setItemLength(formatMeasureMask(e.target.value))} 
                                                onBlur={() => {
                                                    const val = parseMeasureInput(itemLength);
                                                    setItemLength(formatMeasureInput(val));
                                                }}
                                                className="h-10 rounded-lg text-xs font-bold" 
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-slate-400 uppercase">Larg. (m)</label>
                                            <Input 
                                                type="text" 
                                                value={itemWidth} 
                                                onChange={(e) => setItemWidth(formatMeasureMask(e.target.value))} 
                                                onBlur={() => {
                                                    const val = parseMeasureInput(itemWidth);
                                                    setItemWidth(formatMeasureInput(val));
                                                }}
                                                className="h-10 rounded-lg text-xs font-bold" 
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-slate-400 uppercase">Qtd (Peças)</label>
                                            <Input type="number" min="1" value={itemQuantity} onChange={(e) => setItemQuantity(e.target.value)} className="h-10 rounded-lg text-xs" />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-slate-400 uppercase">Valor de 1 peça (R$)</label>
                                            <Input
                                                type="text"
                                                inputMode="decimal"
                                                value={itemUnitPrice}
                                                onChange={(e) => setItemUnitPrice(cleanMonetaryInput(e.target.value))}
                                                onBlur={() => {
                                                    const val = parseBRLToFloat(itemUnitPrice);
                                                    setItemUnitPrice(formatFloatToBRL(val));
                                                }}
                                                disabled={!itemManualPriceOverride}
                                                className="h-11 rounded-xl font-black text-xs disabled:bg-slate-50 dark:disabled:bg-slate-950/40 disabled:opacity-75"
                                            />
                                            <div className="flex items-center gap-2 py-1">
                                                <input
                                                    type="checkbox"
                                                    id="manualPriceOverride"
                                                    checked={itemManualPriceOverride}
                                                    onChange={(e) => setItemManualPriceOverride(e.target.checked)}
                                                    className="rounded border-slate-200 dark:border-slate-800 text-brand-emerald focus:ring-brand-emerald h-4 w-4"
                                                />
                                                <label htmlFor="manualPriceOverride" className="text-[10px] font-bold text-slate-500 uppercase cursor-pointer select-none">
                                                    Editar valor manualmente
                                                </label>
                                            </div>
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-slate-400 uppercase">Valor total considerando quantidade</label>
                                            <div className="flex h-11 items-center px-4 bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-900 rounded-xl text-xs font-black text-slate-700 dark:text-slate-300">
                                                {formatDisplayBRL(parseBRLToFloat(itemUnitPrice) * (Number(itemQuantity) || 0))}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Edge Finishes selectors */}
                                    <div className="space-y-2 pt-2">
                                        <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                                            Acabamentos por Lado
                                        </label>
                                        <div className="grid grid-cols-2 gap-2 text-xs font-bold">
                                            {[
                                                { label: 'Frente', value: finishFrente, setter: setFinishFrente },
                                                { label: 'Fundo', value: finishFundo, setter: setFinishFundo },
                                                { label: 'Esquerda', value: finishEsquerda, setter: setFinishEsquerda },
                                                { label: 'Direita', value: finishDireita, setter: setFinishDireita }
                                            ].map((side) => (
                                                <div key={side.label} className="flex flex-col gap-1">
                                                    <span className="text-[9px] uppercase font-bold text-slate-400">{side.label}</span>
                                                    <select
                                                        value={side.value}
                                                        onChange={(e) => side.setter(e.target.value)}
                                                        className="flex h-9 w-full rounded-lg border border-slate-100 bg-white dark:bg-slate-900 px-2 text-[11px] focus:outline-none"
                                                    >
                                                        <option value="Sem acabamento">Sem acabamento</option>
                                                        <option value="Reto">Reto / 2cm</option>
                                                        <option value="Boleado">Boleado</option>
                                                        <option value="Bisotê">Bisotê</option>
                                                        <option value="Meia cana">Meia cana</option>
                                                        <option value="45°">Acabamento 45°</option>
                                                        <option value="Polido">Polido</option>
                                                        <option value="Pingadeira / Canal">Pingadeira / Canal</option>
                                                        <option value="Outro">Outro</option>
                                                    </select>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-slate-400 uppercase">Observações da Peça</label>
                                        <textarea
                                            value={itemObservations}
                                            onChange={(e) => setItemObservations(e.target.value)}
                                            placeholder="Especificações do corte, rebaixo etc..."
                                            className="w-full min-h-[60px] rounded-xl border-2 border-slate-100 bg-white dark:bg-slate-900 p-3 text-xs font-medium focus:outline-none"
                                        />
                                    </div>

                                    <div className="flex gap-2">
                                        <Button 
                                            type="button" 
                                            onClick={handleSaveItemToList}
                                            className="flex-1 h-11 bg-slate-900 text-white dark:bg-white dark:text-slate-900 rounded-xl font-bold text-xs uppercase tracking-widest"
                                        >
                                            Salvar Peça no Pedido
                                        </Button>
                                        <Button 
                                            type="button" 
                                            variant="ghost"
                                            onClick={() => setIsItemFormOpen(false)}
                                            className="h-11 px-4 border border-slate-200 dark:border-slate-800 rounded-xl font-bold text-xs uppercase text-slate-500 hover:text-rose-600 dark:hover:text-rose-450 hover:bg-rose-50/50"
                                        >
                                            Cancelar edição
                                        </Button>
                                    </div>
                                </div>

                                {/* Live Drawing Preview */}
                                <div className="flex flex-col items-center justify-center p-4">
                                    <QuickSalePieceDrawing 
                                        length={parseMeasureInput(itemLength)}
                                        width={parseMeasureInput(itemWidth)}
                                        type={itemType}
                                        material={itemMaterial || 'Stone'}
                                        quantity={Number(itemQuantity) || 1}
                                        thickness={2}
                                        finishes={{
                                            frente: finishFrente,
                                            fundo: finishFundo,
                                            esquerda: finishEsquerda,
                                            direita: finishDireita
                                        }}
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* RIGHT COLUMN: LOGISTICS, FINANCE & SAVING */}
                <div className="space-y-6">

                    {/* LOGISTICS CARD */}
                    <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 space-y-4">
                        <h3 className="text-xs font-black uppercase tracking-widest text-slate-800 dark:text-slate-200">
                            3. Logística e Entrega
                        </h3>

                        <div className="flex bg-slate-100 dark:bg-slate-950 p-1 rounded-xl border border-slate-200/50">
                            <button
                                type="button"
                                onClick={() => setFulfillmentType('retirada')}
                                className={cn(
                                    "flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all",
                                    fulfillmentType === 'retirada' ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow" : "text-slate-400"
                                )}
                            >
                                Cliente Retira
                            </button>
                            <button
                                type="button"
                                onClick={() => setFulfillmentType('entrega')}
                                className={cn(
                                    "flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all",
                                    fulfillmentType === 'entrega' ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow" : "text-slate-400"
                                )}
                            >
                                Marmoraria Entrega
                            </button>
                        </div>

                        {fulfillmentType === 'retirada' ? (
                            <div className="space-y-3 animate-in fade-in duration-300">
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1.5">
                                            <Calendar className="h-3.5 w-3.5" /> Data Prevista de Retirada
                                        </label>
                                        <Input 
                                            type="date" 
                                            value={expectedPickupDate} 
                                            onChange={(e) => handlePickupDateChange(e.target.value)} 
                                            min={getSaoPauloDateTime().dateKey}
                                            required={fulfillmentType === 'retirada'}
                                            className="h-11 rounded-xl text-xs" 
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1.5">
                                            <Clock className="h-3.5 w-3.5 text-slate-400" /> Horário Previsto
                                        </label>
                                        <Input 
                                            type="time" 
                                            value={expectedTime} 
                                            onChange={(e) => handleTimeChange(e.target.value)} 
                                            className="h-11 rounded-xl text-xs" 
                                        />
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-3 animate-in fade-in duration-300">
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1 col-span-1">
                                        <label className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1.5">
                                            <Calendar className="h-3.5 w-3.5" /> Data Prevista de Entrega
                                        </label>
                                        <Input 
                                            type="date" 
                                            value={expectedDeliveryDate} 
                                            onChange={(e) => handleDeliveryDateChange(e.target.value)} 
                                            min={getSaoPauloDateTime().dateKey}
                                            required={fulfillmentType === 'entrega'}
                                            className="h-11 rounded-xl text-xs" 
                                        />
                                    </div>
                                    <div className="space-y-1 col-span-1">
                                        <label className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1.5">
                                            <Clock className="h-3.5 w-3.5 text-slate-400" /> Horário Previsto
                                        </label>
                                        <Input 
                                            type="time" 
                                            value={expectedTime} 
                                            onChange={(e) => handleTimeChange(e.target.value)} 
                                            className="h-11 rounded-xl text-xs" 
                                        />
                                    </div>
                                    <div className="space-y-1 col-span-2">
                                        <label className="text-[10px] font-bold text-slate-400 uppercase">Taxa de Entrega / Frete (R$)</label>
                                        <Input 
                                            type="text" 
                                            inputMode="decimal"
                                            value={deliveryFee} 
                                            onChange={(e) => setDeliveryFee(cleanMonetaryInput(e.target.value))} 
                                            onBlur={() => {
                                                const val = parseBRLToFloat(deliveryFee);
                                                setDeliveryFee(formatFloatToBRL(val));
                                            }}
                                            className="h-11 rounded-xl text-xs font-bold" 
                                        />
                                    </div>
                                </div>

                                <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                                    <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-wider flex items-center gap-1.5">
                                        <MapPin className="h-3.5 w-3.5 text-brand-emerald" /> Endereço Completo de Entrega
                                    </h4>

                                    <div className="grid grid-cols-1 gap-3">
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-slate-400 uppercase">CEP</label>
                                            <Input 
                                                value={zipCode} 
                                                onChange={(e) => handleZipCodeLookup(e.target.value)} 
                                                placeholder="00000-000" 
                                                className="h-10 rounded-lg text-xs" 
                                            />
                                            {cepWarning && <p className="text-[9px] text-rose-500 font-bold">{cepWarning}</p>}
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-slate-400 uppercase">Logradouro *</label>
                                            <Input 
                                                value={street} 
                                                onChange={(e) => setStreet(e.target.value)} 
                                                required={fulfillmentType === 'entrega'} 
                                                placeholder="Rua, Avenida..." 
                                                className="h-10 rounded-lg text-xs" 
                                            />
                                        </div>
                                        <div className="grid grid-cols-3 gap-2">
                                            <div className="space-y-1 col-span-1">
                                                <label className="text-[10px] font-bold text-slate-400 uppercase">Nº *</label>
                                                <Input 
                                                    value={number} 
                                                    onChange={(e) => setNumber(e.target.value)} 
                                                    required={fulfillmentType === 'entrega'} 
                                                    placeholder="123" 
                                                    className="h-10 rounded-lg text-xs" 
                                                />
                                            </div>
                                            <div className="space-y-1 col-span-2">
                                                <label className="text-[10px] font-bold text-slate-400 uppercase">Complemento</label>
                                                <Input 
                                                    value={complement} 
                                                    onChange={(e) => setComplement(e.target.value)} 
                                                    placeholder="Apto, Bloco..." 
                                                    className="h-10 rounded-lg text-xs" 
                                                />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-bold text-slate-400 uppercase">Bairro *</label>
                                                <Input 
                                                    value={neighborhood} 
                                                    onChange={(e) => setNeighborhood(e.target.value)} 
                                                    required={fulfillmentType === 'entrega'} 
                                                    placeholder="Bairro" 
                                                    className="h-10 rounded-lg text-xs" 
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-bold text-slate-400 uppercase">Cidade / UF *</label>
                                                <div className="flex gap-1.5">
                                                    <Input 
                                                        value={city} 
                                                        onChange={(e) => setCity(e.target.value)} 
                                                        required={fulfillmentType === 'entrega'} 
                                                        placeholder="Cidade" 
                                                        className="h-10 rounded-lg text-xs flex-1" 
                                                    />
                                                    <Input 
                                                        value={state} 
                                                        onChange={(e) => setState(e.target.value)} 
                                                        required={fulfillmentType === 'entrega'} 
                                                        placeholder="UF" 
                                                        className="h-10 rounded-lg text-xs w-10 uppercase text-center" 
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* FINANCIAL DETAILS CARD */}
                    <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 space-y-4">
                        <h3 className="text-xs font-black uppercase tracking-widest text-slate-800 dark:text-slate-200">
                            4. Financeiro e Cobrança
                        </h3>

                        <div className="space-y-2.5 text-xs font-bold text-slate-600 dark:text-slate-400">
                            <div className="flex justify-between items-center">
                                <span>Subtotal</span>
                                <span className="text-slate-900 dark:text-white">{subtotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                            </div>
                            {fulfillmentType === 'entrega' && (
                                <div className="flex justify-between items-center text-blue-500">
                                    <span>Taxa de Entrega</span>
                                    <span>+ {formatDisplayBRL(parseBRLToFloat(deliveryFee))}</span>
                                </div>
                            )}
                            <div className="flex flex-col gap-1 text-rose-500">
                                <div className="flex justify-between items-center gap-4">
                                    <span>Desconto Especial (R$)</span>
                                    <Input 
                                        type="text" 
                                        inputMode="decimal"
                                        value={discount} 
                                        onChange={(e) => setDiscount(cleanMonetaryInput(e.target.value))} 
                                        onBlur={() => {
                                            const val = parseBRLToFloat(discount);
                                            setDiscount(formatFloatToBRL(val));
                                        }}
                                        className="h-9 w-28 text-right text-xs text-rose-600 font-extrabold" 
                                    />
                                </div>
                                {Math.round(parseBRLToFloat(discount) * 100) > (Math.round(subtotal * 100) + Math.round((fulfillmentType === 'entrega' ? parseBRLToFloat(deliveryFee) : 0) * 100)) && (
                                    <p className="text-[9px] text-rose-500 font-bold text-right uppercase mt-0.5">
                                        O desconto não pode ser maior que o total da venda.
                                    </p>
                                )}
                            </div>
                            <div className="h-px bg-slate-100 dark:bg-slate-800 my-2" />
                            <div className="flex justify-between items-center text-sm font-black">
                                <span className="text-slate-900 dark:text-white uppercase tracking-tight">Valor Total do Pedido</span>
                                <span className="text-emerald-500 text-base tabular-nums">{totalAmount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                            </div>
                        </div>

                        <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-slate-400 uppercase">Forma de Pagamento</label>
                                <select
                                    value={paymentMethod}
                                    onChange={(e) => setPaymentMethod(e.target.value)}
                                    className="flex h-11 w-full rounded-xl border-2 border-slate-100 bg-white dark:bg-slate-900 px-3 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-brand-emerald"
                                >
                                    <option value="PIX">PIX</option>
                                    <option value="Dinheiro">Dinheiro</option>
                                    <option value="Cartão de Crédito">Cartão de Crédito</option>
                                    <option value="Cartão de Débito">Cartão de Débito</option>
                                    <option value="Boleto">Boleto Bancário</option>
                                    <option value="Transferência">TED / DOC</option>
                                </select>
                            </div>

                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-slate-400 uppercase">Condição de Pagamento</label>
                                <select
                                    value={paymentCondition}
                                    onChange={(e) => {
                                        const cond = e.target.value;
                                        setPaymentCondition(cond);
                                        if (cond === '50_50') {
                                            setIsManualPaymentOverride(false);
                                        } else {
                                            setIsManualPaymentOverride(true);
                                        }
                                    }}
                                    className="flex h-11 w-full rounded-xl border-2 border-slate-100 bg-white dark:bg-slate-900 px-3 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-brand-emerald"
                                >
                                    <option value="50_50">50% no ato e 50% na retirada/entrega</option>
                                    <option value="personalizado">Personalizado</option>
                                </select>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase">Entrada Paga (R$)</label>
                                    <Input
                                        type="text"
                                        inputMode="decimal"
                                        value={downPaymentAmount}
                                        disabled={!isManualPaymentOverride}
                                        onChange={(e) => {
                                            const cleanVal = cleanMonetaryInput(e.target.value);
                                            setDownPaymentAmount(cleanVal);
                                            
                                            // Recalcular saldo automaticamente
                                            const parsedDown = parseBRLToFloat(cleanVal);
                                            const totalCents = Math.round(totalAmount * 100);
                                            const downCents = Math.round(parsedDown * 100);
                                            
                                            if (downCents > totalCents) {
                                                setRemainingBalanceAmount('0,00');
                                            } else {
                                                const balanceCents = totalCents - downCents;
                                                setRemainingBalanceAmount(formatFloatToBRL(balanceCents / 100));
                                            }
                                        }}
                                        onBlur={() => {
                                            const parsedDown = parseBRLToFloat(downPaymentAmount);
                                            if (parsedDown > totalAmount) {
                                                alert("A entrada não pode ser maior que o total da venda.");
                                                
                                                // Restaurar para 50/50
                                                const totalCents = Math.round(totalAmount * 100);
                                                const entradaCents = Math.floor(totalCents * 0.5);
                                                const saldoCents = totalCents - entradaCents;
                                                setDownPaymentAmount(formatFloatToBRL(entradaCents / 100));
                                                setRemainingBalanceAmount(formatFloatToBRL(saldoCents / 100));
                                            } else {
                                                setDownPaymentAmount(formatFloatToBRL(parsedDown));
                                                const balance = totalAmount - parsedDown;
                                                setRemainingBalanceAmount(formatFloatToBRL(balance));
                                            }
                                        }}
                                        className="h-11 rounded-xl text-xs font-bold disabled:bg-slate-50 dark:disabled:bg-slate-950/40 disabled:opacity-75"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase">Saldo Restante (R$)</label>
                                    <Input
                                        type="text"
                                        value={remainingBalanceAmount}
                                        disabled={true}
                                        className="h-11 rounded-xl text-xs font-bold disabled:bg-slate-50 dark:disabled:bg-slate-950/40 disabled:opacity-75"
                                    />
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-slate-400 uppercase">Status do Pagamento</label>
                                <div className="flex bg-slate-100 dark:bg-slate-950 p-1 rounded-xl border border-slate-200/50">
                                    <button
                                        type="button"
                                        onClick={() => setPaymentStatus('pendente')}
                                        className={cn(
                                            "flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all",
                                            paymentStatus === 'pendente' ? "bg-white dark:bg-slate-900 text-rose-500 shadow font-extrabold" : "text-slate-400"
                                        )}
                                    >
                                        Pendente
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setPaymentStatus('entrada_recebida')}
                                        className={cn(
                                            "flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all",
                                            paymentStatus === 'entrada_recebida' ? "bg-white dark:bg-slate-900 text-blue-500 shadow font-extrabold" : "text-slate-400"
                                        )}
                                    >
                                        Entrada Recebida
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setPaymentStatus('pago')}
                                        className={cn(
                                            "flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all",
                                            paymentStatus === 'pago' ? "bg-white dark:bg-slate-900 text-emerald-500 shadow font-extrabold" : "text-slate-400"
                                        )}
                                    >
                                        Pago / Quitado
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase">Observações Gerais</label>
                            <textarea
                                value={observations}
                                onChange={(e) => setObservations(e.target.value)}
                                placeholder="Notas internas do pedido..."
                                className="w-full min-h-[60px] rounded-xl border-2 border-slate-100 bg-white dark:bg-slate-900 p-3 text-xs font-medium focus:outline-none"
                            />
                        </div>

                        <div className="pt-2 flex flex-col gap-2">
                            <Button
                                type="submit"
                                disabled={isSaving}
                                className="w-full h-14 bg-brand-emerald hover:bg-emerald-600 text-white rounded-2xl shadow-xl shadow-brand-emerald/20 font-black uppercase text-xs tracking-widest transition-all gap-2"
                            >
                                {isSaving ? (
                                    <>
                                        <Loader2 className="h-5 w-5 animate-spin" />
                                        <span>Processando...</span>
                                    </>
                                ) : (
                                    <span>Salvar Venda Rápida</span>
                                )}
                            </Button>
                            <Button
                                type="button"
                                variant="ghost"
                                onClick={() => handleSave(true)}
                                disabled={isSaving}
                                className="w-full h-11 border-2 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl font-bold uppercase text-[10px] tracking-wider transition-all"
                            >
                                {isSaving ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <span>Salvar como Rascunho</span>
                                )}
                            </Button>
                        </div>
                    </div>
                </div>
            </form>
        </div>
    );
};
