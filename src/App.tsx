/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Settings, 
  BreadProduct, 
  SaleTicket, 
  Customer, 
  BakeryOrder, 
  Driver,
  DriverCustomer 
} from './types';
import { 
  loadSettings, 
  saveSettings, 
  loadProducts, 
  saveProducts, 
  loadTickets, 
  saveTickets, 
  loadCustomers, 
  saveCustomers, 
  loadOrders, 
  saveOrders, 
  clearAllOrders,
  loadDrivers, 
  saveDrivers,
  loadDriverCustomers,
  saveDriverCustomers,
  mergeTickets,
  mergeOrders,
  mergeCustomers,
  STORAGE_KEYS,
  DEFAULT_SETTINGS,
  DEFAULT_PRODUCTS,
  DEFAULT_DRIVERS,
  INITIAL_CUSTOMERS,
  INITIAL_ORDERS,
  INITIAL_TICKETS,
  getTodayString
} from './utils/storage';
import { Navbar, ActiveTabType } from './components/Navbar';
import { PosCounter } from './components/PosCounter/PosCounter';
import { OrdersManager } from './components/Orders/OrdersManager';
import { BakersWorkshop } from './components/Bakers/BakersWorkshop';
import { DeliveryDashboard } from './components/Delivery/DeliveryDashboard';
import { LoyaltyManager } from './components/Loyalty/LoyaltyManager';
import { SalesHistory } from './components/SalesHistory/SalesHistory';
import { ProductionAnalytics } from './components/Analytics/ProductionAnalytics';
import { AdminSettings } from './components/AdminSettings/AdminSettings';
import { 
  syncWithCloud, 
  fetchAndMergeCloud, 
  onCloudSyncUpdated, 
  getCloudSyncStatus 
} from './services/cloudSyncService';

