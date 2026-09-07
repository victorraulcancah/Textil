import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Ban,
    ClipboardList,
    Edit,
    FileText,
    Lock,
    PackageCheck,
    Printer,
    Receipt,
    Undo2,
} from 'lucide-react';
import api, { asList } from '../lib/api';
import { useToast } from '../lib/toast';
import Layout from '../components/Layout';
import PageHeader, { CreateButton } from '../components/PageHeader';
import PdfViewerModal from '../components/PdfViewerModal';
import BottomSheet, { useSheet } from '../components/ui/BottomSheet';
import DetalleCard from '../components/ui/DetalleCard';
import { Alert, Badge, Button, DataTable, Input, Modal, Select } from '../components/ui';

const num = (n) => new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 }).format(Number(n) || 0);
const money = (n) =>
    new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(Number(n) || 0);
const fecha = (v) => (v ? new Date(v).toLocaleDateString('es-PE') : '—');

const COLOR_ESTADO = {
    borrador: 'gray',
    separada: 'amber',
    en_preparacion: 'blue',
    despachada: 'blue',
    facturada: 'green',
    anulada: 'red',
};

const ESTADOS = [
    { value: '', label: 'Todos los estados' },
    { value: 'borrador', label: 'Borrador' },
    { value: 'separada', label: 'Separada' },
    { value: 'en_preparacion', label: 'En preparación' },
    { value: 'despachada', label: 'Despachada' },
    { value: 'facturada', label: 'Facturada' },
    { value: 'anulada', label: 'Anulada' },
];

/**
 * Pedidos: el recorrido desde que se toma hasta que se despacha.
 *
 * Ninguna acción de aquí mueve stock. Los rollos quedan apartados para el
 * cliente y el inventario se descuenta recién al emitir la nota de venta.
 */
