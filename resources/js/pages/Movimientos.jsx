import { useCallback, useEffect, useState } from 'react';
import { ArrowDownLeft, ArrowRightLeft, ArrowUpRight, Package } from 'lucide-react';
import api, { asList } from '../lib/api';
import Layout from '../components/Layout';
import PageHeader from '../components/PageHeader';
import { Alert, Badge, Button, DataTable, DateRangePicker, Modal, SearchSelect, Select } from '../components/ui';

/** Fecha y hora en dos líneas: cabe en una columna estrecha sin desbordarse. */
const fmtFecha = (value) => {
    if (!value) return null;
    const d = new Date(value);
    return {
        dia: d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' }),
        hora: d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }),
    };
};

const tipoInfo = (tipo) => {
    if (tipo === 'entrada') return { label: 'Entrada', variant: 'green', icon: ArrowDownLeft };
    if (tipo === 'salida') return { label: 'Salida', variant: 'red', icon: ArrowUpRight };
    return { label: tipo ?? '—', variant: 'gray', icon: ArrowRightLeft };
};

const money = (n) =>
    new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(Number(n) || 0);

const num = (n) => Number(n ?? 0).toLocaleString('es-PE', { maximumFractionDigits: 2 });

const ORIGEN_LABEL = {
    recepcion: 'Recepción',
    recepcion_deshecha: 'Recepción deshecha',
    // Histórico: antes las recepciones se registraban con origen "compra".
    compra: 'Recepción',
    venta: 'Venta',
    nota_venta: 'Venta',
    edicion_nota_venta: 'Venta corregida',
    anulacion_nota_venta: 'Venta anulada',
    despacho_pedido: 'Despacho de pedido',
    anulacion_despacho: 'Despacho anulado',
    ingreso_rollos: 'Ingreso de rollos',
    devolucion: 'Devolución',
    merma: 'Merma',
    transferencia: 'Traslado',
    ajuste_manual: 'Ajuste',
    prestamo: 'Préstamo',
    toma_inventario: 'Toma inventario',
};

const DOC_LABEL = {
    recepcion_compra: 'Recepción',
    ajuste_inventario: 'Ajuste',
    transferencia: 'Traslado',
    prestamo: 'Préstamo',
    toma_inventario: 'Toma',
    nota_venta: 'Venta',
    orden_venta: 'Pedido',
};

