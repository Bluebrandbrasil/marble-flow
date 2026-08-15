import * as XLSX from 'xlsx';

/**
 * Funções de utilidade para exportação de dados em Excel focadas em Meta Ads e Marketing.
 */

interface MetaExportData {
    Nome: string;
    Telefone: string;
    Valor?: number;
}

/**
 * Limpa e padroniza números de telefone para formato numérico simples.
 */
const cleanPhone = (phone: string | number): string => {
    if (!phone) return '';
    return String(phone).replace(/\D/g, '');
};

/**
 * Gera e faz o download de um arquivo Excel (.xlsx) a partir de um array de objetos.
 */
export const exportToMetaExcel = (data: MetaExportData[], fileName: string) => {
    // Filtrar registros sem telefone
    const processedData = data
        .filter(item => item.Telefone && cleanPhone(item.Telefone).length >= 8)
        .map(item => ({
            ...item,
            Telefone: cleanPhone(item.Telefone)
        }));

    if (processedData.length === 0) {
        alert("Nenhum dado válido com telefone foi encontrado para exportação.");
        return;
    }

    const worksheet = XLSX.utils.json_to_sheet(processedData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Marketing Meta");

    // Salvar o arquivo
    XLSX.writeFile(workbook, `${fileName}.xlsx`);
};
