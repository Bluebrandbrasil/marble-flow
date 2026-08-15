import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, deleteDoc, orderBy } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../context/AuthContext';
import { StoreVisit } from '../../types';
import { StoreVisitCard } from './StoreVisitCard';
import { StoreVisitFormModal } from './StoreVisitFormModal';
import { Button } from '../../components/ui/Button';
import { Plus, Search, Calendar as CalendarIcon, Users } from 'lucide-react';
import { format, isSameDay, startOfDay, endOfDay, startOfWeek, endOfWeek, eachDayOfInterval, addMonths, subMonths, isSameMonth, isToday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn, safeString } from '../../lib/utils';
import { calculateSearchScore, normalizeStr } from '../../lib/searchUtils';
import { useNavigate } from 'react-router-dom';

export const StoreVisitsView: React.FC = () => {
    const { profile } = useAuth();
    const navigate = useNavigate();
    const [visits, setVisits] = useState<StoreVisit[]>([]);
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
    const [searchText, setSearchText] = useState('');
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [selectedVisit, setSelectedVisit] = useState<StoreVisit | null>(null);

    useEffect(() => {
        if (!profile?.companyId) return;

        const q = query(
            collection(db, 'store_visits'),
            where('companyId', '==', profile.companyId)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as StoreVisit[];
            setVisits(data.sort((a, b) => {
                const dateA = a.visitDate ? new Date(a.visitDate + 'T' + (a.visitTime || '00:00')) : null;
                const dateB = b.visitDate ? new Date(b.visitDate + 'T' + (b.visitTime || '00:00')) : null;

                const timeA = dateA && !isNaN(dateA.getTime()) ? dateA.getTime() : null;
                const timeB = dateB && !isNaN(dateB.getTime()) ? dateB.getTime() : null;

                if (timeA === null && timeB === null) return 0;
                if (timeA === null) return 1;
                if (timeB === null) return -1;

                return timeB - timeA;
            }));
        });

        return () => unsubscribe();
    }, [profile?.companyId]);

    const filteredVisits = useMemo(() => {
        let filtered = visits;

        if (selectedDate) {
            filtered = filtered.filter(v => {
                if (!v.visitDate) return false;
                const d = new Date(v.visitDate + 'T12:00:00');
                if (isNaN(d.getTime())) return false;
                return isSameDay(d, selectedDate);
            });
        }

        if (searchText.trim()) {
            const term = normalizeStr(searchText);
            filtered = filtered.filter(v => {
                const maxScore = Math.max(
                    calculateSearchScore(v.clientName, term),
                    calculateSearchScore(v.clientPhone, term, true),
                    calculateSearchScore(v.sellerName, term),
                    calculateSearchScore(v.status, term),
                    calculateSearchScore(v.interest || '', term)
                );
                return maxScore > 0;
            });
        }

        return filtered;
    }, [visits, selectedDate, searchText]);

    // Calendar logic
    const firstDayOfMonth = startOfDay(new Date(currentDate.getFullYear(), currentDate.getMonth(), 1));
    const lastDayOfMonth = endOfDay(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0));
    const startDate = startOfWeek(firstDayOfMonth);
    const endDate = endOfWeek(lastDayOfMonth);
    const days = eachDayOfInterval({ start: startDate, end: endDate });
    const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

    const handleStatusChange = async (visit: StoreVisit, newStatus: StoreVisit['status'], e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            await updateDoc(doc(db, 'store_visits', visit.id), {
                status: newStatus,
                updatedAt: new Date().toISOString()
            });
        } catch (error) {
            console.error('Error updating status:', error);
        }
    };

    const handleWhatsApp = (visit: StoreVisit, e: React.MouseEvent) => {
        e.stopPropagation();
        const clientPhoneStr = safeString(visit?.clientPhone).trim();
        if (!clientPhoneStr) return;
        const phone = clientPhoneStr.replace(/\D/g, '');
        window.open(`https://wa.me/55${phone}`, '_blank');
    };

    const handleCreateQuote = (visit: StoreVisit, e: React.MouseEvent) => {
        e.stopPropagation();
        navigate(`/orcamentos/novo?clientId=${visit.clientId || ''}&storeVisitId=${visit.id}`, {
            state: {
                prefilledQuoteData: {
                    clientId: visit.clientId,
                    customerName: visit.clientName,
                    customerPhone: visit.clientPhone || '',
                    status: 'draft',
                    sellerId: visit.sellerId,
                    sellerName: visit.sellerName,
                    leadOrigin: 'Visita na Loja',
                    origin: 'Visita na Loja'
                }
            }
        });
    };

    return (
        <div className="flex h-[calc(100vh-64px)] overflow-hidden bg-slate-50">
            {/* Left: Calendar & Filters */}
            <div className="w-[350px] shrink-0 border-r border-slate-200 bg-white flex flex-col hidden lg:flex">
                <div className="p-4 border-b border-slate-200">
                    <h2 className="font-black text-lg text-slate-900 mb-4 flex items-center gap-2">
                        <Users className="w-5 h-5 text-brand-rocha-primary" />
                        Visitas na Loja
                    </h2>
                    <Button onClick={() => { setSelectedVisit(null); setIsFormOpen(true); }} className="w-full justify-center">
                        <Plus className="w-4 h-4 mr-2" />
                        Nova Visita
                    </Button>
                </div>

                {/* Calendar */}
                <div className="p-4 border-b border-slate-200 bg-slate-50/50">
                    <div className="flex items-center justify-between mb-4">
                        <button onClick={() => setCurrentDate(subMonths(currentDate, 1))} className="p-1 hover:bg-slate-200 rounded">
                            <span className="text-xl">‹</span>
                        </button>
                        <h3 className="font-bold text-slate-700 capitalize">
                            {format(currentDate, 'MMMM yyyy', { locale: ptBR })}
                        </h3>
                        <button onClick={() => setCurrentDate(addMonths(currentDate, 1))} className="p-1 hover:bg-slate-200 rounded">
                            <span className="text-xl">›</span>
                        </button>
                    </div>

                    <div className="grid grid-cols-7 gap-1 mb-2">
                        {weekDays.map(day => (
                            <div key={day} className="text-center text-[10px] font-bold text-slate-400 uppercase">
                                {day}
                            </div>
                        ))}
                    </div>

                    <div className="grid grid-cols-7 gap-1">
                        {days.map((day, i) => {
                            const isCurrentMonth = isSameMonth(day, currentDate);
                            const isSelected = selectedDate && isSameDay(day, selectedDate);
                            const isTodayDate = isToday(day);
                            
                            // Check if has visits
                            const dayVisits = visits.filter(v => {
                                if (!v.visitDate) return false;
                                const d = new Date(v.visitDate + 'T12:00:00');
                                if (isNaN(d.getTime())) return false;
                                return isSameDay(d, day);
                            });
                            
                            return (
                                <button
                                    key={i}
                                    onClick={() => setSelectedDate(day)}
                                    className={cn(
                                        "h-8 flex items-center justify-center rounded-lg text-xs font-medium relative transition-colors",
                                        !isCurrentMonth && "text-slate-300",
                                        isCurrentMonth && !isSelected && !isTodayDate && "text-slate-700 hover:bg-slate-100",
                                        isTodayDate && !isSelected && "bg-brand-rocha-primary/10 text-brand-rocha-primary font-bold",
                                        isSelected && "bg-brand-rocha-primary text-white shadow-md font-bold"
                                    )}
                                >
                                    {format(day, 'd')}
                                    {dayVisits.length > 0 && (
                                        <div className="absolute bottom-1 w-1 h-1 rounded-full bg-emerald-500" />
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Right: List of Visits */}
            <div className="flex-1 flex flex-col min-w-0 bg-slate-50/50">
                <div className="p-4 md:p-6 flex flex-col sm:flex-row gap-4 items-center justify-between border-b border-slate-200 bg-white">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-brand-rocha-primary/10 flex items-center justify-center shrink-0">
                            <CalendarIcon className="w-5 h-5 text-brand-rocha-primary" />
                        </div>
                        <div>
                            <h1 className="text-xl font-black text-slate-900 tracking-tight">
                                {selectedDate ? format(selectedDate, "dd 'de' MMMM", { locale: ptBR }) : 'Todas as Visitas'}
                            </h1>
                            <p className="text-sm font-medium text-slate-500">
                                {filteredVisits.length} visita(s) encontrada(s)
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 w-full sm:w-auto">
                        <div className="relative w-full sm:w-64">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Buscar visita..."
                                value={searchText}
                                onChange={(e) => setSearchText(e.target.value)}
                                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-rocha-primary/20 focus:border-brand-rocha-primary transition-all"
                            />
                        </div>
                        <Button onClick={() => { setSelectedDate(null); setSearchText(''); }} variant="outline" className="hidden sm:flex">
                            Limpar Filtros
                        </Button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 md:p-6">
                    {filteredVisits.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-slate-400">
                            <Users className="w-12 h-12 mb-4 opacity-20" />
                            <p className="text-lg font-medium">Nenhuma visita encontrada.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                            {filteredVisits.map(visit => (
                                <StoreVisitCard 
                                    key={visit.id} 
                                    visit={visit} 
                                    onClick={() => {
                                        setSelectedVisit(visit);
                                        setIsFormOpen(true);
                                    }}
                                    onWhatsApp={(e) => handleWhatsApp(visit, e)}
                                    onCreateQuote={(e) => handleCreateQuote(visit, e)}
                                    onStatusChange={(status, e) => handleStatusChange(visit, status, e)}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {isFormOpen && (
                <StoreVisitFormModal
                    isOpen={isFormOpen}
                    onClose={() => {
                        setIsFormOpen(false);
                        setSelectedVisit(null);
                    }}
                    visit={selectedVisit}
                    selectedDate={selectedDate || new Date()}
                />
            )}
        </div>
    );
};
