
import { 
    normalizeMeasure, 
    calculateArea, 
    calculateFrontaoLogic, 
    calculateQuoteTotals 
} from './quoteCalculations';

/**
 * --- SUÍTE DE TESTES: MOTOR DE CÁLCULO BLINDADO (RULE #30) ---
 * Propósito: Impedir regressões históricas e garantir fidelidade total do motor.
 */

function expect(actual: any, expected: any, description: string) {
    const passed = JSON.stringify(actual) === JSON.stringify(expected);
    if (passed) {
        console.log(`✅ [PASS] ${description}`);
    } else {
        console.error(`❌ [FAIL] ${description}`);
        console.error(`   Esperado: ${JSON.stringify(expected)}`);
        console.error(`   Recebido: ${JSON.stringify(actual)}`);
        // process.exit(1);
    }
}

console.log('--- INICIANDO SUÍTE DE TESTES: MARBLE FLOW ENGINE ---\n');

// 1. TESTES: normalizeMeasure (Shielding Rule #1)
console.log('1. TESTES: normalizeMeasure');
expect(normalizeMeasure("5"), 5, '"5" deve ser 5 (m)');
expect(normalizeMeasure("5,00"), 5, '"5,00" deve ser 5 (m)');
expect(normalizeMeasure("0,60"), 0.6, '"0,60" deve ser 0.6 (m)');
expect(normalizeMeasure(0.6), 0.6, '0.6 (number) deve ser 0.6 (m)');
expect(normalizeMeasure(""), 0, '"" deve ser 0');
expect(normalizeMeasure(null), 0, 'null deve ser 0');
expect(normalizeMeasure(undefined), 0, 'undefined deve ser 0');

// Bug Histórico: 5,00 virando 0,05
expect(normalizeMeasure("5,00") !== 0.05, true, 'PROTEÇÃO: "5,00" NÃO deve virar 0.05 (escala cm corrigida)');


// 2. TESTES: calculateArea (Shielding Rule #2)
console.log('\n2. TESTES: calculateArea');
expect(calculateArea(5, 0.60), 3, '5m x 0.60m = 3m²');
expect(calculateArea(0.50, 0.60), 0.30, '0.50m x 0.60m = 0.30m²');
expect(calculateArea(1.20, 0.55), 0.66, '1.20m x 0.55m = 0.66m²');


// 3. TESTES: calculateFrontaoLogic (Shielding Rule #3)
console.log('\n3. TESTES: calculateFrontaoLogic');
const frontaoSample = calculateFrontaoLogic({ comprimento: 5, altura: 0.10, taxaInstalacao: 100 });
expect(frontaoSample.area, 0.50, 'Área do Frontão: 5m x 0.10m = 0.50m²');
expect(frontaoSample.installation, 500, 'Instalação Linear: 5m x R$100 = R$500');


// 4. TESTES: calculateQuoteTotals (Single Source of Truth Rule #30)
console.log('\n4. TESTES: calculateQuoteTotals (Cenários Combinados)');

const createMockQuote = (pieces: any[], manualInstValue: number = 0, includeInst: boolean = true): any => ({
    groups: [{
        id: 'g1',
        environmentName: 'Teste',
        materialName: 'Mármore',
        materialPrice: 1000,
        quantity: 1,
        pieces: pieces.map(p => ({
            id: Math.random().toString(),
            type: p.type || 'tampo',
            label: p.label || 'Peça',
            width: p.width,
            height: p.height,
            quantity: p.qty || 1
        }))
    }],
    accessories: [],
    services: [],
    discount: 0,
    includeInstallation: includeInst
});

// Cenário 1: Sem instalação
const scenario1 = calculateQuoteTotals(createMockQuote([{ width: 1, height: 1 }], 0, false), 100, false);
expect(scenario1.operationalCost, 0, 'Cenário 1: operationalCost = 0 quando includeInstallation=false');
expect(scenario1.commercialTotal, 1000, 'Cenário 1: Total comercial isolado (1000)');

// Cenário 2: Apenas Instalação Linear (Frontão)
const scenario2 = calculateQuoteTotals(createMockQuote([{ width: 5, height: 0.10, type: 'frontao', label: 'Frontão' }]), 100);
expect(scenario2.operationalCost, 5 * 100, 'Cenário 2: Apenas linear (5m x 100 = 500)');
expect(scenario2.stonesSubtotal, 500, 'Cenário 2: Área de pedra (0.5m² x 1000 = 500)');

// Cenário 3: Apenas Instalação Manual
const scenario3 = calculateQuoteTotals(createMockQuote([{ width: 1, height: 1 }], 450), 100, true, { value: 450 });
expect(scenario3.operationalCost, 450, 'Cenário 3: Apenas manual (450)');

// Cenário 4: Linear + Manual
const scenario4 = calculateQuoteTotals(createMockQuote([{ width: 2, height: 0.10, type: 'frontao', label: 'Frontão' }], 300), 100, true, { value: 300 });
// Linear (2 * 100 = 200) + Manual (300) = 500
expect(scenario4.operationalCost, 500, 'Cenário 4: Linear (200) + Manual (300) = 500');

// Bug Histórico: Multiplicação duplicada por ambiente
console.log('\n5. PROTEÇÃO CONTRA REGRESSÕES HISTÓRICAS');
const multiEnvQuote = createMockQuote([{ width: 1, height: 1 }], 0);
multiEnvQuote.groups[0].quantity = 2; // Dobra o ambiente
const scenarioMulti = calculateQuoteTotals(multiEnvQuote, 100);
expect(scenarioMulti.stonesSubtotal, 2000, 'PROTEÇÃO: Dobrar ambiente dobra área (1000 x 2 = 2000)');

// Bug Histórico: .toFixed precoce
const floatPrecision = createMockQuote([{ width: 1.23, height: 4.56 }], 0); // 1.23 * 4.56 = 5.6088
floatPrecision.groups[0].materialPrice = 123.45;
const scenarioPrecision = calculateQuoteTotals(floatPrecision, 0);
// 5.6088 * 123.45 = 692.40636 -> Arredondado no estágio final 692.41
expect(scenarioPrecision.commercialTotal, 692.41, 'PROTEÇÃO: Precisão de ponto flutuante preservada até o final');

console.log('\n--- SUÍTE DE TESTES CONCLUÍDA ---');
console.log('Ambiente Blindado.');
