import { safeParseISO } from '../../lib/dateUtils';
import React from 'react';
import type { Order } from '../../types';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { safeArray, normalizeClauses } from '../../lib/dataDiagnostics';
import { buildContractLineItems } from '../../utils/contractUtils';

const formatCurrency = (value: any) => {
    const numericValue = typeof value === 'number' ? value : 0;
    return numericValue.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
};

const formatDimension = (value: any) => {
    const num = Number(value) || 0;
    if (num <= 0) return '0,00';
    // Se for maior que 10, assume que está em centímetros e converte para metros
    const meters = num > 10 ? num / 100 : num;
    return meters.toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
};

const formatInstallmentDate = (dueDate: any) => {
    if (!dueDate) return '';
    const str = String(dueDate).trim();
    const parts = str.split('-');
    if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return str;
};

const formatClientAddress = (client: any) => {
    if (!client) return '';
    if (typeof client === 'string') return client;
    const parts = [];
    let streetPart = client.street || client.address || '';
    if (streetPart && client.number && !['null', 'undefined', '-', ''].includes(String(client.number).trim().toLowerCase())) {
        streetPart += `, Nº ${client.number}`;
    }
    if (client.complement) streetPart += ` - ${client.complement}`;
    if (streetPart) parts.push(streetPart);
    if (client.neighborhood) parts.push(`Bairro ${client.neighborhood}`);
    if (client.city) parts.push(`${client.city}${client.state ? ` - ${client.state}` : ''}`);
    if (client.zipCode || client.cep) parts.push(`CEP: ${client.zipCode || client.cep}`);
    return parts.join(', ');
};

const normalizeServiceLabel = (value: any) => {
  const text = String(value || '').trim().toLowerCase();

  if (!text || text === 'undefined' || text === 'null') return '';

  if (text.includes('cuba')) return 'RECORTE DA CUBA';
  if (text.includes('torneira')) return 'FURO PARA TORNEIRA';
  if (text.includes('cooktop')) return 'CORTE PARA COOKTOP';
  if (text.includes('tanque')) return 'RECORTE DO TANQUE';
  if (text.includes('lavatório') || text.includes('lavatorio')) return 'RECORTE DO LAVATÓRIO';

  return text.toUpperCase();
};

interface ContractPrintTemplateProps {
    order: Order;
}

