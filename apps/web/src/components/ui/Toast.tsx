import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export type ToastTone = 'success' | 'error' | 'warning' | 'info';

export type Toast = {
  id: string;
  tone: ToastTone;
  title?: string;
  message: string;
  durationMs?: number;
};

type ToastInput = Omit<Toast, 'id'> & { id?: string };

type ToastApi = {
  push: (t: ToastInput) => string;
  success: (message: string, title?: string) => string;
  error: (message: string, title?: string) => string;
  info: (message: string, title?: string) => string;
  warning: (message: string, title?: string) => string;
  dismiss: (id: string) => void;
  clear: () => void;
};

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast fuera de ToastProvider');
  return ctx;
}

let counter = 0;
function makeId() {
  counter += 1;
  return `t-${Date.now()}-${counter}`;
}

const DEFAULT_DURATIONS: Record<ToastTone, number> = {
  success: 3500,
  info: 4000,
  warning: 5500,
  error: 7000,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<string, number>>(new Map());

  const dismiss = useCallback((id: string) => {
    setToasts((cur) => cur.filter((t) => t.id !== id));
    const handle = timers.current.get(id);
    if (handle) {
      window.clearTimeout(handle);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (t: ToastInput) => {
      const id = t.id ?? makeId();
      const toast: Toast = {
        id,
        tone: t.tone,
        title: t.title,
        message: t.message,
        durationMs: t.durationMs ?? DEFAULT_DURATIONS[t.tone],
      };
      setToasts((cur) => [...cur.filter((x) => x.id !== id), toast]);
      if (toast.durationMs && toast.durationMs > 0) {
        const handle = window.setTimeout(() => dismiss(id), toast.durationMs);
        timers.current.set(id, handle);
      }
      return id;
    },
    [dismiss],
  );

  const api: ToastApi = {
    push,
    success: (message, title) => push({ tone: 'success', message, title }),
    error: (message, title) => push({ tone: 'error', message, title }),
    info: (message, title) => push({ tone: 'info', message, title }),
    warning: (message, title) => push({ tone: 'warning', message, title }),
    dismiss,
    clear: () => {
      timers.current.forEach((h) => window.clearTimeout(h));
      timers.current.clear();
      setToasts([]);
    },
  };

  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach((h) => window.clearTimeout(h));
      map.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-stack" role="region" aria-label="Notificaciones">
        {toasts.map((t) => (
          <output
            key={t.id}
            className={`toast toast-${t.tone}`}
            aria-live={t.tone === 'error' ? 'assertive' : 'polite'}
          >
            <div className="toast-body">
              {t.title ? <strong className="toast-title">{t.title}</strong> : null}
              <span className="toast-message">{t.message}</span>
            </div>
            <button
              type="button"
              className="toast-close"
              onClick={() => dismiss(t.id)}
              aria-label="Cerrar notificación"
            >
              ×
            </button>
          </output>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
