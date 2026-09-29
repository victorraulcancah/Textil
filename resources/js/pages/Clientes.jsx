import { useCallback, useEffect, useMemo, useState } from 'react';
import { Briefcase, Edit, IdCard, Mail, MapPin, Phone, Plus, Trash2, User } from 'lucide-react';
import api, { asList } from '../lib/api';
import { useToast } from '../lib/toast';
import { cargarUbigeos, esPeru, porCodigo, porNombres, quitarLugar } from '../lib/ubigeos';
import ConsultarDocumento from '../components/ConsultarDocumento';
import Layout from '../components/Layout';
import PageHeader, { CreateButton } from '../components/PageHeader';
import SelectorUbigeo from '../components/SelectorUbigeo';
import { Alert, Badge, Button, DataTable, Input, Modal, Select, SearchSelect, Tabs } from '../components/ui';

/** Con su código del catálogo 06 de SUNAT. */
const TIPOS_DOCUMENTO = [
    { value: 'DNI', label: '1 · DNI' },
    { value: 'RUC', label: '6 · RUC' },
    { value: 'CE', label: '4 · Carné de extranjería' },
    { value: 'PAS', label: '7 · Pasaporte' },
    { value: 'SIN', label: '0 · Sin documento' },
];

const TIPOS_DIRECCION = [
    { value: 'fiscal', label: 'Fiscal (principal)' },
    { value: 'entrega', label: 'Entrega' },
];

/** PCGE: lo que debe un tercero va a la cuenta 12; una empresa relacionada, a la 13. */
const TIPOS_CLIENTE = [
    { value: 'TERCERO', label: 'Tercero' },
    { value: 'RELACIONADO', label: 'Relacionado' },
];

let ultimaClave = 0;
const nuevaDireccion = (tipo = 'entrega') => ({
    clave: ++ultimaClave, // solo para React; no se envía
    id: null,
    tipo,
    direccion: '',
    referencia: '',
    pais: 'PERÚ',
    departamento: '',
    provincia: '',
    distrito: '',
    ubigeo: '',
    codigo_postal: '',
});

/** Una tarjeta que no se llenó no se guarda. */
const vacia = (d) =>
    !d.direccion.trim() && !d.departamento && !d.ubigeo && !d.referencia.trim() && !d.codigo_postal.trim();

const emptyForm = {
    codigo: '',
    nombre: '',
    tipo_documento: 'DNI',
    numero_documento: '',
    telefono: '',
    email: '',
    zona: '',
    actividad_comercial: '',
    categoria_comercial: '',
    tipo_cliente: 'TERCERO',
    ejecutivo_id: '',
    // A qué precio se le vende; vacío = al principal.
    tipo_precio_id: '',
    activo: true,
    direcciones: [],
};

/** En qué pestaña está cada campo, para llevar al usuario a su error. */
const CAMPOS_COMERCIAL = ['zona', 'actividad_comercial', 'categoria_comercial', 'tipo_cliente', 'tipo_precio_id', 'ejecutivo_id'];
const pestanaDe = (campo) =>
    campo.startsWith('direcciones') ? 'direcciones' : CAMPOS_COMERCIAL.includes(campo) ? 'comercial' : 'general';

