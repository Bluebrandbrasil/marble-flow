export function normalizeText(text: string): string {
    let normalized = String(text || '').toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .trim().replace(/\s+/g, ' ');

    // remover caracteres especiais desnecessários
    normalized = normalized.replace(/[^\w\s]/g, '');
    
    return normalized;
}

export function getSearchTokens(text: string, expandAliases = false): string[] {
    const normalized = normalizeText(text);
    if (!normalized) return [];
    
    const tokens = new Set<string>();
    
    const aliasesMap: Record<string, string[]> = {
        'stellar': ['stellar', 'stelar', 'branco stellar', 'quartzo stellar'],
        'stelar': ['stellar', 'stelar', 'branco stellar', 'quartzo stellar'],
        'preto': ['preto', 'pretos', 'sao gabriel'],
        'pretos': ['preto', 'pretos', 'sao gabriel'],
        'itaunas': ['itaunas', 'itaúna', 'itaúna', 'branco itaunas'],
        'sao gabriel': ['sao gabriel', 'preto sao gabriel'],
        'brancos': ['branco'],
        'cinzas': ['cinza'],
        'verdes': ['verde'],
        'claros': ['claro'],
        'escuros': ['escuro'],
        'granitos': ['granito'],
        'quartzos': ['quartzo'],
        'pitaya': ['pitaya', 'branco pitaya']
    };

    normalized.split(' ').forEach(word => {
        tokens.add(word);
        if (expandAliases && aliasesMap[word]) {
            aliasesMap[word].forEach(alias => tokens.add(alias));
        }
    });
    
    // Also add the whole phrase and its aliases
    tokens.add(normalized);
    if (expandAliases && aliasesMap[normalized]) {
        aliasesMap[normalized].forEach(alias => tokens.add(alias));
    }

    return Array.from(tokens);
}


export function normalizeMaterialKey(material: any): string {
    const name = normalizeText(material.name || '');
    const price = Number(material.price || 0).toFixed(2);
    
    // Removido category/type para garantir que Branco Pitaya R$ 2420/m² apareça apenas uma vez
    return `${name}_${price}`;
}

export function deduplicateMaterials(materials: any[]): any[] {
    const seen = new Set<string>();
    const deduplicated = [];

    for (const material of materials) {
        const key = normalizeMaterialKey(material);
        if (!seen.has(key)) {
            seen.add(key);
            deduplicated.push(material);
        }
    }

    return deduplicated;
}

export function searchMaterials(materials: any[], query: string): any[] {
    const normalizedQuery = normalizeText(query);
    if (!normalizedQuery) return materials;

    return materials.filter(material => {
        const nameText = normalizeText(material.name || '');
        const colorText = normalizeText(material.color || '');
        const categoryText = normalizeText(material.type || material.category || '');
        
        let keywordsText = '';
        if (Array.isArray(material.keywords)) {
            keywordsText = material.keywords.map((k: string) => normalizeText(k)).join(' ');
        }
        let aliasesText = '';
        if (Array.isArray(material.aliases)) {
            aliasesText = material.aliases.map((a: string) => normalizeText(a)).join(' ');
        }

        const searchableText = `${nameText} ${colorText} ${categoryText} ${keywordsText} ${aliasesText}`;

        const queryWords = normalizedQuery.split(' ').filter(Boolean);
        
        return queryWords.every(qWord => {
            const synonyms = getSearchTokens(qWord, true);
            return synonyms.some(syn => searchableText.includes(syn));
        });
    }).sort((a, b) => {
        const nameA = normalizeText(a.name || '');
        const nameB = normalizeText(b.name || '');

        const exactA = nameA === normalizedQuery ? 1 : 0;
        const exactB = nameB === normalizedQuery ? 1 : 0;
        if (exactA !== exactB) return exactB - exactA;

        const startsA = nameA.startsWith(normalizedQuery) ? 1 : 0;
        const startsB = nameB.startsWith(normalizedQuery) ? 1 : 0;
        if (startsA !== startsB) return startsB - startsA;

        const containsA = nameA.includes(normalizedQuery) ? 1 : 0;
        const containsB = nameB.includes(normalizedQuery) ? 1 : 0;
        if (containsA !== containsB) return containsB - containsA;
        
        return 0;
    });
}

