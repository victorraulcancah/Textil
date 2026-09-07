import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ClipboardList, FileText, PackageCheck, ScanLine, TriangleAlert } from 'lucide-react';
import api, { asList } from '../lib/api';
import { useToast } from '../lib/toast';
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
    const [pdf, setPdf] = useState(null);

    /** Último escaneo, para pintarlo en verde o en rojo. */
    const [ultimo, setUltimo] = useState(null);
    const [codigo, setCodigo] = useState('');
    const inputRef = useRef(null);

    const cargar = useCallback(async () => {
        setCargando(true);
        try {
            const { data } = await api.get('/ordenes-venta', { params: { estado: 'en_preparacion' } });
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

    const escanear = async (e) => {
        e.preventDefault();
        const valor = codigo.trim();
        if (!valor || !detalle) return;

        setCodigo('');
        try {
            const { data } = await api.post(`/ordenes-venta/${detalle.id}/escanear`, { codigo: valor });
            setUltimo({ ok: true, codigo: data.rollo.codigo, metros: data.metros, texto: 'Rollo correcto' });
            await cargarDetalle(detalle.id);
        } catch (err) {
            setUltimo({
                ok: false,
                codigo: valor,
                texto: err.response?.data?.message ?? 'No se pudo verificar el rollo.',
            });
        }
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

    const verificados = (detalle?.detalles ?? []).filter((d) => d.escaneado).length;
    const total = detalle?.detalles?.length ?? 0;
    const completo = total > 0 && verificados === total;

    return (
        <Layout>
            <PageHeader
                title="Preparación y despacho"
                description="Escanea cada rollo antes de que salga del almacén"
            />

            {cargando ? (
                <div className="flex justify-center py-24">
                    <Spinner size="lg" className="text-primary-600" />
                </div>
            ) : pedidos.length === 0 ? (
                <Alert variant="info">
                    No hay pedidos por preparar. Cuando Ventas envíe uno al almacén aparecerá aquí.
                </Alert>
            ) : (
                <div className="grid gap-4 lg:grid-cols-[19rem,1fr]">
                    {/* Bandeja de pedidos que llegaron al almacén */}
                    <aside className="overflow-hidden rounded-lg border border-edge bg-white shadow-sm lg:sticky lg:top-4 lg:self-start">
                        <p className="border-b border-edge px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                            Por preparar ({pedidos.length})
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
                                                <Badge variant={p.verificados === p.total_rollos ? 'green' : 'amber'}>
                                                    {p.verificados}/{p.total_rollos}
                                                </Badge>
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
                                Elige un pedido para prepararlo.
                            </p>
                        ) : (
                            <>
                                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-edge px-4 py-3">
                                    <div className="min-w-0">
                                        <h2 className="text-sm font-semibold text-warm-900">
                                            {detalle.requerimiento_numero ?? detalle.documento}
                                        </h2>
                                        <p className="text-xs text-warm-500">
                                            {detalle.cliente ?? 'Cliente varios'} · {total} rollos ·{' '}
                                            {num(detalle.total_metros)} m
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
                                        <Button size="sm" loading={despachando} disabled={!completo} onClick={despachar}>
                                            <PackageCheck className="h-4 w-4" />
                                            Despachar
                                        </Button>
                                    </div>
                                </div>

                                {/* La pistola escribe aquí y termina con Enter */}
                                <form onSubmit={escanear} className="border-b border-edge px-4 py-3">
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
                                        <span className="text-sm font-medium text-warm-700">
                                            {verificados}/{total}
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

                                {completo && (
                                    <div className="border-b border-edge bg-green-50 px-4 py-2 text-sm text-green-800">
                                        Todos los rollos verificados. Ya se puede despachar.
                                    </div>
                                )}

                                <ul className="divide-y divide-gray-100">
                                    {(detalle.detalles ?? []).map((d) => (
                                        <li
                                            key={d.id}
                                            className={cn(
                                                'flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm',
                                                d.escaneado && 'bg-green-50/60',
                                            )}
                                        >
                                            <span
                                                className={cn(
                                                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border',
                                                    d.escaneado
                                                        ? 'border-green-500 bg-green-500 text-white'
                                                        : 'border-gray-300 text-transparent',
                                                )}
                                            >
                                                <Check className="h-3.5 w-3.5" />
                                            </span>
                                            <span className="font-mono font-medium text-warm-900">
                                                {d.rollo?.codigo}
                                            </span>
                                            <span className="text-warm-600">{d.rollo?.color?.nombre ?? '—'}</span>
                                            <span className="text-warm-600">{num(d.metros)} m</span>
                                            {d.es_parcial && <Badge variant="amber">Cortar</Badge>}
                                            <span className="ml-auto text-xs text-warm-500">
                                                {d.rollo?.ubicacion}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            </>
                        )}
                    </section>
                </div>
            )}

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
