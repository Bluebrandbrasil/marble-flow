import { safeArray } from '../lib/dataDiagnostics';
import { safeParseISO } from '../lib/dateUtils';
import { useState, useEffect } from 'react';
import { 
    collection, 
    addDoc, 
    query, 
    where,
    orderBy, 
    onSnapshot, 
    limit, 
    Timestamp,
    serverTimestamp 
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { differenceInDays, startOfDay } from 'date-fns';
import { useAuth } from '../context/AuthContext';

export interface IncidentLog {
    id: string;
    type: 'avaria' | 'erro' | 'atraso';
    date: Date;
    description: string;
    orderId?: string;
    customerName?: string;
    createdAt: any;
}

export const useIncidents = () => {
    const { profile } = useAuth();
    const [incidents, setIncidents] = useState<IncidentLog[]>([]);

    useEffect(() => {
        if (!profile?.companyId) return;

        const q = query(
            collection(db, 'operational_logs'), 
            where('companyId', '==', profile.companyId),
            orderBy('date', 'desc'), 
            limit(50)
        );
        
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const docs = safeArray(snapshot.docs).map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    ...data,
                    date: data.date instanceof Timestamp ? data.date.toDate() : safeParseISO(data.date),
                } as IncidentLog;
            });
            setIncidents(docs);
        }, (error) => {
            console.error("Error in onSnapshot for operational_logs:", error);
        });

        return () => unsubscribe();
    }, [profile?.companyId]);

    const addIncident = async (log: Omit<IncidentLog, 'id' | 'createdAt'>) => {
        if (!profile?.companyId) return;
        try {
            await addDoc(collection(db, 'operational_logs'), {
                ...log,
                companyId: profile.companyId,
                date: Timestamp.fromDate(log.date),
                createdAt: serverTimestamp()
            });
        } catch (error) {
            console.error("Error adding incident log: ", error);
        }
    };

    const stats = (() => {
        if (incidents.length === 0) {
            return {
                daysSince: 14,
                latestDate: null,
                status: 'green' as const
            };
        }

        const latest = incidents[0].date;
        const today = new Date();
        const diff = differenceInDays(startOfDay(today), startOfDay(latest));

        let status: 'green' | 'yellow' | 'red' = 'green';
        if (diff === 0) {
            status = 'red';
        } else if (diff < 5) {
            status = 'yellow';
        }

        return {
            daysSince: diff,
            latestDate: latest,
            status
        };
    })();

    return {
        incidents,
        addIncident,
        stats
    };
};
