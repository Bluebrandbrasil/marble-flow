import { safeArray } from '../lib/dataDiagnostics';
import { useState, useEffect } from 'react';
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, where, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import type { StaffModel } from '../types';

export function useStaffCatalog() {
    const [staff, setStaff] = useState<StaffModel[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const { user, profile } = useAuth();

    useEffect(() => {
        if (!user || !profile?.companyId) {
            setStaff([]);
            setIsLoading(false);
            return;
        }

        // Consistent query: Multi-tenant focus using companyId
        // Now pointing to 'users' collection as it is the official source of active staff with accounts
        const q = query(
            collection(db, 'users'),
            where('companyId', '==', profile.companyId),
            where('status', '==', 'approved')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            let usersData = safeArray(snapshot.docs).map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    ...data
                };
            }) as any[];

            usersData = usersData.filter(u => u.role !== 'superadmin' && u.email !== 'rdmarketingcomercial@gmail.com');

            if (!import.meta.env.PROD) {
                console.log(`[STAFF DEBUG] Found ${usersData.length} total staff members in company ${profile.companyId}. Roles:`, safeArray(usersData).map(u => u.role));
            }

            setStaff(usersData);
            setIsLoading(false);
        }, (error) => {
            console.error('Error fetching staff from users collection:', error);
            setIsLoading(false);
        });

        return () => unsubscribe();
    }, [user, profile?.companyId]);

    const addStaff = async (staffData: Omit<StaffModel, 'id' | 'userId' | 'companyId' | 'createdAt'>) => {
        if (!user) throw new Error('User not authenticated');
        if (!profile?.companyId) throw new Error('No company assigned to user');

        try {
            const newStaff = {
                ...staffData,
                userId: user.uid,
                companyId: profile.companyId,
                createdAt: serverTimestamp()
            };

            console.log("Adding staff member:", newStaff);
            const docRef = await addDoc(collection(db, 'staff'), newStaff);
            console.log("Staff member added with ID:", docRef.id);
            return docRef.id;
        } catch (error) {
            console.error("Failed to add staff member:", error);
            throw error;
        }
    };

    const updateStaff = async (id: string, staffData: Partial<StaffModel>) => {
        if (!user) throw new Error('User not authenticated');

        try {
            const docRef = doc(db, 'staff', id);
            await updateDoc(docRef, staffData);
        } catch (error) {
            console.error("Failed to update staff member:", error);
            throw error;
        }
    };

    const removeStaff = async (id: string) => {
        if (!user) throw new Error('User not authenticated');

        try {
            await deleteDoc(doc(db, 'staff', id));
        } catch (error) {
            console.error("Failed to remove staff member:", error);
            throw error;
        }
    };

    return { staff, isLoading, addStaff, updateStaff, removeStaff };
}
