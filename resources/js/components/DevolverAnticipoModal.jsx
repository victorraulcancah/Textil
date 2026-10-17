import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import api from '../lib/api';
import { diaLocal, hoyIso } from '../lib/fechas';
import { useToast } from '../lib/toast';
import MetodoCajaPicker from './MetodoCajaPicker';
import { Alert, Button, Input, Modal } from './ui';

const money = (n, moneda = 'PEN') =>
    new Intl.NumberFormat('es-PE', { style: 'currency', currency: moneda || 'PEN' }).format(Number(n) || 0);
const redondear = (n) => Math.round((Number(n) || 0) * 100) / 100;

const fecha = (v) => {
    const dia = diaLocal(v);
    return dia ? new Date(`${dia}T00:00:00`).toLocaleDateString('es-PE') : '—';
};

const linea = (monto = '') => ({ tipo: '', cuentaId: '', billeteraId: '', referencia: '', monto });

const metodoDe = (p) => (p.cuenta_bancaria ? `Transf. · ${p.cuenta_bancaria.alias || p.cuenta_bancaria.numero_cuenta}` : p.billetera ? p.billetera.nombre : 'Efectivo');

/**
 * Devolver al cliente lo que sobra de un anticipo, en uno o varios métodos (pago mixto). Cada método sale como un egreso
 * de la caja abierta de quien devuelve. Solo se devuelve el saldo; las devoluciones ya hechas se pueden anular.
 */
