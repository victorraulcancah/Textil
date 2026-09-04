import { useCallback, useEffect, useState } from 'react';
import { Building2, Edit, Mail, Phone, Trash2 } from 'lucide-react';
import api, { asList } from '../lib/api';
import { useToast } from '../lib/toast';
import Layout from '../components/Layout';
import PageHeader, { CreateButton } from '../components/PageHeader';
import { Alert, Badge, Button, DataTable, Input, Modal } from '../components/ui';

const emptyForm = {
    ruc: '',
    razon_social: '',
    nombre_comercial: '',
    direccion: '',
    departamento: '',
    provincia: '',
    distrito: '',
    ciudad: '',
    telefono: '',
    email: '',
    web: '',
    activa: true,
};

export default function Empresa() {
    const toast = useToast();
    const [empresas, setEmpresas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState(emptyForm);
    const [formErrors, setFormErrors] = useState({});
    const [saving, setSaving] = useState(false);
    const [logoFile, setLogoFile] = useState(null);

    const [deleteTarget, setDeleteTarget] = useState(null);
    const [deleting, setDeleting] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            setEmpresas(asList(await api.get('/empresas')));
        } catch {
            setError('No se pudieron cargar las empresas.');
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
        setLogoFile(null);
        setModalOpen(true);
    };

    const openEdit = (e) => {
        setEditing(e);
        setForm({
            ruc: e.ruc ?? '',
            razon_social: e.razon_social ?? '',
            nombre_comercial: e.nombre_comercial ?? '',
            direccion: e.direccion ?? '',
            departamento: e.departamento ?? '',
            provincia: e.provincia ?? '',
            distrito: e.distrito ?? '',
            ciudad: e.ciudad ?? '',
            telefono: e.telefono ?? '',
            email: e.email ?? '',
            web: e.web ?? '',
            activa: Boolean(e.activa),
        });
        setFormErrors({});
        setLogoFile(null);
        setModalOpen(true);
    };

    const handleSubmit = async (ev) => {
        ev.preventDefault();
        setSaving(true);
        setFormErrors({});
        try {
            const fd = new FormData();
            Object.entries(form).forEach(([key, value]) => {
                if (key === 'activa') {
                    fd.append('activa', value ? '1' : '0');
                } else if (value !== null && value !== undefined) {
                    fd.append(key, value);
                }
            });
            if (logoFile) fd.append('logo', logoFile);

            const config = { headers: { 'Content-Type': 'multipart/form-data' } };
            if (editing) {
                fd.append('_method', 'PUT');
                await api.post(`/empresas/${editing.id}`, fd, config);
                toast.success('Empresa actualizada correctamente.');
            } else {
                await api.post('/empresas', fd, config);
                toast.success('Empresa creada correctamente.');
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
                toast.error('No se pudo guardar la empresa.');
            }
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        setDeleting(true);
        try {
            await api.delete(`/empresas/${deleteTarget.id}`);
            toast.success('Empresa eliminada.');
            setDeleteTarget(null);
            await load();
        } catch {
            toast.error('No se pudo eliminar la empresa.');
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
            key: 'nombre_comercial',
            label: 'Empresa',
            render: (row) => (
                <span className="inline-flex items-center gap-2 font-medium text-warm-900">
                    <Building2 className="h-4 w-4 text-primary-600" />
                    {row.nombre_comercial || row.razon_social}
                </span>
            ),
        },
        { key: 'ruc', label: 'RUC', render: (row) => row.ruc || <span className="text-gray-400">—</span> },
        {
            key: 'ciudad',
            label: 'Ciudad',
            render: (row) => row.ciudad || <span className="text-gray-400">—</span>,
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
            key: 'activa',
            label: 'Estado',
            render: (row) =>
                row.activa ? <Badge variant="green">Activa</Badge> : <Badge variant="red">Inactiva</Badge>,
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
                        className="rounded-md p-1.5 text-danger-600 transition hover:bg-danger-50 hover:text-danger-700"
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
                title="Empresas"
                description="Administra las empresas del sistema"
                actions={<CreateButton onClick={openCreate}>Crear empresa</CreateButton>}
            />

            {error && <Alert variant="error" className="mb-4">{error}</Alert>}

            <DataTable
                columns={columns}
                rows={empresas}
                loading={loading}
                searchPlaceholder="Buscar empresas..."
            />

            <Modal
                open={modalOpen}
                onClose={() => setModalOpen(false)}
                title={editing ? 'Editar empresa' : 'Crear empresa'}
                size="lg"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setModalOpen(false)}>
                            Cancelar
                        </Button>
                        <Button type="submit" form="empresa-form" loading={saving}>
                            {editing ? 'Guardar cambios' : 'Crear empresa'}
                        </Button>
                    </>
                }
            >
                <form id="empresa-form" onSubmit={handleSubmit} className="space-y-4" noValidate>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <Input label="RUC" value={form.ruc} onChange={(e) => field('ruc', e.target.value)} error={formErrors.ruc} />
                        <Input label="Razón social" value={form.razon_social} onChange={(e) => field('razon_social', e.target.value)} error={formErrors.razon_social} />
                        <Input label="Nombre comercial" value={form.nombre_comercial} onChange={(e) => field('nombre_comercial', e.target.value)} error={formErrors.nombre_comercial} />
                        <Input label="Teléfono" value={form.telefono} onChange={(e) => field('telefono', e.target.value)} error={formErrors.telefono} />
                        <Input label="Email" type="email" value={form.email} onChange={(e) => field('email', e.target.value)} error={formErrors.email} />
                        <Input label="Sitio web" type="url" placeholder="https://miempresa.com" value={form.web} onChange={(e) => field('web', e.target.value)} error={formErrors.web} />
                        <Input label="Ciudad" value={form.ciudad} onChange={(e) => field('ciudad', e.target.value)} error={formErrors.ciudad} />
                        <Input label="Departamento" value={form.departamento} onChange={(e) => field('departamento', e.target.value)} error={formErrors.departamento} />
                        <Input label="Provincia" value={form.provincia} onChange={(e) => field('provincia', e.target.value)} error={formErrors.provincia} />
                        <Input label="Distrito" value={form.distrito} onChange={(e) => field('distrito', e.target.value)} error={formErrors.distrito} />
                    </div>
                    <Input label="Dirección" value={form.direccion} onChange={(e) => field('direccion', e.target.value)} error={formErrors.direccion} />
                    <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">
                            Logo (para el login y el sidebar)
                        </label>
                        {editing?.logo_url && !logoFile && (
                            <img
                                src={editing.logo_url}
                                alt="Logo actual"
                                className="mb-2 h-16 w-auto rounded-md border border-edge bg-white object-contain p-1"
                            />
                        )}
                        <input
                            type="file"
                            accept="image/png,image/jpeg"
                            onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
                            className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-primary-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary-700 hover:file:bg-primary-100"
                        />
                        {formErrors.logo && (
                            <p className="mt-1 text-xs text-danger-600">{formErrors.logo}</p>
                        )}
                    </div>
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                        <input
                            type="checkbox"
                            checked={form.activa}
                            onChange={(e) => field('activa', e.target.checked)}
                            className="h-4 w-4 rounded border-gray-300 accent-primary-600"
                        />
                        Empresa activa
                    </label>
                </form>
            </Modal>

            <Modal
                open={Boolean(deleteTarget)}
                onClose={() => setDeleteTarget(null)}
                title="Eliminar empresa"
                description={`¿Seguro que deseas eliminar "${deleteTarget?.nombre_comercial ?? deleteTarget?.razon_social}"?`}
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
                <Alert variant="warning">Los usuarios y documentos asociados a esta empresa podrían verse afectados.</Alert>
            </Modal>
        </Layout>
    );
}
