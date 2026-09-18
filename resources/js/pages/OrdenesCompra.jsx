import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Ban, CheckCircle2, FileDown, Pencil, Printer, Send, ShoppingCart, Trash2 } from 'lucide-react';
import api, { asList } from '../lib/api';
import { useToast } from '../lib/toast';
import Layout from '../components/Layout';
import ActionsMenu from '../components/ActionsMenu';
import BottomSheet, { useSheet } from '../components/ui/BottomSheet';
import DetalleCard from '../components/ui/DetalleCard';
import PageHeader, { CreateButton } from '../components/PageHeader';
import PdfViewerModal from '../components/PdfViewerModal';
import { Alert, Badge, Button, DataTable, DateRangePicker, Modal, SearchSelect, Select } from '../components/ui';

const money = (n, moneda = 'PEN') =>
    new Intl.NumberFormat(moneda === 'USD' ? 'en-US' : 'es-PE', {
        style: 'currency',
        currency: moneda === 'USD' ? 'USD' : 'PEN',
    }).format(Number(n) || 0);
const num = (n) => new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 }).format(Number(n) || 0);
const fecha = (f) => (f ? new Date(String(f).length === 10 ? `${f}T00:00:00` : f).toLocaleDateString('es-PE') : '—');

const estadoInfo = {
    pendiente: { label: 'Pendiente', variant: 'amber' },
    aprobada: { label: 'Aprobada', variant: 'green' },
    enviada: { label: 'Enviada', variant: 'blue' },
    parcial: { label: 'Parcial', variant: 'amber' },
    completada: { label: 'Completada', variant: 'green' },
    anulada: { label: 'Anulada', variant: 'red' },
};

