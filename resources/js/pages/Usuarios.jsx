import { useCallback, useEffect, useState } from 'react';
import { Edit, Trash2, User as UserIcon } from 'lucide-react';
import api from '../lib/api';
import Layout from '../components/Layout';
import PageHeader, { CreateButton } from '../components/PageHeader';
import { Alert, Badge, Button, DataTable, Input, Modal, Select } from '../components/ui';

export default function Usuarios() {
    const [users, setUsers] = useState([]);
    const [roles, setRoles] = useState([]);
    const [empresas, setEmpresas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState({
        name: '',
        email: '',
        password: '',
        role: '',
        empresa_id: '',
    });
    const [errors, setErrors] = useState({});
    const [saving, setSaving] = useState(false);

    const [deleteTarget, setDeleteTarget] = useState(null);
    const [deleting, setDeleting] = useState(false);

    const [filterRole, setFilterRole] = useState('');
    const [activeFilters, setActiveFilters] = useState({});

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [usersRes, rolesRes, empresasRes] = await Promise.all([
                api.get('/users'),
                api.get('/roles'),
                api.get('/empresas'),
            ]);
            setUsers(usersRes.data);
            setRoles(rolesRes.data);
            setEmpresas(empresasRes.data);
        } catch {
            setError('No se pudieron cargar los datos.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const openCreate = () => {
        setEditing(null);
        setForm({ name: '', email: '', password: '', role: '', empresa_id: '' });
        setErrors({});
        setModalOpen(true);
    };

    const openEdit = (user) => {
        setEditing(user);
        setForm({
            name: user.name,
            email: user.email,
            password: '',
            role: user.roles?.[0]?.name ?? '',
            empresa_id: user.empresa_id ?? '',
        });
        setErrors({});
        setModalOpen(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        setErrors({});

        const payload = {
            name: form.name,
            email: form.email,
            role: form.role || undefined,
            empresa_id: form.empresa_id || undefined,
        };
        if (form.password) payload.password = form.password;

        try {
            if (editing) {
                await api.put(`/users/${editing.id}`, payload);
            } else {
                await api.post('/users', payload);
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
                setError('No se pudo guardar el usuario.');
            }
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        setDeleting(true);
        try {
            await api.delete(`/users/${deleteTarget.id}`);
            setDeleteTarget(null);
            await load();
        } catch {
            setError('No se pudo eliminar el usuario.');
        } finally {
            setDeleting(false);
        }
    };

    const applyFilters = () => {
        const next = {};
        if (filterRole) next.role = filterRole;
        setActiveFilters(next);
    };

    const clearFilters = () => {
        setFilterRole('');
        setActiveFilters({});
    };

    const filteredUsers = users.filter(
        (u) => !activeFilters.role || u.roles?.[0]?.name === activeFilters.role,
    );

    const filterCount = Object.keys(activeFilters).length;

    const userFilters = (
        <div className="flex flex-wrap items-end gap-3">
            <Select
                label="Rol"
                value={filterRole}
                onChange={(e) => setFilterRole(e.target.value)}
                options={[
                    { value: '', label: 'Todos' },
                    ...roles.map((r) => ({ value: r.name, label: r.name })),
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

    const userColumns = [
        {
            key: 'name',
            label: 'Usuario',
            render: (row) => (
                <span className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-600 text-xs font-semibold text-white">
                        {row.name
                            .split(' ')
                            .map((p) => p[0])
                            .slice(0, 2)
                            .join('')
                            .toUpperCase()}
                    </span>
                    <span>
                        <span className="block font-medium text-warm-900">{row.name}</span>
                        <span className="block text-xs text-gray-500">{row.email}</span>
                    </span>
                </span>
            ),
        },
        {
            key: 'roles',
            label: 'Rol',
            render: (row) =>
                row.roles?.length ? (
                    <Badge variant="blue">{row.roles[0].name}</Badge>
                ) : (
                    <Badge variant="gray">Sin rol</Badge>
                ),
        },
        {
            key: 'empresa',
            label: 'Empresa',
            render: (row) => row.empresa?.nombre_comercial ?? '—',
        },
        {
            key: 'caja',
            label: 'Caja',
            render: (row) => row.caja?.nombre ?? '—',
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
                title="Usuarios"
                description="Gestiona los usuarios y sus roles"
                actions={<CreateButton onClick={openCreate}>Crear usuario</CreateButton>}
            />

            {error && <Alert variant="error" className="mb-4">{error}</Alert>}

            <DataTable
                columns={userColumns}
                rows={filteredUsers}
                loading={loading}
                searchPlaceholder="Buscar usuarios..."
                filterable
                filters={userFilters}
                filterCount={filterCount}
            />

            <Modal
                open={modalOpen}
                onClose={() => setModalOpen(false)}
                title={editing ? 'Editar usuario' : 'Crear usuario'}
                description={
                    editing ? `Modifica "${editing.name}"` : 'Agrega un nuevo usuario al sistema'
                }
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setModalOpen(false)}>
                            Cancelar
                        </Button>
                        <Button type="submit" form="user-form" loading={saving}>
                            {editing ? 'Guardar cambios' : 'Crear usuario'}
                        </Button>
                    </>
                }
            >
                <form id="user-form" onSubmit={handleSubmit} className="space-y-4" noValidate>
                    <Input
                        label="Nombre"
                        name="name"
                        value={form.name}
                        onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                        error={errors.name}
                    />
                    <Input
                        label="Correo electrónico"
                        name="email"
                        type="email"
                        value={form.email}
                        onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                        error={errors.email}
                    />
                    <Input
                        label={editing ? 'Nueva contraseña (opcional)' : 'Contraseña'}
                        name="password"
                        type="password"
                        placeholder={editing ? 'Dejar vacío para no cambiarla' : ''}
                        value={form.password}
                        onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                        error={errors.password}
                    />
                    <Select
                        label="Rol"
                        name="role"
                        value={form.role}
                        onChange={(e) => setForm((prev) => ({ ...prev, role: e.target.value }))}
                        options={[
                            { value: '', label: 'Sin rol' },
                            ...roles.map((r) => ({ value: r.name, label: r.name })),
                        ]}
                        error={errors.role}
                    />
                    <Select
                        label="Empresa"
                        name="empresa_id"
                        value={form.empresa_id}
                        onChange={(e) =>
                            setForm((prev) => ({ ...prev, empresa_id: e.target.value }))
                        }
                        options={[
                            { value: '', label: 'Sin empresa' },
                            ...empresas.map((emp) => ({
                                value: String(emp.id),
                                label: emp.nombre_comercial,
                            })),
                        ]}
                        error={errors.empresa_id}
                    />
                </form>
            </Modal>

            <Modal
                open={Boolean(deleteTarget)}
                onClose={() => setDeleteTarget(null)}
                title="Eliminar usuario"
                description={`¿Seguro que deseas eliminar a "${deleteTarget?.name}"?`}
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
                <Alert variant="warning" className="flex items-center gap-2">
                    <UserIcon className="h-4 w-4 shrink-0" />
                    Esta acción no se puede deshacer.
                </Alert>
            </Modal>
        </Layout>
    );
}
