import { useCallback, useEffect, useState } from 'react';
import { ArrowDownCircle, ArrowUpCircle, Edit, ListChecks, Trash2 } from 'lucide-react';
import api, { asList } from '../lib/api';
import { useToast } from '../lib/toast';
import Layout from '../components/Layout';
import PageHeader, { CreateButton } from '../components/PageHeader';
import { Alert, Badge, Button, DataTable, Input, Modal, Select, Tabs } from '../components/ui';

const emptyForm = { nombre: '', tipo: 'salida', categoria_gasto: 'operativo', activo: true };

const CAT_GASTO = {
    operativo: { label: 'Operativo', variant: 'amber' },
    compra: { label: 'Compra (proveedor)', variant: 'blue' },
    no_operativo: { label: 'No operativo', variant: 'gray' },
};

export default function MotivosMovimiento() {
    const toast = useToast();
    const [tab, setTab] = useState('salida');

    const [motivos, setMotivos] = useState([]);
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
            setMotivos(asList(await api.get('/motivos-movimiento?ambito=caja')));
        } catch {
            setError('No se pudieron cargar los motivos de movimiento.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const openCreate = () => {
        setEditing(null);
        setForm({ ...emptyForm, tipo: tab === 'entrada' ? 'entrada' : 'salida' });
        setFormErrors({});
        setModalOpen(true);
    };

    const openEdit = (motivo) => {
        setEditing(motivo);
        setForm({
            nombre: motivo.nombre,
            tipo: motivo.tipo,
            categoria_gasto: motivo.categoria_gasto ?? 'operativo',
            activo: Boolean(motivo.activo),
        });
        setFormErrors({});
        setModalOpen(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        setFormErrors({});
        const payload = {
            nombre: form.nombre,
            tipo: form.tipo,
            activo: form.activo,
            categoria_gasto: form.tipo === 'salida' ? form.categoria_gasto : null,
        };
        try {
            if (editing) {
                await api.put(`/motivos-movimiento/${editing.id}`, payload);
                toast.success('Motivo actualizado correctamente.');
            } else {
                await api.post('/motivos-movimiento', payload);
                toast.success('Motivo creado correctamente.');
            }
            setModalOpen(false);
            await load();
        } catch (err) {
            if (err.response?.status === 422) {
                const validation = err.response.data?.errors ?? {};
                setFormErrors(
                    Object.fromEntries(Object.entries(validation).map(([k, v]) => [k, v[0]])),
                );
            } else {
                toast.error('No se pudo guardar el motivo.');
            }
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        setDeleting(true);
        try {
            await api.delete(`/motivos-movimiento/${deleteTarget.id}`);
            toast.success('Motivo eliminado.');
            setDeleteTarget(null);
            await load();
        } catch (err) {
            toast.error(err.response?.data?.message ?? 'No se pudo eliminar el motivo.');
        } finally {
            setDeleting(false);
        }
    };

    const rows = motivos.filter(
        (m) => m.tipo === tab && (!fEstado || (fEstado === 'activo' ? m.activo : !m.activo)),
    );

    const columns = [
        {
            key: 'nombre',
            label: 'Motivo',
            render: (row) => (
                <span className="inline-flex items-center gap-2 font-medium text-warm-900">
                    {row.tipo === 'entrada' ? (
                        <ArrowUpCircle className="h-4 w-4 text-green-600" />
                    ) : (
                        <ArrowDownCircle className="h-4 w-4 text-red-600" />
                    )}
                    {row.nombre}
                </span>
            ),
        },
        {
            key: 'tipo',
            label: 'Tipo',
            render: (row) =>
                row.tipo === 'entrada' ? (
                    <Badge variant="green">Entrada (ingreso)</Badge>
                ) : (
                    <Badge variant="red">Salida (egreso)</Badge>
                ),
        },
        {
            key: 'categoria_gasto',
            label: 'Clasificación',
            render: (row) => {
                if (row.tipo !== 'salida') return <span className="text-gray-300">—</span>;
                const c = CAT_GASTO[row.categoria_gasto];
                return c ? <Badge variant={c.variant}>{c.label}</Badge> : <span className="text-gray-400">Sin clasificar</span>;
            },
        },
        {
            key: 'es_sistema',
            label: 'Origen',
            render: (row) =>
                row.es_sistema ? <Badge variant="gray">Sistema</Badge> : <Badge variant="blue">Personalizado</Badge>,
        },
        {
            key: 'activo',
            label: 'Estado',
            render: (row) =>
                row.activo ? (
                    <Badge variant="green">Activo</Badge>
                ) : (
                    <Badge variant="red">Inactivo</Badge>
                ),
        },
        {
            type: 'actions',
            key: 'actions',
            label: 'Acciones',
            actions: (row) =>
                row.es_sistema ? null : (
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
        },
    ];

    return (
        <Layout>
            <PageHeader
                title="Motivos de Movimiento"
                description="Crea y administra los motivos de ingresos y egresos de caja"
                actions={<CreateButton onClick={openCreate}>Crear motivo</CreateButton>}
            />

            {error && <Alert variant="error" className="mb-4">{error}</Alert>}

            <div className="mb-4">
                <Tabs
                    items={[
                        { key: 'salida', label: 'Egresos (salida)', icon: ArrowDownCircle },
                        { key: 'entrada', label: 'Ingresos (entrada)', icon: ArrowUpCircle },
                    ]}
                    value={tab}
                    onChange={setTab}
                />
            </div>

            <DataTable
                columns={columns}
                rows={rows}
                loading={loading}
                searchPlaceholder="Buscar motivos..."
                emptyMessage="No hay motivos de este tipo."
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

            <Modal
                open={modalOpen}
                onClose={() => setModalOpen(false)}
                title={editing ? 'Editar motivo' : 'Crear motivo'}
                description={
                    editing
                        ? `Modifica "${editing.nombre}"`
                        : 'Crea un motivo para usarlo en movimientos de caja'
                }
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setModalOpen(false)}>
                            Cancelar
                        </Button>
                        <Button type="submit" form="motivo-form" loading={saving}>
                            {editing ? 'Guardar cambios' : 'Crear motivo'}
                        </Button>
                    </>
                }
            >
                <form id="motivo-form" onSubmit={handleSubmit} className="space-y-4" noValidate>
                    <Input
                        label="Nombre"
                        name="nombre"
                        placeholder="Ej: Luz, Alquiler, Agua, Sueldo..."
                        value={form.nombre}
                        onChange={(e) => {
                            setForm((prev) => ({ ...prev, nombre: e.target.value }));
                            if (formErrors.nombre) {
                                setFormErrors((prev) => ({ ...prev, nombre: undefined }));
                            }
                        }}
                        error={formErrors.nombre}
                    />
                    <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">Tipo</label>
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                type="button"
                                onClick={() => setForm((prev) => ({ ...prev, tipo: 'salida' }))}
                                className={`flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition ${
                                    form.tipo === 'salida'
                                        ? 'border-red-300 bg-red-50 text-red-700'
                                        : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                                }`}
                            >
                                <ArrowDownCircle className="h-4 w-4" />
                                Salida (egreso / gasto)
                            </button>
                            <button
                                type="button"
                                onClick={() => setForm((prev) => ({ ...prev, tipo: 'entrada' }))}
                                className={`flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition ${
                                    form.tipo === 'entrada'
                                        ? 'border-green-300 bg-green-50 text-green-700'
                                        : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                                }`}
                            >
                                <ArrowUpCircle className="h-4 w-4" />
                                Entrada (ingreso)
                            </button>
                        </div>
                        <p className="mt-1 text-xs text-gray-400">
                            Ej: un motivo "Luz" de tipo salida se usa en egresos (gastos).
                        </p>
                    </div>
                    {form.tipo === 'salida' && (
                        <Select
                            label="Clasificación (para el reporte de Utilidades)"
                            value={form.categoria_gasto}
                            onChange={(e) => setForm((prev) => ({ ...prev, categoria_gasto: e.target.value }))}
                            options={[
                                { value: 'operativo', label: 'Operativo — gasto del negocio (resta en utilidad)' },
                                { value: 'compra', label: 'Compra — pago a proveedor (NO resta, ya está en el costo)' },
                                { value: 'no_operativo', label: 'No operativo — otros (no afecta la utilidad)' },
                            ]}
                        />
                    )}
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                        <input
                            type="checkbox"
                            checked={form.activo}
                            onChange={(e) => setForm((prev) => ({ ...prev, activo: e.target.checked }))}
                            className="h-4 w-4 rounded border-gray-300 accent-primary-600"
                        />
                        <ListChecks className="h-4 w-4 text-primary-600" />
                        Motivo activo
                    </label>
                </form>
            </Modal>

            <Modal
                open={Boolean(deleteTarget)}
                onClose={() => setDeleteTarget(null)}
                title="Eliminar motivo"
                description={`¿Seguro que deseas eliminar "${deleteTarget?.nombre}"?`}
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
                    Los movimientos de caja que usen este motivo dejarán de mostrarlo.
                </Alert>
            </Modal>
        </Layout>
    );
}
