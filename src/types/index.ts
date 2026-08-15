export type Priority = 'low' | 'medium' | 'high';
export type Status = 'em_contrato' | 'em_producao' | 'em_instalacao' | 'finalizado' | 'cancelado' | 'aguardando_materia_prima' | 'pausado' | 'production_queue' | 'production' | 'ready_for_conference' | 'installation' | 'finished' | 'cancelled';

export interface OrderLog {
    id: string;
    orderId: string;
    companyId: string;
    userId: string;
    userName: string;
    action: 'create' | 'update' | 'status_change' | 'cancel' | 'reopen' | 'contract_revoked';
    fieldChanged?: string;
    oldValue?: any;
    newValue?: any;
    reason?: string;
    createdAt: string;
    source?: string;
    metadata?: Record<string, any>;
}

export interface OrderItem {
    id: string;
    name: string; // e.g., Pia de Cozinha
    completed: boolean;
    width?: number;
    length?: number;
    area?: number;
    finishings?: string;
    material?: string;
    pieceType?: string;
    quantity?: number;
    unit?: string;
    unitPrice?: number;
    totalPrice?: number;
    environment?: string;
    productionStatus?: 'pendente' | 'em_producao' | 'finalizado' | 'instalado';
    checklist?: {
        corte: boolean;
        acabamento: boolean;
        conferencia: boolean;
        instalado: boolean;
    };
}

export interface FinancialEvent {
    id: string;
    type: 'income' | 'expense' | 'reversal' | 'discount' | 'adjustment' | 'payment' | 'partial_payment';
    date: string; // ISO string - Data do recebimento real
    amount: number;
    paymentMethod: string;
    source: 'manual_baixa' | 'contract_down_payment' | 'settlement' | 'legacy' | 'adjustment';
    userId?: string;
    userName?: string;
    notes?: string;
    createdAt: string; // ISO string - Data do registro no sistema
    referenceEventId?: string; // Para vincular estornos ao evento original
}

export interface PaymentInstallment {
    label: string;
    percentage: number;
    amount: number;
    dueType: 'imediato' | 'entrega' | 'data';
    dueDate?: string;
    paymentMethod?: 'pix' | 'dinheiro' | 'debito' | 'credito' | 'boleto' | 'transferencia' | 'a_combinar';
    paymentMethodLabel?: string;
}

export interface PaymentConditions {
    type: 'avista' | 'parcelado' | 'personalizado';
    installments: PaymentInstallment[];
    method?: string; // PIX, Dinheiro, Transferencia, Cartao
    notes?: string;
    interest?: {
        enabled: boolean;
        percentage: number;
        amount: number;
    };
}

export interface Order {
    id: string;
    clientId?: string;
    quoteId?: string;
    measurementId?: string;
    customerName: string;
    material: string; // e.g., Quartzo, Granito
    deadline: string; // ISO date string
    priority: Priority;
    status: Status;
    phone: string;
    address: string;
    totalAmount?: number; // INVESTIMENTO TOTAL (Commercial + Operational + Logistics)
    downPayment?: number; // Valor de Entrada (Sinal)
    paymentMethod?: string; // Forma de Pagamento
    balance?: number; // Saldo Devedor
    paymentStatus?: 'pending' | 'partial' | 'paid'; // Controle do Radar
    paymentDate?: string; // Data da quitação total
    items: OrderItem[];
    protocolNumber: string;
    createdAt: string;

    // Client Data Synchronization
    clientName?: string;
    clientPhone?: string;
    clientWhatsapp?: string;
    clientEmail?: string;
    clientDocument?: string;
    clientCpfCnpj?: string;
    clientAddress?: string;
    clientStreet?: string;
    clientNumber?: string;
    clientComplement?: string;
    clientNeighborhood?: string;
    clientCity?: string;
    clientState?: string;
    clientZipCode?: string;
    clientCep?: string;
    clientSnapshot?: any;
    contractSignedSnapshot?: any;
    clientSyncedAt?: string;
    clientSyncedFrom?: string;
    clientSyncedFields?: string[];

