export const getEffectiveFollowUpCount = (q: any): number => {
    // 1. Se followUpCount existir e for válido entre 0 e 4
    if (q.followUpCount !== undefined && q.followUpCount !== null) {
        const count = Number(q.followUpCount);
        if (!isNaN(count) && count >= 0 && count <= 4) {
            return count;
        }
    }
    
    // 2. Caso exista histórico oficial confiável
    if (Array.isArray(q.followUpHistory) && q.followUpHistory.length > 0) {
        const followUpsInHistory = q.followUpHistory.filter((h: any) => 
            h.type === 'follow_up' || h.type === 'first_follow_up' || (typeof h.contactNumber === 'number' && h.contactNumber > 0)
        );
        if (followUpsInHistory.length > 0) {
            const maxContactNumber = Math.max(...followUpsInHistory.map((h: any) => h.contactNumber || 0));
            const countFromHistory = Math.max(maxContactNumber, followUpsInHistory.length);
            if (countFromHistory >= 0 && countFromHistory <= 4) {
                return countFromHistory;
            }
            return 4;
        }
    }
    
    // 3 & 4. Se existirem timestamps indicando contato, consideramos apenas evidência de pelo menos 1 contato
    if (q.firstFollowUpSentAt || q.lastFollowUpAt || q.followUpLastAt || q.firstContactAt || q.lastContactAt) {
        return 1;
    }
    
    return 0;
};

export const getFollowUpTab = (q: any): 'contact0' | 'contact1' | 'contact2' | 'contact3' | 'contact4' | 'finalized' => {
    if (q.followUpStatus === 'completed' || q.followUpFinishedAt || q.status === 'approved' || q.status === 'converted' || q.status === 'rejected' || q.status === 'lost') {
        return 'finalized';
    }
    const count = getEffectiveFollowUpCount(q);
    if (count === 0) {
        return 'contact0';
    }
    if (count === 1) {
        return 'contact1';
    }
    if (count === 2) {
        return 'contact2';
    }
    if (count === 3) {
        return 'contact3';
    }
    if (count === 4) {
        return 'contact4';
    }
    return 'finalized';
};
