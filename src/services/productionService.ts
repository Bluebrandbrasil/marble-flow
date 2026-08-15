import { collection, doc, runTransaction, serverTimestamp, arrayUnion, Timestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Order, Status } from '../types';
import { toISODateSafe } from '../lib/dateWriteUtils';
import { normalizeStr } from '../lib/searchUtils';

export const generateSearchTerms = (name: string): string[] => {
    if (!name) return [];
    const normalized = normalizeStr(name);
    const words = normalized.split(' ').filter(Boolean);
    const terms = new Set<string>();
    
    words.forEach(word => {
        for (let i = 3; i <= word.length; i++) {
            terms.add(word.substring(0, i));
        }
    });
    return Array.from(terms);
};

export interface TransitionStageParams {
    orderId: string;
    companyId: string;
    fromStage: Status;
    toStage: Status;
    userId: string;
    userName: string;
    reason?: string;
    metadata?: Record<string, any>;
    additionalFields?: Partial<Order>;
}

export const transitionProductionStage = async (params: TransitionStageParams) => {
    const { orderId, companyId, fromStage, toStage, userId, userName, reason, metadata, additionalFields } = params;

    const orderRef = doc(db, 'pedidos', orderId);
    
    // Deterministic IDs to avoid duplicates on transaction retry
    const timestampKey = new Date().getTime().toString();
    const historyRef = doc(db, `pedidos/${orderId}/production_history`, `${timestampKey}_${toStage}`);
    const globalLogRef = doc(collection(db, 'order_logs'));
    
    await runTransaction(db, async (transaction) => {
        const orderSnap = await transaction.get(orderRef);

        if (!orderSnap.exists()) {
            throw new Error('Ordem de serviço não encontrada.');
        }

        const orderData = orderSnap.data() as Order;

        if (orderData.companyId !== companyId) {
            throw new Error('Sem permissão para alterar O.S. de outra empresa.');
        }

        if (orderData.status !== fromStage) {
            throw new Error(`A O.S. não está mais na etapa esperada (${fromStage}). Atual: ${orderData.status}`);
        }

        const isoNow = toISODateSafe(new Date())!;
        const historyArray = orderData.history || [];

        const updates: Partial<Order> = {
            status: toStage,
            updatedAt: isoNow,
            history: [...historyArray, {
                status: toStage,
                timestamp: isoNow,
                userId,
                notes: reason || `Movido para ${toStage} por ${userName}`
            }] as any,
            ...additionalFields
        };

        // Timestamps (preserve first initialization)
        if (toStage === 'em_producao' && fromStage !== 'em_producao') {
            if (!orderData.productionStartedAt && !orderData.productionStartDate) {
                updates.productionStartedAt = isoNow;
            }
        }

        if (toStage === 'em_instalacao' && fromStage !== 'em_instalacao') {
            if (!orderData.installationStartedAt && !orderData.installationStartDate) {
                updates.installationStartedAt = isoNow;
            }
            if (fromStage === 'em_producao') {
                updates.productionCompletedAt = isoNow;
            }
        }

        if (toStage === 'finalizado') {
            updates.completionDate = isoNow;
            if (!orderData.finalizedAt) {
                updates.finalizedAt = isoNow;
            }
            updates.finalizedBy = userId;
            
            if (fromStage === 'em_instalacao') {
                updates.installationCompletedAt = isoNow;
            } else if (fromStage === 'em_producao') {
                updates.productionCompletedAt = isoNow;
            }

            // Normalization & Search Terms
            const clientNameRaw = (additionalFields as any)?.customerName || orderData.customerName || '';
            updates.orderNumberNormalized = String(orderData.orderNumber || '').trim();
            updates.contractNumberNormalized = String(orderData.contractSnapshot?.contractNumber || orderData.contractNumber || '').trim();
            updates.clientNameNormalized = normalizeStr(clientNameRaw);
            updates.searchTerms = generateSearchTerms(clientNameRaw);

            // Latest snapshot summary
            updates.finalProductionSnapshot = {
                orderId: orderData.id,
                orderNumber: orderData.orderNumber || null,
                protocolNumber: orderData.protocolNumber || null,
                clientId: orderData.clientId || orderData.customerId || null,
                clientName: orderData.customerName || null,
                contractId: orderData.contractId || null,
                contractNumber: updates.contractNumberNormalized || null,
                quoteId: orderData.quoteId || null,
                sellerId: orderData.sellerId || null,
                sellerName: orderData.sellerName || null,
                material: orderData.material || null,
                productionResponsibleIds: orderData.productionResponsibleIds || [orderData.cutterId, orderData.finisherId].filter(Boolean),
                installerId: orderData.installerId || null,
                installerName: orderData.installerName || null,
                address: orderData.address || null,
                pieces: orderData.pieces || null,
                productionStartedAt: updates.productionStartedAt || orderData.productionStartedAt || orderData.productionStartDate || null,
                productionCompletedAt: updates.productionCompletedAt || orderData.productionCompletedAt || null,
                installationStartedAt: updates.installationStartedAt || orderData.installationStartedAt || orderData.installationStartDate || null,
                installationCompletedAt: updates.installationCompletedAt || orderData.installationCompletedAt || null,
                finalizedAt: updates.finalizedAt || isoNow,
                status: 'finalizado'
            };

            // Immutable cycle creation
            const cycleNumber = (orderData as any).cycleCount ? (orderData as any).cycleCount + 1 : 1;
            updates.cycleCount = cycleNumber;
            
            const cycleId = `cycle_${cycleNumber}`;
            const cycleRef = doc(db, `pedidos/${orderId}/completion_cycles`, cycleId);
            
            transaction.set(cycleRef, {
                cycleNumber,
                finalizedAt: isoNow,
                finalizedBy: userId,
                snapshot: updates.finalProductionSnapshot,
                reopenedAt: orderData.reopenedAt || null,
                reopenedBy: orderData.reopenedBy || null,
                reopenReason: orderData.reopenReason || null,
                companyId
            });
        }

        if (fromStage === 'finalizado' && toStage !== 'finalizado') {
            updates.reopenedAt = isoNow;
            updates.reopenedBy = userId;
            updates.reopenReason = reason || '';
        }

        transaction.update(orderRef, updates);

        transaction.set(historyRef, {
            orderId,
            companyId,
            eventType: fromStage === 'finalizado' ? 'order_reopened' : 'stage_transition',
            fromStage,
            toStage,
            changedAt: serverTimestamp(), // Safe inside transaction as serverTimestamp() evaluates perfectly
            changedBy: userId,
            changedByName: userName,
            reason: reason || null,
            metadata: metadata || null
        });

        transaction.set(globalLogRef, {
            orderId,
            companyId,
            userId,
            userName,
            action: 'status_change',
            fieldChanged: 'status',
            oldValue: fromStage,
            newValue: toStage,
            timestamp: serverTimestamp()
        });
    });
};
