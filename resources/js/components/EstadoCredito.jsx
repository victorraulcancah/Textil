import { cn } from './ui';

/**
 * El estado crediticio del cliente, con su color y su nombre (nunca solo el
 * color): 🟢 al día · 🟡 con atraso · 🔴 restringido · ⚫ bloqueado.
 * Lo calcula el servidor (CreditoService); aquí solo se pinta.
 */
const PUNTO = {
    al_dia: 'bg-green-500',
    con_atraso: 'bg-amber-400',
    restringido: 'bg-red-600',
    bloqueado: 'bg-gray-900',
};

const FONDO = {
    al_dia: 'border-green-200 bg-green-50',
    con_atraso: 'border-amber-200 bg-amber-50',
    restringido: 'border-red-200 bg-red-50',
    bloqueado: 'border-gray-400 bg-gray-100',
};

/** La píldora: punto de color + nombre. El detalle va en el title. */
export default function EstadoCredito({ estado, className }) {
    if (!estado) return null;
    return (
        <span
            title={estado.detalle}
            className={cn(
                'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-edge bg-white px-2 py-0.5 text-xs font-medium text-warm-800',
                className,
            )}
        >
            <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', PUNTO[estado.codigo] ?? 'bg-gray-300')} />
            {estado.etiqueta}
        </span>
    );
}

/** El recuadro con el nombre y el porqué, para la ficha del cliente, la venta y el estado de cuenta. */
export function EstadoCreditoDetalle({ estado, children, className }) {
    if (!estado) return null;
    return (
        <div className={cn('flex flex-wrap items-start justify-between gap-3 rounded-xl border px-4 py-3', FONDO[estado.codigo], className)}>
            <div className="flex min-w-0 items-start gap-2.5">
                <span className={cn('mt-1 h-3.5 w-3.5 shrink-0 rounded-full', PUNTO[estado.codigo] ?? 'bg-gray-300')} />
                <div className="min-w-0">
                    <p className="text-sm font-semibold text-warm-900">Estado crediticio: {estado.etiqueta}</p>
                    <p className="text-xs text-warm-700">{estado.detalle}</p>
                    {estado.bloqueo?.texto && <p className="text-xs text-warm-500">{estado.bloqueo.texto}</p>}
                </div>
            </div>
            {children}
        </div>
    );
}

/** Para el filtro de la lista. */
export const ESTADOS_CREDITO = [
    { value: 'al_dia', label: 'Al día' },
    { value: 'con_atraso', label: 'Con atraso' },
    { value: 'restringido', label: 'Crédito restringido' },
    { value: 'bloqueado', label: 'Crédito bloqueado' },
];
