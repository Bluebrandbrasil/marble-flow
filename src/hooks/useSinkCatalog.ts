import { useState, useEffect } from 'react';
import type { SinkModel } from '../types';

const STORAGE_KEY = 'marble-flow-sinks';

const DEFAULT_SINKS: SinkModel[] = [
    {
        id: '1',
        name: 'Cuba Esculpida',
        photoUrl: '' // Placeholder or default
    },
    {
        id: '2',
        name: 'Cuba Inox Tramontina',
        photoUrl: ''
    }
];

export function useSinkCatalog() {
    const [sinks, setSinks] = useState<SinkModel[]>(() => {
        const saved = localStorage.getItem(STORAGE_KEY);
        return saved ? JSON.parse(saved) : DEFAULT_SINKS;
    });

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(sinks));
    }, [sinks]);

    const addSink = (sink: Omit<SinkModel, 'id'>) => {
        const newSink = { ...sink, id: Date.now().toString() };
        setSinks(prev => [...prev, newSink]);
    };

    const removeSink = (id: string) => {
        setSinks(prev => prev.filter(s => s.id !== id));
    };

    const updateSink = (id: string, updates: Partial<SinkModel>) => {
        setSinks(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
    };

    return { sinks, addSink, removeSink, updateSink };
}
