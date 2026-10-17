import { useCallback, useEffect, useState } from 'react';
import { ArrowLeftRight, Ban, Check, Coins, HandCoins, Pencil, Printer, RotateCcw } from 'lucide-react';
import api, { asList } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import { destinoDe, useCatalogoDestinos } from '../lib/destinosCaja';
import { diaLocal } from '../lib/fechas';
import Layout from '../components/Layout';
import BottomSheet, { useSheet } from '../components/ui/BottomSheet';
import PageHeader from '../components/PageHeader';
import PdfViewerModal from '../components/PdfViewerModal';
import FiltroFechas from '../components/FiltroFechas';
import AprobarCierreModal from '../components/AprobarCierreModal';
import RecerrarCierreModal from '../components/RecerrarCierreModal';
import AnularMovimientoModal from '../components/AnularMovimientoModal';
import EditarMovimientoModal from '../components/EditarMovimientoModal';
import ConvertirEnAnticipoModal, { esConvertibleEnAnticipo } from '../components/ConvertirEnAnticipoModal';
import CambiarMetodoModal, { esCambiableDeMetodo } from '../components/CambiarMetodoModal';
import { Alert, Badge, Button, DataTable, Input, Modal, SearchSelect, Select } from '../components/ui';

const money = (n, moneda = 'PEN') =>
    new Intl.NumberFormat('es-PE', { style: 'currency', currency: moneda || 'PEN' }).format(Number(n) || 0);

const fechaHora = (v) => (v ? new Date(v).toLocaleString('es-PE') : '—');
const fechaCorta = (v) => (v ? new Date(v).toLocaleDateString('es-PE') : '—');

const esDigital = (m) => Boolean(m.cuenta_bancaria || m.billetera);

const metodoLabel = (m) => {
    if (m.cuenta_bancaria) return `Transf. · ${m.cuenta_bancaria.alias || m.cuenta_bancaria.numero_cuenta}`;
    if (m.billetera) return m.billetera.nombre;
    return 'Efectivo';
};

/** El estado del cierre: pendiente de aprobación, aprobado o anulado. */
const estadoCierre = (row) => {
    if (row.estado === 'pendiente') return <Badge variant="amber">Pendiente</Badge>;
    if (row.estado === 'anulado') return <Badge variant="red">Anulado</Badge>;
    return <Badge variant="green">Aprobado</Badge>;
};

