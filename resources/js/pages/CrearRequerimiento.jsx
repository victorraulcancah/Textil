import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Repeat } from 'lucide-react';
import api, { asList } from '../lib/api';
import { useToast } from '../lib/toast';
import { opcionesAlmacen, useAlmacenPropio } from '../lib/almacenes';
import Layout from '../components/Layout';
import LineasRollos, { ROLLOS, aDetallesRequerimiento } from '../components/LineasRollos';
import { Alert, Button, Input, SearchSelect, Spinner } from '../components/ui';

const num = (n) => new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 }).format(Number(n) || 0);

/**
 * Nuevo requerimiento de traslado. Mismo diseño y misma forma de agregar productos que Nuevo pedido (ver
 * LineasRollos): una fila por tela con sus colores desplegables, y lo demás línea por línea. El número (RQ002-001…) lo
 * da el almacén al que se le pide.
 */
export default function CrearRequerimiento() {
    const toast = useToast();
    const navigate = useNavigate();
    const { propioId, superAdmin, almacenNombre } = useAlmacenPropio();

    const [cargando, setCargando] = useState(true);
    const [almacenes, setAlmacenes] = useState([]);
    const [productos, setProductos] = useState([]);
    const [todasExistencias, setTodasExistencias] = useState([]);
    const [origen, setOrigen] = useState('');
    const [pide, setPide] = useState('');
    const [observaciones, setObservaciones] = useState('');
    const [lineas, setLineas] = useState([]);
    const [guardando, setGuardando] = useState(false);

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

    /** El stock que se muestra es el del almacén al que se le pide: de ahí sale la mercadería. */
    const existencias = useMemo(
        () => todasExistencias.filter((f) => !origen || String(f.almacen_id ?? f.almacen?.id) === String(origen)),
        [todasExistencias, origen],
    );

    const guardar = async () => {
        if (!origen) return toast.error('Elige a qué almacén se lo pides.');
        if (superAdmin && !pide) return toast.error('Elige el almacén que pide.');
        if (lineas.length === 0) return toast.error('Agrega al menos un producto.');
        if (lineas.some((l) => !(Number(l.modo === ROLLOS ? l.rollos_pedidos : l.cantidad) > 0))) {
            return toast.error('Todas las líneas necesitan una cantidad mayor a cero.');
        }
        setGuardando(true);
        try {
            const { data } = await api.post('/transferencias/requerimientos', {
                almacen_origen_id: Number(origen),
                almacen_destino_id: superAdmin ? Number(pide) : undefined,
                observaciones: observaciones || undefined,
                detalles: aDetallesRequerimiento(lineas),
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

    const rollosTotal = lineas.filter((l) => l.modo === ROLLOS).reduce((s, l) => s + (Number(l.rollos_pedidos) || 0), 0);
    const productosTotal = new Set(lineas.map((l) => l.producto)).size;

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
                <LineasRollos productos={productos} existencias={existencias} lineas={lineas} setLineas={setLineas} conMetraje />

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
                            <Input label="Observación" placeholder="Referencia…" value={observaciones} onChange={(e) => setObservaciones(e.target.value)} />
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
                                <dd className="font-semibold text-warm-900">{productosTotal}</dd>
                            </div>
                            {rollosTotal > 0 && (
                                <div className="flex items-center justify-between">
                                    <dt className="text-warm-500">Rollos</dt>
                                    <dd className="font-semibold text-warm-900">{num(rollosTotal)}</dd>
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
        </Layout>
    );
}
