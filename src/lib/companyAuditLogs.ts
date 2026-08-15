import { collection, addDoc } from 'firebase/firestore';
import { db } from './firebase';
import { toISODateSafe } from './dateWriteUtils';

export interface CompanyAuditLog {
    id?: string;
    companyId: string;
    userId: string;
    userName: string;
    userEmail: string;
    action: 'settings_updated';
    changedFields: string[];
    before: any;
    after: any;
    createdAt: string;
    source: 'settings_page';
}

/**
 * Identifica as diferenças entre dois objetos de configuração
 * e prepara o payload para o log de auditoria.
 */
export const diffCompanySettings = (before: any, after: any) => {
    const changedFields: string[] = [];
    const beforeClean: any = {};
    const afterClean: any = {};

    // Campos que não devem ter o conteúdo completo salvo no log por serem muito grandes
    const heavyFields = ['companySignature', 'logoUrl', 'contractTemplate', 'signature'];

    const allKeys = Array.from(new Set([...Object.keys(before || {}), ...Object.keys(after || {})]));

    allKeys.forEach(key => {
        // Ignorar campos de controle ou metadados se houver
        if (key === 'id' || key === 'updatedAt') return;

        const valBefore = before?.[key];
        const valAfter = after?.[key];

        // Se os valores forem iguais (comparação simples), ignora
        if (JSON.stringify(valBefore) === JSON.stringify(valAfter)) return;

        changedFields.push(key);

        if (heavyFields.includes(key)) {
            // Tratamento para campos pesados
            beforeClean[key] = {
                changed: true,
                previousLength: typeof valBefore === 'string' ? valBefore.length : (Array.isArray(valBefore) ? valBefore.length : 0),
                type: typeof valBefore
            };
            afterClean[key] = {
                changed: true,
                newLength: typeof valAfter === 'string' ? valAfter.length : (Array.isArray(valAfter) ? valAfter.length : 0),
                type: typeof valAfter
            };
        } else {
            // Campos normais salva o valor (se não for objeto muito complexo)
            beforeClean[key] = valBefore === undefined ? null : valBefore;
            afterClean[key] = valAfter === undefined ? null : valAfter;
        }
    });

    return {
        hasChanges: changedFields.length > 0,
        changedFields,
        before: beforeClean,
        after: afterClean
    };
};

/**
 * Registra um log de auditoria na coleção company_audit_logs
 */
export const createCompanyAuditLog = async (log: Omit<CompanyAuditLog, 'id' | 'createdAt'>) => {
    try {
        await addDoc(collection(db, 'company_audit_logs'), {
            ...log,
            createdAt: toISODateSafe(new Date())
        });
    } catch (error) {
        console.error('Error creating company audit log:', error);
    }
};
