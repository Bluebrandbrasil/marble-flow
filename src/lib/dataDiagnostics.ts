import { safeParseISO } from './dateUtils';
import { db } from './firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

/**
 * Data Governance & Diagnostics Utility - V4 (Governance Intelligence Edition)
 * 
 * Provides an operational governance layer for detecting, reporting, and 
 * blocking malformed data with forensic traceability and recurrence intelligence.
 * Includes auto-remediation and company-level scoring.
 */

export type DiagnosticSeverity = 'low' | 'warning' | 'critical';

export interface DataIssue {
    code: string;         // machine-readable code (e.g., USER_INVALID_ROLE)
    module: string;
    field: string;
    value: any;
    message: string;
    severity: DiagnosticSeverity;
    timestamp: string;
    entityId?: string;    // specific record ID (customer, quote, order)
    companyId?: string;   // grouping by company
    metadata?: Record<string, any>;
    resolved?: boolean;
}

export interface NormalizationResult<T> {
    data: T;
    issues: DataIssue[];
    isBlocked: boolean;
    reason?: string;
}

// Internal state for session management
const sessionIssues: DataIssue[] = [];
const issueCache = new Map<string, number>(); 

const IS_DEV = process.env.NODE_ENV === 'development' || 
              (typeof window !== 'undefined' && window.location.hostname === 'localhost');

/**
 * Persists critical issues to Firestore for forensic intelligence.
 */
const persistCriticalIssue = async (issue: DataIssue) => {
    try {
        await addDoc(collection(db, 'data_issues'), {
            ...issue,
            resolved: false,
            createdAt: serverTimestamp(),
            environment: IS_DEV ? 'development' : 'production',
            userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown'
        });
    } catch (err) {
        if (IS_DEV) console.error('Governance Error: Failed to persist critical issue:', err);
    }
};

/**
 * Reports a data issue to the governance layer.
 */
export const reportDataIssue = (
    code: string,
    module: string,
    field: string,
    value: any,
    message: string = 'Inconsistência de dado detectada',
    severity: DiagnosticSeverity = 'low',
    metadata?: Record<string, any>,
    entityId?: string,
    companyId?: string
): DataIssue => {
    const timestamp = new Date().toISOString();
    const issue: DataIssue = { code, module, field, value, message, severity, timestamp, entityId, companyId, metadata, resolved: false };

    // Governance recurrence detection key
    const recurrenceKey = `${code}:${module}:${field}:${entityId || 'no-entity'}:${companyId || 'no-id'}`;
    const count = (issueCache.get(recurrenceKey) || 0) + 1;
    issueCache.set(recurrenceKey, count);
    
    sessionIssues.push(issue);
    if (sessionIssues.length > 2000) sessionIssues.shift();

    if (IS_DEV && count <= 2) {
        const colors = {
            low: 'color: #3b82f6;',
            warning: 'color: #f59e0b; font-weight: bold;',
            critical: 'color: #ef4444; font-weight: 800; background: #fee2e2; padding: 2px 4px; border-radius: 4px;'
        };

        console.warn(
            `%c[GOVERNANCE] [${severity.toUpperCase()}] [${code}]%c mod=${module} fld=${field}\n%c${message}\n%cEntity: ${entityId || 'N/A'}`,
            colors[severity], 
            'color: inherit;', 
            'color: #64748b; font-style: italic;',
            'color: #94a3b8; font-size: 10px;'
        );
    }

    if (severity === 'critical') {
        persistCriticalIssue(issue);
    }

    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('marbleflow-diagnostic-event', { detail: issue }));
    }

    return issue;
};

/**
 * Standardized Safe Split with code reporting and string coercion fallback.
 */
export const safeSplit = (
    value: any, 
    separator: string | RegExp, 
    module: string = 'intelligence', 
    field: string = 'unknown_field',
    code: string = 'INVALID_SPLIT_INPUT',
    severity: DiagnosticSeverity = 'warning'
): string[] => {
    if (typeof value === 'string') return value.split(separator);
    
    reportDataIssue(
        code, 
        module, 
        field, 
        value, 
        `Operation .split() called on non-string type (${typeof value}). Fallback to String conversion applied.`, 
        severity
    );
    
    // Fallback mínimo exigido: Converter para string antes do split
    return String(value ?? '').split(separator);
};

