import { useState } from 'react';
import { Sidebar } from './layouts/Sidebar';
import { KanbanBoard } from './features/dashboard/KanbanBoard';
import { OrderDetails } from './features/orders/OrderDetails';
import { OrderForm } from './features/orders/OrderForm';
import { Modal } from './components/ui/Modal';
import { JobClosingModal } from './features/orders/JobClosingModal';
import type { JobClosingData } from './features/orders/JobClosingModal';
import { ReturnRegistrationModal } from './features/orders/ReturnRegistrationModal';
import type { ReturnRegistrationData } from './features/orders/ReturnRegistrationModal';
import { InternalReturnModal } from './features/orders/InternalReturnModal';
import { Button } from './components/ui/Button';
import { Plus } from 'lucide-react';
import { MOCK_ORDERS } from './data/mockData';
import { ProductionCalendar } from './features/calendar/ProductionCalendar';
import { SettingsPage } from './features/settings/SettingsPage';
import { ReportsView } from './features/reports/ReportsView';
import { OrdersView } from './features/orders/OrdersView';
import { QualityIndicator } from './components/QualityIndicator';
import { generateBatchProductionSheet } from './lib/pdfGenerator';
import { useSettings } from './hooks/useSettings';
import type { Order, Status, Measurement } from './types';
import { MeasurementCalendar } from './features/calendar/MeasurementCalendar';
import { MeasurementForm } from './features/measurements/MeasurementForm';
import { MeasurementDetails } from './features/measurements/MeasurementDetails';

type ViewType = 'dashboard' | 'orders' | 'settings' | 'calendar' | 'reports' | 'measurements';

