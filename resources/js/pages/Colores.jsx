import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Edit, FileSpreadsheet, Palette, Trash2 } from 'lucide-react';
import api, { asList } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import Layout from '../components/Layout';
import PageHeader, { CreateButton } from '../components/PageHeader';
import { Alert, Badge, Button, DataTable, Input, Modal, Select } from '../components/ui';

const emptyForm = { nombre: '', hex: '', activo: true };

/**
 * El catálogo de colores compartido entre todas las telas: se crea una vez
 * acá y desde el producto solo se elige, en vez de escribirlo de nuevo cada
 * vez. El código de 4 dígitos lo asigna el sistema —nunca se reutiliza uno
 * ya usado, aunque el color se borre— así que no se pide al crear.
 */
export default function Colores() {
    const toast = useToast();
    const { puede } = useAuth();
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

    const [importando, setImportando] = useState(false);
    const [exportando, setExportando] = useState(false);
    const archivoRef = useRef(null);

    const [filterEstado, setFilterEstado] = useState('');
    const [filterConMuestra, setFilterConMuestra] = useState('');

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

    /**
     * Carga masiva desde el Excel del cliente: una fila por color, con su
     * nombre y —si lo trae— su propio código. Así se puede seguir cargando
     * el catálogo en lote, en vez de crear uno por uno.
     */
    const importarExcel = async (file) => {
        if (!file) return;
        setImportando(true);
        try {
            const form = new FormData();
            form.append('archivo', file);
            const { data } = await api.post('/colores/importar-excel', form, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            if (data.creados > 0) toast.success(`Se crearon ${data.creados} color(es).`);
            if (data.advertencias?.length) {
                toast.error(`${data.advertencias.length} fila(s) no se cargaron: ${data.advertencias[0]}`);
            }
            if (!data.creados && !data.advertencias?.length) {
                toast.error('El archivo no tenía colores nuevos que cargar.');
            }
            await load();
        } catch (err) {
            toast.error(err.response?.data?.message ?? 'No se pudo leer el Excel.');
        } finally {
            setImportando(false);
        }
    };

    /** Descarga el catálogo completo, con las mismas columnas que espera "Cargar Excel". */
    const exportarExcel = async () => {
        setExportando(true);
        try {
            const { data } = await api.get('/colores/exportar-excel', { responseType: 'blob' });
            const url = URL.createObjectURL(data);
            const a = document.createElement('a');
            a.href = url;
            a.download = `colores-${new Date().toISOString().slice(0, 10)}.xlsx`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 4000);
        } catch {
            toast.error('No se pudo exportar el catálogo.');
        } finally {
            setExportando(false);
        }
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
                actions={
                    <>
                        {puede('catalogo.colores.importar') && (
                            <input
                                ref={archivoRef}
                                type="file"
                                accept=".xlsx,.xls"
                                className="hidden"
                                onChange={(e) => {
                                    importarExcel(e.target.files?.[0]);
                                    e.target.value = '';
                                }}
                            />
                        )}
                        {puede('catalogo.colores.exportar') && (
                            <Button variant="secondary" loading={exportando} onClick={exportarExcel}>
                                <Download className="h-4 w-4" />
                                Exportar Excel
                            </Button>
                        )}
                        {puede('catalogo.colores.importar') && (
                            <Button
                                variant="secondary"
                                loading={importando}
                                onClick={() => archivoRef.current?.click()}
                            >
                                <FileSpreadsheet className="h-4 w-4" />
                                Cargar Excel
                            </Button>
                        )}
                        <CreateButton onClick={openCreate}>Crear color</CreateButton>
                    </>
                }
            />

            <p className="mb-4 text-xs text-warm-400">
                El Excel debe traer las columnas "Código" y "Nombre" (una fila por color). Si un color no
                trae código, el sistema le asigna el siguiente libre.
            </p>

            {error && <Alert variant="error" className="mb-4">{error}</Alert>}

            <DataTable
                columns={columns}
                rows={colores.filter((c) => {
                    if (filterEstado === 'activos' && !c.activo) return false;
                    if (filterEstado === 'inactivos' && c.activo) return false;
                    if (filterConMuestra === 'con' && !c.hex) return false;
                    if (filterConMuestra === 'sin' && c.hex) return false;
                    return true;
                })}
                loading={loading}
                searchPlaceholder="Buscar colores..."
                filterable
                filterCount={(filterEstado ? 1 : 0) + (filterConMuestra ? 1 : 0)}
                filters={
                    <div className="space-y-2">
                        <Select
                            label="Estado"
                            value={filterEstado}
                            onChange={(e) => setFilterEstado(e.target.value)}
                            options={[
                                { value: '', label: 'Todos' },
                                { value: 'activos', label: 'Solo activos' },
                                { value: 'inactivos', label: 'Solo inactivos' },
                            ]}
                        />
                        <Select
                            label="Muestra de color"
                            value={filterConMuestra}
                            onChange={(e) => setFilterConMuestra(e.target.value)}
                            options={[
                                { value: '', label: 'Todos' },
                                { value: 'con', label: 'Con muestra' },
                                { value: 'sin', label: 'Sin muestra' },
                            ]}
                        />
                        {(filterEstado || filterConMuestra) && (
                            <button
                                onClick={() => {
                                    setFilterEstado('');
                                    setFilterConMuestra('');
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
