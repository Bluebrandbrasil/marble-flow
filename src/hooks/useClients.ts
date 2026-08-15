import { safeArray } from '../lib/dataDiagnostics';
import { useState, useEffect } from 'react';
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, where, orderBy, startAt, endAt, limit, getDoc, getDocs } from 'firebase/firestore';
import { toISODateSafe } from '../lib/dateWriteUtils';
import { db } from '../lib/firebase';
import type { Client } from '../types';
import { useAuth } from '../context/AuthContext';
import { normalizeStr, normalizeDigits, isNumericQuery } from '../lib/searchUtils';
import { normalizeClient } from '../lib/dataDiagnostics';
import { syncClientDataToContracts } from '../services/clientSyncService';

export function useClients(searchTerm?: string, statusFilter: 'all' | 'active' | 'inactive' | 'deleted' = 'active') {
    const [clients, setClients] = useState<Client[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<any>(null);
    const [searchMode, setSearchMode] = useState<'name' | 'phone' | 'none'>('none');
    const { user, profile } = useAuth();

    useEffect(() => {
        if (!user || !profile?.companyId) {
            setClients([]);
            setIsLoading(false);
            setSearchMode('none');
            setError(null);
            return;
        }

        setIsLoading(true);
        setError(null);
        const term = searchTerm?.trim() || '';
        const isNumeric = isNumericQuery(term);
        
        setSearchMode(term ? (isNumeric ? 'phone' : 'name') : 'none');

        // Check legacy collection 'clientes' (7)
        const legacyQuery = query(
            collection(db, 'clientes'),
            where('companyId', '==', profile.companyId),
            limit(1)
        );
        getDocs(legacyQuery).then(legacySnap => {
            if (!legacySnap.empty) {
                console.log("Há clientes na coleção legada clientes.");
            }
        }).catch(err => {
            // Ignore legacy check errors
        });

        // 6. Direct count check & query without status filter to capture clients missing the status field
        const baseConstraints = [where('companyId', '==', profile.companyId)];

        const q = query(
            collection(db, 'clients'),
            ...baseConstraints,
            orderBy('createdAt', 'desc'),
            limit(1500)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            // 1. Audit Clients Search logging
            console.log("[CLIENTS_DEBUG] profile:", {
                uid: profile?.uid,
                role: profile?.role,
                companyId: profile?.companyId,
                status: profile?.status
            });

            console.log("[CLIENTS_DEBUG] query companyId:", profile?.companyId);
            console.log("[CLIENTS_DEBUG] snapshot size:", snapshot.size);

            const data = safeArray(snapshot.docs).map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as Client[];
            
            // 4 & 5. Apply filtering and normalization with proper fallbacks in memory
            const filtered = data
                .filter(client => {
                    const normalizedStatus = client.status || "active";

                    let isBlocked = false;
                    let reason = "";

                    if (!client.id) {
                        isBlocked = true;
                        reason = "Missing ID";
                    } else if (client.companyId !== profile.companyId) {
                        isBlocked = true;
                        reason = `companyId mismatch (client: ${client.companyId}, user: ${profile.companyId})`;
                    } else if (normalizedStatus === 'deleted' && statusFilter !== 'deleted') {
                        isBlocked = true;
                        reason = "Status is deleted";
                    }

                    if (isBlocked) {
                        console.warn("[CLIENTS_DEBUG] cliente filtrado:", {
                            id: client.id,
                            name: client.name,
                            status: client.status,
                            companyId: client.companyId,
                            reason
                        });
                        return false;
                    }
                    return true;
                })
                .map(client => {
                    // Apply diagnostics & normalization (Active Layer)
                    const res = normalizeClient(client);
                    return {
                        ...res.data,
                        status: client.status || "active"
                    } as Client;
                })
                .filter(client => {
                    const normalizedStatus = client.status || "active";
                    if (statusFilter !== 'all') {
                        return normalizedStatus === statusFilter;
                    }
                    return true;
                });

            if (term.length > 0) {
                const searchLower = normalizeStr(term);
                const searchDigits = normalizeDigits(term);
                
                // RELEVANCE SCORING & FILTERING
                const scored = safeArray(filtered).map(c => {
                    let score = 0;
                    const cName = c.searchName || normalizeStr(c.name);
                    const cCity = c.searchCity || normalizeStr(c.city);
                    const cPhone = c.searchPhone || normalizeDigits(c.phone);
                    const cDoc = c.searchDocument || normalizeDigits(c.document);

                    // Name check
                    if (cName === searchLower) score += 100;
                    else if (cName.startsWith(searchLower)) score += 50;
                    else if (cName.includes(searchLower)) score += 20;

                    // City check (Letters)
                    if (!isNumeric) {
                        if (cCity === searchLower) score += 80;
                        else if (cCity.startsWith(searchLower)) score += 40;
                        else if (cCity.includes(searchLower)) score += 15;
                    }

                    // Phone/Doc check (Numbers)
                    if (isNumeric) {
                        if (cPhone === searchDigits || cDoc === searchDigits) score += 100;
                        else if (cPhone.startsWith(searchDigits) || cDoc.startsWith(searchDigits)) score += 50;
                        else if (cPhone.includes(searchDigits) || cDoc.includes(searchDigits)) score += 20;
                    }

                    return { ...c, _searchScore: score };
                }).filter(c => (c as any)._searchScore > 0);

                // SORT BY RELEVANCE
                const sorted = scored.sort((a, b) => (b as any)._searchScore - (a as any)._searchScore).slice(0, 50);
                setClients(sorted);
            } else {
                setClients(filtered);
            }
            
            setIsLoading(false);
        }, (err) => {
            console.error('Error fetching clients:', err);
            console.error("[CLIENTS_ERROR]", err);
            setError(err);
            setIsLoading(false);
        });

        return () => unsubscribe();
    }, [user, profile?.companyId, searchTerm, statusFilter]);

    const normalizeClientData = (clientData: any) => {
        return {
            ...clientData,
            searchName: normalizeStr(clientData.name),
            searchPhone: normalizeDigits(clientData.phone),
            searchDocument: normalizeDigits(clientData.document),
            searchCity: normalizeStr(clientData.city)
        };
    };

    const addClient = async (clientData: Omit<Client, 'id' | 'userId' | 'companyId' | 'createdAt' | 'searchName'>) => {
        if (!user || !profile?.companyId) throw new Error('User not authenticated or company not found');

        let finalCity = (clientData.city || '').trim();
        let finalState = (clientData.state || '').trim();
        let finalNeighborhood = (clientData.neighborhood || '').trim();
        let finalStreet = (clientData.street || '').trim();

        const cleanCep = (clientData.zipCode || '').replace(/\D/g, '');
        if (cleanCep.length === 8 && (!finalCity || !finalState || finalCity.toLowerCase() === 'undefined' || finalCity.toLowerCase() === 'null')) {
            try {
                const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
                const data = await response.json();
                if (!data.erro) {
                    finalCity = data.localidade || finalCity;
                    finalState = data.uf || finalState;
                    finalNeighborhood = data.bairro || finalNeighborhood;
                    finalStreet = data.logradouro || finalStreet;
                }
            } catch (e) {
                console.warn("ViaCEP error in addClient:", e);
            }
        }

        if (cleanCep.length >= 1) {
            if (!finalCity || finalCity.toLowerCase() === 'undefined' || finalCity.toLowerCase() === 'null') {
                throw new Error('Cidade inválida ou vazia para o CEP informado.');
            }
            if (!finalState || finalState.toLowerCase() === 'undefined' || finalState.toLowerCase() === 'null') {
                throw new Error('Estado inválido ou vazio para o CEP informado.');
            }
        }

        const regionLabel = (finalCity && finalState) ? `${finalCity} - ${finalState}` : null;

        const processedClientData = {
            ...clientData,
            city: finalCity,
            cidade: finalCity,
            state: finalState,
            estado: finalState,
            neighborhood: finalNeighborhood,
            bairro: finalNeighborhood,
            street: finalStreet,
            regionLabel: regionLabel,
            regionResolvedFrom: cleanCep.length === 8 && (finalCity !== (clientData.city || '').trim()) ? 'viacep' : 'manual',
            regionUpdatedAt: new Date().toISOString()
        };

        const newClient = {
            ...normalizeClientData(processedClientData),
            userId: user.uid,
            companyId: profile.companyId,
            createdAt: toISODateSafe(new Date())
        };

        const docRef = await addDoc(collection(db, 'clients'), newClient);

        // If client is linked to influencer, increment indicatedClientsCount
        if (newClient.origin === 'Influencer' && newClient.influencerId) {
            try {
                const influencerRef = doc(db, 'influencers', newClient.influencerId);
                const influencerSnap = await getDoc(influencerRef);
                if (influencerSnap.exists()) {
                    const currentCount = influencerSnap.data().indicatedClientsCount || 0;
                    await updateDoc(influencerRef, {
                        indicatedClientsCount: currentCount + 1
                    });
                }
            } catch (err) {
                console.error("Error updating influencer indicatedClientsCount:", err);
            }
        }

        return docRef.id;
    };

    const updateClient = async (id: string, clientData: Partial<Client>) => {
        if (!user) throw new Error('User not authenticated');

        let finalCity = (clientData.city !== undefined ? clientData.city : '').trim();
        let finalState = (clientData.state !== undefined ? clientData.state : '').trim();
        let finalNeighborhood = (clientData.neighborhood !== undefined ? clientData.neighborhood : '').trim();
        let finalStreet = (clientData.street !== undefined ? clientData.street : '').trim();

        const cleanCep = (clientData.zipCode || '').replace(/\D/g, '');
        if (cleanCep.length === 8 && (!finalCity || !finalState || finalCity.toLowerCase() === 'undefined' || finalCity.toLowerCase() === 'null')) {
            try {
                const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
                const data = await response.json();
                if (!data.erro) {
                    finalCity = data.localidade || finalCity;
                    finalState = data.uf || finalState;
                    finalNeighborhood = data.bairro || finalNeighborhood;
                    finalStreet = data.logradouro || finalStreet;
                }
            } catch (e) {
                console.warn("ViaCEP error in updateClient:", e);
            }
        }

        if (cleanCep.length >= 1) {
            if (!finalCity || finalCity.toLowerCase() === 'undefined' || finalCity.toLowerCase() === 'null') {
                throw new Error('Cidade inválida ou vazia para o CEP informado.');
            }
            if (!finalState || finalState.toLowerCase() === 'undefined' || finalState.toLowerCase() === 'null') {
                throw new Error('Estado inválido ou vazio para o CEP informado.');
            }
        }

        const regionLabel = (finalCity && finalState) ? `${finalCity} - ${finalState}` : null;

        const processedClientData = {
            ...clientData,
            ...(clientData.city !== undefined || finalCity ? { city: finalCity, cidade: finalCity } : {}),
            ...(clientData.state !== undefined || finalState ? { state: finalState, estado: finalState } : {}),
            ...(clientData.neighborhood !== undefined || finalNeighborhood ? { neighborhood: finalNeighborhood, bairro: finalNeighborhood } : {}),
            ...(clientData.street !== undefined || finalStreet ? { street: finalStreet } : {}),
            ...(regionLabel ? { regionLabel } : {}),
            ...(cleanCep.length === 8 && (finalCity !== (clientData.city || '').trim()) ? { regionResolvedFrom: 'viacep', regionUpdatedAt: new Date().toISOString() } : {})
        };

        const updates = normalizeClientData(processedClientData);

        const docRef = doc(db, 'clients', id);
        let oldSnap: any = null;

        // Fetch old client data to check if influencer changed
        try {
            oldSnap = await getDoc(docRef);
            if (oldSnap.exists()) {
                const oldData = oldSnap.data() as Client;
                
                const oldInfluencerId = oldData.origin === 'Influencer' ? oldData.influencerId : null;
                const newInfluencerId = updates.origin === 'Influencer' ? updates.influencerId : null;

                if (oldInfluencerId !== newInfluencerId) {
                    // Decrement old if it existed
                    if (oldInfluencerId) {
                        const oldInfRef = doc(db, 'influencers', oldInfluencerId);
                        const oldInfSnap = await getDoc(oldInfRef);
                        if (oldInfSnap.exists()) {
                            const currentCount = oldInfSnap.data().indicatedClientsCount || 0;
                            await updateDoc(oldInfRef, {
                                indicatedClientsCount: Math.max(0, currentCount - 1)
                            });
                        }
                    }
                    // Increment new if it exists
                    if (newInfluencerId) {
                        const newInfRef = doc(db, 'influencers', newInfluencerId);
                        const newInfSnap = await getDoc(newInfRef);
                        if (newInfSnap.exists()) {
                            const currentCount = newInfSnap.data().indicatedClientsCount || 0;
                            await updateDoc(newInfRef, {
                                indicatedClientsCount: currentCount + 1
                            });
                        }
                    }
                }
            }
        } catch (err) {
            console.error("Error updating influencer counts on client update:", err);
        }

        await updateDoc(docRef, updates);

        // Name propagation to open/pending entities
        if (updates.name && oldSnap && oldSnap.exists()) {
            const oldName = oldSnap.data().name;
            if (oldName !== updates.name) {
                try {
                    // Update quotes
                    const quotesQuery = query(collection(db, 'orcamentos'), where('clientId', '==', id));
                    const quotesSnap = await getDocs(quotesQuery);
                    const quoteUpdates = quotesSnap.docs
                        .filter(d => d.data().status !== 'assinatura_concluida') // Only unfinalized quotes
                        .map(d => updateDoc(doc(db, 'orcamentos', d.id), { customerName: updates.name }));

                    // Update orders (O.S.)
                    const ordersQuery = query(collection(db, 'pedidos'), where('clientId', '==', id));
                    const ordersSnap = await getDocs(ordersQuery);
                    const orderUpdates = ordersSnap.docs
                        .filter(d => d.data().contractStatus !== 'signed' && d.data().contractStatus !== 'deleted')
                        .map(d => {
                            const data = d.data();
                            const payload: any = { customerName: updates.name };
                            if (data.clientSnapshot) {
                                payload.clientSnapshot = { ...data.clientSnapshot, name: updates.name };
                            }
                            if (data.contractSnapshot) {
                                payload.contractSnapshot = { ...data.contractSnapshot, customerName: updates.name };
                            }
                            return updateDoc(doc(db, 'pedidos', d.id), payload);
                        });

                    await Promise.all([...quoteUpdates, ...orderUpdates]);
                } catch (err) {
                    console.error("Error propagating client name update:", err);
                }
            }
        }
        
        // Sync contracts with full client data
        const syncResult = await syncClientDataToContracts(id, processedClientData);
        return syncResult;
    };

    const deleteClient = async (id: string) => {
        if (!user) throw new Error('User not authenticated');

        await deleteDoc(doc(db, 'clients', id));
    };

    return {
        clients,
        isLoading,
        error,
        searchMode,
        addClient,
        updateClient,
        deleteClient
    };
}
