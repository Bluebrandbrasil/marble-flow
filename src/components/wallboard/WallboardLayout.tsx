import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, ChevronLeft, ChevronRight, Maximize, X } from 'lucide-react';

interface Props {
    children: React.ReactNode[];
    onExit: () => void;
    intervalMs: number;
}

export const WallboardLayout: React.FC<Props> = ({ children, onExit, intervalMs }) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isPlaying, setIsPlaying] = useState(true);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [hasStarted, setHasStarted] = useState(false);
    const [error, setError] = useState('');
    
    const containerRef = useRef<HTMLDivElement>(null);
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    // Sync fullscreen state via API events
    useEffect(() => {
        const handleFullscreenChange = () => {
            const isFs = document.fullscreenElement === containerRef.current;
            setIsFullscreen(isFs);
            
            // Pausar se perdeu o fullscreen inesperadamente
            if (!isFs && hasStarted) {
                setIsPlaying(false);
            }
        };
        
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, [hasStarted]);

    // Cleanup timer on unmount
    useEffect(() => {
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, []);

    const startFullscreen = async () => {
        setError('');
        if (containerRef.current) {
            try {
                await containerRef.current.requestFullscreen();
                setHasStarted(true);
                setIsPlaying(true);
            } catch (err: any) {
                console.error("Fullscreen error:", err);
                setError("Não foi possível iniciar a tela cheia. Clique novamente ou utilize o modo normal.");
            }
        }
    };

    const startNormal = () => {
        setError('');
        setHasStarted(true);
        setIsPlaying(true);
    };

    // Main rotation logic
    useEffect(() => {
        if (timerRef.current) clearInterval(timerRef.current);

        if (!isPlaying || !hasStarted) return;

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden') {
                if (timerRef.current) clearInterval(timerRef.current);
            } else if (document.visibilityState === 'visible' && isPlaying && hasStarted) {
                timerRef.current = setInterval(() => {
                    setCurrentIndex(prev => (prev + 1) % children.length);
                }, intervalMs);
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);

        if (document.visibilityState === 'visible') {
            timerRef.current = setInterval(() => {
                setCurrentIndex(prev => (prev + 1) % children.length);
            }, intervalMs);
        }

        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [isPlaying, hasStarted, children.length, intervalMs]);

    const handleNext = () => setCurrentIndex(prev => (prev + 1) % children.length);
    const handlePrev = () => setCurrentIndex(prev => (prev - 1 + children.length) % children.length);

    // Keyboard controls
    useEffect(() => {
        if (!hasStarted) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            // Ignore events from inputs, selects, textareas
            if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes((e.target as HTMLElement).tagName)) {
                return;
            }

            if (e.key === 'ArrowRight') handleNext();
            if (e.key === 'ArrowLeft') handlePrev();
            if (e.key === ' ') {
                e.preventDefault();
                setIsPlaying(p => !p);
            }
            if (e.key === 'Escape' && !isFullscreen) {
                // Ignore. Browser will handle exiting FS and triggering fullscreenchange.
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [hasStarted, isFullscreen, children.length]);

    const handleExitClick = async () => {
        if (document.fullscreenElement) {
            await document.exitFullscreen();
        }
        onExit();
    };

    return (
        <div ref={containerRef} className="bg-slate-900 z-[9999] overflow-hidden flex flex-col font-sans h-screen w-full relative">
            {!hasStarted ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-8 bg-slate-900 z-50">
                    <h1 className="text-6xl font-black text-white mb-2 uppercase tracking-tighter">Modo Telão</h1>
                    <p className="text-xl text-slate-400 mb-12">Painel de Inteligência Gerencial</p>

                    {error && (
                        <div className="bg-red-500/20 text-red-200 border border-red-500/50 p-4 rounded-xl mb-8 max-w-md text-center font-medium">
                            {error}
                        </div>
                    )}

                    <p className="text-slate-300 mb-6 font-medium text-lg">Clique para iniciar a apresentação</p>
                    
                    <div className="flex flex-col gap-4">
                        <button 
                            onClick={startFullscreen}
                            className="bg-brand-emerald hover:bg-brand-emerald/90 text-white font-black text-xl px-12 py-6 rounded-2xl transition-all hover:scale-105 shadow-xl shadow-brand-emerald/20 flex items-center justify-center gap-3"
                        >
                            <Maximize className="w-6 h-6" /> INICIAR MODO TELÃO
                        </button>

                        <button 
                            onClick={startNormal}
                            className="text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 font-bold px-8 py-4 rounded-xl transition-all text-sm"
                        >
                            Visualizar sem tela cheia
                        </button>
                    </div>
                </div>
            ) : (
                <>
                    {/* Main Content Area */}
                    <div className="flex-1 relative overflow-hidden">
                        {children.map((child, index) => (
                            <div
                                key={index}
                                className="absolute inset-0 transition-opacity duration-1000 ease-in-out"
                                style={{
                                    opacity: currentIndex === index ? 1 : 0,
                                    pointerEvents: currentIndex === index ? 'auto' : 'none',
                                    zIndex: currentIndex === index ? 10 : 0
                                }}
                            >
                                {child}
                            </div>
                        ))}
                    </div>

                    {/* Controls Overlay (hover to reveal) */}
                    <div className="absolute bottom-0 left-0 right-0 p-6 flex justify-between items-center opacity-0 hover:opacity-100 transition-opacity duration-300 z-50 bg-gradient-to-t from-slate-900/90 via-slate-900/40 to-transparent">
                        <div className="flex items-center gap-4">
                            <button onClick={() => setIsPlaying(!isPlaying)} className="p-4 bg-slate-800/90 text-white rounded-full hover:bg-slate-700 transition-colors shadow-lg">
                                {isPlaying ? <Pause className="w-8 h-8" /> : <Play className="w-8 h-8" />}
                            </button>
                            
                            <button onClick={handlePrev} className="p-4 bg-slate-800/90 text-white rounded-full hover:bg-slate-700 transition-colors shadow-lg">
                                <ChevronLeft className="w-8 h-8" />
                            </button>
                            
                            <button onClick={handleNext} className="p-4 bg-slate-800/90 text-white rounded-full hover:bg-slate-700 transition-colors shadow-lg">
                                <ChevronRight className="w-8 h-8" />
                            </button>
                            
                            <div className="text-slate-300 font-bold ml-4 text-xl">
                                {currentIndex + 1} / {children.length}
                            </div>
                        </div>

                        <div className="flex items-center gap-4">
                            {!isFullscreen && (
                                <button onClick={startFullscreen} className="px-6 py-4 bg-brand-emerald/90 text-white font-bold rounded-xl hover:bg-brand-emerald transition-colors shadow-lg">
                                    Retomar Tela Cheia
                                </button>
                            )}
                            <button onClick={handleExitClick} className="px-6 py-4 bg-red-500/90 text-white font-bold rounded-xl hover:bg-red-600 transition-colors shadow-lg">
                                Voltar ao Dashboard
                            </button>
                        </div>
                    </div>

                    {/* Progress Bar */}
                    {isPlaying && (
                        <div className="absolute bottom-0 left-0 h-1.5 bg-brand-emerald z-40 transition-all duration-100 ease-linear shadow-[0_0_10px_rgba(16,185,129,0.5)]"
                            style={{
                                width: '100%',
                                animation: `progress ${intervalMs}ms linear infinite`
                            }}
                        />
                    )}
                    <style>{`
                        @keyframes progress {
                            0% { width: 0%; }
                            100% { width: 100%; }
                        }
                    `}</style>
                </>
            )}
        </div>
    );
};
