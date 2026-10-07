import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import api, { asList } from '../lib/api';
import { ORIGEN_LABEL } from '../lib/movimientos';
import { NOMBRE_DOCUMENTO, cantAbs, claveColor, entero, esEntrada, fmtFecha, juntarPorDocumento, num, precio, texto, vacio } from '../lib/kardex';
import Layout from '../components/Layout';
import PageHeader from '../components/PageHeader';
import { Alert, Button, DataTable, DateRangePicker, Select, Spinner } from '../components/ui';

/**
 * El kardex de un color de una tela: todos sus documentos, uno por fila, del más antiguo al más reciente en cada
 * almacén. Tocar un documento lleva a su vista (la ficha y el detalle).
 */
export default function KardexColor() {
    const { telaId, colorId } = useParams();
    const [params] = useSearchParams();
    const almacenId = params.get('almacen') ?? '';
    const navigate = useNavigate();
    const location = useLocation();

    const [tela, setTela] = useState(null);
    const [color, setColor] = useState(null);
    const [movs, setMovs] = useState(null);
    const [error, setError] = useState(null);

    const [filterTipo, setFilterTipo] = useState('');
    const [filterOrigen, setFilterOrigen] = useState('');
    const [filterDesde, setFilterDesde] = useState('');
    const [filterHasta, setFilterHasta] = useState('');
    const [activeFilters, setActiveFilters] = useState({});

    useEffect(() => {
        let vivo = true;
        setError(null);
        Promise.all([
            api.get('/movimientos/telas'),
            api.get('/movimientos/colores', { params: { producto_id: telaId, almacen_id: almacenId || undefined } }),
            api.get('/movimientos', { params: { producto_id: telaId } }),
        ])
            .then(([telasRes, coloresRes, movsRes]) => {
                if (!vivo) return;
                setTela(asList(telasRes).find((t) => String(t.id) === String(telaId)) ?? null);
                setColor(asList(coloresRes).find((c) => claveColor(c.id) === colorId) ?? null);
                setMovs(asList(movsRes));
            })
            .catch(() => vivo && setError('No se pudo cargar el kardex de este color.'));
        return () => {
            vivo = false;
        };
    }, [telaId, colorId, almacenId]);

    const unidad = tela?.unidad ?? '';
    const volver = () => (location.key === 'default' ? navigate('/kardex') : navigate(-1));

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

    /** Los movimientos de este color (y almacén), uno por documento, del más antiguo al más reciente en cada almacén. */
    const filas = useMemo(() => {
        const a = activeFilters;
        const lista = juntarPorDocumento(
            (movs ?? []).filter(
                (m) =>
                    claveColor(m.producto_color_id) === colorId &&
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
    }, [movs, colorId, almacenId, activeFilters]);

    const abrirDocumento = (mov) => {
        if (!mov.documento_referencia_id) return;
        navigate(`/kardex/documento/${mov.documento_referencia_tipo}/${mov.documento_referencia_id}`);
    };

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

    const columnas = [
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
        { key: 'nombre', label: 'Nombre', width: '210px', getSearchValue: (row) => row.nombre, render: (row) => texto(row.nombre, '210px') },
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
        { key: 'precio', label: 'Precio', width: '90px', align: 'right', searchable: false, render: (row) => <span className="text-gray-600">{precio(row.costo_unitario)}</span> },
        {
            // Lo que vale el stock que quedó: stock × C.P.U.
            key: 'total',
            label: 'Total',
            width: '110px',
            align: 'right',
            searchable: false,
            render: (row) => (
                <span className="font-medium text-gray-900">{num(Number(row.saldo_color ?? row.saldo_stock ?? 0) * Number(row.costo_actual ?? 0))}</span>
            ),
        },
        {
            // Qué clase de documento es (Recepción, Ajuste, Proforma, Venta…) y, debajo, lo que dice su glosa.
            key: 'glosa',
            label: 'Glosa',
            width: '210px',
            getSearchValue: (row) => [NOMBRE_DOCUMENTO[row.documento_referencia_tipo], row.glosa, ORIGEN_LABEL[row.origen] ?? row.origen].join(' '),
            render: (row) => (
                <span className="block min-w-0">
                    <span className="block truncate font-medium text-gray-800">
                        {NOMBRE_DOCUMENTO[row.documento_referencia_tipo] ?? ORIGEN_LABEL[row.origen] ?? row.origen ?? '—'}
                    </span>
                    {row.glosa && <span className="block truncate text-xs text-gray-400" title={row.glosa}>{row.glosa}</span>}
                </span>
            ),
        },
        { key: 'orden_compra', label: 'O.Compra', width: '110px', getSearchValue: (row) => row.orden_compra, render: (row) => texto(row.orden_compra, '110px') },
        {
            // El id del documento en el sistema.
            key: 'doc_registro',
            label: 'Doc. Registro',
            width: '120px',
            getSearchValue: (row) => (row.documento_referencia_id ? String(row.documento_referencia_id) : ''),
            render: (row) =>
                row.documento_referencia_id ? <span className="whitespace-nowrap text-gray-700">#{row.documento_referencia_id}</span> : vacio,
        },
    ];

    const titulo = tela ? `${color?.nombre ?? (colorId === 'sin' ? 'Sin color' : 'Color')} · ${tela.nombre}` : 'Kardex';

    return (
        <Layout>
            <PageHeader
                title={titulo}
                description={
                    color
                        ? `${[tela?.codigo, color.codigo].filter(Boolean).join('-')} · ${entero(color.rollos)} rollo${color.rollos === 1 ? '' : 's'} · ${num(color.fisico)} ${unidad} en almacén · ${num(color.disponible)} ${unidad} disponibles`
                        : 'Todos los documentos de este color'
                }
                actions={
                    <Button variant="secondary" onClick={volver}>
                        <ArrowLeft className="h-4 w-4" /> Volver al kardex
                    </Button>
                }
            />

            {error && <Alert variant="error" className="mb-4">{error}</Alert>}

            {movs === null && !error ? (
                <div className="flex items-center justify-center py-20">
                    <Spinner size="lg" className="text-primary-600" />
                </div>
            ) : (
                movs !== null && (
                    <DataTable
                        columns={columnas}
                        rows={filas}
                        searchPlaceholder="Buscar en este kardex..."
                        emptyMessage="Este color no tiene movimientos con estos filtros."
                        onRowClick={abrirDocumento}
                        // Una raya separa cada almacén: ahí empieza su propio stock.
                        rowClassName={(row) => (row._inicio ? 'border-t-2 border-t-primary-200' : '')}
                        filterable
                        filters={filters}
                        filterCount={Object.keys(activeFilters).length}
                        onApplyFilters={applyFilters}
                        onClearFilters={clearFilters}
                    />
                )
            )}
        </Layout>
    );
}
