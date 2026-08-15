import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWallboardData } from '../hooks/useWallboardData';
import { WallboardLayout } from '../components/wallboard/WallboardLayout';
import { getWallboardMetrics } from '../components/wallboard/wallboardMetrics';
import { subDays } from 'date-fns';

// Slides
import { CommercialPerformanceSlide } from '../components/wallboard/slides/CommercialPerformanceSlide';
import { MaterialsSlide } from '../components/wallboard/slides/MaterialsSlide';
import { CitiesSlide } from '../components/wallboard/slides/CitiesSlide';
import { SellersSlide } from '../components/wallboard/slides/SellersSlide';
import { ProductionSlide } from '../components/wallboard/slides/ProductionSlide';
import { InstallationSlide } from '../components/wallboard/slides/InstallationSlide';
import { Wifi, WifiOff } from 'lucide-react';

export const WallboardPage: React.FC = () => {
    const navigate = useNavigate();
    const { quotes, orders, contracts, measurements, loading, lastUpdated } = useWallboardData('30days');
    const [intervalSec, setIntervalSec] = useState(15);
    const [isOnline, setIsOnline] = useState(navigator.onLine);

    // Persist interval settings
    useEffect(() => {
        const saved = localStorage.getItem('wallboard_interval');
        if (saved) setIntervalSec(Number(saved));
        
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    const handleExit = () => {
        navigate('/inicio');
    };

    const metrics = useMemo(() => {
        const now = new Date();
        const start = subDays(now, 30); // Ultimos 30 dias por padrao no telao
        return getWallboardMetrics({ quotes, orders, contracts, measurements, startDate: start, endDate: now });
    }, [quotes, orders, contracts, measurements]);

    if (loading) {
        return (
            <div className="fixed inset-0 bg-slate-900 flex items-center justify-center z-[9999]">
                <div className="text-white flex flex-col items-center gap-6">
                    <div className="w-16 h-16 border-4 border-brand-emerald border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-2xl text-slate-400 font-medium">Carregando Dados do Telão...</p>
                </div>
            </div>
        );
    }

    const formatTime = (d: Date | null) => d ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '--:--';

    return (
        <>
            <WallboardLayout intervalMs={intervalSec * 1000} onExit={handleExit}>
                <CommercialPerformanceSlide metrics={metrics.commercial} />
                <MaterialsSlide materials={metrics.materials} />
                <CitiesSlide cities={metrics.cities} />
                <SellersSlide sellers={metrics.sellers} />
                <ProductionSlide production={metrics.production} />
                <InstallationSlide installation={metrics.installation} />
            </WallboardLayout>
            
            {/* Status Indicator */}
            <div className="fixed bottom-4 right-6 z-[10000] flex flex-col items-end gap-1 pointer-events-none opacity-50">
                <div className="flex items-center gap-2 bg-slate-900/80 px-3 py-1.5 rounded-full border border-slate-700/50 backdrop-blur-sm">
                    {isOnline ? <Wifi className="w-3 h-3 text-brand-emerald" /> : <WifiOff className="w-3 h-3 text-amber-500" />}
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        {isOnline ? 'Online' : 'Reconectando...'}
                    </span>
                </div>
                <div className="text-[10px] font-black tracking-widest text-slate-500 bg-slate-900/80 px-3 py-1 rounded-full border border-slate-700/50">
                    ATUALIZADO ÀS {formatTime(lastUpdated)}
                </div>
            </div>
        </>
    );
};
