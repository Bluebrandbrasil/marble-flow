import type { UserProfile } from '../context/AuthContext';

/**
 * Technical Governance Helper: isSuperAdmin
 * 
 * Centralized logic to identify the system's oversight authority (SuperAdmin).
 * Uses a combination of role-based check and a secure email fallback for 
 * emergency technical access.
 */
export const isSuperAdmin = (profile: UserProfile | null): boolean => {
    if (!profile) return false;
    
    // 1. Role-Based Check (RBAC)
    if (profile.role === 'superadmin') return true;
    
    // 2. Technical Fallback / Emergency Authority
    // This ensures technical oversight even if Firestore roles are scrambled
    const superAdminEmailFallback = 'rdmarketingcomercial@gmail.com';
    return profile.email === superAdminEmailFallback;
};
