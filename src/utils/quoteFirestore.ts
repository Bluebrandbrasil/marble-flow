import { doc, updateDoc, addDoc, collection, arrayUnion, runTransaction, getDoc } from 'firebase/firestore';
import { toISODateSafe } from '../lib/dateWriteUtils';
import { db } from '../lib/firebase';

export type IntegrityEventType = 'SNAPSHOT_REPAIRED' | 'SNAPSHOT_INCOMPLETE' | 'STRUCTURAL_DIVERGENCE' | 'TOTAL_MISMATCH' | 'INTEGRITY_OK';

export interface IntegrityLog {
    quoteId: string;
    clientName: string;
    version: number;
    timestamp: string;
    type: IntegrityEventType;
    severity: 'info' | 'warning' | 'critical';
    details: string;
    triggeredBy: string; // 'system' or userId
    previousValues?: any;
    repairedValues?: any;
}

/**
 * [PROTOCOL ENGINE] - Geração Atômica de Numeração Sequencial (Rule #60)
 * Gera um novo número de protocolo baseado no contador da empresa.
 */
export const getNextQuoteProtocol = async (companyId: string, isPost: boolean) => {
    if (!companyId) throw new Error("companyId is required for protocol generation");
    
    const counterRef = doc(db, 'companies', companyId, 'counters', 'quotes');
    const currentYear = new Date().getFullYear();
    
    try {
        const result = await runTransaction(db, async (transaction) => {
            const counterSnap = await transaction.get(counterRef);
            let nextNumber = 1;
            
            if (counterSnap.exists()) {
                const data = counterSnap.data();
                // Se o ano mudou, resetamos o contador para 1
                if (data.year === currentYear) {
                    nextNumber = (data.lastNumber || 0) + 1;
                }
            }
            
            transaction.set(counterRef, {
                year: currentYear,
                lastNumber: nextNumber
            }, { merge: true });
            
            const prefix = isPost ? 'POS' : 'PRE';
            const formattedNumber = String(nextNumber).padStart(6, '0');
            
            return {
                protocolNumber: `${prefix}-${currentYear}-${formattedNumber}`,
                baseNumber: nextNumber,
                year: currentYear
            };
        });
        
        return result;
    } catch (err) {
        console.error("[PROTOCOL ERROR] Falha ao gerar numeração sequencial:", err);
        // Fallback seguro em caso de falha na transação para não travar o app
        const random = Math.floor(Math.random() * 1000);
        return {
            protocolNumber: `ERR-${currentYear}-${random}`,
            baseNumber: random,
            year: currentYear
        };
    }
};

/**
 * Registra um evento de integridade no sistema global de auditoria.
 */
export const logIntegrityEvent = async (log: IntegrityLog) => {
    try {
        // 1. Log Global
        const logRef = collection(db, 'integrityLogs');
        await addDoc(logRef, {
            ...log,
            createdAt: toISODateSafe(new Date())
        });

        // 2. Log na Timeline do Orçamento (Se aplicável)
        const quoteRef = doc(db, 'orcamentos', log.quoteId);
        await updateDoc(quoteRef, {
            history: arrayUnion({
                type: 'integrity_event',
                action: log.type,
                description: log.details,
                timestamp: log.timestamp,
                user: log.triggeredBy,
                severity: log.severity
            })
        });

        console.log(`[INTEGRITY LOG] ${log.type} registrado para ${log.quoteId}`);
        return true;
    } catch (err) {
        console.error('[INTEGRITY LOG] Erro ao registrar evento:', err);
        return false;
    }
};

/**
 * Persiste a correção de total no Firestore de forma segura.
 */
export const updateQuoteTotalInFirestore = async (quoteId: string, correctedTotal: number) => {
    if (!quoteId || quoteId === 'unknown' || correctedTotal <= 0) return false;

    try {
        console.log(`[DATA FIX] Iniciando correção para orçamento ${quoteId}...`);
        const quoteRef = doc(db, 'orcamentos', quoteId);

        await updateDoc(quoteRef, {
            total: correctedTotal,
            totalAmount: correctedTotal,
            updatedAt: toISODateSafe(new Date()),
            _autoFixedAt: toISODateSafe(new Date()),
        });

        return true;
    } catch (err) {
        console.error(`[DATA FIX] Erro ao persistir correção para ${quoteId}:`, err);
        return false;
    }
};

