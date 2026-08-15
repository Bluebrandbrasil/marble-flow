import type { StaffModel } from '../types';

/**
 * Normaliza o nome do funcionário para uso em pesquisas e exibição.
 */
export const getEmployeeDisplayName = (employee: any): string => {
    if (!employee) return '';
    return employee.displayName || employee.name || employee.fullName || 'Funcionário sem nome';
};

/**
 * Verifica se um funcionário está ativo e elegível para ser atribuído a uma instalação.
 */
export const isEligibleForInstallationAssignment = (employee: any, currentCompanyId?: string): boolean => {
    if (!employee) return false;
    
    // 1. Isolamento multi-empresa (fallback extra se a consulta não filtrou)
    if (currentCompanyId && employee.companyId && employee.companyId !== currentCompanyId) {
        return false;
    }

    // 2. Filtro de status e exclusão
    if (employee.deleted === true || employee.archived === true) return false;
    if (employee.active === false) return false;
    if (employee.status === 'rejected' || employee.status === 'disabled') return false;
    
    // Na coleção 'users', o normal é 'approved'.
    if (employee.status && !['approved', 'active', 'ativo'].includes(employee.status)) {
       return false; 
    }

    // 3. Filtro de Função (Role)
    const normalizedRole = (employee.role || '').toLowerCase().trim();
    
    // Se tiver permissão explícita (caso seja adicionado futuramente ao modelo)
    if (employee.canInstall === true || employee.installationEnabled === true) return true;

    // Funções elegíveis no Marble Flow
    const INSTALLATION_ELIGIBLE_ROLES = new Set([
        'instalador',
        'installer',
        'producao',
        'produção',
        'production',
        'serrador',
        'acabador',
        'fabricator',
        'operator',
        'operational'
    ]);

    return INSTALLATION_ELIGIBLE_ROLES.has(normalizedRole);
};
