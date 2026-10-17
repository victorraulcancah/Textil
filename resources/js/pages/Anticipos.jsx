import { useCallback, useEffect, useState } from 'react';
import { Ban, CalendarDays } from 'lucide-react';
import api, { asList } from '../lib/api';
import { useToast } from '../lib/toast';
import { diaLocal, hoyIso } from '../lib/fechas';
import Layout from '../components/Layout';
import PageHeader, { CreateButton } from '../components/PageHeader';
import MetodoCajaPicker from '../components/MetodoCajaPicker';
import CambiarFechaModal from '../components/CambiarFechaModal';
import FiltroFechas from '../components/FiltroFechas';
import { Alert, Badge, Button, DataTable, Input, Modal, SearchSelect, Select } from '../components/ui';

const money = (n, moneda = 'PEN') =>
    new Intl.NumberFormat('es-PE', { style: 'currency', currency: moneda || 'PEN' }).format(Number(n) || 0);

const fechaCorta = (v) => {
    const dia = diaLocal(v);
    return dia ? new Date(`${dia}T00:00:00`).toLocaleDateString('es-PE') : '—';
};

const metodoLabel = (a) => {
    if (a.cuenta_bancaria) return `Transf. · ${a.cuenta_bancaria.alias || a.cuenta_bancaria.numero_cuenta}`;
    if (a.billetera) return a.billetera.nombre;
    return 'Efectivo';
};

const vacio = () => ({
    cliente_id: '',
    moneda: 'PEN',
    monto: '',
    metodoTipo: '',
    cuentaId: '',
    billeteraId: '',
    referencia: '',
    fecha: hoyIso(),
    observaciones: '',
});

