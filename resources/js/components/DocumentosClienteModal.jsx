import { useCallback, useEffect, useMemo, useState } from 'react';
import { ClipboardList, Printer, ReceiptText } from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { money } from '../lib/moneda';
import { useToast } from '../lib/toast';
import PdfViewerModal from './PdfViewerModal';
import { Badge, Input, Modal, Spinner, Tabs } from './ui';

const iso = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const haceUnAnio = () => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return iso(d);
};
const fecha = (v) => (v ? new Date(`${String(v).slice(0, 10)}T00:00:00`).toLocaleDateString('es-PE') : '—');

const ESTADO_PEDIDO = {
    borrador: 'gray',
    solicitado: 'blue',
    preparando: 'amber',
    separado: 'amber',
    despachado: 'blue',
    facturado: 'green',
    anulado: 'red',
};

/** Suma por moneda: { PEN: 1200, USD: 300 } → "S/ 1,200.00 · US$ 300.00". */
const totalesPorMoneda = (filas) =>
    Object.entries(
        filas.reduce((acc, f) => ({ ...acc, [f.moneda]: (acc[f.moneda] ?? 0) + f.total }), {}),
    )
        .map(([moneda, total]) => money(total, moneda))
        .join(' · ');

/**
 * Los documentos emitidos a un cliente: sus notas de venta (con lo que falta
 * cobrar de cada una) y sus pedidos, con su PDF. Se abre con el clic derecho
 * en Clientes.
 */
