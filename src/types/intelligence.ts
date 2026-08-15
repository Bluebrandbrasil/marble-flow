export interface CommercialAction {
    id: string;
    companyId: string;
    type: 'reativacao' | 'followup' | 'oportunidade' | 'observacao';
    sourceType: 'alerta' | 'historico' | 'manual';
    sourceId: string;
    influencerId?: string;
    influencerName?: string;
    title: string;
    description: string;
    priority: 'low' | 'medium' | 'high' | 'critical';
    status: 'open' | 'in_progress' | 'done' | 'canceled';
    dueDate?: string;
    createdAt: string;
    createdBy: string;
    completedAt?: string;
    notes?: string;
    // Loop de Performance
    resultLeads?: number;
    resultSales?: number;
    resultConversion?: number;
    resultRevenue?: number;
    resultDeltaPercent?: number;
    resultStatus?: 'success' | 'neutral' | 'failure';
}
