import React, { createContext, useContext, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info' | 'warn';

interface ToastInput {
  type?: ToastType;
  title: string;
  message?: string;
  duration?: number;
}

interface ToastItem extends ToastInput {
  id: string;
  type: ToastType;
}

interface ToastContextValue {
  showToast: (input: ToastInput) => void;
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
  warn: (title: string, message?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const toastMeta: Record<ToastType, { className: string; icon: React.ReactNode }> = {
  success: {
    className: 'border-emerald-100 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-900/30 dark:text-emerald-100',
    icon: <CheckCircle2 size={18} />,
  },
  error: {
    className: 'border-red-100 bg-red-50 text-red-700 dark:border-red-900/40 dark:bg-red-900/30 dark:text-red-100',
    icon: <AlertTriangle size={18} />,
  },
  warn: {
    className: 'border-amber-100 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-900/30 dark:text-amber-100',
    icon: <AlertTriangle size={18} />,
  },
  info: {
    className: 'border-blue-100 bg-blue-50 text-blue-700 dark:border-blue-900/40 dark:bg-blue-900/30 dark:text-blue-100',
    icon: <Info size={18} />,
  },
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef(new Map<string, number>());

  const removeToast = (id: string) => {
    const timer = timersRef.current.get(id);

    if (timer) {
      window.clearTimeout(timer);
      timersRef.current.delete(id);
    }

    setToasts((current) => current.filter((toast) => toast.id !== id));
  };

  const showToast = (input: ToastInput) => {
    const id = `toast_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const duration = input.duration ?? 3200;
    const toast: ToastItem = {
      ...input,
      id,
      type: input.type ?? 'info',
    };

    setToasts((current) => [toast, ...current].slice(0, 4));

    const timer = window.setTimeout(() => removeToast(id), duration);
    timersRef.current.set(id, timer);
  };

  const value: ToastContextValue = {
    showToast,
    success: (title, message) => showToast({ type: 'success', title, message }),
    error: (title, message) => showToast({ type: 'error', title, message, duration: 4200 }),
    info: (title, message) => showToast({ type: 'info', title, message }),
    warn: (title, message) => showToast({ type: 'warn', title, message, duration: 3800 }),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed left-3 right-3 top-4 z-[120] flex flex-col gap-3 sm:left-auto sm:w-[360px]">
        {toasts.map((toast) => {
          const meta = toastMeta[toast.type];

          return (
            <div
              key={toast.id}
              className={`pointer-events-auto flex items-start gap-3 rounded-3xl border p-4 shadow-2xl shadow-slate-900/10 backdrop-blur-md ${meta.className}`}
            >
              <div className="mt-0.5 shrink-0">{meta.icon}</div>
              <div className="min-w-0 flex-1">
                <div className="break-words text-sm font-black">{toast.title}</div>
                {toast.message ? <p className="mt-1 break-words text-xs leading-relaxed opacity-80">{toast.message}</p> : null}
              </div>
              <button type="button" onClick={() => removeToast(toast.id)} className="shrink-0 rounded-full p-1 opacity-70">
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error('useToast must be used inside ToastProvider');
  }

  return context;
};
