import { useState, useEffect } from 'react';
import type { AccessoryModel } from '../types';

const STORAGE_KEY = 'marble_flow_accessory_catalog';

export const useAccessoryCatalog = () => {
    const [accessories, setAccessories] = useState<AccessoryModel[]>(() => {
        const stored = localStorage.getItem(STORAGE_KEY);
        return stored ? JSON.parse(stored) : [];
    });

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(accessories));
    }, [accessories]);

    const addAccessory = (accessory: Omit<AccessoryModel, 'id'>) => {
        const newAccessory: AccessoryModel = {
            ...accessory,
            id: crypto.randomUUID(),
        };
        setAccessories(prev => [...prev, newAccessory]);
    };

    const removeAccessory = (id: string) => {
        setAccessories(prev => prev.filter(a => a.id !== id));
    };

    return {
        accessories,
        addAccessory,
        removeAccessory
    };
};
