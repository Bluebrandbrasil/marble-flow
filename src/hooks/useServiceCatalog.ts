import { useState, useEffect } from 'react';
import type { ServiceCatalogItem } from '../types';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot, addDoc, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { toISODateSafe } from '../lib/dateWriteUtils';
import { useAuth } from '../context/AuthContext';

export function useServiceCatalog() {
    const { profile } = useAuth();
    const [services, setServices] = useState<ServiceCatalogItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!profile?.companyId) {
            setServices([]);
            setIsLoading(false);
            return;
        }

        const q = query(collection(db, 'services'), where('companyId', '==', profile.companyId));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const loadedServices: ServiceCatalogItem[] = [];
            snapshot.forEach((doc) => {
                loadedServices.push({ id: doc.id, ...doc.data() } as ServiceCatalogItem);
            });
            setServices(loadedServices);
            setIsLoading(false);
        }, (error) => {
            console.error("Error loading services:", error);
            setIsLoading(false);
        });

        return () => unsubscribe();
    }, [profile?.companyId]);

    const addService = async (service: Omit<ServiceCatalogItem, 'id'>) => {
        if (!profile?.companyId) throw new Error("User company not found");

        await addDoc(collection(db, 'services'), {
            ...service,
            companyId: profile.companyId,
            userId: profile.uid,
            createdAt: toISODateSafe(new Date())!
        });
    };

    const updateService = async (id: string, data: Partial<ServiceCatalogItem>) => {
        if (!profile?.companyId) throw new Error("User company not found");

        const docRef = doc(db, 'services', id);
        await updateDoc(docRef, data);
    };

    const removeService = async (id: string) => {
        if (!profile?.companyId) throw new Error("User company not found");
        
        const docRef = doc(db, 'services', id);
        await deleteDoc(docRef);
    };

    return { services, isLoading, addService, updateService, removeService };
}
