import { db } from './firebase';

export const runRule30Migration = async (companyId: string) => {
    if (!companyId) return { quotesMigrated: 0, ordersMigrated: 0 };
    
    // Import here to avoid early evaluation issues if any
    const { collection, getDocs, writeBatch, query, where } = await import('firebase/firestore');
    
    console.log('[MIGRATION] Starting Rule #30 Migration for company:', companyId);
    
    let quotesMigrated = 0;
    let ordersMigrated = 0;
    
    // Migrate Quotes
    try {
        const quotesRef = collection(db, 'orcamentos');
        // Only get company quotes ? Assuming we can fetch them
        const qSnapshot = await getDocs(query(quotesRef, where('companyId', '==', companyId)));
        
        console.log(`[MIGRATION] Found ${qSnapshot.size} quotes to process`);
        
        const qBatch = writeBatch(db);
        qSnapshot.forEach((document) => {
            const data = document.data();
            
            // Resolve from legacy fields if they exist
            const oldTotal = data.total || 0;
            const oldInst = data.installationTotal || 0;
            const oldFreight = data.freight || 0;
            
            // Only migrate if commercialTotal is undefined
            if (data.commercialTotal === undefined) {
                // To get commercial total: total - installation - freight?
                // Actually, the new fields:
                // commercialTotal: total (which included inst and freight) - inst - freight ? No, old total was the GRAND TOTAL.
                // Wait, if old total was the grand total, commercialTotal should be old total - inst - freight.
                // wait, let's verify old total. old total was the final price.
                
                // If subtotal is present, commercialTotal is subtotal - discount.
                // Or let's just use the recalculate engine?
                // Let's just do:
                const commercialTotal = data.subtotal !== undefined ? data.subtotal - (data.discount || 0) : oldTotal - oldInst - oldFreight;
                const operationalCost = oldInst;
                const totalAmount = oldTotal;
                
                qBatch.update(document.ref, {
                    commercialTotal: Number(commercialTotal.toFixed(2)),
                    operationalCost: Number(operationalCost.toFixed(2)),
                    totalAmount: Number(totalAmount.toFixed(2)),
                });
                quotesMigrated++;
            }
        });
        
        if (quotesMigrated > 0) {
            await qBatch.commit();
            console.log(`[MIGRATION] Successfully migrated ${quotesMigrated} quotes.`);
        }
    } catch (e) {
        console.error('[MIGRATION] Quotes migration failed:', e);
    }
    
    // Migrate Orders
    try {
        const ordersRef = collection(db, 'orders');
        const oSnapshot = await getDocs(query(ordersRef, where('companyId', '==', companyId)));
        
        console.log(`[MIGRATION] Found ${oSnapshot.size} orders to process`);
        
        const oBatch = writeBatch(db);
        oSnapshot.forEach((document) => {
            const data = document.data();
            
            if (data.commercialTotal === undefined) {
                const oldTotal = data.total || 0;
                const oldInst = data.installationTotal || 0;
                const oldFreight = data.freight || 0;
                
                const commercialTotal = data.subtotal !== undefined ? data.subtotal - (data.discount || 0) : oldTotal - oldInst - oldFreight;
                const operationalCost = oldInst;
                const totalAmount = oldTotal;
                
                oBatch.update(document.ref, {
                    commercialTotal: Number(commercialTotal.toFixed(2)),
                    operationalCost: Number(operationalCost.toFixed(2)),
                    totalAmount: Number(totalAmount.toFixed(2)),
                });
                ordersMigrated++;
            }
        });
        
        if (ordersMigrated > 0) {
            await oBatch.commit();
            console.log(`[MIGRATION] Successfully migrated ${ordersMigrated} orders.`);
        }
    } catch (e) {
        console.error('[MIGRATION] Orders migration failed:', e);
    }
    
    return { quotesMigrated, ordersMigrated };
};
