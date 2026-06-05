import { createContext, useContext, useState, useCallback } from 'react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((message, type = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <ToastContainer toasts={toasts} dismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx.showToast;
}

function ToastContainer({ toasts, dismiss }) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed top-3 right-3 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onDismiss={() => dismiss(toast.id)} />
      ))}
    </div>
  );
}

function Toast({ toast, onDismiss }) {
  const isError = toast.type === 'error';
  const isSuccess = toast.type === 'success';

  const borderColor = isError
    ? 'border-red-400/60'
    : isSuccess
    ? 'border-green-400/60'
    : 'border-white/20';

  const iconColor = isError
    ? 'text-red-400'
    : isSuccess
    ? 'text-green-400'
    : 'text-luna-silver';

  const icon = isError ? '✕' : isSuccess ? '✓' : 'ℹ';

  return (
    <div
      className={`pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-xl
        bg-luna-dark/95 backdrop-blur-md border ${borderColor} shadow-luna-lg
        max-w-xs w-72 animate-[slideInRight_0.25s_ease-out]`}
    >
      <span className={`text-sm font-bold mt-0.5 shrink-0 ${iconColor}`}>{icon}</span>
      <p className="text-luna-white text-sm leading-snug flex-1">{toast.message}</p>
      <button
        onClick={onDismiss}
        className="text-luna-silver hover:text-luna-white text-xs shrink-0 mt-0.5 transition-colors"
      >
        ✕
      </button>
    </div>
  );
}
