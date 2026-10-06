import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Ban, Edit, Eye, FileSpreadsheet, FileText, Printer, User } from 'lucide-react';
import api, { asList } from '../lib/api';
import { useToast } from '../lib/toast';
import Layout from '../components/Layout';
import BottomSheet, { useSheet } from '../components/ui/BottomSheet';
import DetalleProforma from '../components/DetalleProforma';
import PageHeader, { CreateButton } from '../components/PageHeader';
import PdfViewerModal from '../components/PdfViewerModal';
import { Alert, Badge, Button, DataTable, Input, Modal, SearchSelect, Select, Spinner } from '../components/ui';
import FiltroFechas from '../components/FiltroFechas';
import { hoyIso } from '../lib/fechas';

const fecha = (v) => (v ? new Date(v).toLocaleDateString('es-PE') : '—');
const formaLabel = { efectivo: 'Efectivo', transferencia: 'Transferencia', tarjeta: 'Tarjeta', yape: 'Yape', plin: 'Plin', credito: 'Crédito', otro: 'Otro' };

/** Cada venta en su moneda: soles o dólares. */
const money = (n, moneda = 'PEN') =>
    new Intl.NumberFormat('es-PE', { style: 'currency', currency: moneda || 'PEN' }).format(Number(n) || 0);


