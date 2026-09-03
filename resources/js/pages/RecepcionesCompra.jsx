import { useCallback, useEffect, useState } from 'react';
import { Printer, Truck, Undo2 } from 'lucide-react';
import api, { asList } from '../lib/api';
import { useToast } from '../lib/toast';
import Layout from '../components/Layout';
import PageHeader from '../components/PageHeader';
import PdfViewerModal from '../components/PdfViewerModal';
import ActionsMenu from '../components/ActionsMenu';
import { Alert, Badge, Button, DataTable, Modal } from '../components/ui';

const num = (n) => new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 }).format(Number(n) || 0);

const fecha = (f) => (f ? new Date(f).toLocaleDateString('es-PE') : '—');

const estadoInfo = {
    parcial: { label: 'Parcial', variant: 'amber' },
    completa: { label: 'Completa', variant: 'green' },
    deshecha: { label: 'Deshecha', variant: 'red' },
};

export default function RecepcionesCompra() {
    const toast = useToast();
    const [recepciones, setRecepciones] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    /** Recepción cuyo detalle se muestra en la segunda tabla. */
    const [seleccionada, setSeleccionada] = useState(null);

    const [deshacerTarget, setDeshacerTarget] = useState(null);
    const [pdfTarget, setPdfTarget] = useState(null);
    const [procesando, setProcesando] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const lista = asList(await api.get('/recepciones-compra'));
            setRecepciones(lista);
            // Se mantiene la selección tras recargar; si no hay, se toma la primera.
            setSeleccionada((prev) => lista.find((r) => r.id === prev?.id) ?? lista[0] ?? null);
        } catch {
            setError('No se pudieron cargar las recepciones.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const deshacer = async () => {
        setProcesando(true);
        try {
            await api.post(`/recepciones-compra/${deshacerTarget.id}/deshacer`);
            toast.success('Recepción deshecha: el stock fue revertido.');
            setDeshacerTarget(null);
            await load();
        } catch (err) {
            toast.error(err.response?.data?.message ?? 'No se pudo deshacer.');
        } finally {
            setProcesando(false);
        }
    };

    // La finalización se decide en la compra; aquí solo se refleja.
    const columnasRecepcion = [
        {
            key: 'idx',
            label: '#',
            width: '48px',
            render: (row) => <span className="text-warm-500">{recepciones.indexOf(row) + 1}</span>,
        },
        {
            key: 'documento',
            label: 'N° Doc.',
            width: '110px',
            render: (row) => <span className="font-semibold text-warm-900">{row.documento ?? '—'}</span>,
        },
        { key: 'fecha_recepcion', label: 'Fecha', width: '95px', render: (row) => fecha(row.fecha_recepcion) },
        {
            key: 'registrador',
            label: 'Registró',
            width: '130px',
            render: (row) => <span className="truncate">{row.usuario_recibe?.name ?? '—'}</span>,
        },
        {
            key: 'proveedor',
            label: 'Proveedor',
            render: (row) => (
                <span className="inline-flex items-center gap-2 font-medium text-warm-900">
                    <Truck className="h-4 w-4 shrink-0 text-primary-600" />
                    {row.proveedor?.nombre ?? '—'}
                </span>
            ),
        },
        { key: 'almacen', label: 'Almacén', width: '150px', render: (row) => row.almacen?.nombre ?? '—' },
        {
            key: 'compra',
            label: 'Compra',
            width: '135px',
            render: (row) => (row.compra ? <Badge variant="gray">{row.compra.numero_compra}</Badge> : '—'),
        },
        {
            key: 'estado',
            label: 'Estado',
            width: '105px',
            render: (row) => {
                if (!row.activo) return <Badge variant="red">Inactiva</Badge>;
                const info = estadoInfo[row.estado] ?? { label: row.estado ?? '—', variant: 'gray' };
                return <Badge variant={info.variant}>{info.label}</Badge>;
            },
        },
        {
            key: 'finalizado',
            label: 'Final.',
            width: '95px',
            render: (row) =>
                row.compra?.finalizado ? <Badge variant="blue">Sí</Badge> : <Badge variant="gray">No</Badge>,
        },
        {
            key: 'motivo_finalizacion',
            label: 'Motivo Final.',
            width: '190px',
            render: (row) => (
                <span className="block truncate text-warm-500" title={row.compra?.motivo_finalizacion ?? ''}>
                    {row.compra?.motivo_finalizacion ?? '—'}
                </span>
            ),
        },
        {
            key: 'fecha_finalizacion',
            label: 'F. Final.',
            width: '100px',
            render: (row) => fecha(row.compra?.fecha_finalizacion),
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
                            label: 'Deshacer',
                            icon: Undo2,
                            danger: true,
                            disabled: !row.activo,
                            title: row.activo ? 'Revierte el stock ingresado' : 'Ya está deshecha',
                            onClick: () => setDeshacerTarget(row),
                        },
                    ]}
                />
            ),
        },
    ];

    const detalles = seleccionada?.detalles ?? [];

    /**
     * Total recibido de una línea sumando todas las recepciones vigentes de la
     * misma compra, no solo la que se está viendo.
     */
    const totalRecepcionado = (compraDetalleId) =>
        recepciones
            .filter((r) => r.activo && r.compra_id === seleccionada?.compra_id)
            .flatMap((r) => r.detalles ?? [])
            .filter((d) => d.compra_detalle_id === compraDetalleId)
            .reduce((acc, d) => acc + (Number(d.cantidad_recibida) || 0), 0);

    return (
        <Layout>
            <PageHeader
                title="Recepciones de Compra"
                description="Registro formal del ingreso de mercadería. Se generan desde cada compra."
            />

            {error && <Alert variant="error" className="mb-4">{error}</Alert>}

            <DataTable
                columns={columnasRecepcion}
                rows={recepciones}
                loading={loading}
                searchPlaceholder="Buscar recepciones..."
                onRowClick={(row) => setSeleccionada(row)}
                rowClassName={(row) => (row.id === seleccionada?.id ? 'bg-primary-50' : undefined)}
                height="34vh"
                dense
            />

            {/* Detalle de la recepción seleccionada */}
            <div className="mt-6 rounded-xl border border-edge bg-white shadow-sm">
                <div className="flex items-center justify-between border-b border-edge px-5 py-3">
                    <h2 className="text-sm font-semibold text-warm-900">
                        Detalle {seleccionada?.documento ? `de ${seleccionada.documento}` : ''}
                    </h2>
                    <span className="text-xs text-warm-500">
                        {detalles.length} {detalles.length === 1 ? 'línea' : 'líneas'}
                    </span>
                </div>
                <div className="overflow-auto" style={{ height: '30vh' }}>
                    <table className="w-full min-w-[1080px] text-sm">
                        <thead className="sticky top-0 z-10">
                            <tr className="bg-primary-600 text-left text-xs font-semibold uppercase tracking-wide text-white">
                                <th className="px-3 py-1.5 text-center">#</th>
                                <th className="px-3 py-1.5">Cod. Producto</th>
                                <th className="px-3 py-1.5">Producto</th>
                                <th className="px-3 py-1.5">Marca</th>
                                <th className="px-3 py-1.5">Unidad Derivada</th>
                                <th className="px-3 py-1.5 text-right">Cant.</th>
                                <th className="px-3 py-1.5 text-right">Pedida</th>
                                <th className="px-3 py-1.5 text-right" title="Cantidad total recepcionada">Total Recep.</th>
                                <th className="px-3 py-1.5 text-right" title="Cantidad finalizada">Finaliz.</th>
                                <th className="px-3 py-1.5 text-right">Stock Ant.</th>
                                <th className="px-3 py-1.5 text-right">Stock Nuevo</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {detalles.length === 0 && (
                                <tr>
                                    <td colSpan={11} className="px-3 py-10 text-center text-sm text-warm-500">
                                        {seleccionada
                                            ? 'Esta recepción no tiene líneas.'
                                            : 'Selecciona una recepción arriba para ver su detalle.'}
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
                                        <td className="px-3 py-2 text-right font-semibold text-primary-600">{num(d.cantidad_recibida)}</td>
                                        <td className="px-3 py-2 text-right text-warm-900">{num(d.cantidad_pedida)}</td>
                                        <td className="px-3 py-2 text-right text-warm-900">
                                            {num(totalRecepcionado(d.compra_detalle_id))}
                                        </td>
                                        <td className="px-3 py-2 text-right text-amber-600">{num(d.compra_detalle?.cantidad_finalizada)}</td>
                                        <td className="px-3 py-2 text-right text-warm-500">{num(d.stock_anterior)}</td>
                                        <td className="px-3 py-2 text-right font-medium text-warm-900">{num(d.stock_nuevo)}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Deshacer */}
            <Modal
                open={Boolean(deshacerTarget)}
                onClose={() => setDeshacerTarget(null)}
                title={`Deshacer ${deshacerTarget?.documento ?? ''}`}
                description="La recepción quedará inactiva."
                size="sm"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setDeshacerTarget(null)}>Cancelar</Button>
                        <Button variant="danger" loading={procesando} onClick={deshacer}>Deshacer</Button>
                    </>
                }
            >
                <Alert variant="warning">
                    Se dará salida del stock que esta recepción ingresó al almacén, y sus cantidades volverán a
                    quedar pendientes en la compra.
                </Alert>
            </Modal>
                    <PdfViewerModal
                open={Boolean(pdfTarget)}
                onClose={() => setPdfTarget(null)}
                tipo="recepcion-compra"
                id={pdfTarget?.id}
                nombre={pdfTarget?.documento}
                titulo="Recepción de compra"
                formatos={['a4', 'ticket']}
            />
        </Layout>
    );
}
