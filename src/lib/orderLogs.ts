import { collection, addDoc } from 'firebase/firestore';
import { toISODateSafe } from './dateWriteUtils';
import { db } from './firebase';
import type { OrderLog } from '../types';

/**
 * Sanitiza recursivamente objetos, convertendo undefined para null
 */
const sanitizePayload = (obj: any): any => {
    if (obj === undefined) return null;
    if (obj === null) return null;
    if (Array.isArray(obj)) {
        return obj.map(sanitizePayload);
    }
    if (typeof obj === 'object') {
        const result: any = {};
        for (const key of Object.keys(obj)) {
            const val = obj[key];
            if (val !== undefined) {
                result[key] = sanitizePayload(val);
            } else {
                result[key] = null;
            }
        }
        return result;
    }
    return obj;
};

/**
 * Cria um registro no audit log da Ordem de Serviço
 */
export const createOrderLog = async (log: Omit<OrderLog, 'id' | 'createdAt'>) => {
    try {
        const sanitized = sanitizePayload(log);
        await addDoc(collection(db, 'order_logs'), {
            ...sanitized,
            createdAt: toISODateSafe(new Date())
        });
    } catch (error) {
        console.error('Error creating order log:', error);
    }
};
