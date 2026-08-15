import React from 'react';
import { Trophy, AlertTriangle } from 'lucide-react';

interface QualityIndicatorProps {
    qualityScore: number;
}

export const QualityIndicator: React.FC<QualityIndicatorProps> = ({ qualityScore }) => {
    // We now just use the score directly
    const safeDays = Math.max(0, qualityScore);
    const isCelebrating = safeDays > 7;

    return (
        <div
            className={`flex items-center gap-2 px-4 py-2 rounded-full border shadow-sm transition-colors duration-500 ${isCelebrating
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-400'
                    : 'bg-white border-slate-200 text-slate-700 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-300'
                }`}
        >
            {isCelebrating ? (
                <Trophy className="h-5 w-5 text-emerald-500 dark:text-emerald-400 animate-pulse" />
            ) : (
                <AlertTriangle className="h-5 w-5 text-amber-500 dark:text-amber-400" />
            )}
            <span className="text-sm font-medium">
                {isCelebrating ? (
                    <>Estamos há <strong>{safeDays} dias</strong> sem registros de retorno/avaria 🚀</>
                ) : (
                    <><strong>{safeDays} dias</strong> sem registros de retorno/avaria</>
                )}
            </span>
        </div>
    );
};
