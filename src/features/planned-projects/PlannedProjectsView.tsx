import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/Tabs';
import { PlannedProjectsListTab } from './PlannedProjectsListTab';
import { PlannedProjectFormTab } from './PlannedProjectFormTab';
import { PlannedCatalogTab } from './PlannedCatalogTab';
import { PlannedSettingsTab } from './PlannedSettingsTab';
import { PencilRuler, FolderKanban, PlusCircle, Package, Settings } from 'lucide-react';

export const PlannedProjectsView: React.FC = () => {
    const [activeTab, setActiveTab] = useState<string>('projetos');
    const [editProjectId, setEditProjectId] = useState<string | null>(null);

    const handleEditProject = (projectId: string) => {
        setEditProjectId(projectId);
        setActiveTab('novo-projeto');
    };

    const handleNewProjectTabClick = () => {
        setEditProjectId(null);
        setActiveTab('novo-projeto');
    };

    const handleSaveSuccess = () => {
        setEditProjectId(null);
        setActiveTab('projetos');
    };

    const handleBackToList = () => {
        setEditProjectId(null);
        setActiveTab('projetos');
    };

    return (
        <div className="space-y-6 p-1 md:p-4">
            {/* View Header */}
            <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-brand-rocha-primary/10 rounded-2xl flex items-center justify-center text-brand-rocha-primary shrink-0 shadow-lg shadow-brand-rocha-primary/5">
                    <PencilRuler className="h-6 w-6" />
                </div>
                <div>
                    <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight uppercase">Módulo de Planejados</h1>
                    <p className="text-sm text-slate-400 font-bold uppercase tracking-wider">Gestão Comercial de Móveis Planejados</p>
                </div>
            </div>

            {/* Radix Tabs Component */}
            <Tabs value={activeTab} onValueChange={(val) => {
                // Reset edit mode when switching tabs
                if (val !== 'novo-projeto') {
                    setEditProjectId(null);
                }
                setActiveTab(val);
            }} className="w-full">
                <TabsList className="bg-slate-100 dark:bg-slate-800 p-1 rounded-xl h-11 border border-slate-200/50 mb-6">
                    <TabsTrigger 
                        value="projetos" 
                        className="rounded-lg h-9 px-4 text-xs font-bold uppercase tracking-wider flex items-center gap-2"
                    >
                        <FolderKanban className="h-4 w-4" />
                        Projetos
                    </TabsTrigger>
                    <TabsTrigger 
                        value="novo-projeto" 
                        onClick={handleNewProjectTabClick}
                        className="rounded-lg h-9 px-4 text-xs font-bold uppercase tracking-wider flex items-center gap-2"
                    >
                        <PlusCircle className="h-4 w-4" />
                        {editProjectId ? 'Editar Projeto' : 'Novo Projeto'}
                    </TabsTrigger>
                    <TabsTrigger 
                        value="produtos" 
                        className="rounded-lg h-9 px-4 text-xs font-bold uppercase tracking-wider flex items-center gap-2"
                    >
                        <Package className="h-4 w-4" />
                        Cadastros
                    </TabsTrigger>
                    <TabsTrigger 
                        value="configuracoes" 
                        className="rounded-lg h-9 px-4 text-xs font-bold uppercase tracking-wider flex items-center gap-2"
                    >
                        <Settings className="h-4 w-4" />
                        Configurações
                    </TabsTrigger>
                </TabsList>

                {/* Tab Contents */}
                <TabsContent value="projetos" className="focus-visible:outline-none">
                    <PlannedProjectsListTab onEditProject={handleEditProject} />
                </TabsContent>

                <TabsContent value="novo-projeto" className="focus-visible:outline-none">
                    <PlannedProjectFormTab 
                        projectId={editProjectId}
                        onBack={handleBackToList}
                        onSaveSuccess={handleSaveSuccess}
                    />
                </TabsContent>

                <TabsContent value="produtos" className="focus-visible:outline-none">
                    <PlannedCatalogTab />
                </TabsContent>

                <TabsContent value="configuracoes" className="focus-visible:outline-none">
                    <PlannedSettingsTab />
                </TabsContent>
            </Tabs>
        </div>
    );
};
