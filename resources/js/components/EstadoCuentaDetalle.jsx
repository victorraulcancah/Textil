import { useCallback, useEffect, useState } from 'react';
import { CalendarClock, Download, FileText, Printer, Wallet } from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { money } from '../lib/moneda';
import { useToast } from '../lib/toast';
import PdfViewerModal from './PdfViewerModal';
import { Alert, Badge, Button, Input, Spinner } from './ui';

/** "2026-09-29" en la fecha local, sin pasar por UTC. */
const iso = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const haceDias = (n) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return iso(d);
};
const fecha = (v) => (v ? new Date(`${String(v).slice(0, 10)}T00:00:00`).toLocaleDateString('es-PE') : '');

const SITUACION = {
    vencida: { label: 'Vencida', variant: 'red' },
    en_gracia: { label: 'En gracia', variant: 'amber' },
    vence_hoy: { label: 'Vence hoy', variant: 'amber' },
    por_vencer: { label: 'Por vencer', variant: 'blue' },
    al_dia: { label: 'Al día', variant: 'gray' },
};

/** Cuántos días faltan o pasaron, en palabras. */
const plazo = (dias) => {
    if (dias === 0) return 'hoy';
    if (dias > 0) return `en ${dias} ${dias === 1 ? 'día' : 'días'}`;
    return `hace ${-dias} ${dias === -1 ? 'día' : 'días'}`;
};

function Tarjeta({ label, valor, clase = 'text-warm-900', nota }) {
    return (
        <div className="rounded-xl border border-edge bg-white px-4 py-3 shadow-sm">
            <p className="text-[11px] uppercase tracking-wide text-warm-500">{label}</p>
            <p className={`text-lg font-bold ${clase}`}>{valor}</p>
            {nota && <p className="text-[11px] text-warm-500">{nota}</p>}
        </div>
    );
}

/**
 * El estado de cuenta de un cliente: su línea de crédito, sus ventas a
 * crédito (cargos) y sus pagos (abonos) con el saldo acumulado —por moneda—,
 * y las cuotas que le faltan pagar. Con sus fechas, Excel e impresión.
 * Lo usan la página de Estado de cuenta y el clic derecho en Clientes.
 */
