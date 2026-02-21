import { useState, useEffect } from 'react';
import type { StaffModel } from '../types';

const STORAGE_KEY = 'marble-flow-staff';

const DEFAULT_STAFF: StaffModel[] = [
    { id: '1', name: 'João Silva', role: 'Serrador' },
    { id: '2', name: 'Marcos Almeida', role: 'Instalador' }
];

export function useStaffCatalog() {
    const [staff, setStaff] = useState<StaffModel[]>(() => {
        const saved = localStorage.getItem(STORAGE_KEY);
        return saved ? JSON.parse(saved) : DEFAULT_STAFF;
    });

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(staff));
    }, [staff]);

    const addStaff = (member: Omit<StaffModel, 'id'>) => {
        const newMember = { ...member, id: Date.now().toString() };
        setStaff(prev => [...prev, newMember]);
    };

    const removeStaff = (id: string) => {
        setStaff(prev => prev.filter(s => s.id !== id));
    };

    return { staff, addStaff, removeStaff };
}
