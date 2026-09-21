import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, FileText, Package, Pencil, Plus, Ship, Trash2 } from 'lucide-react';
import api, { asList } from '../lib/api';
import { useToast } from '../lib/toast';
import Layout from '../components/Layout';
import ColorSelect from '../components/ColorSelect';
import ProductoPickerModal from '../components/ProductoPickerModal';
import { Button, Input, Modal, SearchSelect, Select, Spinner } from '../components/ui';

const money = (n, moneda = 'PEN') =>
    new Intl.NumberFormat(moneda === 'USD' ? 'en-US' : 'es-PE', {
        style: 'currency',
        currency: moneda === 'USD' ? 'USD' : 'PEN',
    }).format(Number(n) || 0);

const hoy = () => new Date().toISOString().slice(0, 10);

const panelVacio = {
    producto_id: '',
    producto_presentacion_id: '',
    producto_color_id: '',
    rollos: '',
    cantidad: '1',
    precio_unitario: '0',
};

/** Datos propios de una compra al exterior: se limpian al pasar a nacional. */
const exteriorVacio = {
    cargo_type: '',
    medio_transporte: '',
    incoterm: '',
    pais_origen: '',
    pais_destino: '',
    puerto_embarque: '',
    puerto_destino: '',
    numero_contenedor: '',
    fecha_embarque_estimada: '',
    elaborado_por: '',
    aprobado_por: '',
};

