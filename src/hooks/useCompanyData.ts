import { useState, useEffect } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';

export interface CompanyData {
    id: string;
    name?: string;
    cnpj?: string;
    street?: string;      // NEW
    number?: string;      // NEW
    neighborhood?: string; // NEW/Standardized
    city?: string;
    state?: string;
    zipCode?: string;     // NEW/Standardized
    address?: string;     // Legacy support
    cep?: string;         // Legacy support
    telefoneFixo?: string;
    whatsapp1?: string;
    whatsapp2?: string;
    instagram?: string;
    facebook?: string;
    logoUrl?: string;
    companySignature?: string;
    settings?: {
        signature?: string;
    };
    installationRateLinear?: number | string;
    website?: string;
    validadePrazoTexto?: string;
    parcelamentoTexto?: string;
    taxaJurosTexto?: string;
    pixDescontoTexto?: string;
    observacaoPagamentoTexto?: string;
    quoteLayout?: 'classic' | 'commercial' | 'premium';
    [key: string]: any;
}

export function useCompanyData() {
    const { profile } = useAuth();
    const [companyData, setCompanyData] = useState<CompanyData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!profile?.companyId || profile.companyId === 'system' || profile.companyId === 'unassigned') {
            setLoading(false);
            return;
        }

        const companyRef = doc(db, 'companies', profile.companyId);

        const unsubscribe = onSnapshot(companyRef, (docSnap) => {
            if (docSnap.exists()) {
                setCompanyData({ id: docSnap.id, ...docSnap.data() } as CompanyData);
            }
            setLoading(false);
        }, (err) => {
            console.error("Error fetching company data:", err);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [profile?.companyId]);

    const updateCompanyData = async (updates: Partial<CompanyData>) => {
        if (!profile?.companyId || profile.companyId === 'unassigned') {
            console.error("Tentativa de atualizar empresa sem ID válido", { companyId: profile?.companyId });
            return;
        }
        
        const companyRef = doc(db, 'companies', profile.companyId);
        try {
            await setDoc(companyRef, updates, { merge: true });
            
            // Atualizar estado local imediatamente para evitar race conditions na UI
            setCompanyData(prev => prev ? { ...prev, ...updates } : updates as CompanyData);
            
            console.log("✅ Empresa atualizada com sucesso no Firestore (usando setDoc/merge)");
        } catch (error) {
            console.error("❌ Erro ao atualizar ou criar documento da empresa:", error);
            throw error;
        }
    };

    return { companyData, updateCompanyData, loading };
}
