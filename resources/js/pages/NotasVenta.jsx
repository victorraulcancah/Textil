import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Ban, Edit, Eye, Printer, User } from 'lucide-react';
import api, { asList } from '../lib/api';
import { useToast } from '../lib/toast';
import Layout from '../components/Layout';
import BottomSheet, { useSheet } from '../components/ui/BottomSheet';
import DetalleCard from '../components/ui/DetalleCard';
import PageHeader, { CreateButton } from '../components/PageHeader';
import PdfViewerModal from '../components/PdfViewerModal';
import { Alert, Badge, Button, DataTable, Input, Modal, Select, Spinner } from '../components/ui';

const fecha = (v) => (v ? new Date(v).toLocaleDateString('es-PE') : '—');
const formaLabel = { efectivo: 'Efectivo', transferencia: 'Transferencia', tarjeta: 'Tarjeta', yape: 'Yape', plin: 'Plin', credito: 'Crédito', otro: 'Otro' };

const money = (n) =>
    new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(Number(n) || 0);

const num = (n) => new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 }).format(Number(n) || 0);

export default function NotasVenta() {
    const toast = useToast();
    const navigate = useNavigate();
    /** Venta cuyo detalle se muestra en la segunda tabla. */
    const [seleccionada, setSeleccionada] = useState(null);
    const sheet = useSheet();
    const [notas, setNotas] = useState([]);
    /** Nota cuyo PDF se está viendo. */
    const [pdfTarget, setPdfTarget] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [fEstado, setFEstado] = useState('');
    const [fPago, setFPago] = useState('');

    const [anularTarget, setAnularTarget] = useState(null);
    const [motivo, setMotivo] = useState('');
    const [anulando, setAnulando] = useState(false);

    const [verOpen, setVerOpen] = useState(false);
    const [detalle, setDetalle] = useState(null);
    const [detalleLoading, setDetalleLoading] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            setNotas(asList(await api.get('/notas-venta')));
        } catch {
            setError('No se pudieron cargar las ventas.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const verDetalle = async (row) => {
        setVerOpen(true);
        setDetalle(null);
        setDetalleLoading(true);
        try {
            const res = await api.get(`/notas-venta/${row.id}`);
            setDetalle(res.data?.data ?? res.data);
        } catch {
            toast.error('No se pudo cargar el detalle de la venta.');
            setVerOpen(false);
        } finally {
            setDetalleLoading(false);
        }
    };

    const handleAnular = async () => {
        if (!motivo.trim()) {
            toast.error('Escribe el motivo de anulación.');
            return;
        }
        setAnulando(true);
        try {
            await api.post(`/notas-venta/${anularTarget.id}/anular`, { motivo_anulacion: motivo });
            toast.success('Venta anulada. Stock devuelto al almacén.');
            setAnularTarget(null);
            setMotivo('');
            await load();
        } catch (err) {
            toast.error(err.response?.data?.message ?? 'No se pudo anular la venta.');
        } finally {
            setAnulando(false);
        }
    };

    const columns = [
        {
            key: 'documento',
            label: 'Documento',
            render: (row) => <Badge variant="gray">{row.serie}-{row.numero}</Badge>,
        },
        {
            key: 'cliente',
            label: 'Cliente',
            render: (row) => (
                <span className="inline-flex items-center gap-2 font-medium text-warm-900">
                    <User className="h-4 w-4 text-primary-600" />
                    {row.cliente?.nombre ?? 'Clientes varios'}
                </span>
            ),
        },
        { key: 'fecha_emision', label: 'Fecha', render: (row) => (row.fecha_emision ? new Date(row.fecha_emision).toLocaleDateString('es-PE') : '—') },
        {
            key: 'tipo_pago',
            label: 'Pago',
            render: (row) => (
                <Badge variant={row.tipo_pago === 'contado' ? 'green' : 'amber'}>
                    {row.tipo_pago === 'contado' ? 'Contado' : 'Crédito'}
                </Badge>
            ),
        },
        { key: 'total', label: 'Total', align: 'right', render: (row) => <span className="font-semibold text-warm-900">{money(row.total)}</span> },
        {
            key: 'estado',
            label: 'Estado',
            render: (row) =>
                row.estado === 'anulada' ? <Badge variant="red">Anulada</Badge> : <Badge variant="green">Emitida</Badge>,
        },
        {
            type: 'actions',
            key: 'actions',
            label: 'Acciones',
            // Cuatro botones no entran en los 120px por defecto.
            width: '170px',
            actions: (row) => (
                <>
                    <button
                        aria-label="Ver detalle"
                        title="Ver detalle"
                        onClick={() => verDetalle(row)}
                        className="rounded-md p-1.5 text-primary-600 transition hover:bg-primary-50 hover:text-primary-700"
                    >
                        <Eye className="h-4 w-4" />
                    </button>
                    <button
                        aria-label="Imprimir"
                        title="Imprimir / PDF"
                        onClick={() => setPdfTarget(row)}
                        className="rounded-md p-1.5 text-warm-600 transition hover:bg-gray-100 hover:text-warm-900"
                    >
                        <Printer className="h-4 w-4" />
                    </button>
                    {row.estado !== 'anulada' && (
                        <button
                            aria-label="Editar"
                            title="Editar venta"
                            onClick={() => navigate(`/notas-venta/${row.id}/editar`)}
                            className="rounded-md p-1.5 text-amber-600 transition hover:bg-amber-50 hover:text-amber-700"
                        >
                            <Edit className="h-4 w-4" />
                        </button>
                    )}
                    {row.estado !== 'anulada' && (
                        <button
                            aria-label="Anular"
                            title="Anular venta"
                            onClick={() => { setAnularTarget(row); setMotivo(''); }}
                            className="rounded-md p-1.5 text-red-600 transition hover:bg-red-50 hover:text-red-700"
                        >
                            <Ban className="h-4 w-4" />
                        </button>
                    )}
                </>
            ),
        },
    ];

    const docNombre = (n) => `${n?.serie ?? ''}-${String(n?.numero ?? '').padStart(8, '0')}`;

    const detallesVenta = seleccionada?.detalles ?? [];
    const totalesVenta = detallesVenta.reduce(
        (acc, d) => ({
            cantidad: acc.cantidad + (Number(d.cantidad) || 0),
            descuento: acc.descuento + (Number(d.descuento) || 0),
            subtotal: acc.subtotal + (Number(d.subtotal) || 0),
        }),
        { cantidad: 0, descuento: 0, subtotal: 0 },
    );

    return (
        <Layout>
            <PageHeader
                title="Notas de Venta"
                description="Ventas emitidas a clientes"
                actions={
                    <CreateButton onClick={() => navigate('/notas-venta/nueva')}>Nueva venta</CreateButton>
                }
            />

            {error && <Alert variant="error" className="mb-4">{error}</Alert>}

            <DataTable
                columns={columns}
                rows={notas.filter(
                    (n) =>
                        (!fEstado || n.estado === fEstado) &&
                        (!fPago || n.tipo_pago === fPago),
                )}
                loading={loading}
                onRowClick={(row) => { setSeleccionada(row); sheet.abrir(); }}
                rowClassName={(row) => (row.id === seleccionada?.id ? 'bg-primary-50' : undefined)}
                searchPlaceholder="Buscar ventas..."
                filterable
                filterCount={(fEstado ? 1 : 0) + (fPago ? 1 : 0)}
                filters={
                    <div className="space-y-2">
                        <Select
                            label="Estado"
                            value={fEstado}
                            onChange={(e) => setFEstado(e.target.value)}
                            options={[
                                { value: '', label: 'Todos' },
                                { value: 'emitida', label: 'Emitida' },
                                { value: 'anulada', label: 'Anulada' },
                            ]}
                        />
                        <Select
                            label="Forma de pago"
                            value={fPago}
                            onChange={(e) => setFPago(e.target.value)}
                            options={[
                                { value: '', label: 'Todas' },
                                { value: 'contado', label: 'Contado' },
                                { value: 'credito', label: 'Crédito' },
                            ]}
                        />
                        {(fEstado || fPago) && (
                            <button
                                onClick={() => {
                                    setFEstado('');
                                    setFPago('');
                                }}
                                className="text-xs font-medium text-red-600 hover:text-red-700"
                            >
                                Limpiar filtros
                            </button>
                        )}
                    </div>
                }
            />

            {/* Móvil: el detalle sube desde abajo al tocar una card (en escritorio no pinta nada). */}
            <BottomSheet
                open={sheet.open && Boolean(seleccionada)}
                onClose={sheet.cerrar}
                title={seleccionada ? `${seleccionada.serie}-${seleccionada.numero} · ${seleccionada.cliente?.nombre ?? 'Cliente'}` : ''}
                subtitle={`${detallesVenta.length} ${detallesVenta.length === 1 ? 'producto' : 'productos'}`}
            >
                {detallesVenta.length === 0 ? (
                    <p className="py-6 text-center text-sm text-warm-500">Esta venta no tiene productos.</p>
                ) : (
                    <div className="space-y-3">
                        {detallesVenta.map((d) => {
                            const producto = d.presentacion?.producto;
                            const conDescuento = Number(d.descuento) > 0;
                            return (
                                <DetalleCard
                                    key={d.id}
                                    titulo={producto?.nombre ?? d.producto_nombre ?? '—'}
                                    subtitulo={[producto?.codigo, d.presentacion?.nombre, producto?.marca?.nombre]
                                        .filter(Boolean)
                                        .join(' · ')}
                                    campos={[
                                        { label: 'Cant.', value: num(d.cantidad) },
                                        { label: 'Precio', value: money(d.precio_unitario) },
                                        { label: 'Subtotal', value: money(d.subtotal), valueClassName: 'text-primary-600' },
                                        ...(conDescuento ? [{ label: 'Dscto.', value: money(d.descuento) }] : []),
                                    ]}
                                />
                            );
                        })}
                        <div className="flex items-center justify-between px-1 pt-1 text-sm">
                            <span className="font-medium text-warm-500">Total</span>
                            <span className="text-base font-bold text-warm-900">
                                {money(detallesVenta.reduce((a, d) => a + Number(d.subtotal || 0), 0))}
                            </span>
                        </div>
                    </div>
                )}
            </BottomSheet>

            {/* Detalle de la venta seleccionada (escritorio) */}
            <div className="mt-6 hidden rounded-xl border border-edge bg-white shadow-sm md:block">
                <div className="flex items-center justify-between border-b border-edge px-5 py-3">
                    <h2 className="text-sm font-semibold text-warm-900">
                        Detalle {seleccionada ? `de ${seleccionada.serie}-${seleccionada.numero}` : ''}
                    </h2>
                    <span className="text-xs text-warm-500">
                        {detallesVenta.length} {detallesVenta.length === 1 ? 'producto' : 'productos'}
                    </span>
                </div>
                {/* Alto fijo: el detalle siempre ocupa lo mismo, haya 1 o 20 productos. */}
                <div className="overflow-auto" style={{ height: '30vh' }}>
                    <table className="w-full min-w-[820px] text-sm">
                        <thead className="sticky top-0 z-10">
                            <tr className="bg-primary-600 text-left text-xs font-semibold uppercase tracking-wide text-white">
                                <th className="w-12 px-3 py-1.5 text-center">#</th>
                                <th className="w-28 px-3 py-1.5">Código</th>
                                <th className="px-3 py-1.5">Producto</th>
                                <th className="w-32 px-3 py-1.5">Marca</th>
                                <th className="w-28 px-3 py-1.5">Unidad</th>
                                <th className="w-20 px-3 py-1.5 text-right">Cant.</th>
                                <th className="w-24 px-3 py-1.5 text-right">Precio</th>
                                <th className="w-24 px-3 py-1.5 text-right">Dscto.</th>
                                <th className="w-28 px-3 py-1.5 text-right">Subtotal</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {detallesVenta.length === 0 && (
                                <tr>
                                    <td colSpan={9} className="px-3 py-10 text-center text-sm text-warm-500">
                                        {seleccionada
                                            ? 'Esta venta no tiene productos.'
                                            : 'Selecciona una venta arriba para ver su detalle.'}
                                    </td>
                                </tr>
                            )}

                            {detallesVenta.map((d, i) => {
                                const producto = d.presentacion?.producto;
                                return (
                                    <tr key={d.id}>
                                        <td className="px-3 py-2 text-center text-warm-500">{i + 1}</td>
                                        <td className="px-3 py-2 text-warm-500">{producto?.codigo ?? '—'}</td>
                                        <td className="px-3 py-2 font-semibold text-warm-900">
                                            {producto?.nombre ?? d.producto_nombre ?? '—'}
                                        </td>
                                        <td className="px-3 py-2 text-warm-500">{producto?.marca?.nombre ?? '—'}</td>
                                        <td className="px-3 py-2 text-warm-500">{d.presentacion?.nombre ?? '—'}</td>
                                        <td className="px-3 py-2 text-right text-warm-900">{num(d.cantidad)}</td>
                                        <td className="px-3 py-2 text-right text-warm-900">{money(d.precio_unitario)}</td>
                                        <td className="px-3 py-2 text-right text-warm-500">
                                            {Number(d.descuento) > 0 ? money(d.descuento) : '—'}
                                        </td>
                                        <td className="px-3 py-2 text-right font-semibold text-primary-600">
                                            {money(d.subtotal)}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                        {detallesVenta.length > 0 && (
                            <tfoot className="sticky bottom-0">
                                <tr className="border-t-2 border-edge bg-gray-50 text-sm font-bold text-warm-900">
                                    <td className="px-3 py-2" colSpan={5}>Total</td>
                                    <td className="px-3 py-2 text-right">{num(totalesVenta.cantidad)}</td>
                                    <td className="px-3 py-2" />
                                    <td className="px-3 py-2 text-right">
                                        {totalesVenta.descuento > 0 ? money(totalesVenta.descuento) : '—'}
                                    </td>
                                    <td className="px-3 py-2 text-right text-primary-700">
                                        {money(totalesVenta.subtotal)}
                                    </td>
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
            </div>

            <Modal
                open={Boolean(anularTarget)}
                onClose={() => setAnularTarget(null)}
                title="Anular venta"
                description={`Venta ${anularTarget?.serie}-${anularTarget?.numero}. El stock volverá al almacén.`}
                size="sm"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setAnularTarget(null)}>Cancelar</Button>
                        <Button variant="danger" loading={anulando} onClick={handleAnular}>Anular venta</Button>
                    </>
                }
            >
                <Input
                    label="Motivo de anulación"
                    placeholder="Ej: error en el registro"
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                />
            </Modal>

            <Modal
                open={verOpen}
                onClose={() => setVerOpen(false)}
                title={detalle ? `Venta ${detalle.serie}-${detalle.numero}` : 'Detalle de venta'}
                size="xl"
                footer={<Button variant="secondary" onClick={() => setVerOpen(false)}>Cerrar</Button>}
            >
                {detalleLoading || !detalle ? (
                    <div className="flex items-center justify-center py-12">
                        <Spinner size="lg" className="text-primary-600" />
                    </div>
                ) : (
                    <div className="space-y-4">
                        {/* Cabecera */}
                        <div className="grid grid-cols-2 gap-3 rounded-xl border border-edge bg-gray-50 p-4 text-sm sm:grid-cols-4">
                            <div>
                                <p className="text-xs uppercase tracking-wide text-warm-500">Cliente</p>
                                <p className="font-medium text-warm-900">{detalle.cliente?.nombre ?? 'Clientes varios'}</p>
                            </div>
                            <div>
                                <p className="text-xs uppercase tracking-wide text-warm-500">Fecha</p>
                                <p className="font-medium text-warm-900">{fecha(detalle.fecha_emision)}</p>
                            </div>
                            <div>
                                <p className="text-xs uppercase tracking-wide text-warm-500">Vendedor</p>
                                <p className="font-medium text-warm-900">{detalle.vendedor?.name ?? '—'}</p>
                            </div>
                            <div>
                                <p className="text-xs uppercase tracking-wide text-warm-500">Estado</p>
                                <div className="mt-0.5">
                                    {detalle.estado === 'anulada' ? <Badge variant="red">Anulada</Badge> : <Badge variant="green">Emitida</Badge>}
                                    {' '}
                                    <Badge variant={detalle.tipo_pago === 'contado' ? 'green' : 'amber'}>
                                        {detalle.tipo_pago === 'contado' ? 'Contado' : 'Crédito'}
                                    </Badge>
                                </div>
                            </div>
                        </div>

                        {/* Productos */}
                        <div>
                            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-warm-500">Productos</h3>
                            <div className="overflow-hidden rounded-xl border border-edge">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="bg-gray-50 text-left text-xs uppercase tracking-wide text-warm-500">
                                            <th className="px-3 py-2">Producto</th>
                                            <th className="px-3 py-2 text-right">Cant.</th>
                                            <th className="px-3 py-2 text-right">Precio</th>
                                            <th className="px-3 py-2 text-right">Subtotal</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {(detalle.detalles ?? []).map((d) => (
                                            <tr key={d.id}>
                                                <td className="px-3 py-2">
                                                    <span className="font-medium text-warm-900">{d.producto_nombre ?? 'Producto'}</span>
                                                    {d.presentacion?.nombre && <span className="text-warm-400"> · {d.presentacion.nombre}</span>}
                                                </td>
                                                <td className="px-3 py-2 text-right">{Number(d.cantidad)}</td>
                                                <td className="px-3 py-2 text-right">{money(d.precio_unitario)}</td>
                                                <td className="px-3 py-2 text-right font-medium text-warm-900">{money(d.subtotal)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Pagos + Total */}
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div>
                                <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-warm-500">Pagos</h3>
                                {(detalle.pagos ?? []).length === 0 ? (
                                    <p className="text-sm text-warm-400">Sin pagos registrados.</p>
                                ) : (
                                    <ul className="space-y-1 text-sm">
                                        {detalle.pagos.map((p) => (
                                            <li key={p.id} className="flex justify-between">
                                                <span className="text-warm-600">{formaLabel[p.forma_pago] ?? p.metodo_pago?.nombre ?? p.forma_pago}</span>
                                                <span className="font-medium text-warm-900">{money(p.monto)}</span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                            <div className="rounded-xl border border-edge p-4">
                                <div className="flex justify-between text-sm text-warm-600">
                                    <span>Subtotal</span><span>{money(detalle.subtotal)}</span>
                                </div>
                                {Number(detalle.descuento_total) > 0 && (
                                    <div className="flex justify-between text-sm text-warm-600">
                                        <span>Descuento</span><span>- {money(detalle.descuento_total)}</span>
                                    </div>
                                )}
                                <div className="mt-2 flex justify-between border-t border-edge pt-2 text-base font-extrabold text-warm-900">
                                    <span>Total</span><span>{money(detalle.total)}</span>
                                </div>
                            </div>
                        </div>

                        {detalle.observaciones && (
                            <p className="text-sm text-warm-500"><span className="font-medium text-warm-700">Observaciones:</span> {detalle.observaciones}</p>
                        )}
                        {detalle.estado === 'anulada' && detalle.motivo_anulacion && (
                            <Alert variant="warning">Anulada: {detalle.motivo_anulacion}</Alert>
                        )}
                    </div>
                )}
            </Modal>
                    <PdfViewerModal
                open={Boolean(pdfTarget)}
                onClose={() => setPdfTarget(null)}
                tipo="nota-venta"
                id={pdfTarget?.id}
                nombre={pdfTarget ? docNombre(pdfTarget) : ''}
                titulo="Nota de venta"
                formatos={['a4', 'ticket']}
            />
        </Layout>
    );
}
