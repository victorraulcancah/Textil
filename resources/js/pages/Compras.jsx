import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Ban, CheckCircle2, PackageCheck, PackageSearch, Pencil, Printer, ShoppingBag, Trash2 } from 'lucide-react';
import api, { asList } from '../lib/api';
import { useToast } from '../lib/toast';
import Layout from '../components/Layout';
import BottomSheet, { useSheet } from '../components/ui/BottomSheet';
import DetalleCard from '../components/ui/DetalleCard';
import PageHeader, { CreateButton } from '../components/PageHeader';
import PdfViewerModal from '../components/PdfViewerModal';
import ActionsMenu from '../components/ActionsMenu';
import MenuImprimir from '../components/MenuImprimir';
import DetalleRecepcionCompra from '../components/DetalleRecepcionCompra';
import RecepcionarCompraModal from '../components/RecepcionarCompraModal';
import PlanillaTela from '../components/PlanillaTela';
import { gruposDeCompra } from '../lib/planilla';
import { Alert, Badge, Button, DataTable, Input, Modal, SearchSelect, Select } from '../components/ui';
import { hoyIso } from '../lib/fechas';

const estadoCompra = {
    registrada: { label: 'Registrada', variant: 'green' },
    parcial: { label: 'Recepción parcial', variant: 'amber' },
    recepcionada: { label: 'Recepcionada', variant: 'blue' },
    anulada: { label: 'Anulada', variant: 'red' },
};

// Cada compra se pacta en su moneda (las del exterior, en dólares): el monto
// se muestra en ella, no siempre en soles.
const money = (n, moneda = 'PEN') =>
    new Intl.NumberFormat(moneda === 'USD' ? 'en-US' : 'es-PE', {
        style: 'currency',
        currency: moneda === 'USD' ? 'USD' : 'PEN',
    }).format(Number(n) || 0);

const num = (n) => new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 }).format(Number(n) || 0);

const docLabel = { factura: 'Factura', boleta: 'Boleta', guia: 'Guía', no_domiciliado: 'Comprobante no domiciliado' };

