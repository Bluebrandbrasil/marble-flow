import { useState, useEffect } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';

import { normalizeClauses } from '../lib/dataDiagnostics';

export interface ContractClause {
    id: string;
    title: string;
    content: string;
}

export interface CompanySettings {
    companyName: string;
    cnpj: string;
    street: string;
    number: string;
    neighborhood: string;
    city: string;
    state: string;
    zipCode: string;
    phone: string;
    logoUrl: string;
    contractTemplate: ContractClause[];
    companySignature?: string;
    settings?: {
        signature?: string;
    };
    email?: string;
    address?: string; // Legacy
    cep?: string;     // Legacy
    intelligence?: {
        daysAtRisk?: number;
        daysInactive?: number;
        performanceDropPercent?: number;
        highPerformanceMinLeads?: number;
        highPerformanceConversion?: number;
        potentialMinConversion?: number;
        potentialMaxLeads?: number;
    };
}

const DEFAULT_SETTINGS: CompanySettings = {
    companyName: '',
    cnpj: '',
    street: '',
    number: '',
    neighborhood: '',
    city: '',
    state: '',
    zipCode: '',
    phone: '',
    email: '',
    logoUrl: '',
    contractTemplate: [
        { id: '1', title: '1. DAS PARTES', content: 'CONTRATANTE: {{CLIENTE_NOME}}, CPF/CNPJ: {{CLIENTE_CPF}}, residente em {{CLIENTE_ENDERECO}}, telefone {{CLIENTE_TELEFONE}}.\nCONTRATADA: {{EMPRESA_NOME}}, com sede em {{EMPRESA_ENDERECO}}.' },
        { id: '2', title: '2. DO OBJETO', content: 'A CONTRATADA fornecerá os materiais e serviços descritos abaixo:\n{{ITENS_PEDIDO}}' },
        { id: '3', title: '3. DO FINANCEIRO', content: 'O valor total é de R$ {{VALOR_TOTAL}}.\nEntrada de R$ {{VALOR_ENTRADA}} via {{FORMA_PAGAMENTO}}.\nSaldo de R$ {{SALDO_DEVEDOR}} a ser pago na instalação.' },
        { id: '4', title: '4. DISPOSIÇÕES GERAIS', content: 'Este contrato é regido pelas leis vigentes.' }
    ],
};

export function useSettings() {
    const { profile } = useAuth();
    const [settings, setSettings] = useState<CompanySettings>(() => {
        // Fallback para localStorage se necessário, mas Prioridade é Firestore
        const saved = localStorage.getItem('marble-flow-settings');
        return saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
    });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!profile?.companyId || profile.companyId === 'system' || profile.companyId === 'unassigned') {
            setLoading(false);
            return;
        }

        const companyRef = doc(db, 'companies', profile.companyId);

        const unsubscribe = onSnapshot(companyRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                // Merge default with firestore data
                const firestoreSettings: CompanySettings = {
                    companyName: data.name ?? data.companyName ?? DEFAULT_SETTINGS.companyName,
                    cnpj: data.cnpj ?? DEFAULT_SETTINGS.cnpj,
                    street: data.street ?? DEFAULT_SETTINGS.street,
                    number: data.number ?? DEFAULT_SETTINGS.number,
                    neighborhood: data.neighborhood ?? DEFAULT_SETTINGS.neighborhood,
                    city: data.city ?? DEFAULT_SETTINGS.city,
                    state: data.state ?? DEFAULT_SETTINGS.state,
                    zipCode: data.zipCode ?? data.cep ?? DEFAULT_SETTINGS.zipCode,
                    phone: data.phone ?? data.telefoneFixo ?? DEFAULT_SETTINGS.phone,
                    logoUrl: data.logoUrl ?? DEFAULT_SETTINGS.logoUrl,
                    contractTemplate: normalizeClauses(data.contractTemplate ?? DEFAULT_SETTINGS.contractTemplate),
                    companySignature: data.companySignature ?? DEFAULT_SETTINGS.companySignature,
                    settings: data.settings ?? {},
                    email: data.email ?? DEFAULT_SETTINGS.email,
                    address: data.address ?? DEFAULT_SETTINGS.address,
                    cep: data.cep ?? DEFAULT_SETTINGS.cep,
                    intelligence: data.intelligence ?? {}
                };
                setSettings(firestoreSettings);
                // Also update local storage for offline read
                localStorage.setItem('marble-flow-settings', JSON.stringify(firestoreSettings));
            }
            setLoading(false);
        }, (err) => {
            console.error("Error fetching settings from firestore:", err);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [profile?.companyId]);

    const updateSettings = async (newSettings: Partial<CompanySettings>) => {
        if (!profile?.companyId) {
            console.error("Tentativa de atualizar configurações sem ID de empresa");
            return;
        }
        
        // Update local state temporarily for UX
        const merged = { ...settings, ...newSettings };
        setSettings(merged);
        
        // Update Firestore
        const companyRef = doc(db, 'companies', profile.companyId);
        try {
            await setDoc(companyRef, newSettings, { merge: true });
            localStorage.setItem('marble-flow-settings', JSON.stringify(merged));
            console.log("Configurações atualizadas com sucesso no Firestore (setDoc/merge)");
        } catch (error) {
            console.error("Erro ao atualizar configurações no firestore:", error);
            throw error;
        }
    };

    return { settings, updateSettings, loading };
}