export default function OrdenesCompra() {
    const toast = useToast();
    const navigate = useNavigate();
    const [ordenes, setOrdenes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const [deleteTarget, setDeleteTarget] = useState(null);
    const [deleting, setDeleting] = useState(false);
    const [actionId, setActionId] = useState(null);
    const [pdfTarget, setPdfTarget] = useState(null);
    /** Orden cuyo detalle se muestra en la segunda tabla. */
    const [seleccionada, setSeleccionada] = useState(null);
    const sheet = useSheet();

    const [filterEstado, setFilterEstado] = useState('');
    const [filterCompra, setFilterCompra] = useState('');
    const [filterProveedor, setFilterProveedor] = useState('');
    const [filterDesde, setFilterDesde] = useState('');
    const [filterHasta, setFilterHasta] = useState('');
    const [activeFilters, setActiveFilters] = useState({});

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const lista = asList(await api.get('/ordenes-compra'));
            setOrdenes(lista);
            setSeleccionada((prev) => lista.find((o) => o.id === prev?.id) ?? lista[0] ?? null);
        } catch {
            setError('No se pudieron cargar las órdenes de compra.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const aprobar = async (row) => {
        setActionId(row.id);
        try {
            await api.post(`/ordenes-compra/${row.id}/aprobar`);
            toast.success('Orden aprobada.');
            await load();
        } catch (err) {
            toast.error(err.response?.data?.message ?? 'No se pudo aprobar la orden.');
        } finally {
            setActionId(null);
        }
    };

    const enviar = async (row) => {
        setActionId(row.id);
        try {
            await api.post(`/ordenes-compra/${row.id}/enviar`);
            toast.success('Orden marcada como enviada.');
            await load();
        } catch (err) {
            toast.error(err.response?.data?.message ?? 'No se pudo marcar la orden como enviada.');
        } finally {
            setActionId(null);
        }
    };

    const anular = async (row) => {
        setActionId(row.id);
        try {
            await api.post(`/ordenes-compra/${row.id}/anular`);
            toast.success('Orden anulada.');
            await load();
        } catch (err) {
            toast.error(err.response?.data?.message ?? 'No se pudo anular la orden.');
        } finally {
            setActionId(null);
        }
    };

    const handleDelete = async () => {
        setDeleting(true);
        try {
            await api.delete(`/ordenes-compra/${deleteTarget.id}`);
            toast.success('Orden eliminada.');
            setDeleteTarget(null);
            await load();
        } catch (err) {
            toast.error(err.response?.data?.message ?? 'No se pudo eliminar la orden.');
        } finally {
            setDeleting(false);
        }
    };

    // ── Filtros ──
    const applyFilters = () => {
        const next = {};
        if (filterEstado) next.estado = filterEstado;
        if (filterCompra) next.compra = filterCompra;
        if (filterProveedor) next.proveedor = filterProveedor;
        if (filterDesde) next.desde = filterDesde;
        if (filterHasta) next.hasta = filterHasta;
        setActiveFilters(next);
    };
    const clearFilters = () => {
        setFilterEstado('');
        setFilterCompra('');
        setFilterProveedor('');
        setFilterDesde('');
        setFilterHasta('');
        setActiveFilters({});
    };
    const filtered = ordenes.filter((o) => {
        if (activeFilters.estado && (o.estado ?? 'pendiente') !== activeFilters.estado) return false;
        if (activeFilters.compra === 'si' && !(o.compras_count > 0)) return false;
        if (activeFilters.compra === 'no' && o.compras_count > 0) return false;
        if (activeFilters.proveedor && String(o.proveedor_id) !== activeFilters.proveedor) return false;
        if (activeFilters.desde && (!o.fecha_emision || o.fecha_emision.slice(0, 10) < activeFilters.desde)) return false;
        if (activeFilters.hasta && (!o.fecha_emision || o.fecha_emision.slice(0, 10) > activeFilters.hasta)) return false;
        return true;
    });
    const filterCount = Object.keys(activeFilters).length;
    const proveedoresOptions = [...new Map(ordenes.filter((o) => o.proveedor).map((o) => [String(o.proveedor.id), o.proveedor.nombre])).entries()]
        .map(([value, label]) => ({ value, label }))
        .sort((a, b) => a.label.localeCompare(b.label, 'es'));

    const filters = (
        <div className="flex flex-wrap items-end gap-3">
            <Select label="Estado" value={filterEstado} onChange={(e) => setFilterEstado(e.target.value)}
                options={[{ value: '', label: 'Todos' }, ...Object.entries(estadoInfo).map(([value, info]) => ({ value, label: info.label }))]}
                className="w-40" />
            <Select label="Compra" value={filterCompra} onChange={(e) => setFilterCompra(e.target.value)}
                options={[{ value: '', label: 'Todas' }, { value: 'no', label: 'Sin compra' }, { value: 'si', label: 'Transformadas' }]}
                className="w-40" />
            <SearchSelect label="Proveedor" value={filterProveedor} onChange={(v) => setFilterProveedor(v ?? '')}
                placeholder="Todos" emptyText="Sin coincidencias"
                options={proveedoresOptions}
                className="w-52" />
            <DateRangePicker
                label="Rango de fecha"
                desde={filterDesde}
                hasta={filterHasta}
                onChange={(d, h) => {
                    setFilterDesde(d);
                    setFilterHasta(h);
                }}
            />
        </div>
    );

    const columns = [
        { key: 'codigo', label: 'Código', render: (row) => <Badge variant="gray">{row.codigo}</Badge> },
        {
            key: 'proveedor',
            label: 'Proveedor',
            render: (row) => (
                <span className="inline-flex items-center gap-2 font-medium text-warm-900">
                    <ShoppingCart className="h-4 w-4 text-primary-600" />
                    {row.proveedor?.nombre ?? '—'}
                </span>
            ),
        },
        { key: 'fecha_emision', label: 'Emisión', render: (row) => (row.fecha_emision ? new Date(row.fecha_emision).toLocaleDateString('es-PE') : '—') },
        { key: 'detalles_count', label: 'Ítems', render: (row) => <Badge variant="blue">{row.detalles_count ?? 0}</Badge> },
        {
            key: 'estado',
            label: 'Estado',
            render: (row) => {
                const info = estadoInfo[row.estado] ?? { label: row.estado ?? '—', variant: 'gray' };
                return <Badge variant={info.variant}>{info.label}</Badge>;
            },
        },
        {
            key: 'compras_count',
            label: 'Compra',
            render: (row) =>
                row.compras_count > 0 ? (
                    <Badge variant="green">Transformada</Badge>
                ) : (
                    <Badge variant="gray">Sin compra</Badge>
                ),
        },
        {
            type: 'actions',
            key: 'actions',
            label: 'Acc.',
            width: '70px',
            actions: (row) => {
                // Una orden ya transformada en compra queda congelada.
                const bloqueada = row.compras_count > 0;
                // Aprobar es un compromiso formal: de ahí en más ya no se edita ni elimina.
                const editable = row.estado === 'pendiente' && !bloqueada;

                return (
                    <ActionsMenu
                        items={[
                            {
                                label: 'Aprobar',
                                icon: CheckCircle2,
                                color: 'text-green-600',
                                hidden: row.estado !== 'pendiente',
                                disabled: actionId === row.id,
                                onClick: () => aprobar(row),
                            },
                            {
                                label: 'Marcar como enviada',
                                icon: Send,
                                color: 'text-blue-600',
                                hidden: row.estado !== 'aprobada',
                                disabled: actionId === row.id,
                                onClick: () => enviar(row),
                            },
                            { label: 'Imprimir / PDF', icon: Printer, color: 'text-warm-600', onClick: () => setPdfTarget(row) },
                            {
                                label: 'Anular',
                                icon: Ban,
                                color: 'text-gray-500',
                                hidden: bloqueada || row.estado === 'anulada',
                                disabled: actionId === row.id,
                                onClick: () => anular(row),
                            },
                            {
                                label: 'Transformar a compra',
                                icon: FileDown,
                                color: 'text-green-600',
                                disabled: bloqueada,
                                title: bloqueada ? 'Ya se transformó en compra' : undefined,
                                onClick: () => navigate(`/compras/nueva?orden=${row.id}`),
                            },
                            {
                                label: 'Editar',
                                icon: Pencil,
                                color: 'text-primary-600',
                                disabled: !editable,
                                title: !editable ? 'No se puede editar: la orden ya fue aprobada o tiene compra' : undefined,
                                onClick: () => navigate(`/ordenes-compra/${row.id}/editar`),
                            },
                            {
                                label: 'Eliminar',
                                icon: Trash2,
                                danger: true,
                                disabled: !editable,
                                title: !editable ? 'No se puede eliminar: la orden ya fue aprobada o tiene compra' : undefined,
                                onClick: () => setDeleteTarget(row),
                            },
                        ]}
                    />
                );
            },
        },
    ];

    return (
        <Layout>
            <PageHeader
                title="Órdenes de Compra"
                description="Pedidos formales de compra a proveedores"
                actions={<CreateButton onClick={() => navigate('/ordenes-compra/nueva')}>Nueva orden</CreateButton>}
            />

            {error && <Alert variant="error" className="mb-4">{error}</Alert>}

            <DataTable
                columns={columns}
                rows={filtered}
                loading={loading}
                searchPlaceholder="Buscar órdenes..."
                filterable
                filters={filters}
                filterCount={filterCount}
                onApplyFilters={applyFilters}
                onClearFilters={clearFilters}
                onRowClick={(row) => { setSeleccionada(row); sheet.abrir(); }}
                rowClassName={(row) => (row.id === seleccionada?.id ? 'bg-primary-50' : undefined)}
                height="34vh"
                dense
            />

            {/* Móvil: el detalle sube desde abajo al tocar una card (en escritorio no pinta nada). */}
            <BottomSheet
                open={sheet.open && Boolean(seleccionada)}
                onClose={sheet.cerrar}
                title={seleccionada ? `${seleccionada.codigo ?? 'Orden'} · ${seleccionada.proveedor?.nombre ?? 'Proveedor'}` : ''}
                subtitle={seleccionada ? `Emisión ${fecha(seleccionada.fecha_emision)} · Entrega est. ${fecha(seleccionada.fecha_entrega_estimada)}` : ''}
            >
                {(seleccionada?.detalles ?? []).length === 0 ? (
                    <p className="py-6 text-center text-sm text-warm-500">Esta orden no tiene productos.</p>
                ) : (
                    <div className="space-y-3">
                        {seleccionada.detalles.map((d) => {
                            const producto = d.presentacion?.producto;
                            const codigo = [producto?.codigo, d.color?.codigo].filter(Boolean).join('-');
                            const subtotal = (Number(d.cantidad) || 0) * (Number(d.precio_unitario) || 0);
                            return (
                                <DetalleCard
                                    key={d.id}
                                    titulo={[producto?.nombre, d.color?.nombre].filter(Boolean).join(' · ')}
                                    subtitulo={[codigo, d.presentacion?.nombre, producto?.marca?.nombre].filter(Boolean).join(' · ')}
                                    campos={[
                                        { label: 'Cant.', value: num(d.cantidad) },
                                        { label: 'P. Unit.', value: money(d.precio_unitario, seleccionada.moneda) },
                                        { label: 'Subtotal', value: money(subtotal, seleccionada.moneda), valueClassName: 'text-primary-600' },
                                    ]}
                                />
                            );
                        })}
                        <div className="flex items-center justify-between px-1 pt-1 text-sm">
                            <span className="font-medium text-warm-500">Total</span>
                            <span className="text-base font-bold text-warm-900">
                                {money(seleccionada.detalles.reduce((s, d) => s + (Number(d.cantidad) || 0) * (Number(d.precio_unitario) || 0), 0), seleccionada.moneda)}
                            </span>
                        </div>
                    </div>
                )}
            </BottomSheet>

            {/* Detalle de la orden seleccionada (escritorio) */}
            <div className="mt-6 hidden rounded-xl border border-edge bg-white shadow-sm md:block">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-edge px-5 py-3">
                    <h2 className="text-sm font-semibold text-warm-900">
                        Detalle {seleccionada?.codigo ? `de ${seleccionada.codigo}` : ''}
                    </h2>
                    {seleccionada && (
                        <span className="flex flex-wrap gap-3 text-xs text-warm-500">
                            <span>Proveedor: <strong className="text-warm-900">{seleccionada.proveedor?.nombre ?? '—'}</strong></span>
                            <span>Emisión: <strong className="text-warm-900">{fecha(seleccionada.fecha_emision)}</strong></span>
                            <span>Entrega est.: <strong className="text-warm-900">{fecha(seleccionada.fecha_entrega_estimada)}</strong></span>
                            {seleccionada.compras?.length > 0 && (
                                <span>Compra: <strong className="text-warm-900">{seleccionada.compras.map((c) => c.correlativo ?? `#${c.id}`).join(', ')}</strong></span>
                            )}
                            {seleccionada.usuario_aprueba && (
                                <span>Aprobó: <strong className="text-warm-900">{seleccionada.usuario_aprueba.name}</strong> ({fecha(seleccionada.fecha_aprobacion)})</span>
                            )}
                            {seleccionada.usuario_envia && (
                                <span>Envió: <strong className="text-warm-900">{seleccionada.usuario_envia.name}</strong> ({fecha(seleccionada.fecha_envio)})</span>
                            )}
                            {seleccionada.observaciones && <span>Obs.: <strong className="text-warm-900">{seleccionada.observaciones}</strong></span>}
                        </span>
                    )}
                </div>
                <div className="overflow-auto" style={{ height: '30vh' }}>
                    <table className="w-full min-w-[900px] text-sm">
                        <thead className="sticky top-0 z-10">
                            <tr className="bg-primary-600 text-left text-xs font-semibold uppercase tracking-wide text-white">
                                <th className="w-12 px-3 py-1.5 text-center">#</th>
                                <th className="w-28 px-3 py-1.5">Código</th>
                                <th className="px-3 py-1.5">Producto</th>
                                <th className="w-28 px-3 py-1.5">Color</th>
                                <th className="w-32 px-3 py-1.5">Marca</th>
                                <th className="w-32 px-3 py-1.5">Unidad</th>
                                <th className="w-24 px-3 py-1.5 text-right">Cant.</th>
                                <th className="w-28 px-3 py-1.5 text-right">P. Unit.</th>
                                <th className="w-32 px-3 py-1.5 text-right">Subtotal</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {(seleccionada?.detalles ?? []).length === 0 && (
                                <tr>
                                    <td colSpan={9} className="px-3 py-10 text-center text-sm text-warm-500">
                                        {seleccionada ? 'Esta orden no tiene productos.' : 'Selecciona una orden arriba para ver su detalle.'}
                                    </td>
                                </tr>
                            )}
                            {(seleccionada?.detalles ?? []).map((d, i) => {
                                const producto = d.presentacion?.producto;
                                const codigo = [producto?.codigo, d.color?.codigo].filter(Boolean).join('-');
                                const subtotal = (Number(d.cantidad) || 0) * (Number(d.precio_unitario) || 0);
                                return (
                                    <tr key={d.id}>
                                        <td className="px-3 py-2 text-center text-warm-500">{i + 1}</td>
                                        <td className="px-3 py-2 text-warm-500">{codigo || '—'}</td>
                                        <td className="px-3 py-2 font-semibold text-warm-900">{producto?.nombre ?? '—'}</td>
                                        <td className="px-3 py-2 text-warm-500">{d.color?.nombre ?? '—'}</td>
                                        <td className="px-3 py-2 text-warm-500">{producto?.marca?.nombre ?? '—'}</td>
                                        <td className="px-3 py-2 text-warm-500">{d.presentacion?.nombre ?? '—'}</td>
                                        <td className="px-3 py-2 text-right text-warm-900">{num(d.cantidad)}</td>
                                        <td className="px-3 py-2 text-right text-warm-900">{money(d.precio_unitario, seleccionada.moneda)}</td>
                                        <td className="px-3 py-2 text-right font-semibold text-primary-600">{money(subtotal, seleccionada.moneda)}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                        {(seleccionada?.detalles ?? []).length > 0 && (
                            <tfoot>
                                <tr className="border-t border-edge bg-gray-50">
                                    <td colSpan={8} className="px-3 py-1.5 text-right text-xs font-bold uppercase tracking-wide text-primary-700">Total</td>
                                    <td className="px-3 py-1.5 text-right text-base font-extrabold text-warm-900">
                                        {money(seleccionada.detalles.reduce((s, d) => s + (Number(d.cantidad) || 0) * (Number(d.precio_unitario) || 0), 0), seleccionada.moneda)}
                                    </td>
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
            </div>

            <Modal
                open={Boolean(deleteTarget)}
                onClose={() => setDeleteTarget(null)}
                title="Eliminar orden"
                description={`¿Eliminar la orden ${deleteTarget?.codigo}?`}
                size="sm"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
                        <Button variant="danger" loading={deleting} onClick={handleDelete}>Eliminar</Button>
                    </>
                }
            >
                <Alert variant="warning">La orden se eliminará permanentemente.</Alert>
            </Modal>
                    <PdfViewerModal
                open={Boolean(pdfTarget)}
                onClose={() => setPdfTarget(null)}
                tipo="orden-compra"
                id={pdfTarget?.id}
                nombre={pdfTarget?.codigo}
                titulo="Orden de compra"
                formatos={['a4', 'ticket']}
            />
        </Layout>
    );
}
