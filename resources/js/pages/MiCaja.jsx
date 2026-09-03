import { useCallback, useEffect, useState } from 'react';
import { ArrowDownCircle, ArrowUpCircle, Lock, LockOpen, PiggyBank, Wallet } from 'lucide-react';
import api from '../lib/api';
import { useToast } from '../lib/toast';
import Layout from '../components/Layout';
import PageHeader from '../components/PageHeader';
import MetodoCajaPicker from '../components/MetodoCajaPicker';
import { Alert, Badge, Button, Card, DataTable, Input, Modal, Select, Spinner } from '../components/ui';

const money = (n) =>
    new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(Number(n) || 0);

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
    const [data, setData] = useState(null);
    const [motivos, setMotivos] = useState([]);
    const [loading, setLoading] = useState(true);

    const [abrirOpen, setAbrirOpen] = useState(false);
    const [montoInicial, setMontoInicial] = useState('');
    const [cerrarOpen, setCerrarOpen] = useState(false);
    const [montoContado, setMontoContado] = useState('');

    const [regTipo, setRegTipo] = useState(null); // 'ingreso' | 'egreso'
    const [mov, setMov] = useState(emptyMov());
    const [saving, setSaving] = useState(false);

    // ── Filtros de la tabla de movimientos ──
    const [filtroTipo, setFiltroTipo] = useState('');
    const [filtroMotivo, setFiltroMotivo] = useState('');
    const [filtroMetodo, setFiltroMetodo] = useState('');
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

    const abrir = async () => {
        setSaving(true);
        try {
            const res = await api.post('/mi-caja/abrir', { monto_inicial: Number(montoInicial) || 0 });
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
        setSaving(true);
        try {
            const res = await api.post('/mi-caja/cerrar', { monto_contado: Number(montoContado) || 0 });
            setData(res.data);
            setCerrarOpen(false);
            setMontoContado('');
            toast.success('Caja cerrada. Arqueo registrado.');
        } catch (err) {
            toast.error(err.response?.data?.message ?? 'No se pudo cerrar la caja.');
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

    if (loading) {
        return (
            <Layout>
                <div className="flex items-center justify-center py-24"><Spinner size="lg" className="text-primary-600" /></div>
            </Layout>
        );
    }

    const caja = data?.caja;
    const apertura = data?.apertura;
    const resumen = data?.resumen;
    const movimientos = data?.movimientos ?? [];
    const esperado = resumen?.esperado ?? 0;
    // Yape y transferencias quedan registrados, pero el dinero va al banco:
    // no se cuentan en el arqueo del cajón.
    const otrosMedios = (resumen?.otros_ingresos ?? 0) - (resumen?.otros_egresos ?? 0);
    const diferencia = (Number(montoContado) || 0) - esperado;

    // Opciones de método según lo que acepta la caja.
    const motivosTipo = motivos.filter(
        (m) => !m.es_sistema && (regTipo === 'ingreso' ? m.tipo === 'entrada' : m.tipo === 'salida'),
    );
    const requiereOperacion = mov.metodoTipo === 'transferencia' || mov.metodoTipo === 'billetera';

    /** Método real del movimiento, deducido de la cuenta o billetera asociada. */
    const metodoDe = (r) => (r.cuenta_bancaria ? 'transferencia' : r.billetera ? 'billetera' : 'efectivo');

    const aplicarFiltros = () => {
        const next = {};
        if (filtroTipo) next.tipo = filtroTipo;
        if (filtroMotivo) next.motivo = filtroMotivo;
        if (filtroMetodo) next.metodo = filtroMetodo;
        setFiltrosActivos(next);
    };

    const limpiarFiltros = () => {
        setFiltroTipo('');
        setFiltroMotivo('');
        setFiltroMetodo('');
        setFiltrosActivos({});
    };

    const movimientosFiltrados = movimientos.filter((r) => {
        if (filtrosActivos.tipo && r.tipo !== filtrosActivos.tipo) return false;
        if (filtrosActivos.motivo && String(r.motivo_movimiento_id) !== filtrosActivos.motivo) return false;
        if (filtrosActivos.metodo && metodoDe(r) !== filtrosActivos.metodo) return false;
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
            <Select
                label="Motivo"
                value={filtroMotivo}
                onChange={(e) => setFiltroMotivo(e.target.value)}
                options={[{ value: '', label: 'Todos' }, ...motivosPresentes]}
                className="w-56"
            />
            <Select
                label="Método"
                value={filtroMetodo}
                onChange={(e) => setFiltroMetodo(e.target.value)}
                options={[
                    { value: '', label: 'Todos' },
                    { value: 'efectivo', label: 'Efectivo' },
                    { value: 'transferencia', label: 'Transferencia' },
                    { value: 'billetera', label: 'Billetera' },
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

    const columns = [
        { key: 'fecha', label: 'Fecha', getSearchValue: (r) => fechaCorta(r.fecha), render: (r) => fechaCorta(r.fecha) },
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
        { key: 'metodo', label: 'Método', getSearchValue: (r) => metodoLabel(r), render: (r) => metodoLabel(r) },
        { key: 'monto', label: 'Monto', align: 'right', render: (r) => <span className={r.tipo === 'ingreso' ? 'text-green-600' : 'text-red-600'}>{r.tipo === 'ingreso' ? '+' : '-'} {money(r.monto)}</span> },
    ];

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
                                <h2 className="text-lg font-bold text-warm-900">{caja.nombre}</h2>
                                {apertura && <p className="text-sm text-warm-500">Abierta desde {fechaHora(apertura.fecha_apertura)}</p>}
                            </div>
                        </div>
                        {apertura ? <Badge variant="green">Abierta</Badge> : <Badge variant="gray">Cerrada</Badge>}
                    </Card>

                    {apertura ? (
                        <>
                            <div className="mb-4 flex flex-wrap gap-2">
                                <Button variant="success" onClick={() => openReg('ingreso')}><ArrowUpCircle className="h-4 w-4" /> Nuevo ingreso</Button>
                                <Button variant="danger" onClick={() => openReg('egreso')}><ArrowDownCircle className="h-4 w-4" /> Nuevo gasto</Button>
                                <Button variant="secondary" onClick={() => { setCerrarOpen(true); setMontoContado(''); }}><Lock className="h-4 w-4" /> Cerrar caja</Button>
                            </div>

                            <div className="mb-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
                                <Stat icon={PiggyBank} label="Monto inicial" value={money(resumen?.monto_inicial)} />
                                <Stat icon={ArrowUpCircle} label="Ingresos" value={money(resumen?.ingresos)} accent="text-green-600" bg="bg-green-50" />
                                <Stat icon={ArrowDownCircle} label="Gastos" value={money(resumen?.egresos)} accent="text-red-600" bg="bg-red-50" />
                                <Stat icon={Wallet} label="Efectivo esperado" value={money(esperado)} accent="text-primary-600" bg="bg-primary-50" />
                            </div>

                            <h3 className="mb-2 text-sm font-bold text-warm-900">Movimientos de esta apertura</h3>
                            <DataTable
                                columns={columns}
                                rows={movimientosFiltrados}
                                searchPlaceholder="Buscar movimientos..."
                                filterable
                                filters={filtros}
                                filterCount={filtrosCount}
                                toggleableColumns={false}
                                emptyMessage={
                                    filtrosCount > 0
                                        ? 'Ningún movimiento coincide con los filtros.'
                                        : 'Aún no hay movimientos. Registra un ingreso o gasto.'
                                }
                                maxHeight="50vh"
                            />
                        </>
                    ) : (
                        <Card className="flex flex-col items-center gap-3 py-10 text-center">
                            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100 text-warm-500"><Lock className="h-7 w-7" /></div>
                            <p className="text-warm-600">Tu caja está cerrada. Ábrela para registrar movimientos.</p>
                            <Button onClick={() => { setAbrirOpen(true); setMontoInicial(''); }}><LockOpen className="h-4 w-4" /> Abrir caja</Button>
                        </Card>
                    )}
                </>
            )}

            {/* Modal abrir */}
            <Modal open={abrirOpen} onClose={() => setAbrirOpen(false)} title="Abrir caja" description="Ingresa el monto en efectivo con el que inicias." size="sm"
                footer={<><Button variant="secondary" onClick={() => setAbrirOpen(false)}>Cancelar</Button><Button loading={saving} onClick={abrir}>Abrir caja</Button></>}>
                <Input label="Monto inicial (S/)" type="number" min="0" step="0.01" placeholder="0.00" value={montoInicial} onChange={(e) => setMontoInicial(e.target.value)} />
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
                </div>
            </Modal>

            {/* Modal registrar ingreso/gasto */}
            <Modal
                open={Boolean(regTipo)}
                onClose={() => setRegTipo(null)}
                title={regTipo === 'ingreso' ? 'Nuevo ingreso' : 'Nuevo gasto'}
                footer={<><Button variant="secondary" onClick={() => setRegTipo(null)}>Cancelar</Button><Button loading={saving} onClick={registrar}>{regTipo === 'ingreso' ? 'Registrar ingreso' : 'Registrar gasto'}</Button></>}>
                <div className="space-y-4">
                    <Select label="Motivo" value={mov.motivo_movimiento_id} onChange={(e) => setMov((p) => ({ ...p, motivo_movimiento_id: e.target.value }))}
                        options={[{ value: '', label: 'Selecciona un motivo' }, ...motivosTipo.map((m) => ({ value: String(m.id), label: m.nombre }))]} />
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
