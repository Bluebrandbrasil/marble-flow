import { safeParseISO } from '../lib/dateUtils';
import type { ColumnType, Order } from '../types';

export const COLUMNS: ColumnType[] = [
    { id: 'aguardando_materia_prima', title: 'Matéria-Prima' },
    { id: 'em_producao', title: 'Produção' },
    { id: 'em_instalacao', title: 'Instalação' },
    { id: 'finalizado', title: 'Finalizado' },
];

const today = new Date();
const yesterday = safeParseISO(today);
yesterday.setDate(today.getDate() - 1);

const future3 = safeParseISO(today);
future3.setDate(today.getDate() + 3);

const future10 = safeParseISO(today);
future10.setDate(today.getDate() + 10);

const past5 = safeParseISO(today);
past5.setDate(today.getDate() - 5);

export const MOCK_ORDERS: Order[] = [
    // Client 05 (Retorno Urgente - Posição #1)
    {
        id: '5',
        customerName: 'Roberto Lima',
        material: 'Granito Branco Siena',
        deadline: future3.toISOString(), // Urgent, soon
        priority: 'high',
        status: 'em_producao',
        phone: '(11) 98888-5555',
        address: 'Av. Sete de Setembro, 1500 - Diadema, SP',
        totalAmount: 3200,
        items: [
            { id: '5-1', name: 'Bancada Cozinha', completed: false },
            { id: '5-2', name: 'Frontão 10cm', completed: false }
        ],
        protocolNumber: 'PROTO-005',
        createdAt: past5.toISOString(),
        isReturn: true,
        completionStatus: 'return',
        returnReasons: ['Erro no Frontão', 'Pedra com Defeito'],
        userId: 'mock-user',
        companyId: 'mock-company'
    },
    // Client 01 (Fila de Produção - Prioridade Alta)
    {
        id: '1',
        customerName: 'Carlos Eduardo',
        material: 'Quartzo Branco Stellar',
        deadline: future10.toISOString(),
        priority: 'high',
        status: 'em_producao',
        phone: '(11) 99999-1111',
        address: 'Rua Cananéia, 123 - Diadema, SP',
        totalAmount: 12500,
        items: [
            { id: '1-1', name: 'Cozinha em L', completed: false },
            { id: '1-2', name: 'Cuba Esculpida', completed: false },
            { id: '1-3', name: 'Saia 4cm', completed: false }
        ],
        protocolNumber: 'PROTO-001',
        createdAt: yesterday.toISOString(),
        userId: 'mock-user',
        companyId: 'mock-company'
    },
    // Client 02 (Pronto para Conferência - Prioridade Média)
    {
        id: '2',
        customerName: 'Ana Paula (Apto 42)',
        material: 'Granito Preto São Gabriel',
        deadline: future3.toISOString(),
        priority: 'medium',
        status: 'em_producao',
        phone: '(11) 98888-2222',
        address: 'Rua Graciosa, 500 - Diadema, SP',
        totalAmount: 1800,
        items: [
            { id: '2-1', name: 'Lavatório Esculpido 1.20x0.50', completed: true },
            { id: '2-2', name: 'Frontão 10cm', completed: true }
        ],
        protocolNumber: 'PROTO-002',
        createdAt: past5.toISOString(),
        userId: 'mock-user',
        companyId: 'mock-company'
    },
    // Client 03 (Em Instalação - Atrasado)
    {
        id: '3',
        customerName: 'Pedro Henrique (Cond. Solar)',
        material: 'Mármore Travertino',
        deadline: yesterday.toISOString(), // Delayed
        priority: 'low',
        status: 'em_instalacao',
        phone: '(11) 97777-3333',
        address: 'Av. Alda, 800 - Diadema, SP',
        totalAmount: 8500,
        items: [
            { id: '3-1', name: 'Escada 15 Degraus', completed: true },
            { id: '3-2', name: 'Rodapé', completed: true }
        ],
        protocolNumber: 'PROTO-003',
        createdAt: past5.toISOString(),
        userId: 'mock-user',
        companyId: 'mock-company'
    },
    // Client 04 (Finalizado com Sucesso)
    {
        id: '4',
        customerName: 'Juliana Costa',
        material: 'Silestone Cinza',
        deadline: past5.toISOString(),
        priority: 'medium',
        status: 'finalizado',
        phone: '(11) 96666-4444',
        address: 'Rua Amélia Eugênia, 200 - Diadema, SP',
        totalAmount: 4200,
        items: [
            { id: '4-1', name: 'Ilha Gourmet', completed: true }
        ],
        protocolNumber: 'PROTO-004',
        createdAt: past5.toISOString(),
        completionStatus: 'success',
        installerName: 'Marcos Silva',
        completionDate: yesterday.toISOString(),
        userId: 'mock-user',
        companyId: 'mock-company'
    }
];
