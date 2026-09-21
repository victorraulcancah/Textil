import { useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import api from '../lib/api';
import { useToast } from '../lib/toast';
import PdfViewerModal from './PdfViewerModal';
import { Badge, Button, Modal, Spinner } from './ui';

const num = (n) => new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 }).format(Number(n) || 0);

const fecha = (iso) => (iso ? new Date(iso).toLocaleDateString('es-PE') : '—');

/** "21/09/2026 15:29" en la hora local. */
const fechaHora = (iso) =>
    iso
        ? new Date(iso).toLocaleString('es-PE', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
          })
        : '—';

const ESTADO_RECEPCION = {
    completa: { label: 'Completa', variant: 'green' },
    parcial: { label: 'Parcial', variant: 'amber' },
    deshecha: { label: 'Deshecha', variant: 'red' },
};

const ESTADO_PACKING = {
    pendiente: { label: 'Por recibir', variant: 'amber' },
    recibido: { label: 'Escaneado', variant: 'green' },
};

const colorTexto = (c) => (c ? (c.codigo ? `${c.nombre} (${c.codigo})` : c.nombre) : '—');

/** Encabezado de las tablas de este detalle. */
const Th = ({ children, derecha = false }) => (
    <th className={`px-3 py-2 ${derecha ? 'text-right' : ''}`}>{children}</th>
);

const TablaCabecera = 'bg-primary-600 text-left text-xs font-semibold uppercase tracking-wide text-white';

/**
 * Todo lo que se recibió de una compra, para verlo aunque ya esté
 * completamente recepcionada —cuando "Recepcionar" ya no se puede abrir—:
 * lo pedido y lo recibido por línea, cada recepción con sus rollos (quién los
 * recibió, cuándo y dónde quedaron) y lo que sigue por recibir del packing list.
 */
