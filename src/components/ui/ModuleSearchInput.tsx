import React, { useCallback, useState, useEffect } from 'react';
import { Search, X } from 'lucide-react';
import { Badge } from './badge';
import { Input } from './input';
import { cn } from '../../lib/utils';

interface ModuleSearchInputProps {
    moduleName: string;
    placeholder: string;
    value: string;
    onChange: (value: string) => void;
    resultCount?: number;
    className?: string;
}

export const ModuleSearchInput: React.FC<ModuleSearchInputProps> = ({
    moduleName,
    placeholder,
    value,
    onChange,
    resultCount,
    className
}) => {
    // Local state for immediate typing feedback
    const [localValue, setLocalValue] = useState(value);

    // Sync external changes
    useEffect(() => {
        setLocalValue(value);
    }, [value]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setLocalValue(val);
        onChange(val);
    };

    const handleClear = () => {
        setLocalValue('');
        onChange('');
    };

    return (
        <div className={cn("relative flex items-center w-full max-w-md", className)}>
            <div className="absolute left-3 flex items-center justify-center text-slate-400">
                <Search className="w-4 h-4" />
            </div>
            
            <Input
                type="text"
                value={localValue}
                onChange={handleChange}
                placeholder={`Buscar em ${moduleName}... (${placeholder})`}
                className="pl-10 pr-16 h-10 bg-white border-slate-200 shadow-sm rounded-lg focus:ring-2 focus:ring-brand-rocha-primary/20 transition-all text-sm w-full"
            />

            <div className="absolute right-2 flex items-center gap-2">
                {localValue && (
                    <button 
                        onClick={handleClear}
                        className="p-1 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
                        aria-label="Limpar busca"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                )}
                
                {resultCount !== undefined && localValue.trim().length > 0 && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 h-5 flex items-center justify-center bg-slate-100 text-slate-500 font-medium border-0">
                        {resultCount}
                    </Badge>
                )}
            </div>
        </div>
    );
};