export default function DocumentosClienteModal({ cliente, onClose }) {
    const toast = useToast();
    const { puede } = useAuth();
    const [tab, setTab] = useState('ventas');
    const [desde, setDesde] = useState(haceUnAnio());
    const [hasta, setHasta] = useState(iso(new Date()));
    const [datos, setDatos] = useState({ notas_venta: [], pedidos: [] });
    const [cargando, setCargando] = useState(false);
    const [pdf, setPdf] = useState(null);

    const cargar = useCallback(async () => {
        if (!cliente) return;
        setCargando(true);
        try {
            const { data } = await api.get(`/clientes/${cliente.id}/documentos`, {
                params: { desde: desde || undefined, hasta: hasta || undefined },
            });
            setDatos(data);
        } catch {
            toast.error('No se pudieron cargar los documentos del cliente.');
        } finally {
            setCargando(false);
        }
    }, [cliente, desde, hasta, toast]);

    useEffect(() => {
        cargar();
    }, [cargar]);

    const emitidas = useMemo(() => datos.notas_venta.filter((n) => n.estado === 'emitida'), [datos]);
    const porCobrar = useMemo(
        () => datos.notas_venta.filter((n) => n.saldo > 0).map((n) => ({ moneda: n.moneda, total: n.saldo })),
        [datos],
    );

    return (
        <Modal
            open={Boolean(cliente)}
            onClose={onClose}
            title="Documentos emitidos"
            description={cliente?.nombre}
            size="3xl"
        >
            <div className="space-y-3">
                <div className="flex flex-wrap items-end justify-between gap-3">
                    <Tabs
                        value={tab}
                        onChange={setTab}
                        items={[
                            { key: 'ventas', icon: ReceiptText, label: `Notas de venta (${datos.notas_venta.length})` },
                            { key: 'pedidos', icon: ClipboardList, label: `Pedidos (${datos.pedidos.length})` },
                        ]}
                    />
                    <div className="flex gap-2">
                        <div className="w-40">
                            <Input label="Desde" type="date" value={desde} max={hasta || undefined} onChange={(e) => setDesde(e.target.value)} />
                        </div>
                        <div className="w-40">
                            <Input label="Hasta" type="date" value={hasta} min={desde || undefined} onChange={(e) => setHasta(e.target.value)} />
                        </div>
                    </div>
                </div>

                {cargando ? (
                    <div className="flex justify-center py-14">
                        <Spinner size="lg" className="text-primary-600" />
                    </div>
                ) : tab === 'ventas' ? (
                    <div className="overflow-hidden rounded-xl border border-edge">
                        <div className="max-h-[55vh] overflow-auto">
                            <table className="w-full text-sm">
                                <thead className="sticky top-0 bg-gray-50 text-xs uppercase tracking-wide text-warm-500">
                                    <tr>
                                        <th className="px-3 py-2 text-left">Fecha</th>
                                        <th className="px-3 py-2 text-left">Documento</th>
                                        <th className="px-3 py-2 text-left">Pago</th>
                                        <th className="px-3 py-2 text-left">Estado</th>
                                        <th className="px-3 py-2 text-right">Total</th>
                                        <th className="px-3 py-2 text-right">Por cobrar</th>
                                        <th className="w-12 px-3 py-2" />
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {datos.notas_venta.map((n) => (
                                        <tr key={n.id} className={n.estado === 'anulada' ? 'text-warm-400' : ''}>
                                            <td className="whitespace-nowrap px-3 py-2">{fecha(n.fecha)}</td>
                                            <td className="px-3 py-2">
                                                <span className="font-medium text-warm-900">{n.documento}</span>
                                                {n.pedido && <span className="block text-xs text-warm-500">Pedido {n.pedido}</span>}
                                            </td>
                                            <td className="px-3 py-2">{n.tipo_pago === 'credito' ? 'Crédito' : 'Contado'}</td>
                                            <td className="px-3 py-2">
                                                <Badge variant={n.estado === 'anulada' ? 'red' : 'green'}>
                                                    {n.estado === 'anulada' ? 'Anulada' : 'Emitida'}
                                                </Badge>
                                            </td>
                                            <td className="px-3 py-2 text-right font-medium">{money(n.total, n.moneda)}</td>
                                            <td className={`px-3 py-2 text-right ${n.saldo > 0 ? 'font-semibold text-red-600' : 'text-warm-400'}`}>
                                                {n.saldo > 0 ? money(n.saldo, n.moneda) : '—'}
                                            </td>
                                            <td className="px-3 py-2 text-right">
                                                {puede('ventas.notas-venta.imprimir') && (
                                                    <button
                                                        type="button"
                                                        aria-label="Ver PDF"
                                                        title="Ver PDF"
                                                        onClick={() => setPdf({ tipo: 'nota-venta', id: n.id, nombre: n.documento, formatos: ['a4', 'ticket'] })}
                                                        className="rounded-md p-1.5 text-primary-600 transition hover:bg-primary-50"
                                                    >
                                                        <Printer className="h-4 w-4" />
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                    {datos.notas_venta.length === 0 && (
                                        <tr>
                                            <td colSpan={7} className="px-3 py-10 text-center text-warm-500">
                                                Sin notas de venta en estas fechas.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                        {emitidas.length > 0 && (
                            <div className="flex flex-wrap justify-between gap-2 border-t border-edge bg-gray-50 px-3 py-2 text-sm">
                                <span>
                                    <span className="text-warm-500">Vendido: </span>
                                    <span className="font-semibold text-warm-900">{totalesPorMoneda(emitidas)}</span>
                                </span>
                                {porCobrar.length > 0 && (
                                    <span>
                                        <span className="text-warm-500">Por cobrar: </span>
                                        <span className="font-semibold text-red-600">{totalesPorMoneda(porCobrar)}</span>
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="overflow-hidden rounded-xl border border-edge">
                        <div className="max-h-[55vh] overflow-auto">
                            <table className="w-full text-sm">
                                <thead className="sticky top-0 bg-gray-50 text-xs uppercase tracking-wide text-warm-500">
                                    <tr>
                                        <th className="px-3 py-2 text-left">Fecha</th>
                                        <th className="px-3 py-2 text-left">Pedido</th>
                                        <th className="px-3 py-2 text-left">Estado</th>
                                        <th className="px-3 py-2 text-right">Total</th>
                                        <th className="w-12 px-3 py-2" />
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {datos.pedidos.map((p) => (
                                        <tr key={p.id}>
                                            <td className="whitespace-nowrap px-3 py-2">{fecha(p.fecha)}</td>
                                            <td className="px-3 py-2 font-medium text-warm-900">{p.documento}</td>
                                            <td className="px-3 py-2">
                                                <Badge variant={ESTADO_PEDIDO[p.estado] ?? 'gray'}>{p.estado_label}</Badge>
                                            </td>
                                            <td className="px-3 py-2 text-right font-medium">{money(p.total, p.moneda)}</td>
                                            <td className="px-3 py-2 text-right">
                                                {puede('ventas.pedidos.imprimir') && (
                                                    <button
                                                        type="button"
                                                        aria-label="Ver PDF"
                                                        title="Ver PDF"
                                                        onClick={() => setPdf({ tipo: 'orden-venta', id: p.id, nombre: p.documento, formatos: ['a4'] })}
                                                        className="rounded-md p-1.5 text-primary-600 transition hover:bg-primary-50"
                                                    >
                                                        <Printer className="h-4 w-4" />
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                    {datos.pedidos.length === 0 && (
                                        <tr>
                                            <td colSpan={5} className="px-3 py-10 text-center text-warm-500">
                                                Sin pedidos en estas fechas.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>

            <PdfViewerModal
                open={Boolean(pdf)}
                onClose={() => setPdf(null)}
                tipo={pdf?.tipo}
                id={pdf?.id}
                nombre={pdf?.nombre}
                formatos={pdf?.formatos}
                titulo={pdf?.tipo === 'orden-venta' ? 'Pedido' : 'Nota de venta'}
            />
        </Modal>
    );
}
