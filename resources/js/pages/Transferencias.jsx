import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, Ban, Edit, ListChecks, Lock, PackageCheck, Plus, PlusCircle, Printer, Repeat, Send, Trash2, Truck } from 'lucide-react';
import api, { asList } from '../lib/api';
import { opcionesAlmacen } from '../lib/almacenes';
import { useToast } from '../lib/toast';
import Layout from '../components/Layout';
import BottomSheet, { useSheet } from '../components/ui/BottomSheet';
import DetalleCard from '../components/ui/DetalleCard';
import PageHeader, { CreateButton } from '../components/PageHeader';
import PdfViewerModal from '../components/PdfViewerModal';
import ProductoPickerModal from '../components/ProductoPickerModal';
import { Alert, Badge, Button, DataTable, Input, Modal, SearchSelect, Select, Tabs } from '../components/ui';


const hoy = () => new Date().toISOString().slice(0, 10);

const emptyForm = {
    almacen_origen_id: '',
    almacen_destino_id: '',
    motivo_traslado: 'traslado_entre_establecimientos',
    fecha_inicio_traslado: hoy(),
    modalidad_transporte: 'privado',
    transportista_razon_social: '',
    transportista_ruc: '',
    vehiculo_placa: '',
    conductor_nombre: '',
    conductor_documento: '',
    conductor_licencia: '',
    numero_bultos: '',
    peso_bruto_kg: '',
    observaciones: '',
};

const panelVacio = { producto_id: '', producto_presentacion_id: '', cantidad: '1' };

const estadoInfo = {
    pendiente: { label: 'Pendiente', variant: 'amber' },
    en_transito: { label: 'En tránsito', variant: 'blue' },
    recibida: { label: 'Recibida', variant: 'green' },
    cancelada: { label: 'Cancelada', variant: 'red' },
};

const num = (n) => new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 }).format(Number(n) || 0);
const fecha = (f) => (f ? new Date(f).toLocaleDateString('es-PE') : '—');

