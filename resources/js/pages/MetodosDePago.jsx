import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Building2,
    CreditCard,
    Smartphone,
    Edit,
    IdCard,
    Landmark,
    Trash2,
} from 'lucide-react';
import api, { asList } from '../lib/api';
import { useToast } from '../lib/toast';
import Layout from '../components/Layout';
import PageHeader, { CreateButton } from '../components/PageHeader';
import { Alert, Badge, Button, DataTable, Input, Modal, Select, Tabs } from '../components/ui';

const TABS = [
    { key: 'bancos', label: 'Bancos', icon: Landmark },
    { key: 'cuentas', label: 'Cuentas Bancarias', icon: CreditCard },
    { key: 'tarjetas', label: 'Tarjetas', icon: IdCard },
    { key: 'billeteras', label: 'Billeteras Digitales', icon: Smartphone },
];

const ENDPOINT = {
    bancos: '/bancos',
    cuentas: '/cuentas-bancarias',
    tarjetas: '/tarjetas-bancarias',
    billeteras: '/billeteras-digitales',
};

const SINGULAR = {
    bancos: 'banco',
    cuentas: 'cuenta bancaria',
    tarjetas: 'tarjeta',
    billeteras: 'billetera digital',
};

const EMPTY_FORM = {
    bancos: { nombre: '', activo: true },
    cuentas: {
        banco_id: '',
        alias: '',
        numero_cuenta: '',
        cci: '',
        titular: '',
        moneda: 'PEN',
        tipo_cuenta: 'corriente',
        activo: true,
    },
    tarjetas: {
        cuenta_bancaria_id: '',
        tipo_tarjeta: 'debito',
        nombre_referencial: '',
        numero_enmascarado: '',
        marca: 'Visa',
        fecha_vencimiento: '',
        titular: '',
        limite_credito: '',
        estado: 'activa',
    },
    billeteras: {
        nombre: 'Yape',
        numero_asociado: '',
        cuenta_bancaria_id: '',
        titular: '',
        requiere_captura: false,
        activo: true,
    },
};

