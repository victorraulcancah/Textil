import { useCallback, useEffect, useState } from 'react';
import { ArrowDownCircle, ArrowUpCircle, Ban, FileSignature, FileSpreadsheet, FileText, Lock, LockOpen, PiggyBank, RotateCcw, Smartphone, Trash2, Wallet } from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import { destinoDe, useCatalogoDestinos } from '../lib/destinosCaja';
import PagosCuentaModal from '../components/PagosCuentaModal';
import Layout from '../components/Layout';
import PageHeader from '../components/PageHeader';
import MetodoCajaPicker from '../components/MetodoCajaPicker';
import PdfViewerModal from '../components/PdfViewerModal';
import { Alert, Badge, Button, Card, DataTable, Input, Modal, SearchSelect, Select, Spinner } from '../components/ui';

const money = (n, moneda = 'PEN') =>
    new Intl.NumberFormat('es-PE', { style: 'currency', currency: moneda || 'PEN' }).format(Number(n) || 0);

const fechaHora = (v) => (v ? new Date(v).toLocaleString('es-PE') : '—');
const fechaCorta = (v) => {
    if (!v) return '—';
    const s = String(v).slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00`).toLocaleDateString('es-PE') : new Date(v).toLocaleDateString('es-PE');
};

const metodoLabel = (row) => {
    if (row.cuenta_bancaria) return `Transf. · ${row.cuenta_bancaria.alias || row.cuenta_bancaria.numero_cuenta}`;
    if (row.billetera) return row.billetera.nombre;
    return 'Efectivo';
};

const emptyMov = () => ({ motivo_movimiento_id: '', metodoTipo: '', cuentaId: '', billeteraId: '', numero_operacion: '', monto: '', descripcion: '' });

/** Un pago de la corrección: lo mismo que un cobro (método, cuenta o billetera, N.° de operación y monto). */
const emptyPagoCorregir = (monto = '') => ({ tipo: 'efectivo', cuentaId: '', billeteraId: '', referencia: '', monto });

/** Los movimientos que nacen de un cobro de venta o de cobranza: son los que se pueden corregir. */
const esCobroCorregible = (r) =>
    !r.deleted_at && r.tipo === 'ingreso' && ['nota_venta', 'cuenta_por_cobrar'].includes(r.documento_referencia_tipo) && Boolean(r.documento_referencia_id);

/** Tarjeta compacta de resumen. No usa Card porque su padding (p-6) es muy alto. */
function Stat({ icon: Icon, label, value, accent = 'text-warm-900', bg = 'bg-gray-100' }) {
    return (
        <div className="flex items-center gap-2.5 rounded-lg border border-edge bg-white px-3 py-2.5 shadow-sm">
            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${bg} ${accent}`}>
                <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
                <p className="truncate text-[11px] uppercase tracking-wide text-warm-500">{label}</p>
                <p className={`truncate text-base font-bold ${accent}`}>{value}</p>
            </div>
        </div>
    );
}

