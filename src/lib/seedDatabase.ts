import { safeParseISO } from './dateUtils';
import { collection, writeBatch, doc, getDocs, query, where } from 'firebase/firestore';
import { db } from './firebase';
import { toISODateSafe } from './dateWriteUtils';
import { safeArray } from './dataDiagnostics';

const AUTHORIZED_EMAIL = 'rdg30mds@gmail.com';

const BRASIL_CITIES = ['São Paulo', 'Campinas', 'Osasco', 'Guarulhos', 'Santo André', 'São Bernardo', 'Santos', 'Sorocaba'];
const BRASIL_STREETS = ['Rua Augusta', 'Av. Paulista', 'Rua Oscar Freire', 'Rua Direita', 'Av. Brigadeiro', 'Rua da Consolação', 'Av. Ibirapuera'];
const NAMES = ['João', 'Maria', 'Carlos', 'Ana', 'Pedro', 'Sofia', 'Ricardo', 'Julia', 'Marcelo', 'Camila', 'Fernanda', 'Lucas', 'Mariana', 'Thiago', 'Beatriz'];
const SURNAMES = ['Silva', 'Santos', 'Oliveira', 'Souza', 'Rodrigues', 'Ferreira', 'Alves', 'Pereira', 'Lima', 'Gomes', 'Costa', 'Ribeiro', 'Martins', 'Carvalho', 'Almeida'];
const MATERIALS = ['Granito São Gabriel', 'Mármore Travertino', 'Quartzo Branco', 'Granito Verde Ubatuba', 'Mármore Carrara', 'Nanoglass', 'Silestone Calacatta'];
const FORMATS = ['Bancada', 'Ilha', 'Lavatório', 'Nicho', 'Mesa', 'Rodapé', 'Soleira'];
const ENVIRONMENTS = ['Cozinha', 'Banheiro Suíte', 'Lavabo', 'Área Gourmet', 'Lavanderia', 'Sala de Jantar'];

function randomChoice<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}

