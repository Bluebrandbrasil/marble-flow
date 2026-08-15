import { doc, runTransaction, collection, updateDoc, writeBatch, query, where, getDocs } from 'firebase/firestore';
import { toISODateSafe } from '../lib/dateWriteUtils';
import { db } from '../lib/firebase';
import { logAction } from './auditLogService';

interface CreateCompanyPayload {
    name: string;
    cnpj?: string;
    status: 'pending' | 'approved' | 'rejected';
    adminName: string;
    adminEmail: string;
    superAdminUid: string;
}

export const createCompanyWithAdminInvite = async (payload: CreateCompanyPayload): Promise<{ companyId: string, inviteId: string }> => {
    // 1. Normalize company name
    const normalizedName = payload.name
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // Remove accents
        .replace(/[^a-z0-9]/g, "");      // Remove special characters and spaces

    if (!normalizedName) {
        throw new Error("Nome da empresa inválido.");
    }

    const emailToCheck = payload.adminEmail.trim().toLowerCase();

    // 1.5 Duplicate email validation
    const usersQuery = query(collection(db, 'users'), where('email', '==', emailToCheck));
    const usersSnap = await getDocs(usersQuery);
    if (!usersSnap.empty) {
        throw new Error("Este e-mail já está em uso por outro usuário no sistema.");
    }

    const invitesQuery = query(collection(db, 'invites'), where('email', '==', emailToCheck));
    const invitesSnap = await getDocs(invitesQuery);
    if (!invitesSnap.empty) {
        throw new Error("Este e-mail já está em uso em um convite pendente.");
    }

    const companyNameRef = doc(db, 'companyNames', normalizedName);
    const newCompanyRef = doc(collection(db, 'companies'));
    const newInviteRef = doc(collection(db, 'invites'));

    try {
        await runTransaction(db, async (transaction) => {
            // 2. Check for duplicate company
            const nameDoc = await transaction.get(companyNameRef);
            if (nameDoc.exists()) {
                throw new Error(`A empresa já existe. Tente alternativas como "${payload.name} Oficial" ou "${payload.name} 2".`);
            }

            // 3. Create the lock document
            transaction.set(companyNameRef, {
                companyId: newCompanyRef.id,
                createdAt: toISODateSafe(new Date())
            });

            // 4. Create the company document
            transaction.set(newCompanyRef, {
                name: payload.name.trim(),
                normalizedName,
                cnpj: payload.cnpj || '',
                status: payload.status,
                adminEmail: payload.adminEmail.trim().toLowerCase(),
                adminName: payload.adminName.trim(),
                createdAt: toISODateSafe(new Date()),
                createdBy: payload.superAdminUid
            });

            // 5. Create the admin invite document
            transaction.set(newInviteRef, {
                companyId: newCompanyRef.id,
                email: payload.adminEmail.trim().toLowerCase(),
                role: 'company_admin',
                status: 'pending',
                createdByUid: payload.superAdminUid,
                createdAt: toISODateSafe(new Date()),
                expiresAt: toISODateSafe(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)), // Expires in 7 days
                guestName: payload.adminName.trim()
            });
        });

        return {
            companyId: newCompanyRef.id,
            inviteId: newInviteRef.id
        };
    } catch (error) {
        console.error("Error creating company with admin invite:", error);
        throw error;
    }
};

export const updateCompanyAndUsers = async (
    companyId: string,
    updates: { name?: string, cnpj?: string, status?: 'pending' | 'approved' | 'rejected' },
    superAdminEmail: string
) => {
    const companyRef = doc(db, 'companies', companyId);

    // Update company
    await updateDoc(companyRef, {
        ...updates,
        updatedAt: toISODateSafe(new Date())
    });

    // Log the action
    await logAction({
        companyId,
        superAdminEmail,
        action: 'edit_company',
        newData: updates
    });

    // If status changes, cascade to all users for this company
    if (updates.status) {
        try {
            const usersRef = collection(db, 'users');
            const q = query(usersRef, where('companyId', '==', companyId));
            const snap = await getDocs(q);

            if (!snap.empty) {
                const batch = writeBatch(db);
                let updateCount = 0;

                snap.docs.forEach(userDoc => {
                    batch.update(userDoc.ref, { status: updates.status });
                    updateCount++;
                });
                await batch.commit();
                console.log(`Cascaded status ${updates.status} to ${updateCount} users for company ${companyId}`);
            }
        } catch (err) {
            console.error("Non-fatal: Error cascading user status:", err);
            // Non-fatal, let main update succeed
        }
    }
};
