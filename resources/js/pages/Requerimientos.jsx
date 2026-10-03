import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, PackageCheck, Plus, X } from 'lucide-react';
import api, { asList } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import { useAlmacenPropio } from '../lib/almacenes';
import Layout from '../components/Layout';
import PageHeader from '../components/PageHeader';
import PdfViewerModal from '../components/PdfViewerModal';
import { Alert, Badge, Button, DataTable, Modal } from '../components/ui';

const num = (n) => new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 }).format(Number(n) || 0);

export const ESTADOS_RQ = {
    solicitada: { label: 'Solicitado', variant: 'amber' },
    preparando: { label: 'Preparando', variant: 'blue' },
    separada: { label: 'Separado', variant: 'green' },
    en_transito: { label: 'En tránsito', variant: 'blue' },
    recibida: { label: 'Recibido', variant: 'green' },
    rechazada: { label: 'Rechazado', variant: 'red' },
    cancelada: { label: 'Cancelado', variant: 'gray' },
};

/** Lo que pide una línea, en una frase: "2 rollos de 50 m", "30 m", "5 Caja". */
export const pedidoTexto = (d) => {
    if (d.modo === 'rollos') {
        const n = Number(d.rollos_pedidos) || 0;
        return `${num(n)} rollo${n === 1 ? '' : 's'}${d.metros_por_rollo ? ` de ${num(d.metros_por_rollo)} m` : ''}`;
    }
    if (d.modo === 'metros') return `${num(d.metros_pedidos)} m`;
    return `${num(d.cantidad)} ${d.presentacion ?? ''}`.trim();
};

