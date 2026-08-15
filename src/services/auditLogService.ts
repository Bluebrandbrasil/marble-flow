import { addDoc, collection } from 'firebase/firestore';
import { toISODateSafe } from '../lib/dateWriteUtils';
import { db } from '../lib/firebase';

interface AuditLogPayload {
    companyId: string;
    superAdminEmail: string;
    action: string;
    oldData?: any;
    newData?: any;
}

export const logAction = async (payload: AuditLogPayload) => {
    try {
        const isoNow = toISODateSafe(new Date());
        await addDoc(collection(db, 'auditLogs'), {
            ...payload,
            timestamp: isoNow,
            createdAt: isoNow
        });
    } catch (e) {
        console.error("Non-fatal: Failed to write audit log:", e);
    }
};
