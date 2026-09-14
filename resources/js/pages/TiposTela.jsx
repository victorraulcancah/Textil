import { useCallback, useEffect, useState } from 'react';
import { Edit, Layers3, Shapes, Trash2 } from 'lucide-react';
import api, { asList } from '../lib/api';
import { useToast } from '../lib/toast';
import Layout from '../components/Layout';
import PageHeader, { CreateButton } from '../components/PageHeader';
import { Alert, Badge, Button, DataTable, Input, Modal, Select, Tabs } from '../components/ui';

/**
 * Familias de tela (poliéster, algodón...) y sus tipos (Trenza, Polinan...).
 * El código de una tela sale de aquí: "01-{familia}-{tipo}". Antes cada
 * producto escribía su código a mano; ahora se arma solo al elegir el tipo.
 */
export default function TiposTela() {
    const toast = useToast();
    const [tab, setTab] = useState('familias');
    const [familias, setFamilias] = useState([]);
    const [tipos, setTipos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState({ nombre: '', familia_tela_id: '', activo: true });
    const [errors, setErrors] = useState({});
    const [saving, setSaving] = useState(false);

    const [deleteTarget, setDeleteTarget] = useState(null);
    const [deleting, setDeleting] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [famRes, tipRes] = await Promise.all([api.get('/familias-tela'), api.get('/tipos-tela')]);
            setFamilias(asList(famRes));
            setTipos(asList(tipRes));
        } catch {
            setError('No se pudo cargar el catálogo de tela.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const openCreate = () => {
        setEditing(null);
        setForm({ nombre: '', familia_tela_id: tab === 'tipos' && familias[0] ? String(familias[0].id) : '', activo: true });
        setErrors({});
        setModalOpen(true);
    };

    const openEdit = (row) => {
        setEditing(row);
        setForm({
            nombre: row.nombre,
            familia_tela_id: row.familia_tela_id ? String(row.familia_tela_id) : '',
            activo: Boolean(row.activo),
        });
        setErrors({});
        setModalOpen(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        setErrors({});

        const esFamilia = tab === 'familias';
        const endpoint = esFamilia ? '/familias-tela' : '/tipos-tela';
        const payload = esFamilia
            ? { nombre: form.nombre, activo: form.activo }
            : { nombre: form.nombre, familia_tela_id: form.familia_tela_id, activo: form.activo };

        try {
            if (editing) {
                await api.put(`${endpoint}/${editing.id}`, payload);
                toast.success('Guardado correctamente.');
            } else {
                await api.post(endpoint, payload);
                toast.success('Creado correctamente.');
            }
            setModalOpen(false);
            await load();
        } catch (err) {
            if (err.response?.status === 422) {
                const validation = err.response.data?.errors ?? {};
                if (Object.keys(validation).length) {
                    setErrors(Object.fromEntries(Object.entries(validation).map(([k, v]) => [k, v[0]])));
                } else {
                    toast.error(err.response.data?.message ?? 'No se pudo guardar.');
                }
            } else {
                toast.error('No se pudo guardar.');
            }
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        setDeleting(true);
        const endpoint = tab === 'familias' ? '/familias-tela' : '/tipos-tela';
        try {
            await api.delete(`${endpoint}/${deleteTarget.id}`);
            toast.success('Eliminado.');
            setDeleteTarget(null);
            await load();
        } catch (err) {
            toast.error(err.response?.data?.message ?? 'No se pudo eliminar.');
        } finally {
            setDeleting(false);
        }
    };

    const familiaOptions = familias.map((f) => ({ value: String(f.id), label: `${f.codigo} — ${f.nombre}` }));

    const columnasFamilias = [
        { key: 'codigo', label: 'Código', render: (row) => <Badge variant="blue">{row.codigo}</Badge> },
        {
            key: 'nombre',
            label: 'Familia',
            render: (row) => (
                <span className="inline-flex items-center gap-2 font-medium text-warm-900">
                    <Layers3 className="h-4 w-4 text-primary-600" /> {row.nombre}
                </span>
            ),
        },
        { key: 'tipos_count', label: 'Tipos', render: (row) => `${row.tipos_count ?? 0} tipo(s)` },
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
                    <button aria-label="Editar" onClick={() => openEdit(row)} className="rounded-md p-1.5 text-primary-600 hover:bg-primary-50">
                        <Edit className="h-4 w-4" />
                    </button>
                    <button aria-label="Eliminar" onClick={() => setDeleteTarget(row)} className="rounded-md p-1.5 text-red-600 hover:bg-red-50">
                        <Trash2 className="h-4 w-4" />
                    </button>
                </>
            ),
        },
    ];

    const columnasTipos = [
        {
            key: 'codigo_completo',
            label: 'Código',
            render: (row) => <Badge variant="blue">01-{row.familia?.codigo}-{row.codigo}</Badge>,
        },
        {
            key: 'nombre',
            label: 'Tipo de tela',
            render: (row) => (
                <span className="inline-flex items-center gap-2 font-medium text-warm-900">
                    <Shapes className="h-4 w-4 text-primary-600" /> {row.nombre}
                </span>
            ),
        },
        { key: 'familia', label: 'Familia', render: (row) => row.familia?.nombre ?? '—' },
        { key: 'productos_count', label: 'Telas', render: (row) => `${row.productos_count ?? 0} tela(s)` },
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
                    <button aria-label="Editar" onClick={() => openEdit(row)} className="rounded-md p-1.5 text-primary-600 hover:bg-primary-50">
                        <Edit className="h-4 w-4" />
                    </button>
                    <button aria-label="Eliminar" onClick={() => setDeleteTarget(row)} className="rounded-md p-1.5 text-red-600 hover:bg-red-50">
                        <Trash2 className="h-4 w-4" />
                    </button>
                </>
            ),
        },
    ];

    return (
        <Layout>
            <PageHeader
                title="Familias y tipos de tela"
                description='El código de una tela sale de aquí: "01-familia-tipo"'
                actions={
                    <CreateButton onClick={openCreate}>
                        {tab === 'familias' ? 'Crear familia' : 'Crear tipo de tela'}
                    </CreateButton>
                }
            />

            {error && <Alert variant="error" className="mb-4">{error}</Alert>}

            <div className="mb-4">
                <Tabs
                    items={[
                        { key: 'familias', label: 'Familias', icon: Layers3 },
                        { key: 'tipos', label: 'Tipos de tela', icon: Shapes },
                    ]}
                    value={tab}
                    onChange={setTab}
                />
            </div>

            <DataTable
                columns={tab === 'familias' ? columnasFamilias : columnasTipos}
                rows={tab === 'familias' ? familias : tipos}
                loading={loading}
                searchPlaceholder={tab === 'familias' ? 'Buscar familias...' : 'Buscar tipos de tela...'}
            />

            <Modal
                open={modalOpen}
                onClose={() => setModalOpen(false)}
                title={
                    editing
                        ? `Editar ${tab === 'familias' ? 'familia' : 'tipo de tela'}`
                        : `Crear ${tab === 'familias' ? 'familia' : 'tipo de tela'}`
                }
                description={
                    editing
                        ? `Modifica "${editing.nombre}" (código ${editing.codigo})`
                        : 'El código se asigna automáticamente'
                }
                size="sm"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setModalOpen(false)}>
                            Cancelar
                        </Button>
                        <Button type="submit" form="tela-form" loading={saving}>
                            {editing ? 'Guardar cambios' : 'Crear'}
                        </Button>
                    </>
                }
            >
                <form id="tela-form" onSubmit={handleSubmit} className="space-y-4" noValidate>
                    {tab === 'tipos' && (
                        <Select
                            label="Familia"
                            value={form.familia_tela_id}
                            onChange={(e) => setForm((prev) => ({ ...prev, familia_tela_id: e.target.value }))}
                            options={[{ value: '', label: 'Elige una familia…' }, ...familiaOptions]}
                            error={errors.familia_tela_id}
                        />
                    )}
                    <Input
                        label="Nombre"
                        name="nombre"
                        placeholder={tab === 'familias' ? 'Ej: Poliéster' : 'Ej: Trenza'}
                        value={form.nombre}
                        onChange={(e) => {
                            setForm((prev) => ({ ...prev, nombre: e.target.value.toUpperCase() }));
                            if (errors.nombre) setErrors((prev) => ({ ...prev, nombre: undefined }));
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
                        Activo
                    </label>
                </form>
            </Modal>

            <Modal
                open={Boolean(deleteTarget)}
                onClose={() => setDeleteTarget(null)}
                title="Eliminar"
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
                    {tab === 'familias'
                        ? 'Si tiene tipos de tela registrados, elimínalos primero.'
                        : 'Si ya hay telas con este tipo, no se podrá eliminar.'}
                </Alert>
            </Modal>
        </Layout>
    );
}
