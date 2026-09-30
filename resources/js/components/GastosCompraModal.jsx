import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import CatalogoSelect from './CatalogoSelect';
import { Button, Modal } from './ui';

const money = (n, moneda = 'PEN') =>
    new Intl.NumberFormat(moneda === 'USD' ? 'en-US' : 'es-PE', { style: 'currency', currency: moneda || 'PEN' }).format(Number(n) || 0);

const redondear = (n) => Math.round((Number(n) || 0) * 100) / 100;

const inputCls =
    'block w-full rounded-md border-0 px-2 py-1.5 text-sm text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-primary-600';

export const gastoVacio = (moneda) => ({ concepto: '', monto: '', moneda, incluye_costo: true });

/** Un gasto llevado a la moneda de la compra (los soles, con el tipo de cambio de la compra). */
export function montoEnMonedaCompra(gasto, monedaCompra, tipoCambio) {
    const monto = Number(gasto.monto) || 0;
    if (!monto || gasto.moneda === monedaCompra) return monto;
    const tc = Number(tipoCambio) || 0;
    if (tc <= 0) return null; // falta el tipo de cambio para poder convertirlo
    return monedaCompra === 'PEN' ? redondear(monto * tc) : gasto.moneda === 'PEN' ? redondear(monto / tc) : null;
}

/**
 * Otros gastos de la compra que se suman al costo de la mercadería (seguro,
 * agente de aduana, transporte…). No cambian lo que se le paga al proveedor:
 * al recibir la mercadería se reparten entre las líneas según su valor.
 */
export default function GastosCompraModal({ open, gastos, monedaCompra = 'PEN', tipoCambio, subtotal, onClose, onGuardar }) {
    const [filas, setFilas] = useState([]);
    /** Sube cuando se agrega, renombra o elimina un concepto: todas las filas recargan su lista. */
    const [versionConceptos, setVersionConceptos] = useState(0);

    useEffect(() => {
        if (open) setFilas(gastos.length ? gastos.map((g) => ({ ...g })) : [gastoVacio(monedaCompra)]);
    }, [open, gastos, monedaCompra]);

    const poner = (i, patch) => setFilas((prev) => prev.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
    const quitar = (i) => setFilas((prev) => prev.filter((_, idx) => idx !== i));

    const validas = filas.filter((f) => f.concepto.trim() && Number(f.monto) > 0);
    const enCompra = validas.map((f) => ({ f, valor: montoEnMonedaCompra(f, monedaCompra, tipoCambio) }));
    const sinTipoCambio = enCompra.some((x) => x.valor === null);
    const totalCosto = enCompra.reduce((s, x) => s + (x.f.incluye_costo ? x.valor || 0 : 0), 0);
    const recargo = Number(subtotal) > 0 ? (totalCosto / Number(subtotal)) * 100 : 0;

    const guardar = () => {
        onGuardar(validas.map((f) => ({ ...f, concepto: f.concepto.trim(), monto: String(f.monto) })));
        onClose();
    };

    const monedas = monedaCompra === 'PEN' ? ['PEN'] : ['PEN', monedaCompra];

    return (
        <Modal
            open={open}
            onClose={onClose}
            size="xl"
            title="Gastos adicionales"
            description="Seguro, aduana, transporte… Los marcados se reparten en el costo de la mercadería al recibirla; no cambian lo que se paga al proveedor."
            footer={
                <>
                    <span className="mr-auto text-xs text-warm-500">
                        {totalCosto > 0
                            ? `+${money(totalCosto, monedaCompra)} al costo (${recargo.toFixed(2)} % del subtotal)`
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
            <div className="space-y-2">
                <div className="grid grid-cols-[1fr_7rem_6rem_4.5rem_2rem] items-center gap-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-warm-500">
                    <span>Concepto</span>
                    <span className="text-right">Monto</span>
                    <span>Moneda</span>
                    <span className="text-center">En costo</span>
                    <span />
                </div>

                {filas.map((f, i) => (
                    <div key={i} className="grid grid-cols-[1fr_7rem_6rem_4.5rem_2rem] items-center gap-2">
                        {/* El concepto es un catálogo: el icono de más lo administra (agregar, renombrar, eliminar). */}
                        <CatalogoSelect
                            endpoint="/conceptos-gasto"
                            titulo="Conceptos de gasto"
                            placeholder="Elige el concepto…"
                            value={f.concepto}
                            onChange={(nombre) => poner(i, { concepto: nombre })}
                            version={versionConceptos}
                            onCambio={() => setVersionConceptos((v) => v + 1)}
                        />
                        <input
                            type="number"
                            min="0"
                            step="any"
                            value={f.monto}
                            onChange={(e) => poner(i, { monto: e.target.value })}
                            placeholder="0.00"
                            className={`${inputCls} text-right`}
                            aria-label="Monto"
                        />
                        <select
                            value={f.moneda}
                            onChange={(e) => poner(i, { moneda: e.target.value })}
                            className={inputCls}
                            aria-label="Moneda"
                        >
                            {monedas.map((m) => (
                                <option key={m} value={m}>
                                    {m === 'PEN' ? 'Soles' : m === 'USD' ? 'Dólares' : m}
                                </option>
                            ))}
                        </select>
                        <label className="flex justify-center" title="Incluir en el costo de la mercadería">
                            <input
                                type="checkbox"
                                checked={f.incluye_costo}
                                onChange={(e) => poner(i, { incluye_costo: e.target.checked })}
                                className="h-4 w-4 rounded border-gray-300 accent-primary-600"
                            />
                        </label>
                        <button
                            type="button"
                            onClick={() => quitar(i)}
                            aria-label="Quitar gasto"
                            className="rounded-md p-1.5 text-red-600 transition hover:bg-red-50"
                        >
                            <Trash2 className="h-4 w-4" />
                        </button>
                    </div>
                ))}

                <Button type="button" variant="ghost" size="sm" onClick={() => setFilas((prev) => [...prev, gastoVacio(monedaCompra)])}>
                    <Plus className="h-4 w-4" />
                    Agregar gasto
                </Button>
            </div>

            {sinTipoCambio && (
                <p className="mt-3 text-xs font-medium text-red-600">
                    Hay gastos en soles y la compra está en otra moneda: pon el tipo de cambio de la compra para convertirlos.
                </p>
            )}
        </Modal>
    );
}