export default function Movimientos() {
    const [movimientos, setMovimientos] = useState([]);
    const [almacenes, setAlmacenes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    /** Unidad elegida por fila para expresar la cantidad: { [id del movimiento]: nombre }. */
    const [unidadPorFila, setUnidadPorFila] = useState({});

    const [filterTipo, setFilterTipo] = useState('');
    const [filterAlmacen, setFilterAlmacen] = useState('');
    const [filterProducto, setFilterProducto] = useState('');
    const [filterProveedor, setFilterProveedor] = useState('');
    const [filterOrigen, setFilterOrigen] = useState('');
    const [filterDesde, setFilterDesde] = useState('');
    const [filterHasta, setFilterHasta] = useState('');
    const [activeFilters, setActiveFilters] = useState({});

    /** Producto cuyo historial completo se ve en el modal, o null si está cerrado. */
    const [productoModal, setProductoModal] = useState(null);
    /** Filtros propios del modal, detrás de su propio ícono de filtros. */
    const [modalFilterTipo, setModalFilterTipo] = useState('');
    const [modalFilterAlmacen, setModalFilterAlmacen] = useState('');
    const [modalFilterOrigen, setModalFilterOrigen] = useState('');
    const [modalFilterDesde, setModalFilterDesde] = useState('');
    const [modalFilterHasta, setModalFilterHasta] = useState('');
    const [modalActiveFilters, setModalActiveFilters] = useState({});

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [movRes, almRes] = await Promise.all([
                api.get('/movimientos'),
                api.get('/almacenes'),
            ]);
            setMovimientos(asList(movRes));
            setAlmacenes(asList(almRes));
        } catch {
            setError('No se pudieron cargar los movimientos.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const applyFilters = () => {
        const next = {};
        if (filterTipo) next.tipo = filterTipo;
        if (filterAlmacen) next.almacen = filterAlmacen;
        if (filterProducto) next.producto = filterProducto;
        if (filterProveedor) next.proveedor = filterProveedor;
        if (filterOrigen) next.origen = filterOrigen;
        if (filterDesde) next.desde = filterDesde;
        if (filterHasta) next.hasta = filterHasta;
        setActiveFilters(next);
    };

    const clearFilters = () => {
        setFilterTipo('');
        setFilterAlmacen('');
        setFilterProducto('');
        setFilterProveedor('');
        setFilterOrigen('');
        setFilterDesde('');
        setFilterHasta('');
        setActiveFilters({});
    };

    const filtered = movimientos.filter((m) => {
        if (activeFilters.tipo && m.tipo_movimiento !== activeFilters.tipo) return false;
        if (activeFilters.almacen) {
            const id = m.almacen_id ?? m.almacen?.id;
            if (String(id) !== activeFilters.almacen) return false;
        }
        if (activeFilters.producto && String(m.producto_id) !== String(activeFilters.producto)) return false;
        if (activeFilters.proveedor && m.proveedor_nombre !== activeFilters.proveedor) return false;
        if (activeFilters.origen && m.origen !== activeFilters.origen) return false;
        if (activeFilters.desde && (!m.fecha || m.fecha.slice(0, 10) < activeFilters.desde)) return false;
        if (activeFilters.hasta && (!m.fecha || m.fecha.slice(0, 10) > activeFilters.hasta)) return false;
        return true;
    });

    const filterCount = Object.keys(activeFilters).length;

    /**
     * Abre el historial completo de un producto. Nace con los filtros que ya
     * estén activos en la tabla principal (fecha, tipo, almacén, movimiento):
     * si venías viendo "desde el 1 de setiembre", el historial de este
     * producto también arranca ahí, no desde el principio de los tiempos.
     */
    const abrirHistorial = (row) => {
        if (!row.producto_id) return;
        setProductoModal({ id: row.producto_id, nombre: row.producto?.nombre ?? '—' });
        setModalFilterTipo(activeFilters.tipo ?? '');
        setModalFilterAlmacen(activeFilters.almacen ?? '');
        setModalFilterOrigen(activeFilters.origen ?? '');
        setModalFilterDesde(activeFilters.desde ?? '');
        setModalFilterHasta(activeFilters.hasta ?? '');
        setModalActiveFilters({
            ...(activeFilters.tipo && { tipo: activeFilters.tipo }),
            ...(activeFilters.almacen && { almacen: activeFilters.almacen }),
            ...(activeFilters.origen && { origen: activeFilters.origen }),
            ...(activeFilters.desde && { desde: activeFilters.desde }),
            ...(activeFilters.hasta && { hasta: activeFilters.hasta }),
        });
    };

    const applyModalFilters = () => {
        const next = {};
        if (modalFilterTipo) next.tipo = modalFilterTipo;
        if (modalFilterAlmacen) next.almacen = modalFilterAlmacen;
        if (modalFilterOrigen) next.origen = modalFilterOrigen;
        if (modalFilterDesde) next.desde = modalFilterDesde;
        if (modalFilterHasta) next.hasta = modalFilterHasta;
        setModalActiveFilters(next);
    };

    const clearModalFilters = () => {
        setModalFilterTipo('');
        setModalFilterAlmacen('');
        setModalFilterOrigen('');
        setModalFilterDesde('');
        setModalFilterHasta('');
        setModalActiveFilters({});
    };

    const modalFilterCount = Object.keys(modalActiveFilters).length;

    /** El historial de ese producto, con los filtros propios del modal ya aplicados. */
    const historialProducto = productoModal
        ? movimientos.filter((m) => {
              if (String(m.producto_id) !== String(productoModal.id)) return false;
              if (modalActiveFilters.tipo && m.tipo_movimiento !== modalActiveFilters.tipo) return false;
              if (modalActiveFilters.almacen) {
                  const id = m.almacen_id ?? m.almacen?.id;
                  if (String(id) !== modalActiveFilters.almacen) return false;
              }
              if (modalActiveFilters.origen && m.origen !== modalActiveFilters.origen) return false;
              if (modalActiveFilters.desde && (!m.fecha || m.fecha.slice(0, 10) < modalActiveFilters.desde)) return false;
              if (modalActiveFilters.hasta && (!m.fecha || m.fecha.slice(0, 10) > modalActiveFilters.hasta)) return false;
              return true;
          })
        : [];

    const filters = (
        <div className="flex flex-wrap items-end gap-3">
            <Select
                label="Tipo"
                value={filterTipo}
                onChange={(e) => setFilterTipo(e.target.value)}
                options={[
                    { value: '', label: 'Todos' },
                    { value: 'entrada', label: 'Entrada' },
                    { value: 'salida', label: 'Salida' },
                ]}
                className="w-40"
            />
            <SearchSelect
                label="Almacén"
                value={filterAlmacen}
                onChange={(v) => setFilterAlmacen(v ?? '')}
                placeholder="Todos"
                emptyText="Sin coincidencias"
                options={almacenes.map((a) => ({ value: String(a.id), label: a.nombre }))}
                className="w-48"
            />
            <SearchSelect
                label="Producto"
                value={filterProducto}
                onChange={(v) => setFilterProducto(v ?? '')}
                placeholder="Todos"
                emptyText="Sin coincidencias"
                options={[
                    ...new Map(
                        movimientos.filter((m) => m.producto_id).map((m) => [String(m.producto_id), m.producto?.nombre]),
                    ).entries(),
                ].map(([value, label]) => ({ value, label }))}
                className="w-56"
            />
            <SearchSelect
                label="Proveedor"
                value={filterProveedor}
                onChange={(v) => setFilterProveedor(v ?? '')}
                placeholder="Todos"
                emptyText="Sin coincidencias"
                options={[...new Set(movimientos.map((m) => m.proveedor_nombre).filter(Boolean))]
                    .sort((a, b) => a.localeCompare(b, 'es'))
                    .map((nombre) => ({ value: nombre, label: nombre }))}
                className="w-52"
            />
            <Select
                label="Movimiento"
                value={filterOrigen}
                onChange={(e) => setFilterOrigen(e.target.value)}
                options={[
                    { value: '', label: 'Todos' },
                    ...[...new Set(movimientos.map((m) => m.origen).filter(Boolean))].map((origen) => ({
                        value: origen,
                        label: ORIGEN_LABEL[origen] ?? origen,
                    })),
                ]}
                className="w-48"
            />
            <DateRangePicker
                label="Rango de fecha"
                desde={filterDesde}
                hasta={filterHasta}
                onChange={(d, h) => {
                    setFilterDesde(d);
                    setFilterHasta(h);
                }}
            />
        </div>
    );

    /** Los mismos filtros de arriba, pero detrás del ícono de filtros del modal. */
    const modalFiltersUI = (
        <div className="flex flex-wrap items-end gap-3">
            <Select
                label="Tipo"
                value={modalFilterTipo}
                onChange={(e) => setModalFilterTipo(e.target.value)}
                options={[
                    { value: '', label: 'Todos' },
                    { value: 'entrada', label: 'Entrada' },
                    { value: 'salida', label: 'Salida' },
                ]}
                className="w-36"
            />
            <SearchSelect
                label="Almacén"
                value={modalFilterAlmacen}
                onChange={(v) => setModalFilterAlmacen(v ?? '')}
                placeholder="Todos"
                emptyText="Sin coincidencias"
                options={almacenes.map((a) => ({ value: String(a.id), label: a.nombre }))}
                className="w-44"
            />
            <Select
                label="Movimiento"
                value={modalFilterOrigen}
                onChange={(e) => setModalFilterOrigen(e.target.value)}
                options={[
                    { value: '', label: 'Todos' },
                    ...[
                        ...new Set(
                            movimientos
                                .filter((m) => String(m.producto_id) === String(productoModal?.id))
                                .map((m) => m.origen)
                                .filter(Boolean),
                        ),
                    ].map((origen) => ({ value: origen, label: ORIGEN_LABEL[origen] ?? origen })),
                ]}
                className="w-44"
            />
            <DateRangePicker
                label="Rango de fecha"
                desde={modalFilterDesde}
                hasta={modalFilterHasta}
                onChange={(d, h) => {
                    setModalFilterDesde(d);
                    setModalFilterHasta(h);
                }}
            />
        </div>
    );

    const esEntrada = (row) => row.tipo_movimiento === 'entrada';
    const cantAbs = (row) => Math.abs(Number(row.cantidad ?? 0));

    /** Formatos activos del producto de esa fila, del más chico al más grande. */
    const formatosDe = (row) =>
        (row.producto?.presentaciones ?? [])
            .filter((p) => p.activo !== false && p.nombre?.trim())
            .sort((a, b) => (Number(a.factor_conversion) || 1) - (Number(b.factor_conversion) || 1));

    /**
     * Cuántas unidades base vale la unidad elegida en esa fila. Las cantidades
     * se guardan en unidad base: una salida de 100 kg son 2 sacos de 50.
     */
    const factorDeFila = (row) => {
        const elegida = unidadPorFila[row.id];
        if (!elegida) return 1;
        const pres = formatosDe(row).find((p) => p.nombre.trim() === elegida);
        return pres ? Number(pres.factor_conversion) || 1 : 1;
    };

    const columns = [
        { key: 'id', label: '#', width: '56px', render: (row) => <span className="text-gray-500">{row.id}</span> },
        {
            key: 'fecha',
            label: 'Fecha',
            width: '110px',
            render: (row) => {
                const f = fmtFecha(row.fecha);
                if (!f) return <span className="text-gray-400">—</span>;
                return (
                    <div className="leading-tight">
                        <div className="whitespace-nowrap text-gray-700">{f.dia}</div>
                        <div className="whitespace-nowrap text-xs text-gray-400">{f.hora}</div>
                    </div>
                );
            },
        },
        {
            key: 'codigo',
            label: 'Código',
            width: '110px',
            getSearchValue: (row) => row.producto?.codigo,
            render: (row) => (
                <span className="block truncate">
                    {row.producto?.codigo ?? <span className="text-gray-400">—</span>}
                </span>
            ),
        },
        {
            key: 'producto',
            label: 'Producto',
            getSearchValue: (row) => row.producto?.nombre,
            render: (row) =>
                row.producto_id ? (
                    <button
                        type="button"
                        onClick={() => abrirHistorial(row)}
                        title="Ver todo el historial de este producto"
                        className="inline-flex items-center gap-2 font-medium text-primary-700 underline decoration-dotted underline-offset-2 transition hover:text-primary-900"
                    >
                        <Package className="h-4 w-4 shrink-0 text-primary-600" />
                        <span className="truncate">{row.producto?.nombre ?? '—'}</span>
                    </button>
                ) : (
                    <span className="inline-flex items-center gap-2 font-medium text-warm-900">
                        <Package className="h-4 w-4 text-primary-600" />
                        {row.producto?.nombre ?? '—'}
                    </span>
                ),
        },
        {
            // Solo lo saben los movimientos que nacen de rollos (recepciones y
            // ventas que cortan un rollo). El resto queda en "—".
            key: 'color',
            label: 'Color',
            width: '140px',
            getSearchValue: (row) => row.color?.nombre,
            render: (row) =>
                row.color ? (
                    <span className="inline-flex items-center gap-1.5 text-warm-800">
                        <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/10"
                            style={{ backgroundColor: row.color.hex || '#9ca3af' }}
                        />
                        <span className="truncate">{row.color.nombre}</span>
                        {row.color.codigo && <span className="text-xs text-gray-400">({row.color.codigo})</span>}
                    </span>
                ) : (
                    <span className="text-gray-400">—</span>
                ),
        },
        {
            key: 'proveedor',
            label: 'Proveedor',
            width: '150px',
            getSearchValue: (row) => row.proveedor_nombre,
            render: (row) => (
                <span className="block truncate" title={row.proveedor_nombre ?? ''}>
                    {row.proveedor_nombre ?? <span className="text-gray-400">—</span>}
                </span>
            ),
        },
        {
            key: 'tipo_movimiento',
            label: 'Tipo',
            width: '110px',
            render: (row) => {
                const { label, variant, icon: Icon } = tipoInfo(row.tipo_movimiento);
                return (
                    <Badge variant={variant}>
                        <Icon className="mr-1 h-3 w-3" />
                        {label}
                    </Badge>
                );
            },
        },
        {
            key: 'origen',
            label: 'Mov.',
            width: '120px',
            render: (row) => <Badge variant="gray">{ORIGEN_LABEL[row.origen] ?? row.origen ?? '—'}</Badge>,
        },
        {
            key: 'documento',
            label: 'Doc.',
            width: '130px',
            searchable: false,
            render: (row) =>
                row.documento_referencia_tipo ? (
                    <span className="whitespace-nowrap text-gray-600">
                        {DOC_LABEL[row.documento_referencia_tipo] ?? row.documento_referencia_tipo}
                        {row.documento_referencia_id ? ` #${row.documento_referencia_id}` : ''}
                    </span>
                ) : (
                    <span className="text-gray-400">—</span>
                ),
        },
        {
            // Cada producto tiene sus formatos: la unidad se elige por fila y
            // la cantidad se muestra en ella.
            key: 'unidad',
            label: 'Ver en',
            width: '150px',
            searchable: false,
            render: (row) => {
                const formatos = formatosDe(row);
                const base = row.producto?.unidad_base?.nombre ?? 'Unidad base';

                if (formatos.length === 0) return <span className="text-gray-500">{base}</span>;

                return (
                    <select
                        value={unidadPorFila[row.id] ?? ''}
                        onChange={(e) =>
                            setUnidadPorFila((prev) => ({ ...prev, [row.id]: e.target.value }))
                        }
                        className="h-8 w-full rounded-md border border-gray-300 bg-white px-2 text-xs"
                    >
                        <option value="">{base} (base)</option>
                        {formatos.map((f) => (
                            <option key={f.id} value={f.nombre.trim()}>
                                {f.nombre.trim()}
                            </option>
                        ))}
                    </select>
                );
            },
        },
        {
            key: 'cantidad',
            label: 'Cant.',
            width: '80px',
            align: 'right',
            render: (row) => (
                <span className="text-gray-700">{num(cantAbs(row) / factorDeFila(row))}</span>
            ),
        },
        {
            key: 'costo_anterior',
            label: 'C. Ant.',
            width: '95px',
            align: 'right',
            searchable: false,
            render: (row) => <span className="text-gray-600">{money(row.costo_anterior)}</span>,
        },
        {
            key: 'costo_actual',
            label: 'C. Act.',
            width: '95px',
            align: 'right',
            searchable: false,
            render: (row) => <span className="text-gray-700">{money(row.costo_actual)}</span>,
        },
        {
            key: 'stock_anterior',
            label: 'St. Ant.',
            width: '85px',
            align: 'right',
            searchable: false,
            render: (row) => <span className="text-gray-600">{num(row.stock_anterior)}</span>,
        },
        {
            key: 'ingreso',
            label: 'Ing.',
            width: '80px',
            align: 'right',
            searchable: false,
            render: (row) =>
                esEntrada(row) ? (
                    <span className="font-semibold text-green-600">+{num(cantAbs(row))}</span>
                ) : (
                    <span className="text-gray-300">—</span>
                ),
        },
        {
            key: 'salida',
            label: 'Sal.',
            width: '80px',
            align: 'right',
            searchable: false,
            render: (row) =>
                !esEntrada(row) ? (
                    <span className="font-semibold text-red-600">−{num(cantAbs(row))}</span>
                ) : (
                    <span className="text-gray-300">—</span>
                ),
        },
        {
            key: 'saldo_stock',
            label: 'St. Act.',
            width: '90px',
            align: 'right',
            searchable: false,
            render: (row) => (
                <span className="font-medium text-gray-900">
                    {num(Number(row.saldo_stock ?? 0) / factorDeFila(row))}
                </span>
            ),
        },
    ];

    // El producto y el código ya están en el título del modal: sobran en su tabla.
    const columnasHistorial = columns.filter((c) => c.key !== 'producto' && c.key !== 'codigo');

    return (
        <Layout>
            <PageHeader
                title="Kardex"
                description="Historial de entradas y salidas de inventario por producto"
            />

            {error && <Alert variant="error" className="mb-4">{error}</Alert>}

            <DataTable
                columns={columns}
                rows={filtered}
                loading={loading}
                searchPlaceholder="Buscar en el kardex..."
                filterable
                filters={filters}
                filterCount={filterCount}
                onApplyFilters={applyFilters}
                onClearFilters={clearFilters}
            />

            <Modal
                open={Boolean(productoModal)}
                onClose={() => setProductoModal(null)}
                title={productoModal ? `Historial de ${productoModal.nombre}` : ''}
                description="Nace con los mismos filtros que tengas activos arriba; ajústalos aquí sin afectar la tabla principal."
                size="3xl"
                footer={<Button variant="secondary" onClick={() => setProductoModal(null)}>Cerrar</Button>}
            >
                <DataTable
                    columns={columnasHistorial}
                    rows={historialProducto}
                    searchPlaceholder="Buscar en este historial..."
                    emptyMessage="Sin movimientos con estos filtros."
                    filterable
                    filters={modalFiltersUI}
                    filterCount={modalFilterCount}
                    onApplyFilters={applyModalFilters}
                    onClearFilters={clearModalFilters}
                />
            </Modal>
        </Layout>
    );
}