    // Production assignment
    installerId?: string;
    installerName?: string;
    installationStatus?: 'aguardando_definicao' | 'agendado' | 'instalado' | 'problema';
    sawyerId?: string;
    sawyerName?: string;
    cutterId?: string;
    cutterName?: string;
    finisherId?: string;
    finisherName?: string;
    estimatedSawyerTime?: number; // em minutos
    productionDeadline?: string; // ISO date - Data interna da fábrica
    installationDate?: string; // ISO date - Data prometida ao cliente
    deliveryDate?: string; // ISO date - Alias para installationDate
    scheduledDate?: string; // ISO date - Alias para installationDate
    completionStatus?: 'success' | 'return';
    returnReasons?: string[];
    returnObservations?: string;
    finalProductionSnapshot?: any;
    
    productionStartedAt?: string; // ISO date
    productionCompletedAt?: string;
    installationStartedAt?: string;
    installationCompletedAt?: string;
    finalizedAt?: string;
    finalizedBy?: string;
    reopenedAt?: string;
    reopenedBy?: string;
    reopenReason?: string;
    cycleCount?: number;
    
    // Search indexes
    orderNumberNormalized?: string;
    contractNumberNormalized?: string;
    clientNameNormalized?: string;
    searchTerms?: string[];
    
    // Legacy / Fallback
    productionStartDate?: string;
    installationStartDate?: string;
    completionDate?: string;

    isReturn?: boolean;
    splashback?: string; // Frontão
    skirt?: string; // Saia
    observations?: string; // Observações
    sinkId?: string; // ID da cuba selecionada
    sinkName?: string; // Nome da cuba (desnormalizado para facilitar)
    sinkPhotoUrl?: string;
    sinkType?: string;
    accessories?: AccessoryModel[]; // Multi-select support
    conferenceChecklist?: Record<string, boolean>; // Status dos itens conferidos
    isInternalReturn?: boolean; // Flag para retorno de avaria (refazer)
    remakeItem?: 'Base' | 'Frontão' | 'Cuba'; // Peça a refazer
    remakeReason?: string; // Motivo da avaria na conferência
    remakeDate?: string; // Data solicitada para o refugo
    attachments?: string[]; // Array de URLs de imagens/pdfs
    clientSignature?: string; // Assinatura Digital (Base64)
    influencerId?: string;
    influencerName?: string;
    referralCode?: string;
    origin?: string;
    influencerCounted?: boolean;
    userId: string;
    companyId: string;
    updatedAt?: string;
    document?: string;
    freight?: number;
    discount?: number;

    /** @deprecated Rule #30 Law: Use commercialTotal + operationalCost */
    installationTotal?: number;
    /** @deprecated Rule #30 Law: Use commercialTotal + operationalCost */
    total?: number;

    commercialTotal?: number; // Receita (Pedras + Serviços - Desconto)
    operationalCost?: number; // Investimento Técnico (Linear + Manual)
    
    linearInstallationTotal?: number;
    manualInstallationTotal?: number;
    pendingMeasurementCheck?: boolean;
    paymentConditions?: PaymentConditions;
    installments?: number;
    interestRate?: number;
    paymentDiscount?: number;
    cancellationReason?: string;
    cancellationObservation?: string;
    amountRefunded?: number;
    cancellationDate?: string;
    dueDate?: string; // Vencimento financeiro
    financialHistory?: FinancialEvent[]; // Linha do tempo financeira do pedido
    position?: number;
    sellerId?: string;
    sellerName?: string;
    
    // Digital Signature & Lifecycle Tracking
    companySignedAt?: string;
    companySignatureData?: {
        name: string;
        document: string;
        ip: string;
        timestamp: string;
        image: string; // Base64 of the canvas
    };

    signatureToken?: string;
    signatureExpiresAt?: string;
    signedAt?: string;
    contractStatus?: 'draft' | 'company_signed' | 'pending' | 'viewed' | 'signed' | 'expired';
    contractSentAt?: string;
    contractViewedAt?: string;
    signatureData?: {
        name: string;
        document: string;
        ip: string;
        timestamp: string;
        image: string; // Base64 of the canvas
    };

