import { useCallback, useEffect, useState } from 'react';
import { Edit, Shield, Trash2 } from 'lucide-react';
import api from '../lib/api';
import { useToast } from '../lib/toast';
import Layout from '../components/Layout';
import PageHeader, { CreateButton } from '../components/PageHeader';
import { Alert, Badge, Button, DataTable, Input, Modal, Select } from '../components/ui';

export default function Roles() {
    const toast = useToast();
    const [roles, setRoles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const [filterGuard, setFilterGuard] = useState('');
    const [activeFilters, setActiveFilters] = useState({});

    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState({ name: '' });
    const [errors, setErrors] = useState({});
    const [saving, setSaving] = useState(false);

    const [deleteTarget, setDeleteTarget] = useState(null);
    const [deleting, setDeleting] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const { data } = await api.get('/roles');
            setRoles(data);
        } catch {
            setError('No se pudieron cargar los roles.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const openCreate = () => {
        setEditing(null);
        setForm({ name: '' });
        setErrors({});
        setModalOpen(true);
    };

    const openEdit = (role) => {
        setEditing(role);
        setForm({ name: role.name });
        setErrors({});
        setModalOpen(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        setErrors({});

        try {
            if (editing) {
                await api.put(`/roles/${editing.id}`, form);
                toast.success('Rol actualizado correctamente.');
            } else {
                await api.post('/roles', form);
                toast.success('Rol creado correctamente.');
            }
            setModalOpen(false);
            await load();
        } catch (err) {
            if (err.response?.status === 422) {
                const validation = err.response.data?.errors ?? {};
                setErrors(
                    Object.fromEntries(Object.entries(validation).map(([k, v]) => [k, v[0]])),
                );
            } else {
                toast.error(
                    err.response?.data?.message ?? 'No se pudo guardar el rol.',
                );
            }
        } finally {
            setSaving(false);
        }
    };

    const confirmDelete = (role) => setDeleteTarget(role);

    const handleDelete = async () => {
        setDeleting(true);
        try {
            await api.delete(`/roles/${deleteTarget.id}`);
            setDeleteTarget(null);
            await load();
            toast.success('Rol eliminado.');
        } catch (err) {
            toast.error(
                err.response?.data?.message ?? 'No se pudo eliminar el rol.',
            );
        } finally {
            setDeleting(false);
        }
    };

    const applyFilters = () => {
        const next = {};
        if (filterGuard) next.guard = filterGuard;
        setActiveFilters(next);
    };

    const clearFilters = () => {
        setFilterGuard('');
        setActiveFilters({});
    };

    const filteredRoles = roles.filter(
        (r) => !activeFilters.guard || r.guard_name === activeFilters.guard,
    );

    const filterCount = Object.keys(activeFilters).length;

    const roleColumns = [
        { key: 'id', label: 'ID' },
        {
            key: 'name',
            label: 'Nombre',
            render: (row) => (
                <span className="inline-flex items-center gap-2 font-medium text-warm-900">
                    <Shield className="h-4 w-4 text-primary-600" />
                    {row.name}
                </span>
            ),
        },
        { key: 'guard_name', label: 'Guard' },
        {
            key: 'permisos',
            label: 'Permisos',
            render: () => <Badge variant="gray">—</Badge>,
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
                        onClick={() => confirmDelete(row)}
                        className="rounded-md p-1.5 text-red-600 transition hover:bg-red-50 hover:text-red-700"
                    >
                        <Trash2 className="h-4 w-4" />
                    </button>
                </>
            ),
        },
    ];

    const roleFilters = (
        <div className="flex flex-wrap items-end gap-3">
            <Select
                label="Guard"
                value={filterGuard}
                onChange={(e) => setFilterGuard(e.target.value)}
                options={[
                    { value: '', label: 'Todos' },
                    ...new Set(roles.map((r) => r.guard_name)),
                ].map((g) => ({ value: g === 'Todos' ? '' : g, label: g === 'Todos' ? 'Todos' : g }))}
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

    return (
        <Layout>
            <PageHeader
                title="Roles"
                description="Gestiona los roles del sistema"
                actions={<CreateButton onClick={openCreate}>Crear rol</CreateButton>}
            />

            {error && <Alert variant="error" className="mb-4">{error}</Alert>}

            <DataTable
                columns={roleColumns}
                rows={filteredRoles}
                loading={loading}
                searchPlaceholder="Buscar roles..."
                filterable
                filters={roleFilters}
                filterCount={filterCount}
            />

            <Modal
                open={modalOpen}
                onClose={() => setModalOpen(false)}
                title={editing ? 'Editar rol' : 'Crear rol'}
                description={
                    editing
                        ? `Edita el rol "${editing.name}"`
                        : 'Agrega un nuevo rol al sistema'
                }
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setModalOpen(false)}>
                            Cancelar
                        </Button>
                        <Button
                            type="submit"
                            form="role-form"
                            loading={saving}
                        >
                            {editing ? 'Guardar cambios' : 'Crear rol'}
                        </Button>
                    </>
                }
            >
                <form id="role-form" onSubmit={handleSubmit} className="space-y-4" noValidate>
                    <Input
                        label="Nombre"
                        name="name"
                        placeholder="Ej: cajero"
                        value={form.name}
                        onChange={(e) => {
                            setForm({ name: e.target.value });
                            if (errors.name) {
                                setErrors((prev) => ({ ...prev, name: undefined }));
                            }
                        }}
                        error={errors.name}
                    />
                </form>
            </Modal>

            <Modal
                open={Boolean(deleteTarget)}
                onClose={() => setDeleteTarget(null)}
                title="Eliminar rol"
                description={`¿Seguro que deseas eliminar el rol "${deleteTarget?.name}"? Esta acción no se puede deshacer.`}
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
                    Los usuarios con este rol perderán sus permisos.
                </Alert>
            </Modal>
        </Layout>
    );
}