/**
 * Standardized safe history array for quotes and other entities.
 * Ensures the history is iterable to prevent UI crashes on legacy documents.
 */
export const safeHistoryArray = <T = any>(history: unknown): T[] => {
    if (Array.isArray(history)) return history as T[];
    if (!history) return [];
    
    // If it's an object but not an array, wrap it in an array to preserve data
    if (typeof history === 'object') {
        return [history as T];
    }
    
    return [];
};

/**
 * Standardized array protection with governance reporting.
 */
export const safeArray = <T = any>(value: unknown): T[] => {
  if (Array.isArray(value)) return value as T[];

  if (typeof window !== 'undefined') {
    console.warn('[GOVERNANCE] valor não é array:', value);
  }

  reportDataIssue(
    'ARRAY_INVALID',
    'system',
    'array',
    value,
    'Valor não-array tratado com fallback []',
    'warning'
  );

  return [];
};

/**
 * Normalizes contract clauses from various formats (string, object, array)
 * to a standardized array of { id, title, content }.
 */
export const normalizeClauses = (data: any): { id: string; title: string; content: string }[] => {
  if (!data) return [];

  let rawClauses: any[] = [];
  let parsedData = data;

  if (typeof data === 'string') {
    try {
      const trimmed = data.trim();
      if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
        parsedData = JSON.parse(trimmed);
      }
    } catch (e) {
      // Keep as string
    }
  }

  if (Array.isArray(parsedData)) {
    rawClauses = parsedData;
  } else if (typeof parsedData === 'object' && parsedData !== null) {
    rawClauses = [parsedData];
  } else if (typeof parsedData === 'string') {
    rawClauses = [{
      id: 'legacy',
      title: 'Cláusula',
      content: parsedData
    }];
  }

  return rawClauses.map((c, idx) => {
    let title = c?.title;
    let content = c?.content;

    // Se o próprio item for uma string, pode ser texto puro ou JSON stringified
    if (typeof c === 'string') {
        try {
            const trimmed = c.trim();
            if (trimmed.startsWith('{')) {
                const parsed = JSON.parse(trimmed);
                title = parsed.title;
                content = parsed.content;
            } else {
                content = c;
            }
        } catch (e) {
            content = c;
        }
    }

    // Se o content for uma string que contém JSON (ex: {"content":"..."})
    if (typeof content === 'string') {
        try {
            const trimmed = content.trim();
            if (trimmed.startsWith('{')) {
                const parsedContent = JSON.parse(trimmed);
                if (parsedContent.content) {
                    content = parsedContent.content;
                }
                if (!title && parsedContent.title) {
                    title = parsedContent.title;
                }
            }
        } catch (e) {
            // Keep as string
        }
    }

    // Fallbacks para evitar rendering de object text
    if (typeof content === 'object' && content !== null) {
        content = JSON.stringify(content);
    }
    if (typeof title === 'object' && title !== null) {
        title = JSON.stringify(title);
    }
    
    if (!title && typeof content === 'string' && content.length > 0) {
        title = 'Cláusula';
    }

    return {
      id: String(c?.id || `clause-${idx}`),
      title: String(title || 'Cláusula'),
      content: String(content || '')
    };
  });
};

/**
 * Normalizes CEP/ZipCode to 8 digits only.
 */
export const normalizeCEP = (cep: any): string => {
    if (!cep) return '';
    const cleaned = String(cep).replace(/\D/g, '');
    if (cleaned.length !== 8 && cleaned.length > 0) {
        reportDataIssue('CLIENT_INVALID_ZIP', 'crm', 'zipCode', cep, `CEP normalization failed (Length: ${cleaned.length})`, 'low');
    }
    return cleaned.substring(0, 8);
};

/**
 * Normalizes Date string, ensuring valid ISO or fallback.
 */
export const normalizeDate = (date: any, fallback: string = new Date().toISOString()): string => {
    if (!date) return fallback;
    const d = safeParseISO(date);
    if (!d || isNaN(d.getTime())) {
        reportDataIssue('DATE_INVALID_FORMAT', 'system', 'date', date, 'Malformed date detected, using fallback', 'warning');
        return fallback;
    }
    return d.toISOString();
};