export default function Compras() {
    const toast = useToast();
    const navigate = useNavigate();
    const [compras, setCompras] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const [deleteTarget, setDeleteTarget] = useState(null);
    const [pdfTarget, setPdfTarget] = useState(null);
    /** El listado en PDF: { url } mientras se ve. */
    const [reportePdf, setReportePdf] = useState(null);
    const [deleting, setDeleting] = useState(false);
    const [actionId, setActionId] = useState(null);
    const [recepcionarId, setRecepcionarId] = useState(null);
    /** La compra de la que se está viendo todo lo recibido. */
    const [detalleRecepcionId, setDetalleRecepcionId] = useState(null);
    const [finalizarTarget, setFinalizarTarget] = useState(null);
    const [motivo, setMotivo] = useState('');
    /** Compra cuyo detalle se muestra en la segunda tabla. */
    const [seleccionada, setSeleccionada] = useState(null);
    const sheet = useSheet();

    /** Se filtran entre las compras ya cargadas, no valen la pena pedirlos
        al backend. */
    const [fEstado, setFEstado] = useState('');
    const [fPago, setFPago] = useState('');
    const [fProveedor, setFProveedor] = useState('');
    const [fDesde, setFDesde] = useState(hoyIso);
    const [fHasta, setFHasta] = useState(hoyIso);

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
            key: 'orden_compra',
            label: 'Orden de compra',
            render: (row) => (row.orden_compra?.codigo ? <Badge variant="gray">{row.orden_compra.codigo}</Badge> : <span className="text-warm-400">—</span>),
        },
        {
            key: 'numero_contrato',
            label: 'N° contrato',
            render: (row) => (row.numero_contrato ? <Badge variant="gray" className="whitespace-nowrap">{row.numero_contrato}</Badge> : <span className="text-warm-400">—</span>),
        },
        {
            key: 'documento',
            label: 'Documento',
            render: (row) => (
                <span className="text-gray-700">
                    {docLabel[row.tipo_documento] ?? row.tipo_documento}
                    {row.serie || row.numero ? ` ${[row.serie, row.numero].filter(Boolean).join('-')}` : ''}
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
        { key: 'total', label: 'Total', align: 'right', render: (row) => <span className="font-semibold text-warm-900">{money(row.total, row.moneda_origen)}</span> },
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
                        // Todo lo recibido de la compra: sirve también cuando ya está
                        // recepcionada y "Recepcionar" no se puede abrir.
                        { label: 'Ver recepción', icon: PackageSearch, color: 'text-primary-600', onClick: () => setDetalleRecepcionId(row.id) },
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

    /** Los filtros de la pantalla, tal como los entiende el servidor: el Excel y el PDF salen con las mismas filas. */
    const parametrosReporte = () => {
        const p = { estado: fEstado, forma_pago: fPago, proveedor_id: fProveedor, desde: fDesde, hasta: fHasta };
        return Object.fromEntries(Object.entries(p).filter(([, v]) => v));
    };

    const exportarExcel = async () => {
        try {
            const { data } = await api.get('/compras/reporte/excel', { params: parametrosReporte(), responseType: 'blob' });
            const url = URL.createObjectURL(data);
            const a = document.createElement('a');
            a.href = url;
            a.download = `compras-${hoyIso()}.xlsx`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 4000);
        } catch {
            toast.error('No se pudo generar el Excel.');
        }
    };

    const exportarPdf = () => setReportePdf({ url: `/compras/reporte/pdf?${new URLSearchParams(parametrosReporte()).toString()}` });

    return (
        <Layout>
            <PageHeader
                title="Compras"
                description="Comprobantes de compra a proveedores"
                actions={
                    <>
                        {/* Desde y hasta por separado, a la vista y en la misma fila que Imprimir (el Excel y el PDF los usan). */}
                        <label className="flex items-center gap-2 text-sm font-medium text-warm-600">
                            Desde
                            <span className="w-40"><Input type="date" max={fHasta || undefined} value={fDesde} onChange={(e) => setFDesde(e.target.value)} aria-label="Fecha desde" /></span>
                        </label>
                        <label className="flex items-center gap-2 text-sm font-medium text-warm-600">
                            Hasta
                            <span className="w-40"><Input type="date" min={fDesde || undefined} value={fHasta} onChange={(e) => setFHasta(e.target.value)} aria-label="Fecha hasta" /></span>
                        </label>
                        <MenuImprimir onExcel={exportarExcel} onPdf={exportarPdf} />
                        <CreateButton onClick={() => navigate('/compras/nueva')}>Nueva compra</CreateButton>
                    </>
                }
            />

            {error && <Alert variant="error" className="mb-4">{error}</Alert>}

            <DataTable
                columns={columns}
                rows={compras.filter((c) => {
                    if (fEstado && c.estado !== fEstado) return false;
                    if (fPago && c.forma_pago !== fPago) return false;
                    if (fProveedor && String(c.proveedor_id) !== String(fProveedor)) return false;
                    if (fDesde && (!c.fecha || c.fecha.slice(0, 10) < fDesde)) return false;
                    if (fHasta && (!c.fecha || c.fecha.slice(0, 10) > fHasta)) return false;
                    return true;
                })}
                loading={loading}
                searchPlaceholder="Buscar compras..."
                onRowClick={(row) => { setSeleccionada(row); sheet.abrir(); }}
                rowClassName={(row) => (row.id === seleccionada?.id ? 'bg-primary-50' : undefined)}
                filterable
                filterCount={(fEstado ? 1 : 0) + (fPago ? 1 : 0) + (fProveedor ? 1 : 0) + (fDesde ? 1 : 0) + (fHasta ? 1 : 0)}
                filters={
                    <div className="space-y-2">
                        <Select
                            label="Estado"
                            value={fEstado}
                            onChange={(e) => setFEstado(e.target.value)}
                            options={[
                                { value: '', label: 'Todos' },
                                ...Object.entries(estadoCompra).map(([value, info]) => ({ value, label: info.label })),
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
                        <SearchSelect
                            label="Proveedor"
                            value={fProveedor}
                            onChange={(v) => setFProveedor(v ?? '')}
                            placeholder="Todos"
                            emptyText="Sin coincidencias"
                            options={[
                                ...new Map(
                                    compras.filter((c) => c.proveedor_id).map((c) => [String(c.proveedor_id), c.proveedor?.nombre]),
                                ).entries(),
                            ].map(([value, label]) => ({ value, label }))}
                        />
                        {(fEstado || fPago || fProveedor || fDesde || fHasta) && (
                            <button
                                onClick={() => {
                                    setFEstado('');
                                    setFPago('');
                                    setFProveedor('');
                                    setFDesde('');
                                    setFHasta('');
                                }}
                                className="text-xs font-medium text-red-600 hover:text-red-700"
                            >
                                Limpiar filtros
                            </button>
                        )}
                    </div>
                }
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
                                        { label: 'Costo', value: money(d.costo_unitario, seleccionada?.moneda_origen) },
                                        { label: 'Subtotal', value: money(d.subtotal, seleccionada?.moneda_origen), valueClassName: 'text-primary-600' },
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
                {/* El mismo formato del pedido: una tabla por tela, con cada color, sus rollos y el factor (metros por rollo). */}
                <div className="max-h-[60vh] overflow-auto p-4">
                    {detalles.length === 0 ? (
                        <p className="px-3 py-10 text-center text-sm text-warm-500">
                            {seleccionada ? 'Esta compra no tiene productos.' : 'Selecciona una compra arriba para ver su detalle.'}
                        </p>
                    ) : (
                        <>
                            <PlanillaTela
                                grupos={gruposDeCompra(detalles, 'costo_unitario')}
                                moneda={seleccionada?.moneda_origen || 'PEN'}
                                colorCode
                            />
                            {/* Lo que ya llegó al almacén, por producto. */}
                            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-warm-600">
                                {detalles.map((d) => (
                                    <span key={d.id}>
                                        {d.presentacion?.producto?.nombre}{d.color ? ` · ${d.color.nombre}` : ''}:
                                        {' '}recibido <strong className="text-green-600">{num(d.recibido)}</strong>
                                        {' · '}pendiente <strong className={Number(d.pendiente) > 0 ? 'text-amber-600' : 'text-warm-500'}>{num(d.pendiente)}</strong>
                                    </span>
                                ))}
                            </div>
                        </>
                    )}
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

            <DetalleRecepcionCompra
                open={Boolean(detalleRecepcionId)}
                compraId={detalleRecepcionId}
                onClose={() => setDetalleRecepcionId(null)}
            />
            {/* El listado de compras en PDF, con los filtros de la pantalla. */}
            <PdfViewerModal
                open={Boolean(reportePdf)}
                onClose={() => setReportePdf(null)}
                url={reportePdf?.url}
                titulo="Compras"
                nombre={`Compras ${hoyIso()}`}
            />

                    <PdfViewerModal
                open={Boolean(pdfTarget)}
                onClose={() => setPdfTarget(null)}
                tipo="compra"
                id={pdfTarget?.id}
                nombre={pdfTarget?.numero_compra}
                titulo="Compra"
                formatos={['a4', 'ticket']}
                // Al imprimir, la planilla va sin Color code ni Factor; en pantalla se ven.
                impresionDistinta
            />
        </Layout>
    );
}
