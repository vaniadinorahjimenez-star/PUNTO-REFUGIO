import { 
  collection, 
  doc, 
  setDoc, 
  deleteDoc, 
  onSnapshot, 
  writeBatch,
  query,
  limit,
  orderBy
} from 'firebase/firestore';
import { 
  db, 
  auth, 
  googleProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged, 
  type User,
  handleFirestoreError,
  OperationType 
} from '../firebase';
import { 
  SaleTicket, 
  BakeryOrder, 
  ShiftCutRecord, 
  CashOutflowItem, 
  Customer 
} from '../types';
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
  saveTickets,
  saveOrders,
  saveShiftCuts,
  saveOutflows,
  saveCustomers
} from '../utils/storage';

export interface FirebaseSyncState {
  user: User | null;
  isOnline: boolean;
  isFirebaseConnected: boolean;
  lastSyncTime: number;
  syncStatus: 'idle' | 'syncing' | 'synced' | 'error' | 'unauthenticated';
  errorMessage?: string;
}

type SyncStateListener = (state: FirebaseSyncState) => void;
type DataUpdateListener = (data: {
  tickets?: SaleTicket[];
  orders?: BakeryOrder[];
  shiftCuts?: ShiftCutRecord[];
  outflows?: CashOutflowItem[];
  customers?: Customer[];
}) => void;

const stateListeners: Set<SyncStateListener> = new Set();
const dataListeners: Set<DataUpdateListener> = new Set();

let currentState: FirebaseSyncState = {
  user: null,
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  isFirebaseConnected: false,
  lastSyncTime: Date.now(),
  syncStatus: 'unauthenticated'
};

function updateState(partial: Partial<FirebaseSyncState>) {
  currentState = { ...currentState, ...partial };
  stateListeners.forEach(listener => {
    try {
      listener(currentState);
    } catch (e) {
      console.error('Error en listener de estado Firebase:', e);
    }
  });
}

export function onFirebaseStateChange(cb: SyncStateListener): () => void {
  cb(currentState);
  stateListeners.add(cb);
  return () => {
    stateListeners.delete(cb);
  };
}

export function onFirebaseDataUpdate(cb: DataUpdateListener): () => void {
  dataListeners.add(cb);
  return () => {
    dataListeners.delete(cb);
  };
}

function notifyDataUpdate(data: {
  tickets?: SaleTicket[];
  orders?: BakeryOrder[];
  shiftCuts?: ShiftCutRecord[];
  outflows?: CashOutflowItem[];
  customers?: Customer[];
}) {
  dataListeners.forEach(listener => {
    try {
      listener(data);
    } catch (e) {
      console.error('Error en listener de datos Firebase:', e);
    }
  });
}

// Limpiar valores 'undefined' para compatibilidad con Firestore
function sanitizePayload<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj, (_, val) => (val === undefined ? null : val)));
}

// Referencias a desuscriptores en tiempo real
let unsubTickets: (() => void) | null = null;
let unsubOrders: (() => void) | null = null;
let unsubShiftCuts: (() => void) | null = null;
let unsubOutflows: (() => void) | null = null;
let unsubCustomers: (() => void) | null = null;

/**
 * Iniciar escuchas en tiempo real de Firestore
 */
