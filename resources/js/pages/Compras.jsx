import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Ban, CheckCircle2, PackageCheck, Pencil, Printer, ShoppingBag, Trash2 } from 'lucide-react';
import api, { asList } from '../lib/api';
import { useToast } from '../lib/toast';
import Layout from '../components/Layout';
import BottomSheet, { useSheet } from '../components/ui/BottomSheet';
import DetalleCard from '../components/ui/DetalleCard';
import PageHeader, { CreateButton } from '../components/PageHeader';
import PdfViewerModal from '../components/PdfViewerModal';
import ActionsMenu from '../components/ActionsMenu';
import RecepcionarCompraModal from '../components/RecepcionarCompraModal';
import { Alert, Badge, Button, DataTable, Input, Modal } from '../components/ui';

const estadoCompra = {
    registrada: { label: 'Registrada', variant: 'green' },
    parcial: { label: 'Recepción parcial', variant: 'amber' },
    recepcionada: { label: 'Recepcionada', variant: 'blue' },
    anulada: { label: 'Anulada', variant: 'red' },
};

const money = (n) =>
    new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(Number(n) || 0);

const num = (n) => new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 }).format(Number(n) || 0);

const docLabel = { factura: 'Factura', boleta: 'Boleta', guia: 'Guía' };

export default function Compras() {
    const toast = useToast();
    const navigate = useNavigate();
    const [compras, setCompras] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const [deleteTarget, setDeleteTarget] = useState(null);
    const [pdfTarget, setPdfTarget] = useState(null);
    const [deleting, setDeleting] = useState(false);
    const [actionId, setActionId] = useState(null);
    const [recepcionarId, setRecepcionarId] = useState(null);
    const [finalizarTarget, setFinalizarTarget] = useState(null);
    const [motivo, setMotivo] = useState('');
    /** Compra cuyo detalle se muestra en la segunda tabla. */
    const [seleccionada, setSeleccionada] = useState(null);
    const sheet = useSheet();

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const lista = asList(await api.get('/compras'));
            setCompras(lista);
            // Se mantiene la selección tras recargar; si no hay, se toma la primera.
            setSeleccionada((prev) => lista.find((c) => c.id === prev?.id) ?? lista[0] ?? null);
        } catch {
            setError('No se pudieron cargar las compras.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const anular = async (row) => {
        setActionId(row.id);
        try {
            await api.post(`/compras/${row.id}/anular`);
            toast.success('Compra anulada.');
            await load();
        } catch {
            toast.error('No se pudo anular la compra.');
        } finally {
            setActionId(null);
        }
    };

    const finalizar = async () => {
        if (!motivo.trim()) return toast.error('Indica el motivo de finalización.');

        setActionId(finalizarTarget.id);
        try {
            await api.post(`/compras/${finalizarTarget.id}/finalizar`, { motivo });
            toast.success('Compra finalizada: se cerró lo pendiente de recibir.');
            setFinalizarTarget(null);
            setMotivo('');
            await load();
        } catch (err) {
            toast.error(err.response?.data?.message ?? 'No se pudo finalizar.');
        } finally {
            setActionId(null);
        }
    };

    const handleDelete = async () => {
        setDeleting(true);
        try {
            await api.delete(`/compras/${deleteTarget.id}`);
            toast.success('Compra eliminada.');
            setDeleteTarget(null);
            await load();
        } catch {
            toast.error('No se pudo eliminar la compra.');
        } finally {
            setDeleting(false);
        }
    };

    const columns = [
        {
            key: 'numero_compra',
            label: 'N° Compra',
            render: (row) => <span className="font-semibold text-warm-900">{row.numero_compra ?? `#${String(row.id).padStart(4, '0')}`}</span>,
        },
        { key: 'fecha', label: 'Fecha', render: (row) => (row.fecha ? new Date(row.fecha).toLocaleDateString('es-PE') : '—') },
        {
            key: 'proveedor',
            label: 'Proveedor',
            render: (row) => (
                <span className="flex items-center gap-2 font-medium text-warm-900">
                    <ShoppingBag className="h-4 w-4 shrink-0 text-primary-600" />
                    <span className="truncate">{row.proveedor?.nombre ?? '—'}</span>
                </span>
            ),
        },
        {
            key: 'documento',
            label: 'Documento',
            render: (row) => (
                <span className="text-gray-700">
                    {docLabel[row.tipo_documento] ?? row.tipo_documento}
                    {row.serie || row.numero ? ` ${row.serie ?? ''}-${row.numero ?? ''}` : ''}
                </span>
            ),
        },
        {
            key: 'forma_pago',
            label: 'Pago',
            render: (row) => (
                <Badge variant={row.forma_pago === 'contado' ? 'green' : 'amber'}>
                    {row.forma_pago === 'contado' ? 'Contado' : 'Crédito'}
                </Badge>
            ),
        },
        { key: 'detalles_count', label: 'Ítems', render: (row) => <Badge variant="gray">{row.detalles_count ?? 0}</Badge> },
        { key: 'total', label: 'Total', align: 'right', render: (row) => <span className="font-semibold text-warm-900">{money(row.total)}</span> },
        {
            key: 'estado',
            label: 'Estado',
            render: (row) => {
                const info = estadoCompra[row.estado] ?? { label: row.estado ?? '—', variant: 'gray' };
                return (
                    <div className="flex items-center gap-1 whitespace-nowrap">
                        <Badge variant={info.variant}>{info.label}</Badge>
                        {row.finalizado && <Badge variant="blue">Final.</Badge>}
                    </div>
                );
            },
        },
        {
            type: 'actions',
            key: 'actions',
            label: 'Acc.',
            width: '70px',
            actions: (row) => (
                <ActionsMenu
                    items={[
                        { label: 'Imprimir / PDF', icon: Printer, color: 'text-warm-600', onClick: () => setPdfTarget(row) },
                        {
                            label: 'Recepcionar',
                            icon: PackageCheck,
                            color: 'text-green-600',
                            disabled: row.estado === 'anulada' || row.estado === 'recepcionada' || row.finalizado,
                            title:
                                row.estado === 'anulada'
                                    ? 'No se puede: está anulada'
                                    : row.estado === 'recepcionada'
                                      ? 'Ya está totalmente recepcionada'
                                      : 'Recepcionar (admite parciales)',
                            onClick: () => setRecepcionarId(row.id),
                        },
                        {
                            label: 'Finalizar',
                            icon: CheckCircle2,
                            color: 'text-blue-600',
                            disabled: row.estado === 'anulada' || row.finalizado || row.estado === 'recepcionada',
                            title: row.finalizado ? `Finalizada: ${row.motivo_finalizacion ?? ''}` : 'Cerrar lo que ya no va a llegar',
                            onClick: () => setFinalizarTarget(row),
                        },
                        {
                            label: 'Editar',
                            icon: Pencil,
                            color: 'text-primary-600',
                            disabled: row.estado === 'anulada',
                            onClick: () => navigate(`/compras/${row.id}/editar`),
                        },
                        {
                            label: 'Anular',
                            icon: Ban,
                            color: 'text-gray-500',
                            hidden: row.estado === 'anulada',
                            disabled: actionId === row.id,
                            onClick: () => anular(row),
                        },
                        { label: 'Eliminar', icon: Trash2, danger: true, onClick: () => setDeleteTarget(row) },
                    ]}
                />
            ),
        },
    ];

    const detalles = seleccionada?.detalles ?? [];

    return (
        <Layout>
            <PageHeader
                title="Compras"
                description="Comprobantes de compra a proveedores"
                actions={<CreateButton onClick={() => navigate('/compras/nueva')}>Nueva compra</CreateButton>}
            />

            {error && <Alert variant="error" className="mb-4">{error}</Alert>}

            <DataTable
                columns={columns}
                rows={compras}
                loading={loading}
                searchPlaceholder="Buscar compras..."
                onRowClick={(row) => { setSeleccionada(row); sheet.abrir(); }}
                rowClassName={(row) => (row.id === seleccionada?.id ? 'bg-primary-50' : undefined)}
                height="34vh"
                dense
            />

            {/* Móvil: el detalle sube desde abajo al tocar una card (en escritorio no pinta nada). */}
            <BottomSheet
                open={sheet.open && Boolean(seleccionada)}
                onClose={sheet.cerrar}
                title={seleccionada ? `${seleccionada.numero_compra ?? `#${seleccionada.id}`} · ${seleccionada.proveedor?.nombre ?? 'Proveedor'}` : ''}
                subtitle={`${detalles.length} ${detalles.length === 1 ? 'producto' : 'productos'}`}
            >
                {detalles.length === 0 ? (
                    <p className="py-6 text-center text-sm text-warm-500">Esta compra no tiene productos.</p>
                ) : (
                    <div className="space-y-3">
                        {detalles.map((d) => {
                            const producto = d.presentacion?.producto;
                            return (
                                <DetalleCard
                                    key={d.id}
                                    titulo={producto?.nombre ?? '—'}
                                    subtitulo={[producto?.codigo, d.presentacion?.nombre, producto?.marca?.nombre].filter(Boolean).join(' · ')}
                                    campos={[
                                        { label: 'Cant.', value: num(d.cantidad) },
                                        { label: 'Costo', value: money(d.costo_unitario) },
                                        { label: 'Subtotal', value: money(d.subtotal), valueClassName: 'text-primary-600' },
                                        { label: 'Recibido', value: num(d.recibido), valueClassName: 'text-success-600' },
                                        { label: 'Pendiente', value: num(d.pendiente), valueClassName: Number(d.pendiente) > 0 ? 'text-warning-600' : undefined },
                                    ]}
                                />
                            );
                        })}
                    </div>
                )}
            </BottomSheet>

            {/* Detalle de la compra seleccionada (escritorio) */}
            <div className="mt-6 hidden rounded-xl border border-edge bg-white shadow-sm md:block">
                <div className="flex items-center justify-between border-b border-edge px-5 py-3">
                    <h2 className="text-sm font-semibold text-warm-900">
                        Detalle {seleccionada?.numero_compra ? `de ${seleccionada.numero_compra}` : ''}
                    </h2>
                    <span className="text-xs text-warm-500">
                        {detalles.length} {detalles.length === 1 ? 'producto' : 'productos'}
                    </span>
                </div>
                {/* Alto fijo: el detalle siempre ocupa lo mismo, haya 1 o 20 productos. */}
                <div className="overflow-auto" style={{ height: '30vh' }}>
                    <table className="w-full min-w-[900px] text-sm">
                        <thead className="sticky top-0 z-10">
                            <tr className="bg-primary-600 text-left text-xs font-semibold uppercase tracking-wide text-white">
                                <th className="w-12 px-3 py-1.5 text-center">#</th>
                                <th className="w-28 px-3 py-1.5">Código</th>
                                <th className="px-3 py-1.5">Producto</th>
                                <th className="w-32 px-3 py-1.5">Marca</th>
                                <th className="w-28 px-3 py-1.5">Unidad</th>
                                <th className="w-20 px-3 py-1.5 text-right">Cant.</th>
                                <th className="w-24 px-3 py-1.5 text-right">Costo</th>
                                <th className="w-28 px-3 py-1.5 text-right">Subtotal</th>
                                <th className="w-24 px-3 py-1.5 text-right" title="Cantidad recepcionada">Recib.</th>
                                <th className="w-24 px-3 py-1.5 text-right">Pend.</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {detalles.length === 0 && (
                                <tr>
                                    <td colSpan={10} className="px-3 py-10 text-center text-sm text-warm-500">
                                        {seleccionada
                                            ? 'Esta compra no tiene productos.'
                                            : 'Selecciona una compra arriba para ver su detalle.'}
                                    </td>
                                </tr>
                            )}

                            {detalles.map((d, i) => {
                                const producto = d.presentacion?.producto;
                                return (
                                    <tr key={d.id}>
                                        <td className="px-3 py-2 text-center text-warm-500">{i + 1}</td>
                                        <td className="px-3 py-2 text-warm-500">{producto?.codigo ?? '—'}</td>
                                        <td className="px-3 py-2 font-semibold text-warm-900">{producto?.nombre ?? '—'}</td>
                                        <td className="px-3 py-2 text-warm-500">{producto?.marca?.nombre ?? '—'}</td>
                                        <td className="px-3 py-2 text-warm-500">{d.presentacion?.nombre ?? '—'}</td>
                                        <td className="px-3 py-2 text-right text-warm-900">{num(d.cantidad)}</td>
                                        <td className="px-3 py-2 text-right text-warm-900">{money(d.costo_unitario)}</td>
                                        <td className="px-3 py-2 text-right font-semibold text-primary-600">{money(d.subtotal)}</td>
                                        <td className="px-3 py-2 text-right text-green-600">{num(d.recibido)}</td>
                                        <td
                                            className={`px-3 py-1.5 text-right font-medium ${
                                                Number(d.pendiente) > 0 ? 'text-amber-600' : 'text-warm-500'
                                            }`}
                                        >
                                            {num(d.pendiente)}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            <Modal
                open={Boolean(deleteTarget)}
                onClose={() => setDeleteTarget(null)}
                title="Eliminar compra"
                description={`¿Eliminar la compra ${deleteTarget?.numero_compra ?? `#${deleteTarget?.id}`}?`}
                size="sm"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
                        <Button variant="danger" loading={deleting} onClick={handleDelete}>Eliminar</Button>
                    </>
                }
            >
                <Alert variant="warning">La compra y sus pagos se eliminarán permanentemente.</Alert>
            </Modal>

            <Modal
                open={Boolean(finalizarTarget)}
                onClose={() => setFinalizarTarget(null)}
                title={`Finalizar ${finalizarTarget?.numero_compra ?? ''}`}
                description="Cierra lo que ya no va a llegar del proveedor."
                size="md"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setFinalizarTarget(null)}>Cancelar</Button>
                        <Button loading={actionId === finalizarTarget?.id} onClick={finalizar}>Finalizar</Button>
                    </>
                }
            >
                <Alert variant="warning" className="mb-3">
                    Lo que falte por recibir quedará registrado como cantidad finalizada y la compra ya no
                    admitirá más recepciones.
                </Alert>
                <Input
                    label="Motivo de finalización"
                    placeholder="Ej. el proveedor no tenía stock del resto"
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                />
            </Modal>

            <RecepcionarCompraModal
                open={Boolean(recepcionarId)}
                compraId={recepcionarId}
                onClose={() => setRecepcionarId(null)}
                onDone={load}
            />
                    <PdfViewerModal
                open={Boolean(pdfTarget)}
                onClose={() => setPdfTarget(null)}
                tipo="compra"
                id={pdfTarget?.id}
                nombre={pdfTarget?.numero_compra}
                titulo="Compra"
                formatos={['a4', 'ticket']}
            />
        </Layout>
    );
}
