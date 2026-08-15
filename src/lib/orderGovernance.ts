import type { Order, StaffModel } from '../types';

/**
 * Define se a OS está bloqueada para edição operacional ou total.
 * (Ponto 1, 2, 7, 9)
 */
export const canEditOrderFields = (order: Order, profile?: StaffModel): boolean => {
    if (!profile) return false;

    const role = profile.role;
    const isAdmin = role === 'company_admin' || role === 'superadmin';

    // PONTO 10: BLOQUEIO POR CONTRATO (IMUTABILIDADE)
    // Se o contrato já foi enviado ou assinado, bloqueia edição para garantir integridade.
    if (order.contractStatus === 'signed' || order.contractStatus === 'viewed' || order.contractStatus === 'pending') {
        return false;
    }

    // PONTO 7: BLOQUEIO TOTAL POR STATUS FINAL
    // Se status for finalizado ou cancelado, bloqueia para todos.
    if (order.status === 'finalizado' || order.status === 'cancelado') {
        return false;
    }

    // PONTO 1: REGRA DE OPERAÇÃO
    // Se estiver em produção ou instalação, apenas admin edita com motivo.
    if (order.status === 'em_producao' || order.status === 'em_instalacao') {
        return isAdmin;
    }

    // Outros status (ex: aguardando_materia_prima, pausado) podem ter regras mais flexíveis
    return isAdmin; 
};

/**
 * Retorna mensagem de governança para o banner de topo.
 * (Ponto 8)
 */
export const getOrderLockMessage = (order: Order, profile?: StaffModel): string | null => {
    if (!profile) return null;

    if (order.contractStatus === 'signed') {
        return "Este pedido foi assinado digitalmente e os dados originais foram congelados.";
    }

    if (order.contractStatus === 'pending' || order.contractStatus === 'viewed') {
        const verb = order.contractStatus === 'pending' ? "enviado" : "visualizado";
        return `O contrato já foi ${verb} pelo cliente. Edições bloqueadas para segurança.`;
    }

    if (order.status === 'finalizado' || order.status === 'cancelado') {
        return "Esta ordem de serviço está encerrada e não pode mais ser alterada.";
    }

    if (!canEditOrderFields(order, profile)) {
        return "Esta ordem de serviço está bloqueada para edição operacional.";
    }

    return null;
};

/**
 * Nomes amigáveis para campos (Log)
 */
export const getFieldFriendlyName = (field: string): string => {
    const map: Record<string, string> = {
        'status': 'Status',
        'deadline': 'Prazo',
        'totalAmount': 'Valor Total',
        'items': 'Itens/Peças',
        'observations': 'Observações',
        'material': 'Material',
        'installerId': 'Instalador',
        'sawyerId': 'Serrador'
    };
    return map[field] || field;
};

/**
 * Define se um pedido é considerado legado (criado antes da era Contract-First)
 */
export const isLegacyOrder = (order: Order): boolean => {
    // Se tem contractId, definitivamente NÃO é legado (é do novo fluxo)
    if (order.contractId || (order as any).quoteId && order.contractStatus === 'signed') return false;
    
    // Se não tem contractId, verificamos a data de criação.
    // Consideramos "Legado" qualquer OS sem contrato criada antes de 24/04/2026
    const thresholdDate = new Date('2026-04-24T00:00:00Z');
    const createdAt = order.createdAt ? new Date(order.createdAt) : new Date();
    
    return createdAt < thresholdDate;
};

/**
 * Verifica se a OS segue o padrão Contract-First (tem contrato vinculado)
 */
export const isContractFirstOrder = (order: Order): boolean => {
    return !!(order.contractId || (order as any).quoteId && order.contractStatus === 'signed');
};

