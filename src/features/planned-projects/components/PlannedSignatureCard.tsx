import React, { useState, useEffect } from 'react';
import { doc, updateDoc, Timestamp, onSnapshot } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { Copy, XCircle, RefreshCw, Loader2, Link as LinkIcon, CheckCircle, FileSignature, AlertCircle, Clock } from 'lucide-react';
import type { PlannedProject } from '../../../types';
import { useAuth } from '../../../context/AuthContext';

interface Props {
    projectId: string;
}

export const PlannedSignatureCard: React.FC<Props> = ({ projectId }) => {
    const { profile } = useAuth();
    const [project, setProject] = useState<PlannedProject | null>(null);
    const [loadingAction, setLoadingAction] = useState(false);

    useEffect(() => {
        if (!projectId) return;
        const unsubscribe = onSnapshot(doc(db, 'planned_projects', projectId), (docSnap) => {
            if (docSnap.exists()) {
                setProject({ id: docSnap.id, ...docSnap.data() } as PlannedProject);
            }
        });
        return () => unsubscribe();
    }, [projectId]);

    if (!project) return null;

    const isExpired = project.signatureExpiresAt && project.signatureExpiresAt.toMillis() < Date.now();
    const status = project.signatureStatus === 'signed' ? 'signed'
        : project.signatureStatus === 'revoked' ? 'revoked'
        : isExpired ? 'expired'
        : project.signatureToken ? 'active'
        : 'not_sent';

    const handleGenerateLink = async () => {
        if (!profile?.companyId) return;
        try {
            setLoadingAction(true);
            const token = crypto.randomUUID() + Date.now().toString(36);
            // Válido por 10 minutos
            const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

            // Criar link público
            await updateDoc(doc(db, 'planned_public_contract_links', token), {
                companyId: profile.companyId,
                plannedProjectId: project.id,
                contractType: 'planned',
                token,
                status: 'active',
                expiresAt: Timestamp.fromDate(expiresAt),
                createdAt: Timestamp.now(),
                createdBy: profile.uid,
                createdByName: profile.name,
                contractSnapshot: {
                    ...project,
                    signatureToken: null,
                    signatureStatus: null,
                    signatureExpiresAt: null,
                }
            });

            // Atualizar projeto
            await updateDoc(doc(db, 'planned_projects', project.id), {
                signatureToken: token,
                signatureStatus: 'sent',
                signatureExpiresAt: Timestamp.fromDate(expiresAt)
            });

            alert('Link de assinatura gerado com sucesso! Válido por 10 minutos.');
        } catch (error) {
            console.error('Error generating link:', error);
            alert('Erro ao gerar link de assinatura.');
        } finally {
            setLoadingAction(false);
        }
    };

    const handleCopyLink = () => {
        if (!project.signatureToken) return;
        const url = `${window.location.origin}/planejados/assinar/${project.signatureToken}`;
        navigator.clipboard.writeText(url);
        alert('Link copiado para a área de transferência!');
    };

    const handleRevokeLink = async () => {
        if (!window.confirm('Tem certeza que deseja revogar este link?')) return;
        try {
            setLoadingAction(true);
            if (project.signatureToken) {
                await updateDoc(doc(db, 'planned_public_contract_links', project.signatureToken), {
                    status: 'revoked'
                });
            }
            await updateDoc(doc(db, 'planned_projects', project.id), {
                signatureStatus: 'revoked'
            });
            alert('Link revogado com sucesso.');
        } catch (error) {
            console.error('Error revoking link:', error);
            alert('Erro ao revogar link.');
        } finally {
            setLoadingAction(false);
        }
    };

    return (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-brand-rocha-primary/10 rounded-xl flex items-center justify-center text-brand-rocha-primary">
                    <FileSignature className="h-5 w-5" />
                </div>
                <div>
                    <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">Assinatura Digital do Cliente</h3>
                    <p className="text-xs text-slate-500">Gerencie a assinatura eletrônica deste contrato</p>
                </div>
            </div>

            <div className="space-y-4">
                {/* Status Indicator */}
                <div className="flex flex-col gap-2 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                    <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-slate-500 uppercase">Status Atual</span>
                        {status === 'not_sent' && <span className="text-xs font-bold text-slate-500 bg-slate-200/50 px-2 py-1 rounded">Não Enviado</span>}
                        {status === 'active' && <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded flex items-center"><Clock className="w-3 h-3 mr-1"/> Aguardando Assinatura</span>}
                        {status === 'signed' && <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded flex items-center"><CheckCircle className="w-3 h-3 mr-1"/> Assinado</span>}
                        {status === 'expired' && <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded flex items-center"><AlertCircle className="w-3 h-3 mr-1"/> Expirado</span>}
                        {status === 'revoked' && <span className="text-xs font-bold text-rose-600 bg-rose-50 px-2 py-1 rounded flex items-center"><XCircle className="w-3 h-3 mr-1"/> Revogado</span>}
                    </div>

                    {status === 'active' && project.signatureExpiresAt && (
                        <div className="text-xs text-slate-500">
                            Válido até: <span className="font-bold text-slate-700 dark:text-slate-300">{new Date(project.signatureExpiresAt.toMillis()).toLocaleTimeString()}</span>
                        </div>
                    )}

                    {status === 'signed' && (
                        <div className="text-xs text-slate-600 space-y-1 mt-2 border-t border-slate-200 dark:border-slate-700 pt-2">
                            <p><strong>Data:</strong> {project.signedAt ? new Date(project.signedAt).toLocaleString() : 'N/A'}</p>
                            <p><strong>Nome:</strong> {project.signedByName}</p>
                            <p><strong>Doc:</strong> {project.signedByDocument}</p>
                        </div>
                    )}
                </div>

                {/* Actions */}
                <div className="flex flex-wrap gap-2">
                    {status === 'not_sent' && (
                        <button
                            type="button"
                            onClick={handleGenerateLink}
                            disabled={loadingAction}
                            className="flex-1 flex items-center justify-center gap-2 h-10 px-4 rounded-xl text-sm font-bold bg-brand-rocha-primary text-white hover:bg-brand-rocha-primary/90 transition-all disabled:opacity-50"
                        >
                            {loadingAction ? <Loader2 className="w-4 h-4 animate-spin" /> : <LinkIcon className="w-4 h-4" />}
                            Gerar Link de Assinatura do Cliente
                        </button>
                    )}

                    {status === 'active' && (
                        <>
                            <button
                                type="button"
                                onClick={handleCopyLink}
                                className="flex-1 flex items-center justify-center gap-2 h-10 px-4 rounded-xl text-sm font-bold border border-slate-200 text-slate-700 hover:border-brand-rocha-primary hover:text-brand-rocha-primary transition-all bg-white"
                            >
                                <Copy className="w-4 h-4" /> Copiar Link
                            </button>
                            <button
                                type="button"
                                onClick={handleRevokeLink}
                                disabled={loadingAction}
                                className="flex items-center justify-center gap-2 h-10 px-4 rounded-xl text-sm font-bold border border-rose-200 text-rose-600 hover:bg-rose-50 transition-all bg-white"
                            >
                                <XCircle className="w-4 h-4" /> Revogar
                            </button>
                        </>
                    )}

                    {(status === 'expired' || status === 'revoked') && (
                        <button
                            type="button"
                            onClick={handleGenerateLink}
                            disabled={loadingAction}
                            className="flex-1 flex items-center justify-center gap-2 h-10 px-4 rounded-xl text-sm font-bold border border-slate-200 text-slate-700 hover:border-brand-rocha-primary hover:text-brand-rocha-primary transition-all bg-white disabled:opacity-50"
                        >
                            {loadingAction ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                            Gerar Novo Link
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
