import { useState, useEffect } from 'react';

export interface CompanySettings {
    companyName: string;
    cnpj: string;
    address: string;
    phone: string;
    logoUrl: string;
}

const DEFAULT_SETTINGS: CompanySettings = {
    companyName: 'Studio 12',
    cnpj: '',
    address: 'Rua Ulisses Paschoal 397',
    phone: '',
    logoUrl: '',
};

export function useSettings() {
    const [settings, setSettings] = useState<CompanySettings>(() => {
        const saved = localStorage.getItem('marble-flow-settings');
        return saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
    });

    useEffect(() => {
        localStorage.setItem('marble-flow-settings', JSON.stringify(settings));
    }, [settings]);

    const updateSettings = (newSettings: Partial<CompanySettings>) => {
        setSettings(prev => ({ ...prev, ...newSettings }));
    };

    return { settings, updateSettings };
}
