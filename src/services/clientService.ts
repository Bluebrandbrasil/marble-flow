import { collection, query, where, getCountFromServer, doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';

export interface ClientRelationshipSummary {
    quotes: number;
    orders: number;
    measurements: number;
    visits: number;
    plannedProjects: number;
    total: number;
}

export async function getClientRelationshipSummary(companyId: string, clientId: string): Promise<ClientRelationshipSummary> {
    const refs = {
        quotes: query(collection(db, 'orcamentos'), where('companyId', '==', companyId), where('clientId', '==', clientId)),
        orders: query(collection(db, 'pedidos'), where('companyId', '==', companyId), where('clientId', '==', clientId)),
        measurements: query(collection(db, 'medicoes'), where('companyId', '==', companyId), where('clientId', '==', clientId)),
        visits: query(collection(db, 'store_visits'), where('companyId', '==', companyId), where('clientId', '==', clientId)),
        plannedProjects: query(collection(db, 'planned_projects'), where('companyId', '==', companyId), where('clientId', '==', clientId)),
    };

    const results = await Promise.all([
        getCountFromServer(refs.quotes),
        getCountFromServer(refs.orders),
        getCountFromServer(refs.measurements),
        getCountFromServer(refs.visits),
        getCountFromServer(refs.plannedProjects)
    ]);

    const summary = {
        quotes: results[0].data().count,
        orders: results[1].data().count,
        measurements: results[2].data().count,
        visits: results[3].data().count,
        plannedProjects: results[4].data().count,
    };

    return {
        ...summary,
        total: summary.quotes + summary.orders + summary.measurements + summary.visits + summary.plannedProjects
    };
}

export async function softDeleteClient(params: { companyId: string, clientId: string, userId: string, reason: string }) {
    const { companyId, clientId, userId, reason } = params;

    const summary = await getClientRelationshipSummary(companyId, clientId);

    await runTransaction(db, async (transaction) => {
        const clientRef = doc(db, 'clients', clientId);
        const clientDoc = await transaction.get(clientRef);

        if (!clientDoc.exists()) {
            throw new Error('Cliente não encontrado.');
        }

        const data = clientDoc.data();

        if (data.companyId !== companyId) {
            throw new Error('Permissão negada (Company ID mismatch).');
        }

        const currentStatus = data.status ?? 'active';

        if (currentStatus === 'deleted') {
            throw new Error('O cliente já está excluído.');
        }

        const previousStatus = currentStatus;

        // Update Client
        transaction.update(clientRef, {
            status: 'deleted',
            deletedAt: serverTimestamp(),
            deletedBy: userId,
            deleteReason: reason,
            deletionType: 'soft_delete',
            updatedAt: serverTimestamp(),
            updatedBy: userId
        });

        // Audit Log
        const historyRef = doc(collection(db, `clients/${clientId}/history`));
        transaction.set(historyRef, {
            eventType: 'client_soft_deleted',
            clientId,
            companyId,
            previousStatus,
            newStatus: 'deleted',
            changedAt: serverTimestamp(),
            changedBy: userId,
            reason,
            relationshipSummary: summary
        });
    });
}

export async function restoreClient(params: { companyId: string, clientId: string, userId: string }) {
    const { companyId, clientId, userId } = params;

    await runTransaction(db, async (transaction) => {
        const clientRef = doc(db, 'clients', clientId);
        const clientDoc = await transaction.get(clientRef);

        if (!clientDoc.exists()) {
            throw new Error('Cliente não encontrado.');
        }

        const data = clientDoc.data();

        if (data.companyId !== companyId) {
            throw new Error('Permissão negada (Company ID mismatch).');
        }

        const currentStatus = data.status ?? 'active';

        if (currentStatus !== 'deleted') {
            throw new Error('O cliente não está excluído.');
        }

        const previousStatus = currentStatus;

        // Update Client
        transaction.update(clientRef, {
            status: 'active',
            restoredAt: serverTimestamp(),
            restoredBy: userId,
            updatedAt: serverTimestamp(),
            updatedBy: userId
        });

        // Audit Log
        const historyRef = doc(collection(db, `clients/${clientId}/history`));
        transaction.set(historyRef, {
            eventType: 'client_restored',
            clientId,
            companyId,
            previousStatus,
            newStatus: 'active',
            changedAt: serverTimestamp(),
            changedBy: userId,
            reason: 'Restauração solicitada pelo usuário',
            relationshipSummary: {} // Not relevant for restore, but keeping signature compatible if needed
        });
    });
}
