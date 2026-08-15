import { safeArray } from '../../lib/dataDiagnostics';
import React, { useRef, useState } from 'react';
import { X, UploadCloud, FileText, Trash2, Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Card } from './Card';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';

interface FileUploadModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (urls: string[]) => void;
    currentAttachments?: string[];
    maxFiles?: number;
    title?: string;
    description?: string;
}

export const FileUploadModal: React.FC<FileUploadModalProps> = ({
    isOpen,
    onClose,
    onSave,
    currentAttachments = [],
    maxFiles = 10,
    title = "Anexar Arquivos Técnicos",
    description = "Imagens da obra, projetos em PDF ou rascunhos de medidas."
}) => {
    const { profile } = useAuth();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [previewUrls, setPreviewUrls] = useState<string[]>(currentAttachments);
    const [isDragging, setIsDragging] = useState(false);
    const [isUploading, setIsUploading] = useState(false);

    if (!isOpen) return null;

    const remainingSlots = maxFiles - previewUrls.length;

    const generatePreviewUrls = async (files: FileList | File[]) => {
        const filesArray = Array.from(files).slice(0, remainingSlots);
        if (filesArray.length === 0) return;

        setIsUploading(true);
        const newRemoteUrls: string[] = [];

        try {
            console.log("Starting upload for", filesArray.length, "files...");
            
            for (const file of filesArray) {
                // Determine path based on type
                const companyId = profile?.companyId || 'unassigned';
                const folder = file.type.includes('pdf') ? 'documents' : 'photos';
                const fileName = `${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
                const storagePath = `companies/${companyId}/orders/attachments/${folder}/${fileName}`;
                const storageRef = ref(storage, storagePath);
                
                console.log(`Uploading ${file.name} to ${storagePath}...`);
                
                const uploadTask = uploadBytesResumable(storageRef, file);

                // Track upload progress for debugging
                uploadTask.on('state_changed', 
                    (snapshot) => {
                        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                        console.log(`Upload focus: ${file.name} is ${progress.toFixed(1)}% done`);
                    },
                    (error) => {
                        // This handles upload task failures (Auth, CORS, Quota)
                        console.error(`Firebase Storage Error [Task] for ${file.name}:`, error.code, error.message);
                        if (error.code === 'storage/unauthorized') {
                            console.error("DEBUG: Usuário sem permissão no Storage. Verifique as 'Security Rules'.");
                        } else if (error.code === 'storage/retry-limit-exceeded') {
                            console.error("DEBUG: Tempo limite excedido. Verifique o CORS no Google Cloud Console.");
                        }
                    }
                );

                await uploadTask;
                console.log(`Upload successful for ${file.name}. Fetching public URL...`);
                
                const downloadUrl = await getDownloadURL(storageRef);
                
                if (!downloadUrl || !downloadUrl.startsWith('http')) {
                    throw new Error(`URL de download inválida gerada para ${file.name}`);
                }
                
                newRemoteUrls.push(downloadUrl);
            }

            setPreviewUrls((prev: string[]) => {
                // Ensure we don't save any local blobs or short filenames by mistake
                const validPrev = safeArray(prev).filter(url => url.startsWith('http'));
                return [...validPrev, ...newRemoteUrls].slice(0, maxFiles);
            });
            
            console.log("All files uploaded and URLs retrieved successfully.");
        } catch (error: any) {
            console.error("CRITICAL ERROR during file upload process:", error);
            // Help the user identify the root cause
            let msg = "Erro ao fazer upload da foto!";
            if (error.code?.includes('storage/')) {
                msg += ` (Storage: ${error.code})`;
            }
            alert(msg);
        } finally {
            setIsUploading(false);
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            generatePreviewUrls(e.target.files);
        }
        // Reset input so the same files can be selected again if removed
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            generatePreviewUrls(e.dataTransfer.files);
        }
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const removeFile = (indexToRemove: number) => {
        setPreviewUrls((prev: string[]) => safeArray(prev).filter((_, index) => index !== indexToRemove));
    };

    const handleSave = () => {
        onSave(previewUrls);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in p-4 sm:p-6 pb-20 sm:pb-6">
            <Card className="glass-modal w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-white/10 relative z-10 bg-white/50 dark:bg-slate-900/50">
                    <div>
                        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">{title}</h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{description}</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
                    {/* Upload Dropzone */}
                    <div
                        onClick={() => remainingSlots > 0 && fileInputRef.current?.click()}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        className={cn(
                            "w-full h-40 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center p-6 text-center transition-all cursor-pointer relative overflow-hidden group",
                            remainingSlots === 0 ? "opacity-50 cursor-not-allowed border-slate-200 dark:border-slate-800" :
                                isDragging ? "border-brand-emerald bg-brand-emerald/5 scale-[1.02]" : "border-slate-300 dark:border-slate-700 hover:border-brand-emerald/50 hover:bg-brand-emerald/5 dark:hover:bg-white/5"
                        )}
                    >
                        <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleFileSelect}
                            multiple
                            accept="image/*,application/pdf"
                            className="hidden"
                            disabled={remainingSlots === 0}
                        />

                        <div className="absolute inset-0 bg-gradient-to-br from-brand-emerald/5 to-teal-500/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

                        <div className="p-4 bg-white dark:bg-slate-800 shadow-sm rounded-full mb-3 group-hover:scale-110 transition-transform">
                            <UploadCloud className={cn("w-8 h-8", isDragging ? "text-brand-emerald" : "text-slate-400")} />
                        </div>

                        {isUploading ? (
                            <div className="flex flex-col items-center">
                                <Loader2 className="w-10 h-10 text-brand-emerald animate-spin mb-3" />
                                <p className="text-slate-700 dark:text-slate-200 font-bold">Subindo arquivos para a nuvem...</p>
                                <p className="text-xs text-slate-500 mt-1">Isso pode levar alguns segundos dependendo do tamanho.</p>
                            </div>
                        ) : remainingSlots > 0 ? (
                            <>
                                <p className="text-base font-semibold text-slate-700 dark:text-slate-200">
                                    Arraste seus arquivos para cá
                                </p>
                                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                                    Ou clique para selecionar no computador
                                </p>
                                <p className="text-xs text-brand-emerald font-medium mt-3">
                                    Até {remainingSlots} arquivo(s) restante(s). Imagens ou PDFs.
                                </p>
                            </>
                        ) : (
                            <p className="text-slate-500 font-medium">Você atingiu o limite de {maxFiles} arquivos.</p>
                        )}
                    </div>

                    {/* Preview Grid */}
                    {previewUrls.length > 0 && (
                        <div className="mt-8">
                            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-4 flex items-center justify-between">
                                Arquivos Anexados ({previewUrls.length}/{maxFiles})
                                {previewUrls.length > 0 && (
                                    <button onClick={() => setPreviewUrls([])} className="text-xs text-red-500 hover:text-red-700">Limpar Tudo</button>
                                )}
                            </h3>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                                {safeArray(previewUrls).map((url, index) => {
                                    // Robust handling of PDF detection
                                    const isPdf = url.toLowerCase().includes('.pdf') || url.includes('documents%2F');
                                    
                                    // Handle legacy broken attachments (just filenames like 'projeto.png')
                                    const isBroken = !url.startsWith('http') && !url.startsWith('blob:');
                                    
                                    return (
                                        <div key={index} className={cn(
                                            "group relative aspect-square rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 border shadow-sm hover:shadow-md transition-all",
                                            isBroken ? "border-red-200 dark:border-red-900/50" : "border-slate-200 dark:border-slate-700"
                                        )}>
                                            {isBroken ? (
                                                <div className="w-full h-full flex flex-col items-center justify-center p-2 text-center">
                                                    <div className="bg-red-50 dark:bg-red-950/30 p-2 rounded-full mb-1">
                                                        <X className="w-5 h-5 text-red-500" />
                                                    </div>
                                                    <span className="text-[10px] font-bold text-red-600 dark:text-red-400 break-all">{url}</span>
                                                    <span className="text-[9px] text-slate-500 uppercase mt-1">Erro de Link</span>
                                                </div>
                                            ) : isPdf ? (
                                                <div className="w-full h-full flex flex-col items-center justify-center text-slate-400">
                                                    <FileText className="w-10 h-10 mb-2" />
                                                    <span className="text-xs font-medium">Documento</span>
                                                </div>
                                            ) : (
                                                <img 
                                                    src={url} 
                                                    alt={`Anexo ${index + 1}`} 
                                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                                    onError={(e) => {
                                                        // Fallback for broken images that still have a URL but don't load
                                                        const target = e.target as HTMLImageElement;
                                                        target.style.display = 'none';
                                                        const parent = target.parentElement;
                                                        if (parent) {
                                                            const errorDiv = document.createElement('div');
                                                            errorDiv.className = "absolute inset-0 flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-900 p-2 text-center";
                                                            errorDiv.innerHTML = `<div class="p-2 bg-red-100 dark:bg-red-900/20 rounded-full mb-1"><svg class="w-6 h-6 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></div><span class="text-[10px] text-red-500 font-bold uppercase">Erro ao Carregar</span>`;
                                                            parent.appendChild(errorDiv);
                                                        }
                                                    }}
                                                />
                                            )}

                                            {/* Action Overlay */}
                                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[2px]">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); removeFile(index); }}
                                                    className="p-2 bg-red-500 hover:bg-red-600 text-white rounded-full shadow-lg transform translate-y-4 group-hover:translate-y-0 transition-all"
                                                    title="Remover anexo"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-6 border-t border-slate-100 dark:border-white/10 bg-slate-50/80 dark:bg-slate-900/80 flex justify-end gap-3 rounded-b-xl relative z-10">
                    <button
                        onClick={onClose}
                        className="px-5 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isUploading}
                        className="px-6 py-2.5 text-sm font-bold text-white bg-gradient-to-r from-teal-500 to-brand-emerald hover:from-teal-600 hover:to-brand-emerald/90 rounded-xl shadow-lg shadow-teal-500/20 hover:shadow-teal-500/40 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                        Salvar Anexos
                    </button>
                </div>
            </Card>
        </div>
    );
};
