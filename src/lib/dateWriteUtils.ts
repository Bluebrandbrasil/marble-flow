
import { isValid, parseISO } from 'date-fns';

/**
 * Global Date Writing Governance - Marble Flow V5
 * 
 * Centralizes all date transformations before persisting to Firestore.
 * Ensures compatibility with safeParseISO and prevents data corruption.
 */

/**
 * Converts any date-like value to a valid ISO string or null.
 * NEVER returns an invalid object or Date object directly to Firestore.
 */
export const toISODateSafe = (value: any): string | null => {
    if (!value) return null;

    try {
        let date: Date | null = null;

        // Handle Firestore Timestamp
        if (typeof value.toDate === 'function') {
            date = value.toDate();
        } 
        // Handle Date object
        else if (value instanceof Date) {
            date = value;
        } 
        // Handle number (timestamp)
        else if (typeof value === 'number') {
            date = new Date(value);
        }
        // Handle ISO string
        else if (typeof value === 'string') {
            const parsed = parseISO(value);
            if (isValid(parsed)) {
                date = parsed;
            }
        }

        if (date && isValid(date)) {
            return date.toISOString();
        }

        console.warn(`[GOVERNANÇA TEMPORAL] Valor de data inválido detectado: ${JSON.stringify(value)}. Salvando como null.`);
        return null;
    } catch (error) {
        console.error(`[GOVERNANÇA TEMPORAL] Erro crítico ao converter data:`, error);
        return null;
    }
};

/**
 * Ensures a value is a valid Date or null (internal logic use).
 */
export const ensureValidDateOrNull = (value: any): Date | null => {
    const iso = toISODateSafe(value);
    return iso ? new Date(iso) : null;
};

/**
 * Placeholder for Firestore Timestamp if needed by specific logic, 
 * but standardizing on ISO strings as per directive.
 */
export const toFirestoreTimestampSafe = (value: any) => {
    // Note: The directive asks for ISO strings as the primary storage format.
    // We provide this if some legacy module absolutely requires a Timestamp object,
    // but we will prioritize toISODateSafe() everywhere.
    return toISODateSafe(value); 
};
