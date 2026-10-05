import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, Check, ClipboardList, PackageCheck, ScanLine, TriangleAlert, Truck, X } from 'lucide-react';
import api, { asList } from '../lib/api';
import { useToast } from '../lib/toast';
import EscanerCamara from '../components/EscanerCamara';
import FiltroAlmacen from '../components/FiltroAlmacen';
import Layout from '../components/Layout';
import PageHeader from '../components/PageHeader';
import PlanillaTela from '../components/PlanillaTela';
import { gruposDeRequerimiento } from '../lib/planilla';
import { Alert, Badge, Button, Input, Modal, Spinner, cn } from '../components/ui';
import { ESTADOS_RQ, pedidoTexto } from './Requerimientos';

const num = (n) => new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 }).format(Number(n) || 0);

const ABIERTOS = ['solicitada', 'preparando', 'separada'];


/** Avance de una línea: "1/2 rollos", "12/30 m". */
const avanceDe = (d) =>
    d.modo === 'rollos'
        ? `${num(d.rollos_asignados)}/${num(d.rollos_pedidos)} rollos`
        : d.modo === 'metros'
          ? `${num(d.metros_asignados)}/${num(d.metros_pedidos)} m`
          : '—';

/**
 * Atender requerimientos de traslado: la pantalla del almacenero del almacén PEDIDO. Es el mismo trabajo que
 * "Preparación y despacho": escanear cada rollo (pistola o cámara), darlo por separado y despacharlo. Al despachar
 * nace la guía de traslado y la mercadería queda en tránsito hacia el almacén que la pidió.
 */
