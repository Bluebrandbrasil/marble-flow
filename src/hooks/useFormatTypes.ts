import { safeArray } from '../lib/dataDiagnostics';
import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, addDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import type { FormatType } from '../types';

export const useFormatTypes = () => {
    const { profile } = useAuth();
    const [formatTypes, setFormatTypes] = useState<FormatType[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!profile?.companyId) {
            setFormatTypes([]);
            setIsLoading(false);
            return;
        }

        const q = query(
            collection(db, 'format_types'),
            where('companyId', '==', profile.companyId)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const types = safeArray(snapshot.docs).map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as FormatType[];

            setFormatTypes(types.sort((a, b) => a.name.localeCompare(b.name)));
            setIsLoading(false);
        }, (error) => {
            console.error("Error fetching format types:", error);
            setIsLoading(false);
        });

        return () => unsubscribe();
    }, [profile?.companyId]);

    const addFormatType = async (data: Omit<FormatType, 'id' | 'companyId' | 'createdAt'>) => {
        if (!profile?.companyId) throw new Error('No company ID found');

        const newFormatType = {
            ...data,
            companyId: profile.companyId,
            createdAt: new Date().toISOString()
        };

        const docRef = await addDoc(collection(db, 'format_types'), newFormatType);
        return docRef.id;
    };

    const deleteFormatType = async (id: string) => {
        if (!id) return;
        await deleteDoc(doc(db, 'format_types', id));
    };

    return {
        formatTypes,
        isLoading,
        addFormatType,
        deleteFormatType
    };
};
