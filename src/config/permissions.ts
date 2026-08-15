import { safeArray } from '../lib/dataDiagnostics';
import type { ViewType } from '../types';

export type Permission =
    | '*'
    | 'clients:create'
    | 'clients:edit'
    | 'clients:delete'
    | 'clients:restore'
    | 'clients:view_deleted'
    | 'clients:view'
    | 'budgets:create'
    | 'budgets:edit'
    | 'budgets:view'
    | 'measurements:create'
    | 'measurements:edit'
    | 'measurements:view'
    | 'staff:manage'
    | 'production:view'
    | 'production:manage'
    | 'settings:manage'
    | 'companies:manage';

export const ROLE_PERMISSIONS: Record<string, Permission[]> = {
    superadmin: ['*'],
    company_admin: ['*'],
    vendedor: [
        'clients:create',
        'clients:edit',
        'clients:view',
        'budgets:create',
        'budgets:edit',
        'budgets:view',
        'measurements:create',
        'measurements:edit',
        'measurements:view',
        'production:view',
        'production:manage'
    ],
    financeiro: [
        'clients:view',
        'budgets:view',
        '*' // We'll assume financeiro can see everything, or refine later
    ],
    medidor: [
        'measurements:view',
        'measurements:edit'
    ],
    instalador: [
        'production:view'
    ],
    producao: [
        'production:view',
        'production:manage'
    ],
    outro: []
};

export function canAccess(role: string | undefined, permission: Permission): boolean {
    if (!role) return false;
    const permissions = ROLE_PERMISSIONS[role] || [];
    if (permissions.includes('*')) return true;
    return permissions.includes(permission);
}

export function canAccessAny(role: string | undefined, permissions: Permission[]): boolean {
    if (!role) return false;
    return safeArray(permissions).some(p => canAccess(role, p));
}

export function canAccessRoute(role: string | undefined, route: ViewType): boolean {
    if (!role) return false;
    if (role === 'superadmin') return true;

    switch (role) {
        case 'vendedor':
        case 'seller':
            // VENDEDOR/SELLER: Acessa todo o fluxo comercial e operacional, exceto FINANCEIRO e STAFF (RH)
            return [
                'home', 'clients', 'measurements', 'quotes', 'reports', 
                'settings', 'influencers', 'contracts', 'dashboard', 
                'orders', 'calendar', 'medicoes_hoje', 'intelligence', 'quick_sales', 'planned_projects', 'store_visits'
            ].includes(route);
        case 'financeiro':
            // FINANCEIRO: Acessa tudo que for financeiro e visualização operacional básica
            return ['home', 'financial', 'reports', 'clients', 'quotes', 'contracts', 'intelligence', 'quick_sales', 'store_visits'].includes(route);
        case 'admin':
        case 'company_admin':
            return true;
        case 'medidor':
            // MEDIDOR: Acessa apenas fluxo de medição e calendário
            return ['calendar', 'measurements', 'medicoes_hoje'].includes(route);
        case 'instalador':
        case 'producao':
            return ['home', 'dashboard', 'orders', 'reports'].includes(route);
        default:
            return ['home'].includes(route);
    }
}
