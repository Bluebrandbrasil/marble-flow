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
            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg border shadow-sm transition-colors duration-500 bg-white dark:bg-slate-900 ${isCelebrating
                    ? 'border-emerald-200 text-emerald-700 dark:border-emerald-800'
                    : 'border-slate-200 text-slate-700 dark:border-slate-800'
                }`}
        >
            {isCelebrating ? (
                <Trophy className="h-4.5 w-4.5 text-emerald-500" />
            ) : (
                <AlertTriangle className="h-4.5 w-4.5 text-amber-500" />
            )}
            <span className="text-[11px] font-black uppercase tracking-wider">
                {isCelebrating ? (
                    <>Operação Estável: {safeDays} dias sem avarias</>
                ) : (
                    <>Qualidade: {safeDays} dias sem avarias</>
                )}
            </span>
        </div>

    );
};
