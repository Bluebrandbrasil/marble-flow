import React from 'react';
import type { Measurement } from '../../types';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { cn } from '../../lib/utils';
import { Trash2 } from 'lucide-react';

interface MeasurementFormProps {
    onSubmit: (data: Omit<Measurement, 'id' | 'createdAt' | 'status'>) => void;
    initialDate?: Date;
}

export const MeasurementForm: React.FC<MeasurementFormProps> = ({ onSubmit, initialDate }) => {
    // Smart Paste States
    const [smartText, setSmartText] = React.useState('');
    const [parsedName, setParsedName] = React.useState('');
    const [parsedPhone, setParsedPhone] = React.useState('');
    const [parsedAddress, setParsedAddress] = React.useState('');
    const [parsedCity, setParsedCity] = React.useState('');
    const [parsedRegion, setParsedRegion] = React.useState('');
    const [parsedTime, setParsedTime] = React.useState('');
    const [parsedMaterial, setParsedMaterial] = React.useState('');
    const [parsedObs, setParsedObs] = React.useState('');
    const [lockedDate, setLockedDate] = React.useState<string>(initialDate ? initialDate.toISOString().split('T')[0] : '');
    const [isDateLocked, setIsDateLocked] = React.useState<boolean>(!!initialDate);
    const [isSubmitting, setIsSubmitting] = React.useState(false);

    const REGION_MAPPING: Record<string, string> = {
        'São Paulo': 'Centro',
        'Vila Andrade': 'Zona Sul',
        'Morumbi': 'Zona Sul',
        'Santana': 'Zona Norte',
        'Tatuapé': 'Zona Leste',
        'Pinheiros': 'Zona Oeste',
        'Diadema': 'ABC',
        'São Bernardo': 'ABC',
        'Santo André': 'ABC',
        'São Caetano': 'ABC',
        'Mauá': 'ABC',
        'Guarulhos': 'Outros',
        'Osasco': 'Outros',
    };

    const CITIES = ['São Paulo', 'Diadema', 'São Bernardo', 'Santo André', 'São Caetano', 'Mauá', 'Guarulhos', 'Osasco', 'Outros'];
    const REGIONS = ['ABC', 'Zona Sul', 'Zona Norte', 'Zona Leste', 'Zona Oeste', 'Centro', 'Interior', 'Litoral'];

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();

        setIsSubmitting(true);
        const formData = new FormData(e.currentTarget);
        const data: Omit<Measurement, 'id' | 'createdAt' | 'status'> = {
            customerName: formData.get('customerName') as string,
            phone: formData.get('phone') as string,
            address: formData.get('address') as string,
            city: formData.get('city') as string,
            region: formData.get('region') as string,
            scheduledDate: formData.get('scheduledDate') as string,
            scheduledTime: formData.get('scheduledTime') as string,
            material: formData.get('material') as string,
            observations: formData.get('observations') as string,
        } as Omit<Measurement, 'id' | 'createdAt' | 'status'>;

        setTimeout(() => {
            onSubmit(data);
            setIsSubmitting(false);
        }, 600); // Fake delay for animation
    };

    const handleSmartPaste = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const text = e.target.value;
        setSmartText(text);

        if (text.trim().length === 0) return;

        // Extract Name (Cliente:, Nome:, Nome do Cliente:)
        const nameMatch = text.match(/(?:Cliente|Nome(?: do Cliente)?):\s*([^\n]+)/i);
        if (nameMatch && nameMatch[1]) setParsedName(nameMatch[1].trim());

        // Extract Phone (Telefone:, Contato:, WhatsApp:)
        const phoneMatch = text.match(/(?:📞\s*Telefone|Telefone|Contato|Celular|WhatsApp|Whats):\s*([^\n]+)/i) || text.match(/(?:\(?\d{2}\)?\s*)?\d{4,5}[-\s]?\d{4}/);
        if (phoneMatch) {
            const phoneStr = phoneMatch[1] ? phoneMatch[1].trim() : phoneMatch[0].trim();
            setParsedPhone(phoneStr);
        }

        // Extract Address Context (Local:, Endereço: e inclua Torre/Apto mesmo se estiver na linha de baixo)
        const addressLines = text.split('\n');
        let foundAddressStr = '';
        for (let i = 0; i < addressLines.length; i++) {
            const line = addressLines[i];
            const addressMatch = line.match(/(?:📍\s*Local|Local|Endere(?:ç|c)o(?: da obra)?|Obra):\s*(.+)/i);
            if (addressMatch && addressMatch[1]) {
                foundAddressStr = addressMatch[1].trim();
                // Verifica a próxima linha pra ver se tem complemento de torre/apto
                if (i + 1 < addressLines.length) {
                    const nextLine = addressLines[i + 1];
                    if (nextLine.match(/(?:Torre|Apto|Apartamento|Bloco|Condomínio|Condominio|Lote|Quadra)/i)) {
                        foundAddressStr += ' - ' + nextLine.trim();
                    }
                }
                break;
            }
        }

        if (foundAddressStr) {
            setParsedAddress(foundAddressStr);

            // Auto detect city and region from address
            let detectedCity = '';
            let detectedRegion = '';

            for (const [key, region] of Object.entries(REGION_MAPPING)) {
                if (foundAddressStr.toLowerCase().includes(key.toLowerCase())) {
                    detectedRegion = region;
                    if (CITIES.includes(key)) {
                        detectedCity = key;
                    } else if (region === 'ABC') {
                        // Very rough fallback if they typed a specific neighborhood but we know it's ABC from context
                    } else {
                        detectedCity = 'São Paulo'; // Common fallback for SP neighborhoods like Morumbi
                    }
                    break;
                }
            }

            if (detectedCity) setParsedCity(detectedCity);
            if (detectedRegion) setParsedRegion(detectedRegion);
        }

        // Extract Date
        const dateMatch = text.match(/Data.*?:\s*(\d{2})\/(\d{2})\/(\d{4})/i) || text.match(/(\d{2})\/(\d{2})\/(\d{4})/);
        if (dateMatch && !isDateLocked) {
            if (dateMatch.length >= 4) {
                const [_, day, month, year] = dateMatch;
                const formattedDate = `${year}-${month}-${day}`;
                setLockedDate(formattedDate);
                setIsDateLocked(true);
            }
        }

        // Extract Time (Padrão de horas ex: 10:00)
        const timeMatch = text.match(/(?:Horário|Hora):\s*(\d{2}:\d{2})/i) || text.match(/(?:às|as)\s+(\d{2}:\d{2})/i) || text.match(/(\d{2}:\d{2})/);
        if (timeMatch && timeMatch[1]) {
            setParsedTime(timeMatch[1].trim());
        }

        // Observações & Material
        let obsStr = '';
        const obsMatch = text.match(/(?:Observação|Observações|Obs):?\s*([^\n]+)/i);
        if (obsMatch && obsMatch[1]) {
            obsStr += `${obsMatch[1].trim()}\n`;
        }

        const matMatch = text.match(/Material:\s*([^\n]+)/i);
        if (matMatch && matMatch[1]) {
            setParsedMaterial(matMatch[1].trim());
            obsStr += `Material: ${matMatch[1].trim()}\n`;
        }

        if (obsStr.trim()) {
            setParsedObs(obsStr.trim());
        }
    };

    const handleClearProtocol = () => {
        setSmartText('');
        setParsedName('');
        setParsedPhone('');
        setParsedAddress('');
        setParsedCity('');
        setParsedRegion('');
        setParsedTime('');
        setParsedMaterial('');
        setParsedObs('');
        if (!initialDate) {
            setLockedDate('');
            setIsDateLocked(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-5">
            <div className="relative group/dropzone mt-2">
                <div className={cn(
                    "absolute -inset-0.5 bg-gradient-to-r from-brand-neon via-brand-emerald to-brand-neon rounded-2xl blur-md opacity-20 group-hover/dropzone:opacity-50 transition duration-1000 group-hover/dropzone:duration-200",
                    smartText && "opacity-80 animate-pulse duration-500"
                )}></div>
                <div className="relative glass-card rounded-2xl p-4 border border-slate-200/50 dark:border-white/10 flex flex-col items-center justify-center transition-all overflow-hidden z-10 w-full">
                    <div className="flex justify-between w-full mb-3 shrink-0 items-center">
                        <label className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2">
                            <span className="p-1.5 bg-brand-emerald/10 text-brand-emerald rounded-lg">⚡</span>
                            DROPZONE: Colar Protocolo
                        </label>
                        {smartText && (
                            <button type="button" onClick={handleClearProtocol} className="text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-brand-ruby bg-slate-100 hover:bg-brand-ruby/10 dark:bg-white/5 dark:hover:bg-brand-ruby/20 py-1.5 px-3 rounded-lg transition-colors flex items-center gap-1.5">
                                <Trash2 className="w-3 h-3" /> Limpar
                            </button>
                        )}
                    </div>
                    <textarea
                        value={smartText}
                        onChange={handleSmartPaste}
                        className="w-full min-h-[80px] bg-slate-50 border-dashed border-2 border-slate-200 dark:bg-black/20 dark:border-white/10 dark:text-slate-100 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-emerald/50 focus:border-transparent transition-all placeholder:text-slate-400 dark:placeholder:text-slate-600 resize-none"
                        placeholder="Cole o texto do WhatsApp ou CRM aqui..."
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Nome do Cliente</label>
                    <Input name="customerName" required placeholder="Ex: João da Silva" value={parsedName} onChange={(e) => setParsedName(e.target.value)} className="bg-slate-50 dark:bg-black/20" />
                </div>
                <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Telefone</label>
                    <Input name="phone" placeholder="(00) 00000-0000" value={parsedPhone} onChange={(e) => setParsedPhone(e.target.value)} className="bg-slate-50 dark:bg-black/20" />
                </div>
                <div className="space-y-2 md:col-span-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Local (Endereço)</label>
                    <Input name="address" required placeholder="Ex: Rua das Flores, 123 - Apto 402" value={parsedAddress} onChange={(e) => setParsedAddress(e.target.value)} className="bg-slate-50 dark:bg-black/20" />
                </div>

                <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Cidade</label>
                    <select
                        name="city"
                        value={parsedCity}
                        onChange={(e) => setParsedCity(e.target.value)}
                        className="flex h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-emerald focus-visible:ring-offset-0 dark:border-white/10 dark:bg-black/20 dark:text-slate-100"
                        required
                    >
                        <option value="" disabled>Selecione a Cidade</option>
                        {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>
                <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Região</label>
                    <select
                        name="region"
                        value={parsedRegion}
                        onChange={(e) => setParsedRegion(e.target.value)}
                        className="flex h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-emerald focus-visible:ring-offset-0 dark:border-white/10 dark:bg-black/20 dark:text-slate-100"
                        required
                    >
                        <option value="" disabled>Selecione a Região</option>
                        {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                </div>

                <div className="space-y-2 relative">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Data da Medição</label>
                    <div className="relative">
                        <Input
                            name="scheduledDate"
                            type="date"
                            required
                            value={lockedDate}
                            onChange={(e) => setLockedDate(e.target.value)}
                            readOnly={isDateLocked}
                            className={cn("bg-slate-50 dark:bg-black/20", isDateLocked && "opacity-70 cursor-not-allowed")}
                        />
                        {isDateLocked && (
                            <div className="absolute right-8 top-1/2 -translate-y-1/2 text-sm text-brand-neon">
                                🔒
                            </div>
                        )}
                    </div>
                </div>
                <div className="space-y-2 relative">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Horário</label>
                    <Input name="scheduledTime" type="time" value={parsedTime} onChange={(e) => setParsedTime(e.target.value)} className="bg-slate-50 dark:bg-black/20" />
                </div>

                <div className="space-y-2 md:col-span-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Material Principal</label>
                    <Input name="material" placeholder="Ex: Preto São Gabriel" value={parsedMaterial} onChange={(e) => setParsedMaterial(e.target.value)} className="bg-slate-50 dark:bg-black/20" />
                </div>
            </div>

            <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Observações</label>
                <textarea
                    name="observations"
                    value={parsedObs}
                    onChange={(e) => setParsedObs(e.target.value)}
                    className="flex min-h-[80px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm ring-offset-white placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-emerald focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-black/20 dark:placeholder:text-slate-600"
                    placeholder="Detalhes adicionais..."
                />
            </div>

            <div className="flex justify-end gap-3 pt-4">
                <Button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full px-6 py-6 bg-brand-emerald hover:bg-emerald-600 text-white rounded-xl shadow-lg shadow-brand-emerald/30 font-bold transition-all disabled:opacity-75 disabled:cursor-not-allowed relative overflow-hidden group"
                >
                    {isSubmitting ? (
                        <div className="flex items-center gap-2">
                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                            <span>Processando...</span>
                        </div>
                    ) : (
                        <span className="relative z-10 text-base">Salvar e Agendar Medição</span>
                    )}
                    <div className="absolute inset-0 h-full w-full bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-[100%] group-hover:animate-[shimmer_1.5s_infinite]"></div>
                </Button>
            </div>
        </form>
    );
};
