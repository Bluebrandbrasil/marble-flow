/**
 * Safely sanitizes objects/arrays for Firestore by removing or replacing undefined values.
 * Preserves Firebase/Firestore sentinels (serverTimestamp, increment, deleteField, arrayUnion, arrayRemove).
 */
export const sanitizeForFirestore = (obj: any): any => {
    if (obj === undefined) return "";
    if (obj === null || typeof obj !== 'object') return obj;

    // Preserve FieldValue sentinels of Firebase (serverTimestamp, increment, deleteField, etc)
    if (obj._methodName || typeof obj.isEqual === 'function' || obj.type === 'FieldValue') {
        return obj;
    }

    if (Array.isArray(obj)) {
        return obj.map(item => sanitizeForFirestore(item));
    }

    const cleaned: any = {};
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            const val = obj[key];
            if (val === undefined) {
                // Determine fallbacks based on field types
                if (
                    [
                        'saleValue', 'materialCost', 'freightPercent', 'freightCost',
                        'assemblyPercent', 'assemblyCost', 'machineFeePercent', 'machineFeeAmount',
                        'totalOperationalCost', 'netResult', 'quantity', 'width', 'height', 'depth',
                        'unitCost', 'totalCost', 'deliveryFee', 'subtotal', 'discount', 'totalAmount',
                        'downPaymentAmount', 'remainingBalanceAmount', 'position'
                    ].includes(key)
                ) {
                    cleaned[key] = 0;
                } else if (['environments', 'modules', 'items', 'attachments', 'returnReasons'].includes(key)) {
                    cleaned[key] = [];
                } else if (['deleted', 'isDeleted', 'active', 'completed'].includes(key)) {
                    cleaned[key] = false;
                } else {
                    cleaned[key] = "";
                }
            } else {
                cleaned[key] = sanitizeForFirestore(val);
            }
        }
    }
    return cleaned;
};