export default function AtenderRequerimientos() {
    const toast = useToast();
    const navigate = useNavigate();
    const [lista, setLista] = useState([]);
    const [almacenId, setAlmacenId] = useState('');
    const [cargando, setCargando] = useState(true);
    const [seleccionado, setSeleccionado] = useState(null);
    const [detalle, setDetalle] = useState(null);
    const [camara, setCamara] = useState(false);
    const [ultimo, setUltimo] = useState(null);
    const [codigo, setCodigo] = useState('');
    const [separando, setSeparando] = useState(false);
    const [rechazo, setRechazo] = useState(null); // motivo (null = cerrado)
    const inputRef = useRef(null);

    const cargar = useCallback(
        async (silencioso = false) => {
            if (!silencioso) setCargando(true);
            try {
                const { data } = await api.get('/transferencias/requerimientos', { params: { rol: 'atender', almacen_id: almacenId || undefined } });
                const filas = asList({ data }).filter((r) => ABIERTOS.includes(r.estado));
                setLista(filas);
                setSeleccionado((prev) => filas.find((p) => p.id === prev?.id) ?? filas[0] ?? null);
            } catch {
                if (!silencioso) toast.error('No se pudieron cargar los requerimientos.');
            } finally {
                if (!silencioso) setCargando(false);
            }
        },
        [toast, almacenId],
    );

    useEffect(() => {
        cargar();
    }, [cargar]);

    const cargarDetalle = useCallback(async (id) => {
        const { data } = await api.get(`/transferencias/requerimientos/${id}`);
        setDetalle(data);
    }, []);

    const seleccionadoId = seleccionado?.id ?? null;
    const seleccionadoIdRef = useRef(null);
    seleccionadoIdRef.current = seleccionadoId;

    useEffect(() => {
        if (!seleccionadoId) {
            setDetalle(null);
            return;
        }
        setUltimo(null);
        cargarDetalle(seleccionadoId).catch(() => setDetalle(null));
    }, [seleccionadoId, cargarDetalle]);

    // Dos almaceneros pueden preparar el mismo requerimiento: se refresca en silencio.
    useEffect(() => {
        const t = setInterval(() => {
            cargar(true).catch(() => {});
            if (seleccionadoIdRef.current) cargarDetalle(seleccionadoIdRef.current).catch(() => {});
        }, 5000);
        return () => clearInterval(t);
    }, [cargar, cargarDetalle]);

    useEffect(() => {
        inputRef.current?.focus();
    }, [detalle, ultimo]);

    /** La pistola y la cámara pasan por aquí: mismo resultado y mismo aviso. */
    const verificar = useCallback(
        async (valor) => {
            if (!valor || !detalle) return { ok: false, texto: 'No hay requerimiento abierto.' };
            const antes = detalle.estado;
            try {
                const { data } = await api.post(`/transferencias/requerimientos/${detalle.id}/escanear`, { codigo: valor });
                const texto = `Rollo correcto · ${num(data.metros)} m ${data.entero ? 'entero' : 'de corte'}`;
                setUltimo({ ok: true, codigo: data.rollo.codigo, metros: data.metros, texto: 'Rollo correcto' });
                await cargarDetalle(detalle.id);
                if (antes === 'solicitada' || data.completo) await cargar(true);
                // Ya está todo lo pedido: la cámara no tiene nada más que leer.
                if (data.completo) setCamara(false);
                return { ok: true, texto };
            } catch (err) {
                const texto = err.response?.data?.message ?? 'No se pudo verificar el rollo.';
                setUltimo({ ok: false, codigo: valor, texto });
                return { ok: false, texto };
            }
        },
        [detalle, cargarDetalle, cargar],
    );

    const escanear = async (e) => {
        e.preventDefault();
        const valor = codigo.trim();
        if (!valor) return;
        setCodigo('');
        await verificar(valor);
    };

    const quitarRollo = async (rolloId) => {
        try {
            const { data } = await api.post(`/transferencias/requerimientos/${detalle.id}/quitar-rollo`, { rollo_id: rolloId });
            setDetalle(data);
            await cargar(true);
        } catch (err) {
            toast.error(err.response?.data?.message ?? 'No se pudo quitar el rollo.');
        }
    };

    const separar = async () => {
        setSeparando(true);
        try {
            const { data } = await api.post(`/transferencias/requerimientos/${detalle.id}/separar`);
            setDetalle(data);
            toast.success(`${data.requerimiento} separado y listo para salir.`);
            await cargar(true);
        } catch (err) {
            toast.error(err.response?.data?.message ?? 'No se pudo dar por separado.');
        } finally {
            setSeparando(false);
        }
    };

    const rechazar = async () => {
        try {
            await api.post(`/transferencias/requerimientos/${detalle.id}/rechazar`, { motivo: rechazo || undefined });
            toast.success('Requerimiento rechazado: los rollos apartados quedaron libres.');
            setRechazo(null);
            setDetalle(null);
            setSeleccionado(null);
            await cargar();
        } catch (err) {
            toast.error(err.response?.data?.message ?? 'No se pudo rechazar.');
        }
    };

    const escaneando = ['solicitada', 'preparando'].includes(detalle?.estado);
    const separado = detalle?.estado === 'separada';
    const lineas = detalle?.detalles ?? [];
    const completo = lineas.length > 0 && lineas.every((d) => d.cubierta);
    const avance = lineas.filter((d) => d.modo !== 'cantidad').map(avanceDe).join(' · ');

    return (
        <Layout>
            <PageHeader
                title="Atender requerimientos"
                description="Lo que otros almacenes le piden al tuyo: escanea, separa y despacha"
                actions={<FiltroAlmacen value={almacenId} onChange={setAlmacenId} />}
            />

            {cargando ? (
                <div className="flex justify-center py-24"><Spinner size="lg" className="text-primary-600" /></div>
            ) : lista.length === 0 ? (
                <Alert variant="info">No hay requerimientos por atender. Cuando otro almacén le pida mercadería al tuyo aparecerá aquí.</Alert>
            ) : (
                <div className="grid gap-4 lg:grid-cols-[19rem_1fr]">
                    <aside className="overflow-hidden rounded-lg border border-edge bg-white shadow-sm lg:sticky lg:top-4 lg:self-start">
                        <div className="border-b border-edge px-3 py-2">
                            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Por atender ({lista.length})</p>
                        </div>
                        <ul className="max-h-[70vh] overflow-y-auto p-1">
                            {lista.map((r) => (
                                <li key={r.id}>
                                    <button
                                        type="button"
                                        onClick={() => setSeleccionado(r)}
                                        className={cn('w-full rounded-md px-2.5 py-2 text-left text-sm transition', r.id === seleccionado?.id ? 'bg-primary-50 font-medium text-primary-700' : 'text-warm-700 hover:bg-gray-50')}
                                    >
                                        <span className="flex items-center justify-between gap-2">
                                            <span className="flex min-w-0 items-center gap-2">
                                                <ClipboardList className="h-4 w-4 shrink-0 text-primary-600" />
                                                <span className="truncate">{r.requerimiento}</span>
                                            </span>
                                            <Badge variant={ESTADOS_RQ[r.estado]?.variant}>{ESTADOS_RQ[r.estado]?.label}</Badge>
                                        </span>
                                        <span className="mt-0.5 block truncate text-xs text-warm-500">Lo pide {r.destino?.nombre}</span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </aside>

                    <section className="rounded-lg border border-edge bg-white shadow-sm">
                        {!detalle ? (
                            <p className="px-4 py-16 text-center text-sm text-warm-400">Elige un requerimiento para atenderlo.</p>
                        ) : (
                            <>
                                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-edge px-4 py-3">
                                    <div className="min-w-0">
                                        <h2 className="text-sm font-semibold text-warm-900">{detalle.requerimiento}</h2>
                                        <p className="text-xs text-warm-500">
                                            Lo pide <strong>{detalle.destino?.nombre}</strong> · {detalle.solicitante} · {lineas.length} producto(s)
                                        </p>
                                        {detalle.observaciones && <p className="mt-0.5 text-xs text-warm-600">{detalle.observaciones}</p>}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <Button variant="secondary" size="sm" onClick={() => setRechazo('')}>
                                            <X className="h-4 w-4" /> Rechazar
                                        </Button>
                                        {separado ? (
                                            <Button size="sm" onClick={() => navigate(`/transferencias/nueva?requerimiento=${detalle.id}`)}>
                                                <Truck className="h-4 w-4" /> Despachar
                                            </Button>
                                        ) : (
                                            <Button size="sm" loading={separando} disabled={!completo} onClick={separar}>
                                                <PackageCheck className="h-4 w-4" /> Separado
                                            </Button>
                                        )}
                                    </div>
                                </div>

                                {detalle.estado === 'solicitada' && (
                                    <div className="border-b border-edge bg-amber-50/70 px-4 py-2.5 text-sm text-amber-800">
                                        Busca en el rack lo que pide cada línea y escanea cada rollo. Con el primero pasa a <strong>Preparando</strong> solo.
                                        Si piden un metraje menor al del rollo, se corta al despachar.
                                    </div>
                                )}
                                {separado && (
                                    <div className="border-b border-edge bg-green-50 px-4 py-2.5 text-sm text-green-800">
                                        Separado y verificado. Pulsa <strong>Despachar</strong>: se abre el traslado con todo esto ya cargado, para completar el transporte o agregar más productos antes de crearlo.
                                    </div>
                                )}

                                <form onSubmit={escanear} className={cn('border-b border-edge px-4 py-3', !escaneando && 'hidden')}>
                                    <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-warm-500">Escanea el rollo</label>
                                    <div className="flex items-center gap-2">
                                        <span className="relative flex-1">
                                            <ScanLine className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-primary-600" />
                                            <input
                                                ref={inputRef}
                                                value={codigo}
                                                onChange={(e) => setCodigo(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                        e.preventDefault();
                                                        escanear(e);
                                                    }
                                                }}
                                                placeholder="Dispara la pistola sobre la etiqueta…"
                                                autoComplete="off"
                                                className="w-full rounded-lg border border-edge py-2.5 pl-10 pr-3 font-mono text-sm shadow-sm outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                                            />
                                        </span>
                                        <Button type="submit" size="sm" disabled={!codigo.trim()}>Verificar</Button>
                                        <Button type="button" variant="secondary" size="sm" onClick={() => setCamara(true)} title="Escanear con la cámara">
                                            <Camera className="h-4 w-4" />
                                        </Button>
                                        <span className="text-sm font-medium text-warm-700">{avance}</span>
                                    </div>
                                    {ultimo && (
                                        <div className={cn('mt-2 flex items-center gap-2 rounded-md px-3 py-2 text-sm', ultimo.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800')}>
                                            {ultimo.ok ? <Check className="h-4 w-4 shrink-0" /> : <TriangleAlert className="h-4 w-4 shrink-0" />}
                                            <span>
                                                <strong>{ultimo.codigo}</strong> · {ultimo.texto}
                                                {ultimo.ok && ultimo.metros ? ` · ${num(ultimo.metros)} m` : ''}
                                            </span>
                                        </div>
                                    )}
                                </form>

                                {completo && escaneando && (
                                    <div className="border-b border-edge bg-green-50 px-4 py-2 text-sm text-green-800">
                                        Todo lo pedido está cubierto. Pulsa <strong>Separado</strong> para cerrar la preparación.
                                    </div>
                                )}

                                {/* Lo que piden y con qué se va cubriendo, en el mismo formato del despacho: una tabla por tela, rollo
                                    por rollo (1R = rollo entero), sin precios. */}
                                <div className="p-4">
                                    <PlanillaTela
                                        grupos={gruposDeRequerimiento(detalle.detalles ?? [])}
                                        precios={false}
                                        pendiente={!completo}
                                        completa={(f) => Boolean(f.hecho)}
                                        accion={
                                            // La X se puede dar mientras se prepara y también ya separado (hasta despacharlo):
                                            // quitar un rollo lo devuelve a preparación.
                                            escaneando || separado
                                                ? (f) =>
                                                      f.rolloId ? (
                                                          <button
                                                              type="button"
                                                              aria-label={`Quitar ${f.detalle ?? 'rollo'}`}
                                                              title={separado ? 'Quitar este rollo: el requerimiento vuelve a preparación' : 'Quitar este rollo'}
                                                              onClick={() => quitarRollo(f.rolloId)}
                                                              className="rounded p-0.5 text-red-600 transition hover:bg-red-50"
                                                          >
                                                              <X className="h-3.5 w-3.5" />
                                                          </button>
                                                      ) : null
                                                : null
                                        }
                                    />
                                </div>
                            </>
                        )}
                    </section>
                </div>
            )}

            <EscanerCamara abierto={camara} onCerrar={() => setCamara(false)} onLeer={verificar} titulo={detalle ? `${detalle.requerimiento} · ${avance}` : 'Escanear rollo'} />

            <Modal
                open={rechazo !== null}
                onClose={() => setRechazo(null)}
                title="Rechazar requerimiento"
                description="Los rollos que ya escaneaste quedan libres."
                footer={<><Button variant="secondary" onClick={() => setRechazo(null)}>Volver</Button><Button variant="danger" onClick={rechazar}>Rechazar</Button></>}
            >
                <Input label="Motivo" value={rechazo ?? ''} onChange={(e) => setRechazo(e.target.value)} placeholder="Ej.: sin stock de ese color" />
            </Modal>

        </Layout>
    );
}
