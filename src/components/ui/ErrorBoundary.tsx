import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCcw, Home } from 'lucide-react';
import { Button } from './Button';

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
    name?: string;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null
    };

    public static getDerivedStateFromError(error: Error): State {
        // Update state so the next render will show the fallback UI.
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error(`[ErrorBoundary] [${this.props.name || 'Global'}] CRITICAL ERROR:`, error, errorInfo);
    }

    private handleReset = () => {
        this.setState({ hasError: false, error: null });
        window.location.reload();
    };

    private handleGoHome = () => {
        this.setState({ hasError: false, error: null });
        window.location.href = '/inicio';
    };

    public render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }

            return (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-50 dark:bg-[#050505] min-h-[400px] rounded-3xl border-2 border-dashed border-slate-200 dark:border-white/5 m-4">
                    <div className="h-20 w-20 bg-rose-50 dark:bg-rose-950/20 rounded-full flex items-center justify-center mb-6 shadow-sm">
                        <AlertTriangle className="h-10 w-10 text-rose-500" />
                    </div>
                    
                    <h2 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tight mb-2">
                        Opa! Algo não saiu como esperado.
                    </h2>
                    
                    <p className="text-slate-500 dark:text-slate-400 font-medium max-w-md mb-8">
                        {this.props.name ? `O módulo "${this.props.name}"` : 'Esta parte do sistema'} encontrou um erro inesperado ao processar os dados. 
                        Isso pode ser causado por dados incompletos ou uma falha de conexão.
                    </p>

                    <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-white/10 mb-8 max-w-xl w-full overflow-hidden">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 text-left">Detalhes do Erro</p>
                        <code className="text-[11px] text-rose-500 font-mono break-all text-left block">
                            {this.state.error?.message || 'Erro desconhecido'}
                        </code>
                    </div>

                    <div className="flex flex-wrap items-center justify-center gap-4">
                        <Button 
                            onClick={this.handleReset}
                            className="bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-bold px-6 h-12 rounded-xl flex items-center gap-2"
                        >
                            <RefreshCcw className="h-4 w-4" />
                            Tentar Novamente
                        </Button>
                        <Button 
                            variant="ghost"
                            onClick={this.handleGoHome}
                            className="text-slate-500 font-bold px-6 h-12 rounded-xl flex items-center gap-2 border border-slate-200 dark:border-white/10"
                        >
                            <Home className="h-4 w-4" />
                            Ir para o Início
                        </Button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
