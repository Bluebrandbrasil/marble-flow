import { safeArray } from '../lib/dataDiagnostics';
import { useState, useEffect } from 'react';
import { collection, addDoc, updateDoc, doc, onSnapshot, query, where, orderBy, deleteDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { toISODateSafe } from '../lib/dateWriteUtils';
import { useAuth } from '../context/AuthContext';
import type { Invite } from '../types';

export function useInvites() {
    const [invites, setInvites] = useState<Invite[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const { user, profile } = useAuth();

    useEffect(() => {
        if (!user || !profile?.companyId) {
            setInvites([]);
            setIsLoading(false);
            return;
        }

        const q = query(
            collection(db, 'invites'),
            where('companyId', '==', profile.companyId),
            orderBy('createdAt', 'desc')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data = safeArray(snapshot.docs).map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as Invite[];
            setInvites(data);
            setIsLoading(false);
        }, (error) => {
            console.error('Error fetching invites:', error);
            setIsLoading(false);
        });

        return () => unsubscribe();
    }, [user, profile?.companyId]);

    const createInvite = async (email: string, role: Invite['role']) => {
        if (!user || !profile?.companyId) throw new Error('Unauthorized');

        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiry

        const newInvite: Omit<Invite, 'id'> = {
            email,
            companyId: profile.companyId,
            role,
            status: 'pending',
            createdAt: toISODateSafe(new Date())!,
            expiresAt: toISODateSafe(expiresAt)!,
            createdByUid: user.uid
        };

        const docRef = await addDoc(collection(db, 'invites'), newInvite);
        return docRef.id;
    };

    const revokeInvite = async (inviteId: string) => {
        const inviteRef = doc(db, 'invites', inviteId);
        await updateDoc(inviteRef, { status: 'revoked' });
    };

    const removeInvite = async (inviteId: string) => {
        await deleteDoc(doc(db, 'invites', inviteId));
    };

    return { invites, isLoading, createInvite, revokeInvite, removeInvite };
}