    history?: {
        date: string;
        action: string;
        user?: string;
        severity?: 'info' | 'warning' | 'critical';
    }[];
    collectionHistory?: {
        action: string;
        timestamp: string;
        note?: string;
        userId?: string;
    }[];
    collectionStatus?: 'pending' | 'charged' | 'negotiating' | 'promise' | 'paid';
    closureDetails?: string;
    lastReturnDate?: string;
    lastReturnReason?: string;
    lastInternalReturnItem?: string;
    lastInternalReturnReason?: string;
    conferenceCompleted?: boolean;
    conferenceDate?: string;
    isPostMeasurement?: boolean;
    version?: number;
}

export interface Contract extends Omit<Order, 'status' | 'protocolNumber'> {
    orderId?: string; // Reference to created OS
    osGeneratedAt?: string;
    osGeneratedBy?: string;
    contractSnapshot?: any;
    customClauses?: string[];
    contractSignatureCompany?: string;
    status?: Status;
    protocolNumber?: string;
}

export interface CommercialGovernanceSettings {
    maxDiscountSeller: number; // e.g. 5
    maxDiscountManager: number; // e.g. 10
    maxDiscountAdmin: number; // e.g. 20
    alertOnLowMargin: boolean;
    marginThreshold: number; // e.g. 25
    enablePostSaleAlerts: boolean;
    alertThresholdDiscount: number; // e.g. 15
    managerZapNumber?: string;
}

export interface SellerPerformance {
    sellerId: string;
    sellerName: string;
    metrics: {
        totalQuotes: number;
        totalOrders: number;
        conversionRate: number;
        avgTicket: number;
        avgDiscountApplied: number;
        avgFollowUpSpeedHours: number;
        assistantAdherenceScore: number; // 0-100
    };
    behaviorAlerts: Array<{
        type: 'excessive_discount' | 'low_followup' | 'high_cancellation';
        severity: 'low' | 'medium' | 'high';
        message: string;
        date: string;
    }>;
}

export interface AccessoryModel {
    id: string;
    name: string;
    price: number;
    photoUrl?: string;
    type?: string;
    cutMeasurement?: string;
    companyId: string;
    userId: string;
}

export interface SinkModel {
    id: string;
    name: string;
    price: number;
    photoUrl?: string;
    type?: string;
    cutMeasurement?: string;
    companyId: string;
    userId: string;
}

export interface MaterialModel {
    id: string;
    name: string;
    price: number;
    type?: string;
    thickness?: string;
    unit?: 'm²' | 'ML';
    companyId: string;
    userId: string;
}

export interface ServiceCatalogItem {
    id: string;
    name: string;
    price: number;
    unit?: 'Fixo' | 'm²' | 'm' | 'un' | 'ML';
    userId: string;
    companyId: string;
}

export interface FormatType {
    id: string;
    companyId: string;
    name: string;
    measureType: 'area' | 'linear';
    createdAt: string;
}

export interface StaffModel {
    id: string;
    name: string;
    cpf?: string;
    rg?: string;
    role: 'superadmin' | 'company_admin' | 'vendedor' | 'seller' | 'medidor' | 'instalador' | 'producao' | 'serrador' | 'acabador' | 'outro';
    admissionDate?: string;
    phone?: string;
    bloodType?: string;
    photoUrl?: string; // Firebase Storage URL
    userId: string;
    companyId: string;
    createdAt: any;
}

export type ColumnType = {
    id: Status;
    title: string;
};

// --- NEW COMPONENTIZED STONE MODULE ---

export type StonePieceType = 'tampo' | 'frontao' | 'saia' | 'rodabase' | 'lateral' | 'outro';

export interface StonePiece {
    id: string;
    type: StonePieceType;
    label: string;
    width: number;
    height: number;
    quantity: number;
    sqm: number;
    total: number;
    linearLength?: number;
}

