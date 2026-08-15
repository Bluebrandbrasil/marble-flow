export const applyCepMask = (value: string) => {
    let clean = value.replace(/\D/g, '');
    if (clean.length > 8) {
        clean = clean.substring(0, 8);
    }
    if (clean.length > 5) {
        return `${clean.substring(0, 5)}-${clean.substring(5)}`;
    }
    return clean;
};
