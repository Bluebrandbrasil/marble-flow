import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

/**
 * Ensures a value is a string.
 * Prevents "split is not a function" errors.
 */
export function safeString(value: any): string {
    if (typeof value === 'string') return value;
    if (value === null || value === undefined) return '';
    return String(value);
}

/**
 * Intelligent helper to resolve user display name with fallback chain.
 * Standardizes UI and prevents "Usuário Sem Nome".
 */
export function getUserDisplayName(user: any, authUser?: any): string {
    const nameFallback = user?.name || user?.displayName || authUser?.displayName || '';
    if (nameFallback && nameFallback.trim().length > 0) return nameFallback;
    
    const email = user?.email || authUser?.email || '';
    if (email && email.includes('@')) {
        return email.split('@')[0];
    }
    return 'Usuário';
}