export interface StoneGroup {
    id: string;
    environmentName: string;
    materialId: string;
    materialName: string;
    materialPrice: number;
    quantity: number; // Multiplier for the whole group
    pieces: StonePiece[];
    groupTotal: number;
    groupStoneTotal?: number;
    groupInstallationTotal?: number;
    furosECortes?: {
        cuba?: boolean;
        furoTorneira?: boolean;
        corteCooktop?: boolean;
    };
    itensFornecidosCliente?: {
        cuba?: boolean;
        cubaGourmet?: boolean;
        tanque?: boolean;
        cubaLavatorio?: boolean;
        lixeira?: boolean;
    };
    edgeFinishing?: string;
}

export interface QuoteAccessory {
    id: string;
    type?: 'cuba' | 'acessorio';
    name: string;
    accessoryId?: string; // Reference to AccessoryModel or SinkModel
    quantity: number;
    unitPrice?: number;
    price?: number; // Legacy/Simple usage
    total: number;
}

export interface QuoteService {
    id: string;
    type?: 'frete' | 'servico';
    description: string;
    quantity?: number;
    unitPrice?: number;
    price: number; // total
}


export interface Quote {
    id: string;
    clientId?: string; // ID do cliente vinculado
    customerName: string;
    customerPhone?: string;
    customerAddress?: string;
    sellerId?: string; // ID do vendedor
    groups: StoneGroup[]; // Pedras Agrupadas
    accessories: QuoteAccessory[]; // Cubas/Torneiras
    services: QuoteService[]; // Instalação/Frete
    linearInstallationTotal?: number;
    manualInstallationTotal?: number;
    includeInstallation?: boolean; // Toggle for including installation in total
    manualInstallation?: { // Manual override for installation
        value: number;
        description: string;
    } | null;
    subtotal: number; // Sum of groups + accessories + services
    observations?: string; // Notas/Observações Gerais
    discount: number; // Valor de desconto aplicado

    discountType: 'percentage' | 'fixed';

    /** @deprecated Rule #30 Law: Use commercialTotal + operationalCost */
    total: number;
    /** @deprecated Rule #30 Law: Use commercialTotal + operationalCost */
    installationTotal?: number;
    /** For legacy consistency in resolution logic */
    totalAmount?: number;

    commercialTotal?: number; // Receita (Pedras + Serviços - Desconto)
    operationalCost?: number; // Investimento Técnico (Linear + Manual)
    freight?: number;
    /** @deprecated High-autonomy movement: quoteStage should reflect operation, not blocking governance */
    quoteStage?: 'pre_orcamento' | 'aguardando_medicao' | 'pos_medicao' | 'aguardando_aprovacao' | 'aprovado' | 'em_contrato' | 'em_producao' | 'finalizado' | 'cancelado'; // Novo Fluxo Operacional
    /** @deprecated High-autonomy movement: Status is now informational. Autonomy is standard. */
    status: 'draft' | 'sent' | 'viewed' | 'negotiating' | 'waiting' | 'measuring' | 'converted' | 'rejected' | 'approved';
    convertedToOrderId?: string; // Reference to Order
    convertedAt?: string; // ISO date of conversion
    items?: QuoteItemState[]; // Legacy/Form usage
    lastContact?: string; // ISO date of last interaction
    lastFollowUpAt?: string; // ISO date of last targeted commercial follow-up
    followUpCount?: number; // How many times we've reached out
    followUpStage?: string; // Current step in the cadence (e.g., 'day_1', 'day_3')
    nextFollowUpAt?: string; // ISO date for the next suggested contact
    followUpStatus?: 'pending' | 'done' | 'snoozed' | 'stopped';
    nextAction?: string; // Description of next follow-up
    history?: Array<{ date: string; action: string; user?: string }>; // CRM Interactions Timeline
    sellerName?: string; // Desnormalized name of the seller
    createdAt: string;
    updatedAt?: string;
    lastAutosaveAt?: string;
    dueDate?: string; // Validade do orçamento
    userId: string; // Para binding multi-tenant no firestore
    companyId: string;
    isPostMeasurement?: boolean; // Permanent identification after measurement
    