export function startFirestoreRealtimeSync() {
  if (!auth.currentUser) {
    updateState({ syncStatus: 'unauthenticated', isFirebaseConnected: false });
    return;
  }

  // Cancelar escuchas previas si existen
  stopFirestoreRealtimeSync();

  updateState({ syncStatus: 'syncing', isFirebaseConnected: true });

  // 1. Tickets en tiempo real (últimos 1500 tickets por fecha)
  try {
    const ticketsCol = collection(db, 'tickets');
    const qTickets = query(ticketsCol, orderBy('date', 'desc'), limit(1500));
    unsubTickets = onSnapshot(
      qTickets,
      (snapshot) => {
        const firestoreTickets: SaleTicket[] = [];
        snapshot.forEach(docSnap => {
          firestoreTickets.push(docSnap.data() as SaleTicket);
        });

        if (firestoreTickets.length > 0) {
          const localTickets = loadTickets();
          const merged = mergeTickets(localTickets, firestoreTickets);
          saveTickets(merged, true);
          notifyDataUpdate({ tickets: merged });
        }
        updateState({ syncStatus: 'synced', lastSyncTime: Date.now() });
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, 'tickets');
      }
    );
  } catch (err) {
    console.error('Error inicializando listener de tickets:', err);
  }

  // 2. Pedidos en tiempo real
  try {
    const ordersCol = collection(db, 'orders');
    unsubOrders = onSnapshot(
      ordersCol,
      (snapshot) => {
        const firestoreOrders: BakeryOrder[] = [];
        snapshot.forEach(docSnap => {
          firestoreOrders.push(docSnap.data() as BakeryOrder);
        });

        if (firestoreOrders.length > 0) {
          const localOrders = loadOrders();
          const merged = mergeOrders(localOrders, firestoreOrders);
          saveOrders(merged, true);
          notifyDataUpdate({ orders: merged });
        }
        updateState({ syncStatus: 'synced', lastSyncTime: Date.now() });
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, 'orders');
      }
    );
  } catch (err) {
    console.error('Error inicializando listener de pedidos:', err);
  }

  // 3. Cortes de caja en tiempo real
  try {
    const cutsCol = collection(db, 'shiftCuts');
    unsubShiftCuts = onSnapshot(
      cutsCol,
      (snapshot) => {
        const firestoreCuts: ShiftCutRecord[] = [];
        snapshot.forEach(docSnap => {
          firestoreCuts.push(docSnap.data() as ShiftCutRecord);
        });

        if (firestoreCuts.length > 0) {
          const localCuts = loadShiftCuts();
          const merged = mergeShiftCuts(localCuts, firestoreCuts);
          saveShiftCuts(merged, true);
          notifyDataUpdate({ shiftCuts: merged });
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, 'shiftCuts');
      }
    );
  } catch (err) {
    console.error('Error inicializando listener de cortes:', err);
  }

  // 4. Salidas de caja en tiempo real
  try {
    const outflowsCol = collection(db, 'outflows');
    unsubOutflows = onSnapshot(
      outflowsCol,
      (snapshot) => {
        const firestoreOutflows: CashOutflowItem[] = [];
        snapshot.forEach(docSnap => {
          firestoreOutflows.push(docSnap.data() as CashOutflowItem);
        });

        if (firestoreOutflows.length > 0) {
          const localOutflows = loadOutflows();
          const merged = mergeOutflows(localOutflows, firestoreOutflows);
          saveOutflows(merged, true);
          notifyDataUpdate({ outflows: merged });
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, 'outflows');
      }
    );
  } catch (err) {
    console.error('Error inicializando listener de salidas:', err);
  }

  // 5. Clientes en tiempo real
  try {
    const customersCol = collection(db, 'customers');
    unsubCustomers = onSnapshot(
      customersCol,
      (snapshot) => {
        const firestoreCustomers: Customer[] = [];
        snapshot.forEach(docSnap => {
          firestoreCustomers.push(docSnap.data() as Customer);
        });

        if (firestoreCustomers.length > 0) {
          const localCustomers = loadCustomers();
          const merged = mergeCustomers(localCustomers, firestoreCustomers);
          saveCustomers(merged, true);
          notifyDataUpdate({ customers: merged });
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, 'customers');
      }
    );
  } catch (err) {
    console.error('Error inicializando listener de clientes:', err);
  }
}

export function stopFirestoreRealtimeSync() {
  if (unsubTickets) { unsubTickets(); unsubTickets = null; }
  if (unsubOrders) { unsubOrders(); unsubOrders = null; }
  if (unsubShiftCuts) { unsubShiftCuts(); unsubShiftCuts = null; }
  if (unsubOutflows) { unsubOutflows(); unsubOutflows = null; }
  if (unsubCustomers) { unsubCustomers(); unsubCustomers = null; }
}

/**
 * Guardar Ticket directamente en Firestore
 */
