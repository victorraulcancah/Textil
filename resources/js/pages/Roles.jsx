import { useCallback, useEffect, useMemo, useState } from 'react';
import { Edit, Shield, ShieldCheck, Trash2 } from 'lucide-react';
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

    /** Árbol módulo → submódulo → acciones, y los permisos marcados. */
    const [arbol, setArbol] = useState([]);
    /** Roles que siempre lo pueden todo (config/permisos.php). */
    const [superAdmin, setSuperAdmin] = useState([]);
    const [permisos, setPermisos] = useState(new Set());
    const [abiertos, setAbiertos] = useState({});

    const todosLosPermisos = useMemo(
        () => arbol.flatMap((m) => m.submodulos.flatMap((s) => s.acciones.map((a) => a.permiso))),
        [arbol],
    );

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

    useEffect(() => {
        api.get('/roles/permisos')
            .then(({ data }) => {
                setArbol(data.arbol ?? []);
                setSuperAdmin([].concat(data.super_admin ?? []));
            })
            .catch(() => {});
    }, []);

    const openCreate = () => {
        setEditing(null);
        setForm({ name: '' });
        // Un rol nuevo nace con todo permitido: se desmarca lo que no deba tener.
        setPermisos(new Set(todosLosPermisos));
        setAbiertos({});
        setErrors({});
        setModalOpen(true);
    };

    const openEdit = (role) => {
        setEditing(role);
        setForm({ name: role.name });
        setPermisos(new Set(role.es_super_admin ? todosLosPermisos : role.permisos ?? []));
        setAbiertos({});
        setErrors({});
        setModalOpen(true);
    };

    /** Marca o desmarca un permiso suelto. */
    const alternar = (permiso) =>
        setPermisos((prev) => {
            const next = new Set(prev);
            next.has(permiso) ? next.delete(permiso) : next.add(permiso);
            return next;
        });

    /** Marca o desmarca todas las acciones de un submódulo o módulo. */
    const alternarGrupo = (lista, marcar) =>
        setPermisos((prev) => {
            const next = new Set(prev);
            lista.forEach((p) => (marcar ? next.add(p) : next.delete(p)));
            return next;
        });

    const permisosDe = (modulo) =>
        modulo.submodulos.flatMap((s) => s.acciones.map((a) => a.permiso));

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        setErrors({});

        const payload = { ...form, permisos: [...permisos] };

        try {
            if (editing) {
                await api.put(`/roles/${editing.id}`, payload);
                toast.success('Rol actualizado correctamente.');
            } else {
                await api.post('/roles', payload);
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
            searchable: false,
            render: (row) => {
                if (row.es_super_admin) return <Badge variant="blue">Todos</Badge>;
                const n = row.permisos?.length ?? 0;
                const total = todosLosPermisos.length || 1;
                if (n === 0) return <Badge variant="red">Sin permisos</Badge>;
                if (n >= total) return <Badge variant="green">Todos</Badge>;
                return <Badge variant="amber">{n} de {total}</Badge>;
            },
        },
        {
            key: 'usuarios_count',
            label: 'Usuarios',
            searchable: false,
            render: (row) => <Badge variant="gray">{row.usuarios_count ?? 0}</Badge>,
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
                    ...[...new Set(roles.map((r) => r.guard_name))].map((g) => ({
                        value: g,
                        label: g,
                    })),
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
                size="3xl"
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

                    {editing?.es_super_admin ? (
                        <Alert variant="info">
                            El rol de administración siempre conserva todos los permisos: no se
                            puede limitar para evitar quedarse fuera del sistema.
                        </Alert>
                    ) : (
                        <section>
                            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                                    Permisos
                                </h3>
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-warm-500">
                                        {permisos.size} de {todosLosPermisos.length}
                                    </span>
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => setPermisos(new Set(todosLosPermisos))}
                                    >
                                        Marcar todo
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setPermisos(new Set())}
                                    >
                                        Quitar todo
                                    </Button>
                                </div>
                            </div>

                            <div className="max-h-[50vh] space-y-2 overflow-y-auto rounded-lg border border-edge p-2">
                                {arbol.map((modulo) => {
                                    const delModulo = permisosDe(modulo);
                                    const marcados = delModulo.filter((p) => permisos.has(p)).length;
                                    const todos = marcados === delModulo.length;
                                    const abierto = abiertos[modulo.key] ?? false;

                                    return (
                                        <div key={modulo.key} className="rounded-lg border border-edge">
                                            {/* Nivel 1: módulo */}
                                            <div className="flex items-center gap-2 bg-gray-50 px-3 py-2">
                                                <input
                                                    type="checkbox"
                                                    checked={todos}
                                                    ref={(el) => {
                                                        if (el) el.indeterminate = marcados > 0 && !todos;
                                                    }}
                                                    onChange={(e) => alternarGrupo(delModulo, e.target.checked)}
                                                    className="h-4 w-4 rounded border-gray-300 accent-primary-600"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        setAbiertos((prev) => ({
                                                            ...prev,
                                                            [modulo.key]: !abierto,
                                                        }))
                                                    }
                                                    className="flex flex-1 items-center justify-between text-left"
                                                >
                                                    <span className="text-sm font-semibold text-warm-900">
                                                        {modulo.label}
                                                    </span>
                                                    <span className="text-xs text-warm-500">
                                                        {marcados}/{delModulo.length}
                                                    </span>
                                                </button>
                                            </div>

                                            {abierto && (
                                                <div className="divide-y divide-gray-100">
                                                    {modulo.submodulos.map((sub) => {
                                                        const delSub = sub.acciones.map((a) => a.permiso);
                                                        const subTodos = delSub.every((p) => permisos.has(p));

                                                        return (
                                                            <div
                                                                key={sub.key}
                                                                className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2"
                                                            >
                                                                {/* Nivel 2: submódulo */}
                                                                <label className="flex min-w-[13rem] flex-1 cursor-pointer items-center gap-2">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={subTodos}
                                                                        ref={(el) => {
                                                                            if (el)
                                                                                el.indeterminate =
                                                                                    delSub.some((p) => permisos.has(p)) &&
                                                                                    !subTodos;
                                                                        }}
                                                                        onChange={(e) =>
                                                                            alternarGrupo(delSub, e.target.checked)
                                                                        }
                                                                        className="h-4 w-4 rounded border-gray-300 accent-primary-600"
                                                                    />
                                                                    <span className="text-sm text-warm-900">
                                                                        {sub.label}
                                                                    </span>
                                                                </label>

                                                                {/* Nivel 3: acciones */}
                                                                <div className="flex flex-wrap items-center gap-3">
                                                                    {sub.acciones.map((a) => (
                                                                        <label
                                                                            key={a.permiso}
                                                                            className="flex cursor-pointer items-center gap-1.5 text-xs text-warm-600"
                                                                        >
                                                                            <input
                                                                                type="checkbox"
                                                                                checked={permisos.has(a.permiso)}
                                                                                onChange={() => alternar(a.permiso)}
                                                                                className="h-3.5 w-3.5 rounded border-gray-300 accent-primary-600"
                                                                            />
                                                                            {a.label}
                                                                        </label>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            <p className="mt-2 flex items-center gap-2 text-xs text-warm-400">
                                <ShieldCheck className="h-3.5 w-3.5" />
                                Sin permiso, el módulo no aparece en el menú y la API rechaza la
                                petición.
                            </p>
                        </section>
                    )}
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
