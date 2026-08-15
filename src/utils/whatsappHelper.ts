export const WHATSAPP_WINDOW_NAME = "marbleflow_whatsapp_followup";

export type WhatsAppMode = "app" | "web";

export function getWhatsAppModePreference(): WhatsAppMode {
    return "app";
}

export function setWhatsAppModePreference(mode: WhatsAppMode) {
    // No-op
}

export function normalizeBrazilPhone(phone: string): string {
    if (!phone) return "";
    let cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length > 0 && !cleanPhone.startsWith('55') && cleanPhone.length <= 11) {
        cleanPhone = '55' + cleanPhone;
    }
    return cleanPhone;
}

export function getWhatsAppUrl(phone: string, message: string, mode: WhatsAppMode = "app"): string {
    const cleanPhone = normalizeBrazilPhone(phone);
    const encodedMessage = encodeURIComponent(message || "");
    return `whatsapp://send?phone=${cleanPhone}&text=${encodedMessage}`;
}

export function openWhatsAppFollowUp(phone: string, message: string) {
    const cleanPhone = String(phone || '').replace(/\D/g, '');
    if (!cleanPhone) {
        alert('Telefone do cliente não informado.');
        return;
    }
    const fullPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
    const encodedMessage = encodeURIComponent(message || '');
    const url = `whatsapp://send?phone=${fullPhone}&text=${encodedMessage}`;
    window.location.href = url;
}

