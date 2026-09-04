import { useCallback, useEffect, useMemo, useState } from 'react';
import { Package, Store } from 'lucide-react';
import api, { asList } from '../lib/api';
import Layout from '../components/Layout';
import BottomSheet from '../components/ui/BottomSheet';
import DetalleCard from '../components/ui/DetalleCard';
import PageHeader from '../components/PageHeader';
import { Alert, Badge, Button, DataTable, Select, Tabs } from '../components/ui';

const money = (n) =>
    new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(Number(n) || 0);

const num = (n) => new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 }).format(Number(n) || 0);

export default function Existencias() {
    const [tab, setTab] = useState('todos');

    const [almacenes, setAlmacenes] = useState([]);
    const [existencias, setExistencias] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const [filterStock, setFilterStock] = useState('');
    const [activeFilters, setActiveFilters] = useState({});

    /** Fila cuyo desglose por unidad derivada se muestra abajo. */
    const [seleccionada, setSeleccionada] = useState(null);

    /** Unidad elegida por fila para expresar su stock: { [id de la fila]: nombre }. */
    const [unidadPorFila, setUnidadPorFila] = useState({});

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [almacenesRes, existenciasRes] = await Promise.all([
                api.get('/almacenes'),
                api.get('/existencias'),
            ]);
            setAlmacenes(asList(almacenesRes));
            const filas = asList(existenciasRes);
            setExistencias(filas);
            // Se conserva la selección tras recargar.
            setSeleccionada((prev) => filas.find((f) => f.id === prev?.id) ?? filas[0] ?? null);
        } catch {
            setError('No se pudieron cargar las existencias.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const applyFilters = () => {
        const next = {};
        if (filterStock) next.stock = filterStock;
        setActiveFilters(next);
    };

    const clearFilters = () => {
        setFilterStock('');
        setActiveFilters({});
    };

    const stockInfo = (row) => {
        const stock = Number(row.stock_actual ?? 0);
        // El mínimo del almacén manda; si no está definido, se usa el del producto.
        const minimo = Number(row.stock_minimo ?? 0) || Number(row.producto?.stock_minimo ?? 0);
        const maximo = Number(row.stock_maximo ?? 0) || Number(row.producto?.stock_maximo ?? 0);
        return { stock, minimo, maximo };
    };

    const stockBadge = (row) => {
        const { stock, minimo, maximo } = stockInfo(row);
        // El semáforo se decide con los valores base (así están los mínimos);
        // lo que cambia es solo cómo se muestra la cantidad.
        const texto = num(stock / factorDeFila(row));

        if (stock <= 0) return <Badge variant="red">{texto}</Badge>;
        if (minimo > 0 && stock <= minimo) return <Badge variant="amber">{texto}</Badge>;
        if (maximo > 0 && stock > maximo) return <Badge variant="blue">{texto}</Badge>;
        return <Badge variant="green">{texto}</Badge>;
    };

    const rowsFor = (almacenId) => {
        const rows = almacenId
            ? existencias.filter(
                  (e) =>
                      e.almacen_id === almacenId || e.almacen?.id === almacenId,
              )
            : existencias;
        return rows.filter((row) => {
            const { stock, minimo, maximo } = stockInfo(row);
            if (activeFilters.stock === 'sin') return stock <= 0;
            if (activeFilters.stock === 'bajo') return stock > 0 && minimo > 0 && stock <= minimo;
            if (activeFilters.stock === 'sobre') return maximo > 0 && stock > maximo;
            if (activeFilters.stock === 'normal') return stock > 0 && (minimo <= 0 || stock > minimo);
            return true;
        });
    };

    const filterCount = Object.keys(activeFilters).length;

    const filters = (
        <div className="flex flex-wrap items-end gap-3">
            <Select
                label="Stock"
                value={filterStock}
                onChange={(e) => setFilterStock(e.target.value)}
                options={[
                    { value: '', label: 'Todos' },
                    { value: 'sin', label: 'Sin stock' },
                    { value: 'bajo', label: 'Bajo el mínimo' },
                    { value: 'sobre', label: 'Sobre el máximo' },
                    { value: 'normal', label: 'Stock normal' },
                ]}
                className="w-52"
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

    const columns = [
        {
            key: 'codigo',
            label: 'Código',
            width: '110px',
            getSearchValue: (row) => row.producto?.codigo,
            render: (row) => <Badge variant="blue">{row.producto?.codigo ?? '—'}</Badge>,
        },
        {
            key: 'producto',
            label: 'Producto',
            getSearchValue: (row) => row.producto?.nombre,
            render: (row) => (
                <span className="flex items-center gap-2 font-medium text-warm-900">
                    <Package className="h-4 w-4 shrink-0 text-primary-600" />
                    <span className="truncate" title={row.producto?.nombre ?? ''}>
                        {row.producto?.nombre ?? '—'}
                    </span>
                </span>
            ),
        },
        {
            key: 'marca',
            label: 'Marca',
            width: '120px',
            getSearchValue: (row) => row.producto?.marca?.nombre,
            render: (row) => (
                <span className="block truncate text-warm-500">{row.producto?.marca?.nombre ?? '—'}</span>
            ),
        },
        {
            key: 'categoria',
            label: 'Categoría',
            width: '130px',
            getSearchValue: (row) => row.producto?.categoria?.nombre,
            render: (row) => (
                <Badge variant="gray">{row.producto?.categoria?.nombre ?? '—'}</Badge>
            ),
        },
        // El almacén solo aporta cuando se ven todos juntos.
        ...(tab === 'todos'
            ? [
                  {
                      key: 'almacen',
                      label: 'Almacén',
                      width: '140px',
                      getSearchValue: (row) => row.almacen?.nombre,
                      render: (row) => (
                          <span className="block truncate text-warm-500">{row.almacen?.nombre ?? '—'}</span>
                      ),
                  },
              ]
            : []),
        {
            // Cada producto tiene sus propios formatos, así que la unidad se
            // elige por fila y el stock se muestra en ella.
            key: 'unidad',
            label: 'Ver en',
            width: '150px',
            searchable: false,
            render: (row) => {
                const formatos = formatosDe(row);
                const base = row.producto?.unidad_base?.nombre ?? 'Unidad base';

                if (formatos.length === 0) {
                    return <span className="text-warm-500">{base}</span>;
                }

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
            key: 'stock_actual',
            label: 'Stock',
            width: '90px',
            align: 'right',
            searchable: false,
            render: stockBadge,
        },
        {
            key: 'stock_reservado',
            label: 'Reserv.',
            width: '85px',
            align: 'right',
            searchable: false,
            render: (row) => (
                <span className="text-warm-500">{num(Number(row.stock_reservado ?? 0) / factorDeFila(row))}</span>
            ),
        },
        {
            key: 'stock_disponible',
            label: 'Disp.',
            width: '85px',
            align: 'right',
            searchable: false,
            render: (row) => (
                <span className="font-medium text-warm-900">
                    {num(Number(row.stock_disponible ?? 0) / factorDeFila(row))}
                </span>
            ),
        },
        {
            key: 'stock_minimo',
            label: 'Mín.',
            width: '75px',
            align: 'right',
            searchable: false,
            render: (row) => (
                <span className="text-warm-500">{num(stockInfo(row).minimo / factorDeFila(row))}</span>
            ),
        },
        {
            key: 'stock_maximo',
            label: 'Máx.',
            width: '75px',
            align: 'right',
            searchable: false,
            render: (row) => (
                <span className="text-warm-500">{num(stockInfo(row).maximo / factorDeFila(row))}</span>
            ),
        },
        {
            key: 'costo_promedio',
            label: 'C. Prom.',
            width: '100px',
            align: 'right',
            searchable: false,
            render: (row) => <span className="text-warm-500">{money(row.costo_promedio)}</span>,
        },
        {
            key: 'valorizado',
            label: 'Valorizado',
            width: '110px',
            align: 'right',
            searchable: false,
            render: (row) => (
                <span className="font-semibold text-primary-600">
                    {money(Number(row.stock_actual ?? 0) * Number(row.costo_promedio ?? 0))}
                </span>
            ),
        },
        {
            key: 'precio',
            label: 'P. Venta',
            width: '100px',
            align: 'right',
            searchable: false,
            render: (row) =>
                row.producto?.precio_base != null ? money(row.producto.precio_base) : '—',
        },
        {
            key: 'ubicacion',
            label: 'Ubic.',
            width: '100px',
            getSearchValue: (row) => row.ubicacion,
            render: (row) => (
                <span className="block truncate text-warm-500">{row.ubicacion ?? '—'}</span>
            ),
        },
    ];

    const visibles = rowsFor(tab === 'todos' ? null : Number(tab));

    const resumen = visibles.reduce(
        (acc, row) => {
            const { stock, minimo } = stockInfo(row);
            acc.items += 1;
            if (stock <= 0) acc.sinStock += 1;
            else if (minimo > 0 && stock <= minimo) acc.bajoMinimo += 1;
            acc.valorizado += stock * Number(row.costo_promedio ?? 0);
            return acc;
        },
        { items: 0, sinStock: 0, bajoMinimo: 0, valorizado: 0 },
    );

    /**
     * Stock de la fila elegida expresado en cada unidad derivada. El stock vive en
     * unidad base: "1000 kg" no dice cuántos paquetes de 500g hay realmente.
     */
    const derivadas = useMemo(() => {
        if (!seleccionada) return [];

        const stockBase = Number(seleccionada.stock_actual) || 0;
        const abrev = seleccionada.producto?.unidad_base?.abreviatura ?? '';

        return (seleccionada.producto?.presentaciones ?? [])
            .filter((pres) => pres.activo !== false)
            .map((pres) => {
                const factor = Number(pres.factor_conversion) || 1;
                const completas = Math.floor(stockBase / factor);

                return {
                    id: pres.id,
                    nombre: pres.nombre,
                    factor,
                    abrev,
                    completas,
                    // Lo que sobra sin llegar a completar otra unidad derivada.
                    sobrante: Math.round((stockBase - completas * factor) * 100) / 100,
                    precio_compra: pres.precio_compra,
                    precio_venta: pres.precio_venta,
                };
            })
            .sort((a, b) => a.factor - b.factor);
    }, [seleccionada]);

    /** Formatos activos del producto de esa fila, del más chico al más grande. */
    const formatosDe = (row) =>
        (row.producto?.presentaciones ?? [])
            .filter((p) => p.activo !== false && p.nombre?.trim())
            .sort((a, b) => (Number(a.factor_conversion) || 1) - (Number(b.factor_conversion) || 1));

    /**
     * Cuántas unidades base vale la unidad elegida en esa fila. Sin elección
     * (o si el formato ya no existe) vale 1: se muestra en unidad base.
     */
    const factorDeFila = (row) => {
        const elegida = unidadPorFila[row.id];
        if (!elegida) return 1;
        const pres = formatosDe(row).find((p) => p.nombre.trim() === elegida);
        return pres ? Number(pres.factor_conversion) || 1 : 1;
    };

    const tabItems = [
        { key: 'todos', label: 'Todos', icon: Store },
        ...almacenes.map((a) => ({
            key: String(a.id),
            label: a.nombre,
            icon: Store,
        })),
    ];

    return (
        <Layout>
            <PageHeader
                title="Existencias"
                description="Consulta el stock de productos por almacén"
            />

            {error && <Alert variant="error" className="mb-4">{error}</Alert>}

            <div className="mb-4">
                <Tabs items={tabItems} value={tab} onChange={setTab} />
            </div>

            {/* Resumen de lo que se está viendo */}
            <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
                {[
                    { label: 'Productos', valor: resumen.items, tono: 'text-warm-900' },
                    { label: 'Sin stock', valor: resumen.sinStock, tono: 'text-red-600' },
                    { label: 'Bajo el mínimo', valor: resumen.bajoMinimo, tono: 'text-amber-600' },
                    { label: 'Valorizado', valor: money(resumen.valorizado), tono: 'text-primary-600' },
                ].map((c) => (
                    <div key={c.label} className="rounded-xl border border-edge bg-white p-4 shadow-sm">
                        <p className="text-xs font-semibold uppercase tracking-wide text-warm-500">{c.label}</p>
                        <p className={`mt-1 text-xl font-bold ${c.tono}`}>{c.valor}</p>
                    </div>
                ))}
            </div>

            <DataTable
                columns={columns}
                rows={visibles}
                loading={loading}
                searchPlaceholder="Buscar existencias..."
                filterable
                filters={filters}
                filterCount={filterCount}
                emptyMessage="Sin existencias en este almacén"
                onRowClick={(row) => setSeleccionada(row)}
                rowClassName={(row) => (row.id === seleccionada?.id ? 'bg-primary-50' : undefined)}
            />

            {/* Móvil: el desglose sube desde abajo al tocar una card (en escritorio no pinta nada). */}
            <BottomSheet
                open={Boolean(seleccionada)}
                onClose={() => setSeleccionada(null)}
                title={seleccionada?.producto?.nombre ?? 'Unidades derivadas'}
                subtitle={seleccionada ? `Stock base: ${num(seleccionada.stock_actual)} ${seleccionada.producto?.unidad_base?.abreviatura ?? ''}${seleccionada.almacen?.nombre ? ` · ${seleccionada.almacen.nombre}` : ''}` : ''}
            >
                {derivadas.length === 0 ? (
                    <p className="py-6 text-center text-sm text-warm-500">Este producto no tiene unidades derivadas activas.</p>
                ) : (
                    <div className="space-y-3">
                        {derivadas.map((u) => (
                            <DetalleCard
                                key={u.id}
                                titulo={u.nombre}
                                subtitulo={`Factor x${num(u.factor)} ${u.abrev}`}
                                columnas={2}
                                campos={[
                                    { label: 'Stock en esa unidad', value: num(u.completas), valueClassName: 'text-primary-600' },
                                    { label: 'Sobrante', value: u.sobrante > 0 ? `${num(u.sobrante)} ${u.abrev}` : '—' },
                                    { label: 'P. Compra', value: money(u.precio_compra) },
                                    { label: 'P. Venta', value: money(u.precio_venta) },
                                ]}
                            />
                        ))}
                    </div>
                )}
            </BottomSheet>

            {/* Desglose del stock en cada unidad derivada del producto (escritorio) */}
            <div className="mt-6 hidden rounded-xl border border-edge bg-white shadow-sm md:block">
                <div className="flex items-center justify-between border-b border-edge px-5 py-3">
                    <h2 className="text-sm font-semibold text-warm-900">
                        Unidades derivadas
                        {seleccionada?.producto?.nombre ? ` de ${seleccionada.producto.nombre}` : ''}
                    </h2>
                    {seleccionada && (
                        <span className="text-xs text-warm-500">
                            Stock base: {num(seleccionada.stock_actual)}{' '}
                            {seleccionada.producto?.unidad_base?.abreviatura ?? ''}
                            {seleccionada.almacen?.nombre ? ` · ${seleccionada.almacen.nombre}` : ''}
                        </span>
                    )}
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[720px] text-sm">
                        <thead>
                            <tr className="bg-primary-600 text-left text-xs font-semibold uppercase tracking-wide text-white">
                                <th className="w-12 px-3 py-2.5 text-center">#</th>
                                <th className="px-3 py-2.5">Unidad derivada</th>
                                <th className="w-32 px-3 py-2.5 text-right">Factor</th>
                                <th className="w-36 px-3 py-2.5 text-right">Stock en esa unidad</th>
                                <th className="w-28 px-3 py-2.5 text-right">Sobrante</th>
                                <th className="w-28 px-3 py-2.5 text-right">P. Compra</th>
                                <th className="w-28 px-3 py-2.5 text-right">P. Venta</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {derivadas.length === 0 && (
                                <tr>
                                    <td colSpan={7} className="px-3 py-10 text-center text-sm text-warm-500">
                                        {seleccionada
                                            ? 'Este producto no tiene unidades derivadas activas.'
                                            : 'Selecciona un producto arriba para ver su desglose.'}
                                    </td>
                                </tr>
                            )}

                            {derivadas.map((u, i) => (
                                <tr key={u.id}>
                                    <td className="px-3 py-2 text-center text-warm-500">{i + 1}</td>
                                    <td className="px-3 py-2 font-semibold text-warm-900">{u.nombre}</td>
                                    <td className="px-3 py-2 text-right text-warm-500">
                                        x{num(u.factor)} {u.abrev}
                                    </td>
                                    <td className="px-3 py-2 text-right">
                                        <span className="font-bold text-primary-600">{num(u.completas)}</span>
                                    </td>
                                    <td className="px-3 py-2 text-right text-warm-500">
                                        {u.sobrante > 0 ? `${num(u.sobrante)} ${u.abrev}` : '—'}
                                    </td>
                                    <td className="px-3 py-2 text-right text-warm-500">{money(u.precio_compra)}</td>
                                    <td className="px-3 py-2 text-right text-warm-900">{money(u.precio_venta)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </Layout>
    );
}
