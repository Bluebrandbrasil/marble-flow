import React from 'react';
import { safeString } from './utils';

// 1. Core normalizations
export const removeAccents = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export const normalizeStr = (s: string | undefined | null) => {
    if (!s) return '';
    return removeAccents(String(s).trim().toLowerCase());
};

export const normalizeDigits = (s: string | undefined | null) => {
    if (!s) return '';
    return String(s).replace(/\D/g, '');
};

export const normalizeSearchText = (text: string | undefined | null): string => {
    if (!text) return '';
    return removeAccents(String(text).toLowerCase())
        .replace(/[^\w\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
};

export const normalizePhoneSearch = (text: string | undefined | null): string => {
    if (!text) return '';
    // Remove prefixo +55
    let phone = String(text).replace(/^\+55\s*/, '');
    // Remove tudo que não for dígito
    return phone.replace(/\D/g, '');
};

export const isNumericQuery = (term: string) => {
    const digits = normalizeDigits(term);
    return /^\d+$/.test(digits) && digits.length > 0;
};

// 2. Generic relevance scoring function
export const calculateSearchScore = (
    itemValue: string | undefined | null,
    normalizedSearchTerm: string, 
    isNumeric: boolean = false,
    exactScore: number = 100,
    startScore: number = 50,
    includeScore: number = 20
): number => {
    if (!itemValue || !normalizedSearchTerm) return 0;
    
    const valueStr = isNumeric ? normalizeDigits(itemValue) : normalizeStr(itemValue);
    
    if (valueStr === normalizedSearchTerm) return exactScore;
    if (valueStr.startsWith(normalizedSearchTerm)) return startScore;
    if (valueStr.includes(normalizedSearchTerm)) return includeScore;
    
    return 0;
};

// 3. Highlight component for rendering results
interface HighlightTextProps {
    text: string;
    term: string;
    className?: string;
    highlightClassName?: string;
}

export const HighlightText: React.FC<HighlightTextProps> = ({ 
    text, 
    term, 
    className = "", 
    highlightClassName = "text-brand-emerald bg-brand-emerald/10 px-0.5 rounded-sm" 
}) => {
    if (!(term || '').trim() || !text) return <span className={className}>{text}</span>;
    
    const normalizedText = normalizeStr(text);
    const normalizedTerm = normalizeStr(term);
    
    // Hardened indexOf call (Rule #30 Compliance)
    const index = String(normalizedText ?? '').indexOf(String(normalizedTerm ?? ''));
    if (index === -1) return <span className={className}>{text}</span>;

    // Use original text casing for render
    const before = String(text ?? '').substring(0, index);
    const match = String(text ?? '').substring(index, index + normalizedTerm.length);
    const after = String(text ?? '').substring(index + normalizedTerm.length);

    return (
        <span className={className}>
            {before}
            <span className={highlightClassName}>{match}</span>
            {after}
        </span>
    );
};
