import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    ChevronRight,
    FileSpreadsheet,
    Layers,
    MapPin,
    Package,
    Printer,
    Ruler,
    Ship,
    Tag,
} from 'lucide-react';
import api, { asList } from '../lib/api';
import { useToast } from '../lib/toast';
import Layout from '../components/Layout';
import PageHeader from '../components/PageHeader';
import PdfViewerModal from '../components/PdfViewerModal';
import { Alert, Badge, Button, DataTable, Input, Modal, SearchSelect, Select } from '../components/ui';

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
    const navigate = useNavigate();

    const [resumen, setResumen] = useState([]);
    const [almacenes, setAlmacenes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    /** El tipo de tela elegido (su clave): la pantalla abre solo con los tipos y al elegir uno baja a sus telas y colores. */
    const [tipoSel, setTipoSel] = useState(null);

    /** Color elegido: de él cuelga la tabla de rollos. */
    const [seleccion, setSeleccion] = useState(null);
    const [rollos, setRollos] = useState([]);
    const [cargandoRollos, setCargandoRollos] = useState(false);

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
            setAlmacenes(asList(almacenesRes));
            setSeleccion((prev) =>
                filas.find((f) => claveColor(f) === (prev && claveColor(prev))) ?? null,
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

    /** Los tipos de tela con su stock: lo primero que se ve. Salen de las filas del resumen. */
    const tipos = useMemo(() => {
        const grupos = new Map();
        resumen.forEach((f) => {
            const clave = claveTipo(f);
            const g = grupos.get(clave) ?? {
                clave,
                nombre: f.tipo_tela ?? 'Sin tipo de tela',
                familia: f.familia ?? null,
                telas: new Set(),
                nombres: new Set(),
                rollos: 0,
                metros: 0,
                valor: 0,
            };
            g.telas.add(f.producto_id);
            if (f.producto) g.nombres.add(f.producto);
            g.rollos += Number(f.rollos) || 0;
            g.metros += Number(f.metros) || 0;
            g.valor += Number(f.valor) || 0;
            grupos.set(clave, g);
        });
        return [...grupos.values()]
            .map((g) => ({ ...g, telas: g.telas.size, nombres: [...g.nombres].sort().join(', ') }))
            .sort((a, b) => a.nombre.localeCompare(b.nombre));
    }, [resumen]);

    const tipoActual = tipos.find((t) => t.clave === tipoSel) ?? null;
    const cerrarTipo = () => {
        setTipoSel(null);
        setSeleccion(null);
    };
    const filasTipo = useMemo(() => resumen.filter((f) => claveTipo(f) === tipoSel), [resumen, tipoSel]);

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

    const columnasTipos = [
        {
            key: 'nombre',
            label: 'Tipo de tela',
            render: (row) => (
                <span className="inline-flex items-center gap-2 font-medium text-warm-900">
                    <Layers className="h-4 w-4 shrink-0 text-primary-600" />
                    <span className="truncate">{row.nombre}</span>
                    {row.familia && <span className="text-xs font-normal text-warm-400">{row.familia}</span>}
                </span>
            ),
        },
        {
            key: 'nombres',
            label: 'Nombre comercial',
            render: (row) => <span className="text-warm-800">{row.nombres || '—'}</span>,
        },
        { key: 'telas', label: 'Telas', align: 'right', searchable: false, render: (row) => row.telas },
        { key: 'rollos', label: 'Rollos', align: 'right', searchable: false, render: (row) => <span className="font-medium">{row.rollos}</span> },
        { key: 'metros', label: 'Metros', align: 'right', searchable: false, render: (row) => <span className="font-medium text-warm-900">{num(row.metros)} m</span> },
        { key: 'valor', label: 'Valor', align: 'right', searchable: false, render: (row) => money(row.valor) },
        { key: 'ir', label: '', searchable: false, render: () => <ChevronRight className="h-4 w-4 text-warm-400" /> },
    ];

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
        {
            key: 'codigo_completo',
            label: 'Código',
            render: (row) => <span className="font-mono text-xs">{row.codigo_completo}</span>,
        },
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
                    {/* El corte ya está preparado pero el pedido no salió: el
                        rollo baja recién al despacharlo. */}
                    {row.corte_preparado && (
                        <span className="block text-xs text-amber-700">
                            Corte preparado de {num(row.corte_preparado.metros)} m
                            {row.corte_preparado.pedidos?.length ? ` (${row.corte_preparado.pedidos.join(', ')})` : ''}
                            {' · '}quedan {num(row.corte_preparado.saldo)} m
                        </span>
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
            key: 'importacion',
            label: 'Importación',
            render: (row) =>
                row.importacion ? (
                    <span className="inline-flex items-center gap-1.5 text-warm-600">
                        <Ship className="h-3.5 w-3.5 shrink-0 text-warm-400" />
                        <span className="truncate">{row.importacion.codigo}</span>
                    </span>
                ) : (
                    <span className="text-warm-400">—</span>
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

    const filtroAlmacen = (
        <div className="mb-3 flex flex-wrap items-end gap-3">
            <SearchSelect
                label="Almacén"
                value={almacenId}
                onChange={(v) => setAlmacenId(v ?? '')}
                placeholder="Todos los almacenes"
                emptyText="Sin coincidencias"
                options={almacenes.map((a) => ({ value: String(a.id), label: a.nombre }))}
                className="w-56"
            />
        </div>
    );

    return (
        <Layout>
            <PageHeader
                title="Stock por rollo"
                description="Cada rollo con su metraje, su estado y dónde está"
                actions={
                    <Button variant="secondary" onClick={() => navigate('/stock-rollos/reporte')}>
                        <FileSpreadsheet className="h-4 w-4" />
                        Reporte
                    </Button>
                }
            />

            {error && <Alert variant="error" className="mb-4">{error}</Alert>}

            {/* Primer nivel: solo los tipos de tela, con su stock. Doble clic abre sus colores y rollos. */}
            {filtroAlmacen}
            <DataTable
                columns={columnasTipos}
                rows={tipos}
                loading={loading}
                searchPlaceholder="Buscar tipo de tela..."
                onRowDoubleClick={(row) => setTipoSel(row.clave)}
            />
            <p className="mt-2 text-xs text-warm-400">Doble clic en un tipo de tela para ver sus colores y rollos.</p>

            {/* Segundo nivel: los colores del tipo de tela. Doble clic en un color abre sus rollos. */}
            <Modal
                open={Boolean(tipoActual)}
                onClose={cerrarTipo}
                title={tipoActual?.nombre ?? ''}
                description={tipoActual?.familia ?? undefined}
                size="full"
            >
                {tipoActual && (
                    <>
                        <div className="mb-4 grid gap-3 sm:grid-cols-3">
                            <Tarjeta icono={Layers} titulo="Rollos" valor={tipoActual.rollos} />
                            <Tarjeta icono={Ruler} titulo="Metros" valor={`${num(tipoActual.metros)} m`} />
                            <Tarjeta icono={Package} titulo="Valor del inventario" valor={money(tipoActual.valor)} />
                        </div>

                        <DataTable
                            columns={columnasResumen}
                            rows={filasTipo}
                            loading={loading}
                            searchPlaceholder="Buscar tela o color..."
                            onRowDoubleClick={(row) => setSeleccion(row)}
                        />
                        <p className="mt-2 text-xs text-warm-400">Doble clic en un color para ver sus rollos.</p>
                    </>
                )}
            </Modal>

            {/* Tercer nivel: los rollos del color elegido. */}
            <Modal
                open={Boolean(tipoActual && seleccion)}
                onClose={() => setSeleccion(null)}
                title={seleccion ? `Rollos de ${seleccion.color ?? seleccion.producto}` : ''}
                description={
                    seleccion
                        ? `${rollos.length} rollos · ${num(rollos.reduce((t, r) => t + Number(r.metros_actual || 0), 0))} m`
                        : undefined
                }
                size="full"
                footer={
                    seleccion ? (
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
                    ) : null
                }
            >
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
            </Modal>

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
const claveTipo = (f) => String(f.tipo_tela_id ?? 'sin');

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