function randomNumber(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomPrice(min: number, max: number): number {
    return Number((Math.random() * (max - min) + min).toFixed(2));
}

function generatePhone(): string {
    return `(11) 9${randomNumber(1000, 9999)}-${randomNumber(1000, 9999)}`;
}

function generateDocument(): string {
    return `${randomNumber(100, 999)}.${randomNumber(100, 999)}.${randomNumber(100, 999)}-${randomNumber(10, 99)}`;
}

export async function seedDatabase(userEmail: string | null | undefined, uid: string, companyId: string) {
    if (userEmail !== AUTHORIZED_EMAIL) {
        throw new Error('Não autorizado. O e-mail não corresponde à conta de teste autorizada.');
    }

    try {
        // 0. Optional Cleanup of Old Mock Data
        try {
            const batchCleanup = writeBatch(db);
            const mockQueries = [
                query(collection(db, 'clients'), where('isMock', '==', true), where('companyId', '==', companyId)),
                query(collection(db, 'orcamentos'), where('isMock', '==', true), where('companyId', '==', companyId)),
                query(collection(db, 'measurements'), where('isMock', '==', true), where('companyId', '==', companyId)),
                query(collection(db, 'pedidos'), where('isMock', '==', true), where('companyId', '==', companyId)),
            ];

            let countCleaned = 0;
            for (const mockQuery of mockQueries) {
                const querySnapshot = await getDocs(mockQuery);
                querySnapshot.forEach((docSnap) => {
                    batchCleanup.delete(docSnap.ref);
                    countCleaned++;
                });
            }

            if (countCleaned > 0) {
                await batchCleanup.commit();
                console.log(`Limpou ${countCleaned} registros antigos de Mock Data.`);
            }
        } catch (cleanupError) {
            console.warn('Falha na limpeza de dados antigos, continuando a injeção...', cleanupError);
        }

        const batch = writeBatch(db);

        // 1. Generate 10 Clients
        const clientRefs: { id: string; name: string; phone: string; address: string }[] = [];
        for (let i = 0; i < 10; i++) {
            const clientDoc = doc(collection(db, 'clients'));
            const clientName = `${randomChoice(NAMES)} ${randomChoice(SURNAMES)}`;
            const phone = generatePhone();
            const address = `${randomChoice(BRASIL_STREETS)}, ${randomNumber(1, 999)} - ${randomChoice(BRASIL_CITIES)}, SP`;

            const clientData = {
                name: clientName,
                document: generateDocument(),
                phone: phone,
                address: address,
                userId: uid,
                companyId: companyId,
                createdAt: toISODateSafe(new Date())!,
                isMock: true
            };

            batch.set(clientDoc, clientData);
            clientRefs.push({ id: clientDoc.id, name: clientName, phone: phone, address: address });
        }

        // 2. Generate 15 Quotes with rigid downstream relations
        const quoteStatuses = ['draft', 'pending', 'in_measurement', 'approved', 'rejected', 'converted'];

        for (let i = 0; i < 15; i++) {
            const quoteDoc = doc(collection(db, 'orcamentos'));
            const client = randomChoice(clientRefs);
            const numItems = randomNumber(1, 4);
            const items = [];
            let subtotal = 0;

            for (let j = 0; j < numItems; j++) {
                const materialPrice = randomPrice(300, 1500);
                const quantity = randomNumber(1, 4);
                const length = randomPrice(0.5, 3.0);
                const width = randomPrice(0.5, 1.2);
                const area = Number((length * width * quantity).toFixed(2));
                const price = Number((area * materialPrice).toFixed(2));
                subtotal += price;

                items.push({
                    id: crypto.randomUUID(),
                    environment: randomChoice(ENVIRONMENTS),
                    material: randomChoice(MATERIALS),
                    materialPrice: materialPrice,
                    quantity: quantity,
                    length: length,
                    width: width,
                    area: area,
                    price: price,
                    finishings: 'Borda Reta, Polido',
                    pieceType: randomChoice(FORMATS)
                });
            }

            const discount = randomNumber(0, 10) > 7 ? randomPrice(50, 300) : 0;

            // Relational State Distribution
            const statusIndex = randomNumber(0, quoteStatuses.length - 1);
            const status = quoteStatuses[statusIndex];

            // Generate a creation date skewed up to 3 months backwards to populate Reports
            const quoteDate = new Date();
            quoteDate.setDate(quoteDate.getDate() - randomNumber(0, 90));

            const quoteData = {
                clientId: client.id,
                customerName: client.name,
                customerPhone: client.phone,
                customerAddress: client.address,
                items: items,
                accessories: [],
                services: [],
                subtotal: subtotal,
                discount: discount,
                discountType: 'fixed',
                total: subtotal - discount,
                status: status,
                createdAt: toISODateSafe(quoteDate)!,
                userId: uid,
                companyId: companyId,
                isMock: true
            };

            batch.set(quoteDoc, quoteData);

            // 3. Generate Downstream "Measurement" if quote is converted
            if (status === 'converted') {
                const measurementDoc = doc(collection(db, 'measurements'));

                // Measurement happens after QuoteCreation, randomly in the future or recent past
                const measureDate = safeParseISO(quoteDate)!;
                measureDate.setDate(measureDate.getDate() + randomNumber(1, 14));

                const measurementData = {
                    quoteId: quoteDoc.id,
                    clientId: client.id,
                    customerName: client.name,
                    phone: client.phone,
                    address: client.address,
                    city: 'São Paulo', // Arbitrary city
                    scheduledDate: toISODateSafe(measureDate)!.split('T')[0],
                    scheduledTime: `${randomNumber(8, 16).toString().padStart(2, '0')}:00`,
                    material: items[0]?.material || randomChoice(MATERIALS),
                    observations: 'Favor ligar ao porteiro. Medição mockada gerada automaticamente.',
                    status: measureDate > new Date() ? 'scheduled' : 'completed',
                    createdAt: toISODateSafe(measureDate)!,
                    userId: uid,
                    companyId: companyId,
                    isMock: true
                };

                batch.set(measurementDoc, measurementData);

                // If Measurement is 'completed', it naturally becomes a 'Pedido' in Kanban
                if (measurementData.status === 'completed') {
                    const orderDoc = doc(collection(db, 'pedidos'));

                    const orderDate = safeParseISO(measureDate)!;
                    orderDate.setDate(orderDate.getDate() + randomNumber(1, 30)); // Deadline in the future from measure

                    const orderItems = safeArray(items).map(item => ({
                        id: crypto.randomUUID(),
                        name: `${item.pieceType} - ${item.environment}`,
                        completed: Math.random() > 0.5
                    }));

                    // Random Kanban Status selection
                    const kanbanStatuses = ['production_queue', 'production', 'ready_for_conference', 'installation', 'finished'];
                    // Bias towards 'finished' if the measurement date happened more than 15 days ago
                    const diffDays = Math.floor((new Date().getTime() - measureDate.getTime()) / (1000 * 3600 * 24));
                    const orderStatus = diffDays > 15 ? 'finished' : randomChoice(kanbanStatuses);

                    const orderData: any = {
                        quoteId: quoteDoc.id,
                        measurementId: measurementDoc.id,
                        clientId: client.id,
                        customerName: client.name,
                        phone: client.phone,
                        address: client.address,
                        material: items[0]?.material || randomChoice(MATERIALS),
                        deadline: toISODateSafe(orderDate)!.split('T')[0],
                        priority: randomChoice(['low', 'medium', 'high']),
                        status: orderStatus,
                        totalValue: subtotal - discount,
                        items: orderItems,
                        protocolNumber: `OSP-${randomNumber(1000, 9999)}`,
                        createdAt: toISODateSafe(measureDate)!,
                        userId: uid,
                        companyId: companyId,
                        observations: 'Produção simulada gerada pela função geradora de bancos.',
                        isMock: true
                    };

                    if (orderStatus === 'finished') {
                        const finishDate = safeParseISO(orderDate)!;
                        finishDate.setDate(finishDate.getDate() - randomNumber(0, 5)); // Finalizado antes ou perto do prazo
                        orderData.completionDate = toISODateSafe(finishDate)!;
                        orderData.completionStatus = 'success';
                    }

                    batch.set(orderDoc, orderData);
                }

            }

            // 4. Generate Downstream "Pedido" straight if quote is Approved
            if (status === 'approved') {
                const orderDoc = doc(collection(db, 'pedidos'));

                const orderDate = safeParseISO(quoteDate)!;
                orderDate.setDate(orderDate.getDate() + randomNumber(10, 45)); // Deadline

                const orderItems = safeArray(items).map(item => ({
                    id: crypto.randomUUID(),
                    name: `${item.pieceType} - ${item.environment}`,
                    completed: false
                }));

                const orderData = {
                    quoteId: quoteDoc.id,
                    clientId: client.id,
                    customerName: client.name,
                    phone: client.phone,
                    address: client.address,
                    material: items[0]?.material || randomChoice(MATERIALS),
                    deadline: toISODateSafe(orderDate)!.split('T')[0],
                    priority: randomChoice(['low', 'medium', 'high']),
                    status: randomChoice(['production_queue', 'production', 'ready_for_conference']),
                    totalValue: subtotal - discount,
                    items: orderItems,
                    protocolNumber: `OSP-${randomNumber(1000, 9999)}`,
                    createdAt: toISODateSafe(quoteDate)!,
                    userId: uid,
                    companyId: companyId,
                    observations: 'Aprovado Direto! Mock Data.',
                    isMock: true
                };

                batch.set(orderDoc, orderData);
            }

        }

        await batch.commit();
        console.log('Database seeded successfully with HIGH RELATIONSHIP mock data!');
        return { success: true, message: 'Sucesso! Antigos testes removidos e novos dados de teste injetados (Orçamentos ➡️ Medições ➡️ Projetos). Recarregue a página.' };

    } catch (error) {
        console.error('Error seeding relational database:', error);
        throw error;
    }
}

export async function importOfficialPriceList(uid: string, companyId: string) {
    const batch = writeBatch(db);

    const stones = [
        { name: 'Preto São Gabriel escovado', price: 1650, type: 'granite' },
        { name: 'Preto São Gabriel Cozinha', price: 1320, type: 'granite' },
        { name: 'Verde ubatuba cozinha', price: 935, type: 'granite' },
        { name: 'verde ubatuba soleira', price: 495, type: 'granite' },
        { name: 'Quartzo Branco', price: 1980, type: 'quartz' },
        { name: 'Branco Prime', price: 1320, type: 'marble' },
        { name: 'Branco Itaunas', price: 1210, type: 'granite' },
        { name: 'Cinza Absoluto', price: 1650, type: 'quartz' },
        { name: 'Preto Florido cliente', price: 968, type: 'granite' },
        { name: 'Cinza Fosco', price: 1650, type: 'quartz' },
        { name: 'Branco Estrelar', price: 2420, type: 'quartz' },
        { name: 'Preto Absoluto', price: 2420, type: 'granite' },
        { name: 'Quartzo Preto', price: 1980, type: 'quartz' },
        { name: 'Preto São Gabriel cliente', price: 1320, type: 'granite' },
        { name: 'Travertino', price: 1100, type: 'marble' },
        { name: 'lamina', price: 2200, type: 'other' },
        { name: 'travertino romano bruto', price: 1650, type: 'marble' },
        { name: 'Branco Pitaya', price: 2420, type: 'quartz' },
        { name: 'Branco Dallas', price: 1000, type: 'granite' },
        { name: 'Branco Siena Cozinha', price: 1160, type: 'granite' },
        { name: 'Quartzo Cinza', price: 2420, type: 'quartz' },
        { name: 'Ardosia', price: 400, type: 'other' },
        { name: 'Café imperial escovado', price: 1650, type: 'granite' },
        { name: 'Itaunas escovado', price: 1650, type: 'granite' },
        { name: 'Branco Extra', price: 1080, type: 'granite' },
        { name: 'Cinza Andorinha escovado', price: 1320, type: 'granite' },
        { name: 'Verde Ubatuba escovado', price: 1650, type: 'granite' },
        { name: 'Ocre Itabira Cozinha', price: 1050, type: 'granite' },
        { name: 'Branco Comum', price: 1320, type: 'granite' },
        { name: 'Branco Parana', price: 2420, type: 'marble' },
        { name: 'Via Lactea', price: 1650, type: 'granite' },
        { name: 'Tajmahal', price: 2750, type: 'quartzite' },
        { name: 'Branco Polar', price: 2100, type: 'granite' },
        { name: 'Preto tijuca levigado', price: 1650, type: 'granite' },
        { name: 'Quartizito', price: 2750, type: 'quartzite' },
        { name: 'Sky White', price: 2420, type: 'quartz' },
        { name: 'Calacata', price: 2420, type: 'quartz' },
        { name: 'Calacata Gold', price: 2420, type: 'quartz' },
        { name: 'Bco espirito santo', price: 1320, type: 'granite' },
    ];

    const sinks = [
        { name: 'CUBA INOX', price: 390 },
        { name: 'TANQUE INOX', price: 500 },
        { name: 'CUBA GOURMET', price: 660 },
    ];

    const createdAt = toISODateSafe(new Date())!;

    stones.forEach(stone => {
        const docRef = doc(collection(db, 'stones'));
        batch.set(docRef, {
            ...stone,
            cost: 0,
            userId: uid,
            companyId,
            createdAt
        });
    });

    sinks.forEach(sink => {
        const docRef = doc(collection(db, 'sinks'));
        batch.set(docRef, {
            ...sink,
            cost: 0,
            photoUrl: '',
            userId: uid,
            companyId,
            createdAt
        });
    });

    await batch.commit();
    return { success: true, count: stones.length + sinks.length };
}
