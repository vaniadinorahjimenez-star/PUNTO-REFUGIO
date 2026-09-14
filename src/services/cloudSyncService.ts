import { SaleTicket, BakeryOrder, ShiftCutRecord, CashOutflowItem, Customer } from '../types';
import { 
  loadTickets, 
  loadOrders, 
  loadShiftCuts, 
  loadOutflows, 
  loadCustomers,
  mergeTickets,
  mergeOrders,
  mergeShiftCuts,
  mergeOutflows,
  mergeCustomers,
  STORAGE_KEYS
} from '../utils/storage';

export interface CloudSyncResult {
  success: boolean;
  message: string;
  mergedData?: {
    tickets: SaleTicket[];
    orders: BakeryOrder[];
    shiftCuts: ShiftCutRecord[];
    outflows: CashOutflowItem[];
    customers: Customer[];
  };
  error?: string;
}

type SyncListener = (data: NonNullable<CloudSyncResult['mergedData']>) => void;
const listeners: Set<SyncListener> = new Set();

export function onCloudSyncUpdated(cb: SyncListener): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function notifyListeners(data: NonNullable<CloudSyncResult['mergedData']>) {
  listeners.forEach(cb => {
    try {
      cb(data);
    } catch (e) {
      console.error('Error en callback de sincronización:', e);
    }
  });
}

let isSyncInProgress = false;
let hasPendingSync = false;
let pendingProvidedData: {
  tickets?: SaleTicket[];
  orders?: BakeryOrder[];
  shiftCuts?: ShiftCutRecord[];
  outflows?: CashOutflowItem[];
  customers?: Customer[];
} | undefined = undefined;

function areTicketsIdentical(a: SaleTicket[], b: SaleTicket[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i]?.id !== b[i]?.id || a[i]?.paymentMethod !== b[i]?.paymentMethod) return false;
  }
  return true;
}

/**
 * Realiza la sincronización combinada (Merge) con la nube de Netlify
 * NUNCA sobrescribe datos; combina los tickets, cobros de tarjeta, pedidos y cortes
 * de la PC y del Teléfono.
 * Protegido contra condiciones de carrera: si se registran ventas mientras la petición está en vuelo,
 * jamás se perderán.
 */
export async function syncWithCloud(providedData?: {
  tickets?: SaleTicket[];
  orders?: BakeryOrder[];
  shiftCuts?: ShiftCutRecord[];
  outflows?: CashOutflowItem[];
  customers?: Customer[];
}): Promise<CloudSyncResult> {
  // Si ya hay una sincronización en proceso, guardar los datos pendientes y esperar a que termine
  if (isSyncInProgress) {
    hasPendingSync = true;
    pendingProvidedData = providedData;
    return {
      success: true,
      message: 'Sincronización en cola para procesar ventas inmediatas'
    };
  }

  isSyncInProgress = true;

  try {
    // Cargar datos locales frescos combinados con los proporcionados
    const currentStoredTickets = loadTickets();
    const localTickets = mergeTickets(currentStoredTickets, providedData?.tickets || []);
    const localOrders = mergeOrders(loadOrders(), providedData?.orders || []);
    const localShiftCuts = mergeShiftCuts(loadShiftCuts(), providedData?.shiftCuts || []);
    const localOutflows = mergeOutflows(loadOutflows(), providedData?.outflows || []);
    const localCustomers = mergeCustomers(loadCustomers(), providedData?.customers || []);

    const payload = {
      tickets: localTickets,
      orders: localOrders,
      shiftCuts: localShiftCuts,
      outflows: localOutflows,
      customers: localCustomers,
      timestamp: new Date().toISOString()
    };

    const endpoints = ['/.netlify/functions/sync-data', '/api/sync'];
    let lastError: any = null;

    for (const endpoint of endpoints) {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        if (!res.ok) {
          lastError = new Error(`HTTP ${res.status}`);
          continue;
        }

        const json = await res.json();
        if (json.success && json.data) {
          // CRÍTICO: Recargar los datos locales MÁS RECIENTES para no perder
          // ventas que hayan ocurrido mientras la petición HTTP estaba en vuelo (diferencia de segundos)
          const freshLocalTickets = loadTickets();
          const freshLocalOrders = loadOrders();
          const freshLocalShiftCuts = loadShiftCuts();
          const freshLocalOutflows = loadOutflows();
          const freshLocalCustomers = loadCustomers();

          const mergedTickets = mergeTickets(freshLocalTickets, json.data.tickets || []);
          const mergedOrders = mergeOrders(freshLocalOrders, json.data.orders || []);
          const mergedShiftCuts = mergeShiftCuts(freshLocalShiftCuts, json.data.shiftCuts || []);
          const mergedOutflows = mergeOutflows(freshLocalOutflows, json.data.outflows || []);
          const mergedCustomers = mergeCustomers(freshLocalCustomers, json.data.customers || []);

          // Guardar la versión combinada en localStorage local
          localStorage.setItem(STORAGE_KEYS.TICKETS, JSON.stringify(mergedTickets));
          localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(mergedOrders));
          localStorage.setItem(STORAGE_KEYS.SHIFT_CUTS, JSON.stringify(mergedShiftCuts));
          localStorage.setItem(STORAGE_KEYS.OUTFLOWS, JSON.stringify(mergedOutflows));
          localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(mergedCustomers));

          const resultData = {
            tickets: mergedTickets,
            orders: mergedOrders,
            shiftCuts: mergedShiftCuts,
            outflows: mergedOutflows,
            customers: mergedCustomers
          };

          // Notificar solo si hay cambios reales para evitar ciclos infinitos
          const ticketsChanged = !areTicketsIdentical(freshLocalTickets, mergedTickets);
          if (ticketsChanged || mergedOrders.length !== freshLocalOrders.length) {
            notifyListeners(resultData);
          }

          return {
            success: true,
            message: `Sincronización combinada exitosa (${mergedTickets.length} tickets, ${mergedOrders.length} pedidos)`,
            mergedData: resultData
          };
        }
      } catch (err) {
        lastError = err;
      }
    }

    return {
      success: false,
      message: 'No se pudo conectar a la nube de Netlify, guardado local seguro activado',
      error: lastError?.message || 'Error de red'
    };
  } finally {
    isSyncInProgress = false;
    if (hasPendingSync) {
      hasPendingSync = false;
      const nextData = pendingProvidedData;
      pendingProvidedData = undefined;
      // Ejecutar la siguiente sincronización acumulada
      setTimeout(() => {
        syncWithCloud(nextData);
      }, 100);
    }
  }
}