    // Approval, Freezing & Versioning (Rule #30 & Rule #35)
    isFrozen?: boolean;
    approvedAt?: string;
    stonesSubtotal?: number;
    accessoriesSubtotal?: number;
    servicesSubtotal?: number;
    paymentConditions?: PaymentConditions;
    quoteSnapshot?: Partial<Quote>;
    snapshotMetadata?: {
        sellerName?: string;
        companyName?: string;
        capturedAt?: string;
        customerName?: string;
        customerPhone?: string;
        customerAddress?: string;
    };
    
    version: number; // Current revision number (e.g., 1, 2, 3)
    isLatestVersion?: boolean; // Flag to indicate if this is the active/current version
    previousQuoteId?: string; // ID of the quote version that preceded this one
    supersededBy?: string; // ID of the quote version that replaced this one
    supersededAt?: string; // ISO date of when this version was replaced
    revisionReason?: string; // Log message explaining why the revision was needed
    parentQuoteId?: string; // Reference to original pre-measurement quote (legacy)
    measurementId?: string; // Reference to the measurement that generated this

    // Soft Delete & Governance
    influencerId?: string;
    influencerName?: string;
    referralCode?: string;
    origin?: string;
    influencerCounted?: boolean;
    isDeleted?: boolean;
    deletedAt?: string;
    deletedBy?: string;
    deleteReasonCategory?: 'cliente_desistiu' | 'valor_alto' | 'erro_orcamento' | 'duplicado' | 'concorrencia' | 'outros';
    deleteReason?: string;

    // Commercial Learning & Optimization
    timeToCloseHours?: number;
    assistedActionUsed?: string;

    negotiationProfile?: {
        analyzed: boolean;
        analyzedAt?: string;
        analyzedBy?: string;
        profileType: 'standard' | 'aggressive' | 'premium' | 'outlier';
        discountApplied: number;
        coachingNotes?: string;
    };
}

export interface MeasurementPhoto {
    url: string;
    storagePath: string;
    fileName: string;
    uploadedAt: string;
    uploadedBy: string;
    uploadedByName: string;
    type: 'environment' | 'technical';
}

export interface Measurement {
    id: string;
    clientId?: string;
    quoteId?: string;
    groups?: StoneGroup[]; // Pedras Agrupadas
    customerName: string;
    phone: string;
    address: string; // Endereço Completo Formatado
    zipCode?: string;
    street?: string;
    number?: string;
    complement?: string;
    neighborhood?: string;
    city?: string;
    state?: string;
    reference?: string;
    scheduledDate: string; // ISO format YYYY-MM-DD
    scheduledTime?: string; // HH:MM
    material?: string;
    observations: string;
    status: 'scheduled' | 'in_progress' | 'completed' | 'declined' | 'converted' | 'reagendada';
    declineReason?: string;
    region?: string;
    type?: 'measurement' | 'store_visit';
    attachments?: string[]; // Array de URLs de imagens/pdfs
    createdAt: string;
    userId: string;
    companyId: string;
    condominium?: string;
    assignedStaffId?: string;
    assignedStaffName?: string;
    measurerId?: string;
    measurerName?: string;
    assignedMeasurerId?: string;
    assignedMeasurerName?: string;
    assignedTo?: string;
    assignedToName?: string;
    scheduledAt?: string | null;
    startedAt?: string;
    completedAt?: string;
    sellerName?: string;
    environmentPhotos?: MeasurementPhoto[];
    technicalMeasurementPhotos?: MeasurementPhoto[];
    measurementAttachment?: MeasurementAttachment | null;
    history?: {
        date: string;
        action: string;
        user?: string;
        source?: string;
        metadata?: Record<string, any>;
    }[];
}

export interface MeasurementAttachment {
    name: string;
    storagePath: string;
    url: string;
    mimeType: string;
    size: number;
    uploadedAt: string;
    uploadedBy: string;
}