function App() {
  const [orders, setOrders] = useState<Order[]>(MOCK_ORDERS);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [prefilledDate, setPrefilledDate] = useState<Date | null>(null);
  // Extend prefilled data to include startDate to carry the scheduledDate over from measurement
  const [prefilledOrderData, setPrefilledOrderData] = useState<(Partial<Order> & { startDate?: string }) | null>(null);
  const [activeView, setActiveView] = useState<ViewType>('dashboard');
  const [globalSearchText, setGlobalSearchText] = useState('');
  const { settings } = useSettings();

  // Measurement State
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [selectedMeasurement, setSelectedMeasurement] = useState<Measurement | null>(null);
  const [isAddMeasurementModalOpen, setIsAddMeasurementModalOpen] = useState(false);
  const [prefilledMeasurementDate, setPrefilledMeasurementDate] = useState<Date | null>(null);

  // Quality Indicator State - Default to 10 days to show the celebration state
  const [qualityScore, setQualityScore] = useState<number>(() => {
    const saved = localStorage.getItem('marble_flow_quality_score');
    return saved ? parseInt(saved, 10) : 10;
  });

  const resetQualityScore = () => {
    setQualityScore(0);
    localStorage.setItem('marble_flow_quality_score', '0');
  };

  const incrementQualityScore = () => {
    setQualityScore(prev => {
      const newVal = prev + 1;
      localStorage.setItem('marble_flow_quality_score', newVal.toString());
      return newVal;
    });
  };

  const handleAddOrder = (orderData: any, measurementId?: string) => {
    // Find the measurement to duplicate its attachments
    const measurementToConvert = measurements.find(m => m.id === measurementId);

    const newOrder: Order = {
      ...orderData,
      id: Math.random().toString(36).substring(7),
      status: 'production_queue',
      createdAt: new Date().toISOString(),
      attachments: measurementToConvert?.attachments || [] // <--- Migrating Attachments
    };

    setOrders([newOrder, ...orders]);
    setIsAddModalOpen(false);
    setPrefilledDate(null);
  };

  const handleAddOrderForDate = (date: Date) => {
    setPrefilledDate(date);
    setPrefilledOrderData(null);
    setIsAddModalOpen(true);
  };

  // Measurement Handlers
  const handleAddMeasurement = (data: Omit<Measurement, 'id' | 'createdAt' | 'status'>) => {
    const newMeasurement: Measurement = {
      ...data,
      id: Date.now().toString(),
      status: 'scheduled',
      createdAt: new Date().toISOString()
    };
    setMeasurements([...measurements, newMeasurement]);
    setIsAddMeasurementModalOpen(false);
    setPrefilledMeasurementDate(null);
  };

  const handleUpdateMeasurementDate = (id: string, newDateString: string) => {
    setMeasurements(measurements.map(m => m.id === id ? { ...m, scheduledDate: newDateString } : m));
  };

  const handleDeleteMeasurement = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setMeasurements(measurements.filter(m => m.id !== id));
    if (selectedMeasurement?.id === id) {
      setSelectedMeasurement(null);
    }
  };

  const handleConvertToOrder = (measurement: Measurement) => {
    setPrefilledOrderData({
      customerName: measurement.customerName,
      phone: measurement.phone,
      address: measurement.address,
      material: measurement.material,
      observations: `Origem: Medição Téc.\n${measurement.observations}`,
      // Pass geographical data and prefill startDate with the measurement's scheduled date
      ...(measurement.city ? { city: measurement.city } : {}),
      ...(measurement.region ? { region: measurement.region } : {}),
      startDate: measurement.scheduledDate || new Date().toISOString().split('T')[0],
    });

    // Mark as completed so it counts for conversion, but keep it on its scheduledDate
    setMeasurements(measurements.map(m => m.id === measurement.id ? { ...m, status: 'completed' } : m));
    setSelectedMeasurement(null);
    setIsAddModalOpen(true);
  };

  const handleDeclineMeasurement = (measurement: Measurement, reason: string) => {
    setMeasurements(measurements.map(m =>
      m.id === measurement.id ? { ...m, status: 'declined', declineReason: reason } : m
    ));
    setSelectedMeasurement(null);
  };

  const [isClosingModalOpen, setIsClosingModalOpen] = useState(false);
  const [orderToClose, setOrderToClose] = useState<Order | null>(null);

  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
  const [orderToReturn, setOrderToReturn] = useState<Order | null>(null);

  const [isInternalReturnModalOpen, setIsInternalReturnModalOpen] = useState(false);
  const [orderToInternalReturn, setOrderToInternalReturn] = useState<Order | null>(null);
  const [internalReturnItem, setInternalReturnItem] = useState<'Base' | 'Frontão' | 'Cuba'>('Base');

  const handleUpdateOrder = (updatedOrder: Order) => {
    setOrders(orders.map(order => order.id === updatedOrder.id ? updatedOrder : order));
    if (selectedOrder?.id === updatedOrder.id) {
      setSelectedOrder(updatedOrder);
    }
  };

  const handlePatchOrder = (orderId: string, updates: Partial<Order>) => {
    setOrders(orders.map(o => o.id === orderId ? { ...o, ...updates } : o));
    if (selectedOrder?.id === orderId) {
      setSelectedOrder(prev => prev ? { ...prev, ...updates } : null);
    }
  };

  const handleOrderReorder = (status: Status, startIndex: number, endIndex: number) => {
    const statusOrders = orders.filter(o => o.status === status);
    const otherOrders = orders.filter(o => o.status !== status);

    const [removed] = statusOrders.splice(startIndex, 1);
    statusOrders.splice(endIndex, 0, removed);

    // Keep the status orders at the beginning and the rest after, 
    // it's a simple way to persist order without adding an 'orderIndex' field.
    setOrders([...statusOrders, ...otherOrders]);
  };

  const handleOrderMove = (orderId: string, newStatus: Status, newIndex?: number) => {
    if (newStatus === 'finished') {
      const order = orders.find(o => o.id === orderId);
      if (order) {
        setOrderToClose(order);
        setIsClosingModalOpen(true);
      }
      return; // Do not move immediately
    }

    const orderToMove = orders.find(o => o.id === orderId);
    if (!orderToMove) return;

    const remainingOrders = orders.filter(o => o.id !== orderId);
    const updatedOrder = { ...orderToMove, status: newStatus };

    if (newIndex !== undefined) {
      const destColumnOrders = remainingOrders.filter(o => o.status === newStatus);
      const otherColumnOrders = remainingOrders.filter(o => o.status !== newStatus);

      destColumnOrders.splice(newIndex, 0, updatedOrder);
      setOrders([...destColumnOrders, ...otherColumnOrders]);
    } else {
      setOrders([...remainingOrders, updatedOrder]);
    }
  };

  const handleCloseJob = (data: JobClosingData) => {
    if (!orderToClose) return;

    const isReturn = data.completionStatus === 'return';
    const newStatus: Status = isReturn ? 'production_queue' : 'finished';

    let updatedOrders = orders.map(order => {
      if (order.id === orderToClose.id) {
        return {
          ...order,
          status: newStatus,
          installerName: data.installerName,
          completionStatus: data.completionStatus,
          returnReasons: isReturn ? [...data.returnReasons, data.otherReason].filter(Boolean) : undefined,
          completionDate: new Date().toISOString(),
          isReturn: isReturn,
          priority: isReturn ? 'high' : order.priority // High priority if return
        };
      }
      return order;
    });

    // If return, move to top of queue and reset quality indicator
    if (isReturn) {
      resetQualityScore();
      const returnedOrder = updatedOrders.find(o => o.id === orderToClose.id);
      const otherOrders = updatedOrders.filter(o => o.id !== orderToClose.id);
      if (returnedOrder) {
        updatedOrders = [returnedOrder, ...otherOrders];
      }
    }

    setOrders(updatedOrders);
    setIsClosingModalOpen(false);
    setOrderToClose(null);
  };

  const handleConfirmReturn = (data: ReturnRegistrationData) => {
    if (!orderToReturn) return;

    let updatedOrders = orders.map(order =>
      order.id === orderToReturn.id
        ? {
          ...order,
          status: 'production_queue' as Status,
          isReturn: true,
          priority: 'high' as const,
          deadline: new Date(data.newDeadline).toISOString(),
          returnReasons: [...data.returnReasons, data.otherReason].filter(Boolean),
          returnObservations: data.returnObservations
        }
        : order
    );

    // Move returned order to top
    resetQualityScore();
    const returnedOrder = updatedOrders.find(o => o.id === orderToReturn.id);
    const otherOrders = updatedOrders.filter(o => o.id !== orderToReturn.id);
    if (returnedOrder) {
      updatedOrders = [returnedOrder, ...otherOrders];
    }

    setOrders(updatedOrders);
    setIsReturnModalOpen(false);
    setOrderToReturn(null);
  };

  const handleConfirmInternalReturn = (itemToRemake: 'Base' | 'Frontão' | 'Cuba', reason: string, newDate: string) => {
    if (!orderToInternalReturn) return;

    let updatedOrders = orders.map(order =>
      order.id === orderToInternalReturn.id
        ? {
          ...order,
          status: 'production_queue' as Status,
          isInternalReturn: true,
          priority: 'high' as const,
          deadline: new Date(newDate).toISOString(),
          remakeItem: itemToRemake,
          remakeReason: reason,
          remakeDate: new Date().toISOString()
        }
        : order
    );

    // Urgent internal returns go straight to the top of the production queue
    resetQualityScore();
    const returnedOrder = updatedOrders.find(o => o.id === orderToInternalReturn.id);
    const otherOrders = updatedOrders.filter(o => o.id !== orderToInternalReturn.id);
    if (returnedOrder) {
      updatedOrders = [returnedOrder, ...otherOrders];
    }

    setOrders(updatedOrders);
    setIsInternalReturnModalOpen(false);
    setOrderToInternalReturn(null);
    setSelectedOrder(null); // Close order details modal
  };

  const handleOrderReschedule = (orderId: string, newDateString: string) => {
    // Parse the dropped date string back to Date object, keep existing time if possible, or just set to noon to be safe
    const [year, month, day] = newDateString.split('T')[0].split('-');
    const newDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), 12, 0, 0);

    setOrders(orders.map(order =>
      order.id === orderId
        ? { ...order, deadline: newDate.toISOString() }
        : order
    ));
  };

  const handleDeleteOrder = (orderId: string) => {
    setOrders(orders.filter(order => order.id !== orderId));
    if (selectedOrder?.id === orderId) {
      setSelectedOrder(null);
    }
  };

  const handleCompleteConference = (orderToComplete: Order) => {
    setOrders(orders.map(order =>
      order.id === orderToComplete.id
        ? { ...order, status: 'installation' }
        : order
    ));
    incrementQualityScore();
    setSelectedOrder(null);
  };

  const handleInternalReturnClick = (order: Order) => {
    setOrderToInternalReturn(order);
    setInternalReturnItem('Base');
    setIsInternalReturnModalOpen(true);
  };

  // Archive rule: Hide finished orders older than 30 days
  const activeOrders = orders.filter(order => {
    if (order.status !== 'finished') return true;
    const daysSinceDeadline = (new Date().getTime() - new Date(order.deadline).getTime()) / (1000 * 3600 * 24);
    return daysSinceDeadline <= 30;
  });

  return (
    <div className="flex min-h-screen font-sans">
      <Sidebar activeView={activeView} onViewChange={setActiveView} />
      <main className="flex-1 md:ml-[72px] p-8 overflow-hidden h-screen flex flex-col transition-all duration-300">
        <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6 lg:mb-8 shrink-0">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
              {activeView === 'dashboard' && 'Produção'}
              {activeView === 'calendar' && 'Calendário de Produção'}
              {activeView === 'measurements' && 'Calendário de Medições'}
              {activeView === 'orders' && 'Todas as Ordens'}
              {activeView === 'settings' && 'Configurações'}
              {activeView === 'reports' && 'Relatórios'}
            </h1>
            <p className="text-slate-500 dark:text-slate-400 mt-1">
              {activeView === 'dashboard' && 'Gerencie a fila de produção da marmoraria.'}
              {activeView === 'calendar' && 'Visualize as entregas previstas.'}
              {activeView === 'measurements' && 'Agende e converta medições em ordens de serviço.'}
              {activeView === 'orders' && 'Visualize o histórico completo de pedidos.'}
              {activeView === 'settings' && 'Ajustes do sistema.'}
              {activeView === 'reports' && 'Métricas e histórico.'}
            </p>
          </div>
          <div className="flex items-center gap-4 w-full lg:w-auto">
            {activeView !== 'settings' && activeView !== 'reports' && (
              <div className="relative flex-1 md:w-64 max-w-sm">
                <input
                  type="text"
                  placeholder="Pesquisar cliente..."
                  className="w-full pl-10 pr-4 py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-slate-950 dark:focus:ring-white"
                  value={globalSearchText}
                  onChange={(e) => setGlobalSearchText(e.target.value)}
                />
                <svg
                  className="absolute left-3 top-2.5 h-4 w-4 text-slate-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            )}

            {activeView === 'measurements' && (
              <Button onClick={() => setIsAddMeasurementModalOpen(true)}>
                <Plus className="hidden sm:inline-block mr-2 h-4 w-4" />
                <span className="max-sm:hidden">Nova Medição</span>
                <span className="sm:hidden"><Plus className="h-4 w-4" /></span>
              </Button>
            )}
            {(activeView === 'dashboard' || activeView === 'calendar') && (
              <>
                <div className="hidden lg:block shrink-0">
                  <QualityIndicator qualityScore={qualityScore} />
                </div>
                <Button onClick={() => {
                  setPrefilledOrderData(null);
                  setIsAddModalOpen(true);
                }} className="shrink-0">
                  <Plus className="hidden sm:inline-block mr-2 h-4 w-4" />
                  <span className="max-sm:hidden">Nova Ordem</span>
                  <span className="sm:hidden"><Plus className="h-4 w-4" /></span>
                </Button>
              </>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-hidden">
          {activeView === 'dashboard' && (
            <KanbanBoard
              orders={activeOrders}
              globalSearchText={globalSearchText}
              onOrderClick={setSelectedOrder}
              onOrderMove={handleOrderMove}
              onOrderReorder={handleOrderReorder}
              onUpdateOrder={handlePatchOrder}
              onOrderReturn={(order) => {
                setOrderToReturn(order);
                setIsReturnModalOpen(true);
              }}
              onPrintColumn={(columnId) => {
                const columnOrders = orders.filter(o => o.status === columnId);
                generateBatchProductionSheet(columnOrders, settings);
              }}
              onInternalReturnClick={(order) => {
                setOrderToInternalReturn(order);
                setInternalReturnItem('Base');
                setIsInternalReturnModalOpen(true);
              }}
            />
          )}

          {activeView === 'calendar' && (
            <ProductionCalendar
              orders={activeOrders}
              globalSearchText={globalSearchText}
              onOrderClick={setSelectedOrder}
              onOrderReschedule={handleOrderReschedule}
              onOrderDelete={handleDeleteOrder}
              onAddOrderForDate={handleAddOrderForDate}
            />
          )}

          {activeView === 'measurements' && (
            <MeasurementCalendar
              measurements={measurements}
              globalSearchText={globalSearchText}
              onMeasurementClick={setSelectedMeasurement}
              onAddMeasurementForDate={(date: Date) => {
                setPrefilledMeasurementDate(date);
                setIsAddMeasurementModalOpen(true);
              }}
              onDeleteMeasurement={handleDeleteMeasurement}
              onUpdateMeasurementDate={handleUpdateMeasurementDate}
            />
          )}

          {activeView === 'orders' && (
            <OrdersView orders={orders} settings={settings} globalSearchText={globalSearchText} />
          )}

          {activeView === 'settings' && (
            <SettingsPage />
          )}

          {activeView === 'reports' && (
            <ReportsView orders={orders} measurements={measurements} />
          )}
        </div>

        {/* Order Details Modal */}
        <Modal
          isOpen={!!selectedOrder}
          onClose={() => setSelectedOrder(null)}
          title={selectedOrder ? `Pedido #${selectedOrder.protocolNumber}` : 'Detalhes'}
          className="max-w-4xl"
        >
          {selectedOrder && (
            <OrderDetails
              order={selectedOrder}
              onUpdateOrder={handleUpdateOrder}
              onCompleteConference={handleCompleteConference}
              onInternalReturnClick={handleInternalReturnClick}
            />
          )}
        </Modal>

        {/* Add Order Modal */}
        <Modal
          isOpen={isAddModalOpen}
          onClose={() => {
            setIsAddModalOpen(false);
            setPrefilledDate(null);
            setPrefilledOrderData(null);
          }}
          title="Nova Ordem de Serviço"
        >
          <OrderForm
            onSubmit={handleAddOrder}
            onCancel={() => {
              setIsAddModalOpen(false);
              setPrefilledDate(null);
              setPrefilledOrderData(null);
            }}
            initialDeadline={prefilledDate || undefined}
            initialData={prefilledOrderData || undefined}
          />
        </Modal>

        {/* Measurement Modals */}
        <Modal
          isOpen={!!selectedMeasurement}
          onClose={() => setSelectedMeasurement(null)}
          title="Detalhes da Medição"
        >
          {selectedMeasurement && (
            <MeasurementDetails
              measurement={selectedMeasurement}
              onClose={() => setSelectedMeasurement(null)}
              onConvertToOrder={handleConvertToOrder}
              onDecline={handleDeclineMeasurement}
              onDelete={() => {
                setMeasurements(measurements.filter(m => m.id !== selectedMeasurement.id));
                setSelectedMeasurement(null);
              }}
            />
          )}
        </Modal>

        <Modal
          isOpen={isAddMeasurementModalOpen}
          onClose={() => {
            setIsAddMeasurementModalOpen(false);
            setPrefilledMeasurementDate(null);
          }}
          title="Nova Medição"
        >
          <MeasurementForm
            onSubmit={handleAddMeasurement}
            initialDate={prefilledMeasurementDate || undefined}
          />
        </Modal>

        {/* Job Closing Modal */}
        <JobClosingModal
          isOpen={isClosingModalOpen}
          onClose={() => setIsClosingModalOpen(false)}
          onConfirm={handleCloseJob}
          orderId={orderToClose?.id || ''}
        />

        {/* Return Registration Modal */}
        <ReturnRegistrationModal
          isOpen={isReturnModalOpen}
          onClose={() => setIsReturnModalOpen(false)}
          onConfirm={handleConfirmReturn}
          orderId={orderToReturn?.id || ''}
        />

        {/* Internal Return (Avaria) Modal */}
        <InternalReturnModal
          isOpen={isInternalReturnModalOpen}
          onClose={() => setIsInternalReturnModalOpen(false)}
          onConfirm={handleConfirmInternalReturn}
          initialItem={internalReturnItem}
        />

      </main>
    </div >
  );
}

export default App;
