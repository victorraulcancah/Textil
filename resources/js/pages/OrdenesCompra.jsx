import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileDown, Pencil, Printer, ShoppingCart, Trash2 } from 'lucide-react';
import api, { asList } from '../lib/api';
import { useToast } from '../lib/toast';
import Layout from '../components/Layout';
import BottomSheet, { useSheet } from '../components/ui/BottomSheet';
import DetalleCard from '../components/ui/DetalleCard';
import PageHeader, { CreateButton } from '../components/PageHeader';
import PdfViewerModal from '../components/PdfViewerModal';
import { Alert, Badge, Button, DataTable, Modal, Select } from '../components/ui';

const money = (n) => new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(Number(n) || 0);
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
    const [pdfTarget, setPdfTarget] = useState(null);
    /** Orden cuyo detalle se muestra en la segunda tabla. */
    const [seleccionada, setSeleccionada] = useState(null);
    const sheet = useSheet();

    const [filterEstado, setFilterEstado] = useState('');
    const [filterCompra, setFilterCompra] = useState('');
    const [filterProveedor, setFilterProveedor] = useState('');
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
        setActiveFilters(next);
    };
    const clearFilters = () => {
        setFilterEstado('');
        setFilterCompra('');
        setFilterProveedor('');
        setActiveFilters({});
    };
    const filtered = ordenes.filter((o) => {
        if (activeFilters.estado && (o.estado ?? 'pendiente') !== activeFilters.estado) return false;
        if (activeFilters.compra === 'si' && !(o.compras_count > 0)) return false;
        if (activeFilters.compra === 'no' && o.compras_count > 0) return false;
        if (activeFilters.proveedor && String(o.proveedor_id) !== activeFilters.proveedor) return false;
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
            <Select label="Proveedor" value={filterProveedor} onChange={(e) => setFilterProveedor(e.target.value)}
                options={[{ value: '', label: 'Todos' }, ...proveedoresOptions]}
                className="w-52" />
            <Button variant="primary" size="sm" onClick={applyFilters}>Aplicar</Button>
            {filterCount > 0 && <Button variant="ghost" size="sm" onClick={clearFilters}>Limpiar</Button>}
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
            label: 'Acciones',
            width: '140px',
            actions: (row) => {
                // Una orden ya transformada en compra queda congelada.
                const bloqueada = row.compras_count > 0;

                return (
                    <>
                        <button
                            aria-label="Imprimir"
                            title="Imprimir / PDF"
                            onClick={() => setPdfTarget(row)}
                            className="rounded-md p-1.5 text-warm-600 transition hover:bg-gray-100 hover:text-warm-900"
                        >
                            <Printer className="h-4 w-4" />
                        </button>
                        <button
                            aria-label="Transformar a compra"
                            title={bloqueada ? 'Ya se transformó en compra' : 'Transformar a compra'}
                            disabled={bloqueada}
                            onClick={(e) => { e.stopPropagation(); navigate(`/compras/nueva?orden=${row.id}`); }}
                            className="rounded-md p-1.5 text-green-600 transition hover:bg-green-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                        >
                            <FileDown className="h-4 w-4" />
                        </button>
                        <button
                            aria-label="Editar"
                            title={bloqueada ? 'No se puede editar: ya tiene compra' : 'Editar'}
                            disabled={bloqueada}
                            onClick={(e) => { e.stopPropagation(); navigate(`/ordenes-compra/${row.id}/editar`); }}
                            className="rounded-md p-1.5 text-primary-600 transition hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                        >
                            <Pencil className="h-4 w-4" />
                        </button>
                        <button
                            aria-label="Eliminar"
                            title={bloqueada ? 'No se puede eliminar: ya tiene compra' : 'Eliminar'}
                            disabled={bloqueada}
                            onClick={(e) => { e.stopPropagation(); setDeleteTarget(row); }}
                            className="rounded-md p-1.5 text-red-600 transition hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                        >
                            <Trash2 className="h-4 w-4" />
                        </button>
                    </>
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
                            const subtotal = (Number(d.cantidad) || 0) * (Number(d.precio_unitario) || 0);
                            return (
                                <DetalleCard
                                    key={d.id}
                                    titulo={producto?.nombre ?? '—'}
                                    subtitulo={[producto?.codigo, d.presentacion?.nombre, producto?.marca?.nombre].filter(Boolean).join(' · ')}
                                    campos={[
                                        { label: 'Cant.', value: num(d.cantidad) },
                                        { label: 'P. Unit.', value: money(d.precio_unitario) },
                                        { label: 'Subtotal', value: money(subtotal), valueClassName: 'text-primary-600' },
                                    ]}
                                />
                            );
                        })}
                        <div className="flex items-center justify-between px-1 pt-1 text-sm">
                            <span className="font-medium text-warm-500">Total</span>
                            <span className="text-base font-bold text-warm-900">
                                {money(seleccionada.detalles.reduce((s, d) => s + (Number(d.cantidad) || 0) * (Number(d.precio_unitario) || 0), 0))}
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
                            {seleccionada.observaciones && <span>Obs.: <strong className="text-warm-900">{seleccionada.observaciones}</strong></span>}
                        </span>
                    )}
                </div>
                <div className="overflow-auto" style={{ height: '30vh' }}>
                    <table className="w-full min-w-[820px] text-sm">
                        <thead className="sticky top-0 z-10">
                            <tr className="bg-primary-600 text-left text-xs font-semibold uppercase tracking-wide text-white">
                                <th className="w-12 px-3 py-1.5 text-center">#</th>
                                <th className="w-28 px-3 py-1.5">Código</th>
                                <th className="px-3 py-1.5">Producto</th>
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
                                    <td colSpan={8} className="px-3 py-10 text-center text-sm text-warm-500">
                                        {seleccionada ? 'Esta orden no tiene productos.' : 'Selecciona una orden arriba para ver su detalle.'}
                                    </td>
                                </tr>
                            )}
                            {(seleccionada?.detalles ?? []).map((d, i) => {
                                const producto = d.presentacion?.producto;
                                const subtotal = (Number(d.cantidad) || 0) * (Number(d.precio_unitario) || 0);
                                return (
                                    <tr key={d.id}>
                                        <td className="px-3 py-2 text-center text-warm-500">{i + 1}</td>
                                        <td className="px-3 py-2 text-warm-500">{producto?.codigo ?? '—'}</td>
                                        <td className="px-3 py-2 font-semibold text-warm-900">{producto?.nombre ?? '—'}</td>
                                        <td className="px-3 py-2 text-warm-500">{producto?.marca?.nombre ?? '—'}</td>
                                        <td className="px-3 py-2 text-warm-500">{d.presentacion?.nombre ?? '—'}</td>
                                        <td className="px-3 py-2 text-right text-warm-900">{num(d.cantidad)}</td>
                                        <td className="px-3 py-2 text-right text-warm-900">{money(d.precio_unitario)}</td>
                                        <td className="px-3 py-2 text-right font-semibold text-primary-600">{money(subtotal)}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                        {(seleccionada?.detalles ?? []).length > 0 && (
                            <tfoot>
                                <tr className="border-t border-edge bg-gray-50">
                                    <td colSpan={7} className="px-3 py-1.5 text-right text-xs font-bold uppercase tracking-wide text-primary-700">Total</td>
                                    <td className="px-3 py-1.5 text-right text-base font-extrabold text-warm-900">
                                        {money(seleccionada.detalles.reduce((s, d) => s + (Number(d.cantidad) || 0) * (Number(d.precio_unitario) || 0), 0))}
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
