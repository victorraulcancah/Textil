import { useCallback, useEffect, useState } from 'react';
import { Edit, Layers, Trash2 } from 'lucide-react';
import api, { asList } from '../lib/api';
import { useToast } from '../lib/toast';
import Layout from '../components/Layout';
import PageHeader, { CreateButton } from '../components/PageHeader';
import { Alert, Badge, Button, DataTable, Input, Modal, Select } from '../components/ui';

export default function SubMarcas() {
    const toast = useToast();
    const [subMarcas, setSubMarcas] = useState([]);
    const [marcas, setMarcas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState({ marca_id: '', nombre: '', activo: true });
    const [errors, setErrors] = useState({});
    const [saving, setSaving] = useState(false);

    const [deleteTarget, setDeleteTarget] = useState(null);
    const [deleting, setDeleting] = useState(false);

    const [filterMarca, setFilterMarca] = useState('');
    const [activeFilters, setActiveFilters] = useState({});

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [subsRes, marcasRes] = await Promise.all([
                api.get('/sub-marcas'),
                api.get('/marcas'),
            ]);
            setSubMarcas(asList(subsRes));
            setMarcas(asList(marcasRes));
        } catch {
            setError('No se pudieron cargar las sub-marcas.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const openCreate = () => {
        setEditing(null);
        setForm({ marca_id: '', nombre: '', activo: true });
        setErrors({});
        setModalOpen(true);
    };

    const openEdit = (sub) => {
        setEditing(sub);
        setForm({
            marca_id: String(sub.marca_id ?? sub.marca?.id ?? ''),
            nombre: sub.nombre,
            activo: Boolean(sub.activo),
        });
        setErrors({});
        setModalOpen(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        setErrors({});

        const payload = {
            marca_id: form.marca_id,
            nombre: form.nombre,
            activo: form.activo,
        };

        try {
            if (editing) {
                await api.put(`/sub-marcas/${editing.id}`, payload);
                toast.success('Sub-marca actualizada correctamente.');
            } else {
                await api.post('/sub-marcas', payload);
                toast.success('Sub-marca creada correctamente.');
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
                toast.error('No se pudo guardar la sub-marca.');
            }
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        setDeleting(true);
        try {
            await api.delete(`/sub-marcas/${deleteTarget.id}`);
            toast.success('Sub-marca eliminada.');
            setDeleteTarget(null);
            await load();
        } catch {
            toast.error('No se pudo eliminar la sub-marca.');
        } finally {
            setDeleting(false);
        }
    };

    const applyFilters = () => {
        const next = {};
        if (filterMarca) next.marca = filterMarca;
        setActiveFilters(next);
    };

    const clearFilters = () => {
        setFilterMarca('');
        setActiveFilters({});
    };

    const filtered = subMarcas.filter(
        (s) => !activeFilters.marca || String(s.marca_id) === activeFilters.marca,
    );

    const filterCount = Object.keys(activeFilters).length;

    const marcaName = (row) =>
        row.marca?.nombre ?? marcas.find((m) => m.id === row.marca_id)?.nombre ?? '—';

    const columns = [
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

    return (
        <Layout>
            <PageHeader
                title="Sub-marcas"
                description="Administra las sub-marcas de tus productos"
                actions={<CreateButton onClick={openCreate}>Crear sub-marca</CreateButton>}
            />

            {error && <Alert variant="error" className="mb-4">{error}</Alert>}

            <DataTable
                columns={columns}
                rows={filtered}
                loading={loading}
                searchPlaceholder="Buscar sub-marcas..."
                filterable
                filters={filters}
                filterCount={filterCount}
            />

            <Modal
                open={modalOpen}
                onClose={() => setModalOpen(false)}
                title={editing ? 'Editar sub-marca' : 'Crear sub-marca'}
                description={
                    editing ? `Modifica "${editing.nombre}"` : 'Agrega una nueva sub-marca'
                }
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setModalOpen(false)}>
                            Cancelar
                        </Button>
                        <Button type="submit" form="submarca-form" loading={saving}>
                            {editing ? 'Guardar cambios' : 'Crear sub-marca'}
                        </Button>
                    </>
                }
            >
                <form id="submarca-form" onSubmit={handleSubmit} className="space-y-4" noValidate>
                    <Select
                        label="Marca"
                        name="marca_id"
                        value={form.marca_id}
                        onChange={(e) => setForm((prev) => ({ ...prev, marca_id: e.target.value }))}
                        options={marcas.map((m) => ({ value: String(m.id), label: m.nombre }))}
                        error={errors.marca_id}
                    />
                    <Input
                        label="Nombre"
                        name="nombre"
                        placeholder="Ej: Crackers, Galletas, Saborizados"
                        value={form.nombre}
                        onChange={(e) => {
                            setForm((prev) => ({ ...prev, nombre: e.target.value }));
                            if (errors.nombre) {
                                setErrors((prev) => ({ ...prev, nombre: undefined }));
                            }
                        }}
                        error={errors.nombre}
                    />
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                        <input
                            type="checkbox"
                            checked={form.activo}
                            onChange={(e) => setForm((prev) => ({ ...prev, activo: e.target.checked }))}
                            className="h-4 w-4 rounded border-gray-300 accent-primary-600"
                        />
                        Sub-marca activa
                    </label>
                </form>
            </Modal>

            <Modal
                open={Boolean(deleteTarget)}
                onClose={() => setDeleteTarget(null)}
                title="Eliminar sub-marca"
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
                    Los productos que usen esta sub-marca perderán la referencia.
                </Alert>
            </Modal>
        </Layout>
    );
}
