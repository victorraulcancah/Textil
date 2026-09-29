import { Fragment } from 'react';

const num = (n) => new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 }).format(Number(n) || 0);

const money = (n, moneda = 'PEN') =>
    new Intl.NumberFormat('es-PE', { style: 'currency', currency: moneda || 'PEN' }).format(Number(n) || 0);

/** Cada producto con sus renglones, en el orden en que salieron. */
const agrupar = (detalles) => {
    const grupos = new Map();
    detalles.forEach((d) => {
        const clave = String(d.producto_id ?? d.producto_nombre ?? 'sin');
        if (!grupos.has(clave)) grupos.set(clave, { nombre: d.producto_nombre ?? 'Producto', filas: [] });
        grupos.get(clave).filas.push(d);
    });
    return [...grupos.values()];
};

/**
 * Los productos de una proforma, rollo por rollo y agrupados por producto:
 *
 *   PRODUCTO: POLINAN
 *   Ítem · Color · Cantidad (m) · U. · Precio · Subtotal
 *
 * U. = R es un rollo entero; vacía son metros (un corte, o algo que se mide en
 * metros). Lo que no es tela lleva su unidad (cono, u…). Cada producto
 * numera sus renglones desde 1. Al final, el total a pagar.
 */
export default function DetalleProforma({ detalles = [], moneda = 'PEN', total = null }) {
    const grupos = agrupar(detalles);

    return (
        <div className="overflow-x-auto rounded-xl border border-edge">
            <table className="w-full min-w-[520px] text-sm">
                <thead>
                    <tr className="bg-primary-600 text-left text-xs font-semibold uppercase tracking-wide text-white">
                        <th className="w-12 px-3 py-2 text-center">Ítem</th>
                        <th className="px-3 py-2">Color</th>
                        <th className="px-3 py-2 text-right">Cantidad (m)</th>
                        <th className="w-14 px-3 py-2 text-center">U.</th>
                        <th className="px-3 py-2 text-right">Precio</th>
                        <th className="px-3 py-2 text-right">Subtotal</th>
                    </tr>
                </thead>
                <tbody>
                    {grupos.map((g) => (
                        <Fragment key={g.nombre}>
                            <tr className="bg-primary-100/70">
                                <td colSpan={6} className="px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-primary-800">
                                    Producto: {g.nombre}
                                </td>
                            </tr>
                            {g.filas.map((d, i) => {
                                const f = d.proforma ?? {};
                                return (
                                    <tr key={d.id} className="border-b border-gray-100 last:border-0">
                                        <td className="px-3 py-1.5 text-center text-warm-500">{i + 1}</td>
                                        <td className="px-3 py-1.5 font-medium uppercase text-warm-900">{f.color || '—'}</td>
                                        <td className="px-3 py-1.5 text-right text-warm-900">{num(f.cantidad ?? d.cantidad)}</td>
                                        <td className="px-3 py-1.5 text-center font-semibold text-warm-700">{f.u ?? ''}</td>
                                        <td className="px-3 py-1.5 text-right text-warm-900">{money(f.precio ?? d.precio_unitario, moneda)}</td>
                                        <td className="px-3 py-1.5 text-right font-semibold text-primary-700">{money(d.subtotal, moneda)}</td>
                                    </tr>
                                );
                            })}
                        </Fragment>
                    ))}
                    {grupos.length === 0 && (
                        <tr>
                            <td colSpan={6} className="px-3 py-8 text-center text-sm text-warm-500">
                                Sin productos.
                            </td>
                        </tr>
                    )}
                </tbody>
                {total != null && grupos.length > 0 && (
                    <tfoot>
                        <tr className="border-t-2 border-edge bg-primary-50 text-sm font-bold uppercase text-warm-900">
                            <td colSpan={5} className="px-3 py-2 text-center">
                                Total a pagar
                            </td>
                            <td className="px-3 py-2 text-right text-primary-800">{money(total, moneda)}</td>
                        </tr>
                    </tfoot>
                )}
            </table>
        </div>
    );
}