export default function MiCaja() {
    const toast = useToast();
    const { puede } = useAuth();
    const opcionesDestino = useCatalogoDestinos();
    /** Amortización de documentos desde la caja, separada: 'cobrar' (ingreso) o 'pagar' (egreso). */
    const [amortizar, setAmortizar] = useState(null);
    /** El reporte de la caja del día en PDF: { url } mientras se ve. */
    const [reportePdf, setReportePdf] = useState(null);
    const [data, setData] = useState(null);
    const [motivos, setMotivos] = useState([]);
    const [loading, setLoading] = useState(true);

    const [abrirOpen, setAbrirOpen] = useState(false);
    const [montoInicial, setMontoInicial] = useState('');
    const [cerrarOpen, setCerrarOpen] = useState(false);
    const [montoContado, setMontoContado] = useState('');
    // Los dólares del cajón se cuentan aparte.
    const [montoContadoUsd, setMontoContadoUsd] = useState('');
    /** Lo que se deja en el cajón para el turno siguiente; el resto sale con el movimiento de cierre. */
    const [montoDejado, setMontoDejado] = useState('');
    /** La otra caja a la que se envía el efectivo retirado, y las que hay para elegir. */
    const [cajaDestino, setCajaDestino] = useState('');
    const [cajasDestino, setCajasDestino] = useState([]);

    const [regTipo, setRegTipo] = useState(null); // 'ingreso' | 'egreso'
    const [mov, setMov] = useState(emptyMov());
    const [saving, setSaving] = useState(false);
    /** Anular un movimiento registrado a mano: el elegido y el motivo. */
    const [anularMov, setAnularMov] = useState(null);
    const [motivoAnulacion, setMotivoAnulacion] = useState('');
    /** Corregir un cobro: el movimiento elegido y los pagos nuevos que lo reemplazan. */
    const [corregir, setCorregir] = useState(null);
    const [pagosNuevos, setPagosNuevos] = useState([]);

    // ── Filtros de la tabla de movimientos ──
    /** Tipo de movimiento: '' (todos), 'efectivo' (el cajón) o 'digital' (transferencia, Yape, billetera). */
    const [filtroTipoMov, setFiltroTipoMov] = useState('');
    const [filtroTipo, setFiltroTipo] = useState('');
    const [filtroMotivo, setFiltroMotivo] = useState('');
    const [filtroCuenta, setFiltroCuenta] = useState('');
    const [filtrosActivos, setFiltrosActivos] = useState({});


    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [miRes, motRes] = await Promise.all([api.get('/mi-caja'), api.get('/motivos-movimiento?ambito=caja')]);
            setData(miRes.data);
            setMotivos(Array.isArray(motRes.data) ? motRes.data : (motRes.data?.data ?? []));
        } catch {
            toast.error('No se pudo cargar tu caja.');
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        load();
    }, [load]);

    /** El Excel de la caja del día (el servidor lo arma con la apertura de quien consulta). */
    const descargarReporteExcel = async () => {
        try {
            const { data } = await api.get('/mi-caja/reporte/excel', { responseType: 'blob' });
            const url = URL.createObjectURL(data);
            const a = document.createElement('a');
            a.href = url;
            a.download = `caja-${new Date().toLocaleDateString('en-CA')}.xlsx`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 4000);
        } catch {
            toast.error('No se pudo generar el reporte de caja.');
        }
    };

    const abrir = async () => {
        setSaving(true);
        try {
            // Con un cierre previo el servidor abre con lo que quedó en la caja; aquí solo cuenta la primera vez.
            const res = await api.post('/mi-caja/abrir', { monto_inicial: saldoAnterior ? saldoAnterior.monto : Number(montoInicial) || 0 });
            setData(res.data);
            setAbrirOpen(false);
            setMontoInicial('');
            toast.success('Caja abierta.');
        } catch (err) {
            toast.error(err.response?.data?.message ?? 'No se pudo abrir la caja.');
        } finally {
            setSaving(false);
        }
    };

    const cerrar = async () => {
        if ((Number(montoDejado) || 0) > (Number(montoContado) || 0) + 0.001) {
            toast.error('No puedes dejar más de lo que contaste.');
            return;
        }
        setSaving(true);
        try {
            const res = await api.post('/mi-caja/cerrar', {
                monto_contado: Number(montoContado) || 0,
                monto_dejado: Number(montoDejado) || 0,
                ...(cajaDestino ? { caja_destino_id: Number(cajaDestino) } : {}),
                ...(montoContadoUsd !== '' ? { monto_contado_usd: Number(montoContadoUsd) || 0 } : {}),
            });
            setData(res.data);
            setCerrarOpen(false);
            setMontoContado('');
            setMontoContadoUsd('');
            setMontoDejado('');
            setCajaDestino('');
            toast.success('Cierre registrado: queda pendiente de aprobación.');
        } catch (err) {
            const errores = err.response?.data?.errors;
            toast.error(errores ? Object.values(errores)[0]?.[0] : err.response?.data?.message ?? 'No se pudo cerrar la caja.');
        } finally {
            setSaving(false);
        }
    };

    /** Quien pidió el cierre lo anula mientras está pendiente: la caja se reabre para corregirlo y cerrar otra vez. */
    const anularCierre = async () => {
        setSaving(true);
        try {
            const res = await api.post('/mi-caja/cierre/anular');
            setData(res.data);
            toast.success('Cierre anulado: tu caja está abierta de nuevo para corregirlo.');
        } catch (err) {
            const v = err.response?.data?.errors ?? {};
            toast.error(Object.values(v)[0]?.[0] ?? err.response?.data?.message ?? 'No se pudo anular el cierre.');
        } finally {
            setSaving(false);
        }
    };

    const registrar = async () => {
        setSaving(true);
        try {
            await api.post('/movimientos-caja', {
                tipo: regTipo,
                motivo_movimiento_id: mov.motivo_movimiento_id,
                forma: mov.metodoTipo,
                cuenta_bancaria_id: mov.cuentaId || null,
                billetera_id: mov.billeteraId || null,
                numero_operacion: mov.numero_operacion || null,
                monto: mov.monto,
                descripcion: mov.descripcion || null,
            });
            setRegTipo(null);
            toast.success(regTipo === 'ingreso' ? 'Ingreso registrado.' : 'Gasto registrado.');
            await load();
        } catch (err) {
            const v = err.response?.data?.errors ?? {};
            toast.error(Object.values(v)[0]?.[0] ?? err.response?.data?.message ?? 'No se pudo registrar.');
        } finally {
            setSaving(false);
        }
    };

    /** El cobro que se anula: en una venta, todos sus pagos; en una cobranza, solo ese. */
    const cobroOriginal = (fila) => {
        if (!fila) return [];
        const todos = data?.movimientos ?? [];
        if (fila.documento_referencia_tipo === 'nota_venta') {
            return todos.filter((m) => !m.deleted_at && m.tipo === 'ingreso' && m.documento_referencia_tipo === 'nota_venta' && String(m.documento_referencia_id) === String(fila.documento_referencia_id));
        }
        return todos.filter((m) => m.id === fila.id);
    };

    const abrirCorregir = (fila) => {
        const total = cobroOriginal(fila).reduce((acc, m) => acc + (Number(m.monto) || 0), 0);
        setCorregir(fila);
        setPagosNuevos([emptyPagoCorregir(String(Math.round(total * 100) / 100))]);
    };

    const confirmarAnulacion = async () => {
        setSaving(true);
        try {
            const res = await api.post(`/mi-caja/movimientos/${anularMov.id}/anular`, { motivo: motivoAnulacion.trim() || null });
            setData(res.data);
            setAnularMov(null);
            toast.success('Movimiento anulado: ya no cuenta en tu caja.');
        } catch (err) {
            const v = err.response?.data?.errors ?? {};
            toast.error(Object.values(v)[0]?.[0] ?? err.response?.data?.message ?? 'No se pudo anular el movimiento.');
        } finally {
            setSaving(false);
        }
    };

    const setPagoNuevo = (i, patch) => setPagosNuevos((prev) => prev.map((p, k) => (k === i ? { ...p, ...patch } : p)));

    const confirmarCorreccion = async () => {
        setSaving(true);
        try {
            const res = await api.post(`/mi-caja/movimientos/${corregir.id}/corregir-pago`, {
                pagos: pagosNuevos.map((p) => ({
                    forma_pago: p.tipo,
                    cuenta_bancaria_id: p.tipo === 'transferencia' ? p.cuentaId || null : null,
                    billetera_id: p.tipo === 'billetera' ? p.billeteraId || null : null,
                    monto: Number(p.monto),
                    referencia: p.tipo !== 'efectivo' ? (p.referencia || '').trim() || null : null,
                })),
            });
            setData(res.data);
            setCorregir(null);
            toast.success('Cobro corregido: se anuló el anterior y se registraron los nuevos pagos.');
        } catch (err) {
            const v = err.response?.data?.errors ?? {};
            toast.error(Object.values(v)[0]?.[0] ?? err.response?.data?.message ?? 'No se pudo corregir el cobro.');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <Layout>
                <div className="flex items-center justify-center py-24"><Spinner size="lg" className="text-primary-600" /></div>
            </Layout>
        );
    }

    const caja = data?.caja;
    const apertura = data?.apertura;
    /** Lo que dejó el último cierre: con eso abre quien sigue. */
    const saldoAnterior = data?.saldo_anterior ?? null;
    const resumen = data?.resumen;
    const movimientos = data?.movimientos ?? [];
    const esperado = resumen?.esperado ?? 0;
    // Yape y transferencias quedan registrados, pero el dinero va al banco:
    // no se cuentan en el arqueo del cajón.
    const otrosMedios = (resumen?.otros_ingresos ?? 0) - (resumen?.otros_egresos ?? 0);
    const diferencia = (Number(montoContado) || 0) - esperado;
    /** Lo que sale de la caja al cerrar: lo contado menos lo que se deja para el siguiente. */
    const retirado = (Number(montoContado) || 0) - (Number(montoDejado) || 0);
    // Los dólares (ventas o cobros en dólares) van aparte: null si no hubo.
    const dolares = resumen?.dolares ?? null;
    const diferenciaUsd = (Number(montoContadoUsd) || 0) - (dolares?.esperado ?? 0);

    // Opciones de método según lo que acepta la caja.
    const motivosTipo = motivos.filter(
        (m) => !m.es_sistema && (regTipo === 'ingreso' ? m.tipo === 'entrada' : m.tipo === 'salida'),
    );
    const requiereOperacion = mov.metodoTipo === 'transferencia' || mov.metodoTipo === 'billetera';

    /** Método real del movimiento, deducido de la cuenta o billetera asociada. */
    const metodoDe = (r) => (r.cuenta_bancaria ? 'transferencia' : r.billetera ? 'billetera' : 'efectivo');

    const aplicarFiltros = () => {
        const next = {};
        if (filtroTipoMov) next.tipoMov = filtroTipoMov;
        if (filtroTipo) next.tipo = filtroTipo;
        if (filtroMotivo) next.motivo = filtroMotivo;
        if (filtroCuenta) next.cuenta = filtroCuenta;
        setFiltrosActivos(next);
    };

    const limpiarFiltros = () => {
        setFiltroTipoMov('');
        setFiltroTipo('');
        setFiltroMotivo('');
        setFiltroCuenta('');
        setFiltrosActivos({});
    };

    const movimientosFiltrados = movimientos.filter((r) => {
        if (filtrosActivos.tipoMov === 'efectivo' && metodoDe(r) !== 'efectivo') return false;
        if (filtrosActivos.tipoMov === 'digital' && metodoDe(r) === 'efectivo') return false;
        if (filtrosActivos.tipo && r.tipo !== filtrosActivos.tipo) return false;
        if (filtrosActivos.motivo && String(r.motivo_movimiento_id) !== filtrosActivos.motivo) return false;
        if (filtrosActivos.cuenta && destinoDe(r) !== filtrosActivos.cuenta) return false;
        return true;
    });

    const filtrosCount = Object.keys(filtrosActivos).length;

    /** Solo los motivos que aparecen en los movimientos de esta apertura. */
    const motivosPresentes = [
        ...new Map(
            movimientos
                .filter((r) => r.motivo?.id)
                .map((r) => [String(r.motivo.id), r.motivo.nombre]),
        ).entries(),
    ]
        .map(([value, label]) => ({ value, label }))
        .sort((a, b) => a.label.localeCompare(b.label, 'es'));

    const filtros = (
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
                label="Tipo"
                value={filtroTipo}
                onChange={(e) => setFiltroTipo(e.target.value)}
                options={[
                    { value: '', label: 'Todos' },
                    { value: 'ingreso', label: 'Ingreso' },
                    { value: 'egreso', label: 'Gasto' },
                ]}
                className="w-40"
            />
            <SearchSelect
                label="Motivo"
                value={filtroMotivo}
                onChange={(v) => setFiltroMotivo(v ?? '')}
                placeholder="Todos"
                emptyText="Sin coincidencias"
                options={motivosPresentes}
                className="w-56"
            />
            <Select
                label="Cuenta / billetera"
                value={filtroCuenta}
                onChange={(e) => setFiltroCuenta(e.target.value)}
                options={[{ value: '', label: 'Todas' }, ...opcionesDestino(filtroTipoMov, movimientos)]}
                className="w-64"
            />
        </div>
    );

    const columns = [
        { key: 'fecha', label: 'Fecha', getSearchValue: (r) => fechaCorta(r.fecha), render: (r) => <>{fechaCorta(r.fecha)}<span className="block text-xs text-warm-500">{r.created_at ? new Date(r.created_at).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }) : ''}</span></> },
        { key: 'tipo', label: 'Tipo', getSearchValue: (r) => (r.tipo === 'ingreso' ? 'Ingreso' : 'Gasto'), render: (r) => <Badge variant={r.tipo === 'ingreso' ? 'green' : 'red'}>{r.tipo === 'ingreso' ? 'Ingreso' : 'Gasto'}</Badge> },
        {
            key: 'motivo',
            label: 'Motivo',
            // Sin esto la búsqueda compararía contra el objeto, no contra el texto.
            getSearchValue: (r) => `${r.motivo?.nombre ?? ''} ${r.descripcion ?? ''}`,
            render: (r) => (
                <div className="leading-tight">
                    <div className="text-warm-900">{r.motivo?.nombre ?? '—'}</div>
                    {r.descripcion && <div className="text-xs text-warm-500">{r.descripcion}</div>}
                </div>
            ),
        },
        {
            // Mis movimientos de todos mis turnos: se distingue el de ahora de los anteriores.
            key: 'turno',
            label: 'Turno',
            getSearchValue: (r) => (r.apertura_caja_id === apertura?.id ? 'Actual' : fechaCorta(r.apertura?.fecha_apertura)),
            render: (r) =>
                r.apertura_caja_id === apertura?.id ? (
                    <Badge variant="blue">Actual</Badge>
                ) : (
                    <span className="text-xs text-warm-500">{fechaCorta(r.apertura?.fecha_apertura)}</span>
                ),
        },
        { key: 'metodo', label: 'Método', getSearchValue: (r) => metodoLabel(r), render: (r) => metodoLabel(r) },
        { key: 'monto', label: 'Monto', align: 'right', render: (r) => <span className={r.deleted_at ? 'text-gray-400 line-through' : r.tipo === 'ingreso' ? 'text-green-600' : 'text-red-600'}>{r.tipo === 'ingreso' ? '+' : '-'} {money(r.monto, r.moneda)}</span> },
        {
            // Los anulados siguen en la lista, fuera de los totales, con el motivo.
            key: 'estado',
            label: 'Estado',
            getSearchValue: (r) => (r.deleted_at ? `Anulado ${r.anulado_motivo ?? ''}` : 'Vigente'),
            render: (r) =>
                r.deleted_at ? (
                    <div className="leading-tight">
                        <Badge variant="red">Anulado</Badge>
                        {r.anulado_motivo && <div className="mt-0.5 text-xs text-warm-500">{r.anulado_motivo}</div>}
                    </div>
                ) : (
                    <Badge variant="green">Vigente</Badge>
                ),
        },
        {
            // Un cobro de venta o de cobranza se puede corregir mientras la caja siga abierta.
            type: 'actions',
            key: 'acciones',
            label: 'Acciones',
            actions: (r) => {
                if (r.deleted_at) return null;
                const delTurnoActual = Boolean(apertura) && r.apertura_caja_id === apertura.id;
                const esDigital = Boolean(r.cuenta_bancaria || r.billetera);

                // Lo que nace de una venta o cobranza se corrige con sus pagos nuevos (en la caja abierta).
                if (delTurnoActual && esCobroCorregible(r)) {
                    return (
                        <button
                            type="button"
                            aria-label="Corregir pago"
                            title="Corregir pago: anula este cobro y registra los pagos nuevos"
                            onClick={(e) => { e.stopPropagation(); abrirCorregir(r); }}
                            className="rounded-md p-1.5 text-primary-600 transition hover:bg-primary-50 hover:text-primary-700"
                        >
                            <RotateCcw className="h-4 w-4" />
                        </button>
                    );
                }

                // Un ingreso o gasto registrado a mano se anula directo. Si es digital (transferencia o Yape) también de un
                // turno ya cerrado, porque ese dinero no está en el cajón; el efectivo, solo en la caja abierta.
                if (!r.documento_referencia_tipo && !r.motivo?.es_sistema && (esDigital || delTurnoActual)) {
                    return (
                        <button
                            type="button"
                            aria-label="Anular movimiento"
                            title="Anular este movimiento: deja de contar y queda en la lista como anulado"
                            onClick={(e) => { e.stopPropagation(); setAnularMov(r); setMotivoAnulacion(''); }}
                            className="rounded-md p-1.5 text-red-600 transition hover:bg-red-50 hover:text-red-700"
                        >
                            <Ban className="h-4 w-4" />
                        </button>
                    );
                }

                return null;
            },
        },
    ];

    /** Todos mis movimientos: con la caja abierta y también con la caja cerrada. */
    const tablaMovimientos = (
        <DataTable
            columns={columns}
            rows={movimientosFiltrados}
            rowClassName={(r) => (r.deleted_at ? 'bg-gray-50 text-gray-400' : undefined)}
            searchPlaceholder="Buscar movimientos..."
            filterable
            filters={filtros}
            filterCount={filtrosCount}
            onApplyFilters={aplicarFiltros}
            onClearFilters={limpiarFiltros}
            toggleableColumns={false}
            emptyMessage={
                filtrosCount > 0
                    ? 'Ningún movimiento coincide con los filtros.'
                    : 'Aún no hay movimientos. Registra un ingreso o gasto.'
            }
            maxHeight="50vh"
        />
    );

    const openReg = (tipo) => {
        setRegTipo(tipo);
        setMov(emptyMov());
    };

    return (
        <Layout>
            <PageHeader title="Mi Caja" description="Abre tu caja, registra ingresos y gastos, y ciérrala con arqueo" />

            {!caja ? (
                <Alert variant="warning">
                    No tienes una caja asignada. Pide a un administrador que te asigne una en <strong>Tesorería → Cajas</strong>.
                </Alert>
            ) : (
                <>
                    <Card className="mb-6 flex flex-wrap items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-50 text-primary-600"><Wallet className="h-6 w-6" /></div>
                            <div>
                                <h2 className="text-lg font-bold text-warm-900">{caja.codigo ? `${caja.codigo} · ` : ''}{caja.nombre}</h2>
                                {apertura && <p className="text-sm text-warm-500">Abierta desde {fechaHora(apertura.fecha_apertura)}</p>}
                            </div>
                        </div>
                        {apertura ? <Badge variant="green">Abierta</Badge> : <Badge variant="gray">Cerrada</Badge>}
                    </Card>

                    {/* Una caja compartida la tiene abierta otro usuario: se ve cuál y desde cuándo, y no se opera. */}
                    {data?.ocupada_por && (
                        <Alert variant="warning" className="mb-4">
                            <strong>La caja está en uso.</strong> La tiene abierta <strong>{data.ocupada_por.name ?? 'otro usuario'}</strong>
                            {data.ocupada_por.desde ? ` desde ${fechaHora(data.ocupada_por.desde)}` : ''}. Podrás abrirla cuando la cierre.
                        </Alert>
                    )}

                    {apertura ? (
                        <>
                            <div className="mb-4 flex flex-wrap gap-2">
                                <Button variant="success" onClick={() => openReg('ingreso')}><ArrowUpCircle className="h-4 w-4" /> Nuevo ingreso</Button>
                                <Button variant="danger" onClick={() => openReg('egreso')}><ArrowDownCircle className="h-4 w-4" /> Nuevo gasto</Button>
                                {/* Cobrar (ingreso) o pagar (egreso) un documento pendiente con esta caja abierta: dos accesos separados. */}
                                {puede('tesoreria.cuentas-por-cobrar.crear') && (
                                    <Button variant="secondary" onClick={() => setAmortizar('cobrar')}><FileSignature className="h-4 w-4" /> Cobrar documento</Button>
                                )}
                                {puede('tesoreria.cuentas-por-pagar.crear') && (
                                    <Button variant="secondary" onClick={() => setAmortizar('pagar')}><FileSignature className="h-4 w-4" /> Pagar documento</Button>
                                )}
                                {/* El reporte de la caja del día: resumen, lo cobrado por cada cuenta y todos los movimientos. */}
                                <Button variant="secondary" onClick={descargarReporteExcel}><FileSpreadsheet className="h-4 w-4" /> Excel</Button>
                                <Button variant="secondary" onClick={() => setReportePdf({ url: '/mi-caja/reporte/pdf' })}><FileText className="h-4 w-4" /> PDF</Button>
                                <Button variant="secondary" onClick={() => {
                                    setCerrarOpen(true); setMontoContado(''); setMontoContadoUsd(''); setMontoDejado(''); setCajaDestino('');
                                    api.get('/mi-caja/cajas-destino').then(({ data: lista }) => setCajasDestino(Array.isArray(lista) ? lista : [])).catch(() => setCajasDestino([]));
                                }}><Lock className="h-4 w-4" /> Cerrar caja</Button>
                            </div>

                            <div className="mb-4 grid grid-cols-2 gap-2 lg:grid-cols-5">
                                <Stat icon={PiggyBank} label="Monto inicial" value={money(resumen?.monto_inicial)} />
                                <Stat icon={ArrowUpCircle} label="Ingresos" value={money(resumen?.ingresos)} accent="text-green-600" bg="bg-green-50" />
                                <Stat icon={ArrowDownCircle} label="Gastos" value={money(resumen?.egresos)} accent="text-red-600" bg="bg-red-50" />
                                <Stat icon={Wallet} label="Efectivo esperado" value={money(esperado)} accent="text-primary-600" bg="bg-primary-50" />
                                {/* Lo cobrado por transferencia, Yape o billetera: queda registrado pero no está en el cajón. */}
                                <Stat icon={Smartphone} label="Cobros digitales" value={money(resumen?.otros_ingresos)} accent="text-violet-600" bg="bg-violet-50" />
                            </div>
                            {dolares && (
                                <div className="mb-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
                                    <Stat icon={ArrowUpCircle} label="Ingresos en dólares" value={money(dolares.ingresos, 'USD')} accent="text-green-600" bg="bg-green-50" />
                                    <Stat icon={ArrowDownCircle} label="Egresos en dólares" value={money(dolares.egresos, 'USD')} accent="text-red-600" bg="bg-red-50" />
                                    <Stat icon={Wallet} label="Dólares esperados" value={money(dolares.esperado, 'USD')} accent="text-primary-600" bg="bg-primary-50" />
                                </div>
                            )}

                            <h3 className="mb-2 text-sm font-bold text-warm-900">Mis movimientos</h3>
                            {tablaMovimientos}
                        </>
                    ) : (
                        <>
                            {/* El cierre espera aprobación: la caja no se abre hasta entonces (o hasta anularlo para corregirlo). */}
                            {data?.cierre_pendiente && (
                                <Alert variant="warning" className="mb-4">
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                        <div>
                                            <strong>Cierre pendiente de aprobación.</strong>{' '}
                                            {data.cierre_pendiente.es_mio ? 'Lo solicitaste tú' : `Lo solicitó ${data.cierre_pendiente.solicitante ?? 'otro usuario'}`}:
                                            contado {money(data.cierre_pendiente.monto_contado)}, se deja{' '}
                                            <strong>{money(data.cierre_pendiente.monto_dejado)}</strong> para el siguiente turno y se retira{' '}
                                            <strong>{money(data.cierre_pendiente.monto_retirado)}</strong>
                                            {data.cierre_pendiente.caja_destino ? <> hacia <strong>{data.cierre_pendiente.caja_destino}</strong></> : ''}.{' '}
                                            {data.cierre_pendiente.es_mio
                                                ? 'Si algo está mal, anúlalo: tu caja se abre de nuevo para corregirlo.'
                                                : 'Podrás abrir la caja cuando se apruebe.'}
                                        </div>
                                        {data.cierre_pendiente.es_mio && (
                                            <Button variant="danger" size="sm" loading={saving} onClick={anularCierre}>
                                                Anular y corregir cierre
                                            </Button>
                                        )}
                                    </div>
                                </Alert>
                            )}

                            <Card className="mb-6 flex flex-col items-center gap-3 py-8 text-center">
                                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100 text-warm-500"><Lock className="h-7 w-7" /></div>
                                <p className="text-warm-600">
                                    {data?.ocupada_por
                                        ? 'La caja la está usando otro usuario.'
                                        : data?.cierre_pendiente
                                            ? 'Tu caja está cerrada y su cierre espera aprobación.'
                                            : 'Tu caja está cerrada. Ábrela para registrar movimientos.'}
                                </p>
                                <Button disabled={Boolean(data?.ocupada_por || data?.cierre_pendiente)} onClick={() => { setAbrirOpen(true); setMontoInicial(''); }}><LockOpen className="h-4 w-4" /> Abrir caja</Button>
                            </Card>

                            <h3 className="mb-2 text-sm font-bold text-warm-900">Mis movimientos</h3>
                            {tablaMovimientos}
                        </>
                    )}
                </>
            )}

            {/* El reporte de la caja del día en PDF. */}
            <PdfViewerModal
                open={Boolean(reportePdf)}
                onClose={() => setReportePdf(null)}
                url={reportePdf?.url}
                titulo="Reporte de caja"
                nombre={`Caja ${new Date().toLocaleDateString('es-PE')}`}
            />

            {/* Amortización de documentos: elige el documento y abona; el movimiento queda en esta caja. */}
            <PagosCuentaModal
                open={Boolean(amortizar)}
                onClose={() => setAmortizar(null)}
                tipo={amortizar ?? 'cobrar'}
                cuenta={null}
                permitidos={[amortizar ?? 'cobrar']}
                elegir
                cerrarAlGuardar
                onSaved={() => load()}
            />

            {/* Modal abrir */}
            <Modal open={abrirOpen} onClose={() => setAbrirOpen(false)} title="Abrir caja"
                description={saldoAnterior ? 'La caja abre con el efectivo que se dejó en el cierre anterior.' : 'Ingresa el monto en efectivo con el que inicias.'} size="sm"
                footer={<><Button variant="secondary" onClick={() => setAbrirOpen(false)}>Cancelar</Button><Button loading={saving} onClick={abrir}>Abrir caja</Button></>}>
                {saldoAnterior ? (
                    <div className="space-y-3">
                        <Input label="Monto inicial (S/)" value={money(saldoAnterior.monto)} readOnly disabled className="text-right" />
                        <p className="rounded-md bg-primary-50 px-3 py-2 text-xs text-primary-700">
                            Es lo que dejó {saldoAnterior.cerro ?? 'el usuario anterior'} para este turno al cerrar
                            {saldoAnterior.fecha ? ` el ${fechaHora(saldoAnterior.fecha)}` : ''}
                            {Number(saldoAnterior.retirado) > 0 ? ` (retiró ${money(saldoAnterior.retirado)} en el movimiento de cierre)` : ''}
                            . No se cambia: si no coincide con lo que hay en el cajón, avisa a un administrador.
                        </p>
                    </div>
                ) : (
                    <Input label="Monto inicial (S/)" type="number" min="0" step="0.01" placeholder="0.00" value={montoInicial} onChange={(e) => setMontoInicial(e.target.value)} />
                )}
            </Modal>

            {/* Modal cerrar */}
            <Modal open={cerrarOpen} onClose={() => setCerrarOpen(false)} title="Cerrar caja (arqueo)" description="Cuenta el efectivo físico y regístralo." size="sm"
                footer={<><Button variant="secondary" onClick={() => setCerrarOpen(false)}>Cancelar</Button><Button variant="danger" loading={saving} onClick={cerrar}>Cerrar caja</Button></>}>
                <div className="space-y-3">
                    <div className="flex justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm">
                        <span className="text-warm-500">Efectivo esperado</span>
                        <span className="font-semibold text-warm-900">{money(esperado)}</span>
                    </div>
                    {Math.abs(otrosMedios) > 0.001 && (
                        <p className="-mt-1 mb-2 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800">
                            Además se cobraron <strong>{money(otrosMedios)}</strong> por transferencia
                            o billetera. Ese dinero va al banco, no al cajón: no lo cuentes aquí.
                        </p>
                    )}
                    <Input label="Efectivo contado (S/)" type="number" min="0" step="0.01" placeholder="0.00" value={montoContado} onChange={(e) => setMontoContado(e.target.value)} />
                    {montoContado !== '' && Math.abs(diferencia) > 0.001 && (
                        <div className={`rounded-lg px-3 py-2 text-sm font-medium ${diferencia < 0 ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>
                            {diferencia < 0 ? 'Faltante' : 'Sobrante'}: {money(Math.abs(diferencia))}
                        </div>
                    )}
                    <Input label="Dejo para el siguiente turno (S/)" type="number" min="0" step="0.01" placeholder="0.00" value={montoDejado} onChange={(e) => setMontoDejado(e.target.value)} />
                    {montoContado !== '' && (
                        <div className={`rounded-lg px-3 py-2 text-sm ${retirado < -0.001 ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-800'}`}>
                            {retirado < -0.001
                                ? 'No puedes dejar más de lo que contaste.'
                                : <>Sale de la caja con el <strong>movimiento de cierre</strong>: {money(Math.max(retirado, 0))}. El cierre queda pendiente de aprobación.</>}
                        </div>
                    )}
                    {retirado > 0.001 && (
                        <div>
                            <Select
                                label="Enviar el efectivo retirado a otra caja (opcional)"
                                value={cajaDestino}
                                onChange={(e) => setCajaDestino(e.target.value)}
                                options={[
                                    { value: '', label: 'No enviarlo a ninguna caja' },
                                    ...cajasDestino.map((c) => ({ value: String(c.id), label: `${c.codigo ? `${c.codigo} · ` : ''}${c.nombre}${c.abierta ? '' : ' (cerrada)'}` })),
                                ]}
                            />
                            {cajaDestino && (
                                <p className="mt-1 text-xs text-warm-500">
                                    Para ti es un egreso ahora. La otra caja lo recibe como ingreso cuando se apruebe el cierre, y debe estar abierta.
                                </p>
                            )}
                        </div>
                    )}
                    {dolares && (
                        <>
                            <div className="flex justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm">
                                <span className="text-warm-500">Dólares esperados</span>
                                <span className="font-semibold text-warm-900">{money(dolares.esperado, 'USD')}</span>
                            </div>
                            <Input label="Dólares contados (US$)" type="number" min="0" step="0.01" placeholder="0.00" value={montoContadoUsd} onChange={(e) => setMontoContadoUsd(e.target.value)} />
                            {montoContadoUsd !== '' && Math.abs(diferenciaUsd) > 0.001 && (
                                <div className={`rounded-lg px-3 py-2 text-sm font-medium ${diferenciaUsd < 0 ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>
                                    {diferenciaUsd < 0 ? 'Faltante' : 'Sobrante'}: {money(Math.abs(diferenciaUsd), 'USD')}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </Modal>

            {/* Anular un movimiento registrado a mano. */}
            <Modal
                open={Boolean(anularMov)}
                onClose={() => setAnularMov(null)}
                title="Anular movimiento"
                description={anularMov ? `${anularMov.tipo === 'ingreso' ? 'Ingreso' : 'Gasto'} de ${money(anularMov.monto, anularMov.moneda)} · ${metodoLabel(anularMov)}` : ''}
                size="sm"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setAnularMov(null)}>Cancelar</Button>
                        <Button variant="danger" loading={saving} onClick={confirmarAnulacion}>Anular movimiento</Button>
                    </>
                }
            >
                <div className="space-y-3">
                    <Alert variant="warning">
                        Deja de contar en los totales de tu caja, pero queda en la lista como <strong>Anulado</strong>.
                    </Alert>
                    <Input label="Motivo (opcional)" placeholder="Ej: se registró dos veces" value={motivoAnulacion} onChange={(e) => setMotivoAnulacion(e.target.value)} />
                </div>
            </Modal>

            {/* Corregir un cobro: se anula lo cobrado y se registran los pagos nuevos. */}
            {(() => {
                const originales = cobroOriginal(corregir);
                const monedaCobro = originales[0]?.moneda || 'PEN';
                const totalOriginal = originales.reduce((acc, m) => acc + (Number(m.monto) || 0), 0);
                const totalNuevo = pagosNuevos.reduce((acc, p) => acc + (Number(p.monto) || 0), 0);
                const diferencia = Math.round((totalOriginal - totalNuevo) * 100) / 100;
                const cuadra = Math.abs(diferencia) < 0.01 && pagosNuevos.every((p) => Number(p.monto) > 0
                    && (p.tipo !== 'transferencia' || p.cuentaId) && (p.tipo !== 'billetera' || p.billeteraId));

                return (
                    <Modal
                        open={Boolean(corregir)}
                        onClose={() => setCorregir(null)}
                        title="Corregir pago"
                        description={corregir?.descripcion ?? ''}
                        footer={
                            <>
                                <Button variant="secondary" onClick={() => setCorregir(null)}>Cancelar</Button>
                                <Button variant="danger" loading={saving} disabled={!cuadra} onClick={confirmarCorreccion}>Anular cobro y registrar nuevos pagos</Button>
                            </>
                        }
                    >
                        <div className="space-y-4">
                            <Alert variant="warning">
                                Primero se <strong>anula</strong> lo que cobraste y luego se registran los pagos nuevos. Deben sumar lo mismo.
                            </Alert>

                            <div>
                                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-warm-500">Cobro registrado</p>
                                <div className="divide-y divide-gray-100 rounded-lg border border-edge text-sm">
                                    {originales.map((m) => (
                                        <div key={m.id} className="flex items-center justify-between px-3 py-2">
                                            <span className="text-warm-700">{metodoLabel(m)}{m.numero_operacion ? ` · Op. ${m.numero_operacion}` : ''}</span>
                                            <span className="font-medium text-warm-900">{money(m.monto, m.moneda)}</span>
                                        </div>
                                    ))}
                                    <div className="flex items-center justify-between bg-gray-50 px-3 py-2 font-semibold">
                                        <span>Total cobrado</span>
                                        <span>{money(totalOriginal, monedaCobro)}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <p className="text-xs font-semibold uppercase tracking-wide text-warm-500">Pagos nuevos</p>
                                {pagosNuevos.map((p, i) => (
                                    <div key={i} className="rounded-lg border border-edge p-3">
                                        <MetodoCajaPicker
                                            cuentas={caja?.cuentas_bancarias ?? []}
                                            billeteras={caja?.billeteras ?? []}
                                            tipo={p.tipo}
                                            cuentaId={p.cuentaId}
                                            billeteraId={p.billeteraId}
                                            onChange={({ tipo, cuentaId, billeteraId }) => setPagoNuevo(i, { tipo, cuentaId, billeteraId })}
                                            referencia={p.referencia}
                                            onReferencia={(referencia) => setPagoNuevo(i, { referencia })}
                                        />
                                        <div className="mt-2 flex items-center gap-2">
                                            <Input type="number" min="0.01" step="0.01" placeholder="Monto" value={p.monto}
                                                onChange={(e) => setPagoNuevo(i, { monto: e.target.value })} className="text-right" />
                                            <button type="button" aria-label="Quitar pago" disabled={pagosNuevos.length === 1}
                                                onClick={() => setPagosNuevos((prev) => prev.filter((_, k) => k !== i))}
                                                className="rounded-md p-2 text-red-600 transition hover:bg-red-50 disabled:opacity-40">
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                                <Button type="button" variant="secondary" size="sm"
                                    onClick={() => setPagosNuevos((prev) => [...prev, emptyPagoCorregir(diferencia > 0 ? String(diferencia) : '')])}>
                                    + Agregar otro pago
                                </Button>
                            </div>

                            <div className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium ${Math.abs(diferencia) < 0.01 ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
                                <span>{Math.abs(diferencia) < 0.01 ? 'Los pagos nuevos cuadran con lo cobrado' : diferencia > 0 ? 'Falta registrar' : 'Te pasaste por'}</span>
                                {Math.abs(diferencia) >= 0.01 && <span>{money(Math.abs(diferencia), monedaCobro)}</span>}
                            </div>
                        </div>
                    </Modal>
                );
            })()}

            {/* Modal registrar ingreso/gasto */}
            <Modal
                open={Boolean(regTipo)}
                onClose={() => setRegTipo(null)}
                title={regTipo === 'ingreso' ? 'Nuevo ingreso' : 'Nuevo gasto'}
                footer={<><Button variant="secondary" onClick={() => setRegTipo(null)}>Cancelar</Button><Button loading={saving} onClick={registrar}>{regTipo === 'ingreso' ? 'Registrar ingreso' : 'Registrar gasto'}</Button></>}>
                <div className="space-y-4">
                    <SearchSelect label="Motivo" value={mov.motivo_movimiento_id} onChange={(v) => setMov((p) => ({ ...p, motivo_movimiento_id: v ?? '' }))}
                        placeholder="Selecciona un motivo" emptyText="Sin coincidencias"
                        options={motivosTipo.map((m) => ({ value: String(m.id), label: m.nombre }))} />
                    <MetodoCajaPicker
                        cuentas={caja?.cuentas_bancarias ?? []}
                        billeteras={caja?.billeteras ?? []}
                        aceptaEfectivo={caja?.acepta_efectivo}
                        tipo={mov.metodoTipo}
                        cuentaId={mov.cuentaId}
                        billeteraId={mov.billeteraId}
                        onChange={({ tipo, cuentaId, billeteraId }) => setMov((p) => ({ ...p, metodoTipo: tipo, cuentaId, billeteraId }))}
                    />
                    {requiereOperacion && (
                        <Input label="N° de operación (opcional)" placeholder="Ej: 0045-885123" value={mov.numero_operacion} onChange={(e) => setMov((p) => ({ ...p, numero_operacion: e.target.value }))} />
                    )}
                    <Input label="Monto (S/)" type="number" min="0.01" step="0.01" placeholder="0.00" value={mov.monto} onChange={(e) => setMov((p) => ({ ...p, monto: e.target.value }))} />
                    <Input label="Descripción (opcional)" placeholder="Ej: recibo de luz" value={mov.descripcion} onChange={(e) => setMov((p) => ({ ...p, descripcion: e.target.value }))} />
                </div>
            </Modal>
        </Layout>
    );
}
