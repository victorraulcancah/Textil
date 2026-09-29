import { useCallback, useEffect, useState } from 'react';
import { Building2, Edit, Mail, Phone, Trash2, User } from 'lucide-react';
import api, { asList } from '../lib/api';
import { useToast } from '../lib/toast';
import Layout from '../components/Layout';
import PageHeader, { CreateButton } from '../components/PageHeader';
import ConsultarDocumento from '../components/ConsultarDocumento';
import { Alert, Badge, Button, DataTable, Input, Modal, Select } from '../components/ui';

// Con qué documento se identifica un proveedor nacional: los mismos que en Clientes.
const TIPOS_DOCUMENTO = [
    { value: 'RUC', label: 'RUC' },
    { value: 'DNI', label: 'DNI' },
    { value: 'CE', label: 'Carné Ext.' },
    { value: 'SIN', label: 'Sin documento' },
];

/** Cuántos caracteres tiene el número de cada documento. */
const LARGO_DOCUMENTO = { RUC: 11, DNI: 8, CE: 12 };

/** Solo dígitos para RUC y DNI; letras y números para el carné de extranjería. */
const limpiarDocumento = (tipo, valor) => {
    const texto = String(valor ?? '');
    if (tipo === 'CE') return texto.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, LARGO_DOCUMENTO.CE);
    return texto.replace(/\D/g, '').slice(0, LARGO_DOCUMENTO[tipo] ?? 11);
};

const emptyForm = {
    nombre: '',
    codigo: '',
    // De eso depende qué campos pide el formulario más abajo.
    tipo: 'nacional',
    // Solo para proveedores que emiten su propia numeración de orden de
    // compra: KET-001-26. Opcional.
    codigo_corto: '',
    ruc: '',
    // De qué documento es el número de arriba: RUC, DNI, CE o SIN.
    tipo_documento: 'RUC',
    tax_id: '',
    pais: '',
    direccion: '',
    telefono: '',
    fax: '',
    email: '',
    contacto_nombre: '',
    activo: true,
};

