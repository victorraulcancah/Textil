import { useCallback, useEffect, useState } from 'react';
import { Coins, Printer } from 'lucide-react';
import api, { asList } from '../lib/api';
import Layout from '../components/Layout';
import BottomSheet from '../components/ui/BottomSheet';
import PageHeader from '../components/PageHeader';
import PdfViewerModal from '../components/PdfViewerModal';
import { Alert, Badge, Button, DataTable, Select } from '../components/ui';

const money = (n) =>
    new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(Number(n) || 0);

const fechaHora = (v) => (v ? new Date(v).toLocaleString('es-PE') : '—');
const fechaCorta = (v) => (v ? new Date(v).toLocaleDateString('es-PE') : '—');

const metodoLabel = (m) => {
    if (m.cuenta_bancaria) return `Transf. · ${m.cuenta_bancaria.alias || m.cuenta_bancaria.numero_cuenta}`;
    if (m.billetera) return m.billetera.nombre;
    return 'Efectivo';
};

export default function CierresCaja() {
    const [cierres, setCierres] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    /** Cierre cuyos movimientos se muestran abajo. */
    const [seleccionado, setSeleccionado] = useState(null);
    const [pdfTarget, setPdfTarget] = useState(null);
    const [movimientos, setMovimientos] = useState([]);
    const [cargandoDetalle, setCargandoDetalle] = useState(false);

    const [filtroCaja, setFiltroCaja] = useState('');
    const [filtroDiferencia, setFiltroDiferencia] = useState('');
    const [filtrosActivos, setFiltrosActivos] = useState({});

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const lista = asList(await api.get('/cierres-caja'));
            setCierres(lista);
            setSeleccionado((prev) => lista.find((c) => c.id === prev?.id) ?? lista[0] ?? null);
        } catch {
            setError('No se pudieron cargar los cierres de caja.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    // Los movimientos se piden solo del cierre que se está viendo.
    useEffect(() => {
        if (!seleccionado) {
            setMovimientos([]);
            return;
        }
        let vivo = true;
        setCargandoDetalle(true);
        api.get(`/cierres-caja/${seleccionado.id}`)
            .then((res) => vivo && setMovimientos(res.data?.movimientos ?? []))
            .catch(() => vivo && setMovimientos([]))
            .finally(() => vivo && setCargandoDetalle(false));
        return () => {
            vivo = false;
        };
    }, [seleccionado]);

    const aplicarFiltros = () => {
        const next = {};
        if (filtroCaja) next.caja = filtroCaja;
        if (filtroDiferencia) next.diferencia = filtroDiferencia;
        setFiltrosActivos(next);
    };

    const limpiarFiltros = () => {
        setFiltroCaja('');
        setFiltroDiferencia('');
        setFiltrosActivos({});
    };

    const visibles = cierres.filter((c) => {
        if (filtrosActivos.caja && String(c.apertura?.caja?.id) !== filtrosActivos.caja) return false;
        const dif = Number(c.diferencia) || 0;
        if (filtrosActivos.diferencia === 'cuadra' && Math.abs(dif) > 0.001) return false;
        if (filtrosActivos.diferencia === 'falta' && dif >= -0.001) return false;
        if (filtrosActivos.diferencia === 'sobra' && dif <= 0.001) return false;
        return true;
    });

    const cajasPresentes = [
        ...new Map(
            cierres.filter((c) => c.apertura?.caja?.id).map((c) => [String(c.apertura.caja.id), c.apertura.caja.nombre]),
        ).entries(),
    ].map(([value, label]) => ({ value, label }));

    const filtrosCount = Object.keys(filtrosActivos).length;

    const filtros = (
        <div className="flex flex-wrap items-end gap-3">
            <Select
                label="Caja"
                value={filtroCaja}
                onChange={(e) => setFiltroCaja(e.target.value)}
                options={[{ value: '', label: 'Todas' }, ...cajasPresentes]}
                className="w-52"
            />
            <Select
                label="Diferencia"
                value={filtroDiferencia}
                onChange={(e) => setFiltroDiferencia(e.target.value)}
                options={[
                    { value: '', label: 'Todas' },
                    { value: 'cuadra', label: 'Cuadró' },
                    { value: 'falta', label: 'Faltó dinero' },
                    { value: 'sobra', label: 'Sobró dinero' },
                ]}
                className="w-48"
            />
            <Button variant="primary" size="sm" onClick={aplicarFiltros}>
                Aplicar
            </Button>
            {filtrosCount > 0 && (
                <Button variant="ghost" size="sm" onClick={limpiarFiltros}>
                    Limpiar
                </Button>
            )}
        </div>
    );

    const diferenciaBadge = (row) => {
        const dif = Number(row.diferencia) || 0;
        if (Math.abs(dif) < 0.001) return <Badge variant="green">Cuadró</Badge>;
        return (
            <Badge variant={dif < 0 ? 'red' : 'amber'}>
                {dif < 0 ? 'Faltó ' : 'Sobró '}
                {money(Math.abs(dif))}
            </Badge>
        );
    };

    const columns = [
        {
            key: 'idx',
            label: '#',
            width: '56px',
            render: (row) => <span className="text-warm-500">{cierres.indexOf(row) + 1}</span>,
        },
        {
            key: 'caja',
            label: 'Caja',
            width: '150px',
            getSearchValue: (row) => row.apertura?.caja?.nombre,
            render: (row) => (
                <span className="flex items-center gap-2 font-medium text-warm-900">
                    <Coins className="h-4 w-4 shrink-0 text-primary-600" />
                    <span className="truncate">{row.apertura?.caja?.nombre ?? '—'}</span>
                </span>
            ),
        },
        {
            key: 'usuario',
            label: 'Cajero',
            width: '140px',
            getSearchValue: (row) => row.apertura?.usuario?.name,
            render: (row) => <span className="block truncate">{row.apertura?.usuario?.name ?? '—'}</span>,
        },
        {
            key: 'apertura',
            label: 'Apertura',
            width: '150px',
            getSearchValue: (row) => fechaCorta(row.apertura?.fecha_apertura),
            render: (row) => (
                <span className="whitespace-nowrap text-warm-500">{fechaHora(row.apertura?.fecha_apertura)}</span>
            ),
        },
        {
            key: 'fecha_cierre',
            label: 'Cierre',
            width: '150px',
            getSearchValue: (row) => fechaCorta(row.fecha_cierre),
            render: (row) => <span className="whitespace-nowrap text-warm-900">{fechaHora(row.fecha_cierre)}</span>,
        },
        {
            key: 'monto_inicial',
            label: 'Inicial',
            width: '105px',
            align: 'right',
            searchable: false,
            render: (row) => <span className="text-warm-500">{money(row.apertura?.monto_inicial)}</span>,
        },
        {
            key: 'ingresos',
            label: 'Ingresos',
            width: '110px',
            align: 'right',
            searchable: false,
            render: (row) => <span className="text-green-600">{money(row.ingresos)}</span>,
        },
        {
            key: 'egresos',
            label: 'Gastos',
            width: '110px',
            align: 'right',
            searchable: false,
            render: (row) => <span className="text-red-600">{money(row.egresos)}</span>,
        },
        {
            key: 'monto_sistema',
            label: 'Esperado',
            width: '115px',
            align: 'right',
            searchable: false,
            render: (row) => <span className="text-warm-900">{money(row.monto_sistema)}</span>,
        },
        {
            key: 'monto_contado',
            label: 'Contado',
            width: '115px',
            align: 'right',
            searchable: false,
            render: (row) => <span className="font-semibold text-warm-900">{money(row.monto_contado)}</span>,
        },
        {
            key: 'diferencia',
            label: 'Diferencia',
            width: '150px',
            searchable: false,
            render: diferenciaBadge,
        },
        {
            key: 'movimientos_count',
            label: 'Movs.',
            width: '80px',
            align: 'right',
            searchable: false,
            render: (row) => <Badge variant="gray">{row.movimientos_count ?? 0}</Badge>,
        },
        {
            type: 'actions',
            key: 'actions',
            label: 'Acc.',
            width: '60px',
            actions: (row) => (
                <button aria-label="Imprimir" title="Imprimir / PDF"
                    onClick={(e) => { e.stopPropagation(); setPdfTarget(row); }}
                    className="rounded-md p-1.5 text-warm-600 transition hover:bg-gray-100 hover:text-warm-900">
                    <Printer className="h-4 w-4" />
                </button>
            ),
        },
    ];

    const movColumns = [
        {
            key: 'idx',
            label: '#',
            width: '56px',
            searchable: false,
            render: (row) => <span className="text-warm-500">{movimientos.indexOf(row) + 1}</span>,
        },
        {
            key: 'fecha',
            label: 'Fecha',
            width: '176px',
            getSearchValue: (row) => fechaCorta(row.fecha),
            render: (row) => <span className="whitespace-nowrap text-warm-500">{fechaHora(row.fecha)}</span>,
        },
        {
            key: 'tipo',
            label: 'Tipo',
            width: '110px',
            getSearchValue: (row) => (row.tipo === 'ingreso' ? 'Ingreso' : 'Gasto'),
            render: (row) => (
                <Badge variant={row.tipo === 'ingreso' ? 'green' : 'red'}>
                    {row.tipo === 'ingreso' ? 'Ingreso' : 'Gasto'}
                </Badge>
            ),
        },
        {
            key: 'motivo',
            label: 'Motivo',
            getSearchValue: (row) => `${row.motivo?.nombre ?? ''} ${row.descripcion ?? ''}`,
            render: (row) => (
                <div className="leading-tight">
                    <div className="text-warm-900">{row.motivo?.nombre ?? '—'}</div>
                    {row.descripcion && <div className="text-xs text-warm-500">{row.descripcion}</div>}
                </div>
            ),
        },
        {
            key: 'metodo',
            label: 'Método',
            width: '192px',
            getSearchValue: (row) => metodoLabel(row),
            render: (row) => <span className="block truncate text-warm-500">{metodoLabel(row)}</span>,
        },
        {
            key: 'monto',
            label: 'Monto',
            width: '144px',
            align: 'right',
            searchable: false,
            render: (row) => (
                <span className={row.tipo === 'ingreso' ? 'font-semibold text-green-600' : 'font-semibold text-red-600'}>
                    {row.tipo === 'ingreso' ? '+' : '-'} {money(row.monto)}
                </span>
            ),
        },
    ];

    return (
        <Layout>
            <PageHeader
                title="Cierres de Caja"
                description="Registro de arqueos: lo esperado, lo contado y los movimientos de cada apertura"
            />

            {error && <Alert variant="error" className="mb-4">{error}</Alert>}

            <DataTable
                columns={columns}
                rows={visibles}
                loading={loading}
                searchPlaceholder="Buscar cierres..."
                filterable
                filters={filtros}
                filterCount={filtrosCount}
                emptyMessage="Todavía no hay cierres de caja registrados."
                height="350px"
                onRowClick={(row) => setSeleccionado(row)}
                rowClassName={(row) => (row.id === seleccionado?.id ? 'bg-primary-50' : undefined)}
            />

            {/* Móvil: los movimientos suben desde abajo al tocar una card (en escritorio no pinta nada). */}
            <BottomSheet
                open={Boolean(seleccionado)}
                onClose={() => setSeleccionado(null)}
                title={seleccionado ? `Movimientos${seleccionado.apertura?.caja?.nombre ? ` · ${seleccionado.apertura.caja.nombre}` : ''}` : ''}
                subtitle={seleccionado ? `${fechaCorta(seleccionado.fecha_cierre)} · ${movimientos.length} ${movimientos.length === 1 ? 'movimiento' : 'movimientos'}` : ''}
            >
                <DataTable
                    columns={movColumns}
                    rows={movimientos}
                    loading={cargandoDetalle}
                    searchable={false}
                    toggleableColumns={false}
                    emptyMessage="Esta apertura no tuvo movimientos."
                />
            </BottomSheet>

            {/* Movimientos entre la apertura y el cierre seleccionado (escritorio) */}
            <div className="mt-6 hidden md:block">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold text-warm-900">
                        Movimientos
                        {seleccionado?.apertura?.caja?.nombre ? ` · ${seleccionado.apertura.caja.nombre}` : ''}
                        {seleccionado ? ` · ${fechaCorta(seleccionado.fecha_cierre)}` : ''}
                    </h2>
                    {seleccionado && (
                        <span className="flex flex-wrap items-center gap-3 text-xs text-warm-500">
                            <span>
                                {movimientos.length}{' '}
                                {movimientos.length === 1 ? 'movimiento' : 'movimientos'}
                            </span>
                            <span>
                                Efectivo:{' '}
                                <strong className="text-warm-900">
                                    {money(
                                        Number(seleccionado.apertura?.monto_inicial ?? 0) +
                                            Number(seleccionado.efectivo_ingresos ?? 0) -
                                            Number(seleccionado.efectivo_egresos ?? 0),
                                    )}
                                </strong>
                            </span>
                            <span>
                                Transferencias:{' '}
                                <strong className="text-warm-900">{money(seleccionado.transferencias)}</strong>
                            </span>
                            <span>
                                Billeteras:{' '}
                                <strong className="text-warm-900">{money(seleccionado.billeteras)}</strong>
                            </span>
                        </span>
                    )}
                </div>

                {/* Mismo componente que la tabla de arriba: así en móvil se ven igual. */}
                <DataTable
                    columns={movColumns}
                    rows={movimientos}
                    loading={cargandoDetalle}
                    searchable={false}
                    toggleableColumns={false}
                    height="350px"
                    emptyMessage={
                        seleccionado
                            ? 'Esta apertura no tuvo movimientos.'
                            : 'Selecciona un cierre arriba para ver sus movimientos.'
                    }
                />
            </div>

                    <PdfViewerModal
                open={Boolean(pdfTarget)}
                onClose={() => setPdfTarget(null)}
                tipo="cierre-caja"
                id={pdfTarget?.id}
                nombre={pdfTarget ? `Cierre #${String(pdfTarget.id).padStart(5, '0')}` : ''}
                titulo="Cierre de caja"
                formatos={['ticket']}
            />
        </Layout>
    );
}
