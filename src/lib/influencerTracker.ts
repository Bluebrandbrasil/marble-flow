import { doc, getDoc, updateDoc, arrayUnion, runTransaction } from 'firebase/firestore';
import { db } from './firebase';
import { toISODateSafe } from './dateWriteUtils';

export async function trackInfluencerClosure({
    type,
    id,
    companyId
}: {
    type: 'quote' | 'contract';
    id: string;
    companyId: string;
}) {
    if (!id || !companyId) return;

    const collectionName = type === 'quote' ? 'orcamentos' : 'contratos';
    const docRef = doc(db, collectionName, id);

    try {
        await runTransaction(db, async (transaction) => {
            const docSnap = await transaction.get(docRef);
            if (!docSnap.exists()) {
                console.log(`[INFLUENCER TRACKER] Document ${id} not found in ${collectionName}`);
                return;
            }

            const data = docSnap.data();
            if (data.influencerCounted) {
                console.log(`[INFLUENCER TRACKER] Already counted for ${type} ${id}`);
                return;
            }

            // If it's a contract, check if the corresponding quote was already counted
            if (type === 'contract' && data.quoteId) {
                const quoteRef = doc(db, 'orcamentos', data.quoteId);
                const quoteSnap = await transaction.get(quoteRef);
                if (quoteSnap.exists() && quoteSnap.data().influencerCounted) {
                    console.log(`[INFLUENCER TRACKER] Quote ${data.quoteId} was already counted for contract ${id}`);
                    transaction.update(docRef, { influencerCounted: true });
                    return;
                }
            }

            // If it's a quote, check if the corresponding contract was already counted
            if (type === 'quote' && data.convertedToContractId) {
                const contractRef = doc(db, 'contratos', data.convertedToContractId);
                const contractSnap = await transaction.get(contractRef);
                if (contractSnap.exists() && contractSnap.data().influencerCounted) {
                    console.log(`[INFLUENCER TRACKER] Contract ${data.convertedToContractId} was already counted for quote ${id}`);
                    transaction.update(docRef, { influencerCounted: true });
                    return;
                }
            }

            // Check if there is an influencer linked
            const influencerId = data.influencerId;
            if (!influencerId) {
                console.log(`[INFLUENCER TRACKER] No influencer linked to ${type} ${id}`);
                return;
            }

            // Fetch influencer doc to get condominiumName
            const influencerRef = doc(db, 'influencers', influencerId);
            const influencerSnap = await transaction.get(influencerRef);
            if (!influencerSnap.exists()) {
                console.log(`[INFLUENCER TRACKER] Influencer ${influencerId} not found`);
                return;
            }

            const influencerData = influencerSnap.data();
            const condominiumName = influencerData.condominiumName || '';

            const totalAmount = data.commercialTotal || data.totalAmount || data.total || 0;
            const closedAt = toISODateSafe(new Date()) || new Date().toISOString();

            const historyEntry = {
                clientId: data.clientId || '',
                clientName: data.customerName || '',
                quoteId: type === 'quote' ? id : (data.quoteId || ''),
                orderId: type === 'contract' ? id : (data.convertedToContractId || ''),
                totalAmount,
                closedAt,
                condominiumName
            };

            // Increment values on influencer document
            transaction.update(influencerRef, {
                closedDealsCount: (influencerData.closedDealsCount || 0) + 1,
                closedDealsValue: (influencerData.closedDealsValue || 0) + totalAmount,
                lastClosedDealAt: closedAt,
                closedDealsHistory: arrayUnion(historyEntry)
            });

            // Mark the current document as counted
            transaction.update(docRef, { influencerCounted: true });

            // Sync counted status
            if (type === 'contract' && data.quoteId) {
                const quoteRef = doc(db, 'orcamentos', data.quoteId);
                transaction.update(quoteRef, { influencerCounted: true });
            }
            if (type === 'quote' && data.convertedToContractId) {
                const contractRef = doc(db, 'contratos', data.convertedToContractId);
                transaction.update(contractRef, { influencerCounted: true });
            }
        });
        console.log(`[INFLUENCER TRACKER] Successfully processed closure tracking for ${type} ${id}`);
    } catch (err) {
        console.error(`[INFLUENCER TRACKER ERROR] Failed to track influencer closure for ${type} ${id}:`, err);
    }
}
