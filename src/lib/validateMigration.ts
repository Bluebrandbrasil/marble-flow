import { collection, getDocs } from 'firebase/firestore';
import { db } from './firebase';
import { safeArray } from './dataDiagnostics';

export async function validateMigrationState() {
    const collections = ['stones', 'services', 'sinks', 'accessories'];
    const report: any = {};

    for (const col of collections) {
        const snap = await getDocs(collection(db, col));
        const docs = safeArray(snap.docs).map(d => ({ id: d.id, ...d.data() }));
        report[col] = {
            count: snap.size,
            samples: docs.slice(0, 2)
        };
    }

    console.log('--- Migration Validation Report ---');
    console.log(JSON.stringify(report, null, 2));
    return report;
}