export default function NotasVenta() {
    const toast = useToast();
    const navigate = useNavigate();
    /** Venta cuyo detalle se muestra en la segunda tabla. */
    const [seleccionada, setSeleccionada] = useState(null);
    const sheet = useSheet();
    const [notas, setNotas] = useState([]);
    /** Nota cuyo PDF se está viendo. */
    const [pdfTarget, setPdfTarget] = useState(null);
    /** El listado en PDF: { url } mientras se ve. */
    const [reportePdf, setReportePdf] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [fEstado, setFEstado] = useState('');
    const [fPago, setFPago] = useState('');
    /** Cliente y almacén: se filtran entre las ventas ya cargadas, no valen
        la pena pedirlos al backend. */
    const [fCliente, setFCliente] = useState('');
    const [fAlmacen, setFAlmacen] = useState('');
    const [fVendedor, setFVendedor] = useState('');
    const [fDesde, setFDesde] = useState(hoyIso);
    const [fHasta, setFHasta] = useState(hoyIso);

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
            setError('No se pudieron cargar las proformas.');
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
            toast.error('No se pudo cargar el detalle de la proforma.');
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
            toast.success('Proforma anulada. Stock devuelto al almacén.');
            setAnularTarget(null);
            setMotivo('');
            await load();
        } catch (err) {
            toast.error(err.response?.data?.message ?? 'No se pudo anular la proforma.');
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
        { key: 'almacen', label: 'Almacén', render: (row) => row.almacen?.nombre ?? '—' },
        { key: 'vendedor', label: 'Vendedor', render: (row) => row.vendedor?.name ?? '—' },
        {
            key: 'pedido',
            label: 'Pedido',
            getSearchValue: (row) => row.orden_venta?.documento,
            render: (row) =>
                row.orden_venta ? (
                    <Badge variant="blue">{row.orden_venta.documento}</Badge>
                ) : (
                    <span className="text-xs text-warm-400">Mostrador</span>
                ),
        },
        {
            key: 'tipo_pago',
            label: 'Pago',
            render: (row) => (
                <Badge variant={row.tipo_pago === 'contado' ? 'green' : 'amber'}>
                    {row.tipo_pago === 'contado' ? 'Contado' : 'Crédito'}
                </Badge>
            ),
        },
        { key: 'total', label: 'Total', align: 'right', render: (row) => <span className="font-semibold text-warm-900">{money(row.total, row.moneda)}</span> },
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
                            title="Editar proforma"
                            onClick={() => navigate(`/notas-venta/${row.id}/editar`)}
                            className="rounded-md p-1.5 text-amber-600 transition hover:bg-amber-50 hover:text-amber-700"
                        >
                            <Edit className="h-4 w-4" />
                        </button>
                    )}
                    {row.estado !== 'anulada' && (
                        <button
                            aria-label="Anular"
                            title="Anular proforma"
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

    /** Los filtros de la pantalla, tal como los entiende el servidor: el Excel y el PDF salen con las mismas filas. */
    const parametrosReporte = () => {
        const p = { estado: fEstado, tipo_pago: fPago, cliente_id: fCliente, almacen_id: fAlmacen, vendedor_id: fVendedor, desde: fDesde, hasta: fHasta };
        return Object.fromEntries(Object.entries(p).filter(([, v]) => v));
    };

    const descargarExcel = async () => {
        try {
            const { data } = await api.get('/notas-venta/reporte/excel', { params: parametrosReporte(), responseType: 'blob' });
            const url = URL.createObjectURL(data);
            const a = document.createElement('a');
            a.href = url;
            a.download = `proformas-${hoyIso()}.xlsx`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 4000);
        } catch {
            toast.error('No se pudo generar el Excel.');
        }
    };

    const verReportePdf = () => setReportePdf({ url: `/notas-venta/reporte/pdf?${new URLSearchParams(parametrosReporte()).toString()}` });

    const docNombre = (n) => `${n?.serie ?? ''}-${String(n?.numero ?? '').padStart(8, '0')}`;

    const detallesVenta = seleccionada?.detalles ?? [];

    return (
        <Layout>
            <PageHeader
                title="Proformas"
                description="Proformas emitidas a clientes"
                actions={
                    <>
                        <FiltroFechas desde={fDesde} hasta={fHasta} onDesde={setFDesde} onHasta={setFHasta} />
                        <Button variant="secondary" onClick={descargarExcel}>
                            <FileSpreadsheet className="h-4 w-4" />
                            Excel
                        </Button>
                        <Button variant="secondary" onClick={verReportePdf}>
                            <FileText className="h-4 w-4" />
                            PDF
                        </Button>
                        <CreateButton onClick={() => navigate('/notas-venta/nueva')}>Nueva proforma</CreateButton>
                    </>
                }
            />

            {error && <Alert variant="error" className="mb-4">{error}</Alert>}

            <DataTable
                columns={columns}
                rows={notas.filter(
                    (n) =>
                        (!fEstado || n.estado === fEstado) &&
                        (!fPago || n.tipo_pago === fPago) &&
                        (!fCliente || String(n.cliente?.id) === String(fCliente)) &&
                        (!fAlmacen || String(n.almacen_id) === String(fAlmacen)) &&
                        (!fVendedor || String(n.vendedor_id) === String(fVendedor)) &&
                        (!fDesde || (n.fecha_emision && n.fecha_emision.slice(0, 10) >= fDesde)) &&
                        (!fHasta || (n.fecha_emision && n.fecha_emision.slice(0, 10) <= fHasta)),
                )}
                loading={loading}
                onRowClick={(row) => { setSeleccionada(row); sheet.abrir(); }}
                rowClassName={(row) => (row.id === seleccionada?.id ? 'bg-primary-50' : undefined)}
                searchPlaceholder="Buscar proformas..."
                filterable
                filterCount={
                    (fEstado ? 1 : 0) +
                    (fPago ? 1 : 0) +
                    (fCliente ? 1 : 0) +
                    (fAlmacen ? 1 : 0) +
                    (fVendedor ? 1 : 0) +
                    (fDesde ? 1 : 0) +
                    (fHasta ? 1 : 0)
                }
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
                        <SearchSelect
                            label="Cliente"
                            value={fCliente}
                            onChange={(v) => setFCliente(v ?? '')}
                            placeholder="Todos"
                            emptyText="Sin coincidencias"
                            options={[
                                ...new Map(
                                    notas.filter((n) => n.cliente?.id).map((n) => [String(n.cliente.id), n.cliente.nombre]),
                                ).entries(),
                            ].map(([value, label]) => ({ value, label }))}
                        />
                        <SearchSelect
                            label="Almacén"
                            value={fAlmacen}
                            onChange={(v) => setFAlmacen(v ?? '')}
                            placeholder="Todos"
                            emptyText="Sin coincidencias"
                            options={[
                                ...new Map(
                                    notas.filter((n) => n.almacen_id).map((n) => [String(n.almacen_id), n.almacen?.nombre ?? n.almacen]),
                                ).entries(),
                            ].map(([value, label]) => ({ value, label }))}
                        />
                        <SearchSelect
                            label="Vendedor"
                            value={fVendedor}
                            onChange={(v) => setFVendedor(v ?? '')}
                            placeholder="Todos"
                            emptyText="Sin coincidencias"
                            options={[
                                ...new Map(
                                    notas.filter((n) => n.vendedor_id).map((n) => [String(n.vendedor_id), n.vendedor?.name]),
                                ).entries(),
                            ].map(([value, label]) => ({ value, label }))}
                        />
                        {(fEstado || fPago || fCliente || fAlmacen || fVendedor || fDesde || fHasta) && (
                            <button
                                onClick={() => {
                                    setFEstado('');
                                    setFPago('');
                                    setFCliente('');
                                    setFAlmacen('');
                                    setFVendedor('');
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
            />

            {/* Móvil: el detalle sube desde abajo al tocar una card (en escritorio no pinta nada). */}
            <BottomSheet
                open={sheet.open && Boolean(seleccionada)}
                onClose={sheet.cerrar}
                title={seleccionada ? `${seleccionada.serie}-${seleccionada.numero} · ${seleccionada.cliente?.nombre ?? 'Cliente'}` : ''}
                subtitle={`${detallesVenta.length} ${detallesVenta.length === 1 ? 'producto' : 'productos'}`}
            >
                {detallesVenta.length === 0 ? (
                    <p className="py-6 text-center text-sm text-warm-500">Esta proforma no tiene productos.</p>
                ) : (
                    <DetalleProforma detalles={detallesVenta} moneda={seleccionada?.moneda} total={seleccionada?.total} />
                )}
            </BottomSheet>

            {/* Detalle de la proforma seleccionada (escritorio) */}
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
                <div className="overflow-auto p-3" style={{ height: '30vh' }}>
                    {detallesVenta.length === 0 ? (
                        <p className="px-3 py-10 text-center text-sm text-warm-500">
                            {seleccionada ? 'Esta proforma no tiene productos.' : 'Selecciona una proforma arriba para ver su detalle.'}
                        </p>
                    ) : (
                        <DetalleProforma detalles={detallesVenta} moneda={seleccionada?.moneda} total={seleccionada?.total} />
                    )}
                </div>
            </div>

            <Modal
                open={Boolean(anularTarget)}
                onClose={() => setAnularTarget(null)}
                title="Anular proforma"
                description={`Proforma ${anularTarget?.serie}-${anularTarget?.numero}. El stock volverá al almacén.`}
                size="sm"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setAnularTarget(null)}>Cancelar</Button>
                        <Button variant="danger" loading={anulando} onClick={handleAnular}>Anular proforma</Button>
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
                title={detalle ? `Proforma ${detalle.serie}-${detalle.numero}` : 'Detalle de proforma'}
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
                            <DetalleProforma detalles={detalle.detalles ?? []} moneda={detalle.moneda} total={detalle.total} />
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
                                                <span className="font-medium text-warm-900">
                                                    {/* Cobrada con soles una venta en dólares: lo que entró y lo que abonó. */}
                                                    {p.monto_pen != null
                                                        ? `${money(p.monto_pen, 'PEN')} (= ${money(p.monto, detalle.moneda)})`
                                                        : money(p.monto, detalle.moneda)}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                            <div className="rounded-xl border border-edge p-4">
                                <div className="flex justify-between text-sm text-warm-600">
                                    <span>Subtotal</span><span>{money(detalle.subtotal, detalle.moneda)}</span>
                                </div>
                                {Number(detalle.descuento_total) > 0 && (
                                    <div className="flex justify-between text-sm text-warm-600">
                                        <span>Descuento</span><span>- {money(detalle.descuento_total, detalle.moneda)}</span>
                                    </div>
                                )}
                                <div className="mt-2 flex justify-between border-t border-edge pt-2 text-base font-extrabold text-warm-900">
                                    <span>Total</span><span>{money(detalle.total, detalle.moneda)}</span>
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
            {/* El listado de proformas en PDF, con los filtros de la pantalla. */}
            <PdfViewerModal
                open={Boolean(reportePdf)}
                onClose={() => setReportePdf(null)}
                url={reportePdf?.url}
                titulo="Proformas"
                nombre={`Proformas ${hoyIso()}`}
            />

                    <PdfViewerModal
                open={Boolean(pdfTarget)}
                onClose={() => setPdfTarget(null)}
                tipo="nota-venta"
                id={pdfTarget?.id}
                nombre={pdfTarget ? docNombre(pdfTarget) : ''}
                titulo="Proforma"
                formatos={['a4', 'ticket']}
            />
        </Layout>
    );
}
