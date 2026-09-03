import { useCallback, useEffect, useState } from 'react';
import { Edit, Folder, FolderTree, Trash2 } from 'lucide-react';
import api, { asList } from '../lib/api';
import { useToast } from '../lib/toast';
import Layout from '../components/Layout';
import PageHeader, { CreateButton } from '../components/PageHeader';
import { Alert, Badge, Button, DataTable, Input, Modal, Select, Tabs } from '../components/ui';

export default function Categorias() {
    const toast = useToast();
    const [tab, setTab] = useState('categorias');
    const [categorias, setCategorias] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState({ nombre: '', categoria_padre_id: '', activo: true });
    const [errors, setErrors] = useState({});
    const [saving, setSaving] = useState(false);

    const [deleteTarget, setDeleteTarget] = useState(null);
    const [deleting, setDeleting] = useState(false);

    const [filterNivel, setFilterNivel] = useState('');
    const [activeFilters, setActiveFilters] = useState({});

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.get('/categorias');
            setCategorias(asList(res));
        } catch {
            setError('No se pudieron cargar las categorías.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const openCreate = () => {
        setEditing(null);
        setForm({ nombre: '', categoria_padre_id: '', activo: true });
        setErrors({});
        setModalOpen(true);
    };

    const openEdit = (cat) => {
        setEditing(cat);
        setForm({
            nombre: cat.nombre,
            categoria_padre_id: cat.categoria_padre_id ? String(cat.categoria_padre_id) : '',
            activo: Boolean(cat.activo),
        });
        setErrors({});
        setModalOpen(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        setErrors({});

        const payload = {
            nombre: form.nombre,
            activo: form.activo,
        };
        if (form.categoria_padre_id) {
            payload.categoria_padre_id = form.categoria_padre_id;
            const padre = categorias.find((c) => String(c.id) === form.categoria_padre_id);
            payload.nivel = (padre?.nivel ?? 1) + 1;
        }

        try {
            if (editing) {
                await api.put(`/categorias/${editing.id}`, payload);
                toast.success('Categoría actualizada correctamente.');
            } else {
                await api.post('/categorias', payload);
                toast.success('Categoría creada correctamente.');
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
                toast.error('No se pudo guardar la categoría.');
            }
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        setDeleting(true);
        try {
            await api.delete(`/categorias/${deleteTarget.id}`);
            toast.success('Categoría eliminada.');
            setDeleteTarget(null);
            await load();
        } catch {
            toast.error('No se pudo eliminar la categoría.');
        } finally {
            setDeleting(false);
        }
    };

    const applyFilters = () => {
        const next = {};
        if (filterNivel) next.nivel = filterNivel;
        setActiveFilters(next);
    };

    const clearFilters = () => {
        setFilterNivel('');
        setActiveFilters({});
    };

    const filtered = categorias
        .filter((c) => (tab === 'categorias' ? !c.categoria_padre_id : Boolean(c.categoria_padre_id)))
        .filter((c) => !activeFilters.nivel || String(c.nivel) === activeFilters.nivel);

    const filterCount = Object.keys(activeFilters).length;

    const parentOptions = categorias
        .filter((c) => !editing || c.id !== editing.id)
        .map((c) => ({ value: String(c.id), label: c.nombre }));

    const columns = [
        {
            key: 'nombre',
            label: 'Nombre',
            render: (row) => (
                <span className="inline-flex items-center gap-2 font-medium text-warm-900">
                    {tab === 'categorias' ? (
                        <FolderTree className="h-4 w-4 text-primary-600" />
                    ) : (
                        <Folder className="h-4 w-4 text-primary-600" />
                    )}
                    {row.nombre}
                </span>
            ),
        },
        {
            key: 'padre',
            label: 'Categoría padre',
            render: (row) => row.padre?.nombre ?? <span className="text-gray-400">—</span>,
        },
        {
            key: 'nivel',
            label: 'Nivel',
            render: (row) => <Badge variant="blue">Nivel {row.nivel ?? 1}</Badge>,
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

    const filters = (
        <div className="flex flex-wrap items-end gap-3">
            <Select
                label="Nivel"
                value={filterNivel}
                onChange={(e) => setFilterNivel(e.target.value)}
                options={[
                    { value: '', label: 'Todos' },
                    ...[1, 2, 3].map((n) => ({ value: String(n), label: `Nivel ${n}` })),
                ]}
                className="w-40"
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
                title="Categorías"
                description="Organiza tus productos por categorías y sub-categorías"
                actions={<CreateButton onClick={openCreate}>Crear categoría</CreateButton>}
            />

            {error && <Alert variant="error" className="mb-4">{error}</Alert>}

            <div className="mb-4">
                <Tabs
                    items={[
                        { key: 'categorias', label: 'Categorías', icon: FolderTree },
                        { key: 'subcategorias', label: 'Sub-categorías', icon: Folder },
                    ]}
                    value={tab}
                    onChange={setTab}
                />
            </div>

            <DataTable
                columns={columns}
                rows={filtered}
                loading={loading}
                searchPlaceholder={
                    tab === 'categorias' ? 'Buscar categorías...' : 'Buscar sub-categorías...'
                }
                filterable
                filters={filters}
                filterCount={filterCount}
            />

            <Modal
                open={modalOpen}
                onClose={() => setModalOpen(false)}
                title={editing ? 'Editar categoría' : 'Crear categoría'}
                description={editing ? `Modifica "${editing.nombre}"` : 'Agrega una nueva categoría'}
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setModalOpen(false)}>
                            Cancelar
                        </Button>
                        <Button type="submit" form="categoria-form" loading={saving}>
                            {editing ? 'Guardar cambios' : 'Crear categoría'}
                        </Button>
                    </>
                }
            >
                <form id="categoria-form" onSubmit={handleSubmit} className="space-y-4" noValidate>
                    <Input
                        label="Nombre"
                        name="nombre"
                        placeholder="Ej: Abarrotes, Bebidas, Limpieza"
                        value={form.nombre}
                        onChange={(e) => {
                            setForm((prev) => ({ ...prev, nombre: e.target.value }));
                            if (errors.nombre) {
                                setErrors((prev) => ({ ...prev, nombre: undefined }));
                            }
                        }}
                        error={errors.nombre}
                    />
                    <Select
                        label="Categoría padre (opcional)"
                        name="categoria_padre_id"
                        value={form.categoria_padre_id}
                        onChange={(e) =>
                            setForm((prev) => ({
                                ...prev,
                                categoria_padre_id: e.target.value,
                            }))
                        }
                        options={[{ value: '', label: 'Ninguna' }, ...parentOptions]}
                        error={errors.categoria_padre_id}
                    />
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                        <input
                            type="checkbox"
                            checked={form.activo}
                            onChange={(e) => setForm((prev) => ({ ...prev, activo: e.target.checked }))}
                            className="h-4 w-4 rounded border-gray-300 accent-primary-600"
                        />
                        Categoría activa
                    </label>
                </form>
            </Modal>

            <Modal
                open={Boolean(deleteTarget)}
                onClose={() => setDeleteTarget(null)}
                title="Eliminar categoría"
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
                    Las subcategorías asociadas podrían quedar huérfanas.
                </Alert>
            </Modal>
        </Layout>
    );
}
