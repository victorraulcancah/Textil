import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Check, ClipboardList, FileText, PackageCheck, PlusCircle, ScanLine, Scissors, TriangleAlert, UserPlus, Users, X } from 'lucide-react';
import api, { asList } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import { gruposDePedido } from '../lib/planilla';
import EscanerCamara from '../components/EscanerCamara';
import FiltroAlmacen from '../components/FiltroAlmacen';
import Layout from '../components/Layout';
import PageHeader from '../components/PageHeader';
import PlanillaTela from '../components/PlanillaTela';
import PdfViewerModal from '../components/PdfViewerModal';
import { Alert, Badge, Button, Input, Modal, Select, Spinner, cn } from '../components/ui';

const num = (n) => new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 }).format(Number(n) || 0);

/** "1 rollo" / "3 rollos". */
const rollosTexto = (n) => `${num(n)} rollo${Number(n) === 1 ? '' : 's'}`;

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
    const { user, puede } = useAuth();
    // Repartir los pedidos entre los almaceneros lo hace el encargado.
    const puedeAsignar = puede('inventario.despacho.asignar');

    const [pedidos, setPedidos] = useState([]);
    /** Solo el Super Admin elige almacén; los demás ven el suyo. */
    const [almacenId, setAlmacenId] = useState('');
    /** "todas" o "mias": el almacenero puede quedarse solo con lo que le repartieron. */
    const [filtro, setFiltro] = useState('todas');
    const [almaceneros, setAlmaceneros] = useState(null);
    const [asignando, setAsignando] = useState(false);
    const [elegidos, setElegidos] = useState([]);
    const [guardandoAsignacion, setGuardandoAsignacion] = useState(false);
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

    /**
     * `silencioso` es para el refresco automático de fondo: sin spinner ni
     * toast de error, para no interrumpir a quien está disparando la pistola
     * solo porque hubo un hipo de red en un ciclo del sondeo.
     */
    const cargar = useCallback(
        async (silencioso = false) => {
            if (!silencioso) setCargando(true);
            try {
                // Los tres estados que le tocan al almacén: la solicitud recién
                // llegada, la que está juntando y la que ya apartó pero no ha
                // salido todavía.
                // Del almacén en el que se trabaja: el servidor limita a cada usuario al suyo, y el Super Admin
                // puede elegir uno (o ver todos).
                const { data } = await api.get('/ordenes-venta', {
                    params: { estados: 'solicitado,preparando,separado', almacen_id: almacenId || undefined },
                });
                const filas = asList({ data });
                setPedidos(filas);
                setSeleccionado((prev) => filas.find((p) => p.id === prev?.id) ?? filas[0] ?? null);
            } catch {
                if (!silencioso) toast.error('No se pudieron cargar los pedidos por preparar.');
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
        const { data } = await api.get(`/ordenes-venta/${id}`);
        setDetalle(data?.data ?? data);
    }, []);

    // Depende del id, no del objeto: el sondeo de fondo reemplaza el array de
    // "pedidos" cada ciclo, así que "seleccionado" cambia de referencia aunque
    // siga siendo el mismo pedido. Si este efecto dependiera del objeto,
    // repetiría la carga y borraría el aviso de "Rollo correcto" cada 5 s.
    const seleccionadoId = seleccionado?.id ?? null;

    useEffect(() => {
        if (!seleccionadoId) {
            setDetalle(null);
            return;
        }
        setUltimo(null);
        cargarDetalle(seleccionadoId).catch(() => setDetalle(null));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [seleccionadoId, cargarDetalle]);

    /**
     * Un pedido lo puede estar preparando más de un almacenero a la vez, cada
     * uno en su propio navegador: sin esto, ninguno ve lo que el otro va
     * escaneando hasta recargar la página a mano. Se refresca en silencio —
     * sin spinner ni error visible— para no interrumpir a quien está
     * disparando la pistola.
     */
    const seleccionadoIdRef = useRef(null);
    seleccionadoIdRef.current = seleccionado?.id ?? null;

    useEffect(() => {
        const intervalo = setInterval(() => {
            cargar(true).catch(() => {});
            if (seleccionadoIdRef.current) {
                cargarDetalle(seleccionadoIdRef.current).catch(() => {});
            }
        }, 5000);

        return () => clearInterval(intervalo);
    }, [cargar, cargarDetalle]);

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
                // Entero (se va tal cual) o corte (se saca un trozo al despachar).
                const avanceTexto =
                    data.rollos_pedidos > 0
                        ? `${num(data.rollos_asignados)}/${num(data.rollos_pedidos)} rollos`
                        : `${num(data.verificados)}/${num(data.total)} m`;
                const texto = `Rollo correcto · ${num(data.metros)} m ${data.entero ? 'entero' : 'de corte'} · ${avanceTexto}`;
                setUltimo({ ok: true, codigo: data.rollo.codigo, metros: data.metros, texto: 'Rollo correcto' });
                await cargarDetalle(detalle.id);

                // La bandeja se refresca en los dos momentos en que su
                // contenido cambia de verdad: el primer escaneo, que pone el
                // pedido en preparación, y el último, que lo deja cubierto. En
                // los del medio no, o con treinta rollos serían treinta
                // recargas de la lista.
                if (estadoAntes === 'solicitado' || data.completo) await cargar();
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

    /**
     * Descontar metraje de un rollo ya tomado: un ajuste de sistema con su motivo (los de salida de
     * Ajustes). El rollo se queda en el pedido con menos metros.
     */
    const [descuento, setDescuento] = useState(null);
    const [motivosAjuste, setMotivosAjuste] = useState(null);
    const [formDescuento, setFormDescuento] = useState({ metros: '', motivo: '', observaciones: '' });
    const [guardandoDescuento, setGuardandoDescuento] = useState(false);
    /** El motivo nuevo que se está escribiendo (null = el campo está cerrado). */
    const [motivoNuevo, setMotivoNuevo] = useState(null);
    const [guardandoMotivo, setGuardandoMotivo] = useState(false);

    /** Los datos del rollo (código, metros, color) tal como están en el pedido. */
    const rolloDelPedido = (rolloId) =>
        (detalle?.detalles ?? []).flatMap((d) => d.rollos ?? []).find((r) => r.rollo_id === rolloId) ?? null;

    const abrirDescuento = async (rolloId) => {
        const r = rolloDelPedido(rolloId);
        if (!r) return;
        setDescuento(r);
        setFormDescuento({ metros: '', motivo: '', observaciones: '' });
        setMotivoNuevo(null);
        if (motivosAjuste) return;
        try {
            const { data } = await api.get('/ordenes-venta/motivos-ajuste');
            setMotivosAjuste(asList({ data }));
        } catch (err) {
            setDescuento(null);
            toast.error(err.response?.data?.message ?? 'No se pudieron cargar los motivos de ajuste.');
        }
    };

    /** Crea un motivo (queda en el catálogo de Ajustes) y lo deja elegido. */
    const agregarMotivo = async () => {
        const nombre = (motivoNuevo ?? '').trim();
        if (!nombre) return;
        setGuardandoMotivo(true);
        try {
            const { data } = await api.post('/ordenes-venta/motivos-ajuste/nuevo', { nombre });
            setMotivosAjuste((prev) => [...(prev ?? []), data]);
            setFormDescuento((f) => ({ ...f, motivo: data.nombre }));
            setMotivoNuevo(null);
            toast.success(`Motivo "${data.nombre}" agregado.`);
        } catch (err) {
            toast.error(err.response?.data?.errors?.nombre?.[0] ?? err.response?.data?.message ?? 'No se pudo agregar el motivo.');
        } finally {
            setGuardandoMotivo(false);
        }
    };

    const guardarDescuento = async () => {
        setGuardandoDescuento(true);
        try {
            const { data } = await api.post(`/ordenes-venta/${detalle.id}/descontar-metraje`, {
                rollo_id: descuento.rollo_id,
                metros: Number(formDescuento.metros),
                motivo: formDescuento.motivo,
                observaciones: formDescuento.observaciones || undefined,
            });
            setDetalle(data?.data ?? data);
            setDescuento(null);
            toast.success(`Se descontaron ${num(formDescuento.metros)} m de ${descuento.codigo}.`);
            await cargar();
        } catch (err) {
            toast.error(err.response?.data?.message ?? 'No se pudo descontar el metraje.');
        } finally {
            setGuardandoDescuento(false);
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

    /** El encargado abre el reparto: a quién le toca preparar este pedido. */
    const abrirAsignacion = async () => {
        setElegidos((detalle?.asignados ?? []).map((a) => a.id));
        setAsignando(true);
        if (almaceneros) return;
        try {
            const { data } = await api.get('/ordenes-venta/almaceneros');
            setAlmaceneros(asList({ data }));
        } catch (err) {
            setAsignando(false);
            toast.error(err.response?.data?.message ?? 'No se pudo cargar al personal de almacén.');
        }
    };

    const alternarElegido = (id) =>
        setElegidos((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

    const guardarAsignacion = async () => {
        setGuardandoAsignacion(true);
        try {
            const { data } = await api.post(`/ordenes-venta/${detalle.id}/asignar`, { usuarios: elegidos });
            setDetalle(data?.data ?? data);
            setAsignando(false);
            toast.success(elegidos.length ? 'Pedido asignado.' : 'Pedido sin asignar.');
            await cargar(true);
        } catch (err) {
            toast.error(err.response?.data?.message ?? 'No se pudo asignar el pedido.');
        } finally {
            setGuardandoAsignacion(false);
        }
    };

    // "Mis tareas" solo tiene sentido si alguien ya repartió algo.
    const hayReparto = pedidos.some((p) => p.asignados?.length);
    const visibles =
        filtro === 'mias' ? pedidos.filter((p) => p.asignados?.some((a) => a.id === user?.id)) : pedidos;

    /** Todavía se pueden escanear rollos: solicitado o en plena preparación. */
    const escaneando = ['solicitado', 'preparando'].includes(detalle?.estado);
    const separado = detalle?.estado === 'separado';
    // El avance: lo pedido en rollos se cuenta en rollos (cada uno trae su
    // metraje, que se conoce al escanearlo); lo demás, en metros cubiertos.
    const lineas = detalle?.detalles ?? [];
    const lineasRollos = lineas.filter((d) => d.modo === 'rollos');
    const lineasMetros = lineas.filter((d) => d.modo !== 'rollos');
    const rollosPedidos = lineasRollos.reduce((s, d) => s + Number(d.rollos_pedidos || 0), 0);
    const rollosCubiertos = lineasRollos.reduce((s, d) => s + Number(d.rollos_asignados || 0), 0);
    const verificados = lineasMetros.reduce((s, d) => s + Number(d.metros_asignados || 0), 0);
    const total = lineasMetros.reduce((s, d) => s + Number(d.metros || 0), 0);
    const avance = [
        rollosPedidos > 0 ? `${num(rollosCubiertos)}/${num(rollosPedidos)} rollos` : null,
        lineasMetros.length > 0 ? `${num(verificados)}/${num(total)} m` : null,
    ]
        .filter(Boolean)
        .join(' · ');
    const completo = lineas.length > 0 && lineas.every((d) => d.cubierta);

    return (
        <Layout>
            <PageHeader
                title="Preparación y despacho"
                description="Atiende las solicitudes de venta: escanea, separa y despacha"
                actions={<FiltroAlmacen value={almacenId} onChange={setAlmacenId} />}
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
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-[19rem_minmax(0,1fr)]">
                    {/* Bandeja de pedidos que llegaron al almacén */}
                    <aside className="min-w-0 overflow-hidden rounded-lg border border-edge bg-white shadow-sm lg:sticky lg:top-4 lg:self-start">
                        <div className="flex items-center justify-between gap-2 border-b border-edge px-3 py-2">
                            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                                Por atender ({visibles.length})
                            </p>
                            {hayReparto && (
                                <div className="flex overflow-hidden rounded-md border border-edge text-xs">
                                    {[
                                        ['todas', 'Todas'],
                                        ['mias', 'Mis tareas'],
                                    ].map(([clave, texto]) => (
                                        <button
                                            key={clave}
                                            type="button"
                                            onClick={() => setFiltro(clave)}
                                            className={cn(
                                                'px-2 py-1 transition',
                                                filtro === clave
                                                    ? 'bg-primary-600 font-medium text-white'
                                                    : 'bg-white text-warm-600 hover:bg-gray-50',
                                            )}
                                        >
                                            {texto}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                        <ul className="max-h-48 overflow-y-auto p-1 lg:max-h-[70vh]">
                            {visibles.length === 0 && (
                                <li className="px-3 py-6 text-center text-xs text-warm-400">
                                    No tienes pedidos asignados.
                                </li>
                            )}
                            {visibles.map((p) => {
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
                                                        {p.rollos_pedidos > 0
                                                            ? `${num(p.rollos_asignados)}/${num(p.rollos_pedidos)} rollos`
                                                            : `${num(p.metros_asignados)}/${num(p.total_metros)} m`}
                                                    </Badge>
                                                )}
                                            </span>
                                            <span className="mt-0.5 block truncate text-xs text-warm-500">
                                                {p.cliente ?? 'Cliente varios'} ·{' '}
                                                {p.rollos_pedidos > 0 ? rollosTexto(p.rollos_pedidos) : `${num(p.total_metros)} m`}
                                            </span>
                                            {/* A quién le tocó, si el encargado ya lo repartió. */}
                                            {p.asignados?.length > 0 && (
                                                <span className="mt-0.5 flex items-center gap-1 truncate text-xs text-primary-700">
                                                    <Users className="h-3 w-3 shrink-0" />
                                                    {p.asignados.map((a) => a.name).join(', ')}
                                                </span>
                                            )}
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    </aside>

                    {/* El pedido que se está preparando */}
                    <section className="min-w-0 rounded-lg border border-edge bg-white shadow-sm">
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
                                            {rollosPedidos > 0 ? rollosTexto(rollosPedidos) : `${num(total)} m`}
                                        </p>
                                        {/* Quién tiene la tarea: lo reparte el encargado. */}
                                        {detalle.asignados?.length > 0 && (
                                            <p className="mt-0.5 flex items-center gap-1 text-xs text-primary-700">
                                                <Users className="h-3 w-3 shrink-0" />
                                                Asignado a {detalle.asignados.map((a) => a.name).join(', ')}
                                            </p>
                                        )}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        {puedeAsignar && (
                                            <Button variant="secondary" size="sm" onClick={abrirAsignacion}>
                                                <UserPlus className="h-4 w-4" />
                                                Asignar
                                            </Button>
                                        )}
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
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="relative min-w-0 flex-[1_1_14rem]">
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
                                        <span className="text-sm font-medium text-warm-700">{avance}</span>
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

                                {/* Lo que pidió el cliente y con qué se va cubriendo, en el mismo
                                    formato del pedido (una tabla por tela, rollo por rollo) pero sin
                                    precios: el almacenero busca los metros que faltan. */}
                                <div className="overflow-x-auto p-2 sm:p-4">
                                    <PlanillaTela
                                        grupos={gruposDePedido(detalle.detalles ?? [])}
                                        precios={false}
                                        pendiente={!completo}
                                        completa={(f) => Boolean(f.hecho)}
                                        accion={
                                            // La X se puede dar mientras se prepara y también ya separado (hasta
                                            // despacharlo): quitar un rollo lo devuelve a preparación.
                                            escaneando || separado
                                                ? (f) =>
                                                      f.rolloId ? (
                                                          <span className="inline-flex items-center gap-1">
                                                              <button
                                                                  type="button"
                                                                  aria-label={`Descontar metraje de ${f.detalle ?? 'rollo'}`}
                                                                  title="Descontar metraje de este rollo (ajuste de sistema)"
                                                                  onClick={() => abrirDescuento(f.rolloId)}
                                                                  className="rounded p-0.5 text-primary-600 transition hover:bg-primary-50"
                                                              >
                                                                  <Scissors className="h-3.5 w-3.5" />
                                                              </button>
                                                              <button
                                                                  type="button"
                                                                  aria-label={`Quitar ${f.detalle ?? 'rollo'}`}
                                                                  title={separado ? 'Quitar este rollo: el pedido vuelve a preparación' : 'Quitar este rollo del pedido'}
                                                                  onClick={() => quitarRollo(f.rolloId)}
                                                                  className="rounded p-0.5 text-red-600 transition hover:bg-red-50"
                                                              >
                                                                  <X className="h-3.5 w-3.5" />
                                                              </button>
                                                          </span>
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

            <EscanerCamara
                abierto={camara}
                onCerrar={() => setCamara(false)}
                onLeer={verificar}
                titulo={detalle ? `${detalle.requerimiento_numero ?? detalle.documento} · ${avance}` : 'Escanear rollo'}
            />

            <PdfViewerModal
                open={Boolean(pdf)}
                onClose={() => setPdf(null)}
                tipo={pdf?.tipo}
                id={pdf?.id}
                nombre={pdf?.nombre}
                titulo="Requerimiento de almacén"
            />

            {/* Descontar metraje de un rollo: ajuste de sistema con su motivo. */}
            <Modal
                open={Boolean(descuento)}
                onClose={() => setDescuento(null)}
                title="Descontar metraje"
                description={descuento ? `Rollo ${descuento.codigo} · ${descuento.color ?? ''} · tiene ${num(descuento.metros_rollo)} m` : ''}
                size="sm"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setDescuento(null)}>
                            Cancelar
                        </Button>
                        <Button
                            loading={guardandoDescuento}
                            disabled={!(Number(formDescuento.metros) > 0) || !formDescuento.motivo}
                            onClick={guardarDescuento}
                        >
                            Descontar
                        </Button>
                    </>
                }
            >
                {!motivosAjuste ? (
                    <div className="flex justify-center py-6">
                        <Spinner className="text-primary-600" />
                    </div>
                ) : (
                    <div className="space-y-3">
                        <Input
                            label="Metros a descontar"
                            type="number"
                            min="0"
                            step="any"
                            autoFocus
                            value={formDescuento.metros}
                            onChange={(e) => setFormDescuento((f) => ({ ...f, metros: e.target.value }))}
                        />
                        {/* El motivo, con el icono de más para crear otros sin salir de aquí. */}
                        <div className="flex items-end gap-2">
                            <Select
                                label="Motivo del ajuste de sistema"
                                value={formDescuento.motivo}
                                onChange={(e) => setFormDescuento((f) => ({ ...f, motivo: e.target.value }))}
                                options={[
                                    { value: '', label: 'Elige el motivo' },
                                    ...motivosAjuste.map((m) => ({ value: m.nombre, label: m.nombre })),
                                ]}
                                className="flex-1"
                            />
                            <button
                                type="button"
                                aria-label="Agregar un motivo"
                                title="Agregar un motivo nuevo"
                                onClick={() => setMotivoNuevo((v) => (v === null ? '' : null))}
                                className="mb-1 rounded-full p-1 text-primary-600 transition hover:bg-primary-50"
                            >
                                <PlusCircle className="h-6 w-6" />
                            </button>
                        </div>
                        {motivoNuevo !== null && (
                            <div className="flex items-end gap-2 rounded-md bg-gray-50 p-2">
                                <Input
                                    label="Motivo nuevo"
                                    autoFocus
                                    value={motivoNuevo}
                                    onChange={(e) => setMotivoNuevo(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            agregarMotivo();
                                        }
                                    }}
                                    placeholder="Ej.: Falla de tela"
                                    className="flex-1"
                                />
                                <Button size="sm" loading={guardandoMotivo} disabled={!motivoNuevo.trim()} onClick={agregarMotivo}>
                                    Agregar
                                </Button>
                            </div>
                        )}
                        <Input
                            label="Observación (opcional)"
                            value={formDescuento.observaciones}
                            onChange={(e) => setFormDescuento((f) => ({ ...f, observaciones: e.target.value }))}
                        />
                        {descuento && Number(formDescuento.metros) > 0 && (
                            <p className="text-xs text-warm-500">
                                El rollo quedará en {num(Math.max(Number(descuento.metros_rollo) - Number(formDescuento.metros), 0))} m
                                y el pedido se despacha con esos metros.
                            </p>
                        )}
                    </div>
                )}
            </Modal>

            {/* El encargado reparte el pedido: uno o varios almaceneros. */}
            <Modal
                open={asignando}
                onClose={() => setAsignando(false)}
                title="Asignar pedido"
                description={`${detalle?.requerimiento_numero ?? detalle?.documento ?? ''}: elige quién lo prepara. Puedes marcar a más de uno.`}
                size="sm"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setAsignando(false)}>
                            Cancelar
                        </Button>
                        <Button loading={guardandoAsignacion} onClick={guardarAsignacion}>
                            Guardar
                        </Button>
                    </>
                }
            >
                {!almaceneros ? (
                    <div className="flex justify-center py-6">
                        <Spinner className="text-primary-600" />
                    </div>
                ) : almaceneros.length === 0 ? (
                    <p className="py-4 text-center text-sm text-warm-500">
                        No hay personal con permiso de despacho.
                    </p>
                ) : (
                    <ul className="space-y-1">
                        {almaceneros.map((a) => (
                            <li key={a.id}>
                                <label className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm text-warm-800 hover:bg-gray-50">
                                    <input
                                        type="checkbox"
                                        className="h-4 w-4 rounded border-gray-300"
                                        checked={elegidos.includes(a.id)}
                                        onChange={() => alternarElegido(a.id)}
                                    />
                                    {a.name}
                                </label>
                            </li>
                        ))}
                    </ul>
                )}
            </Modal>
        </Layout>
    );
}
