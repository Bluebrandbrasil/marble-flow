import { safeArray } from '../lib/dataDiagnostics';
import { collection, query, where, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

export interface CompanyUser {
    id: string; // The uid
    name: string;
    email: string;
    role: string;
    status: 'approved' | 'pending' | 'rejected';
    createdAt: string;
    companyId: string;
}

export const getUsersByCompany = async (companyId: string): Promise<CompanyUser[]> => {
    const q = query(collection(db, 'users'), where('companyId', '==', companyId));
    const snap = await getDocs(q);
    const users = safeArray(snap.docs).map(d => ({ id: d.id, ...d.data() } as CompanyUser));
    return users.filter(u => u.role !== 'superadmin' && u.email !== 'rdmarketingcomercial@gmail.com');
};

export const updateUserStatus = async (userId: string, newStatus: 'approved' | 'pending' | 'rejected') => {
    await updateDoc(doc(db, 'users', userId), { status: newStatus });
};
