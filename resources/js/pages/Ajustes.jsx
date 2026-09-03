import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, BadgeCheck, Edit, Lock, Plus, Printer, Scale, Trash2 } from 'lucide-react';
import api, { asList } from '../lib/api';
import { opcionesAlmacen } from '../lib/almacenes';
import { useToast } from '../lib/toast';
import Layout from '../components/Layout';
import PageHeader, { CreateButton } from '../components/PageHeader';
import PdfViewerModal from '../components/PdfViewerModal';
import { Alert, Badge, Button, DataTable, Input, Modal, SearchSelect, Select, Tabs } from '../components/ui';

const num = (n) => new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 }).format(Number(n) || 0);

const money = (n) =>
    new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(Number(n) || 0);

const emptyForm = { almacen_id: '', proveedor_id: '', tipo: 'entrada', motivo: '', observaciones: '' };
const emptyMotivoForm = { nombre: '', tipo: 'entrada', activo: true };
const emptyDetalle = { producto_id: '', producto_presentacion_id: '', cantidad: '' };

const estadoInfo = {
    pendiente: { label: 'Pendiente', variant: 'amber' },
    aprobado: { label: 'Aprobado', variant: 'green' },
    rechazado: { label: 'Rechazado', variant: 'red' },
};

const tipoInfo = {
    entrada: { label: 'Entrada', variant: 'green', icon: ArrowDownLeft },
    salida: { label: 'Salida', variant: 'red', icon: ArrowUpRight },
};