export default function Transferencias() {
    const toast = useToast();
    const [transferencias, setTransferencias] = useState([]);
    const [almacenes, setAlmacenes] = useState([]);
    const [productos, setProductos] = useState([]);
    const [existencias, setExistencias] = useState([]);
    /** Catálogo administrable de motivos de traslado. */
    const [motivos, setMotivos] = useState([]);
    const [tab, setTab] = useState('guias');
    const [picker, setPicker] = useState({ open: false, query: '' });
    /** Modal rápido de motivo: { desdeGuia: bool, editing: motivo|null } o null. */
    const [motivoModal, setMotivoModal] = useState(null);
    const [motivoForm, setMotivoForm] = useState({ nombre: '', activo: true });
    const [motivoSaving, setMotivoSaving] = useState(false);
    const [motivoDelete, setMotivoDelete] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState(emptyForm);
    const [panel, setPanel] = useState({ ...panelVacio });
    const [items, setItems] = useState([]);
    const [formErrors, setFormErrors] = useState({});
    const [saving, setSaving] = useState(false);
    const [actionId, setActionId] = useState(null);

    const [deleteTarget, setDeleteTarget] = useState(null);
    const [pdfTarget, setPdfTarget] = useState(null);
    const [deleting, setDeleting] = useState(false);

    /** Guía cuyo detalle se muestra en la segunda tabla. */
    const [seleccionada, setSeleccionada] = useState(null);
    const sheet = useSheet();

    const [filterEstado, setFilterEstado] = useState('');
    const [filterAlmacen, setFilterAlmacen] = useState('');
    const [activeFilters, setActiveFilters] = useState({});

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [transRes, almRes, prodRes, existRes, motRes] = await Promise.all([
                api.get('/transferencias'),
                api.get('/almacenes'),
                api.get('/productos', { params: { per_page: 500 } }),
                api.get('/existencias'),
                api.get('/motivos-traslado'),
            ]);
            setMotivos(asList(motRes));
            const lista = asList(transRes);
            setTransferencias(lista);
            setSeleccionada((prev) => lista.find((t) => t.id === prev?.id) ?? lista[0] ?? null);
            setAlmacenes(asList(almRes));
            setProductos(asList(prodRes));
            setExistencias(asList(existRes));
        } catch {
            setError('No se pudieron cargar las guías de traslado.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    // ── Stock del almacén de origen (en unidad base) ──
    const stockOrigen = useMemo(() => {
        if (!form.almacen_origen_id) return {};
        return existencias
            .filter((e) => String(e.almacen_id) === String(form.almacen_origen_id))
            .reduce((acc, e) => {
                acc[String(e.producto_id)] = Number(e.stock_actual) || 0;
                return acc;
            }, {});
    }, [existencias, form.almacen_origen_id]);

    const productoDe = useCallback(
        (id) => productos.find((p) => String(p.id) === String(id)) ?? null,
        [productos],
    );

    const MOTIVO_LABEL = useMemo(() => Object.fromEntries(motivos.map((m) => [m.codigo, m.nombre])), [motivos]);
    /** En el formulario solo se ofrecen los activos (más el ya elegido, si quedó inactivo). */
    const motivosOptions = useMemo(
        () =>
            motivos
                .filter((m) => m.activo || m.codigo === form.motivo_traslado)
                .map((m) => ({ value: m.codigo, label: m.nombre })),
        [motivos, form.motivo_traslado],
    );

    // ── CRUD de motivos ──
    const abrirMotivo = (editing = null, desdeGuia = false) => {
        setMotivoForm({ nombre: editing?.nombre ?? '', activo: editing?.activo ?? true });
        setMotivoModal({ editing, desdeGuia });
    };

    const guardarMotivo = async (e) => {
        e?.preventDefault?.();
        if (!motivoForm.nombre.trim()) return toast.error('Ingresa el nombre del motivo.');
        setMotivoSaving(true);
        try {
            let creado = null;
            if (motivoModal.editing) {
                await api.put(`/motivos-traslado/${motivoModal.editing.id}`, motivoForm);
                toast.success('Motivo actualizado.');
            } else {
                const { data } = await api.post('/motivos-traslado', motivoForm);
                creado = data;
                toast.success('Motivo creado.');
            }
            const { data: lista } = await api.get('/motivos-traslado');
            setMotivos(asList({ data: lista }));
            // Creado desde la guía: queda seleccionado en el formulario.
            if (creado && motivoModal.desdeGuia) setField('motivo_traslado', creado.codigo);
            setMotivoModal(null);
        } catch (err) {
            toast.error(err.response?.data?.errors?.nombre?.[0] ?? err.response?.data?.message ?? 'No se pudo guardar el motivo.');
        } finally {
            setMotivoSaving(false);
        }
    };

    const eliminarMotivo = async () => {
        try {
            const { data } = await api.delete(`/motivos-traslado/${motivoDelete.id}`);
            toast.success(data?.desactivado ? 'El motivo estaba en uso: se desactivó.' : 'Motivo eliminado.');
            setMotivoDelete(null);
            const { data: lista } = await api.get('/motivos-traslado');
            setMotivos(asList({ data: lista }));
        } catch (err) {
            toast.error(err.response?.data?.message ?? 'No se pudo eliminar.');
        }
    };

    /** Solo se traslada lo que hay en el origen. */
    const productosOptions = useMemo(
        () =>
            productos
                .filter((p) => (stockOrigen[String(p.id)] ?? 0) > 0)
                .map((p) => ({
                    value: String(p.id),
                    label: p.nombre,
                    keywords: `${p.codigo ?? ''} ${p.codigo_barras ?? ''}`,
                })),
        [productos, stockOrigen],
    );

    /** Unidades del producto con el disponible convertido a esa unidad. */
    const unidadesDe = useCallback(
        (productoId) => {
            const p = productoDe(productoId);
            if (!p) return [];
            const base = stockOrigen[String(p.id)] ?? 0;
            return (p.presentaciones ?? [])
                .filter((pres) => pres.activo !== false)
                .map((pres) => {
                    const factor = Number(pres.factor_conversion) || 1;
                    return {
                        value: String(pres.id),
                        label: pres.nombre,
                        disponible: Math.floor((base / factor) * 100) / 100,
                    };
                });
        },
        [productoDe, stockOrigen],
    );

    const disponibleDe = (productoId, presId) =>
        unidadesDe(productoId).find((u) => String(u.value) === String(presId))?.disponible ?? 0;

    const setField = (name, value) => {
        setForm((prev) => ({ ...prev, [name]: value }));
        if (formErrors[name]) setFormErrors((prev) => ({ ...prev, [name]: undefined }));
    };

    // ── Panel de alta de producto ──
    const elegirProducto = (productoId) => {
        const us = unidadesDe(productoId);
        setPanel({
            producto_id: productoId,
            producto_presentacion_id: us.length === 1 ? us[0].value : '',
            cantidad: '1',
        });
    };

    const agregarProducto = () => {
        if (!form.almacen_origen_id) return toast.error('Elige primero el almacén de origen.');
        if (!panel.producto_id) return toast.error('Busca y elige un producto.');
        if (!panel.producto_presentacion_id) return toast.error('Elige la unidad.');
        const cant = Number(panel.cantidad) || 0;
        if (cant <= 0) return toast.error('La cantidad debe ser mayor a 0.');

        const disp = disponibleDe(panel.producto_id, panel.producto_presentacion_id);
        if (cant > disp) return toast.error(`Solo hay ${num(disp)} disponibles en el origen.`);

        setItems((prev) => {
            const i = prev.findIndex(
                (it) => String(it.producto_presentacion_id) === String(panel.producto_presentacion_id),
            );
            if (i !== -1) {
                return prev.map((it, idx) =>
                    idx === i ? { ...it, cantidad: String((Number(it.cantidad) || 0) + cant) } : it,
                );
            }
            return [
                ...prev,
                {
                    producto_id: panel.producto_id,
                    producto_presentacion_id: panel.producto_presentacion_id,
                    cantidad: String(cant),
                },
            ];
        });
        setPanel({ ...panelVacio });
    };

    /** Resultado del buscador avanzado: llegan producto, unidad y cantidad. */
    const agregarDesdePicker = (seleccionados) => {
        const utiles = seleccionados.filter((sel) => sel.presentacion && sel.cantidad > 0);
        if (utiles.length === 0) return;
        setItems((prev) => {
            const next = [...prev];
            utiles.forEach(({ producto, presentacion, cantidad }) => {
                const i = next.findIndex((it) => String(it.producto_presentacion_id) === String(presentacion.id));
                if (i !== -1) next[i] = { ...next[i], cantidad: String((Number(next[i].cantidad) || 0) + cantidad) };
                else next.push({ producto_id: String(producto.id), producto_presentacion_id: String(presentacion.id), cantidad: String(cantidad) });
            });
            return next;
        });
        toast.success(utiles.length === 1 ? 'Producto agregado.' : `${utiles.length} productos agregados.`);
        setPanel({ ...panelVacio });
    };

    const setItem = (i, patch) => setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
    const quitarItem = (i) => setItems((prev) => prev.filter((_, idx) => idx !== i));

    const runAccion = async (row, accion, exito) => {
        setActionId(row.id);
        try {
            await api.post(`/transferencias/${row.id}/${accion}`);
            toast.success(exito);
            await load();
        } catch (err) {
            toast.error(err.response?.data?.message ?? 'No se pudo completar la acción.');
        } finally {
            setActionId(null);
        }
    };

    const openCreate = () => {
        setEditing(null);
        setForm({ ...emptyForm, fecha_inicio_traslado: hoy() });
        setPanel({ ...panelVacio });
        setItems([]);
        setFormErrors({});
        setModalOpen(true);
    };

    const openEdit = (t) => {
        setEditing(t);
        setForm({
            ...emptyForm,
            almacen_origen_id: String(t.almacen_origen_id ?? ''),
            almacen_destino_id: String(t.almacen_destino_id ?? ''),
            motivo_traslado: t.motivo_traslado ?? 'traslado_entre_establecimientos',
            fecha_inicio_traslado: (t.fecha_inicio_traslado ?? '').slice(0, 10) || hoy(),
            modalidad_transporte: t.modalidad_transporte ?? 'privado',
            transportista_razon_social: t.transportista_razon_social ?? '',
            transportista_ruc: t.transportista_ruc ?? '',
            vehiculo_placa: t.vehiculo_placa ?? '',
            conductor_nombre: t.conductor_nombre ?? '',
            conductor_documento: t.conductor_documento ?? '',
            conductor_licencia: t.conductor_licencia ?? '',
            numero_bultos: t.numero_bultos ?? '',
            peso_bruto_kg: t.peso_bruto_kg ?? '',
            observaciones: t.observaciones ?? '',
        });
        setFormErrors({});
        setModalOpen(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        setFormErrors({});

        const transporte = {
            motivo_traslado: form.motivo_traslado,
            fecha_inicio_traslado: form.fecha_inicio_traslado,
            modalidad_transporte: form.modalidad_transporte,
            transportista_razon_social: form.transportista_razon_social || null,
            transportista_ruc: form.transportista_ruc || null,
            vehiculo_placa: form.vehiculo_placa || null,
            conductor_nombre: form.conductor_nombre || null,
            conductor_documento: form.conductor_documento || null,
            conductor_licencia: form.conductor_licencia || null,
            numero_bultos: form.numero_bultos === '' ? null : Number(form.numero_bultos),
            peso_bruto_kg: form.peso_bruto_kg === '' ? null : Number(form.peso_bruto_kg),
            observaciones: form.observaciones,
        };

        try {
            if (editing) {
                await api.put(`/transferencias/${editing.id}`, transporte);
                toast.success('Guía actualizada.');
            } else {
                if (items.length === 0) {
                    setFormErrors({ detalles: 'Agrega al menos un producto.' });
                    setSaving(false);
                    return;
                }
                await api.post('/transferencias', {
                    almacen_origen_id: form.almacen_origen_id,
                    almacen_destino_id: form.almacen_destino_id,
                    ...transporte,
                    detalles: items.map((it) => ({
                        producto_presentacion_id: it.producto_presentacion_id,
                        cantidad_enviada: it.cantidad,
                    })),
                });
                toast.success('Guía de traslado creada. Envíala para descontar el stock del origen.');
            }
            setModalOpen(false);
            await load();
        } catch (err) {
            if (err.response?.status === 422) {
                const v = err.response.data?.errors ?? {};
                setFormErrors(Object.fromEntries(Object.entries(v).map(([k, val]) => [k, val[0]])));
                toast.error(err.response.data?.message ?? 'Revisa los datos.');
            } else {
                toast.error('No se pudo guardar la guía.');
            }
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        setDeleting(true);
        try {
            await api.delete(`/transferencias/${deleteTarget.id}`);
            toast.success('Guía eliminada.');
            setDeleteTarget(null);
            await load();
        } catch (err) {
            toast.error(err.response?.data?.message ?? 'No se pudo eliminar.');
        } finally {
            setDeleting(false);
        }
    };

    // ── Filtros ──
    const applyFilters = () => {
        const next = {};
        if (filterEstado) next.estado = filterEstado;
        if (filterAlmacen) next.almacen = filterAlmacen;
        setActiveFilters(next);
    };
    const clearFilters = () => {
        setFilterEstado('');
        setFilterAlmacen('');
        setActiveFilters({});
    };
    const filtered = transferencias.filter((t) => {
        if (activeFilters.estado && t.estado !== activeFilters.estado) return false;
        if (activeFilters.almacen) {
            const a = activeFilters.almacen;
            if (String(t.almacen_origen_id) !== a && String(t.almacen_destino_id) !== a) return false;
        }
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
                    ...Object.entries(estadoInfo).map(([value, info]) => ({ value, label: info.label })),
                ]}
                className="w-40"
            />
            <Select
                label="Almacén"
                value={filterAlmacen}
                onChange={(e) => setFilterAlmacen(e.target.value)}
                options={[{ value: '', label: 'Todos' }, ...almacenes.map((a) => ({ value: String(a.id), label: a.nombre }))]}
                className="w-48"
            />
            <Button variant="primary" size="sm" onClick={applyFilters}>Aplicar</Button>
            {filterCount > 0 && <Button variant="ghost" size="sm" onClick={clearFilters}>Limpiar</Button>}
        </div>
    );

    // ── Columnas ──
    const columns = [
        {
            key: 'documento',
            label: 'N° Guía',
            width: '130px',
            getSearchValue: (row) => row.documento,
            render: (row) => <span className="font-semibold text-warm-900">{row.documento ?? `#${row.id}`}</span>,
        },
        {
            key: 'fecha_inicio_traslado',
            label: 'Fecha',
            width: '100px',
            render: (row) => fecha(row.fecha_inicio_traslado ?? row.created_at),
        },
        {
            key: 'ruta',
            label: 'Origen → Destino',
            getSearchValue: (row) => `${row.almacen_origen?.nombre} ${row.almacen_destino?.nombre}`,
            render: (row) => (
                <span className="inline-flex items-center gap-2 font-medium text-warm-900">
                    <Repeat className="h-4 w-4 shrink-0 text-primary-600" />
                    <span className="truncate">{row.almacen_origen?.nombre ?? '—'}</span>
                    <ArrowRight className="h-3 w-3 shrink-0 text-gray-400" />
                    <span className="truncate">{row.almacen_destino?.nombre ?? '—'}</span>
                </span>
            ),
        },
        {
            key: 'motivo_traslado',
            label: 'Motivo',
            width: '170px',
            render: (row) => (
                <span className="block truncate text-warm-500" title={MOTIVO_LABEL[row.motivo_traslado] ?? ''}>
                    {MOTIVO_LABEL[row.motivo_traslado] ?? row.motivo_traslado ?? '—'}
                </span>
            ),
        },
        {
            key: 'transporte',
            label: 'Transporte',
            width: '160px',
            searchable: false,
            render: (row) => (
                <span className="block truncate text-warm-500">
                    {row.modalidad_transporte === 'publico'
                        ? row.transportista_razon_social || 'Público'
                        : row.vehiculo_placa
                          ? `Propio · ${row.vehiculo_placa}`
                          : 'Propio'}
                </span>
            ),
        },
        {
            key: 'detalles_count',
            label: 'Ítems',
            width: '75px',
            align: 'right',
            searchable: false,
            render: (row) => <Badge variant="blue">{row.detalles_count ?? row.detalles?.length ?? 0}</Badge>,
        },
        {
            key: 'estado',
            label: 'Estado',
            width: '110px',
            render: (row) => {
                const info = estadoInfo[row.estado] ?? { label: row.estado ?? '—', variant: 'gray' };
                return <Badge variant={info.variant}>{info.label}</Badge>;
            },
        },
        {
            type: 'actions',
            key: 'actions',
            label: 'Acciones',
            width: '150px',
            actions: (row) => (
                <>
                    <button aria-label="Imprimir" title="Imprimir / PDF"
                        onClick={(e) => { e.stopPropagation(); setPdfTarget(row); }}
                        className="rounded-md p-1.5 text-warm-600 transition hover:bg-gray-100 hover:text-warm-900">
                        <Printer className="h-4 w-4" />
                    </button>

                    {row.estado === 'pendiente' && (
                        <button aria-label="Enviar" title="Enviar (descuenta stock del origen)" disabled={actionId === row.id}
                            onClick={(e) => { e.stopPropagation(); runAccion(row, 'enviar', 'Guía enviada. Stock descontado del origen.'); }}
                            className="rounded-md p-1.5 text-blue-600 transition hover:bg-blue-50 disabled:opacity-40">
                            <Send className="h-4 w-4" />
                        </button>
                    )}
                    {row.estado === 'en_transito' && (
                        <button aria-label="Recibir" title="Recibir (ingresa stock al destino)" disabled={actionId === row.id}
                            onClick={(e) => { e.stopPropagation(); runAccion(row, 'recibir', 'Guía recibida. Stock ingresado al destino.'); }}
                            className="rounded-md p-1.5 text-green-600 transition hover:bg-green-50 disabled:opacity-40">
                            <PackageCheck className="h-4 w-4" />
                        </button>
                    )}
                    {row.estado === 'pendiente' && (
                        <button aria-label="Anular" title="Anular" disabled={actionId === row.id}
                            onClick={(e) => { e.stopPropagation(); runAccion(row, 'anular', 'Guía anulada.'); }}
                            className="rounded-md p-1.5 text-gray-500 transition hover:bg-gray-100 disabled:opacity-40">
                            <Ban className="h-4 w-4" />
                        </button>
                    )}
                    <button aria-label="Editar" title={row.estado === 'pendiente' ? 'Editar datos de transporte' : 'Editar observaciones'}
                        onClick={(e) => { e.stopPropagation(); openEdit(row); }}
                        className="rounded-md p-1.5 text-primary-600 transition hover:bg-primary-50">
                        <Edit className="h-4 w-4" />
                    </button>
                    {row.estado === 'pendiente' && (
                        <button aria-label="Eliminar" title="Eliminar"
                            onClick={(e) => { e.stopPropagation(); setDeleteTarget(row); }}
                            className="rounded-md p-1.5 text-red-600 transition hover:bg-red-50">
                            <Trash2 className="h-4 w-4" />
                        </button>
                    )}
                </>
            ),
        },
    ];

    const detalles = seleccionada?.detalles ?? [];
    const esPublico = form.modalidad_transporte === 'publico';

    const motivoColumns = [
        {
            key: 'nombre',
            label: 'Motivo',
            render: (row) => (
                <span className="inline-flex items-center gap-2 font-medium text-warm-900">
                    {row.es_sistema && <Lock className="h-4 w-4 text-primary-600" />}
                    {row.nombre}
                </span>
            ),
        },
        { key: 'codigo', label: 'Código', width: '240px', render: (row) => <span className="font-mono text-xs text-warm-500">{row.codigo}</span> },
        {
            key: 'es_sistema', label: 'Origen', width: '110px', searchable: false,
            render: (row) => (row.es_sistema ? <Badge variant="blue">Sistema</Badge> : <Badge variant="gray">Manual</Badge>),
        },
        {
            key: 'activo', label: 'Estado', width: '100px', searchable: false,
            render: (row) => (row.activo ? <Badge variant="green">Activo</Badge> : <Badge variant="red">Inactivo</Badge>),
        },
        {
            type: 'actions', key: 'actions', label: 'Acciones', width: '110px',
            actions: (row) => (
                <>
                    <button aria-label="Editar" title={row.es_sistema ? 'Activar / desactivar' : 'Editar'} onClick={() => abrirMotivo(row)}
                        className="rounded-md p-1.5 text-primary-600 transition hover:bg-primary-50">
                        <Edit className="h-4 w-4" />
                    </button>
                    {!row.es_sistema && (
                        <button aria-label="Eliminar" title="Eliminar" onClick={() => setMotivoDelete(row)}
                            className="rounded-md p-1.5 text-red-600 transition hover:bg-red-50">
                            <Trash2 className="h-4 w-4" />
                        </button>
                    )}
                </>
            ),
        },
    ];

    return (
        <Layout>
            <PageHeader
                title="Guías de Traslado"
                description={tab === 'guias' ? 'Traslado de mercadería entre almacenes: guía de remisión interna numerada' : 'Catálogo de motivos de traslado de la guía'}
                actions={
                    tab === 'guias'
                        ? <CreateButton onClick={openCreate}>Nueva guía</CreateButton>
                        : <CreateButton onClick={() => abrirMotivo()}>Nuevo motivo</CreateButton>
                }
            />

            {error && <Alert variant="error" className="mb-4">{error}</Alert>}

            <div className="mb-4">
                <Tabs
                    items={[
                        { key: 'guias', label: 'Guías', icon: Repeat },
                        { key: 'motivos', label: 'Motivos de traslado', icon: ListChecks },
                    ]}
                    value={tab}
                    onChange={setTab}
                />
            </div>

            {tab === 'motivos' && (
                <DataTable columns={motivoColumns} rows={motivos} loading={loading} searchPlaceholder="Buscar motivos..." emptyMessage="No hay motivos de traslado" />
            )}

            {tab === 'guias' && (<>
            <DataTable
                columns={columns}
                rows={filtered}
                loading={loading}
                searchPlaceholder="Buscar guías..."
                filterable
                filters={filters}
                filterCount={filterCount}
                onRowClick={(row) => { setSeleccionada(row); sheet.abrir(); }}
                rowClassName={(row) => (row.id === seleccionada?.id ? 'bg-primary-50' : undefined)}
            />

            {/* Móvil: el detalle sube desde abajo al tocar una card (en escritorio no pinta nada). */}
            <BottomSheet
                open={sheet.open && Boolean(seleccionada)}
                onClose={sheet.cerrar}
                title={seleccionada ? `Guía ${seleccionada.documento ?? `#${seleccionada.id}`}` : ''}
                subtitle={seleccionada ? `${MOTIVO_LABEL[seleccionada.motivo_traslado] ?? '—'} · ${seleccionada.modalidad_transporte === 'publico' ? 'Público' : 'Privado'}${seleccionada.vehiculo_placa ? ` · ${seleccionada.vehiculo_placa}` : ''}` : ''}
            >
                {detalles.length === 0 ? (
                    <p className="py-6 text-center text-sm text-warm-500">Esta guía no tiene productos.</p>
                ) : (
                    <div className="space-y-3">
                        {detalles.map((d) => {
                            const producto = d.presentacion?.producto;
                            return (
                                <DetalleCard
                                    key={d.id}
                                    titulo={producto?.nombre ?? '—'}
                                    subtitulo={[producto?.codigo, d.presentacion?.nombre, producto?.marca?.nombre].filter(Boolean).join(' · ')}
                                    columnas={2}
                                    campos={[
                                        { label: 'Enviado', value: num(d.cantidad_enviada), valueClassName: 'text-primary-600' },
                                        { label: 'Recibido', value: d.cantidad_recibida != null ? num(d.cantidad_recibida) : '—' },
                                    ]}
                                />
                            );
                        })}
                    </div>
                )}
            </BottomSheet>

            {/* Detalle de la guía seleccionada (escritorio) */}
            <div className="mt-6 hidden rounded-xl border border-edge bg-white shadow-sm md:block">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-edge px-5 py-3">
                    <h2 className="text-sm font-semibold text-warm-900">
                        Detalle {seleccionada?.documento ? `de ${seleccionada.documento}` : ''}
                    </h2>
                    {seleccionada && (
                        <span className="flex flex-wrap gap-3 text-xs text-warm-500">
                            <span>Motivo: <strong className="text-warm-900">{MOTIVO_LABEL[seleccionada.motivo_traslado] ?? '—'}</strong></span>
                            <span>Transporte: <strong className="text-warm-900">{seleccionada.modalidad_transporte === 'publico' ? 'Público' : 'Privado'}</strong></span>
                            {seleccionada.vehiculo_placa && <span>Placa: <strong className="text-warm-900">{seleccionada.vehiculo_placa}</strong></span>}
                            {seleccionada.conductor_nombre && <span>Conductor: <strong className="text-warm-900">{seleccionada.conductor_nombre}</strong></span>}
                            {seleccionada.numero_bultos != null && <span>Bultos: <strong className="text-warm-900">{seleccionada.numero_bultos}</strong></span>}
                            {seleccionada.peso_bruto_kg != null && <span>Peso: <strong className="text-warm-900">{num(seleccionada.peso_bruto_kg)} kg</strong></span>}
                        </span>
                    )}
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[820px] text-sm">
                        <thead>
                            <tr className="bg-primary-600 text-left text-xs font-semibold uppercase tracking-wide text-white">
                                <th className="w-12 px-3 py-2.5 text-center">#</th>
                                <th className="w-28 px-3 py-2.5">Código</th>
                                <th className="px-3 py-2.5">Producto</th>
                                <th className="w-32 px-3 py-2.5">Marca</th>
                                <th className="w-32 px-3 py-2.5">Unidad</th>
                                <th className="w-28 px-3 py-2.5 text-right">Enviado</th>
                                <th className="w-28 px-3 py-2.5 text-right">Recibido</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {detalles.length === 0 && (
                                <tr>
                                    <td colSpan={7} className="px-3 py-10 text-center text-sm text-warm-500">
                                        {seleccionada ? 'Esta guía no tiene productos.' : 'Selecciona una guía arriba para ver su detalle.'}
                                    </td>
                                </tr>
                            )}
                            {detalles.map((d, i) => {
                                const producto = d.presentacion?.producto;
                                return (
                                    <tr key={d.id}>
                                        <td className="px-3 py-2 text-center text-warm-500">{i + 1}</td>
                                        <td className="px-3 py-2 text-warm-500">{producto?.codigo ?? '—'}</td>
                                        <td className="px-3 py-2 font-semibold text-warm-900">{producto?.nombre ?? '—'}</td>
                                        <td className="px-3 py-2 text-warm-500">{producto?.marca?.nombre ?? '—'}</td>
                                        <td className="px-3 py-2 text-warm-500">{d.presentacion?.nombre ?? '—'}</td>
                                        <td className="px-3 py-2 text-right font-semibold text-primary-600">{num(d.cantidad_enviada)}</td>
                                        <td className="px-3 py-2 text-right text-warm-900">{d.cantidad_recibida != null ? num(d.cantidad_recibida) : '—'}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
            </>)}

            {/* Modal de guía */}
            <Modal
                open={modalOpen}
                onClose={() => setModalOpen(false)}
                title={editing ? `Editar guía ${editing.documento ?? ''}` : 'Nueva guía de traslado'}
                description={
                    editing
                        ? editing.estado === 'pendiente'
                            ? 'Puedes completar los datos del transporte hasta enviarla.'
                            : 'Una guía enviada solo admite cambios en observaciones.'
                        : 'Documento interno numerado para mover mercadería entre almacenes.'
                }
                size="3xl"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button>
                        <Button type="submit" form="guia-form" loading={saving}>
                            {editing ? 'Guardar' : 'Crear guía'}
                        </Button>
                    </>
                }
            >
                <form id="guia-form" onSubmit={handleSubmit} noValidate className="space-y-5">
                    {/* Ruta y motivo */}
                    <section>
                        <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-warm-500">Traslado</h3>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            <Select label="Almacén origen" value={form.almacen_origen_id} disabled={Boolean(editing)}
                                onChange={(e) => { setField('almacen_origen_id', e.target.value); setItems([]); setPanel({ ...panelVacio }); }}
                                options={[{ value: '', label: 'Selecciona…' }, ...opcionesAlmacen(almacenes, form.almacen_origen_id)]}
                                error={formErrors.almacen_origen_id} />
                            <Select label="Almacén destino" value={form.almacen_destino_id} disabled={Boolean(editing)}
                                onChange={(e) => setField('almacen_destino_id', e.target.value)}
                                options={[{ value: '', label: 'Selecciona…' }, ...opcionesAlmacen(almacenes, form.almacen_destino_id).filter((o) => o.value !== String(form.almacen_origen_id))]}
                                error={formErrors.almacen_destino_id} />
                            <Input label="Fecha de inicio" type="date" value={form.fecha_inicio_traslado}
                                onChange={(e) => setField('fecha_inicio_traslado', e.target.value)}
                                disabled={editing && editing.estado !== 'pendiente'} error={formErrors.fecha_inicio_traslado} />
                            <div className="flex items-end gap-2">
                                <div className="flex-1">
                                    <Select label="Motivo de traslado" value={form.motivo_traslado}
                                        onChange={(e) => setField('motivo_traslado', e.target.value)}
                                        options={[{ value: '', label: 'Selecciona…' }, ...motivosOptions]}
                                        disabled={editing && editing.estado !== 'pendiente'} error={formErrors.motivo_traslado} />
                                </div>
                                {(!editing || editing.estado === 'pendiente') && (
                                    <button type="button" onClick={() => abrirMotivo(null, true)} title="Crear motivo"
                                        className="mb-0.5 rounded-md p-1.5 text-emerald-600 transition hover:bg-emerald-50">
                                        <PlusCircle className="h-5 w-5" />
                                    </button>
                                )}
                            </div>
                        </div>
                    </section>

                    {/* Transporte */}
                    <section>
                        <h3 className="mb-2 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-warm-500">
                            <Truck className="h-4 w-4" /> Transporte
                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold normal-case tracking-normal text-warm-500">
                                Opcional
                            </span>
                        </h3>
                        <p className="mb-3 text-xs text-warm-500">
                            Puedes dejarlo vacío y completarlo después, mientras la guía esté pendiente.
                            {esPublico && ' Con transporte público sí se requiere el transportista y su RUC.'}
                        </p>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            <Select label="Modalidad" value={form.modalidad_transporte}
                                onChange={(e) => setField('modalidad_transporte', e.target.value)}
                                options={[{ value: 'privado', label: 'Privado (vehículo propio)' }, { value: 'publico', label: 'Público (empresa de transporte)' }]}
                                disabled={editing && editing.estado !== 'pendiente'} />
                            {esPublico && (
                                <>
                                    <Input label="Transportista (razón social) *" value={form.transportista_razon_social}
                                        onChange={(e) => setField('transportista_razon_social', e.target.value)}
                                        error={formErrors.transportista_razon_social} className="sm:col-span-2" />
                                    <Input label="RUC transportista *" value={form.transportista_ruc} maxLength={11}
                                        onChange={(e) => setField('transportista_ruc', e.target.value.replace(/\D/g, ''))}
                                        error={formErrors.transportista_ruc} />
                                </>
                            )}
                            <Input label="Placa del vehículo" placeholder="ABC-123" value={form.vehiculo_placa}
                                onChange={(e) => setField('vehiculo_placa', e.target.value.toUpperCase())} error={formErrors.vehiculo_placa} />
                            <Input label="Conductor" value={form.conductor_nombre}
                                onChange={(e) => setField('conductor_nombre', e.target.value)} error={formErrors.conductor_nombre} />
                            <Input label="DNI del conductor" value={form.conductor_documento}
                                onChange={(e) => setField('conductor_documento', e.target.value)} error={formErrors.conductor_documento} />
                            <Input label="Licencia" value={form.conductor_licencia}
                                onChange={(e) => setField('conductor_licencia', e.target.value.toUpperCase())} error={formErrors.conductor_licencia} />
                            <Input label="N° de bultos" type="number" min="0" value={form.numero_bultos}
                                onChange={(e) => setField('numero_bultos', e.target.value)} error={formErrors.numero_bultos} />
                            <Input label="Peso bruto (kg)" type="number" min="0" step="any" value={form.peso_bruto_kg}
                                onChange={(e) => setField('peso_bruto_kg', e.target.value)} error={formErrors.peso_bruto_kg} />
                        </div>
                    </section>

                    {/* Productos (solo al crear: una vez emitida, el detalle es fijo) */}
                    {!editing && (
                        <section>
                            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-warm-500">Productos a trasladar</h3>
                            {!form.almacen_origen_id ? (
                                <Alert variant="info">Elige el almacén de origen para ver sus productos con stock.</Alert>
                            ) : (
                                <>
                                    <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_180px_120px_auto] md:items-end">
                                        <SearchSelect
                                            label="Producto"
                                            value={panel.producto_id}
                                            onChange={elegirProducto}
                                            options={productosOptions}
                                            placeholder="Buscar producto con stock en el origen…"
                                            emptyText="Sin productos con stock en este almacén"
                                            searchTitle="Buscador avanzado con filtros"
                                            onSearch={(q) => setPicker({ open: true, query: q })}
                                        />
                                        <Select
                                            label="Unidad"
                                            value={panel.producto_presentacion_id}
                                            disabled={!panel.producto_id}
                                            onChange={(e) => setPanel((p) => ({ ...p, producto_presentacion_id: e.target.value }))}
                                            options={[
                                                { value: '', label: panel.producto_id ? 'Unidad…' : '—' },
                                                ...unidadesDe(panel.producto_id).map((u) => ({ value: u.value, label: `${u.label} (disp. ${num(u.disponible)})` })),
                                            ]}
                                        />
                                        <Input label="Cantidad" type="number" min="0" step="any" value={panel.cantidad}
                                            onChange={(e) => setPanel((p) => ({ ...p, cantidad: e.target.value }))} className="text-right" />
                                        <Button type="button" onClick={agregarProducto} className="justify-center">
                                            <Plus className="h-4 w-4" /> Agregar
                                        </Button>
                                    </div>

                                    <div className="mt-3 overflow-x-auto rounded-lg border border-edge">
                                        <table className="w-full min-w-[560px] text-sm">
                                            <thead>
                                                <tr className="bg-primary-600 text-left text-xs font-semibold uppercase tracking-wide text-white">
                                                    <th className="px-3 py-2">Producto</th>
                                                    <th className="w-32 px-3 py-2">Unidad</th>
                                                    <th className="w-24 px-3 py-2 text-right">Disp.</th>
                                                    <th className="w-28 px-3 py-2 text-right">Cantidad</th>
                                                    <th className="w-12 px-3 py-2" />
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100">
                                                {items.length === 0 && (
                                                    <tr><td colSpan={5} className="px-3 py-6 text-center text-warm-500">Agrega productos arriba</td></tr>
                                                )}
                                                {items.map((it, i) => {
                                                    const p = productoDe(it.producto_id);
                                                    const u = unidadesDe(it.producto_id).find((x) => String(x.value) === String(it.producto_presentacion_id));
                                                    const excede = u && Number(it.cantidad) > u.disponible;
                                                    return (
                                                        <tr key={i}>
                                                            <td className="px-3 py-2 font-medium text-warm-900">{p?.nombre ?? '—'}</td>
                                                            <td className="px-3 py-2 text-warm-500">{u?.label ?? '—'}</td>
                                                            <td className="px-3 py-2 text-right text-warm-500">{u ? num(u.disponible) : '—'}</td>
                                                            <td className="px-3 py-2">
                                                                <Input type="number" min="0" step="any" value={it.cantidad}
                                                                    onChange={(e) => setItem(i, { cantidad: e.target.value })}
                                                                    error={excede ? 'Supera el stock' : undefined} className="text-right" />
                                                            </td>
                                                            <td className="px-3 py-2 text-center">
                                                                <button type="button" onClick={() => quitarItem(i)} aria-label="Quitar"
                                                                    className="rounded-md p-1.5 text-red-600 transition hover:bg-red-50">
                                                                    <Trash2 className="h-4 w-4" />
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                    {formErrors.detalles && <p className="mt-1 text-xs text-red-600">{formErrors.detalles}</p>}
                                </>
                            )}
                        </section>
                    )}

                    <Input label="Observaciones" placeholder="Opcional" value={form.observaciones}
                        onChange={(e) => setField('observaciones', e.target.value)} />
                </form>
            </Modal>

            <Modal open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} title="Eliminar guía"
                description={`¿Eliminar la guía ${deleteTarget?.documento ?? ''}?`} size="sm"
                footer={<>
                    <Button variant="secondary" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
                    <Button variant="danger" loading={deleting} onClick={handleDelete}>Eliminar</Button>
                </>}>
                <Alert variant="warning">Solo se pueden eliminar guías pendientes; no afecta al stock.</Alert>
            </Modal>

            {/* Buscador avanzado de productos (solo los del almacén de origen con stock) */}
            <ProductoPickerModal
                open={picker.open}
                onClose={() => setPicker((p) => ({ ...p, open: false }))}
                onSelect={agregarDesdePicker}
                initialQuery={picker.query}
                multiple
                stockFilter
                productos={productos.filter((p) => (stockOrigen[String(p.id)] ?? 0) > 0)}
                stockPorProducto={stockOrigen}
                title="Buscar productos"
            />

            {/* Motivo de traslado: crear / editar */}
            <Modal open={Boolean(motivoModal)} onClose={() => setMotivoModal(null)}
                title={motivoModal?.editing ? 'Editar motivo' : 'Nuevo motivo de traslado'}
                description={motivoModal?.editing?.es_sistema ? 'Los motivos del sistema solo se pueden activar o desactivar.' : 'Aparecerá en el selector de la guía.'}
                size="md"
                footer={<>
                    <Button variant="secondary" onClick={() => setMotivoModal(null)}>Cancelar</Button>
                    <Button type="submit" form="motivo-form" loading={motivoSaving}>{motivoModal?.editing ? 'Guardar' : 'Crear'}</Button>
                </>}>
                <form id="motivo-form" onSubmit={guardarMotivo} noValidate className="space-y-4">
                    <Input label="Nombre" placeholder="Ej: Traslado a feria" value={motivoForm.nombre}
                        disabled={Boolean(motivoModal?.editing?.es_sistema)}
                        onChange={(e) => setMotivoForm((f) => ({ ...f, nombre: e.target.value }))} />
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                        <input type="checkbox" checked={motivoForm.activo}
                            onChange={(e) => setMotivoForm((f) => ({ ...f, activo: e.target.checked }))}
                            className="h-4 w-4 rounded border-gray-300 accent-primary-600" />
                        <ListChecks className="h-4 w-4 text-primary-600" /> Motivo activo
                    </label>
                </form>
            </Modal>

            <Modal open={Boolean(motivoDelete)} onClose={() => setMotivoDelete(null)} title="Eliminar motivo"
                description={`¿Eliminar "${motivoDelete?.nombre ?? ''}"?`} size="sm"
                footer={<>
                    <Button variant="secondary" onClick={() => setMotivoDelete(null)}>Cancelar</Button>
                    <Button variant="danger" onClick={eliminarMotivo}>Eliminar</Button>
                </>}>
                <Alert variant="warning">Si alguna guía ya lo usa, se desactivará en lugar de eliminarse.</Alert>
            </Modal>
                    <PdfViewerModal
                open={Boolean(pdfTarget)}
                onClose={() => setPdfTarget(null)}
                tipo="guia-traslado"
                id={pdfTarget?.id}
                nombre={pdfTarget?.documento}
                titulo="Guía de traslado"
                formatos={['a4', 'ticket']}
            />
        </Layout>
    );
}