export default function CrearOrdenCompra() {
    const toast = useToast();
    const navigate = useNavigate();
    /** Con :id la pantalla trabaja en modo edición sobre una orden existente. */
    const { id } = useParams();
    const editando = Boolean(id);

    const [codigo, setCodigo] = useState('');

    const [proveedores, setProveedores] = useState([]);
    const [productos, setProductos] = useState([]);
    const [stockPorProducto, setStockPorProducto] = useState({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [formErrors, setFormErrors] = useState({});

    const [form, setForm] = useState({
        tipo: 'nacional',
        moneda: 'PEN',
        proveedor_id: '',
        fecha_emision: hoy(),
        fecha_entrega_estimada: '',
        observaciones: '',
        ...exteriorVacio,
    });

    /** Panel superior de búsqueda/alta. */
    const [panel, setPanel] = useState({ ...panelVacio });
    /** Productos ya agregados a la orden. */
    const [items, setItems] = useState([]);
    /** Buscador avanzado de productos. */
    const [picker, setPicker] = useState({ open: false, query: '' });
    /** Los datos de embarque son muchos campos: se editan en un modal aparte. */
    const [modalExterior, setModalExterior] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [provRes, prodRes, existRes] = await Promise.all([
                api.get('/proveedores'),
                api.get('/productos', { params: { per_page: 500 } }),
                api.get('/existencias'),
            ]);
            setProveedores(asList(provRes));
            setProductos(asList(prodRes));

            // El stock vive por almacén: lo acumulamos por producto (en unidad base).
            setStockPorProducto(
                asList(existRes).reduce((acc, fila) => {
                    const pid = String(fila.producto_id);
                    acc[pid] = (acc[pid] ?? 0) + (Number(fila.stock_actual) || 0);
                    return acc;
                }, {}),
            );

            if (!id) return;

            // Modo edición: la orden se vuelca al formulario y a la tabla.
            const { data: orden } = await api.get(`/ordenes-compra/${id}`);
            setCodigo(orden.codigo ?? '');
            setForm({
                tipo: orden.tipo ?? 'nacional',
                moneda: orden.moneda ?? 'PEN',
                proveedor_id: orden.proveedor_id ? String(orden.proveedor_id) : '',
                fecha_emision: (orden.fecha_emision ?? '').slice(0, 10),
                fecha_entrega_estimada: (orden.fecha_entrega_estimada ?? '').slice(0, 10),
                observaciones: orden.observaciones ?? '',
                ...exteriorVacio,
                cargo_type: orden.cargo_type ?? '',
                medio_transporte: orden.medio_transporte ?? '',
                incoterm: orden.incoterm ?? '',
                pais_origen: orden.pais_origen ?? '',
                pais_destino: orden.pais_destino ?? '',
                puerto_embarque: orden.puerto_embarque ?? '',
                puerto_destino: orden.puerto_destino ?? '',
                numero_contenedor: orden.numero_contenedor ?? '',
                fecha_embarque_estimada: (orden.fecha_embarque_estimada ?? '').slice(0, 10),
                elaborado_por: orden.elaborado_por ?? '',
                aprobado_por: orden.aprobado_por ?? '',
            });
            setItems(
                (orden.detalles ?? []).map((d) => ({
                    producto_id: String(d.presentacion?.producto_id ?? d.presentacion?.producto?.id ?? ''),
                    producto_presentacion_id: String(d.producto_presentacion_id),
                    producto_color_id: d.producto_color_id ? String(d.producto_color_id) : '',
                    rollos: d.rollos != null ? String(d.rollos) : '',
                    cantidad: String(d.cantidad),
                    precio_unitario: String(d.precio_unitario),
                })),
            );
        } catch {
            toast.error('No se pudieron cargar los datos de la orden.');
        } finally {
            setLoading(false);
        }
    }, [toast, id]);

    useEffect(() => {
        load();
    }, [load]);

    const productoDe = useCallback(
        (productoId) => productos.find((p) => String(p.id) === String(productoId)) ?? null,
        [productos],
    );

    const presentacionDe = useCallback(
        (productoId, presentacionId) =>
            (productoDe(productoId)?.presentaciones ?? []).find(
                (pres) => String(pres.id) === String(presentacionId),
            ) ?? null,
        [productoDe],
    );

    const productosOptions = useMemo(
        () =>
            productos.map((p) => ({
                value: String(p.id),
                label: p.nombre,
                keywords: `${p.codigo ?? ''} ${p.codigo_barras ?? ''}`,
            })),
        [productos],
    );

    /** Unidades (presentaciones activas) del producto elegido. */
    const unidadesDe = useCallback(
        (productoId) =>
            (productoDe(productoId)?.presentaciones ?? [])
                .filter((pres) => pres.activo !== false)
                .map((pres) => ({ value: String(pres.id), label: pres.nombre })),
        [productoDe],
    );

    const productoPanel = productoDe(panel.producto_id);
    const unidadesPanel = unidadesDe(panel.producto_id);

    const stockPanel = useMemo(() => {
        if (!productoPanel) return '';
        const cantidad = stockPorProducto[String(productoPanel.id)] ?? 0;
        const abrev = productoPanel.unidad_medida?.abreviatura ?? '';
        return `${new Intl.NumberFormat('es-PE').format(cantidad)}${abrev ? ` ${abrev}` : ''}`;
    }, [productoPanel, stockPorProducto]);

    const setField = (name, value) => {
        setForm((prev) => ({ ...prev, [name]: value }));
        if (formErrors[name]) setFormErrors((prev) => ({ ...prev, [name]: undefined }));
    };

    const setPanelCampo = (patch) => setPanel((prev) => ({ ...prev, ...patch }));

    const elegirProducto = (productoId) => {
        const unidades = unidadesDe(productoId);
        const presentacionId = unidades.length === 1 ? unidades[0].value : '';
        setPanel({
            producto_id: productoId,
            producto_presentacion_id: presentacionId,
            // Otro producto, otro color: nunca se hereda del anterior.
            producto_color_id: '',
            rollos: '',
            cantidad: '1',
            precio_unitario: presentacionId
                ? String(Number(presentacionDe(productoId, presentacionId)?.precio_compra) || 0)
                : '0',
        });
    };

    const elegirUnidad = (presentacionId) =>
        setPanelCampo({
            producto_presentacion_id: presentacionId,
            precio_unitario: String(
                Number(presentacionDe(panel.producto_id, presentacionId)?.precio_compra) || 0,
            ),
        });

    /**
     * Resultado del buscador avanzado: llegan los productos marcados con su unidad y
     * la cantidad escrita ahí mismo. Van directo a la tabla.
     */
    const agregarDesdePicker = (seleccionados) => {
        const utiles = seleccionados.filter((s) => s.presentacion && s.cantidad > 0);
        if (utiles.length === 0) return;

        setItems((prev) => {
            const next = [...prev];

            utiles.forEach(({ producto, presentacion, cantidad }) => {
                // El buscador no elige color, así que solo se acumula sobre
                // líneas que tampoco lo tengan.
                const i = next.findIndex(
                    (it) =>
                        String(it.producto_presentacion_id) === String(presentacion.id) &&
                        !it.producto_color_id,
                );
                if (i !== -1) {
                    next[i] = {
                        ...next[i],
                        cantidad: String((Number(next[i].cantidad) || 0) + cantidad),
                    };
                } else {
                    next.push({
                        producto_id: String(producto.id),
                        producto_presentacion_id: String(presentacion.id),
                        producto_color_id: '',
                        rollos: '',
                        cantidad: String(cantidad),
                        precio_unitario: String(Number(presentacion.precio_compra) || 0),
                    });
                }
            });

            return next;
        });

        toast.success(
            utiles.length === 1 ? 'Producto agregado.' : `${utiles.length} productos agregados.`,
        );
        limpiarPanel();
    };

    const limpiarPanel = () => setPanel({ ...panelVacio });

    const agregarProducto = () => {
        if (!panel.producto_id) return toast.error('Busca y elige un producto.');
        if (!panel.producto_presentacion_id) return toast.error('Elige la unidad de medida.');
        if (!(Number(panel.cantidad) > 0)) return toast.error('La cantidad debe ser mayor a 0.');

        const nuevo = {
            producto_id: panel.producto_id,
            producto_presentacion_id: panel.producto_presentacion_id,
            producto_color_id: panel.producto_color_id || '',
            rollos: panel.rollos || '',
            cantidad: panel.cantidad,
            precio_unitario: panel.precio_unitario || '0',
        };

        // Se acumula en la misma línea si coincide presentación y color; un
        // color distinto de la misma tela es una línea aparte.
        const yaEsta = items.findIndex(
            (it) =>
                String(it.producto_presentacion_id) === String(nuevo.producto_presentacion_id) &&
                String(it.producto_color_id || '') === String(nuevo.producto_color_id || ''),
        );
        if (yaEsta !== -1) {
            setItems((prev) =>
                prev.map((it, i) =>
                    i === yaEsta
                        ? {
                              ...it,
                              cantidad: String((Number(it.cantidad) || 0) + (Number(nuevo.cantidad) || 0)),
                              rollos: String((Number(it.rollos) || 0) + (Number(nuevo.rollos) || 0)),
                              precio_unitario: nuevo.precio_unitario,
                          }
                        : it,
                ),
            );
            toast.success('Se sumó la cantidad al producto ya agregado.');
        } else {
            setItems((prev) => [...prev, nuevo]);
        }
        limpiarPanel();
    };

    const setItem = (i, patch) =>
        setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));

    /** Cambiar la unidad de una fila trae el precio de compra de esa presentación. */
    const cambiarUnidadItem = (i, presentacionId) =>
        setItem(i, {
            producto_presentacion_id: presentacionId,
            precio_unitario: String(
                Number(presentacionDe(items[i].producto_id, presentacionId)?.precio_compra) || 0,
            ),
        });

    const quitarItem = (i) => setItems((prev) => prev.filter((_, idx) => idx !== i));

    const total = items.reduce(
        (acc, it) => acc + (Number(it.cantidad) || 0) * (Number(it.precio_unitario) || 0),
        0,
    );

    const guardar = async () => {
        if (items.length === 0) {
            toast.error('Agrega al menos un producto.');
            return;
        }

        setSaving(true);
        setFormErrors({});

        // El código lo asigna el backend: correlativo del proveedor si tiene
        // código corto (KET-001-26), o el correlativo interno si no.
        const payload = {
            tipo: form.tipo,
            proveedor_id: form.proveedor_id,
            fecha_emision: form.fecha_emision,
            fecha_entrega_estimada: form.fecha_entrega_estimada || null,
            moneda: form.moneda,
            observaciones: form.observaciones,
            // Los campos de embarque solo importan en una compra al exterior;
            // se mandan igual, el backend los ignora si la orden es nacional.
            cargo_type: form.cargo_type || null,
            medio_transporte: form.medio_transporte || null,
            incoterm: form.incoterm || null,
            pais_origen: form.pais_origen || null,
            pais_destino: form.pais_destino || null,
            puerto_embarque: form.puerto_embarque || null,
            puerto_destino: form.puerto_destino || null,
            numero_contenedor: form.numero_contenedor || null,
            fecha_embarque_estimada: form.fecha_embarque_estimada || null,
            elaborado_por: form.elaborado_por || null,
            aprobado_por: form.aprobado_por || null,
            detalles: items.map((it) => ({
                producto_presentacion_id: it.producto_presentacion_id,
                producto_color_id: it.producto_color_id || null,
                rollos: it.rollos !== '' ? Number(it.rollos) : null,
                cantidad: it.cantidad,
                precio_unitario: it.precio_unitario || 0,
            })),
        };

        try {
            if (editando) await api.put(`/ordenes-compra/${id}`, payload);
            else await api.post('/ordenes-compra', payload);

            toast.success(editando ? 'Orden actualizada correctamente.' : 'Orden de compra creada correctamente.');
            navigate('/ordenes-compra');
        } catch (err) {
            const errores = err.response?.data?.errors;
            if (err.response?.status === 422 && errores) {
                setFormErrors(
                    Object.fromEntries(Object.entries(errores).map(([k, v]) => [k, v[0]])),
                );
                toast.error('Revisa los datos del formulario.');
            } else {
                // El backend bloquea editar una orden ya transformada en compra.
                toast.error(err.response?.data?.message ?? 'No se pudo guardar la orden.');
            }
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <Layout>
                <div className="flex items-center justify-center py-24">
                    <Spinner size="lg" className="text-primary-600" />
                </div>
            </Layout>
        );
    }

    return (
        <Layout>
            <div className="mb-6 flex items-center gap-3">
                <button
                    onClick={() => navigate('/ordenes-compra')}
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-edge text-gray-500 transition hover:bg-gray-50 hover:text-gray-800"
                    aria-label="Volver"
                >
                    <ArrowLeft className="h-4 w-4" />
                </button>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
                    <FileText className="h-5 w-5" />
                </div>
                <div>
                    <h1 className="text-xl font-bold tracking-tight text-warm-900">
                        {editando ? `Editar Orden ${codigo}` : 'Crear Orden de Compra'}
                    </h1>
                    <p className="text-sm text-warm-500">Pedido formal de productos al proveedor</p>
                </div>
            </div>

            <Modal
                open={modalExterior}
                onClose={() => setModalExterior(false)}
                title="Compra al exterior"
                description="Para la orden de importación (Purchase Order) que se envía al proveedor."
                size="2xl"
                footer={
                    <Button type="button" onClick={() => setModalExterior(false)}>
                        Listo
                    </Button>
                }
            >
                <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                    <Select
                        label="Tipo de carga"
                        value={form.cargo_type}
                        onChange={(e) => setField('cargo_type', e.target.value)}
                        options={[
                            { value: '', label: '—' },
                            { value: 'FCL', label: 'FCL (contenedor completo)' },
                            { value: 'LCL', label: 'LCL (carga consolidada)' },
                        ]}
                    />
                    <Input
                        label="N° de contenedor"
                        placeholder="2X40 HC"
                        value={form.numero_contenedor}
                        onChange={(e) => setField('numero_contenedor', e.target.value)}
                    />
                    <Select
                        label="Medio de embarque"
                        value={form.medio_transporte}
                        onChange={(e) => setField('medio_transporte', e.target.value)}
                        options={[
                            { value: '', label: '—' },
                            { value: 'SEAFREIGHT', label: 'Marítimo (seafreight)' },
                            { value: 'AIRFREIGHT', label: 'Aéreo (airfreight)' },
                        ]}
                    />
                    <Select
                        label="Incoterm"
                        value={form.incoterm}
                        onChange={(e) => setField('incoterm', e.target.value)}
                        options={[
                            { value: '', label: '—' },
                            { value: 'FOB', label: 'FOB' },
                            { value: 'CIF', label: 'CIF' },
                            { value: 'CFR', label: 'CFR' },
                            { value: 'EXW', label: 'EXW' },
                            { value: 'DDP', label: 'DDP' },
                        ]}
                    />
                    <Input
                        label="País de origen"
                        placeholder="CHINA - CN"
                        value={form.pais_origen}
                        onChange={(e) => setField('pais_origen', e.target.value)}
                    />
                    <Input
                        label="País de destino"
                        placeholder="PERÚ - PE"
                        value={form.pais_destino}
                        onChange={(e) => setField('pais_destino', e.target.value)}
                    />
                    <Input
                        label="Puerto de embarque"
                        placeholder="NINGBO"
                        value={form.puerto_embarque}
                        onChange={(e) => setField('puerto_embarque', e.target.value)}
                    />
                    <Input
                        label="Puerto de llegada"
                        placeholder="CHANCAY"
                        value={form.puerto_destino}
                        onChange={(e) => setField('puerto_destino', e.target.value)}
                    />
                    <Input
                        label="Fecha de embarque"
                        type="date"
                        value={form.fecha_embarque_estimada}
                        onChange={(e) => setField('fecha_embarque_estimada', e.target.value)}
                    />
                    <Input
                        label="Elaborado por"
                        value={form.elaborado_por}
                        onChange={(e) => setField('elaborado_por', e.target.value)}
                    />
                    <Input
                        label="Aprobado por"
                        placeholder="Se llena al aprobar"
                        value={form.aprobado_por}
                        onChange={(e) => setField('aprobado_por', e.target.value)}
                    />
                </div>
            </Modal>

            {/* Productos a la izquierda, datos de la orden a la derecha. */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_380px] *:min-w-0">
                {/* Columna izquierda: buscador y tabla de productos */}
                <div className="space-y-6">
                    {/* Panel de búsqueda y alta de producto */}
                    <div className="rounded-xl border border-edge bg-white p-5 shadow-sm">
                        <h2 className="mb-3 text-sm font-semibold text-warm-900">Buscar Producto</h2>

                        <SearchSelect
                            value={panel.producto_id}
                            onChange={elegirProducto}
                            options={productosOptions}
                            placeholder="Buscar producto por nombre o código…"
                            emptyText="Sin coincidencias"
                            searchTitle="Buscador avanzado con filtros"
                            onSearch={(q) => setPicker({ open: true, query: q })}
                        />

                        <div className="mt-4">
                            <label className="mb-1 block text-sm font-medium text-gray-700">Descripción</label>
                            <input
                                readOnly
                                value={productoPanel?.descripcion ?? productoPanel?.nombre ?? ''}
                                placeholder="—"
                                className="block w-full rounded-md border-0 bg-white px-3 py-2 text-sm text-warm-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400"
                            />
                        </div>

                        {/* Solo si la tela tiene colores registrados: hay insumos
                            (hilos, cierres) que no se piden por color. */}
                        {productoPanel?.colores?.length > 0 && (
                            <div className="mt-4 grid grid-cols-2 gap-4">
                                <ColorSelect
                                    colores={productoPanel.colores}
                                    value={panel.producto_color_id}
                                    onChange={(id) => setPanelCampo({ producto_color_id: id })}
                                />
                                <Input
                                    label="Rollos"
                                    type="number"
                                    min="0"
                                    step="1"
                                    placeholder="Cuántos rollos de ese color"
                                    value={panel.rollos}
                                    onChange={(e) => setPanelCampo({ rollos: e.target.value })}
                                />
                            </div>
                        )}

                        <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
                            <div>
                                <label className="mb-1 block text-sm font-medium text-gray-700">Stock</label>
                                <input
                                    readOnly
                                    value={stockPanel}
                                    placeholder="—"
                                    className="block w-full rounded-md border-0 bg-gray-50 px-3 py-2 text-center text-sm text-gray-500 shadow-sm ring-1 ring-inset ring-gray-300"
                                />
                            </div>
                            <SearchSelect
                                label="Unidad"
                                value={panel.producto_presentacion_id}
                                disabled={!panel.producto_id}
                                clearable={false}
                                placeholder={panel.producto_id ? 'Elegir…' : '—'}
                                emptyText="Sin unidades"
                                onChange={(id) =>
                                    id && String(id) !== String(panel.producto_presentacion_id) && elegirUnidad(id)
                                }
                                options={unidadesPanel}
                            />
                            <Input
                                label="Cantidad"
                                type="number"
                                min="0"
                                step="any"
                                value={panel.cantidad}
                                onChange={(e) => setPanelCampo({ cantidad: e.target.value })}
                                className="text-center"
                            />
                            <Input
                                label="Precio"
                                type="number"
                                min="0"
                                step="any"
                                value={panel.precio_unitario}
                                onChange={(e) => setPanelCampo({ precio_unitario: e.target.value })}
                                className="text-center"
                            />
                        </div>

                        <Button type="button" onClick={agregarProducto} className="mt-4 w-full justify-center md:w-auto md:min-w-[280px]">
                            <Plus className="h-4 w-4" /> Agregar Producto
                        </Button>
                    </div>

                    {/* Productos agregados */}
                    <div className="rounded-xl border border-edge bg-white shadow-sm">
                        <div className="flex items-center justify-between border-b border-edge px-5 py-3">
                            <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-warm-900">
                                <Package className="h-4 w-4 text-primary-600" /> Productos
                            </h2>
                            <span className="text-xs text-warm-500">
                                {items.length} {items.length === 1 ? 'ítem agregado' : 'ítems agregados'}
                            </span>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[980px] text-sm">
                                <thead>
                                    <tr className="bg-primary-600 text-left text-xs font-semibold uppercase tracking-wide text-white">
                                        <th className="px-3 py-2.5 text-center">#</th>
                                        <th className="px-3 py-2.5">Código</th>
                                        <th className="px-3 py-2.5">Producto</th>
                                        <th className="px-3 py-2.5">Color</th>
                                        <th className="px-3 py-2.5">Unidad</th>
                                        <th className="px-3 py-2.5 text-right">Rollos</th>
                                        <th className="px-3 py-2.5 text-right">Cant</th>
                                        <th className="px-3 py-2.5 text-right">P.Unit</th>
                                        <th className="px-3 py-2.5 text-right">Subtotal</th>
                                        <th className="px-3 py-2.5 text-center">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {items.length === 0 && (
                                        <tr>
                                            <td colSpan={10} className="px-3 py-10 text-center text-sm text-warm-500">
                                                Busca un producto arriba para agregarlo a la orden
                                            </td>
                                        </tr>
                                    )}

                                    {items.map((it, i) => {
                                        const producto = productoDe(it.producto_id);
                                        const subtotal = (Number(it.cantidad) || 0) * (Number(it.precio_unitario) || 0);
                                        const colorItem = (producto?.colores ?? []).find(
                                            (c) => String(c.id) === String(it.producto_color_id),
                                        );

                                        return (
                                            <tr key={i}>
                                                <td className="px-3 py-2 text-center text-warm-500">{i + 1}</td>
                                                <td className="px-3 py-2 font-medium text-warm-900">{producto?.codigo ?? '—'}</td>
                                                <td className="px-3 py-2 font-semibold text-warm-900">{producto?.nombre ?? '—'}</td>
                                                <td className="px-3 py-2 text-warm-600">{colorItem?.nombre ?? '—'}</td>
                                                <td className="px-3 py-2">
                                                    <SearchSelect
                                                        value={it.producto_presentacion_id}
                                                        clearable={false}
                                                        emptyText="Sin unidades"
                                                        onChange={(id) =>
                                                            id &&
                                                            String(id) !== String(it.producto_presentacion_id) &&
                                                            cambiarUnidadItem(i, id)
                                                        }
                                                        options={unidadesDe(it.producto_id)}
                                                        className="min-w-[120px]"
                                                    />
                                                </td>
                                                <td className="px-3 py-2">
                                                    <Input
                                                        type="number"
                                                        min="0"
                                                        step="1"
                                                        value={it.rollos}
                                                        onChange={(e) => setItem(i, { rollos: e.target.value })}
                                                        aria-label="Rollos"
                                                        className="text-right"
                                                    />
                                                </td>
                                                <td className="px-3 py-2">
                                                    <Input
                                                        type="number"
                                                        min="0"
                                                        step="any"
                                                        value={it.cantidad}
                                                        onChange={(e) => setItem(i, { cantidad: e.target.value })}
                                                        aria-label="Cantidad"
                                                        className="text-right"
                                                    />
                                                </td>
                                                <td className="px-3 py-2">
                                                    <Input
                                                        type="number"
                                                        min="0"
                                                        step="any"
                                                        value={it.precio_unitario}
                                                        onChange={(e) => setItem(i, { precio_unitario: e.target.value })}
                                                        aria-label="Precio unitario"
                                                        className="text-right"
                                                    />
                                                </td>
                                                <td className="px-3 py-2 text-right font-semibold text-primary-600">{money(subtotal, form.moneda)}</td>
                                                <td className="px-3 py-2">
                                                    <div className="flex items-center justify-center">
                                                        <button
                                                            type="button"
                                                            onClick={() => quitarItem(i)}
                                                            aria-label="Quitar"
                                                            className="rounded-md p-1.5 text-red-600 transition hover:bg-red-50"
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* Columna derecha: datos de la orden, embarque, observaciones, resumen */}
                <div className="space-y-6 lg:sticky lg:top-6 lg:self-start">
                    {/* Datos de la orden */}
                    <div className="rounded-xl border border-edge bg-white shadow-sm">
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-edge px-5 py-3">
                            <h2 className="text-xs font-bold uppercase tracking-wide text-warm-500">Datos de la orden</h2>

                            {/* Nacional o al exterior: de eso depende si se piden los
                                datos de embarque y en qué moneda se cotiza. */}
                            <div className="inline-flex rounded-lg border border-edge bg-gray-50 p-0.5">
                                {[
                                    { value: 'nacional', label: 'Nacional' },
                                    { value: 'exterior', label: 'Al exterior' },
                                ].map((opcion) => (
                                    <button
                                        key={opcion.value}
                                        type="button"
                                        onClick={() =>
                                            setForm((prev) => ({
                                                ...prev,
                                                tipo: opcion.value,
                                                moneda: opcion.value === 'exterior' ? 'USD' : 'PEN',
                                            }))
                                        }
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
                        </div>
                        <div className="grid grid-cols-2 gap-4 p-5">
                            {/* Al crear no se muestra: el correlativo lo asigna el backend
                                y todavía no existe. Al editar sí, como referencia. */}
                            {editando && (
                                <div className="col-span-2">
                                    <label className="mb-1 block text-sm font-medium text-gray-700">Código</label>
                                    <input
                                        readOnly
                                        value={codigo}
                                        className="block w-full rounded-md border-0 bg-gray-50 px-3 py-2 text-sm text-gray-500 shadow-sm ring-1 ring-inset ring-gray-300"
                                    />
                                </div>
                            )}
                            <div className="col-span-2">
                                <SearchSelect
                                    label="Proveedor"
                                    value={form.proveedor_id}
                                    onChange={(v) => setField('proveedor_id', v)}
                                    options={proveedores.map((p) => ({
                                        value: String(p.id),
                                        label: p.codigo_corto ? `${p.nombre} (${p.codigo_corto})` : p.nombre,
                                    }))}
                                    placeholder="Buscar proveedor…"
                                    emptyText="Sin coincidencias"
                                    error={formErrors.proveedor_id}
                                />
                            </div>
                            <Input label="Fecha emisión" type="date" value={form.fecha_emision} onChange={(e) => setField('fecha_emision', e.target.value)} error={formErrors.fecha_emision} />
                            <Input label="Entrega estimada" type="date" value={form.fecha_entrega_estimada} onChange={(e) => setField('fecha_entrega_estimada', e.target.value)} />
                            <div className="col-span-2">
                                <Select
                                    label="Moneda"
                                    value={form.moneda}
                                    onChange={(e) => setField('moneda', e.target.value)}
                                    options={[
                                        { value: 'PEN', label: 'Soles (PEN)' },
                                        { value: 'USD', label: 'Dólares (USD)' },
                                    ]}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Datos de embarque: solo para una orden al exterior. Son muchos
                        campos, así que se editan en un modal aparte. */}
                    {form.tipo === 'exterior' && (
                        <div className="rounded-xl border border-edge bg-white p-5 shadow-sm">
                            <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
                                        <Ship className="h-4 w-4" />
                                    </div>
                                    <h2 className="text-sm font-semibold text-warm-900">Compra al exterior</h2>
                                </div>
                                <Button type="button" variant="secondary" size="sm" onClick={() => setModalExterior(true)}>
                                    <Pencil className="h-4 w-4" /> Editar
                                </Button>
                            </div>
                            <p className="mt-2 text-xs text-warm-500">
                                {form.puerto_embarque || form.incoterm || form.cargo_type
                                    ? [form.cargo_type, form.incoterm, form.puerto_embarque && `desde ${form.puerto_embarque}`]
                                          .filter(Boolean)
                                          .join(' · ')
                                    : 'Para la orden de importación (Purchase Order) que se envía al proveedor.'}
                            </p>
                        </div>
                    )}

                    <div className="rounded-xl border border-edge bg-white p-5 shadow-sm">
                        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-warm-500">Observaciones</h2>
                        <textarea
                            rows={3}
                            value={form.observaciones}
                            onChange={(e) => setField('observaciones', e.target.value)}
                            placeholder="Notas para el proveedor o internas…"
                            className="block w-full resize-none rounded-lg border-0 bg-white p-3 text-sm text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-primary-600"
                        />
                    </div>

                    {/* Resumen */}
                    <div className="rounded-xl border border-edge bg-white p-5 shadow-sm">
                        <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-warm-500">Resumen</h2>
                        <div className="flex items-center justify-between border-t border-edge pt-3">
                            <span className="text-sm font-bold uppercase tracking-wide text-primary-700">Total</span>
                            <span className="text-2xl font-extrabold text-warm-900">{money(total, form.moneda)}</span>
                        </div>
                        <div className="mt-5 flex flex-col gap-2">
                            <Button onClick={guardar} loading={saving} className="w-full justify-center">
                                {editando ? 'Guardar cambios' : 'Crear orden'}
                            </Button>
                            <Button variant="secondary" onClick={() => navigate('/ordenes-compra')} className="w-full justify-center">
                                Cancelar
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            <ProductoPickerModal
                open={picker.open}
                onClose={() => setPicker((prev) => ({ ...prev, open: false }))}
                onSelect={agregarDesdePicker}
                initialQuery={picker.query}
                multiple
                stockFilter
                productos={productos}
                stockPorProducto={stockPorProducto}
                title="Buscar productos"
            />
        </Layout>
    );
}