function DireccionCard({ numero, direccion: d, ubigeos, errores, onCambiar, onQuitar }) {
    // Pasar de Perú al extranjero (o al revés) cambia cómo se escribe el lugar.
    const cambiarPais = (pais) =>
        onCambiar(
            esPeru(pais) === esPeru(d.pais)
                ? { pais }
                : { pais, departamento: '', provincia: '', distrito: '', ubigeo: '' },
        );

    return (
        <div className="rounded-lg border border-edge p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2 text-sm font-semibold text-warm-900">
                    <MapPin className="h-4 w-4 text-primary-600" />
                    Dirección {numero}
                </span>
                <button type="button" aria-label="Quitar dirección" onClick={onQuitar}
                    className="rounded-md p-1.5 text-red-600 transition hover:bg-red-50 hover:text-red-700">
                    <Trash2 className="h-4 w-4" />
                </button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                <Select label="Tipo" value={d.tipo} onChange={(e) => onCambiar({ tipo: e.target.value })} options={TIPOS_DIRECCION} />
                <div className="sm:col-span-3">
                    <Input
                        label="Dirección"
                        placeholder="Av., Jr., Calle… número, urbanización"
                        value={d.direccion}
                        onChange={(e) => onCambiar({ direccion: e.target.value })}
                        error={errores.direccion}
                    />
                </div>
                <Input label="País" value={d.pais} onChange={(e) => cambiarPais(e.target.value)} error={errores.pais} />
                <SelectorUbigeo lista={ubigeos} pais={d.pais} valor={d} onChange={onCambiar} errores={errores} />
                <Input
                    label="Código postal"
                    value={d.codigo_postal}
                    onChange={(e) => onCambiar({ codigo_postal: e.target.value })}
                    error={errores.codigo_postal}
                />
                <div className="sm:col-span-2">
                    <Input
                        label="Referencia"
                        placeholder="Opcional"
                        value={d.referencia}
                        onChange={(e) => onCambiar({ referencia: e.target.value })}
                        error={errores.referencia}
                    />
                </div>
            </div>
        </div>
    );
}