export default function MetodosDePago() {
    const toast = useToast();
    const [tab, setTab] = useState('bancos');

    const [data, setData] = useState({ bancos: [], cuentas: [], tarjetas: [], billeteras: [] });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [fEstado, setFEstado] = useState('');

    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState(EMPTY_FORM.bancos);
    const [qrFile, setQrFile] = useState(null);
    const [formErrors, setFormErrors] = useState({});
    const [saving, setSaving] = useState(false);

    const [deleteTarget, setDeleteTarget] = useState(null);
    const [deleting, setDeleting] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [bancos, cuentas, tarjetas, billeteras] = await Promise.all([
                api.get('/bancos'),
                api.get('/cuentas-bancarias'),
                api.get('/tarjetas-bancarias'),
                api.get('/billeteras-digitales'),
            ]);
            setData({
                bancos: asList(bancos),
                cuentas: asList(cuentas),
                tarjetas: asList(tarjetas),
                billeteras: asList(billeteras),
            });
        } catch {
            setError('No se pudieron cargar los datos de tesorería.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const bancoOptions = useMemo(
        () => data.bancos.map((b) => ({ value: b.id, label: b.nombre })),
        [data.bancos],
    );
    const cuentaOptions = useMemo(
        () =>
            data.cuentas.map((c) => ({
                value: c.id,
                label: `${c.banco?.nombre ?? '—'} · ${c.numero_cuenta}`,
            })),
        [data.cuentas],
    );

    const openCreate = () => {
        setEditing(null);
        setForm(EMPTY_FORM[tab]);
        setQrFile(null);
        setFormErrors({});
        setModalOpen(true);
    };

    const openEdit = (row) => {
        setEditing(row);
        setForm({ ...EMPTY_FORM[tab], ...normalizeForm(tab, row) });
        setQrFile(null);
        setFormErrors({});
        setModalOpen(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        setFormErrors({});

        try {
            if (tab === 'billeteras') {
                await submitBilletera();
            } else if (editing) {
                await api.put(`${ENDPOINT[tab]}/${editing.id}`, form);
            } else {
                await api.post(ENDPOINT[tab], form);
            }
            toast.success(
                editing
                    ? `${capitalize(SINGULAR[tab])} actualizada correctamente.`
                    : `${capitalize(SINGULAR[tab])} creada correctamente.`,
            );
            setModalOpen(false);
            await load();
        } catch (err) {
            if (err.response?.status === 422) {
                const validation = err.response.data?.errors ?? {};
                setFormErrors(
                    Object.fromEntries(Object.entries(validation).map(([k, v]) => [k, v[0]])),
                );
            } else {
                toast.error(`No se pudo guardar ${SINGULAR[tab]}.`);
            }
        } finally {
            setSaving(false);
        }
    };

    // Billeteras usan multipart por el QR (con method spoofing en update).
    const submitBilletera = async () => {
        const fd = new FormData();
        fd.append('nombre', form.nombre ?? '');
        fd.append('numero_asociado', form.numero_asociado ?? '');
        if (form.cuenta_bancaria_id) fd.append('cuenta_bancaria_id', form.cuenta_bancaria_id);
        if (form.titular) fd.append('titular', form.titular);
        fd.append('requiere_captura', form.requiere_captura ? '1' : '0');
        fd.append('activo', form.activo ? '1' : '0');
        if (qrFile) fd.append('qr', qrFile);

        const config = { headers: { 'Content-Type': 'multipart/form-data' } };
        if (editing) {
            fd.append('_method', 'PUT');
            await api.post(`${ENDPOINT.billeteras}/${editing.id}`, fd, config);
        } else {
            await api.post(ENDPOINT.billeteras, fd, config);
        }
    };

    const handleDelete = async () => {
        setDeleting(true);
        try {
            await api.delete(`${ENDPOINT[tab]}/${deleteTarget.id}`);
            toast.success(`${capitalize(SINGULAR[tab])} eliminada.`);
            setDeleteTarget(null);
            await load();
        } catch {
            toast.error(`No se pudo eliminar ${SINGULAR[tab]}.`);
        } finally {
            setDeleting(false);
        }
    };

    const setField = (name, value) => {
        setForm((prev) => ({ ...prev, [name]: value }));
        if (formErrors[name]) setFormErrors((prev) => ({ ...prev, [name]: undefined }));
    };

    const columns = useMemo(
        () => buildColumns(tab, { openEdit, setDeleteTarget }),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [tab],
    );

    const createLabels = {
        bancos: 'Nuevo banco',
        cuentas: 'Nueva cuenta',
        tarjetas: 'Nueva tarjeta',
        billeteras: 'Nueva billetera',
    };

    return (
        <Layout>
            <PageHeader
                title="Cuentas y Medios de Pago"
                description="Bancos, cuentas, tarjetas y billeteras digitales del negocio"
                actions={<CreateButton onClick={openCreate}>{createLabels[tab]}</CreateButton>}
            />

            {error && <Alert variant="error" className="mb-4">{error}</Alert>}

            <div className="mb-4">
                <Tabs items={TABS} value={tab} onChange={setTab} />
            </div>

            <DataTable
                columns={columns}
                rows={(() => {
                    const esActivo = (r) => (tab === 'tarjetas' ? r.estado === 'activa' : Boolean(r.activo));
                    const base = data[tab] ?? [];
                    return fEstado ? base.filter((r) => (fEstado === 'activo' ? esActivo(r) : !esActivo(r))) : base;
                })()}
                loading={loading}
                searchPlaceholder={`Buscar en ${TABS.find((t) => t.key === tab)?.label.toLowerCase()}...`}
                filterable
                filterCount={fEstado ? 1 : 0}
                filters={
                    <div className="space-y-2">
                        <Select
                            label="Estado"
                            value={fEstado}
                            onChange={(e) => setFEstado(e.target.value)}
                            options={[
                                { value: '', label: 'Todos' },
                                { value: 'activo', label: 'Activos' },
                                { value: 'inactivo', label: 'Inactivos' },
                            ]}
                        />
                        {fEstado && (
                            <button onClick={() => setFEstado('')} className="text-xs font-medium text-red-600 hover:text-red-700">
                                Limpiar filtros
                            </button>
                        )}
                    </div>
                }
            />

            {/* Modal crear/editar */}
            <Modal
                open={modalOpen}
                onClose={() => setModalOpen(false)}
                title={`${editing ? 'Editar' : 'Nueva'} ${SINGULAR[tab]}`}
                size={tab === 'tarjetas' || tab === 'cuentas' ? 'lg' : 'md'}
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setModalOpen(false)}>
                            Cancelar
                        </Button>
                        <Button type="submit" form="tesoreria-form" loading={saving}>
                            {editing ? 'Guardar cambios' : 'Crear'}
                        </Button>
                    </>
                }
            >
                <form id="tesoreria-form" onSubmit={handleSubmit} className="space-y-4" noValidate>
                    {tab === 'bancos' && (
                        <>
                            <Input
                                label="Nombre"
                                placeholder="Ej: BCP, Interbank"
                                value={form.nombre}
                                onChange={(e) => setField('nombre', e.target.value)}
                                error={formErrors.nombre}
                            />
                            <ActivoCheck checked={form.activo} onChange={(v) => setField('activo', v)} />
                        </>
                    )}

                    {tab === 'cuentas' && (
                        <>
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <Select
                                    label="Banco"
                                    value={form.banco_id}
                                    onChange={(e) => setField('banco_id', e.target.value)}
                                    options={[{ value: '', label: 'Selecciona…' }, ...bancoOptions]}
                                    error={formErrors.banco_id}
                                />
                                <Input
                                    label="Alias / Nombre"
                                    placeholder="Ej: Cuenta principal soles"
                                    value={form.alias}
                                    onChange={(e) => setField('alias', e.target.value)}
                                    error={formErrors.alias}
                                />
                                <Select
                                    label="Tipo"
                                    value={form.tipo_cuenta}
                                    onChange={(e) => setField('tipo_cuenta', e.target.value)}
                                    options={[
                                        { value: 'corriente', label: 'Corriente' },
                                        { value: 'ahorros', label: 'Ahorros' },
                                    ]}
                                />
                                <Select
                                    label="Moneda"
                                    value={form.moneda}
                                    onChange={(e) => setField('moneda', e.target.value)}
                                    options={[
                                        { value: 'PEN', label: 'Soles (PEN)' },
                                        { value: 'USD', label: 'Dólares (USD)' },
                                    ]}
                                />
                                <Input
                                    label="N° Cuenta"
                                    value={form.numero_cuenta}
                                    onChange={(e) => setField('numero_cuenta', e.target.value)}
                                    error={formErrors.numero_cuenta}
                                />
                                <Input
                                    label="CCI"
                                    value={form.cci}
                                    onChange={(e) => setField('cci', e.target.value)}
                                    error={formErrors.cci}
                                />
                                <Input
                                    label="Titular"
                                    value={form.titular}
                                    onChange={(e) => setField('titular', e.target.value)}
                                    error={formErrors.titular}
                                />
                            </div>
                            <ActivoCheck checked={form.activo} onChange={(v) => setField('activo', v)} />
                        </>
                    )}

                    {tab === 'tarjetas' && (
                        <>
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <Select
                                    label="Cuenta vinculada"
                                    value={form.cuenta_bancaria_id}
                                    onChange={(e) => setField('cuenta_bancaria_id', e.target.value)}
                                    options={[{ value: '', label: 'Selecciona…' }, ...cuentaOptions]}
                                    error={formErrors.cuenta_bancaria_id}
                                    className="sm:col-span-2"
                                />
                                <Select
                                    label="Tipo"
                                    value={form.tipo_tarjeta}
                                    onChange={(e) => setField('tipo_tarjeta', e.target.value)}
                                    options={[
                                        { value: 'debito', label: 'Débito' },
                                        { value: 'credito', label: 'Crédito' },
                                    ]}
                                />
                                <Select
                                    label="Marca"
                                    value={form.marca}
                                    onChange={(e) => setField('marca', e.target.value)}
                                    options={[
                                        { value: 'Visa', label: 'Visa' },
                                        { value: 'Mastercard', label: 'Mastercard' },
                                        { value: 'Amex', label: 'American Express' },
                                        { value: 'Diners', label: 'Diners' },
                                    ]}
                                />
                                <Input
                                    label="Nombre referencial"
                                    value={form.nombre_referencial}
                                    onChange={(e) => setField('nombre_referencial', e.target.value)}
                                    error={formErrors.nombre_referencial}
                                />
                                <Input
                                    label="N° tarjeta (últ. 4)"
                                    value={form.numero_enmascarado}
                                    onChange={(e) => setField('numero_enmascarado', e.target.value)}
                                    error={formErrors.numero_enmascarado}
                                />
                                <Input
                                    label="Vencimiento"
                                    placeholder="mm/aaaa"
                                    value={form.fecha_vencimiento}
                                    onChange={(e) => setField('fecha_vencimiento', e.target.value)}
                                />
                                <Input
                                    label="Titular"
                                    value={form.titular}
                                    onChange={(e) => setField('titular', e.target.value)}
                                />
                                {form.tipo_tarjeta === 'credito' && (
                                    <Input
                                        label="Límite de crédito"
                                        type="number"
                                        value={form.limite_credito}
                                        onChange={(e) => setField('limite_credito', e.target.value)}
                                    />
                                )}
                                <Select
                                    label="Estado"
                                    value={form.estado}
                                    onChange={(e) => setField('estado', e.target.value)}
                                    options={[
                                        { value: 'activa', label: 'Activa' },
                                        { value: 'bloqueada', label: 'Bloqueada' },
                                        { value: 'vencida', label: 'Vencida' },
                                    ]}
                                />
                            </div>
                        </>
                    )}

                    {tab === 'billeteras' && (
                        <>
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <Select
                                    label="Tipo"
                                    value={form.nombre}
                                    onChange={(e) => setField('nombre', e.target.value)}
                                    options={[
                                        { value: 'Yape', label: 'Yape' },
                                        { value: 'Plin', label: 'Plin' },
                                        { value: 'Tunki', label: 'Tunki' },
                                        { value: 'Agora', label: 'Agora' },
                                        { value: 'BIM', label: 'BIM' },
                                        { value: 'Otro', label: 'Otro' },
                                    ]}
                                    error={formErrors.nombre}
                                />
                                <Select
                                    label="Cuenta vinculada"
                                    value={form.cuenta_bancaria_id}
                                    onChange={(e) => setField('cuenta_bancaria_id', e.target.value)}
                                    options={[{ value: '', label: 'Ninguna' }, ...cuentaOptions]}
                                />
                                <Input
                                    label="Teléfono"
                                    value={form.numero_asociado}
                                    onChange={(e) => setField('numero_asociado', e.target.value)}
                                    error={formErrors.numero_asociado}
                                />
                                <Input
                                    label="Titular"
                                    value={form.titular}
                                    onChange={(e) => setField('titular', e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-sm font-medium text-gray-700">
                                    QR de pago
                                </label>
                                {editing?.qr && !qrFile && (
                                    <img
                                        src={`/storage/${editing.qr}`}
                                        alt="QR actual"
                                        className="mb-2 h-20 w-20 rounded-md border border-edge object-cover"
                                    />
                                )}
                                <input
                                    type="file"
                                    accept="image/png,image/jpeg,image/webp"
                                    onChange={(e) => setQrFile(e.target.files?.[0] ?? null)}
                                    className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-primary-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary-700 hover:file:bg-primary-100"
                                />
                                {formErrors.qr && (
                                    <p className="mt-1 text-xs text-red-600">{formErrors.qr}</p>
                                )}
                            </div>
                            <label className="flex items-center gap-2 text-sm text-gray-700">
                                <input
                                    type="checkbox"
                                    checked={form.requiere_captura}
                                    onChange={(e) => setField('requiere_captura', e.target.checked)}
                                    className="h-4 w-4 rounded border-gray-300 accent-primary-600"
                                />
                                Requiere captura de pantalla
                            </label>
                            <ActivoCheck checked={form.activo} onChange={(v) => setField('activo', v)} />
                        </>
                    )}
                </form>
            </Modal>

            {/* Modal eliminar */}
            <Modal
                open={Boolean(deleteTarget)}
                onClose={() => setDeleteTarget(null)}
                title={`Eliminar ${SINGULAR[tab]}`}
                description="Esta acción no se puede deshacer."
                size="sm"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
                            Cancelar
                        </Button>
                        <Button variant="danger" loading={deleting} onClick={handleDelete}>
                            Eliminar
                        </Button>
                    </>
                }
            >
                <Alert variant="warning">
                    ¿Seguro que deseas eliminar este registro de tesorería?
                </Alert>
            </Modal>
        </Layout>
    );
}