export interface QuoteItemState {
    id: string;
    environment: string; // Ambiente (e.g., Cozinha, Banheiro)
    material: string; // Nome do material
    materialPrice: number; // Preço do M² do material
    quantity: number;
    length: number; // Comprimento em cm
    width: number; // Largura em cm
    area: number; // Calculado (C * L * Qtd)
    price: number; // Calculado (Area * Price)
    finishings: string; // Acabamentos texto livre
    pieceType?: string; // Tipo de Peça / Formato (ID or Name)
    installationPrice?: number; // Preço calculado de instalação (ex: para Frontão ML)
    installationServiceId?: string; // ID do serviço de instalação associado
    installationServiceName?: string; // Nome do serviço
    finishingsEdge?: {
        comp1: boolean;
        larg1: boolean;
        larg2: boolean;
        comp2: boolean;
    };
    chargeInstallation?: boolean;
    measureType: 'area' | 'linear';
    total: number;
}

export interface Client {
    id: string;
    name: string;
    document?: string; // CPF/CNPJ
    rg?: string;
    birthDate?: string;
    email?: string;
    phone?: string; // Celular
    landline?: string; // Fixo
    address?: string; // Endereço Completo Formatado
    zipCode?: string; // CEP
    street?: string; // Rua
    number?: string; // Número
    complement?: string; // Complemento
    neighborhood?: string; // Bairro
    city?: string; // Cidade
    state?: string; // Estado
    reference?: string; // Ponto de Referência
    observations?: string; // Observações Gerais
    type?: string; // e.g., 'Final', 'Arquiteto', 'Construtora'
    status?: 'active' | 'inactive' | 'deleted';
    updatedAt?: any;
    updatedBy?: string;
    deletedAt?: any;
    deletedBy?: string;
    deleteReason?: string;
    deletionType?: 'soft_delete';
    restoredAt?: any;
    restoredBy?: string;
    userId: string;
    companyId: string;
    createdAt: any;

    // Tracking for influencers & origin
    origin?: 'Instagram' | 'Indicação' | 'Loja' | 'Influencer' | 'Outro';
    condominium?: string;
    hasInfluencer?: boolean;
    influencerId?: string;
        influencerName?: string;
        referralCode?: string;
        referralStatus?: 'lead' | 'orcamento' | 'contrato' | 'fechado' | 'pago' | 'bonificado';
    searchName?: string;
    searchPhone?: string;
    searchDocument?: string;
    searchCity?: string;
}

export interface Influencer {
    id: string;
    name: string;
    whatsapp: string;
    instagram?: string;
    code: string;
    stats: {
        leads: number;
        quotes: number;
        closures: number;
        totalValue: number;
        accumulatedBonus: number;
    };
    userId: string;
    companyId: string;
    createdAt: string;
    monthlyGoal?: number;
    quarterlyGoal?: number;
    commissionPercentage?: number; // Custom commission % (e.g., 5, 7, 10)
    condominiumName?: string;
    referralCode?: string;
    referralLink?: string;
    rewardTier?: 'bronze' | 'silver' | 'gold' | 'risk';
    qualityScore?: number; // 0-100
}

export interface BonusRecord {
    id: string;
    influencerId: string;
    influencerName: string;
    clientId: string;
    clientName: string;
    orderId?: string;
    contractId?: string;
    paymentEventId?: string; // Link to the specific financial transaction
    orderValue?: number;
    bonusAmount: number;
    description: string;
    type: 'fixed' | 'percentage' | 'manual';
    percentage?: number;
    appliedPercentage?: number; // The % used at the time of creation
    status: 'pending' | 'approved' | 'payable' | 'paid';
    batchId?: string; // For grouping multiple payments in a single batch
    paidAt?: string;
    paidBy?: string;
    paymentMethod?: string;
    createdAt: string;
    companyId: string;
}


export interface Invite {
    id: string;
    email: string;
    companyId: string;
    role: StaffModel['role'];
    status: 'pending' | 'accepted' | 'revoked';
    createdAt: string;
    expiresAt: string;
    createdByUid: string;
}

