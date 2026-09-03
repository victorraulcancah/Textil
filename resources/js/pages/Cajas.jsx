import { useCallback, useEffect, useState } from 'react';
import { Banknote, Coins, CreditCard, Edit, Smartphone, Trash2 } from 'lucide-react';
import api, { asList } from '../lib/api';
import { useToast } from '../lib/toast';
import Layout from '../components/Layout';
import PageHeader, { CreateButton } from '../components/PageHeader';
import { Alert, Badge, Button, DataTable, Input, Modal, Select } from '../components/ui';

const emptyForm = {
    nombre: '',
    usuario_id: '',
    activo: true,
    acepta_efectivo: true,
    cuentas_bancarias: [],
    billeteras: [],
};

export default function Cajas() {
    const toast = useToast();
    const [cajas, setCajas] = useState([]);
    const [cuentas, setCuentas] = useState([]);
    const [billeteras, setBilleteras] = useState([]);
    const [usuarios, setUsuarios] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [fEstado, setFEstado] = useState('');

    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState(emptyForm);
    const [formErrors, setFormErrors] = useState({});
    const [saving, setSaving] = useState(false);

    const [deleteTarget, setDeleteTarget] = useState(null);
    const [deleting, setDeleting] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [cajasRes, cuentasRes, billeterasRes, usuariosRes] = await Promise.all([
                api.get('/cajas'),
                api.get('/cuentas-bancarias'),
                api.get('/billeteras-digitales'),
                api.get('/users'),
            ]);
            setCajas(asList(cajasRes));
            setCuentas(asList(cuentasRes));
            setBilleteras(asList(billeterasRes));
            setUsuarios(asList(usuariosRes));
        } catch {
            setError('No se pudieron cargar las cajas.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const openCreate = () => {
        setEditing(null);
        setForm(emptyForm);
        setFormErrors({});
        setModalOpen(true);
    };

    const openEdit = (caja) => {
        setEditing(caja);
        setForm({
            nombre: caja.nombre,
            usuario_id: caja.usuario?.id ?? '',
            activo: Boolean(caja.activo),
            acepta_efectivo: Boolean(caja.acepta_efectivo),
            cuentas_bancarias: (caja.cuentas_bancarias ?? []).map((c) => c.id),
            billeteras: (caja.billeteras ?? []).map((b) => b.id),
        });
        setFormErrors({});
        setModalOpen(true);
    };

    const toggleId = (key, id) => {
        setForm((prev) => ({
            ...prev,
            [key]: prev[key].includes(id) ? prev[key].filter((x) => x !== id) : [...prev[key], id],
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        setFormErrors({});
        const payload = {
            nombre: form.nombre,
            usuario_id: form.usuario_id || null,
            activo: form.activo,
            acepta_efectivo: form.acepta_efectivo,
            cuentas_bancarias: form.cuentas_bancarias,
            billeteras: form.billeteras,
        };
        try {
            if (editing) {
                await api.put(`/cajas/${editing.id}`, payload);
                toast.success('Caja actualizada correctamente.');
            } else {
                await api.post('/cajas', payload);
                toast.success('Caja creada correctamente.');
            }
            setModalOpen(false);
            await load();
        } catch (err) {
            if (err.response?.status === 422) {
                setFormErrors(Object.fromEntries(Object.entries(err.response.data?.errors ?? {}).map(([k, v]) => [k, v[0]])));
            } else {
                toast.error('No se pudo guardar la caja.');
            }
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        setDeleting(true);
        try {
            await api.delete(`/cajas/${deleteTarget.id}`);
            toast.success('Caja eliminada.');
            setDeleteTarget(null);
            await load();
        } catch {
            toast.error('No se pudo eliminar la caja.');
        } finally {
            setDeleting(false);
        }
    };

    const cuentaLabel = (c) => `${c.alias || 'Cuenta'}${c.numero_cuenta ? ` · ${c.numero_cuenta}` : ''}`;

    const columns = [
        {
            key: 'nombre',
            label: 'Caja',
            render: (row) => (
                <span className="inline-flex items-center gap-2 font-medium text-warm-900">
                    <Coins className="h-4 w-4 text-primary-600" />
                    {row.nombre}
                </span>
            ),
        },
        {
            key: 'usuario',
            label: 'Usuario',
            render: (row) =>
                row.usuario ? (
                    <span className="text-sm">
                        {row.usuario.name}
                        <span className="block text-xs text-gray-400">{row.usuario.email}</span>
                    </span>
                ) : (
                    <span className="text-gray-400">—</span>
                ),
        },
        {
            key: 'metodos',
            label: 'Acepta',
            render: (row) => {
                const chips = [];
                if (row.acepta_efectivo) chips.push(<Badge key="ef" variant="green">Efectivo</Badge>);
                if ((row.cuentas_bancarias ?? []).length) chips.push(<Badge key="tr" variant="blue">{row.cuentas_bancarias.length} transferencia(s)</Badge>);
                if ((row.billeteras ?? []).length) chips.push(<Badge key="bi" variant="amber">{row.billeteras.length} billetera(s)</Badge>);
                return chips.length ? <div className="flex flex-wrap gap-1">{chips}</div> : <span className="text-gray-400">—</span>;
            },
        },
        {
            key: 'activo',
            label: 'Estado',
            render: (row) => (row.activo ? <Badge variant="green">Activa</Badge> : <Badge variant="red">Inactiva</Badge>),
        },
        {
            type: 'actions',
            key: 'actions',
            label: 'Acciones',
            actions: (row) => (
                <>
                    <button aria-label="Editar" onClick={() => openEdit(row)} className="rounded-md p-1.5 text-primary-600 transition hover:bg-primary-50 hover:text-primary-700">
                        <Edit className="h-4 w-4" />
                    </button>
                    <button aria-label="Eliminar" onClick={() => setDeleteTarget(row)} className="rounded-md p-1.5 text-red-600 transition hover:bg-red-50 hover:text-red-700">
                        <Trash2 className="h-4 w-4" />
                    </button>
                </>
            ),
        },
    ];

    return (
        <Layout>
            <PageHeader
                title="Cajas"
                description="Cajas registradoras del negocio"
                actions={<CreateButton onClick={openCreate}>Crear caja</CreateButton>}
            />

            {error && <Alert variant="error" className="mb-4">{error}</Alert>}

            <DataTable
                columns={columns}
                rows={fEstado ? cajas.filter((c) => (fEstado === 'activas' ? c.activo : !c.activo)) : cajas}
                loading={loading}
                searchPlaceholder="Buscar cajas..."
                filterable
                filterCount={fEstado ? 1 : 0}
                filters={
                    <div className="space-y-2">
                        <Select
                            label="Estado"
                            value={fEstado}
                            onChange={(e) => setFEstado(e.target.value)}
                            options={[
                                { value: '', label: 'Todas' },
                                { value: 'activas', label: 'Activas' },
                                { value: 'inactivas', label: 'Inactivas' },
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

            <Modal
                open={modalOpen}
                onClose={() => setModalOpen(false)}
                title={editing ? 'Editar caja' : 'Crear caja'}
                size="lg"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button>
                        <Button type="submit" form="caja-form" loading={saving}>{editing ? 'Guardar cambios' : 'Crear caja'}</Button>
                    </>
                }
            >
                <form id="caja-form" onSubmit={handleSubmit} className="space-y-4" noValidate>
                    <Input
                        label="Nombre"
                        placeholder="Ej: Caja principal"
                        value={form.nombre}
                        onChange={(e) => {
                            setForm((prev) => ({ ...prev, nombre: e.target.value }));
                            if (formErrors.nombre) setFormErrors((p) => ({ ...p, nombre: undefined }));
                        }}
                        error={formErrors.nombre}
                    />
                    <Select
                        label="Usuario asignado"
                        value={form.usuario_id}
                        onChange={(e) => setForm((prev) => ({ ...prev, usuario_id: e.target.value }))}
                        options={[
                            { value: '', label: 'Sin usuario' },
                            ...usuarios
                                .filter((u) => !u.caja_id || String(u.id) === String(form.usuario_id))
                                .map((u) => ({ value: String(u.id), label: `${u.name} (${u.email})` })),
                        ]}
                        error={formErrors.usuario_id}
                    />

                    <div>
                        <label className="mb-2 block text-sm font-medium text-gray-700">Métodos de pago aceptados</label>

                        {/* Efectivo (opcional) */}
                        <label className="flex cursor-pointer items-center gap-2 rounded-md border border-edge px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                            <input
                                type="checkbox"
                                checked={form.acepta_efectivo}
                                onChange={(e) => setForm((prev) => ({ ...prev, acepta_efectivo: e.target.checked }))}
                                className="h-4 w-4 rounded border-gray-300 accent-primary-600"
                            />
                            <Banknote className="h-4 w-4 text-green-600" />
                            <span className="flex-1">Efectivo</span>
                        </label>

                        {/* Transferencia → cuentas bancarias */}
                        <div className="mt-3">
                            <p className="mb-1 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-warm-500">
                                <CreditCard className="h-4 w-4" /> Transferencia (cuentas bancarias)
                            </p>
                            {cuentas.length === 0 ? (
                                <p className="text-xs text-gray-400">No hay cuentas bancarias registradas.</p>
                            ) : (
                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                    {cuentas.map((c) => (
                                        <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded-md border border-edge px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                                            <input
                                                type="checkbox"
                                                checked={form.cuentas_bancarias.includes(c.id)}
                                                onChange={() => toggleId('cuentas_bancarias', c.id)}
                                                className="h-4 w-4 rounded border-gray-300 accent-primary-600"
                                            />
                                            <span className="flex-1">{cuentaLabel(c)}</span>
                                        </label>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Billeteras digitales */}
                        <div className="mt-3">
                            <p className="mb-1 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-warm-500">
                                <Smartphone className="h-4 w-4" /> Billeteras digitales
                            </p>
                            {billeteras.length === 0 ? (
                                <p className="text-xs text-gray-400">No hay billeteras registradas.</p>
                            ) : (
                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                    {billeteras.map((b) => (
                                        <label key={b.id} className="flex cursor-pointer items-center gap-2 rounded-md border border-edge px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                                            <input
                                                type="checkbox"
                                                checked={form.billeteras.includes(b.id)}
                                                onChange={() => toggleId('billeteras', b.id)}
                                                className="h-4 w-4 rounded border-gray-300 accent-primary-600"
                                            />
                                            <span className="flex-1">{b.nombre}</span>
                                        </label>
                                    ))}
                                </div>
                            )}
                        </div>
                        <p className="mt-2 text-xs text-gray-400">
                            Marca los medios que acepta esta caja. Al registrar un movimiento solo aparecerán estos.
                        </p>
                    </div>

                    <label className="flex items-center gap-2 text-sm text-gray-700">
                        <input
                            type="checkbox"
                            checked={form.activo}
                            onChange={(e) => setForm((prev) => ({ ...prev, activo: e.target.checked }))}
                            className="h-4 w-4 rounded border-gray-300 accent-primary-600"
                        />
                        Caja activa
                    </label>
                </form>
            </Modal>

            <Modal
                open={Boolean(deleteTarget)}
                onClose={() => setDeleteTarget(null)}
                title="Eliminar caja"
                description={`¿Seguro que deseas eliminar "${deleteTarget?.nombre}"?`}
                size="sm"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
                        <Button variant="danger" loading={deleting} onClick={handleDelete}>Eliminar</Button>
                    </>
                }
            >
                <Alert variant="warning">Las aperturas y movimientos históricos de esta caja podrían verse afectados.</Alert>
            </Modal>
        </Layout>
    );
}
