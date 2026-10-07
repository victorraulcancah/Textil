import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PackageSearch } from 'lucide-react';
import api, { asList } from '../lib/api';
import { ORIGEN_LABEL } from '../lib/movimientos';
import Layout from '../components/Layout';
import PageHeader from '../components/PageHeader';
import { Alert, Badge, Button, DataTable, DateRangePicker, Modal, SearchSelect, Select, Spinner, Tabs } from '../components/ui';

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
const claveColor = (id) => String(id ?? 'sin');

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

/**
 * Un documento puede mover varios colores (una recepción trae un movimiento por color): en el kardex de un color
 * es una sola fila, con lo que entró o salió en total y el stock con que quedó al final.
 */
const juntarPorDocumento = (movs) => {
    const grupos = new Map();
    movs.forEach((m) => {
        const clave = m.documento_referencia_id
            ? [m.documento_referencia_tipo, m.documento_referencia_id, m.almacen_id, m.tipo_movimiento].join(':')
            : `solo:${m.id}`;
        if (!grupos.has(clave)) grupos.set(clave, []);
        grupos.get(clave).push(m);
    });

    return [...grupos.values()].map((grupo) => {
        // El último movimiento del documento deja el stock y el costo promedio con que quedó.
        const ultimo = grupo.reduce((a, b) => (b.id > a.id ? b : a));
        if (grupo.length === 1) return ultimo;

        const total = grupo.reduce((s, m) => s + Math.abs(Number(m.cantidad) || 0), 0);
        const costo = grupo.reduce((s, m) => s + Math.abs(Number(m.cantidad) || 0) * (Number(m.costo_unitario) || 0), 0);
        const signo = Number(ultimo.cantidad) < 0 ? -1 : 1;

        return {
            ...ultimo,
            cantidad: signo * total,
            costo_unitario: total > 0 ? costo / total : ultimo.costo_unitario,
        };
    });
};

