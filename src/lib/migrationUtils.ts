import { 
    collection, 
    getDocs, 
    getDoc,
    writeBatch, 
    doc, 
    query, 
    where,
    limit 
} from 'firebase/firestore';
import { db } from './firebase';

interface MigrationStats {
    totalRead: number;
    totalMigrated: number;
    totalIgnored: number;
    errors: string[];
}

interface CollectionMigrationResult {
    collection: string;
    stats: MigrationStats;
}

/**
 * Script de Migração One-off para o Catálogo Multi-tenant
 * @param dryRun Se true, apenas simula a migração e gera logs
 */
export async function migrateCatalogData(dryRun: boolean = true): Promise<CollectionMigrationResult[]> {
    console.log(`[MIGRATION] Iniciando migração (Modo: ${dryRun ? 'DRY-RUN' : 'EXECUÇÃO REAL'})`);
    
    const mapping = [
        { old: 'catalogo_pedras', new: 'stones', label: 'Pedras' },
        { old: 'catalogo_servicos', new: 'services', label: 'Serviços' },
        { old: 'catalogo_cubas', new: 'sinks', label: 'Cubas' },
        { old: 'catalogo_acessorios', new: 'accessories', label: 'Acessórios' }
    ];

    const results: CollectionMigrationResult[] = [];
    const userCompanyCache: Record<string, string> = {};

    for (const map of mapping) {
        const stats: MigrationStats = { totalRead: 0, totalMigrated: 0, totalIgnored: 0, errors: [] };
        console.log(`[MIGRATION] Processando: ${map.old} -> ${map.new}`);

        try {
            const oldSnap = await getDocs(collection(db, map.old));
            stats.totalRead = oldSnap.size;

            const batch = writeBatch(db);
            let batchCount = 0;

            for (const oldDoc of oldSnap.docs) {
                const data = oldDoc.data();
                const userId = data.userId;

                if (!userId) {
                    stats.errors.push(`Doc ${oldDoc.id} ignorado: userId não encontrado.`);
                    stats.totalIgnored++;
                    continue;
                }

                // Resolver companyId (com cache)
                let companyId = userCompanyCache[userId];
                if (!companyId) {
                    const userSnap = await getDoc(doc(db, 'users', userId));
                    if (userSnap.exists()) {
                        companyId = userSnap.data()?.companyId;
                        if (companyId) userCompanyCache[userId] = companyId;
                    }
                }

                if (!companyId || companyId === 'unassigned') {
                    stats.errors.push(`Doc ${oldDoc.id} ignorado: companyId não resolvido para o usuário ${userId}.`);
                    stats.totalIgnored++;
                    continue;
                }

                // Verificar duplicidade no destino (Mesmo nome na mesma empresa)
                const existsQuery = query(
                    collection(db, map.new), 
                    where('companyId', '==', companyId), 
                    where('name', '==', data.name || data.title || '')
                );
                const existsSnap = await getDocs(existsQuery);

                if (!existsSnap.empty) {
                    stats.totalIgnored++;
                    // Silenciosamente ignora duplicatas
                    continue;
                }

                // Preparar dados para nova estrutura
                const newDocData = {
                    ...data,
                    name: data.name || data.title || 'Sem Nome',
                    companyId: companyId,
                    userId: userId,
                    createdAt: data.createdAt || new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    migratedFrom: map.old,
                    legacyId: oldDoc.id,
                    migratedAt: new Date().toISOString()
                };

                // Limpar campos de nomes antigos se existirem
                if (newDocData.title) delete newDocData.title;

                if (!dryRun) {
                    const newDocRef = doc(collection(db, map.new));
                    batch.set(newDocRef, newDocData);
                    batchCount++;

                    // Commit parcial se o batch ficar muito grande (Limite Firestore: 500)
                    if (batchCount >= 400) {
                        await batch.commit();
                        batchCount = 0;
                    }
                } else {
                    batchCount++;
                }

                stats.totalMigrated++;
            }

            if (!dryRun && batchCount > 0) {
                await batch.commit();
            }

            console.log(`[MIGRATION] Finalizado ${map.label}: ${stats.totalMigrated} migrados.`);

        } catch (error: any) {
            console.error(`[MIGRATION] Erro fatal na coleção ${map.old}:`, error);
            stats.errors.push(`Erro fatal: ${error.message}`);
        }

        results.push({ collection: map.label, stats });
    }

    return results;
}