/** El tipo de documento de un proveedor nacional; los anteriores al tipo se reconocen por el largo (8 = DNI). */
const documentoDe = (p) =>
    p.tipo === 'extranjero' ? 'TAX' : (p.tipo_documento ?? (p.ruc ? (p.ruc.length === 8 ? 'DNI' : 'RUC') : 'SIN'));

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

    const [filterTipo, setFilterTipo] = useState('');
    const [filterEstado, setFilterEstado] = useState('');
    const [filterPais, setFilterPais] = useState('');
    const [filterDocumento, setFilterDocumento] = useState('');
    const [filterCorto, setFilterCorto] = useState('');

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
            tipo: p.tipo ?? 'nacional',
            codigo_corto: p.codigo_corto ?? '',
            ruc: p.ruc ?? '',
            // Los proveedores anteriores al tipo se reconocen por el largo.
            tipo_documento: p.tipo_documento ?? (p.ruc && p.ruc.length === 8 ? 'DNI' : 'RUC'),
            tax_id: p.tax_id ?? '',
            pais: p.pais ?? '',
            direccion: p.direccion ?? '',
            telefono: p.telefono ?? '',
            fax: p.fax ?? '',
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

    /** Otro documento, otro largo: el número se ajusta y "sin documento" lo vacía. */
    const cambiarTipoDocumento = (tipo) => {
        setForm((prev) => ({
            ...prev,
            tipo_documento: tipo,
            ruc: tipo === 'SIN' ? '' : limpiarDocumento(tipo, prev.ruc),
        }));
        setFormErrors((prev) => ({ ...prev, ruc: undefined, tipo_documento: undefined }));
    };

    const columns = [
        {
            key: 'nombre',
            label: 'Proveedor',
            render: (row) => (
                <span className="inline-flex items-center gap-2 font-medium text-warm-900">
                    <Building2 className="h-4 w-4 text-primary-600" />
                    {row.nombre}
                    <Badge variant={row.tipo === 'extranjero' ? 'amber' : 'gray'}>
                        {row.tipo === 'extranjero' ? 'Extranjero' : 'Nacional'}
                    </Badge>
                </span>
            ),
        },
        {
            key: 'codigo',
            label: 'Código',
            render: (row) => (
                <span className="inline-flex items-center gap-1.5">
                    <Badge variant="gray">{row.codigo}</Badge>
                    {row.codigo_corto && <Badge variant="blue">{row.codigo_corto}</Badge>}
                </span>
            ),
        },
        {
            key: 'ruc',
            label: 'RUC / DNI',
            render: (row) =>
                row.ruc ? (
                    <span>
                        {row.tipo_documento && row.tipo_documento !== 'RUC' && (
                            <span className="mr-1 text-xs text-warm-400">{row.tipo_documento}</span>
                        )}
                        {row.ruc}
                    </span>
                ) : (
                    <span className="text-gray-400">—</span>
                ),
        },
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
                rows={proveedores.filter((p) => {
                    if (filterTipo && p.tipo !== filterTipo) return false;
                    if (filterEstado === 'activos' && !p.activo) return false;
                    if (filterEstado === 'inactivos' && p.activo) return false;
                    if (filterPais && (p.pais ?? '') !== filterPais) return false;
                    if (filterDocumento && documentoDe(p) !== filterDocumento) return false;
                    if (filterCorto === 'con' && !p.codigo_corto) return false;
                    if (filterCorto === 'sin' && p.codigo_corto) return false;
                    return true;
                })}
                loading={loading}
                searchPlaceholder="Buscar proveedores..."
                filterable
                filterCount={[filterTipo, filterEstado, filterPais, filterDocumento, filterCorto].filter(Boolean).length}
                filters={
                    <div className="space-y-2">
                        <Select
                            label="Tipo"
                            value={filterTipo}
                            onChange={(e) => setFilterTipo(e.target.value)}
                            options={[
                                { value: '', label: 'Todos' },
                                { value: 'nacional', label: 'Nacional' },
                                { value: 'extranjero', label: 'Extranjero' },
                            ]}
                        />
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
                        {/* Con qué documento se identifica: RUC, DNI, carné de extranjería, sin documento o Tax ID (extranjeros). */}
                        <Select
                            label="Tipo de documento"
                            value={filterDocumento}
                            onChange={(e) => setFilterDocumento(e.target.value)}
                            options={[
                                { value: '', label: 'Todos' },
                                { value: 'RUC', label: 'RUC' },
                                { value: 'DNI', label: 'DNI' },
                                { value: 'CE', label: 'Carné de extranjería' },
                                { value: 'SIN', label: 'Sin documento' },
                                { value: 'TAX', label: 'Tax ID (extranjero)' },
                            ]}
                        />
                        {/* De dónde es: solo los países que ya tienen algún proveedor. */}
                        <Select
                            label="País"
                            value={filterPais}
                            onChange={(e) => setFilterPais(e.target.value)}
                            options={[
                                { value: '', label: 'Todos' },
                                ...[...new Set(proveedores.map((p) => p.pais).filter(Boolean))]
                                    .sort((a, b) => a.localeCompare(b, 'es'))
                                    .map((pais) => ({ value: pais, label: pais })),
                            ]}
                        />
                        {/* El código corto arma la numeración de sus órdenes de compra (KET-001-26). */}
                        <Select
                            label="Código corto"
                            value={filterCorto}
                            onChange={(e) => setFilterCorto(e.target.value)}
                            options={[
                                { value: '', label: 'Todos' },
                                { value: 'con', label: 'Con código corto' },
                                { value: 'sin', label: 'Sin código corto' },
                            ]}
                        />
                        {(filterTipo || filterEstado || filterPais || filterDocumento || filterCorto) && (
                            <button
                                onClick={() => {
                                    setFilterTipo('');
                                    setFilterEstado('');
                                    setFilterPais('');
                                    setFilterDocumento('');
                                    setFilterCorto('');
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
                    {/* Nacional o extranjero: de eso depende si se pide RUC o
                        Tax ID, y si aplican país y fax. */}
                    <div className="inline-flex rounded-lg border border-edge bg-gray-50 p-0.5">
                        {[
                            { value: 'nacional', label: 'Nacional' },
                            { value: 'extranjero', label: 'Extranjero' },
                        ].map((opcion) => (
                            <button
                                key={opcion.value}
                                type="button"
                                onClick={() => field('tipo', opcion.value)}
                                className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
                                    form.tipo === opcion.value
                                        ? 'bg-white text-primary-700 shadow-sm'
                                        : 'text-warm-500 hover:text-warm-700'
                                }`}
                            >
                                {opcion.label}
                            </button>
                        ))}
                    </div>

                    {/* Igual que en Clientes: se elige el tipo de documento, se escribe
                        el número y la lupa trae el nombre y la dirección de SUNAT (RUC)
                        o de RENIEC (DNI). El nombre va debajo porque se llena solo. */}
                    {form.tipo === 'nacional' && (
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                            <Select
                                label="Tipo doc."
                                value={form.tipo_documento}
                                onChange={(e) => cambiarTipoDocumento(e.target.value)}
                                options={TIPOS_DOCUMENTO}
                            />
                            <div className="flex items-end gap-2 sm:col-span-2">
                                <Input
                                    label="N° Documento"
                                    className="flex-1"
                                    inputMode={form.tipo_documento === 'CE' ? 'text' : 'numeric'}
                                    maxLength={LARGO_DOCUMENTO[form.tipo_documento]}
                                    disabled={form.tipo_documento === 'SIN'}
                                    value={form.ruc}
                                    onChange={(e) => field('ruc', limpiarDocumento(form.tipo_documento, e.target.value))}
                                    error={formErrors.ruc}
                                />
                                {(form.tipo_documento === 'RUC' || form.tipo_documento === 'DNI') && (
                                    <ConsultarDocumento
                                        tipo={form.tipo_documento === 'RUC' ? 'ruc' : 'dni'}
                                        numero={form.ruc}
                                        className="mb-px shrink-0"
                                        onResult={(d) => {
                                            if (form.tipo_documento === 'RUC') {
                                                field('nombre', d.razon_social ?? '');
                                                if (d.direccion) field('direccion', d.direccion);
                                                if (d.telefono) field('telefono', d.telefono);
                                            } else {
                                                field('nombre', d.nombre_completo ?? '');
                                            }
                                        }}
                                    />
                                )}
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <Input
                            label={form.tipo === 'extranjero' ? 'Nombre o razón social' : 'Nombre'}
                            className={form.tipo === 'nacional' ? 'sm:col-span-2' : undefined}
                            value={form.nombre}
                            onChange={(e) => field('nombre', e.target.value)}
                            error={formErrors.nombre}
                        />
                        {/* El código lo pone el sistema: EXT-1, EXT-2… para extranjeros y NC-1, NC-2… para nacionales. */}
                        <Input
                            label="Código"
                            value={editing ? form.codigo : ''}
                            placeholder={form.tipo === 'extranjero' ? 'Se genera: EXT-1, EXT-2…' : 'Se genera: NC-1, NC-2…'}
                            readOnly
                            className="bg-gray-50 font-mono text-gray-600"
                            error={formErrors.codigo}
                        />
                        <div>
                            <Input
                                label="Código corto (3 letras)"
                                placeholder="KET"
                                maxLength={3}
                                value={form.codigo_corto}
                                onChange={(e) => field('codigo_corto', e.target.value.toUpperCase())}
                                error={formErrors.codigo_corto}
                            />
                            <p className="mt-1 text-xs text-warm-400">
                                Solo si el proveedor numera así sus órdenes: KET-001-26.
                            </p>
                        </div>

                        {form.tipo === 'extranjero' && (
                            <>
                                <Input
                                    label="Tax ID"
                                    placeholder="Acepta letras, números y más de 11 caracteres"
                                    value={form.tax_id}
                                    onChange={(e) => field('tax_id', e.target.value)}
                                    error={formErrors.tax_id}
                                />
                                <Input label="País" value={form.pais} onChange={(e) => field('pais', e.target.value)} error={formErrors.pais} />
                                <Input label="Fax" value={form.fax} onChange={(e) => field('fax', e.target.value)} error={formErrors.fax} />
                            </>
                        )}

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
