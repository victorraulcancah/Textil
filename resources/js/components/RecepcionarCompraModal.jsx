import { useCallback, useEffect, useMemo, useState } from 'react';
import { PackageCheck } from 'lucide-react';
import api, { asList } from '../lib/api';
import { opcionesAlmacen } from '../lib/almacenes';
import { useToast } from '../lib/toast';
import { Alert, Button, Input, Modal, Select, Spinner } from './ui';

const hoy = () => new Date().toISOString().slice(0, 10);

const num = (n) => new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 }).format(Number(n) || 0);

/**
 * Registra una recepción contra una compra. Admite recepción parcial: cada línea
 * trae su pendiente y se recibe lo que realmente llegó.
 *
 *   onDone — se llama tras registrar, para que el padre recargue.
 */
export default function RecepcionarCompraModal({ open, onClose, compraId, onDone }) {
    const toast = useToast();

    const [cargando, setCargando] = useState(false);
    const [guardando, setGuardando] = useState(false);
    const [datos, setDatos] = useState(null);
    const [almacenes, setAlmacenes] = useState([]);
    /** Cantidad a recibir por línea: { [compra_detalle_id]: '5' } */
    const [cantidades, setCantidades] = useState({});
    const [form, setForm] = useState({ almacen_id: '', fecha_recepcion: hoy(), observaciones: '' });

    const cargar = useCallback(async () => {
        setCargando(true);
        try {
            const [pendRes, almRes] = await Promise.all([
                api.get(`/compras/${compraId}/pendientes-recepcion`),
                api.get('/almacenes'),
            ]);
            setDatos(pendRes.data);
            const lista = asList(almRes);
            setAlmacenes(lista);
            setForm({
                almacen_id: lista.length === 1 ? String(lista[0].id) : '',
                fecha_recepcion: hoy(),
                observaciones: '',
            });
            // Por defecto se recibe todo lo pendiente; se ajusta lo que no llegó.
            setCantidades(
                Object.fromEntries(
                    (pendRes.data.lineas ?? [])
                        .filter((l) => l.pendiente > 0)
                        .map((l) => [String(l.compra_detalle_id), String(l.pendiente)]),
                ),
            );
        } catch {
            toast.error('No se pudo cargar el pendiente de la compra.');
        } finally {
            setCargando(false);
        }
    }, [compraId, toast]);

    useEffect(() => {
        if (open && compraId) cargar();
    }, [open, compraId, cargar]);

    const lineas = datos?.lineas ?? [];
    const conPendiente = useMemo(() => lineas.filter((l) => l.pendiente > 0), [lineas]);

    const totalARecibir = useMemo(
        () => conPendiente.reduce((acc, l) => acc + (Number(cantidades[String(l.compra_detalle_id)]) || 0), 0),
        [conPendiente, cantidades],
    );

    const registrar = async () => {
        if (!form.almacen_id) return toast.error('Elige el almacén receptor.');

        const detalles = conPendiente
            .map((l) => ({
                compra_detalle_id: l.compra_detalle_id,
                cantidad_recibida: Number(cantidades[String(l.compra_detalle_id)]) || 0,
            }))
            .filter((d) => d.cantidad_recibida > 0);

        if (detalles.length === 0) return toast.error('Indica al menos una cantidad recibida.');

        const excedida = conPendiente.find(
            (l) => (Number(cantidades[String(l.compra_detalle_id)]) || 0) > l.pendiente,
        );
        if (excedida) {
            return toast.error(`"${excedida.producto}" supera lo pendiente (${num(excedida.pendiente)}).`);
        }

        setGuardando(true);
        try {
            await api.post('/recepciones-compra', {
                compra_id: compraId,
                almacen_id: form.almacen_id,
                fecha_recepcion: form.fecha_recepcion,
                tipo_documento: datos?.compra?.tipo_documento ?? null,
                numero_documento: [datos?.compra?.serie, datos?.compra?.numero].filter(Boolean).join('-') || null,
                observaciones: form.observaciones,
                detalles,
            });
            toast.success('Recepción registrada.');
            onDone?.();
            onClose?.();
        } catch (err) {
            toast.error(err.response?.data?.message ?? 'No se pudo registrar la recepción.');
        } finally {
            setGuardando(false);
        }
    };

    return (
        <Modal
            open={open}
            onClose={onClose}
            title={`Recepcionar compra ${datos?.compra?.numero_compra ?? ''}`}
            description="Registra lo que realmente llegó. Puedes recibir por partes."
            size="3xl"
            footer={
                <>
                    <span className="mr-auto text-xs text-warm-500">
                        {num(totalARecibir)} unidades a recibir
                    </span>
                    <Button variant="secondary" onClick={onClose}>Cancelar</Button>
                    <Button onClick={registrar} loading={guardando} disabled={cargando || conPendiente.length === 0}>
                        <PackageCheck className="h-4 w-4" /> Registrar recepción
                    </Button>
                </>
            }
        >
            {cargando ? (
                <div className="flex items-center justify-center py-16">
                    <Spinner size="lg" className="text-primary-600" />
                </div>
            ) : (
                <>
                    <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <Select
                            label="Almacén receptor"
                            value={form.almacen_id}
                            onChange={(e) => setForm((p) => ({ ...p, almacen_id: e.target.value }))}
                            options={[
                                { value: '', label: 'Selecciona…' },
                                ...opcionesAlmacen(almacenes, form.almacen_id),
                            ]}
                        />
                        <Input
                            label="Fecha de recepción"
                            type="date"
                            value={form.fecha_recepcion}
                            onChange={(e) => setForm((p) => ({ ...p, fecha_recepcion: e.target.value }))}
                        />
                        <Input
                            label="Observaciones"
                            placeholder="Opcional"
                            value={form.observaciones}
                            onChange={(e) => setForm((p) => ({ ...p, observaciones: e.target.value }))}
                        />
                    </div>

                    {conPendiente.length === 0 ? (
                        <Alert variant="success">
                            Esta compra ya no tiene nada pendiente de recepcionar.
                        </Alert>
                    ) : (
                        <div className="overflow-x-auto rounded-lg border border-edge">
                            <table className="w-full min-w-[720px] text-sm">
                                <thead>
                                    <tr className="bg-primary-600 text-left text-xs font-semibold uppercase tracking-wide text-white">
                                        <th className="px-3 py-2.5">Código</th>
                                        <th className="px-3 py-2.5">Producto</th>
                                        <th className="px-3 py-2.5">Unidad</th>
                                        <th className="px-3 py-2.5 text-right">Pedida</th>
                                        <th className="px-3 py-2.5 text-right">Recibida</th>
                                        <th className="px-3 py-2.5 text-right">Pendiente</th>
                                        <th className="px-3 py-2.5 text-right">Recibe ahora</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {conPendiente.map((l) => (
                                        <tr key={l.compra_detalle_id}>
                                            <td className="px-3 py-2 text-warm-500">{l.codigo ?? '—'}</td>
                                            <td className="px-3 py-2 font-semibold text-warm-900">{l.producto}</td>
                                            <td className="px-3 py-2 text-warm-500">{l.unidad ?? '—'}</td>
                                            <td className="px-3 py-2 text-right text-warm-900">{num(l.cantidad_pedida)}</td>
                                            <td className="px-3 py-2 text-right text-warm-500">{num(l.cantidad_recibida)}</td>
                                            <td className="px-3 py-2 text-right font-semibold text-amber-600">{num(l.pendiente)}</td>
                                            <td className="px-3 py-2">
                                                <Input
                                                    type="number"
                                                    min="0"
                                                    max={l.pendiente}
                                                    step="any"
                                                    value={cantidades[String(l.compra_detalle_id)] ?? ''}
                                                    onChange={(e) =>
                                                        setCantidades((prev) => ({
                                                            ...prev,
                                                            [String(l.compra_detalle_id)]: e.target.value,
                                                        }))
                                                    }
                                                    aria-label={`Cantidad recibida de ${l.producto}`}
                                                    className="text-right"
                                                />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {conPendiente.length > 0 && (
                        <p className="mt-3 text-xs text-warm-500">
                            Si el proveedor ya no va a enviar lo que falta, registra lo que llegó y luego
                            usa <span className="font-semibold">Finalizar</span> en la recepción para cerrar el pendiente.
                        </p>
                    )}
                </>
            )}
        </Modal>
    );
}
