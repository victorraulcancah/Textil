import { Fragment, useEffect, useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { cargarTipoCambio } from '../lib/moneda';
import CatalogoSelect from './CatalogoSelect';
import { Button, Modal, Tabs } from './ui';

const money = (n, moneda = 'PEN') =>
    new Intl.NumberFormat(moneda === 'USD' ? 'en-US' : 'es-PE', { style: 'currency', currency: moneda || 'PEN' }).format(Number(n) || 0);

const redondear = (n) => Math.round((Number(n) || 0) * 100) / 100;
const numero = (n) => new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 }).format(Number(n) || 0);
/** Costo por metro: con 4 decimales, como en la hoja de costos. */
const unitario = (n) => Number(n).toLocaleString('es-PE', { minimumFractionDigits: 4, maximumFractionDigits: 4 });

const inputCls =
    'block w-full rounded-md border-0 px-2 py-1.5 text-sm text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-primary-600';

const COLUMNAS = 'grid-cols-[minmax(11rem,1fr)_8.5rem_6.5rem_6rem_5.5rem_6.5rem_3rem_2rem]';

// La fecha arranca vacía: se pone solo si el gasto se pagó en un día distinto y hace falta su tipo de cambio.
export const gastoVacio = (moneda) => ({ concepto: '', fecha: '', monto: '', moneda, tipo_cambio: '', incluye_costo: true });

/** Un gasto con tipo de cambio propio: el de su día, o el de la compra si no lo tiene. */
const tipoCambioDe = (gasto, tipoCambioCompra) => Number(gasto.tipo_cambio) || Number(tipoCambioCompra) || 0;

/** ¿Este gasto necesita tipo de cambio? Sí si es en dólares (para saber lo que fue en soles) o si hay que pasarlo a la moneda de la compra. */
const necesitaTipoCambio = (gasto, monedaCompra) => gasto.moneda !== 'PEN' || monedaCompra !== 'PEN';

/** Un gasto llevado a la moneda de la compra. Null si falta el tipo de cambio para poder convertirlo. */
export function montoEnMonedaCompra(gasto, monedaCompra, tipoCambioCompra) {
    const monto = Number(gasto.monto) || 0;
    if (!monto || gasto.moneda === monedaCompra) return monto;
    const tc = tipoCambioDe(gasto, tipoCambioCompra);
    if (tc <= 0) return null;
    return monedaCompra === 'PEN' ? redondear(monto * tc) : gasto.moneda === 'PEN' ? redondear(monto / tc) : null;
}

/** Lo que el gasto fue en soles: el monto mismo, o los dólares por su tipo de cambio. */
export function montoEnSoles(gasto, tipoCambioCompra) {
    const monto = Number(gasto.monto) || 0;
    if (!monto) return 0;
    if (gasto.moneda === 'PEN') return monto;
    const tc = tipoCambioDe(gasto, tipoCambioCompra);
    return gasto.moneda === 'USD' && tc > 0 ? redondear(monto * tc) : null;
}

/**
 * Otros gastos de la compra que se suman al costo de la mercadería (seguro,
 * agente de aduana, transporte…). Cada uno lleva su fecha, el tipo de cambio de
 * ese día (se propone el de SUNAT y se puede cambiar) y lo que fue en soles.
 * No cambian lo que se le paga al proveedor: al recibir la mercadería se reparten
 * entre las líneas según su valor.
 */
