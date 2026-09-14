import { useCallback, useEffect, useState } from 'react';
import { Edit, Palette, Trash2 } from 'lucide-react';
import api, { asList } from '../lib/api';
import { useToast } from '../lib/toast';
import Layout from '../components/Layout';
import PageHeader, { CreateButton } from '../components/PageHeader';
import { Alert, Badge, Button, DataTable, Input, Modal } from '../components/ui';

const emptyForm = { nombre: '', hex: '', activo: true };

/**
 * El catálogo de colores compartido entre todas las telas: se crea una vez
 * acá y desde el producto solo se elige, en vez de escribirlo de nuevo cada
 * vez. El código de 4 dígitos lo asigna el sistema —nunca se reutiliza uno
 * ya usado, aunque el color se borre— así que no se pide al crear.
 */
export default function Colores() {
    const toast = useToast();
    const [colores, setColores] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState(emptyForm);
    const [errors, setErrors] = useState({});
    const [saving, setSaving] = useState(false);

    const [deleteTarget, setDeleteTarget] = useState(null);
    const [deleting, setDeleting] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.get('/colores');
            setColores(asList(res));
        } catch {
            setError('No se pudieron cargar los colores.');
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
        setErrors({});
        setModalOpen(true);
    };

    const openEdit = (color) => {
        setEditing(color);
        setForm({ nombre: color.nombre, hex: color.hex ?? '', activo: Boolean(color.activo) });
        setErrors({});
        setModalOpen(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        setErrors({});

        try {
            if (editing) {
                await api.put(`/colores/${editing.id}`, form);
                toast.success('Color actualizado correctamente.');
            } else {
                await api.post('/colores', form);
                toast.success('Color creado correctamente.');
            }
            setModalOpen(false);
            await load();
        } catch (err) {
            if (err.response?.status === 422) {
                const validation = err.response.data?.errors ?? {};
                setErrors(Object.fromEntries(Object.entries(validation).map(([k, v]) => [k, v[0]])));
            } else {
                toast.error('No se pudo guardar el color.');
            }
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        setDeleting(true);
        try {
            await api.delete(`/colores/${deleteTarget.id}`);
            toast.success('Color eliminado.');
            setDeleteTarget(null);
            await load();
        } catch (err) {
            toast.error(err.response?.data?.message ?? 'No se pudo eliminar el color.');
        } finally {
            setDeleting(false);
        }
    };

    const columns = [
        {
            key: 'codigo',
            label: 'Código',
            render: (row) => <Badge variant="blue">{row.codigo}</Badge>,
        },
        {
            key: 'nombre',
            label: 'Nombre',
            render: (row) => (
                <span className="inline-flex items-center gap-2 font-medium text-warm-900">
                    <span
                        className="h-4 w-4 shrink-0 rounded-full border border-edge"
                        style={{ background: row.hex || '#e5e7eb' }}
                    />
                    {row.nombre}
                </span>
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
                title="Colores"
                description="El catálogo de colores: se crea una vez y todas las telas lo eligen de aquí"
                actions={<CreateButton onClick={openCreate}>Crear color</CreateButton>}
            />

            {error && <Alert variant="error" className="mb-4">{error}</Alert>}

            <DataTable columns={columns} rows={colores} loading={loading} searchPlaceholder="Buscar colores..." />

            <Modal
                open={modalOpen}
                onClose={() => setModalOpen(false)}
                title={editing ? 'Editar color' : 'Crear color'}
                description={
                    editing
                        ? `Modifica "${editing.nombre}" (código ${editing.codigo})`
                        : 'El código de 4 dígitos se asigna automáticamente'
                }
                size="sm"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setModalOpen(false)}>
                            Cancelar
                        </Button>
                        <Button type="submit" form="color-form" loading={saving}>
                            {editing ? 'Guardar cambios' : 'Crear color'}
                        </Button>
                    </>
                }
            >
                <form id="color-form" onSubmit={handleSubmit} className="space-y-4" noValidate>
                    <Input
                        label="Nombre"
                        name="nombre"
                        placeholder="Ej: Camello, Azul Marino"
                        value={form.nombre}
                        onChange={(e) => {
                            setForm((prev) => ({ ...prev, nombre: e.target.value.toUpperCase() }));
                            if (errors.nombre) setErrors((prev) => ({ ...prev, nombre: undefined }));
                        }}
                        error={errors.nombre}
                    />
                    <div className="flex items-center gap-3">
                        <Palette className="h-4 w-4 text-warm-400" />
                        <input
                            type="color"
                            value={form.hex || '#cccccc'}
                            onChange={(e) => setForm((prev) => ({ ...prev, hex: e.target.value }))}
                            className="h-9 w-14 cursor-pointer rounded border border-edge"
                        />
                        <span className="text-xs text-warm-500">Muestra en pantalla (opcional)</span>
                    </div>
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                        <input
                            type="checkbox"
                            checked={form.activo}
                            onChange={(e) => setForm((prev) => ({ ...prev, activo: e.target.checked }))}
                            className="h-4 w-4 rounded border-gray-300 accent-primary-600"
                        />
                        Color activo
                    </label>
                </form>
            </Modal>

            <Modal
                open={Boolean(deleteTarget)}
                onClose={() => setDeleteTarget(null)}
                title="Eliminar color"
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
                    Si el color ya está asignado a alguna tela, no se podrá eliminar.
                </Alert>
            </Modal>
        </Layout>
    );
}
