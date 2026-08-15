
import { collection, getDocs, query, where, Timestamp, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { safeParseISO } from './dateUtils';

export interface AuditStats {
    totalRecords: number;
    affectedRecords: number;
    issues: {
        module: string;
        code: string;
        field: string;
        count: number;
    }[];
}

export const runTemporalAudit = async (onProgress?: (msg: string) => void) => {
    const collections = ['pedidos', 'orcamentos', 'medicoes', 'clientes'];
    const results: any[] = [];
    const stats: AuditStats = { totalRecords: 0, affectedRecords: 0, issues: [] };

    const reportIssue = (module: string, code: string, field: string) => {
        const existing = stats.issues.find(i => i.module === module && i.code === code && i.field === field);
        if (existing) existing.count++;
        else stats.issues.push({ module, code, field, count: 1 });
    };

    for (const colName of collections) {
        onProgress?.(`Auditando coleção: ${colName}...`);
        const q = query(collection(db, colName));
        const snap = await getDocs(q);
        stats.totalRecords += snap.size;

        for (const d of snap.docs) {
            const data = d.data();
            let hasIssue = false;

            // Common constraints
            if (!data.createdAt) {
                reportIssue(colName, 'MISSING_CREATED_AT', 'createdAt');
                hasIssue = true;
            }
            if (!data.companyId) {
                reportIssue(colName, 'MISSING_COMPANY_ID', 'companyId');
                hasIssue = true;
            }

            // Collection specific logic
            if (colName === 'pedidos') {
                if (data.status === 'finished' && !data.completedAt) {
                    reportIssue(colName, 'FINISHED_WITHOUT_DATE', 'completedAt');
                    hasIssue = true;
                }
                if (data.contractStatus === 'signed' && !data.signedAt) {
                    reportIssue(colName, 'SIGNED_WITHOUT_DATE', 'signedAt');
                    hasIssue = true;
                }
            }

            if (colName === 'orcamentos') {
                if (data.status === 'approved' && !data.approvedAt) {
                    reportIssue(colName, 'APPROVED_WITHOUT_DATE', 'approvedAt');
                    hasIssue = true;
                }
            }

            if (hasIssue) stats.affectedRecords++;
        }
    }

    return stats;
};

export const runTemporalNormalization = async (onProgress?: (msg: string) => void) => {
    const collections = ['pedidos', 'orcamentos', 'medicoes', 'clientes'];
    let fixedCount = 0;

    for (const colName of collections) {
        onProgress?.(`Normalizando coleção: ${colName}...`);
        const q = query(collection(db, colName));
        const snap = await getDocs(q);

        for (const d of snap.docs) {
            const data = d.data();
            const updates: any = {};
            let needsUpdate = false;

            // 1. createdAt logic
            if (!data.createdAt) {
                // Tenta inferir pelo metadata do Firestore se possível (neste SDK cliente não temos acesso fácil ao createTime real do meta em getDocs)
                // Usamos a primeira data disponível ou mantemos null se nada confiável
                const fallback = data.updatedAt || data.lastAutosaveAt || null;
                if (fallback) {
                    updates.createdAt = fallback;
                    needsUpdate = true;
                }
            }

            // 2. updatedAt logic
            if (!data.updatedAt && data.createdAt) {
                updates.updatedAt = data.createdAt;
                needsUpdate = true;
            }

            // 3. Status consistency
            if (colName === 'pedidos') {
                if (data.status === 'finished' && !data.completedAt) {
                    // Tenta usar updatedAt como fallback semântico
                    if (data.updatedAt) {
                        updates.completionDate = data.updatedAt;
                        needsUpdate = true;
                    }
                }
                if (data.contractStatus === 'signed' && !data.signedAt) {
                    if (data.signatureData?.timestamp) {
                        updates.signedAt = data.signatureData.timestamp;
                        needsUpdate = true;
                    }
                }
            }

            if (colName === 'orcamentos') {
                if (data.status === 'approved' && !data.approvedAt) {
                    if (data.updatedAt) {
                        updates.approvedAt = data.updatedAt;
                        needsUpdate = true;
                    }
                }
            }

            if (needsUpdate) {
                await updateDoc(doc(db, colName, d.id), updates);
                fixedCount++;
            }
        }
    }

    return fixedCount;
};