export const ContractPrintTemplate = React.forwardRef<HTMLDivElement, ContractPrintTemplateProps>(({ order }, ref) => {
    const contractSnapshot = order.contractSignedSnapshot || order.contractSnapshot || {};
    const orderSnapshot = (order as any).orderSnapshot || order;

    // 1. Fonte única de dados baseada SOMENTE nos Snapshots (Requisito 1)
    const client = order.contractSignedSnapshot?.clientSnapshot || order.clientSnapshot || {};
    const company = order.contractSignedSnapshot || order.contractSnapshot || {};

    const rawClientName = order.signatureData?.name || client.name || order.customerName;
    const clientName = (rawClientName || 'Cliente não informado').toUpperCase();
    const clientDocument = order.signatureData?.document || client.document || client.cpf || client.cpfCnpj || (order as any).customerDocument || (order as any).clientDocument || 'Não informado';
    const clientPhone = client.phone || 'Não informado';
    const clientEmail = client.email || 'Não informado';
    const clientAddress = client.address || formatClientAddress(client) || 'Não informado';

    // Resolved Client Signature Variables
    const clientSignature = order.clientSignature || order.signatureData?.image || '';
    const signedAt = order.signedAt || order.signatureData?.timestamp || '';
    const signatureToken = order.signatureToken || '';
    const signatureData = order.signatureData || null;

    const companyName = company.companyName || company.name || 'Não informado';
    const companyCnpj = company.companyCnpj || company.cnpj || 'Não informado';
    const companyPhone = company.companyPhone || company.phone || 'Não informado';
    const companyAddress = company.companyAddress || company.address || 'Não informado';
    const companyLogo = company.companyLogo || company.logoUrl || '';
    const companySignature = company.companySignature || company.signature || '';
    const companyEmail = company.companyEmail || company.email || '';
    const companySocial = company.instagram || company.companySocial || company.social || '';

    // 2. Condições de Pagamento e Financiamento (Requisito 4 e 5)
    // Priority: contractOverrides, then default fields
    const overrides = order.contractOverrides || {};
    const installments = safeArray(
        overrides.paymentSchedule || 
        order.paymentConditions?.installments
    );

    const entryInstallment = installments.find(i => 
        String(i.label || '').toLowerCase().includes('entrada') || 
        i.dueType === 'imediato'
    );

    const entryValue = entryInstallment?.amount || order.downPayment || 0;
    const entryValueCents = Math.round(entryValue * 100);
    const totalAmountCents = Math.round((order.totalAmount || 0) * 100);
    const remainingInstallmentsSumCents = installments.filter(i => i !== entryInstallment).reduce((acc, i) => acc + Math.round((i.amount || 0) * 100), 0);
    const remainingValue = remainingInstallmentsSumCents > 0
        ? remainingInstallmentsSumCents / 100
        : (order.remainingAmount || (totalAmountCents - entryValueCents) / 100);
    const entryMethod = entryInstallment?.paymentMethodLabel || 'Não informado';
    
    const remainingInstallments = installments.filter(i => i !== entryInstallment);
    const remainingMethod = remainingInstallments.length > 0 
        ? remainingInstallments.map(i => i.paymentMethodLabel).filter((v, i, a) => a.indexOf(v) === i).join(', ')
        : 'Não informado';

    const paymentNotes = overrides.hasOwnProperty('paymentNotes') 
        ? overrides.paymentNotes 
        : order.observations;

    const commercialConditions = overrides.commercialConditions || '';

    const discountVal = Number(order.discount || company.discount || 0);
    const freightVal = Number(order.freight || company.freight || 0);
    const totalVal = Number(order.totalAmount || 0);
    const subtotalVal = totalVal - freightVal + discountVal;

    const safeFormat = (dateValue: any, formatStr: string) => {
        if (!dateValue) return 'Não informado';
        try {
            let d: Date | null;
            if (dateValue && typeof dateValue.toDate === 'function') {
                d = dateValue.toDate();
            } else {
                d = safeParseISO(dateValue);
            }
            if (!d || isNaN(d.getTime())) return 'Não informado';
            return format(d, formatStr, { locale: ptBR });
        } catch (e) {
            return 'Não informado';
        }
    };

    const emissionDate = safeFormat(order.createdAt, "dd/MM/yyyy");

    // Cláusulas processadas dinamicamente
    const getProcessedTemplate = (): { title: string; content: string }[] => {
        const templateRaw = overrides.additionalClauses || company.contractTemplate || (order as any).customClauses || [];
        const clauses = normalizeClauses(templateRaw);

        const data: Record<string, string> = {
            '{{CLIENTE_NOME}}': String(clientName),
            '{{CLIENTE_CPF}}': String(clientDocument),
            '{{CLIENTE_DOCUMENTO}}': String(clientDocument),
            '{{CLIENTE_CPF_CNPJ}}': String(clientDocument),
            '{{CPF_CNPJ}}': String(clientDocument),
            '{{DOCUMENTO_CLIENTE}}': String(clientDocument),
            '{{CLIENTE_TELEFONE}}': String(clientPhone),
            '{{CLIENTE_ENDERECO}}': String(clientAddress),
            '{{EMPRESA_NOME}}': String(companyName),
            '{{EMPRESA_CNPJ}}': String(companyCnpj),
            '{{EMPRESA_ENDERECO}}': String(companyAddress),
            '{{EMPRESA_TELEFONE}}': String(companyPhone),
            '{{VALOR_TOTAL}}': formatCurrency(order.totalAmount),
            '{{VALOR_ENTRADA}}': formatCurrency(entryValue),
            '{{SALDO_DEVEDOR}}': formatCurrency(remainingValue),
            '{{VALOR_RESTANTE}}': formatCurrency(remainingValue),
            '{{PAGAMENTO_ENTRADA}}': formatCurrency(entryValue),
            '{{PAGAMENTO_RESTANTE}}': formatCurrency(remainingValue),
            '{{FORMA_PAGAMENTO_ENTRADA}}': String(entryMethod),
            '{{FORMA_PAGAMENTO_RESTANTE}}': String(remainingMethod),
            '{{CONDIÇÕES_PAGAMENTO}}': installments.map(i => `${i.label}: ${formatCurrency(i.amount)} (${i.paymentMethodLabel || 'Não informado'})`).join(' | '),
            '{{PROTOCOLO}}': String(order.protocolNumber || 'Não informado'),
            '{{DATA_PEDIDO}}': String(emissionDate),
            '{{PRAZO}}': String(order.deadline || 'A combinar'),
            '{{FORMA_PAGAMENTO}}': String(order.paymentMethod || 'A combinar'),
            '{{ITENS_PEDIDO}}': '',
            '{{AMBIENTES}}': '',
            '{{MEDIDAS}}': '',
            '{{MATERIAL}}': '',
            '{{DATA_EMISSAO}}': String(emissionDate),
        };

        return clauses.map(clause => {
            let t = clause.title;
            let c = clause.content;
            Object.entries(data).forEach(([tag, value]) => {
                const regex = new RegExp(tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
                t = t.replace(regex, value || '');
                c = c.replace(regex, value || '');
            });

            // Remove any remaining unresolved placeholders (e.g. {{SOME_TAG}})
            t = t.replace(/\{\{[^}]*\}\}/g, '');
            c = c.replace(/\{\{[^}]*\}\}/g, '');

            // Clean stray commas, double spaces, and consecutive commas
            const cleanPunctuation = (str: string): string => {
                return str
                    // Replace multiple spaces (excluding newlines)
                    .replace(/[ \t]+/g, ' ')
                    // Remove spaces before punctuation (excluding newlines)
                    .replace(/[ \t]+([.,;:?])/g, '$1')
                    // Clean consecutive commas
                    .replace(/,([ \t]*,)+/g, ',')
                    // Clean patterns like ",," or ", ,"
                    .replace(/,\s*,/g, ',')
                    .trim();
            };
            t = cleanPunctuation(t);
            c = cleanPunctuation(c);

            return { title: t, content: c };
        });
    };

    const processedClauses = getProcessedTemplate();
    
    const lineItems = buildContractLineItems(order);

    // Collect all unique environment names (normalized to uppercase)
    const environments = Array.from(new Set(lineItems.map(item => item.environmentName)));

    // Sort environments so that "ACESSÓRIOS & SERVIÇOS GLOBAIS" is at the end
    const sortedEnvironments = environments.sort((a, b) => {
        if (a === 'ACESSÓRIOS & SERVIÇOS GLOBAIS') return 1;
        if (b === 'ACESSÓRIOS & SERVIÇOS GLOBAIS') return -1;
        return a.localeCompare(b, 'pt-BR');
    });

    const nonVoidEnvironments = sortedEnvironments.filter(envName => {
        const envItems = lineItems.filter(item => item.environmentName === envName);
        return envItems.length > 0;
    });

    const categoryOrder: Record<string, number> = {
        'PEÇAS': 1,
        'FORNECIDO PELO CLIENTE': 2,
        'SERVIÇOS INCLUSOS': 3,
        'ACESSÓRIOS / CUBAS': 4,
        'SERVIÇOS': 5,
        'FRETE': 6
    };

    const renderLineItemValue = (item: any) => {
        if (item.suppliedByClient) {
            return 'Fornecido pelo Cliente';
        }
        if (item.included || item.totalValue === 0) {
            return 'Incluso';
        }
        return formatCurrency(item.totalValue);
    };

    const getCategoryBadgeLabel = (cat: string) => {
        switch (cat) {
            case 'PEÇAS': return 'PEÇA';
            case 'FORNECIDO PELO CLIENTE': return 'FORNECIDO PELO CLIENTE';
            case 'SERVIÇOS INCLUSOS': return 'INCLUSO';
            case 'ACESSÓRIOS / CUBAS': return 'ACESSÓRIO';
            case 'SERVIÇOS': return 'SERVIÇO';
            case 'FRETE': return 'FRETE';
            default: return cat;
        }
    };

    const getStatusLabel = (status?: string) => {
        switch (status) {
            case 'pending': return 'Pendente';
            case 'viewed': return 'Visualizado';
            case 'signed': return 'Assinado';
            case 'company_signed': return 'Assinado pela Empresa';
            default: return 'Em Elaboração';
        }
    };

    return (
        <div ref={ref} id="contract-print-root" className="print-main-wrapper bg-[#f8fafc] min-h-screen py-12 px-4 print:p-0 print:bg-white">
            <style dangerouslySetInnerHTML={{ __html: `
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
                
                /* Regras temporárias para exportação A4 perfeita */
                body.pdf-exporting {
                    background: #ffffff !important;
                }
                body.pdf-exporting #contract-print-root {
                    width: 794px !important;
                    max-width: 794px !important;
                    min-width: 794px !important;
                    padding: 0 !important;
                    margin: 0 auto !important;
                    background: #ffffff !important;
                    overflow: visible !important;
                    box-sizing: border-box !important;
                }
                body.pdf-exporting .print-sheet {
                    width: 794px !important;
                    max-width: 794px !important;
                    min-width: 794px !important;
                    padding: 20mm 15mm !important;
                    box-shadow: none !important;
                    margin: 0 auto !important;
                    background: #ffffff !important;
                    box-sizing: border-box !important;
                }
                body.pdf-exporting .signature-container {
                    width: 100% !important;
                    max-width: 794px !important;
                    box-sizing: border-box !important;
                }
                body.pdf-exporting .signature-box {
                    max-width: 350px !important;
                    box-sizing: border-box !important;
                    overflow: hidden !important;
                }
                body.pdf-exporting .signature-img {
                    max-width: 100% !important;
                    box-sizing: border-box !important;
                }

                .print-main-wrapper {
                    font-family: 'Inter', sans-serif;
                    color: #18181b;
                    line-height: 1.6;
                }
                .print-sheet {
                    width: 210mm;
                    min-height: 297mm;
                    margin: 0 auto;
                    padding: 20mm 15mm;
                    background: white;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.05);
                    box-sizing: border-box;
                    display: flex;
                    flex-direction: column;
                }

                @media print {
                    @page { size: A4; margin: 12mm; }
                    body {
                        background: white !important;
                        color: #000 !important;
                    }
                    .print-main-wrapper { 
                        padding: 0 !important; 
                        background: white !important; 
                    }
                    #contract-print-root {
                        box-shadow: none !important;
                        margin: 0 !important;
                        width: 100% !important;
                        height: auto !important;
                        overflow: visible !important;
                        background: transparent !important;
                    }
                    .print-sheet { 
                        width: 100% !important; 
                        box-shadow: none !important; 
                        padding: 0 !important;
                        margin: 0 !important;
                        min-height: 0 !important;
                        height: auto !important;
                        overflow: visible !important;
                        background: transparent !important;
                    }
                    .no-break { break-inside: avoid; page-break-inside: avoid; }
                    .page-break { page-break-before: always; break-before: page; }
                    .no-print {
                        display: none !important;
                    }
                }

                .contract-page,
                .contract-section,
                .clause-item,
                .env-group,
                .financial-section,
                .signature-container,
                .signature-section,
                .project-first-block {
                    break-inside: avoid;
                    page-break-inside: avoid;
                }

                /* Header Layout */
                .company-header-grid {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding-bottom: 20px;
                }
                .header-logo-box {
                    flex: 1;
                    display: flex;
                    align-items: center;
                }
                .contract-logo {
                    max-height: 60px;
                    max-width: 220px;
                    object-fit: contain;
                }
                .header-company-name-fallback {
                    font-size: 20px;
                    font-weight: 800;
                    color: #18181b;
                    letter-spacing: -0.025em;
                    text-transform: uppercase;
                }
                .header-details-box {
                    text-align: right;
                    font-size: 9.5px;
                    line-height: 1.6;
                    color: #4b5563;
                    max-width: 450px;
                }
                .company-name-title {
                    font-size: 13px;
                    font-weight: 800;
                    color: #18181b;
                    text-transform: uppercase;
                    margin-bottom: 4px;
                    letter-spacing: 0.025em;
                }

                /* Contract Title & Badge Row */
                .contract-header-section {
                    border-bottom: 1.5px solid #e4e4e7;
                    padding-bottom: 24px;
                    margin-bottom: 32px;
                    text-align: center;
                }
                .legal-title {
                    font-size: 20px;
                    font-weight: 800;
                    text-transform: uppercase;
                    letter-spacing: 0.08em;
                    color: #18181b;
                    margin: 20px 0 12px 0;
                }
                .contract-badge-info {
                    display: flex;
                    justify-content: center;
                    gap: 12px;
                    font-size: 9.5px;
                }
                .contract-badge-item {
                    background: #f4f4f5;
                    border: 1px solid #e4e4e7;
                    border-radius: 4px;
                    padding: 4px 10px;
                    color: #27272a;
                    font-weight: 600;
                    letter-spacing: 0.025em;
                }

                /* Consistent Section Title Styles */
                .section-header-title {
                    font-size: 11px;
                    font-weight: 800;
                    text-transform: uppercase;
                    border-bottom: 1.5px solid #18181b;
                    padding-bottom: 6px;
                    margin-top: 36px;
                    margin-bottom: 18px;
                    color: #18181b;
                    letter-spacing: 0.08em;
                }

                /* Contractor Card */
                .contratante-block {
                    border: 1px solid #e4e4e7;
                    border-radius: 6px;
                    padding: 20px;
                    margin-bottom: 24px;
                    background: #fafafa;
                }
                .contratante-grid {
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    gap: 12px;
                    font-size: 10px;
                    line-height: 1.5;
                }
                .contratante-field {
                    display: flex;
                    flex-direction: column;
                }
                .contratante-label {
                    font-size: 8px;
                    font-weight: 700;
                    color: #8e9196;
                    text-transform: uppercase;
                    margin-bottom: 4px;
                    letter-spacing: 0.05em;
                }
                .contratante-value {
                    font-weight: 600;
                    color: #18181b;
                    font-size: 10.5px;
                }

                /* Clauses Section */
                .clauses-section {
                    margin-bottom: 24px;
                }
                .clause-item {
                    margin-bottom: 20px;
                    text-align: justify;
                }
                .clause-title {
                    font-size: 11px;
                    font-weight: 700;
                    color: #18181b;
                    margin-bottom: 6px;
                    text-transform: uppercase;
                    letter-spacing: 0.025em;
                }
                .clause-text {
                    font-size: 10px;
                    line-height: 1.6;
                    color: #3f3f46;
                    white-space: pre-wrap;
                }

                /* Environments / Anexo Section */
                .environments-section {
                    margin-top: 24px;
                    margin-bottom: 24px;
                }
                .env-group {
                    margin-bottom: 24px;
                    border: 1px solid #e4e4e7;
                    border-radius: 6px;
                    overflow: hidden;
                }
                .env-header {
                    background: #f4f4f5;
                    border-left: 4px solid #18181b;
                    padding: 10px 16px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .env-name {
                    font-size: 11px;
                    font-weight: 800;
                    text-transform: uppercase;
                    color: #18181b;
                    letter-spacing: 0.05em;
                }
                .env-pieces-list {
                    margin-bottom: 0;
                }
                .env-item-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 10px 16px;
                    border-bottom: 1px solid #f4f4f5;
                    font-size: 10px;
                }
                .env-item-row:last-child {
                    border-bottom: none;
                }
                .env-item-row:hover {
                    background: #fafafa;
                }
                .env-item-info {
                    display: flex;
                    align-items: center;
                    flex: 1;
                    gap: 8px;
                }
                .env-item-badge {
                    font-size: 8px;
                    font-weight: 700;
                    padding: 2px 6px;
                    border-radius: 4px;
                    background: #f4f4f5;
                    border: 1px solid #e4e4e7;
                    color: #4b5563;
                    text-transform: uppercase;
                    letter-spacing: 0.025em;
                    white-space: nowrap;
                }
                .env-item-badge.incluso {
                    background: #f0fdf4;
                    border-color: #dcfce7;
                    color: #166534;
                }
                .env-item-description {
                    font-weight: 500;
                    color: #27272a;
                    text-transform: uppercase;
                }
                .env-item-financial {
                    display: flex;
                    align-items: center;
                    gap: 16px;
                    font-weight: 600;
                    color: #18181b;
                }
                .env-item-qty {
                    font-size: 9px;
                    color: #71717a;
                    font-weight: 500;
                }

                /* Financial Block - Two Column Layout */
                .financial-container-grid {
                    display: grid;
                    grid-template-columns: 1.2fr 0.8fr;
                    gap: 24px;
                    margin-top: 10px;
                    margin-bottom: 24px;
                }
                .payment-details-box {
                    font-size: 10px;
                    line-height: 1.6;
                    color: #27272a;
                }
                .payment-details-title {
                    font-size: 10px;
                    font-weight: 800;
                    text-transform: uppercase;
                    color: #4b5563;
                    margin-bottom: 10px;
                    letter-spacing: 0.05em;
                }
                .payment-item-row {
                    display: flex;
                    justify-content: space-between;
                    padding: 6px 0;
                    border-bottom: 1px dashed #e4e4e7;
                }
                .payment-item-row .label {
                    font-weight: 600;
                    color: #4b5563;
                }
                .payment-item-row .value {
                    font-weight: 600;
                    color: #18181b;
                }
                .payment-installments-box {
                    margin-top: 12px;
                    background: #fafafa;
                    border: 1px dashed #e4e4e7;
                    border-radius: 4px;
                    padding: 10px 14px;
                }
                .installment-title {
                    font-weight: 700;
                    font-size: 9px;
                    color: #71717a;
                    text-transform: uppercase;
                    margin-bottom: 6px;
                }
                .installments-list {
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                }
                .installment-item {
                    font-size: 9.5px;
                    color: #3f3f46;
                }
                .payment-observations {
                    margin-top: 12px;
                    font-size: 9.5px;
                    color: #71717a;
                    font-style: italic;
                    line-height: 1.5;
                }

                /* Financial Summary Box (Right Column) */
                .financial-summary-box {
                    background: #f9fafb;
                    border: 1px solid #e4e4e7;
                    border-radius: 6px;
                    padding: 20px;
                    display: flex;
                    flex-direction: column;
                    justify-content: space-between;
                    height: 100%;
                    box-sizing: border-box;
                }
                .summary-rows {
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                }
                .summary-row {
                    display: flex;
                    justify-content: space-between;
                    font-size: 10.5px;
                    color: #4b5563;
                }
                .summary-row.discount-row {
                    color: #b91c1c;
                    font-weight: 600;
                }
                .summary-row .label {
                    font-weight: 500;
                }
                .summary-row .value {
                    font-weight: 600;
                    color: #18181b;
                }
                .summary-row.discount-row .value {
                    color: #b91c1c;
                }
                .summary-total-divider {
                    border-top: 1px solid #e4e4e7;
                    margin: 12px 0;
                }
                .summary-total-row {
                    background: #18181b;
                    color: #ffffff;
                    border-radius: 4px;
                    padding: 12px 14px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-top: auto;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.05);
                }
                .summary-total-row .label {
                    font-size: 10.5px;
                    font-weight: 800;
                    text-transform: uppercase;
                    letter-spacing: 0.08em;
                }
                .summary-total-row .value {
                    font-size: 14px;
                    font-weight: 800;
                }

                /* Signature Block */
                .signature-container {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 40px;
                    margin-top: 24px;
                }
                .signature-box {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: flex-end;
                    padding: 24px;
                    border: 1px solid #e4e4e7;
                    border-radius: 6px;
                    background: #fbfbfb;
                    text-align: center;
                    min-height: 160px;
                }
                .signature-img-wrapper {
                    height: 70px;
                    display: flex;
                    align-items: flex-end;
                    justify-content: center;
                    margin-bottom: 12px;
                    width: 100%;
                }
                .signature-img {
                    max-height: 70px;
                    max-width: 200px;
                    object-fit: contain;
                }
                .signature-line {
                    border-top: 1px solid #18181b;
                    width: 75%;
                    margin: 8px auto 4px auto;
                }
                .signature-title {
                    font-size: 9px;
                    font-weight: 800;
                    color: #71717a;
                    text-transform: uppercase;
                    letter-spacing: 0.08em;
                    margin-top: 4px;
                }
                .signature-name {
                    font-size: 10.5px;
                    font-weight: 700;
                    color: #18181b;
                    margin-top: 4px;
                }
                .signature-doc {
                    font-size: 9px;
                    color: #71717a;
                    margin-top: 2px;
                }

                /* Footer */
                .footer-text {
                    margin-top: auto;
                    font-size: 8.5px;
                    color: #a1a1aa;
                    text-align: center;
                    border-top: 1px solid #f4f4f5;
                    padding-top: 20px;
                    margin-top: 40px;
                    line-height: 1.6;
                    letter-spacing: 0.025em;
                }
            `}} />

            <div className="print-sheet">
                {/* Header Grid */}
                <div className="company-header-grid">
                    <div className="header-logo-box">
                        {companyLogo ? (
                            <img 
                                src={companyLogo} 
                                crossOrigin="anonymous" 
                                referrerPolicy="no-referrer"
                                alt="Logo" 
                                className="contract-logo"
                            />
                        ) : (
                            <span className="header-company-name-fallback">{companyName}</span>
                        )}
                    </div>
                    <div className="header-details-box">
                        <div className="company-name-title">{companyName}</div>
                        <div>CNPJ: {companyCnpj}</div>
                        <div>{companyAddress}</div>
                        {companyPhone && companyPhone !== 'Não informado' && <div>Fone: {companyPhone}</div>}
                        {companyEmail && companyEmail !== 'Não informado' && <div>E-mail: {companyEmail}</div>}
                        {companySocial && companySocial !== 'Não informado' && <div>Redes Sociais: {companySocial}</div>}
                    </div>
                </div>

                {/* Title & Badge Row Section */}
                <div className="contract-header-section">
                    <h1 className="legal-title">Contrato de Prestação de Serviços</h1>
                    <div className="contract-badge-info">
                        <div className="contract-badge-item">Nº: {order.protocolNumber || 'Não informado'}</div>
                        <div className="contract-badge-item">Emissão: {emissionDate}</div>
                        <div className="contract-badge-item">Status: {getStatusLabel(order.contractStatus)}</div>
                    </div>
                </div>

                {/* Contractor Block */}
                <div className="no-break">
                    <div className="section-header-title">Contratante</div>
                    <div className="contratante-block">
                        <div className="contratante-grid">
                            <div className="contratante-field" style={{ gridColumn: 'span 2' }}>
                                <span className="contratante-label">Nome / Razão Social</span>
                                <span className="contratante-value">{clientName}</span>
                            </div>
                            <div className="contratante-field">
                                <span className="contratante-label">CPF / CNPJ</span>
                                <span className="contratante-value">{clientDocument}</span>
                            </div>
                            <div className="contratante-field">
                                <span className="contratante-label">Telefone</span>
                                <span className="contratante-value">{clientPhone}</span>
                            </div>
                            <div className="contratante-field" style={{ gridColumn: 'span 2' }}>
                                <span className="contratante-label">E-mail</span>
                                <span className="contratante-value">{clientEmail}</span>
                            </div>
                            <div className="contratante-field full-width" style={{ gridColumn: 'span 3' }}>
                                <span className="contratante-label">Endereço Completo</span>
                                <span className="contratante-value">{clientAddress}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Clauses Section */}
                <div className="clauses-section">
                    <div className="section-header-title">Cláusulas Contratuais</div>
                    {processedClauses.map((clause, idx) => (
                        <div key={idx} className="clause-item">
                            <div className="clause-title">{clause.title}</div>
                            <div className="clause-text">{clause.content}</div>
                        </div>
                    ))}
                </div>

                {/* Items Grouped by Environment Section */}
                {nonVoidEnvironments.length > 0 && (
                    <div className="environments-section">
                        {/* We group the header and the FIRST environment into .project-first-block */}
                        {(() => {
                            const firstEnvName = nonVoidEnvironments[0];
                            const firstEnvItems = lineItems.filter(item => item.environmentName === firstEnvName);
                            const sortedFirstItems = [...firstEnvItems].sort((a, b) => {
                                const orderA = categoryOrder[a.category] || 99;
                                const orderB = categoryOrder[b.category] || 99;
                                return orderA - orderB;
                            });

                            return (
                                <div className="project-first-block">
                                    <div className="section-header-title">Dados do Projeto (Anexo I - Descritivo Técnico)</div>
                                    <div className="env-group">
                                        <div className="env-header">
                                            <span className="env-name">{firstEnvName}</span>
                                        </div>
                                        <div className="env-pieces-list">
                                            {sortedFirstItems.map((item, itemIdx) => (
                                                <div key={itemIdx} className="env-item-row">
                                                    <div className="env-item-info">
                                                        <span className={`env-item-badge ${item.included || item.totalValue === 0 ? 'incluso' : ''}`}>
                                                            {getCategoryBadgeLabel(item.category)}
                                                        </span>
                                                        <span className="env-item-description">
                                                            {item.description}
                                                        </span>
                                                    </div>
                                                    <div className="env-item-financial">
                                                        {item.quantity > 1 && (
                                                            <span className="env-item-qty">
                                                                Qtd: {item.quantity}
                                                            </span>
                                                        )}
                                                        <span className="env-item-price">
                                                            {renderLineItemValue(item)}
                                                        </span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            );
                        })()}

                        {/* Subsequent environments */}
                        {nonVoidEnvironments.slice(1).map((envName, idx) => {
                            const envItems = lineItems.filter(item => item.environmentName === envName);
                            const sortedItems = [...envItems].sort((a, b) => {
                                const orderA = categoryOrder[a.category] || 99;
                                const orderB = categoryOrder[b.category] || 99;
                                return orderA - orderB;
                            });

                            return (
                                <div key={idx} className="env-group">
                                    <div className="env-header">
                                        <span className="env-name">{envName}</span>
                                    </div>
                                    <div className="env-pieces-list">
                                        {sortedItems.map((item, itemIdx) => (
                                            <div key={itemIdx} className="env-item-row">
                                                <div className="env-item-info">
                                                    <span className={`env-item-badge ${item.included || item.totalValue === 0 ? 'incluso' : ''}`}>
                                                        {getCategoryBadgeLabel(item.category)}
                                                    </span>
                                                    <span className="env-item-description">
                                                        {item.description}
                                                    </span>
                                                </div>
                                                <div className="env-item-financial">
                                                    {item.quantity > 1 && (
                                                        <span className="env-item-qty">
                                                            Qtd: {item.quantity}
                                                        </span>
                                                    )}
                                                    <span className="env-item-price">
                                                        {renderLineItemValue(item)}
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Financial Section (Requisito 5 & 6) */}
                <div className="financial-section">
                    <div className="section-header-title">Condições Comerciais</div>
                    <div className="financial-container-grid">
                        {/* Left side: Payment Details */}
                        <div className="payment-details-box">
                            <div className="payment-details-title">Formas e Condições de Pagamento</div>
                            
                            <div className="payment-item-row">
                                <span className="label">Valor de Entrada (Sinal)</span>
                                <span className="value">
                                    {formatCurrency(entryValue)} 
                                    {entryMethod !== 'Não informado' ? ` via ${entryMethod}` : ''}
                                </span>
                            </div>
                            
                            <div className="payment-item-row">
                                <span className="label">Saldo Restante</span>
                                <span className="value">
                                    {formatCurrency(remainingValue)}
                                </span>
                            </div>

                            <div className="payment-item-row">
                                <span className="label">Forma de Pagamento do Saldo</span>
                                <span className="value">
                                    {remainingInstallments.length > 0 
                                        ? `Parcelado em ${remainingInstallments.length} vez(es)` 
                                        : remainingMethod
                                    }
                                </span>
                            </div>

                             {installments.length > 0 && (
                                <div className="payment-installments-box">
                                    <div className="installment-title">Cronograma de Parcelas</div>
                                    <div className="installments-list">
                                        {installments.map((inst, index) => {
                                            const formattedDate = (inst.dueType === 'data' || inst.dueDate) && inst.dueDate
                                                ? ` - vencimento em ${formatInstallmentDate(inst.dueDate)}`
                                                : '';
                                            return (
                                                <div key={index} className="installment-item">
                                                    • {inst.label || `Parcela ${index + 1}`}: <strong>{formatCurrency(inst.amount)}</strong> ({inst.paymentMethodLabel || 'Não informado'}){formattedDate}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {paymentNotes && (
                                <div className="payment-observations">
                                    <strong>Observações Financeiras:</strong> {paymentNotes}
                                </div>
                            )}

                            {commercialConditions && (
                                <div className="payment-observations" style={{ marginTop: '8px' }}>
                                    <strong>Condições Comerciais:</strong> {commercialConditions}
                                </div>
                            )}
                        </div>

                        {/* Right side: Financial Summary Box */}
                        <div className="financial-summary-box">
                            <div className="summary-rows">
                                <div className="summary-row">
                                    <span className="label">Subtotal dos Itens</span>
                                    <span className="value">{formatCurrency(subtotalVal)}</span>
                                </div>
                                
                                {discountVal > 0 && (
                                    <div className="summary-row discount-row">
                                        <span className="label">Desconto Aplicado</span>
                                        <span className="value">-{formatCurrency(discountVal)}</span>
                                    </div>
                                )}
                                
                                {freightVal > 0 && (
                                    <div className="summary-row">
                                        <span className="label">Frete / Entrega</span>
                                        <span className="value">{formatCurrency(freightVal)}</span>
                                    </div>
                                )}
                            </div>

                            <div className="summary-total-divider"></div>
                            
                            <div className="summary-total-row">
                                <span className="label">Total do Projeto</span>
                                <span className="value">{formatCurrency(totalVal)}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Signatures Section */}
                <div className="signature-section no-break">
                    <div className="section-header-title">Assinaturas</div>
                    <div className="signature-container">
                        <div className="signature-box">
                            <div className="signature-img-wrapper">
                                {companySignature && (
                                    <img 
                                        src={companySignature} 
                                        crossOrigin="anonymous" 
                                        referrerPolicy="no-referrer"
                                        alt="Assinatura Contratada" 
                                        className="signature-img" 
                                    />
                                )}
                            </div>
                            <div className="signature-line"></div>
                            <div className="signature-title">Contratada</div>
                            <div className="signature-name">{companyName}</div>
                            <div className="signature-doc">CNPJ: {companyCnpj}</div>
                        </div>
                        <div className="signature-box">
                            <div className="signature-img-wrapper">
                                {clientSignature && (
                                    <img 
                                        src={clientSignature} 
                                        crossOrigin="anonymous" 
                                        referrerPolicy="no-referrer"
                                        alt="Assinatura Contratante" 
                                        className="signature-img" 
                                    />
                                )}
                            </div>
                            <div className="signature-line"></div>
                            <div className="signature-title">Contratante</div>
                            <div className="signature-name">{clientName}</div>
                            <div className="signature-doc">CPF/CNPJ: {clientDocument}</div>
                        </div>
                    </div>

                    {clientSignature && (
                        <div className="mt-8 p-4 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-between text-left">
                            <div>
                                <p className="text-[10px] font-black text-emerald-800 uppercase tracking-widest flex items-center gap-1.5">
                                    <span>🔒 Assinatura Digital Validada</span>
                                </p>
                                <p className="text-[8px] text-emerald-600 font-mono mt-1.5 leading-relaxed">
                                    Token ID: {signatureToken || order.id || 'N/A'} <br />
                                    Data/Hora: {signedAt ? safeFormat(signedAt, "dd/MM/yyyy 'às' HH:mm:ss") : (signatureData?.timestamp ? safeFormat(signatureData.timestamp, "dd/MM/yyyy 'às' HH:mm:ss") : 'N/A')} <br />
                                    {signatureData?.ip && `IP do Dispositivo: ${signatureData.ip}`}
                                </p>
                            </div>
                            <div className="text-right shrink-0">
                                <span className="inline-block text-[8px] font-black bg-emerald-600 text-white px-2.5 py-1 rounded uppercase tracking-wider">
                                    ASSINADO DIGITALMENTE
                                </span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer Text */}
                <div className="footer-text">
                    Documento emitido eletronicamente via Marble Flow.
                    <br />
                    Assinatura digital válida e resguardada em conformidade com a MP nº 2.200-2/2001.
                </div>

            </div>
        </div>
    );
});
