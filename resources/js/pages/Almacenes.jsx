import { useCallback, useEffect, useState } from 'react';
import { BadgeCheck, Edit, MapPin, Power, PowerOff, Tag, Trash2, Warehouse } from 'lucide-react';
import api, { asList } from '../lib/api';
import { useToast } from '../lib/toast';
import Layout from '../components/Layout';
import PageHeader, { CreateButton } from '../components/PageHeader';
import { Alert, Badge, Button, DataTable, Input, Modal, Select } from '../components/ui';

const emptyForm = { nombre: '', codigo: '', tipo: 'principal', direccion: '', activo: true };

export default function Almacenes() {
    const toast = useToast();
    const [almacenes, setAlmacenes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState(emptyForm);
    const [formErrors, setFormErrors] = useState({});
    const [saving, setSaving] = useState(false);

    const [deleteTarget, setDeleteTarget] = useState(null);
    // Respuesta 409 del servidor: por qué no se puede eliminar este almacén.
    const [bloqueo, setBloqueo] = useState(null);
    // Id del almacén cuyo activo/inactivo se está guardando.
    const [toggling, setToggling] = useState(null);
    const [deleting, setDeleting] = useState(false);

    const [filterEstado, setFilterEstado] = useState('');
    const [activeFilters, setActiveFilters] = useState({});

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            setAlmacenes(asList(await api.get('/almacenes')));
        } catch {
            setError('No se pudieron cargar los almacenes.');
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

    const openEdit = (almacen) => {
        setEditing(almacen);
        setForm({
            nombre: almacen.nombre,
            codigo: almacen.codigo,
            tipo: almacen.tipo ?? 'principal',
            direccion: almacen.direccion ?? '',
            activo: Boolean(almacen.activo),
        });
        setFormErrors({});
        setModalOpen(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        setFormErrors({});

        const payload = { ...form };

        try {
            if (editing) {
                await api.put(`/almacenes/${editing.id}`, payload);
                toast.success('Almacén actualizado correctamente.');
            } else {
                await api.post('/almacenes', payload);
                toast.success('Almacén creado correctamente.');
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
                toast.error('No se pudo guardar el almacén.');
            }
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        setDeleting(true);
        setBloqueo(null);
        try {
            await api.delete(`/almacenes/${deleteTarget.id}`);
            toast.success('Almacén eliminado.');
            setDeleteTarget(null);
            await load();
        } catch (err) {
            // 409: tiene historial. No es un fallo, es que corresponde desactivar.
            if (err.response?.status === 409) {
                setBloqueo(err.response.data);
            } else {
                toast.error('No se pudo eliminar el almacén.');
            }
        } finally {
            setDeleting(false);
        }
    };

    /** Guarda el almacén cambiando solo su estado activo/inactivo. */
    const guardarActivo = (almacen, activo) =>
        api.put(`/almacenes/${almacen.id}`, {
            nombre: almacen.nombre,
            codigo: almacen.codigo,
            tipo: almacen.tipo,
            direccion: almacen.direccion,
            activo,
        });

    const toggleActivo = async (almacen) => {
        const activar = !almacen.activo;
        setToggling(almacen.id);
        try {
            await guardarActivo(almacen, activar);
            toast.success(
                activar
                    ? `"${almacen.nombre}" está activo de nuevo.`
                    : `"${almacen.nombre}" quedó desactivado. Su historial se conserva.`,
            );
            await load();
        } catch {
            toast.error(activar ? 'No se pudo activar el almacén.' : 'No se pudo desactivar el almacén.');
        } finally {
            setToggling(null);
        }
    };

    const handleDesactivar = async () => {
        setDeleting(true);
        try {
            await guardarActivo(deleteTarget, false);
            toast.success('Almacén desactivado. Su historial se conserva.');
            cerrarEliminar();
            await load();
        } catch {
            toast.error('No se pudo desactivar el almacén.');
        } finally {
            setDeleting(false);
        }
    };

    const cerrarEliminar = () => {
        setDeleteTarget(null);
        setBloqueo(null);
    };

    const applyFilters = () => {
        const next = {};
        if (filterEstado) next.estado = filterEstado;
        setActiveFilters(next);
    };

    const clearFilters = () => {
        setFilterEstado('');
        setActiveFilters({});
    };

    const filtered = almacenes.filter((a) => {
        if (activeFilters.estado === 'activos') return a.activo !== false;
        if (activeFilters.estado === 'inactivos') return a.activo === false;
        return true;
    });

    const filterCount = Object.keys(activeFilters).length;

    const filters = (
        <div className="flex flex-wrap items-end gap-3">
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

    const columns = [
        {
            key: 'id',
            label: '#',
            render: (row) => <Badge variant="blue">{String(row.id).padStart(2, '0')}</Badge>,
        },
        {
            key: 'nombre',
            label: 'Almacén',
            render: (row) => (
                <span className="inline-flex items-center gap-2 font-medium text-warm-900">
                    <Warehouse className="h-4 w-4 text-primary-600" />
                    {row.nombre}
                </span>
            ),
        },
        {
            key: 'codigo',
            label: 'Código',
            render: (row) => (
                <span className="inline-flex items-center gap-1.5 text-gray-700">
                    <Tag className="h-3.5 w-3.5 text-gray-400" />
                    {row.codigo}
                </span>
            ),
        },
        {
            key: 'tipo',
            label: 'Tipo',
            render: (row) => (
                <Badge variant={row.tipo === 'principal' ? 'green' : 'gray'}>
                    {row.tipo ?? '—'}
                </Badge>
            ),
        },
        {
            key: 'direccion',
            label: 'Dirección',
            render: (row) =>
                row.direccion ? (
                    <span className="inline-flex items-center gap-1.5 text-gray-700">
                        <MapPin className="h-3.5 w-3.5 text-gray-400" />
                        {row.direccion}
                    </span>
                ) : (
                    <span className="text-gray-400">—</span>
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
            // Tres botones no entran en los 120px por defecto.
            width: '150px',
            actions: (row) => (
                <>
                    <button
                        aria-label="Editar"
                        title="Editar"
                        onClick={() => openEdit(row)}
                        className="rounded-md p-1.5 text-primary-600 transition hover:bg-primary-50 hover:text-primary-700"
                    >
                        <Edit className="h-4 w-4" />
                    </button>
                    {/* Desactivar es distinto de eliminar: apaga el almacén sin
                        tocar su historial, y se puede volver a activar. */}
                    <button
                        aria-label={row.activo ? 'Desactivar' : 'Activar'}
                        title={row.activo ? 'Desactivar' : 'Activar'}
                        disabled={toggling === row.id}
                        onClick={() => toggleActivo(row)}
                        className={
                            row.activo
                                ? 'rounded-md p-1.5 text-amber-600 transition hover:bg-amber-50 hover:text-amber-700 disabled:opacity-40'
                                : 'rounded-md p-1.5 text-green-600 transition hover:bg-green-50 hover:text-green-700 disabled:opacity-40'
                        }
                    >
                        {row.activo ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                    </button>
                    <button
                        aria-label="Eliminar"
                        title="Eliminar"
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
                title="Almacenes"
                description="Administra los almacenes o puntos de venta de tu negocio"
                actions={<CreateButton onClick={openCreate}>Crear almacén</CreateButton>}
            />

            {error && <Alert variant="error" className="mb-4">{error}</Alert>}

            <DataTable
                columns={columns}
                rows={filtered}
                loading={loading}
                searchPlaceholder="Buscar almacenes..."
                filterable
                filters={filters}
                filterCount={filterCount}
            />

            {/* Modal crear/editar */}
            <Modal
                open={modalOpen}
                onClose={() => setModalOpen(false)}
                title={editing ? 'Editar almacén' : 'Crear almacén'}
                description={
                    editing ? `Modifica "${editing.nombre}"` : 'Agrega un nuevo almacén'
                }
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setModalOpen(false)}>
                            Cancelar
                        </Button>
                        <Button type="submit" form="almacen-form" loading={saving}>
                            {editing ? 'Guardar cambios' : 'Crear almacén'}
                        </Button>
                    </>
                }
            >
                <form id="almacen-form" onSubmit={handleSubmit} className="space-y-4" noValidate>
                    <Input
                        label="Nombre"
                        name="nombre"
                        placeholder="Ej: Almacén Central"
                        value={form.nombre}
                        onChange={(e) => {
                            setForm((prev) => ({ ...prev, nombre: e.target.value }));
                            if (formErrors.nombre) {
                                setFormErrors((prev) => ({ ...prev, nombre: undefined }));
                            }
                        }}
                        error={formErrors.nombre}
                    />
                    <Input
                        label="Código"
                        name="codigo"
                        placeholder="Ej: ALM-001"
                        value={form.codigo}
                        onChange={(e) => {
                            setForm((prev) => ({ ...prev, codigo: e.target.value }));
                            if (formErrors.codigo) {
                                setFormErrors((prev) => ({ ...prev, codigo: undefined }));
                            }
                        }}
                        error={formErrors.codigo}
                    />
                    <Select
                        label="Tipo"
                        name="tipo"
                        value={form.tipo}
                        onChange={(e) => setForm((prev) => ({ ...prev, tipo: e.target.value }))}
                        options={[
                            { value: 'principal', label: 'Principal' },
                            { value: 'secundario', label: 'Secundario' },
                            { value: 'tienda', label: 'Tienda' },
                        ]}
                    />
                    <Input
                        label="Dirección"
                        name="direccion"
                        placeholder="Opcional"
                        value={form.direccion}
                        onChange={(e) => setForm((prev) => ({ ...prev, direccion: e.target.value }))}
                        error={formErrors.direccion}
                    />
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                        <input
                            type="checkbox"
                            checked={form.activo}
                            onChange={(e) =>
                                setForm((prev) => ({ ...prev, activo: e.target.checked }))
                            }
                            className="h-4 w-4 rounded border-gray-300 accent-primary-600"
                        />
                        <BadgeCheck className="h-4 w-4 text-primary-600" />
                        Almacén activo
                    </label>
                </form>
            </Modal>

            {/* Modal eliminar */}
            <Modal
                open={Boolean(deleteTarget)}
                onClose={cerrarEliminar}
                title={bloqueo ? 'No se puede eliminar' : 'Eliminar almacén'}
                description={
                    bloqueo
                        ? `"${deleteTarget?.nombre}" ya tiene historial en el sistema.`
                        : `¿Seguro que deseas eliminar "${deleteTarget?.nombre}"?`
                }
                size="sm"
                footer={
                    <>
                        <Button variant="secondary" onClick={cerrarEliminar}>
                            {bloqueo ? 'Cerrar' : 'Cancelar'}
                        </Button>
                        {bloqueo ? (
                            bloqueo.puede_desactivar && (
                                <Button loading={deleting} onClick={handleDesactivar}>
                                    Desactivar almacén
                                </Button>
                            )
                        ) : (
                            <Button variant="danger" loading={deleting} onClick={handleDelete}>
                                Eliminar
                            </Button>
                        )}
                    </>
                }
            >
                {bloqueo ? (
                    <div className="space-y-3">
                        <Alert variant="warning">{bloqueo.message}</Alert>
                        {bloqueo.motivos?.length > 0 && (
                            <div>
                                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-warm-500">
                                    Está siendo usado por
                                </p>
                                <ul className="list-inside list-disc space-y-0.5 text-sm text-warm-700">
                                    {bloqueo.motivos.map((m) => (
                                        <li key={m}>{m}</li>
                                    ))}
                                </ul>
                            </div>
                        )}
                        {!bloqueo.puede_desactivar && (
                            <p className="text-sm text-warm-500">Este almacén ya está desactivado.</p>
                        )}
                    </div>
                ) : (
                    <Alert variant="warning">
                        Solo se puede eliminar si está vacío: sin stock y sin movimientos, ventas ni
                        traslados registrados. Si tiene historial, el sistema te ofrecerá desactivarlo.
                    </Alert>
                )}
            </Modal>
        </Layout>
    );
}
