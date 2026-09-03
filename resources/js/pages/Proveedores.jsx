import { useCallback, useEffect, useState } from 'react';
import { Building2, Edit, Mail, Phone, Trash2, User } from 'lucide-react';
import api, { asList } from '../lib/api';
import { useToast } from '../lib/toast';
import Layout from '../components/Layout';
import PageHeader, { CreateButton } from '../components/PageHeader';
import { Alert, Badge, Button, DataTable, Input, Modal } from '../components/ui';

const emptyForm = {
    nombre: '',
    codigo: '',
    ruc: '',
    direccion: '',
    telefono: '',
    email: '',
    contacto_nombre: '',
    activo: true,
};

export default function Proveedores() {
    const toast = useToast();
    const [proveedores, setProveedores] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

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
            setProveedores(asList(await api.get('/proveedores')));
        } catch {
            setError('No se pudieron cargar los proveedores.');
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

    const openEdit = (p) => {
        setEditing(p);
        setForm({
            nombre: p.nombre ?? '',
            codigo: p.codigo ?? '',
            ruc: p.ruc ?? '',
            direccion: p.direccion ?? '',
            telefono: p.telefono ?? '',
            email: p.email ?? '',
            contacto_nombre: p.contacto_nombre ?? '',
            activo: Boolean(p.activo),
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
                await api.put(`/proveedores/${editing.id}`, form);
                toast.success('Proveedor actualizado correctamente.');
            } else {
                await api.post('/proveedores', form);
                toast.success('Proveedor creado correctamente.');
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
                toast.error('No se pudo guardar el proveedor.');
            }
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        setDeleting(true);
        try {
            await api.delete(`/proveedores/${deleteTarget.id}`);
            toast.success('Proveedor eliminado.');
            setDeleteTarget(null);
            await load();
        } catch {
            toast.error('No se pudo eliminar el proveedor.');
        } finally {
            setDeleting(false);
        }
    };

    const field = (name, value) => {
        setForm((prev) => ({ ...prev, [name]: value }));
        if (formErrors[name]) setFormErrors((prev) => ({ ...prev, [name]: undefined }));
    };

    const columns = [
        {
            key: 'nombre',
            label: 'Proveedor',
            render: (row) => (
                <span className="inline-flex items-center gap-2 font-medium text-warm-900">
                    <Building2 className="h-4 w-4 text-primary-600" />
                    {row.nombre}
                </span>
            ),
        },
        { key: 'codigo', label: 'Código', render: (row) => <Badge variant="gray">{row.codigo}</Badge> },
        { key: 'ruc', label: 'RUC', render: (row) => row.ruc || <span className="text-gray-400">—</span> },
        {
            key: 'contacto_nombre',
            label: 'Contacto',
            render: (row) =>
                row.contacto_nombre ? (
                    <span className="inline-flex items-center gap-1.5 text-gray-700">
                        <User className="h-3.5 w-3.5 text-gray-400" />
                        {row.contacto_nombre}
                    </span>
                ) : (
                    <span className="text-gray-400">—</span>
                ),
        },
        {
            key: 'telefono',
            label: 'Teléfono',
            render: (row) =>
                row.telefono ? (
                    <span className="inline-flex items-center gap-1.5 text-gray-700">
                        <Phone className="h-3.5 w-3.5 text-gray-400" />
                        {row.telefono}
                    </span>
                ) : (
                    <span className="text-gray-400">—</span>
                ),
        },
        {
            key: 'email',
            label: 'Email',
            render: (row) =>
                row.email ? (
                    <span className="inline-flex items-center gap-1.5 text-gray-700">
                        <Mail className="h-3.5 w-3.5 text-gray-400" />
                        {row.email}
                    </span>
                ) : (
                    <span className="text-gray-400">—</span>
                ),
        },
        {
            key: 'activo',
            label: 'Estado',
            render: (row) =>
                row.activo ? <Badge variant="green">Activo</Badge> : <Badge variant="red">Inactivo</Badge>,
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
                title="Proveedores"
                description="Administra tus proveedores"
                actions={<CreateButton onClick={openCreate}>Crear proveedor</CreateButton>}
            />

            {error && <Alert variant="error" className="mb-4">{error}</Alert>}

            <DataTable
                columns={columns}
                rows={proveedores}
                loading={loading}
                searchPlaceholder="Buscar proveedores..."
            />

            <Modal
                open={modalOpen}
                onClose={() => setModalOpen(false)}
                title={editing ? 'Editar proveedor' : 'Crear proveedor'}
                size="lg"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setModalOpen(false)}>
                            Cancelar
                        </Button>
                        <Button type="submit" form="proveedor-form" loading={saving}>
                            {editing ? 'Guardar cambios' : 'Crear proveedor'}
                        </Button>
                    </>
                }
            >
                <form id="proveedor-form" onSubmit={handleSubmit} className="space-y-4" noValidate>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <Input label="Nombre" value={form.nombre} onChange={(e) => field('nombre', e.target.value)} error={formErrors.nombre} />
                        <Input label="Código" value={form.codigo} onChange={(e) => field('codigo', e.target.value)} error={formErrors.codigo} />
                        <Input label="RUC" value={form.ruc} onChange={(e) => field('ruc', e.target.value)} error={formErrors.ruc} />
                        <Input label="Contacto" value={form.contacto_nombre} onChange={(e) => field('contacto_nombre', e.target.value)} error={formErrors.contacto_nombre} />
                        <Input label="Teléfono" value={form.telefono} onChange={(e) => field('telefono', e.target.value)} error={formErrors.telefono} />
                        <Input label="Email" type="email" value={form.email} onChange={(e) => field('email', e.target.value)} error={formErrors.email} />
                    </div>
                    <Input label="Dirección" value={form.direccion} onChange={(e) => field('direccion', e.target.value)} error={formErrors.direccion} />
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                        <input
                            type="checkbox"
                            checked={form.activo}
                            onChange={(e) => field('activo', e.target.checked)}
                            className="h-4 w-4 rounded border-gray-300 accent-primary-600"
                        />
                        Proveedor activo
                    </label>
                </form>
            </Modal>

            <Modal
                open={Boolean(deleteTarget)}
                onClose={() => setDeleteTarget(null)}
                title="Eliminar proveedor"
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
                <Alert variant="warning">Las compras asociadas a este proveedor podrían verse afectadas.</Alert>
            </Modal>
        </Layout>
    );
}
