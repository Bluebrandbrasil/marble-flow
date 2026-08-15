import { safeString } from './dataDiagnostics';
/**
 * Normalizes and checks if a client origin string represents an "Influencer".
 * Robust against case variations and whitespace.
 */
export const isInfluencer = (origin?: string): boolean => {
    const normalized = safeString(origin, 'intelligence', 'client.origin').trim().toLowerCase();
    return normalized === 'influencer' || normalized === 'influencers';
};

/**
 * Robust ZIP code (CEP) prefix extraction.
 * Removes non-digits and takes the first 5 characters for regional grouping.
 */
export const getZipPrefix = (zipCode?: string): string => {
    // Remove everything that isn't a digit
    const cleaned = safeString(zipCode, 'intelligence', 'client.zipCode').replace(/\D/g, '');
    
    if (!cleaned) return 'Região indefinida';

    // Validate minimum viable length for grouping
    if (cleaned.length < 5) return 'CEP inconsistente';
    
    // Return first 5 digits (prefix 00000)
    return cleaned.substring(0, 5);
};

/**
 * Standard thresholds for Commercial Intelligence.
 * Used as fallback when company-specific settings aren't set.
 */
export const DEFAULT_INTELLIGENCE_THRESHOLDS = {
    daysAtRisk: 15,
    daysInactive: 30,
    performanceDropPercent: 30, // 30% drop
    highPerformanceMinLeads: 3,
    highPerformanceConversion: 50,
    potentialMinConversion: 100,
    potentialMaxLeads: 2
};
/**
 * Normalizes city names to prevent duplicates in grouping.
 */
export const normalizeCity = (city?: string): string => {
    const clean = safeString(city, 'intelligence', 'client.city').trim().toLowerCase();
    if (!clean || clean === 'undefined' || clean === 'null') return '';

    // DIADEMA, diadema -> Diadema
    if (clean === 'diadema') {
        return 'Diadema';
    }

    // SBC, São Bernardo, sao bernardo, etc. -> São Bernardo do Campo
    if (clean === 'sbc' || clean === 'são bernardo' || clean === 'sao bernardo' || clean === 'são bernardo do campo' || clean === 'sao bernardo do campo') {
        return 'São Bernardo do Campo';
    }

    // Capitalize words
    return clean.split(/\s+/).map(word => {
        if (word.length === 0) return '';
        return word[0].toUpperCase() + word.substring(1);
    }).join(' ');
};

/**
 * Normalizes state name to uppercase 2-letter abbreviation.
 */
export const normalizeState = (state?: string, city?: string): string => {
    const cleanState = safeString(state, 'intelligence', 'client.state').trim().toUpperCase();
    if (!cleanState || cleanState === 'UNDEFINED' || cleanState === 'NULL') {
        // If state is empty but we know the city is SBC/Diadema/etc., default to SP
        const cleanCity = safeString(city, 'intelligence', 'client.city').trim().toLowerCase();
        if (cleanCity === 'diadema' || cleanCity === 'sbc' || cleanCity.includes('são bernardo') || cleanCity.includes('sao bernardo') || cleanCity === 'são paulo' || cleanCity === 'sao paulo' || cleanCity === 'mauá' || cleanCity === 'maua' || cleanCity === 'santo andré' || cleanCity === 'santo andre' || cleanCity === 'são caetano' || cleanCity === 'sao caetano' || cleanCity === 'guarulhos' || cleanCity === 'osasco' || cleanCity === 'aricanduva' || cleanCity === 'suzano') {
            return 'SP';
        }
        return '';
    }
    return cleanState;
};

/**
 * Returns a display-friendly region key (e.g., "Diadema - SP").
 * Uses a strict fallback hierarchy as defined by commercial intelligence rules.
 */
