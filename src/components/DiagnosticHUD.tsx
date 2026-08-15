import { safeArray } from '../lib/dataDiagnostics';
import { safeParseISO } from '../lib/dateUtils';
import React, { useState, useEffect } from 'react';
import { AlertCircle, AlertTriangle, Info, Terminal, X, Activity, Trash2 } from 'lucide-react';
import type { DataIssue } from '../lib/dataDiagnostics';
import { cn } from '../lib/utils';

export const DiagnosticHUD: React.FC = () => {
    const [issues, setIssues] = useState<DataIssue[]>([]);
    const [isMinimized, setIsMinimized] = useState(true);

    const isDev = process.env.NODE_ENV === 'development' || 
                 window.location.hostname === 'localhost';

    useEffect(() => {
        if (!isDev) return;

        // Load initial
        const diag = (window as any).__MARBLEFLOW_DIAGNOSTICS__;
        if (diag) setIssues(diag.getIssues().reverse());

        const handleNewIssue = (e: any) => {
            setIssues(prev => [e.detail, ...prev].slice(0, 100)); // Keep last 100
        };

        window.addEventListener('marbleflow-diagnostic-event', handleNewIssue);
        return () => window.removeEventListener('marbleflow-diagnostic-event', handleNewIssue);
    }, [isDev]);

    if (!isDev) return null;

    const criticalCount = safeArray(issues).filter(i => i.severity === 'critical').length;
    const warningCount = safeArray(issues).filter(i => i.severity === 'warning').length;

    const clearLogs = () => {
        const diag = (window as any).__MARBLEFLOW_DIAGNOSTICS__;
        if (diag) diag.clear();
        setIssues([]);
    };

    if (isMinimized) {
        return (
            <div 
                className={cn(
                    "fixed bottom-6 right-6 z-[9999] flex items-center gap-3 px-4 py-3 rounded-2xl cursor-pointer shadow-2xl border border-white/10 backdrop-blur-xl transition-all hover:scale-105 active:scale-95",
                    criticalCount > 0 ? "bg-rose-500 text-white animate-pulse" : 
                    warningCount > 0 ? "bg-amber-500 text-slate-900" : "bg-slate-900 text-emerald-400"
                )}
                onClick={() => setIsMinimized(false)}
            >
                <Activity className="w-5 h-5" />
                <div className="flex items-center gap-2 font-black text-[10px] uppercase tracking-widest">
                    <span>Diag Active</span>
                    {criticalCount > 0 && <span className="bg-white/20 px-1.5 rounded">{criticalCount} CRIT</span>}
                    {warningCount > 0 && <span className="bg-black/10 px-1.5 rounded">{warningCount} WRN</span>}
                </div>
            </div>
        );
    }

    return (
        <div className="fixed bottom-6 right-6 z-[9999] w-full max-w-md bg-slate-900 border border-white/10 rounded-[2rem] shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-5 duration-300">
            {/* Header */}
            <div className="p-6 bg-slate-800/50 flex items-center justify-between border-b border-white/5">
                <div className="flex items-center gap-3">
                    <Terminal className="w-5 h-5 text-emerald-400" />
                    <div>
                        <h3 className="text-white font-black text-xs uppercase tracking-widest">Diagnostic HUD</h3>
                        <p className="text-slate-400 text-[8px] font-bold uppercase mt-0.5">DEV_MODE | REALTIME LOGS</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button onClick={clearLogs} className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition-all" title="Clear Logs">
                        <Trash2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => setIsMinimized(true)} className="p-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-xl transition-all">
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* List */}
            <div className="flex-1 max-h-[400px] overflow-y-auto p-4 space-y-3 custom-scrollbar">
                {issues.length === 0 ? (
                    <div className="py-10 text-center">
                        <Info className="w-8 h-8 text-slate-700 mx-auto mb-2" />
                        <p className="text-slate-500 font-bold text-[10px] uppercase">No issues detected in current session</p>
                    </div>
                ) : (
                    safeArray(issues).map((issue, idx) => (
                        <div 
                            key={idx} 
                            className={cn(
                                "p-4 rounded-2xl border flex items-start gap-4 transition-all group",
                                issue.severity === 'critical' ? "bg-rose-500/5 border-rose-500/20" :
                                issue.severity === 'warning' ? "bg-amber-500/5 border-amber-500/20" : 
                                "bg-blue-500/5 border-blue-500/10"
                            )}
                        >
                            <div className={cn(
                                "h-8 w-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5",
                                issue.severity === 'critical' ? "bg-rose-500/20 text-rose-500" :
                                issue.severity === 'warning' ? "bg-amber-500/20 text-amber-500" :
                                "bg-blue-500/20 text-blue-500"
                            )}>
                                {issue.severity === 'critical' ? <AlertCircle className="w-4 h-4" /> : 
                                 issue.severity === 'warning' ? <AlertTriangle className="w-4 h-4" /> :
                                 <Info className="w-4 h-4" />}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2">
                                    <span className={cn(
                                        "text-[9px] font-black uppercase tracking-widest",
                                        issue.severity === 'critical' ? "text-rose-400" :
                                        issue.severity === 'warning' ? "text-amber-400" : "text-blue-400"
                                    )}>{issue.module}</span>
                                    <span className="text-[8px] text-slate-500 font-mono">{safeParseISO(issue.timestamp)?.toLocaleTimeString() || '---'}</span>
                                </div>
                                <h4 className="text-[10px] font-black text-white uppercase mt-1 truncate">{issue.field}</h4>
                                <p className="text-[10px] text-slate-400 font-bold mt-1 leading-relaxed">{issue.message}</p>
                                
                                <div className="mt-2 text-[9px] font-mono text-slate-600 bg-black/20 p-2 rounded-lg break-all">
                                    VAL: {JSON.stringify(issue.value)}
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Footer */}
            <div className="p-4 bg-slate-800/30 border-t border-white/5 text-center">
                <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest opacity-60 italic">DIAGNOSTICS_ACTIVE: Persistence Enabled for CRITICAL issues</p>
            </div>
        </div>
    );
};