/**
 * Consulta la nube y combina los datos recibidos con los locales
 */
export async function fetchAndMergeCloud(): Promise<CloudSyncResult> {
  const endpoints = ['/.netlify/functions/sync-data', '/api/sync'];
  let lastError: any = null;

  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!res.ok) continue;

      const json = await res.json();
      if (json.success && json.data) {
        const localTickets = loadTickets();
        const localOrders = loadOrders();
        const localShiftCuts = loadShiftCuts();
        const localOutflows = loadOutflows();
        const localCustomers = loadCustomers();

        const mergedTickets = mergeTickets(localTickets, json.data.tickets || []);
        const mergedOrders = mergeOrders(localOrders, json.data.orders || []);
        const mergedShiftCuts = mergeShiftCuts(localShiftCuts, json.data.shiftCuts || []);
        const mergedOutflows = mergeOutflows(localOutflows, json.data.outflows || []);
        const mergedCustomers = mergeCustomers(localCustomers, json.data.customers || []);

        localStorage.setItem(STORAGE_KEYS.TICKETS, JSON.stringify(mergedTickets));
        localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(mergedOrders));
        localStorage.setItem(STORAGE_KEYS.SHIFT_CUTS, JSON.stringify(mergedShiftCuts));
        localStorage.setItem(STORAGE_KEYS.OUTFLOWS, JSON.stringify(mergedOutflows));
        localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(mergedCustomers));

        const resultData = {
          tickets: mergedTickets,
          orders: mergedOrders,
          shiftCuts: mergedShiftCuts,
          outflows: mergedOutflows,
          customers: mergedCustomers
        };

        const ticketsChanged = !areTicketsIdentical(localTickets, mergedTickets);
        if (ticketsChanged || mergedOrders.length !== localOrders.length) {
          notifyListeners(resultData);
        }

        return {
          success: true,
          message: 'Datos combinados desde la nube con éxito',
          mergedData: resultData
        };
      }
    } catch (err) {
      lastError = err;
    }
  }

  return {
    success: false,
    message: 'No se pudo obtener datos de la nube',
    error: lastError?.message
  };
}

export function getCloudSyncStatus(): { isOnline: boolean; lastSyncTime: number } {
  return {
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    lastSyncTime: Date.now()
  };
}
