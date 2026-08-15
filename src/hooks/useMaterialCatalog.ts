import { useState, useEffect } from 'react';
import type { MaterialModel } from '../types';

const STORAGE_KEY = 'marble-flow-materials';

const DEFAULT_MATERIALS: MaterialModel[] = [
    {
        id: '1',
        name: 'Branco Prime',
        type: 'Quartzo',
        thickness: '2cm'
    },
    {
        id: '2',
        name: 'Preto São Gabriel',
        type: 'Granito',
        thickness: '2cm'
    }
];

export function useMaterialCatalog() {
    const [materials, setMaterials] = useState<MaterialModel[]>(() => {
        const saved = localStorage.getItem(STORAGE_KEY);
        return saved ? JSON.parse(saved) : DEFAULT_MATERIALS;
    });

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(materials));
    }, [materials]);

    const addMaterial = (material: Omit<MaterialModel, 'id'>) => {
        const newMaterial = { ...material, id: Date.now().toString() };
        setMaterials(prev => [...prev, newMaterial]);
    };

    const removeMaterial = (id: string) => {
        setMaterials(prev => prev.filter(m => m.id !== id));
    };

    return { materials, addMaterial, removeMaterial };
}
