export interface ClientDisplayInfo {
    name: string;
    phone: string;
    formattedPhone: string;
    addressLabel: string;
    searchText: string;
}

export function normalizePhoneSearch(phone: string): string {
    if (!phone) return '';
    return phone.replace(/\D/g, '').replace(/^55/, ''); // Remove non-numeric and leading 55 if present
}

export function formatBrazilianPhone(phone: string): string {
    if (!phone) return 'Telefone não informado';
    
    const digits = normalizePhoneSearch(phone);
    if (!digits) return 'Telefone não informado';

    if (digits.length === 11) {
        return `(${digits.substring(0, 2)}) ${digits.substring(2, 7)}-${digits.substring(7)}`;
    } else if (digits.length === 10) {
        return `(${digits.substring(0, 2)}) ${digits.substring(2, 6)}-${digits.substring(6)}`;
    }
    
    // Fallback if not a standard length
    return phone;
}

export function getClientDisplayInfo(client: any): ClientDisplayInfo {
    if (!client) {
        return {
            name: 'Cliente sem identificação',
            phone: '',
            formattedPhone: 'Telefone não informado',
            addressLabel: '',
            searchText: ''
        };
    }

    const rawPhone = 
        client.phone || 
        client.clientPhone || 
        client.telefone || 
        client.whatsapp || 
        client.clientWhatsapp || 
        client.mobile || 
        client.cellphone || 
        client.contactPhone || '';

    const formattedPhone = formatBrazilianPhone(rawPhone);
    const normalizedPhone = normalizePhoneSearch(rawPhone);
    
    const hasName = Boolean(client.name?.trim());
    const hasPhone = Boolean(rawPhone?.trim());
    
    let name = client.name?.trim() || '';
    if (!hasName && hasPhone) {
        name = 'Cliente sem nome';
    } else if (!hasName && !hasPhone) {
        name = 'Cliente sem identificação';
    }

    // Build Address Label
    let addressLabel = '';
    const city = client.city || client.address?.city || '';
    const state = client.state || client.address?.state || '';
    const neighborhood = client.neighborhood || client.address?.neighborhood || '';
    
    if (city || state || neighborhood) {
        const parts = [];
        if (neighborhood) parts.push(neighborhood);
        if (city) {
            let cityState = city;
            if (state) cityState += ` - ${state}`;
            parts.push(cityState);
        } else if (state) {
            parts.push(state);
        }
        addressLabel = parts.join(', ');
    }

    // Search Text
    const searchParts = [
        name,
        normalizedPhone,
        formattedPhone,
        client.email,
        client.cpfCnpj || client.document,
        addressLabel,
        city,
        state,
        neighborhood
    ].filter(Boolean);

    const searchText = searchParts.join(' ').toLowerCase();

    return {
        name,
        phone: rawPhone,
        formattedPhone,
        addressLabel,
        searchText
    };
}
