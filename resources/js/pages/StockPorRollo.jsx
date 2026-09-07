import { useCallback, useEffect, useState } from 'react';
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
import PageHeader from '../components/PageHeader';
import PdfViewerModal from '../components/PdfViewerModal';
import BottomSheet, { useSheet } from '../components/ui/BottomSheet';
import DetalleCard from '../components/ui/DetalleCard';
import { Alert, Badge, Button, DataTable, Input, Select, Spinner } from '../components/ui';

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
 *
 * Es una pantalla de consulta: no crea rollos. La mercadería entra por la
 * recepción de compra, que es donde llega el contenedor y donde el rollo queda
 * amarrado a su importación y a su costo.
 */
export default function StockPorRollo() {
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
                title="Stock por rollo"
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