export default function CierresCaja() {
    const { puede, user } = useAuth();
    const toast = useToast();
    const puedeAprobar = puede('tesoreria.cierres-caja.aprobar');
    const [accionando, setAccionando] = useState(null);
    /** El cierre que se está revisando para aprobar (modal). */
    const [cierreAprobar, setCierreAprobar] = useState(null);
    /** El cierre que se va a anular (se confirma en un modal) y el motivo que se escribe. */
    /** El cierre que se corrige con un recierre (lo contado, lo que se deja, la caja destino). */
    const [cierreRecerrar, setCierreRecerrar] = useState(null);
    const [cierreAnular, setCierreAnular] = useState(null);
    const [motivoAnulacion, setMotivoAnulacion] = useState('');
    const [cierres, setCierres] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    /** Cierre cuyos movimientos se muestran abajo. */
    const [seleccionado, setSeleccionado] = useState(null);
    const sheet = useSheet();
    const [pdfTarget, setPdfTarget] = useState(null);
    const [movimientos, setMovimientos] = useState([]);
    const [cargandoDetalle, setCargandoDetalle] = useState(false);
    /** El movimiento que se edita o se anula desde la tabla de abajo, y lo que ofrecen los selectores del modal. */
    const [movEditar, setMovEditar] = useState(null);
    const [movAnular, setMovAnular] = useState(null);
    const [movConvertir, setMovConvertir] = useState(null);
    const [movMetodo, setMovMetodo] = useState(null);
    const [catalogos, setCatalogos] = useState({ cuentas: [], billeteras: [], motivos: [] });

    // Desde y hasta, a la vista; filtran por la fecha del cierre. Vacíos muestran todos.
    const [fDesde, setFDesde] = useState('');
    const [fHasta, setFHasta] = useState('');
    const [filtroCaja, setFiltroCaja] = useState('');
    const [filtroDiferencia, setFiltroDiferencia] = useState('');
    const [filtrosActivos, setFiltrosActivos] = useState({});

    /** Filtro de los movimientos del cierre: '' (todos), 'efectivo' o 'digital' (transferencia, Yape, billetera). */
    const [filtroTipoMov, setFiltroTipoMov] = useState('');
    const [tipoMovActivo, setTipoMovActivo] = useState('');
    const [filtroCuenta, setFiltroCuenta] = useState('');
    const [cuentaActiva, setCuentaActiva] = useState('');

    // Al cambiar de cierre, los filtros de movimientos empiezan de cero (la cuenta elegida puede no existir en el otro).
    useEffect(() => {
        setFiltroTipoMov(''); setTipoMovActivo(''); setFiltroCuenta(''); setCuentaActiva('');
    }, [seleccionado?.id]);

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

    useEffect(() => {
        if (!puedeAprobar) return;
        Promise.all([api.get('/cuentas-bancarias'), api.get('/billeteras-digitales'), api.get('/motivos-movimiento?ambito=caja')])
            .then(([cue, bil, mot]) => setCatalogos({ cuentas: asList(cue), billeteras: asList(bil), motivos: asList(mot) }))
            .catch(() => {});
    }, [puedeAprobar]);

    // Tras un cambio el cierre se recalcula: la fila elegida se toma de la lista nueva y sus movimientos se vuelven a pedir.
    useEffect(() => {
        setSeleccionado((prev) => {
            if (!prev) return prev;
            const nuevo = cierres.find((c) => c.id === prev.id);
            return nuevo && nuevo !== prev ? nuevo : prev;
        });
    }, [cierres]);

    const aprobar = async (row) => {
        setAccionando(row.id);
        try {
            await api.post(`/cierres-caja/${row.id}/aprobar`);
            toast.success('Cierre aprobado: la caja ya se puede abrir con lo que se dejó.');
            await load();
        } catch (err) {
            const v = err.response?.data?.errors ?? {};
            toast.error(Object.values(v)[0]?.[0] ?? err.response?.data?.message ?? 'No se pudo aprobar el cierre.');
        } finally {
            setAccionando(null);
        }
    };

    /** Abre el modal de confirmación: anular un cierre no se hace de un clic. */
    const pedirAnulacion = (row) => {
        setMotivoAnulacion('');
        setCierreAnular(row);
    };

    const anular = async () => {
        const row = cierreAnular;
        if (!row) return;
        setAccionando(row.id);
        try {
            await api.post(`/cierres-caja/${row.id}/anular`, { motivo: motivoAnulacion.trim() || 'Anulado por quien aprueba' });
            setCierreAnular(null);
            toast.success(row.caja_reabierta ? 'Cierre anulado: su retiro dejó de contar.' : 'Cierre anulado: la caja quedó abierta de nuevo.');
            await load();
        } catch (err) {
            const v = err.response?.data?.errors ?? {};
            toast.error(Object.values(v)[0]?.[0] ?? err.response?.data?.message ?? 'No se pudo anular el cierre.');
        } finally {
            setAccionando(null);
        }
    };

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
        const dia = c.fecha_cierre ? diaLocal(c.fecha_cierre) : '';
        if (fDesde && (!dia || dia < fDesde)) return false;
        if (fHasta && (!dia || dia > fHasta)) return false;
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
            <SearchSelect
                label="Caja"
                value={filtroCaja}
                onChange={(v) => setFiltroCaja(v ?? '')}
                placeholder="Todas"
                emptyText="Sin coincidencias"
                options={cajasPresentes}
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
        </div>
    );

    const badgeDe = (valor, moneda) => {
        const dif = Number(valor) || 0;
        if (Math.abs(dif) < 0.001) return <Badge variant="green">Cuadró{moneda === 'USD' ? ' (US$)' : ''}</Badge>;
        return (
            <Badge variant={dif < 0 ? 'red' : 'amber'}>
                {dif < 0 ? 'Faltó ' : 'Sobró '}
                {money(Math.abs(dif), moneda)}
            </Badge>
        );
    };

    const diferenciaBadge = (row) =>
        row.diferencia_usd != null ? (
            <span className="flex flex-col items-start gap-1">
                {badgeDe(row.diferencia, 'PEN')}
                {badgeDe(row.diferencia_usd, 'USD')}
            </span>
        ) : (
            badgeDe(row.diferencia, 'PEN')
        );

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
                    <span className="truncate">{row.apertura?.caja?.codigo ? `${row.apertura.caja.codigo} · ` : ''}{row.apertura?.caja?.nombre ?? '—'}</span>
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
            render: (row) => (
                <span className="font-semibold text-warm-900">
                    {money(row.monto_contado)}
                    {row.monto_contado_usd != null && (
                        <span className="block text-xs font-normal text-warm-500">{money(row.monto_contado_usd, 'USD')}</span>
                    )}
                </span>
            ),
        },
        {
            key: 'diferencia',
            label: 'Diferencia',
            width: '150px',
            searchable: false,
            render: diferenciaBadge,
        },
        {
            // Lo que queda en el cajón para el turno siguiente y lo que salió con el movimiento de cierre.
            key: 'monto_dejado',
            label: 'Dejado',
            width: '120px',
            align: 'right',
            searchable: false,
            render: (row) => (
                <span className="text-warm-900">
                    {money(row.monto_dejado ?? row.monto_contado)}
                    {Number(row.monto_retirado) > 0 && (
                        <span className="block text-xs text-warm-500">
                            retiró {money(row.monto_retirado)}
                            {row.caja_destino ? ` → ${row.caja_destino.codigo ?? row.caja_destino.nombre}` : ''}
                        </span>
                    )}
                </span>
            ),
        },
        {
            key: 'estado',
            label: 'Estado',
            width: '150px',
            getSearchValue: (row) => row.estado,
            render: (row) => (
                <div className="leading-tight">
                    {estadoCierre(row)}
                    {row.veces_recerrado > 0 && (
                        <div className="mt-0.5 text-xs text-primary-700" title={row.recerrado_motivo ?? ''}>
                            corregido{row.veces_recerrado > 1 ? ` ${row.veces_recerrado} veces` : ''}{row.recerrador?.name ? ` por ${row.recerrador.name}` : ''}
                        </div>
                    )}
                    {row.estado === 'aprobado' && row.aprobador?.name && <div className="mt-0.5 text-xs text-warm-500">por {row.aprobador.name}</div>}
                    {row.estado === 'anulado' && row.anulador?.name && <div className="mt-0.5 text-xs text-warm-500">por {row.anulador.name}</div>}
                </div>
            ),
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
            width: '120px',
            actions: (row) => {
                // Aprueba quien tiene el permiso, nunca quien cerró. Anular reabre la caja (si nadie la abrió después).
                const esSuyo = Number(row.apertura?.usuario_id) === Number(user?.id);
                return (
                    <>
                        {puedeAprobar && row.estado === 'pendiente' && !esSuyo && (
                            <button aria-label="Aprobar cierre" title="Aprobar cierre" disabled={accionando === row.id}
                                onClick={(e) => { e.stopPropagation(); setCierreAprobar(row.id); }}
                                className="rounded-md p-1.5 text-green-600 transition hover:bg-green-50 hover:text-green-700 disabled:opacity-50">
                                <Check className="h-4 w-4" />
                            </button>
                        )}
                        {puede('tesoreria.cierres-caja.recerrar') && (row.estado !== 'anulado' || puedeVolverACerrar(row)) && (
                            <button aria-label="Recierre" title="Recierre: corrige lo contado y lo que se deja sin reabrir la caja" disabled={accionando === row.id}
                                onClick={(e) => { e.stopPropagation(); setCierreRecerrar(row); }}
                                className="rounded-md p-1.5 text-primary-600 transition hover:bg-primary-50 hover:text-primary-700 disabled:opacity-50">
                                <Pencil className="h-4 w-4" />
                            </button>
                        )}
                        {puede('tesoreria.cierres-caja.anular_cierre') && row.estado !== 'anulado' && (
                            <button aria-label="Anular cierre" title={row.caja_reabierta ? 'Anular cierre: anula el cierre y su retiro (la caja ya se abrió con otro turno)' : 'Anular cierre: reabre la caja para corregirlo'} disabled={accionando === row.id}
                                onClick={(e) => { e.stopPropagation(); pedirAnulacion(row); }}
                                className="rounded-md p-1.5 text-red-600 transition hover:bg-red-50 hover:text-red-700 disabled:opacity-50">
                                <RotateCcw className="h-4 w-4" />
                            </button>
                        )}
                        <button aria-label="Imprimir" title="Imprimir / PDF"
                            onClick={(e) => { e.stopPropagation(); setPdfTarget(row); }}
                            className="rounded-md p-1.5 text-warm-600 transition hover:bg-gray-100 hover:text-warm-900">
                            <Printer className="h-4 w-4" />
                        </button>
                    </>
                );
            },
        },
    ];

    const movimientosVisibles = movimientos.filter((m) => {
        if (tipoMovActivo === 'efectivo' && esDigital(m)) return false;
        if (tipoMovActivo === 'digital' && !esDigital(m)) return false;
        if (cuentaActiva && destinoDe(m) !== cuentaActiva) return false;
        return true;
    });

    /** Efectivo, cuentas bancarias y billeteras de la sucursal, según el tipo de movimiento elegido. */
    const opcionesDestino = useCatalogoDestinos();
    const destinos = opcionesDestino(filtroTipoMov, movimientos);

    const filtrosMov = (
        <div className="flex flex-wrap items-end gap-3">
            <Select
                label="Tipo de movimiento"
                value={filtroTipoMov}
                onChange={(e) => { setFiltroTipoMov(e.target.value); setFiltroCuenta(''); }}
                options={[
                    { value: '', label: 'Todos' },
                    { value: 'efectivo', label: 'Efectivo' },
                    { value: 'digital', label: 'Pagos digitales' },
                ]}
                className="w-52"
            />
            <Select
                label="Cuenta / billetera"
                value={filtroCuenta}
                onChange={(e) => setFiltroCuenta(e.target.value)}
                options={[{ value: '', label: 'Todas' }, ...destinos]}
                className="w-64"
            />
        </div>
    );
    const propsFiltroMov = {
        filterable: true,
        filters: filtrosMov,
        filterCount: (tipoMovActivo ? 1 : 0) + (cuentaActiva ? 1 : 0),
        onApplyFilters: () => { setTipoMovActivo(filtroTipoMov); setCuentaActiva(filtroCuenta); },
        onClearFilters: () => { setFiltroTipoMov(''); setTipoMovActivo(''); setFiltroCuenta(''); setCuentaActiva(''); },
    };

    /** Un cierre anulado se vuelve a cerrar si su turno quedó cerrado y no tiene otro cierre vigente. */
    const puedeVolverACerrar = (row) =>
        row.estado === 'anulado' &&
        row.apertura?.estado === 'cerrada' &&
        !cierres.some((c) => c.id !== row.id && c.apertura_caja_id === row.apertura_caja_id && c.estado !== 'anulado');

    const movColumns = [
        {
            key: 'idx',
            label: '#',
            width: '56px',
            searchable: false,
            render: (row) => <span className="text-warm-500">{movimientosVisibles.indexOf(row) + 1}</span>,
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
                <span className={row.deleted_at ? 'font-semibold text-gray-400 line-through' : row.tipo === 'ingreso' ? 'font-semibold text-green-600' : 'font-semibold text-red-600'}>
                    {row.tipo === 'ingreso' ? '+' : '-'} {money(row.monto, row.moneda)}
                </span>
            ),
        },
        {
            // Los anulados siguen en la lista, fuera de los totales, con su motivo.
            key: 'estado',
            label: 'Estado',
            width: '130px',
            getSearchValue: (row) => (row.deleted_at ? `Anulado ${row.anulado_motivo ?? ''}` : 'Vigente'),
            render: (row) =>
                row.deleted_at ? (
                    <div className="leading-tight">
                        <Badge variant="red">Anulado</Badge>
                        {row.anulado_motivo && <div className="mt-0.5 text-xs text-warm-500">{row.anulado_motivo}</div>}
                    </div>
                ) : (
                    <Badge variant="green">Vigente</Badge>
                ),
        },
        {
            // Quien gestiona los cierres edita o anula cualquier movimiento del turno; el cierre se recalcula.
            type: 'actions',
            key: 'acciones',
            label: 'Acc.',
            width: '160px',
            actions: (row) => {
                if (!seleccionado || row.deleted_at) return null;
                // Lo del cierre mismo (el retiro y el ingreso en la otra caja) se corrige con el recierre.
                if (row.documento_referencia_tipo === 'cierre_caja') return null;
                const doc = row.documento_referencia_tipo;
                const sePuedeAnular = !['compra', 'letra_cambio'].includes(doc) && !(row.motivo?.es_sistema && !doc);
                return (
                    <>
                        {puede('tesoreria.cierres-caja.modificar_cerrado') && (
                        <button
                            type="button"
                            aria-label="Editar movimiento"
                            title="Editar movimiento"
                            onClick={(e) => { e.stopPropagation(); setMovEditar({ ...row, apertura: seleccionado.apertura }); }}
                            className="rounded-md p-1.5 text-warm-600 transition hover:bg-gray-100 hover:text-warm-900"
                        >
                            <Pencil className="h-4 w-4" />
                        </button>
                        )}
                        {esCambiableDeMetodo(row) && puede('tesoreria.cierres-caja.modificar_cerrado') && (
                            <button
                                type="button"
                                aria-label="Cambiar método de pago"
                                title="Cambiar el método de pago (se anotó efectivo y fue transferencia, por ejemplo)"
                                onClick={(e) => { e.stopPropagation(); setMovMetodo({ ...row, apertura: seleccionado.apertura }); }}
                                className="rounded-md p-1.5 text-primary-600 transition hover:bg-primary-50 hover:text-primary-700"
                            >
                                <ArrowLeftRight className="h-4 w-4" />
                            </button>
                        )}
                        {esConvertibleEnAnticipo(row) && puede('tesoreria.cierres-caja.modificar_cerrado') && (
                            <button
                                type="button"
                                aria-label="Convertir en anticipo"
                                title="Convertir en anticipo de un cliente (era un ingreso que debió ser anticipo)"
                                onClick={(e) => { e.stopPropagation(); setMovConvertir({ ...row, apertura: seleccionado.apertura }); }}
                                className="rounded-md p-1.5 text-primary-600 transition hover:bg-primary-50 hover:text-primary-700"
                            >
                                <HandCoins className="h-4 w-4" />
                            </button>
                        )}
                        {sePuedeAnular && puede('tesoreria.cierres-caja.anular_movimiento') && (
                            <button
                                type="button"
                                aria-label="Anular movimiento"
                                title={doc === 'nota_venta' ? 'Anular el cobro: la proforma pasa a crédito' : 'Anular movimiento'}
                                onClick={(e) => { e.stopPropagation(); setMovAnular({ ...row, apertura: seleccionado.apertura }); }}
                                className="rounded-md p-1.5 text-red-600 transition hover:bg-red-50 hover:text-red-700"
                            >
                                <Ban className="h-4 w-4" />
                            </button>
                        )}
                    </>
                );
            },
        },
    ];

    const encabezadoMov = (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
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
                    {seleccionado.ingresos_usd != null && (
                        <span>
                            Dólares:{' '}
                            <strong className="text-warm-900">
                                +{money(seleccionado.ingresos_usd, 'USD')} / -{money(seleccionado.egresos_usd, 'USD')}
                            </strong>
                        </span>
                    )}
                </span>
            )}
        </div>
    );

    return (
        <Layout>
            <PageHeader
                title="Cierres de Caja"
                description="Registro de arqueos: lo esperado, lo contado y los movimientos de cada apertura"
                actions={<FiltroFechas desde={fDesde} hasta={fHasta} onDesde={setFDesde} onHasta={setFHasta} />}
            />

            {error && <Alert variant="error" className="mb-4">{error}</Alert>}

            <Modal
                open={cierreAnular !== null}
                onClose={() => setCierreAnular(null)}
                title="Anular cierre de caja"
                description={cierreAnular ? `${cierreAnular.apertura?.caja?.codigo ? `${cierreAnular.apertura.caja.codigo} · ` : ''}${cierreAnular.apertura?.caja?.nombre ?? ''} · ${cierreAnular.apertura?.usuario?.name ?? ''}` : ''}
                size="sm"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setCierreAnular(null)}>Cancelar</Button>
                        <Button variant="danger" loading={accionando === cierreAnular?.id} onClick={anular}>Anular cierre</Button>
                    </>
                }
            >
                <div className="space-y-3">
                    {cierreAnular?.caja_reabierta ? (
                        <Alert variant="warning">
                            La caja ya se abrió con otro turno. Se anulan <strong>el cierre y su retiro</strong> (y el ingreso en la caja destino, si lo
                            hubo), pero el turno de este cierre <strong>se queda cerrado</strong>.
                        </Alert>
                    ) : (
                        <Alert variant="warning">
                            La caja se <strong>reabre</strong> para que quien cerró cuente de nuevo y vuelva a cerrar. El retiro de este cierre deja de contar.
                        </Alert>
                    )}
                    <Input
                        label="Motivo (opcional)"
                        placeholder="Ej: se contó mal el efectivo"
                        value={motivoAnulacion}
                        onChange={(e) => setMotivoAnulacion(e.target.value)}
                    />
                </div>
            </Modal>

            <AnularMovimientoModal
                movimiento={movAnular}
                gestor
                url={movAnular && seleccionado ? `/cierres-caja/${seleccionado.id}/movimientos/${movAnular.id}/anular` : ''}
                onClose={() => setMovAnular(null)}
                onDone={() => {
                    setMovAnular(null);
                    load();
                }}
            />
            <CambiarMetodoModal
                movimiento={movMetodo}
                url={movMetodo && seleccionado ? `/cierres-caja/${seleccionado.id}/movimientos/${movMetodo.id}/cambiar-metodo` : ''}
                cuentas={catalogos.cuentas}
                billeteras={catalogos.billeteras}
                onClose={() => setMovMetodo(null)}
                onDone={() => {
                    setMovMetodo(null);
                    load();
                }}
            />
            <ConvertirEnAnticipoModal
                movimiento={movConvertir}
                url={movConvertir && seleccionado ? `/cierres-caja/${seleccionado.id}/movimientos/${movConvertir.id}/convertir-anticipo` : ''}
                onClose={() => setMovConvertir(null)}
                onDone={() => {
                    setMovConvertir(null);
                    load();
                }}
            />
            <EditarMovimientoModal
                movimiento={movEditar}
                gestor
                url={movEditar && seleccionado ? `/cierres-caja/${seleccionado.id}/movimientos/${movEditar.id}/editar` : ''}
                cuentas={catalogos.cuentas}
                billeteras={catalogos.billeteras}
                motivos={catalogos.motivos}
                onClose={() => setMovEditar(null)}
                onDone={() => {
                    setMovEditar(null);
                    load();
                }}
            />

            <RecerrarCierreModal cierre={cierreRecerrar} onClose={() => setCierreRecerrar(null)} onDone={load} />

            <AprobarCierreModal
                open={cierreAprobar !== null}
                cierreId={cierreAprobar}
                onClose={() => setCierreAprobar(null)}
                onDone={load}
            />

            <DataTable
                columns={columns}
                rows={visibles}
                loading={loading}
                searchPlaceholder="Buscar cierres..."
                filterable
                filters={filtros}
                filterCount={filtrosCount}
                onApplyFilters={aplicarFiltros}
                onClearFilters={limpiarFiltros}
                emptyMessage="Todavía no hay cierres de caja registrados."
                height="350px"
                onRowClick={(row) => { setSeleccionado(row); sheet.abrir(); }}
                rowClassName={(row) => (row.id === seleccionado?.id ? 'bg-primary-50' : undefined)}
            />

            {/* Móvil: los movimientos suben desde abajo al tocar una card (en escritorio no pinta nada). */}
            <BottomSheet
                open={sheet.open && Boolean(seleccionado)}
                onClose={sheet.cerrar}
                title={seleccionado ? `Movimientos${seleccionado.apertura?.caja?.nombre ? ` · ${seleccionado.apertura.caja.nombre}` : ''}` : ''}
                subtitle={seleccionado ? `${fechaCorta(seleccionado.fecha_cierre)} · ${movimientos.length} ${movimientos.length === 1 ? 'movimiento' : 'movimientos'}` : ''}
            >
                <DataTable
                    columns={movColumns}
                    rows={movimientosVisibles}
                    loading={cargandoDetalle}
                    searchable={false}
                    toggleableColumns={false}
                    {...propsFiltroMov}
                    emptyMessage="Esta apertura no tuvo movimientos."
                />
            </BottomSheet>

            {/* Movimientos entre la apertura y el cierre seleccionado (escritorio) */}
            <div className="mt-6 hidden md:block">
                {/* Mismo componente que la tabla de arriba: así en móvil se ven igual. */}
                <DataTable
                    columns={movColumns}
                    rows={movimientosVisibles}
                    loading={cargandoDetalle}
                    searchable={false}
                    toggleableColumns={false}
                    {...propsFiltroMov}
                    encabezado={encabezadoMov}
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
