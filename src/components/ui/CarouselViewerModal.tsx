import { safeArray } from '../../lib/dataDiagnostics';
import React, { useState, useEffect, useRef } from 'react';
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize, RotateCw } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface CarouselViewerProps {
    isOpen: boolean;
    onClose: () => void;
    images: (string | { url: string; name?: string })[];
    initialIndex?: number;
    title?: string;
}

export const CarouselViewerModal: React.FC<CarouselViewerProps> = ({
    isOpen,
    onClose,
    images = [],
    initialIndex = 0,
    title = "Visualizador de Anexos"
}) => {
    const [currentIndex, setCurrentIndex] = useState(initialIndex);
    const [scale, setScale] = useState(1);
    const [rotation, setRotation] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const dragStart = useRef({ x: 0, y: 0 });

    useEffect(() => {
        if (isOpen) {
            setCurrentIndex(initialIndex);
            resetView();
            // Prevent body scroll when open
            document.body.style.overflow = 'hidden';

            const handleKeyDown = (e: KeyboardEvent) => {
                if (e.key === 'Escape') onClose();
                if (e.key === 'ArrowRight') nextImage();
                if (e.key === 'ArrowLeft') prevImage();
            };
            window.addEventListener('keydown', handleKeyDown);
            return () => {
                document.body.style.overflow = 'auto';
                window.removeEventListener('keydown', handleKeyDown);
            };
        }
    }, [isOpen, initialIndex]);

    if (!isOpen || images.length === 0) return null;

    const resetView = () => {
        setScale(1);
        setRotation(0);
        setPosition({ x: 0, y: 0 });
    };

    const nextImage = () => {
        setCurrentIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));
        resetView();
    };

    const prevImage = () => {
        setCurrentIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
        resetView();
    };

    const zoomIn = () => setScale(prev => Math.min(prev + 0.5, 4));
    const zoomOut = () => setScale(prev => Math.max(prev - 0.5, 0.5));
    const rotate = () => setRotation(prev => (prev + 90) % 360);

    // Pan implementation
    const handleMouseDown = (e: React.MouseEvent) => {
        if (scale > 1) {
            setIsDragging(true);
            dragStart.current = { x: e.clientX - position.x, y: e.clientY - position.y };
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (isDragging && scale > 1) {
            setPosition({
                x: e.clientX - dragStart.current.x,
                y: e.clientY - dragStart.current.y
            });
        }
    };

    const handleMouseUp = () => setIsDragging(false);

    const currentImage = images[currentIndex];
    const currentUrl = typeof currentImage === 'string' ? currentImage : currentImage?.url || '';
    const currentName = typeof currentImage === 'string' ? `Anexo ${currentIndex + 1}` : currentImage?.name || `Anexo ${currentIndex + 1}`;

    const isPdf = currentUrl?.toLowerCase().includes('.pdf') || currentUrl?.includes('documents%2F');
    const isBroken = !currentUrl || (!currentUrl.startsWith('http') && !currentUrl.startsWith('blob:'));

    return (
        <div className="fixed inset-0 z-[100] flex flex-col bg-black/95 backdrop-blur-xl animate-in fade-in duration-300 select-none">
            {/* Top Toolbar */}
            <div className="flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent absolute top-0 w-full z-10">
                <div className="flex items-center gap-3">
                    <span className="text-white/70 font-medium text-sm px-3 py-1.5 bg-white/10 rounded-full backdrop-blur-md">
                        {currentIndex + 1} / {images.length}
                    </span>
                    <h2 className="text-white font-semibold hidden sm:block truncate max-w-[200px] md:max-w-md">{title}</h2>
                </div>

                <div className="flex items-center gap-2">
                    <div className="flex bg-white/10 rounded-xl backdrop-blur-md p-1 mr-4 border border-white/5">
                        <button onClick={zoomOut} className="p-2 text-white/70 hover:text-white hover:bg-white/20 rounded-lg transition-colors" title="Zoom Out">
                            <ZoomOut className="w-5 h-5" />
                        </button>
                        <button onClick={resetView} className="p-2 text-white/70 hover:text-white hover:bg-white/20 rounded-lg transition-colors" title="Reset Dimension">
                            <Maximize className="w-5 h-5" />
                        </button>
                        <button onClick={zoomIn} className="p-2 text-white/70 hover:text-white hover:bg-white/20 rounded-lg transition-colors" title="Zoom In">
                            <ZoomIn className="w-5 h-5" />
                        </button>
                        <div className="w-px h-5 bg-white/20 self-center mx-1"></div>
                        <button onClick={rotate} className="p-2 text-white/70 hover:text-white hover:bg-white/20 rounded-lg transition-colors" title="Rotate">
                            <RotateCw className="w-5 h-5" />
                        </button>
                    </div>

                    <button
                        onClick={onClose}
                        className="p-3 bg-red-500/80 hover:bg-red-500 text-white rounded-xl transition-colors backdrop-blur-md shadow-lg"
                        title="Fechar"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>
            </div>

            {/* Main Viewer Area */}
            <div
                className={cn(
                    "flex-1 flex items-center justify-center overflow-hidden relative",
                    scale > 1 ? "cursor-grab active:cursor-grabbing" : "cursor-default"
                )}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onDoubleClick={zoomIn}
            >
                {/* Navigation Arrows */}
                {images.length > 1 && (
                    <>
                        <button
                            onClick={(e) => { e.stopPropagation(); prevImage(); }}
                            className="absolute left-4 sm:left-8 z-20 p-4 bg-white/5 hover:bg-white/20 border border-white/10 text-white rounded-2xl backdrop-blur-md transition-all hover:scale-110 shadow-2xl group"
                        >
                            <ChevronLeft className="w-8 h-8 group-hover:-translate-x-1 transition-transform" />
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); nextImage(); }}
                            className="absolute right-4 sm:right-8 z-20 p-4 bg-white/5 hover:bg-white/20 border border-white/10 text-white rounded-2xl backdrop-blur-md transition-all hover:scale-110 shadow-2xl group"
                        >
                            <ChevronRight className="w-8 h-8 group-hover:translate-x-1 transition-transform" />
                        </button>
                    </>
                )}

                {/* Image/Content Container */}
                <div
                    className="relative transition-transform duration-200 ease-out flex items-center justify-center w-full h-full max-w-6xl p-4 sm:p-20"
                    style={{
                        transform: `translate(${position.x}px, ${position.y}px) scale(${scale}) rotate(${rotation}deg)`,
                    }}
                >
                    {isBroken ? (
                        <div className="bg-slate-900 border border-red-500/30 p-12 rounded-3xl flex flex-col items-center text-center max-w-sm">
                            <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mb-6">
                                <X className="w-10 h-10 text-red-500" />
                            </div>
                            <h3 className="text-xl font-bold text-white mb-2">Imagem Inacessível</h3>
                            <p className="text-slate-400 text-sm mb-6">Não foi possível carregar este anexo. O link pode estar expirado ou o arquivo foi removido.</p>
                            <code className="text-[10px] bg-black p-2 rounded text-red-400 break-all">{currentUrl || 'projeto.png'}</code>
                        </div>
                    ) : isPdf ? (
                        <iframe
                            src={currentUrl}
                            className="w-full h-[80vh] rounded-2xl shadow-2xl bg-white"
                            title="PDF Viewer"
                        />
                    ) : (
                        <img
                            src={currentUrl}
                            alt={currentName}
                            className="max-h-[85vh] max-w-full object-contain drop-shadow-2xl rounded-sm"
                            draggable={false}
                            onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                target.style.display = 'none';
                                const parent = target.parentElement;
                                if (parent) {
                                    const errorDiv = document.createElement('div');
                                    errorDiv.className = "flex flex-col items-center justify-center p-12 text-center";
                                    errorDiv.innerHTML = `<div class="p-6 bg-red-500/10 rounded-full mb-4"><svg class="w-12 h-12 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></div><h3 class="text-xl font-bold text-white mb-2">Erro ao Carregar</h3><p class="text-slate-400 text-sm">Verifique sua conexão ou se as regras de CORS do Storage estão configuradas.</p>`;
                                    parent.appendChild(errorDiv);
                                }
                            }}
                        />
                    )}
                </div>
            </div>

            {/* Thumbnail Navigation Strip (Optional Bottom Bar) */}
            {images.length > 1 && (
                <div className="absolute bottom-6 w-full flex justify-center z-10 px-4">
                    <div className="flex gap-2 p-2 bg-white/10 backdrop-blur-xl border border-white/10 rounded-2xl overflow-x-auto custom-scrollbar max-w-full">
                                {safeArray(images).map((img, idx) => {
                                    const url = typeof img === 'string' ? img : img?.url || '';
                                    const isPdfThumb = url.toLowerCase().includes('.pdf') || url.includes('documents%2F');
                                    return (
                                        <button
                                            key={idx}
                                            onClick={() => { setCurrentIndex(idx); resetView(); }}
                                            className={cn(
                                                "relative w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 transition-all duration-300 border-2",
                                                idx === currentIndex ? "border-brand-emerald scale-110 shadow-[0_0_15px_rgba(16,185,129,0.5)] z-10" : "border-transparent opacity-50 hover:opacity-100"
                                            )}
                                        >
                                            {isPdfThumb ? (
                                                <div className="w-full h-full bg-slate-800 flex items-center justify-center text-white text-[10px] font-bold">PDF</div>
                                            ) : (
                                                <img src={url} className="w-full h-full object-cover" alt={`Thumb ${idx}`} />
                                            )}
                                        </button>
                                    )
                                })}
                    </div>
                </div>
            )}
        </div>
    );
};
