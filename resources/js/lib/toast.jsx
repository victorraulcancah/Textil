import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { cn } from '../components/ui/cn';

const ToastContext = createContext(null);

const VARIANTS = {
    success: { icon: CheckCircle2, accent: 'border-l-green-500', iconColor: 'text-green-500' },
    error: { icon: XCircle, accent: 'border-l-red-500', iconColor: 'text-red-500' },
    warning: { icon: AlertTriangle, accent: 'border-l-amber-500', iconColor: 'text-amber-500' },
    info: { icon: Info, accent: 'border-l-primary-500', iconColor: 'text-primary-500' },
};

// Duración por defecto (ms) para cada tipo. `null` = permanece hasta cerrarlo.
const DEFAULT_DURATION = {
    success: 4000,
    info: 4000,
    warning: 5000,
    error: 6000,
};

let idCounter = 0;

export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);
    const timers = useRef({});

    const dismiss = useCallback((id) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
        if (timers.current[id]) {
            clearTimeout(timers.current[id]);
            delete timers.current[id];
        }
    }, []);

    const push = useCallback(
        (toast) => {
            const id = ++idCounter;
            const variant = toast.variant ?? 'info';
            // duration undefined → usa el default del tipo; null → permanente
            const duration =
                toast.duration === undefined ? DEFAULT_DURATION[variant] : toast.duration;

            setToasts((prev) => [...prev, { ...toast, id, variant }]);

            if (duration != null) {
                timers.current[id] = setTimeout(() => dismiss(id), duration);
            }
            return id;
        },
        [dismiss],
    );

    // Limpia timers pendientes al desmontar el provider.
    useEffect(() => {
        const active = timers.current;
        return () => Object.values(active).forEach(clearTimeout);
    }, []);

    const api = useMemo(
        () => ({
            notify: push,
            success: (message, opts = {}) => push({ variant: 'success', message, ...opts }),
            error: (message, opts = {}) => push({ variant: 'error', message, ...opts }),
            warning: (message, opts = {}) => push({ variant: 'warning', message, ...opts }),
            info: (message, opts = {}) => push({ variant: 'info', message, ...opts }),
            // Alerta persistente (ej. "productos por vencer"): se queda fija hasta
            // que el usuario la cierra. Se puede sobreescribir con opts.duration.
            alert: (message, opts = {}) =>
                push({ variant: 'warning', duration: null, message, ...opts }),
            dismiss,
        }),
        [push, dismiss],
    );

    return (
        <ToastContext.Provider value={api}>
            {children}
            <ToastViewport toasts={toasts} onDismiss={dismiss} />
        </ToastContext.Provider>
    );
}

export function useToast() {
    const ctx = useContext(ToastContext);
    if (!ctx) {
        throw new Error('useToast debe usarse dentro de <ToastProvider>');
    }
    return ctx;
}

function ToastViewport({ toasts, onDismiss }) {
    if (typeof document === 'undefined') return null;

    return createPortal(
        <div className="pointer-events-none fixed inset-x-0 top-0 z-[200] flex flex-col items-end gap-2 p-4 sm:top-4 sm:right-4 sm:inset-x-auto sm:p-0">
            {toasts.map((toast) => (
                <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
            ))}
        </div>,
        document.body,
    );
}

function ToastItem({ toast, onDismiss }) {
    const v = VARIANTS[toast.variant] ?? VARIANTS.info;
    const Icon = v.icon;

    return (
        <div
            role={toast.variant === 'error' || toast.duration === null ? 'alert' : 'status'}
            style={{ animation: 'toast-in 0.2s ease-out' }}
            className={cn(
                'pointer-events-auto flex w-[calc(100vw-2rem)] max-w-sm items-start gap-3 rounded-lg border border-edge border-l-4 bg-white p-3.5 shadow-lg',
                v.accent,
            )}
        >
            <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', v.iconColor)} />
            <div className="min-w-0 flex-1">
                {toast.title && (
                    <p className="text-sm font-semibold text-warm-900">{toast.title}</p>
                )}
                {toast.message && (
                    <p className={cn('text-sm text-gray-600', toast.title && 'mt-0.5')}>
                        {toast.message}
                    </p>
                )}
            </div>
            <button
                type="button"
                onClick={() => onDismiss(toast.id)}
                aria-label="Cerrar"
                className="-mr-1 -mt-1 shrink-0 rounded-md p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
            >
                <X className="h-4 w-4" />
            </button>
        </div>
    );
}
