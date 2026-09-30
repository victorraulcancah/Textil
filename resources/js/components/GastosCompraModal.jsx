import { useEffect, useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { cargarTipoCambio } from '../lib/moneda';
import CatalogoSelect from './CatalogoSelect';
import { Button, Modal } from './ui';

const money = (n, moneda = 'PEN') =>
    new Intl.NumberFormat(moneda === 'USD' ? 'en-US' : 'es-PE', { style: 'currency', currency: moneda || 'PEN' }).format(Number(n) || 0);

const redondear = (n) => Math.round((Number(n) || 0) * 100) / 100;

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
export default function GastosCompraModal({ open, gastos, monedaCompra = 'PEN', tipoCambio, subtotal, onClose, onGuardar }) {
    const [filas, setFilas] = useState([]);
    /** Sube cuando se agrega, renombra o elimina un concepto: todas las filas recargan su lista. */
    const [versionConceptos, setVersionConceptos] = useState(0);
    const contador = useRef(0);
    /** Para cada fila, la fecha y moneda con las que ya se pidió el tipo de cambio. */
    const pedidos = useRef({});

    const conId = (f) => ({ ...f, _id: ++contador.current });

    useEffect(() => {
        if (!open) return;
        pedidos.current = {};
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
                    setFilas((prev) => prev.map((x) => (x._id === f._id && !x.tc_manual ? { ...x, tipo_cambio: venta, soles_txt: undefined } : x)));
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
    const recargo = Number(subtotal) > 0 ? (totalCosto / Number(subtotal)) * 100 : 0;

    const guardar = () => {
        onGuardar(
            validas.map(({ _id, soles_txt, ...f }) => ({ ...f, concepto: f.concepto.trim(), monto: String(f.monto), tc_manual: undefined })),
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
                        {totalCosto > 0
                            ? `+${money(totalCosto, monedaCompra)} al costo (${recargo.toFixed(2)} % del subtotal)${totalSoles > 0 ? ` · ${money(totalSoles, 'PEN')} en soles` : ''}`
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
            <div className="space-y-2 overflow-x-auto">
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
                    // Lo que se escribe en soles se conserva tal cual mientras se teclea.
                    const solesVisible = f.soles_txt ?? (soles ? String(soles) : '');
                    // Soles escritos → el monto en su moneda (dólares = soles ÷ tipo de cambio).
                    const escribirSoles = (valor) => {
                        if (f.moneda === 'PEN') return poner(f._id, { monto: valor, soles_txt: undefined });
                        if (!(tc > 0)) return poner(f._id, { soles_txt: valor });
                        poner(f._id, { soles_txt: valor, monto: valor === '' ? '' : String(redondear(Number(valor) / tc)) });
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
                                value={f.monto}
                                onChange={(e) => poner(f._id, { monto: e.target.value, soles_txt: undefined })}
                                placeholder="0.00"
                                className={`${inputCls} text-right`}
                                aria-label="Monto"
                            />
                            <select
                                value={f.moneda}
                                onChange={(e) => poner(f._id, { moneda: e.target.value, tc_manual: false, soles_txt: undefined })}
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
                                onChange={(e) => poner(f._id, { tipo_cambio: e.target.value, tc_manual: true, soles_txt: undefined })}
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

            {sinTipoCambio && (
                <p className="mt-3 text-xs font-medium text-red-600">
                    Hay gastos en otra moneda sin tipo de cambio: escríbelo (o elige la fecha para que se traiga el de SUNAT).
                </p>
            )}
        </Modal>
    );
}