export default function Pedidos() {
    const toast = useToast();
    const navigate = useNavigate();

    const [pedidos, setPedidos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [estado, setEstado] = useState('');

    const [seleccionado, setSeleccionado] = useState(null);
    const [detalle, setDetalle] = useState(null);
    const sheet = useSheet();

    const [pdf, setPdf] = useState(null);
    const [anular, setAnular] = useState(null);
    const [facturar, setFacturar] = useState(null);
    const [procesando, setProcesando] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const { data } = await api.get('/ordenes-venta', {
                params: estado ? { estado } : {},
            });
            const filas = asList({ data });
            setPedidos(filas);
            setSeleccionado((prev) => filas.find((p) => p.id === prev?.id) ?? filas[0] ?? null);
        } catch {
            setError('No se pudieron cargar los pedidos.');
        } finally {
            setLoading(false);
        }
    }, [estado]);

    useEffect(() => {
        load();
    }, [load]);

    // El listado no trae el detalle completo: se pide al elegir un pedido.
    useEffect(() => {
        if (!seleccionado) {
            setDetalle(null);
            return;
        }
        api.get(`/ordenes-venta/${seleccionado.id}`)
            .then(({ data }) => setDetalle(data?.data ?? data))
            .catch(() => setDetalle(null));
    }, [seleccionado]);

    /** Ejecuta una acción del recorrido y refresca. */
    const accion = async (pedido, ruta, mensaje) => {
        setProcesando(true);
        try {
            const { data } = await api.post(`/ordenes-venta/${pedido.id}/${ruta}`);
            toast.success(mensaje);
            await load();
            setDetalle(data?.data ?? data);
        } catch (err) {
            toast.error(err.response?.data?.message ?? 'No se pudo completar la acción.');
        } finally {
            setProcesando(false);
        }
    };

    const columnas = [
        {
            key: 'documento',
            label: 'Pedido',
            render: (row) => (
                <span className="inline-flex items-center gap-2 font-medium text-warm-900">
                    <ClipboardList className="h-4 w-4 shrink-0 text-primary-600" />
                    {row.documento}
                </span>
            ),
        },
        { key: 'cliente', label: 'Cliente', render: (row) => row.cliente ?? 'Cliente varios' },
        {
            key: 'fecha_emision',
            label: 'Fecha',
            render: (row) => fecha(row.fecha_emision),
        },
        {
            key: 'total_rollos',
            label: 'Rollos',
            align: 'right',
            searchable: false,
            render: (row) => row.total_rollos ?? 0,
        },
        {
            key: 'total_metros',
            label: 'Metros',
            align: 'right',
            searchable: false,
            render: (row) => `${num(row.total_metros)} m`,
        },
        {
            key: 'total',
            label: 'Total',
            align: 'right',
            searchable: false,
            render: (row) => money(row.total),
        },
        {
            key: 'estado',
            label: 'Estado',
            render: (row) => (
                <span className="inline-flex items-center gap-2">
                    <Badge variant={COLOR_ESTADO[row.estado] ?? 'gray'}>{row.estado_label}</Badge>
                    {row.estado === 'en_preparacion' && (
                        <span className="text-xs text-warm-500">
                            {row.verificados}/{row.total_rollos} escaneados
                        </span>
                    )}
                </span>
            ),
        },
        { key: 'requerimiento_numero', label: 'Requerimiento', render: (row) => row.requerimiento_numero ?? '—' },
        {
            type: 'actions',
            key: 'actions',
            label: 'Acciones',
            actions: (row) => (
                <>
                    <button
                        aria-label="Imprimir"
                        title="Imprimir el pedido"
                        onClick={() => setPdf({ tipo: 'orden-venta', id: row.id, nombre: row.documento, titulo: 'Pedido' })}
                        className="rounded-md p-1.5 text-primary-600 transition hover:bg-primary-50 hover:text-primary-700"
                    >
                        <Printer className="h-4 w-4" />
                    </button>
                    {row.editable && (
                        <button
                            aria-label="Editar"
                            onClick={() => navigate(`/pedidos/${row.id}/editar`)}
                            className="rounded-md p-1.5 text-primary-600 transition hover:bg-primary-50 hover:text-primary-700"
                        >
                            <Edit className="h-4 w-4" />
                        </button>
                    )}
                    {row.transiciones?.includes('anulada') && (
                        <button
                            aria-label="Anular"
                            onClick={() => setAnular(row)}
                            className="rounded-md p-1.5 text-red-600 transition hover:bg-red-50 hover:text-red-700"
                        >
                            <Ban className="h-4 w-4" />
                        </button>
                    )}
                </>
            ),
        },
    ];

    const filtros = (
        <div className="flex flex-wrap items-end gap-3">
            <Select
                label="Estado"
                value={estado}
                onChange={(e) => setEstado(e.target.value)}
                options={ESTADOS}
                className="w-52"
            />
            {estado && (
                <Button variant="ghost" size="sm" onClick={() => setEstado('')}>
                    Limpiar
                </Button>
            )}
        </div>
    );

    return (
        <Layout>
            <PageHeader
                title="Pedidos"
                description="Reservan la tela para el cliente; el stock se descuenta con la nota de venta"
                actions={<CreateButton onClick={() => navigate('/pedidos/nuevo')}>Nuevo pedido</CreateButton>}
            />

            {error && <Alert variant="error" className="mb-4">{error}</Alert>}

            <DataTable
                columns={columnas}
                rows={pedidos}
                loading={loading}
                searchPlaceholder="Buscar pedido o cliente..."
                filterable
                filters={filtros}
                filterCount={estado ? 1 : 0}
                onRowClick={(row) => {
                    setSeleccionado(row);
                    sheet.abrir();
                }}
                rowClassName={(row) => (row.id === seleccionado?.id ? 'bg-primary-50/60' : '')}
            />

            {/* Detalle del pedido elegido: los rollos y los pasos que faltan */}
            <div className="mt-6 hidden md:block">
                {detalle ? (
                    <DetallePedido
                        pedido={detalle}
                        procesando={procesando}
                        onAccion={accion}
                        onFacturar={() => setFacturar(detalle)}
                        onPdf={setPdf}
                    />
                ) : (
                    <p className="rounded-lg border border-dashed border-edge py-10 text-center text-sm text-warm-400">
                        Elige un pedido para ver sus rollos.
                    </p>
                )}
            </div>

            <BottomSheet
                open={sheet.abierto}
                onClose={sheet.cerrar}
                title={detalle?.documento ?? 'Pedido'}
                subtitle={detalle ? `${detalle.estado_label} · ${num(detalle.total_metros)} m` : null}
            >
                <div className="space-y-3">
                    {(detalle?.detalles ?? []).map((d) => (
                        <DetalleCard
                            key={d.id}
                            titulo={d.rollo?.codigo}
                            subtitulo={d.rollo?.color?.nombre}
                            campos={[
                                { label: 'Metros', value: `${num(d.metros)} m` },
                                { label: 'P. unit.', value: money(d.precio_unitario) },
                                { label: 'Importe', value: money(d.subtotal) },
                            ]}
                            columnas={3}
                        />
                    ))}
                </div>
            </BottomSheet>

            <AnularModal
                pedido={anular}
                onClose={() => setAnular(null)}
                onAnulado={() => {
                    setAnular(null);
                    load();
                }}
            />

            <FacturarModal
                pedido={facturar}
                onClose={() => setFacturar(null)}
                onFacturado={(nota) => {
                    setFacturar(null);
                    toast.success(`Nota de venta ${nota.serie}-${nota.numero} emitida.`);
                    load();
                }}
            />

            <PdfViewerModal
                open={Boolean(pdf)}
                onClose={() => setPdf(null)}
                tipo={pdf?.tipo}
                id={pdf?.id}
                nombre={pdf?.nombre}
                titulo={pdf?.titulo ?? 'Documento'}
            />
        </Layout>
    );
}

