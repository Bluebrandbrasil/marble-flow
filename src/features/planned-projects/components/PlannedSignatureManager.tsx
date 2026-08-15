import React, { useState } from 'react';
import { db } from '../../../lib/firebase';
import { doc, setDoc, updateDoc, Timestamp, getDoc, serverTimestamp } from 'firebase/firestore';
import { Button } from '../../../components/ui/Button';
import { Copy, XCircle, RefreshCw, Loader2, Link as LinkIcon, CheckCircle, FileSignature } from 'lucide-react';
import type { PlannedProject } from '../../../types';
import { useAuth } from '../../../context/AuthContext';

interface Props {
    project: PlannedProject;
}

const SIGNATURE_STATUS_COLORS: Record<string, string> = {
    not_sent: 'bg-slate-100 text-slate-600 border-slate-200',
    active: 'bg-blue-50 text-blue-600 border-blue-200',
    expired: 'bg-rose-50 text-rose-600 border-rose-200',
    signed: 'bg-emerald-50 text-emerald-600 border-emerald-200',
    revoked: 'bg-amber-50 text-amber-600 border-amber-200'
};

const SIGNATURE_STATUS_LABELS: Record<string, string> = {
    not_sent: 'Não Enviado',
    active: 'Link Ativo',
    expired: 'Link Expirado',
    signed: 'Assinado',
    revoked: 'Revogado'
};

