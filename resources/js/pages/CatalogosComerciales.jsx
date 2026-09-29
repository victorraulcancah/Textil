import { useCallback, useEffect, useState } from 'react';
import { Briefcase, Edit, Tag, Trash2 } from 'lucide-react';
import api, { asList } from '../lib/api';
import { useToast } from '../lib/toast';
import Layout from '../components/Layout';
import PageHeader, { CreateButton } from '../components/PageHeader';
import { Alert, Badge, Button, DataTable, Input, Modal } from '../components/ui';

/** Los dos catálogos del cliente: funcionan igual, cambian los textos. */
export const CATALOGOS_COMERCIALES = {
    categorias: {
        titulo: 'Categorías comerciales',
        descripcion: 'Cómo clasificas a tus clientes',
        endpoint: '/categorias-comerciales',
        // Para elegir en el cliente: van con el permiso de Clientes.
        opciones: '/clientes/categorias-comerciales',
        permiso: 'ventas.categorias-comerciales',
        singular: 'categoría',
        placeholder: 'Ej: A, B, Mayorista',
        icon: Tag,
    },
    actividades: {
        titulo: 'Actividades comerciales',
        descripcion: 'A qué se dedican tus clientes',
        endpoint: '/actividades-comerciales',
        opciones: '/clientes/actividades-comerciales',
        permiso: 'ventas.actividades-comerciales',
        singular: 'actividad',
        placeholder: 'Ej: Confección de prendas, Distribuidor',
        icon: Briefcase,
    },
};

export default function CatalogoComercial({ tipo }) {
    const cfg = CATALOGOS_COMERCIALES[tipo];
    const Icono = cfg.icon;
    const toast = useToast();
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState({ nombre: '', activo: true });
    const [errors, setErrors] = useState({});
    const [saving, setSaving] = useState(false);

    const [deleteTarget, setDeleteTarget] = useState(null);
    const [deleting, setDeleting] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            setItems(asList(await api.get(cfg.endpoint)));
        } catch {
            setError(`No se pudieron cargar las ${cfg.titulo.toLowerCase()}.`);
        } finally {
            setLoading(false);
        }
    }, [cfg]);

    useEffect(() => {
        load();
    }, [load]);

    const openCreate = () => {
        setEditing(null);
        setForm({ nombre: '', activo: true });
        setErrors({});
        setModalOpen(true);
    };

    const openEdit = (item) => {
        setEditing(item);
        setForm({ nombre: item.nombre, activo: Boolean(item.activo) });
        setErrors({});
        setModalOpen(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        setErrors({});
        try {
            if (editing) {
                await api.put(`${cfg.endpoint}/${editing.id}`, form);
                toast.success(`Se actualizó la ${cfg.singular}.`);
            } else {
                await api.post(cfg.endpoint, form);
                toast.success(`Se creó la ${cfg.singular}.`);
            }
            setModalOpen(false);
            await load();
        } catch (err) {
            if (err.response?.status === 422) {
                setErrors(Object.fromEntries(Object.entries(err.response.data?.errors ?? {}).map(([k, v]) => [k, v[0]])));
            } else {
                toast.error(`No se pudo guardar la ${cfg.singular}.`);
            }
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        setDeleting(true);
        try {
            const { data } = await api.delete(`${cfg.endpoint}/${deleteTarget.id}`);
            // Si la usan clientes, no se borra: queda inactiva.
            if (data?.desactivado) toast.warning(data.message);
            else toast.success(`Se eliminó la ${cfg.singular}.`);
            setDeleteTarget(null);
            await load();
        } catch {
            toast.error(`No se pudo eliminar la ${cfg.singular}.`);
        } finally {
            setDeleting(false);
        }
    };

    const columns = [
        {
            key: 'nombre',
            label: 'Nombre',
            render: (row) => (
                <span className="inline-flex items-center gap-2 font-medium text-warm-900">
                    <Icono className="h-4 w-4 text-primary-600" />
                    {row.nombre}
                </span>
            ),
        },
        {
            key: 'clientes_count',
            label: 'Clientes',
            render: (row) => <span className="text-gray-700">{row.clientes_count ?? 0}</span>,
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
                    <button aria-label="Editar" onClick={() => openEdit(row)}
                        className="rounded-md p-1.5 text-primary-600 transition hover:bg-primary-50 hover:text-primary-700">
                        <Edit className="h-4 w-4" />
                    </button>
                    <button aria-label="Eliminar" onClick={() => setDeleteTarget(row)}
                        className="rounded-md p-1.5 text-red-600 transition hover:bg-red-50 hover:text-red-700">
                        <Trash2 className="h-4 w-4" />
                    </button>
                </>
            ),
        },
    ];

    return (
        <Layout>
            <PageHeader
                title={cfg.titulo}
                description={cfg.descripcion}
                actions={<CreateButton onClick={openCreate}>Crear {cfg.singular}</CreateButton>}
            />

            {error && <Alert variant="error" className="mb-4">{error}</Alert>}

            <DataTable
                columns={columns}
                rows={items}
                loading={loading}
                searchPlaceholder={`Buscar ${cfg.titulo.toLowerCase()}...`}
            />

            <Modal
                open={modalOpen}
                onClose={() => setModalOpen(false)}
                title={editing ? `Editar ${cfg.singular}` : `Crear ${cfg.singular}`}
                size="sm"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button>
                        <Button type="submit" form="catalogo-comercial-form" loading={saving}>
                            {editing ? 'Guardar cambios' : `Crear ${cfg.singular}`}
                        </Button>
                    </>
                }
            >
                <form id="catalogo-comercial-form" onSubmit={handleSubmit} className="space-y-4" noValidate>
                    <Input
                        label="Nombre"
                        placeholder={cfg.placeholder}
                        value={form.nombre}
                        onChange={(e) => {
                            setForm((prev) => ({ ...prev, nombre: e.target.value }));
                            if (errors.nombre) setErrors((prev) => ({ ...prev, nombre: undefined }));
                        }}
                        error={errors.nombre}
                        autoFocus
                    />
                    {editing && (
                        <label className="flex items-center gap-2 text-sm text-gray-700">
                            <input type="checkbox" checked={form.activo}
                                onChange={(e) => setForm((prev) => ({ ...prev, activo: e.target.checked }))}
                                className="h-4 w-4 rounded border-gray-300 accent-primary-600" />
                            Activa (se puede elegir en los clientes)
                        </label>
                    )}
                </form>
            </Modal>

            <Modal
                open={Boolean(deleteTarget)}
                onClose={() => setDeleteTarget(null)}
                title={`Eliminar ${cfg.singular}`}
                description={`¿Seguro que deseas eliminar "${deleteTarget?.nombre}"?`}
                size="sm"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
                        <Button variant="danger" loading={deleting} onClick={handleDelete}>Eliminar</Button>
                    </>
                }
            >
                <Alert variant="warning">Si algún cliente la tiene, no se borra: queda inactiva.</Alert>
            </Modal>
        </Layout>
    );
}
