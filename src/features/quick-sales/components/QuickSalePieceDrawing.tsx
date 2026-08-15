import React from 'react';

interface QuickSalePieceDrawingProps {
    length: number; // in cm
    width: number;  // in cm
    type: string;
    material: string;
    quantity: number;
    thickness: number; // in cm
    finishes: {
        frente: string;
        fundo: string;
        esquerda: string;
        direita: string;
    };
    compact?: boolean;
    index?: number;
    observations?: string;
}

export const QuickSalePieceDrawing: React.FC<QuickSalePieceDrawingProps> = ({
    length = 100,
    width = 20,
    type = 'peça',
    material = 'Pedra',
    quantity = 1,
    thickness = 2,
    finishes: rawFinishes,
    compact = false,
    index = 0,
    observations = ''
}) => {
    const finishes = {
        frente: rawFinishes?.frente || 'Sem acabamento',
        fundo: rawFinishes?.fundo || 'Sem acabamento',
        esquerda: rawFinishes?.esquerda || 'Sem acabamento',
        direita: rawFinishes?.direita || 'Sem acabamento'
    };

    // Determine finishes classes/strokes
    // None -> thin slate, standard -> thick green, pingadeira -> dashed blue
    const getStrokeColor = (finishType: string) => {
        if (!finishType || finishType === 'Sem acabamento') return '#cbd5e1'; // gray-300
        if (finishType === 'Pingadeira / Canal') return '#3b82f6'; // blue-500
        return '#10b981'; // emerald-500
    };

    const getStrokeWidth = (finishType: string) => {
        if (!finishType || finishType === 'Sem acabamento') return 2;
        return 6;
    };

    const getStrokeDashArray = (finishType: string) => {
        if (finishType === 'Pingadeira / Canal') return '5 4';
        return undefined;
    };

    // Calculate drawing size with bounding box
    const viewBoxWidth = 220;
    const viewBoxHeight = 110;
    const padding = 24;

    const availableWidth = viewBoxWidth - padding * 2;
    const availableHeight = viewBoxHeight - padding * 2;

    const lengthVal = Math.max(Number(length || 0), 0.01);
    const widthVal = Math.max(Number(width || 0), 0.01);

    const scale = Math.min(
        availableWidth / lengthVal,
        availableHeight / widthVal
    );

    const rectWidth = Math.min(lengthVal * scale, availableWidth);
    const rectHeightVal = Math.min(widthVal * scale, availableHeight);

    const minVisualHeight = 12;
    const finalRectHeight = Math.max(rectHeightVal, minVisualHeight);

    const x = (viewBoxWidth - rectWidth) / 2;
    const y = (viewBoxHeight - finalRectHeight) / 2;
    const rectHeight = finalRectHeight;

    const hasFinish = (sideVal: string) => sideVal && sideVal !== 'Sem acabamento';
    const isPingadeira = (sideVal: string) => sideVal === 'Pingadeira / Canal';

    return (
        <div className="quick-sale-drawing flex flex-col items-center bg-slate-50 dark:bg-slate-900/30 p-4 rounded-2xl w-full max-w-full overflow-hidden print:p-2 print:bg-white print:border-slate-200 print:border">
            {index !== undefined && (
                <div className="text-[12px] font-black uppercase text-slate-800 tracking-widest mb-1.5 leading-none">
                    Peça #{index + 1} ({type} • {quantity}x)
                </div>
            )}

            {/* SVG Canvas */}
            <svg 
                viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
                preserveAspectRatio="xMidYMid meet"
                className="quick-sale-drawing-svg w-full h-auto bg-white dark:bg-slate-950 rounded-xl shadow-inner border border-slate-100 dark:border-slate-900 overflow-hidden"
                style={{ display: 'block' }}
            >
                {/* 2D Slab Face */}
                <rect 
                    x={x} 
                    y={y} 
                    width={rectWidth} 
                    height={rectHeight} 
                    fill="url(#stonePattern)" 
                    fillOpacity="0.05"
                />

                {/* Definitions for textures */}
                <defs>
                    <pattern id="stonePattern" width="20" height="20" patternUnits="userSpaceOnUse">
                        <line x1="0" y1="0" x2="20" y2="20" stroke="#94a3b8" strokeWidth="0.5" strokeOpacity="0.3" />
                        <line x1="20" y1="0" x2="0" y2="20" stroke="#94a3b8" strokeWidth="0.5" strokeOpacity="0.3" />
                    </pattern>
                </defs>

                {/* Left Edge (Esquerda) */}
                <line 
                    x1={x} 
                    y1={y} 
                    x2={x} 
                    y2={y + rectHeight} 
                    stroke={getStrokeColor(finishes.esquerda)} 
                    strokeWidth={getStrokeWidth(finishes.esquerda)}
                    strokeDasharray={getStrokeDashArray(finishes.esquerda)}
                />
                {/* Draw secondary dashed channel if standard finish AND pingadeira both apply, 
                    or if it's explicitly pingadeira, draw it offset inside */}
                {isPingadeira(finishes.esquerda) && (
                    <line 
                        x1={x + 6} 
                        y1={y + 6} 
                        x2={x + 6} 
                        y2={y + rectHeight - 6} 
                        stroke="#3b82f6" 
                        strokeWidth="3"
                        strokeDasharray="3 3"
                    />
                )}

                {/* Right Edge (Direita) */}
                <line 
                    x1={x + rectWidth} 
                    y1={y} 
                    x2={x + rectWidth} 
                    y2={y + rectHeight} 
                    stroke={getStrokeColor(finishes.direita)} 
                    strokeWidth={getStrokeWidth(finishes.direita)}
                    strokeDasharray={getStrokeDashArray(finishes.direita)}
                />
                {isPingadeira(finishes.direita) && (
                    <line 
                        x1={x + rectWidth - 6} 
                        y1={y + 6} 
                        x2={x + rectWidth - 6} 
                        y2={y + rectHeight - 6} 
                        stroke="#3b82f6" 
                        strokeWidth="3"
                        strokeDasharray="3 3"
                    />
                )}

                {/* Top Edge (Fundo) */}
                <line 
                    x1={x} 
                    y1={y} 
                    x2={x + rectWidth} 
                    y2={y} 
                    stroke={getStrokeColor(finishes.fundo)} 
                    strokeWidth={getStrokeWidth(finishes.fundo)}
                    strokeDasharray={getStrokeDashArray(finishes.fundo)}
                />
                {isPingadeira(finishes.fundo) && (
                    <line 
                        x1={x + 6} 
                        y1={y + 6} 
                        x2={x + rectWidth - 6} 
                        y2={y + 6} 
                        stroke="#3b82f6" 
                        strokeWidth="3"
                        strokeDasharray="3 3"
                    />
                )}

                {/* Bottom Edge (Frente) */}
                <line 
                    x1={x} 
                    y1={y + rectHeight} 
                    x2={x + rectWidth} 
                    y2={y + rectHeight} 
                    stroke={getStrokeColor(finishes.frente)} 
                    strokeWidth={getStrokeWidth(finishes.frente)}
                    strokeDasharray={getStrokeDashArray(finishes.frente)}
                />
                {isPingadeira(finishes.frente) && (
                    <line 
                        x1={x + 6} 
                        y1={y + rectHeight - 6} 
                        x2={x + rectWidth - 6} 
                        y2={y + rectHeight - 6} 
                        stroke="#3b82f6" 
                        strokeWidth="3"
                        strokeDasharray="3 3"
                    />
                )}

                {/* Dimensions Text Labels */}
                {/* Length Label (Horizontal) */}
                <text 
                    x={x + rectWidth / 2} 
                    y={Math.max(14, y - 8)} 
                    textAnchor="middle" 
                    className="fill-slate-900 dark:fill-slate-100"
                    style={{ fontSize: '13px', fontWeight: 900 }}
                >
                    {(Number(length) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m
                </text>

                {/* Width Label (Vertical) - Rotated to fit perfectly in margins */}
                <text 
                    x={Math.max(10, x - 10)} 
                    y={y + rectHeight / 2} 
                    textAnchor="middle" 
                    dominantBaseline="middle"
                    transform={`rotate(-90 ${Math.max(10, x - 10)} ${y + rectHeight / 2})`}
                    className="fill-slate-900 dark:fill-slate-100"
                    style={{ fontSize: '13px', fontWeight: 900 }}
                >
                    {(Number(width) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m
                </text>
            </svg>

            {/* Legend / Info List */}
            <div className="w-full mt-3 space-y-2 text-left">
                <div className="text-[11px] text-slate-800 font-bold leading-tight">
                    <p>Comprimento: {(Number(length) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} m</p>
                    <p>Largura: {(Number(width) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} m</p>
                    <p>Quantidade: {quantity}</p>
                    <p>Material: <span className="font-black text-slate-950">{material}</span></p>
                </div>

                <div className="flex flex-wrap gap-1.5 justify-start">
                    {hasFinish(finishes.frente) && (
                        <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md ${isPingadeira(finishes.frente) ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
                            Frente: {finishes.frente}
                        </span>
                    )}
                    {hasFinish(finishes.fundo) && (
                        <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md ${isPingadeira(finishes.fundo) ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
                            Fundo: {finishes.fundo}
                        </span>
                    )}
                    {hasFinish(finishes.esquerda) && (
                        <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md ${isPingadeira(finishes.esquerda) ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
                            Esquerda: {finishes.esquerda}
                        </span>
                    )}
                    {hasFinish(finishes.direita) && (
                        <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md ${isPingadeira(finishes.direita) ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
                            Direita: {finishes.direita}
                        </span>
                    )}
                    {!hasFinish(finishes.frente) && !hasFinish(finishes.fundo) && !hasFinish(finishes.esquerda) && !hasFinish(finishes.direita) && (
                        <span className="text-[10px] font-black uppercase text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                            Sem acabamento nas bordas
                        </span>
                    )}
                </div>
                {observations && (
                    <div className="w-full mt-2 p-1.5 bg-white dark:bg-slate-950 rounded-lg border border-slate-100 text-[9px] text-slate-500 font-medium leading-tight">
                        Obs: {observations}
                    </div>
                )}
            </div>
        </div>
    );
};
