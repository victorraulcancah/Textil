import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, Save, Search, Trash2, X } from 'lucide-react';
import api, { asList } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import Layout from '../components/Layout';
import PageHeader from '../components/PageHeader';
import { Alert, Badge, Button, DataTable, Input, Modal, Select, Spinner } from '../components/ui';

const num = (n) => new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 }).format(Number(n) || 0);
const money = (n) =>
    new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(Number(n) || 0);

/**
 * Alta y edición del pedido.
 *
 * Se arma eligiendo rollos concretos, no cantidades: el cliente compra "los
 * rollos 001 al 005 del negro", y por eso el almacenero sabe después cuáles
 * bajar del rack.
 *
 * Solo se puede editar mientras el pedido es borrador; después ya hay rollos
 * comprometidos y el almacén trabajando sobre ellos.
 */
export default function CrearPedido() {
    const { id } = useParams();
    const navigate = useNavigate();
    const toast = useToast();
    const { user: usuario } = useAuth();

    const [clientes, setClientes] = useState([]);
    const [almacenes, setAlmacenes] = useState([]);
    const [cargando, setCargando] = useState(true);
    const [guardando, setGuardando] = useState(false);
    const [errores, setErrores] = useState({});

    const [cabecera, setCabecera] = useState({
        cliente_id: '',
        almacen_id: '',
        fecha_emision: new Date().toISOString().slice(0, 10),
        fecha_entrega: '',
        observaciones: '',
    });

    /** Líneas del pedido: un rollo cada una. */
    const [lineas, setLineas] = useState([]);
    const [pickerAbierto, setPickerAbierto] = useState(false);

    /* ------------------------------ carga ------------------------------ */

    useEffect(() => {
        (async () => {
            try {
                const [clientesRes, almacenesRes] = await Promise.all([
                    api.get('/clientes'),
                    api.get('/almacenes'),
                ]);
                setClientes(asList(clientesRes));
                const alms = asList(almacenesRes);
                setAlmacenes(alms);

                if (id) {
                    const { data } = await api.get(`/ordenes-venta/${id}`);
                    const p = data?.data ?? data;
                    if (!p.editable) {
                        toast.error('Este pedido ya no es editable.');
                        navigate('/pedidos');
                        return;
                    }
                    setCabecera({
                        cliente_id: p.cliente_id ? String(p.cliente_id) : '',
                        almacen_id: String(p.almacen_id),
                        fecha_emision: p.fecha_emision,
                        fecha_entrega: p.fecha_entrega ?? '',
                        observaciones: p.observaciones ?? '',
                    });
                    setLineas(
                        (p.detalles ?? []).map((d) => ({
                            rollo_id: d.rollo_id,
                            codigo: d.rollo?.codigo,
                            color: d.rollo?.color?.nombre,
                            producto_id: d.rollo?.producto_id,
                            disponible: Number(d.rollo?.metros_actual ?? 0),
                            producto_presentacion_id: d.producto_presentacion_id
                                ? String(d.producto_presentacion_id)
                                : '',
                            metros: String(d.metros),
                            precio_unitario: String(d.precio_unitario),
                            presentaciones: [],
                        })),
                    );
                } else if (alms.length === 1) {
                    setCabecera((prev) => ({ ...prev, almacen_id: String(alms[0].id) }));
                }
            } catch {
                toast.error('No se pudieron cargar los datos del pedido.');
            } finally {
                setCargando(false);
            }
        })();
    }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

    /** Las presentaciones de venta de cada tela, para el select de la línea. */
    const cargarPresentaciones = useCallback(async (productoId) => {
        const { data } = await api.get(`/productos/${productoId}/presentaciones`);
        return asList({ data }).filter((p) => p.activo !== false);
    }, []);

    // Se completan las presentaciones de las líneas que aún no las tienen.
    useEffect(() => {
        const pendientes = [...new Set(
            lineas.filter((l) => !l.presentaciones?.length && l.producto_id).map((l) => l.producto_id),
        )];
        if (!pendientes.length) return;

        Promise.all(pendientes.map((pid) => cargarPresentaciones(pid).then((ps) => [pid, ps])))
            .then((pares) => {
                const mapa = Object.fromEntries(pares);
                setLineas((prev) =>
                    prev.map((l) =>
                        mapa[l.producto_id]
                            ? {
                                  ...l,
                                  presentaciones: mapa[l.producto_id],
                                  // Por defecto se vende al metro, que es lo habitual.
                                  producto_presentacion_id:
                                      l.producto_presentacion_id ||
                                      String(
                                          mapa[l.producto_id].find((p) =>
                                              (p.unidad_base?.abreviatura ?? '').toLowerCase() === 'm',
                                          )?.id ?? mapa[l.producto_id][0]?.id ?? '',
                                      ),
                              }
                            : l,
                    ),
                );
            })
            .catch(() => {});
    }, [lineas, cargarPresentaciones]);

    /* ------------------------------ líneas ------------------------------ */

    const agregarRollos = (rollos) => {
        setLineas((prev) => {
            const yaEstan = new Set(prev.map((l) => l.rollo_id));
            const nuevas = rollos
                .filter((r) => !yaEstan.has(r.id))
                .map((r) => ({
                    rollo_id: r.id,
                    codigo: r.codigo,
                    color: r.color?.nombre,
                    producto_id: r.producto_id,
                    disponible: Number(r.metros_actual),
                    producto_presentacion_id: '',
                    // Por defecto se lleva el rollo entero.
                    metros: String(r.metros_actual),
                    precio_unitario: '',
                    presentaciones: [],
                }));
            return [...prev, ...nuevas];
        });
        setPickerAbierto(false);
    };

    const cambiar = (i, campo, valor) =>
        setLineas((prev) => prev.map((l, j) => (j === i ? { ...l, [campo]: valor } : l)));

    const quitar = (i) => setLineas((prev) => prev.filter((_, j) => j !== i));

    const totales = useMemo(() => {
        const metros = lineas.reduce((s, l) => s + (Number(l.metros) || 0), 0);
        const total = lineas.reduce(
            (s, l) => s + (Number(l.metros) || 0) * (Number(l.precio_unitario) || 0),
            0,
        );
        return { rollos: lineas.length, metros, total };
    }, [lineas]);

    /* ------------------------------ guardar ------------------------------ */

    const guardar = async () => {
        setGuardando(true);
        setErrores({});
        try {
            const cuerpo = {
                ...cabecera,
                cliente_id: cabecera.cliente_id || null,
                fecha_entrega: cabecera.fecha_entrega || null,
                vendedor_id: usuario?.id,
                detalles: lineas.map((l) => ({
                    rollo_id: l.rollo_id,
                    producto_presentacion_id: l.producto_presentacion_id || null,
                    metros: Number(l.metros) || 0,
                    precio_unitario: Number(l.precio_unitario) || 0,
                })),
            };

            if (id) {
                await api.put(`/ordenes-venta/${id}`, cuerpo);
                toast.success('Pedido actualizado.');
            } else {
                await api.post('/ordenes-venta', cuerpo);
                toast.success('Pedido creado. Envíalo al almacén para reservar los rollos.');
            }
            navigate('/pedidos');
        } catch (err) {
            if (err.response?.status === 422) {
                const v = err.response.data?.errors ?? {};
                setErrores(v);
                const primero = Object.values(v)[0]?.[0];
                if (primero) toast.error(primero);
            } else {
                toast.error(err.response?.data?.message ?? 'No se pudo guardar el pedido.');
            }
        } finally {
            setGuardando(false);
        }
    };

    if (cargando) {
        return (
            <Layout>
                <div className="flex justify-center py-24">
                    <Spinner size="lg" className="text-primary-600" />
                </div>
            </Layout>
        );
    }

    return (
        <Layout>
            <PageHeader
                title={id ? 'Editar pedido' : 'Nuevo pedido'}
                description="Elige los rollos que se lleva el cliente; el stock no se mueve todavía"
                actions={
                    <div className="flex items-center gap-2">
                        <Button variant="secondary" onClick={() => navigate('/pedidos')}>
                            Cancelar
                        </Button>
                        <Button
                            loading={guardando}
                            disabled={!lineas.length || !cabecera.almacen_id}
                            onClick={guardar}
                        >
                            <Save className="h-4 w-4" />
                            {id ? 'Guardar cambios' : 'Crear pedido'}
                        </Button>
                    </div>
                }
            />

            <div className="mb-4 grid gap-4 rounded-lg border border-edge bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
                <Select
                    label="Cliente"
                    value={cabecera.cliente_id}
                    onChange={(e) => setCabecera((p) => ({ ...p, cliente_id: e.target.value }))}
                    options={[
                        { value: '', label: 'Cliente varios' },
                        ...clientes.map((c) => ({ value: String(c.id), label: c.nombre })),
                    ]}
                />
                <Select
                    label="Almacén"
                    value={cabecera.almacen_id}
                    onChange={(e) => setCabecera((p) => ({ ...p, almacen_id: e.target.value }))}
                    error={errores.almacen_id?.[0]}
                    options={[
                        { value: '', label: 'Elige un almacén…' },
                        ...almacenes.map((a) => ({ value: String(a.id), label: a.nombre })),
                    ]}
                />
                <Input
                    label="Fecha"
                    type="date"
                    value={cabecera.fecha_emision}
                    onChange={(e) => setCabecera((p) => ({ ...p, fecha_emision: e.target.value }))}
                    error={errores.fecha_emision?.[0]}
                />
                <Input
                    label="Entrega"
                    type="date"
                    value={cabecera.fecha_entrega}
                    onChange={(e) => setCabecera((p) => ({ ...p, fecha_entrega: e.target.value }))}
                    error={errores.fecha_entrega?.[0]}
                />
            </div>

            <div className="rounded-lg border border-edge bg-white shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-edge px-4 py-3">
                    <h2 className="text-sm font-semibold text-warm-900">
                        Rollos del pedido
                        <span className="ml-2 font-normal text-warm-500">
                            {totales.rollos} rollos · {num(totales.metros)} m
                        </span>
                    </h2>
                    <Button
                        size="sm"
                        disabled={!cabecera.almacen_id}
                        onClick={() => setPickerAbierto(true)}
                    >
                        <Plus className="h-4 w-4" />
                        Agregar rollos
                    </Button>
                </div>

                {!cabecera.almacen_id && (
                    <div className="px-4 py-3">
                        <Alert variant="info">
                            Elige primero el almacén: solo se pueden pedir rollos que estén ahí.
                        </Alert>
                    </div>
                )}

                {lineas.length === 0 ? (
                    <p className="px-4 py-12 text-center text-sm text-warm-400">
                        Todavía no hay rollos en este pedido.
                    </p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-edge text-left text-xs uppercase tracking-wide text-warm-500">
                                    <th className="px-4 py-2 font-medium">Rollo</th>
                                    <th className="px-4 py-2 font-medium">Color</th>
                                    <th className="px-4 py-2 font-medium">Se vende como</th>
                                    <th className="px-4 py-2 text-right font-medium">Metros</th>
                                    <th className="px-4 py-2 text-right font-medium">P. por metro</th>
                                    <th className="px-4 py-2 text-right font-medium">Importe</th>
                                    <th className="w-12" />
                                </tr>
                            </thead>
                            <tbody>
                                {lineas.map((l, i) => {
                                    const parcial = Number(l.metros) < l.disponible;
                                    const errorLinea =
                                        errores[`detalles.${i}.metros`]?.[0] ??
                                        errores[`detalles.${i}.rollo_id`]?.[0] ??
                                        errores[`detalles.${i}.producto_presentacion_id`]?.[0];

                                    return (
                                        <tr key={l.rollo_id} className="border-b border-gray-100 last:border-0">
                                            <td className="px-4 py-2">
                                                <span className="font-medium text-warm-900">{l.codigo}</span>
                                                <span className="ml-2 text-xs text-warm-400">
                                                    disp. {num(l.disponible)} m
                                                </span>
                                                {parcial && <Badge variant="amber" className="ml-2">Se corta</Badge>}
                                                {errorLinea && (
                                                    <p className="mt-0.5 text-xs text-red-600">{errorLinea}</p>
                                                )}
                                            </td>
                                            <td className="px-4 py-2 text-warm-600">{l.color ?? '—'}</td>
                                            <td className="px-4 py-2">
                                                <Select
                                                    value={l.producto_presentacion_id}
                                                    onChange={(e) => cambiar(i, 'producto_presentacion_id', e.target.value)}
                                                    options={[
                                                        { value: '', label: '—' },
                                                        ...(l.presentaciones ?? []).map((p) => ({
                                                            value: String(p.id),
                                                            label: p.nombre,
                                                        })),
                                                    ]}
                                                    className="w-44"
                                                />
                                            </td>
                                            <td className="px-4 py-2 text-right">
                                                <Input
                                                    type="number"
                                                    step="0.01"
                                                    max={l.disponible}
                                                    value={l.metros}
                                                    onChange={(e) => cambiar(i, 'metros', e.target.value)}
                                                    className="w-28 text-right"
                                                />
                                            </td>
                                            <td className="px-4 py-2 text-right">
                                                <Input
                                                    type="number"
                                                    step="0.01"
                                                    value={l.precio_unitario}
                                                    onChange={(e) => cambiar(i, 'precio_unitario', e.target.value)}
                                                    className="w-28 text-right"
                                                />
                                            </td>
                                            <td className="px-4 py-2 text-right font-medium">
                                                {money((Number(l.metros) || 0) * (Number(l.precio_unitario) || 0))}
                                            </td>
                                            <td className="px-2 py-2 text-right">
                                                <button
                                                    aria-label="Quitar"
                                                    onClick={() => quitar(i)}
                                                    className="rounded-md p-1.5 text-red-600 transition hover:bg-red-50"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                {lineas.length > 0 && (
                    <div className="flex flex-wrap items-center justify-end gap-6 border-t border-edge px-4 py-3">
                        <span className="text-sm text-warm-600">
                            {totales.rollos} rollos · <strong>{num(totales.metros)} m</strong>
                        </span>
                        <span className="text-base font-semibold text-warm-900">
                            Total: {money(totales.total)}
                        </span>
                    </div>
                )}
            </div>

            <PickerRollos
                open={pickerAbierto}
                onClose={() => setPickerAbierto(false)}
                almacenId={cabecera.almacen_id}
                yaElegidos={lineas.map((l) => l.rollo_id)}
                onAgregar={agregarRollos}
            />
        </Layout>
    );
}

/* ---------------------------------------------------------------------- */

/**
 * Selector de rollos disponibles, con la búsqueda por rango de metraje que
 * pide el cliente: "necesito un azul entre 50 y 70 metros".
 */
function PickerRollos({ open, onClose, almacenId, yaElegidos, onAgregar }) {
    const [rollos, setRollos] = useState([]);
    const [cargando, setCargando] = useState(false);
    const [marcados, setMarcados] = useState([]);
    const [desde, setDesde] = useState('');
    const [hasta, setHasta] = useState('');

    const buscar = useCallback(async () => {
        if (!open || !almacenId) return;
        setCargando(true);
        try {
            const { data } = await api.get('/rollos', {
                params: {
                    almacen_id: almacenId,
                    solo_disponibles: 1,
                    metros_desde: desde || undefined,
                    metros_hasta: hasta || undefined,
                },
            });
            setRollos(asList({ data }).filter((r) => !yaElegidos.includes(r.id)));
        } finally {
            setCargando(false);
        }
    }, [open, almacenId, desde, hasta, yaElegidos]);

    useEffect(() => {
        buscar();
    }, [buscar]);

    useEffect(() => {
        if (open) setMarcados([]);
    }, [open]);

    const alternar = (rollo) =>
        setMarcados((prev) =>
            prev.some((r) => r.id === rollo.id)
                ? prev.filter((r) => r.id !== rollo.id)
                : [...prev, rollo],
        );

    const columnas = [
        {
            key: 'marcado',
            label: '',
            searchable: false,
            render: (row) => (
                <input
                    type="checkbox"
                    checked={marcados.some((r) => r.id === row.id)}
                    onChange={() => alternar(row)}
                    // Sin esto el clic llega también a la fila y la marca se
                    // alterna dos veces, quedando como estaba.
                    onClick={(e) => e.stopPropagation()}
                    className="h-4 w-4 rounded border-gray-300 accent-primary-600"
                />
            ),
        },
        { key: 'codigo', label: 'Rollo' },
        { key: 'producto', label: 'Tela', render: (row) => row.producto?.nombre ?? '—' },
        { key: 'color', label: 'Color', render: (row) => row.color?.nombre ?? '—' },
        {
            key: 'metros_actual',
            label: 'Metros',
            align: 'right',
            searchable: false,
            render: (row) => `${num(row.metros_actual)} m`,
        },
        { key: 'ubicacion', label: 'Ubicación' },
    ];

    return (
        <Modal
            open={open}
            onClose={onClose}
            title="Agregar rollos al pedido"
            description="Solo aparecen los rollos disponibles de este almacén"
            size="xl"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>Cancelar</Button>
                    <Button disabled={!marcados.length} onClick={() => onAgregar(marcados)}>
                        Agregar {marcados.length || ''} rollos
                    </Button>
                </>
            }
        >
            <div className="space-y-3">
                <div className="flex flex-wrap items-end gap-3">
                    <Input
                        label="Metros desde"
                        type="number"
                        value={desde}
                        onChange={(e) => setDesde(e.target.value)}
                        placeholder="50"
                        className="w-32"
                    />
                    <Input
                        label="Metros hasta"
                        type="number"
                        value={hasta}
                        onChange={(e) => setHasta(e.target.value)}
                        placeholder="70"
                        className="w-32"
                    />
                    {(desde || hasta) && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                                setDesde('');
                                setHasta('');
                            }}
                        >
                            <X className="h-4 w-4" />
                            Limpiar
                        </Button>
                    )}
                    {marcados.length > 0 && (
                        <span className="ml-auto text-sm text-warm-600">
                            {marcados.length} rollos ·{' '}
                            <strong>{num(marcados.reduce((s, r) => s + Number(r.metros_actual), 0))} m</strong>
                        </span>
                    )}
                </div>

                <DataTable
                    columns={columnas}
                    rows={rollos}
                    loading={cargando}
                    searchPlaceholder="Buscar por código, tela o color..."
                    onRowClick={alternar}
                    dense
                />
            </div>
        </Modal>
    );
}