export default function Ajustes() {
    const toast = useToast();
    const [ajustes, setAjustes] = useState([]);
    const [almacenes, setAlmacenes] = useState([]);
    const [productos, setProductos] = useState([]);
    const [existencias, setExistencias] = useState([]);
    const [proveedores, setProveedores] = useState([]);
    /** Ajuste cuyo detalle se muestra en la segunda tabla. */
    const [seleccionado, setSeleccionado] = useState(null);
    const [pdfTarget, setPdfTarget] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState(emptyForm);
    const [detalles, setDetalles] = useState([{ ...emptyDetalle }]);
    const [formErrors, setFormErrors] = useState({});
    const [saving, setSaving] = useState(false);

    const [deleteTarget, setDeleteTarget] = useState(null);
    const [deleting, setDeleting] = useState(false);

    const [filterEstado, setFilterEstado] = useState('');
    const [filterTipo, setFilterTipo] = useState('');
    const [activeFilters, setActiveFilters] = useState({});

    const [activeTab, setActiveTab] = useState('ajustes');

    const [motivos, setMotivos] = useState([]);
    const [motivosLoading, setMotivosLoading] = useState(false);
    const [motivosError, setMotivosError] = useState(null);
    const [motivoModalOpen, setMotivoModalOpen] = useState(false);
    const [editingMotivo, setEditingMotivo] = useState(null);
    const [motivoForm, setMotivoForm] = useState(emptyMotivoForm);
    const [motivoFormErrors, setMotivoFormErrors] = useState({});
    const [motivoSaving, setMotivoSaving] = useState(false);
    const [motivoDeleteTarget, setMotivoDeleteTarget] = useState(null);
    const [motivoDeleting, setMotivoDeleting] = useState(false);
    const [motivoFilterTipo, setMotivoFilterTipo] = useState('');
    const [motivoFilterEstado, setMotivoFilterEstado] = useState('');
    const [motivoActiveFilters, setMotivoActiveFilters] = useState({});

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [ajustesRes, almRes, prodRes, existRes, motivosRes, provRes] = await Promise.all([
                api.get('/ajustes'),
                api.get('/almacenes'),
                api.get('/productos', { params: { per_page: 500 } }),
                api.get('/existencias'),
                api.get('/motivos-movimiento?ambito=inventario'),
                api.get('/proveedores'),
            ]);
            const listaAjustes = asList(ajustesRes);
            setAjustes(listaAjustes);
            setProveedores(asList(provRes));
            // Se conserva la selección tras recargar.
            setSeleccionado((prev) => listaAjustes.find((a) => a.id === prev?.id) ?? listaAjustes[0] ?? null);
            setAlmacenes(asList(almRes));
            setProductos(asList(prodRes));
            setExistencias(asList(existRes));
            setMotivos(asList(motivosRes));
        } catch {
            setError('No se pudieron cargar los ajustes.');
        } finally {
            setLoading(false);
        }
    }, []);

    const loadMotivos = useCallback(async () => {
        setMotivosLoading(true);
        setMotivosError(null);
        try {
            setMotivos(asList(await api.get('/motivos-movimiento?ambito=inventario')));
        } catch {
            setMotivosError('No se pudieron cargar los motivos.');
        } finally {
            setMotivosLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    useEffect(() => {
        if (activeTab === 'motivos') {
            loadMotivos();
        }
    }, [activeTab, loadMotivos]);

    /** Motivos activos de inventario que aplican al tipo elegido. */
    const motivosOptions = useMemo(
        () =>
            motivos
                // Los del sistema (Recepción, Salida por venta) los genera el
                // propio flujo de compras y ventas: no son motivos de ajuste.
                .filter(
                    (m) =>
                        m.activo !== false &&
                        m.tipo === form.tipo &&
                        !m.categoria_gasto &&
                        !m.es_sistema,
                )
                .map((m) => ({ value: m.nombre, label: m.nombre })),
        [motivos, form.tipo],
    );

    /** Stock (en unidad base) de cada producto en el almacén elegido. */
    const stockDelAlmacen = useMemo(() => {
        if (!form.almacen_id) return null;
        return existencias
            .filter((e) => String(e.almacen_id ?? e.almacen?.id) === String(form.almacen_id))
            .reduce((acc, e) => {
                acc[String(e.producto_id)] = Number(e.stock_actual) || 0;
                return acc;
            }, {});
    }, [existencias, form.almacen_id]);

    /**
     * Solo los productos que existen en el almacén elegido. En una salida además
     * se exige stock disponible: no se puede restar de lo que no hay.
     */
    /** Productos presentes en el almacén elegido. */
    const productosOptions = useMemo(() => {
        if (!stockDelAlmacen) return [];

        return productos
            .filter((p) => {
                // En una entrada vale cualquier producto del catálogo, aunque
                // nunca haya estado en este almacén: justamente se está
                // cargando por primera vez. En una salida sí se exige stock.
                if (form.tipo !== 'salida') return p.activo !== false;

                return (stockDelAlmacen[String(p.id)] ?? 0) > 0;
            })
            .map((p) => ({
                value: String(p.id),
                label: p.nombre,
                keywords: `${p.codigo ?? ''} ${p.codigo_barras ?? ''}`,
            }));
    }, [productos, stockDelAlmacen, form.tipo]);

    const productoDe = (productoId) =>
        productos.find((p) => String(p.id) === String(productoId)) ?? null;

    /**
     * Unidades derivadas de un producto con su factor de conversión y cuánto hay
     * disponible expresado en esa unidad. El stock se guarda en unidad base: sin
     * convertir se leería "1000" donde en realidad hay 2 paquetes de 500g.
     */
    const unidadesDe = useCallback(
        (productoId) => {
            const p = productoDe(productoId);
            if (!p) return [];

            const stockBase = stockDelAlmacen?.[String(p.id)] ?? 0;
            const abrev = p.unidad_medida?.abreviatura ?? '';

            return (Array.isArray(p.presentaciones) ? p.presentaciones : [])
                .filter((pres) => pres.activo !== false)
                .map((pres) => {
                    const factor = Number(pres.factor_conversion) || 1;
                    return {
                        value: String(pres.id),
                        label: `${pres.nombre} (x${num(factor)} ${abrev})`,
                        unidad: pres.nombre,
                        factor,
                        abrev,
                        stockBase,
                        disponible: Math.floor((stockBase / factor) * 100) / 100,
                    };
                });
        },
        [productos, stockDelAlmacen],
    );

    /** Unidad elegida en una línea, con su disponible ya convertido. */
    const unidadDe = (detalle) =>
        unidadesDe(detalle.producto_id).find(
            (u) => String(u.value) === String(detalle.producto_presentacion_id),
        ) ?? null;

    const setDetalle = (index, patch) => {
        setDetalles((prev) => prev.map((d, i) => (i === index ? { ...d, ...patch } : d)));
    };
    const addDetalle = () => setDetalles((prev) => [...prev, { ...emptyDetalle }]);
    const removeDetalle = (index) =>
        setDetalles((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)));

    const openCreate = () => {
        setEditing(null);
        setForm(emptyForm);
        setDetalles([{ ...emptyDetalle }]);
        setFormErrors({});
        setModalOpen(true);
    };

    const openEdit = (ajuste) => {
        setEditing(ajuste);
        setForm({
            almacen_id: String(ajuste.almacen_id ?? ajuste.almacen?.id ?? ''),
            tipo: ajuste.tipo ?? 'entrada',
            motivo: ajuste.motivo ?? '',
            estado: ajuste.estado ?? 'pendiente',
            observaciones: ajuste.observaciones ?? '',
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
                await api.put(`/ajustes/${editing.id}`, {
                    estado: form.estado,
                    observaciones: form.observaciones,
                });
                toast.success('Ajuste actualizado correctamente.');
            } else {
                const lineas = detalles.filter((d) => d.producto_presentacion_id && Number(d.cantidad) > 0);
                if (lineas.length === 0) {
                    setFormErrors((prev) => ({ ...prev, detalles: 'Agrega al menos un producto con cantidad.' }));
                    setSaving(false);
                    return;
                }

                // Se avisa antes de enviar: el backend rechazaría igual, pero el
                // mensaje aquí señala la línea concreta.
                if (form.tipo === 'salida') {
                    const excedida = lineas.find((d) => {
                        const op = unidadDe(d);
                        return op && Number(d.cantidad) > op.disponible;
                    });
                    if (excedida) {
                        const op = unidadDe(excedida);
                        const nombre = productoDe(excedida.producto_id)?.nombre ?? 'El producto';
                        setFormErrors((prev) => ({
                            ...prev,
                            detalles: `"${nombre} — ${op.unidad}" solo tiene ${num(op.disponible)} disponibles.`,
                        }));
                        setSaving(false);
                        return;
                    }
                }
                await api.post('/ajustes', {
                    almacen_id: form.almacen_id,
                    proveedor_id: form.proveedor_id || null,
                    tipo: form.tipo,
                    motivo: form.motivo,
                    observaciones: form.observaciones,
                    detalles: lineas.map((d) => ({
                        producto_presentacion_id: d.producto_presentacion_id,
                        cantidad: d.cantidad,
                    })),
                });
                toast.success('Ajuste creado y stock actualizado.');
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
                toast.error('No se pudo guardar el ajuste.');
            }
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        setDeleting(true);
        try {
            await api.delete(`/ajustes/${deleteTarget.id}`);
            toast.success('Ajuste eliminado.');
            setDeleteTarget(null);
            await load();
        } catch {
            toast.error('No se pudo eliminar el ajuste.');
        } finally {
            setDeleting(false);
        }
    };

    const openMotivoCreate = () => {
        setEditingMotivo(null);
        setMotivoForm(emptyMotivoForm);
        setMotivoFormErrors({});
        setMotivoModalOpen(true);
    };

    const openMotivoEdit = (motivo) => {
        setEditingMotivo(motivo);
        setMotivoForm({
            nombre: motivo.nombre ?? '',
            tipo: motivo.tipo ?? 'entrada',
            activo: motivo.activo ?? true,
        });
        setMotivoFormErrors({});
        setMotivoModalOpen(true);
    };

    const handleMotivoSubmit = async (e) => {
        e.preventDefault();
        setMotivoSaving(true);
        setMotivoFormErrors({});

        try {
            const payload = {
                nombre: motivoForm.nombre,
                tipo: motivoForm.tipo,
                activo: motivoForm.activo,
                // Los motivos de esta pantalla son de inventario, no de caja.
                ambito: 'inventario',
            };
            if (editingMotivo) {
                await api.put(`/motivos-movimiento/${editingMotivo.id}`, payload);
                toast.success('Motivo actualizado correctamente.');
            } else {
                await api.post('/motivos-movimiento', payload);
                toast.success('Motivo creado correctamente.');
            }
            setMotivoModalOpen(false);
            await loadMotivos();
        } catch (err) {
            if (err.response?.status === 422 && err.response.data?.errors) {
                const validation = err.response.data.errors;
                setMotivoFormErrors(
                    Object.fromEntries(Object.entries(validation).map(([k, v]) => [k, v[0]])),
                );
            } else {
                toast.error(err.response?.data?.message ?? 'No se pudo guardar el motivo.');
            }
        } finally {
            setMotivoSaving(false);
        }
    };

    const handleMotivoDelete = async () => {
        setMotivoDeleting(true);
        try {
            await api.delete(`/motivos-movimiento/${motivoDeleteTarget.id}`);
            toast.success('Motivo eliminado.');
            setMotivoDeleteTarget(null);
            await loadMotivos();
        } catch (err) {
            toast.error(err.response?.data?.message ?? 'No se pudo eliminar el motivo.');
        } finally {
            setMotivoDeleting(false);
        }
    };

    const applyFilters = () => {
        const next = {};
        if (filterEstado) next.estado = filterEstado;
        if (filterTipo) next.tipo = filterTipo;
        setActiveFilters(next);
    };

    const clearFilters = () => {
        setFilterEstado('');
        setFilterTipo('');
        setActiveFilters({});
    };

    const filtered = ajustes.filter((a) => {
        if (activeFilters.estado && a.estado !== activeFilters.estado) return false;
        if (activeFilters.tipo && a.tipo !== activeFilters.tipo) return false;
        return true;
    });

    const applyMotivoFilters = () => {
        const next = {};
        if (motivoFilterTipo) next.tipo = motivoFilterTipo;
        if (motivoFilterEstado) next.activo = motivoFilterEstado;
        setMotivoActiveFilters(next);
    };

    const clearMotivoFilters = () => {
        setMotivoFilterTipo('');
        setMotivoFilterEstado('');
        setMotivoActiveFilters({});
    };

    const filteredMotivos = motivos.filter((m) => {
        if (motivoActiveFilters.tipo && m.tipo !== motivoActiveFilters.tipo) return false;
        if (motivoActiveFilters.activo === '1' && !m.activo) return false;
        if (motivoActiveFilters.activo === '0' && m.activo) return false;
        return true;
    });

    const filterCount = Object.keys(activeFilters).length;
    const motivoFilterCount = Object.keys(motivoActiveFilters).length;

    const filters = (
        <div className="flex flex-wrap items-end gap-3">
            <Select
                label="Estado"
                value={filterEstado}
                onChange={(e) => setFilterEstado(e.target.value)}
                options={[
                    { value: '', label: 'Todos' },
                    { value: 'pendiente', label: 'Pendiente' },
                    { value: 'aprobado', label: 'Aprobado' },
                    { value: 'rechazado', label: 'Rechazado' },
                ]}
                className="w-40"
            />
            <Select
                label="Tipo"
                value={filterTipo}
                onChange={(e) => setFilterTipo(e.target.value)}
                options={[
                    { value: '', label: 'Todos' },
                    { value: 'entrada', label: 'Entrada' },
                    { value: 'salida', label: 'Salida' },
                ]}
                className="w-40"
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

    const motivoFilters = (
        <div className="flex flex-wrap items-end gap-3">
            <Select
                label="Tipo"
                value={motivoFilterTipo}
                onChange={(e) => setMotivoFilterTipo(e.target.value)}
                options={[
                    { value: '', label: 'Todos' },
                    { value: 'entrada', label: 'Entrada' },
                    { value: 'salida', label: 'Salida' },
                ]}
                className="w-40"
            />
            <Select
                label="Estado"
                value={motivoFilterEstado}
                onChange={(e) => setMotivoFilterEstado(e.target.value)}
                options={[
                    { value: '', label: 'Todos' },
                    { value: '1', label: 'Activos' },
                    { value: '0', label: 'Inactivos' },
                ]}
                className="w-40"
            />
            <Button variant="primary" size="sm" onClick={applyMotivoFilters}>
                Aplicar
            </Button>
            {motivoFilterCount > 0 && (
                <Button variant="ghost" size="sm" onClick={clearMotivoFilters}>
                    Limpiar
                </Button>
            )}
        </div>
    );

    const detalleSeleccionado = seleccionado?.detalles ?? [];

    const columns = [
        {
            key: 'idx',
            label: '#',
            width: '56px',
            render: (row) => <span className="text-warm-500">{ajustes.indexOf(row) + 1}</span>,
        },
        {
            key: 'fecha',
            label: 'Fecha',
            width: '100px',
            render: (row) =>
                row.fecha ? (
                    <span className="text-gray-700">{new Date(row.fecha).toLocaleDateString('es-PE')}</span>
                ) : (
                    <span className="text-gray-400">—</span>
                ),
        },
        {
            key: 'documento',
            label: 'Número',
            width: '110px',
            getSearchValue: (row) => row.documento,
            render: (row) => (
                <span className="font-semibold text-warm-900">{row.documento ?? `#${row.id}`}</span>
            ),
        },
        {
            key: 'almacen',
            label: 'Almacén',
            width: '150px',
            getSearchValue: (row) => row.almacen?.nombre,
            render: (row) => (
                <span className="flex items-center gap-2 font-medium text-warm-900">
                    <Scale className="h-4 w-4 shrink-0 text-primary-600" />
                    <span className="truncate">{row.almacen?.nombre ?? '—'}</span>
                </span>
            ),
        },
        {
            key: 'proveedor',
            label: 'Proveedor',
            width: '150px',
            getSearchValue: (row) => row.proveedor?.nombre,
            render: (row) => (
                <span className="block truncate text-warm-500" title={row.proveedor?.nombre ?? ''}>
                    {row.proveedor?.nombre ?? '—'}
                </span>
            ),
        },
        {
            key: 'motivo',
            label: 'Motivo',
            width: '150px',
            render: (row) => (
                <span className="block truncate" title={row.motivo ?? ''}>
                    {row.motivo ?? <span className="text-gray-400">—</span>}
                </span>
            ),
        },
        {
            key: 'observaciones',
            label: 'Observación',
            width: '160px',
            render: (row) => (
                <span className="block truncate text-warm-500" title={row.observaciones ?? ''}>
                    {row.observaciones ?? '—'}
                </span>
            ),
        },
        {
            key: 'registra',
            label: 'Registra',
            width: '130px',
            getSearchValue: (row) => row.usuario_solicita?.name,
            render: (row) => (
                <span className="block truncate">{row.usuario_solicita?.name ?? '—'}</span>
            ),
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
            key: 'tipo',
            label: 'T. Ingreso',
            width: '110px',
            render: (row) => {
                const info = tipoInfo[row.tipo] ?? { label: row.tipo ?? '—', variant: 'gray' };
                const Icon = info.icon;
                return (
                    <Badge variant={info.variant}>
                        {Icon && <Icon className="mr-1 h-3 w-3" />}
                        {info.label}
                    </Badge>
                );
            },
        },
        {
            key: 'total',
            label: 'Total',
            width: '110px',
            align: 'right',
            searchable: false,
            render: (row) => (
                <span className="font-semibold text-primary-600">{money(row.total)}</span>
            ),
        },
        {
            type: 'actions',
            key: 'actions',
            label: 'Acciones',
            width: '110px',
            actions: (row) => (
                <>
                    <button aria-label="Imprimir" title="Imprimir / PDF"
                        onClick={(e) => { e.stopPropagation(); setPdfTarget(row); }}
                        className="rounded-md p-1.5 text-warm-600 transition hover:bg-gray-100 hover:text-warm-900">
                        <Printer className="h-4 w-4" />
                    </button>

                    <button
                        aria-label="Editar"
                        onClick={(e) => {
                            e.stopPropagation();
                            openEdit(row);
                        }}
                        className="rounded-md p-1.5 text-primary-600 transition hover:bg-primary-50 hover:text-primary-700"
                    >
                        <Edit className="h-4 w-4" />
                    </button>
                    <button
                        aria-label="Eliminar"
                        onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTarget(row);
                        }}
                        className="rounded-md p-1.5 text-red-600 transition hover:bg-red-50 hover:text-red-700"
                    >
                        <Trash2 className="h-4 w-4" />
                    </button>
                </>
            ),
        },
    ];

    const motivoColumns = [
        {
            key: 'id',
            label: '#',
            render: (row) => <Badge variant="blue">#{String(row.id).padStart(3, '0')}</Badge>,
        },
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
        {
            key: 'tipo',
            label: 'Tipo',
            render: (row) => {
                const info = tipoInfo[row.tipo] ?? { label: row.tipo ?? '—', variant: 'gray' };
                const Icon = info.icon;
                return (
                    <Badge variant={info.variant}>
                        {Icon && <Icon className="mr-1 h-3 w-3" />}
                        {info.label}
                    </Badge>
                );
            },
        },
        {
            key: 'es_sistema',
            label: 'Origen',
            render: (row) =>
                row.es_sistema ? (
                    <Badge variant="blue">
                        <Lock className="mr-1 h-3 w-3" /> Sistema
                    </Badge>
                ) : (
                    <Badge variant="gray">Manual</Badge>
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
            actions: (row) =>
                row.es_sistema ? (
                    <span
                        className="inline-flex items-center gap-1 text-xs text-gray-400"
                        title="Los motivos del sistema no se pueden editar ni eliminar"
                    >
                        <Lock className="h-3.5 w-3.5" /> Fijo
                    </span>
                ) : (
                    <>
                        <button
                            aria-label="Editar"
                            onClick={() => openMotivoEdit(row)}
                            className="rounded-md p-1.5 text-primary-600 transition hover:bg-primary-50 hover:text-primary-700"
                        >
                            <Edit className="h-4 w-4" />
                        </button>
                        <button
                            aria-label="Eliminar"
                            onClick={() => setMotivoDeleteTarget(row)}
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
                title="Ajustes"
                description={
                    activeTab === 'ajustes'
                        ? 'Corrige diferencias de stock con entradas o salidas manuales'
                        : 'Administra los motivos de los movimientos de inventario'
                }
                actions={
                    activeTab === 'ajustes' ? (
                        <CreateButton onClick={openCreate}>Nuevo ajuste</CreateButton>
                    ) : (
                        <CreateButton onClick={openMotivoCreate}>Nuevo motivo</CreateButton>
                    )
                }
            />

            <Tabs
                items={[
                    { key: 'ajustes', label: 'Ajustes' },
                    { key: 'motivos', label: 'Motivos' },
                ]}
                value={activeTab}
                onChange={setActiveTab}
                className="mb-4"
            />

            {activeTab === 'ajustes' ? (
                <>
                    {error && <Alert variant="error" className="mb-4">{error}</Alert>}

                    <DataTable
                        columns={columns}
                        rows={filtered}
                        loading={loading}
                        searchPlaceholder="Buscar ajustes..."
                        filterable
                        filters={filters}
                        filterCount={filterCount}
                        onRowClick={(row) => setSeleccionado(row)}
                        rowClassName={(row) => (row.id === seleccionado?.id ? 'bg-primary-50' : undefined)}
                    />

                    {/* Detalle del ajuste seleccionado */}
                    <div className="mt-6 rounded-xl border border-edge bg-white shadow-sm">
                        <div className="flex items-center justify-between border-b border-edge px-5 py-3">
                            <h2 className="text-sm font-semibold text-warm-900">
                                Detalle {seleccionado?.documento ? `de ${seleccionado.documento}` : ''}
                            </h2>
                            {seleccionado && (
                                <span className="text-xs text-warm-500">
                                    {detalleSeleccionado.length}{' '}
                                    {detalleSeleccionado.length === 1 ? 'producto' : 'productos'} ·{' '}
                                    <span className="font-semibold text-primary-600">
                                        {money(seleccionado.total)}
                                    </span>
                                </span>
                            )}
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[820px] text-sm">
                                <thead>
                                    <tr className="bg-primary-600 text-left text-xs font-semibold uppercase tracking-wide text-white">
                                        <th className="w-12 px-3 py-2.5 text-center">#</th>
                                        <th className="w-28 px-3 py-2.5">Código</th>
                                        <th className="px-3 py-2.5">Descripción</th>
                                        <th className="w-32 px-3 py-2.5">Marca</th>
                                        <th className="w-24 px-3 py-2.5 text-right">Cantidad</th>
                                        <th className="w-32 px-3 py-2.5">U. Medida</th>
                                        <th className="w-28 px-3 py-2.5 text-right">Costo</th>
                                        <th className="w-28 px-3 py-2.5 text-right">Total</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {detalleSeleccionado.length === 0 && (
                                        <tr>
                                            <td colSpan={8} className="px-3 py-10 text-center text-sm text-warm-500">
                                                {seleccionado
                                                    ? 'Este ajuste no tiene productos.'
                                                    : 'Selecciona un ajuste arriba para ver su detalle.'}
                                            </td>
                                        </tr>
                                    )}

                                    {detalleSeleccionado.map((d, i) => {
                                        const producto = d.presentacion?.producto;
                                        return (
                                            <tr key={d.id}>
                                                <td className="px-3 py-2 text-center text-warm-500">{i + 1}</td>
                                                <td className="px-3 py-2 text-warm-500">{producto?.codigo ?? '—'}</td>
                                                <td className="px-3 py-2 font-semibold text-warm-900">
                                                    {producto?.nombre ?? '—'}
                                                </td>
                                                <td className="px-3 py-2 text-warm-500">
                                                    {producto?.marca?.nombre ?? '—'}
                                                </td>
                                                <td className="px-3 py-2 text-right font-medium text-warm-900">
                                                    {num(d.cantidad)}
                                                </td>
                                                <td className="px-3 py-2 text-warm-500">
                                                    {d.presentacion?.nombre ?? '—'}
                                                </td>
                                                <td className="px-3 py-2 text-right text-warm-900">
                                                    {money(d.costo_unitario)}
                                                </td>
                                                <td className="px-3 py-2 text-right font-semibold text-primary-600">
                                                    {money(d.subtotal)}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            ) : (
                <>
                    {motivosError && <Alert variant="error" className="mb-4">{motivosError}</Alert>}

                    <DataTable
                        columns={motivoColumns}
                        rows={filteredMotivos}
                        loading={motivosLoading}
                        searchPlaceholder="Buscar motivos..."
                        filterable
                        filters={motivoFilters}
                        filterCount={motivoFilterCount}
                    />
                </>
            )}

            {/* Modal crear/editar ajuste */}
            <Modal
                open={modalOpen}
                onClose={() => setModalOpen(false)}
                title={editing ? 'Editar ajuste' : 'Nuevo ajuste'}
                description={
                    editing
                        ? `Actualiza el estado del ajuste #${editing.id}`
                        : 'Corrige el stock de un almacén: la cantidad se indica en la unidad del producto'
                }
                size={editing ? 'md' : '2xl'}
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setModalOpen(false)}>
                            Cancelar
                        </Button>
                        <Button type="submit" form="ajuste-form" loading={saving}>
                            {editing ? 'Guardar cambios' : 'Crear ajuste'}
                        </Button>
                    </>
                }
            >
                <form id="ajuste-form" onSubmit={handleSubmit} className="space-y-4" noValidate>
                    {editing ? (
                        <Select
                            label="Estado"
                            name="estado"
                            value={form.estado}
                            onChange={(e) => setForm((prev) => ({ ...prev, estado: e.target.value }))}
                            options={Object.entries(estadoInfo).map(([value, info]) => ({
                                value,
                                label: info.label,
                            }))}
                            error={formErrors.estado}
                        />
                    ) : (
                        <>
                            <Select
                                label="Almacén"
                                name="almacen_id"
                                value={form.almacen_id}
                                // Cambiar de almacén invalida los productos ya elegidos.
                                onChange={(e) => {
                                    setForm((prev) => ({ ...prev, almacen_id: e.target.value }));
                                    setDetalles([{ ...emptyDetalle }]);
                                }}
                                options={[
                                    { value: '', label: 'Seleccione un almacén' },
                                    ...opcionesAlmacen(almacenes, form.almacen_id),
                                ]}
                                error={formErrors.almacen_id}
                            />
                            <SearchSelect
                                label="Proveedor (opcional)"
                                value={form.proveedor_id}
                                onChange={(v) => setForm((prev) => ({ ...prev, proveedor_id: v }))}
                                options={proveedores.map((p) => ({ value: String(p.id), label: p.nombre }))}
                                placeholder="Sin proveedor"
                                emptyText="Sin coincidencias"
                            />
                            <Select
                                label="Tipo"
                                name="tipo"
                                value={form.tipo}
                                // El tipo cambia qué productos y motivos aplican.
                                onChange={(e) => {
                                    setForm((prev) => ({ ...prev, tipo: e.target.value, motivo: '' }));
                                    setDetalles([{ ...emptyDetalle }]);
                                }}
                                options={[
                                    { value: 'entrada', label: 'Entrada' },
                                    { value: 'salida', label: 'Salida' },
                                ]}
                                error={formErrors.tipo}
                            />
                            <Select
                                label="Motivo"
                                name="motivo"
                                value={form.motivo}
                                onChange={(e) => {
                                    setForm((prev) => ({ ...prev, motivo: e.target.value }));
                                    if (formErrors.motivo) {
                                        setFormErrors((prev) => ({ ...prev, motivo: undefined }));
                                    }
                                }}
                                options={[{ value: '', label: 'Seleccione un motivo' }, ...motivosOptions]}
                                error={formErrors.motivo}
                            />

                            <div>
                                <div className="mb-2 flex items-center justify-between">
                                    <span className="text-sm font-medium text-gray-700">
                                        Productos ({form.tipo === 'salida' ? 'a restar' : 'a sumar'})
                                    </span>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={addDetalle}
                                        disabled={!form.almacen_id}
                                    >
                                        <Plus className="h-4 w-4" />
                                        Agregar línea
                                    </Button>
                                </div>

                                {!form.almacen_id ? (
                                    <Alert variant="info">
                                        Elige un almacén para ver sus productos disponibles.
                                    </Alert>
                                ) : productosOptions.length === 0 ? (
                                    <Alert variant="warning">
                                        {form.tipo === 'salida'
                                            ? 'Este almacén no tiene productos con stock para restar.'
                                            : 'Este almacén no tiene productos registrados.'}
                                    </Alert>
                                ) : (
                                    <div className="overflow-x-auto rounded-lg border border-edge">
                                        <table className="w-full min-w-[760px] text-sm">
                                            <thead>
                                                <tr className="bg-primary-600 text-left text-xs font-semibold uppercase tracking-wide text-white">
                                                    <th className="px-3 py-2.5">Producto</th>
                                                    <th className="w-48 px-3 py-2.5">Unidad derivada</th>
                                                    <th className="w-32 px-3 py-2.5 text-right">Disponible</th>
                                                    <th className="w-28 px-3 py-2.5 text-right">Cantidad</th>
                                                    <th className="w-14 px-3 py-2.5" />
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100">
                                                {detalles.map((d, index) => {
                                                    const unidades = unidadesDe(d.producto_id);
                                                    const op = unidadDe(d);
                                                    // En una salida no se puede pedir más de lo que hay.
                                                    const excede =
                                                        form.tipo === 'salida' &&
                                                        op &&
                                                        Number(d.cantidad) > op.disponible;

                                                    return (
                                                        <tr key={index}>
                                                            <td className="px-3 py-2">
                                                                <SearchSelect
                                                                    value={d.producto_id}
                                                                    onChange={(v) => {
                                                                        // Si solo hay una unidad, se elige sola.
                                                                        const us = unidadesDe(v);
                                                                        setDetalle(index, {
                                                                            producto_id: v,
                                                                            producto_presentacion_id:
                                                                                us.length === 1 ? us[0].value : '',
                                                                        });
                                                                        if (formErrors.detalles) {
                                                                            setFormErrors((prev) => ({
                                                                                ...prev,
                                                                                detalles: undefined,
                                                                            }));
                                                                        }
                                                                    }}
                                                                    options={productosOptions}
                                                                    placeholder="Buscar producto…"
                                                                    emptyText="Sin coincidencias"
                                                                />
                                                            </td>
                                                            <td className="px-3 py-2">
                                                                <Select
                                                                    value={d.producto_presentacion_id}
                                                                    disabled={!d.producto_id}
                                                                    onChange={(e) =>
                                                                        setDetalle(index, {
                                                                            producto_presentacion_id: e.target.value,
                                                                        })
                                                                    }
                                                                    aria-label="Unidad derivada"
                                                                    options={[
                                                                        {
                                                                            value: '',
                                                                            label: d.producto_id ? 'Unidad…' : '—',
                                                                        },
                                                                        ...unidades,
                                                                    ]}
                                                                />
                                                            </td>
                                                            <td className="px-3 py-2 text-right">
                                                                {op ? (
                                                                    <div className="leading-tight">
                                                                        <div className="font-semibold text-warm-900">
                                                                            {num(op.disponible)} {op.unidad}
                                                                        </div>
                                                                        <div className="text-xs text-warm-500">
                                                                            {num(op.stockBase)} {op.abrev}
                                                                        </div>
                                                                    </div>
                                                                ) : (
                                                                    <span className="text-warm-500">—</span>
                                                                )}
                                                            </td>
                                                            <td className="px-3 py-2">
                                                                <Input
                                                                    type="number"
                                                                    min="0"
                                                                    step="any"
                                                                    placeholder="0"
                                                                    value={d.cantidad}
                                                                    onChange={(e) =>
                                                                        setDetalle(index, { cantidad: e.target.value })
                                                                    }
                                                                    error={excede ? 'Supera el stock' : undefined}
                                                                    className="text-right"
                                                                />
                                                            </td>
                                                            <td className="px-3 py-2 text-center">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => removeDetalle(index)}
                                                                    disabled={detalles.length === 1}
                                                                    aria-label="Quitar"
                                                                    className="rounded-md p-1.5 text-red-600 transition hover:bg-red-50 disabled:opacity-40"
                                                                >
                                                                    <Trash2 className="h-4 w-4" />
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}

                                {formErrors.detalles && (
                                    <p className="mt-1 text-xs text-red-600">{formErrors.detalles}</p>
                                )}
                            </div>
                        </>
                    )}
                    <Input
                        label="Observaciones"
                        name="observaciones"
                        placeholder="Opcional"
                        value={form.observaciones}
                        onChange={(e) => setForm((prev) => ({ ...prev, observaciones: e.target.value }))}
                    />
                </form>
            </Modal>

            {/* Modal eliminar ajuste */}
            <Modal
                open={Boolean(deleteTarget)}
                onClose={() => setDeleteTarget(null)}
                title="Eliminar ajuste"
                description={`¿Seguro que deseas eliminar el ajuste #${deleteTarget?.id}?`}
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
                    El ajuste se eliminará de forma permanente.
                </Alert>
            </Modal>

            {/* Modal crear/editar motivo */}
            <Modal
                open={motivoModalOpen}
                onClose={() => setMotivoModalOpen(false)}
                title={editingMotivo ? 'Editar motivo' : 'Nuevo motivo'}
                description={
                    editingMotivo
                        ? `Actualiza el motivo #${editingMotivo.id}`
                        : 'Agrega un motivo para los movimientos de inventario'
                }
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setMotivoModalOpen(false)}>
                            Cancelar
                        </Button>
                        <Button type="submit" form="motivo-form" loading={motivoSaving}>
                            {editingMotivo ? 'Guardar cambios' : 'Crear motivo'}
                        </Button>
                    </>
                }
            >
                <form id="motivo-form" onSubmit={handleMotivoSubmit} className="space-y-4" noValidate>
                    <Input
                        label="Nombre"
                        name="nombre"
                        placeholder="Ej: Entrada por compra"
                        value={motivoForm.nombre}
                        onChange={(e) => {
                            setMotivoForm((prev) => ({ ...prev, nombre: e.target.value }));
                            if (motivoFormErrors.nombre) {
                                setMotivoFormErrors((prev) => ({ ...prev, nombre: undefined }));
                            }
                        }}
                        error={motivoFormErrors.nombre}
                    />
                    <Select
                        label="Tipo"
                        name="tipo"
                        value={motivoForm.tipo}
                        onChange={(e) => setMotivoForm((prev) => ({ ...prev, tipo: e.target.value }))}
                        options={[
                            { value: 'entrada', label: 'Entrada' },
                            { value: 'salida', label: 'Salida' },
                        ]}
                        error={motivoFormErrors.tipo}
                    />
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                        <input
                            type="checkbox"
                            checked={motivoForm.activo}
                            onChange={(e) =>
                                setMotivoForm((prev) => ({ ...prev, activo: e.target.checked }))
                            }
                            className="h-4 w-4 rounded border-gray-300 accent-primary-600"
                        />
                        <BadgeCheck className="h-4 w-4 text-primary-600" />
                        Motivo activo
                    </label>
                </form>
            </Modal>

            {/* Modal eliminar motivo */}
            <Modal
                open={Boolean(motivoDeleteTarget)}
                onClose={() => setMotivoDeleteTarget(null)}
                title="Eliminar motivo"
                description={`¿Seguro que deseas eliminar el motivo "${motivoDeleteTarget?.nombre}"?`}
                size="sm"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setMotivoDeleteTarget(null)}>
                            Cancelar
                        </Button>
                        <Button variant="danger" loading={motivoDeleting} onClick={handleMotivoDelete}>
                            Eliminar
                        </Button>
                    </>
                }
            >
                <Alert variant="warning">
                    El motivo se eliminará de forma permanente.
                </Alert>
            </Modal>
                    <PdfViewerModal
                open={Boolean(pdfTarget)}
                onClose={() => setPdfTarget(null)}
                tipo="ajuste"
                id={pdfTarget?.id}
                nombre={pdfTarget?.documento}
                titulo="Ajuste de inventario"
                formatos={['a4', 'ticket']}
            />
        </Layout>
    );
}
