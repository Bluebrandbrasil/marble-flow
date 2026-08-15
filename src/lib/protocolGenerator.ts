import { db } from './firebase';
import { doc, runTransaction, increment } from 'firebase/firestore';

/**
 * GENERATION STRATEGY: OS-YYYY-XXXXXX
 * Human readable, sequential, and transaction-guaranteed unique within the company.
 */
export const getNextProtocolNumber = async (companyId: string): Promise<string> => {
    if (!companyId) throw new Error('Company ID is required for protocol generation.');

    const counterRef = doc(db, 'companies', companyId, 'counters', 'orders');
    const currentYear = new Date().getFullYear();

    try {
        const protocol = await runTransaction(db, async (transaction) => {
            const counterSnap = await transaction.get(counterRef);
            
            let nextIndex = 1;
            if (counterSnap.exists()) {
                const data = counterSnap.data();
                // Reset counter if year changed (Optional, but useful for clean yearly blocks)
                if (data.lastYear === currentYear) {
                    nextIndex = (data.lastIndex || 0) + 1;
                }
            }

            transaction.set(counterRef, {
                lastIndex: nextIndex,
                lastYear: currentYear
            }, { merge: true });

            const paddedIndex = String(nextIndex).padStart(6, '0');
            return `OS-${currentYear}-${paddedIndex}`;
        });

        return protocol;
    } catch (error) {
        console.error('[PROTOCOL_GENERATOR] Error generating unique sequence:', error);
        // Fallback to random if transaction fails (UX safety), 
        // but adding a 'F-' prefix to identify failure in logs.
        const fallbackRandom = Math.floor(100000 + Math.random() * 900000);
        return `OS-${currentYear}-F${fallbackRandom}`;
    }
};

export const getNextQuickSaleProtocolNumber = async (companyId: string): Promise<string> => {
    if (!companyId) throw new Error('Company ID is required for protocol generation.');

    const counterRef = doc(db, 'companies', companyId, 'counters', 'quick_sales');
    const currentYear = new Date().getFullYear();

    try {
        const protocol = await runTransaction(db, async (transaction) => {
            const counterSnap = await transaction.get(counterRef);
            
            let nextIndex = 1;
            if (counterSnap.exists()) {
                const data = counterSnap.data();
                if (data.lastYear === currentYear) {
                    nextIndex = (data.lastIndex || 0) + 1;
                }
            }

            transaction.set(counterRef, {
                lastIndex: nextIndex,
                lastYear: currentYear
            }, { merge: true });

            const paddedIndex = String(nextIndex).padStart(6, '0');
            return `VR-${currentYear}-${paddedIndex}`;
        });

        return protocol;
    } catch (error) {
        console.error('[PROTOCOL_GENERATOR] Error generating unique sequence for quick sale:', error);
        const fallbackRandom = Math.floor(100000 + Math.random() * 900000);
        return `VR-${currentYear}-F${fallbackRandom}`;
    }
};

export const getNextPlannedProjectProtocolNumber = async (companyId: string): Promise<string> => {
    if (!companyId) throw new Error('Company ID is required for protocol generation.');

    const counterRef = doc(db, 'companies', companyId, 'counters', 'planned_projects');
    const currentYear = new Date().getFullYear();

    try {
        const protocol = await runTransaction(db, async (transaction) => {
            const counterSnap = await transaction.get(counterRef);
            
            let nextIndex = 1;
            if (counterSnap.exists()) {
                const data = counterSnap.data();
                if (data.lastYear === currentYear) {
                    nextIndex = (data.lastIndex || 0) + 1;
                }
            }

            transaction.set(counterRef, {
                lastIndex: nextIndex,
                lastYear: currentYear
            }, { merge: true });

            const paddedIndex = String(nextIndex).padStart(6, '0');
            return `PL-${currentYear}-${paddedIndex}`;
        });

        return protocol;
    } catch (error) {
        console.error('[PROTOCOL_GENERATOR] Error generating unique sequence for planned project:', error);
        const fallbackRandom = Math.floor(100000 + Math.random() * 900000);
        return `PL-${currentYear}-F${fallbackRandom}`;
    }
};

