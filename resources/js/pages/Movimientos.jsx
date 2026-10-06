import { useCallback, useEffect, useMemo, useState } from 'react';
import { PackageSearch } from 'lucide-react';
import api, { asList } from '../lib/api';
import { ORIGEN_LABEL } from '../lib/movimientos';
import Layout from '../components/Layout';
import PageHeader from '../components/PageHeader';
import { Alert, Badge, Button, DataTable, DateRangePicker, Modal, SearchSelect, Select, Spinner } from '../components/ui';

/** Fecha y hora en dos líneas: cabe en una columna estrecha sin desbordarse. */
const fmtFecha = (value) => {
    if (!value) return null;
    const d = new Date(value);
    return {
        dia: d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' }),
        hora: d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }),
    };
};

// Sin el "-0.00" que deja un redondeo.
const num = (n) =>
    (Math.abs(Number(n ?? 0)) < 0.005 ? 0 : Number(n)).toLocaleString('es-PE', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
/** Precios y costos unitarios: hasta 4 decimales, que es como se pagan (S/ 1.2500 el metro). */
const precio = (n) => Number(n ?? 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
const entero = (n) => Number(n ?? 0).toLocaleString('es-PE');

const vacio = <span className="text-gray-300">—</span>;
const texto = (valor, ancho) =>
    valor ? (
        <span className="block truncate" style={ancho ? { maxWidth: ancho } : undefined} title={valor}>
            {valor}
        </span>
    ) : (
        vacio
    );

const esEntrada = (row) => row.tipo_movimiento === 'entrada';
const cantAbs = (row) => Math.abs(Number(row.cantidad ?? 0));

const ESTADO_ROLLO = {
    disponible: { label: 'Disponible', variant: 'green' },
    separado: { label: 'Separado', variant: 'amber' },
    en_preparacion: { label: 'En preparación', variant: 'amber' },
    en_transito: { label: 'En tránsito', variant: 'blue' },
    en_revision: { label: 'En revisión', variant: 'amber' },
    despachado: { label: 'Despachado', variant: 'gray' },
    vendido: { label: 'Vendido', variant: 'gray' },
    agotado: { label: 'Agotado', variant: 'gray' },
};

export default function Movimientos() {
    /** Las telas que se pueden buscar: no se lista nada hasta elegir una. */
    const [telas, setTelas] = useState([]);
    const [almacenes, setAlmacenes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const [telaId, setTelaId] = useState('');
    /** Los movimientos de la tela elegida: null mientras cargan. */
    const [movs, setMovs] = useState(null);

    const [filterTipo, setFilterTipo] = useState('');
    const [filterAlmacen, setFilterAlmacen] = useState('');
    const [filterOrigen, setFilterOrigen] = useState('');
    const [filterDesde, setFilterDesde] = useState('');
    const [filterHasta, setFilterHasta] = useState('');
    const [activeFilters, setActiveFilters] = useState({});

    /** El movimiento (documento) abierto en el modal, con los rollos que entraron o salieron en él. */
    const [movModal, setMovModal] = useState(null);
    const [rollos, setRollos] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [telasRes, almRes] = await Promise.all([api.get('/movimientos/telas'), api.get('/almacenes')]);
            setTelas(asList(telasRes));
            setAlmacenes(asList(almRes));
        } catch {
            setError('No se pudo cargar el kardex.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const tela = telas.find((t) => String(t.id) === String(telaId)) ?? null;
    const unidad = tela?.unidad ?? '';

    const elegirTela = (id) => {
        setTelaId(id ?? '');
        setMovs(null);
        setFilterTipo('');
        setFilterAlmacen('');
        setFilterOrigen('');
        setFilterDesde('');
        setFilterHasta('');
        setActiveFilters({});
        if (!id) return;
        api.get('/movimientos', { params: { producto_id: id } })
            .then((res) => setMovs(asList(res)))
            .catch(() => setMovs([]));
    };

    const applyFilters = () => {
        const next = {};
        if (filterTipo) next.tipo = filterTipo;
        if (filterAlmacen) next.almacen = filterAlmacen;
        if (filterOrigen) next.origen = filterOrigen;
        if (filterDesde) next.desde = filterDesde;
        if (filterHasta) next.hasta = filterHasta;
        setActiveFilters(next);
    };

    const clearFilters = () => {
        setFilterTipo('');
        setFilterAlmacen('');
        setFilterOrigen('');
        setFilterDesde('');
        setFilterHasta('');
        setActiveFilters({});
    };

    const filterCount = Object.keys(activeFilters).length;

    /**
     * El kardex de la tela, como un libro: por almacén (cada uno lleva su propio stock) y, dentro de
     * cada uno, del movimiento más antiguo al más reciente para que el stock se lea de arriba abajo.
     */
    const kardex = useMemo(() => {
        const a = activeFilters;
        const lista = (movs ?? []).filter((m) => {
            if (a.tipo && m.tipo_movimiento !== a.tipo) return false;
            if (a.almacen && String(m.almacen_id ?? m.almacen?.id) !== a.almacen) return false;
            if (a.origen && m.origen !== a.origen) return false;
            if (a.desde && (!m.fecha || m.fecha.slice(0, 10) < a.desde)) return false;
            if (a.hasta && (!m.fecha || m.fecha.slice(0, 10) > a.hasta)) return false;
            return true;
        });
        const ordenada = [...lista].sort(
            (x, y) =>
                (x.almacen?.nombre ?? '').localeCompare(y.almacen?.nombre ?? '', 'es') ||
                String(x.fecha).localeCompare(String(y.fecha)) ||
                x.id - y.id,
        );
        return ordenada.map((m, i) => ({ ...m, _inicio: i > 0 && ordenada[i - 1].almacen_id !== m.almacen_id }));
    }, [movs, activeFilters]);

    const abrirMovimiento = (mov) => {
        setMovModal(mov);
        setRollos(null);
        api.get(`/movimientos/${mov.id}/rollos`)
            .then((res) => setRollos(asList(res)))
            .catch(() => setRollos([]));
    };

    /** Los rollos del movimiento abierto, agrupados por color: cuántos y cuántos metros de cada uno. */
    const rollosPorColor = useMemo(() => {
        const grupos = new Map();
        (rollos ?? []).forEach((r) => {
            const clave = String(r.color?.id ?? 'sin');
            if (!grupos.has(clave)) grupos.set(clave, { color: r.color, rollos: [], metros: 0 });
            const g = grupos.get(clave);
            g.rollos.push(r);
            g.metros += Number(r.metros) || 0;
        });
        return [...grupos.values()].sort((a, b) => (a.color?.nombre ?? '~').localeCompare(b.color?.nombre ?? '~', 'es'));
    }, [rollos]);

    const filters = (
        <div className="flex flex-wrap items-end gap-3">
            <SearchSelect
                label="Almacén"
                value={filterAlmacen}
                onChange={(v) => setFilterAlmacen(v ?? '')}
                placeholder="Todos"
                emptyText="Sin coincidencias"
                options={almacenes.map((a) => ({ value: String(a.id), label: a.nombre }))}
                className="w-44"
            />
            <Select
                label="Tipo"
                value={filterTipo}
                onChange={(e) => setFilterTipo(e.target.value)}
                options={[
                    { value: '', label: 'Todos' },
                    { value: 'entrada', label: 'Entrada' },
                    { value: 'salida', label: 'Salida' },
                ]}
                className="w-36"
            />
            <Select
                label="Movimiento"
                value={filterOrigen}
                onChange={(e) => setFilterOrigen(e.target.value)}
                options={[
                    { value: '', label: 'Todos' },
                    ...[...new Set((movs ?? []).map((m) => m.origen).filter(Boolean))].map((origen) => ({
                        value: origen,
                        label: ORIGEN_LABEL[origen] ?? origen,
                    })),
                ]}
                className="w-44"
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

    const columns = [
        {
            key: 'fecha',
            label: 'Fecha',
            width: '105px',
            getSearchValue: (row) => row.fecha,
            render: (row) => {
                const f = fmtFecha(row.fecha);
                if (!f) return vacio;
                return (
                    <div className="leading-tight">
                        <div className="whitespace-nowrap text-gray-700">{f.dia}</div>
                        <div className="whitespace-nowrap text-xs text-gray-400">{f.hora}</div>
                    </div>
                );
            },
        },
        {
            key: 'documento',
            label: 'Documento',
            width: '130px',
            getSearchValue: (row) => row.documento_numero,
            render: (row) => (
                <span className="whitespace-nowrap font-medium text-primary-700 underline decoration-dotted underline-offset-2">
                    {row.documento_numero ?? '—'}
                </span>
            ),
        },
        {
            key: 'nombre',
            label: 'Nombre',
            width: '210px',
            getSearchValue: (row) => row.nombre,
            render: (row) => texto(row.nombre, '210px'),
        },
        {
            key: 'categoria',
            label: 'Categoría',
            width: '120px',
            getSearchValue: (row) => row.producto?.categoria?.nombre,
            render: (row) => texto(row.producto?.categoria?.nombre, '120px'),
        },
        {
            // Solo lo saben los movimientos que nacen de rollos; lo demás (cargas antiguas) queda sin color.
            key: 'color',
            label: 'Color',
            width: '150px',
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
                    <span className="text-gray-400">Sin color</span>
                ),
        },
        {
            key: 'almacen',
            label: 'Almacén',
            width: '130px',
            getSearchValue: (row) => row.almacen?.nombre,
            render: (row) => texto(row.almacen?.nombre, '130px'),
        },
        {
            key: 'entra',
            label: 'Entra',
            width: '110px',
            align: 'right',
            searchable: false,
            render: (row) =>
                esEntrada(row) ? (
                    <span className="whitespace-nowrap font-semibold text-green-600">
                        {num(cantAbs(row))} <span className="text-[11px] font-normal text-gray-400">{unidad}</span>
                    </span>
                ) : (
                    vacio
                ),
        },
        {
            key: 'sale',
            label: 'Sale',
            width: '110px',
            align: 'right',
            searchable: false,
            render: (row) =>
                !esEntrada(row) ? (
                    <span className="whitespace-nowrap font-semibold text-red-600">
                        {num(cantAbs(row))} <span className="text-[11px] font-normal text-gray-400">{unidad}</span>
                    </span>
                ) : (
                    vacio
                ),
        },
        {
            // El stock de la tela en ese almacén tras el movimiento.
            key: 'stock',
            label: 'Stock',
            width: '105px',
            align: 'right',
            searchable: false,
            render: (row) => <span className="whitespace-nowrap font-semibold text-gray-900">{num(row.saldo_stock)}</span>,
        },
        {
            key: 'precio',
            label: 'Precio',
            width: '90px',
            align: 'right',
            searchable: false,
            render: (row) => <span className="text-gray-600">{precio(row.costo_unitario)}</span>,
        },
        {
            // Costo promedio unitario tras el movimiento.
            key: 'cpu',
            label: 'C.P.U.',
            width: '90px',
            align: 'right',
            searchable: false,
            render: (row) => <span className="text-gray-700">{precio(row.costo_actual)}</span>,
        },
        {
            // Lo que vale el stock que quedó: stock × C.P.U.
            key: 'total',
            label: 'Total',
            width: '110px',
            align: 'right',
            searchable: false,
            render: (row) => <span className="font-medium text-gray-900">{num(Number(row.saldo_stock ?? 0) * Number(row.costo_actual ?? 0))}</span>,
        },
        {
            key: 'glosa',
            label: 'Glosa',
            width: '210px',
            getSearchValue: (row) => [row.glosa, ORIGEN_LABEL[row.origen] ?? row.origen].join(' '),
            render: (row) => (
                <span className="block min-w-0">
                    <span className="block truncate text-gray-700" title={row.glosa ?? ''}>
                        {row.glosa ?? '—'}
                    </span>
                    {(ORIGEN_LABEL[row.origen] ?? row.origen) !== row.glosa && (
                        <span className="block truncate text-xs text-gray-400">{ORIGEN_LABEL[row.origen] ?? row.origen ?? ''}</span>
                    )}
                </span>
            ),
        },
        {
            key: 'referencia',
            label: 'Referencia',
            width: '130px',
            getSearchValue: (row) => row.referencia,
            render: (row) => texto(row.referencia, '130px'),
        },
        {
            key: 'orden_compra',
            label: 'O.Compra',
            width: '110px',
            getSearchValue: (row) => row.orden_compra,
            render: (row) => texto(row.orden_compra, '110px'),
        },
        {
            key: 'doc_registro',
            label: 'Doc. Registro',
            width: '120px',
            getSearchValue: (row) => row.doc_registro,
            render: (row) => texto(row.doc_registro, '120px'),
        },
    ];

    const totalRollos = rollosPorColor.reduce((s, g) => s + g.rollos.length, 0);
    const totalMetros = rollosPorColor.reduce((s, g) => s + g.metros, 0);

    return (
        <Layout>
            <PageHeader title="Kardex" description="Busca una tela y mira todos sus movimientos por documento" />

            {error && <Alert variant="error" className="mb-4">{error}</Alert>}

            <div className="mb-4 max-w-xl">
                <SearchSelect
                    value={telaId}
                    onChange={elegirTela}
                    placeholder={loading ? 'Cargando telas…' : 'Escribe el nombre o el código de la tela…'}
                    emptyText="Ninguna tela coincide"
                    options={telas.map((t) => ({
                        value: String(t.id),
                        label: [t.codigo, t.nombre, t.tipo_tela].filter(Boolean).join(' · '),
                    }))}
                />
            </div>

            {!tela ? (
                <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-edge bg-white py-20 text-center">
                    <PackageSearch className="h-8 w-8 text-warm-500" />
                    <p className="text-sm text-warm-500">Elige una tela y aquí aparecerán sus movimientos.</p>
                </div>
            ) : movs === null ? (
                <div className="flex items-center justify-center py-20">
                    <Spinner size="lg" className="text-primary-600" />
                </div>
            ) : (
                <>
                    <DataTable
                        columns={columns}
                        rows={kardex}
                        searchPlaceholder="Buscar en este kardex..."
                        emptyMessage="Esta tela no tiene movimientos con estos filtros."
                        onRowClick={abrirMovimiento}
                        // Una raya separa cada almacén: ahí empieza su propio stock.
                        rowClassName={(row) => (row._inicio ? 'border-t-2 border-t-primary-200' : '')}
                        filterable
                        filters={filters}
                        filterCount={filterCount}
                        onApplyFilters={applyFilters}
                        onClearFilters={clearFilters}
                    />
                    {movs.length >= 1000 && <p className="mt-2 text-xs text-warm-500">Se muestran los últimos 1000 movimientos.</p>}
                </>
            )}

            {/* Al abrir un documento: los rollos que entraron o salieron, por color y con su metraje. */}
            <Modal
                open={Boolean(movModal)}
                onClose={() => setMovModal(null)}
                title={movModal ? `${movModal.documento_numero ?? 'Movimiento'} · ${tela?.nombre ?? ''}` : ''}
                description={
                    movModal
                        ? [
                              ORIGEN_LABEL[movModal.origen] ?? movModal.origen,
                              movModal.nombre,
                              movModal.almacen?.nombre,
                              `${esEntrada(movModal) ? 'Entran' : 'Salen'} ${num(cantAbs(movModal))} ${unidad}`,
                          ]
                              .filter(Boolean)
                              .join(' · ')
                        : ''
                }
                size="2xl"
                footer={<Button variant="secondary" onClick={() => setMovModal(null)}>Cerrar</Button>}
            >
                {rollos === null ? (
                    <div className="flex items-center justify-center py-12">
                        <Spinner size="lg" className="text-primary-600" />
                    </div>
                ) : rollos.length === 0 ? (
                    <p className="py-10 text-center text-sm text-warm-500">
                        Este movimiento no tiene rollos registrados (es una carga de antes de llevar el control por rollos).
                    </p>
                ) : (
                    <div className="space-y-4">
                        <p className="text-sm text-warm-600">
                            <strong className="text-warm-900">{entero(totalRollos)}</strong> rollo{totalRollos === 1 ? '' : 's'} ·{' '}
                            <strong className="text-warm-900">{num(totalMetros)} {unidad}</strong>
                        </p>
                        {rollosPorColor.map((g) => (
                            <div key={g.color?.id ?? 'sin'} className="overflow-hidden rounded-lg border border-edge">
                                <div className="flex items-center gap-2 bg-gray-50 px-3 py-2">
                                    <span
                                        className="h-3 w-3 shrink-0 rounded-full ring-1 ring-black/10"
                                        style={{ backgroundColor: g.color?.hex || '#9ca3af' }}
                                    />
                                    <span className="text-sm font-semibold uppercase text-warm-900">{g.color?.nombre ?? 'Sin color'}</span>
                                    {g.color?.codigo && <span className="text-xs text-gray-400">({g.color.codigo})</span>}
                                    <span className="ml-auto text-xs text-warm-600">
                                        {entero(g.rollos.length)} rollo{g.rollos.length === 1 ? '' : 's'} ·{' '}
                                        <strong className="text-warm-900">{num(g.metros)} {unidad}</strong>
                                    </span>
                                </div>
                                <div className="max-h-64 overflow-auto">
                                    <table className="w-full text-sm">
                                        <thead className="sticky top-0 bg-white text-left text-[11px] font-semibold uppercase tracking-wide text-warm-500">
                                            <tr>
                                                <th className="px-3 py-1.5">Rollo</th>
                                                <th className="px-3 py-1.5 text-right">Metraje</th>
                                                <th className="px-3 py-1.5 text-right">Hoy tiene</th>
                                                <th className="px-3 py-1.5">Estado</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {g.rollos.map((r) => {
                                                const estado = ESTADO_ROLLO[r.estado] ?? { label: r.estado, variant: 'gray' };
                                                return (
                                                    <tr key={r.id}>
                                                        <td className="px-3 py-1.5 font-mono text-xs text-warm-800">{r.codigo}</td>
                                                        <td className="px-3 py-1.5 text-right font-medium text-warm-900">
                                                            {num(r.metros)} {unidad}
                                                        </td>
                                                        <td className="px-3 py-1.5 text-right text-warm-600">
                                                            {num(r.metros_actual)} {unidad}
                                                        </td>
                                                        <td className="px-3 py-1.5">
                                                            <Badge variant={estado.variant}>{estado.label}</Badge>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </Modal>
        </Layout>
    );
}