export const getClientRegionLabel = (record?: any, client?: any): string => {
    // 1. client.regionLabel
    if (client?.regionLabel) return client.regionLabel;

    // Helper functions for parsing
    const cCity = client?.city || client?.cidade || client?.clientCity;
    const cState = client?.state || client?.estado || client?.clientState;
    const cNeigh = client?.neighborhood || client?.bairro || client?.clientNeighborhood;

    const normCCity = normalizeCity(cCity);
    const normCState = normalizeState(cState, cCity);

    // 2. client.neighborhood + client.city + client.state (if neighborhood exists)
    if (cNeigh && normCCity && normCState) return `${cNeigh} - ${normCCity} - ${normCState}`;
    if (cNeigh && normCCity) return `${cNeigh} - ${normCCity}`;

    // 3. client.city + client.state
    if (normCCity && normCState) return `${normCCity} - ${normCState}`;
    if (normCCity) return normCCity;

    // 4. client.address.city + client.address.state
    const address = client?.address || {};
    const addrCity = normalizeCity(address.city || address.cidade);
    const addrState = normalizeState(address.state || address.estado, addrCity);
    if (addrCity && addrState) return `${addrCity} - ${addrState}`;
    if (addrCity) return addrCity;

    // 5. record fallback (snapshot on quote/contract)
    if (record?.clientRegionLabel) return record.clientRegionLabel;
    
    const rCity = record?.clientCity || record?.city || record?.cidade || record?.customerCity || record?.customer?.city || record?.customer?.address?.city;
    const rState = record?.clientState || record?.state || record?.estado || record?.customerState || record?.customer?.state || record?.customer?.address?.state;
    const rNeigh = record?.clientNeighborhood || record?.neighborhood || record?.bairro || record?.customerNeighborhood || record?.customer?.neighborhood || record?.customer?.address?.neighborhood;

    const normRCity = normalizeCity(rCity);
    const normRState = normalizeState(rState, rCity);

    if (rNeigh && normRCity && normRState) return `${rNeigh} - ${normRCity} - ${normRState}`;
    if (rNeigh && normRCity) return `${rNeigh} - ${normRCity}`;
    if (normRCity && normRState) return `${normRCity} - ${normRState}`;
    if (normRCity) return normRCity;

    // 6. Final attempt parsing an unstructured string address
    const stringAddress = record?.address || client?.address;
    if (typeof stringAddress === 'string') {
        const match = stringAddress.match(/([^,-]+)[\s,-]+([A-Z]{2})$/i);
        if (match && match[1] && match[2]) {
            const parsedCity = normalizeCity(match[1].trim());
            const parsedState = normalizeState(match[2].trim().toUpperCase(), parsedCity);
            if (parsedCity && parsedState) return `${parsedCity} - ${parsedState}`;
        }
    }

    return 'Região não informada';
};

export const getCanonicalRegionLabel = (record?: any, client?: any): string => {
    // 1. Helper functions for parsing from client
    const cCity = client?.city || client?.cidade || client?.clientCity;
    const cState = client?.state || client?.estado || client?.clientState;

    const normCCity = normalizeCity(cCity);
    const normCState = normalizeState(cState, cCity);

    if (normCCity && normCState) return `${normCCity} - ${normCState.toUpperCase()}`;
    if (normCCity) return normCCity;

    // 2. from record
    const rCity = record?.clientCity || record?.city || record?.cidade || record?.customerCity || record?.customer?.city || record?.customer?.address?.city;
    const rState = record?.clientState || record?.state || record?.estado || record?.customerState || record?.customer?.state || record?.customer?.address?.state;

    const normRCity = normalizeCity(rCity);
    const normRState = normalizeState(rState, rCity);

    if (normRCity && normRState) return `${normRCity} - ${normRState.toUpperCase()}`;
    if (normRCity) return normRCity;

    // 3. from string address
    const stringAddress = record?.address || client?.address;
    if (typeof stringAddress === 'string') {
        const match = stringAddress.match(/([^,-]+)[\s,-]+([A-Z]{2})$/i);
        if (match && match[1] && match[2]) {
            const parsedCity = normalizeCity(match[1].trim());
            const parsedState = normalizeState(match[2].trim().toUpperCase(), parsedCity);
            if (parsedCity && parsedState) return `${parsedCity} - ${parsedState.toUpperCase()}`;
        }
    }

    // 4. fallback se houver regionLabel legado mas tentar limpar o bairro
    const legacyLabel = record?.clientRegionLabel || client?.regionLabel || getClientRegionLabel(record, client);
    if (legacyLabel && legacyLabel !== 'Região não informada') {
       const parts = legacyLabel.split('-').map((p: string) => p.trim());
       if (parts.length >= 2) {
           const statePart = parts[parts.length - 1];
           const cityPart = parts[parts.length - 2];
           return `${cityPart} - ${statePart.toUpperCase()}`;
       }
       return legacyLabel;
    }

    return 'Região não informada';
};

export const normalizeRegionKey = (region?: string): string => {
    if (!region || region === 'Região não informada') return 'regiao_nao_informada';
    let normalized = region.toLowerCase().trim();
    // remover acentos
    normalized = normalized.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    // remover pontuação extra e trocar espaço/hífen por underscore
    normalized = normalized.replace(/[^a-z0-9]+/g, "_");
    // remover duplicados e trim nas pontas
    normalized = normalized.replace(/_+/g, "_").replace(/^_|_$/g, "");
    return normalized || 'regiao_nao_informada';
};

// Aliasing for backward compatibility if needed, though we will update callers
export const getRegionKey = getClientRegionLabel;

