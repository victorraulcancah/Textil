import { useCallback, useEffect, useState } from 'react';
import { Edit, IdCard, Mail, Phone, Trash2, User } from 'lucide-react';
import api, { asList } from '../lib/api';
import { useToast } from '../lib/toast';
import Layout from '../components/Layout';
import PageHeader, { CreateButton } from '../components/PageHeader';
import { Alert, Badge, Button, DataTable, Input, Modal, Select } from '../components/ui';

const emptyForm = {
    nombre: '',
    tipo_documento: 'DNI',
    numero_documento: '',
    direccion: '',
    telefono: '',
    email: '',
    activo: true,
};

export default function Clientes() {
    const toast = useToast();
    const [clientes, setClientes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [fTipoDoc, setFTipoDoc] = useState('');
    const [fEstado, setFEstado] = useState('');

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
            setClientes(asList(await api.get('/clientes')));
        } catch {
            setError('No se pudieron cargar los clientes.');
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

    const openEdit = (c) => {
        setEditing(c);
        setForm({
            nombre: c.nombre ?? '',
            tipo_documento: c.tipo_documento ?? 'DNI',
            numero_documento: c.numero_documento ?? '',
            direccion: c.direccion ?? '',
            telefono: c.telefono ?? '',
            email: c.email ?? '',
            activo: Boolean(c.activo),
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
                await api.put(`/clientes/${editing.id}`, form);
                toast.success('Cliente actualizado correctamente.');
            } else {
                await api.post('/clientes', form);
                toast.success('Cliente creado correctamente.');
            }
            setModalOpen(false);
            await load();
        } catch (err) {
            if (err.response?.status === 422) {
                setFormErrors(Object.fromEntries(Object.entries(err.response.data?.errors ?? {}).map(([k, v]) => [k, v[0]])));
            } else {
                toast.error('No se pudo guardar el cliente.');
            }
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        setDeleting(true);
        try {
            await api.delete(`/clientes/${deleteTarget.id}`);
            toast.success('Cliente eliminado.');
            setDeleteTarget(null);
            await load();
        } catch {
            toast.error('No se pudo eliminar el cliente.');
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
            label: 'Cliente',
            render: (row) => (
                <span className="inline-flex items-center gap-2 font-medium text-warm-900">
                    <User className="h-4 w-4 text-primary-600" />
                    {row.nombre}
                </span>
            ),
        },
        {
            key: 'documento',
            label: 'Documento',
            getSearchValue: (row) => row.numero_documento,
            render: (row) =>
                row.numero_documento ? (
                    <span className="inline-flex items-center gap-1.5 text-gray-700">
                        <IdCard className="h-3.5 w-3.5 text-gray-400" />
                        {row.tipo_documento} {row.numero_documento}
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
            render: (row) => (row.activo ? <Badge variant="green">Activo</Badge> : <Badge variant="red">Inactivo</Badge>),
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
                title="Clientes"
                description="Administra tus clientes"
                actions={<CreateButton onClick={openCreate}>Crear cliente</CreateButton>}
            />

            {error && <Alert variant="error" className="mb-4">{error}</Alert>}

            <DataTable
                columns={columns}
                rows={clientes.filter(
                    (c) =>
                        (!fTipoDoc || c.tipo_documento === fTipoDoc) &&
                        (!fEstado || (fEstado === 'activo' ? c.activo : !c.activo)),
                )}
                loading={loading}
                searchPlaceholder="Buscar clientes..."
                filterable
                filterCount={(fTipoDoc ? 1 : 0) + (fEstado ? 1 : 0)}
                filters={
                    <div className="space-y-2">
                        <Select
                            label="Tipo de documento"
                            value={fTipoDoc}
                            onChange={(e) => setFTipoDoc(e.target.value)}
                            options={[
                                { value: '', label: 'Todos' },
                                { value: 'DNI', label: 'DNI' },
                                { value: 'RUC', label: 'RUC' },
                                { value: 'CE', label: 'Carné de extranjería' },
                                { value: 'SIN', label: 'Sin documento' },
                            ]}
                        />
                        <Select
                            label="Estado"
                            value={fEstado}
                            onChange={(e) => setFEstado(e.target.value)}
                            options={[
                                { value: '', label: 'Todos' },
                                { value: 'activo', label: 'Activos' },
                                { value: 'inactivo', label: 'Inactivos' },
                            ]}
                        />
                        {(fTipoDoc || fEstado) && (
                            <button
                                onClick={() => {
                                    setFTipoDoc('');
                                    setFEstado('');
                                }}
                                className="text-xs font-medium text-red-600 hover:text-red-700"
                            >
                                Limpiar filtros
                            </button>
                        )}
                    </div>
                }
            />

            <Modal
                open={modalOpen}
                onClose={() => setModalOpen(false)}
                title={editing ? 'Editar cliente' : 'Crear cliente'}
                size="lg"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button>
                        <Button type="submit" form="cliente-form" loading={saving}>{editing ? 'Guardar cambios' : 'Crear cliente'}</Button>
                    </>
                }
            >
                <form id="cliente-form" onSubmit={handleSubmit} className="space-y-4" noValidate>
                    <Input label="Nombre" value={form.nombre} onChange={(e) => field('nombre', e.target.value)} error={formErrors.nombre} />
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                        <Select
                            label="Tipo doc."
                            value={form.tipo_documento}
                            onChange={(e) => field('tipo_documento', e.target.value)}
                            options={[
                                { value: 'DNI', label: 'DNI' },
                                { value: 'RUC', label: 'RUC' },
                                { value: 'CE', label: 'Carné Ext.' },
                                { value: 'SIN', label: 'Sin documento' },
                            ]}
                        />
                        <Input label="N° Documento" className="sm:col-span-2" value={form.numero_documento} onChange={(e) => field('numero_documento', e.target.value)} error={formErrors.numero_documento} />
                    </div>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <Input label="Teléfono" value={form.telefono} onChange={(e) => field('telefono', e.target.value)} error={formErrors.telefono} />
                        <Input label="Email" type="email" value={form.email} onChange={(e) => field('email', e.target.value)} error={formErrors.email} />
                    </div>
                    <Input label="Dirección" value={form.direccion} onChange={(e) => field('direccion', e.target.value)} error={formErrors.direccion} />
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                        <input type="checkbox" checked={form.activo} onChange={(e) => field('activo', e.target.checked)}
                            className="h-4 w-4 rounded border-gray-300 accent-primary-600" />
                        Cliente activo
                    </label>
                </form>
            </Modal>

            <Modal
                open={Boolean(deleteTarget)}
                onClose={() => setDeleteTarget(null)}
                title="Eliminar cliente"
                description={`¿Seguro que deseas eliminar "${deleteTarget?.nombre}"?`}
                size="sm"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
                        <Button variant="danger" loading={deleting} onClick={handleDelete}>Eliminar</Button>
                    </>
                }
            >
                <Alert variant="warning">Las ventas asociadas a este cliente podrían verse afectadas.</Alert>
            </Modal>
        </Layout>
    );
}