/**
 * Maps legacy or unrecognized quote stages to standardized values.
 */
export const normalizeQuoteStatus = (status: string): string => {
    const map: Record<string, string> = {
        'draft': 'draft',
        'novo': 'draft',
        'rascunho': 'draft',
        'sent': 'sent',
        'enviado': 'sent',
        'viewed': 'viewed',
        'visto': 'viewed',
        'negotiating': 'negotiating',
        'negociando': 'negotiating',
        'approved': 'approved',
        'aprovado': 'approved',
        'rejected': 'rejected',
        'rejeitado': 'rejected',
        'expired': 'expired',
        'expirado': 'expired'
    };
    return map[status.toLowerCase()] || 'draft';
};

/**
 * Standardized Safe String with code reporting.
 */
export const safeString = (
    value: any, 
    code: string = 'STRING_INVALID',
    module: string = 'unknown', 
    field: string = 'unknown', 
    fallback: string = '',
    severity: DiagnosticSeverity = 'low'
): string => {
    if (typeof value === 'string' && value.trim().length > 0) return value;
    if (value !== undefined && value !== null && String(value).trim().length > 0) {
        // Auto-remediation: cast to string if possible
        return String(value);
    }
    reportDataIssue(code, module, field, value, `Invalid string detected, using fallback`, severity);
    return fallback;
};

// --- ENTITY GOVERNANCE & NORMALIZATION (V4) ---

/**
 * Governance check for User Profile.
 */
export const normalizeUser = (user: any): NormalizationResult<any> => {
    const issues: DataIssue[] = [];
    let isBlocked = false;
    let reason = '';

    if (!user?.uid) {
        issues.push(reportDataIssue('USER_MISSING_UID', 'auth', 'uid', user, 'Critical: User UID missing', 'critical', undefined, user?.uid, user?.companyId));
        isBlocked = true;
        reason = 'Acesso negado: Perfil de usuário corrompido (UID inexistente).';
    }

    if (!user?.role) {
        issues.push(reportDataIssue('USER_INVALID_ROLE', 'auth', 'role', user?.role, 'Missing or invalid role', 'critical', undefined, user?.uid, user?.companyId));
        isBlocked = true;
        reason = 'Permissão negada: O usuário não possui uma função (role) atribuída.';
    }

    return {
        data: {
            ...user,
            uid: safeString(user?.uid, 'USER_MISSING_UID', 'auth', 'uid', 'anonymous', 'critical'),
            role: safeString(user?.role, 'USER_INVALID_ROLE', 'auth', 'role', 'vendedor', 'warning'),
            companyId: safeString(user?.companyId, 'USER_MISSING_COMPANY', 'auth', 'companyId', 'unassigned', 'warning'),
            name: user?.name || user?.displayName || (user?.email ? user.email.split('@')[0] : 'Usuário'),
            email: safeString(user?.email, 'USER_INVALID_EMAIL', 'auth', 'email', '', 'low')
        },
        issues,
        isBlocked,
        reason
    };
};

/**
 * Governance check for CRM Client.
 */
export const normalizeClient = (client: any): NormalizationResult<any> => {
    const issues: DataIssue[] = [];
    const isBlocked = !client?.id && !client?.name;
    const reason = isBlocked ? 'Cliente inválido: Nome ou ID ausente.' : undefined;
    
    if (!client?.id) issues.push(reportDataIssue('CLIENT_MISSING_ID', 'crm', 'id', client?.id, 'Client ID missing', 'warning', undefined, client?.id, client?.companyId));
    if (!client?.name) issues.push(reportDataIssue('CLIENT_MISSING_NAME', 'crm', 'name', client?.name, 'Client Name is required', 'warning', undefined, client?.id, client?.companyId));

    return {
        data: {
            ...client,
            id: safeString(client?.id, 'CLIENT_MISSING_ID', 'crm', 'id', '', 'warning'),
            name: safeString(client?.name, 'CLIENT_MISSING_NAME', 'crm', 'name', 'Cliente Indefinido', 'warning'),
            zipCode: normalizeCEP(client?.zipCode), // V4: Auto-remediation
            document: safeString(client?.document, 'CLIENT_INVALID_DOC', 'crm', 'document', '', 'low'),
            companyId: safeString(client?.companyId, 'CLIENT_MISSING_COMPANY', 'crm', 'companyId', '', 'warning')
        },
        issues,
        isBlocked,
        reason
    };
};

