import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Check, ClipboardList, FileText, PackageCheck, ScanLine, TriangleAlert, X } from 'lucide-react';
import api, { asList } from '../lib/api';
import { useToast } from '../lib/toast';
import EscanerCamara from '../components/EscanerCamara';
import Layout from '../components/Layout';
import PageHeader from '../components/PageHeader';
import PdfViewerModal from '../components/PdfViewerModal';
import { Alert, Badge, Button, Spinner, cn } from '../components/ui';

const num = (n) => new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 }).format(Number(n) || 0);

/**
 * Preparación y despacho: la pantalla del almacenero.
 *
 * A la izquierda los pedidos que le llegaron; a la derecha el que está
 * preparando. El campo de escaneo tiene el foco todo el tiempo porque la
 * pistola escribe como un teclado y termina con Enter: el almacenero no toca
 * el ratón, solo dispara sobre cada rollo.
 */
export default function Despacho() {
    const toast = useToast();

    const [pedidos, setPedidos] = useState([]);
    const [cargando, setCargando] = useState(true);
    const [seleccionado, setSeleccionado] = useState(null);
    const [detalle, setDetalle] = useState(null);
    const [despachando, setDespachando] = useState(false);
    const [tomando, setTomando] = useState(false);
    /** Visor de la cámara abierto. */
    const [camara, setCamara] = useState(false);
    const [pdf, setPdf] = useState(null);

    /** Último escaneo, para pintarlo en verde o en rojo. */
    const [ultimo, setUltimo] = useState(null);
    const [codigo, setCodigo] = useState('');
    const inputRef = useRef(null);

    const cargar = useCallback(async () => {
        setCargando(true);
        try {
            // Los tres estados que le tocan al almacén: la solicitud recién
            // llegada, la que está juntando y la que ya apartó pero no ha
            // salido todavía.
            const { data } = await api.get('/ordenes-venta', {
                params: { estados: 'solicitado,preparando,separado' },
            });
            const filas = asList({ data });
            setPedidos(filas);
            setSeleccionado((prev) => filas.find((p) => p.id === prev?.id) ?? filas[0] ?? null);
        } catch {
            toast.error('No se pudieron cargar los pedidos por preparar.');
        } finally {
            setCargando(false);
        }
    }, [toast]);

    useEffect(() => {
        cargar();
    }, [cargar]);

    const cargarDetalle = useCallback(async (id) => {
        const { data } = await api.get(`/ordenes-venta/${id}`);
        setDetalle(data?.data ?? data);
    }, []);

    useEffect(() => {
        if (!seleccionado) {
            setDetalle(null);
            return;
        }
        setUltimo(null);
        cargarDetalle(seleccionado.id).catch(() => setDetalle(null));
    }, [seleccionado, cargarDetalle]);

    // El foco vuelve al campo de escaneo tras cada disparo.
    useEffect(() => {
        inputRef.current?.focus();
    }, [detalle, ultimo]);

    /**
     * Verifica un código contra el pedido. Da igual de dónde venga: la pistola
     * lo escribe en el campo y la cámara lo lee del QR, pero el resultado y el
     * aviso son los mismos.
     */
    const verificar = useCallback(
        async (valor) => {
            if (!valor || !detalle) return { ok: false, texto: 'No hay pedido abierto.' };

            const estadoAntes = detalle.estado;

            try {
                const { data } = await api.post(`/ordenes-venta/${detalle.id}/escanear`, {
                    codigo: valor,
                });
                const texto = `Rollo correcto · ${num(data.metros)} m · ${data.verificados}/${data.total}`;
                setUltimo({ ok: true, codigo: data.rollo.codigo, metros: data.metros, texto: 'Rollo correcto' });
                await cargarDetalle(detalle.id);

                // La bandeja se refresca en los dos momentos en que su
                // contenido cambia de verdad: el primer escaneo, que pone el
                // pedido en preparación, y el último, que lo deja cubierto. En
                // los del medio no, o con treinta rollos serían treinta
                // recargas de la lista.
                if (estadoAntes === 'solicitado' || data.completo) await cargar();

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

    const despachar = async () => {
        setDespachando(true);
        try {
            await api.post(`/ordenes-venta/${detalle.id}/despachar`);
            toast.success(`${detalle.documento} despachado.`);
            setDetalle(null);
            setSeleccionado(null);
            await cargar();
        } catch (err) {
            toast.error(err.response?.data?.message ?? 'No se pudo despachar el pedido.');
        } finally {
            setDespachando(false);
        }
    };

    /** Saca un rollo que se escaneó por error y lo devuelve al stock. */
    const quitarRollo = async (rolloId) => {
        try {
            const { data } = await api.post(`/ordenes-venta/${detalle.id}/quitar-rollo`, {
                rollo_id: rolloId,
            });
            setDetalle(data?.data ?? data);
            await cargar();
        } catch (err) {
            toast.error(err.response?.data?.message ?? 'No se pudo quitar el rollo.');
        }
    };

    /**
     * El almacenero terminó de juntar los rollos: quedan apartados en el
     * almacén, verificados y esperando su salida.
     */
    const separar = async () => {
        setTomando(true);
        try {
            const { data } = await api.post(`/ordenes-venta/${detalle.id}/separar`);
            const orden = data?.data ?? data;
            setDetalle(orden);
            toast.success(`${orden.documento} separado y listo para salir.`);
            await cargar();
        } catch (err) {
            toast.error(err.response?.data?.message ?? 'No se pudo dar por separado.');
        } finally {
            setTomando(false);
        }
    };

    /** Todavía se pueden escanear rollos: solicitado o en plena preparación. */
    const escaneando = ['solicitado', 'preparando'].includes(detalle?.estado);
    const separado = detalle?.estado === 'separado';
    // El avance se mide en metros cubiertos: el almacenero no sigue una lista
    // de rollos, junta la cantidad que pidió el cliente.
    const lineas = detalle?.detalles ?? [];
    const verificados = lineas.reduce((s, d) => s + Number(d.metros_asignados || 0), 0);
    const total = lineas.reduce((s, d) => s + Number(d.metros || 0), 0);
    const completo = lineas.length > 0 && lineas.every((d) => d.cubierta);

    return (
        <Layout>
            <PageHeader
                title="Preparación y despacho"
                description="Atiende las solicitudes de venta: escanea, separa y despacha"
            />

            {cargando ? (
                <div className="flex justify-center py-24">
                    <Spinner size="lg" className="text-primary-600" />
                </div>
            ) : pedidos.length === 0 ? (
                <Alert variant="info">
                    No hay solicitudes en la bandeja. Cuando Ventas solicite un pedido aparecerá aquí.
                </Alert>
            ) : (
                <div className="grid gap-4 lg:grid-cols-[19rem_1fr]">
                    {/* Bandeja de pedidos que llegaron al almacén */}
                    <aside className="overflow-hidden rounded-lg border border-edge bg-white shadow-sm lg:sticky lg:top-4 lg:self-start">
                        <p className="border-b border-edge px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                            Por atender ({pedidos.length})
                        </p>
                        <ul className="max-h-[70vh] overflow-y-auto p-1">
                            {pedidos.map((p) => {
                                const activo = p.id === seleccionado?.id;
                                return (
                                    <li key={p.id}>
                                        <button
                                            type="button"
                                            onClick={() => setSeleccionado(p)}
                                            className={cn(
                                                'w-full rounded-md px-2.5 py-2 text-left text-sm transition',
                                                activo
                                                    ? 'bg-primary-50 font-medium text-primary-700'
                                                    : 'text-warm-700 hover:bg-gray-50',
                                            )}
                                        >
                                            <span className="flex items-center justify-between gap-2">
                                                <span className="flex min-w-0 items-center gap-2">
                                                    <ClipboardList className="h-4 w-4 shrink-0 text-primary-600" />
                                                    <span className="truncate">{p.requerimiento_numero ?? p.documento}</span>
                                                </span>
                                                {/* Solicitado: nadie ha empezado. Si ya hay
                                                    escaneos, cuántos rollos van. */}
                                                {p.estado === 'solicitado' ? (
                                                    <Badge variant="amber">Solicitado</Badge>
                                                ) : p.estado === 'separado' ? (
                                                    <Badge variant="green">Separado</Badge>
                                                ) : (
                                                    <Badge variant={p.completo ? 'green' : 'blue'}>
                                                        {num(p.metros_asignados)}/{num(p.total_metros)} m
                                                    </Badge>
                                                )}
                                            </span>
                                            <span className="mt-0.5 block truncate text-xs text-warm-500">
                                                {p.cliente ?? 'Cliente varios'} · {num(p.total_metros)} m
                                            </span>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    </aside>

                    {/* El pedido que se está preparando */}
                    <section className="rounded-lg border border-edge bg-white shadow-sm">
                        {!detalle ? (
                            <p className="px-4 py-16 text-center text-sm text-warm-400">
                                Elige una solicitud para atenderla.
                            </p>
                        ) : (
                            <>
                                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-edge px-4 py-3">
                                    <div className="min-w-0">
                                        <h2 className="text-sm font-semibold text-warm-900">
                                            {detalle.requerimiento_numero ?? detalle.documento}
                                        </h2>
                                        <p className="text-xs text-warm-500">
                                            {detalle.cliente ?? 'Cliente varios'} · {lineas.length} producto(s) ·{' '}
                                            {num(total)} m
                                        </p>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <Button
                                            variant="secondary"
                                            size="sm"
                                            onClick={() =>
                                                setPdf({
                                                    tipo: 'requerimiento-almacen',
                                                    id: detalle.id,
                                                    nombre: detalle.requerimiento_numero,
                                                })
                                            }
                                        >
                                            <FileText className="h-4 w-4" />
                                            Imprimir
                                        </Button>

                                        {/* Mientras junta rollos, el botón cierra la
                                            preparación. Ya separado, lo que queda es
                                            entregarlos. */}
                                        {separado ? (
                                            <Button size="sm" loading={despachando} onClick={despachar}>
                                                <PackageCheck className="h-4 w-4" />
                                                Despachar
                                            </Button>
                                        ) : (
                                            <Button size="sm" loading={tomando} disabled={!completo} onClick={separar}>
                                                <PackageCheck className="h-4 w-4" />
                                                Separado
                                            </Button>
                                        )}
                                    </div>
                                </div>

                                {detalle.estado === 'solicitado' && (
                                    <div className="border-b border-edge bg-amber-50/70 px-4 py-2.5 text-sm text-amber-800">
                                        Busca en el rack los metros que pide cada línea y escanea
                                        cada rollo: el sistema los va sumando. Con el primero, el
                                        pedido pasa a <strong>Preparando</strong> solo.
                                    </div>
                                )}

                                {separado && (
                                    <div className="border-b border-edge bg-green-50 px-4 py-2.5 text-sm text-green-800">
                                        Pedido separado y verificado. Los rollos están apartados
                                        esperando su salida; pulsa <strong>Despachar</strong> cuando
                                        se los lleven.
                                    </div>
                                )}

                                {/* La pistola escribe aquí y termina con Enter */}
                                <form
                                    onSubmit={escanear}
                                    className={cn('border-b border-edge px-4 py-3', !escaneando && 'hidden')}
                                >
                                    <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-warm-500">
                                        Escanea el rollo
                                    </label>
                                    <div className="flex items-center gap-2">
                                        <span className="relative flex-1">
                                            <ScanLine className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-primary-600" />
                                            <input
                                                ref={inputRef}
                                                value={codigo}
                                                onChange={(e) => setCodigo(e.target.value)}
                                                // La pistola termina cada lectura con Enter. No se
                                                // deja al envío implícito del formulario: se
                                                // atiende aquí para que funcione siempre, con
                                                // cualquier lector y sin depender del navegador.
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
                                        {/* La pistola termina cada lectura con Enter, y sin un
                                            botón de envío el formulario no se envía solo. También
                                            sirve para teclear el código a mano si falla el lector. */}
                                        <Button type="submit" size="sm" disabled={!codigo.trim()}>
                                            Verificar
                                        </Button>
                                        {/* La misma verificación, leyendo el QR de la etiqueta
                                            con la cámara del celular. */}
                                        <Button
                                            type="button"
                                            variant="secondary"
                                            size="sm"
                                            onClick={() => setCamara(true)}
                                            title="Escanear con la cámara"
                                        >
                                            <Camera className="h-4 w-4" />
                                        </Button>
                                        <span className="text-sm font-medium text-warm-700">
                                            {num(verificados)}/{num(total)} m
                                        </span>
                                    </div>

                                    {ultimo && (
                                        <div
                                            className={cn(
                                                'mt-2 flex items-center gap-2 rounded-md px-3 py-2 text-sm',
                                                ultimo.ok
                                                    ? 'bg-green-50 text-green-800'
                                                    : 'bg-red-50 text-red-800',
                                            )}
                                        >
                                            {ultimo.ok ? (
                                                <Check className="h-4 w-4 shrink-0" />
                                            ) : (
                                                <TriangleAlert className="h-4 w-4 shrink-0" />
                                            )}
                                            <span>
                                                <strong>{ultimo.codigo}</strong> · {ultimo.texto}
                                                {ultimo.ok && ultimo.metros ? ` · ${num(ultimo.metros)} m` : ''}
                                            </span>
                                        </div>
                                    )}
                                </form>

                                {completo && escaneando && (
                                    <div className="border-b border-edge bg-green-50 px-4 py-2 text-sm text-green-800">
                                        Todo lo pedido está cubierto. Pulsa <strong>Separado</strong> para
                                        cerrar la preparación.
                                    </div>
                                )}

                                {/* Lo que pidió el cliente y con qué se va
                                    cubriendo. El almacenero no sigue una lista
                                    de rollos: busca los metros que faltan. */}
                                <ul className="divide-y divide-gray-100">
                                    {(detalle.detalles ?? []).map((d) => (
                                        <li key={d.id} className={cn('px-4 py-3', d.cubierta && 'bg-green-50/60')}>
                                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                                                <span
                                                    className={cn(
                                                        'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border',
                                                        d.cubierta
                                                            ? 'border-green-500 bg-green-500 text-white'
                                                            : 'border-gray-300 text-transparent',
                                                    )}
                                                >
                                                    <Check className="h-3.5 w-3.5" />
                                                </span>
                                                <span className="font-medium text-warm-900">{d.producto}</span>
                                                <span className="text-warm-500">{d.presentacion}</span>
                                                <span className="ml-auto font-medium text-warm-900">
                                                    {num(d.metros_asignados)} / {num(d.metros)} m
                                                </span>
                                                {!d.cubierta && (
                                                    <Badge variant="amber">
                                                        Faltan {num(d.metros_pendientes)} m
                                                    </Badge>
                                                )}
                                            </div>

                                            {d.descripcion && (
                                                <p className="ml-9 mt-0.5 text-xs text-warm-500">{d.descripcion}</p>
                                            )}

                                            {d.rollos?.length > 0 && (
                                                <ul className="ml-9 mt-1.5 space-y-1">
                                                    {d.rollos.map((r) => (
                                                        <li
                                                            key={r.id}
                                                            className="flex flex-wrap items-center gap-x-2 text-xs text-warm-600"
                                                        >
                                                            <span className="font-mono font-medium text-warm-900">
                                                                {r.codigo}
                                                            </span>
                                                            <span>{r.color ?? '—'}</span>
                                                            <span>{num(r.metros)} m</span>
                                                            {r.es_parcial && <Badge variant="amber">Cortar</Badge>}
                                                            {escaneando && (
                                                                <button
                                                                    type="button"
                                                                    aria-label={`Quitar ${r.codigo}`}
                                                                    title="Quitar este rollo del pedido"
                                                                    onClick={() => quitarRollo(r.rollo_id)}
                                                                    className="rounded p-0.5 text-red-600 transition hover:bg-red-50"
                                                                >
                                                                    <X className="h-3.5 w-3.5" />
                                                                </button>
                                                            )}
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            </>
                        )}
                    </section>
                </div>
            )}

            <EscanerCamara
                abierto={camara}
                onCerrar={() => setCamara(false)}
                onLeer={verificar}
                titulo={detalle ? `${detalle.requerimiento_numero ?? detalle.documento} · ${num(verificados)}/${num(total)} m` : 'Escanear rollo'}
            />

            <PdfViewerModal
                open={Boolean(pdf)}
                onClose={() => setPdf(null)}
                tipo={pdf?.tipo}
                id={pdf?.id}
                nombre={pdf?.nombre}
                titulo="Requerimiento de almacén"
            />
        </Layout>
    );
}
