import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, type User, signOut } from 'firebase/auth';
import { doc, onSnapshot, setDoc, getDocs, query, collection, where, deleteDoc } from 'firebase/firestore';
import { auth, db, messaging } from '../lib/firebase';
import { normalizeUser } from '../lib/dataDiagnostics';
import { getToken, onMessage, deleteToken } from 'firebase/messaging';

export interface UserProfile {
    uid: string;
    name: string;
    email: string;
    role: 'superadmin' | 'company_admin' | 'admin' | 'vendedor' | 'seller' | 'financeiro' | 'medidor' | 'instalador' | 'producao' | 'outro';
    status: 'pending' | 'approved' | 'rejected' | 'blocked';
    companyId: string;
    company?: {
        name?: string;
        normalizedName?: string;
        status: 'pending' | 'approved' | 'rejected' | 'blocked';
    };
    photoUrl?: string;
    cpf?: string;
    phone?: string;
    bloodType?: string;
    createdAt: any;
}

export interface Company {
    id: string;
    name: string;
    normalizedName: string;
    status: 'pending' | 'approved' | 'blocked' | 'rejected';
    createdAt: any;
}

interface AuthContextType {
    user: User | null;
    profile: UserProfile | null;
    loading: boolean;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    profile: null,
    loading: true,
    logout: async () => { },
});

export const useAuth = () => useContext(AuthContext);