export default function Clientes() {
    const toast = useToast();
    const [clientes, setClientes] = useState([]);
    const [usuarios, setUsuarios] = useState([]);
    const [tiposPrecio, setTiposPrecio] = useState([]);
    const [ubigeos, setUbigeos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [fTipoDoc, setFTipoDoc] = useState('');
    const [fEstado, setFEstado] = useState('');
    const [fEjecutivo, setFEjecutivo] = useState('');

    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState(emptyForm);
    const [formErrors, setFormErrors] = useState({});
    const [saving, setSaving] = useState(false);
    const [tab, setTab] = useState('general');

    const [deleteTarget, setDeleteTarget] = useState(null);
    const [deleting, setDeleting] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [clientesRes, usuariosRes, tiposRes] = await Promise.all([
                api.get('/clientes'),
                api.get('/usuarios-selector').catch(() => ({ data: [] })),
                api.get('/clientes/tipos-precio').catch(() => ({ data: [] })),
            ]);
            setClientes(asList(clientesRes));
            setUsuarios(asList(usuariosRes));
            setTiposPrecio(asList(tiposRes));
        } catch {
            setError('No se pudieron cargar los clientes.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    /** Lo ya escrito en otros clientes, para no tipear distinto la misma zona o categoría. */
    const sugerencias = useMemo(() => {
        const de = (campo) =>
            [...new Set(clientes.map((c) => c[campo]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
        return {
            zona: de('zona'),
            actividad_comercial: de('actividad_comercial'),
            categoria_comercial: de('categoria_comercial'),
        };
    }, [clientes]);

    const prepararUbigeos = () => {
        cargarUbigeos()
            .then(setUbigeos)
            .catch(() => toast.error('No se pudo cargar la lista de distritos.'));
    };

    const openCreate = () => {
        setEditing(null);
        setForm({ ...emptyForm, direcciones: [nuevaDireccion('fiscal')] });
        setFormErrors({});
        setTab('general');
        prepararUbigeos();
        setModalOpen(true);
    };

    const openEdit = (c) => {
        const direcciones = (c.direcciones ?? []).map((d) => ({
            ...nuevaDireccion(d.tipo),
            id: d.id,
            direccion: d.direccion ?? '',
            referencia: d.referencia ?? '',
            pais: d.pais ?? 'PERÚ',
            departamento: d.departamento ?? '',
            provincia: d.provincia ?? '',
            distrito: d.distrito ?? '',
            ubigeo: d.ubigeo ?? '',
            codigo_postal: d.codigo_postal ?? '',
        }));

        setEditing(c);
        setForm({
            codigo: c.codigo ?? '',
            nombre: c.nombre ?? '',
            tipo_documento: c.tipo_documento ?? 'DNI',
            numero_documento: c.numero_documento ?? '',
            telefono: c.telefono ?? '',
            email: c.email ?? '',
            zona: c.zona ?? '',
            actividad_comercial: c.actividad_comercial ?? '',
            categoria_comercial: c.categoria_comercial ?? '',
            tipo_cliente: c.tipo_cliente ?? 'TERCERO',
            ejecutivo_id: c.ejecutivo_id ? String(c.ejecutivo_id) : '',
            tipo_precio_id: c.tipo_precio_id ? String(c.tipo_precio_id) : '',
            activo: Boolean(c.activo),
            direcciones: direcciones.length ? direcciones : [nuevaDireccion('fiscal')],
        });
        setFormErrors({});
        setTab('general');
        prepararUbigeos();
        setModalOpen(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        // Las tarjetas vacías se van antes de enviar: así los errores de cada
        // dirección (direcciones.1.…) caen en la tarjeta que se ve.
        const direcciones = form.direcciones.filter((d) => !vacia(d));
        setForm((prev) => ({ ...prev, direcciones }));
        setSaving(true);
        setFormErrors({});
        const payload = {
            ...form,
            tipo_precio_id: form.tipo_precio_id || null,
            direcciones: direcciones.map(({ clave, ...d }) => ({ ...d, ubigeo: esPeru(d.pais) ? d.ubigeo : '' })),
        };
        try {
            if (editing) {
                await api.put(`/clientes/${editing.id}`, payload);
                toast.success('Cliente actualizado correctamente.');
            } else {
                await api.post('/clientes', payload);
                toast.success('Cliente creado correctamente.');
            }
            setModalOpen(false);
            await load();
        } catch (err) {
            if (err.response?.status === 422) {
                const errores = Object.fromEntries(Object.entries(err.response.data?.errors ?? {}).map(([k, v]) => [k, v[0]]));
                setFormErrors(errores);
                const primero = Object.keys(errores)[0];
                if (primero) setTab(pestanaDe(primero));
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

    const cambiarDireccion = (i, cambios) => {
        setForm((prev) => ({
            ...prev,
            direcciones: prev.direcciones.map((d, j) => {
                if (j === i) return { ...d, ...cambios };
                // Fiscal hay una sola: si otra pasa a fiscal, esta queda de entrega.
                return cambios.tipo === 'fiscal' && d.tipo === 'fiscal' ? { ...d, tipo: 'entrega' } : d;
            }),
        }));
        const claves = [...Object.keys(cambios).map((c) => `direcciones.${i}.${c}`), 'direcciones'];
        if (claves.some((k) => formErrors[k])) {
            setFormErrors((prev) => ({ ...prev, ...Object.fromEntries(claves.map((k) => [k, undefined])) }));
        }
    };

    const agregarDireccion = () =>
        setForm((prev) => ({
            ...prev,
            direcciones: [
                ...prev.direcciones,
                nuevaDireccion(prev.direcciones.some((d) => d.tipo === 'fiscal') ? 'entrega' : 'fiscal'),
            ],
        }));

    const quitarDireccion = (i) => {
        setForm((prev) => ({ ...prev, direcciones: prev.direcciones.filter((_, j) => j !== i) }));
        // Los números de las tarjetas se corren: sus errores ya no calzan.
        setFormErrors((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => !k.startsWith('direcciones'))));
    };

    const erroresDireccion = (i) => {
        const prefijo = `direcciones.${i}.`;
        return Object.fromEntries(
            Object.entries(formErrors)
                .filter(([k, v]) => v && k.startsWith(prefijo))
                .map(([k, v]) => [k.slice(prefijo.length), v]),
        );
    };

    /** SUNAT: razón social, teléfono, actividad y la dirección fiscal con su ubigeo. */
    const aplicarRuc = async (d) => {
        field('nombre', d.razon_social ?? '');
        if (d.telefono) field('telefono', d.telefono);
        if (d.actividad) field('actividad_comercial', d.actividad.replace(/^\s*principal\s*-\s*/i, ''));
        if (!d.direccion || d.direccion.trim() === '-') return;

        let lista = [];
        try {
            lista = await cargarUbigeos();
        } catch {
            // Sin catálogo quedan los nombres que dio SUNAT.
        }
        const lugar = porCodigo(lista, d.ubigeo) ?? porNombres(lista, d.departamento, d.provincia, d.distrito);
        const fiscal = {
            direccion: quitarLugar(d.direccion, d),
            pais: 'PERÚ',
            departamento: lugar?.departamento ?? d.departamento ?? '',
            provincia: lugar?.provincia ?? d.provincia ?? '',
            distrito: lugar?.distrito ?? d.distrito ?? '',
            ubigeo: lugar?.ubigeo ?? '',
        };
        setForm((prev) => {
            const i = prev.direcciones.findIndex((x) => x.tipo === 'fiscal');
            return {
                ...prev,
                direcciones:
                    i >= 0
                        ? prev.direcciones.map((x, j) => (j === i ? { ...x, ...fiscal } : x))
                        : [{ ...nuevaDireccion('fiscal'), ...fiscal }, ...prev.direcciones],
            };
        });
    };

    const conError = (pestana) => Object.entries(formErrors).some(([k, v]) => v && pestanaDe(k) === pestana);
    const marcaError = (pestana) =>
        conError(pestana) && <span className="h-1.5 w-1.5 rounded-full bg-red-500" aria-label="Tiene errores" />;
    const llenas = form.direcciones.filter((d) => !vacia(d)).length;

    const columns = [
        {
            key: 'codigo',
            label: 'Código',
            render: (row) =>
                row.codigo ? (
                    <span className="font-mono text-xs text-gray-600">{row.codigo}</span>
                ) : (
                    <span className="text-gray-400">—</span>
                ),
        },
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
            key: 'direccion',
            label: 'Dirección',
            render: (row) => {
                const otras = (row.direcciones?.length ?? 0) - 1;
                return row.direccion ? (
                    <span className="inline-flex items-center gap-1.5 text-gray-700">
                        <MapPin className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                        <span className="max-w-[16rem] truncate" title={row.direccion}>{row.direccion}</span>
                        {otras > 0 && (
                            <span title={`Tiene ${otras + 1} direcciones`}>
                                <Badge>+{otras}</Badge>
                            </span>
                        )}
                    </span>
                ) : (
                    <span className="text-gray-400">—</span>
                );
            },
        },
        {
            key: 'ejecutivo',
            label: 'Ejecutivo',
            getSearchValue: (row) => row.ejecutivo?.name,
            render: (row) => row.ejecutivo?.name ?? <span className="text-gray-400">—</span>,
        },
        {
            key: 'tipo_precio',
            label: 'Precio',
            getSearchValue: (row) => row.tipo_precio?.nombre,
            render: (row) => row.tipo_precio?.nombre ?? <span className="text-gray-400">Principal</span>,
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
                        (!fEstado || (fEstado === 'activo' ? c.activo : !c.activo)) &&
                        (!fEjecutivo || String(c.ejecutivo_id) === String(fEjecutivo)),
                )}
                loading={loading}
                searchPlaceholder="Buscar clientes..."
                filterable
                filterCount={(fTipoDoc ? 1 : 0) + (fEstado ? 1 : 0) + (fEjecutivo ? 1 : 0)}
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
                                { value: 'PAS', label: 'Pasaporte' },
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
                        <SearchSelect
                            label="Ejecutivo comercial"
                            value={fEjecutivo}
                            onChange={(v) => setFEjecutivo(v ?? '')}
                            placeholder="Todos"
                            emptyText="Sin coincidencias"
                            options={usuarios.map((u) => ({ value: String(u.id), label: u.name }))}
                        />
                        {(fTipoDoc || fEstado || fEjecutivo) && (
                            <button
                                onClick={() => {
                                    setFTipoDoc('');
                                    setFEstado('');
                                    setFEjecutivo('');
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
                size="2xl"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button>
                        <Button type="submit" form="cliente-form" loading={saving}>{editing ? 'Guardar cambios' : 'Crear cliente'}</Button>
                    </>
                }
            >
                <form id="cliente-form" onSubmit={handleSubmit} className="space-y-4" noValidate>
                    <Tabs
                        value={tab}
                        onChange={setTab}
                        items={[
                            { key: 'general', icon: IdCard, label: <>Datos generales{marcaError('general')}</> },
                            {
                                key: 'direcciones',
                                icon: MapPin,
                                label: <>Direcciones{llenas > 0 && ` (${llenas})`}{marcaError('direcciones')}</>,
                            },
                            { key: 'comercial', icon: Briefcase, label: <>Comercial{marcaError('comercial')}</> },
                        ]}
                    />

                    <div className="min-h-[22rem]">
                        {tab === 'general' && (
                            <div className="space-y-4">
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
                                    <Input
                                        label="Código"
                                        placeholder="Automático"
                                        value={form.codigo}
                                        onChange={(e) => field('codigo', e.target.value)}
                                        error={formErrors.codigo}
                                    />
                                    <Select
                                        label="Tipo doc. (SUNAT)"
                                        value={form.tipo_documento}
                                        onChange={(e) => field('tipo_documento', e.target.value)}
                                        options={TIPOS_DOCUMENTO}
                                    />
                                    <div className="flex items-end gap-2 sm:col-span-2">
                                        <Input label="N° Documento" className="flex-1" value={form.numero_documento} onChange={(e) => field('numero_documento', e.target.value)} error={formErrors.numero_documento} />
                                        {(form.tipo_documento === 'DNI' || form.tipo_documento === 'RUC') && (
                                            <ConsultarDocumento
                                                tipo={form.tipo_documento === 'RUC' ? 'ruc' : 'dni'}
                                                numero={form.numero_documento}
                                                className="mb-px shrink-0"
                                                onResult={(d) => {
                                                    if (form.tipo_documento === 'RUC') {
                                                        aplicarRuc(d);
                                                    } else {
                                                        field('nombre', d.nombre_completo ?? '');
                                                    }
                                                }}
                                            />
                                        )}
                                    </div>
                                </div>
                                {/* Debajo del documento: se llena solo al consultar DNI o RUC. */}
                                <Input label="Nombre / razón social" value={form.nombre} onChange={(e) => field('nombre', e.target.value)} error={formErrors.nombre} />
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    <Input label="Teléfono" value={form.telefono} onChange={(e) => field('telefono', e.target.value)} error={formErrors.telefono} />
                                    <Input label="Email" type="email" value={form.email} onChange={(e) => field('email', e.target.value)} error={formErrors.email} />
                                </div>
                                {form.tipo_documento === 'RUC' && (
                                    <p className="text-xs text-warm-400">
                                        Al consultar el RUC también se llena la dirección fiscal con su ubigeo (pestaña Direcciones).
                                    </p>
                                )}
                                <label className="flex items-center gap-2 text-sm text-gray-700">
                                    <input type="checkbox" checked={form.activo} onChange={(e) => field('activo', e.target.checked)}
                                        className="h-4 w-4 rounded border-gray-300 accent-primary-600" />
                                    Cliente activo
                                </label>
                            </div>
                        )}

                        {tab === 'direcciones' && (
                            <div className="space-y-3">
                                <p className="text-xs text-warm-500">
                                    La fiscal es la principal: la que sale en los documentos. Agrega todas las de
                                    entrega que necesites.
                                </p>
                                {formErrors.direcciones && <Alert variant="error">{formErrors.direcciones}</Alert>}
                                {form.direcciones.length === 0 && (
                                    <p className="rounded-lg border border-dashed border-edge p-6 text-center text-sm text-warm-500">
                                        Sin direcciones.
                                    </p>
                                )}
                                {form.direcciones.map((d, i) => (
                                    <DireccionCard
                                        key={d.clave}
                                        numero={i + 1}
                                        direccion={d}
                                        ubigeos={ubigeos}
                                        errores={erroresDireccion(i)}
                                        onCambiar={(cambios) => cambiarDireccion(i, cambios)}
                                        onQuitar={() => quitarDireccion(i)}
                                    />
                                ))}
                                <Button type="button" variant="secondary" onClick={agregarDireccion}>
                                    <Plus className="h-4 w-4" />
                                    Agregar dirección
                                </Button>
                            </div>
                        )}

                        {tab === 'comercial' && (
                            <div className="space-y-4">
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    <Input
                                        label="Zona"
                                        placeholder="Ej. Lima Norte"
                                        list="sugerencias-zona"
                                        value={form.zona}
                                        onChange={(e) => field('zona', e.target.value)}
                                        error={formErrors.zona}
                                    />
                                    <Input
                                        label="Categoría comercial"
                                        placeholder="Ej. A, B, Mayorista"
                                        list="sugerencias-categoria_comercial"
                                        value={form.categoria_comercial}
                                        onChange={(e) => field('categoria_comercial', e.target.value)}
                                        error={formErrors.categoria_comercial}
                                    />
                                </div>
                                <Input
                                    label="Actividad comercial"
                                    placeholder="Ej. Confección de prendas"
                                    list="sugerencias-actividad_comercial"
                                    value={form.actividad_comercial}
                                    onChange={(e) => field('actividad_comercial', e.target.value)}
                                    error={formErrors.actividad_comercial}
                                />
                                <Select
                                    label="Tipo de cliente (PCGE)"
                                    value={form.tipo_cliente}
                                    onChange={(e) => field('tipo_cliente', e.target.value)}
                                    options={TIPOS_CLIENTE}
                                    error={formErrors.tipo_cliente}
                                />
                                <p className="-mt-2 text-xs text-warm-400">
                                    Para contabilidad: lo que debe un tercero va a la cuenta 12; una empresa relacionada, a la 13.
                                </p>
                                <Select
                                    label="Tipo de precio"
                                    value={form.tipo_precio_id}
                                    onChange={(e) => field('tipo_precio_id', e.target.value)}
                                    options={[
                                        { value: '', label: 'El principal' },
                                        ...tiposPrecio.filter((t) => !t.principal).map((t) => ({ value: String(t.id), label: t.nombre })),
                                    ]}
                                    error={formErrors.tipo_precio_id}
                                />
                                <p className="-mt-2 text-xs text-warm-400">
                                    En pedidos y ventas, sus precios salen de este tipo (Mayorista…); se pueden cambiar a mano.
                                </p>
                                <SearchSelect
                                    label="Ejecutivo comercial"
                                    placeholder="Sin asignar"
                                    value={form.ejecutivo_id}
                                    onChange={(value) => field('ejecutivo_id', value)}
                                    options={usuarios.map((u) => ({ value: String(u.id), label: u.name }))}
                                    error={formErrors.ejecutivo_id}
                                />
                                <p className="-mt-2 text-xs text-warm-400">
                                    Quien tenga a cargo este cliente. Sin "Ver de todos" en Clientes, cada vendedor solo ve
                                    los suyos.
                                </p>
                            </div>
                        )}
                    </div>

                    {Object.entries(sugerencias).map(([campo, valores]) => (
                        <datalist key={campo} id={`sugerencias-${campo}`}>
                            {valores.map((v) => (
                                <option key={v} value={v} />
                            ))}
                        </datalist>
                    ))}
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
