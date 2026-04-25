import React, { createContext, useContext, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  tone?: 'default' | 'danger';
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

interface PendingConfirm {
  options: ConfirmOptions;
  resolve: (value: boolean) => void;
}

const ConfirmContext = createContext<ConfirmFn | null>(null);

export const ConfirmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  const confirm: ConfirmFn = (options) =>
    new Promise((resolve) => {
      setPending({ options, resolve });
    });

  const close = (value: boolean) => {
    if (!pending) {
      return;
    }

    pending.resolve(value);
    setPending(null);
  };

  const tone = pending?.options.tone ?? 'default';

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending ? (
        <div className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-2xl shadow-slate-950/20 dark:border-slate-800 dark:bg-slate-950">
            <div className="flex items-start gap-4 p-5">
              <div
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
                  tone === 'danger'
                    ? 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-200'
                    : 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-200'
                }`}
              >
                <AlertTriangle size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-black text-slate-900 dark:text-slate-100">{pending.options.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">{pending.options.message}</p>
              </div>
              <button
                type="button"
                onClick={() => close(false)}
                className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
              >
                <X size={17} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 border-t border-slate-100 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900">
              <button
                type="button"
                onClick={() => close(false)}
                className="rounded-2xl bg-white px-4 py-3 text-sm font-black text-slate-600 shadow-sm dark:bg-slate-800 dark:text-slate-200"
              >
                {pending.options.cancelText ?? '取消'}
              </button>
              <button
                type="button"
                onClick={() => close(true)}
                className={`rounded-2xl px-4 py-3 text-sm font-black text-white shadow-sm ${
                  tone === 'danger' ? 'bg-red-600 hover:bg-red-500' : 'bg-blue-600 hover:bg-blue-500'
                }`}
              >
                {pending.options.confirmText ?? '确认'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </ConfirmContext.Provider>
  );
};

export const useConfirm = () => {
  const context = useContext(ConfirmContext);

  if (!context) {
    throw new Error('useConfirm must be used inside ConfirmProvider');
  }

  return context;
};
