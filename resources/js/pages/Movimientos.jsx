import { useCallback, useEffect, useState } from 'react';
import { ArrowDownLeft, ArrowRightLeft, ArrowUpRight, Package } from 'lucide-react';
import api, { asList } from '../lib/api';
import Layout from '../components/Layout';
import PageHeader from '../components/PageHeader';
import { Alert, Badge, Button, DataTable, Select } from '../components/ui';

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
    const [activeFilters, setActiveFilters] = useState({});

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
        setActiveFilters(next);
    };

    const clearFilters = () => {
        setFilterTipo('');
        setFilterAlmacen('');
        setActiveFilters({});
    };

    const filtered = movimientos.filter((m) => {
        if (activeFilters.tipo && m.tipo_movimiento !== activeFilters.tipo) return false;
        if (activeFilters.almacen) {
            const id = m.almacen_id ?? m.almacen?.id;
            if (String(id) !== activeFilters.almacen) return false;
        }
        return true;
    });

    const filterCount = Object.keys(activeFilters).length;

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
            <Select
                label="Almacén"
                value={filterAlmacen}
                onChange={(e) => setFilterAlmacen(e.target.value)}
                options={[
                    { value: '', label: 'Todos' },
                    ...almacenes.map((a) => ({ value: String(a.id), label: a.nombre })),
                ]}
                className="w-48"
            />
            <Button variant="primary" size="sm" onClick={applyFilters}>
                Aplicar
            </Button>
            {filterCount > 0 && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                    Limpiar
                </Button>
            )}
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
            render: (row) => (
                <span className="inline-flex items-center gap-2 font-medium text-warm-900">
                    <Package className="h-4 w-4 text-primary-600" />
                    {row.producto?.nombre ?? '—'}
                </span>
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
            />
        </Layout>
    );
}