export default function DevolverAnticipoModal({ anticipo, cuentas = [], billeteras = [], onClose, onDone }) {
    const toast = useToast();
    const [lineas, setLineas] = useState([linea()]);
    const [dia, setDia] = useState(hoyIso());
    const [observaciones, setObservaciones] = useState('');
    const [saving, setSaving] = useState(false);
    const [confirmando, setConfirmando] = useState(null);

    useEffect(() => {
        if (!anticipo) return;
        setLineas([linea(String(Number(anticipo.saldo) || ''))]);
        setDia(hoyIso());
        setObservaciones('');
        setConfirmando(null);
    }, [anticipo?.id]);

    if (!anticipo) return null;

    const moneda = anticipo.moneda;
    const saldo = Number(anticipo.saldo) || 0;
    const total = redondear(lineas.reduce((acc, l) => acc + (Number(l.monto) || 0), 0));
    const quedara = redondear(saldo - total);
    const vigentes = (anticipo.devoluciones ?? []).filter((d) => d.estado === 'vigente');

    const set = (i, patch) => setLineas((prev) => prev.map((l, k) => (k === i ? { ...l, ...patch } : l)));

    const devolver = async () => {
        if (total <= 0) return toast.error('Indica cuánto se devuelve.');
        if (total > saldo + 0.001) return toast.error(`Solo se puede devolver el saldo: ${money(saldo, moneda)}.`);
        if (lineas.some((l) => Number(l.monto) > 0 && !l.tipo)) return toast.error('Elige el método de cada monto.');

        setSaving(true);
        try {
            const res = await api.post(`/anticipos/${anticipo.id}/devolver`, {
                fecha: dia || hoyIso(),
                observaciones: observaciones.trim() || null,
                pagos: lineas
                    .filter((l) => Number(l.monto) > 0)
                    .map((l) => ({
                        forma_pago: l.tipo,
                        monto: Number(l.monto),
                        cuenta_bancaria_id: l.tipo === 'transferencia' ? l.cuentaId || null : null,
                        billetera_id: l.tipo === 'billetera' ? l.billeteraId || null : null,
                        referencia: l.tipo !== 'efectivo' ? l.referencia.trim() || null : null,
                    })),
            });
            toast.success('Devolución registrada: salió de tu caja.');
            onDone(res.data);
        } catch (err) {
            const v = err.response?.data?.errors ?? {};
            toast.error(Object.values(v)[0]?.[0] ?? err.response?.data?.message ?? 'No se pudo registrar la devolución.');
        } finally {
            setSaving(false);
        }
    };

    const anularDevolucion = async (d) => {
        setSaving(true);
        try {
            const res = await api.post(`/anticipos/devoluciones/${d.id}/anular`, { motivo: null });
            toast.success('Devolución anulada: el saldo volvió al anticipo.');
            setConfirmando(null);
            onDone(res.data, false);
        } catch (err) {
            const v = err.response?.data?.errors ?? {};
            toast.error(Object.values(v)[0]?.[0] ?? err.response?.data?.message ?? 'No se pudo anular la devolución.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal
            open
            onClose={onClose}
            title="Devolver anticipo"
            description={`${anticipo.documento} · ${anticipo.cliente?.nombre ?? ''}`}
            size="lg"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>Cerrar</Button>
                    {saldo > 0 && (
                        <Button loading={saving} onClick={devolver}>Devolver {total > 0 ? money(total, moneda) : ''}</Button>
                    )}
                </>
            }
        >
            <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                    {[
                        ['Recibido', money(anticipo.monto, moneda)],
                        ['Aplicado', money(anticipo.monto_aplicado, moneda)],
                        ['Devuelto', money(anticipo.monto_devuelto, moneda)],
                        ['Saldo', money(saldo, moneda)],
                    ].map(([k, v]) => (
                        <div key={k} className="rounded-lg border border-edge px-3 py-2">
                            <p className="text-[11px] uppercase tracking-wide text-warm-500">{k}</p>
                            <p className={`font-bold ${k === 'Saldo' ? 'text-green-600' : 'text-warm-900'}`}>{v}</p>
                        </div>
                    ))}
                </div>

                {saldo > 0 ? (
                    <>
                        <Alert variant="info">
                            Se devuelve solo el saldo, entero o una parte, en uno o varios métodos. Cada método sale como un egreso de <strong>tu caja abierta</strong>.
                        </Alert>

                        <div className="space-y-3">
                            {lineas.map((l, i) => (
                                <div key={i} className="rounded-lg border border-edge p-3">
                                    <MetodoCajaPicker
                                        cuentas={cuentas}
                                        billeteras={billeteras}
                                        aceptaEfectivo
                                        tipo={l.tipo}
                                        cuentaId={l.cuentaId}
                                        billeteraId={l.billeteraId}
                                        onChange={({ tipo, cuentaId, billeteraId }) => set(i, { tipo, cuentaId, billeteraId })}
                                        referencia={l.referencia}
                                        onReferencia={(referencia) => set(i, { referencia })}
                                    />
                                    <div className="mt-2 flex items-center gap-2">
                                        <Input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            placeholder="Monto"
                                            value={l.monto}
                                            onChange={(e) => set(i, { monto: e.target.value })}
                                            className="text-right"
                                            aria-label="Monto a devolver con este método"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setLineas((prev) => (prev.length === 1 ? prev : prev.filter((_, k) => k !== i)))}
                                            disabled={lineas.length === 1}
                                            className="rounded-md p-2 text-red-600 transition hover:bg-red-50 disabled:opacity-40"
                                            aria-label="Quitar este método"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <Button type="button" variant="ghost" size="sm" onClick={() => setLineas((prev) => [...prev, linea()])}>
                            <Plus className="h-4 w-4" /> Agregar otro método
                        </Button>

                        <div className="rounded-lg bg-gray-50 px-3 py-2.5 text-sm">
                            <div className="flex justify-between"><span className="text-warm-500">Se devuelve</span><span className="font-semibold">{money(total, moneda)}</span></div>
                            <div className="flex justify-between">
                                <span className="text-warm-500">Queda en el anticipo</span>
                                <span className={`font-semibold ${quedara < -0.001 ? 'text-red-600' : 'text-warm-900'}`}>{money(quedara, moneda)}</span>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <Input label="Fecha" type="date" max={hoyIso()} value={dia} onChange={(e) => setDia(e.target.value)} />
                            <Input label="Observaciones (opcional)" placeholder="Ej: no compró el pedido" value={observaciones} onChange={(e) => setObservaciones(e.target.value)} />
                        </div>
                    </>
                ) : (
                    <Alert variant="info">Este anticipo ya no tiene saldo para devolver.</Alert>
                )}

                {vigentes.length > 0 && (
                    <div>
                        <h3 className="mb-2 text-sm font-semibold text-warm-900">Devoluciones hechas</h3>
                        <div className="space-y-2">
                            {vigentes.map((d) => (
                                <div key={d.id} className="flex items-start justify-between gap-3 rounded-lg border border-edge px-3 py-2 text-sm">
                                    <div>
                                        <p className="font-medium text-warm-900">
                                            {money(d.monto, moneda)} <span className="font-normal text-warm-500">· {fecha(d.fecha)}{d.usuario?.name ? ` · ${d.usuario.name}` : ''}</span>
                                        </p>
                                        <p className="text-xs text-warm-500">{(d.pagos ?? []).map((p) => `${metodoDe(p)} ${money(p.monto, moneda)}`).join(' + ')}</p>
                                    </div>
                                    {confirmando === d.id ? (
                                        <div className="flex shrink-0 items-center gap-1.5">
                                            <span className="text-xs text-warm-500">¿Anular?</span>
                                            <Button size="sm" variant="danger" loading={saving} onClick={() => anularDevolucion(d)}>Sí</Button>
                                            <Button size="sm" variant="secondary" onClick={() => setConfirmando(null)}>No</Button>
                                        </div>
                                    ) : (
                                        <button type="button" onClick={() => setConfirmando(d.id)} className="shrink-0 text-xs font-semibold text-red-600 hover:underline">
                                            Anular
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </Modal>
    );
}
