import React from 'react';
import { useSettings } from '../../hooks/useSettings';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/Tabs';
import { Save, Plus, Trash2, Image as ImageIcon } from 'lucide-react';
import { useMaterialCatalog } from '../../hooks/useMaterialCatalog';
import { useSinkCatalog } from '../../hooks/useSinkCatalog';
import { useStaffCatalog } from '../../hooks/useStaffCatalog';
import { useAccessoryCatalog } from '../../hooks/useAccessoryCatalog';

export const SettingsPage: React.FC = () => {
    const { settings, updateSettings } = useSettings();
    const [formData, setFormData] = React.useState(settings);
    const [showSuccess, setShowSuccess] = React.useState(false);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setFormData(prev => ({ ...prev, logoUrl: reader.result as string }));
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        updateSettings(formData);
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 3000);
    };

    return (
        <div className="h-[calc(100vh-100px)] overflow-y-auto pb-20 pr-4">
            <div className="max-w-4xl mx-auto space-y-6">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">Configurações</h2>
                        <p className="text-slate-500 dark:text-slate-400">Gerencie a identidade visual e dados da empresa.</p>
                    </div>
                </div>

                <Tabs defaultValue="empresa" className="w-full">
                    <TabsList className="mb-4">
                        <TabsTrigger value="empresa">Dados da Empresa</TabsTrigger>
                        <TabsTrigger value="banco">Banco de Dados</TabsTrigger>
                    </TabsList>

                    <TabsContent value="empresa">
                        <form onSubmit={handleSubmit}>
                            <Card>
                                <CardHeader>
                                    <CardTitle>Identidade da Empresa</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium">Nome da Empresa</label>
                                            <Input
                                                name="companyName"
                                                value={formData.companyName}
                                                onChange={handleChange}
                                                placeholder="Ex: Studio 12"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium">CNPJ</label>
                                            <Input
                                                name="cnpj"
                                                value={formData.cnpj}
                                                onChange={handleChange}
                                                placeholder="00.000.000/0000-00"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium">Telefone / WhatsApp</label>
                                            <Input
                                                name="phone"
                                                value={formData.phone}
                                                onChange={handleChange}
                                                placeholder="(00) 00000-0000"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium">Endereço Completo</label>
                                            <Input
                                                name="address"
                                                value={formData.address}
                                                onChange={handleChange}
                                                placeholder="Rua, Número, Bairro, Cidade"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-2 pt-4 border-t dark:border-slate-800">
                                        <label className="text-sm font-medium">Logotipo</label>
                                        <div className="flex items-center gap-4">
                                            <div className="w-24 h-24 border-2 border-dashed rounded-lg flex items-center justify-center bg-slate-50 dark:bg-slate-900 overflow-hidden">
                                                {formData.logoUrl ? (
                                                    <img src={formData.logoUrl} alt="Logo" className="w-full h-full object-contain" />
                                                ) : (
                                                    <span className="text-xs text-slate-400 text-center px-2">Sem Logo</span>
                                                )}
                                            </div>
                                            <div className="flex-1">
                                                <Input
                                                    type="file"
                                                    accept="image/*"
                                                    onChange={handleLogoUpload}
                                                    className="cursor-pointer"
                                                />
                                                <p className="text-xs text-slate-500 mt-1">
                                                    Recomendado: PNG ou JPG com fundo transparente.
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="pt-6 flex flex-col sm:flex-row items-center gap-4 border-t dark:border-slate-800">
                                        <Button type="submit" size="lg" className="w-full sm:w-auto bg-slate-900 hover:bg-slate-800 text-white">
                                            <Save className="mr-2 h-5 w-5" />
                                            Salvar Configurações
                                        </Button>

                                        {showSuccess && (
                                            <div className="flex items-center gap-2 text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 px-4 py-2 rounded-md animate-in fade-in slide-in-from-left-2 border border-emerald-200 dark:border-emerald-900">
                                                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                                                <span className="font-medium">Configurações salvas com sucesso!</span>
                                            </div>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        </form>
                    </TabsContent>

                    <TabsContent value="banco" className="space-y-6">
                        <MaterialManager />
                        <StaffManager />
                        <SinkManager />
                        <AccessoryManager />
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
};

const MaterialManager: React.FC = () => {
    const { materials, addMaterial, removeMaterial } = useMaterialCatalog();
    const [name, setName] = React.useState('');
    const [type, setType] = React.useState('');
    const [thickness, setThickness] = React.useState('');

    const handleAdd = () => {
        if (!name || !type || !thickness) return;
        addMaterial({ name, type, thickness });
        setName('');
        setType('');
        setThickness('');
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Catálogo de Materiais (Pedras)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Nome (ex: Branco Siena)</label>
                        <Input value={name} onChange={e => setName(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Tipo</label>
                        <select
                            className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-950 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-50 dark:focus-visible:ring-slate-300"
                            value={type}
                            onChange={(e) => setType(e.target.value)}
                        >
                            <option value="">Selecione o tipo...</option>
                            <option value="Lâmina (Sinterizados/Ultracompactos)">Lâmina (Sinterizados/Ultracompactos)</option>
                            <option value="Quartzo">Quartzo</option>
                            <option value="Mármore">Mármore</option>
                            <option value="Granito">Granito</option>
                        </select>
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Espessura (ex: 2cm, 3cm)</label>
                        <Input value={thickness} onChange={e => setThickness(e.target.value)} />
                    </div>
                    <Button onClick={handleAdd} disabled={!name || !type || !thickness} className="w-full">
                        <Plus className="mr-2 h-4 w-4" />
                        Adicionar
                    </Button>
                </div>

                <div className="rounded-md border dark:border-slate-800">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 dark:bg-slate-900 border-b dark:border-slate-800">
                            <tr>
                                <th className="px-4 py-3 font-medium text-slate-500 dark:text-slate-400">Nome do Material</th>
                                <th className="px-4 py-3 font-medium text-slate-500 dark:text-slate-400">Tipo</th>
                                <th className="px-4 py-3 font-medium text-slate-500 dark:text-slate-400">Espessura</th>
                                <th className="px-4 py-3 text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {materials.map(mat => (
                                <tr key={mat.id} className="border-b dark:border-slate-800 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-900/50">
                                    <td className="px-4 py-3 font-medium">{mat.name}</td>
                                    <td className="px-4 py-3 text-slate-500">{mat.type}</td>
                                    <td className="px-4 py-3 text-slate-500">{mat.thickness}</td>
                                    <td className="px-4 py-3 text-right">
                                        <Button variant="ghost" size="sm" onClick={() => removeMaterial(mat.id)} className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50">
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </td>
                                </tr>
                            ))}
                            {materials.length === 0 && (
                                <tr>
                                    <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                                        Nenhum material cadastrado. Adicione o primeiro acima.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </CardContent>
        </Card>
    );
};

const StaffManager: React.FC = () => {
    const { staff, addStaff, removeStaff } = useStaffCatalog();
    const [name, setName] = React.useState('');
    const [role, setRole] = React.useState('');

    const handleAdd = () => {
        if (!name || !role) return;
        addStaff({ name, role });
        setName('');
        setRole('');
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Equipe de Produção</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Nome do Funcionário</label>
                        <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Marcos Silva" />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Cargo / Função</label>
                        <select
                            className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-950 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-50 dark:focus-visible:ring-slate-300"
                            value={role}
                            onChange={(e) => setRole(e.target.value)}
                        >
                            <option value="">Selecione o cargo...</option>
                            <option value="Serrador">Serrador</option>
                            <option value="Acabador">Acabador</option>
                            <option value="Instalador">Instalador</option>
                            <option value="Estoquista">Estoquista</option>
                            <option value="Outro">Outro</option>
                        </select>
                    </div>
                    <Button onClick={handleAdd} disabled={!name || !role} className="w-full">
                        <Plus className="mr-2 h-4 w-4" />
                        Adicionar
                    </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {staff.map(member => (
                        <div key={member.id} className="border rounded-lg p-3 flex justify-between items-center bg-slate-50 dark:bg-slate-900 border-l-4 border-l-blue-500">
                            <div>
                                <p className="font-medium text-sm">{member.name}</p>
                                <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold mt-1 bg-white dark:bg-slate-950">
                                    {member.role}
                                </span>
                            </div>
                            <Button variant="ghost" size="sm" onClick={() => removeStaff(member.id)} className="text-red-500 hover:text-red-600">
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </div>
                    ))}
                    {staff.length === 0 && (
                        <p className="text-sm text-slate-500 col-span-full text-center py-4">Nenhum funcionário cadastrado.</p>
                    )}
                </div>
            </CardContent>
        </Card>
    );
};

const SinkManager: React.FC = () => {
    const { sinks, addSink, removeSink } = useSinkCatalog();
    const [newSinkName, setNewSinkName] = React.useState('');
    const [newSinkPhoto, setNewSinkPhoto] = React.useState('');
    const [newSinkType, setNewSinkType] = React.useState('');

    const handleAdd = () => {
        if (!newSinkName || !newSinkType) return;
        addSink({ name: newSinkName, photoUrl: newSinkPhoto, type: newSinkType });
        setNewSinkName('');
        setNewSinkPhoto('');
        setNewSinkType('');
    };

    const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setNewSinkPhoto(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const sinkTypes = ['Inox', 'Esculpida', 'Louça', 'Gourmet'];

    return (
        <Card>
            <CardHeader>
                <CardTitle>Catálogo de Cubas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="flex flex-col gap-4">
                    <div className="flex gap-4 items-end">
                        <div className="flex-1 space-y-2">
                            <label className="text-sm font-medium">Nome do Modelo</label>
                            <Input
                                value={newSinkName}
                                onChange={(e) => setNewSinkName(e.target.value)}
                                placeholder="Ex: Cuba Esculpida dupla"
                            />
                        </div>
                        <div className="flex-1 space-y-2">
                            <label className="text-sm font-medium">Foto Opcional</label>
                            <Input
                                type="file"
                                accept="image/*"
                                onChange={handlePhotoUpload}
                                className="w-full"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium block">Tipo de Cuba</label>
                        <div className="flex flex-wrap gap-2">
                            {sinkTypes.map(type => (
                                <button
                                    key={type}
                                    type="button"
                                    onClick={() => setNewSinkType(type)}
                                    className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${newSinkType === type
                                        ? 'bg-blue-500 text-white border-blue-600 dark:bg-blue-600 dark:border-blue-700'
                                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-800'
                                        }`}
                                >
                                    {type}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex justify-end">
                        <Button onClick={handleAdd} disabled={!newSinkName || !newSinkType}>
                            <Plus className="mr-2 h-4 w-4" />
                            Adicionar Cuba
                        </Button>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {sinks.map(sink => (
                        <div key={sink.id} className="border rounded-lg p-3 flex gap-3 items-center bg-white dark:bg-slate-900">
                            <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded flex items-center justify-center overflow-hidden border">
                                {sink.photoUrl ? (
                                    <img src={sink.photoUrl} alt={sink.name} className="w-full h-full object-cover" />
                                ) : (
                                    <ImageIcon className="h-6 w-6 text-slate-400" />
                                )}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="font-medium truncate" title={sink.name}>{sink.name}</p>
                                {sink.type && (
                                    <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold mt-1 bg-slate-50 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                        {sink.type}
                                    </span>
                                )}
                            </div>
                            <Button variant="ghost" size="sm" onClick={() => removeSink(sink.id)} className="text-red-500 hover:text-red-600">
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </div>
                    ))}
                    {sinks.length === 0 && (
                        <p className="text-sm text-slate-500 col-span-full text-center py-4">Nenhuma cuba cadastrada.</p>
                    )}
                </div>
            </CardContent>
        </Card>
    );
};

const AccessoryManager: React.FC = () => {
    const { accessories, addAccessory, removeAccessory } = useAccessoryCatalog();
    const [newName, setNewName] = React.useState('');
    const [newPhoto, setNewPhoto] = React.useState('');
    const [newCut, setNewCut] = React.useState('');

    const handleAdd = () => {
        if (!newName || !newCut) return;
        addAccessory({ name: newName, photoUrl: newPhoto, cutMeasurement: newCut });
        setNewName('');
        setNewPhoto('');
        setNewCut('');
    };

    const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setNewPhoto(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Catálogo de Acessórios</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="flex flex-col gap-4">
                    <div className="flex gap-4 items-end">
                        <div className="flex-1 space-y-2">
                            <label className="text-sm font-medium">Nome do Acessório</label>
                            <Input
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                placeholder="Ex: Calha Úmida, Dosador"
                            />
                        </div>
                        <div className="flex-1 space-y-2">
                            <label className="text-sm font-medium">Medida do Corte (Nicho)</label>
                            <Input
                                value={newCut}
                                onChange={(e) => setNewCut(e.target.value)}
                                placeholder="Ex: 90x20cm, Furo 35mm"
                            />
                        </div>
                        <div className="flex-1 space-y-2">
                            <label className="text-sm font-medium">Foto Opcional</label>
                            <Input
                                type="file"
                                accept="image/*"
                                onChange={handlePhotoUpload}
                                className="w-full"
                            />
                        </div>
                    </div>

                    <div className="flex justify-end">
                        <Button onClick={handleAdd} disabled={!newName || !newCut}>
                            <Plus className="mr-2 h-4 w-4" />
                            Adicionar Acessório
                        </Button>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {accessories.map(acc => (
                        <div key={acc.id} className="border rounded-lg p-3 flex gap-3 items-center bg-white dark:bg-slate-900 border-l-4 border-l-orange-500">
                            <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded flex items-center justify-center overflow-hidden border">
                                {acc.photoUrl ? (
                                    <img src={acc.photoUrl} alt={acc.name} className="w-full h-full object-cover" />
                                ) : (
                                    <ImageIcon className="h-6 w-6 text-slate-400" />
                                )}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="font-medium truncate" title={acc.name}>{acc.name}</p>
                                <span className="text-xs text-slate-500 block truncate" title={acc.cutMeasurement}>
                                    Corte: {acc.cutMeasurement}
                                </span>
                            </div>
                            <Button variant="ghost" size="sm" onClick={() => removeAccessory(acc.id)} className="text-red-500 hover:text-red-600">
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </div>
                    ))}
                    {accessories.length === 0 && (
                        <p className="text-sm text-slate-500 col-span-full text-center py-4">Nenhum acessório cadastrado.</p>
                    )}
                </div>
            </CardContent>
        </Card>
    );
};