function ActivoCheck({ checked, onChange }) {
    return (
        <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
                type="checkbox"
                checked={checked}
                onChange={(e) => onChange(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 accent-primary-600"
            />
            Activo
        </label>
    );
}

function capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

function normalizeForm(tab, row) {
    if (tab === 'bancos') return { nombre: row.nombre, activo: Boolean(row.activo) };
    if (tab === 'cuentas') {
        return {
            banco_id: row.banco_id ?? '',
            alias: row.alias ?? '',
            numero_cuenta: row.numero_cuenta ?? '',
            cci: row.cci ?? '',
            titular: row.titular ?? '',
            moneda: row.moneda ?? 'PEN',
            tipo_cuenta: row.tipo_cuenta ?? 'corriente',
            activo: Boolean(row.activo),
        };
    }
    if (tab === 'tarjetas') {
        return {
            cuenta_bancaria_id: row.cuenta_bancaria_id ?? '',
            tipo_tarjeta: row.tipo_tarjeta ?? 'debito',
            nombre_referencial: row.nombre_referencial ?? '',
            numero_enmascarado: row.numero_enmascarado ?? '',
            marca: row.marca ?? 'Visa',
            fecha_vencimiento: row.fecha_vencimiento ?? '',
            titular: row.titular ?? '',
            limite_credito: row.limite_credito ?? '',
            estado: row.estado ?? 'activa',
        };
    }
    return {
        nombre: row.nombre ?? 'Yape',
        numero_asociado: row.numero_asociado ?? '',
        cuenta_bancaria_id: row.cuenta_bancaria_id ?? '',
        titular: row.titular ?? '',
        requiere_captura: Boolean(row.requiere_captura),
        activo: Boolean(row.activo),
    };
}

function buildColumns(tab, { openEdit, setDeleteTarget }) {
    const actions = {
        type: 'actions',
        key: 'actions',
        label: 'Acciones',
        actions: (row) => (
            <>
                <button
                    aria-label="Editar"
                    onClick={() => openEdit(row)}
                    className="rounded-md p-1.5 text-primary-600 transition hover:bg-primary-50 hover:text-primary-700"
                >
                    <Edit className="h-4 w-4" />
                </button>
                <button
                    aria-label="Eliminar"
                    onClick={() => setDeleteTarget(row)}
                    className="rounded-md p-1.5 text-red-600 transition hover:bg-red-50 hover:text-red-700"
                >
                    <Trash2 className="h-4 w-4" />
                </button>
            </>
        ),
    };

    const estadoBadge = (activo) =>
        activo ? <Badge variant="green">Activo</Badge> : <Badge variant="red">Inactivo</Badge>;

    if (tab === 'bancos') {
        return [
            {
                key: 'nombre',
                label: 'Nombre',
                render: (row) => (
                    <span className="inline-flex items-center gap-2 font-medium text-warm-900">
                        <Building2 className="h-4 w-4 text-primary-600" />
                        {row.nombre}
                    </span>
                ),
            },
            { key: 'cuentas_count', label: 'Cuentas', render: (row) => <Badge variant="gray">{row.cuentas_count ?? 0}</Badge> },
            { key: 'activo', label: 'Estado', render: (row) => estadoBadge(row.activo) },
            actions,
        ];
    }

    if (tab === 'cuentas') {
        return [
            { key: 'banco', label: 'Banco', render: (row) => row.banco?.nombre ?? '—' },
            { key: 'alias', label: 'Alias', render: (row) => row.alias || <span className="text-gray-400">—</span> },
            { key: 'numero_cuenta', label: 'N° Cuenta' },
            { key: 'cci', label: 'CCI', render: (row) => row.cci || <span className="text-gray-400">—</span> },
            { key: 'titular', label: 'Titular', render: (row) => row.titular || <span className="text-gray-400">—</span> },
            { key: 'moneda', label: 'Moneda', render: (row) => <Badge variant="blue">{row.moneda}</Badge> },
            {
                key: 'tipo_cuenta',
                label: 'Tipo',
                render: (row) => (row.tipo_cuenta === 'corriente' ? 'Corriente' : 'Ahorros'),
            },
            { key: 'activo', label: 'Estado', render: (row) => estadoBadge(row.activo) },
            actions,
        ];
    }

    if (tab === 'tarjetas') {
        return [
            { key: 'nombre_referencial', label: 'Nombre' },
            { key: 'numero_enmascarado', label: 'N° Tarjeta', render: (row) => `**** ${row.numero_enmascarado}` },
            { key: 'marca', label: 'Marca', render: (row) => <Badge variant="gray">{row.marca}</Badge> },
            {
                key: 'tipo_tarjeta',
                label: 'Tipo',
                render: (row) => (
                    <Badge variant={row.tipo_tarjeta === 'debito' ? 'blue' : 'amber'}>
                        {row.tipo_tarjeta === 'debito' ? 'Débito' : 'Crédito'}
                    </Badge>
                ),
            },
            { key: 'banco', label: 'Banco', render: (row) => row.cuenta_bancaria?.banco?.nombre ?? '—' },
            {
                key: 'estado',
                label: 'Estado',
                render: (row) => {
                    const map = { activa: 'green', bloqueada: 'red', vencida: 'gray' };
                    return <Badge variant={map[row.estado] ?? 'gray'}>{row.estado}</Badge>;
                },
            },
            actions,
        ];
    }

    // billeteras
    return [
        {
            key: 'qr',
            label: 'QR',
            searchable: false,
            render: (row) =>
                row.qr ? (
                    <img
                        src={`/storage/${row.qr}`}
                        alt="QR"
                        className="h-10 w-10 rounded-md object-cover"
                    />
                ) : (
                    <span className="text-gray-400">—</span>
                ),
        },
        { key: 'nombre', label: 'Tipo', render: (row) => <Badge variant="gray">{row.nombre}</Badge> },
        { key: 'cuenta_bancaria', label: 'Cuenta vinculada', render: (row) => row.cuenta_bancaria?.numero_cuenta ?? '—' },
        { key: 'numero_asociado', label: 'Teléfono' },
        { key: 'titular', label: 'Titular', render: (row) => row.titular || <span className="text-gray-400">—</span> },
        { key: 'activo', label: 'Estado', render: (row) => (row.activo ? <Badge variant="green">Activo</Badge> : <Badge variant="red">Inactivo</Badge>) },
        actions,
    ];
}
