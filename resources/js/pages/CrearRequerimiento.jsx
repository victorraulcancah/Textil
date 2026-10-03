import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Send, Trash2 } from 'lucide-react';
import api, { asList } from '../lib/api';
import { useToast } from '../lib/toast';
import { opcionesAlmacen, useAlmacenPropio } from '../lib/almacenes';
import { tipoUnidad } from '../lib/unidades';
import Layout from '../components/Layout';
import ColorSelect from '../components/ColorSelect';
import { Alert, Button, Input, SearchSelect, Spinner } from '../components/ui';
import { pedidoTexto } from './Requerimientos';

const lineaVacia = { producto_id: '', producto_presentacion_id: '', producto_color_id: '', modo: 'rollos', rollos: '', metros_por_rollo: '', metros: '', cantidad: '' };

/**
 * Nuevo requerimiento de traslado: vista aparte (no modal), como Pedido y Traslado. Se le pide mercadería a otro
 * almacén; el número (RQ002-001…) lo da el almacén pedido.
 */
export default function CrearRequerimiento() {
    const toast = useToast();
    const navigate = useNavigate();
    const { propioId, superAdmin } = useAlmacenPropio();

    const [cargando, setCargando] = useState(true);
    const [almacenes, setAlmacenes] = useState([]);
    const [productos, setProductos] = useState([]);
    const [origen, setOrigen] = useState('');
    const [pide, setPide] = useState('');
    const [observaciones, setObservaciones] = useState('');
    const [lineas, setLineas] = useState([]);
    const [panel, setPanel] = useState(lineaVacia);
    const [guardando, setGuardando] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                const [a, p] = await Promise.all([api.get('/almacenes'), api.get('/productos', { params: { per_page: 500 } })]);
                setAlmacenes(asList(a));
                setProductos(asList(p));
            } catch {
                toast.error('No se pudieron cargar los almacenes y productos.');
            } finally {
                setCargando(false);
            }
        })();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const pideId = superAdmin ? pide : String(propioId ?? '');
    const producto = useMemo(() => productos.find((p) => String(p.id) === String(panel.producto_id)) ?? null, [productos, panel.producto_id]);
    const presentaciones = (producto?.presentaciones ?? []).filter((p) => p.activo !== false);
    const metro = presentaciones.find((p) => tipoUnidad(p) === 'metro') ?? null;
    const esTela = Boolean(metro);

    const elegirProducto = (id) => {
        const pr = productos.find((p) => String(p.id) === String(id));
        const pres = (pr?.presentaciones ?? []).filter((p) => p.activo !== false);
        const tela = pres.some((p) => tipoUnidad(p) === 'metro');
        setPanel({
            ...lineaVacia,
            producto_id: id,
            modo: tela ? 'rollos' : 'cantidad',
            producto_presentacion_id: !tela && pres.length === 1 ? String(pres[0].id) : '',
        });
    };

    const agregar = () => {
        if (!producto) return toast.error('Elige un producto.');
        const color = (producto.colores ?? []).find((c) => String(c.id) === String(panel.producto_color_id));
        let l;
        if (esTela) {
            if (panel.modo === 'rollos') {
                if (!(Number(panel.rollos) >= 1)) return toast.error('Indica cuántos rollos.');
                l = { modo: 'rollos', rollos_pedidos: Number(panel.rollos), metros_por_rollo: Number(panel.metros_por_rollo) > 0 ? Number(panel.metros_por_rollo) : null };
            } else {
                if (!(Number(panel.metros) > 0)) return toast.error('Indica cuántos metros.');
                l = { modo: 'metros', metros_pedidos: Number(panel.metros) };
            }
            l.producto_presentacion_id = metro.id;
        } else {
            if (!panel.producto_presentacion_id) return toast.error('Elige la unidad.');
            if (!(Number(panel.cantidad) > 0)) return toast.error('Indica la cantidad.');
            l = { modo: 'cantidad', cantidad: Number(panel.cantidad), producto_presentacion_id: Number(panel.producto_presentacion_id) };
        }
        l.producto_color_id = panel.producto_color_id ? Number(panel.producto_color_id) : null;
        l.nombre = producto.nombre;
        l.color = color?.nombre ?? null;
        l.unidad = presentaciones.find((p) => String(p.id) === String(l.producto_presentacion_id))?.nombre;
        setLineas((prev) => [...prev, l]);
        setPanel(lineaVacia);
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

    return (
        <Layout>
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <button type="button" onClick={() => navigate('/requerimientos')} aria-label="Volver" className="rounded-md p-1.5 text-warm-600 transition hover:bg-gray-100">
                        <ArrowLeft className="h-5 w-5" />
                    </button>
                    <div>
                        <h1 className="text-xl font-semibold text-warm-900">Nuevo requerimiento de traslado</h1>
                        <p className="text-sm text-warm-500">El número lo da el almacén al que le pides (RQ002-… si es el almacén 2)</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="secondary" onClick={() => navigate('/requerimientos')}>Cancelar</Button>
                    <Button loading={guardando} onClick={guardar}>
                        <Send className="h-4 w-4" /> Enviar requerimiento
                    </Button>
                </div>
            </div>

            {cargando ? (
                <div className="flex justify-center py-24"><Spinner size="lg" className="text-primary-600" /></div>
            ) : (
                <div className="space-y-4">
                    {!superAdmin && !propioId && (
                        <Alert variant="warning">No tienes un almacén asignado: pídele a un administrador que te asigne uno.</Alert>
                    )}

                    <section className="grid gap-4 rounded-lg border border-edge bg-white p-4 shadow-sm sm:grid-cols-3">
                        {superAdmin && (
                            <SearchSelect label="Almacén que pide" value={pide} onChange={(v) => setPide(v ?? '')} options={opcionesAlmacen(almacenes)} placeholder="Elegir…" />
                        )}
                        <SearchSelect label="Se lo pides al almacén" value={origen} onChange={(v) => setOrigen(v ?? '')} options={opcionesOrigen} placeholder="Elegir…" />
                        <div className={superAdmin ? '' : 'sm:col-span-2'}>
                            <Input label="Observaciones" value={observaciones} onChange={(e) => setObservaciones(e.target.value)} placeholder="Opcional" />
                        </div>
                    </section>

                    <section className="space-y-3 rounded-lg border border-edge bg-white p-4 shadow-sm">
                        <h2 className="text-sm font-semibold text-warm-900">Productos que necesitas</h2>
                        <SearchSelect
                            label="Producto"
                            placeholder="Nombre o código…"
                            value={panel.producto_id}
                            onChange={(v) => elegirProducto(v ?? '')}
                            options={productos.map((p) => ({ value: String(p.id), label: p.nombre, keywords: p.codigo }))}
                        />
                        {producto?.colores?.length > 0 && (
                            <ColorSelect colores={producto.colores} value={panel.producto_color_id} onChange={(id) => setPanel((p) => ({ ...p, producto_color_id: id }))} />
                        )}
                        {producto && esTela && (
                            <div className="flex flex-wrap items-end gap-3">
                                <div className="flex overflow-hidden rounded-md border border-edge text-sm">
                                    {[['rollos', 'Por rollos'], ['metros', 'Por metros']].map(([k, t]) => (
                                        <button
                                            key={k}
                                            type="button"
                                            onClick={() => setPanel((p) => ({ ...p, modo: k }))}
                                            className={`px-3 py-2 transition ${panel.modo === k ? 'bg-primary-600 font-medium text-white' : 'bg-white text-warm-600 hover:bg-gray-50'}`}
                                        >
                                            {t}
                                        </button>
                                    ))}
                                </div>
                                {panel.modo === 'rollos' ? (
                                    <>
                                        <div className="w-32"><Input label="Rollos" type="number" min="1" step="1" value={panel.rollos} onChange={(e) => setPanel((p) => ({ ...p, rollos: e.target.value }))} className="text-right" /></div>
                                        <div className="w-44"><Input label="Metros por rollo" type="number" min="0" step="0.01" placeholder="Opcional" value={panel.metros_por_rollo} onChange={(e) => setPanel((p) => ({ ...p, metros_por_rollo: e.target.value }))} className="text-right" /></div>
                                    </>
                                ) : (
                                    <div className="w-40"><Input label="Metros" type="number" min="0" step="0.01" value={panel.metros} onChange={(e) => setPanel((p) => ({ ...p, metros: e.target.value }))} className="text-right" /></div>
                                )}
                            </div>
                        )}
                        {producto && !esTela && (
                            <div className="grid gap-3 sm:grid-cols-2">
                                <SearchSelect label="Unidad" value={panel.producto_presentacion_id} clearable={false} onChange={(v) => v && setPanel((p) => ({ ...p, producto_presentacion_id: v }))} options={presentaciones.map((p) => ({ value: String(p.id), label: p.nombre }))} placeholder="Elegir…" />
                                <Input label="Cantidad" type="number" min="0" step="0.01" value={panel.cantidad} onChange={(e) => setPanel((p) => ({ ...p, cantidad: e.target.value }))} className="text-right" />
                            </div>
                        )}
                        {producto && esTela && panel.modo === 'rollos' && (
                            <p className="text-xs text-warm-500">Con "metros por rollo", el almacén corta la tela de un rollo más grande si no tiene uno de ese largo.</p>
                        )}
                        <div className="flex justify-end">
                            <Button size="sm" variant="secondary" onClick={agregar} disabled={!producto}>
                                <Plus className="h-4 w-4" /> Agregar
                            </Button>
                        </div>
                    </section>

                    <section className="overflow-hidden rounded-lg border border-edge bg-white shadow-sm">
                        <table className="w-full text-left text-sm">
                            <thead>
                                <tr className="border-b border-edge bg-gray-50 text-xs uppercase tracking-wide text-warm-500">
                                    <th className="px-3 py-2">Producto</th>
                                    <th className="px-3 py-2">Color</th>
                                    <th className="px-3 py-2">Pides</th>
                                    <th className="w-12 px-3 py-2" />
                                </tr>
                            </thead>
                            <tbody>
                                {lineas.length === 0 && (
                                    <tr><td colSpan={4} className="px-3 py-8 text-center text-warm-400">Aún no agregaste productos.</td></tr>
                                )}
                                {lineas.map((l, i) => (
                                    <tr key={i} className="border-b border-edge/60">
                                        <td className="px-3 py-2 font-medium text-warm-900">{l.nombre}</td>
                                        <td className="px-3 py-2 text-warm-700">{l.color ?? 'Cualquier color'}</td>
                                        <td className="px-3 py-2">{pedidoTexto({ ...l, presentacion: l.unidad })}</td>
                                        <td className="px-3 py-2 text-right">
                                            <button type="button" aria-label="Quitar" onClick={() => setLineas((prev) => prev.filter((_, j) => j !== i))} className="rounded p-1 text-red-600 hover:bg-red-50">
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </section>
                </div>
            )}
        </Layout>
    );
}
