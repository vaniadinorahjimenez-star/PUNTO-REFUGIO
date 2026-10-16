import React, { useState, useEffect } from 'react';
import { 
  X, 
  ShoppingBag, 
  Printer, 
  Check, 
  User, 
  Phone, 
  FileText, 
  Clock, 
  Sparkles,
  AlertCircle
} from 'lucide-react';
import { TicketItem, Customer } from '../../types';
import { playBeep, playCashSound } from '../../utils/audio';

interface UnpaidOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  ticketItems: TicketItem[];
  totalAmount: number;
  totalPieces: number;
  selectedCustomer: Customer | null;
  onConfirm: (data: {
    customerName: string;
    customerPhone: string;
    notes: string;
    shouldPrint: boolean;
  }) => void;
}

export const UnpaidOrderModal: React.FC<UnpaidOrderModalProps> = ({
  isOpen,
  onClose,
  ticketItems,
  totalAmount,
  totalPieces,
  selectedCustomer,
  onConfirm
}) => {
  const [customerName, setCustomerName] = useState<string>('');
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [shouldPrint, setShouldPrint] = useState<boolean>(true);
  const [customTotalInput, setCustomTotalInput] = useState<string>('');
  const [validationError, setValidationError] = useState<string | null>(null);

  // Auto-llenar si ya había cliente seleccionado en mostrador al abrir
  useEffect(() => {
    if (isOpen) {
      setValidationError(null);
      if (selectedCustomer) {
        setCustomerName(selectedCustomer.name);
        setCustomerPhone(selectedCustomer.phone);
      } else {
        setCustomerName('');
        setCustomerPhone('');
      }
      setNotes('');
      setShouldPrint(true);
      setCustomTotalInput(totalAmount > 0 ? totalAmount.toString() : '');
    }
  }, [isOpen, selectedCustomer, totalAmount]);

  if (!isOpen) return null;

  // Lista de opciones rápidas solicitadas expresamente por el usuario
  const quickOptions = [
    { label: 'Barra Verde', icon: '🥗', colorClass: 'bg-emerald-50 hover:bg-emerald-100 text-emerald-950 border-emerald-400 ring-2 ring-emerald-400/30' },
    { label: 'Burger Fuentes', icon: '🍔', colorClass: 'bg-amber-50 hover:bg-amber-100 text-amber-950 border-amber-400 ring-2 ring-amber-400/30' },
    { label: 'Trascos', icon: '🥖', colorClass: 'bg-slate-50 hover:bg-slate-100 text-slate-900 border-slate-300' },
    { label: 'Magda', icon: '👩', colorClass: 'bg-slate-50 hover:bg-slate-100 text-slate-900 border-slate-300' },
    { label: 'Bollos David', icon: '🥯', colorClass: 'bg-slate-50 hover:bg-slate-100 text-slate-900 border-slate-300' },
    { label: 'Deliz', icon: '✨', colorClass: 'bg-slate-50 hover:bg-slate-100 text-slate-900 border-slate-300' },
    { label: 'Venta Mostrador', icon: '🏪', colorClass: 'bg-slate-50 hover:bg-slate-100 text-slate-900 border-slate-300' }
  ];

  const handleSelectQuickOption = (name: string) => {
    playBeep(700, 'sine', 0.04);
    setCustomerName(name);
  };

  const effectiveTotal = totalAmount > 0 
    ? totalAmount 
    : (parseFloat(customTotalInput) || 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);
    const trimmed = customerName.trim();
    if (!trimmed) {
      playBeep(400, 'sawtooth', 0.08);
      setValidationError('Por favor escribe o selecciona el nombre del cliente');
      return;
    }

    if (ticketItems.length === 0 && effectiveTotal <= 0) {
      playBeep(400, 'sawtooth', 0.08);
      setValidationError('El pedido debe tener al menos un producto o un importe total');
      return;
    }

    playCashSound();
    onConfirm({
      customerName: trimmed,
      customerPhone: customerPhone.trim(),
      notes: notes.trim(),
      shouldPrint
    });
  };

  return (
    <div 
      className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div 
        className="bg-white text-slate-900 w-full max-w-lg rounded-2xl shadow-2xl border-2 border-amber-400 overflow-hidden my-auto animate-in zoom-in-95 duration-150 flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera / Barra Superior Verde/Ámbar distintiva */}
        <div className="bg-gradient-to-r from-emerald-600 via-teal-700 to-[#2D3142] text-white px-4 py-3 flex items-center justify-between shadow-xs shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white/15 backdrop-blur-xs flex items-center justify-center border border-white/25 shadow-2xs">
              <ShoppingBag className="w-5 h-5 text-amber-300 stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="font-black text-sm sm:text-base leading-tight">
                  Pedido Sin Cobrar
                </h3>
                <span className="bg-amber-400 text-amber-950 text-[10px] font-black px-1.5 py-0.2 rounded-full uppercase tracking-wider">
                  Mostrador
                </span>
              </div>
              <p className="text-[11px] text-emerald-100 font-medium">
                Se guardará en Encargos y Pedidos con saldo pendiente de pago
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              playBeep(450, 'sine', 0.03);
              onClose();
            }}
            className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 active:bg-white/30 text-white flex items-center justify-center cursor-pointer transition-colors"
            title="Cerrar ventana"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Cuerpo del Modal */}
        <form onSubmit={handleSubmit} className="p-4 space-y-3.5 overflow-y-auto flex-1">
          {validationError && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-semibold">
              ⚠️ {validationError}
            </div>
          )}
          
          {/* Tarjeta de Resumen del Mostrador */}
          <div className="bg-gradient-to-r from-amber-50/80 to-orange-50/80 border border-amber-300 rounded-xl p-3 shadow-2xs">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] font-black text-amber-900 uppercase tracking-wider block">
                  Resumen de Pan Marcado
                </span>
                <span className="text-xs font-bold text-slate-700">
                  {ticketItems.length > 0 ? (
                    <span>{totalPieces} piezas en el ticket</span>
                  ) : (
                    <span className="text-amber-800 font-semibold">Sin piezas previas marcadas</span>
                  )}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                  Total a cobrar
                </span>
                <span className="text-2xl font-black font-mono text-[#D95D39] leading-none">
                  ${effectiveTotal.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Desglose rápido si hay piezas */}
            {ticketItems.length > 0 ? (
              <div className="mt-2 pt-2 border-t border-amber-200/80 max-h-24 overflow-y-auto space-y-1">
                {ticketItems.map((it) => (
                  <div key={it.id} className="flex justify-between items-center text-[11px] text-slate-700 font-medium">
                    <span className="truncate pr-2">
                      <strong className="font-mono text-slate-900">{it.quantity}×</strong> {it.name}
                    </span>
                    <span className="font-mono font-bold text-slate-900 shrink-0">
                      ${it.total.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-2 pt-2 border-t border-amber-200/80 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
                <div className="flex-1 flex items-center gap-2">
                  <span className="text-xs text-amber-900 font-bold">Importe Total: $</span>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    placeholder="Monto $"
                    value={customTotalInput}
                    onChange={(e) => setCustomTotalInput(e.target.value)}
                    className="w-28 bg-white border border-amber-400 rounded-lg px-2 py-1 text-sm font-mono font-black text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#D95D39]"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Campo: Nombre del Cliente */}
          <div className="space-y-1">
            <label className="block text-xs font-black uppercase tracking-wider text-slate-800 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-emerald-700" />
                <span>Nombre del Cliente o Negocio <span className="text-rose-600">*</span></span>
              </span>
              {customerName && (
                <button
                  type="button"
                  onClick={() => {
                    playBeep(450, 'sine', 0.02);
                    setCustomerName('');
                  }}
                  className="text-[10px] text-slate-500 hover:text-rose-600 font-bold cursor-pointer"
                >
                  Limpiar
                </button>
              )}
            </label>

            <div className="relative">
              <input
                type="text"
                autoFocus
                required
                placeholder="Escribe el nombre del cliente..."
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full bg-white border-2 border-slate-300 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-900 placeholder:text-slate-400 outline-none transition-all shadow-2xs"
              />
              {customerName && (
                <button
                  type="button"
                  onClick={() => setCustomerName('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center text-xs font-bold cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Opciones Rápidas solicitadas por el usuario: Barra Verde, Burger Fuentes y más */}
          <div className="space-y-1.5 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black uppercase tracking-wide text-slate-700 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                <span>Opciones Rápidas (Un solo toque):</span>
              </span>
              <span className="text-[10px] text-slate-500 font-medium">Toca para seleccionar</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 pt-0.5">
              {quickOptions.map((opt) => {
                const isSelected = customerName.trim().toLowerCase() === opt.label.toLowerCase();
                return (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => handleSelectQuickOption(opt.label)}
                    className={`px-2.5 py-1.5 rounded-xl border text-left font-black text-xs transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer shadow-2xs ${opt.colorClass} ${
                      isSelected ? 'ring-2 ring-slate-900 shadow-xs scale-[1.02]' : ''
                    }`}
                  >
                    <span className="text-base leading-none shrink-0">{opt.icon}</span>
                    <span className="truncate leading-tight">{opt.label}</span>
                    {isSelected && (
                      <Check className="w-3.5 h-3.5 ml-auto text-emerald-700 stroke-[3] shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Fila: Teléfono y Notas */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div className="space-y-1">
              <label className="block text-[11px] font-bold text-slate-700 flex items-center gap-1">
                <Phone className="w-3 h-3 text-slate-500" />
                <span>Teléfono de contacto (Opcional):</span>
              </label>
              <input
                type="tel"
                placeholder="10 dígitos..."
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                className="w-full bg-white border border-slate-300 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-200 rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold text-slate-900 placeholder:text-slate-400 outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] font-bold text-slate-700 flex items-center gap-1">
                <FileText className="w-3 h-3 text-slate-500" />
                <span>Notas o Detalle (Opcional):</span>
              </label>
              <input
                type="text"
                placeholder="Ej. Pasa a las 4pm, apartado..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full bg-white border border-slate-300 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-200 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-900 placeholder:text-slate-400 outline-none"
              />
            </div>
          </div>

          {/* Opción de Impresión Térmica */}
          <div className="bg-[#FAF8F6] border border-[#E5E1DA] rounded-xl p-2.5 flex items-center justify-between cursor-pointer" onClick={() => setShouldPrint(!shouldPrint)}>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-slate-200 text-slate-700 flex items-center justify-center shrink-0">
                <Printer className="w-3.5 h-3.5" />
              </div>
              <div>
                <span className="text-xs font-bold text-slate-900 block leading-tight">
                  Imprimir Comanda Térmica de Pedido
                </span>
                <span className="text-[10px] text-slate-500 block leading-tight">
                  Para mostrador / mesa de empaque con detalle del pedido
                </span>
              </div>
            </div>
            <input
              type="checkbox"
              checked={shouldPrint}
              onChange={(e) => setShouldPrint(e.target.checked)}
              onClick={(e) => e.stopPropagation()}
              className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
            />
          </div>

          {/* Botones de Acción */}
          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={() => {
                playBeep(450, 'sine', 0.03);
                onClose();
              }}
              className="py-2.5 px-3 rounded-xl border border-slate-300 hover:bg-slate-100 active:bg-slate-200 text-slate-700 font-bold text-xs sm:text-sm cursor-pointer transition-colors text-center"
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={!customerName.trim()}
              className="py-2.5 px-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black text-xs sm:text-sm shadow-md transition-all active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer border border-emerald-600"
            >
              <Check className="w-4 h-4 stroke-[3]" />
              <span>Guardar en Encargos</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
