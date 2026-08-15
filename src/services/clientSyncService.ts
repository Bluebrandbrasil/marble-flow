import { collection, query, where, getDocs, writeBatch, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { getClientRegionLabel } from '../lib/intelligenceUtils';
import { normalizeStr } from '../lib/searchUtils';

/**
 * Sincroniza a região do cliente com seus documentos vinculados.
 * Apenas orçamentos, medições, contratos e O.S. não cancelados/deletados
 * e que não sejam contratos assinados.
 */
export const syncClientRegionToDocuments = async (
    clientId: string,
    clientData: { city?: string; state?: string; neighborhood?: string; regionLabel?: string; companyId: string }
): Promise<number> => {
    if (!clientId) {
        console.warn('syncClientRegionToDocuments: clientId is required');
        return 0;
    }
    if (!clientData.companyId) {
        console.warn('syncClientRegionToDocuments: companyId is required');
        return 0;
    }

    // Calcula o regionLabel final
    const regionLabel = clientData.regionLabel || getClientRegionLabel({}, clientData);
    if (!regionLabel || regionLabel === 'Região não informada') {
        console.warn('syncClientRegionToDocuments: Cliente sem região definida, ignorando sincronização.');
        return 0;
    }
    const regionKey = normalizeStr(regionLabel);

    const updateData = {
        clientCity: clientData.city || '',
        clientState: clientData.state || '',
        clientNeighborhood: clientData.neighborhood || '',
        clientRegionLabel: regionLabel,
        clientRegionKey: regionKey,
        regionBackfilledAt: new Date().toISOString(),
        regionBackfilledFrom: 'client_update'
    };

    let totalUpdated = 0;
    let currentBatch = writeBatch(db);
    let operationCount = 0;

    const commitBatchIfNeeded = async (force = false) => {
        if (operationCount >= 490 || (force && operationCount > 0)) {
            await currentBatch.commit();
            currentBatch = writeBatch(db);
            operationCount = 0;
        }
    };

    const processCollection = async (collectionName: string, isContract: boolean) => {
        const q = query(
            collection(db, collectionName),
            where('companyId', '==', clientData.companyId),
            where('clientId', '==', clientId)
        );
        const snapshot = await getDocs(q);
        
        for (const document of snapshot.docs) {
            const data = document.data();
            
            // Ignorar deletados/cancelados
            if (data.isDeleted || data.deleted) continue;
            const status = String(data.status || data.quoteStage || data.contractStatus).toLowerCase();
            if (['deleted', 'cancelled', 'cancelado'].includes(status)) continue;
            
            // Ignorar contratos assinados (para contratos e O.S.)
            if (isContract) {
                if (['signed', 'assinado', 'completed', 'finalizado'].includes(status)) {
                    continue;
                }
            }

            const docRef = doc(db, collectionName, document.id);
            currentBatch.update(docRef, updateData);
            operationCount++;
            totalUpdated++;
            await commitBatchIfNeeded();
        }
    };

    try {
        await processCollection('orcamentos', false);
        await processCollection('medicoes', false);
        await processCollection('contratos', true);
        await processCollection('pedidos', true);
        
        await commitBatchIfNeeded(true);
        console.log(`[SYNC] Sincronização da região concluída. ${totalUpdated} documentos atualizados.`);
        return totalUpdated;
    } catch (error) {
        console.error('[SYNC ERROR] Falha ao sincronizar região do cliente:', error);
        throw error;
    }
};

export const syncClientDataToContracts = async (clientId: string, updatedClientData: Partial<any>) => {
    try {
        if (!clientId || !updatedClientData) return { updatedCount: 0 };

        // 1. Definições de status permitidos e ignorados
        const allowedStatuses = [
            'draft',
            'em_contrato',
            'contrato_gerado',
            'aguardando_assinatura',
            'pending_signature',
            'enviado',
            'viewed',
            'company_signed',
            'client_pending',
            'pending'
        ];

        const ignoredStatuses = [
            'signed',
            'assinado',
            'completed',
            'finalizado',
            'cancelled',
            'cancelado',
            'revoked',
            'deleted'
        ];

        // 2. Prepara os dados do cliente
        const safeData = { ...updatedClientData };
        Object.keys(safeData).forEach(key => {
            if (safeData[key] === undefined) delete safeData[key];
        });

        const syncPayload: any = {};
        const syncedFields = [];
        
        const fieldMapping: Record<string, string> = {
            id: 'clientId',
            name: 'clientName',
            phone: 'clientPhone',
            whatsapp: 'clientWhatsapp',
            email: 'clientEmail',
            document: 'clientDocument',
            cpfCnpj: 'clientCpfCnpj',
            address: 'clientAddress',
            street: 'clientStreet',
            number: 'clientNumber',
            complement: 'clientComplement',
            neighborhood: 'clientNeighborhood',
            city: 'clientCity',
            state: 'clientState',
            zipCode: 'clientZipCode',
            cep: 'clientCep'
        };

        if (safeData.name) {
            syncPayload.customerName = safeData.name;
            syncPayload.clientName = safeData.name;
            syncedFields.push('clientName', 'customerName');
        }

        for (const [clientKey, contractKey] of Object.entries(fieldMapping)) {
            if (safeData[clientKey] !== undefined) {
                syncPayload[contractKey] = safeData[clientKey];
                if (!syncedFields.includes(contractKey)) {
                    syncedFields.push(contractKey);
                }
            }
        }

        syncPayload.clientSnapshot = safeData;
        syncedFields.push('clientSnapshot');

        syncPayload.clientSyncedAt = new Date().toISOString();
        syncPayload.clientSyncedFrom = 'client_update';
        syncPayload.clientSyncedFields = syncedFields;

        let updatedCount = 0;
        const contractsQuery = query(collection(db, 'contratos'), where('clientId', '==', clientId));
        const contractsSnap = await getDocs(contractsQuery);

        const updatePromises = contractsSnap.docs
            .filter(d => {
                const data = d.data();
                const status = (data.contractStatus || data.status || 'draft').toLowerCase();
                
                if (ignoredStatuses.includes(status)) return false;
                
                return allowedStatuses.includes(status);
            })
            .map(d => {
                updatedCount++;
                const docRef = doc(db, 'contratos', d.id);
                const data = d.data();
                const finalPayload = { ...syncPayload };
                
                if (data.contractSnapshot) {
                    finalPayload.contractSnapshot = {
                        ...data.contractSnapshot,
                        customerName: safeData.name || data.contractSnapshot.customerName,
                        clientSnapshot: {
                            ...(data.contractSnapshot.clientSnapshot || {}),
                            ...safeData
                        }
                    };
                }

                return updateDoc(docRef, finalPayload);
            });

        await Promise.all(updatePromises);
        return { updatedCount };

    } catch (error) {
        console.error('Error synchronizing client data to contracts:', error);
        throw error;
    }
};