// Deterministic SHA-256 helper for client-side hashing
async function sha256(message: string): Promise<string> {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

interface ForegroundNotification {
    title: string;
    body: string;
    clientName?: string;
    scheduledTime?: string;
    address?: string;
    googleMapsUrl?: string;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeNotification, setActiveNotification] = useState<ForegroundNotification | null>(null);

    const setupNotifications = async (uid: string, companyId: string) => {
        if (!messaging) return;

        try {
            const permission = await Notification.requestPermission();
            if (permission === 'granted') {
                const vapidKey = import.meta.env.VITE_FIREBASE_FCM_VAPID_KEY;
                if (!vapidKey) {
                    console.error("VITE_FIREBASE_FCM_VAPID_KEY is not defined.");
                    return;
                }

                const token = await getToken(messaging, { vapidKey });
                if (token) {
                    localStorage.setItem('fcm_token', token);
                    const tokenId = await sha256(token);
                    const tokenDocRef = doc(db, 'users', uid, 'notificationTokens', tokenId);
                    await setDoc(tokenDocRef, {
                        token,
                        companyId,
                        role: "medidor",
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                        userAgent: navigator.userAgent,
                        active: true
                    }, { merge: true });
                }
            }
        } catch (error) {
            console.error("Error setting up notifications:", error);
        }
    };

    useEffect(() => {
        let unsubscribeUser: (() => void) | undefined;
        let unsubscribeCompany: (() => void) | undefined;

        const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {

            if (unsubscribeUser) unsubscribeUser();
            if (unsubscribeCompany) unsubscribeCompany();

            try {
                if (currentUser) {
                    setUser(currentUser);

                    // Log token claims temporarily
                    try {
                        const tokenResult = await currentUser.getIdTokenResult(true);
                        console.log("[CLAIMS_DEBUG]", tokenResult.claims);
                    } catch (err) {
                        console.error("[CLAIMS_DEBUG] Error fetching token result:", err);
                    }

                    const userDocRef = doc(db, 'users', currentUser.uid);

                    // Use onSnapshot to strictly subscribe to profile updates in real-time
                    unsubscribeUser = onSnapshot(userDocRef, async (userDocSnap) => {
                        type Role = UserProfile['role'];

                        if (userDocSnap.exists()) {
                            const userData = userDocSnap.data() as UserProfile;

                            // Fetch current claims dynamic check to force refresh if they are out of sync
                            const currentToken = await currentUser.getIdTokenResult();
                            let activeClaims = currentToken.claims;

                            if (
                                activeClaims.companyId !== userData.companyId ||
                                activeClaims.role !== userData.role ||
                                activeClaims.status !== userData.status
                            ) {
                                const userObj = currentUser as any;
                                const now = Date.now();
                                if (!userObj.lastForcedRefresh || now - userObj.lastForcedRefresh > 15000) {
                                    console.log("Custom claims out of sync. Forcing token refresh...");
                                    userObj.lastForcedRefresh = now;
                                    const newTokenResult = await currentUser.getIdTokenResult(true);
                                    activeClaims = newTokenResult.claims;
                                } else {
                                    console.warn("Custom claims out of sync, but refresh was forced recently. Avoiding infinite loop.");
                                }
                            }

                            // Prioritize claims if available, fallback to Firestore doc
                            const finalRole: Role = (activeClaims.role as Role) || userData.role;
                            const finalCompanyId: string = (activeClaims.companyId as string) || userData.companyId;

                            // Special handling for dynamic superadmin
                            if (finalRole === 'superadmin' && (!finalCompanyId || finalCompanyId === 'system')) {
                                const superAdminProfile: UserProfile = {
                                    ...userData,
                                    uid: currentUser.uid,
                                    name: userData?.name || 'Super Admin',
                                    email: currentUser.email || 'admin@system.local',
                                    role: 'superadmin',
                                    status: 'approved',
                                    companyId: 'system',
                                    company: { name: 'System Admin', status: 'approved' },
                                    createdAt: userData?.createdAt || new Date().toISOString()
                                };
                                setProfile(superAdminProfile);
                                setLoading(false);
                                return;
                            }

                            if (finalCompanyId && finalCompanyId !== 'unassigned') {
                                if (unsubscribeCompany) unsubscribeCompany();

                                // Monitor Company status real-time too
                                unsubscribeCompany = onSnapshot(doc(db, 'companies', finalCompanyId), (companySnap) => {
                                    let companyDetails: Company | undefined;
                                    if (companySnap.exists()) {
                                        companyDetails = { id: companySnap.id, ...companySnap.data() } as Company;
                                    }

                                    const profileData: UserProfile = {
                                        ...userData,
                                        uid: currentUser.uid,
                                        email: currentUser.email || userData.email || '',
                                        role: finalRole as any,
                                        status: userData.status === 'approved' ? 'approved' : userData.status,
                                        companyId: finalCompanyId,
                                        company: companyDetails ? {
                                            name: companyDetails.name,
                                            normalizedName: companyDetails.normalizedName,
                                            status: companyDetails.status === 'approved' ? 'approved' : companyDetails.status as any,
                                            isDeleted: companyDetails.isDeleted
                                        } : userData.company,
                                        createdAt: userData.createdAt || new Date().toISOString()
                                    };

                                    const { data: normalizedProfile, isBlocked } = normalizeUser(profileData);
                                    
                                    if (isBlocked) {
                                        console.error("[AUTH_CRITICAL] Blocking user due to malformed profile document.");
                                    }

                                    setProfile(normalizedProfile as UserProfile);
                                    setLoading(false);
                                });
                            } else {
                                const profileData: UserProfile = {
                                    ...userData,
                                    uid: currentUser.uid,
                                    email: currentUser.email || userData.email || '',
                                    role: finalRole as any,
                                    status: userData.status === 'approved' ? 'approved' : userData.status,
                                    companyId: 'unassigned',
                                    company: userData.company,
                                    createdAt: userData.createdAt || new Date().toISOString()
                                };
                                setProfile(profileData);
                                setLoading(false);
                            }
                        }
                        // 3. Fallback for accounts WITHOUT Firestore doc (New registration or error)
                        else {
                            // Self-Healing Logic: Check if they are actually a Company Admin missing their doc.
                            if (currentUser.email && currentUser.emailVerified) {
                                try {
                                    const compQuery = query(collection(db, 'companies'), where('adminEmail', '==', currentUser.email));
                                    const compSnap = await getDocs(compQuery);

                                    if (!compSnap.empty) {
                                        const compDoc = compSnap.docs[0];
                                        const compData = compDoc.data();
                                        // Re-create the user document so they can enter the system.
                                        // The snapshot listener will automatically catch this write and run the normal flow.
                                        await setDoc(userDocRef, {
                                            uid: currentUser.uid,
                                            name: compData.adminName || currentUser.displayName || 'Admin',
                                            email: currentUser.email,
                                            role: 'company_admin',
                                            companyId: compDoc.id,
                                            status: compData.status === 'approved' ? 'approved' : 'pending',
                                            createdAt: new Date().toISOString()
                                        });
                                        return; // Wait for the next loop
                                    }
                                } catch (e) {
                                    console.error("Auto-heal error:", e);
                                }
                            }

                            const currentToken = await currentUser.getIdTokenResult();
                            const activeClaims = currentToken.claims;

                            const fallbackProfile: UserProfile = {
                                uid: currentUser.uid,
                                name: currentUser.displayName || 'Novo Usuário',
                                email: currentUser.email || '',
                                role: (activeClaims.role as any) || 'vendedor',
                                status: 'pending',
                                companyId: (activeClaims.companyId as string) || 'unassigned',
                                company: { status: 'pending' as any },
                                createdAt: new Date().toISOString()
                            };
                            setProfile(fallbackProfile);
                            setLoading(false);
                        }
                    });
                } else {
                    setUser(null);
                    setProfile(null);
                    setLoading(false);
                }
            } catch (error) {
                console.error("Error in Auth logic:", error);
                setProfile(null);
                setLoading(false);
            }
        });

        return () => {
            unsubscribeAuth();
            if (unsubscribeUser) unsubscribeUser();
            if (unsubscribeCompany) unsubscribeCompany();
        };
    }, []);

    useEffect(() => {
        if (user && profile?.role === 'medidor') {
            setupNotifications(user.uid, profile.companyId);
        }
    }, [user, profile]);

    useEffect(() => {
        if (!messaging || !user || profile?.role !== 'medidor') return;

        const unsubscribe = onMessage(messaging, (payload) => {
            if (payload.notification) {
                const data = payload.data || {};
                setActiveNotification({
                    title: payload.notification.title || "Você tem uma medição em breve",
                    body: payload.notification.body || "",
                    clientName: data.clientName,
                    scheduledTime: data.scheduledTime,
                    address: data.address,
                    googleMapsUrl: data.googleMapsUrl
                });
            }
        });

        return () => unsubscribe();
    }, [user, profile]);

    useEffect(() => {
        if (activeNotification) {
            const timer = setTimeout(() => {
                setActiveNotification(null);
            }, 10000);
            return () => clearTimeout(timer);
        }
    }, [activeNotification]);

    const logout = async () => {
        try {
            if (profile?.role === 'medidor' && messaging) {
                try {
                    const token = localStorage.getItem('fcm_token');
                    if (token) {
                        const tokenId = await sha256(token);
                        const tokenDocRef = doc(db, 'users', profile.uid, 'notificationTokens', tokenId);
                        await deleteDoc(tokenDocRef);
                        await deleteToken(messaging);
                        localStorage.removeItem('fcm_token');
                    }
                } catch (fcmError) {
                    console.error("Failed to clean up FCM token on logout:", fcmError);
                }
            }
            await signOut(auth);
        } catch (error) {
            console.error("Logout failed:", error);
        }
    };

    return (
        <AuthContext.Provider value={{ user, profile, loading, logout }}>
            {children}
            {activeNotification && (
                <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:bottom-6 z-[9999] sm:max-w-md p-4 bg-slate-900/95 backdrop-blur border-l-4 border-brand-emerald border-t border-r border-b border-white/10 rounded-2xl shadow-2xl transition-all duration-300 animate-in fade-in slide-in-from-bottom-5">
                    <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center gap-2">
                            <span className="flex h-2 w-2 relative">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-emerald opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-emerald"></span>
                            </span>
                            <h4 className="text-sm font-bold text-white uppercase tracking-wider">{activeNotification.title}</h4>
                        </div>
                        <button 
                            onClick={() => setActiveNotification(null)} 
                            className="text-slate-400 hover:text-white transition-colors"
                        >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                    <div className="mb-4">
                        <p className="text-sm text-slate-300 mb-2">{activeNotification.body}</p>
                        {activeNotification.clientName && (
                            <div className="text-xs text-slate-400 space-y-1 bg-slate-800/40 p-3 rounded-lg border border-white/5">
                                <div className="flex items-center gap-1.5">
                                    <span className="font-semibold text-slate-300">Cliente:</span> {activeNotification.clientName}
                                </div>
                                {activeNotification.scheduledTime && (
                                    <div className="flex items-center gap-1.5">
                                        <span className="font-semibold text-slate-300">Horário:</span> {activeNotification.scheduledTime}
                                    </div>
                                )}
                                {activeNotification.address && (
                                    <div className="flex items-center gap-1.5">
                                        <span className="font-semibold text-slate-300">Endereço:</span> {activeNotification.address}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                    <div className="flex gap-2">
                        {activeNotification.googleMapsUrl && (
                            <a 
                                href={activeNotification.googleMapsUrl}
                                target="_blank" 
                                rel="noopener noreferrer" 
                                className="flex-1 inline-flex items-center justify-center gap-1.5 bg-brand-emerald text-slate-900 h-9 rounded-xl text-xs font-bold hover:bg-brand-neon transition-colors"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                                Ver Rota
                            </a>
                        )}
                        <button 
                            onClick={() => setActiveNotification(null)}
                            className="flex-1 border border-white/10 hover:bg-white/5 text-white h-9 rounded-xl text-xs font-bold transition-colors"
                        >
                            Fechar
                        </button>
                    </div>
                </div>
            )}
        </AuthContext.Provider>
    );
};
