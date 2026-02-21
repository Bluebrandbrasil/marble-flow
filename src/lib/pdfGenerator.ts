import jsPDF from 'jspdf';
import QRCode from 'qrcode';
import type { Order } from '../types';
import type { CompanySettings } from '../hooks/useSettings';
import { format } from 'date-fns';

export const generateProductionSheet = async (order: Order, settings: CompanySettings) => {
    const doc = new jsPDF();

    // -- Header with Logo and Company Name --
    const logoSize = 30;
    if (settings.logoUrl) {
        try {
            doc.addImage(settings.logoUrl, 'PNG', 15, 10, logoSize, logoSize, undefined, 'FAST');
        } catch (e) { }
    }

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text("ORDEM DE PRODUÇÃO", logoSize + 25, 20);
    doc.setFontSize(12);
    doc.text(`O.S.: #${order.protocolNumber}`, logoSize + 25, 28);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Cliente: ${order.customerName.substring(0, 50)}`, logoSize + 25, 35);

    doc.setFont('helvetica', 'bold');
    doc.text(`Instalação: ${format(new Date(order.deadline), 'dd/MM/yyyy')}`, logoSize + 25, 42);

    let yPos = 50;

    // -- Returns / Priorities Banner --
    if (order.isReturn) {
        const hasObs = !!order.returnObservations;
        const boxHeight = hasObs ? 20 : 16;

        doc.setFillColor(220, 38, 38); // Red background
        doc.rect(15, yPos, 180, boxHeight, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text("[ ORDEM DE RETORNO - PRIORIDADE ]", 105, yPos + 6, { align: 'center' });
        doc.setFontSize(9);

        const reasons = order.returnReasons?.length ? order.returnReasons.join(', ') : 'Não especificado';
        doc.text(`MOTIVO: ${reasons.substring(0, 90)}`, 105, yPos + 12, { align: 'center' });

        if (hasObs) {
            doc.setFont('helvetica', 'normal');
            doc.text(`OBSERVAÇÕES DO INSTALADOR: ${order.returnObservations?.substring(0, 90)}`, 105, yPos + 17, { align: 'center' });
        }

        doc.setTextColor(0, 0, 0); // Reset text color
        yPos += boxHeight + 9;
    } else {
        doc.setDrawColor(0);
        doc.line(15, yPos, 195, yPos);
        yPos += 10;
    }

    // -- Internal Return (Avaria) Warning --
    if (order.isInternalReturn && order.remakeItem) {
        doc.setFillColor(220, 38, 38); // Red background
        doc.rect(15, yPos, 180, 15, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text(`[ URGENTE: REFAZER APENAS ${order.remakeItem.toUpperCase()} ]`, 105, yPos + 10, { align: 'center' });
        doc.setTextColor(0, 0, 0); // Reset
        yPos += 22;

        if (order.remakeReason) {
            doc.setFontSize(11);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(220, 38, 38);
            doc.text(`Motivo da Avaria: `, 15, yPos);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(0, 0, 0);
            const reasonX = 15 + doc.getTextWidth(`Motivo da Avaria: `);
            doc.text(order.remakeReason, reasonX, yPos);
            yPos += 10;
        } else {
            yPos += 3;
        }
    }

    // -- Measurements Section --
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text("MEDIDAS E MATERIAIS", 15, yPos);
    yPos += 8;

    doc.setFontSize(11);
    doc.setDrawColor(200);
    doc.setFillColor(250, 250, 250);
    doc.rect(15, yPos, 180, 25, 'FD');

    doc.setFont('helvetica', 'normal');
    doc.text("Pedra:", 20, yPos + 8);
    doc.setFont('helvetica', 'bold');
    doc.text(order.material.substring(0, 50), 35, yPos + 8);

    doc.setFont('helvetica', 'normal');
    doc.text("Frontão:", 20, yPos + 18);
    doc.setFont('helvetica', 'bold');
    doc.text(order.splashback || "Padrão", 40, yPos + 18);

    doc.setFont('helvetica', 'normal');
    doc.text("Saia:", 105, yPos + 18);
    doc.setFont('helvetica', 'bold');
    doc.text(order.skirt || "Padrão", 115, yPos + 18);

    yPos += 28;

    // -- Sink Details --
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text("DETALHAMENTO DA CUBA", 15, yPos);
    yPos += 8;

    doc.setFontSize(11);
    if (!order.sinkName && !order.sinkPhotoUrl) {
        doc.setFont('helvetica', 'normal');
        doc.text("Nenhuma cuba selecionada ou especificada para este pedido.", 15, yPos);
        yPos += 15;
    } else {
        doc.setFont('helvetica', 'normal');
        doc.text("Modelo:", 15, yPos);
        doc.setFont('helvetica', 'bold');
        doc.text(order.sinkName || "Cuba Selecionada", 32, yPos);

        if (order.sinkType) {
            doc.setFont('helvetica', 'normal');
            doc.text("Tipo:", 15, yPos + 6);
            doc.setFont('helvetica', 'bold');
            doc.text(order.sinkType.toUpperCase(), 26, yPos + 6);
            yPos += 6;
        }

        yPos += 8;

        if (order.sinkPhotoUrl) {
            try {
                // Add bounding box for the image to make it look like a technical blueprint embed
                doc.setDrawColor(200);
                doc.rect(15, yPos, 60, 60);
                doc.addImage(order.sinkPhotoUrl, 'PNG', 15, yPos, 60, 60, undefined, 'FAST');
                yPos += 65;
            } catch (e) {
                console.warn("Could not render sink photo in PDF.");
                yPos += 5;
            }
        } else {
            yPos += 5;
        }
    }

    // -- Observations Area --
    yPos += 5;
    doc.setFillColor(245, 245, 245);
    doc.setDrawColor(220);
    // Draw an outlined fill box for observations
    doc.rect(15, yPos, 180, 45, 'FD');
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text("OBSERVAÇÕES:", 20, yPos + 8);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    if (order.observations) {
        const splitObs = doc.splitTextToSize(order.observations, 170);
        doc.text(splitObs, 20, yPos + 15);
    } else {
        doc.text("Nenhuma observação técnica fornecida.", 20, yPos + 15);
    }

    yPos += 48; // Move past observations

    // -- Accessories Section (If any) --
    if (order.accessories && order.accessories.length > 0) {
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text("ACESSÓRIOS ADICIONAIS", 15, yPos);
        yPos += 8;

        doc.setFontSize(10);
        let accXOffset = 15;

        order.accessories.forEach((acc, index) => {
            // Move to next row if we exceed page width (2 items per row max for space)
            if (index > 0 && index % 2 === 0) {
                accXOffset = 15;
                yPos += 30; // Row height
            }

            // Draw small bounding box
            doc.setDrawColor(200);
            doc.setFillColor(252, 252, 252);
            doc.rect(accXOffset, yPos, 80, 25, 'FD');

            doc.setFont('helvetica', 'bold');
            doc.text(acc.name.substring(0, 30), accXOffset + 2, yPos + 6);

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.text(`Corte: ${acc.cutMeasurement}`, accXOffset + 2, yPos + 12);
            doc.setFontSize(10);

            if (acc.photoUrl) {
                try {
                    doc.addImage(acc.photoUrl, 'PNG', accXOffset + 55, yPos + 2, 20, 20, undefined, 'FAST');
                } catch (e) {
                    // Ignore photo error
                }
            }

            accXOffset += 85; // Move right for next item
        });

        // Move yPos past the accessories grid
        yPos += Math.ceil(order.accessories.length / 2) * 30 + 5;
    }

    // -- Checklist de Conferência --
    const CONFERENCE_ITEMS = [
        'Tamanho do Frontão e Saia conferidos',
        'Tipo de Cuba e Acessórios conferidos',
        'Corte do Fogão/Cooktop realizado',
        'Cor do material e da massa plástica',
        'Limpeza da pedra',
        'Etiquetas de identificação',
        'Embalagem para transporte'
    ];

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text("CHECKLIST DE CONFERÊNCIA OBRIGATÓRIO", 15, yPos);
    yPos += 8;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setDrawColor(150);

    // Draw in two columns
    let col1Y = yPos;
    let col2Y = yPos;

    CONFERENCE_ITEMS.forEach((item, index) => {
        const isCol1 = index < 4;
        const xOffset = isCol1 ? 15 : 105;
        const currentY = isCol1 ? col1Y : col2Y;

        doc.rect(xOffset, currentY, 4, 4);
        doc.text(item, xOffset + 6, currentY + 3.5);

        if (isCol1) col1Y += 6;
        else col2Y += 6;
    });

    yPos = Math.max(col1Y, col2Y) + 5;


    // -- Footer Signatures --
    // Push the footer down to the absolute bottom of the page if there is space
    const pageHeight = doc.internal.pageSize.getHeight();
    if (yPos < pageHeight - 35) {
        yPos = pageHeight - 35;
    }

    doc.setDrawColor(0);
    doc.line(15, yPos, 195, yPos);
    yPos += 18;

    doc.setFontSize(10);

    // Signature 1: Produção
    doc.line(25, yPos, 90, yPos);
    doc.text("Responsável pela Produção", 57.5, yPos + 5, { align: 'center' });

    // Signature 2: Serrador
    if (order.sawyerName) {
        doc.text(order.sawyerName, 152.5, yPos - 2, { align: 'center' });
    }
    doc.line(120, yPos, 185, yPos);
    doc.text("Funcionário/Serrador", 152.5, yPos + 5, { align: 'center' });

    // Save
    const safeName = order.customerName.replace(/[^a-zA-Z0-9\u00C0-\u017F]/g, '_').substring(0, 30);
    const filename = `OS_${safeName}.pdf`;

    const pdfOutput = doc.output('blob');
    const blob = new Blob([pdfOutput], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};

export const generateBatchProductionSheet = async (orders: Order[], settings: CompanySettings) => {
    if (orders.length === 0) return;

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    // Grid Configuration (A4 Portrait)
    // 2 Columns, 3 Rows = 6 cards
    const margin = 5; // Reduced from 10
    const gap = 2; // Reduced from 5
    const cardWidth = (pageWidth - (margin * 2) - gap) / 2; // ~98mm
    const cardHeight = (pageHeight - (margin * 2) - (gap * 2)) / 3; // ~95mm

    // Auto-fill logic: If only 1 order is passed, fill the page (6 copies)
    // as per user request for "Mini Fichas" optimization
    let ordersToPrint = [...orders];
    if (ordersToPrint.length === 1) {
        ordersToPrint = Array(6).fill(ordersToPrint[0]);
    }

    let currentOrderIndex = 0;

    while (currentOrderIndex < ordersToPrint.length) {
        if (currentOrderIndex > 0) {
            doc.addPage();
        }

        for (let row = 0; row < 3; row++) {
            for (let col = 0; col < 2; col++) {
                if (currentOrderIndex >= ordersToPrint.length) break;

                const order = ordersToPrint[currentOrderIndex];
                const x = margin + (col * (cardWidth + gap));
                const y = margin + (row * (cardHeight + gap));

                // Draw Card Border (Dotted for cutting)
                doc.setDrawColor(150);
                doc.setLineWidth(0.5);
                doc.setLineDashPattern([2, 2], 0);
                doc.rect(x, y, cardWidth, cardHeight);
                doc.setLineDashPattern([], 0); // Reset

                // -- Header --
                doc.setFontSize(8);
                doc.setFont('helvetica', 'bold');
                doc.text(settings.companyName.substring(0, 25), x + 2, y + 5);

                doc.setFontSize(6);
                doc.setFont('helvetica', 'normal');
                doc.text(`O.S.: ${order.protocolNumber}`, x + 2, y + 8);

                // -- Deadline (Highlighted) --
                doc.setFontSize(9);
                doc.setFont('helvetica', 'bold');
                doc.text(`Instalação: ${format(new Date(order.deadline), 'dd/MM')}`, x + cardWidth - 2, y + 5, { align: 'right' });

                // -- Client (Highlighted) --
                doc.setFillColor(240, 240, 240);
                doc.rect(x + 1, y + 10, cardWidth - 2, 6, 'F');
                doc.setFontSize(9);
                doc.text(order.customerName.substring(0, 30), x + 2, y + 14);

                // -- QR Code (Top right) --
                try {
                    // Google Maps URL
                    const addressUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.address)}`;

                    // Generate high-res QR Code (width 200px)
                    const qrCodeDataUrl = await QRCode.toDataURL(addressUrl, {
                        width: 300,
                        margin: 0,
                        errorCorrectionLevel: 'M'
                    });

                    doc.addImage(qrCodeDataUrl, 'PNG', x + cardWidth - 22, y + 8, 20, 20);

                    // Add Phone number below QR for easy access
                    doc.setFontSize(5);
                    doc.setFont('helvetica', 'normal');
                    doc.text(order.phone, x + cardWidth - 12, y + 30, { align: 'center' });

                } catch (e) {
                    // Ignore QR error
                }

                // -- Address --
                doc.setFontSize(7);
                doc.setFont('helvetica', 'normal');
                doc.text(order.address.substring(0, 45), x + 2, y + 19);

                // -- Material (Highlighted) --
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(8);
                doc.text(`Material: ${order.material}`, x + 2, y + 24);

                // -- Simplification: Batch labels are just for ID --
                // We keep the items list basic and remove the single-sheet technical specs

                let itemY = y + 29;
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(7);

                order.items.slice(0, 4).forEach(item => {
                    doc.text(`• ${item.name}`, x + 2, itemY);
                    itemY += 3.5;
                });

                if (order.items.length > 4) {
                    doc.text(`... e mais ${order.items.length - 4} itens`, x + 2, itemY);
                }

                // -- Signatures (Bottom) --
                const sigY = y + cardHeight - 8;
                doc.setLineWidth(0.2);

                doc.line(x + 5, sigY, x + 35, sigY);
                if (order.sawyerName) {
                    doc.setFontSize(5);
                    doc.text(order.sawyerName, x + 20, sigY - 1, { align: 'center' });
                }
                doc.setFontSize(5);
                doc.text("Serrador", x + 20, sigY + 3, { align: 'center' });

                doc.line(x + 40, sigY, x + 70, sigY);
                doc.text("Conferência", x + 55, sigY + 3, { align: 'center' });

                currentOrderIndex++;
            }
        }
    }

    const filename = `Lote_Producao_${format(new Date(), 'dd-MM-yy_HHmm')}.pdf`;
    const pdfOutput = doc.output('blob');
    const blob = new Blob([pdfOutput], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};