export default function App() {
  // Application Data States
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [products, setProducts] = useState<BreadProduct[]>(loadProducts);
  const [tickets, setTickets] = useState<SaleTicket[]>(loadTickets);
  const [customers, setCustomers] = useState<Customer[]>(loadCustomers);
  const [orders, setOrders] = useState<BakeryOrder[]>(loadOrders);
  const [drivers, setDrivers] = useState<Driver[]>(loadDrivers);
  const [driverCustomers, setDriverCustomers] = useState<DriverCustomer[]>(loadDriverCustomers);

  // Active Navigation Tab
  const [activeTab, setActiveTab] = useState<ActiveTabType>('pos');

  // Accessibility Zoom Level (-1, 0, 1, 2)
  const [zoomLevel, setZoomLevel] = useState<number>(0);

  // Persistence effects
  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  useEffect(() => {
    saveProducts(products);
  }, [products]);

  useEffect(() => {
    saveTickets(tickets);
  }, [tickets]);

  useEffect(() => {
    saveCustomers(customers);
  }, [customers]);

  useEffect(() => {
    saveOrders(orders);
  }, [orders]);

  useEffect(() => {
    saveDrivers(drivers);
  }, [drivers]);

  useEffect(() => {
    saveDriverCustomers(driverCustomers);
  }, [driverCustomers]);

  // Cloud Synchronization: Combina en lugar de sobreescribir entre Computadora y Teléfono
  useEffect(() => {
    // 1. Descargar y combinar datos existentes en la nube al abrir la app
    fetchAndMergeCloud();

    // 2. Escuchar actualizaciones de la nube y reflejarlas en el estado sin sobrescribir ventas recientes
    const unsubscribe = onCloudSyncUpdated((merged) => {
      if (merged.tickets && merged.tickets.length > 0) {
        setTickets(prev => {
          const combined = mergeTickets(prev, merged.tickets);
          if (combined.length === prev.length && combined.every((t, i) => t.id === prev[i]?.id)) {
            return prev;
          }
          return combined;
        });
      }
      if (merged.orders && merged.orders.length > 0) {
        setOrders(prev => {
          const combined = mergeOrders(prev, merged.orders);
          if (combined.length === prev.length && combined.every((o, i) => o.id === prev[i]?.id)) {
            return prev;
          }
          return combined;
        });
      }
      if (merged.customers && merged.customers.length > 0) {
        setCustomers(prev => {
          const combined = mergeCustomers(prev, merged.customers);
          if (combined.length === prev.length && combined.every((c, i) => c.id === prev[i]?.id)) {
            return prev;
          }
          return combined;
        });
      }
    });

    // 3. Sincronizar entre pestañas abiertas en el mismo dispositivo
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'santafe_tickets') {
        setTickets(prev => mergeTickets(prev, loadTickets()));
      } else if (e.key === 'santafe_orders') {
        setOrders(prev => mergeOrders(prev, loadOrders()));
      } else if (e.key === 'santafe_customers') {
        setCustomers(prev => mergeCustomers(prev, loadCustomers()));
      }
    };
    window.addEventListener('storage', handleStorageChange);

    // 4. Chequeo periódico en segundo plano cada 30 segundos
    const syncInterval = setInterval(() => {
      fetchAndMergeCloud();
    }, 30000);

    return () => {
      unsubscribe();
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(syncInterval);
    };
  }, []);

  // Sincronizar automáticamente hacia la nube tras registrar cambios
  useEffect(() => {
    const timeout = setTimeout(() => {
      syncWithCloud({ tickets, orders, customers });
    }, 1200);
    return () => clearTimeout(timeout);
  }, [tickets, orders, customers]);

  // Handlers
  const handleSaveTicket = (newTicket: SaleTicket, updatedCustomer?: Customer) => {
    // 1. Guardar de forma SÍNCRONA e inmediata en localStorage antes de cualquier otra cosa
    const currentTickets = loadTickets();
    const merged = mergeTickets([newTicket], currentTickets);
    localStorage.setItem(STORAGE_KEYS.TICKETS, JSON.stringify(merged));

    // 2. Actualizar estado de React functionalmente asegurando que newTicket esté presente
    setTickets(prev => mergeTickets([newTicket], prev));

    if (updatedCustomer) {
      setCustomers(prev => {
        const idx = prev.findIndex(c => c.id === updatedCustomer.id || c.phone === updatedCustomer.phone);
        let updatedList: Customer[];
        if (idx >= 0) {
          updatedList = [...prev];
          updatedList[idx] = updatedCustomer;
        } else {
          updatedList = [updatedCustomer, ...prev];
        }
        localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(updatedList));
        return updatedList;
      });
    }

    // 3. Disparar sincronización con la nube con los datos actualizados
    syncWithCloud({ tickets: merged });
  };

  const handleUpdateTicket = (updatedTicket: SaleTicket) => {
    setTickets(prev => {
      const updated = prev.map(t => (t.id === updatedTicket.id ? updatedTicket : t));
      saveTickets(updated, true);
      return updated;
    });
  };

  const handleDeleteTicket = (ticketId: string) => {
    const updated = loadTickets().filter(t => t.id !== ticketId);
    saveTickets(updated, true);
    setTickets(updated);
  };

  const handleRegisterCustomer = (newCustomer: Customer) => {
    setCustomers(prev => [newCustomer, ...prev]);
  };

  const handleUpdateCustomer = (updatedCustomer: Customer) => {
    setCustomers(prev =>
      prev.map(c => (c.id === updatedCustomer.id ? updatedCustomer : c))
    );
  };

  const handleSaveOrder = (newOrder: BakeryOrder) => {
    setOrders(prev => [newOrder, ...prev]);
  };

  const handleUpdateOrder = (updatedOrder: BakeryOrder) => {
    setOrders(prev => prev.map(o => (o.id === updatedOrder.id ? updatedOrder : o)));
  };

  const handleToggleItemDone = (orderId: string, itemIdx: number) => {
    setOrders(prev =>
      prev.map(o => {
        if (o.id === orderId) {
          const updatedItems = [...o.items];
          updatedItems[itemIdx] = {
            ...updatedItems[itemIdx],
            done: !updatedItems[itemIdx].done
          };
          return {
            ...o,
            items: updatedItems
          };
        }
        return o;
      })
    );
  };

  const handleUpdateOrderStatus = (
    orderId: string,
    status: 'entregado' | 'en_camino',
    collectedAmount: number
  ) => {
    setOrders(prev =>
      prev.map(o => {
        if (o.id === orderId) {
          return {
            ...o,
            deliveryStatus: status,
            collectedAmount: (o.collectedAmount || 0) + collectedAmount,
            pendingAmount: status === 'entregado' ? 0 : o.pendingAmount,
            deliveredAt: status === 'entregado' ? new Date().toISOString() : o.deliveredAt
          };
        }
        return o;
      })
    );
  };

  const handleResetData = () => {
    setSettings(DEFAULT_SETTINGS);
    setProducts(DEFAULT_PRODUCTS);
    setDrivers(DEFAULT_DRIVERS);
    setCustomers(INITIAL_CUSTOMERS);
    setOrders(INITIAL_ORDERS);
    setTickets(INITIAL_TICKETS);
    localStorage.clear();
  };

  const handleClearOrders = () => {
    clearAllOrders();
    setOrders([]);
    syncWithCloud({ orders: [] }).catch(console.error);
  };

  const handleToggleZoom = (delta: number) => {
    setZoomLevel(prev => Math.min(2, Math.max(-1, prev + delta)));
  };

  // Badge counts
  const todayStr = getTodayString();
  const pendingOrdersCount = orders.filter(
    o => o.deliveryDate === todayStr && o.deliveryStatus !== 'entregado'
  ).length;

  const pendingProductionCount = orders
    .filter(o => o.deliveryDate === todayStr)
    .reduce((acc, o) => acc + o.items.filter(i => !i.done).length, 0);

  const pendingDeliveriesCount = orders.filter(
    o => o.deliveryType === 'domicilio' && o.deliveryDate === todayStr && o.deliveryStatus !== 'entregado'
  ).length;

  const zoomStyle = zoomLevel === 1 
    ? { fontSize: '108%' } 
    : zoomLevel === 2 
    ? { fontSize: '116%' } 
    : zoomLevel === -1 
    ? { fontSize: '94%' } 
    : {};

  return (
    <div 
      className="min-h-screen bg-[#FAF8F6] text-slate-800 flex flex-col selection:bg-[#D95D39] selection:text-white"
      style={zoomStyle}
    >
      {/* Sticky Top Navigation */}
      <Navbar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        settings={settings}
        pendingOrdersCount={pendingOrdersCount}
        pendingProductionCount={pendingProductionCount}
        pendingDeliveriesCount={pendingDeliveriesCount}
        zoomLevel={zoomLevel}
        onToggleZoom={handleToggleZoom}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-2 sm:p-3">
        {activeTab === 'pos' && (
          <PosCounter
            products={products}
            settings={settings}
            customers={customers}
            driverCustomers={driverCustomers}
            tickets={tickets}
            onSaveTicket={handleSaveTicket}
            onUpdateTicket={handleUpdateTicket}
            onRegisterCustomer={handleRegisterCustomer}
            onSaveOrder={handleSaveOrder}
          />
        )}

        {activeTab === 'orders' && (
          <OrdersManager
            orders={orders}
            products={products}
            settings={settings}
            drivers={drivers}
            customers={customers}
            driverCustomers={driverCustomers}
            onSaveOrder={handleSaveOrder}
            onUpdateOrder={handleUpdateOrder}
          />
        )}

        {activeTab === 'bakers' && (
          <BakersWorkshop
            orders={orders}
            onToggleItemDone={handleToggleItemDone}
          />
        )}

        {activeTab === 'delivery' && (
          <DeliveryDashboard
            orders={orders}
            drivers={drivers}
            settings={settings}
            onUpdateOrderStatus={handleUpdateOrderStatus}
          />
        )}

        {activeTab === 'loyalty' && (
          <LoyaltyManager
            customers={customers}
            settings={settings}
            onRegisterCustomer={handleRegisterCustomer}
            onUpdateCustomer={handleUpdateCustomer}
          />
        )}

        {activeTab === 'analytics' && (
          <ProductionAnalytics
            tickets={tickets}
          />
        )}

        {activeTab === 'history' && (
          <SalesHistory
            tickets={tickets}
            orders={orders}
            drivers={drivers}
            driverCustomers={driverCustomers}
            settings={settings}
            onDeleteTicket={handleDeleteTicket}
            onUpdateOrder={handleUpdateOrder}
            onClearOrders={handleClearOrders}
          />
        )}

        {activeTab === 'admin' && (
          <AdminSettings
            settings={settings}
            products={products}
            drivers={drivers}
            driverCustomers={driverCustomers}
            onSaveSettings={setSettings}
            onSaveProducts={setProducts}
            onSaveDrivers={setDrivers}
            onSaveDriverCustomers={setDriverCustomers}
            onResetData={handleResetData}
          />
        )}
      </main>

      {/* Footer in Natural Tones theme */}
      <footer className="py-3 px-4 sm:px-8 text-xs bg-[#FFF5F0] border-t border-[#E5E1DA] text-slate-600 no-print">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <span className="font-serif italic font-bold text-[#D95D39] text-sm">Santa Fé</span>
            <span className="text-slate-400">•</span>
            <span className="text-slate-600 font-medium">
              {settings.address} • Tel: {settings.phone}
            </span>
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex items-center">
              <div className="w-2 h-2 bg-emerald-500 rounded-full mr-1.5 animate-pulse"></div>
              <span className="text-[11px] font-bold text-slate-600 tracking-wide">TICKETS TÉRMICOS OK</span>
            </div>
            <div className="flex items-center">
              <div className="w-2 h-2 bg-emerald-500 rounded-full mr-1.5"></div>
              <span className="text-[11px] font-bold text-slate-600 tracking-wide">WHATSAPP / CAJA OK</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
