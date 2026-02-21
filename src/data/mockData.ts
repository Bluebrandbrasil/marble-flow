import type { ColumnType, Order } from '../types';

export const COLUMNS: ColumnType[] = [
    { id: 'production_queue', title: 'Fila de Produção' },
    { id: 'production', title: 'Produção' },
    { id: 'ready_for_conference', title: 'Pronto para Conferência' },
    { id: 'installation', title: 'Em Instalação' },
    { id: 'finished', title: 'Finalizado' },
];

const today = new Date();
const yesterday = new Date(today);
yesterday.setDate(today.getDate() - 1);

const future3 = new Date(today);
future3.setDate(today.getDate() + 3);

const future10 = new Date(today);
future10.setDate(today.getDate() + 10);

const past5 = new Date(today);
past5.setDate(today.getDate() - 5);

export const MOCK_ORDERS: Order[] = [
    // Client 05 (Retorno Urgente - Posição #1)
    {
        id: '5',
        customerName: 'Roberto Lima',
        material: 'Granito Branco Siena',
        deadline: future3.toISOString(), // Urgent, soon
        priority: 'high',
        status: 'production_queue',
        phone: '(11) 98888-5555',
        address: 'Av. Sete de Setembro, 1500 - Diadema, SP',
        totalValue: 3200,
        items: [
            { id: '5-1', name: 'Bancada Cozinha', completed: false },
            { id: '5-2', name: 'Frontão 10cm', completed: false }
        ],
        protocolNumber: 'PROTO-005',
        createdAt: past5.toISOString(),
        isReturn: true,
        completionStatus: 'return',
        returnReasons: ['Erro no Frontão', 'Pedra com Defeito']
    },
    // Client 01 (Fila de Produção - Prioridade Alta)
    {
        id: '1',
        customerName: 'Carlos Eduardo',
        material: 'Quartzo Branco Stellar',
        deadline: future10.toISOString(),
        priority: 'high',
        status: 'production_queue',
        phone: '(11) 99999-1111',
        address: 'Rua Cananéia, 123 - Diadema, SP',
        totalValue: 12500,
        items: [
            { id: '1-1', name: 'Cozinha em L', completed: false },
            { id: '1-2', name: 'Cuba Esculpida', completed: false },
            { id: '1-3', name: 'Saia 4cm', completed: false }
        ],
        protocolNumber: 'PROTO-001',
        createdAt: yesterday.toISOString(),
    },
    // Client 02 (Pronto para Conferência - Prioridade Média)
    {
        id: '2',
        customerName: 'Ana Paula (Apto 42)',
        material: 'Granito Preto São Gabriel',
        deadline: future3.toISOString(),
        priority: 'medium',
        status: 'ready_for_conference',
        phone: '(11) 98888-2222',
        address: 'Rua Graciosa, 500 - Diadema, SP',
        totalValue: 1800,
        items: [
            { id: '2-1', name: 'Lavatório Esculpido 1.20x0.50', completed: true },
            { id: '2-2', name: 'Frontão 10cm', completed: true }
        ],
        protocolNumber: 'PROTO-002',
        createdAt: past5.toISOString(),
    },
    // Client 03 (Em Instalação - Atrasado)
    {
        id: '3',
        customerName: 'Pedro Henrique (Cond. Solar)',
        material: 'Mármore Travertino',
        deadline: yesterday.toISOString(), // Delayed
        priority: 'low',
        status: 'installation',
        phone: '(11) 97777-3333',
        address: 'Av. Alda, 800 - Diadema, SP',
        totalValue: 8500,
        items: [
            { id: '3-1', name: 'Escada 15 Degraus', completed: true },
            { id: '3-2', name: 'Rodapé', completed: true }
        ],
        protocolNumber: 'PROTO-003',
        createdAt: past5.toISOString(),
    },
    // Client 04 (Finalizado com Sucesso)
    {
        id: '4',
        customerName: 'Juliana Costa',
        material: 'Silestone Cinza',
        deadline: past5.toISOString(),
        priority: 'medium',
        status: 'finished',
        phone: '(11) 96666-4444',
        address: 'Rua Amélia Eugênia, 200 - Diadema, SP',
        totalValue: 4200,
        items: [
            { id: '4-1', name: 'Ilha Gourmet', completed: true }
        ],
        protocolNumber: 'PROTO-004',
        createdAt: past5.toISOString(),
        completionStatus: 'success',
        installerName: 'Marcos Silva',
        completionDate: yesterday.toISOString()
    }
];
