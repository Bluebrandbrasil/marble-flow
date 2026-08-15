import { parseISO, format as dateFnsFormat, isValid } from 'date-fns';
import { ptBR } from 'date-fns/locale';

/**
 * Global Date Writing Governance - Marble Flow V5
 * Converts any date-like value to a valid ISO string or null.
 */
export const toISODateSafe = (value: any): string | null => {
    if (!value) return null;
    try {
        let date: Date | null = null;
        if (typeof value.toDate === 'function') date = value.toDate();
        else if (value instanceof Date) date = value;
        else if (typeof value === 'number') date = new Date(value);
        else if (typeof value === 'string') {
            const parsed = parseISO(value);
            if (isValid(parsed)) date = parsed;
        }
        if (date && isValid(date)) return date.toISOString();
        return null;
    } catch (error) {
        return null;
    }
};

/**
 * Use esta função em vez de parseISO ou new Date() direto para compatibilidade absoluta com Firestore Timestamp.
 * Evita o erro 't.split is not a function'.
 * Retorna OBRIGATORIAMENTE Date ou null (para uso em lógica, math, filtros e BI).
 * NÃO INVENTA DATA ATUAL COMO FALLBACK!
 */
export const safeParseISO = (val: any): Date | null => {
    if (!val) return null;
    
    try {
        // Tratamento nativo para pacote Firestore (Timestamp object)
        if (typeof val.toDate === 'function') {
            const d = val.toDate();
            return isNaN(d.getTime()) ? null : d;
        }
        
        if (val instanceof Date) {
            return isNaN(val.getTime()) ? null : val;
        }
        
        if (typeof val === 'number') {
            const d = new Date(val);
            return isNaN(d.getTime()) ? null : d;
        }

        // Suporte para objetos serializados { seconds, nanoseconds } ou { _seconds, _nanoseconds }
        if (val && typeof val === 'object' && ('seconds' in val || '_seconds' in val)) {
            const seconds = val.seconds ?? val._seconds;
            if (typeof seconds === 'number') {
                const d = new Date(seconds * 1000);
                return isNaN(d.getTime()) ? null : d;
            }
        }
        
        const parsed = parseISO(String(val));
        return isNaN(parsed.getTime()) ? null : parsed;
        
    } catch (error) {
        console.warn('[DataDiagnostics] Falha ao processar data, fallback NULL aplicado:', val);
        return null;
    }
};

/**
 * Alias para compatibilidade com o helper genérico.
 */
export const getSafeDate = (val: any): Date | null => {
    return safeParseISO(val);
};

/**
 * Retorna a chave de data no formato YYYY-MM-DD segura com base no timezone especificado.
 */
export const getDateKeyInTimezone = (value: any, timezone: string = "America/Sao_Paulo"): string | null => {
    const d = safeParseISO(value);
    if (!d) {
        if (import.meta.env.DEV && value) {
            console.warn("Data inválida na Inteligência Comercial:", value);
        }
        return null;
    }
    try {
        const formatter = new Intl.DateTimeFormat('en-CA', {
            timeZone: timezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
        return formatter.format(d);
    } catch (e) {
        if (import.meta.env.DEV) {
            console.warn("Erro ao formatar data na Inteligência Comercial:", value, e);
        }
        return null;
    }
};

/**
 * Função APENAS para uso Visual (UI). 
 * Formata com locale, e caso seja null aplica o fallback string (ex: '---').
 * NUNCA use essa função para contas numéricas ou sorting.
 */
export const formatVisualDate = (val: any, formatStr: string = "dd/MM/yyyy", fallback: string = '---'): string => {
    const d = safeParseISO(val);
    if (!d) return fallback;
    try {
        return dateFnsFormat(d, formatStr, { locale: ptBR });
    } catch (e) {
        return fallback;
    }
};

/**
 * Compara duas heterogêneas de datas de forma segura (uso blindado em sort).
 * Itens sem data nunca competem de forma falsa com itens datados (são enviados para o final).
 * @param dateA - Data A 
 * @param dateB - Data B
 * @param direction - 'asc' ou 'desc' (padrão é 'desc')
 */
export const compareDatesSafe = (dateA: any, dateB: any, direction: 'asc' | 'desc' = 'desc'): number => {
    const timeA = safeParseISO(dateA)?.getTime();
    const timeB = safeParseISO(dateB)?.getTime();
    
    const isInvalidA = timeA === undefined || timeA === null || isNaN(timeA);
    const isInvalidB = timeB === undefined || timeB === null || isNaN(timeB);

    // Ambos nulos ou inválidos batem empate
    if (isInvalidA && isInvalidB) return 0;
    
    // Semântica de Negócio: itens sem data sempre afundam na lista final
    if (isInvalidA) return 1; 
    if (isInvalidB) return -1;
    
    // Agora timeA e timeB são números seguros (TypeScript hint: as number)
    return direction === 'asc' ? (timeA as number) - (timeB as number) : (timeB as number) - (timeA as number);
};

/**
 * Normaliza o campo scheduledDate para o padrão oficial YYYY-MM-DD.
 * Corrige registros antigos que foram salvos em formato ISO completo pelo erro de Drag & Drop.
 */
export const normalizeScheduledDate = (value: unknown): string | null => {
    if (typeof value !== 'string') return null;

    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return value;
    }

    const isoDateMatch = value.match(/^(\d{4}-\d{2}-\d{2})T/);
    if (isoDateMatch) {
        return isoDateMatch[1];
    }

    return null;
};

/**
 * Cria a data local no padrão (YYYY-MM-DD + horário padrão) para parse no calendário sem fuso UTC.
 */
export const parseLocalDateOnly = (dateString: string): Date => {
    const [year, month, day] = dateString.split('-').map(Number);
    return new Date(year, month - 1, day, 12, 0, 0, 0);
};

/**
 * Reconstrói o campo scheduledAt utilizando a mesma regra da criação da medição (MeasurementForm.tsx).
 */
export const buildMeasurementScheduledAt = (dateString: string, timeString?: string | null): string | null => {
    const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
    if (!DATE_ONLY_REGEX.test(dateString)) return null;
    
    // Fallback original adotado no MeasurementForm.tsx: se não tem hora, usa "00:00"
    const safeTime = timeString || '00:00';
    return toISODateSafe(new Date(dateString + 'T' + safeTime + ':00'));
};

