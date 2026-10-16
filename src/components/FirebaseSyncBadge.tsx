import React, { useState, useEffect } from 'react';
import { 
  onFirebaseStateChange, 
  loginWithGoogle, 
  logoutGoogle, 
  syncAllLocalDataToFirestore,
  type FirebaseSyncState 
} from '../services/firebaseSyncService';
import { Cloud, CloudCheck, RefreshCw, LogIn, LogOut, CheckCircle2, AlertCircle, X, Smartphone } from 'lucide-react';

export const FirebaseSyncBadge: React.FC = () => {
  const [syncState, setSyncState] = useState<FirebaseSyncState>({
    user: null,
    isOnline: true,
    isFirebaseConnected: false,
    lastSyncTime: Date.now(),
    syncStatus: 'unauthenticated'
  });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onFirebaseStateChange((state) => {
      setSyncState(state);
    });
    return unsub;
  }, []);

  const handleLogin = async () => {
    setIsActionLoading(true);
    setActionNotice(null);
    try {
      await loginWithGoogle();
      setActionNotice('¡Conectado exitosamente con Firebase! Sincronizando en tiempo real.');
    } catch (err: any) {
      setActionNotice(err?.message || 'Error al conectar con Google.');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleLogout = async () => {
    setIsActionLoading(true);
    try {
      await logoutGoogle();
      setActionNotice('Sesión cerrada.');
    } catch (err: any) {
      setActionNotice('Error al cerrar sesión.');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleForceSync = async () => {
    setIsActionLoading(true);
    setActionNotice(null);
    try {
      const res = await syncAllLocalDataToFirestore();
      if (res.success) {
        setActionNotice(`¡Sincronización completa! ${res.count} registros sincronizados con la nube.`);
      } else {
        setActionNotice('Hubo un detalle al sincronizar. Verifique su conexión.');
      }
    } catch (err: any) {
      setActionNotice('Error al sincronizar.');
    } finally {
      setIsActionLoading(false);
    }
  };

  return (
    <>
      {/* Badge Button en la barra superior */}
      {syncState.user ? (
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center space-x-1.5 px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-2xs"
          title={`Conectado a Firebase en tiempo real como ${syncState.user.email}`}
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="hidden sm:inline">Firebase En Vivo</span>
          <span className="sm:hidden">En Vivo</span>
        </button>
      ) : (
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center space-x-1.5 px-2.5 py-1 bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-900 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-2xs animate-pulse"
          title="Conectar con Firebase para ver tickets en tiempo real en tu celular"
        >
          <Smartphone className="w-3.5 h-3.5 text-amber-700" />
          <span className="hidden sm:inline">Conectar Celular</span>
          <span className="sm:hidden">Nube</span>
        </button>
      )}

      {/* Modal de Control de Sincronización Firebase */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden">
            {/* Header del Modal */}
            <div className="px-5 py-4 bg-gradient-to-r from-orange-500 to-amber-600 text-white flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Cloud className="w-5 h-5 text-white" />
                <h3 className="font-bold text-base">Sincronización Firebase en Tiempo Real</h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Contenido del Modal */}
            <div className="p-5 space-y-4">
              <div className="text-xs text-slate-600 bg-amber-50 border border-amber-200 p-3 rounded-xl flex items-start space-x-2.5">
                <Smartphone className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-amber-900 block font-bold mb-0.5">
                    Tickets y ventas en tu celular al instante
                  </strong>
                  Inicia sesión con tu cuenta de Google en tu computadora y en tu celular. Al registrar cualquier venta o ticket en mostrador, aparecerá en vivo en tu teléfono tal como en Punto Zákia.
                </div>
              </div>

              {/* Estado de conexión actual */}
              <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500">Estado de Firebase:</span>
                  {syncState.user ? (
                    <span className="inline-flex items-center text-xs font-bold text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-full">
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                      Conectado en Vivo
                    </span>
                  ) : (
                    <span className="inline-flex items-center text-xs font-bold text-amber-700 bg-amber-100 px-2.5 py-0.5 rounded-full">
                      <AlertCircle className="w-3.5 h-3.5 mr-1 text-amber-600" />
                      Pendiente de Conectar
                    </span>
                  )}
                </div>

                {syncState.user && (
                  <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-200">
                    <span className="font-medium text-slate-500">Cuenta activa:</span>
                    <span className="font-bold text-slate-800 truncate max-w-[200px]">
                      {syncState.user.email}
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-200">
                  <span className="font-medium text-slate-500">Conexión a Internet:</span>
                  <span className={`font-bold ${syncState.isOnline ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {syncState.isOnline ? '🟢 Conectado' : '🔴 Sin Internet (Modo Local Seguro)'}
                  </span>
                </div>
              </div>

              {actionNotice && (
                <div className="p-3 bg-blue-50 border border-blue-200 text-blue-900 rounded-xl text-xs font-medium animate-in fade-in duration-150">
                  {actionNotice}
                </div>
              )}

              {/* Botones de acción */}
              <div className="space-y-2 pt-1">
                {!syncState.user ? (
                  <button
                    onClick={handleLogin}
                    disabled={isActionLoading}
                    className="w-full flex items-center justify-center space-x-2 py-3 px-4 bg-orange-600 hover:bg-orange-700 text-white rounded-xl font-bold text-sm shadow-md transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer"
                  >
                    {isActionLoading ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <LogIn className="w-4 h-4" />
                    )}
                    <span>Iniciar sesión con Google para Conectar</span>
                  </button>
                ) : (
                  <>
                    <button
                      onClick={handleForceSync}
                      disabled={isActionLoading}
                      className="w-full flex items-center justify-center space-x-2 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm shadow-sm transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer"
                    >
                      {isActionLoading ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <RefreshCw className="w-4 h-4" />
                      )}
                      <span>Sincronizar Todo Ahora con Firebase</span>
                    </button>

                    <button
                      onClick={handleLogout}
                      disabled={isActionLoading}
                      className="w-full flex items-center justify-center space-x-2 py-2 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-medium text-xs transition-colors cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5 text-slate-500" />
                      <span>Cerrar Sesión</span>
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="bg-slate-50 px-5 py-3 border-t border-slate-200 text-right">
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-200 transition-colors cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
