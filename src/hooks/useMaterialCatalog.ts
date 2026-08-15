import { useState, useEffect, useMemo } from 'react';
import type { MaterialModel } from '../types';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot, addDoc, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { toISODateSafe } from '../lib/dateWriteUtils';
import { useAuth } from '../context/AuthContext';
import { deduplicateMaterials, searchMaterials } from '../utils/materialSearch';

export function useMaterialCatalog() {
    const { profile } = useAuth();
    const [materials, setMaterials] = useState<MaterialModel[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!profile?.companyId) {
            setMaterials([]);
            setIsLoading(false);
            return;
        }

        // Updated to use the new 'stones' collection with multi-tenant companyId
        const q = query(collection(db, 'stones'), where('companyId', '==', profile.companyId));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const loaded: MaterialModel[] = [];
            snapshot.forEach((doc) => {
                const data = doc.data();
                loaded.push({ 
                    id: doc.id, 
                    ...data
                } as MaterialModel);
            });
            setMaterials(loaded);
            setIsLoading(false);
        }, (error) => {
            console.error("Error loading stones:", error);
            setIsLoading(false);
        });

        return () => unsubscribe();
    }, [profile?.companyId]);

    const [searchTerm, setSearchTerm] = useState('');

    const validMaterials = useMemo(() => {
        return materials.filter(m => {
            const hasName = m.name && m.name.trim().length > 0;
            const hasPrice = Number(m.price) > 0;
            return hasName && hasPrice;
        });
    }, [materials]);

    const deduplicatedMaterials = useMemo(() => {
        return deduplicateMaterials(validMaterials);
    }, [validMaterials]);

    const filteredMaterials = useMemo(() => {
        if (!searchTerm.trim()) return deduplicatedMaterials;
        return searchMaterials(deduplicatedMaterials, searchTerm);
    }, [deduplicatedMaterials, searchTerm]);

    const addMaterial = async (material: Omit<MaterialModel, 'id'>) => {
        if (!profile?.companyId) throw new Error("User company not found");

        await addDoc(collection(db, 'stones'), {
            ...material,
            companyId: profile.companyId,
            userId: profile.uid,
            createdAt: toISODateSafe(new Date())!
        });
    };

    const updateMaterial = async (id: string, data: Partial<MaterialModel>) => {
        if (!profile?.companyId) throw new Error("User company not found");

        const docRef = doc(db, 'stones', id);
        await updateDoc(docRef, data);
    };

    const removeMaterial = async (id: string) => {
        if (!profile?.companyId) throw new Error("User company not found");
        
        const docRef = doc(db, 'stones', id);
        await deleteDoc(docRef);
    };

    return { 
        materials: deduplicatedMaterials, // Default to clean materials
        rawMaterials: materials,
        filteredMaterials,
        isLoading, 
        searchTerm,
        setSearchTerm,
        addMaterial, 
        updateMaterial, 
        removeMaterial 
    };
}