export interface StoreVisit {
    id: string;
    companyId: string;
    clientId?: string;
    clientName: string;
    clientPhone: string;
    clientSnapshot?: any;
    visitDate: string; // YYYY-MM-DD
    visitTime?: string; // HH:MM
    scheduledAt?: string; // ISO date string if scheduled
    status: 'agendada' | 'compareceu' | 'nao_compareceu' | 'reagendada' | 'convertida_em_orcamento' | 'cancelada';
    visitType: 'primeira_visita' | 'retorno' | 'apresentacao_projeto' | 'fechamento' | 'pos_venda' | 'sem_agendamento';
    sellerId: string;
    sellerName: string;
    sellerEmail?: string;
    notes?: string;
    interest?: string;
    leadOrigin?: string;
    origin?: string;
    quoteId?: string;
    quoteProtocol?: string;
    quoteTotal?: number;
    sourceType?: 'quote' | 'order' | 'client';
    sourceId?: string;
    createdAt: string;
    createdBy: string;
    updatedAt: string;
    updatedBy: string;
    convertedAt?: string;
    convertedBy?: string;
}

export type ViewType = 'home' | 'dashboard' | 'orders' | 'settings' | 'calendar' | 'reports' | 'measurements' | 'quotes' | 'clients' | 'staff' | 'access' | 'admin' | 'invites' | 'financial' | 'relatorios' | 'equipe' | 'contrato' | 'gestao' | 'influencers' | 'medicoes_hoje' | 'contracts' | 'integrity' | 'intelligence' | 'executive' | 'quick_sales' | 'planned_projects' | 'store_visits';

export interface CompanyData {
    id: string;
    name: string;
    document: string;
    phone: string;
    address: string;
    logoUrl?: string; // Nova propriedade
    installationRateLinear?: number; // Valor R$/ML para frontão
    installationRateSqm?: number;    // Valor R$/M² para tampos
    userId: string;
    companyId: string;

    // Commercial Configuration fields for PDF
    validadePrazoTexto?: string;
    parcelamentoTexto?: string;
    taxaJurosTexto?: string;
    pixDescontoTexto?: string;
    observacaoPagamentoTexto?: string;

    instagram?: string;
    website?: string;
    quoteLayout?: 'classic' | 'commercial' | 'premium';
    
    governance?: CommercialGovernanceSettings;
}

export interface QuickSaleItem {
    id: string;
    type: 'soleira' | 'baguete' | 'pingadeira' | 'peitoril' | 'filete' | 'rodapé' | 'outro';
    material: string;
    length: number;
    width: number;
    thickness: number;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    observations?: string;
    finishes: {
        frente: string;
        fundo: string;
        esquerda: string;
        direita: string;
    };
    // Rule 9 fields
    materialId: string;
    materialName: string;
    materialPricePerM2: number;
    materialType?: string;
    lengthCm: number;
    widthCm: number;
    thicknessCm: number;
    areaM2: number;
    totalAreaM2: number;
    materialTotal: number;
    finishTotal: number;
    manualPriceOverride: boolean;
}

export interface QuickSale {
    id: string;
    companyId: string;
    protocolNumber: string;
    status: 'rascunho' | 'aguardando_pagamento' | 'pago' | 'em_corte' | 'em_acabamento' | 'pronto_retirada' | 'saiu_entrega' | 'entregue' | 'cancelado';
    paymentStatus: 'pendente' | 'pago' | 'entrada_recebida' | 'parcial';
    createdAt: any;
    updatedAt: any;
    createdBy: string;
    createdByName: string;
    clientId?: string;
    clientName: string;
    clientPhone: string;
    clientAddress: string;
    clientZipCode?: string;
    clientNumber?: string;
    clientNeighborhood?: string;
    clientCity?: string;
    clientState?: string;
    fulfillmentType: 'retirada' | 'entrega';
    deliveryFee: number;
    expectedPickupDate?: string;
    expectedDeliveryDate?: string;
    paymentMethod: string;
    paymentDate?: string;
    subtotal: number;
    discount: number;
    totalAmount: number;
    items: QuickSaleItem[];
    observations?: string;
    expectedTime?: string;
    paymentCondition?: string;
    paymentConditionLabel?: string;
    downPaymentAmount?: number;
    remainingBalanceAmount?: number;
}