/** Anticipos de clientes: dinero entregado antes de la venta, en soles o en dólares. */
export default function Anticipos() {
    const toast = useToast();
    const [anticipos, setAnticipos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [clientes, setClientes] = useState([]);
    const [cuentas, setCuentas] = useState([]);
    const [billeteras, setBilleteras] = useState([]);

    const [nuevo, setNuevo] = useState(false);
    const [form, setForm] = useState(vacio());
    const [errors, setErrors] = useState({});
    const [saving, setSaving] = useState(false);

    const [cambiarFecha, setCambiarFecha] = useState(null);
    const [anular, setAnular] = useState(null);
    const [motivo, setMotivo] = useState('');

    // Filtros de la tabla (el panel del embudo) y el rango de fechas de la cabecera.
    const [fEstado, setFEstado] = useState('');
    const [fMoneda, setFMoneda] = useState('');
    const [fCliente, setFCliente] = useState('');
    const [fAlmacen, setFAlmacen] = useState('');
    const [fDesde, setFDesde] = useState(hoyIso);
    const [fHasta, setFHasta] = useState(hoyIso);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get('/anticipos');
            setAnticipos(asList(res));
        } catch {
            toast.error('No se pudieron cargar los anticipos.');
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        load();
        Promise.all([api.get('/clientes'), api.get('/cuentas-bancarias'), api.get('/billeteras-digitales')])
            .then(([cli, cue, bil]) => {
                setClientes(asList(cli));
                setCuentas(asList(cue));
                setBilleteras(asList(bil));
            })
            .catch(() => {});
    }, [load]);

    const abrirNuevo = () => {
        setForm(vacio());
        setErrors({});
        setNuevo(true);
    };

    const set = (patch) => setForm((prev) => ({ ...prev, ...patch }));

    const guardar = async () => {
        const faltan = {};
        if (!form.cliente_id) faltan.cliente_id = 'Elige el cliente';
        if (!(Number(form.monto) > 0)) faltan.monto = 'Escribe el monto';
        if (!form.metodoTipo) faltan.forma_pago = 'Elige cómo pagó';
        if (Object.keys(faltan).length) {
            setErrors(faltan);
            return;
        }

        setSaving(true);
        setErrors({});
        try {
            await api.post('/anticipos', {
                cliente_id: form.cliente_id,
                moneda: form.moneda,
                monto: Number(form.monto),
                forma_pago: form.metodoTipo,
                cuenta_bancaria_id: form.metodoTipo === 'transferencia' ? form.cuentaId || null : null,
                billetera_id: form.metodoTipo === 'billetera' ? form.billeteraId || null : null,
                referencia: form.metodoTipo !== 'efectivo' ? form.referencia.trim() || null : null,
                fecha: form.fecha || hoyIso(),
                observaciones: form.observaciones.trim() || null,
            });
            setNuevo(false);
            toast.success('Anticipo registrado: ya está en tu caja.');
            await load();
        } catch (err) {
            const v = err.response?.data?.errors ?? {};
            if (err.response?.status === 422 && Object.keys(v).length) {
                setErrors(Object.fromEntries(Object.entries(v).map(([k, m]) => [k, m[0]])));
                toast.error(Object.values(v)[0]?.[0] ?? 'Revisa los datos.');
            } else {
                toast.error(err.response?.data?.message ?? 'No se pudo registrar el anticipo.');
            }
        } finally {
            setSaving(false);
        }
    };

    const confirmarAnulacion = async () => {
        setSaving(true);
        try {
            await api.post(`/anticipos/${anular.id}/anular`, { motivo: motivo.trim() || null });
            setAnular(null);
            toast.success('Anticipo anulado: el ingreso dejó de contar en la caja.');
            await load();
        } catch (err) {
            const v = err.response?.data?.errors ?? {};
            toast.error(Object.values(v)[0]?.[0] ?? err.response?.data?.message ?? 'No se pudo anular el anticipo.');
        } finally {
            setSaving(false);
        }
    };

    const columns = [
        {
            key: 'documento',
            label: 'Anticipo',
            render: (a) => <span className="font-medium text-primary-700">{a.documento}</span>,
        },
        { key: 'cliente', label: 'Cliente', getSearchValue: (a) => a.cliente?.nombre, render: (a) => a.cliente?.nombre ?? '—' },
        {
            // El día y la hora en que se registró de verdad: es la fecha que se ve por defecto.
            key: 'registrado',
            label: 'Registrado',
            getSearchValue: (a) => fechaCorta(a.created_at),
            render: (a) => (
                <>
                    {fechaCorta(a.created_at)}
                    <span className="block text-xs text-warm-400">
                        {new Date(a.created_at).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                </>
            ),
        },
        {
            // El día en que el cliente entregó el dinero: oculta por defecto (se ve en "Mostrar u ocultar columnas").
            key: 'fecha',
            label: 'Fecha',
            defaultHidden: true,
            getSearchValue: (a) => fechaCorta(a.fecha),
            render: (a) => fechaCorta(a.fecha),
        },
        {
            // Dónde entró el dinero en caja; el anticipo se ve y se aplica desde cualquier almacén.
            key: 'almacen',
            label: 'Almacén',
            getSearchValue: (a) => a.almacen?.nombre,
            render: (a) => a.almacen?.nombre ?? '—',
        },
        { key: 'metodo', label: 'Método', getSearchValue: (a) => metodoLabel(a), render: (a) => metodoLabel(a) },
        { key: 'moneda', label: 'Moneda', render: (a) => <Badge variant={a.moneda === 'USD' ? 'blue' : 'gray'}>{a.moneda === 'USD' ? 'Dólares' : 'Soles'}</Badge> },
        { key: 'monto', label: 'Monto', align: 'right', searchable: false, render: (a) => money(a.monto, a.moneda) },
        { key: 'monto_aplicado', label: 'Aplicado', align: 'right', searchable: false, render: (a) => money(a.monto_aplicado, a.moneda) },
        {
            key: 'saldo',
            label: 'Saldo',
            align: 'right',
            searchable: false,
            render: (a) => <span className="font-semibold text-warm-900">{money(a.saldo, a.moneda)}</span>,
        },
        {
            key: 'estado',
            label: 'Estado',
            getSearchValue: (a) => (a.estado === 'anulado' ? 'Anulado' : 'Vigente'),
            render: (a) =>
                a.estado === 'anulado' ? (
                    <div className="leading-tight">
                        <Badge variant="red">Anulado</Badge>
                        {a.motivo_anulacion && <div className="mt-0.5 text-xs text-warm-500">{a.motivo_anulacion}</div>}
                    </div>
                ) : (
                    <Badge variant="green">Vigente</Badge>
                ),
        },
        {
            type: 'actions',
            key: 'acciones',
            label: 'Acciones',
            actions: (a) =>
                a.estado === 'anulado' ? null : (
                    <>
                        <button
                            aria-label="Cambiar fecha"
                            title="Cambiar la fecha del anticipo"
                            onClick={() => setCambiarFecha(a)}
                            className="rounded-md p-1.5 text-warm-600 transition hover:bg-gray-100 hover:text-warm-900"
                        >
                            <CalendarDays className="h-4 w-4" />
                        </button>
                        <button
                            aria-label="Anular"
                            title="Anular el anticipo"
                            onClick={() => { setAnular(a); setMotivo(''); }}
                            className="rounded-md p-1.5 text-red-600 transition hover:bg-red-50 hover:text-red-700"
                        >
                            <Ban className="h-4 w-4" />
                        </button>
                    </>
                ),
        },
    ];

    // El rango mira la fecha del anticipo y también el día en que se registró: uno hecho hoy con fecha de ayer aparece al
    // filtrar hoy (por cuándo se registró) y al filtrar ayer (por su fecha).
    const dias = (a) => [diaLocal(a.fecha), diaLocal(a.created_at)];
    const filas = anticipos.filter(
        (a) =>
            (!fEstado || a.estado === fEstado) &&
            (!fMoneda || a.moneda === fMoneda) &&
            (!fCliente || String(a.cliente_id) === String(fCliente)) &&
            (!fAlmacen || String(a.almacen_id) === String(fAlmacen)) &&
            (!fDesde || dias(a).some((d) => d && d >= fDesde)) &&
            (!fHasta || dias(a).some((d) => d && d <= fHasta)),
    );

    /** Solo los clientes y almacenes que de verdad aparecen en la lista. */
    const clientesPresentes = [...new Map(anticipos.filter((a) => a.cliente?.id).map((a) => [String(a.cliente.id), a.cliente.nombre])).entries()]
        .sort((x, y) => x[1].localeCompare(y[1], 'es'))
        .map(([value, label]) => ({ value, label }));
    const almacenesPresentes = [...new Map(anticipos.filter((a) => a.almacen?.id).map((a) => [String(a.almacen.id), a.almacen.nombre])).entries()].map(
        ([value, label]) => ({ value, label }),
    );
    const filtrosActivos = [fEstado, fMoneda, fCliente, fAlmacen, fDesde, fHasta].filter(Boolean).length;
    const limpiarFiltros = () => {
        setFEstado('');
        setFMoneda('');
        setFCliente('');
        setFAlmacen('');
        setFDesde('');
        setFHasta('');
    };

    // Lo que hay por aplicar, por moneda (un anticipo en dólares no se suma con uno en soles).
    const porAplicar = ['PEN', 'USD'].map((m) => ({
        moneda: m,
        total: anticipos.filter((a) => a.estado !== 'anulado' && a.moneda === m).reduce((acc, a) => acc + (Number(a.saldo) || 0), 0),
    }));

    return (
        <Layout>
            <PageHeader
                title="Anticipos"
                description="Dinero que el cliente entrega antes de la venta, en soles o en dólares"
                actions={
                    <>
                        <FiltroFechas desde={fDesde} hasta={fHasta} onDesde={setFDesde} onHasta={setFHasta} />
                        <CreateButton onClick={abrirNuevo}>Nuevo anticipo</CreateButton>
                    </>
                }
            />

            <div className="mb-4 flex flex-wrap items-center gap-3">
                {porAplicar.map((p) => (
                    <div key={p.moneda} className="rounded-lg border border-edge bg-white px-3 py-2 shadow-sm">
                        <p className="text-[11px] uppercase tracking-wide text-warm-500">Por aplicar · {p.moneda === 'USD' ? 'Dólares' : 'Soles'}</p>
                        <p className="text-base font-bold text-warm-900">{money(p.total, p.moneda)}</p>
                    </div>
                ))}
            </div>

            <DataTable
                columns={columns}
                rows={filas}
                loading={loading}
                searchPlaceholder="Buscar anticipo o cliente..."
                filterable
                filterCount={filtrosActivos}
                onClearFilters={limpiarFiltros}
                filters={
                    <div className="space-y-2">
                        <Select
                            label="Moneda"
                            value={fMoneda}
                            onChange={(e) => setFMoneda(e.target.value)}
                            options={[{ value: '', label: 'Todas' }, { value: 'PEN', label: 'Soles' }, { value: 'USD', label: 'Dólares' }]}
                        />
                        <Select
                            label="Estado"
                            value={fEstado}
                            onChange={(e) => setFEstado(e.target.value)}
                            options={[{ value: '', label: 'Todos' }, { value: 'vigente', label: 'Vigente' }, { value: 'anulado', label: 'Anulado' }]}
                        />
                        <SearchSelect
                            label="Cliente"
                            value={fCliente}
                            onChange={(v) => setFCliente(v ?? '')}
                            placeholder="Todos"
                            emptyText="Sin coincidencias"
                            options={clientesPresentes}
                        />
                        <SearchSelect
                            label="Almacén"
                            value={fAlmacen}
                            onChange={(v) => setFAlmacen(v ?? '')}
                            placeholder="Todos"
                            emptyText="Sin coincidencias"
                            options={almacenesPresentes}
                        />
                    </div>
                }
                rowClassName={(a) => (a.estado === 'anulado' ? 'bg-gray-50 text-gray-400' : undefined)}
                emptyMessage="Aún no hay anticipos. Registra el primero."
            />

            <Modal
                open={nuevo}
                onClose={() => setNuevo(false)}
                title="Nuevo anticipo"
                description="Entra a tu caja abierta como un ingreso."
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setNuevo(false)}>Cancelar</Button>
                        <Button loading={saving} onClick={guardar}>Registrar anticipo</Button>
                    </>
                }
            >
                <div className="space-y-4">
                    <SearchSelect
                        label="Cliente"
                        value={form.cliente_id}
                        onChange={(v) => set({ cliente_id: v ?? '' })}
                        placeholder="Busca un cliente"
                        emptyText="Sin coincidencias"
                        options={clientes.map((c) => ({ value: String(c.id), label: c.nombre }))}
                        error={errors.cliente_id}
                    />
                    <div className="grid grid-cols-2 gap-3">
                        <Select
                            label="Moneda"
                            value={form.moneda}
                            onChange={(e) => set({ moneda: e.target.value })}
                            options={[{ value: 'PEN', label: 'Soles (S/)' }, { value: 'USD', label: 'Dólares (US$)' }]}
                        />
                        <Input
                            label={`Monto (${form.moneda === 'USD' ? 'US$' : 'S/'})`}
                            type="number"
                            min="0.01"
                            step="0.01"
                            placeholder="0.00"
                            value={form.monto}
                            onChange={(e) => set({ monto: e.target.value })}
                            error={errors.monto}
                        />
                    </div>
                    <MetodoCajaPicker
                        cuentas={cuentas}
                        billeteras={billeteras}
                        aceptaEfectivo
                        tipo={form.metodoTipo}
                        cuentaId={form.cuentaId}
                        billeteraId={form.billeteraId}
                        onChange={({ tipo, cuentaId, billeteraId }) => set({ metodoTipo: tipo, cuentaId, billeteraId })}
                        referencia={form.referencia}
                        onReferencia={(v) => set({ referencia: v })}
                        error={errors.forma_pago || errors.cuenta_bancaria_id || errors.billetera_id}
                    />
                    <div>
                        <Input label="Fecha" type="date" max={hoyIso()} value={form.fecha} onChange={(e) => set({ fecha: e.target.value })} error={errors.fecha} />
                        {form.fecha && form.fecha < hoyIso() && (
                            <p className="mt-1 text-xs text-amber-700">Fecha anterior: el ingreso entra en tu turno abierto, con esta fecha a la vista.</p>
                        )}
                    </div>
                    <Input label="Observaciones (opcional)" placeholder="Ej: adelanto del pedido de telas" value={form.observaciones} onChange={(e) => set({ observaciones: e.target.value })} />
                </div>
            </Modal>

            <Modal
                open={Boolean(anular)}
                onClose={() => setAnular(null)}
                title="Anular anticipo"
                description={anular ? `${anular.documento} · ${anular.cliente?.nombre ?? ''} · ${money(anular.monto, anular.moneda)}` : ''}
                size="sm"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setAnular(null)}>Cancelar</Button>
                        <Button variant="danger" loading={saving} onClick={confirmarAnulacion}>Anular anticipo</Button>
                    </>
                }
            >
                <div className="space-y-3">
                    <Alert variant="warning">
                        El ingreso deja de contar en la caja, pero el anticipo queda en la lista como <strong>Anulado</strong>. Uno ya aplicado a una venta no se anula.
                    </Alert>
                    <Input label="Motivo (opcional)" placeholder="Ej: se registró dos veces" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
                </div>
            </Modal>

            <CambiarFechaModal
                documento={cambiarFecha?.documento ?? null}
                titulo="Cambiar la fecha del anticipo"
                fechaActual={cambiarFecha?.fecha}
                nota="El ingreso en caja sigue esta fecha. El día en que se registró de verdad no cambia."
                onClose={() => setCambiarFecha(null)}
                onGuardar={async (fecha) => {
                    await api.put(`/anticipos/${cambiarFecha.id}`, { fecha });
                    setCambiarFecha(null);
                    toast.success('Fecha del anticipo actualizada.');
                    await load();
                }}
            />
        </Layout>
    );
}
