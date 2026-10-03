import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Eraser, Plus, Repeat, Trash2 } from 'lucide-react';
import api, { asList } from '../lib/api';
import { useToast } from '../lib/toast';
import { opcionesAlmacen, useAlmacenPropio } from '../lib/almacenes';
import { tipoUnidad } from '../lib/unidades';
import Layout from '../components/Layout';
import ColorSelect from '../components/ColorSelect';
import ProductoPickerModal from '../components/ProductoPickerModal';
import { Alert, Button, Input, SearchSelect, Select, Spinner } from '../components/ui';
import { pedidoTexto } from './Requerimientos';

const num = (n) => new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 }).format(Number(n) || 0);

const lineaVacia = { producto_id: '', producto_presentacion_id: '', producto_color_id: '', modo: 'rollos', cantidad: '', conMetraje: false, metros_por_rollo: '' };

/**
 * Nuevo requerimiento de traslado. Mismo diseño que Nuevo pedido y Nueva compra: los productos a la izquierda (buscador,
 * color, cantidad y la tabla) y a la derecha los datos del requerimiento y el resumen. El número (RQ002-001…) lo da el
 * almacén al que se le pide.
 */
export default function CrearRequerimiento() {
    const toast = useToast();
    const navigate = useNavigate();
    const { propioId, superAdmin, almacenNombre } = useAlmacenPropio();

    const [cargando, setCargando] = useState(true);
    const [almacenes, setAlmacenes] = useState([]);
    const [productos, setProductos] = useState([]);
    const [origen, setOrigen] = useState('');
    const [pide, setPide] = useState('');
    const [observaciones, setObservaciones] = useState('');
    const [lineas, setLineas] = useState([]);
    const [nueva, setNueva] = useState(lineaVacia);
    const [guardando, setGuardando] = useState(false);
    /** Buscador avanzado de productos (el mismo de Pedido y Compra). */
    const [picker, setPicker] = useState({ open: false, query: '' });
    const [todasExistencias, setTodasExistencias] = useState([]);

    useEffect(() => {
        (async () => {
            try {
                const [a, p, e] = await Promise.all([
                    api.get('/almacenes'),
                    api.get('/productos', { params: { per_page: 500 } }),
                    api.get('/existencias'),
                ]);
                setAlmacenes(asList(a));
                setProductos(asList(p));
                setTodasExistencias(asList(e));
            } catch {
                toast.error('No se pudieron cargar los almacenes y productos.');
            } finally {
                setCargando(false);
            }
        })();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const pideId = superAdmin ? pide : String(propioId ?? '');
    const producto = useMemo(() => productos.find((p) => String(p.id) === String(nueva.producto_id)) ?? null, [productos, nueva.producto_id]);
    const presentaciones = (producto?.presentaciones ?? []).filter((p) => p.activo !== false);
    const metro = presentaciones.find((p) => tipoUnidad(p) === 'metro') ?? null;
    const esTela = Boolean(metro);

    const elegirProducto = (id) => {
        const pr = productos.find((p) => String(p.id) === String(id));
        const pres = (pr?.presentaciones ?? []).filter((p) => p.activo !== false);
        const tela = pres.some((p) => tipoUnidad(p) === 'metro');
        setNueva({
            ...lineaVacia,
            producto_id: id ?? '',
            modo: tela ? 'rollos' : 'cantidad',
            producto_presentacion_id: !tela && pres.length === 1 ? String(pres[0].id) : '',
        });
    };

    const puedeAgregar =
        Boolean(producto) &&
        Number(nueva.cantidad) > 0 &&
        (esTela ? !(nueva.modo === 'rollos' && nueva.conMetraje && !(Number(nueva.metros_por_rollo) > 0)) && (nueva.modo !== 'rollos' || Number.isInteger(Number(nueva.cantidad))) : Boolean(nueva.producto_presentacion_id));

    /** El stock que se muestra en el buscador es el del almacén al que se le pide. */
    const existencias = useMemo(
        () => todasExistencias.filter((f) => !origen || String(f.almacen_id ?? f.almacen?.id) === String(origen)),
        [todasExistencias, origen],
    );
    const stockPorProducto = useMemo(() => {
        const porProducto = {};
        for (const fila of existencias) {
            const pid = fila.producto?.id ?? fila.producto_id;
            if (!pid) continue;
            porProducto[pid] = (porProducto[pid] ?? 0) + Number(fila.stock_disponible ?? fila.stock_actual ?? 0);
        }
        return porProducto;
    }, [existencias]);

    /** Lo que se marca en el buscador avanzado: una tela por color va en rollos; el resto, en su unidad. */
    const agregarDesdePicker = (seleccionados) => {
        const utiles = seleccionados.filter((x) => x.presentacion && x.cantidad > 0);
        if (!utiles.length) return;

        setLineas((prev) => {
            const next = [...prev];
            utiles.forEach(({ producto: pr, presentacion, cantidad, color, porRollos }) => {
                const tela = pr.presentaciones?.some((q) => tipoUnidad(q) === 'metro');
                const base = {
                    producto_color_id: color ? Number(color.id) : null,
                    nombre: pr.nombre,
                    color: color?.nombre ?? null,
                };
                let l;
                if (tela && porRollos) {
                    l = { ...base, modo: 'rollos', rollos_pedidos: Math.max(1, Math.round(cantidad)), metros_por_rollo: null, producto_presentacion_id: presentacion.id, unidad: presentacion.nombre };
                } else if (tela) {
                    l = { ...base, modo: 'metros', metros_pedidos: cantidad, producto_presentacion_id: presentacion.id, unidad: presentacion.nombre };
                } else {
                    l = { ...base, modo: 'cantidad', cantidad, producto_presentacion_id: presentacion.id, unidad: presentacion.nombre };
                }

                // La misma tela, color y forma de pedirla se suma en vez de duplicarse.
                const i = next.findIndex(
                    (x) =>
                        x.modo === l.modo &&
                        x.producto_presentacion_id === l.producto_presentacion_id &&
                        (x.producto_color_id ?? null) === (l.producto_color_id ?? null) &&
                        !x.metros_por_rollo,
                );
                if (i === -1) return next.push(l);
                if (l.modo === 'rollos') next[i] = { ...next[i], rollos_pedidos: next[i].rollos_pedidos + l.rollos_pedidos };
                else if (l.modo === 'metros') next[i] = { ...next[i], metros_pedidos: next[i].metros_pedidos + l.metros_pedidos };
                else next[i] = { ...next[i], cantidad: next[i].cantidad + l.cantidad };
            });
            return next;
        });
        setPicker((prev) => ({ ...prev, open: false }));
    };

    const agregar = () => {
        if (!puedeAgregar) return toast.error('Completa el producto y la cantidad.');
        const color = (producto.colores ?? []).find((c) => String(c.id) === String(nueva.producto_color_id));
        const cantidad = Number(nueva.cantidad);
        let l;
        if (esTela && nueva.modo === 'rollos') {
            l = {
                modo: 'rollos',
                rollos_pedidos: cantidad,
                metros_por_rollo: nueva.conMetraje ? Number(nueva.metros_por_rollo) : null,
                producto_presentacion_id: metro.id,
            };
        } else if (esTela) {
            l = { modo: 'metros', metros_pedidos: cantidad, producto_presentacion_id: metro.id };
        } else {
            l = { modo: 'cantidad', cantidad, producto_presentacion_id: Number(nueva.producto_presentacion_id) };
        }
        l.producto_color_id = nueva.producto_color_id ? Number(nueva.producto_color_id) : null;
        l.nombre = producto.nombre;
        l.color = color?.nombre ?? null;
        l.unidad = presentaciones.find((p) => String(p.id) === String(l.producto_presentacion_id))?.nombre;
        setLineas((prev) => [...prev, l]);
        setNueva(lineaVacia);
    };

    const guardar = async () => {
        if (!origen) return toast.error('Elige a qué almacén se lo pides.');
        if (superAdmin && !pide) return toast.error('Elige el almacén que pide.');
        if (lineas.length === 0) return toast.error('Agrega al menos un producto.');
        setGuardando(true);
        try {
            const { data } = await api.post('/transferencias/requerimientos', {
                almacen_origen_id: Number(origen),
                almacen_destino_id: superAdmin ? Number(pide) : undefined,
                observaciones: observaciones || undefined,
                detalles: lineas.map(({ nombre, color, unidad, ...l }) => l),
            });
            toast.success(`Requerimiento ${data.requerimiento} enviado a ${data.origen?.nombre}.`);
            navigate('/requerimientos');
        } catch (err) {
            const e = err.response?.data;
            toast.error(e?.message ?? Object.values(e?.errors ?? {})?.[0]?.[0] ?? 'No se pudo crear el requerimiento.');
        } finally {
            setGuardando(false);
        }
    };

    const opcionesOrigen = opcionesAlmacen(almacenes).filter((o) => o.value !== String(pideId));
    const nombreOrigen = opcionesOrigen.find((o) => o.value === String(origen))?.label;

    const rollosTotal = lineas.filter((l) => l.modo === 'rollos').reduce((s, l) => s + l.rollos_pedidos, 0);
    const metrosTotal = lineas.filter((l) => l.modo === 'metros').reduce((s, l) => s + l.metros_pedidos, 0);

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
                        <Repeat className="h-5 w-5" />
                    </span>
                    <div>
                        <h1 className="text-xl font-bold text-warm-900">Nuevo requerimiento</h1>
                        <p className="text-sm text-warm-500">
                            Lo que le pides a otro almacén. Ellos escanean, separan y despachan; el número lo da el almacén al que se lo pides.
                        </p>
                    </div>
                </div>
                <Button variant="secondary" onClick={() => navigate('/requerimientos')}>
                    <ArrowLeft className="h-4 w-4" />
                    Volver
                </Button>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1fr_22rem] lg:items-start *:min-w-0">
                {/* ── Productos ───────────────────────────────────────── */}
                <section className="rounded-xl border border-edge bg-white p-5 shadow-sm">
                    <h2 className="text-base font-semibold text-warm-900">Productos</h2>
                    <p className="mb-4 text-sm text-warm-500">
                        {lineas.length} producto{lineas.length === 1 ? '' : 's'} agregado{lineas.length === 1 ? '' : 's'}
                    </p>

                    <div className="space-y-4">
                        <SearchSelect
                            label="Buscar producto"
                            placeholder="Nombre o código…"
                            value={nueva.producto_id}
                            onChange={(v) => elegirProducto(v)}
                            options={productos.map((p) => ({ value: String(p.id), label: p.nombre, keywords: p.codigo }))}
                            searchTitle="Buscador avanzado con filtros"
                            onSearch={(q) => setPicker({ open: true, query: q })}
                        />

                        {producto?.colores?.length > 0 && (
                            <ColorSelect
                                colores={producto.colores}
                                value={nueva.producto_color_id}
                                onChange={(id) => setNueva((prev) => ({ ...prev, producto_color_id: id }))}
                            />
                        )}

                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            {esTela ? (
                                <Select
                                    label="Se pide por"
                                    value={nueva.modo}
                                    onChange={(e) => setNueva((prev) => ({ ...prev, modo: e.target.value, conMetraje: false, metros_por_rollo: '' }))}
                                    options={[
                                        { value: 'rollos', label: 'Rollos' },
                                        { value: 'metros', label: 'Metros' },
                                    ]}
                                />
                            ) : (
                                <SearchSelect
                                    label="Unidad"
                                    value={nueva.producto_presentacion_id}
                                    disabled={!producto}
                                    clearable={false}
                                    placeholder={producto ? 'Elegir…' : '—'}
                                    emptyText="Sin unidades"
                                    onChange={(id) => id && setNueva((prev) => ({ ...prev, producto_presentacion_id: id }))}
                                    options={presentaciones.map((p) => ({ value: String(p.id), label: p.nombre }))}
                                />
                            )}
                            <Input
                                label={esTela ? (nueva.modo === 'rollos' ? 'Rollos' : 'Metros') : 'Cantidad'}
                                type="number"
                                step={esTela && nueva.modo === 'rollos' ? '1' : '0.01'}
                                min="0"
                                value={nueva.cantidad}
                                onChange={(e) => setNueva((prev) => ({ ...prev, cantidad: e.target.value }))}
                                className="text-right"
                            />
                        </div>

                        {/* Una tela por rollos: rollos enteros, o rollos de un metraje que el almacén corta si no lo tiene. */}
                        {esTela && nueva.modo === 'rollos' && (
                            <div className="-mt-2 space-y-2">
                                <div className="flex flex-wrap items-end gap-4">
                                    <label className="flex cursor-pointer items-center gap-2 pb-2 text-sm font-medium text-warm-700">
                                        <input
                                            type="checkbox"
                                            checked={nueva.conMetraje}
                                            onChange={(e) => setNueva((prev) => ({ ...prev, conMetraje: e.target.checked, metros_por_rollo: e.target.checked ? prev.metros_por_rollo : '' }))}
                                            className="h-4 w-4 rounded border-gray-300 accent-primary-600"
                                        />
                                        Pedir un metraje por rollo
                                    </label>
                                    {nueva.conMetraje && (
                                        <div className="w-44">
                                            <Input
                                                label="Metros por rollo"
                                                type="number"
                                                step="0.01"
                                                min="0"
                                                placeholder="Ej.: 50"
                                                value={nueva.metros_por_rollo}
                                                onChange={(e) => setNueva((prev) => ({ ...prev, metros_por_rollo: e.target.value }))}
                                                className="text-right"
                                            />
                                        </div>
                                    )}
                                </div>
                                <p className="text-xs text-warm-500">
                                    {producto?.colores?.length > 0 && !nueva.producto_color_id ? 'Elige el color de la tela. ' : ''}
                                    {nueva.conMetraje
                                        ? 'Cada rollo sale con ese metraje: si el almacén no tiene uno de ese largo, corta la tela de otro más grande.'
                                        : 'Se piden rollos enteros, midan lo que midan.'}
                                </p>
                            </div>
                        )}

                        <div className="flex flex-wrap items-center gap-2">
                            <Button onClick={agregar} disabled={!puedeAgregar}>
                                <Plus className="h-4 w-4" />
                                Agregar producto
                            </Button>
                            <Button type="button" variant="secondary" onClick={() => setNueva(lineaVacia)}>
                                <Eraser className="h-4 w-4" />
                                Limpiar
                            </Button>
                        </div>
                    </div>

                    {/* Líneas del requerimiento */}
                    <div className="mt-5 overflow-x-auto rounded-lg border border-edge">
                        <table className="w-full min-w-[560px] text-sm">
                            <thead>
                                <tr className="bg-primary-600 text-left text-xs font-semibold uppercase tracking-wide text-white">
                                    <th className="px-3 py-2">Producto</th>
                                    <th className="px-3 py-2">Color</th>
                                    <th className="px-3 py-2 text-right">Cantidad</th>
                                    <th className="w-14 px-3 py-2 text-center">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {lineas.length === 0 && (
                                    <tr>
                                        <td colSpan={4} className="px-3 py-10 text-center text-warm-400">
                                            Agrega productos con el buscador de arriba.
                                        </td>
                                    </tr>
                                )}
                                {lineas.map((l, i) => (
                                    <tr key={i}>
                                        <td className="px-3 py-2 font-medium text-warm-900">{l.nombre}</td>
                                        <td className="px-3 py-2 text-warm-700">{l.color ?? 'Cualquier color'}</td>
                                        <td className="px-3 py-2 text-right text-warm-800">{pedidoTexto({ ...l, presentacion: l.unidad })}</td>
                                        <td className="px-3 py-2 text-center">
                                            <button
                                                type="button"
                                                aria-label="Quitar"
                                                onClick={() => setLineas((prev) => prev.filter((_, j) => j !== i))}
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

                {/* ── Requerimiento y resumen ─────────────────────────── */}
                <div className="space-y-4">
                    <section className="rounded-xl border border-edge bg-white p-5 shadow-sm">
                        <h2 className="mb-4 text-base font-semibold text-warm-900">Requerimiento</h2>

                        <div className="space-y-4">
                            {superAdmin ? (
                                <SearchSelect
                                    label="Almacén que pide"
                                    placeholder="Elige el almacén"
                                    value={pide}
                                    disabled={lineas.length > 0}
                                    onChange={(v) => setPide(v ?? '')}
                                    options={opcionesAlmacen(almacenes, pide)}
                                />
                            ) : (
                                <p className="rounded-md bg-primary-50 px-3 py-2 text-xs font-medium text-primary-700">
                                    Lo pide tu almacén: {almacenNombre ?? 'sin almacén asignado'}. La mercadería llega ahí.
                                </p>
                            )}
                            <SearchSelect
                                label="Se lo pides al almacén"
                                placeholder="Elige el almacén"
                                value={origen}
                                onChange={(v) => setOrigen(v ?? '')}
                                options={opcionesOrigen}
                            />
                            <Input
                                label="Observación"
                                placeholder="Referencia…"
                                value={observaciones}
                                onChange={(e) => setObservaciones(e.target.value)}
                            />
                        </div>

                        <Alert variant="info" className="mt-4">
                            {nombreOrigen
                                ? `Solo los usuarios de ${nombreOrigen} ven este requerimiento: ellos lo preparan y lo despachan.`
                                : 'Solo los usuarios del almacén al que se lo pides ven este requerimiento: ellos lo preparan y lo despachan.'}
                        </Alert>
                    </section>

                    <section className="rounded-xl border border-edge bg-white p-5 shadow-sm">
                        <h2 className="mb-3 text-base font-semibold text-warm-900">Resumen</h2>
                        <dl className="space-y-1.5 text-sm">
                            <div className="flex items-center justify-between">
                                <dt className="text-warm-500">Productos</dt>
                                <dd className="font-semibold text-warm-900">{lineas.length}</dd>
                            </div>
                            {rollosTotal > 0 && (
                                <div className="flex items-center justify-between">
                                    <dt className="text-warm-500">Rollos</dt>
                                    <dd className="font-semibold text-warm-900">{num(rollosTotal)}</dd>
                                </div>
                            )}
                            {metrosTotal > 0 && (
                                <div className="flex items-center justify-between">
                                    <dt className="text-warm-500">Metros</dt>
                                    <dd className="font-semibold text-warm-900">{num(metrosTotal)} m</dd>
                                </div>
                            )}
                        </dl>
                    </section>

                    <div className="flex justify-end gap-2">
                        <Button variant="secondary" onClick={() => navigate('/requerimientos')}>
                            Cancelar
                        </Button>
                        <Button loading={guardando} disabled={!lineas.length} onClick={guardar}>
                            Registrar requerimiento
                        </Button>
                    </div>
                </div>
            </div>

            {/* Buscador avanzado: el stock que muestra es el del almacén al que se le pide. */}
            <ProductoPickerModal
                open={picker.open}
                onClose={() => setPicker((prev) => ({ ...prev, open: false }))}
                onSelect={agregarDesdePicker}
                initialQuery={picker.query}
                multiple
                // Una tela se elige por color y en rollos.
                porColor
                productos={productos}
                stockPorProducto={stockPorProducto}
                bloquearSinStock={false}
                existencias={existencias}
                title="Buscar productos"
            />
        </Layout>
    );
}
