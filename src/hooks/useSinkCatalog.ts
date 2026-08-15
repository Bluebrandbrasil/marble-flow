import { useState, useEffect } from 'react';
import type { SinkModel } from '../types';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot, addDoc, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { toISODateSafe } from '../lib/dateWriteUtils';
import { useAuth } from '../context/AuthContext';

export function useSinkCatalog() {
    const { profile } = useAuth();
    const [sinks, setSinks] = useState<SinkModel[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!profile?.companyId) {
            setSinks([]);
            setIsLoading(false);
            return;
        }

        const q = query(collection(db, 'sinks'), where('companyId', '==', profile.companyId));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const loaded: SinkModel[] = [];
            snapshot.forEach((doc) => {
                const data = doc.data();
                loaded.push({ 
                    id: doc.id, 
                    ...data
                } as SinkModel);
            });
            setSinks(loaded);
            setIsLoading(false);
        }, (error) => {
            console.error("Error loading sinks:", error);
            setIsLoading(false);
        });

        return () => unsubscribe();
    }, [profile?.companyId]);

    const addSink = async (sink: Omit<SinkModel, 'id'>) => {
        if (!profile?.companyId) throw new Error("User company not found");

        await addDoc(collection(db, 'sinks'), {
            ...sink,
            companyId: profile.companyId,
            userId: profile.uid,
            createdAt: toISODateSafe(new Date())!
        });
    };

    const updateSink = async (id: string, data: Partial<SinkModel>) => {
        if (!profile?.companyId) throw new Error("User company not found");

        const docRef = doc(db, 'sinks', id);
        await updateDoc(docRef, data);
    };

    const removeSink = async (id: string) => {
        if (!profile?.companyId) throw new Error("User company not found");
        
        const docRef = doc(db, 'sinks', id);
        await deleteDoc(docRef);
    };

    return { sinks, isLoading, addSink, updateSink, removeSink };
}