/* ---------------------------------------------------------------------- */

/** El pedido abierto: sus rollos y el botón del siguiente paso. */
function DetallePedido({ pedido, procesando, onAccion, onFacturar, onPdf }) {
    const puede = (estado) => pedido.transiciones?.includes(estado);

    return (
        <div className="rounded-lg border border-edge bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-edge px-4 py-3">
                <div className="min-w-0">
                    <h2 className="text-sm font-semibold text-warm-900">
                        {pedido.documento}
                        <Badge variant={COLOR_ESTADO[pedido.estado] ?? 'gray'} className="ml-2">
                            {pedido.estado_label}
                        </Badge>
                    </h2>
                    <p className="text-xs text-warm-500">
                        {pedido.cliente ?? 'Cliente varios'} · {pedido.detalles?.length ?? 0} rollos ·{' '}
                        {num(pedido.total_metros)} m · {money(pedido.total)}
                        {pedido.requerimiento_numero && ` · ${pedido.requerimiento_numero}`}
                    </p>
                </div>

                {/* Cada estado ofrece solo su paso siguiente: mostrar todas las
                    transiciones posibles confundía —"Separar tela" seguía a la
                    vista con el pedido ya en preparación, cuando ahí sería un
                    retroceso, no el paso que toca. */}
                <div className="flex flex-wrap items-center gap-2">
                    {pedido.estado === 'borrador' && puede('separada') && (
                        <Button size="sm" loading={procesando} onClick={() => onAccion(pedido, 'separar', 'Tela separada para el cliente.')}>
                            <Lock className="h-4 w-4" />
                            Separar tela
                        </Button>
                    )}
                    {pedido.estado === 'separada' && (
                        <>
                            <Button size="sm" loading={procesando} onClick={() => onAccion(pedido, 'preparar', 'Requerimiento enviado al almacén.')}>
                                <PackageCheck className="h-4 w-4" />
                                Enviar al almacén
                            </Button>
                            <Button variant="secondary" size="sm" loading={procesando} onClick={() => onAccion(pedido, 'devolver', 'Los rollos volvieron a estar disponibles.')}>
                                <Undo2 className="h-4 w-4" />
                                Devolver a borrador
                            </Button>
                        </>
                    )}
                    {pedido.requerimiento_numero && (
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => onPdf({ tipo: 'requerimiento-almacen', id: pedido.id, nombre: pedido.requerimiento_numero, titulo: 'Requerimiento de almacén' })}
                        >
                            <FileText className="h-4 w-4" />
                            Requerimiento
                        </Button>
                    )}
                    {pedido.estado === 'despachada' && puede('facturada') && (
                        <Button size="sm" onClick={onFacturar}>
                            <Receipt className="h-4 w-4" />
                            Emitir nota de venta
                        </Button>
                    )}
                </div>
            </div>

            {pedido.estado === 'en_preparacion' && (
                <div className="border-b border-edge bg-blue-50/60 px-4 py-2 text-xs text-blue-800">
                    El almacén está preparando este pedido. El despacho se confirma desde
                    Preparación y despacho, escaneando cada rollo.
                </div>
            )}

            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-edge text-left text-xs uppercase tracking-wide text-warm-500">
                            <th className="px-4 py-2 font-medium">Rollo</th>
                            <th className="px-4 py-2 font-medium">Color</th>
                            <th className="px-4 py-2 font-medium">Presentación</th>
                            <th className="px-4 py-2 text-right font-medium">Metros</th>
                            <th className="px-4 py-2 text-right font-medium">P. unit.</th>
                            <th className="px-4 py-2 text-right font-medium">Importe</th>
                        </tr>
                    </thead>
                    <tbody>
                        {(pedido.detalles ?? []).map((d) => (
                            <tr key={d.id} className="border-b border-gray-100 last:border-0">
                                <td className="px-4 py-2 font-medium text-warm-900">
                                    {d.rollo?.codigo}
                                    {d.es_parcial && (
                                        <Badge variant="amber" className="ml-2">Se corta</Badge>
                                    )}
                                    {d.escaneado && (
                                        <Badge variant="green" className="ml-2">Escaneado</Badge>
                                    )}
                                </td>
                                <td className="px-4 py-2 text-warm-600">{d.rollo?.color?.nombre ?? '—'}</td>
                                <td className="px-4 py-2 text-warm-600">{d.presentacion ?? '—'}</td>
                                <td className="px-4 py-2 text-right">{num(d.metros)} m</td>
                                <td className="px-4 py-2 text-right">{money(d.precio_unitario)}</td>
                                <td className="px-4 py-2 text-right font-medium">{money(d.subtotal)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function AnularModal({ pedido, onClose, onAnulado }) {
    const toast = useToast();
    const [motivo, setMotivo] = useState('');
    const [guardando, setGuardando] = useState(false);

    useEffect(() => {
        if (pedido) setMotivo('');
    }, [pedido]);

    const anular = async () => {
        setGuardando(true);
        try {
            await api.post(`/ordenes-venta/${pedido.id}/anular`, { motivo });
            toast.success('Pedido anulado; los rollos volvieron al stock.');
            onAnulado();
        } catch (err) {
            toast.error(err.response?.data?.message ?? 'No se pudo anular el pedido.');
        } finally {
            setGuardando(false);
        }
    };

    return (
        <Modal
            open={Boolean(pedido)}
            onClose={onClose}
            title="Anular pedido"
            description={`Se anulará ${pedido?.documento ?? ''} y sus rollos volverán a estar disponibles.`}
            size="sm"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>Cancelar</Button>
                    <Button variant="danger" loading={guardando} disabled={motivo.trim().length < 3} onClick={anular}>
                        Anular
                    </Button>
                </>
            }
        >
            <Input
                label="Motivo"
                placeholder="El cliente ya no lo quiere"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
            />
        </Modal>
    );
}

/**
 * Emitir la nota de venta del pedido despachado. Aquí sí se descuenta el
 * stock, así que se pide cómo paga el cliente, igual que en mostrador.
 */
function FacturarModal({ pedido, onClose, onFacturado }) {
    const toast = useToast();
    const [forma, setForma] = useState('efectivo');
    const [tipoPago, setTipoPago] = useState('contado');
    const [guardando, setGuardando] = useState(false);

    useEffect(() => {
        if (pedido) {
            setForma('efectivo');
            setTipoPago('contado');
        }
    }, [pedido]);

    const emitir = async () => {
        setGuardando(true);
        try {
            const { data } = await api.post(`/ordenes-venta/${pedido.id}/facturar`, {
                tipo_pago: tipoPago,
                pagos: [
                    {
                        forma_pago: tipoPago === 'credito' ? 'credito' : forma,
                        monto: pedido.total,
                        fecha: new Date().toISOString().slice(0, 10),
                    },
                ],
            });
            onFacturado(data?.data ?? data);
        } catch (err) {
            toast.error(err.response?.data?.message ?? 'No se pudo emitir la nota de venta.');
        } finally {
            setGuardando(false);
        }
    };

    return (
        <Modal
            open={Boolean(pedido)}
            onClose={onClose}
            title="Emitir nota de venta"
            description={`${pedido?.documento ?? ''} · ${money(pedido?.total)}`}
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>Cancelar</Button>
                    <Button loading={guardando} onClick={emitir}>Emitir y descontar stock</Button>
                </>
            }
        >
            <div className="space-y-4">
                <Alert variant="warning">
                    Este es el paso que descuenta el inventario y registra el cobro. Los rollos
                    que salen enteros quedan como vendidos; de los que se cortan, el saldo vuelve
                    al stock con su mismo código.
                </Alert>

                <div className="grid gap-4 sm:grid-cols-2">
                    <Select
                        label="Tipo de pago"
                        value={tipoPago}
                        onChange={(e) => setTipoPago(e.target.value)}
                        options={[
                            { value: 'contado', label: 'Contado' },
                            { value: 'credito', label: 'Crédito' },
                        ]}
                    />
                    {tipoPago === 'contado' && (
                        <Select
                            label="Forma de pago"
                            value={forma}
                            onChange={(e) => setForma(e.target.value)}
                            options={[
                                { value: 'efectivo', label: 'Efectivo' },
                                { value: 'transferencia', label: 'Transferencia' },
                                { value: 'billetera', label: 'Billetera digital' },
                            ]}
                        />
                    )}
                </div>
            </div>
        </Modal>
    );
}
