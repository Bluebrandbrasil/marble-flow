/**
 * Normaliza valores de medida para o padrão do sistema (METROS).
 * Resolve o problema de ambiguidades entre cm e m.
 * Se o valor for > 10, assume-se que foi digitado em CM e converte para M.
 * Caso contrário, mantém em M.
 */
export const normalizeMeasure = (value: number | string): number => {
    if (value === undefined || value === null) return 0;
    
    // Converte string com vírgula para número
    const num = typeof value === 'string' 
        ? parseFloat(value.replace(',', '.')) 
        : value;
        
    if (isNaN(num)) return 0;

    // Regra heurística: se for maior que 10, é muito provável que seja CM
    // (Ex: 60 -> 0.60m | 120 -> 1.20m | 2.5 -> 2.5m)
    if (num > 10) {
        return Number((num / 100).toFixed(2));
    }

    return Number(num.toFixed(2));
};

/**
 * Formata medida para exibição (ex: 0.60 -> 0,60)
 */
export const formatMeasure = (value: number): string => {
    return value.toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
};