export default function DetalleRecepcionCompra({ open, onClose, compraId }) {
    const toast = useToast();
    const [cargando, setCargando] = useState(false);
    const [datos, setDatos] = useState(null);
    const [pdf, setPdf] = useState(null);

    useEffect(() => {
        if (!open || !compraId) return undefined;
        let vivo = true;
        setCargando(true);
        setDatos(null);
        api.get(`/compras/${compraId}/recepciones`)
            .then(({ data }) => vivo && setDatos(data))
            .catch(() => vivo && toast.error('No se pudo cargar el detalle de la recepción.'))
            .finally(() => vivo && setCargando(false));
        return () => {
            vivo = false;
        };
    }, [open, compraId, toast]);

    const compra = datos?.compra;
    const recepciones = datos?.recepciones ?? [];
    const porRecibir = datos?.por_recibir ?? [];
    const sinNada = datos && recepciones.length === 0 && porRecibir.length === 0;

    return (
        <>
            <Modal
                open={open}
                onClose={onClose}
                size="3xl"
                title={compra ? `Recepción de ${compra.numero_compra ?? `compra #${compra.id}`}` : 'Recepción de la compra'}
                description={
                    compra
                        ? [compra.orden && `Orden ${compra.orden}`, compra.proveedor].filter(Boolean).join(' · ')
                        : undefined
                }
                footer={
                    <Button variant="secondary" onClick={onClose}>
                        Cerrar
                    </Button>
                }
            >
                {cargando || !datos ? (
                    <div className="flex justify-center py-16">
                        <Spinner size="lg" className="text-primary-600" />
                    </div>
                ) : (
                    <div className="space-y-6">
                        {/* Resumen: lo que llevas recibido de un vistazo. */}
                        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-edge bg-gray-50 px-4 py-3 text-sm">
                            <span>
                                <span className="text-warm-500">Recepciones </span>
                                <strong className="text-warm-900">{datos.resumen.recepciones}</strong>
                            </span>
                            <span>
                                <span className="text-warm-500">Rollos recibidos </span>
                                <strong className="text-warm-900">{datos.resumen.rollos}</strong>
                            </span>
                            <span>
                                <span className="text-warm-500">Metros </span>
                                <strong className="text-warm-900">{num(datos.resumen.metros)} m</strong>
                            </span>
                            {compra.finalizado && (
                                <Badge variant="blue">
                                    Finalizada{compra.motivo_finalizacion ? `: ${compra.motivo_finalizacion}` : ''}
                                </Badge>
                            )}
                        </div>

                        {/* Lo que pidió la compra frente a lo que llegó. */}
                        <section>
                            <h3 className="mb-2 text-sm font-semibold text-warm-900">Lo pedido y lo recibido</h3>
                            <div className="overflow-x-auto rounded-lg border border-edge">
                                <table className="w-full min-w-[640px] text-sm">
                                    <thead>
                                        <tr className={TablaCabecera}>
                                            <Th>Producto</Th>
                                            <Th>Color</Th>
                                            <Th>Unidad</Th>
                                            <Th derecha>Pedida</Th>
                                            <Th derecha>Recibida</Th>
                                            <Th derecha>Pendiente</Th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {datos.lineas.map((l) => (
                                            <tr key={l.compra_detalle_id}>
                                                <td className="px-3 py-2 font-semibold text-warm-900">
                                                    {l.producto}
                                                    {l.codigo && (
                                                        <span className="ml-1 text-xs font-normal text-warm-400">
                                                            {l.codigo}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-3 py-2 text-warm-600">{colorTexto(l.color)}</td>
                                                <td className="px-3 py-2 text-warm-500">
                                                    {l.unidad ?? '—'}
                                                    {l.rollos ? ` · ${l.rollos} rollo${l.rollos === 1 ? '' : 's'}` : ''}
                                                </td>
                                                <td className="px-3 py-2 text-right text-warm-900">{num(l.pedida)}</td>
                                                <td className="px-3 py-2 text-right text-green-700">{num(l.recibida)}</td>
                                                <td
                                                    className={`px-3 py-2 text-right font-medium ${
                                                        l.pendiente > 0 ? 'text-amber-600' : 'text-warm-400'
                                                    }`}
                                                >
                                                    {num(l.pendiente)}
                                                    {l.finalizada > 0 && (
                                                        <span className="block text-xs font-normal text-warm-400">
                                                            {num(l.finalizada)} cerrado
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </section>

                        {sinNada && (
                            <p className="rounded-lg border border-dashed border-edge px-4 py-8 text-center text-sm text-warm-500">
                                Todavía no se recibió nada de esta compra.
                            </p>
                        )}

                        {/* Una tarjeta por recepción, con sus líneas y sus rollos. */}
                        {recepciones.map((r) => {
                            const estado = r.vigente
                                ? (ESTADO_RECEPCION[r.estado] ?? { label: r.estado, variant: 'gray' })
                                : ESTADO_RECEPCION.deshecha;

                            return (
                                <section
                                    key={r.id}
                                    className={`rounded-lg border border-edge ${r.vigente ? '' : 'opacity-70'}`}
                                >
                                    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-edge bg-gray-50 px-4 py-3">
                                        <div className="min-w-0">
                                            <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-warm-900">
                                                {r.documento ?? `Recepción #${r.id}`}
                                                <Badge variant={estado.variant}>{estado.label}</Badge>
                                            </p>
                                            <p className="text-xs text-warm-500">
                                                {fecha(r.fecha)}
                                                {r.almacen && ` · ${r.almacen}`}
                                                {r.recibe && ` · Recibió: ${r.recibe}`}
                                            </p>
                                        </div>
                                        <Button
                                            variant="secondary"
                                            size="sm"
                                            onClick={() => setPdf({ id: r.id, nombre: r.documento })}
                                        >
                                            <FileText className="h-4 w-4" />
                                            Imprimir / PDF
                                        </Button>
                                    </header>

                                    <div className="space-y-4 p-4">
                                        <div className="overflow-x-auto rounded-lg border border-edge">
                                            <table className="w-full min-w-[640px] text-sm">
                                                <thead>
                                                    <tr className={TablaCabecera}>
                                                        <Th>Producto</Th>
                                                        <Th>Color</Th>
                                                        <Th>Unidad</Th>
                                                        <Th derecha>Pedida</Th>
                                                        <Th derecha>Recibida</Th>
                                                        <Th derecha>Conforme</Th>
                                                        <Th derecha>Rechazada</Th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-100">
                                                    {r.detalles.map((d, i) => (
                                                        <tr key={i}>
                                                            <td className="px-3 py-2 font-semibold text-warm-900">
                                                                {d.producto}
                                                            </td>
                                                            <td className="px-3 py-2 text-warm-600">{d.color ?? '—'}</td>
                                                            <td className="px-3 py-2 text-warm-500">{d.unidad ?? '—'}</td>
                                                            <td className="px-3 py-2 text-right">{num(d.pedida)}</td>
                                                            <td className="px-3 py-2 text-right text-green-700">
                                                                {num(d.recibida)}
                                                            </td>
                                                            <td className="px-3 py-2 text-right">{num(d.conforme)}</td>
                                                            <td
                                                                className={`px-3 py-2 text-right ${
                                                                    d.rechazada > 0 ? 'font-medium text-red-600' : 'text-warm-400'
                                                                }`}
                                                            >
                                                                {num(d.rechazada)}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>

                                        {r.rollos.length > 0 && (
                                            <div>
                                                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-warm-500">
                                                    Rollos recibidos · {r.rollos.length} ·{' '}
                                                    {num(r.rollos.reduce((a, x) => a + x.metros, 0))} m
                                                </p>
                                                <div className="overflow-x-auto rounded-lg border border-edge">
                                                    <table className="w-full min-w-[820px] text-sm">
                                                        <thead>
                                                            <tr className={TablaCabecera}>
                                                                <Th>Rollo</Th>
                                                                <Th>Color</Th>
                                                                <Th derecha>Metros</Th>
                                                                <Th derecha>Peso neto</Th>
                                                                <Th>Ubicación</Th>
                                                                <Th>Recibió</Th>
                                                                <Th>Hora</Th>
                                                                <Th>Estado</Th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-gray-100">
                                                            {r.rollos.map((x) => (
                                                                <tr key={x.codigo}>
                                                                    <td className="px-3 py-2 font-mono text-xs font-semibold text-warm-900">
                                                                        {x.codigo}
                                                                    </td>
                                                                    <td className="px-3 py-2 text-warm-600">
                                                                        {colorTexto(x.color)}
                                                                    </td>
                                                                    <td className="px-3 py-2 text-right text-warm-900">
                                                                        {num(x.metros)} m
                                                                        {x.metros_actual !== x.metros && (
                                                                            <span className="block text-xs text-warm-400">
                                                                                hoy {num(x.metros_actual)} m
                                                                            </span>
                                                                        )}
                                                                    </td>
                                                                    <td className="px-3 py-2 text-right text-warm-600">
                                                                        {x.peso_kg != null ? `${num(x.peso_kg)} kg` : '—'}
                                                                    </td>
                                                                    <td className="px-3 py-2 text-warm-600">
                                                                        {x.ubicacion || '—'}
                                                                    </td>
                                                                    <td className="px-3 py-2 text-warm-600">{x.recibio ?? '—'}</td>
                                                                    <td className="px-3 py-2 text-warm-500">
                                                                        {fechaHora(x.hora)}
                                                                    </td>
                                                                    <td className="px-3 py-2">
                                                                        <Badge variant="gray">{x.estado}</Badge>
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        )}

                                        {r.observaciones && (
                                            <p className="text-sm text-warm-600">
                                                <span className="font-medium text-warm-800">Observaciones: </span>
                                                {r.observaciones}
                                            </p>
                                        )}
                                    </div>
                                </section>
                            );
                        })}

                        {/* Lo que el proveedor dijo que mandaba y aún no ingresó. */}
                        {porRecibir.length > 0 && (
                            <section>
                                <h3 className="mb-2 text-sm font-semibold text-warm-900">
                                    Packing list por recibir · {porRecibir.length} rollo{porRecibir.length === 1 ? '' : 's'} ·{' '}
                                    {num(porRecibir.reduce((a, f) => a + f.metros, 0))} m
                                </h3>
                                <div className="overflow-x-auto rounded-lg border border-edge">
                                    <table className="w-full min-w-[640px] text-sm">
                                        <thead>
                                            <tr className={TablaCabecera}>
                                                <Th>Rollo</Th>
                                                <Th>Color</Th>
                                                <Th derecha>Metros</Th>
                                                <Th derecha>Peso neto</Th>
                                                <Th>Estado</Th>
                                                <Th>Escaneó</Th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {porRecibir.map((f) => {
                                                const estado = ESTADO_PACKING[f.estado] ?? { label: f.estado, variant: 'gray' };
                                                return (
                                                    <tr key={f.id}>
                                                        <td className="px-3 py-2 font-mono text-xs font-semibold text-warm-900">
                                                            {f.codigo}
                                                        </td>
                                                        <td className="px-3 py-2 text-warm-600">
                                                            {colorTexto(f.color ? { nombre: f.color, codigo: f.color_codigo } : null)}
                                                        </td>
                                                        <td className="px-3 py-2 text-right">{num(f.metros)} m</td>
                                                        <td className="px-3 py-2 text-right text-warm-600">
                                                            {f.peso_kg != null ? `${num(f.peso_kg)} kg` : '—'}
                                                        </td>
                                                        <td className="px-3 py-2">
                                                            <Badge variant={estado.variant}>{estado.label}</Badge>
                                                        </td>
                                                        <td className="px-3 py-2 text-warm-500">
                                                            {f.escaneado_por
                                                                ? `${f.escaneado_por} · ${fechaHora(f.escaneado_at)}`
                                                                : '—'}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </section>
                        )}
                    </div>
                )}
            </Modal>

            <PdfViewerModal
                open={Boolean(pdf)}
                onClose={() => setPdf(null)}
                tipo="recepcion-compra"
                id={pdf?.id}
                nombre={pdf?.nombre}
                titulo="Recepción de compra"
            />
        </>
    );
}