export interface PlannedProduct {
    id: string;
    companyId: string;
    name: string;
    category: string;
    description?: string;
    defaultWidth: number;
    defaultHeight: number;
    defaultDepth: number;
    defaultColor?: string;
    unitCost: number; // in cents
    active: boolean;
    createdAt: any;
    updatedAt: any;
}

export interface PlannedModuleItem {
    id: string;
    productId?: string;
    productName: string;
    moduleType: 'standard' | 'manual';
    quantity: number;
    width: number;
    height: number;
    depth: number;
    color: string;
    handle?: string;
    finish?: string;
    mdfThickness?: string;
    materialName?: string;
    unitCost: number; // in cents
    totalCost: number; // in cents
    notes?: string;
}

export interface PlannedEnvironment {
    id: string;
    name: string;
    notes?: string;
    modules: PlannedModuleItem[];
    environmentTotal?: number; // in cents
}

export interface PlannedProject {
    id: string;
    companyId: string;
    protocolNumber?: string;
    clientId?: string;
    clientName: string;
    clientPhone: string;
    clientEmail?: string;
    clientAddress?: string;
    sellerId: string;
    sellerName: string;
    projectName: string;
    status: 'rascunho' | 'enviado' | 'aprovado' | 'em_producao' | 'instalado' | 'cancelado';
    environments: PlannedEnvironment[];
    saleValue: number; // in cents
    materialCost: number; // in cents
    freightPercent: number;
    freightCost: number; // in cents
    assemblyPercent: number;
    assemblyCost: number; // in cents
    machineFeePercent: number;
    machineFeeAmount: number; // in cents
    totalOperationalCost: number; // in cents
    netResult: number; // in cents
    notes?: string;
    createdAt: any;
    updatedAt: any;
    createdBy: string;
    updatedBy: string;
    deleted?: boolean;
    isDeleted?: boolean;
    deletedAt?: any;
    deletedBy?: string;
    
    // Payment Fields
    paymentMethod?: string;
    paymentCondition?: string;
    paymentNotes?: string;
    installments?: number;
    downPayment?: number; // in cents
    remainingBalance?: number; // in cents
    dueDates?: string[];

    // Signature Fields
    signatureToken?: string;
    signatureExpiresAt?: any; // Timestamp
    signatureStatus?: 'not_sent' | 'active' | 'expired' | 'signed' | 'revoked';
    signedAt?: string;
    signedByName?: string;
    signedByDocument?: string;
    signatureImageUrl?: string;
    signatureDataUrl?: string;
    signedIp?: string | null;
    signedUserAgent?: string;
    contractSignedSnapshot?: any;
}

export interface PlannedContractClause {
    id: string;
    title: string;
    content: string;
}

export interface PlannedModuleSettings {
    freightPercentOnMaterialCost: number;
    assemblyPercentOnSale: number;
    cardMachineFeePercent: number;
    contractSettings?: {
        logoUrl?: string;
        logoPath?: string;
        signatureUrl?: string;
        signaturePath?: string;
        companyName?: string;
        cnpj?: string;
        address?: string;
        phone?: string;
        email?: string;
        responsibleName?: string;
        clauses?: PlannedContractClause[] | string;
        updatedAt?: any;
        updatedBy?: string;
    };
}

export interface PlannedCatalogItem {
    id: string;
    companyId: string;
    type: 'color_mdf' | 'handle' | 'finish' | 'mdf_thickness';
    name: string;
    description?: string;
    active: boolean;
    createdAt: any;
    updatedAt: any;
    createdBy: string;
    updatedBy: string;
    
    // Optional specific fields
    code?: string;
    manufacturer?: string;
    line?: string;
    handleType?: string;
    color?: string;
    price?: number; // in cents
    thickness?: number; // numeric value
    unit?: string; // ex: 'mm'
}


