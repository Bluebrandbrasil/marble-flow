import React from 'react';
import { cn } from '../../lib/utils';


interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
    variant?: 'default' | 'secondary' | 'outline' | 'destructive' | 'success' | 'warning';
}

export const Badge = ({ className, variant = 'default', ...props }: BadgeProps) => {
    const variants = {
        default: 'border-transparent bg-slate-900 text-slate-50 hover:bg-slate-900/80 dark:bg-slate-50 dark:text-slate-900 dark:hover:bg-slate-50/80',
        secondary: 'border-transparent bg-slate-100 text-slate-900 hover:bg-slate-100/80 dark:bg-slate-800 dark:text-slate-50 dark:hover:bg-slate-800/80',
        outline: 'text-slate-950 dark:text-slate-50',
        destructive: 'border-transparent bg-red-500 text-slate-50 hover:bg-red-500/80 dark:bg-red-900 dark:text-slate-50 dark:hover:bg-red-900/80',
        success: 'border-transparent bg-emerald-500 text-slate-50 hover:bg-emerald-500/80 dark:bg-emerald-900 dark:text-slate-50 dark:hover:bg-emerald-900/80',
        warning: 'border-transparent bg-amber-500 text-slate-50 hover:bg-amber-500/80 dark:bg-amber-900 dark:text-slate-50 dark:hover:bg-amber-900/80',
    };

    return (
        <span
            className={cn(
                'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-slate-950 focus:ring-offset-2 dark:border-slate-800 dark:focus:ring-slate-300',
                variants[variant],
                className
            )}
            {...props}
        />
    );
};
