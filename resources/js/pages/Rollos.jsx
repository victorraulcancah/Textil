import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Layers,
    MapPin,
    Package,
    Printer,
    Ruler,
    Tag,
} from 'lucide-react';
import api, { asList } from '../lib/api';
import { useToast } from '../lib/toast';
import Layout from '../components/Layout';
import PageHeader, { CreateButton } from '../components/PageHeader';
import PdfViewerModal from '../components/PdfViewerModal';
import BottomSheet, { useSheet } from '../components/ui/BottomSheet';
import DetalleCard from '../components/ui/DetalleCard';
import { Alert, Badge, Button, DataTable, Input, Modal, Select, Spinner } from '../components/ui';

const num = (n) => new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 }).format(Number(n) || 0);
const money = (n) =>
    new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(Number(n) || 0);

/** Color del badge según el estado del rollo. */
const COLOR_ESTADO = {
    disponible: 'green',
    separado: 'amber',
    en_preparacion: 'blue',
    despachado: 'blue',
    vendido: 'gray',
    agotado: 'red',
};

const ESTADOS = [
    { value: '', label: 'Todos los estados' },
    { value: 'disponible', label: 'Disponible' },
    { value: 'separado', label: 'Separado' },
    { value: 'en_preparacion', label: 'En preparación' },
    { value: 'despachado', label: 'Despachado' },
    { value: 'vendido', label: 'Vendido' },
    { value: 'agotado', label: 'Agotado' },
];

/**
 * Stock de rollos, en dos niveles: el resumen por color arriba y, al elegir
 * uno, sus rollos concretos abajo. Es el recorrido que pide el cliente —
 * "¿cuántos metros de negro tengo?" y enseguida "¿cuáles son esos rollos?".
 */
