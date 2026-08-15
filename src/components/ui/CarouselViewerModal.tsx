import React, { useState, useEffect, useRef } from 'react';
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize, RotateCw } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface CarouselViewerProps {
    isOpen: boolean;
    onClose: () => void;
    images: string[];
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

    const isPdf = images[currentIndex]?.includes('.pdf');

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
                    {isPdf ? (
                        <iframe
                            src={images[currentIndex]}
                            className="w-full h-[80vh] rounded-2xl shadow-2xl bg-white"
                            title="PDF Viewer"
                        />
                    ) : (
                        <img
                            src={images[currentIndex]}
                            alt={`Attachment ${currentIndex + 1}`}
                            className="max-h-[85vh] max-w-full object-contain drop-shadow-2xl rounded-sm"
                            draggable={false}
                        />
                    )}
                </div>
            </div>

            {/* Thumbnail Navigation Strip (Optional Bottom Bar) */}
            {images.length > 1 && (
                <div className="absolute bottom-6 w-full flex justify-center z-10 px-4">
                    <div className="flex gap-2 p-2 bg-white/10 backdrop-blur-xl border border-white/10 rounded-2xl overflow-x-auto custom-scrollbar max-w-full">
                        {images.map((img, idx) => (
                            <button
                                key={idx}
                                onClick={() => { setCurrentIndex(idx); resetView(); }}
                                className={cn(
                                    "relative w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 transition-all duration-300 border-2",
                                    idx === currentIndex ? "border-brand-emerald scale-110 shadow-[0_0_15px_rgba(16,185,129,0.5)] z-10" : "border-transparent opacity-50 hover:opacity-100"
                                )}
                            >
                                {img.includes('.pdf') ? (
                                    <div className="w-full h-full bg-slate-800 flex items-center justify-center text-white text-[10px] font-bold">PDF</div>
                                ) : (
                                    <img src={img} className="w-full h-full object-cover" alt={`Thumb ${idx}`} />
                                )}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