export async function saveTicketToFirestore(ticket: SaleTicket): Promise<boolean> {
  if (!auth.currentUser) {
    // Si no está autenticado en Firebase aún, el ticket ya está seguro en localStorage
    return false;
  }
  const cleanId = String(ticket.id).replace(/[^a-zA-Z0-9_\-\.]/g, '_');
  const path = `tickets/${cleanId}`;
  try {
    const cleanPayload = sanitizePayload({
      ...ticket,
      id: cleanId
    });
    await setDoc(doc(db, 'tickets', cleanId), cleanPayload);
    updateState({ syncStatus: 'synced', lastSyncTime: Date.now() });
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

/**
 * Guardar Pedido directamente en Firestore
 */
export async function saveOrderToFirestore(order: BakeryOrder): Promise<boolean> {
  if (!auth.currentUser) return false;
  const cleanId = String(order.id).replace(/[^a-zA-Z0-9_\-\.]/g, '_');
  const path = `orders/${cleanId}`;
  try {
    const cleanPayload = sanitizePayload({
      ...order,
      id: cleanId
    });
    await setDoc(doc(db, 'orders', cleanId), cleanPayload);
    updateState({ syncStatus: 'synced', lastSyncTime: Date.now() });
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

/**
 * Eliminar Pedido de Firestore
 */
export async function deleteOrderFromFirestore(orderId: string): Promise<boolean> {
  if (!auth.currentUser) return false;
  const cleanId = String(orderId).replace(/[^a-zA-Z0-9_\-\.]/g, '_');
  const path = `orders/${cleanId}`;
  try {
    await deleteDoc(doc(db, 'orders', cleanId));
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

/**
 * Guardar Corte de Caja en Firestore
 */
export async function saveShiftCutToFirestore(cut: ShiftCutRecord): Promise<boolean> {
  if (!auth.currentUser) return false;
  const cleanId = String(cut.id).replace(/[^a-zA-Z0-9_\-\.]/g, '_');
  const path = `shiftCuts/${cleanId}`;
  try {
    const cleanPayload = sanitizePayload({
      ...cut,
      id: cleanId
    });
    await setDoc(doc(db, 'shiftCuts', cleanId), cleanPayload);
    updateState({ syncStatus: 'synced', lastSyncTime: Date.now() });
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

/**
 * Guardar Salida de Efectivo en Firestore
 */
export async function saveOutflowToFirestore(outflow: CashOutflowItem): Promise<boolean> {
  if (!auth.currentUser) return false;
  const cleanId = String(outflow.id).replace(/[^a-zA-Z0-9_\-\.]/g, '_');
  const path = `outflows/${cleanId}`;
  try {
    const cleanPayload = sanitizePayload({
      ...outflow,
      id: cleanId
    });
    await setDoc(doc(db, 'outflows', cleanId), cleanPayload);
    updateState({ syncStatus: 'synced', lastSyncTime: Date.now() });
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

/**
 * Guardar Cliente en Firestore
 */
export async function saveCustomerToFirestore(customer: Customer): Promise<boolean> {
  if (!auth.currentUser) return false;
  const cleanId = String(customer.id).replace(/[^a-zA-Z0-9_\-\.]/g, '_');
  const path = `customers/${cleanId}`;
  try {
    const cleanPayload = sanitizePayload({
      ...customer,
      id: cleanId
    });
    await setDoc(doc(db, 'customers', cleanId), cleanPayload);
    updateState({ syncStatus: 'synced', lastSyncTime: Date.now() });
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

/**
 * Migra o sube todos los datos locales existentes a Firestore en segundo plano
 * para que nada se pierda y todo esté disponible en el celular inmediatamente.
 */
export async function syncAllLocalDataToFirestore(): Promise<{ success: boolean; count: number }> {
  if (!auth.currentUser) {
    return { success: false, count: 0 };
  }

  updateState({ syncStatus: 'syncing' });

  try {
    const localTickets = loadTickets();
    const localOrders = loadOrders();
    const localCuts = loadShiftCuts();
    const localOutflows = loadOutflows();
    const localCustomers = loadCustomers();

    let uploadedCount = 0;

    // Subir en chunks de 400 (límite batch de Firestore es 500)
    const chunkSize = 400;

    // Subir tickets
    for (let i = 0; i < localTickets.length; i += chunkSize) {
      const batch = writeBatch(db);
      const chunk = localTickets.slice(i, i + chunkSize);
      chunk.forEach(t => {
        const cleanId = String(t.id).replace(/[^a-zA-Z0-9_\-\.]/g, '_');
        const ref = doc(db, 'tickets', cleanId);
        batch.set(ref, sanitizePayload({ ...t, id: cleanId }), { merge: true });
        uploadedCount++;
      });
      await batch.commit();
    }

    // Subir pedidos
    if (localOrders.length > 0) {
      const batch = writeBatch(db);
      localOrders.forEach(o => {
        const cleanId = String(o.id).replace(/[^a-zA-Z0-9_\-\.]/g, '_');
        const ref = doc(db, 'orders', cleanId);
        batch.set(ref, sanitizePayload({ ...o, id: cleanId }), { merge: true });
        uploadedCount++;
      });
      await batch.commit();
    }

    // Subir cortes
    if (localCuts.length > 0) {
      const batch = writeBatch(db);
      localCuts.forEach(c => {
        const cleanId = String(c.id).replace(/[^a-zA-Z0-9_\-\.]/g, '_');
        const ref = doc(db, 'shiftCuts', cleanId);
        batch.set(ref, sanitizePayload({ ...c, id: cleanId }), { merge: true });
        uploadedCount++;
      });
      await batch.commit();
    }

    // Subir salidas
    if (localOutflows.length > 0) {
      const batch = writeBatch(db);
      localOutflows.forEach(outflow => {
        const cleanId = String(outflow.id).replace(/[^a-zA-Z0-9_\-\.]/g, '_');
        const ref = doc(db, 'outflows', cleanId);
        batch.set(ref, sanitizePayload({ ...outflow, id: cleanId }), { merge: true });
        uploadedCount++;
      });
      await batch.commit();
    }

    // Subir clientes
    if (localCustomers.length > 0) {
      const batch = writeBatch(db);
      localCustomers.forEach(cust => {
        const cleanId = String(cust.id).replace(/[^a-zA-Z0-9_\-\.]/g, '_');
        const ref = doc(db, 'customers', cleanId);
        batch.set(ref, sanitizePayload({ ...cust, id: cleanId }), { merge: true });
        uploadedCount++;
      });
      await batch.commit();
    }

    updateState({ 
      syncStatus: 'synced', 
      isFirebaseConnected: true,
      lastSyncTime: Date.now() 
    });

    return { success: true, count: uploadedCount };
  } catch (err) {
    console.error('Error subiendo datos iniciales a Firestore:', err);
    updateState({ syncStatus: 'error', errorMessage: String(err) });
    return { success: false, count: 0 };
  }
}

/**
 * Iniciar sesión con Google para habilitar sincronización en tiempo real
 */
export async function loginWithGoogle(): Promise<User | null> {
  try {
    const cred = await signInWithPopup(auth, googleProvider);
    return cred.user;
  } catch (err) {
    console.error('Error al iniciar sesión con Google:', err);
    updateState({ syncStatus: 'error', errorMessage: 'No se pudo iniciar sesión con Google' });
    throw err;
  }
}

/**
 * Cerrar sesión
 */
export async function logoutGoogle(): Promise<void> {
  stopFirestoreRealtimeSync();
  await signOut(auth);
  updateState({ user: null, isFirebaseConnected: false, syncStatus: 'unauthenticated' });
}

// Inicializar listener de estado de autenticación
if (typeof window !== 'undefined') {
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      updateState({ 
        user, 
        isFirebaseConnected: true, 
        syncStatus: 'syncing' 
      });
      // Iniciar escuchas en tiempo real
      startFirestoreRealtimeSync();
      // Asegurar que datos locales existentes estén en Firestore
      syncAllLocalDataToFirestore().catch(e => console.warn('Sync inicial background:', e));
    } else {
      stopFirestoreRealtimeSync();
      updateState({ 
        user: null, 
        isFirebaseConnected: false, 
        syncStatus: 'unauthenticated' 
      });
    }
  });

  window.addEventListener('online', () => updateState({ isOnline: true }));
  window.addEventListener('offline', () => updateState({ isOnline: false }));
}