export default function Rollos() {
    const toast = useToast();

    const [resumen, setResumen] = useState([]);
    const [totales, setTotales] = useState({ rollos: 0, metros: 0, valor: 0 });
    const [almacenes, setAlmacenes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    /** Color elegido: de él cuelga la tabla de rollos. */
    const [seleccion, setSeleccion] = useState(null);
    const [rollos, setRollos] = useState([]);
    const [cargandoRollos, setCargandoRollos] = useState(false);
    const sheet = useSheet();

    const [almacenId, setAlmacenId] = useState('');
    const [estado, setEstado] = useState('');
    const [metrosDesde, setMetrosDesde] = useState('');
    const [metrosHasta, setMetrosHasta] = useState('');

    const [pdf, setPdf] = useState(null);
    const [ingresoAbierto, setIngresoAbierto] = useState(false);

    /* ------------------------------ carga ------------------------------ */

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [resumenRes, almacenesRes] = await Promise.all([
                api.get('/rollos/resumen', { params: almacenId ? { almacen_id: almacenId } : {} }),
                api.get('/almacenes'),
            ]);
            const filas = resumenRes.data?.resumen ?? [];
            setResumen(filas);
            setTotales(resumenRes.data?.totales ?? { rollos: 0, metros: 0, valor: 0 });
            setAlmacenes(asList(almacenesRes));
            setSeleccion((prev) =>
                filas.find((f) => claveColor(f) === (prev && claveColor(prev))) ?? filas[0] ?? null,
            );
        } catch {
            setError('No se pudieron cargar los rollos.');
        } finally {
            setLoading(false);
        }
    }, [almacenId]);

    useEffect(() => {
        load();
    }, [load]);

    /** Los rollos del color elegido, con los filtros aplicados. */
    const cargarRollos = useCallback(async () => {
        if (!seleccion) {
            setRollos([]);
            return;
        }
        setCargandoRollos(true);
        try {
            const { data } = await api.get('/rollos', {
                params: {
                    producto_id: seleccion.producto_id,
                    producto_color_id: seleccion.producto_color_id,
                    almacen_id: almacenId || undefined,
                    estado: estado || undefined,
                    metros_desde: metrosDesde || undefined,
                    metros_hasta: metrosHasta || undefined,
                },
            });
            setRollos(asList({ data }));
        } catch {
            toast.error('No se pudieron cargar los rollos de este color.');
        } finally {
            setCargandoRollos(false);
        }
    }, [seleccion, almacenId, estado, metrosDesde, metrosHasta, toast]);

    useEffect(() => {
        cargarRollos();
    }, [cargarRollos]);

    /* ------------------------------ tablas ------------------------------ */

    const columnasResumen = [
        {
            key: 'producto',
            label: 'Tela',
            render: (row) => (
                <span className="inline-flex items-center gap-2 font-medium text-warm-900">
                    <Package className="h-4 w-4 shrink-0 text-primary-600" />
                    <span className="truncate">{row.producto}</span>
                </span>
            ),
        },
        { key: 'producto_codigo', label: 'Código' },
        {
            key: 'color',
            label: 'Color',
            render: (row) => (
                <span className="inline-flex items-center gap-2">
                    <span
                        className="h-3.5 w-3.5 shrink-0 rounded-full border border-edge"
                        style={{ background: row.color_hex || '#e5e7eb' }}
                    />
                    {row.color ?? '—'}
                    {row.color_codigo && <span className="text-xs text-warm-400">({row.color_codigo})</span>}
                </span>
            ),
        },
        {
            key: 'rollos',
            label: 'Rollos',
            align: 'right',
            searchable: false,
            render: (row) => <span className="font-medium">{row.rollos}</span>,
        },
        {
            key: 'metros',
            label: 'Metros',
            align: 'right',
            searchable: false,
            render: (row) => <span className="font-medium text-warm-900">{num(row.metros)} m</span>,
        },
        {
            key: 'disponible',
            label: 'Disponibles',
            align: 'right',
            searchable: false,
            render: (row) => {
                const d = row.por_estado?.disponible;
                if (!d) return <Badge variant="red">Sin stock libre</Badge>;
                return (
                    <span className="text-warm-600">
                        {d.rollos} rollos · {num(d.metros)} m
                    </span>
                );
            },
        },
        {
            key: 'valor',
            label: 'Valor',
            align: 'right',
            searchable: false,
            render: (row) => money(row.valor),
        },
    ];

    const columnasRollos = [
        {
            key: 'codigo',
            label: 'Rollo',
            render: (row) => (
                <span className="inline-flex items-center gap-2 font-medium text-warm-900">
                    <Tag className="h-3.5 w-3.5 shrink-0 text-primary-600" />
                    {row.codigo}
                </span>
            ),
        },
        {
            key: 'metros_actual',
            label: 'Metros',
            align: 'right',
            searchable: false,
            render: (row) => (
                <span>
                    <span className="font-medium text-warm-900">{num(row.metros_actual)} m</span>
                    {row.metros_actual !== row.metros_inicial && (
                        <span className="ml-1 text-xs text-warm-400">de {num(row.metros_inicial)}</span>
                    )}
                </span>
            ),
        },
        {
            key: 'peso_kg',
            label: 'Peso',
            align: 'right',
            searchable: false,
            render: (row) => (row.peso_kg ? `${num(row.peso_kg)} kg` : '—'),
        },
        {
            key: 'estado',
            label: 'Estado',
            render: (row) => (
                <Badge variant={COLOR_ESTADO[row.estado] ?? 'gray'}>{row.estado_label}</Badge>
            ),
        },
        {
            key: 'ubicacion',
            label: 'Ubicación',
            render: (row) => (
                <span className="inline-flex items-center gap-1.5 text-warm-600">
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-warm-400" />
                    <span className="truncate">{row.ubicacion}</span>
                </span>
            ),
        },
        {
            type: 'actions',
            key: 'actions',
            label: 'Acciones',
            actions: (row) => (
                <button
                    aria-label="Etiqueta"
                    title="Imprimir la etiqueta de este rollo"
                    onClick={() => setPdf({ url: `/pdf/etiqueta-rollo/${row.id}?formato=etiqueta`, titulo: `Etiqueta ${row.codigo}` })}
                    className="rounded-md p-1.5 text-primary-600 transition hover:bg-primary-50 hover:text-primary-700"
                >
                    <Printer className="h-4 w-4" />
                </button>
            ),
        },
    ];

    const filtrosRollos = (
        <div className="flex flex-wrap items-end gap-3">
            <Select
                label="Estado"
                value={estado}
                onChange={(e) => setEstado(e.target.value)}
                options={ESTADOS}
                className="w-44"
            />
            <Input
                label="Metros desde"
                type="number"
                value={metrosDesde}
                onChange={(e) => setMetrosDesde(e.target.value)}
                placeholder="50"
                className="w-28"
            />
            <Input
                label="Metros hasta"
                type="number"
                value={metrosHasta}
                onChange={(e) => setMetrosHasta(e.target.value)}
                placeholder="70"
                className="w-28"
            />
            {(estado || metrosDesde || metrosHasta) && (
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                        setEstado('');
                        setMetrosDesde('');
                        setMetrosHasta('');
                    }}
                >
                    Limpiar
                </Button>
            )}
        </div>
    );

    const filtrosActivos = [estado, metrosDesde, metrosHasta].filter(Boolean).length;

    return (
        <Layout>
            <PageHeader
                title="Rollos"
                description="Cada rollo con su metraje, su estado y dónde está"
                actions={
                    <div className="flex flex-wrap items-center gap-2">
                        {seleccion && (
                            <Button
                                variant="secondary"
                                onClick={() =>
                                    setPdf({
                                        url: `/rollos/etiquetas?producto_id=${seleccion.producto_id}&producto_color_id=${seleccion.producto_color_id}`,
                                        titulo: `Etiquetas · ${seleccion.color}`,
                                    })
                                }
                            >
                                <Printer className="h-4 w-4" />
                                Etiquetas del color
                            </Button>
                        )}
                        <CreateButton onClick={() => setIngresoAbierto(true)}>Ingresar rollos</CreateButton>
                    </div>
                }
            />

            {error && <Alert variant="error" className="mb-4">{error}</Alert>}

            {/* Lo primero que quiere ver la gerencia al abrir el sistema */}
            <div className="mb-4 grid gap-3 sm:grid-cols-3">
                <Tarjeta icono={Layers} titulo="Rollos" valor={totales.rollos} />
                <Tarjeta icono={Ruler} titulo="Metros" valor={`${num(totales.metros)} m`} />
                <Tarjeta icono={Package} titulo="Valor del inventario" valor={money(totales.valor)} />
            </div>

            <div className="mb-3 flex flex-wrap items-end gap-3">
                <Select
                    label="Almacén"
                    value={almacenId}
                    onChange={(e) => setAlmacenId(e.target.value)}
                    options={[
                        { value: '', label: 'Todos los almacenes' },
                        ...almacenes.map((a) => ({ value: String(a.id), label: a.nombre })),
                    ]}
                    className="w-56"
                />
            </div>

            <DataTable
                columns={columnasResumen}
                rows={resumen}
                loading={loading}
                searchPlaceholder="Buscar tela o color..."
                onRowClick={(row) => {
                    setSeleccion(row);
                    sheet.abrir();
                }}
                rowClassName={(row) =>
                    seleccion && claveColor(row) === claveColor(seleccion)
                        ? 'bg-primary-50/60'
                        : ''
                }
            />

            {/* Nivel 2: los rollos del color elegido */}
            <div className="mt-6 hidden md:block">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold text-warm-900">
                        {seleccion ? (
                            <>
                                Rollos de {seleccion.color}
                                <span className="ml-2 font-normal text-warm-500">
                                    {rollos.length} rollos · {num(rollos.reduce((s, r) => s + Number(r.metros_actual || 0), 0))} m
                                </span>
                            </>
                        ) : (
                            'Elige un color para ver sus rollos'
                        )}
                    </h2>
                </div>

                <DataTable
                    columns={columnasRollos}
                    rows={rollos}
                    loading={cargandoRollos}
                    searchPlaceholder="Buscar por código de rollo..."
                    filterable
                    filters={filtrosRollos}
                    filterCount={filtrosActivos}
                    dense
                />
            </div>

            {/* En móvil el detalle se abre desde abajo */}
            <BottomSheet
                open={sheet.abierto}
                onClose={sheet.cerrar}
                title={seleccion ? `Rollos de ${seleccion.color}` : 'Rollos'}
                subtitle={
                    seleccion
                        ? `${rollos.length} rollos · ${num(rollos.reduce((s, r) => s + Number(r.metros_actual || 0), 0))} m`
                        : null
                }
            >
                {cargandoRollos ? (
                    <div className="flex justify-center py-10">
                        <Spinner className="text-primary-600" />
                    </div>
                ) : (
                    <div className="space-y-3">
                        {rollos.map((r) => (
                            <DetalleCard
                                key={r.id}
                                titulo={r.codigo}
                                subtitulo={r.estado_label}
                                campos={[
                                    { label: 'Metros', value: `${num(r.metros_actual)} m` },
                                    { label: 'Peso', value: r.peso_kg ? `${num(r.peso_kg)} kg` : '—' },
                                    { label: 'Ubicación', value: r.ubicacion },
                                ]}
                                columnas={3}
                            />
                        ))}
                        {!rollos.length && (
                            <p className="py-8 text-center text-sm text-warm-400">
                                No hay rollos con esos filtros.
                            </p>
                        )}
                    </div>
                )}
            </BottomSheet>

            <IngresoRollosModal
                open={ingresoAbierto}
                onClose={() => setIngresoAbierto(false)}
                almacenes={almacenes}
                onCreado={(mensaje) => {
                    toast.success(mensaje);
                    setIngresoAbierto(false);
                    load();
                }}
            />

            <PdfViewerModal
                open={Boolean(pdf)}
                onClose={() => setPdf(null)}
                url={pdf?.url}
                titulo={pdf?.titulo}
                nombre={pdf?.titulo}
            />
        </Layout>
    );
}

