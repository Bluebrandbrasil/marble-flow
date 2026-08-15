import { safeParseISO, compareDatesSafe } from './dateUtils';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from './firebase';
import type { Quote } from '../types';
import { getEffectiveWorkflowStage } from '../components/workflow/WorkflowStatus';
import { safeArray } from './dataDiagnostics';

/**
 * Busca todos os orçamentos válidos vinculados a um cliente específico.
 * Orçamentos válidos são aqueles com status: approved, sent, viewed, negotiating, waiting ou draft.
 * Orçamentos cancelados ou já convertidos podem ser filtrados conforme regra de negócio.
 */
export const getQuotesByClient = async (clientId: string): Promise<Quote[]> => {
    if (!clientId) return [];

    try {
        const quotesRef = collection(db, 'orcamentos');
        // Buscamos todos do cliente e filtramos no cliente para evitar índices compostos complexos no início
        // Mas o ideal é ordernar por data
        const q = query(
            quotesRef, 
            where('clientId', '==', clientId)
        );

        const snapshot = await getDocs(q);
        const quotes = safeArray(snapshot.docs).map(doc => ({
            id: doc.id,
            ...doc.data()
        } as Quote));

        // Sort in memory to avoid requiring a composite index from Firebase
        quotes.sort((a, b) => compareDatesSafe(a.createdAt, b.createdAt, 'desc'));

        // Centralized Filter using the Workflow Source of Truth
        // Include everything that isn't cancelled
        return safeArray(quotes).filter(quote => getEffectiveWorkflowStage(quote) !== 'cancelado');
    } catch (error) {
        console.error("Error fetching quotes by client:", error);
        return [];
    }
};