/**
 * Governance check for Commercial Quote.
 */
export const normalizeQuote = (quote: any): NormalizationResult<any> => {
    const issues: DataIssue[] = [];
    let isBlocked = !quote?.id;
    let reason = '';

    if (!quote?.id) {
        issues.push(reportDataIssue('QUOTE_MISSING_ID', 'quotes', 'id', quote?.id, 'Quote ID is missing', 'critical', undefined, undefined, quote?.companyId));
        isBlocked = true;
        reason = 'Bloqueio operacional: Orçamento sem identificador único (ID).';
    }
    
    if (!quote?.clientId) {
        issues.push(reportDataIssue('QUOTE_MISSING_CLIENT', 'quotes', 'clientId', quote?.clientId, 'Quote has no client link', 'warning', undefined, quote?.id, quote?.companyId));
        // isBlocked = false; // No longer blocking for missing client
    }

    if (quote?.status && !['draft', 'sent', 'viewed', 'negotiating', 'waiting', 'measuring', 'converted', 'rejected', 'approved', 'expired'].includes(quote.status)) {
        issues.push(reportDataIssue('QUOTE_INVALID_STAGE', 'quotes', 'status', quote.status, 'Invalid quote stage detected', 'warning', undefined, quote?.id, quote?.companyId));
    }

    return {
        data: {
            ...quote,
            id: safeString(quote?.id, 'QUOTE_MISSING_ID', 'quotes', 'id', '', 'critical'),
            totalAmount: typeof quote?.totalAmount === 'number' ? quote.totalAmount : 0,
            status: normalizeQuoteStatus(safeString(quote?.status, 'QUOTE_INVALID_STATUS', 'quotes', 'status', 'draft', 'low')), // V4: Auto-remediation
            createdAt: normalizeDate(quote?.createdAt), // V4: Auto-remediation
            companyId: safeString(quote?.companyId, 'QUOTE_MISSING_COMPANY', 'quotes', 'companyId', '', 'warning')
        },
        issues,
        isBlocked,
        reason
    };
};

// --- GOVERNANCE EXPORTS & UTILS (V4) ---

if (typeof window !== 'undefined') {
    (window as any).__MARBLEFLOW_DIAGNOSTICS__ = {
        getIssues: () => sessionIssues,
        getSummary: () => {
            const summary: Record<string, { count: number, codes: Set<string>, severityLevel: string, score: number }> = {};
            
            // Calculate scores by company/module
            sessionIssues.forEach(i => {
                const k = `${i.module}:${i.companyId || 'no-company'}`;
                if (!summary[k]) summary[k] = { count: 0, codes: new Set(), severityLevel: 'low', score: 100 };
                
                summary[k].count++;
                summary[k].codes.add(i.code);
                
                // Deduct from score based on severity
                if (i.severity === 'critical') {
                    summary[k].severityLevel = 'critical';
                    summary[k].score = Math.max(0, summary[k].score - 20);
                } else if (i.severity === 'warning') {
                    if (summary[k].severityLevel !== 'critical') summary[k].severityLevel = 'warning';
                    summary[k].score = Math.max(0, summary[k].score - 5);
                } else {
                    summary[k].score = Math.max(0, summary[k].score - 1);
                }
            });
            return summary;
        },
        getCompanyScore: (companyId: string) => {
            const companyIssues = sessionIssues.filter(i => i.companyId === companyId);
            if (companyIssues.length === 0) return 100;
            
            const totalDeduction = companyIssues.reduce((acc, i) => {
                if (i.severity === 'critical') return acc + 10;
                if (i.severity === 'warning') return acc + 3;
                return acc + 1;
            }, 0);
            
            return Math.max(0, 100 - (totalDeduction / 2)); // Smooth the curve
        },
        clear: () => {
            sessionIssues.length = 0;
            issueCache.clear();
        }
    };
}