export default function EstadoCuentaDetalle({ clienteId }) {
    const toast = useToast();
    const { puede } = useAuth();
    const [desde, setDesde] = useState(haceDias(90));
    const [hasta, setHasta] = useState(iso(new Date()));
    const [estado, setEstado] = useState(null);
    const [cargando, setCargando] = useState(false);
    const [pdf, setPdf] = useState(false);
    const [exportando, setExportando] = useState(false);

    const cargar = useCallback(async () => {
        if (!clienteId) {
            setEstado(null);
            return;
        }
        setCargando(true);
        try {
            const { data } = await api.get(`/estado-cuenta/${clienteId}`, { params: { desde, hasta } });
            setEstado(data);
        } catch (err) {
            toast.error(err.response?.data?.message ?? 'No se pudo cargar el estado de cuenta.');
            setEstado(null);
        } finally {
            setCargando(false);
        }
    }, [clienteId, desde, hasta, toast]);

    useEffect(() => {
        cargar();
    }, [cargar]);

    const exportarExcel = async () => {
        setExportando(true);
        try {
            const { data } = await api.get(`/estado-cuenta/${clienteId}/excel`, { params: { desde, hasta }, responseType: 'blob' });
            const url = URL.createObjectURL(data);
            const a = document.createElement('a');
            a.href = url;
            a.download = `estado-cuenta-${estado?.cliente?.codigo || clienteId}-${hasta}.xlsx`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 4000);
        } catch {
            toast.error('No se pudo exportar el estado de cuenta.');
        } finally {
            setExportando(false);
        }
    };

    const r = estado?.resumen;

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
                <div className="w-44">
                    <Input label="Desde" type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} />
                </div>
                <div className="w-44">
                    <Input label="Hasta" type="date" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)} />
                </div>
                {estado && (
                    <div className="ml-auto flex gap-2">
                        {puede('tesoreria.estado-cuenta.exportar') && (
                            <Button variant="secondary" loading={exportando} onClick={exportarExcel}>
                                <Download className="h-4 w-4" /> Excel
                            </Button>
                        )}
                        {puede('tesoreria.estado-cuenta.imprimir') && (
                            <Button variant="secondary" onClick={() => setPdf(true)}>
                                <Printer className="h-4 w-4" /> Imprimir
                            </Button>
                        )}
                    </div>
                )}
            </div>

            {cargando && (
                <div className="flex justify-center py-16">
                    <Spinner size="lg" className="text-primary-600" />
                </div>
            )}

            {estado && !cargando && (
                <>
                    {r?.tiene_linea ? (
                        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                            <Tarjeta
                                label="Línea aprobada"
                                valor={money(r.limite_total, r.moneda)}
                                nota={r.ampliacion > 0 ? `Incluye ampliación de ${money(r.ampliacion, r.moneda)}` : null}
                            />
                            <Tarjeta label="Deuda pendiente" valor={money(r.deuda, r.moneda)} clase="text-red-600" />
                            <Tarjeta
                                label="Disponible"
                                valor={money(r.disponible, r.moneda)}
                                clase={r.disponible < 0 ? 'text-red-600' : 'text-green-600'}
                            />
                            <Tarjeta
                                label="Condición"
                                valor={r.condicion_venta === 'credito' ? `Crédito a ${r.dias_credito} días` : 'Contado'}
                                nota={r.impedimento ?? (r.dias_gracia > 0 ? `${r.dias_gracia} días de gracia` : null)}
                            />
                        </div>
                    ) : (
                        <Alert variant="warning">El cliente no tiene línea de crédito.</Alert>
                    )}

                    {estado.monedas.length === 0 && <Alert variant="info">El cliente no tiene ventas al crédito.</Alert>}

                    {estado.monedas.map((bloque) => (
                        <section key={bloque.moneda} className="overflow-hidden rounded-xl border border-edge bg-white shadow-sm">
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-edge px-4 py-3">
                                <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-warm-900">
                                    <FileText className="h-4 w-4 text-primary-600" />
                                    Movimientos en {bloque.moneda === 'USD' ? 'dólares' : 'soles'}
                                </h2>
                                <span className="text-sm">
                                    <span className="text-warm-500">Saldo al {fecha(estado.hasta)}: </span>
                                    <span className="font-bold text-red-600">{money(bloque.saldo_final, bloque.moneda)}</span>
                                </span>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-gray-50 text-xs uppercase tracking-wide text-warm-500">
                                        <tr>
                                            <th className="px-4 py-2 text-left">Fecha</th>
                                            <th className="px-4 py-2 text-left">Documento</th>
                                            <th className="px-4 py-2 text-left">Detalle</th>
                                            <th className="px-4 py-2 text-right">Cargo</th>
                                            <th className="px-4 py-2 text-right">Abono</th>
                                            <th className="px-4 py-2 text-right">Saldo</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        <tr className="bg-gray-50/60 text-warm-500">
                                            <td className="px-4 py-2" colSpan={5}>Saldo anterior al {fecha(estado.desde)}</td>
                                            <td className="px-4 py-2 text-right font-medium">{money(bloque.saldo_inicial, bloque.moneda)}</td>
                                        </tr>
                                        {bloque.movimientos.map((mv, i) => (
                                            <tr key={i}>
                                                <td className="whitespace-nowrap px-4 py-2">{fecha(mv.fecha)}</td>
                                                <td className="whitespace-nowrap px-4 py-2 font-medium text-warm-900">{mv.documento}</td>
                                                <td className="px-4 py-2 text-warm-600">
                                                    <span className="inline-flex items-center gap-1.5">
                                                        {mv.tipo === 'pago' && <Wallet className="h-3.5 w-3.5 text-green-600" />}
                                                        {mv.detalle}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-2 text-right">{mv.cargo ? money(mv.cargo, bloque.moneda) : ''}</td>
                                                <td className="px-4 py-2 text-right text-green-600">{mv.abono ? money(mv.abono, bloque.moneda) : ''}</td>
                                                <td className="px-4 py-2 text-right font-medium">{money(mv.saldo, bloque.moneda)}</td>
                                            </tr>
                                        ))}
                                        {bloque.movimientos.length === 0 && (
                                            <tr>
                                                <td colSpan={6} className="px-4 py-6 text-center text-warm-500">
                                                    Sin movimientos en estas fechas.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                    <tfoot className="border-t border-edge bg-gray-50 font-semibold">
                                        <tr>
                                            <td className="px-4 py-2" colSpan={3}>Totales del periodo</td>
                                            <td className="px-4 py-2 text-right">{money(bloque.cargos, bloque.moneda)}</td>
                                            <td className="px-4 py-2 text-right text-green-600">{money(bloque.abonos, bloque.moneda)}</td>
                                            <td className="px-4 py-2 text-right text-red-600">{money(bloque.saldo_final, bloque.moneda)}</td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </section>
                    ))}

                    {estado.cuotas.length > 0 && (
                        <section className="overflow-hidden rounded-xl border border-edge bg-white shadow-sm">
                            <h2 className="inline-flex items-center gap-2 border-b border-edge px-4 py-3 text-sm font-semibold text-warm-900">
                                <CalendarClock className="h-4 w-4 text-primary-600" /> Cuotas pendientes
                            </h2>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-gray-50 text-xs uppercase tracking-wide text-warm-500">
                                        <tr>
                                            <th className="px-4 py-2 text-left">Documento</th>
                                            <th className="px-4 py-2 text-left">Cuota</th>
                                            <th className="px-4 py-2 text-left">Vence</th>
                                            <th className="px-4 py-2 text-left">Situación</th>
                                            <th className="px-4 py-2 text-right">Monto</th>
                                            <th className="px-4 py-2 text-right">Pagado</th>
                                            <th className="px-4 py-2 text-right">Saldo</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {estado.cuotas.map((c) => {
                                            const s = SITUACION[c.situacion] ?? SITUACION.al_dia;
                                            return (
                                                <tr key={c.id}>
                                                    <td className="px-4 py-2 font-medium text-warm-900">{c.documento}</td>
                                                    <td className="px-4 py-2">{c.cuota}</td>
                                                    <td className="whitespace-nowrap px-4 py-2">
                                                        {fecha(c.vence)}
                                                        <span className="block text-xs text-warm-500">{plazo(c.dias)}</span>
                                                    </td>
                                                    <td className="px-4 py-2">
                                                        <Badge variant={s.variant}>{s.label}</Badge>
                                                    </td>
                                                    <td className="px-4 py-2 text-right">{money(c.monto, c.moneda)}</td>
                                                    <td className="px-4 py-2 text-right text-green-600">{money(c.pagado, c.moneda)}</td>
                                                    <td className="px-4 py-2 text-right font-semibold text-red-600">{money(c.saldo, c.moneda)}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </section>
                    )}
                </>
            )}

            <PdfViewerModal
                open={pdf}
                onClose={() => setPdf(false)}
                url={`/pdf/estado-cuenta/${clienteId}?desde=${desde}&hasta=${hasta}`}
                nombre={`estado-cuenta-${estado?.cliente?.codigo || clienteId}`}
                titulo="Estado de cuenta"
            />
        </div>
    );
}
