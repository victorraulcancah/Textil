import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileText, PackageCheck, Plus, Trash2, X } from 'lucide-react';
import api, { asList } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import { opcionesAlmacen, useAlmacenPropio } from '../lib/almacenes';
import { tipoUnidad } from '../lib/unidades';
import Layout from '../components/Layout';
import PageHeader from '../components/PageHeader';
import ColorSelect from '../components/ColorSelect';
import PdfViewerModal from '../components/PdfViewerModal';
import { Alert, Badge, Button, DataTable, Input, Modal, SearchSelect } from '../components/ui';

const num = (n) => new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 }).format(Number(n) || 0);

export const ESTADOS_RQ = {
    solicitada: { label: 'Solicitado', variant: 'amber' },
    preparando: { label: 'Preparando', variant: 'blue' },
    separada: { label: 'Separado', variant: 'green' },
    en_transito: { label: 'En tránsito', variant: 'blue' },
    recibida: { label: 'Recibido', variant: 'green' },
    rechazada: { label: 'Rechazado', variant: 'red' },
    cancelada: { label: 'Cancelado', variant: 'gray' },
};

/** Lo que pide una línea, en una frase: "2 rollos de 50 m", "30 m", "5 Caja". */
export const pedidoTexto = (d) => {
    if (d.modo === 'rollos') {
        const n = Number(d.rollos_pedidos) || 0;
        return `${num(n)} rollo${n === 1 ? '' : 's'}${d.metros_por_rollo ? ` de ${num(d.metros_por_rollo)} m` : ''}`;
    }
    if (d.modo === 'metros') return `${num(d.metros_pedidos)} m`;
    return `${num(d.cantidad)} ${d.presentacion ?? ''}`.trim();
};

