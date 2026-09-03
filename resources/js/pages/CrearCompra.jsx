import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Package, Plus, ShoppingBag, Trash2, Wallet } from 'lucide-react';
import api, { asList } from '../lib/api';
import { useToast } from '../lib/toast';
import Layout from '../components/Layout';
import MetodoCajaPicker from '../components/MetodoCajaPicker';
import ProductoPickerModal from '../components/ProductoPickerModal';
import { Button, Input, SearchSelect, Select, Spinner } from '../components/ui';

const money = (n) =>
    new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(Number(n) || 0);

const hoy = () => new Date().toISOString().slice(0, 10);

const panelVacio = { producto_id: '', producto_presentacion_id: '', cantidad: '1', costo_unitario: '0' };
const emptyPago = () => ({ tipo: 'efectivo', cuentaId: '', billeteraId: '', monto: '' });

export default function CrearCompra() {
    const toast = useToast();
    const navigate = useNavigate();
    /** ?orden=12 → la compra nace de esa orden de compra y queda ligada a ella. */
    const [searchParams] = useSearchParams();
    const ordenCompraId = searchParams.get('orden');
    const [ordenCodigo, setOrdenCodigo] = useState('');
    /** Con :id la pantalla trabaja en modo edición sobre una compra existente. */
    const { id } = useParams();
    const editando = Boolean(id);
    const [numeroCompra, setNumeroCompra] = useState('');

    const [proveedores, setProveedores] = useState([]);
    const [productos, setProductos] = useState([]);
    const [stockPorProducto, setStockPorProducto] = useState({});
    const [cuentas, setCuentas] = useState([]);
    const [billeteras, setBilleteras] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [formErrors, setFormErrors] = useState({});

    const [form, setForm] = useState({
        proveedor_id: '',
        tipo_documento: 'factura',
        serie: '',
        numero: '',
        fecha: hoy(),
        forma_pago: 'contado',
        dias_credito: 0,
        fecha_vencimiento: hoy(),
        flete: '0',
        observaciones: '',
    });

    /** Panel superior de búsqueda/alta. */
    const [panel, setPanel] = useState({ ...panelVacio });
    /** Productos ya agregados a la compra. */
    const [items, setItems] = useState([]);
    /** Buscador avanzado de productos. */
    const [picker, setPicker] = useState({ open: false, query: '' });

    const [pagos, setPagos] = useState([emptyPago()]);
    /** Off = un solo método de pago (el caso normal). On = varios métodos. */
    const [mixto, setMixto] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [provRes, prodRes, existRes, cuentasRes, billeterasRes] = await Promise.all([
                api.get('/proveedores'),
                api.get('/productos', { params: { per_page: 500 } }),
                api.get('/existencias'),
                api.get('/cuentas-bancarias'),
                api.get('/billeteras-digitales'),
            ]);
            setProveedores(asList(provRes));
            setProductos(asList(prodRes));
            setCuentas(asList(cuentasRes));
            setBilleteras(asList(billeterasRes));

            // El stock vive por almacén: lo acumulamos por producto (en unidad base).
            setStockPorProducto(
                asList(existRes).reduce((acc, fila) => {
                    const pid = String(fila.producto_id);
                    acc[pid] = (acc[pid] ?? 0) + (Number(fila.stock_actual) || 0);
                    return acc;
                }, {}),
            );

            if (id) {
                // Modo edición: la compra se vuelca al formulario, la tabla y los pagos.
                const { data: compra } = await api.get(`/compras/${id}`);
                setNumeroCompra(compra.numero_compra ?? '');
                setForm({
                    proveedor_id: compra.proveedor_id ? String(compra.proveedor_id) : '',
                    tipo_documento: compra.tipo_documento ?? 'factura',
                    serie: compra.serie ?? '',
                    numero: compra.numero ?? '',
                    fecha: (compra.fecha ?? '').slice(0, 10),
                    forma_pago: compra.forma_pago ?? 'contado',
                    dias_credito: compra.dias_credito ?? 0,
                    fecha_vencimiento: (compra.fecha_vencimiento ?? hoy()).slice(0, 10),
                    flete: String(compra.flete ?? '0'),
                    observaciones: compra.observaciones ?? '',
                });
                setItems(
                    (compra.detalles ?? []).map((d) => ({
                        producto_id: String(d.presentacion?.producto_id ?? d.presentacion?.producto?.id ?? ''),
                        producto_presentacion_id: String(d.producto_presentacion_id),
                        cantidad: String(d.cantidad),
                        costo_unitario: String(d.costo_unitario),
                    })),
                );

                const pagosCompra = (compra.pagos ?? []).map((p) => ({
                    tipo: p.metodo,
                    cuentaId: p.cuenta_bancaria_id ? String(p.cuenta_bancaria_id) : '',
                    billeteraId: p.billetera_id ? String(p.billetera_id) : '',
                    monto: String(p.monto),
                }));
                if (pagosCompra.length) {
                    setPagos(pagosCompra);
                    // Con más de un pago la pantalla arranca en modo mixto.
                    setMixto(pagosCompra.length > 1);
                }
                return;
            }

            if (!ordenCompraId) return;

            // Transformar orden → compra: se copian proveedor y líneas.
            const { data: orden } = await api.get(`/ordenes-compra/${ordenCompraId}`);
            setOrdenCodigo(orden.codigo ?? '');
            setForm((prev) => ({
                ...prev,
                proveedor_id: orden.proveedor_id ? String(orden.proveedor_id) : '',
            }));
            setItems(
                (orden.detalles ?? []).map((d) => ({
                    producto_id: String(d.presentacion?.producto_id ?? d.presentacion?.producto?.id ?? ''),
                    producto_presentacion_id: String(d.producto_presentacion_id),
                    cantidad: String(d.cantidad),
                    costo_unitario: String(d.precio_unitario),
                })),
            );
        } catch {
            toast.error('No se pudieron cargar proveedores/productos.');
        } finally {
            setLoading(false);
        }
    }, [toast, ordenCompraId, id]);

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
            cantidad: '1',
            costo_unitario: presentacionId
                ? String(Number(presentacionDe(productoId, presentacionId)?.precio_compra) || 0)
                : '0',
        });
    };

    const elegirUnidad = (presentacionId) =>
        setPanelCampo({
            producto_presentacion_id: presentacionId,
            costo_unitario: String(
                Number(presentacionDe(panel.producto_id, presentacionId)?.precio_compra) || 0,
            ),
        });

    const limpiarPanel = () => setPanel({ ...panelVacio });

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
                const i = next.findIndex(
                    (it) => String(it.producto_presentacion_id) === String(presentacion.id),
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
                        cantidad: String(cantidad),
                        costo_unitario: String(Number(presentacion.precio_compra) || 0),
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

    const agregarProducto = () => {
        if (!panel.producto_id) return toast.error('Busca y elige un producto.');
        if (!panel.producto_presentacion_id) return toast.error('Elige la unidad de medida.');
        if (!(Number(panel.cantidad) > 0)) return toast.error('La cantidad debe ser mayor a 0.');

        const nuevo = {
            producto_id: panel.producto_id,
            producto_presentacion_id: panel.producto_presentacion_id,
            cantidad: panel.cantidad,
            costo_unitario: panel.costo_unitario || '0',
        };

        // Si ya existe la misma presentación, se acumula en vez de duplicar la línea.
        const yaEsta = items.findIndex(
            (it) => String(it.producto_presentacion_id) === String(nuevo.producto_presentacion_id),
        );
        if (yaEsta !== -1) {
            setItems((prev) =>
                prev.map((it, i) =>
                    i === yaEsta
                        ? {
                              ...it,
                              cantidad: String((Number(it.cantidad) || 0) + (Number(nuevo.cantidad) || 0)),
                              costo_unitario: nuevo.costo_unitario,
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
            costo_unitario: String(
                Number(presentacionDe(items[i].producto_id, presentacionId)?.precio_compra) || 0,
            ),
        });

    const quitarItem = (i) => setItems((prev) => prev.filter((_, idx) => idx !== i));

    const setPago = (i, patch) => setPagos((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
    const addPago = () => setPagos((prev) => [...prev, emptyPago()]);
    const removePago = (i) => setPagos((prev) => (prev.length === 1 ? prev : prev.filter((_, idx) => idx !== i)));

    const subtotal = items.reduce(
        (acc, it) => acc + (Number(it.cantidad) || 0) * (Number(it.costo_unitario) || 0),
        0,
    );
    const flete = Number(form.flete) || 0;
    const total = subtotal + flete;
    const esContado = form.forma_pago === 'contado';

    /**
     * En modo simple hay un solo pago: al contado cubre el total automáticamente,
     * y a crédito es un adelanto opcional. El modo mixto abre la lista completa.
     */
    const pagosEfectivos = mixto
        ? pagos
        : [{ ...pagos[0], monto: esContado ? String(total) : pagos[0].monto }];

    const pagado = pagosEfectivos.reduce((acc, p) => acc + (Number(p.monto) || 0), 0);
    const saldo = total - pagado;

    const alternarMixto = () => {
        setMixto((prev) => {
            // Al abrir el modo mixto, el primer pago arranca con el total pendiente.
            if (!prev && !Number(pagos[0].monto)) {
                setPagos((ps) => ps.map((p, i) => (i === 0 ? { ...p, monto: String(total) } : p)));
            }
            // Al volver a simple se conserva solo el primer pago.
            if (prev) setPagos((ps) => ps.slice(0, 1));
            return !prev;
        });
    };

    const guardar = async () => {
        if (items.length === 0) {
            toast.error('Agrega al menos un producto.');
            return;
        }

        setSaving(true);
        setFormErrors({});

        const payload = {
            proveedor_id: form.proveedor_id || null,
            ...(ordenCompraId ? { orden_compra_id: ordenCompraId } : {}),
            tipo_documento: form.tipo_documento,
            serie: form.serie,
            numero: form.numero,
            fecha: form.fecha,
            forma_pago: form.forma_pago,
            dias_credito: form.forma_pago === 'credito' ? Number(form.dias_credito) || 0 : 0,
            fecha_vencimiento: form.forma_pago === 'credito' ? form.fecha_vencimiento : null,
            flete,
            observaciones: form.observaciones,
            detalles: items.map((it) => ({
                producto_presentacion_id: it.producto_presentacion_id,
                cantidad: it.cantidad,
                costo_unitario: it.costo_unitario || 0,
            })),
            // Al crédito no se envía ningún pago: la deuda se salda desde
            // Cuentas por Pagar.
            pagos: (esContado ? pagosEfectivos : [])
                .filter((p) => p.tipo && Number(p.monto) > 0)
                .map((p) => ({
                    metodo: p.tipo,
                    cuenta_bancaria_id: p.tipo === 'transferencia' ? p.cuentaId || null : null,
                    billetera_id: p.tipo === 'billetera' ? p.billeteraId || null : null,
                    monto: p.monto,
                })),
        };

        try {
            if (editando) await api.put(`/compras/${id}`, payload);
            else await api.post('/compras', payload);

            toast.success(editando ? 'Compra actualizada correctamente.' : 'Compra registrada correctamente.');
            navigate('/compras');
        } catch (err) {
            const errores = err.response?.data?.errors;
            if (err.response?.status === 422 && errores) {
                setFormErrors(Object.fromEntries(Object.entries(errores).map(([k, v]) => [k, v[0]])));
                toast.error('Revisa los datos del formulario.');
            } else {
                toast.error(err.response?.data?.message ?? 'No se pudo guardar la compra.');
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
            {/* Encabezado */}
            <div className="mb-6 flex items-center gap-3">
                <button
                    onClick={() => navigate('/compras')}
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-edge text-gray-500 transition hover:bg-gray-50 hover:text-gray-800"
                    aria-label="Volver"
                >
                    <ArrowLeft className="h-4 w-4" />
                </button>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
                    <ShoppingBag className="h-5 w-5" />
                </div>
                <div>
                    <h1 className="text-xl font-bold tracking-tight text-warm-900">
                        {editando ? `Editar Compra ${numeroCompra}` : 'Crear Compra'}
                    </h1>
                    <p className="text-sm text-warm-500">
                        {ordenCodigo
                            ? `Generada desde la orden ${ordenCodigo}`
                            : 'Comprobante del proveedor y registro de pago'}
                    </p>
                </div>
            </div>

            {/* Datos del comprobante */}
            <div className="mb-6 rounded-xl border border-edge bg-white shadow-sm">
                <div className="border-b border-edge px-5 py-3">
                    <h2 className="text-xs font-bold uppercase tracking-wide text-warm-500">Datos del comprobante</h2>
                </div>
                <div className="grid grid-cols-2 gap-4 p-5 md:grid-cols-4">
                    <Input label="Fecha" type="date" value={form.fecha} onChange={(e) => setField('fecha', e.target.value)} error={formErrors.fecha} />
                    <div className="md:col-span-2">
                        <SearchSelect
                            label="Proveedor"
                            value={form.proveedor_id}
                            onChange={(v) => setField('proveedor_id', v)}
                            options={proveedores.map((p) => ({ value: String(p.id), label: p.nombre }))}
                            placeholder="Buscar proveedor…"
                            emptyText="Sin coincidencias"
                            error={formErrors.proveedor_id}
                        />
                    </div>
                    <Select
                        label="Tipo documento"
                        value={form.tipo_documento}
                        onChange={(e) => setField('tipo_documento', e.target.value)}
                        options={[
                            { value: 'factura', label: 'Factura' },
                            { value: 'boleta', label: 'Boleta' },
                        ]}
                    />
                    <Input label="Serie" placeholder="F001" value={form.serie} onChange={(e) => setField('serie', e.target.value)} error={formErrors.serie} />
                    <Input label="Número" placeholder="00000000" value={form.numero} onChange={(e) => setField('numero', e.target.value)} error={formErrors.numero} />
                    <Select
                        label="Forma de pago"
                        value={form.forma_pago}
                        onChange={(e) => setField('forma_pago', e.target.value)}
                        options={[
                            { value: 'contado', label: 'Contado' },
                            { value: 'credito', label: 'Crédito' },
                        ]}
                    />
                    {form.forma_pago === 'credito' && (
                        <>
                            <Input label="N° días" type="number" min="0" value={form.dias_credito} onChange={(e) => setField('dias_credito', e.target.value)} />
                            <Input label="Vencimiento" type="date" value={form.fecha_vencimiento} onChange={(e) => setField('fecha_vencimiento', e.target.value)} />
                        </>
                    )}
                </div>
            </div>

            {/* Panel de búsqueda y alta de producto */}
            <div className="mb-6 rounded-xl border border-edge bg-white p-5 shadow-sm">
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
                    <Select
                        label="Unidad"
                        value={panel.producto_presentacion_id}
                        disabled={!panel.producto_id}
                        onChange={(e) => elegirUnidad(e.target.value)}
                        options={[
                            { value: '', label: panel.producto_id ? 'Unidad…' : '—' },
                            ...unidadesPanel,
                        ]}
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
                        label="Costo"
                        type="number"
                        min="0"
                        step="any"
                        value={panel.costo_unitario}
                        onChange={(e) => setPanelCampo({ costo_unitario: e.target.value })}
                        className="text-center"
                    />
                </div>

                <Button type="button" onClick={agregarProducto} className="mt-4 w-full justify-center md:w-auto md:min-w-[280px]">
                    <Plus className="h-4 w-4" /> Agregar Producto
                </Button>
            </div>

            {/* Productos agregados */}
            <div className="mb-6 rounded-xl border border-edge bg-white shadow-sm">
                <div className="flex items-center justify-between border-b border-edge px-5 py-3">
                    <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-warm-900">
                        <Package className="h-4 w-4 text-primary-600" /> Productos
                    </h2>
                    <span className="text-xs text-warm-500">
                        {items.length} {items.length === 1 ? 'ítem agregado' : 'ítems agregados'}
                    </span>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[820px] text-sm">
                        <thead>
                            <tr className="bg-primary-600 text-left text-xs font-semibold uppercase tracking-wide text-white">
                                <th className="px-3 py-2.5 text-center">#</th>
                                <th className="px-3 py-2.5">Código</th>
                                <th className="px-3 py-2.5">Producto</th>
                                <th className="px-3 py-2.5">Unidad</th>
                                <th className="px-3 py-2.5 text-right">Cant</th>
                                <th className="px-3 py-2.5 text-right">Costo</th>
                                <th className="px-3 py-2.5 text-right">Subtotal</th>
                                <th className="px-3 py-2.5 text-center">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {items.length === 0 && (
                                <tr>
                                    <td colSpan={8} className="px-3 py-10 text-center text-sm text-warm-500">
                                        Busca un producto arriba para agregarlo a la compra
                                    </td>
                                </tr>
                            )}

                            {items.map((it, i) => {
                                const producto = productoDe(it.producto_id);
                                const sub = (Number(it.cantidad) || 0) * (Number(it.costo_unitario) || 0);

                                return (
                                    <tr key={i}>
                                        <td className="px-3 py-2 text-center text-warm-500">{i + 1}</td>
                                        <td className="px-3 py-2 font-medium text-warm-900">{producto?.codigo ?? '—'}</td>
                                        <td className="px-3 py-2 font-semibold text-warm-900">{producto?.nombre ?? '—'}</td>
                                        <td className="px-3 py-2">
                                            <Select
                                                value={it.producto_presentacion_id}
                                                onChange={(e) => cambiarUnidadItem(i, e.target.value)}
                                                options={unidadesDe(it.producto_id)}
                                                aria-label="Unidad"
                                                className="min-w-[120px]"
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
                                                value={it.costo_unitario}
                                                onChange={(e) => setItem(i, { costo_unitario: e.target.value })}
                                                aria-label="Costo unitario"
                                                className="text-right"
                                            />
                                        </td>
                                        <td className="px-3 py-2 text-right font-semibold text-primary-600">{money(sub)}</td>
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

            {/* Pagos mixtos + Totales */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
                <div className="space-y-6">
                    {/* Al crédito no se cobra al registrar: la compra genera una
                        cuenta por pagar y ahí se registran los pagos. */}
                    {!esContado ? (
                        <div className="rounded-xl border border-edge bg-white p-5 shadow-sm">
                            <h2 className="mb-2 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-warm-500">
                                <Wallet className="h-4 w-4" /> Pago
                            </h2>
                            <p className="text-sm text-warm-500">
                                Compra al crédito: queda registrada en{' '}
                                <strong className="text-warm-900">Cuentas por Pagar</strong> por{' '}
                                <strong className="text-warm-900">{money(total)}</strong>
                                {form.dias_credito > 0 && ` a ${form.dias_credito} días`}. Los pagos al
                                proveedor se registran desde ahí.
                            </p>
                        </div>
                    ) : (
                    <div className="rounded-xl border border-edge bg-white p-5 shadow-sm">
                        <div className="mb-4 flex items-center justify-between">
                            <h2 className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-warm-500">
                                <Wallet className="h-4 w-4" /> Pago
                            </h2>
                            <button
                                type="button"
                                role="switch"
                                aria-checked={mixto}
                                onClick={alternarMixto}
                                className="inline-flex items-center gap-2 text-xs font-semibold text-warm-500 transition hover:text-warm-900"
                            >
                                Pago mixto
                                <span
                                    className={`relative block h-5 w-9 rounded-full transition ${mixto ? 'bg-primary-600' : 'bg-gray-300'}`}
                                >
                                    <span
                                        className={`absolute top-0.5 block h-4 w-4 rounded-full bg-white shadow transition-all ${mixto ? 'left-[1.125rem]' : 'left-0.5'}`}
                                    />
                                </span>
                            </button>
                        </div>

                        {/* Modo simple: un método y listo. */}
                        {!mixto && (
                            <div className="space-y-3">
                                <MetodoCajaPicker
                                    cuentas={cuentas}
                                    billeteras={billeteras}
                                    tipo={pagos[0].tipo}
                                    cuentaId={pagos[0].cuentaId}
                                    billeteraId={pagos[0].billeteraId}
                                    onChange={({ tipo, cuentaId, billeteraId }) => setPago(0, { tipo, cuentaId, billeteraId })}
                                />

                                {esContado ? (
                                    <div className="flex items-center justify-between rounded-lg bg-primary-50 px-3 py-2.5 text-sm">
                                        <span className="text-warm-500">Se paga el total</span>
                                        <span className="font-bold text-primary-700">{money(total)}</span>
                                    </div>
                                ) : (
                                    <Input
                                        label="Adelanto (opcional)"
                                        type="number"
                                        min="0"
                                        step="any"
                                        placeholder="0.00"
                                        value={pagos[0].monto}
                                        onChange={(e) => setPago(0, { monto: e.target.value })}
                                        className="text-right"
                                    />
                                )}
                            </div>
                        )}

                        {/* Modo mixto: varios métodos con su monto. */}
                        {mixto && (
                            <>
                                <div className="space-y-3">
                                    {pagos.map((p, i) => (
                                        <div key={i} className="rounded-lg border border-edge p-3">
                                            <MetodoCajaPicker
                                                cuentas={cuentas} billeteras={billeteras}
                                                tipo={p.tipo} cuentaId={p.cuentaId} billeteraId={p.billeteraId}
                                                onChange={({ tipo, cuentaId, billeteraId }) => setPago(i, { tipo, cuentaId, billeteraId })}
                                            />
                                            <div className="mt-2 flex items-center gap-2">
                                                <Input type="number" min="0" step="any" placeholder="Monto" value={p.monto} onChange={(e) => setPago(i, { monto: e.target.value })} className="text-right" />
                                                <button type="button" onClick={() => removePago(i)} disabled={pagos.length === 1}
                                                    className="rounded-md p-2 text-red-600 transition hover:bg-red-50 disabled:opacity-40" aria-label="Quitar">
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <Button type="button" variant="ghost" size="sm" onClick={addPago} className="mt-3">
                                    <Plus className="h-4 w-4" /> Agregar pago
                                </Button>

                                <div className="mt-3 flex justify-between border-t border-dashed border-edge pt-2 text-sm">
                                    <span className="text-warm-500">Pagado</span>
                                    <span className="font-semibold text-green-600">{money(pagado)}</span>
                                </div>
                                {Math.abs(saldo) > 0.001 && (
                                    <div className="flex justify-between text-sm">
                                        <span className="text-warm-500">{saldo > 0 ? 'Saldo por pagar' : 'Exceso'}</span>
                                        <span className={saldo > 0 ? 'font-semibold text-amber-600' : 'font-semibold text-red-600'}>{money(Math.abs(saldo))}</span>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                    )}

                    <div className="rounded-xl border border-edge bg-white p-5 shadow-sm">
                        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-warm-500">Observaciones</h2>
                        <textarea
                            rows={3}
                            value={form.observaciones}
                            onChange={(e) => setField('observaciones', e.target.value)}
                            placeholder="Notas internas de esta compra…"
                            className="block w-full resize-none rounded-lg border-0 bg-white p-3 text-sm text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-primary-600"
                        />
                    </div>
                </div>

                {/* Panel de totales */}
                <div className="lg:sticky lg:top-6 lg:self-start">
                    <div className="rounded-xl border border-edge bg-white p-5 shadow-sm">
                        <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-warm-500">Resumen</h2>
                        <div className="flex justify-between border-b border-dashed border-edge py-2 text-sm">
                            <span className="text-warm-500">Subtotal</span>
                            <span className="font-medium text-warm-900">{money(subtotal)}</span>
                        </div>
                        <div className="flex items-center justify-between border-b border-dashed border-edge py-2 text-sm">
                            <span className="text-warm-500">Flete</span>
                            <input
                                type="number"
                                min="0"
                                step="any"
                                value={form.flete}
                                onChange={(e) => setField('flete', e.target.value)}
                                className="w-28 rounded-md border-0 bg-white px-2 py-1 text-right text-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-primary-600"
                            />
                        </div>
                        <div className="mt-3 flex items-center justify-between border-t border-edge pt-3">
                            <span className="text-sm font-bold uppercase tracking-wide text-primary-700">Total</span>
                            <span className="text-2xl font-extrabold text-warm-900">{money(total)}</span>
                        </div>

                        <div className="mt-5 flex flex-col gap-2">
                            <Button onClick={guardar} loading={saving} className="w-full justify-center">
                                {editando ? 'Guardar cambios' : 'Registrar compra'}
                            </Button>
                            <Button variant="secondary" onClick={() => navigate('/compras')} className="w-full justify-center">
                                Cancelar
                            </Button>
                        </div>
                        <p className="mt-3 text-xs text-gray-400">
                            La compra registra el comprobante y el pago. El stock ingresa al almacén desde Recepciones.
                        </p>
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
