import { 
    collection, 
    addDoc, 
    query, 
    where, 
    getDocs, 
    updateDoc, 
    doc 
} from 'firebase/firestore';
import { db } from './firebase';
import { toISODateSafe } from './dateWriteUtils';
import type { BonusRecord, Order, Influencer, OrderLog } from '../types';

/**
 * Automates the creation of a bonus record when a contract is signed.
 * Aligned with Contract-First governance.
 */
export const triggerBonusAutomation = async (
    contract: Order, 
    influencer: Influencer | null,
    companyId: string
) => {
    if (!contract.influencerId || !companyId) return null;

    console.log(`[BONUS AUTOMATION] Triggered for contract ${contract.id} and influencer ${contract.influencerId}`);

    try {
        // 1. Avoid Duplicity: Check if a bonus already exists for this contract
        const q = query(
            collection(db, 'bonus_records'),
            where('contractId', '==', contract.id),
            where('companyId', '==', companyId)
        );
        
        const existing = await getDocs(q);
        if (!existing.empty) {
            console.warn(`[BONUS AUTOMATION] Bonus already exists for contract ${contract.id}. Skipping.`);
            return null;
        }

        // 2. Fetch Influencer data if not provided to get commission percentage
        let percentage = 5; // Default 5%
        let influencerName = contract.influencerName || 'Parceiro';

        if (!influencer) {
            const influencerSnap = await getDocs(query(
                collection(db, 'influencers'),
                where('id', '==', contract.influencerId)
            ));
            if (!influencerSnap.empty) {
                const infData = influencerSnap.docs[0].data() as Influencer;
                influencerName = infData.name;
                // Rule #Parceiros: Use custom commission if defined
                if (infData.commissionPercentage) {
                    percentage = infData.commissionPercentage;
                }
            }
        } else if (influencer.commissionPercentage) {
            percentage = influencer.commissionPercentage;
            influencerName = influencer.name;
        }

        const orderValue = contract.commercialTotal || contract.totalAmount || 0;
        const bonusAmount = (orderValue * percentage) / 100;

        // 3. Create Bonus Record
        const bonusRecord: Omit<BonusRecord, 'id'> = {
            influencerId: contract.influencerId,
            influencerName: influencerName,
            clientId: contract.clientId || '',
            clientName: contract.customerName || 'Cliente',
            contractId: contract.id,
            orderId: contract.id, // Keeping for backward compatibility
            orderValue: orderValue,
            bonusAmount: bonusAmount,
            description: `Comissão Automática: Contrato #${contract.protocolNumber || contract.id.slice(0, 8)}`,
            type: 'percentage',
            percentage: percentage,
            appliedPercentage: percentage, // Audit trail
            status: 'pending', // Starts as pending until customer pays
            createdAt: toISODateSafe(new Date())!,
            companyId: companyId
        };

        const docRef = await addDoc(collection(db, 'bonus_records'), bonusRecord);
        console.log(`[BONUS AUTOMATION] Bonus record created: ${docRef.id}`);

        // 4. Update Influencer Stats (Accumulated)
        // Note: Real aggregation should happen in a separate job, but we update stats for UI snappiness
        const influencerRef = doc(db, 'influencers', contract.influencerId);
        // We'll increment leads/quotes/closures/totalValue elsewhere or via cloud functions.
        // For now, this service focus on the record creation.

        return docRef.id;
    } catch (error) {
        console.error("[BONUS AUTOMATION ERROR]", error);
        return null;
    }
};

/**
 * Updates bonus status based on financial events.
 * Transitions from 'pending' to 'payable' when customer pays.
 */
export const syncBonusWithFinancialEvent = async (
    contractId: string,
    paymentEventId: string,
    companyId: string
) => {
    try {
        const q = query(
            collection(db, 'bonus_records'),
            where('contractId', '==', contractId),
            where('status', '==', 'pending'),
            where('companyId', '==', companyId)
        );

        const snapshot = await getDocs(q);
        if (snapshot.empty) return;

        for (const recordDoc of snapshot.docs) {
            await updateDoc(doc(db, 'bonus_records', recordDoc.id), {
                status: 'payable', // Now the partner can be paid
                paymentEventId: paymentEventId,
                updatedAt: toISODateSafe(new Date())
            });
            console.log(`[BONUS SYNC] Bonus ${recordDoc.id} moved to PAYABLE due to financial event ${paymentEventId}`);
        }
    } catch (error) {
        console.error("[BONUS SYNC ERROR]", error);
    }
};

/**
 * Process multiple bonus records as a batch payment.
 */
export const processBonusBatch = async (
    bonusIds: string[],
    paymentData: {
        method: string;
        userId: string;
        userName: string;
    },
    companyId: string
) => {
    const batchId = `BATCH-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const timestamp = toISODateSafe(new Date())!;
    const results = {
        success: 0,
        failed: 0,
        totalPaid: 0
    };

    for (const id of bonusIds) {
        try {
            const docRef = doc(db, 'bonus_records', id);
            // Fetch first to get amount for total
            const snap = await getDocs(query(collection(db, 'bonus_records'), where('id', '==', id)));
            if (snap.empty) continue;
            
            const data = snap.docs[0].data() as BonusRecord;
            
            await updateDoc(docRef, {
                status: 'paid',
                batchId: batchId,
                paidAt: timestamp,
                paidBy: paymentData.userName,
                paymentMethod: paymentData.method,
                updatedAt: timestamp
            });

            // Update Client Referral Status: bonificado
            if (data.clientId) {
                await updateDoc(doc(db, 'clients', data.clientId), {
                    referralStatus: 'bonificado'
                });
            }

            results.success++;
            results.totalPaid += data.bonusAmount;

            // Rule #Audit: Create log for the payment
            if (data.contractId) {
                const log: Omit<OrderLog, 'id'> = {
                    orderId: data.contractId,
                    companyId: companyId,
                    userId: paymentData.userId,
                    userName: paymentData.userName,
                    action: 'update',
                    fieldChanged: 'bonus_payment',
                    oldValue: 'payable',
                    newValue: 'paid',
                    reason: `Pagamento em lote ${batchId} via ${paymentData.method}`,
                    createdAt: timestamp,
                    metadata: {
                        bonusId: id,
                        batchId: batchId,
                        amount: data.bonusAmount,
                        method: paymentData.method
                    }
                };
                await addDoc(collection(db, 'order_logs'), log);
            }
        } catch (error) {
            console.error(`[BATCH ERROR] Failed to pay bonus ${id}:`, error);
            results.failed++;
        }
    }

    return { batchId, ...results };
};
