import React from 'react';
import { cn } from '../../lib/utils';
import { Zap, Search } from 'lucide-react';

interface QuoteLayoutPreviewProps {
    layout: 'classic' | 'commercial' | 'premium';
    isSelected?: boolean;
    onClick?: () => void;
    showLabel?: boolean;
}

export const QuoteLayoutPreview: React.FC<QuoteLayoutPreviewProps> = ({ 
    layout, 
    isSelected, 
    onClick,
    showLabel = true
}) => {
    return (
        <div 
            onClick={onClick}
            className={cn(
                "group relative border-2 rounded-2xl transition-all cursor-pointer overflow-hidden",
                isSelected 
                    ? "border-amber-500 bg-amber-50/10 shadow-xl ring-4 ring-amber-500/10" 
                    : "border-slate-100 bg-white hover:border-slate-200 hover:shadow-lg"
            )}
        >
            {/* Real Miniature Render */}
            <div className="aspect-[210/297] w-full bg-slate-50 relative p-4 overflow-hidden origin-top scale-[1.0] transition-transform">
                <div className={cn(
                    "w-full h-full bg-white shadow-sm flex flex-col p-[5%] text-[4px] leading-tight select-none",
                    layout === 'premium' && "bg-white",
                    layout === 'commercial' && "bg-white"
                )}>
                    {/* 1. Header Area */}
                    {layout === 'premium' && (
                        <div className="border-b-[0.5px] border-slate-900 pb-1.5 mb-2 bg-white px-1">
                            <div className="flex justify-between items-center mb-1">
                                <div className="space-y-0.5">
                                    <div className="h-1.5 w-14 bg-slate-900 rounded-sm" />
                                    <div className="h-[0.5px] w-10 bg-slate-200" />
                                </div>
                                <div className="text-right"><div className="h-0.5 w-6 bg-slate-100 ml-auto" /></div>
                            </div>
                            <div className="grid grid-cols-[12px_1fr] gap-2 items-center">
                                <div className="h-4 w-4 bg-slate-50 flex items-center justify-center border border-slate-100"><div className="h-2 w-2 bg-slate-200" /></div>
                                <div className="grid grid-cols-2 gap-x-1 gap-y-0.5">
                                    <div className="h-[0.5px] w-6 bg-slate-100" />
                                    <div className="h-[0.5px] w-6 bg-slate-100" />
                                    <div className="h-[0.5px] w-14 bg-slate-100 col-span-2" />
                                </div>
                            </div>
                        </div>
                    )}

                    {layout === 'commercial' && (
                        <div className="border-[0.5px] border-slate-300 bg-white mb-2 overflow-hidden">
                            <div className="grid grid-cols-2 border-b-[0.5px] border-slate-300">
                                <div className="p-1 space-y-1">
                                    <div className="h-2 w-2 bg-slate-200 rounded-full" />
                                    <div className="h-[0.5px] w-8 bg-slate-900" />
                                </div>
                                <div className="bg-slate-50 p-1 flex flex-col justify-center gap-1">
                                    <div className="h-1 w-10 bg-slate-900" />
                                    <div className="h-[0.5px] w-6 bg-slate-400" />
                                </div>
                            </div>
                        </div>
                    )}

                    {layout === 'classic' && (
                        <div className="grid grid-cols-[12px_1fr_12px] gap-2 border-b-[0.5px] border-slate-100 pb-2 mb-2">
                            <div className="h-3 w-3 bg-slate-100 rounded-sm" />
                            <div className="space-y-1">
                                <div className="h-0.5 w-20 bg-slate-200" />
                                <div className="h-0.5 w-16 bg-slate-100" />
                                <div className="h-0.5 w-24 bg-slate-100" />
                            </div>
                            <div className="h-1 w-2 bg-slate-100" />
                        </div>
                    )}

                    {/* 2. Client Area */}
                    <div className="mb-2">
                        {layout === 'premium' ? (
                            <div className="grid grid-cols-2 gap-2">
                                <div className="bg-slate-50 p-1 rounded-lg space-y-1">
                                    <div className="h-[0.5px] w-4 bg-slate-300" />
                                    <div className="h-1 w-8 bg-slate-900" />
                                    <div className="h-[0.5px] w-12 bg-slate-400" />
                                </div>
                                <div className="p-1 border-[0.5px] border-slate-100 rounded-lg flex flex-col items-end justify-center space-y-1">
                                    <div className="h-[0.5px] w-6 bg-slate-300" />
                                    <div className="h-[0.5px] w-8 bg-slate-900" />
                                </div>
                            </div>
                        ) : layout === 'commercial' ? (
                            <div className="border-[0.5px] border-slate-300 border-t-0 p-1.5 bg-slate-50/50 mb-2 grid grid-cols-2 gap-2">
                                <div className="space-y-1">
                                    <div className="h-1 w-10 bg-slate-900" />
                                    <div className="h-[0.5px] w-14 bg-slate-400" />
                                </div>
                                <div className="border-l-[0.5px] border-slate-200 pl-2 space-y-1">
                                    <div className="h-1 w-6 bg-slate-900" />
                                    <div className="h-1 w-8 bg-slate-950 px-1" />
                                </div>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 gap-4 mb-2">
                                <div className="space-y-1">
                                    <div className="h-0.5 w-8 bg-slate-300" />
                                    <div className="h-1 w-12 bg-slate-800" />
                                    <div className="h-0.5 w-20 bg-slate-400" />
                                </div>
                                <div className="text-right space-y-1">
                                    <div className="h-0.5 w-8 bg-slate-300 ml-auto" />
                                    <div className="h-1 w-8 bg-slate-800 ml-auto" />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* 3. Table/Items Area */}
                    <div className="space-y-1.5 mb-2 flex-1">
                        <div className={cn(
                            "h-1 w-16 bg-slate-100 mb-1 rounded-sm",
                            layout === 'premium' && "bg-slate-900 w-12 px-1 flex items-center h-1.5",
                            layout === 'commercial' && "bg-slate-100 border-[0.5px] border-slate-300 flex items-center px-1 h-2"
                        )}>
                            {layout === 'commercial' && <div className="h-[0.2px] w-full bg-slate-400" />}
                        </div>
                        
                        {layout === 'commercial' ? (
                           <div className="border-[0.5px] border-slate-300 bg-white">
                               {[1, 2, 3, 4].map(i => (
                                   <div key={i} className="grid grid-cols-[1fr_4px_8px] border-b-[0.1px] border-slate-200">
                                       <div className="p-0.5 space-y-0.5">
                                           <div className="h-0.5 w-10 bg-slate-700" />
                                           <div className="h-[0.2px] w-16 bg-slate-300" />
                                       </div>
                                       <div className="border-x-[0.1px] border-slate-200 bg-slate-50/30" />
                                       <div className="bg-slate-100/30 flex items-center justify-center"><div className="h-0.5 w-4 bg-slate-900"/></div>
                                   </div>
                               ))}
                           </div>
                        ) : (
                            <div className="space-y-1">
                                {[1, 2, 3].map(i => (
                                    <div key={i} className="flex justify-between items-center py-0.5 border-b-[0.1px] border-slate-50">
                                        <div className="space-y-0.5">
                                            <div className={cn("h-0.5 w-12 bg-slate-700", layout === 'premium' && "h-1 bg-slate-900")} />
                                            <div className="h-[0.2px] w-24 bg-slate-300" />
                                        </div>
                                        <div className="h-0.5 w-6 bg-slate-900" />
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* 4. Totals/Footer Area */}
                    <div className="mt-auto">
                        {layout === 'commercial' ? (
                            <div className="border-[0.5px] border-slate-300 bg-white grid grid-cols-5 mt-2">
                                <div className="col-span-3 p-1 space-y-1">
                                    <div className="h-[0.2px] w-12 bg-slate-200" />
                                    <div className="h-0.5 w-8 bg-slate-400" />
                                </div>
                                <div className="col-span-2 bg-slate-900 p-1 flex flex-col items-center justify-center gap-1">
                                    <div className="h-[0.2px] w-8 bg-amber-500" />
                                    <div className="h-1.5 w-10 bg-white" />
                                </div>
                            </div>
                        ) : layout === 'premium' ? (
                            <div className="grid grid-cols-5 gap-1.5 items-start mt-2">
                                <div className="col-span-3 space-y-1">
                                    <div className="bg-slate-50 p-1 rounded-lg space-y-0.5 border-[0.5px] border-slate-100">
                                        <div className="h-0.5 w-4 bg-slate-900" />
                                        <div className="h-[0.5px] w-12 bg-slate-200" />
                                    </div>
                                    <div className="grid grid-cols-2 gap-1 mt-1">
                                        <div className="h-1.5 bg-slate-900 rounded-[2px]" />
                                        <div className="h-1.5 bg-emerald-600 rounded-[2px]" />
                                    </div>
                                </div>
                                <div className="col-span-2">
                                    <div className="bg-slate-50 p-1.5 rounded-lg space-y-1 border-[0.5px] border-slate-100">
                                        <div className="flex justify-between"><div className="h-[0.2px] w-3 bg-slate-300"/><div className="h-[0.2px] w-3 bg-slate-900"/></div>
                                        <div className="pt-1 mt-0.5 border-t-[0.1px] border-slate-200 text-center">
                                            <div className="h-0.5 w-6 bg-slate-300 mx-auto mb-1" />
                                            <div className="h-1.5 w-10 bg-slate-900 mx-auto" />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 gap-4 mt-2">
                                <div className="space-y-1">
                                    <div className="h-[0.5px] w-12 bg-slate-200" />
                                    <div className="h-2 w-full bg-slate-50 rounded-sm" />
                                </div>
                                <div className="flex flex-col items-end space-y-1">
                                    <div className="flex justify-between w-full"><div className="h-[0.5px] w-4 bg-slate-300"/><div className="h-[0.5px] w-4 bg-slate-600"/></div>
                                    <div className="pt-1 mt-0.5 border-t-[0.5px] border-slate-100 w-full flex justify-between items-center">
                                        <div className="h-[0.5px] w-6 bg-slate-900" />
                                        <div className="h-1 w-8 bg-slate-900" />
                                    </div>
                                </div>
                            </div>
                        )}
                        {/* Signature line for classic */}
                        {layout === 'classic' && (
                            <div className="mt-2 grid grid-cols-2 gap-4 px-1">
                                <div className="border-b-[0.1px] border-slate-200 h-1" />
                                <div className="border-b-[0.1px] border-slate-200 h-1" />
                            </div>
                        )}
                    </div>
                </div>

                {/* Glass Hover Effect overlay */}
                <div className="absolute inset-0 bg-blue-500/0 group-hover:bg-brand-emerald/5 transition-colors" />
                
                {/* Expand Icon */}
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="bg-white/80 backdrop-blur-sm p-1 rounded-md shadow-sm border border-slate-200">
                        <Search className="w-2.5 h-2.5 text-slate-400" />
                    </div>
                </div>
            </div>

            {/* Selection indicator & Seal */}
            {isSelected && (
                <div className="absolute top-3 right-3 z-30">
                    <div className="flex items-center gap-2 bg-emerald-500 text-white rounded-full pl-1.5 pr-3 py-1 shadow-lg shadow-emerald-500/30 animate-in zoom-in duration-300 ring-2 ring-white">
                        <Zap className="w-3 h-3 fill-current" />
                        <span className="text-[9px] font-black uppercase tracking-widest">Ativo</span>
                    </div>
                </div>
            )}

            {showLabel && (
                <div className={cn(
                    "p-4 border-t-2 transition-all duration-300",
                    isSelected ? "bg-emerald-50/30 border-emerald-200" : "bg-white border-slate-50 group-hover:bg-slate-50/50"
                )}>
                    <div className="flex items-center gap-2 mb-1.5">
                        <div className={cn(
                            "w-2 h-2 rounded-full shadow-sm",
                            layout === 'classic' && "bg-slate-400",
                            layout === 'commercial' && "bg-slate-700",
                            layout === 'premium' && "bg-slate-900"
                        )} />
                        <h4 className="text-[12px] font-black text-slate-900 uppercase tracking-tight">
                            {layout === 'classic' && "Design Clássico"}
                            {layout === 'commercial' && "Design Comercial"}
                            {layout === 'premium' && "Design Premium"}
                        </h4>
                    </div>
                    <p className="text-[10px] text-slate-500 font-bold leading-relaxed line-clamp-2 italic">
                        {layout === 'classic' && "Seguro e tradicional. Transmite confiança com foco na clareza técnica."}
                        {layout === 'commercial' && "Direto e objetivo. Estética técnica ideal para orçamentos rápidos e precisos."}
                        {layout === 'premium' && "Máximo valor percebido. Design sofisticado focado em converter clientes de alto padrão."}
                    </p>
                </div>
            )}
        </div>
    );
};
