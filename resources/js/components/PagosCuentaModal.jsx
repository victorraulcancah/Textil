import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Pencil, Plus, Trash2, Wallet, X } from 'lucide-react';
import api, { asList } from '../lib/api';
import { cargarTipoCambio } from '../lib/moneda';
import { useToast } from '../lib/toast';
import MetodoCajaPicker from './MetodoCajaPicker';
import { Alert, Badge, Button, Input, Modal } from './ui';

const money = (n, moneda = 'PEN') =>
    new Intl.NumberFormat('es-PE', { style: 'currency', currency: moneda || 'PEN' }).format(Number(n) || 0);

/** Hoy en la fecha local (no en UTC: de noche en Perú UTC ya es mañana). */
const hoy = () => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
};

const estadoBadge = (estado) => {
    const map = { pendiente: 'red', parcial: 'amber', pagado: 'green', anulado: 'gray' };
    return <Badge variant={map[estado] ?? 'gray'}>{estado ?? '—'}</Badge>;
};

const metodoPagoLabel = (p) => {
    if (p.cuenta_bancaria) return `Transf. · ${p.cuenta_bancaria.alias || p.cuenta_bancaria.numero_cuenta}`;
    if (p.billetera) return p.billetera.nombre;
    return 'Efectivo';
};

/**
 * `moneda` vacía = la moneda de la deuda; "PEN" = se paga con soles, al
 * `tipoCambio` del día que se escribe a mano.
 */
const emptyLinea = () => ({ tipo: 'efectivo', cuentaId: '', billeteraId: '', monto: '', referencia: '', moneda: '', tipoCambio: '' });

const NOMBRE_MONEDA = { PEN: 'Soles', USD: 'Dólares', CNY: 'Yuanes', EUR: 'Euros' };

const redondear = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Modal reutilizable de pagos de una cuenta por cobrar/pagar.
 * Registrar (mixto), editar y anular, con método por tipo (efectivo/transferencia/billetera).
 * @param {'cobrar'|'pagar'} tipo
 */
