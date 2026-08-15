import { safeArray } from '../lib/dataDiagnostics';
import { useState, useEffect, useMemo } from 'react';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, orderBy } from 'firebase/firestore';
import { toISODateSafe } from '../lib/dateWriteUtils';
import { useAuth } from '../context/AuthContext';
import type { CommercialAction } from '../types/intelligence';

export const useCommercialActions = () => {
    const { profile } = useAuth();
    const [actions, setActions] = useState<CommercialAction[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!profile?.companyId) return;

        const q = query(
            collection(db, 'commercial_actions'),
            where('companyId', '==', profile.companyId),
            orderBy('createdAt', 'desc')
        );

        const unsub = onSnapshot(q, (snapshot) => {
            const data = safeArray(snapshot.docs).map(doc => ({ id: doc.id, ...doc.data() } as CommercialAction));
            setActions(data);
            setIsLoading(false);
        }, (error) => {
            console.error('Error fetching commercial actions:', error);
            setIsLoading(false);
        });

        return () => unsub();
    }, [profile?.companyId]);

    const createAction = async (actionData: Partial<CommercialAction>) => {
        if (!profile?.companyId) return;

        try {
            const payload = {
                ...actionData,
                companyId: profile.companyId,
                status: actionData.status || 'open',
                priority: actionData.priority || 'medium',
                createdAt: toISODateSafe(new Date())!,
                createdBy: profile.uid || 'system',
            };

            const docRef = await addDoc(collection(db, 'commercial_actions'), payload);
            return docRef.id;
        } catch (error) {
            console.error('Error creating commercial action:', error);
            throw error;
        }
    };

    const updateAction = async (id: string, updates: Partial<CommercialAction>) => {
        try {
            const docRef = doc(db, 'commercial_actions', id);
            const payload = { ...updates };
            if (updates.status === 'done' && !updates.completedAt) {
                payload.completedAt = toISODateSafe(new Date())!;
            }
            await updateDoc(docRef, payload);
        } catch (error) {
            console.error('Error updating commercial action:', error);
            throw error;
        }
    };

    const stats = useMemo(() => {
        return {
            total: safeArray(actions).length,
            open: safeArray(actions).filter(a => a.status === 'open' || a.status === 'in_progress').length,
            done: safeArray(actions).filter(a => a.status === 'done').length,
            critical: safeArray(actions).filter(a => (a.status === 'open' || a.status === 'in_progress') && a.priority === 'critical').length
        };
    }, [actions]);

    return {
        actions,
        isLoading,
        createAction,
        updateAction,
        stats
    };
};
