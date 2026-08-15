import { safeArray } from '../lib/dataDiagnostics';
import { useState, useEffect } from 'react';
import { collection, addDoc, updateDoc, doc, onSnapshot, query, where, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { toISODateSafe } from '../lib/dateWriteUtils';
import type { Influencer, BonusRecord } from '../types';
import { useAuth } from '../context/AuthContext';

export function useInfluencers() {
    const [influencers, setInfluencers] = useState<Influencer[]>([]);
    const [bonusRecords, setBonusRecords] = useState<BonusRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const { user, profile } = useAuth();

    useEffect(() => {
        if (!user || !profile?.companyId) {
            setInfluencers([]);
            setBonusRecords([]);
            setIsLoading(false);
            return;
        }

        const qI = query(
            collection(db, 'influencers'),
            where('companyId', '==', profile.companyId)
        );

        const qB = query(
            collection(db, 'bonus_records'),
            where('companyId', '==', profile.companyId)
        );

        const unsubI = onSnapshot(qI, (snapshot) => {
            const data = safeArray(snapshot.docs).map(doc => ({ id: doc.id, ...doc.data() })) as Influencer[];
            data.sort((a, b) => a.name.localeCompare(b.name));
            setInfluencers(data);
        }, (err) => {
            console.error("Error fetching influencers:", err);
        });

        const unsubB = onSnapshot(qB, (snapshot) => {
            const data = safeArray(snapshot.docs).map(doc => ({ id: doc.id, ...doc.data() })) as BonusRecord[];
            data.sort((a, b) => {
                const dateA = a.createdAt || '';
                const dateB = b.createdAt || '';
                return dateB.localeCompare(dateA); // desc
            });
            setBonusRecords(data);
            setIsLoading(false);
        }, (err) => {
            console.error("Error fetching bonus records:", err);
            setIsLoading(false);
        });

        return () => { unsubI(); unsubB(); };
    }, [user, profile?.companyId]);

    const addInfluencer = async (data: Omit<Influencer, 'id' | 'userId' | 'companyId' | 'createdAt' | 'stats'>) => {
        if (!user || !profile?.companyId) throw new Error('Auth required');
        const docRef = await addDoc(collection(db, 'influencers'), {
            ...data,
            companyId: profile.companyId,
            stats: { 
                leads: 0, 
                quotes: 0, 
                closures: 0, 
                totalValue: 0, 
                accumulatedBonus: 0 
            },
            userId: user.uid,
            createdAt: toISODateSafe(new Date())!,
            // Rule #Parceiros: Ensure unique referral code
            referralCode: data.code || `REF-${Math.random().toString(36).substring(2, 7).toUpperCase()}`,
            referralLink: data.referralLink || `marbleflow.com/ref/${data.code || ''}`,
            commissionPercentage: data.commissionPercentage || 5,
            condominiumName: data.condominiumName || '',
            qualityScore: 100,
            rewardTier: 'bronze'
        });
        return docRef.id;
    };

    const updateInfluencer = async (id: string, data: Partial<Influencer>) => {
        if (!user) throw new Error('Auth required');
        const docRef = doc(db, 'influencers', id);
        await updateDoc(docRef, data);
    };

    const addBonusRecord = async (data: Omit<BonusRecord, 'id' | 'createdAt' | 'companyId'>) => {
        if (!user || !profile?.companyId) throw new Error('Auth required');
        const docRef = await addDoc(collection(db, 'bonus_records'), {
            ...data,
            companyId: profile.companyId,
            createdAt: toISODateSafe(new Date())!
        });
        return docRef.id;
    };

    const updateBonusStatus = async (id: string, status: BonusRecord['status']) => {
        if (!user) throw new Error('Auth required');
        const docRef = doc(db, 'bonus_records', id);
        await updateDoc(docRef, { status });

        if (status === 'paid') {
            const record = bonusRecords.find(b => b.id === id);
            if (record && record.clientId) {
                await updateDoc(doc(db, 'clients', record.clientId), { referralStatus: 'bonificado' });
            }
        }
    };

    return { 
        influencers, 
        bonusRecords, 
        isLoading, 
        addInfluencer, 
        updateInfluencer, 
        addBonusRecord, 
        updateBonusStatus 
    };
}
