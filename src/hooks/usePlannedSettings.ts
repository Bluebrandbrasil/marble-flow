import { useState, useEffect } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import type { PlannedModuleSettings } from '../types';

const DEFAULT_PLANNED_SETTINGS: PlannedModuleSettings = {
    freightPercentOnMaterialCost: 16,
    assemblyPercentOnSale: 10,
    cardMachineFeePercent: 0,
};

export function usePlannedSettings() {
    const { profile } = useAuth();
    const [settings, setSettings] = useState<PlannedModuleSettings>(() => {
        const saved = localStorage.getItem('marble-flow-planned-settings');
        return saved ? JSON.parse(saved) : DEFAULT_PLANNED_SETTINGS;
    });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!profile?.companyId || profile.companyId === 'system' || profile.companyId === 'unassigned') {
            setLoading(false);
            return;
        }

        const settingsRef = doc(db, 'companies', profile.companyId, 'settings', 'planned_module');

        const unsubscribe = onSnapshot(settingsRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                const firestoreSettings: PlannedModuleSettings = {
                    freightPercentOnMaterialCost: data.freightPercentOnMaterialCost ?? DEFAULT_PLANNED_SETTINGS.freightPercentOnMaterialCost,
                    assemblyPercentOnSale: data.assemblyPercentOnSale ?? DEFAULT_PLANNED_SETTINGS.assemblyPercentOnSale,
                    cardMachineFeePercent: data.cardMachineFeePercent ?? DEFAULT_PLANNED_SETTINGS.cardMachineFeePercent,
                    contractSettings: data.contractSettings || undefined,
                };
                setSettings(firestoreSettings);
                localStorage.setItem('marble-flow-planned-settings', JSON.stringify(firestoreSettings));
            } else {
                // If it doesn't exist, we can use the defaults
                setSettings(DEFAULT_PLANNED_SETTINGS);
            }
            setLoading(false);
        }, (err) => {
            console.error("Error fetching planned settings from firestore:", err);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [profile?.companyId]);

    const updatePlannedSettings = async (newSettings: Partial<PlannedModuleSettings>) => {
        if (!profile?.companyId) {
            console.error("Attempted to update planned settings without company ID");
            return;
        }

        const merged = { ...settings, ...newSettings };
        setSettings(merged);

        const settingsRef = doc(db, 'companies', profile.companyId, 'settings', 'planned_module');
        try {
            await setDoc(settingsRef, newSettings, { merge: true });
            localStorage.setItem('marble-flow-planned-settings', JSON.stringify(merged));
            console.log("Planned settings updated successfully in Firestore");
        } catch (error) {
            console.error("Error updating planned settings in firestore:", error);
            throw error;
        }
    };

    return { settings, updatePlannedSettings, loading };
}
