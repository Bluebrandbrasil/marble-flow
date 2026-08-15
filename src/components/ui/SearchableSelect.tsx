import { safeArray } from '../../lib/dataDiagnostics';
import React from 'react';
import { Search, ChevronDown, X } from 'lucide-react';
import { cn } from '../../lib/utils';

interface Option {
    value: string;
    label: string;
    description?: string;
    subDescription?: string; // Optional field for 3rd line (e.g., address)
    searchValue?: string; // Optional field to search by (like CPF or phone)
}

import { normalizeText, getSearchTokens } from '../../utils/materialSearch';

interface SearchableSelectProps {
    options: Option[];
    value: string;
    onChange: (value: string) => void;
    onSearchChange?: (value: string) => void;
    placeholder?: string;
    disabled?: boolean;
    className?: string;
    required?: boolean;
    compact?: boolean;
    disableInternalFilter?: boolean;
}

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
    options,
    value,
    onChange,
    onSearchChange,
    placeholder = 'Selecione uma opção...',
    disabled = false,
    className,
    required = false,
    compact = false,
    disableInternalFilter = false,
}) => {
    const [isOpen, setIsOpen] = React.useState(false);
    const [search, setSearch] = React.useState('');
    const containerRef = React.useRef<HTMLDivElement>(null);

    const selectedOption = options.find(o => o.value === value);

    // Close on click outside
    React.useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const filteredOptions = safeArray(options).filter(option => {
        if (disableInternalFilter) return true;

        const term = search.trim();
        if (!term) return true;

        const normalizedTerm = normalizeText(term);
        if (!normalizedTerm) return true;
        
        const labelText = normalizeText(option.label || '');
        const descText = normalizeText(option.description || '');
        const subDescText = normalizeText(option.subDescription || '');
        const searchValText = normalizeText(option.searchValue || '');

        const searchableText = `${labelText} ${descText} ${subDescText} ${searchValText}`;

        const queryWords = normalizedTerm.split(' ').filter(Boolean);
        
        return queryWords.every(qWord => {
            const synonyms = getSearchTokens(qWord, true);
            return synonyms.some(syn => searchableText.includes(syn));
        });
    });

    // Option sorting to favor exact matches and starting with the term
    const sortedOptions = search.trim() ? [...filteredOptions].sort((a, b) => {
        const normalizedQuery = normalizeText(search.trim());
        const labelA = normalizeText(a.label || '');
        const labelB = normalizeText(b.label || '');

        const exactA = labelA === normalizedQuery ? 1 : 0;
        const exactB = labelB === normalizedQuery ? 1 : 0;
        if (exactA !== exactB) return exactB - exactA;

        const startsA = labelA.startsWith(normalizedQuery) ? 1 : 0;
        const startsB = labelB.startsWith(normalizedQuery) ? 1 : 0;
        if (startsA !== startsB) return startsB - startsA;

        const containsA = labelA.includes(normalizedQuery) ? 1 : 0;
        const containsB = labelB.includes(normalizedQuery) ? 1 : 0;
        if (containsA !== containsB) return containsB - containsA;

        return 0;
    }) : filteredOptions;

    const handleSelect = (val: string) => {
        onChange(val);
        setIsOpen(false);
        setSearch('');
        if (onSearchChange) onSearchChange('');
    };

    return (
        <div className={cn("relative w-full", className)} ref={containerRef}>
            {/* Display Trigger */}
            <div
                onClick={() => !disabled && setIsOpen(!isOpen)}
                className={cn(
                    "flex w-full items-center justify-between rounded-md border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 transition-all cursor-pointer shadow-sm",
                    compact ? "h-11 px-3 text-sm" : "h-12 px-4 py-2 text-sm",
                    disabled ? "opacity-50 cursor-not-allowed bg-slate-50" : "hover:border-emerald-500",
                    isOpen && "ring-2 ring-emerald-500/20 border-emerald-500"
                )}
            >
                <span className={cn(
                    "truncate font-medium",
                    !selectedOption ? "text-slate-500" : "text-slate-900 dark:text-slate-100"
                )}>
                    {selectedOption ? selectedOption.label : placeholder}
                </span>
                <ChevronDown className={cn(
                    "h-4 w-4 text-slate-400 transition-transform duration-200",
                    isOpen && "rotate-180"
                )} />
            </div>

            {/* Hidden Input for Form Validation (Optional) */}
            {required && <input type="hidden" value={value} required />}

            {/* Dropdown Panel */}
            {isOpen && (
                <div className="absolute z-50 mt-2 w-full min-w-[300px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl animate-in zoom-in-95 duration-200 p-2">
                    {/* Search Input */}
                    <div className="relative mb-2">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <input
                            autoFocus
                            type="text"
                            value={search}
                            onChange={(e) => {
                                setSearch(e.target.value);
                                if (onSearchChange) onSearchChange(e.target.value);
                            }}
                            className="w-full h-10 pl-9 pr-9 rounded-lg bg-slate-50 dark:bg-slate-800 border-none text-sm focus:ring-2 focus:ring-emerald-500 dark:text-white"
                            placeholder="Pesquisar..."
                            onKeyDown={(e) => {
                                if (e.key === 'Escape') setIsOpen(false);
                            }}
                        />
                        {search && (
                            <button 
                                onClick={() => {
                                    setSearch('');
                                    if (onSearchChange) onSearchChange('');
                                }}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        )}
                    </div>

                    {/* Options List */}
                    <div className="max-h-[280px] overflow-y-auto custom-scrollbar pr-1">
                        {sortedOptions.length > 0 ? (
                            safeArray(sortedOptions).map((option) => (
                                <div
                                    key={option.value}
                                    onClick={() => handleSelect(option.value)}
                                    className={cn(
                                        "px-3 py-2.5 rounded-lg cursor-pointer text-sm transition-colors mb-1",
                                        option.value === value 
                                            ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 font-bold"
                                            : "text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                                    )}
                                >
                                    <div className="flex flex-col">
                                        <span>{option.label}</span>
                                        {option.description && (
                                            <span className="text-xs opacity-70 font-medium mt-1 uppercase tracking-tight">{option.description}</span>
                                        )}
                                        {option.subDescription && (
                                            <span className="text-[10px] opacity-60 font-medium mt-0.5 tracking-tight">{option.subDescription}</span>
                                        )}
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="px-3 py-8 text-center text-slate-400 text-sm">
                                <Search className="h-6 w-6 mx-auto mb-2 opacity-20" />
                                Nenhum material ou opção encontrada para essa busca.
                                <div className="mt-1 text-xs">Verifique o nome ou cadastre um novo.</div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
