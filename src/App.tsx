import { safeArray } from './lib/dataDiagnostics';
import { useState, useEffect, lazy, Suspense } from 'react';
import { Routes, Route, useLocation, Navigate, useOutletContext, useNavigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
const Login = lazy(() => import('./pages/Login').then(m => ({ default: m.Login })));
import { Register } from './pages/Register';
import { Dashboard } from './pages/Dashboard';
import { SuperAdminDashboard } from './pages/SuperAdminDashboard';
import { AcceptInvite } from './pages/AcceptInvite';
import { WallboardPage } from './pages/WallboardPage';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { AppUpdateBanner } from './components/ui/AppUpdateBanner';
import { useIdleTimeout } from './hooks/useIdleTimeout';
import { PrintContract } from './pages/PrintContract';
import { DigitalSignature } from './pages/DigitalSignature';
import { ManagerSignaturePage } from './pages/ManagerSignaturePage';
import { ProtectedRoute } from './components/ProtectedRoute';
import { DiagnosticHUD } from './components/DiagnosticHUD';

// View Imports
import { HomeView } from './features/dashboard/HomeView';
import { KanbanBoard } from './features/dashboard/KanbanBoard';
import { ProductionCalendar } from './features/calendar/ProductionCalendar';
import { MeasurementCalendar } from './features/calendar/MeasurementCalendar';
import { OrdersView } from './features/orders/OrdersView';
import { OrderPage } from './features/orders/OrderPage';
import { QuotesView } from './features/quotes/QuotesView';
import { DeletedQuotesView } from './features/quotes/DeletedQuotesView';
import { QuotePage } from './features/quotes/QuotePage';
import { ClientsView } from './features/clients/ClientsView';
import { SettingsPage } from './features/settings/SettingsPage';
import { ReportsView } from './features/reports/ReportsView';
import { StaffView } from './features/staff/StaffView';
import { InvitesView } from './features/invites/InvitesView';
import { AccessView } from './features/access/AccessView';
import { FinancialView } from './features/financial/FinancialView';
import { InfluencersView } from './features/influencers/InfluencersView';
import { MeasurerView } from './features/measurements/MeasurerView';
import { ContractsView } from './features/contracts/ContractsView';
import { ExecutiveDashboardView } from './features/dashboard/ExecutiveDashboardView';
import { FollowUpView } from './features/quotes/FollowUpView';
import { QuickSalesView } from './features/quick-sales/QuickSalesView';
import { QuickSaleForm } from './features/quick-sales/QuickSaleForm';
import { QuickSalePrint } from './features/quick-sales/QuickSalePrint';

import { PlannedProjectsView } from './features/planned-projects/PlannedProjectsView';
import { PlannedProjectPrint } from './features/planned-projects/PlannedProjectPrint';
import { PlannedContractPrint } from './features/planned-projects/PlannedContractPrint';
import { PlannedDigitalSignature } from './pages/PlannedDigitalSignature';
import { ProductionHistoryView } from './features/orders/ProductionHistoryView';

import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { ReactivationScreen } from './pages/ReactivationScreen';

// --- View Wrappers to consume Dashboard context ---


const HomeViewWrapper = () => {
    const context = useOutletContext<any>() || {};
    const { 
        orders = [], 
        quotes = [], 
        incidentStats = { daysSince: 14, status: 'green', latestDate: null } 
    } = context;

    if (!import.meta.env.PROD) {
        console.log('[HOME TRACE] orders:', orders, Array.isArray(orders));
        console.log('[HOME TRACE] quotes:', quotes, Array.isArray(quotes));
        console.log('[HOME TRACE] incidentStats:', incidentStats);
    }

    return (
        <ErrorBoundary name="HomeView Component">
            <HomeView 
                orders={Array.isArray(orders) ? orders : []} 
                quotes={Array.isArray(quotes) ? quotes : []} 
                incidentStats={incidentStats}
            />
        </ErrorBoundary>
    );
};

const KanbanBoardWrapper = () => {
    const context = useOutletContext<any>() || {};
    const { 
        activeOrders = [], 
        globalSearchText = '', 
        setSelectedOrder = () => {}, 
        handleOrderMove = () => {}, 
        handleOrderReorder = () => {}, 
        handlePatchOrder = () => {}, 
        setOrderToReturn = () => {}, 
        setIsReturnModalOpen = () => {}, 
        generateBatchProductionSheet = () => {}, 
        settings = {}, 
        handleInternalReturnClick = () => {} 
    } = context;

    if (!import.meta.env.PROD) {
        console.log('[KANBAN TRACE] activeOrders:', activeOrders, Array.isArray(activeOrders));
    }

    return (
        <ErrorBoundary name="KanbanBoard Component">
            <KanbanBoard
                orders={Array.isArray(activeOrders) ? activeOrders : []}
                globalSearchText={globalSearchText}
                onOrderClick={setSelectedOrder}
                onOrderMove={handleOrderMove}
                onOrderReorder={handleOrderReorder}
                onUpdateOrder={handlePatchOrder}
                onOrderReturn={(order: any) => { setOrderToReturn(order); setIsReturnModalOpen(true); }}
                onPrintColumn={(columnId: any) => {
                    const columnOrders = (Array.isArray(activeOrders) ? activeOrders : []).filter((o: any) => o.status === columnId);
                    generateBatchProductionSheet(columnOrders, settings);
                }}
                onInternalReturnClick={handleInternalReturnClick}
            />
        </ErrorBoundary>
    );
};

const ProductionCalendarWrapper = () => {
    const { setIsFullscreenMode, setIsTvMode, activeOrders, globalSearchText, setSelectedOrder, handleOrderCalendarReschedule, handleDeleteOrder, generateBatchProductionSheet, settings, handlePatchOrder } = useOutletContext<any>();
    return (
        <ProductionCalendar onFullscreenChange={setIsFullscreenMode} onTvModeChange={setIsTvMode}
            orders={activeOrders}
            globalSearchText={globalSearchText}
            onOrderClick={setSelectedOrder}
            onOrderReschedule={handleOrderCalendarReschedule}
            onOrderDelete={handleDeleteOrder}
            onOrderUpdate={handlePatchOrder}
            onPrintColumn={(status: string) => {
                const statusOrders = safeArray(activeOrders).filter((o: any) => o.status === status);
                generateBatchProductionSheet(statusOrders, settings);
            }}
        />
    );
};

const MeasurementCalendarWrapper = () => {
    const { measurements, quotes, navigate, globalSearchText, setSelectedMeasurement, setPrefilledMeasurementDate, setIsAddMeasurementModalOpen, handleDeleteMeasurement, handleUpdateMeasurementDate, setIsFullscreenMode } = useOutletContext<any>();
    return (
        <MeasurementCalendar
            measurements={measurements}
            quotes={quotes}
            navigate={navigate}
            globalSearchText={globalSearchText}
            onMeasurementClick={setSelectedMeasurement}
            onAddMeasurementForDate={(date: any) => { setPrefilledMeasurementDate(date); setIsAddMeasurementModalOpen(true); }}
            onDeleteMeasurement={handleDeleteMeasurement}
            onUpdateMeasurementDate={handleUpdateMeasurementDate}
            onFullscreenChange={setIsFullscreenMode}
        />
    );
};

const OrdersViewWrapper = () => {
    const { orders, settings, globalSearchText } = useOutletContext<any>();
    return <OrdersView orders={orders} settings={settings} globalSearchText={globalSearchText} />;
};

const QuotesViewWrapper = () => {
    const { quotes, orders, measurements, contracts, handleDeleteQuote, handleUpdateQuote, handleDuplicateQuote, handleConvertQuoteToMeasurement, handleDirectSale, navigate, globalSearchText } = useOutletContext<any>();
    return (
        <QuotesView
            quotes={quotes}
            orders={orders}
            measurements={measurements}
            contracts={contracts}
            isLoading={false}
            onEdit={(quote: any) => {
                if (typeof navigate === 'function') {
                    navigate(`/orcamentos/${quote.id}/editar`);
                }
            }}
            onDownload={(quote: any) => navigate(`/orcamentos/${quote.id}/editar?download=true`)}
            onDelete={handleDeleteQuote}
            onUpdateQuote={handleUpdateQuote}
            onDuplicate={async (quote: any, isNewVersion?: boolean) => {
                const newId = await handleDuplicateQuote(quote, isNewVersion);
                if (newId) navigate(`/orcamentos/${newId}/editar`);
            }}
            onConvertToMeasurement={handleConvertQuoteToMeasurement}
            onDirectSale={handleDirectSale}
        />
    );
};

const DeletedQuotesViewWrapper = () => {
    const { deletedQuotes, handleRestoreQuote, handlePermanentDeleteQuote } = useOutletContext<any>() || {};
    return (
        <ErrorBoundary name="DeletedQuotesView Component">
            <DeletedQuotesView 
                quotes={deletedQuotes || []}
                onRestore={handleRestoreQuote}
                onPermanentDelete={handlePermanentDeleteQuote}
            />
        </ErrorBoundary>
    );
};

const ClientsViewWrapper = () => {
    const { navigate } = useOutletContext<any>();
    return (
        <ClientsView onNewQuoteFromClient={(client: any) => {
            navigate(`/orcamentos/novo?clientId=${client.id}`, {
                state: {
                    prefilledQuoteData: {
                        clientId: client.id,
                        customerName: client.name,
                        customerPhone: client.phone || '',
                        customerAddress: client.address || client.street || '',
                        status: 'draft'
                    },
                    preselectedClientId: client.id
                }
            });
        }} />
    );
};

const SettingsPageWrapper = () => <SettingsPage />;
const ReportsViewWrapper = () => {
    const { orders, measurements, incidents, incidentStats, quotes } = useOutletContext<any>();
    return <ReportsView orders={orders} measurements={measurements} incidents={incidents} incidentStats={incidentStats} quotes={quotes} />;
};
const StaffViewWrapper = () => <StaffView />;


const InvitesViewWrapper = () => <InvitesView />;
const AccessViewWrapper = () => <AccessView />;
import { IntegrityDashboard } from './features/admin/IntegrityDashboard';

const FinancialViewWrapper = () => <FinancialView />;
const InfluencersViewWrapper = () => <InfluencersView />;
const MeasurerViewWrapper = () => <MeasurerView />;
const ContractsViewWrapper = () => <ContractsView />;
import { CommercialIntelligenceView } from './features/intelligence/CommercialIntelligenceView';
const CommercialIntelligenceViewWrapper = () => <CommercialIntelligenceView />;
const FollowUpViewWrapper = () => <FollowUpView />;

const QuickSalesViewWrapper = () => (
    <ErrorBoundary name="QuickSalesView Component">
        <QuickSalesView />
    </ErrorBoundary>
);

const QuickSaleFormWrapper = () => (
    <ErrorBoundary name="QuickSaleForm Component">
        <QuickSaleForm />
    </ErrorBoundary>
);

const ProductionHistoryViewWrapper = () => (
    <ErrorBoundary name="ProductionHistoryView Component">
        <ProductionHistoryView />
    </ErrorBoundary>
);

const QuickSalePrintWrapper = () => (
    <ErrorBoundary name="QuickSalePrint Component">
        <QuickSalePrint />
    </ErrorBoundary>
);

const PlannedProjectsViewWrapper = () => (
    <ErrorBoundary name="PlannedProjectsView Component">
        <PlannedProjectsView />
    </ErrorBoundary>
);

const PlannedProjectPrintWrapper = () => (
    <ErrorBoundary name="PlannedProjectPrint Component">
        <PlannedProjectPrint />
    </ErrorBoundary>
);

const PlannedContractPrintWrapper = () => (
    <ErrorBoundary name="PlannedContractPrint Component">
        <PlannedContractPrint />
    </ErrorBoundary>
);

import { StoreVisitsView } from './features/store-visits/StoreVisitsView';
const StoreVisitsViewWrapper = () => (
    <ErrorBoundary name="StoreVisitsView Component">
        <StoreVisitsView />
    </ErrorBoundary>
);

// --- Main App Component ---

function App() {
  const { user, profile, loading: authLoading, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Session Inactivity Timeout (30 minutes)
  useIdleTimeout({
    onIdle: () => {
      console.warn("Session expired due to inactivity. Logging out.");
      logout();
    },
    isActive: !!user // Only monitor if user is logged in
  });

  const [authTimeout, setAuthTimeout] = useState(false);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    if (authLoading) {
      timeoutId = setTimeout(() => {
        setAuthTimeout(true);
      }, 10000);
    }
    return () => clearTimeout(timeoutId);
  }, [authLoading]);

  if (authLoading) {
    if (authTimeout) {
      return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6 text-center">
          <div className="glass-card p-8 rounded-3xl border border-white/10 max-w-sm flex flex-col items-center">
            <AlertCircle className="w-12 h-12 text-amber-500 mb-4" />
            <h2 className="text-xl font-bold text-white mb-2">Conexão Lenta</h2>
            <p className="text-slate-400 text-sm mb-6">A inicialização está demorando. Por favor, recarregue a página para forçar uma nova tentativa.</p>
            <button onClick={() => window.location.reload()} className="flex items-center justify-center gap-2 bg-brand-emerald text-slate-900 w-full h-12 rounded-xl font-bold hover:bg-brand-neon transition-colors">
              <RefreshCw className="w-5 h-5" /> Recarregar
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-white flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-brand-emerald border-t-transparent rounded-full animate-spin"></div>
          <p className="text-slate-400 font-medium">Carregando portal...</p>
        </div>
      </div>
    );
  }

  // Handle invitation link without layout
  if (location.pathname === '/accept-invite') {
    return <AcceptInvite />;
  }

  // 1. GATEWAY: Public Sign Routes
  if (location.pathname.startsWith('/sign/') || location.pathname.startsWith('/planejados/assinar/')) {
    return (
      <Routes>
        <Route path="/sign/:token" element={<DigitalSignature />} />
        <Route path="/planejados/assinar/:token" element={<PlannedDigitalSignature />} />
      </Routes>
    );
  }

  // 2. COMPATIBILITY: Redirect old contract links to the new Gateway
  const queryParams = new URLSearchParams(location.search);
  const oldToken = queryParams.get('token');
  if (location.pathname.includes('/contract') && oldToken) {
    return <Navigate to={`/sign/${oldToken}`} replace />;
  }
  
  if (!user) {
    return (
      <Suspense fallback={
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6 text-center">
            <div className="text-white flex flex-col items-center gap-4">
              <div className="w-8 h-8 border-4 border-brand-emerald border-t-transparent rounded-full animate-spin"></div>
            </div>
        </div>
      }>
        <Routes>
            <Route path="/login" element={<Login onNavigateToRegister={() => navigate('/cadastro')} />} />
            <Route path="/cadastro" element={<Register onNavigateToLogin={() => navigate('/login')} />} />
            <Route path="/manager-signature/:token" element={<ManagerSignaturePage />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Suspense>
    );
  }

  // Guard Logic for status
  if (profile?.status !== 'approved' && profile?.role !== 'superadmin') {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6 text-center">
        <div className="glass-card p-8 rounded-3xl border border-amber-500/20 max-w-sm">
          <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">Conta Aguardando Liberação</h2>
          <p className="text-slate-400 text-sm">O status do seu usuário não está aprovado (Atual: {profile?.status}).</p>
        </div>
      </div>
    );
  }

  if (((profile?.company as any)?.status === 'deleted' || (profile?.company as any)?.isDeleted) && profile?.role !== 'superadmin') {
    return <ReactivationScreen />;
  }

  if (profile?.company?.status !== 'approved' && profile?.role !== 'superadmin') {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6 text-center">
        <div className="glass-card p-8 rounded-3xl border border-red-500/20 max-w-sm">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">Acesso Restrito</h2>
          <p className="text-slate-400 text-sm">Sua empresa não está aprovada (Atual: {profile?.company?.status}). Contate o suporte.</p>
        </div>
      </div>
    );
  }

  // Handle SuperAdmin special route or redirect
  if (profile?.role === 'superadmin' && profile?.companyId === 'system') {
    return (
      <Routes>
        <Route path="/superadmin" element={<SuperAdminDashboard />} />
        <Route path="/order/:orderId/contract" element={<PrintContract />} />
        <Route path="/assinatura/:token" element={<DigitalSignature />} />
        <Route path="/planejados/assinar/:token" element={<PlannedDigitalSignature />} />
        <Route path="/imprimir-contrato/:token" element={<PrintContract />} />
        <Route path="*" element={<Navigate to="/superadmin" replace />} />
      </Routes>
    );
  }


  return (
    <>
      <Routes>
        <Route element={<Dashboard />}>
            <Route path="/inicio" element={<ProtectedRoute viewId="home"><HomeViewWrapper /></ProtectedRoute>} />
            <Route path="/producao/ordens" element={<ProtectedRoute viewId="dashboard"><KanbanBoardWrapper /></ProtectedRoute>} />
            <Route path="/calendario" element={<ProtectedRoute viewId="calendar">{profile?.role === 'medidor' ? <Navigate to="/medicoes" replace /> : <ProductionCalendarWrapper />}</ProtectedRoute>} />
            <Route path="/medicoes" element={<ProtectedRoute viewId="measurements"><MeasurementCalendarWrapper /></ProtectedRoute>} />
            <Route path="/orcamentos" element={<ProtectedRoute viewId="quotes"><QuotesViewWrapper /></ProtectedRoute>} />
            <Route path="/orcamentos/lixeira" element={<ProtectedRoute viewId="quotes"><DeletedQuotesViewWrapper /></ProtectedRoute>} />
            <Route path="/orcamentos/novo" element={<ProtectedRoute viewId="quotes"><QuotePage /></ProtectedRoute>} />
            <Route path="/orcamentos/:id/editar" element={<ProtectedRoute viewId="quotes"><QuotePage /></ProtectedRoute>} />
            <Route path="/follow-up" element={<ProtectedRoute viewId="quotes"><FollowUpViewWrapper /></ProtectedRoute>} />
            <Route path="/visitas" element={<ProtectedRoute viewId="store_visits"><StoreVisitsViewWrapper /></ProtectedRoute>} />
            <Route path="/pedidos/novo" element={<ProtectedRoute viewId="orders"><OrderPage /></ProtectedRoute>} />
            <Route path="/pedidos/:id/editar" element={<ProtectedRoute viewId="orders"><OrderPage /></ProtectedRoute>} />
            <Route path="/clientes" element={<ProtectedRoute viewId="clients"><ClientsViewWrapper /></ProtectedRoute>} />
            <Route path="/producao/todas" element={<ProtectedRoute viewId="orders"><OrdersViewWrapper /></ProtectedRoute>} />
            <Route path="/producao/historico" element={<ProtectedRoute viewId="orders"><ProductionHistoryViewWrapper /></ProtectedRoute>} />
            <Route path="/financeiro" element={<ProtectedRoute viewId="financial"><FinancialViewWrapper /></ProtectedRoute>} />
            <Route path="/influenciadores" element={<ProtectedRoute viewId="influencers"><InfluencersViewWrapper /></ProtectedRoute>} />
            <Route path="/equipe" element={<ProtectedRoute viewId="staff"><StaffViewWrapper /></ProtectedRoute>} />
            <Route path="/inteligencia-comercial" element={<ProtectedRoute viewId="intelligence"><CommercialIntelligenceViewWrapper /></ProtectedRoute>} />
            <Route path="/convites" element={<ProtectedRoute viewId="invites"><InvitesViewWrapper /></ProtectedRoute>} />
            <Route path="/acesso" element={<ProtectedRoute viewId="access"><AccessViewWrapper /></ProtectedRoute>} />
            <Route path="/relatorios" element={<ProtectedRoute viewId="reports"><ReportsViewWrapper /></ProtectedRoute>} />
            <Route path="/configuracoes" element={<ProtectedRoute viewId="settings"><SettingsPageWrapper /></ProtectedRoute>} />
            <Route path="/medicoes/hoje" element={<ProtectedRoute viewId="medicoes_hoje"><MeasurerViewWrapper /></ProtectedRoute>} />
            <Route path="/contratos" element={<ProtectedRoute viewId="contracts"><ContractsViewWrapper /></ProtectedRoute>} />
            <Route path="/vendas-rapidas" element={<ProtectedRoute viewId="quick_sales"><QuickSalesViewWrapper /></ProtectedRoute>} />
            <Route path="/vendas-rapidas/nova" element={<ProtectedRoute viewId="quick_sales"><QuickSaleFormWrapper /></ProtectedRoute>} />
            <Route path="/vendas-rapidas/:id/editar" element={<ProtectedRoute viewId="quick_sales"><QuickSaleFormWrapper /></ProtectedRoute>} />
            <Route path="/planejados" element={<ProtectedRoute viewId="planned_projects"><PlannedProjectsViewWrapper /></ProtectedRoute>} />
            <Route path="/admin/integrity" element={<ProtectedRoute viewId="integrity"><IntegrityDashboard /></ProtectedRoute>} />
            <Route path="/executivo" element={<ProtectedRoute viewId="executive"><ExecutiveDashboardView /></ProtectedRoute>} />
            
            {/* Redirect fallback inside the private app */}
            <Route path="/" element={<Navigate to={profile?.role === 'medidor' ? "/medicoes/hoje" : "/inicio"} replace />} />
        </Route>
        
        <Route path="/order/:orderId/contract" element={<PrintContract />} />
        <Route path="/vendas-rapidas/:id/imprimir" element={<QuickSalePrintWrapper />} />
        <Route path="/telao" element={<ProtectedRoute viewId="executive"><WallboardPage /></ProtectedRoute>} />
        <Route path="/planejados/:id/imprimir" element={<ProtectedRoute viewId="planned_projects"><PlannedProjectPrintWrapper /></ProtectedRoute>} />
        <Route path="/planejados/:id/contrato" element={<ProtectedRoute viewId="planned_projects"><PlannedContractPrintWrapper /></ProtectedRoute>} />
        <Route path="/manager-signature/:token" element={<ManagerSignaturePage />} />
        <Route path="*" element={<Navigate to={profile?.role === 'medidor' ? "/medicoes/hoje" : "/inicio"} replace />} />
      </Routes>
      <AppUpdateBanner />
      <DiagnosticHUD />
    </>
  );
}

export default App;