const fechaHora = (v) => (v ? new Date(v).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' }) : '—');


/**
 * Requerimientos de traslado: lo que MI almacén le pide a otro. El almacén pedido lo atiende (escanea, separa,
 * despacha) desde "Atender requerimientos"; al despacharse se vuelve un traslado en tránsito que aquí se recibe.
 */
export default function Requerimientos() {
    const toast = useToast();
    const navigate = useNavigate();
    const { puede } = useAuth();
    const { propioId, superAdmin } = useAlmacenPropio();

    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [detalle, setDetalle] = useState(null);
    const [pdf, setPdf] = useState(null);

    const cargar = useCallback(async () => {
        setLoading(true);
        try {
            setRows(asList(await api.get('/transferencias/requerimientos', { params: { rol: 'pedidos' } })));
        } catch {
            toast.error('No se pudieron cargar los requerimientos.');
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        cargar();
    }, [cargar]);

    const recibir = async (r) => {
        try {
            await api.post(`/transferencias/${r.id}/recibir`);
            toast.success(`${r.requerimiento} recibido: el stock ya está en tu almacén.`);
            cargar();
        } catch (err) {
            toast.error(err.response?.data?.message ?? 'No se pudo recibir.');
        }
    };

    const anular = async (r) => {
        if (!window.confirm(`¿Cancelar el requerimiento ${r.requerimiento}?`)) return;
        try {
            await api.post(`/transferencias/requerimientos/${r.id}/anular`);
            toast.success('Requerimiento cancelado.');
            cargar();
        } catch (err) {
            toast.error(err.response?.data?.message ?? 'No se pudo cancelar.');
        }
    };

    const columns = [
        {
            key: 'requerimiento',
            label: 'Requerimiento',
            width: '150px',
            render: (r) => <Badge variant="blue" className="whitespace-nowrap">{r.requerimiento}</Badge>,
        },
        { key: 'origen', label: 'Se pide a', getSearchValue: (r) => r.origen?.nombre ?? '', render: (r) => r.origen?.nombre ?? '—' },
        { key: 'destino', label: 'Pide', getSearchValue: (r) => r.destino?.nombre ?? '', render: (r) => r.destino?.nombre ?? '—' },
        {
            key: 'productos',
            label: 'Productos',
            getSearchValue: (r) => r.detalles.map((d) => d.producto).join(' '),
            render: (r) => (
                <span className="text-sm text-warm-700">
                    {r.detalles.map((d) => `${d.producto}${d.color ? ` ${d.color}` : ''} · ${pedidoTexto(d)}`).join(' | ')}
                </span>
            ),
        },
        { key: 'fecha_solicitud', label: 'Fecha', width: '135px', render: (r) => fechaHora(r.fecha_solicitud) },
        {
            key: 'estado',
            label: 'Estado',
            width: '120px',
            render: (r) => <Badge variant={ESTADOS_RQ[r.estado]?.variant ?? 'gray'}>{ESTADOS_RQ[r.estado]?.label ?? r.estado}</Badge>,
        },
        {
            key: 'acciones',
            label: 'Acciones',
            type: 'actions',
            width: '150px',
            align: 'right',
            actions: (r) => (
                <>
                    {r.estado === 'en_transito' && puede('inventario.transferencias.editar') && (
                        <Button size="sm" onClick={() => recibir(r)}>
                            <PackageCheck className="h-4 w-4" /> Recibir
                        </Button>
                    )}
                    {r.guia && (
                        <button
                            type="button"
                            title={`Guía ${r.guia}`}
                            aria-label="Guía de traslado"
                            onClick={() => setPdf({ id: r.id, nombre: r.guia })}
                            className="rounded-md p-1.5 text-primary-600 transition hover:bg-primary-50"
                        >
                            <FileText className="h-4 w-4" />
                        </button>
                    )}
                    {['solicitada', 'preparando', 'separada'].includes(r.estado) && puede('inventario.transferencias.crear') && (
                        <button
                            type="button"
                            title="Cancelar requerimiento"
                            aria-label="Cancelar requerimiento"
                            onClick={() => anular(r)}
                            className="rounded-md p-1.5 text-red-600 transition hover:bg-red-50"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    )}
                </>
            ),
        },
    ];

    return (
        <Layout>
            <PageHeader
                title="Requerimientos de traslado"
                description="Pídele mercadería a otro almacén: ellos escanean, separan y despachan; tú la recibes aquí"
                actions={
                    puede('inventario.transferencias.crear') && (
                        <Button onClick={() => navigate('/requerimientos/nuevo')}>
                            <Plus className="h-4 w-4" /> Nuevo requerimiento
                        </Button>
                    )
                }
            />

            {!superAdmin && !propioId && (
                <Alert variant="warning" className="mb-4">No tienes un almacén asignado: pídele a un administrador que te asigne uno.</Alert>
            )}

            <DataTable
                columns={columns}
                rows={rows}
                loading={loading}
                searchPlaceholder="Buscar requerimiento…"
                emptyMessage="Aún no has pedido nada a otro almacén."
                onRowDoubleClick={setDetalle}
            />

            <DetalleModal r={detalle} onClose={() => setDetalle(null)} />

            <PdfViewerModal
                open={Boolean(pdf)}
                onClose={() => setPdf(null)}
                tipo="guia-traslado"
                id={pdf?.id}
                nombre={pdf?.nombre}
                titulo="Guía de traslado"
                formatos={['a4', 'ticket']}
            />
        </Layout>
    );
}

/** El requerimiento línea por línea, con los rollos que ya apartó el almacén. */
export function DetalleModal({ r, onClose }) {
    return (
        <Modal open={Boolean(r)} onClose={onClose} size="2xl" title={r ? `Requerimiento ${r.requerimiento}` : ''}>
            {r && (
                <div className="space-y-4 text-sm">
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-warm-700">
                        <span>Se pide a: <strong>{r.origen?.nombre}</strong></span>
                        <span>Pide: <strong>{r.destino?.nombre}</strong></span>
                        <span>Solicitó: <strong>{r.solicitante ?? '—'}</strong> · {fechaHora(r.fecha_solicitud)}</span>
                        <Badge variant={ESTADOS_RQ[r.estado]?.variant ?? 'gray'}>{ESTADOS_RQ[r.estado]?.label ?? r.estado}</Badge>
                        {r.guia && <span>Guía: <strong>{r.guia}</strong></span>}
                    </div>
                    {r.observaciones && <p className="rounded-md bg-gray-50 px-3 py-2 text-warm-600">{r.observaciones}</p>}
                    {r.motivo_rechazo && <Alert variant="error">Motivo: {r.motivo_rechazo}</Alert>}
                    <table className="w-full text-left">
                        <thead>
                            <tr className="border-b border-edge text-xs uppercase tracking-wide text-warm-500">
                                <th className="py-2">Producto</th>
                                <th className="py-2">Pedido</th>
                                <th className="py-2">Apartado / enviado</th>
                            </tr>
                        </thead>
                        <tbody>
                            {r.detalles.map((d) => (
                                <tr key={d.id} className="border-b border-edge/60 align-top">
                                    <td className="py-2 font-medium text-warm-900">{d.producto}{d.color ? ` · ${d.color}` : ''}</td>
                                    <td className="py-2">{pedidoTexto(d)}</td>
                                    <td className="py-2 text-warm-700">
                                        {d.rollos.length > 0
                                            ? d.rollos.map((x) => `${x.codigo} (${num(x.metros)} m${x.entero ? '' : ' corte'})`).join(', ')
                                            : d.modo === 'cantidad' && d.cantidad_enviada
                                              ? num(d.cantidad_enviada)
                                              : '—'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </Modal>
    );
}
