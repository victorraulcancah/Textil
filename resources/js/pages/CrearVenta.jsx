import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Package, Plus, ReceiptText, Trash2, Wallet } from 'lucide-react';
import api, { asList } from '../lib/api';
import { opcionesAlmacen } from '../lib/almacenes';
import { useToast } from '../lib/toast';
import { useAuth } from '../lib/auth';
import Layout from '../components/Layout';
import MetodoCajaPicker from '../components/MetodoCajaPicker';
import ProductoPickerModal from '../components/ProductoPickerModal';
import { Alert, Button, Input, SearchSelect, Select, Spinner } from '../components/ui';

const money = (n) =>
    new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(Number(n) || 0);

const num = (n) => new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 }).format(Number(n) || 0);

const hoy = () => new Date().toISOString().slice(0, 10);

/** Venta al paso: no se identifica al comprador. */
const CLIENTE_GENERICO = 'Clientes varios';

const panelVacio = { producto_id: '', producto_presentacion_id: '', cantidad: '1', precio_unitario: '0' };
const emptyPago = () => ({ tipo: 'efectivo', cuentaId: '', billeteraId: '', monto: '' });

export default function CrearVenta() {
    const toast = useToast();
    const navigate = useNavigate();
    const { user } = useAuth();
    /** Con id en la URL se edita una venta existente; sin id, se crea una nueva. */
    const { id: ventaId } = useParams();
    const editando = Boolean(ventaId);

    const [clientes, setClientes] = useState([]);
    const [almacenes, setAlmacenes] = useState([]);
    const [productos, setProductos] = useState([]);
    const [existencias, setExistencias] = useState([]);
    const [cuentas, setCuentas] = useState([]);
    const [billeteras, setBilleteras] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [form, setForm] = useState({
        cliente_id: '',
        almacen_id: '',
        fecha_emision: hoy(),
        tipo_pago: 'contado',
        observaciones: '',
    });

    /** Panel superior de búsqueda/alta. */
    const [panel, setPanel] = useState({ ...panelVacio });
    /** Productos ya agregados a la venta. */
    const [items, setItems] = useState([]);
    /** Buscador avanzado de productos. */
    const [picker, setPicker] = useState({ open: false, query: '' });

    const [pagos, setPagos] = useState([emptyPago()]);
    /** Off = un solo método de pago (el caso normal). On = varios métodos. */
    const [mixto, setMixto] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [cliRes, almRes, prodRes, existRes, cuentasRes, billeterasRes] = await Promise.all([
                api.get('/clientes'),
                api.get('/almacenes'),
                api.get('/productos', { params: { per_page: 500 } }),
                api.get('/existencias'),
                api.get('/cuentas-bancarias'),
                api.get('/billeteras-digitales'),
            ]);
            setClientes(asList(cliRes));
            const listaAlmacenes = asList(almRes);
            setAlmacenes(listaAlmacenes);
            setProductos(asList(prodRes));
            setExistencias(asList(existRes));
            setCuentas(asList(cuentasRes));
            setBilleteras(asList(billeterasRes));

            // Con un solo almacén no tiene sentido hacer elegir.
            if (listaAlmacenes.length === 1) {
                setForm((prev) => ({ ...prev, almacen_id: String(listaAlmacenes[0].id) }));
            }

            // Modo edición: la venta se vuelca al formulario, los ítems y los pagos.
            if (ventaId) {
                const res = await api.get(`/notas-venta/${ventaId}`);
                const venta = res.data?.data ?? res.data;

                setForm({
                    cliente_id: venta.cliente_id ? String(venta.cliente_id) : '',
                    almacen_id: venta.almacen_id ? String(venta.almacen_id) : '',
                    fecha_emision: String(venta.fecha_emision ?? '').slice(0, 10) || hoy(),
                    tipo_pago: venta.tipo_pago ?? 'contado',
                    observaciones: venta.observaciones ?? '',
                });

                setItems(
                    (venta.detalles ?? []).map((d) => ({
                        producto_id: String(d.presentacion?.producto?.id ?? ''),
                        producto_presentacion_id: String(d.producto_presentacion_id),
                        cantidad: String(Number(d.cantidad) || 0),
                        precio_unitario: String(Number(d.precio_unitario) || 0),
                    })),
                );

                // Al crédito el pago es un apunte automático, no un cobro real.
                const cobros = (venta.pagos ?? []).filter((p) => p.forma_pago !== 'credito');
                if (cobros.length) {
                    setPagos(
                        cobros.map((p) => ({
                            tipo: p.forma_pago ?? 'efectivo',
                            cuentaId: p.cuenta_bancaria_id ? String(p.cuenta_bancaria_id) : '',
                            billeteraId: p.billetera_id ? String(p.billetera_id) : '',
                            monto: String(Number(p.monto) || 0),
                        })),
                    );
                    setMixto(cobros.length > 1);
                }
            }
        } catch {
            toast.error('No se pudieron cargar los datos.');
        } finally {
            setLoading(false);
        }
    }, [toast, ventaId]);

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

    /** Stock (en unidad base) de cada producto en el almacén elegido. */
    const stockDelAlmacen = useMemo(() => {
        if (!form.almacen_id) return {};
        return existencias
            .filter((e) => String(e.almacen_id ?? e.almacen?.id) === String(form.almacen_id))
            .reduce((acc, e) => {
                acc[String(e.producto_id)] = Number(e.stock_actual) || 0;
                return acc;
            }, {});
    }, [existencias, form.almacen_id]);

    /** Se vende lo que hay: solo productos con stock en el almacén elegido. */
    const productosDisponibles = useMemo(
        () => productos.filter((p) => (stockDelAlmacen[String(p.id)] ?? 0) > 0),
        [productos, stockDelAlmacen],
    );

    const productosOptions = useMemo(
        () =>
            productosDisponibles.map((p) => ({
                value: String(p.id),
                label: p.nombre,
                keywords: `${p.codigo ?? ''} ${p.codigo_barras ?? ''}`,
            })),
        [productosDisponibles],
    );

    /** Unidades del producto con el disponible ya convertido a esa unidad. */
    const unidadesDe = useCallback(
        (productoId) => {
            const p = productoDe(productoId);
            if (!p) return [];

            const stockBase = stockDelAlmacen[String(p.id)] ?? 0;
            const abrev = p.unidad_medida?.abreviatura ?? '';

            return (p.presentaciones ?? [])
                .filter((pres) => pres.activo !== false)
                .map((pres) => {
                    const factor = Number(pres.factor_conversion) || 1;
                    return {
                        value: String(pres.id),
                        label: pres.nombre,
                        factor,
                        abrev,
                        stockBase,
                        disponible: Math.floor((stockBase / factor) * 100) / 100,
                    };
                });
        },
        [productoDe, stockDelAlmacen],
    );

    const disponibleDe = (productoId, presentacionId) =>
        unidadesDe(productoId).find((u) => String(u.value) === String(presentacionId)) ?? null;

    const productoPanel = productoDe(panel.producto_id);
    const unidadesPanel = unidadesDe(panel.producto_id);
    const disponiblePanel = disponibleDe(panel.producto_id, panel.producto_presentacion_id);

    const setField = (name, value) => setForm((prev) => ({ ...prev, [name]: value }));
    const setPanelCampo = (patch) => setPanel((prev) => ({ ...prev, ...patch }));

    const elegirProducto = (productoId) => {
        const unidades = unidadesDe(productoId);
        const presentacionId = unidades.length === 1 ? unidades[0].value : '';
        setPanel({
            producto_id: productoId,
            producto_presentacion_id: presentacionId,
            cantidad: '1',
            precio_unitario: presentacionId
                ? String(Number(presentacionDe(productoId, presentacionId)?.precio_venta) || 0)
                : '0',
        });
    };

    const elegirUnidad = (presentacionId) =>
        setPanelCampo({
            producto_presentacion_id: presentacionId,
            precio_unitario: String(
                Number(presentacionDe(panel.producto_id, presentacionId)?.precio_venta) || 0,
            ),
        });

    const limpiarPanel = () => setPanel({ ...panelVacio });

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
                        precio_unitario: String(Number(presentacion.precio_venta) || 0),
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
        if (!form.almacen_id) return toast.error('Elige primero el almacén.');
        if (!panel.producto_id) return toast.error('Busca y elige un producto.');
        if (!panel.producto_presentacion_id) return toast.error('Elige la unidad de medida.');
        if (!(Number(panel.cantidad) > 0)) return toast.error('La cantidad debe ser mayor a 0.');

        const nuevo = {
            producto_id: panel.producto_id,
            producto_presentacion_id: panel.producto_presentacion_id,
            cantidad: panel.cantidad,
            precio_unitario: panel.precio_unitario || '0',
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

    /** Cambiar la unidad de una fila trae el precio de venta de esa presentación. */
    const cambiarUnidadItem = (i, presentacionId) =>
        setItem(i, {
            producto_presentacion_id: presentacionId,
            precio_unitario: String(
                Number(presentacionDe(items[i].producto_id, presentacionId)?.precio_venta) || 0,
            ),
        });

    const quitarItem = (i) => setItems((prev) => prev.filter((_, idx) => idx !== i));

    const setPago = (i, patch) => setPagos((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
    const addPago = () => setPagos((prev) => [...prev, emptyPago()]);
    const removePago = (i) => setPagos((prev) => (prev.length === 1 ? prev : prev.filter((_, idx) => idx !== i)));

    const total = items.reduce(
        (acc, it) => acc + (Number(it.cantidad) || 0) * (Number(it.precio_unitario) || 0),
        0,
    );
    const esContado = form.tipo_pago === 'contado';

    /** En modo simple hay un solo pago que cubre el total. */
    const pagosEfectivos = mixto ? pagos : [{ ...pagos[0], monto: String(total) }];
    const pagado = pagosEfectivos.reduce((acc, p) => acc + (Number(p.monto) || 0), 0);
    const saldo = total - pagado;

    const alternarMixto = () => {
        setMixto((prev) => {
            if (!prev && !Number(pagos[0].monto)) {
                setPagos((ps) => ps.map((p, i) => (i === 0 ? { ...p, monto: String(total) } : p)));
            }
            if (prev) setPagos((ps) => ps.slice(0, 1));
            return !prev;
        });
    };

    const guardar = async () => {
        if (items.length === 0) return toast.error('Agrega al menos un producto.');
        if (!form.almacen_id) return toast.error('Selecciona el almacén.');
        if (form.tipo_pago === 'credito' && !form.cliente_id) {
            return toast.error('Para una venta al crédito debes seleccionar un cliente.');
        }

        // El stock se descuenta al vender: se avisa aquí antes de que falle el backend.
        const sinStock = items.find((it) => {
            const u = disponibleDe(it.producto_id, it.producto_presentacion_id);
            return u && Number(it.cantidad) > u.disponible;
        });
        if (sinStock) {
            const u = disponibleDe(sinStock.producto_id, sinStock.producto_presentacion_id);
            const nombre = productoDe(sinStock.producto_id)?.nombre ?? 'El producto';
            return toast.error(`"${nombre}" solo tiene ${num(u.disponible)} disponibles.`);
        }

        setSaving(true);

        const detalles = items.map((it) => {
            const cantidad = Number(it.cantidad) || 0;
            const precio = Number(it.precio_unitario) || 0;
            return {
                producto_presentacion_id: it.producto_presentacion_id,
                cantidad,
                precio_unitario: precio,
                descuento: 0,
                subtotal: Math.round(cantidad * precio * 100) / 100,
            };
        });

        const pagosPayload = esContado
            ? pagosEfectivos
                  .filter((p) => p.tipo && Number(p.monto) > 0)
                  .map((p) => ({
                      metodo_pago_id: null,
                      forma_pago: p.tipo,
                      cuenta_bancaria_id: p.tipo === 'transferencia' ? p.cuentaId || null : null,
                      billetera_id: p.tipo === 'billetera' ? p.billeteraId || null : null,
                      monto: Number(p.monto),
                      fecha: form.fecha_emision,
                      referencia: null,
                  }))
            : [{ metodo_pago_id: null, forma_pago: 'credito', monto: total, fecha: form.fecha_emision, referencia: null }];

        if (pagosPayload.length === 0) {
            toast.error('Indica el método de pago.');
            setSaving(false);
            return;
        }

        try {
            const cuerpo = {
                cliente_id: form.cliente_id || null,
                almacen_id: form.almacen_id,
                vendedor_id: user?.id,
                fecha_emision: form.fecha_emision,
                moneda: 'PEN',
                tipo_pago: form.tipo_pago,
                subtotal: total,
                descuento_total: 0,
                total,
                observaciones: form.observaciones,
                serie: 'NV01',
                detalles,
                pagos: pagosPayload,
            };

            if (editando) {
                await api.put(`/notas-venta/${ventaId}`, cuerpo);
            } else {
                await api.post('/notas-venta', cuerpo);
            }

            toast.success(
                editando
                    ? 'Venta actualizada. Stock y caja recalculados.'
                    : 'Venta registrada. Stock descontado del almacén.',
            );
            navigate('/notas-venta');
        } catch (err) {
            const msg = err.response?.data?.message;
            const firstErr = err.response?.data?.errors
                ? Object.values(err.response.data.errors)[0]?.[0]
                : null;
            toast.error(firstErr ?? msg ?? 'No se pudo registrar la venta.');
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
                    onClick={() => navigate('/notas-venta')}
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-edge text-gray-500 transition hover:bg-gray-50 hover:text-gray-800"
                    aria-label="Volver"
                >
                    <ArrowLeft className="h-4 w-4" />
                </button>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
                    <ReceiptText className="h-5 w-5" />
                </div>
                <div>
                    <h1 className="text-xl font-bold tracking-tight text-warm-900">
                        {editando ? 'Editar Venta' : 'Nueva Venta'}
                    </h1>
                    <p className="text-sm text-warm-500">Nota de venta y registro del cobro</p>
                </div>
            </div>

            {/* Datos de la venta */}
            <div className="mb-6 rounded-xl border border-edge bg-white shadow-sm">
                <div className="border-b border-edge px-5 py-3">
                    <h2 className="text-xs font-bold uppercase tracking-wide text-warm-500">Datos de la venta</h2>
                </div>
                <div className="grid grid-cols-2 gap-4 p-5 md:grid-cols-4">
                    <Input
                        label="Fecha"
                        type="date"
                        value={form.fecha_emision}
                        onChange={(e) => setField('fecha_emision', e.target.value)}
                    />
                    <div className="md:col-span-2">
                        <SearchSelect
                            label={esContado ? 'Cliente (opcional)' : 'Cliente'}
                            value={form.cliente_id}
                            onChange={(v) => setField('cliente_id', v)}
                            options={clientes.map((c) => ({
                                value: String(c.id),
                                label: c.nombre ?? c.razon_social ?? `#${c.id}`,
                                keywords: c.numero_documento ?? '',
                            }))}
                            placeholder={CLIENTE_GENERICO}
                            emptyText="Sin coincidencias"
                        />
                        {/* Sin cliente la venta va al genérico; a crédito no se puede. */}
                        {!form.cliente_id && (
                            <p
                                className={`mt-1 text-xs ${esContado ? 'text-warm-500' : 'text-red-600'}`}
                            >
                                {esContado
                                    ? `Sin cliente se registra como "${CLIENTE_GENERICO}".`
                                    : 'Una venta al crédito necesita un cliente identificado.'}
                            </p>
                        )}
                    </div>
                    <Select
                        label="Almacén"
                        value={form.almacen_id}
                        // Cambiar de almacén invalida los productos ya elegidos.
                        onChange={(e) => {
                            setField('almacen_id', e.target.value);
                            setItems([]);
                            limpiarPanel();
                        }}
                        options={[
                            { value: '', label: 'Selecciona…' },
                            ...opcionesAlmacen(almacenes, form.almacen_id),
                        ]}
                    />
                    <Select
                        label="Tipo de pago"
                        value={form.tipo_pago}
                        onChange={(e) => setField('tipo_pago', e.target.value)}
                        options={[
                            { value: 'contado', label: 'Contado' },
                            { value: 'credito', label: 'Crédito' },
                        ]}
                    />
                </div>
            </div>

            {/* Panel de búsqueda y alta de producto */}
            <div className="mb-6 rounded-xl border border-edge bg-white p-5 shadow-sm">
                <h2 className="mb-3 text-sm font-semibold text-warm-900">Buscar Producto</h2>

                {!form.almacen_id ? (
                    <Alert variant="info">Elige un almacén para ver los productos con stock.</Alert>
                ) : (
                    <>
                        <SearchSelect
                            value={panel.producto_id}
                            onChange={elegirProducto}
                            options={productosOptions}
                            placeholder="Buscar producto por nombre o código…"
                            emptyText="Sin productos con stock en este almacén"
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
                                <label className="mb-1 block text-sm font-medium text-gray-700">Disponible</label>
                                <input
                                    readOnly
                                    value={disponiblePanel ? num(disponiblePanel.disponible) : ''}
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
                                label="Precio"
                                type="number"
                                min="0"
                                step="any"
                                value={panel.precio_unitario}
                                onChange={(e) => setPanelCampo({ precio_unitario: e.target.value })}
                                className="text-center"
                            />
                        </div>

                        <Button
                            type="button"
                            onClick={agregarProducto}
                            className="mt-4 w-full justify-center md:w-auto md:min-w-[280px]"
                        >
                            <Plus className="h-4 w-4" /> Agregar Producto
                        </Button>
                    </>
                )}
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
                    <table className="w-full min-w-[880px] text-sm">
                        <thead>
                            <tr className="bg-primary-600 text-left text-xs font-semibold uppercase tracking-wide text-white">
                                <th className="w-12 px-3 py-2.5 text-center">#</th>
                                <th className="w-28 px-3 py-2.5">Código</th>
                                <th className="px-3 py-2.5">Producto</th>
                                <th className="w-36 px-3 py-2.5">Unidad</th>
                                <th className="w-24 px-3 py-2.5 text-right">Disp.</th>
                                <th className="w-28 px-3 py-2.5 text-right">Cant</th>
                                <th className="w-28 px-3 py-2.5 text-right">Precio</th>
                                <th className="w-28 px-3 py-2.5 text-right">Subtotal</th>
                                <th className="w-16 px-3 py-2.5 text-center">—</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {items.length === 0 && (
                                <tr>
                                    <td colSpan={9} className="px-3 py-10 text-center text-sm text-warm-500">
                                        Busca un producto arriba para agregarlo a la venta
                                    </td>
                                </tr>
                            )}

                            {items.map((it, i) => {
                                const producto = productoDe(it.producto_id);
                                const u = disponibleDe(it.producto_id, it.producto_presentacion_id);
                                const excede = u && Number(it.cantidad) > u.disponible;
                                const sub = (Number(it.cantidad) || 0) * (Number(it.precio_unitario) || 0);

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
                                            />
                                        </td>
                                        <td className="px-3 py-2 text-right text-warm-500">
                                            {u ? num(u.disponible) : '—'}
                                        </td>
                                        <td className="px-3 py-2">
                                            <Input
                                                type="number"
                                                min="0"
                                                step="any"
                                                value={it.cantidad}
                                                onChange={(e) => setItem(i, { cantidad: e.target.value })}
                                                aria-label="Cantidad"
                                                error={excede ? 'Sin stock' : undefined}
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

            {/* Cobro + Totales */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
                <div className="space-y-6">
                    <div className="rounded-xl border border-edge bg-white p-5 shadow-sm">
                        <div className="mb-4 flex items-center justify-between">
                            <h2 className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-warm-500">
                                <Wallet className="h-4 w-4" /> Cobro
                            </h2>
                            {esContado && (
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
                            )}
                        </div>

                        {!esContado ? (
                            <Alert variant="info">
                                Venta al crédito: queda como cuenta por cobrar del cliente, sin cobro ahora.
                            </Alert>
                        ) : !mixto ? (
                            <div className="space-y-3">
                                <MetodoCajaPicker
                                    cuentas={cuentas}
                                    billeteras={billeteras}
                                    tipo={pagos[0].tipo}
                                    cuentaId={pagos[0].cuentaId}
                                    billeteraId={pagos[0].billeteraId}
                                    onChange={({ tipo, cuentaId, billeteraId }) =>
                                        setPago(0, { tipo, cuentaId, billeteraId })
                                    }
                                />
                                <div className="flex items-center justify-between rounded-lg bg-primary-50 px-3 py-2.5 text-sm">
                                    <span className="text-warm-500">Se cobra el total</span>
                                    <span className="font-bold text-primary-700">{money(total)}</span>
                                </div>
                            </div>
                        ) : (
                            <>
                                <div className="space-y-3">
                                    {pagos.map((p, i) => (
                                        <div key={i} className="rounded-lg border border-edge p-3">
                                            <MetodoCajaPicker
                                                cuentas={cuentas}
                                                billeteras={billeteras}
                                                tipo={p.tipo}
                                                cuentaId={p.cuentaId}
                                                billeteraId={p.billeteraId}
                                                onChange={({ tipo, cuentaId, billeteraId }) =>
                                                    setPago(i, { tipo, cuentaId, billeteraId })
                                                }
                                            />
                                            <div className="mt-2 flex items-center gap-2">
                                                <Input
                                                    type="number"
                                                    min="0"
                                                    step="any"
                                                    placeholder="Monto"
                                                    value={p.monto}
                                                    onChange={(e) => setPago(i, { monto: e.target.value })}
                                                    className="text-right"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => removePago(i)}
                                                    disabled={pagos.length === 1}
                                                    className="rounded-md p-2 text-red-600 transition hover:bg-red-50 disabled:opacity-40"
                                                    aria-label="Quitar"
                                                >
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
                                    <span className="text-warm-500">Cobrado</span>
                                    <span className="font-semibold text-green-600">{money(pagado)}</span>
                                </div>
                                {Math.abs(saldo) > 0.001 && (
                                    <div className="flex justify-between text-sm">
                                        <span className="text-warm-500">{saldo > 0 ? 'Falta cobrar' : 'Vuelto'}</span>
                                        <span
                                            className={
                                                saldo > 0
                                                    ? 'font-semibold text-amber-600'
                                                    : 'font-semibold text-red-600'
                                            }
                                        >
                                            {money(Math.abs(saldo))}
                                        </span>
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                    <div className="rounded-xl border border-edge bg-white p-5 shadow-sm">
                        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-warm-500">Observaciones</h2>
                        <textarea
                            rows={3}
                            value={form.observaciones}
                            onChange={(e) => setField('observaciones', e.target.value)}
                            placeholder="Notas de esta venta…"
                            className="block w-full resize-none rounded-lg border-0 bg-white p-3 text-sm text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-primary-600"
                        />
                    </div>
                </div>

                {/* Panel de totales */}
                <div className="lg:sticky lg:top-6 lg:self-start">
                    <div className="rounded-xl border border-edge bg-white p-5 shadow-sm">
                        <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-warm-500">Resumen</h2>
                        <div className="flex items-center justify-between border-b border-dashed border-edge pb-2 text-sm">
                            <span className="text-warm-500">Cliente</span>
                            <span className="max-w-[180px] truncate font-medium text-warm-900">
                                {clientes.find((c) => String(c.id) === String(form.cliente_id))?.nombre ??
                                    CLIENTE_GENERICO}
                            </span>
                        </div>
                        <div className="mt-1 flex items-center justify-between border-t border-edge pt-3">
                            <span className="text-sm font-bold uppercase tracking-wide text-primary-700">Total</span>
                            <span className="text-2xl font-extrabold text-warm-900">{money(total)}</span>
                        </div>

                        <div className="mt-5 flex flex-col gap-2">
                            <Button onClick={guardar} loading={saving} className="w-full justify-center">
                                {editando ? 'Guardar cambios' : 'Registrar venta'}
                            </Button>
                            <Button
                                variant="secondary"
                                onClick={() => navigate('/notas-venta')}
                                className="w-full justify-center"
                            >
                                Cancelar
                            </Button>
                        </div>
                        <p className="mt-3 text-xs text-gray-400">
                            Al registrar la venta se descuenta el stock del almacén elegido.
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
                productos={productosDisponibles}
                stockPorProducto={stockDelAlmacen}
                title="Buscar productos"
            />
        </Layout>
    );
}
