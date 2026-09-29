import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button, Modal } from './ui';

const numero = (n) => new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 }).format(Number(n) || 0);

const dinero = (n, moneda) =>
    new Intl.NumberFormat(moneda === 'USD' ? 'en-US' : 'es-PE', {
        style: 'currency',
        currency: moneda === 'USD' ? 'USD' : 'PEN',
    }).format(Number(n) || 0);

const redondear = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** Rollos: enteros, sin negativos. */
const entero = (v) => (v === '' ? '' : String(Math.max(0, Math.floor(Number(v) || 0))));

const inputCls =
    'block w-full rounded-md border-0 px-2 py-1.5 text-right text-sm text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-primary-600';

/** El formato "Metro" de una tela: así se compra (metros a un precio por metro). */
export const presentacionMetroDe = (producto) =>
    (producto?.presentaciones ?? []).find(
        (p) => p.activo !== false && (p.unidad_base?.abreviatura ?? '').toLowerCase() === 'm',
    ) ?? null;

/**
 * Comprar una tela: una tabla por color, como la hoja del proveedor.
 *
 *   COLORES · ROLLOS · FACTOR · METROS · PRECIO DE COMPRA · TOTAL
 *
 * Por cada color se escriben los rollos y el factor (los metros de cada
 * rollo); los metros salen de multiplicarlos y el total, de los metros por el
 * precio del metro. El factor arranca con el metraje de referencia del color.
 *
 * onAgregar({ producto, presentacion, lineas: [{ color, rollos, metros, precio }] }).
 */
