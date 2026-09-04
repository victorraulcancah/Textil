import { cn } from './cn';

/**
 * Card de un ítem de detalle (línea de venta, compra, traslado…) para móvil:
 * título, subtítulo y valores con etiqueta en cuadrícula.
 *
 *   <DetalleCard
 *       titulo="Leche Gloria Evaporada"
 *       subtitulo="PROD001 · 900g · Gloria"
 *       campos={[{ label: 'Cant.', value: '1.00' }, { label: 'Costo', value: 'S/ 6.00' }]}
 *   />
 */
export default function DetalleCard({ titulo, subtitulo, campos = [], columnas = 3, className }) {
    return (
        <div className={cn('rounded-xl border border-edge bg-white px-4 py-3 shadow-sm', className)}>
            <p className="text-sm font-semibold text-warm-900">{titulo}</p>
            {subtitulo && <p className="mt-0.5 text-xs text-warm-500">{subtitulo}</p>}

            {campos.length > 0 && (
                <dl
                    className="mt-3 grid gap-x-4 gap-y-2"
                    style={{ gridTemplateColumns: `repeat(${columnas}, minmax(0, 1fr))` }}
                >
                    {campos.map((c) => (
                        <div key={c.label} className={cn('min-w-0', c.className)}>
                            <dt className="text-xs text-warm-500">{c.label}</dt>
                            <dd className={cn('truncate text-sm font-semibold text-warm-900', c.valueClassName)}>
                                {c.value ?? '—'}
                            </dd>
                        </div>
                    ))}
                </dl>
            )}
        </div>
    );
}