export const PlannedSignatureManager: React.FC<Props> = ({ project }) => {
    const { user, profile } = useAuth();
    const [loading, setLoading] = useState(false);
    const [showMenu, setShowMenu] = useState(false);

    let status = project.signatureStatus || 'not_sent';
    
    // Check if expired dynamically (if not signed)
    if (status === 'active' && project.signatureExpiresAt) {
        const expiresTime = project.signatureExpiresAt.toDate ? project.signatureExpiresAt.toDate() : new Date(project.signatureExpiresAt);
        if (new Date() > expiresTime) {
            status = 'expired';
        }
    }

    const handleGenerateLink = async () => {
        if (!user || !profile?.companyId) return;
        
        try {
            setLoading(true);
            
            // Generate a strong unique token
            const token = crypto.randomUUID() + '-' + Date.now().toString(36);
            
            // Set expiration to 10 minutes from now
            const expiresAt = new Date();
            expiresAt.setMinutes(expiresAt.getMinutes() + 10);
            
            // Fetch company settings to snapshot
            const settingsRef = doc(db, 'companies', profile.companyId, 'settings', 'planned_module');
            const settingsSnap = await getDoc(settingsRef);
            const companySettings = settingsSnap.exists() ? settingsSnap.data() : {};

            const contractSnapshot = {
                project: {
                    id: project.id,
                    saleValue: project.saleValue || 0,
                    materialCost: project.materialCost || 0,
                    netResult: project.netResult || 0,
                    observations: project.observations || '',
                    companyId: project.companyId,
                    projectId: project.projectId || '',
                    paymentMethod: project.paymentMethod || '',
                    paymentCondition: project.paymentCondition || '',
                    paymentNotes: project.paymentNotes || '',
                    installments: project.installments || 1,
                    downPayment: project.downPayment || 0,
                    remainingBalance: project.remainingBalance || 0,
                    dueDates: project.dueDates || []
                },
                client: project.client || null,
                modules: project.modules || [],
                companyContractSettings: companySettings.contractSettings || {}
            };

            const linkData = {
                companyId: profile.companyId,
                plannedProjectId: project.id,
                contractType: "planned",
                token: token,
                status: "active",
                expiresAt: Timestamp.fromDate(expiresAt),
                createdAt: serverTimestamp(),
                createdBy: user.uid,
                createdByName: profile.name,
                contractSnapshot
            };

            // Save to public collection
            await setDoc(doc(db, 'planned_public_contract_links', token), linkData);

            // Update project with signature data
            await updateDoc(doc(db, 'planned_projects', project.id), {
                signatureToken: token,
                signatureStatus: 'active',
                signatureExpiresAt: Timestamp.fromDate(expiresAt)
            });

            alert('Link de assinatura gerado com sucesso! Válido por 10 minutos.');
            setShowMenu(false);
        } catch (error) {
            console.error('Error generating link:', error);
            alert('Erro ao gerar link de assinatura.');
        } finally {
            setLoading(false);
        }
    };

    const handleCopyLink = () => {
        if (!project.signatureToken) return;
        const url = `${window.location.origin}/planejados/assinar/${project.signatureToken}`;
        navigator.clipboard.writeText(url);
        alert('Link copiado para a área de transferência!');
        setShowMenu(false);
    };

    const handleRevokeLink = async () => {
        if (!project.signatureToken || !project.id) return;
        try {
            setLoading(true);
            await updateDoc(doc(db, 'planned_public_contract_links', project.signatureToken), {
                status: 'revoked'
            });
            await updateDoc(doc(db, 'planned_projects', project.id), {
                signatureStatus: 'revoked'
            });
            alert('Link revogado com sucesso.');
            setShowMenu(false);
        } catch (error) {
            console.error('Error revoking link:', error);
            alert('Erro ao revogar link.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="relative flex flex-col items-end gap-1">
            <span className={`inline-flex items-center text-[10px] font-black px-2 py-0.5 rounded border uppercase tracking-wider ${SIGNATURE_STATUS_COLORS[status]}`}>
                <FileSignature className="h-3 w-3 mr-1" />
                {SIGNATURE_STATUS_LABELS[status]}
            </span>
            
            <div className="flex gap-1 relative">
                {status === 'not_sent' && (
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleGenerateLink}
                        disabled={loading}
                        className="h-7 px-2 text-xs rounded font-bold border-brand-rocha-primary text-brand-rocha-primary bg-brand-rocha-primary/5 hover:bg-brand-rocha-primary hover:text-white transition-all"
                    >
                        {loading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <LinkIcon className="h-3 w-3 mr-1" />}
                        Gerar Link
                    </Button>
                )}
                
                {status === 'active' && (
                    <>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleCopyLink}
                            className="h-7 px-2 text-xs rounded font-bold border-slate-200 text-slate-600 hover:border-emerald-500 hover:text-emerald-600 transition-all bg-white"
                        >
                            <Copy className="h-3 w-3 mr-1" />
                            Copiar
                        </Button>
                        <div className="relative">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setShowMenu(!showMenu)}
                                className="h-7 px-2 text-xs rounded font-bold border-slate-200 text-slate-600 hover:border-brand-rocha-primary hover:text-brand-rocha-primary transition-all bg-white"
                            >
                                Opções
                            </Button>
                            
                            {showMenu && (
                                <div className="absolute top-full right-0 mt-1 w-40 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-lg overflow-hidden z-50">
                                    <button
                                        onClick={handleRevokeLink}
                                        disabled={loading}
                                        className="w-full text-left px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20 flex items-center"
                                    >
                                        <XCircle className="h-3 w-3 mr-2" /> Revogar Link
                                    </button>
                                    <button
                                        onClick={handleGenerateLink}
                                        disabled={loading}
                                        className="w-full text-left px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center"
                                    >
                                        <RefreshCw className="h-3 w-3 mr-2" /> Gerar Novo Link
                                    </button>
                                </div>
                            )}
                        </div>
                    </>
                )}

                {(status === 'expired' || status === 'revoked') && (
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleGenerateLink}
                        disabled={loading}
                        className="h-7 px-2 text-xs rounded font-bold border-slate-200 text-slate-600 hover:border-brand-rocha-primary hover:text-brand-rocha-primary transition-all bg-white"
                    >
                        {loading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                        Novo Link
                    </Button>
                )}
                
                {status === 'signed' && (
                    <div className="flex items-center text-[10px] text-emerald-600 font-bold bg-emerald-50 px-2 py-1 rounded">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Em: {project.signedAt ? new Date(project.signedAt).toLocaleDateString() : 'N/A'}
                    </div>
                )}
            </div>
        </div>
    );
};