export default function TelaCompraModal({ producto, moneda = 'PEN', onClose, onAgregar }) {
    const metro = presentacionMetroDe(producto);
    const colores = (producto?.colores ?? []).filter((c) => c.activo !== false);
    // Una tela sin colores registrados se compra igual, en una sola fila.
    const base = colores.length ? colores : [{ id: null, nombre: 'Sin color', codigo: null, hex: null }];
    const clave = (c) => String(c.id ?? 'sin');

    const [precioBase, setPrecioBase] = useState(metro?.precio_compra ? String(Number(metro.precio_compra)) : '');
    const [filas, setFilas] = useState(() =>
        Object.fromEntries(
            base.map((c) => [
                clave(c),
                { rollos: '', factor: Number(c.metros_por_rollo) > 0 ? String(Number(c.metros_por_rollo)) : '', precio: '' },
            ]),
        ),
    );

    const poner = (c, campo, valor) =>
        setFilas((prev) => ({ ...prev, [clave(c)]: { ...prev[clave(c)], [campo]: valor } }));

    /** Cada fila con sus metros, su precio y su total. */
    const calculo = useMemo(
        () =>
            base.map((c) => {
                const f = filas[clave(c)];
                const rollos = Number(f.rollos) || 0;
                const factor = Number(f.factor) || 0;
                const precio = f.precio !== '' ? Number(f.precio) || 0 : Number(precioBase) || 0;
                const metros = redondear(rollos * factor);
                return { c, rollos, factor, precio, metros, total: redondear(metros * precio) };
            }),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [filas, precioBase],
    );

    const conRollos = calculo.filter((x) => x.rollos > 0);
    const incompletas = conRollos.filter((x) => !(x.factor > 0) || !(x.precio > 0));
    const totalRollos = conRollos.reduce((s, x) => s + x.rollos, 0);
    const totalMetros = conRollos.reduce((s, x) => s + x.metros, 0);
    const totalImporte = conRollos.reduce((s, x) => s + x.total, 0);
    const puedeAgregar = conRollos.length > 0 && incompletas.length === 0;
    const nombreMoneda = moneda === 'USD' ? 'DÓLARES' : 'SOLES';

    const agregar = () => {
        if (!puedeAgregar) return;
        onAgregar({
            producto,
            presentacion: metro,
            lineas: conRollos.map((x) => ({ color: x.c.id ? x.c : null, rollos: x.rollos, metros: x.metros, precio: x.precio })),
        });
    };

    return (
        <Modal
            open
            onClose={onClose}
            title={producto?.nombre}
            description="Escribe los rollos de cada color y cuántos metros trae cada uno (el factor). Los metros y el total salen solos."
            size="2xl"
            footer={
                <>
                    <span className="mr-auto text-xs text-warm-500">
                        {conRollos.length} color{conRollos.length === 1 ? '' : 'es'} · {totalRollos} rollo
                        {totalRollos === 1 ? '' : 's'} · {numero(totalMetros)} m
                    </span>
                    <Button variant="secondary" onClick={onClose}>
                        Cancelar
                    </Button>
                    <Button onClick={agregar} disabled={!puedeAgregar}>
                        <Plus className="h-4 w-4" />
                        Agregar
                    </Button>
                </>
            }
        >
            {!metro ? (
                <p className="py-6 text-center text-sm text-red-600">
                    Esta tela no tiene formato por metro: agrégalo en Productos → Compra y venta.
                </p>
            ) : (
                <>
                    {/* El precio del metro, como la celda de arriba de la hoja. */}
                    <div className="mb-3 flex flex-wrap items-center gap-3">
                        <span className="rounded bg-amber-200 px-3 py-1.5 text-sm font-bold uppercase text-warm-900">
                            {producto.nombre}
                        </span>
                        <label className="flex items-center gap-2 text-sm font-medium text-warm-700">
                            Precio de compra por metro ({moneda})
                            <input
                                type="number"
                                min="0"
                                step="0.0001"
                                value={precioBase}
                                onChange={(e) => setPrecioBase(e.target.value)}
                                className={`${inputCls} w-28 bg-amber-50`}
                                aria-label="Precio de compra por metro"
                            />
                        </label>
                    </div>

                    <div className="overflow-x-auto rounded-lg border border-edge">
                        <table className="w-full min-w-[640px] text-sm">
                            <thead>
                                <tr className="bg-primary-600 text-left text-xs font-semibold uppercase tracking-wide text-white">
                                    <th className="px-3 py-2">Colores</th>
                                    <th className="w-24 px-3 py-2 text-right">Rollos</th>
                                    <th className="w-24 px-3 py-2 text-right">Factor</th>
                                    <th className="w-24 px-3 py-2 text-right">Metros</th>
                                    <th className="w-28 px-3 py-2 text-right">Precio de compra</th>
                                    <th className="w-32 px-3 py-2 text-right">Total {nombreMoneda.toLowerCase()}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {calculo.map((x) => {
                                    const f = filas[clave(x.c)];
                                    const activa = x.rollos > 0;
                                    return (
                                        <tr key={clave(x.c)} className={activa ? 'bg-primary-50/60' : ''}>
                                            <td className="px-3 py-1.5">
                                                <span className="inline-flex items-center gap-2 font-medium uppercase text-warm-900">
                                                    <span
                                                        className="h-3 w-3 shrink-0 rounded-full ring-1 ring-black/10"
                                                        style={{ backgroundColor: x.c.hex || '#9ca3af' }}
                                                    />
                                                    {x.c.nombre}
                                                    {x.c.codigo && (
                                                        <span className="text-[11px] font-normal text-warm-400">{x.c.codigo}</span>
                                                    )}
                                                </span>
                                            </td>
                                            <td className="px-3 py-1.5">
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="1"
                                                    inputMode="numeric"
                                                    placeholder="0"
                                                    value={f.rollos}
                                                    onChange={(e) => poner(x.c, 'rollos', entero(e.target.value))}
                                                    aria-label={`Rollos de ${x.c.nombre}`}
                                                    className={inputCls}
                                                />
                                            </td>
                                            <td className="px-3 py-1.5">
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="0.01"
                                                    placeholder="0"
                                                    value={f.factor}
                                                    onChange={(e) => poner(x.c, 'factor', e.target.value)}
                                                    aria-label={`Factor de ${x.c.nombre}`}
                                                    className={`${inputCls} ${activa && !(x.factor > 0) ? 'ring-red-400' : ''}`}
                                                />
                                            </td>
                                            <td className="px-3 py-1.5 text-right text-warm-900">
                                                {activa ? numero(x.metros) : ''}
                                            </td>
                                            <td className="px-3 py-1.5">
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="0.0001"
                                                    placeholder={precioBase || '0'}
                                                    value={f.precio}
                                                    onChange={(e) => poner(x.c, 'precio', e.target.value)}
                                                    aria-label={`Precio de compra de ${x.c.nombre}`}
                                                    className={inputCls}
                                                />
                                            </td>
                                            <td className="px-3 py-1.5 text-right font-medium text-warm-900">
                                                {activa ? dinero(x.total, moneda) : ''}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                            <tfoot>
                                <tr className="border-t-2 border-edge bg-gray-50 text-sm font-bold uppercase text-warm-900">
                                    <td className="px-3 py-2">Sub total</td>
                                    <td className="px-3 py-2 text-right">{totalRollos || ''}</td>
                                    <td />
                                    <td className="px-3 py-2 text-right">{totalMetros ? numero(totalMetros) : ''}</td>
                                    <td />
                                    <td className="px-3 py-2 text-right">{totalImporte ? dinero(totalImporte, moneda) : ''}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>

                    {incompletas.length > 0 && (
                        <p className="mt-2 text-xs font-medium text-red-600">
                            Falta el factor o el precio de: {incompletas.map((x) => x.c.nombre).join(', ')}.
                        </p>
                    )}
                </>
            )}
        </Modal>
    );
}
