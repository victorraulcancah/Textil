import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Edit, HandCoins, Handshake, Plus, Printer, Trash2, Undo2 } from 'lucide-react';
import api, { asList } from '../lib/api';
import { opcionesAlmacen } from '../lib/almacenes';
import { useToast } from '../lib/toast';
import Layout from '../components/Layout';
import BottomSheet from '../components/ui/BottomSheet';
import DetalleCard from '../components/ui/DetalleCard';
import PageHeader, { CreateButton } from '../components/PageHeader';
import PdfViewerModal from '../components/PdfViewerModal';
import ActionsMenu from '../components/ActionsMenu';
import ProductoPickerModal from '../components/ProductoPickerModal';
import { Alert, Badge, Button, DataTable, Input, Modal, SearchSelect, Select, Tabs } from '../components/ui';

const hoy = () => new Date().toISOString().slice(0, 10);

const emptyForm = {
    tipo: 'prestado',
    tercero: '',
    tercero_documento: '',
    tercero_telefono: '',
    almacen_id: '',
    fecha_prestamo: hoy(),
    fecha_devolucion_esperada: '',
    observaciones: '',
};

const panelVacio = { producto_id: '', producto_presentacion_id: '', cantidad: '1' };

const estadoInfo = {
    prestado: { label: 'Prestado', variant: 'blue' },
    parcial: { label: 'Parcial', variant: 'amber' },
    devuelto: { label: 'Devuelto', variant: 'green' },
};

const num = (n) => new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 }).format(Number(n) || 0);
const fecha = (f) => (f ? new Date(String(f).length === 10 ? `${f}T00:00:00` : f).toLocaleDateString('es-PE') : '—');
/** Devolución esperada ya pasada y aún con saldo. */
const vencido = (row) => row.estado !== 'devuelto' && row.fecha_devolucion_esperada && String(row.fecha_devolucion_esperada).slice(0, 10) < hoy();

