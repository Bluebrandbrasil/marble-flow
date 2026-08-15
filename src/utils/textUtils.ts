export const normalizeText = (value: unknown): string => {
    return String(value ?? '').trim().toLowerCase();
};

export const displayOrFallback = (value: unknown, fallback: string): string => {
    const text = String(value ?? '').trim();
    return text || fallback;
};
