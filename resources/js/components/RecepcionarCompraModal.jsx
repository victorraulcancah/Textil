import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
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
/**
 * "58 26.5 / 58 26.6 / 64" -> [{metros: 58, peso_kg: 26.5}, …]
 *
 * El packing list se pega tal cual: una línea por rollo, con el metraje y —si
 * viene— el peso. Se acepta cualquier separador porque cada proveedor manda el
 * suyo.
 */
function leerMetrajes(texto) {
    return String(texto || '')
        .split(/\r?\n/)
        .flatMap((linea) => {
            const numeros = (linea.match(/[\d]+(?:[.,][\d]+)?/g) || []).map((n) =>
                Number(n.replace(',', '.')),
            );
            if (!numeros.length) return [];
            // Si en la fila hay dos números, el segundo es el peso.
            return [{ metros: numeros[0], peso_kg: numeros.length > 1 ? numeros[1] : null }];
        })
        .filter((r) => r.metros > 0);
}

export default function RecepcionarCompraModal({ open, onClose, compraId, onDone }) {
    const toast = useToast();

    const [cargando, setCargando] = useState(false);
    const [guardando, setGuardando] = useState(false);
    const [datos, setDatos] = useState(null);
    const [almacenes, setAlmacenes] = useState([]);
    /** Cantidad a recibir por línea: { [compra_detalle_id]: '5' } */
    const [cantidades, setCantidades] = useState({});
    /**
     * Rollos capturados por línea: { [compra_detalle_id]: { color_id, codigo, metrajes } }.
     * Solo aplica a la mercadería que se maneja pieza por pieza (las telas).
     */
    const [rollosPorLinea, setRollosPorLinea] = useState({});
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
                ...(() => {
                    const cap = rollosPorLinea[String(l.compra_detalle_id)];
                    const rollos = leerMetrajes(cap?.metrajes);
                    return rollos.length
                        ? {
                              rollos,
                              producto_color_id: cap.color_id || null,
                              codigo_proveedor: cap.codigo || null,
                          }
                        : {};
                })(),
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
                                    {conPendiente.map((l) => {
                                        const clave = String(l.compra_detalle_id);
                                        const cap = rollosPorLinea[clave];
                                        // Solo la mercadería con muestrario se
                                        // maneja rollo por rollo.
                                        const porRollos = (l.colores?.length ?? 0) > 0;
                                        const leidos = leerMetrajes(cap?.metrajes);
                                        const setCap = (campo, valor) =>
                                            setRollosPorLinea((prev) => ({
                                                ...prev,
                                                [clave]: { ...(prev[clave] ?? {}), [campo]: valor },
                                            }));

                                        return (
                                            <Fragment key={clave}>
                                                <tr>
                                                    <td className="px-3 py-2 text-warm-500">{l.codigo ?? '—'}</td>
                                                    <td className="px-3 py-2 font-semibold text-warm-900">
                                                        {l.producto}
                                                        {porRollos && (
                                                            <button
                                                                type="button"
                                                                onClick={() => setCap('abierto', !cap?.abierto)}
                                                                className="ml-2 rounded-md px-1.5 py-0.5 text-xs font-medium text-primary-600 transition hover:bg-primary-50"
                                                            >
                                                                {cap?.abierto ? 'Ocultar rollos' : 'Capturar rollos'}
                                                            </button>
                                                        )}
                                                    </td>
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
                                                            value={cantidades[clave] ?? ''}
                                                            onChange={(e) =>
                                                                setCantidades((prev) => ({
                                                                    ...prev,
                                                                    [clave]: e.target.value,
                                                                }))
                                                            }
                                                            // Con rollos capturados la manda el detalle:
                                                            // la cantidad sale de la suma de sus metros.
                                                            disabled={leidos.length > 0}
                                                            aria-label={`Cantidad recibida de ${l.producto}`}
                                                            className="text-right"
                                                        />
                                                    </td>
                                                </tr>

                                                {porRollos && cap?.abierto && (
                                                    <tr className="bg-gray-50">
                                                        <td colSpan={7} className="px-3 py-3">
                                                            <div className="grid gap-3 sm:grid-cols-[14rem,10rem,1fr]">
                                                                <Select
                                                                    label="Color"
                                                                    value={cap?.color_id ?? ''}
                                                                    onChange={(e) => setCap('color_id', e.target.value)}
                                                                    options={[
                                                                        { value: '', label: 'Elegir color…' },
                                                                        ...l.colores.map((c) => ({
                                                                            value: String(c.id),
                                                                            label: c.codigo ? `${c.nombre} (${c.codigo})` : c.nombre,
                                                                        })),
                                                                    ]}
                                                                />
                                                                <Input
                                                                    label="Código del proveedor"
                                                                    placeholder="A103-3"
                                                                    value={cap?.codigo ?? ''}
                                                                    onChange={(e) => setCap('codigo', e.target.value)}
                                                                />
                                                                <div>
                                                                    <label className="mb-1 block text-sm font-medium text-warm-800">
                                                                        Metrajes del packing list
                                                                    </label>
                                                                    <textarea
                                                                        rows={4}
                                                                        value={cap?.metrajes ?? ''}
                                                                        onChange={(e) => setCap('metrajes', e.target.value)}
                                                                        placeholder={'Pega aquí el packing list, un rollo por línea:\n58   26.5\n58   26.6\n64   28.3'}
                                                                        className="w-full rounded-md border border-edge px-3 py-2 font-mono text-sm shadow-sm outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                                                                    />
                                                                    <p className="mt-1 text-xs text-warm-500">
                                                                        Un rollo por línea. Si pones dos números, el
                                                                        segundo es el peso en kilos.
                                                                    </p>
                                                                </div>
                                                            </div>

                                                            {leidos.length > 0 && (
                                                                <p className="mt-2 text-sm text-primary-700">
                                                                    Se crearán <strong>{leidos.length} rollos</strong> con{' '}
                                                                    <strong>
                                                                        {num(leidos.reduce((a, r) => a + r.metros, 0))} m
                                                                    </strong>
                                                                    {leidos.some((r) => r.peso_kg) && (
                                                                        <>
                                                                            {' y '}
                                                                            <strong>
                                                                                {num(
                                                                                    leidos.reduce(
                                                                                        (a, r) => a + (r.peso_kg || 0),
                                                                                        0,
                                                                                    ),
                                                                                )}{' '}
                                                                                kg
                                                                            </strong>
                                                                        </>
                                                                    )}
                                                                    .
                                                                </p>
                                                            )}
                                                        </td>
                                                    </tr>
                                                )}
                                            </Fragment>
                                        );
                                    })}
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
