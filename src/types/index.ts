export type Priority = 'low' | 'medium' | 'high';
export type Status = 'production_queue' | 'production' | 'ready_for_conference' | 'installation' | 'finished';

export interface OrderItem {
    id: string;
    name: string; // e.g., Pia de Cozinha
    completed: boolean;
}

export interface Order {
    id: string;
    customerName: string;
    material: string; // e.g., Quartzo, Granito
    deadline: string; // ISO date string
    priority: Priority;
    status: Status;
    phone: string;
    address: string;
    totalValue?: number; // Made optional as per request
    items: OrderItem[];
    protocolNumber: string;
    createdAt: string;
    installerName?: string;
    completionStatus?: 'success' | 'return';
    returnReasons?: string[];
    returnObservations?: string;
    completionDate?: string;
    isReturn?: boolean;
    splashback?: string; // Frontão
    skirt?: string; // Saia
    observations?: string; // Observações
    sinkId?: string; // ID da cuba selecionada
    sinkName?: string; // Nome da cuba (desnormalizado para facilitar)
    sinkPhotoUrl?: string; // Foto da cuba (desnormalizado)
    sinkType?: string; // Tipo da cuba
    sawyerId?: string;
    sawyerName?: string;
    accessories?: AccessoryModel[]; // Multi-select support
    conferenceChecklist?: Record<string, boolean>; // Status dos itens conferidos
    isInternalReturn?: boolean; // Flag para retorno de avaria (refazer)
    remakeItem?: 'Base' | 'Frontão' | 'Cuba'; // Peça a refazer
    remakeReason?: string; // Motivo da avaria na conferência
    remakeDate?: string; // Data solicitada para o refugo
    attachments?: string[]; // Array de URLs de imagens/pdfs
}

export interface AccessoryModel {
    id: string;
    name: string;
    cutMeasurement: string;
    photoUrl?: string;
}

export interface SinkModel {
    id: string;
    name: string;
    photoUrl: string;
    type?: string;
}

export interface MaterialModel {
    id: string;
    name: string;
    type: string;
    thickness: string;
}

export interface StaffModel {
    id: string;
    name: string;
    role: string;
}

export type ColumnType = {
    id: Status;
    title: string;
};

export interface Measurement {
    id: string;
    customerName: string;
    phone: string;
    address: string;
    scheduledDate: string; // ISO format YYYY-MM-DD
    scheduledTime?: string; // HH:MM
    material?: string;
    observations: string;
    status: 'scheduled' | 'completed' | 'declined';
    declineReason?: string;
    city?: string;
    region?: string;
    attachments?: string[]; // Array de URLs de imagens/pdfs
    createdAt: string;
}