export default function GastosCompraModal({ open, gastos, monedaCompra = 'PEN', tipoCambio, subtotal, flete = 0, metros = 0, lineas = [], onClose, onGuardar }) {
    const [filas, setFilas] = useState([]);
    /** 'gastos' (las filas) o 'resumen' (lo que cuesta cada metro con todos los gastos). */
    const [pestana, setPestana] = useState('gastos');
    /** Sube cuando se agrega, renombra o elimina un concepto: todas las filas recargan su lista. */
    const [versionConceptos, setVersionConceptos] = useState(0);
    const contador = useRef(0);
    /** Para cada fila, la fecha y moneda con las que ya se pidió el tipo de cambio. */
    const pedidos = useRef({});

    const conId = (f) => ({ ...f, _id: ++contador.current });

    useEffect(() => {
        if (!open) return;
        pedidos.current = {};
        setPestana('gastos');
        // Los ya guardados traen su tipo de cambio: no se vuelve a proponer otro.
        setFilas(gastos.length ? gastos.map((g) => conId({ ...g, tc_manual: Boolean(g.tipo_cambio) })) : [conId(gastoVacio(monedaCompra))]);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    // El tipo de cambio de cada gasto es el de SUNAT del día en que se pagó; se escribe a mano igual.
    useEffect(() => {
        if (!open) return;
        filas.forEach((f) => {
            if (!necesitaTipoCambio(f, monedaCompra) || f.tc_manual || !f.fecha) return;
            const llave = `${f.fecha}|${f.moneda}`;
            if (pedidos.current[f._id] === llave) return;
            pedidos.current[f._id] = llave;
            cargarTipoCambio(f.fecha)
                .then((tc) => {
                    const venta = tc?.venta ? String(tc.venta) : '';
                    setFilas((prev) => prev.map((x) => (x._id === f._id && !x.tc_manual ? { ...x, tipo_cambio: venta, soles_txt: undefined, monto_txt: undefined } : x)));
                })
                .catch(() => {});
        });
    }, [filas, open, monedaCompra]);

    const poner = (id, patch) => setFilas((prev) => prev.map((f) => (f._id === id ? { ...f, ...patch } : f)));
    const quitar = (id) => setFilas((prev) => prev.filter((f) => f._id !== id));

    const validas = filas.filter((f) => f.concepto.trim() && Number(f.monto) > 0);
    const enCompra = validas.map((f) => ({ f, valor: montoEnMonedaCompra(f, monedaCompra, tipoCambio) }));
    const sinTipoCambio = enCompra.some((x) => x.valor === null);
    const totalCosto = enCompra.reduce((s, x) => s + (x.f.incluye_costo ? x.valor || 0 : 0), 0);
    const totalSoles = validas.reduce((s, f) => s + (f.incluye_costo ? montoEnSoles(f, tipoCambio) || 0 : 0), 0);

    // Resumen del costo comercial: la mercadería (FOB) más el flete, el seguro y los demás gastos
    // marcados, por metro, en soles y en la moneda de la compra (cada gasto con el tipo de cambio de su día).
    const tcCompra = Number(tipoCambio) || 0;
    const fleteCompra = Number(flete) || 0;
    const fleteSoles = monedaCompra === 'PEN' ? fleteCompra : tcCompra > 0 ? redondear(fleteCompra * tcCompra) : 0;
    const esSeguro = (f) => f.concepto.trim().toUpperCase() === 'SEGURO';
    const seguroCompra = enCompra.reduce((s, x) => s + (x.f.incluye_costo && esSeguro(x.f) ? x.valor || 0 : 0), 0);
    const seguroSoles = validas.reduce((s, f) => s + (f.incluye_costo && esSeguro(f) ? montoEnSoles(f, tipoCambio) || 0 : 0), 0);
    // Lo que se suma al costo además del FOB, en la moneda de la compra.
    const sumaAlCosto = totalCosto + fleteCompra;
    const recargo = Number(subtotal) > 0 ? (sumaAlCosto / Number(subtotal)) * 100 : 0;
    const fobSoles = monedaCompra === 'PEN' ? Number(subtotal) || 0 : tcCompra > 0 ? redondear((Number(subtotal) || 0) * tcCompra) : null;
    const columnas = [
        { moneda: 'PEN', etiqueta: 'Soles (S/)', fob: fobSoles, flete: fleteSoles, seguro: seguroSoles, otros: totalSoles - seguroSoles },
        ...(monedaCompra !== 'PEN'
            ? [{ moneda: monedaCompra, etiqueta: monedaCompra === 'USD' ? 'Dólares (US$)' : monedaCompra, fob: Number(subtotal) || 0, flete: fleteCompra, seguro: seguroCompra, otros: totalCosto - seguroCompra }]
            : []),
    ].map((c) => {
        const gastos = c.flete + c.seguro + c.otros;
        const total = c.fob === null ? null : c.fob + gastos;
        return { ...c, gastos, total, unitario: total !== null && Number(metros) > 0 ? total / Number(metros) : null };
    });
    const hayOtros = columnas.some((c) => c.otros > 0.004);

    /**
     * El costo de cada producto y de cada color: los gastos se reparten entre las líneas en proporción
     * a su valor (como al recibir la mercadería), así que cada color trae su costo por metro ya con
     * los gastos. Sale por columna de moneda, igual que el total.
     */
    const grupos = (() => {
        const porProducto = new Map();
        (lineas ?? []).forEach((l) => {
            const metrosL = Number(l.metros) || 0;
            if (!(metrosL > 0)) return;
            if (!porProducto.has(l.producto_id)) porProducto.set(l.producto_id, { producto: l.producto, colores: [] });
            porProducto.get(l.producto_id).colores.push({ color: l.color, rollos: Number(l.rollos) || 0, metros: metrosL, valor: metrosL * (Number(l.costo) || 0) });
        });
        const base = Number(subtotal) || 0;

        // Un conjunto de líneas → sus rollos, metros y el costo por metro en cada columna.
        const resumir = (filas) => {
            const valor = filas.reduce((s, f) => s + f.valor, 0);
            const metrosF = filas.reduce((s, f) => s + f.metros, 0);
            return {
                rollos: filas.reduce((s, f) => s + f.rollos, 0),
                metros: metrosF,
                porMoneda: columnas.map((c) => {
                    const fob = c.moneda === 'PEN' && monedaCompra !== 'PEN' ? (tcCompra > 0 ? valor * tcCompra : null) : valor;
                    const gastosParte = base > 0 ? (c.gastos * valor) / base : 0;
                    return {
                        fob: fob === null ? null : fob / metrosF,
                        costo: fob === null ? null : (fob + gastosParte) / metrosF,
                    };
                }),
            };
        };

        return [...porProducto.values()].map((g) => ({
            producto: g.producto,
            total: resumir(g.colores),
            colores: g.colores.map((c) => ({ color: c.color, ...resumir([c]) })),
        }));
    })();

    const guardar = () => {
        onGuardar(
            validas.map(({ _id, soles_txt, monto_txt, ...f }) => ({ ...f, concepto: f.concepto.trim(), monto: String(f.monto), tc_manual: undefined })),
        );
        onClose();
    };

    const monedas = monedaCompra === 'PEN' ? ['PEN', 'USD'] : ['PEN', monedaCompra];

    return (
        <Modal
            open={open}
            onClose={onClose}
            size="3xl"
            title="Gastos adicionales"
            description="Seguro, aduana, transporte… Los marcados se reparten en el costo de la mercadería al recibirla; no cambian lo que se paga al proveedor."
            footer={
                <>
                    <span className="mr-auto text-xs text-warm-500">
                        {sumaAlCosto > 0
                            ? `+${money(sumaAlCosto, monedaCompra)} al costo con el flete (${recargo.toFixed(2)} % del subtotal)`
                            : 'Sin gastos en el costo'}
                    </span>
                    <Button variant="secondary" onClick={onClose}>
                        Cancelar
                    </Button>
                    <Button onClick={guardar} disabled={sinTipoCambio}>
                        Guardar gastos
                    </Button>
                </>
            }
        >
            <Tabs
                value={pestana}
                onChange={setPestana}
                items={[
                    { key: 'gastos', label: `Gastos${validas.length ? ` (${validas.length})` : ''}` },
                    { key: 'resumen', label: 'Resumen de costos' },
                ]}
            />

            {pestana === 'gastos' && (
            <div className="mt-4 space-y-2 overflow-x-auto">
                <div className={`grid ${COLUMNAS} min-w-[52rem] items-center gap-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-warm-500`}>
                    <span>Concepto</span>
                    <span>Fecha</span>
                    <span className="text-right">Monto</span>
                    <span>Moneda</span>
                    <span className="text-right">T.C.</span>
                    <span className="text-right">Monto S/</span>
                    <span className="text-center">En costo</span>
                    <span />
                </div>

                {filas.map((f) => {
                    const soles = montoEnSoles(f, tipoCambio);
                    const conTc = necesitaTipoCambio(f, monedaCompra);
                    const tc = tipoCambioDe(f, tipoCambio);
                    // "Monto" está siempre en la moneda de la compra (dólares); "Monto S/" en soles. Lo que se
                    // escribe en uno se conserva tal cual mientras se teclea y el otro sale con el tipo de cambio.
                    // Un gasto pagado en soles guarda los soles; uno pagado en dólares, los dólares.
                    const enMonedaCompra = f.moneda === monedaCompra;
                    const equivalente = Number(f.monto) > 0 && tc > 0 && !enMonedaCompra ? redondear(Number(f.monto) / tc) : '';
                    const montoVisible = f.monto_txt ?? (enMonedaCompra || monedaCompra === 'PEN' ? f.monto : equivalente === '' ? '' : String(equivalente));
                    const solesVisible = f.soles_txt ?? (soles ? String(soles) : '');
                    const escribirMonto = (valor) => {
                        if (enMonedaCompra || monedaCompra === 'PEN') return poner(f._id, { monto: valor, monto_txt: undefined, soles_txt: undefined });
                        // Pagado en soles: lo escrito en la moneda de la compra se pasa a soles.
                        poner(f._id, { monto_txt: valor, soles_txt: undefined, monto: tc > 0 && valor !== '' ? String(redondear(Number(valor) * tc)) : '' });
                    };
                    const escribirSoles = (valor) => {
                        if (f.moneda === 'PEN') return poner(f._id, { monto: valor, soles_txt: valor, monto_txt: undefined });
                        if (!(tc > 0)) return poner(f._id, { soles_txt: valor });
                        poner(f._id, { soles_txt: valor, monto_txt: undefined, monto: valor === '' ? '' : String(redondear(Number(valor) / tc)) });
                    };

                    return (
                        <div key={f._id} className={`grid ${COLUMNAS} min-w-[52rem] items-center gap-2`}>
                            {/* El concepto es un catálogo: el icono de más lo administra (agregar, renombrar, eliminar). */}
                            <CatalogoSelect
                                endpoint="/conceptos-gasto"
                                titulo="Conceptos de gasto"
                                placeholder="Elige el concepto…"
                                value={f.concepto}
                                onChange={(nombre) => poner(f._id, { concepto: nombre })}
                                version={versionConceptos}
                                onCambio={() => setVersionConceptos((v) => v + 1)}
                            />
                            <input
                                type="date"
                                value={f.fecha ?? ''}
                                onChange={(e) => poner(f._id, { fecha: e.target.value, tc_manual: false })}
                                className={inputCls}
                                aria-label="Fecha del gasto"
                            />
                            <input
                                type="number"
                                min="0"
                                step="any"
                                value={montoVisible}
                                onChange={(e) => escribirMonto(e.target.value)}
                                placeholder="0.00"
                                className={`${inputCls} text-right`}
                                aria-label="Monto"
                            />
                            <select
                                value={f.moneda}
                                onChange={(e) => poner(f._id, { moneda: e.target.value, tc_manual: false, soles_txt: undefined, monto_txt: undefined })}
                                className={inputCls}
                                aria-label="Moneda"
                            >
                                {monedas.map((m) => (
                                    <option key={m} value={m}>
                                        {m === 'PEN' ? 'Soles' : m === 'USD' ? 'Dólares' : m}
                                    </option>
                                ))}
                            </select>
                            <input
                                type="number"
                                min="0"
                                step="0.0001"
                                value={conTc ? f.tipo_cambio ?? '' : ''}
                                onChange={(e) => poner(f._id, { tipo_cambio: e.target.value, tc_manual: true, soles_txt: undefined, monto_txt: undefined })}
                                disabled={!conTc}
                                placeholder={conTc ? 'T.C.' : '—'}
                                className={`${inputCls} text-right disabled:bg-gray-50`}
                                aria-label="Tipo de cambio"
                            />
                            {/* Se puede escribir directo en soles: el monto en dólares sale de dividirlo entre el tipo de cambio. */}
                            <input
                                type="number"
                                min="0"
                                step="any"
                                value={solesVisible}
                                onChange={(e) => escribirSoles(e.target.value)}
                                placeholder="0.00"
                                className={`${inputCls} text-right`}
                                aria-label="Monto en soles"
                            />
                            <label className="flex justify-center" title="Incluir en el costo de la mercadería">
                                <input
                                    type="checkbox"
                                    checked={f.incluye_costo}
                                    onChange={(e) => poner(f._id, { incluye_costo: e.target.checked })}
                                    className="h-4 w-4 rounded border-gray-300 accent-primary-600"
                                />
                            </label>
                            <button
                                type="button"
                                onClick={() => quitar(f._id)}
                                aria-label="Quitar gasto"
                                className="rounded-md p-1.5 text-red-600 transition hover:bg-red-50"
                            >
                                <Trash2 className="h-4 w-4" />
                            </button>
                        </div>
                    );
                })}

                <Button type="button" variant="ghost" size="sm" onClick={() => setFilas((prev) => [...prev, conId(gastoVacio(monedaCompra))])}>
                    <Plus className="h-4 w-4" />
                    Agregar gasto
                </Button>
            </div>
            )}

            {/* Resumen del costo: lo que cuesta cada metro con todos los gastos. */}
            {pestana === 'resumen' && (
            <>
            {/* Lo que cuesta cada producto por metro, ya con los gastos. */}
            <div className="mt-4 overflow-x-auto rounded-lg border border-edge text-sm">
                <table className="w-full min-w-[40rem]">
                    <thead>
                        <tr className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-warm-500">
                            <th className="px-3 py-2 text-left">Costo por producto</th>
                            <th className="px-3 py-2 text-right">Rollos</th>
                            <th className="px-3 py-2 text-right">Metros</th>
                            {columnas.map((c) => (
                                <th key={c.moneda} className="px-3 py-2 text-right">
                                    Costo/m {c.moneda === 'PEN' ? 'S/' : c.moneda === 'USD' ? 'US$' : c.moneda}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {grupos.length === 0 && (
                            <tr>
                                <td colSpan={3 + columnas.length} className="px-3 py-6 text-center text-warm-500">
                                    Agrega productos a la compra para ver su costo.
                                </td>
                            </tr>
                        )}
                        {grupos.map((g) => (
                            <Fragment key={g.producto}>
                                <tr className="border-t border-edge bg-primary-50/60 font-semibold text-warm-900">
                                    <td className="px-3 py-2 uppercase">{g.producto}</td>
                                    <td className="px-3 py-2 text-right">{g.total.rollos || ''}</td>
                                    <td className="px-3 py-2 text-right">{numero(g.total.metros)}</td>
                                    {g.total.porMoneda.map((v, i) => (
                                        <td key={columnas[i].moneda} className="px-3 py-2 text-right">{v.costo === null ? '—' : unitario(v.costo)}</td>
                                    ))}
                                </tr>
                            </Fragment>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="mt-4 overflow-hidden rounded-lg border border-edge text-sm">
                <div className={`grid items-center bg-gray-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-warm-500 ${columnas.length > 1 ? 'grid-cols-[1fr_9rem_9rem]' : 'grid-cols-[1fr_9rem]'}`}>
                    <span>Resumen del costo</span>
                    {columnas.map((c) => (
                        <span key={c.moneda} className="text-right">{c.etiqueta}</span>
                    ))}
                </div>
                {[
                    { etiqueta: 'FOB (mercadería)', valor: (c) => (c.fob === null ? '—' : money(c.fob, c.moneda)) },
                    { etiqueta: 'Flete', valor: (c) => money(c.flete, c.moneda) },
                    { etiqueta: 'Seguro', valor: (c) => money(c.seguro, c.moneda) },
                    ...(hayOtros ? [{ etiqueta: 'Otros gastos', valor: (c) => money(c.otros, c.moneda) }] : []),
                    { etiqueta: 'Total costo comercial de importación', fuerte: true, valor: (c) => (c.total === null ? '—' : money(c.total, c.moneda)) },
                    { etiqueta: 'Cantidad metros', valor: () => new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 }).format(Number(metros) || 0) },
                ].map((fila) => (
                    <div
                        key={fila.etiqueta}
                        className={`grid items-center border-t border-edge px-3 py-2 ${columnas.length > 1 ? 'grid-cols-[1fr_9rem_9rem]' : 'grid-cols-[1fr_9rem]'} ${fila.fuerte ? 'font-bold text-warm-900' : 'text-warm-700'}`}
                    >
                        <span className="uppercase">{fila.etiqueta}</span>
                        {columnas.map((c) => (
                            <span key={c.moneda} className="text-right">{fila.valor(c)}</span>
                        ))}
                    </div>
                ))}
                <div className={`grid items-center border-t border-edge bg-amber-200 px-3 py-2 font-bold text-warm-900 ${columnas.length > 1 ? 'grid-cols-[1fr_9rem_9rem]' : 'grid-cols-[1fr_9rem]'}`}>
                    <span className="uppercase">Costo comercial unitario metros</span>
                    {columnas.map((c) => (
                        <span key={c.moneda} className="text-right">
                            {c.unitario === null ? '—' : c.unitario.toLocaleString('es-PE', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
                        </span>
                    ))}
                </div>
            </div>
            </>
            )}

            {sinTipoCambio && (
                <p className="mt-3 text-xs font-medium text-red-600">
                    Hay gastos en otra moneda sin tipo de cambio: escríbelo (o elige la fecha para que se traiga el de SUNAT).
                </p>
            )}
        </Modal>
    );
}
