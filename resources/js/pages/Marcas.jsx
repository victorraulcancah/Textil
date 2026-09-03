import { useCallback, useEffect, useState } from 'react';
import { BadgeCheck, Edit, Layers, Tag, Trash2 } from 'lucide-react';
import api, { asList } from '../lib/api';
import { useToast } from '../lib/toast';
import Layout from '../components/Layout';
import PageHeader, { CreateButton } from '../components/PageHeader';
import { Alert, Badge, Button, DataTable, Input, Modal, Select, Tabs } from '../components/ui';

const emptySubMarca = { marca_id: '', nombre: '', activo: true };

export default function Marcas() {
    const toast = useToast();
    const [tab, setTab] = useState('marcas');

    const [marcas, setMarcas] = useState([]);
    const [subMarcas, setSubMarcas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Modal de marca
    const [marcaModalOpen, setMarcaModalOpen] = useState(false);
    const [editingMarca, setEditingMarca] = useState(null);
    const [marcaForm, setMarcaForm] = useState({ nombre: '', logo: '', activo: true });
    const [marcaErrors, setMarcaErrors] = useState({});
    const [savingMarca, setSavingMarca] = useState(false);

    // Modal de sub-marca
    const [subModalOpen, setSubModalOpen] = useState(false);
    const [editingSub, setEditingSub] = useState(null);
    const [subForm, setSubForm] = useState(emptySubMarca);
    const [subErrors, setSubErrors] = useState({});
    const [savingSub, setSavingSub] = useState(false);

    const [deleteTarget, setDeleteTarget] = useState(null);
    const [deleting, setDeleting] = useState(false);

    const [filterMarca, setFilterMarca] = useState('');
    const [filterEstado, setFilterEstado] = useState('');
    const [activeFilters, setActiveFilters] = useState({});

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [marcasRes, subsRes] = await Promise.all([
                api.get('/marcas'),
                api.get('/sub-marcas'),
            ]);
            setMarcas(asList(marcasRes));
            setSubMarcas(asList(subsRes));
        } catch {
            setError('No se pudieron cargar las marcas.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    // ----- Marca -----

    const openCreateMarca = () => {
        setEditingMarca(null);
        setMarcaForm({ nombre: '', logo: '', activo: true });
        setMarcaErrors({});
        setMarcaModalOpen(true);
    };

    const openEditMarca = (marca) => {
        setEditingMarca(marca);
        setMarcaForm({
            nombre: marca.nombre,
            logo: marca.logo ?? '',
            activo: Boolean(marca.activo),
        });
        setMarcaErrors({});
        setMarcaModalOpen(true);
    };

    const handleSubmitMarca = async (e) => {
        e.preventDefault();
        setSavingMarca(true);
        setMarcaErrors({});

        const payload = { nombre: marcaForm.nombre, activo: marcaForm.activo };
        if (marcaForm.logo.trim()) payload.logo = marcaForm.logo.trim();

        try {
            if (editingMarca) {
                await api.put(`/marcas/${editingMarca.id}`, payload);
                toast.success('Marca actualizada correctamente.');
            } else {
                await api.post('/marcas', payload);
                toast.success('Marca creada correctamente.');
            }
            setMarcaModalOpen(false);
            await load();
        } catch (err) {
            if (err.response?.status === 422) {
                const validation = err.response.data?.errors ?? {};
                setMarcaErrors(
                    Object.fromEntries(Object.entries(validation).map(([k, v]) => [k, v[0]])),
                );
            } else {
                toast.error('No se pudo guardar la marca.');
            }
        } finally {
            setSavingMarca(false);
        }
    };

    // ----- Sub-marca -----

    const openCreateSub = () => {
        setEditingSub(null);
        setSubForm(emptySubMarca);
        setSubErrors({});
        setSubModalOpen(true);
    };

    const openEditSub = (sub) => {
        setEditingSub(sub);
        setSubForm({
            marca_id: String(sub.marca_id ?? sub.marca?.id ?? ''),
            nombre: sub.nombre,
            activo: Boolean(sub.activo),
        });
        setSubErrors({});
        setSubModalOpen(true);
    };

    const handleSubmitSub = async (e) => {
        e.preventDefault();
        setSavingSub(true);
        setSubErrors({});

        const payload = {
            marca_id: subForm.marca_id,
            nombre: subForm.nombre,
            activo: subForm.activo,
        };

        try {
            if (editingSub) {
                await api.put(`/sub-marcas/${editingSub.id}`, payload);
                toast.success('Sub-marca actualizada correctamente.');
            } else {
                await api.post('/sub-marcas', payload);
                toast.success('Sub-marca creada correctamente.');
            }
            setSubModalOpen(false);
            await load();
        } catch (err) {
            if (err.response?.status === 422) {
                const validation = err.response.data?.errors ?? {};
                setSubErrors(
                    Object.fromEntries(Object.entries(validation).map(([k, v]) => [k, v[0]])),
                );
            } else {
                toast.error('No se pudo guardar la sub-marca.');
            }
        } finally {
            setSavingSub(false);
        }
    };

    const handleDelete = async () => {
        setDeleting(true);
        try {
            if (deleteTarget.tipo === 'marca') {
                await api.delete(`/marcas/${deleteTarget.id}`);
                toast.success('Marca eliminada.');
            } else {
                await api.delete(`/sub-marcas/${deleteTarget.id}`);
                toast.success('Sub-marca eliminada.');
            }
            setDeleteTarget(null);
            await load();
        } catch {
            toast.error('No se pudo eliminar el registro.');
        } finally {
            setDeleting(false);
        }
    };

    // ----- Filtros sub-marcas -----

    const applyFilters = () => {
        const next = {};
        if (filterMarca) next.marca = filterMarca;
        setActiveFilters(next);
    };

    const applyEstadoFilters = () => {
        const next = {};
        if (filterEstado) next.estado = filterEstado;
        setActiveFilters(next);
    };

    const clearFilters = () => {
        setFilterMarca('');
        setFilterEstado('');
        setActiveFilters({});
    };

    const filteredSubs = subMarcas.filter(
        (s) => !activeFilters.marca || String(s.marca_id) === activeFilters.marca,
    );

    const filteredMarcas = marcas.filter((m) => {
        if (activeFilters.estado === 'activos') return m.activo !== false;
        if (activeFilters.estado === 'inactivos') return m.activo === false;
        return true;
    });

    const filterCount = Object.keys(activeFilters).length;

    const marcaName = (row) =>
        row.marca?.nombre ?? marcas.find((m) => m.id === row.marca_id)?.nombre ?? '—';

    // ----- Columnas -----

    const marcaColumns = [
        {
            key: 'nombre',
            label: 'Marca',
            render: (row) => (
                <span className="inline-flex items-center gap-2 font-medium text-warm-900">
                    <Tag className="h-4 w-4 text-primary-600" />
                    {row.nombre}
                </span>
            ),
        },
        {
            key: 'logo',
            label: 'Logo',
            render: (row) => row.logo ?? <span className="text-gray-400">—</span>,
        },
        {
            key: 'sub_marcas',
            label: 'Sub-marcas',
            render: (row) => (
                <Badge variant="blue">
                    {Array.isArray(row.sub_marcas) ? row.sub_marcas.length : 0}
                </Badge>
            ),
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
            // Cuatro botones no entran en los 120px por defecto.
            width: '170px',
            actions: (row) => (
                <>
                    <button
                        aria-label="Editar"
                        onClick={() => openEditMarca(row)}
                        className="rounded-md p-1.5 text-primary-600 transition hover:bg-primary-50 hover:text-primary-700"
                    >
                        <Edit className="h-4 w-4" />
                    </button>
                    <button
                        aria-label="Eliminar"
                        onClick={() => setDeleteTarget({ ...row, tipo: 'marca' })}
                        className="rounded-md p-1.5 text-red-600 transition hover:bg-red-50 hover:text-red-700"
                    >
                        <Trash2 className="h-4 w-4" />
                    </button>
                </>
            ),
        },
    ];

    const subColumns = [
        {
            key: 'nombre',
            label: 'Sub-marca',
            render: (row) => (
                <span className="inline-flex items-center gap-2 font-medium text-warm-900">
                    <Layers className="h-4 w-4 text-primary-600" />
                    {row.nombre}
                </span>
            ),
        },
        {
            key: 'marca',
            label: 'Marca',
            render: (row) => <Badge variant="gray">{marcaName(row)}</Badge>,
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
            // Cuatro botones no entran en los 120px por defecto.
            width: '170px',
            actions: (row) => (
                <>
                    <button
                        aria-label="Editar"
                        onClick={() => openEditSub(row)}
                        className="rounded-md p-1.5 text-primary-600 transition hover:bg-primary-50 hover:text-primary-700"
                    >
                        <Edit className="h-4 w-4" />
                    </button>
                    <button
                        aria-label="Eliminar"
                        onClick={() => setDeleteTarget({ ...row, tipo: 'submarca' })}
                        className="rounded-md p-1.5 text-red-600 transition hover:bg-red-50 hover:text-red-700"
                    >
                        <Trash2 className="h-4 w-4" />
                    </button>
                </>
            ),
        },
    ];

    const subFilters = (
        <div className="flex flex-wrap items-end gap-3">
            <Select
                label="Marca"
                value={filterMarca}
                onChange={(e) => setFilterMarca(e.target.value)}
                options={[
                    { value: '', label: 'Todas' },
                    ...marcas.map((m) => ({ value: String(m.id), label: m.nombre })),
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

    const marcaFilters = (
        <div className="flex flex-wrap items-end gap-3">
            <Select
                label="Estado"
                value={filterEstado}
                onChange={(e) => setFilterEstado(e.target.value)}
                options={[
                    { value: '', label: 'Todos' },
                    { value: 'activos', label: 'Solo activas' },
                    { value: 'inactivos', label: 'Solo inactivas' },
                ]}
                className="w-44"
            />
            <Button variant="primary" size="sm" onClick={applyEstadoFilters}>
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
                title="Marcas"
                description="Administra las marcas y sub-marcas de tus productos"
                actions={
                    tab === 'marcas' ? (
                        <CreateButton onClick={openCreateMarca}>Crear marca</CreateButton>
                    ) : (
                        <CreateButton onClick={openCreateSub}>Crear sub-marca</CreateButton>
                    )
                }
            />

            {error && <Alert variant="error" className="mb-4">{error}</Alert>}

            <div className="mb-4">
                <Tabs
                    items={[
                        { key: 'marcas', label: 'Marcas', icon: Tag },
                        { key: 'submarcas', label: 'Sub-marcas', icon: Layers },
                    ]}
                    value={tab}
                    onChange={setTab}
                />
            </div>

            {tab === 'marcas' ? (
                <DataTable
                    columns={marcaColumns}
                    rows={filteredMarcas}
                    loading={loading}
                    searchPlaceholder="Buscar marcas..."
                    filterable
                    filters={marcaFilters}
                    filterCount={filterCount}
                />
            ) : (
                <DataTable
                    columns={subColumns}
                    rows={filteredSubs}
                    loading={loading}
                    searchPlaceholder="Buscar sub-marcas..."
                    filterable
                    filters={subFilters}
                    filterCount={filterCount}
                />
            )}

            {/* Modal marca */}
            <Modal
                open={marcaModalOpen}
                onClose={() => setMarcaModalOpen(false)}
                title={editingMarca ? 'Editar marca' : 'Crear marca'}
                description={
                    editingMarca ? `Modifica "${editingMarca.nombre}"` : 'Agrega una nueva marca'
                }
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setMarcaModalOpen(false)}>
                            Cancelar
                        </Button>
                        <Button type="submit" form="marca-form" loading={savingMarca}>
                            {editingMarca ? 'Guardar cambios' : 'Crear marca'}
                        </Button>
                    </>
                }
            >
                <form id="marca-form" onSubmit={handleSubmitMarca} className="space-y-4" noValidate>
                    <Input
                        label="Nombre"
                        name="nombre"
                        placeholder="Ej: Nestlé, Coca-Cola, Gloria"
                        value={marcaForm.nombre}
                        onChange={(e) => {
                            setMarcaForm((prev) => ({ ...prev, nombre: e.target.value }));
                            if (marcaErrors.nombre) {
                                setMarcaErrors((prev) => ({ ...prev, nombre: undefined }));
                            }
                        }}
                        error={marcaErrors.nombre}
                    />
                    <Input
                        label="Logo (URL opcional)"
                        name="logo"
                        placeholder="https://..."
                        value={marcaForm.logo}
                        onChange={(e) => setMarcaForm((prev) => ({ ...prev, logo: e.target.value }))}
                        error={marcaErrors.logo}
                    />
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                        <input
                            type="checkbox"
                            checked={marcaForm.activo}
                            onChange={(e) =>
                                setMarcaForm((prev) => ({ ...prev, activo: e.target.checked }))
                            }
                            className="h-4 w-4 rounded border-gray-300 accent-primary-600"
                        />
                        <BadgeCheck className="h-4 w-4 text-primary-600" />
                        Marca activa
                    </label>
                </form>
            </Modal>

            {/* Modal sub-marca */}
            <Modal
                open={subModalOpen}
                onClose={() => setSubModalOpen(false)}
                title={editingSub ? 'Editar sub-marca' : 'Crear sub-marca'}
                description={
                    editingSub ? `Modifica "${editingSub.nombre}"` : 'Agrega una nueva sub-marca'
                }
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setSubModalOpen(false)}>
                            Cancelar
                        </Button>
                        <Button type="submit" form="submarca-form" loading={savingSub}>
                            {editingSub ? 'Guardar cambios' : 'Crear sub-marca'}
                        </Button>
                    </>
                }
            >
                <form id="submarca-form" onSubmit={handleSubmitSub} className="space-y-4" noValidate>
                    <Select
                        label="Marca"
                        name="marca_id"
                        value={subForm.marca_id}
                        onChange={(e) => setSubForm((prev) => ({ ...prev, marca_id: e.target.value }))}
                        options={marcas.map((m) => ({ value: String(m.id), label: m.nombre }))}
                        error={subErrors.marca_id}
                    />
                    <Input
                        label="Nombre"
                        name="nombre"
                        placeholder="Ej: Crackers, Galletas, Saborizados"
                        value={subForm.nombre}
                        onChange={(e) => {
                            setSubForm((prev) => ({ ...prev, nombre: e.target.value }));
                            if (subErrors.nombre) {
                                setSubErrors((prev) => ({ ...prev, nombre: undefined }));
                            }
                        }}
                        error={subErrors.nombre}
                    />
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                        <input
                            type="checkbox"
                            checked={subForm.activo}
                            onChange={(e) =>
                                setSubForm((prev) => ({ ...prev, activo: e.target.checked }))
                            }
                            className="h-4 w-4 rounded border-gray-300 accent-primary-600"
                        />
                        Sub-marca activa
                    </label>
                </form>
            </Modal>

            {/* Modal eliminar */}
            <Modal
                open={Boolean(deleteTarget)}
                onClose={() => setDeleteTarget(null)}
                title={deleteTarget?.tipo === 'marca' ? 'Eliminar marca' : 'Eliminar sub-marca'}
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
                    {deleteTarget?.tipo === 'marca'
                        ? 'Los productos asociados a esta marca podrían verse afectados.'
                        : 'Los productos que usen esta sub-marca perderán la referencia.'}
                </Alert>
            </Modal>
        </Layout>
    );
}
