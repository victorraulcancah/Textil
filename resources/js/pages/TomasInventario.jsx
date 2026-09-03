import { useCallback, useEffect, useState } from 'react';
import { ClipboardCheck, Edit, Trash2 } from 'lucide-react';
import api, { asList } from '../lib/api';
import { opcionesAlmacen } from '../lib/almacenes';
import { useToast } from '../lib/toast';
import Layout from '../components/Layout';
import PageHeader, { CreateButton } from '../components/PageHeader';
import { Alert, Badge, Button, DataTable, Input, Modal, Select } from '../components/ui';

const emptyForm = { almacen_id: '', estado: 'en_proceso', observaciones: '' };

const estadoInfo = {
    en_proceso: { label: 'En proceso', variant: 'blue' },
    cerrado: { label: 'Cerrada', variant: 'green' },
};

export default function TomasInventario() {
    const toast = useToast();
    const [tomas, setTomas] = useState([]);
    const [almacenes, setAlmacenes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState(emptyForm);
    const [formErrors, setFormErrors] = useState({});
    const [saving, setSaving] = useState(false);

    const [deleteTarget, setDeleteTarget] = useState(null);
    const [deleting, setDeleting] = useState(false);

    const [filterEstado, setFilterEstado] = useState('');
    const [filterAlmacen, setFilterAlmacen] = useState('');
    const [activeFilters, setActiveFilters] = useState({});

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [tomasRes, almRes] = await Promise.all([
                api.get('/tomas-inventario'),
                api.get('/almacenes'),
            ]);
            setTomas(asList(tomasRes));
            setAlmacenes(asList(almRes));
        } catch {
            setError('No se pudieron cargar las tomas de inventario.');
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

    const openEdit = (toma) => {
        setEditing(toma);
        setForm({
            almacen_id: String(toma.almacen_id ?? toma.almacen?.id ?? ''),
            estado: toma.estado ?? 'en_proceso',
            observaciones: toma.observaciones ?? '',
        });
        setFormErrors({});
        setModalOpen(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        setFormErrors({});

        try {
            if (editing) {
                await api.put(`/tomas-inventario/${editing.id}`, {
                    estado: form.estado,
                    observaciones: form.observaciones,
                });
                toast.success('Toma actualizada correctamente.');
            } else {
                await api.post('/tomas-inventario', {
                    almacen_id: form.almacen_id,
                    observaciones: form.observaciones,
                });
                toast.success('Toma registrada correctamente.');
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
                toast.error('No se pudo guardar la toma.');
            }
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        setDeleting(true);
        try {
            await api.delete(`/tomas-inventario/${deleteTarget.id}`);
            toast.success('Toma eliminada.');
            setDeleteTarget(null);
            await load();
        } catch {
            toast.error('No se pudo eliminar la toma.');
        } finally {
            setDeleting(false);
        }
    };

    const applyFilters = () => {
        const next = {};
        if (filterEstado) next.estado = filterEstado;
        if (filterAlmacen) next.almacen = filterAlmacen;
        setActiveFilters(next);
    };

    const clearFilters = () => {
        setFilterEstado('');
        setFilterAlmacen('');
        setActiveFilters({});
    };

    const filtered = tomas.filter((t) => {
        if (activeFilters.estado && t.estado !== activeFilters.estado) return false;
        if (activeFilters.almacen) {
            const id = t.almacen_id ?? t.almacen?.id;
            if (String(id) !== activeFilters.almacen) return false;
        }
        return true;
    });

    const filterCount = Object.keys(activeFilters).length;

    const filters = (
        <div className="flex flex-wrap items-end gap-3">
            <Select
                label="Estado"
                value={filterEstado}
                onChange={(e) => setFilterEstado(e.target.value)}
                options={[
                    { value: '', label: 'Todas' },
                    { value: 'en_proceso', label: 'En proceso' },
                    { value: 'cerrado', label: 'Cerrada' },
                ]}
                className="w-40"
            />
            <Select
                label="Almacén"
                value={filterAlmacen}
                onChange={(e) => setFilterAlmacen(e.target.value)}
                options={[
                    { value: '', label: 'Todos' },
                    ...almacenes.map((a) => ({ value: String(a.id), label: a.nombre })),
                ]}
                className="w-48"
            />
            <Button variant="primary" size="sm" onClick={applyFilters}>
                Aplicar
            </Button>
            {filterCount > 0 && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                    Limpiar
                </Button>
            )}
        </div>
    );

    const columns = [
        {
            key: 'id',
            label: '#',
            render: (row) => <Badge variant="blue">#{String(row.id).padStart(3, '0')}</Badge>,
        },
        {
            key: 'almacen',
            label: 'Almacén',
            render: (row) => (
                <span className="inline-flex items-center gap-2 font-medium text-warm-900">
                    <ClipboardCheck className="h-4 w-4 text-primary-600" />
                    {row.almacen?.nombre ?? '—'}
                </span>
            ),
        },
        {
            key: 'fecha',
            label: 'Fecha',
            render: (row) =>
                row.fecha ? (
                    <span className="text-gray-700">
                        {new Date(row.fecha).toLocaleString('es-PE', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                        })}
                    </span>
                ) : (
                    <span className="text-gray-400">—</span>
                ),
        },
        {
            key: 'estado',
            label: 'Estado',
            render: (row) => {
                const info = estadoInfo[row.estado] ?? { label: row.estado ?? '—', variant: 'gray' };
                return <Badge variant={info.variant}>{info.label}</Badge>;
            },
        },
        {
            key: 'observaciones',
            label: 'Observaciones',
            render: (row) => row.observaciones ?? <span className="text-gray-400">—</span>,
        },
        {
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
        },
    ];

    return (
        <Layout>
            <PageHeader
                title="Tomas de inventario"
                description="Registra y controla los conteos físicos por almacén"
                actions={<CreateButton onClick={openCreate}>Nueva toma</CreateButton>}
            />

            {error && <Alert variant="error" className="mb-4">{error}</Alert>}

            <DataTable
                columns={columns}
                rows={filtered}
                loading={loading}
                searchPlaceholder="Buscar tomas..."
                filterable
                filters={filters}
                filterCount={filterCount}
            />

            {/* Modal crear/editar */}
            <Modal
                open={modalOpen}
                onClose={() => setModalOpen(false)}
                title={editing ? 'Editar toma' : 'Nueva toma'}
                description={editing ? `Actualiza la toma #${editing.id}` : 'Registra una toma de inventario'}
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setModalOpen(false)}>
                            Cancelar
                        </Button>
                        <Button type="submit" form="toma-form" loading={saving}>
                            {editing ? 'Guardar cambios' : 'Registrar toma'}
                        </Button>
                    </>
                }
            >
                <form id="toma-form" onSubmit={handleSubmit} className="space-y-4" noValidate>
                    {editing ? (
                        <Select
                            label="Estado"
                            name="estado"
                            value={form.estado}
                            onChange={(e) => setForm((prev) => ({ ...prev, estado: e.target.value }))}
                            options={Object.entries(estadoInfo).map(([value, info]) => ({
                                value,
                                label: info.label,
                            }))}
                            error={formErrors.estado}
                        />
                    ) : (
                        <Select
                            label="Almacén"
                            name="almacen_id"
                            value={form.almacen_id}
                            onChange={(e) =>
                                setForm((prev) => ({ ...prev, almacen_id: e.target.value }))
                            }
                            options={[
                                { value: '', label: 'Seleccione un almacén' },
                                ...opcionesAlmacen(almacenes, form.almacen_id),
                            ]}
                            error={formErrors.almacen_id}
                        />
                    )}
                    <Input
                        label="Observaciones"
                        name="observaciones"
                        placeholder="Opcional"
                        value={form.observaciones}
                        onChange={(e) => setForm((prev) => ({ ...prev, observaciones: e.target.value }))}
                    />
                </form>
            </Modal>

            {/* Modal eliminar */}
            <Modal
                open={Boolean(deleteTarget)}
                onClose={() => setDeleteTarget(null)}
                title="Eliminar toma"
                description={`¿Seguro que deseas eliminar la toma #${deleteTarget?.id}?`}
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
                    La toma se eliminará de forma permanente.
                </Alert>
            </Modal>
        </Layout>
    );
}
