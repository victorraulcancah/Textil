import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertOctagon, AlertTriangle, Bell, Info, RefreshCw, X } from 'lucide-react';
import api from '../lib/api';
import { cn } from './ui';

const NIVEL = {
    danger: { dot: 'bg-danger-500', chip: 'bg-danger-100 text-danger-700', Icon: AlertOctagon },
    warning: { dot: 'bg-warning-500', chip: 'bg-warning-100 text-warning-700', Icon: AlertTriangle },
    info: { dot: 'bg-info-500', chip: 'bg-info-100 text-info-700', Icon: Info },
};

export default function AlertsBell() {
    const [open, setOpen] = useState(false);
    const [data, setData] = useState({ total: 0, por_nivel: {}, alertas: [] });
    const [loading, setLoading] = useState(false);
    const ref = useRef(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get('/alertas');
            setData(res.data);
        } catch {
            /* silencioso: las alertas no deben romper la app */
        } finally {
            setLoading(false);
        }
    }, []);

    // Carga inicial + refresco cada 2 minutos.
    useEffect(() => {
        load();
        const t = setInterval(load, 120000);
        return () => clearInterval(t);
    }, [load]);

    // Cerrar al hacer clic fuera.
    useEffect(() => {
        if (!open) return;
        const handler = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    const total = data.total ?? 0;
    const badgeColor =
        (data.por_nivel?.danger ?? 0) > 0
            ? 'bg-danger-600'
            : (data.por_nivel?.warning ?? 0) > 0
              ? 'bg-warning-500'
              : 'bg-primary-600';

    return (
        <div ref={ref} className="fixed right-4 top-3 z-40">
            <button
                onClick={() => {
                    setOpen((v) => !v);
                    if (!open) load();
                }}
                aria-label="Alertas"
                className="relative flex h-10 w-10 items-center justify-center rounded-full border border-edge bg-white text-warm-600 shadow-sm transition hover:bg-primary-50 hover:text-primary-700"
            >
                <Bell className="h-5 w-5" />
                {total > 0 && (
                    <span
                        className={cn(
                            'absolute -right-0.5 -top-0.5 flex h-5 min-w-[20px] items-center justify-center rounded-full px-1 text-[10px] font-bold text-white',
                            badgeColor,
                        )}
                    >
                        {total > 99 ? '99+' : total}
                    </span>
                )}
            </button>

            {open && (
                <div className="absolute right-0 mt-2 w-[calc(100vw-2rem)] max-w-sm overflow-hidden rounded-2xl border border-edge bg-white shadow-2xl">
                    <div className="flex items-center justify-between border-b border-edge px-4 py-3">
                        <div>
                            <h3 className="text-sm font-bold text-warm-900">Alertas</h3>
                            <p className="text-xs text-warm-500">
                                {total > 0 ? `${total} pendiente${total !== 1 ? 's' : ''}` : 'Todo en orden'}
                            </p>
                        </div>
                        <div className="flex items-center gap-1">
                            <button
                                onClick={load}
                                aria-label="Actualizar"
                                className="rounded-md p-1.5 text-warm-500 transition hover:bg-gray-100 hover:text-warm-800"
                            >
                                <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
                            </button>
                            <button
                                onClick={() => setOpen(false)}
                                aria-label="Cerrar"
                                className="rounded-md p-1.5 text-warm-500 transition hover:bg-gray-100 hover:text-warm-800"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                    </div>

                    <div className="max-h-[70vh] overflow-y-auto">
                        {total === 0 ? (
                            <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                                <Bell className="h-8 w-8 text-warm-300" />
                                <p className="text-sm text-warm-500">No hay alertas por ahora. 🎉</p>
                            </div>
                        ) : (
                            <ul className="divide-y divide-gray-100">
                                {data.alertas.map((a) => {
                                    const style = NIVEL[a.nivel] ?? NIVEL.info;
                                    const Icon = style.Icon;
                                    return (
                                        <li key={a.id} className="flex gap-3 px-4 py-3">
                                            <span className={cn('mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full', style.chip)}>
                                                <Icon className="h-4 w-4" />
                                            </span>
                                            <div className="min-w-0">
                                                <p className="text-sm font-medium text-warm-900">{a.titulo}</p>
                                                <p className="text-xs text-warm-500">{a.detalle}</p>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