const fechaHora = (v) => (v ? new Date(v).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' }) : '—');

const lineaVacia = { producto_id: '', producto_presentacion_id: '', producto_color_id: '', modo: 'rollos', rollos: '', metros_por_rollo: '', metros: '', cantidad: '' };

/**
 * Requerimientos de traslado: lo que MI almacén le pide a otro. El almacén pedido lo atiende (escanea, separa,
 * despacha) desde "Atender requerimientos"; al despacharse se vuelve un traslado en tránsito que aquí se recibe.
 */
export default function Requerimientos() {
    const toast = useToast();
    const { puede } = useAuth();
    const { propioId, superAdmin } = useAlmacenPropio();

    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [detalle, setDetalle] = useState(null);
    const [pdf, setPdf] = useState(null);
    const [nuevo, setNuevo] = useState(false);

    const cargar = useCallback(async () => {
        setLoading(true);
        try {
            setRows(asList(await api.get('/transferencias/requerimientos', { params: { rol: 'pedidos' } })));
        } catch {
            toast.error('No se pudieron cargar los requerimientos.');
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        cargar();
    }, [cargar]);

    const recibir = async (r) => {
        try {
            await api.post(`/transferencias/${r.id}/recibir`);
            toast.success(`${r.requerimiento} recibido: el stock ya está en tu almacén.`);
            cargar();
        } catch (err) {
            toast.error(err.response?.data?.message ?? 'No se pudo recibir.');
        }
    };

    const anular = async (r) => {
        if (!window.confirm(`¿Cancelar el requerimiento ${r.requerimiento}?`)) return;
        try {
            await api.post(`/transferencias/requerimientos/${r.id}/anular`);
            toast.success('Requerimiento cancelado.');
            cargar();
        } catch (err) {
            toast.error(err.response?.data?.message ?? 'No se pudo cancelar.');
        }
    };

    const columns = [
        {
            key: 'requerimiento',
            label: 'Requerimiento',
            width: '150px',
            render: (r) => <Badge variant="blue" className="whitespace-nowrap">{r.requerimiento}</Badge>,
        },
        { key: 'origen', label: 'Se pide a', getSearchValue: (r) => r.origen?.nombre ?? '', render: (r) => r.origen?.nombre ?? '—' },
        { key: 'destino', label: 'Pide', getSearchValue: (r) => r.destino?.nombre ?? '', render: (r) => r.destino?.nombre ?? '—' },
        {
            key: 'productos',
            label: 'Productos',
            getSearchValue: (r) => r.detalles.map((d) => d.producto).join(' '),
            render: (r) => (
                <span className="text-sm text-warm-700">
                    {r.detalles.map((d) => `${d.producto}${d.color ? ` ${d.color}` : ''} · ${pedidoTexto(d)}`).join(' | ')}
                </span>
            ),
        },
        { key: 'fecha_solicitud', label: 'Fecha', width: '135px', render: (r) => fechaHora(r.fecha_solicitud) },
        {
            key: 'estado',
            label: 'Estado',
            width: '120px',
            render: (r) => <Badge variant={ESTADOS_RQ[r.estado]?.variant ?? 'gray'}>{ESTADOS_RQ[r.estado]?.label ?? r.estado}</Badge>,
        },
        {
            key: 'acciones',
            label: 'Acciones',
            type: 'actions',
            width: '150px',
            align: 'right',
            actions: (r) => (
                <>
                    {r.estado === 'en_transito' && puede('inventario.transferencias.editar') && (
                        <Button size="sm" onClick={() => recibir(r)}>
                            <PackageCheck className="h-4 w-4" /> Recibir
                        </Button>
                    )}
                    {r.guia && (
                        <button
                            type="button"
                            title={`Guía ${r.guia}`}
                            aria-label="Guía de traslado"
                            onClick={() => setPdf({ id: r.id, nombre: r.guia })}
                            className="rounded-md p-1.5 text-primary-600 transition hover:bg-primary-50"
                        >
                            <FileText className="h-4 w-4" />
                        </button>
                    )}
                    {['solicitada', 'preparando', 'separada'].includes(r.estado) && puede('inventario.transferencias.crear') && (
                        <button
                            type="button"
                            title="Cancelar requerimiento"
                            aria-label="Cancelar requerimiento"
                            onClick={() => anular(r)}
                            className="rounded-md p-1.5 text-red-600 transition hover:bg-red-50"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    )}
                </>
            ),
        },
    ];

    return (
        <Layout>
            <PageHeader
                title="Requerimientos de traslado"
                description="Pídele mercadería a otro almacén: ellos escanean, separan y despachan; tú la recibes aquí"
                actions={
                    puede('inventario.transferencias.crear') && (
                        <Button onClick={() => setNuevo(true)}>
                            <Plus className="h-4 w-4" /> Nuevo requerimiento
                        </Button>
                    )
                }
            />

            {!superAdmin && !propioId && (
                <Alert variant="warning" className="mb-4">No tienes un almacén asignado: pídele a un administrador que te asigne uno.</Alert>
            )}

            <DataTable
                columns={columns}
                rows={rows}
                loading={loading}
                searchPlaceholder="Buscar requerimiento…"
                emptyMessage="Aún no has pedido nada a otro almacén."
                onRowDoubleClick={setDetalle}
            />

            <DetalleModal r={detalle} onClose={() => setDetalle(null)} />

            <NuevoModal
                open={nuevo}
                onClose={() => setNuevo(false)}
                onCreado={(r) => {
                    setNuevo(false);
                    toast.success(`Requerimiento ${r.requerimiento} enviado a ${r.origen?.nombre}.`);
                    cargar();
                }}
            />

            <PdfViewerModal
                open={Boolean(pdf)}
                onClose={() => setPdf(null)}
                tipo="guia-traslado"
                id={pdf?.id}
                nombre={pdf?.nombre}
                titulo="Guía de traslado"
                formatos={['a4', 'ticket']}
            />
        </Layout>
    );
}

/** El requerimiento línea por línea, con los rollos que ya apartó el almacén. */
export function DetalleModal({ r, onClose }) {
    return (
        <Modal open={Boolean(r)} onClose={onClose} size="2xl" title={r ? `Requerimiento ${r.requerimiento}` : ''}>
            {r && (
                <div className="space-y-4 text-sm">
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-warm-700">
                        <span>Se pide a: <strong>{r.origen?.nombre}</strong></span>
                        <span>Pide: <strong>{r.destino?.nombre}</strong></span>
                        <span>Solicitó: <strong>{r.solicitante ?? '—'}</strong> · {fechaHora(r.fecha_solicitud)}</span>
                        <Badge variant={ESTADOS_RQ[r.estado]?.variant ?? 'gray'}>{ESTADOS_RQ[r.estado]?.label ?? r.estado}</Badge>
                        {r.guia && <span>Guía: <strong>{r.guia}</strong></span>}
                    </div>
                    {r.observaciones && <p className="rounded-md bg-gray-50 px-3 py-2 text-warm-600">{r.observaciones}</p>}
                    {r.motivo_rechazo && <Alert variant="error">Motivo: {r.motivo_rechazo}</Alert>}
                    <table className="w-full text-left">
                        <thead>
                            <tr className="border-b border-edge text-xs uppercase tracking-wide text-warm-500">
                                <th className="py-2">Producto</th>
                                <th className="py-2">Pedido</th>
                                <th className="py-2">Apartado / enviado</th>
                            </tr>
                        </thead>
                        <tbody>
                            {r.detalles.map((d) => (
                                <tr key={d.id} className="border-b border-edge/60 align-top">
                                    <td className="py-2 font-medium text-warm-900">{d.producto}{d.color ? ` · ${d.color}` : ''}</td>
                                    <td className="py-2">{pedidoTexto(d)}</td>
                                    <td className="py-2 text-warm-700">
                                        {d.rollos.length > 0
                                            ? d.rollos.map((x) => `${x.codigo} (${num(x.metros)} m${x.entero ? '' : ' corte'})`).join(', ')
                                            : d.modo === 'cantidad' && d.cantidad_enviada
                                              ? num(d.cantidad_enviada)
                                              : '—'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </Modal>
    );
}

function NuevoModal({ open, onClose, onCreado }) {
    const toast = useToast();
    const { propioId, superAdmin } = useAlmacenPropio();
    const [almacenes, setAlmacenes] = useState([]);
    const [productos, setProductos] = useState([]);
    const [origen, setOrigen] = useState('');
    const [pide, setPide] = useState('');
    const [observaciones, setObservaciones] = useState('');
    const [lineas, setLineas] = useState([]);
    const [panel, setPanel] = useState(lineaVacia);
    const [guardando, setGuardando] = useState(false);

    useEffect(() => {
        if (!open) return;
        setOrigen('');
        setPide('');
        setObservaciones('');
        setLineas([]);
        setPanel(lineaVacia);
        (async () => {
            try {
                const [a, p] = await Promise.all([api.get('/almacenes'), api.get('/productos', { params: { per_page: 500 } })]);
                setAlmacenes(asList(a));
                setProductos(asList(p));
            } catch {
                toast.error('No se pudieron cargar los almacenes y productos.');
            }
        })();
    }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

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
        l.nombre = `${producto.nombre}${color ? ` · ${color.nombre}` : ''}`;
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
                detalles: lineas.map(({ nombre, unidad, ...l }) => l),
            });
            onCreado(data);
        } catch (err) {
            const e = err.response?.data;
            toast.error(e?.message ?? Object.values(e?.errors ?? {})?.[0]?.[0] ?? 'No se pudo crear el requerimiento.');
        } finally {
            setGuardando(false);
        }
    };

    const opcionesOrigen = opcionesAlmacen(almacenes).filter((o) => o.value !== String(pideId));

    return (
        <Modal
            open={open}
            onClose={onClose}
            size="3xl"
            title="Nuevo requerimiento de traslado"
            description="El número lo da el almacén al que le pides (RQ002-… si es el almacén 2)"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>Cancelar</Button>
                    <Button loading={guardando} onClick={guardar}>Enviar requerimiento</Button>
                </>
            }
        >
            <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                    {superAdmin && (
                        <SearchSelect label="Almacén que pide" value={pide} onChange={(v) => setPide(v ?? '')} options={opcionesAlmacen(almacenes)} placeholder="Elegir…" />
                    )}
                    <SearchSelect label="Se lo pides al almacén" value={origen} onChange={(v) => setOrigen(v ?? '')} options={opcionesOrigen} placeholder="Elegir…" />
                    <Input label="Observaciones" value={observaciones} onChange={(e) => setObservaciones(e.target.value)} placeholder="Opcional" />
                </div>

                <div className="space-y-3 rounded-lg border border-edge p-3">
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
                </div>

                {lineas.length > 0 && (
                    <ul className="divide-y divide-edge rounded-lg border border-edge text-sm">
                        {lineas.map((l, i) => (
                            <li key={i} className="flex items-center justify-between gap-3 px-3 py-2">
                                <span className="min-w-0 truncate"><strong>{l.nombre}</strong> · {pedidoTexto({ ...l, presentacion: l.unidad })}</span>
                                <button type="button" aria-label="Quitar" onClick={() => setLineas((prev) => prev.filter((_, j) => j !== i))} className="rounded p-1 text-red-600 hover:bg-red-50">
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </Modal>
    );
}
