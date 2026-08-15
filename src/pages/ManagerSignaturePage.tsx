import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '../lib/firebase';
import SignatureCanvas from 'react-signature-canvas';
import { Button } from '../components/ui/Button';
import { Card, CardContent } from '../components/ui/Card';
import { AlertCircle, CheckCircle2, Ruler, Sparkles, Smartphone } from 'lucide-react';

export const ManagerSignaturePage: React.FC = () => {
    const { token } = useParams<{ token: string }>();
    const [isValidating, setIsValidating] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [companyName, setCompanyName] = useState<string>('');
    const [success, setSuccess] = useState(false);
    const sigPad = useRef<SignatureCanvas | null>(null);
    const signatureContainerRef = useRef<HTMLDivElement>(null);
    const lastWidthRef = useRef<number>(0);

    // Track the signature container size to adjust the canvas dimensions
    useEffect(() => {
        if (isValidating || error || success) return;

        const updateCanvasSize = () => {
            if (signatureContainerRef.current && sigPad.current) {
                const canvas = sigPad.current.getCanvas();
                if (canvas) {
                    const rect = signatureContainerRef.current.getBoundingClientRect();
                    if (rect.width > 0 && Math.abs(rect.width - lastWidthRef.current) > 2) {
                        lastWidthRef.current = rect.width;
                        
                        // Save signature if it exists
                        let savedData: string | null = null;
                        if (!sigPad.current.isEmpty()) {
                            savedData = sigPad.current.toDataURL();
                        }

                        const ratio = Math.max(window.devicePixelRatio || 1, 1);
                        canvas.width = rect.width * ratio;
                        canvas.height = (rect.height || 180) * ratio;

                        const ctx = canvas.getContext('2d');
                        if (ctx) {
                            ctx.setTransform(1, 0, 0, 1, 0, 0);
                            ctx.scale(ratio, ratio);
                            ctx.lineCap = 'round';
                            ctx.lineJoin = 'round';
                        }

                        // Restore signature
                        sigPad.current.clear();
                        if (savedData) {
                            if (ctx) {
                                const originalDrawImage = ctx.drawImage;
                                ctx.drawImage = function (img: any, ...args: any[]) {
                                    ctx.setTransform(1, 0, 0, 1, 0, 0);
                                    originalDrawImage.call(ctx, img, 0, 0, canvas.width, canvas.height);
                                    ctx.scale(ratio, ratio);
                                    ctx.drawImage = originalDrawImage;
                                };
                            }
                            sigPad.current.fromDataURL(savedData);
                        }
                    }
                }
            }
        };

        // Run initially with a small delay to allow DOM/animation to settle
        const timeoutId = setTimeout(updateCanvasSize, 150);

        window.addEventListener('resize', updateCanvasSize);
        return () => {
            clearTimeout(timeoutId);
            window.removeEventListener('resize', updateCanvasSize);
        };
    }, [isValidating, error, success]);

    // Prevent scroll and dismiss keyboard on canvas interaction
    useEffect(() => {
        if (isValidating || error || success) return;

        let canvas: HTMLCanvasElement | null = null;
        let preventDefaultHandler: ((e: Event) => void) | null = null;

        const setupListeners = () => {
            canvas = sigPad.current?.getCanvas() || null;
            if (!canvas) return;

            preventDefaultHandler = (e: Event) => {
                // Dismiss keyboard
                if (document.activeElement && 'blur' in document.activeElement) {
                    (document.activeElement as HTMLElement).blur();
                }
                // Prevent scrolling/zooming of the page while drawing
                if (e.cancelable) {
                    e.preventDefault();
                }
            };

            // Apply styles to canvas directly to enforce touch-action & user-select
            canvas.style.touchAction = 'none';
            canvas.style.userSelect = 'none';
            canvas.style.webkitUserSelect = 'none';
            canvas.style.overscrollBehavior = 'contain';

            // Use non-passive event listeners to ensure preventDefault() is respected
            canvas.addEventListener('touchstart', preventDefaultHandler, { passive: false });
            canvas.addEventListener('touchmove', preventDefaultHandler, { passive: false });
            canvas.addEventListener('pointerdown', preventDefaultHandler, { passive: false });
            canvas.addEventListener('pointermove', preventDefaultHandler, { passive: false });
            canvas.addEventListener('mousedown', preventDefaultHandler);
        };

        // Try to setup immediately
        setupListeners();

        // Also setup with a small delay in case of render/transition delays
        const timeoutId = setTimeout(setupListeners, 150);

        return () => {
            clearTimeout(timeoutId);
            if (canvas && preventDefaultHandler) {
                canvas.removeEventListener('touchstart', preventDefaultHandler);
                canvas.removeEventListener('touchmove', preventDefaultHandler);
                canvas.removeEventListener('pointerdown', preventDefaultHandler);
                canvas.removeEventListener('pointermove', preventDefaultHandler);
                canvas.removeEventListener('mousedown', preventDefaultHandler);
            }
        };
    }, [isValidating, error, success]);

    useEffect(() => {
        const validateToken = async () => {
            if (!token) {
                setError('Token não informado.');
                setIsValidating(false);
                return;
            }

            try {
                // 1. Fetch token from manager_signature_tokens
                const tokenRef = doc(db, 'manager_signature_tokens', token);
                const tokenSnap = await getDoc(tokenRef);

                if (!tokenSnap.exists()) {
                    setError('Este link de assinatura é inválido ou não existe.');
                    setIsValidating(false);
                    return;
                }

                const tokenData = tokenSnap.data();
                if (!tokenData) {
                    setError('Erro ao ler os metadados do link.');
                    setIsValidating(false);
                    return;
                }

                const { active, expiresAt, companyId } = tokenData;

                // 2. Validate token state
                if (active !== true) {
                    setError('Este link de assinatura já foi utilizado ou está inativo.');
                    setIsValidating(false);
                    return;
                }

                if (expiresAt) {
                    const expiresTime = new Date(expiresAt).getTime();
                    const nowTime = Date.now();
                    if (nowTime > expiresTime) {
                        setError('Este link de assinatura expirou (limite de 10 minutos).');
                        setIsValidating(false);
                        return;
                    }
                }

                // 3. Set company name from token metadata
                setCompanyName(tokenData.companyName || 'Sua Empresa');

                setIsValidating(false);
            } catch (err) {
                console.error('[TOKEN_VALIDATION_ERROR]', err);
                setError('Erro de conexão ao validar o link de assinatura.');
                setIsValidating(false);
            }
        };

        validateToken();
    }, [token]);

    const handleClear = () => {
        sigPad.current?.clear();
    };

    const handleSave = async () => {
        if (!token) return;
        if (sigPad.current?.isEmpty()) {
            alert('Por favor, desenhe sua assinatura no quadro antes de salvar.');
            return;
        }

        setIsSaving(true);
        try {
            const signatureData = sigPad.current?.getTrimmedCanvas().toDataURL('image/png');
            if (!signatureData) {
                alert('Erro ao processar imagem da assinatura.');
                setIsSaving(false);
                return;
            }

            // Call Callable Cloud Function saveManagerSignature
            const functions = getFunctions();
            const saveSigFn = httpsCallable(functions, 'saveManagerSignature');
            await saveSigFn({ token, signatureData });
            console.log('[MANAGER_SIGNATURE] assinatura salva');

            setSuccess(true);
        } catch (err: any) {
            console.error('[SAVE_SIGNATURE_ERROR]', err);
            alert(err.message || 'Erro ao registrar e salvar a assinatura.');
        } finally {
            setIsSaving(false);
        }
    };

    if (isValidating) {
        return (
            <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6 text-center">
                <div className="text-white flex flex-col items-center gap-4">
                    <div className="w-10 h-10 border-4 border-brand-emerald border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-slate-400 font-bold text-xs uppercase tracking-widest">Validando link seguro...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6 text-center">
                <div className="glass-card p-8 rounded-3xl border border-red-500/20 max-w-sm w-full space-y-4">
                    <AlertCircle className="w-12 h-12 text-rose-500 mx-auto" />
                    <h2 className="text-lg font-black text-white uppercase tracking-wider">Acesso Negado</h2>
                    <p className="text-slate-400 text-sm">{error}</p>
                </div>
            </div>
        );
    }

    if (success) {
        return (
            <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6 text-center">
                <div className="glass-card p-10 rounded-3xl border border-emerald-500/20 max-w-sm w-full space-y-6 animate-in zoom-in-95 duration-300">
                    <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto animate-bounce" />
                    <div className="space-y-2">
                        <h2 className="text-xl font-black text-white uppercase tracking-wider">Sucesso!</h2>
                        <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Sua assinatura de gestor foi salva.</p>
                    </div>
                    <p className="text-slate-500 text-xs leading-relaxed">Você já pode fechar esta aba no celular. O painel administrativo foi atualizado automaticamente.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4">
            <Card className="w-full max-w-md bg-slate-950 border border-white/5 rounded-[2.5rem] shadow-2xl p-6 space-y-8 animate-in zoom-in-95 duration-300">
                <div className="text-center space-y-2">
                    <div className="h-10 w-10 rounded-full bg-brand-emerald/10 text-brand-emerald flex items-center justify-center mx-auto">
                        <Smartphone className="h-5 w-5 animate-pulse" />
                    </div>
                    <p className="text-[10px] font-black text-brand-emerald uppercase tracking-[0.2em]">Assinatura Digital Rocha</p>
                    <h3 className="text-lg font-black text-white uppercase tracking-tight">{companyName}</h3>
                </div>

                <div className="space-y-4">
                    <div className="flex items-center justify-between text-slate-400 px-2">
                        <label className="text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5">
                            <Ruler className="h-3 h-3 text-brand-emerald" /> Traçar Assinatura
                        </label>
                        <button onClick={handleClear} className="text-[9px] font-black text-rose-400 hover:text-rose-500 uppercase tracking-widest">
                            Limpar
                        </button>
                    </div>
                    
                    <div ref={signatureContainerRef} className="bg-white rounded-3xl overflow-hidden shadow-inner flex items-center justify-center p-0 border-2 border-brand-emerald/20 h-[180px] w-full relative">
                        <SignatureCanvas
                            ref={sigPad}
                            penColor="#003B8E"
                            minWidth={1.5}
                            maxWidth={3.0}
                            onBegin={() => {
                                if (typeof document !== 'undefined' && document.activeElement) {
                                    (document.activeElement as HTMLElement).blur();
                                }
                            }}
                            canvasProps={{
                                className: 'sigCanvas w-full h-full cursor-crosshair block',
                                style: { 
                                    touchAction: 'none', 
                                    userSelect: 'none', 
                                    WebkitUserSelect: 'none',
                                    overscrollBehavior: 'contain'
                                }
                            }}
                        />
                    </div>
                </div>

                <div className="space-y-4">
                    <Button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="w-full h-12 text-xs font-black uppercase tracking-widest bg-brand-emerald hover:bg-brand-emerald/90 text-slate-900 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-brand-emerald/10"
                    >
                        {isSaving ? (
                            <div className="w-4 h-4 border-2 border-slate-900 border-t-transparent rounded-full animate-spin"></div>
                        ) : (
                            <>
                                <Sparkles className="h-4 w-4" /> Salvar Assinatura
                            </>
                        )}
                    </Button>

                    <p className="text-[8px] text-center text-slate-500 uppercase tracking-widest font-black">
                        Aviso: Este link de uso único expira em 10 minutos.
                    </p>
                </div>
            </Card>
        </div>
    );
};