export default function Movimientos() {
    const navigate = useNavigate();
    // La tela y el color elegidos viajan en la dirección: al volver de un documento todo sigue donde estaba.
    const [params, setParams] = useSearchParams();

    /** Las telas que se pueden buscar: no se lista nada hasta elegir una. */
    const [telas, setTelas] = useState([]);
    const [almacenes, setAlmacenes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const [telaId, setTelaId] = useState('');
    const [almacenId, setAlmacenId] = useState('');
    /** Los colores de la tela elegida con sus rollos y metros (null mientras cargan). */
    const [colores, setColores] = useState(null);
    /** Todos los movimientos de la tela elegida (null mientras cargan). */
    const [movs, setMovs] = useState(null);

    /** El color abierto en el modal, su pestaña y sus rollos. */
    const [colorModal, setColorModal] = useState(null);
    const [pestana, setPestana] = useState('movimientos');
    const [rollosColor, setRollosColor] = useState(null);

    const [filterTipo, setFilterTipo] = useState('');
    const [filterOrigen, setFilterOrigen] = useState('');
    const [filterDesde, setFilterDesde] = useState('');
    const [filterHasta, setFilterHasta] = useState('');
    const [activeFilters, setActiveFilters] = useState({});

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

    // Los colores se piden otra vez al cambiar de almacén: cada almacén tiene sus propios rollos.
    useEffect(() => {
        if (!telaId) return undefined;
        let vivo = true;
        setColores(null);
        api.get('/movimientos/colores', { params: { producto_id: telaId, almacen_id: almacenId || undefined } })
            .then((res) => vivo && setColores(asList(res)))
            .catch(() => vivo && setColores([]));
        return () => {
            vivo = false;
        };
    }, [telaId, almacenId]);

    const elegirTela = (id, conservarColor = false) => {
        setTelaId(id ?? '');
        setColores(null);
        setMovs(null);
        setColorModal(null);
        // Al volver de un documento el color de la dirección se conserva, para reabrirlo.
        const color = conservarColor ? params.get('color') : null;
        setParams(id ? { tela: id, ...(color ? { color } : {}) } : {}, { replace: true });
        if (!id) return;
        api.get('/movimientos', { params: { producto_id: id } })
            .then((res) => setMovs(asList(res)))
            .catch(() => setMovs([]));
    };

    const abrirColor = (color) => {
        setParams({ tela: telaId, color: claveColor(color.id) }, { replace: true });
        setColorModal(color);
        setPestana('movimientos');
        setRollosColor(null);
        setFilterTipo('');
        setFilterOrigen('');
        setFilterDesde('');
        setFilterHasta('');
        setActiveFilters({});
        api.get('/movimientos/colores/rollos', {
            params: { producto_id: telaId, producto_color_id: claveColor(color.id), almacen_id: almacenId || undefined },
        })
            .then((res) => setRollosColor(asList(res)))
            .catch(() => setRollosColor([]));
    };

    const applyFilters = () => {
        const next = {};
        if (filterTipo) next.tipo = filterTipo;
        if (filterOrigen) next.origen = filterOrigen;
        if (filterDesde) next.desde = filterDesde;
        if (filterHasta) next.hasta = filterHasta;
        setActiveFilters(next);
    };

    const clearFilters = () => {
        setFilterTipo('');
        setFilterOrigen('');
        setFilterDesde('');
        setFilterHasta('');
        setActiveFilters({});
    };

    const filterCount = Object.keys(activeFilters).length;

    /** Los movimientos de este color (y almacén), uno por documento, del más antiguo al más reciente en cada almacén. */
    const delColor = useMemo(() => {
        if (!colorModal) return [];
        const a = activeFilters;
        const lista = juntarPorDocumento(
            (movs ?? []).filter(
                (m) =>
                    claveColor(m.producto_color_id) === claveColor(colorModal.id) &&
                    (!almacenId || String(m.almacen_id ?? m.almacen?.id) === String(almacenId)),
            ),
        ).filter((m) => {
            if (a.tipo && m.tipo_movimiento !== a.tipo) return false;
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
    }, [movs, colorModal, almacenId, activeFilters]);

    const cerrarColor = () => {
        setColorModal(null);
        setParams(telaId ? { tela: telaId } : {}, { replace: true });
    };

    /** Un documento se ve completo en su propia vista: su ficha arriba y su detalle abajo. */
    const abrirDocumento = (mov) => {
        if (!mov.documento_referencia_id) return;
        navigate(`/kardex/documento/${mov.documento_referencia_tipo}/${mov.documento_referencia_id}`);
    };

    // Al entrar con una tela (y color) en la dirección —por ejemplo al volver de un documento— se vuelve a abrir.
    useEffect(() => {
        const t = params.get('tela');
        if (t && !telaId && telas.some((x) => String(x.id) === t)) elegirTela(t, true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [telas]);

    useEffect(() => {
        const c = params.get('color');
        if (c && colores && !colorModal) {
            const color = colores.find((x) => claveColor(x.id) === c);
            if (color) abrirColor(color);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [colores]);

    const resumen = useMemo(() => {
        const lista = colores ?? [];
        const suma = (k) => lista.reduce((s, c) => s + (Number(c[k]) || 0), 0);
        return { colores: lista.filter((c) => c.id != null).length, rollos: suma('rollos'), fisico: suma('fisico'), disponible: suma('disponible') };
    }, [colores]);

    // ───────────── La tabla de colores de la tela
    const columnasColores = [
        {
            key: 'codigo',
            label: 'Código',
            width: '110px',
            getSearchValue: (row) => [tela?.codigo, row.codigo].filter(Boolean).join('-'),
            render: (row) => <span className="whitespace-nowrap font-medium text-gray-700">{[tela?.codigo, row.codigo].filter(Boolean).join('-') || '—'}</span>,
        },
        {
            key: 'marca',
            label: 'Marca',
            width: '130px',
            getSearchValue: () => tela?.marca,
            render: () => texto(tela?.marca, '130px'),
        },
        {
            key: 'descripcion',
            label: 'Descripción',
            getSearchValue: (row) => `${tela?.nombre ?? ''} ${row.nombre}`,
            render: (row) => (
                <span className="inline-flex min-w-0 items-center gap-2">
                    <span
                        className="h-3 w-3 shrink-0 rounded-full ring-1 ring-black/10"
                        style={{ backgroundColor: row.hex || '#9ca3af' }}
                    />
                    <span className="min-w-0">
                        <span className="block truncate font-semibold uppercase text-primary-700">{row.nombre}</span>
                        <span className="block truncate text-xs text-gray-400">{tela?.nombre}</span>
                    </span>
                </span>
            ),
        },
        {
            key: 'rollos',
            label: 'Rollos',
            width: '80px',
            align: 'right',
            searchable: false,
            render: (row) => <span className="text-gray-700">{entero(row.rollos)}</span>,
        },
        {
            key: 'fisico',
            label: 'Stock físico',
            width: '120px',
            align: 'right',
            searchable: false,
            render: (row) => <span className="font-semibold text-gray-900">{num(row.fisico)}</span>,
        },
        {
            key: 'um',
            label: 'U.M',
            width: '60px',
            searchable: false,
            render: () => <span className="text-gray-500">{unidad}</span>,
        },
        {
            // Lo comprado que aún no llega, con la orden de compra de la que viene.
            key: 'transito',
            label: 'Tránsito',
            width: '140px',
            align: 'right',
            getSearchValue: (row) => (row.ordenes ?? []).map((o) => o.codigo).join(' '),
            render: (row) =>
                Number(row.transito) > 0 ? (
                    <span className="block text-right leading-tight" title={(row.ordenes ?? []).map((o) => `${o.codigo}: ${num(o.metros)} ${unidad}`).join('\n')}>
                        <span className="block text-blue-700">{num(row.transito)}</span>
                        <span className="block truncate text-[11px] text-gray-500">{(row.ordenes ?? []).map((o) => o.codigo).join(', ')}</span>
                    </span>
                ) : (
                    vacio
                ),
        },
        {
            // Los rollos que un pedido ya separó o está preparando, con su pedido.
            key: 'reservado_p',
            label: 'Reservado (P)',
            width: '150px',
            align: 'right',
            getSearchValue: (row) => (row.pedidos ?? []).map((p) => `${p.pedido} ${p.cliente ?? ''}`).join(' '),
            render: (row) =>
                Number(row.reservado_p) > 0 ? (
                    <span
                        className="block text-right leading-tight"
                        title={(row.pedidos ?? []).map((p) => `${p.pedido} · ${p.cliente ?? ''} · ${p.rollos} rollo${p.rollos === 1 ? '' : 's'} · ${num(p.metros)} ${unidad} (${p.estado})`).join('\n')}
                    >
                        <span className="block text-amber-700">{num(row.reservado_p)}</span>
                        <span className="block truncate text-[11px] text-gray-500">{(row.pedidos ?? []).map((p) => p.pedido).join(', ')}</span>
                    </span>
                ) : (
                    vacio
                ),
        },
        {
            // El stock físico menos lo reservado.
            key: 'disponible',
            label: 'Disponible',
            width: '115px',
            align: 'right',
            searchable: false,
            render: (row) => (
                <span
                    className={Number(row.disponible) > 0 ? 'font-semibold text-green-700' : 'font-semibold text-red-600'}
                    title={`Stock físico ${num(row.fisico)} − reservado ${num(row.reservado_p)}${Number(row.reservado_f) > 0 ? ` − pedido sin rollo asignado ${num(row.reservado_f)}` : ''}`}
                >
                    {num(row.disponible)}
                </span>
            ),
        },
    ];

    // ───────────── El kardex de un color: sus documentos
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

    const columnasMov = [
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
            // El stock de este color en ese almacén tras el documento.
            key: 'stock',
            label: 'Stock',
            width: '105px',
            align: 'right',
            searchable: false,
            render: (row) => <span className="whitespace-nowrap font-semibold text-gray-900">{num(row.saldo_color ?? row.saldo_stock)}</span>,
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
            // Costo promedio unitario tras el documento.
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
            render: (row) => (
                <span className="font-medium text-gray-900">
                    {num(Number(row.saldo_color ?? row.saldo_stock ?? 0) * Number(row.costo_actual ?? 0))}
                </span>
            ),
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

    // ───────────── Los rollos de un color
    const columnasRollos = [
        {
            key: 'codigo',
            label: 'Rollo',
            getSearchValue: (row) => row.codigo,
            render: (row) => <span className="font-mono text-xs text-gray-800">{row.codigo}</span>,
        },
        {
            key: 'metros_inicial',
            label: 'Metraje de fábrica',
            align: 'right',
            searchable: false,
            render: (row) => <span className="text-gray-600">{num(row.metros_inicial)} {unidad}</span>,
        },
        {
            key: 'metros_actual',
            label: 'Hoy tiene',
            align: 'right',
            searchable: false,
            render: (row) => <span className="font-semibold text-gray-900">{num(row.metros_actual)} {unidad}</span>,
        },
        {
            key: 'estado',
            label: 'Estado',
            getSearchValue: (row) => ESTADO_ROLLO[row.estado]?.label ?? row.estado,
            render: (row) => {
                const e = ESTADO_ROLLO[row.estado] ?? { label: row.estado, variant: 'gray' };
                return <Badge variant={e.variant}>{e.label}</Badge>;
            },
        },
        {
            key: 'almacen',
            label: 'Almacén',
            getSearchValue: (row) => row.almacen,
            render: (row) => texto(row.almacen),
        },
    ];

    return (
        <Layout>
            <PageHeader title="Kardex" description="Busca una tela y mira cada uno de sus colores con sus rollos, su stock y sus movimientos" />

            {error && <Alert variant="error" className="mb-4">{error}</Alert>}

            <div className="mb-4 flex flex-wrap items-end gap-3">
                <div className="min-w-[260px] max-w-xl flex-1">
                    <SearchSelect
                        value={telaId}
                        onChange={(v) => elegirTela(v)}
                        placeholder={loading ? 'Cargando telas…' : 'Escribe el nombre o el código de la tela…'}
                        emptyText="Ninguna tela coincide"
                        options={telas.map((t) => ({
                            value: String(t.id),
                            label: [t.codigo, t.nombre, t.tipo_tela].filter(Boolean).join(' · '),
                        }))}
                    />
                </div>
                {tela && (
                    <div className="w-56">
                        <SearchSelect
                            value={almacenId}
                            onChange={(v) => setAlmacenId(v ?? '')}
                            placeholder="Todos los almacenes"
                            emptyText="Sin coincidencias"
                            options={almacenes.map((a) => ({ value: String(a.id), label: a.nombre }))}
                        />
                    </div>
                )}
            </div>

            {!tela ? (
                <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-edge bg-white py-20 text-center">
                    <PackageSearch className="h-8 w-8 text-warm-500" />
                    <p className="text-sm text-warm-500">Elige una tela y aquí aparecerán sus colores.</p>
                </div>
            ) : colores === null ? (
                <div className="flex items-center justify-center py-20">
                    <Spinner size="lg" className="text-primary-600" />
                </div>
            ) : (
                <DataTable
                    columns={columnasColores}
                    rows={colores}
                    keyField="id"
                    searchPlaceholder="Buscar color..."
                    emptyMessage="Esta tela no tiene colores con stock ni movimientos."
                    onRowClick={abrirColor}
                    encabezado={
                        <p className="text-sm text-warm-600">
                            <strong className="text-warm-900">{entero(resumen.colores)}</strong> color{resumen.colores === 1 ? '' : 'es'} ·{' '}
                            <strong className="text-warm-900">{entero(resumen.rollos)}</strong> rollos ·{' '}
                            <strong className="text-warm-900">{num(resumen.fisico)} {unidad}</strong> en almacén ·{' '}
                            <strong className="text-green-700">{num(resumen.disponible)} {unidad}</strong> disponibles
                        </p>
                    }
                />
            )}

            {/* Al abrir un color: sus documentos (kardex) y sus rollos. */}
            <Modal
                open={Boolean(colorModal)}
                onClose={cerrarColor}
                title={colorModal ? `${colorModal.nombre} · ${tela?.nombre ?? ''}` : ''}
                description={
                    colorModal
                        ? `${[tela?.codigo, colorModal.codigo].filter(Boolean).join('-')} · ${entero(colorModal.rollos)} rollo${colorModal.rollos === 1 ? '' : 's'} · ${num(colorModal.fisico)} ${unidad} en almacén · ${num(colorModal.disponible)} ${unidad} disponibles`
                        : ''
                }
                size="full"
                footer={<Button variant="secondary" onClick={cerrarColor}>Cerrar</Button>}
            >
                <div className="space-y-4">
                    <Tabs
                        value={pestana}
                        onChange={setPestana}
                        items={[
                            { key: 'movimientos', label: `Movimientos (${delColor.length})` },
                            { key: 'rollos', label: `Rollos${rollosColor ? ` (${rollosColor.length})` : ''}` },
                        ]}
                    />

                    {pestana === 'movimientos' ? (
                        movs === null ? (
                            <div className="flex items-center justify-center py-16">
                                <Spinner size="lg" className="text-primary-600" />
                            </div>
                        ) : (
                            <DataTable
                                columns={columnasMov}
                                rows={delColor}
                                searchPlaceholder="Buscar en este kardex..."
                                emptyMessage="Este color no tiene movimientos con estos filtros."
                                onRowClick={abrirDocumento}
                                // Una raya separa cada almacén: ahí empieza su propio stock.
                                rowClassName={(row) => (row._inicio ? 'border-t-2 border-t-primary-200' : '')}
                                filterable
                                filters={filters}
                                filterCount={filterCount}
                                onApplyFilters={applyFilters}
                                onClearFilters={clearFilters}
                            />
                        )
                    ) : rollosColor === null ? (
                        <div className="flex items-center justify-center py-16">
                            <Spinner size="lg" className="text-primary-600" />
                        </div>
                    ) : (
                        <DataTable
                            columns={columnasRollos}
                            rows={rollosColor}
                            searchPlaceholder="Buscar rollo..."
                            emptyMessage="Este color no tiene rollos en almacén."
                        />
                    )}
                </div>
            </Modal>

        </Layout>
    );
}