const claveColor = (f) => `${f.producto_id}-${f.producto_color_id}`;

function Tarjeta({ icono: Icono, titulo, valor }) {
    return (
        <div className="flex items-center gap-3 rounded-lg border border-edge bg-white px-4 py-3 shadow-sm">
            <span className="rounded-md bg-primary-50 p-2 text-primary-600">
                <Icono className="h-5 w-5" />
            </span>
            <span className="min-w-0">
                <span className="block text-xs uppercase tracking-wide text-warm-500">{titulo}</span>
                <span className="block truncate text-lg font-semibold text-warm-900">{valor}</span>
            </span>
        </div>
    );
}

/**
 * Ingreso masivo: se pega la lista de metrajes del packing list y el sistema
 * crea los rollos numerados. Es como llega la mercadería de la importación.
 */
function IngresoRollosModal({ open, onClose, almacenes, onCreado }) {
    const toast = useToast();
    const [productos, setProductos] = useState([]);
    const [colores, setColores] = useState([]);
    const [guardando, setGuardando] = useState(false);
    const [errores, setErrores] = useState({});
    const [form, setForm] = useState({
        producto_id: '',
        producto_color_id: '',
        almacen_id: '',
        codigo_proveedor: '',
        costo_unitario: '',
        metrajes: '',
    });

    useEffect(() => {
        if (!open) return;
        api.get('/productos').then((res) => setProductos(asList(res))).catch(() => {});
        setErrores({});
    }, [open]);

    // Los colores son los del muestrario de la tela elegida.
    useEffect(() => {
        if (!form.producto_id) {
            setColores([]);
            return;
        }
        api.get(`/productos/${form.producto_id}`)
            .then(({ data }) => setColores((data?.data ?? data)?.colores ?? []))
            .catch(() => setColores([]));
    }, [form.producto_id]);

    /** Cuántos rollos y cuántos metros saldrían de lo que se pegó. */
    const previa = useMemo(() => {
        const metros = String(form.metrajes)
            .split(/[^\d.,]+/)
            .map((t) => parseFloat(t.replace(',', '.')))
            .filter((m) => m > 0);

        return { rollos: metros.length, total: metros.reduce((a, b) => a + b, 0) };
    }, [form.metrajes]);

    const set = (campo) => (e) => {
        setForm((prev) => ({ ...prev, [campo]: e.target.value }));
        setErrores((prev) => ({ ...prev, [campo]: undefined }));
    };

    const guardar = async (e) => {
        e.preventDefault();
        setGuardando(true);
        setErrores({});
        try {
            const { data } = await api.post('/rollos/ingresar', {
                ...form,
                producto_color_id: form.producto_color_id || null,
                costo_unitario: form.costo_unitario || 0,
            });
            setForm((prev) => ({ ...prev, metrajes: '', codigo_proveedor: '' }));
            onCreado(data.message);
        } catch (err) {
            if (err.response?.status === 422) {
                const v = err.response.data?.errors ?? {};
                setErrores(Object.fromEntries(Object.entries(v).map(([k, m]) => [k, m[0]])));
            } else {
                toast.error(err.response?.data?.message ?? 'No se pudieron ingresar los rollos.');
            }
        } finally {
            setGuardando(false);
        }
    };

    return (
        <Modal
            open={open}
            onClose={onClose}
            title="Ingresar rollos"
            description="Pega los metrajes del packing list y el sistema crea un rollo por cada uno"
            size="lg"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>
                        Cancelar
                    </Button>
                    <Button type="submit" form="ingreso-rollos" loading={guardando} disabled={!previa.rollos}>
                        Crear {previa.rollos || ''} rollos
                    </Button>
                </>
            }
        >
            <form id="ingreso-rollos" onSubmit={guardar} className="space-y-4" noValidate>
                <div className="grid gap-4 sm:grid-cols-2">
                    <Select
                        label="Tela"
                        value={form.producto_id}
                        onChange={set('producto_id')}
                        error={errores.producto_id}
                        options={[
                            { value: '', label: 'Elige una tela…' },
                            ...productos.map((p) => ({ value: String(p.id), label: `${p.codigo} · ${p.nombre}` })),
                        ]}
                    />
                    <Select
                        label="Color"
                        value={form.producto_color_id}
                        onChange={set('producto_color_id')}
                        error={errores.producto_color_id}
                        options={[
                            { value: '', label: colores.length ? 'Elige un color…' : 'Sin colores registrados' },
                            ...colores.map((c) => ({
                                value: String(c.id),
                                label: c.codigo ? `${c.nombre} (${c.codigo})` : c.nombre,
                            })),
                        ]}
                    />
                    <Select
                        label="Almacén"
                        value={form.almacen_id}
                        onChange={set('almacen_id')}
                        error={errores.almacen_id}
                        options={[
                            { value: '', label: 'Elige un almacén…' },
                            ...almacenes.map((a) => ({ value: String(a.id), label: a.nombre })),
                        ]}
                    />
                    <Input
                        label="Código del proveedor"
                        placeholder="A103-01"
                        value={form.codigo_proveedor}
                        onChange={set('codigo_proveedor')}
                        error={errores.codigo_proveedor}
                    />
                    <Input
                        label="Costo por metro"
                        type="number"
                        step="0.0001"
                        placeholder="4.20"
                        value={form.costo_unitario}
                        onChange={set('costo_unitario')}
                        error={errores.costo_unitario}
                    />
                </div>

                <div>
                    <label className="mb-1 block text-sm font-medium text-warm-800">Metrajes</label>
                    <textarea
                        rows={4}
                        value={form.metrajes}
                        onChange={set('metrajes')}
                        placeholder="55 - 58 - 96 - 78 - 85 - 62 - 63 - 69 - 91 - 65"
                        className="w-full rounded-md border border-edge px-3 py-2 text-sm shadow-sm outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                    />
                    {errores.metrajes && <p className="mt-1 text-xs text-red-600">{errores.metrajes}</p>}
                    <p className="mt-1 text-xs text-warm-500">
                        Pega la lista tal como venga: da igual si separa con guiones, comas o espacios.
                    </p>
                </div>

                {previa.rollos > 0 && (
                    <Alert variant="info">
                        Se crearán <strong>{previa.rollos} rollos</strong> con{' '}
                        <strong>{num(previa.total)} m</strong> en total.
                    </Alert>
                )}
            </form>
        </Modal>
    );
}