/** "2026-09-29T05:00:00.000000Z" o "2026-09-29" → "29/09/2026" (sin pasar por la zona horaria: el día es el escrito). */
const fechaCorta = (valor) => {
    const m = String(valor ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : (valor ?? '');
};

export default function PagosCuentaModal({ open, onClose, cuenta, tipo, onSaved }) {
    const toast = useToast();
    const basePath = tipo === 'cobrar' ? '/cuentas-por-cobrar' : '/cuentas-por-pagar';
    const esCobrar = tipo === 'cobrar';

    const [state, setState] = useState(cuenta);
    const [cuentas, setCuentas] = useState([]);
    const [billeteras, setBilleteras] = useState([]);
    const [lineas, setLineas] = useState([emptyLinea()]);
    const [editId, setEditId] = useState(null);
    const [editForm, setEditForm] = useState(emptyLinea());
    const [saving, setSaving] = useState(false);
    /** Al cobrar, el tipo de cambio comercial del día se propone para pagar en soles. */
    const [tcComercial, setTcComercial] = useState(null);
    /** Día en que se recibió el pago: hoy, o uno pasado si se registra tarde. */
    const [fecha, setFecha] = useState(hoy());
    /** Lo último que se propuso como tipo de cambio: si la línea todavía lo tiene, no la tocó nadie. */
    const tcPropuesto = useRef(null);
    /** Fecha para la que no hay tipo de cambio guardado: SUNAT solo publica el de hoy. */
    const [tcSinDato, setTcSinDato] = useState(null);

    useEffect(() => {
        setState(cuenta);
        setLineas([emptyLinea()]);
        setEditId(null);
        setFecha(hoy());
    }, [cuenta]);

    useEffect(() => {
        if (!open) return;
        (async () => {
            try {
                const [c, b] = await Promise.all([api.get('/cuentas-bancarias'), api.get('/billeteras-digitales')]);
                setCuentas(asList(c));
                setBilleteras(asList(b));
            } catch {
                /* ignore */
            }
        })();
    }, [open]);

    // El tipo de cambio que se propone es el del día del pago: el comercial de ese día
    // si ya se cobró con uno y, si no, el de SUNAT de esa fecha. Se escribe a mano igual.
    useEffect(() => {
        if (!open || !esCobrar || !fecha) return;
        let vigente = true;
        cargarTipoCambio(fecha)
            .then((tc) => {
                if (!vigente) return;
                const nuevo = tc?.comercial ?? tc?.venta ?? null;
                const anterior = tcPropuesto.current;
                tcPropuesto.current = nuevo;
                setTcComercial(nuevo);
                setTcSinDato(nuevo ? null : fecha);
                // Las líneas en soles que conservan lo propuesto pasan al de la nueva fecha.
                setLineas((ls) =>
                    ls.map((l) =>
                        l.moneda === 'PEN' && (!l.tipoCambio || (anterior != null && Number(l.tipoCambio) === Number(anterior)))
                            ? { ...l, tipoCambio: nuevo ? String(nuevo) : '' }
                            : l,
                    ),
                );
            })
            .catch(() => vigente && (setTcComercial(null), setTcSinDato(fecha)));
        return () => {
            vigente = false;
        };
    }, [open, esCobrar, fecha]);

    const pagos = useMemo(() => (Array.isArray(state?.pagos) ? state.pagos : []), [state]);
    const nombre = esCobrar ? state?.cliente?.nombre : state?.proveedor?.nombre;
    const anulada = state?.estado === 'anulado';
    const saldo = Number(state?.saldo) || 0;
    const puedePagar = !anulada && saldo > 0.005;

    /**
     * Una deuda en dólares se puede pagar con soles: el monto va en soles y se
     * abona su equivalente al tipo de cambio. Al cobrar a un cliente se
     * propone el comercial del día; al pagar a un proveedor se escribe.
     */
    const monedaDeuda = state?.moneda || 'PEN';
    const admiteSoles = monedaDeuda !== 'PEN';
    const enSoles = (l) => admiteSoles && l.moneda === 'PEN';
    /** Lo que una línea abona a la deuda, en la moneda de la deuda. */
    const abonoDe = (l) => {
        if (!enSoles(l)) return Number(l.monto) || 0;
        const tc = Number(l.tipoCambio) || 0;
        return tc > 0 ? redondear((Number(l.monto) || 0) / tc) : 0;
    };
    const nuevoTotal = lineas.reduce((acc, l) => acc + abonoDe(l), 0);
    const faltaTipoCambio = (l) => enSoles(l) && Number(l.monto) > 0 && !(Number(l.tipoCambio) > 0);

    const setLinea = (i, patch) => setLineas((p) => p.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
    const addLinea = () => setLineas((p) => [...p, emptyLinea()]);
    const removeLinea = (i) => setLineas((p) => (p.length === 1 ? p : p.filter((_, idx) => idx !== i)));

    const apiError = (err, fallback) => {
        const first = err.response?.data?.errors ? Object.values(err.response.data.errors)[0]?.[0] : null;
        toast.error(first ?? err.response?.data?.message ?? fallback);
    };

    const toPayload = (l) => ({
        forma_pago: l.tipo,
        cuenta_bancaria_id: l.tipo === 'transferencia' ? l.cuentaId || null : null,
        billetera_id: l.tipo === 'billetera' ? l.billeteraId || null : null,
        monto: Number(l.monto),
        referencia: l.referencia || null,
        // En soles: el backend abona su equivalente al tipo de cambio del día.
        ...(enSoles(l) ? { moneda: 'PEN', tipo_cambio: Number(l.tipoCambio) } : {}),
    });

    /** "Dólares | Soles" y, en soles, el tipo de cambio del día. */
    const controlesMoneda = (l, onChange) =>
        admiteSoles ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-lg border border-edge bg-gray-50 p-0.5">
                    {[monedaDeuda, 'PEN'].map((m) => {
                        const activa = (l.moneda || monedaDeuda) === m;
                        return (
                            <button
                                key={m}
                                type="button"
                                onClick={() =>
                                    onChange({
                                        moneda: m === monedaDeuda ? '' : 'PEN',
                                        // Al cobrar, se propone el comercial del día.
                                        ...(m === 'PEN' && esCobrar && !l.tipoCambio && tcComercial
                                            ? { tipoCambio: String(tcComercial) }
                                            : {}),
                                    })
                                }
                                className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
                                    activa ? 'bg-white text-primary-700 shadow-sm' : 'text-warm-500 hover:text-warm-700'
                                }`}
                            >
                                {NOMBRE_MONEDA[m] ?? m}
                            </button>
                        );
                    })}
                </div>
                {enSoles(l) && (
                    <>
                        <Input
                            type="number"
                            min="0"
                            step="0.0001"
                            placeholder={esCobrar ? 'T.C. comercial' : 'T.C. del día'}
                            value={l.tipoCambio}
                            onChange={(e) => onChange({ tipoCambio: e.target.value })}
                            className="w-32 text-right"
                            aria-label="Tipo de cambio"
                        />
                        <span className="text-xs text-warm-500">
                            {Number(l.tipoCambio) > 0
                                ? `= ${money(abonoDe(l), monedaDeuda)}${esCobrar ? ' (T.C. comercial)' : ''}`
                                : esCobrar && !l.id && tcSinDato === fecha
                                  ? `No hay tipo de cambio guardado del ${fechaCorta(fecha)}: escríbelo`
                                  : 'Pon el tipo de cambio del día'}
                        </span>
                    </>
                )}
            </div>
        ) : null;

    const registrar = async () => {
        const validos = lineas.filter((l) => Number(l.monto) > 0);
        if (!fecha || fecha > hoy()) return toast.error('La fecha del pago no puede ser futura.');
        if (validos.length === 0) return toast.error('Agrega al menos un pago con monto.');
        if (validos.some(faltaTipoCambio)) return toast.error('Para pagar en soles, pon el tipo de cambio del día.');
        if (nuevoTotal > saldo + 0.01) return toast.error('El pago excede el saldo pendiente.');
        setSaving(true);
        try {
            const res = await api.post(`${basePath}/${state.id}/pagos`, { fecha, pagos: validos.map(toPayload) });
            setState(res.data);
            setLineas([emptyLinea()]);
            toast.success('Pago registrado.');
            onSaved?.(res.data);
        } catch (err) {
            apiError(err, 'No se pudo registrar el pago.');
        } finally {
            setSaving(false);
        }
    };

    const startEdit = (p) => {
        const pagadoEnSoles = p.monto_pen != null;
        setEditId(p.id);
        setEditForm({
            tipo: p.forma_pago,
            cuentaId: p.cuenta_bancaria_id ? String(p.cuenta_bancaria_id) : '',
            billeteraId: p.billetera_id ? String(p.billetera_id) : '',
            // Pagado en soles: se edita lo que salió en soles, con su tipo de cambio.
            monto: String(pagadoEnSoles ? Number(p.monto_pen) : Number(p.monto)),
            referencia: p.referencia ?? '',
            moneda: pagadoEnSoles ? 'PEN' : '',
            tipoCambio: pagadoEnSoles && p.tipo_cambio ? String(Number(p.tipo_cambio)) : '',
            fecha: String(p.fecha ?? '').slice(0, 10),
        });
    };

    const guardarEdit = async () => {
        if (!(Number(editForm.monto) > 0)) return toast.error('El monto debe ser mayor a 0.');
        if (faltaTipoCambio(editForm)) return toast.error('Para pagar en soles, pon el tipo de cambio del día.');
        setSaving(true);
        try {
            const res = await api.put(`${basePath}/pagos/${editId}`, { ...toPayload(editForm), fecha: editForm.fecha || undefined });
            setState(res.data);
            setEditId(null);
            toast.success('Pago actualizado.');
            onSaved?.(res.data);
        } catch (err) {
            apiError(err, 'No se pudo actualizar el pago.');
        } finally {
            setSaving(false);
        }
    };

    const anular = async (p) => {
        const importe = p.monto_pen != null ? money(p.monto_pen, 'PEN') : money(p.monto, p.moneda || state.moneda);
        if (!window.confirm(`¿Anular este pago de ${importe}? Se revertirá el movimiento de caja.`)) return;
        setSaving(true);
        try {
            const res = await api.delete(`${basePath}/pagos/${p.id}`);
            setState(res.data);
            toast.success('Pago anulado.');
            onSaved?.(res.data);
        } catch (err) {
            apiError(err, 'No se pudo anular el pago.');
        } finally {
            setSaving(false);
        }
    };

    if (!state) return null;

    return (
        <Modal
            open={open}
            onClose={onClose}
            size="xl"
            title={`Pagos — ${nombre ?? (esCobrar ? 'Cliente' : 'Proveedor')}`}
            description={
                esCobrar
                    ? [
                          state?.nota_venta ? `${state.nota_venta.serie}-${state.nota_venta.numero}` : null,
                          state?.total_cuotas > 1 ? `Cuota ${state.numero_cuota} de ${state.total_cuotas}` : null,
                      ]
                          .filter(Boolean)
                          .join(' · ') || 'Cobros del cliente'
                    : 'Pagos al proveedor'
            }
            footer={<Button variant="secondary" onClick={onClose}>Cerrar</Button>}
        >
            <div className="mb-4 grid grid-cols-2 gap-3 rounded-xl border border-edge bg-gray-50 p-4 sm:grid-cols-4">
                <div><p className="text-xs uppercase tracking-wide text-warm-500">Total</p><p className="font-semibold text-warm-900">{money(state.monto_total, state.moneda)}</p></div>
                <div><p className="text-xs uppercase tracking-wide text-warm-500">Pagado</p><p className="font-semibold text-green-600">{money(state.monto_pagado, state.moneda)}</p></div>
                <div><p className="text-xs uppercase tracking-wide text-warm-500">Saldo</p><p className="font-semibold text-red-600">{money(state.saldo, state.moneda)}</p></div>
                <div><p className="text-xs uppercase tracking-wide text-warm-500">Estado</p><div className="mt-0.5">{estadoBadge(state.estado)}</div></div>
            </div>

            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-warm-500">Pagos registrados</h3>
            {pagos.length === 0 ? (
                <p className="mb-4 rounded-lg border border-dashed border-edge px-3 py-4 text-center text-sm text-warm-500">Aún no hay pagos registrados.</p>
            ) : (
                <div className="mb-5 divide-y divide-gray-100 rounded-xl border border-edge">
                    {pagos.map((p) =>
                        editId === p.id ? (
                            <div key={p.id} className="space-y-2 bg-amber-50 p-3">
                                <MetodoCajaPicker
                                    cuentas={cuentas} billeteras={billeteras}
                                    tipo={editForm.tipo} cuentaId={editForm.cuentaId} billeteraId={editForm.billeteraId}
                                    onChange={({ tipo, cuentaId, billeteraId }) => setEditForm((f) => ({ ...f, tipo, cuentaId, billeteraId }))}
                                />
                                <div className="flex items-center gap-2">
                                    <Input type="date" max={hoy()} value={editForm.fecha ?? ''} onChange={(e) => setEditForm((f) => ({ ...f, fecha: e.target.value }))} className="w-40" aria-label="Fecha del pago" />
                                    <Input type="number" min="0" step="any" placeholder={enSoles(editForm) ? 'Monto en soles' : 'Monto'} value={editForm.monto} onChange={(e) => setEditForm((f) => ({ ...f, monto: e.target.value }))} className="w-28 text-right" />
                                    <Input placeholder="Referencia" value={editForm.referencia} onChange={(e) => setEditForm((f) => ({ ...f, referencia: e.target.value }))} className="flex-1" />
                                    <button type="button" onClick={guardarEdit} disabled={saving} className="rounded-md p-2 text-green-600 hover:bg-green-100" aria-label="Guardar"><Check className="h-4 w-4" /></button>
                                    <button type="button" onClick={() => setEditId(null)} className="rounded-md p-2 text-gray-500 hover:bg-gray-100" aria-label="Cancelar"><X className="h-4 w-4" /></button>
                                </div>
                                {controlesMoneda(editForm, (patch) => setEditForm((f) => ({ ...f, ...patch })))}
                            </div>
                        ) : (
                            <div key={p.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                                <Badge variant="blue">{metodoPagoLabel(p)}</Badge>
                                {p.monto_pen != null ? (
                                    // Pagado en soles: lo que salió y lo que abonó a la deuda.
                                    <span className="font-medium text-warm-900">
                                        {money(p.monto_pen, 'PEN')}
                                        <span className="ml-2 text-xs font-normal text-warm-500">· 
                                            T.C. {Number(p.tipo_cambio)} = {money(p.monto, p.moneda || state.moneda)}
                                        </span>
                                    </span>
                                ) : (
                                    <span className="font-medium text-warm-900">{money(p.monto, p.moneda || state.moneda)}</span>
                                )}
                                <span className="text-warm-500">{fechaCorta(p.fecha)}</span>
                                {p.referencia && <span className="text-warm-400">· {p.referencia}</span>}
                                <div className="ml-auto flex items-center gap-1">
                                    <button type="button" onClick={() => startEdit(p)} disabled={anulada || saving} className="rounded-md p-1.5 text-blue-600 hover:bg-blue-50 disabled:opacity-40" aria-label="Editar"><Pencil className="h-4 w-4" /></button>
                                    <button type="button" onClick={() => anular(p)} disabled={anulada || saving} className="rounded-md p-1.5 text-red-600 hover:bg-red-50 disabled:opacity-40" aria-label="Anular"><Trash2 className="h-4 w-4" /></button>
                                </div>
                            </div>
                        ),
                    )}
                </div>
            )}

            {anulada ? (
                <Alert variant="warning">Esta cuenta está anulada.</Alert>
            ) : !puedePagar ? (
                <Alert variant="success">Cuenta saldada. No hay saldo pendiente.</Alert>
            ) : (
                <div className="rounded-xl border border-edge p-4">
                    <div className="mb-3 flex items-center justify-between">
                        <h3 className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-warm-500">
                            <Wallet className="h-4 w-4" /> Registrar pago (mixto)
                        </h3>
                        <Button type="button" variant="ghost" size="sm" onClick={addLinea}><Plus className="h-4 w-4" /> Agregar forma</Button>
                    </div>
                    <div className="mb-3 w-44">
                        <Input label={esCobrar ? 'Fecha del cobro' : 'Fecha del pago'} type="date" max={hoy()} value={fecha} onChange={(e) => setFecha(e.target.value)} />
                    </div>
                    <div className="space-y-3">
                        {lineas.map((l, i) => (
                            <div key={i} className="rounded-lg border border-edge p-3">
                                <MetodoCajaPicker
                                    cuentas={cuentas} billeteras={billeteras}
                                    tipo={l.tipo} cuentaId={l.cuentaId} billeteraId={l.billeteraId}
                                    onChange={({ tipo, cuentaId, billeteraId }) => setLinea(i, { tipo, cuentaId, billeteraId })}
                                />
                                <div className="mt-2 flex items-center gap-2">
                                    <Input type="number" min="0" step="any" placeholder={enSoles(l) ? 'Monto en soles' : 'Monto'} value={l.monto} onChange={(e) => setLinea(i, { monto: e.target.value })} className="w-28 text-right" />
                                    <Input placeholder="Referencia (opc.)" value={l.referencia} onChange={(e) => setLinea(i, { referencia: e.target.value })} className="flex-1" />
                                    <button type="button" onClick={() => removeLinea(i)} disabled={lineas.length === 1} className="rounded-md p-2 text-red-600 hover:bg-red-50 disabled:opacity-40" aria-label="Quitar"><Trash2 className="h-4 w-4" /></button>
                                </div>
                                {controlesMoneda(l, (patch) => setLinea(i, patch))}
                            </div>
                        ))}
                    </div>
                    <div className="mt-3 flex items-center justify-between border-t border-dashed border-edge pt-3">
                        <div className="text-sm">
                            <span className="text-warm-500">A pagar: </span>
                            <span className="font-semibold text-warm-900">{money(nuevoTotal, state.moneda)}</span>
                            {nuevoTotal > saldo + 0.01 && <span className="ml-2 text-red-600">excede el saldo ({money(saldo, state.moneda)})</span>}
                        </div>
                        <Button onClick={registrar} loading={saving} disabled={nuevoTotal <= 0}>Registrar pago</Button>
                    </div>
                </div>
            )}
        </Modal>
    );
}
