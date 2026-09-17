import { useCallback, useEffect, useState } from 'react';
import { Edit, Folder, FolderTree, Trash2 } from 'lucide-react';
import api, { asList } from '../lib/api';
import { useToast } from '../lib/toast';
import Layout from '../components/Layout';
import PageHeader, { CreateButton } from '../components/PageHeader';
import { Alert, Badge, Button, DataTable, Input, Modal, SearchSelect, Select, Tabs } from '../components/ui';

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

    const [filterEstado, setFilterEstado] = useState('');
    const [filterPadre, setFilterPadre] = useState('');
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

    /** Solo dos niveles: una categoría es siempre raíz, una sub-categoría
        siempre cuelga de una raíz (nunca de otra sub-categoría). */
    const esSubcategoria = tab === 'subcategorias';

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

        if (esSubcategoria && !form.categoria_padre_id) {
            setErrors({ categoria_padre_id: 'Elige la categoría a la que pertenece.' });
            setSaving(false);
            return;
        }

        // Solo dos niveles: una sub-categoría es siempre nivel 2 de una raíz;
        // una categoría es siempre raíz, sin padre, sin importar lo que
        // hubiera quedado en el formulario.
        const payload = {
            nombre: form.nombre,
            activo: form.activo,
            categoria_padre_id: esSubcategoria ? form.categoria_padre_id : null,
            nivel: esSubcategoria ? 2 : 1,
        };

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
        if (filterEstado) next.estado = filterEstado;
        if (filterPadre) next.padre = filterPadre;
        setActiveFilters(next);
    };

    const clearFilters = () => {
        setFilterEstado('');
        setFilterPadre('');
        setActiveFilters({});
    };

    const filtered = categorias
        .filter((c) => (tab === 'categorias' ? !c.categoria_padre_id : Boolean(c.categoria_padre_id)))
        .filter((c) => !activeFilters.estado || (activeFilters.estado === 'activos' ? c.activo : !c.activo))
        .filter((c) => !activeFilters.padre || String(c.categoria_padre_id) === String(activeFilters.padre));

    const filterCount = Object.keys(activeFilters).length;

    /** Solo categorías raíz: una sub-categoría nunca cuelga de otra sub-categoría. */
    const parentOptions = categorias
        .filter((c) => !c.categoria_padre_id)
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
        // Solo tiene sentido en Sub-categorías: en Categorías siempre es raíz.
        ...(esSubcategoria
            ? [
                  {
                      key: 'padre',
                      label: 'Categoría',
                      render: (row) => row.padre?.nombre ?? <span className="text-gray-400">—</span>,
                  },
              ]
            : []),
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
            {esSubcategoria && (
                <SearchSelect
                    label="Categoría padre"
                    value={filterPadre}
                    onChange={(v) => setFilterPadre(v ?? '')}
                    placeholder="Todas"
                    emptyText="Sin coincidencias"
                    options={categorias
                        .filter((c) => !c.categoria_padre_id)
                        .map((c) => ({ value: String(c.id), label: c.nombre }))}
                    className="w-56"
                />
            )}
            <Select
                label="Estado"
                value={filterEstado}
                onChange={(e) => setFilterEstado(e.target.value)}
                options={[
                    { value: '', label: 'Todos' },
                    { value: 'activos', label: 'Solo activos' },
                    { value: 'inactivos', label: 'Solo inactivos' },
                ]}
                className="w-44"
            />
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
                onApplyFilters={applyFilters}
                onClearFilters={clearFilters}
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
                    {/* Solo las sub-categorías tienen padre; una categoría
                        siempre es raíz. */}
                    {esSubcategoria && (
                        <SearchSelect
                            label="Categoría"
                            value={form.categoria_padre_id}
                            onChange={(v) =>
                                setForm((prev) => ({
                                    ...prev,
                                    categoria_padre_id: v ?? '',
                                }))
                            }
                            placeholder="Elige la categoría…"
                            emptyText="Sin coincidencias"
                            options={parentOptions}
                            error={errors.categoria_padre_id}
                        />
                    )}
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
