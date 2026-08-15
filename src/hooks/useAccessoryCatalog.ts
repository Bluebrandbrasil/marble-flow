import { useState, useEffect } from 'react';
import type { AccessoryModel } from '../types';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot, addDoc, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { toISODateSafe } from '../lib/dateWriteUtils';
import { useAuth } from '../context/AuthContext';

export function useAccessoryCatalog() {
    const { profile } = useAuth();
    const [accessories, setAccessories] = useState<AccessoryModel[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!profile?.companyId) {
            setAccessories([]);
            setIsLoading(false);
            return;
        }

        const q = query(collection(db, 'accessories'), where('companyId', '==', profile.companyId));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const loaded: AccessoryModel[] = [];
            snapshot.forEach((doc) => {
                const data = doc.data();
                loaded.push({ 
                    id: doc.id, 
                    ...data 
                } as AccessoryModel);
            });
            setAccessories(loaded);
            setIsLoading(false);
        }, (error) => {
            console.error("Error loading accessories:", error);
            setIsLoading(false);
        });

        return () => unsubscribe();
    }, [profile?.companyId]);

    const addAccessory = async (accessory: Omit<AccessoryModel, 'id'>) => {
        if (!profile?.companyId) throw new Error("User company not found");

        await addDoc(collection(db, 'accessories'), {
            ...accessory,
            companyId: profile.companyId,
            userId: profile.uid,
            createdAt: toISODateSafe(new Date())!
        });
    };

    const updateAccessory = async (id: string, data: Partial<AccessoryModel>) => {
        if (!profile?.companyId) throw new Error("User company not found");

        const docRef = doc(db, 'accessories', id);
        await updateDoc(docRef, data);
    };

    const removeAccessory = async (id: string) => {
        if (!profile?.companyId) throw new Error("User company not found");
        
        const docRef = doc(db, 'accessories', id);
        await deleteDoc(docRef);
    };

    return { accessories, isLoading, addAccessory, updateAccessory, removeAccessory };
}
