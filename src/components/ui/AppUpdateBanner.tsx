import React from 'react';
import { DownloadCloud } from 'lucide-react';
import { Button } from './Button';
import { useAppVersion } from '../../hooks/useAppVersion';

export const AppUpdateBanner: React.FC = () => {
    const { updateAvailable, performUpdate, currentBuildId, newBuildId } = useAppVersion();

    if (!updateAvailable) return null;

    return (
        <div className="fixed bottom-0 left-0 right-0 z-50 p-4 pointer-events-none flex justify-center animate-in slide-in-from-bottom-5">
            <div className="bg-emerald-600 border border-emerald-500 shadow-2xl rounded-xl p-4 flex flex-col sm:flex-row items-center gap-4 pointer-events-auto max-w-lg w-full">
                <div className="w-10 h-10 bg-emerald-500 rounded-full flex items-center justify-center shrink-0">
                    <DownloadCloud className="w-5 h-5 text-white" />
                </div>
                <div className="text-white flex-1 text-center sm:text-left">
                    <h4 className="font-bold text-sm">Nova versão disponível!</h4>
                    <p className="text-emerald-100 text-[10px] mt-0.5 font-mono opacity-90">
                        {currentBuildId || 'v1'} → {newBuildId || 'v2'}
                    </p>
                    <p className="text-emerald-50 text-[11px] mt-1 italic">
                        Clique para atualizar e aplicar as melhorias.
                    </p>
                </div>
                <Button
                    onClick={performUpdate}
                    className="bg-white text-emerald-700 hover:bg-emerald-50 shrink-0 h-10 whitespace-nowrap font-bold"
                >
                    Atualizar Agora
                </Button>
            </div>
        </div>
    );
};
