import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ClipboardList, Plus, Trash2 } from 'lucide-react';
import api, { asList } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import Layout from '../components/Layout';
import ProductoPickerModal from '../components/ProductoPickerModal';
import { Alert, Button, Input, SearchSelect, Select, Spinner } from '../components/ui';

const num = (n) => new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 }).format(Number(n) || 0);
const money = (n) =>
    new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(Number(n) || 0);

const hoy = () => new Date().toISOString().slice(0, 10);

/**
 * Alta y edición del pedido: lo que pide el cliente.
 *
 * Se pide por producto y cantidad —"120 metros de Polinán negro"— y no por
 * rollos concretos: el vendedor no puede saber qué piezas hay en el rack ni en
 * qué almacén están. Eso lo resuelve el almacenero al preparar el pedido,
 * escaneando los rollos con los que lo cubre.
 *
 * Por lo mismo aquí no se elige almacén.
 */
export default function CrearPedido() {
    const { id } = useParams();
    const navigate = useNavigate();
    const toast = useToast();
    const { user } = useAuth();

    const [clientes, setClientes] = useState([]);
    const [productos, setProductos] = useState([]);
    /** Stock disponible por producto, en unidad base. */
    const [stockPorProducto, setStockPorProducto] = useState({});
    /** Filas de existencias (producto × almacén, con metros por color). */
    const [existencias, setExistencias] = useState([]);
    const [cargando, setCargando] = useState(true);
    const [guardando, setGuardando] = useState(false);
    const [errores, setErrores] = useState({});

    const [cabecera, setCabecera] = useState({
        cliente_id: '',
        fecha_emision: hoy(),
        fecha_entrega: '',
        observaciones: '',
    });

    /** Líneas ya agregadas al pedido. */
    const [lineas, setLineas] = useState([]);

    /** Buscador avanzado: se abre con lo que ya se haya escrito arriba. */
    const [picker, setPicker] = useState({ open: false, query: '' });

    /** El renglón de arriba, donde se arma la línea antes de agregarla. */
    const [nueva, setNueva] = useState({
        producto_id: '',
        producto_presentacion_id: '',
        descripcion: '',
        cantidad: '',
        precio_unitario: '',
    });

    /* ------------------------------ carga ------------------------------ */

    useEffect(() => {
        (async () => {
            try {
                const [clientesRes, productosRes, existenciasRes] = await Promise.all([
                    api.get('/clientes'),
                    api.get('/productos', { params: { per_page: 500 } }),
                    api.get('/existencias'),
                ]);

                setClientes(asList(clientesRes));
                setProductos(asList(productosRes));

                // El stock se suma de todos los almacenes: el vendedor no elige
                // desde cuál sale, así que lo que le importa es si hay o no.
                const porProducto = {};
                for (const fila of asList(existenciasRes)) {
                    const pid = fila.producto?.id ?? fila.producto_id;
                    if (!pid) continue;
                    porProducto[pid] = (porProducto[pid] ?? 0) + Number(fila.stock_actual || 0);
                }
                setStockPorProducto(porProducto);
                // Las filas completas, para que el buscador muestre el stock de
                // cada almacén y por color.
                setExistencias(asList(existenciasRes));

                if (id) {
                    const { data } = await api.get(`/ordenes-venta/${id}`);
                    const p = data?.data ?? data;

                    if (!p.editable) {
                        toast.error('Este pedido ya no es editable.');
                        navigate('/pedidos');
                        return;
                    }

                    setCabecera({
                        cliente_id: p.cliente_id ? String(p.cliente_id) : '',
                        fecha_emision: p.fecha_emision,
                        fecha_entrega: p.fecha_entrega ?? '',
                        observaciones: p.observaciones ?? '',
                    });

                    setLineas(
                        (p.detalles ?? []).map((d) => ({
                            producto_presentacion_id: String(d.producto_presentacion_id),
                            producto: d.producto,
                            presentacion: d.presentacion,
                            descripcion: d.descripcion ?? '',
                            cantidad: String(d.cantidad),
                            precio_unitario: String(d.precio_unitario),
                        })),
                    );
                }
            } catch {
                toast.error('No se pudieron cargar los datos del pedido.');
            } finally {
                setCargando(false);
            }
        })();
    }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

    /* ------------------------------ renglón ------------------------------ */

    const producto = useMemo(
        () => productos.find((p) => String(p.id) === String(nueva.producto_id)) ?? null,
        [productos, nueva.producto_id],
    );

    const presentaciones = useMemo(
        () => (producto?.presentaciones ?? []).filter((p) => p.activo !== false),
        [producto],
    );

    const presentacion = useMemo(
        () => presentaciones.find((p) => String(p.id) === String(nueva.producto_presentacion_id)) ?? null,
        [presentaciones, nueva.producto_presentacion_id],
    );

    /** El stock del producto, expresado en la unidad elegida. */
    const stockEnUnidad = useMemo(() => {
        if (!producto) return null;
        const base = stockPorProducto[producto.id] ?? 0;
        const factor = Number(presentacion?.factor_conversion) || 1;
        return base / factor;
    }, [producto, presentacion, stockPorProducto]);

    /**
     * Al elegir producto se propone el formato en que se vende normalmente.
     *
     * El metro si la tela lo tiene, porque es como se pide la tela; si no, el
     * más pequeño. Proponer el menor a secas dejaba "Retazo (saldo)", que es
     * un formato para restos y nadie pide así.
     */
    useEffect(() => {
        if (!producto) return;

        const activas = (producto.presentaciones ?? []).filter((p) => p.activo !== false);
        const porMetro = activas.find(
            (p) => (p.unidad_base?.abreviatura ?? '').toLowerCase() === 'm',
        );
        const menor = [...activas].sort(
            (a, b) => (Number(a.factor_conversion) || 1) - (Number(b.factor_conversion) || 1),
        )[0];
        const elegida = porMetro ?? menor;

        setNueva((prev) => ({
            ...prev,
            producto_presentacion_id: elegida ? String(elegida.id) : '',
            precio_unitario: elegida?.precio_venta != null ? String(elegida.precio_venta) : '',
        }));
    }, [producto]);

    // Cambiar de formato cambia el precio sugerido.
    useEffect(() => {
        if (!presentacion) return;
        setNueva((prev) => ({
            ...prev,
            precio_unitario: presentacion.precio_venta != null ? String(presentacion.precio_venta) : prev.precio_unitario,
        }));
    }, [presentacion?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    const puedeAgregar =
        nueva.producto_presentacion_id && Number(nueva.cantidad) > 0 && Number(nueva.precio_unitario) >= 0;

    const agregar = () => {
        if (!puedeAgregar) return;

        setLineas((prev) => [
            ...prev,
            {
                producto_presentacion_id: nueva.producto_presentacion_id,
                producto: producto?.nombre,
                presentacion: presentacion?.nombre,
                descripcion: nueva.descripcion.trim(),
                cantidad: nueva.cantidad,
                precio_unitario: nueva.precio_unitario,
            },
        ]);

        setNueva({
            producto_id: '',
            producto_presentacion_id: '',
            descripcion: '',
            cantidad: '',
            precio_unitario: '',
        });
    };

    /**
     * Alta en lote desde el buscador avanzado. Lo que ya está en el pedido no
     * se duplica: se le suma la cantidad, igual que en la nota de venta.
     */
    const agregarDesdePicker = (seleccionados) => {
        const utiles = seleccionados.filter((s) => s.presentacion && s.cantidad > 0);
        if (!utiles.length) return;

        setLineas((prev) => {
            const next = [...prev];

            utiles.forEach(({ producto, presentacion, cantidad }) => {
                const i = next.findIndex(
                    (l) => String(l.producto_presentacion_id) === String(presentacion.id),
                );

                if (i !== -1) {
                    next[i] = {
                        ...next[i],
                        cantidad: String((Number(next[i].cantidad) || 0) + cantidad),
                    };
                    return;
                }

                next.push({
                    producto_presentacion_id: String(presentacion.id),
                    producto: producto.nombre,
                    presentacion: presentacion.nombre,
                    descripcion: '',
                    cantidad: String(cantidad),
                    precio_unitario: String(Number(presentacion.precio_venta) || 0),
                });
            });

            return next;
        });

        setPicker((prev) => ({ ...prev, open: false }));
        toast.success(
            utiles.length === 1 ? 'Producto agregado al pedido.' : `${utiles.length} productos agregados al pedido.`,
        );
    };

    const cambiar = (i, campo, valor) =>
        setLineas((prev) => prev.map((l, j) => (j === i ? { ...l, [campo]: valor } : l)));

    const quitar = (i) => setLineas((prev) => prev.filter((_, j) => j !== i));

    const total = useMemo(
        () => lineas.reduce((s, l) => s + (Number(l.cantidad) || 0) * (Number(l.precio_unitario) || 0), 0),
        [lineas],
    );

    /* ------------------------------ guardar ------------------------------ */

    const guardar = async () => {
        setGuardando(true);
        setErrores({});

        try {
            const cuerpo = {
                ...cabecera,
                cliente_id: cabecera.cliente_id || null,
                fecha_entrega: cabecera.fecha_entrega || null,
                vendedor_id: user?.id,
                detalles: lineas.map((l) => ({
                    producto_presentacion_id: Number(l.producto_presentacion_id),
                    cantidad: Number(l.cantidad) || 0,
                    precio_unitario: Number(l.precio_unitario) || 0,
                    descripcion: l.descripcion || null,
                })),
            };

            if (id) {
                await api.put(`/ordenes-venta/${id}`, cuerpo);
                toast.success('Pedido actualizado.');
            } else {
                await api.post('/ordenes-venta', cuerpo);
                toast.success('Pedido creado. Solicítalo al almacén para que lo preparen.');
            }
            navigate('/pedidos');
        } catch (err) {
            if (err.response?.status === 422) {
                const v = err.response.data?.errors ?? {};
                setErrores(v);
                const primero = Object.values(v)[0]?.[0];
                if (primero) toast.error(primero);
            } else {
                toast.error(err.response?.data?.message ?? 'No se pudo guardar el pedido.');
            }
        } finally {
            setGuardando(false);
        }
    };

    if (cargando) {
        return (
            <Layout>
                <div className="flex justify-center py-24">
                    <Spinner size="lg" className="text-primary-600" />
                </div>
            </Layout>
        );
    }

    return (
        <Layout>
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-100 text-primary-700">
                        <ClipboardList className="h-5 w-5" />
                    </span>
                    <div>
                        <h1 className="text-xl font-bold text-warm-900">
                            {id ? 'Editar pedido' : 'Nuevo pedido'}
                        </h1>
                        <p className="text-sm text-warm-500">
                            Lo que pide el cliente. El almacén decide después con qué rollos lo cubre.
                        </p>
                    </div>
                </div>
                <Button variant="secondary" onClick={() => navigate('/pedidos')}>
                    <ArrowLeft className="h-4 w-4" />
                    Volver
                </Button>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1fr_22rem] lg:items-start *:min-w-0">
                {/* ── Productos ───────────────────────────────────────── */}
                <section className="rounded-xl border border-edge bg-white p-5 shadow-sm">
                    <h2 className="text-base font-semibold text-warm-900">Productos</h2>
                    <p className="mb-4 text-sm text-warm-500">
                        {lineas.length} producto{lineas.length === 1 ? '' : 's'} agregado
                        {lineas.length === 1 ? '' : 's'}
                    </p>

                    <div className="space-y-4">
                        <SearchSelect
                            label="Buscar producto"
                            placeholder="Nombre o código…"
                            value={nueva.producto_id}
                            onChange={(v) => setNueva((prev) => ({ ...prev, producto_id: v }))}
                            options={productos.map((p) => ({
                                value: String(p.id),
                                label: p.nombre,
                                keywords: p.codigo,
                            }))}
                            searchTitle="Buscador avanzado con filtros"
                            onSearch={(q) => setPicker({ open: true, query: q })}
                        />

                        <Input
                            label="Descripción"
                            placeholder="Detalle para esta línea (opcional)"
                            value={nueva.descripcion}
                            onChange={(e) => setNueva((prev) => ({ ...prev, descripcion: e.target.value }))}
                        />

                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                            <Input
                                label="Stock"
                                value={
                                    producto
                                        ? `${num(stockEnUnidad)} ${presentacion?.nombre ?? ''}`.trim()
                                        : ''
                                }
                                readOnly
                                disabled
                            />
                            <Select
                                label="Unidad"
                                value={nueva.producto_presentacion_id}
                                onChange={(e) =>
                                    setNueva((prev) => ({ ...prev, producto_presentacion_id: e.target.value }))
                                }
                                options={[
                                    { value: '', label: producto ? 'Elegir' : '—' },
                                    ...presentaciones.map((p) => ({ value: String(p.id), label: p.nombre })),
                                ]}
                            />
                            <Input
                                label="Cantidad"
                                type="number"
                                step="0.01"
                                min="0"
                                value={nueva.cantidad}
                                onChange={(e) => setNueva((prev) => ({ ...prev, cantidad: e.target.value }))}
                            />
                            <Input
                                label="Precio de venta"
                                type="number"
                                step="0.01"
                                min="0"
                                placeholder="0.00"
                                value={nueva.precio_unitario}
                                onChange={(e) =>
                                    setNueva((prev) => ({ ...prev, precio_unitario: e.target.value }))
                                }
                            />
                        </div>

                        <Button onClick={agregar} disabled={!puedeAgregar}>
                            <Plus className="h-4 w-4" />
                            Agregar producto
                        </Button>
                    </div>

                    {/* Líneas del pedido */}
                    <div className="mt-5 overflow-x-auto rounded-lg border border-edge">
                        <table className="w-full min-w-[640px] text-sm">
                            <thead>
                                <tr className="bg-primary-600 text-left text-xs font-semibold uppercase tracking-wide text-white">
                                    <th className="px-3 py-2">Producto</th>
                                    <th className="px-3 py-2">Presentación</th>
                                    <th className="px-3 py-2 text-right">Cantidad</th>
                                    <th className="px-3 py-2 text-right">Precio de venta</th>
                                    <th className="px-3 py-2 text-right">Subtotal</th>
                                    <th className="w-14 px-3 py-2 text-center">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {lineas.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="px-3 py-10 text-center text-warm-400">
                                            Agrega productos con el buscador de arriba.
                                        </td>
                                    </tr>
                                )}

                                {lineas.map((l, i) => (
                                    <tr key={i}>
                                        <td className="px-3 py-2">
                                            <span className="font-medium text-warm-900">{l.producto}</span>
                                            {l.descripcion && (
                                                <span className="block text-xs text-warm-500">{l.descripcion}</span>
                                            )}
                                            {errores[`detalles.${i}.cantidad`] && (
                                                <span className="block text-xs text-red-600">
                                                    {errores[`detalles.${i}.cantidad`][0]}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-3 py-2">
                                            {(() => {
                                                // La línea no guarda el producto: se deduce de su
                                                // presentación, así funciona también al editar.
                                                const prod = productos.find((p) =>
                                                    (p.presentaciones ?? []).some(
                                                        (pr) => String(pr.id) === String(l.producto_presentacion_id),
                                                    ),
                                                );
                                                const opciones = (prod?.presentaciones ?? []).filter(
                                                    (pr) => pr.activo !== false,
                                                );

                                                if (opciones.length === 0) {
                                                    return <span className="text-warm-600">{l.presentacion}</span>;
                                                }

                                                return (
                                                    <Select
                                                        value={String(l.producto_presentacion_id)}
                                                        aria-label="Presentación"
                                                        // Otra presentación, otro precio: se toma el
                                                        // de venta de la nueva, igual que en la venta.
                                                        onChange={(e) => {
                                                            const elegida = opciones.find(
                                                                (pr) => String(pr.id) === e.target.value,
                                                            );
                                                            setLineas((prev) =>
                                                                prev.map((x, j) =>
                                                                    j === i
                                                                        ? {
                                                                              ...x,
                                                                              producto_presentacion_id: e.target.value,
                                                                              presentacion: elegida?.nombre ?? x.presentacion,
                                                                              precio_unitario:
                                                                                  elegida?.precio_venta != null
                                                                                      ? String(elegida.precio_venta)
                                                                                      : x.precio_unitario,
                                                                          }
                                                                        : x,
                                                                ),
                                                            );
                                                        }}
                                                        options={opciones.map((pr) => ({
                                                            value: String(pr.id),
                                                            label: pr.nombre,
                                                        }))}
                                                    />
                                                );
                                            })()}
                                        </td>
                                        <td className="px-3 py-2 text-right">
                                            <Input
                                                type="number"
                                                step="0.01"
                                                min="0"
                                                value={l.cantidad}
                                                onChange={(e) => cambiar(i, 'cantidad', e.target.value)}
                                                className="w-24 text-right"
                                            />
                                        </td>
                                        <td className="px-3 py-2 text-right">
                                            <Input
                                                type="number"
                                                step="0.01"
                                                min="0"
                                                value={l.precio_unitario}
                                                onChange={(e) => cambiar(i, 'precio_unitario', e.target.value)}
                                                className="w-28 text-right"
                                            />
                                        </td>
                                        <td className="px-3 py-2 text-right font-medium text-warm-900">
                                            {money((Number(l.cantidad) || 0) * (Number(l.precio_unitario) || 0))}
                                        </td>
                                        <td className="px-3 py-2 text-center">
                                            <button
                                                type="button"
                                                aria-label="Quitar"
                                                onClick={() => quitar(i)}
                                                className="rounded-md p-1.5 text-red-600 transition hover:bg-red-50"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>

                {/* ── Pedido y resumen ────────────────────────────────── */}
                <div className="space-y-4">
                    <section className="rounded-xl border border-edge bg-white p-5 shadow-sm">
                        <h2 className="mb-4 text-base font-semibold text-warm-900">Pedido</h2>

                        <div className="space-y-4">
                            <SearchSelect
                                label="Cliente"
                                placeholder="Buscar cliente…"
                                value={cabecera.cliente_id}
                                onChange={(v) => setCabecera((p) => ({ ...p, cliente_id: v }))}
                                options={clientes.map((c) => ({
                                    value: String(c.id),
                                    label: c.nombre,
                                    keywords: c.numero_documento,
                                }))}
                            />
                            <Input
                                label="Fecha"
                                type="date"
                                value={cabecera.fecha_emision}
                                onChange={(e) => setCabecera((p) => ({ ...p, fecha_emision: e.target.value }))}
                                error={errores.fecha_emision?.[0]}
                            />
                            <Input
                                label="Fecha de entrega"
                                type="date"
                                value={cabecera.fecha_entrega}
                                onChange={(e) => setCabecera((p) => ({ ...p, fecha_entrega: e.target.value }))}
                                error={errores.fecha_entrega?.[0]}
                            />
                            <Input
                                label="Observación"
                                placeholder="Referencia…"
                                value={cabecera.observaciones}
                                onChange={(e) => setCabecera((p) => ({ ...p, observaciones: e.target.value }))}
                            />
                        </div>

                        <Alert variant="info" className="mt-4">
                            El almacén no se elige aquí: lo define el almacenero al preparar el pedido,
                            según dónde estén los rollos que use.
                        </Alert>
                    </section>

                    <section className="rounded-xl border border-edge bg-white p-5 shadow-sm">
                        <h2 className="mb-3 text-base font-semibold text-warm-900">Resumen</h2>
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold uppercase tracking-wide text-warm-500">
                                Total del pedido
                            </span>
                            <span className="text-2xl font-bold text-primary-600">{money(total)}</span>
                        </div>
                    </section>

                    <div className="flex justify-end gap-2">
                        <Button variant="secondary" onClick={() => navigate('/pedidos')}>
                            Cancelar
                        </Button>
                        <Button loading={guardando} disabled={!lineas.length} onClick={guardar}>
                            {id ? 'Guardar cambios' : 'Registrar pedido'}
                        </Button>
                    </div>
                </div>
            </div>

            {/* El pedido no se ata a un almacén, así que aquí se lista el
                catálogo entero con el stock sumado de todos los almacenes, y
                se puede pedir incluso lo que está en cero. */}
            <ProductoPickerModal
                open={picker.open}
                onClose={() => setPicker((prev) => ({ ...prev, open: false }))}
                onSelect={agregarDesdePicker}
                initialQuery={picker.query}
                multiple
                productos={productos}
                stockPorProducto={stockPorProducto}
                bloquearSinStock={false}
                // Stock de cada almacén y por color, sin códigos de rollo.
                existencias={existencias}
                title="Buscar productos"
            />
        </Layout>
    );
}
