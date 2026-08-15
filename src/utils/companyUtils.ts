export function normalizeCompanyName(name: string): string {
    return name
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove accents
        .replace(/[^a-z0-9]/g, ''); // Remove special characters
}

export function generateSuggestedNames(originalName: string, city?: string): string[] {
    const year = new Date().getFullYear();
    const suggestions = [
        `${originalName} 2`,
        `${originalName} ${year}`
    ];

    if (city) {
        suggestions.push(`${originalName} ${city}`);
    }

    return suggestions;
}