export default function Prestamos() {
    const toast = useToast();
    const [tab, setTab] = useState('prestado');

    const [prestamos, setPrestamos] = useState([]);
    const [almacenes, setAlmacenes] = useState([]);
    const [productos, setProductos] = useState([]);
    const [existencias, setExistencias] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState(emptyForm);
    const [panel, setPanel] = useState({ ...panelVacio });
    const [items, setItems] = useState([]);
    const [formErrors, setFormErrors] = useState({});
    const [saving, setSaving] = useState(false);
    const [picker, setPicker] = useState({ open: false, query: '' });

    const [deleteTarget, setDeleteTarget] = useState(null);
    const [pdfTarget, setPdfTarget] = useState(null);
    const [deleting, setDeleting] = useState(false);

    /** Préstamo del modal de devolución + cantidades a devolver por presentación. */
    const [devTarget, setDevTarget] = useState(null);
    const [devCant, setDevCant] = useState({});
    const [savingDev, setSavingDev] = useState(false);

    /** Préstamo cuyo detalle se muestra en la segunda tabla. */
    const [seleccionado, setSeleccionado] = useState(null);

    const [filterEstado, setFilterEstado] = useState('');
    const [filterAlmacen, setFilterAlmacen] = useState('');
    const [activeFilters, setActiveFilters] = useState({});

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [presRes, almRes, prodRes, existRes] = await Promise.all([
                api.get('/prestamos'),
                api.get('/almacenes'),
                api.get('/productos', { params: { per_page: 500 } }),
                api.get('/existencias'),
            ]);
            const lista = asList(presRes);
            setPrestamos(lista);
            setSeleccionado((prev) => lista.find((p) => p.id === prev?.id) ?? null);
            setAlmacenes(asList(almRes));
            setProductos(asList(prodRes));
            setExistencias(asList(existRes));
        } catch {
            setError('No se pudieron cargar los préstamos.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    // Al cambiar de pestaña, el detalle muestra el primero de esa pestaña.
    useEffect(() => {
        setSeleccionado((prev) => (prev?.tipo === tab ? prev : prestamos.find((p) => p.tipo === tab) ?? null));
    }, [tab, prestamos]);

    const esPrestado = form.tipo === 'prestado';

    // ── Stock del almacén elegido (unidad base). Solo limita cuando la tienda presta. ──
    const stockAlmacen = useMemo(() => {
        if (!form.almacen_id) return {};
        return existencias
            .filter((e) => String(e.almacen_id) === String(form.almacen_id))
            .reduce((acc, e) => {
                acc[String(e.producto_id)] = Number(e.stock_actual) || 0;
                return acc;
            }, {});
    }, [existencias, form.almacen_id]);

    const productoDe = useCallback((id) => productos.find((p) => String(p.id) === String(id)) ?? null, [productos]);

    const productosDisponibles = useMemo(
        () => (esPrestado ? productos.filter((p) => (stockAlmacen[String(p.id)] ?? 0) > 0) : productos),
        [productos, stockAlmacen, esPrestado],
    );

    const productosOptions = useMemo(
        () => productosDisponibles.map((p) => ({ value: String(p.id), label: p.nombre, keywords: `${p.codigo ?? ''} ${p.codigo_barras ?? ''}` })),
        [productosDisponibles],
    );

    /** Unidades del producto; con "presté" incluye el disponible convertido. */
    const unidadesDe = useCallback(
        (productoId) => {
            const p = productoDe(productoId);
            if (!p) return [];
            const base = stockAlmacen[String(p.id)] ?? 0;
            return (p.presentaciones ?? [])
                .filter((pres) => pres.activo !== false)
                .map((pres) => {
                    const factor = Number(pres.factor_conversion) || 1;
                    return { value: String(pres.id), label: pres.nombre, disponible: Math.floor((base / factor) * 100) / 100 };
                });
        },
        [productoDe, stockAlmacen],
    );

    const disponibleDe = (productoId, presId) => unidadesDe(productoId).find((u) => u.value === String(presId))?.disponible ?? 0;

    const setField = (name, value) => {
        setForm((prev) => ({ ...prev, [name]: value }));
        if (formErrors[name]) setFormErrors((prev) => ({ ...prev, [name]: undefined }));
    };

    // ── Panel de alta de artículos ──
    const elegirProducto = (productoId) => {
        const us = unidadesDe(productoId);
        setPanel({ producto_id: productoId, producto_presentacion_id: us.length === 1 ? us[0].value : '', cantidad: '1' });
    };

    const agregarProducto = () => {
        if (!form.almacen_id) return toast.error('Elige primero el almacén.');
        if (!panel.producto_id) return toast.error('Busca y elige un producto.');
        if (!panel.producto_presentacion_id) return toast.error('Elige la unidad.');
        const cant = Number(panel.cantidad) || 0;
        if (cant <= 0) return toast.error('La cantidad debe ser mayor a 0.');
        if (esPrestado) {
            const disp = disponibleDe(panel.producto_id, panel.producto_presentacion_id);
            if (cant > disp) return toast.error(`Solo hay ${num(disp)} disponibles en el almacén.`);
        }
        setItems((prev) => {
            const i = prev.findIndex((it) => it.producto_presentacion_id === panel.producto_presentacion_id);
            if (i !== -1) return prev.map((it, idx) => (idx === i ? { ...it, cantidad: String((Number(it.cantidad) || 0) + cant) } : it));
            return [...prev, { producto_id: panel.producto_id, producto_presentacion_id: panel.producto_presentacion_id, cantidad: String(cant) }];
        });
        setPanel({ ...panelVacio });
    };

    const agregarDesdePicker = (seleccionados) => {
        const utiles = seleccionados.filter((sel) => sel.presentacion && sel.cantidad > 0);
        if (utiles.length === 0) return;
        setItems((prev) => {
            const next = [...prev];
            utiles.forEach(({ producto, presentacion, cantidad }) => {
                const i = next.findIndex((it) => it.producto_presentacion_id === String(presentacion.id));
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

    // ── Crear / editar ──
    const openCreate = () => {
        setEditing(null);
        setForm({ ...emptyForm, tipo: tab, fecha_prestamo: hoy() });
        setPanel({ ...panelVacio });
        setItems([]);
        setFormErrors({});
        setModalOpen(true);
    };

    const openEdit = (p) => {
        setEditing(p);
        setForm({
            ...emptyForm,
            tipo: p.tipo ?? 'prestado',
            tercero: p.tercero ?? '',
            tercero_documento: p.tercero_documento ?? '',
            tercero_telefono: p.tercero_telefono ?? '',
            almacen_id: String(p.almacen_id ?? p.almacen?.id ?? ''),
            fecha_prestamo: p.fecha_prestamo ? String(p.fecha_prestamo).slice(0, 10) : '',
            fecha_devolucion_esperada: p.fecha_devolucion_esperada ? String(p.fecha_devolucion_esperada).slice(0, 10) : '',
            observaciones: p.observaciones ?? '',
        });
        setFormErrors({});
        setModalOpen(true);
    };

    /** Con devoluciones registradas ya no se corrigen los datos del tercero. */
    const terceroBloqueado = Boolean(editing) && (editing.devoluciones?.length ?? 0) > 0;

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        setFormErrors({});

        const errors = {};
        if (!form.tercero.trim()) errors.tercero = 'Indica con quién se realiza el préstamo';
        if (!editing && !form.almacen_id) errors.almacen_id = 'Selecciona un almacén';
        if (!editing && items.length === 0) errors.detalles = 'Agrega al menos un artículo';
        if (!editing && esPrestado) {
            const excedido = items.find((it) => Number(it.cantidad) > disponibleDe(it.producto_id, it.producto_presentacion_id));
            if (excedido) errors.detalles = `"${productoDe(excedido.producto_id)?.nombre}" supera el stock del almacén.`;
        }
        if (Object.keys(errors).length > 0) {
            setFormErrors(errors);
            setSaving(false);
            return;
        }

        try {
            if (editing) {
                await api.put(`/prestamos/${editing.id}`, {
                    ...(terceroBloqueado ? {} : {
                        tercero: form.tercero.trim(),
                        tercero_documento: form.tercero_documento || null,
                        tercero_telefono: form.tercero_telefono || null,
                    }),
                    fecha_devolucion_esperada: form.fecha_devolucion_esperada || null,
                    observaciones: form.observaciones,
                });
                toast.success('Préstamo actualizado.');
            } else {
                await api.post('/prestamos', {
                    tipo: form.tipo,
                    tercero: form.tercero.trim(),
                    tercero_documento: form.tercero_documento || null,
                    tercero_telefono: form.tercero_telefono || null,
                    almacen_id: form.almacen_id,
                    fecha_prestamo: form.fecha_prestamo,
                    fecha_devolucion_esperada: form.fecha_devolucion_esperada || null,
                    observaciones: form.observaciones,
                    detalles: items.map((it) => ({ producto_presentacion_id: it.producto_presentacion_id, cantidad_prestada: Number(it.cantidad) })),
                });
                toast.success(esPrestado ? 'Préstamo registrado. Stock descontado del almacén.' : 'Préstamo registrado. Stock ingresado al almacén.');
            }
            setModalOpen(false);
            await load();
        } catch (err) {
            if (err.response?.status === 422) {
                const v = err.response.data?.errors ?? {};
                setFormErrors(Object.fromEntries(Object.entries(v).map(([k, val]) => [k, val[0]])));
                toast.error(err.response.data?.message ?? 'Revisa los datos.');
            } else {
                toast.error('No se pudo guardar el préstamo.');
            }
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        setDeleting(true);
        try {
            await api.delete(`/prestamos/${deleteTarget.id}`);
            toast.success('Préstamo eliminado y stock revertido.');
            setDeleteTarget(null);
            await load();
        } catch (err) {
            toast.error(err.response?.data?.message ?? 'No se pudo eliminar el préstamo.');
        } finally {
            setDeleting(false);
        }
    };

    // ── Devoluciones ──
    const openDevolucion = (p) => {
        setDevTarget(p);
        setDevCant({});
    };

    const devolverTodo = () => {
        setDevCant(Object.fromEntries((devTarget?.detalles ?? []).filter((d) => Number(d.cantidad_pendiente) > 0).map((d) => [d.producto_presentacion_id, String(d.cantidad_pendiente)])));
    };

    const handleDevolucion = async (e) => {
        e.preventDefault();
        const items = (devTarget?.detalles ?? [])
            .map((d) => ({ producto_presentacion_id: d.producto_presentacion_id, cantidad: Number(devCant[d.producto_presentacion_id]) || 0, pendiente: Number(d.cantidad_pendiente) }))
            .filter((it) => it.cantidad > 0);
        if (items.length === 0) return toast.error('Indica la cantidad a devolver de al menos un artículo.');
        const excedido = items.find((it) => it.cantidad > it.pendiente + 0.0001);
        if (excedido) return toast.error('Una cantidad supera lo pendiente de devolver.');

        setSavingDev(true);
        try {
            await api.post(`/prestamos/${devTarget.id}/devoluciones`, { items: items.map(({ producto_presentacion_id, cantidad }) => ({ producto_presentacion_id, cantidad })) });
            toast.success('Devolución registrada.');
            setDevTarget(null);
            await load();
        } catch (err) {
            toast.error(err.response?.data?.message ?? 'No se pudo registrar la devolución.');
        } finally {
            setSavingDev(false);
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
    const filtered = prestamos.filter((p) => {
        if (p.tipo !== tab) return false;
        if (activeFilters.estado === 'vencido') return vencido(p);
        if (activeFilters.estado && p.estado !== activeFilters.estado) return false;
        if (activeFilters.almacen && String(p.almacen_id) !== activeFilters.almacen) return false;
        return true;
    });
    const filterCount = Object.keys(activeFilters).length;

    const filters = (
        <div className="flex flex-wrap items-end gap-3">
            <Select label="Estado" value={filterEstado} onChange={(e) => setFilterEstado(e.target.value)}
                options={[{ value: '', label: 'Todos' }, ...Object.entries(estadoInfo).map(([value, info]) => ({ value, label: info.label })), { value: 'vencido', label: 'Vencidos' }]}
                className="w-40" />
            <Select label="Almacén" value={filterAlmacen} onChange={(e) => setFilterAlmacen(e.target.value)}
                options={[{ value: '', label: 'Todos' }, ...almacenes.map((a) => ({ value: String(a.id), label: a.nombre }))]}
                className="w-48" />
            <Button variant="primary" size="sm" onClick={applyFilters}>Aplicar</Button>
            {filterCount > 0 && <Button variant="ghost" size="sm" onClick={clearFilters}>Limpiar</Button>}
        </div>
    );

    // ── Columnas ──
    const columns = [
        {
            key: 'documento', label: 'N° Doc.', width: '110px',
            getSearchValue: (row) => row.documento,
            render: (row) => <span className="font-semibold text-warm-900">{row.documento ?? `#${row.id}`}</span>,
        },
        { key: 'fecha_prestamo', label: 'Fecha', width: '100px', render: (row) => fecha(row.fecha_prestamo) },
        {
            key: 'tercero', label: tab === 'prestado' ? 'Presté a' : 'Me prestó',
            getSearchValue: (row) => `${row.tercero ?? ''} ${row.tercero_documento ?? ''}`,
            render: (row) => (
                <span className="flex min-w-0 items-center gap-2">
                    <Handshake className="h-4 w-4 shrink-0 text-primary-600" />
                    <span className="min-w-0">
                        <span className="block truncate font-medium text-warm-900">{row.tercero ?? '—'}</span>
                        {(row.tercero_documento || row.tercero_telefono) && (
                            <span className="block truncate text-xs text-warm-500">{[row.tercero_documento, row.tercero_telefono].filter(Boolean).join(' · ')}</span>
                        )}
                    </span>
                </span>
            ),
        },
        { key: 'almacen', label: 'Almacén', width: '140px', getSearchValue: (row) => row.almacen?.nombre, render: (row) => <Badge variant="gray">{row.almacen?.nombre ?? '—'}</Badge> },
        {
            key: 'fecha_devolucion_esperada', label: 'Dev. esperada', width: '125px', searchable: false,
            render: (row) => (
                <span className={`inline-flex items-center gap-1 ${vencido(row) ? 'font-semibold text-red-600' : ''}`}>
                    {vencido(row) && <AlertTriangle className="h-3.5 w-3.5" />}
                    {fecha(row.fecha_devolucion_esperada)}
                </span>
            ),
        },
        {
            key: 'devuelto', label: 'Devuelto', width: '110px', searchable: false,
            render: (row) => {
                const total = (row.detalles ?? []).reduce((s, d) => s + Number(d.cantidad_prestada), 0);
                const dev = (row.detalles ?? []).reduce((s, d) => s + Number(d.cantidad_devuelta ?? 0), 0);
                const pct = total > 0 ? Math.min(100, Math.round((dev / total) * 100)) : 0;
                return (
                    <span className="block">
                        <span className="block text-xs text-warm-500">{num(dev)} / {num(total)}</span>
                        <span className="mt-1 block h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                            <span className={`block h-full rounded-full ${pct >= 100 ? 'bg-green-500' : 'bg-primary-500'}`} style={{ width: `${pct}%` }} />
                        </span>
                    </span>
                );
            },
        },
        {
            key: 'estado', label: 'Estado', width: '105px',
            render: (row) => {
                const info = estadoInfo[row.estado] ?? { label: row.estado ?? '—', variant: 'gray' };
                return <Badge variant={info.variant}>{info.label}</Badge>;
            },
        },
        {
            type: 'actions', key: 'actions', label: 'Acc.', width: '70px',
            actions: (row) => (
                <ActionsMenu
                    items={[
                        { label: 'Imprimir / PDF', icon: Printer, color: 'text-warm-600', onClick: () => setPdfTarget(row) },
                        {
                            label: 'Registrar devolución',
                            icon: Undo2,
                            color: 'text-amber-600',
                            hidden: row.estado === 'devuelto',
                            onClick: () => openDevolucion(row),
                        },
                        { label: 'Editar', icon: Edit, color: 'text-primary-600', onClick: () => openEdit(row) },
                        { label: 'Eliminar', icon: Trash2, danger: true, title: 'Revierte el stock pendiente', onClick: () => setDeleteTarget(row) },
                    ]}
                />
            ),
        },
    ];

    const detalles = seleccionado?.detalles ?? [];
    const devPendientes = (devTarget?.detalles ?? []).filter((d) => Number(d.cantidad_pendiente) > 0);

    return (
        <Layout>
            <PageHeader
                title="Préstamos"
                description={tab === 'prestado' ? 'Mercadería que la tienda presta a terceros y su devolución' : 'Mercadería que terceros prestan a la tienda y su devolución'}
                actions={<CreateButton onClick={openCreate}>Nuevo préstamo</CreateButton>}
            />

            {error && <Alert variant="error" className="mb-4">{error}</Alert>}

            <div className="mb-4">
                <Tabs
                    items={[
                        { key: 'prestado', label: 'Presté', icon: HandCoins },
                        { key: 'recibido', label: 'Me prestaron', icon: Handshake },
                    ]}
                    value={tab}
                    onChange={setTab}
                />
            </div>

            <DataTable
                columns={columns}
                rows={filtered}
                loading={loading}
                searchPlaceholder="Buscar por documento o tercero..."
                filterable
                filters={filters}
                filterCount={filterCount}
                onRowClick={(row) => setSeleccionado(row)}
                rowClassName={(row) => (row.id === seleccionado?.id ? 'bg-primary-50' : undefined)}
            />

            {/* Móvil: el detalle sube desde abajo al tocar una card (en escritorio no pinta nada). */}
            <BottomSheet
                open={Boolean(seleccionado)}
                onClose={() => setSeleccionado(null)}
                title={seleccionado ? `${seleccionado.documento ?? 'Préstamo'} · ${seleccionado.tercero ?? ''}` : ''}
                subtitle={seleccionado ? `${seleccionado.tipo === 'prestado' ? 'Presté a' : 'Me prestó'}${seleccionado.tercero_telefono ? ` · Tel. ${seleccionado.tercero_telefono}` : ''}${seleccionado.fecha_devolucion ? ` · Devuelto el ${fecha(seleccionado.fecha_devolucion)}` : ''}` : ''}
            >
                {detalles.length === 0 ? (
                    <p className="py-6 text-center text-sm text-warm-500">Este préstamo no tiene artículos.</p>
                ) : (
                    <div className="space-y-3">
                        {detalles.map((d) => {
                            const producto = d.presentacion?.producto;
                            const pend = Number(d.cantidad_pendiente ?? 0);
                            return (
                                <DetalleCard
                                    key={d.id}
                                    titulo={producto?.nombre ?? '—'}
                                    subtitulo={[producto?.codigo, d.presentacion?.nombre, producto?.marca?.nombre].filter(Boolean).join(' · ')}
                                    campos={[
                                        { label: 'Prestado', value: num(d.cantidad_prestada), valueClassName: 'text-primary-600' },
                                        { label: 'Devuelto', value: num(d.cantidad_devuelta) },
                                        { label: 'Pendiente', value: num(pend), valueClassName: pend > 0 ? 'text-warning-600' : 'text-success-600' },
                                    ]}
                                />
                            );
                        })}
                    </div>
                )}
            </BottomSheet>

            {/* Detalle del préstamo seleccionado (escritorio) */}
            <div className="mt-6 hidden rounded-xl border border-edge bg-white shadow-sm md:block">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-edge px-5 py-3">
                    <h2 className="text-sm font-semibold text-warm-900">
                        Detalle {seleccionado?.documento ? `de ${seleccionado.documento}` : ''}
                    </h2>
                    {seleccionado && (
                        <span className="flex flex-wrap gap-3 text-xs text-warm-500">
                            <span>{seleccionado.tipo === 'prestado' ? 'Presté a' : 'Me prestó'}: <strong className="text-warm-900">{seleccionado.tercero}</strong></span>
                            {seleccionado.tercero_documento && <span>Doc.: <strong className="text-warm-900">{seleccionado.tercero_documento}</strong></span>}
                            {seleccionado.tercero_telefono && <span>Tel.: <strong className="text-warm-900">{seleccionado.tercero_telefono}</strong></span>}
                            <span>Registró: <strong className="text-warm-900">{seleccionado.usuario?.name ?? '—'}</strong></span>
                            {seleccionado.fecha_devolucion && <span>Devuelto el: <strong className="text-warm-900">{fecha(seleccionado.fecha_devolucion)}</strong></span>}
                            {seleccionado.observaciones && <span>Obs.: <strong className="text-warm-900">{seleccionado.observaciones}</strong></span>}
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
                                <th className="w-28 px-3 py-2.5 text-right">Prestado</th>
                                <th className="w-28 px-3 py-2.5 text-right">Devuelto</th>
                                <th className="w-28 px-3 py-2.5 text-right">Pendiente</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {detalles.length === 0 && (
                                <tr>
                                    <td colSpan={8} className="px-3 py-10 text-center text-sm text-warm-500">
                                        {seleccionado ? 'Este préstamo no tiene artículos.' : 'Selecciona un préstamo arriba para ver su detalle.'}
                                    </td>
                                </tr>
                            )}
                            {detalles.map((d, i) => {
                                const producto = d.presentacion?.producto;
                                const pend = Number(d.cantidad_pendiente ?? 0);
                                return (
                                    <tr key={d.id}>
                                        <td className="px-3 py-2 text-center text-warm-500">{i + 1}</td>
                                        <td className="px-3 py-2 text-warm-500">{producto?.codigo ?? '—'}</td>
                                        <td className="px-3 py-2 font-semibold text-warm-900">{producto?.nombre ?? '—'}</td>
                                        <td className="px-3 py-2 text-warm-500">{producto?.marca?.nombre ?? '—'}</td>
                                        <td className="px-3 py-2 text-warm-500">{d.presentacion?.nombre ?? '—'}</td>
                                        <td className="px-3 py-2 text-right font-semibold text-primary-600">{num(d.cantidad_prestada)}</td>
                                        <td className="px-3 py-2 text-right text-warm-900">{num(d.cantidad_devuelta)}</td>
                                        <td className="px-3 py-2 text-right">
                                            <Badge variant={pend > 0 ? 'amber' : 'green'}>{num(pend)}</Badge>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                {(seleccionado?.devoluciones?.length ?? 0) > 0 && (
                    <div className="border-t border-edge px-5 py-3">
                        <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-warm-500">Historial de devoluciones</p>
                        <ul className="grid grid-cols-1 gap-1 text-xs text-warm-500 sm:grid-cols-2 lg:grid-cols-3">
                            {seleccionado.devoluciones.map((dv) => (
                                <li key={dv.id}>
                                    <span className="text-warm-900">{fecha(dv.fecha)}</span> · {dv.presentacion?.producto?.nombre ?? 'Producto'} — {dv.presentacion?.nombre ?? ''}: <strong className="text-warm-900">{num(dv.cantidad)}</strong>
                                    {dv.usuario?.name && <span> ({dv.usuario.name})</span>}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>

            {/* Modal crear / editar */}
            <Modal
                open={modalOpen}
                onClose={() => setModalOpen(false)}
                title={editing ? `Editar préstamo ${editing.documento ?? ''}` : 'Nuevo préstamo'}
                description={
                    editing
                        ? terceroBloqueado ? 'Con devoluciones registradas solo se cambia la fecha esperada y las observaciones.' : 'Los artículos no se modifican; para corregirlos elimina y vuelve a registrar.'
                        : esPrestado ? 'La tienda presta mercadería a un tercero: sale del almacén elegido.' : 'Un tercero presta mercadería a la tienda: entra al almacén elegido.'
                }
                size={editing ? 'lg' : '3xl'}
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button>
                        <Button type="submit" form="prestamo-form" loading={saving}>{editing ? 'Guardar' : 'Registrar préstamo'}</Button>
                    </>
                }
            >
                <form id="prestamo-form" onSubmit={handleSubmit} noValidate className="space-y-5">
                    <section>
                        <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-warm-500">Préstamo</h3>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            <Select label="Dirección" value={form.tipo} disabled={Boolean(editing)}
                                onChange={(e) => { setField('tipo', e.target.value); setItems([]); setPanel({ ...panelVacio }); }}
                                options={[{ value: 'prestado', label: 'Presté (la tienda presta)' }, { value: 'recibido', label: 'Me prestaron (la tienda recibe)' }]} />
                            <Select label="Almacén" value={form.almacen_id} disabled={Boolean(editing)}
                                onChange={(e) => { setField('almacen_id', e.target.value); setItems([]); setPanel({ ...panelVacio }); }}
                                options={[{ value: '', label: 'Selecciona…' }, ...opcionesAlmacen(almacenes, form.almacen_id)]}
                                error={formErrors.almacen_id} />
                            <Input label="Fecha del préstamo" type="date" value={form.fecha_prestamo} disabled={Boolean(editing)}
                                onChange={(e) => setField('fecha_prestamo', e.target.value)} error={formErrors.fecha_prestamo} />
                            <Input label="Devolución esperada" type="date" value={form.fecha_devolucion_esperada} min={form.fecha_prestamo || undefined}
                                onChange={(e) => setField('fecha_devolucion_esperada', e.target.value)} error={formErrors.fecha_devolucion_esperada} />
                        </div>
                    </section>

                    <section>
                        <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-warm-500">{esPrestado ? 'A quién se presta' : 'Quién presta'}</h3>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            <Input label="Nombre / razón social *" placeholder="Ej: Bodega Los Andes" value={form.tercero} disabled={terceroBloqueado}
                                onChange={(e) => setField('tercero', e.target.value)} error={formErrors.tercero} className="lg:col-span-2" />
                            <Input label="DNI / RUC" value={form.tercero_documento} maxLength={15} disabled={terceroBloqueado}
                                onChange={(e) => setField('tercero_documento', e.target.value.replace(/\D/g, ''))} error={formErrors.tercero_documento} />
                            <Input label="Teléfono" value={form.tercero_telefono} maxLength={20} disabled={terceroBloqueado}
                                onChange={(e) => setField('tercero_telefono', e.target.value)} error={formErrors.tercero_telefono} />
                        </div>
                    </section>

                    {!editing && (
                        <section>
                            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-warm-500">Artículos</h3>
                            {!form.almacen_id ? (
                                <Alert variant="info">{esPrestado ? 'Elige el almacén para ver sus productos con stock.' : 'Elige el almacén al que ingresará la mercadería.'}</Alert>
                            ) : (
                                <>
                                    <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_180px_120px_auto] md:items-end">
                                        <SearchSelect
                                            label="Producto"
                                            value={panel.producto_id}
                                            onChange={elegirProducto}
                                            options={productosOptions}
                                            placeholder={esPrestado ? 'Buscar producto con stock en el almacén…' : 'Buscar producto…'}
                                            emptyText={esPrestado ? 'Sin productos con stock en este almacén' : 'Sin resultados'}
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
                                                ...unidadesDe(panel.producto_id).map((u) => ({ value: u.value, label: esPrestado ? `${u.label} (disp. ${num(u.disponible)})` : u.label })),
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
                                                    {esPrestado && <th className="w-24 px-3 py-2 text-right">Disp.</th>}
                                                    <th className="w-28 px-3 py-2 text-right">Cantidad</th>
                                                    <th className="w-12 px-3 py-2" />
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100">
                                                {items.length === 0 && (
                                                    <tr><td colSpan={esPrestado ? 5 : 4} className="px-3 py-6 text-center text-warm-500">Agrega artículos arriba</td></tr>
                                                )}
                                                {items.map((it, i) => {
                                                    const p = productoDe(it.producto_id);
                                                    const u = unidadesDe(it.producto_id).find((x) => x.value === it.producto_presentacion_id);
                                                    const excede = esPrestado && u && Number(it.cantidad) > u.disponible;
                                                    return (
                                                        <tr key={i}>
                                                            <td className="px-3 py-2 font-medium text-warm-900">{p?.nombre ?? '—'}</td>
                                                            <td className="px-3 py-2 text-warm-500">{u?.label ?? '—'}</td>
                                                            {esPrestado && <td className="px-3 py-2 text-right text-warm-500">{u ? num(u.disponible) : '—'}</td>}
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

            {/* Modal devolución */}
            <Modal
                open={Boolean(devTarget)}
                onClose={() => setDevTarget(null)}
                title={`Registrar devolución ${devTarget?.documento ?? ''}`}
                description={devTarget ? `${devTarget.tercero} — ${devTarget.tipo === 'prestado' ? 'me devuelve mercadería (entra al almacén)' : 'devuelvo la mercadería (sale del almacén)'}` : ''}
                size="2xl"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setDevTarget(null)}>Cerrar</Button>
                        <Button type="submit" form="devolucion-form" loading={savingDev} disabled={devPendientes.length === 0}>Registrar devolución</Button>
                    </>
                }
            >
                <form id="devolucion-form" onSubmit={handleDevolucion} noValidate className="space-y-3">
                    {devPendientes.length === 0 ? (
                        <Alert variant="success">Este préstamo ya está devuelto por completo.</Alert>
                    ) : (
                        <>
                            <div className="flex items-center justify-between">
                                <p className="text-xs text-warm-500">Indica cuánto se devuelve de cada artículo. Puedes dejar en 0 los que aún no vuelven.</p>
                                <Button type="button" variant="ghost" size="sm" onClick={devolverTodo}>Devolver todo</Button>
                            </div>
                            <div className="overflow-x-auto rounded-lg border border-edge">
                                <table className="w-full min-w-[560px] text-sm">
                                    <thead>
                                        <tr className="bg-primary-600 text-left text-xs font-semibold uppercase tracking-wide text-white">
                                            <th className="px-3 py-2">Producto</th>
                                            <th className="w-28 px-3 py-2">Unidad</th>
                                            <th className="w-24 px-3 py-2 text-right">Prestado</th>
                                            <th className="w-24 px-3 py-2 text-right">Pendiente</th>
                                            <th className="w-32 px-3 py-2 text-right">Devuelve</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {devPendientes.map((d) => {
                                            const val = devCant[d.producto_presentacion_id] ?? '';
                                            const excede = Number(val) > Number(d.cantidad_pendiente) + 0.0001;
                                            return (
                                                <tr key={d.id}>
                                                    <td className="px-3 py-2 font-medium text-warm-900">{d.presentacion?.producto?.nombre ?? 'Producto'}</td>
                                                    <td className="px-3 py-2 text-warm-500">{d.presentacion?.nombre ?? '—'}</td>
                                                    <td className="px-3 py-2 text-right text-warm-500">{num(d.cantidad_prestada)}</td>
                                                    <td className="px-3 py-2 text-right font-semibold text-amber-600">{num(d.cantidad_pendiente)}</td>
                                                    <td className="px-3 py-2">
                                                        <Input type="number" min="0" step="any" max={d.cantidad_pendiente} value={val} placeholder="0"
                                                            onChange={(e) => setDevCant((prev) => ({ ...prev, [d.producto_presentacion_id]: e.target.value }))}
                                                            error={excede ? 'Supera lo pendiente' : undefined} className="text-right" />
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}
                </form>
            </Modal>

            {/* Modal eliminar */}
            <Modal open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} title="Eliminar préstamo"
                description={`¿Eliminar el préstamo ${deleteTarget?.documento ?? ''} con "${deleteTarget?.tercero ?? ''}"?`} size="sm"
                footer={<>
                    <Button variant="secondary" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
                    <Button variant="danger" loading={deleting} onClick={handleDelete}>Eliminar</Button>
                </>}>
                <Alert variant="warning">Se eliminará el préstamo con sus devoluciones y el stock pendiente de devolver se revertirá en el almacén.</Alert>
            </Modal>

            {/* Buscador avanzado (con "presté" solo los productos con stock en el almacén) */}
            <ProductoPickerModal
                open={picker.open}
                onClose={() => setPicker((p) => ({ ...p, open: false }))}
                onSelect={agregarDesdePicker}
                initialQuery={picker.query}
                multiple
                stockFilter={esPrestado}
                productos={productosDisponibles}
                stockPorProducto={esPrestado ? stockAlmacen : undefined}
                title="Buscar productos"
            />
                    <PdfViewerModal
                open={Boolean(pdfTarget)}
                onClose={() => setPdfTarget(null)}
                tipo="prestamo"
                id={pdfTarget?.id}
                nombre={pdfTarget?.documento}
                titulo="Préstamo"
                formatos={['a4', 'ticket']}
            />
        </Layout>
    );
}
