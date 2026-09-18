import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Ban,
    ClipboardList,
    Edit,
    FileText,
    PackageCheck,
    Plus,
    Printer,
    Receipt,
    Trash2,
    Undo2,
} from 'lucide-react';
import api, { asList } from '../lib/api';
import { useToast } from '../lib/toast';
import Layout from '../components/Layout';
import PageHeader, { CreateButton } from '../components/PageHeader';
import PdfViewerModal from '../components/PdfViewerModal';
import MetodoCajaPicker from '../components/MetodoCajaPicker';
import BottomSheet, { useSheet } from '../components/ui/BottomSheet';
import DetalleCard from '../components/ui/DetalleCard';
import { Alert, Badge, Button, DataTable, DateRangePicker, Input, Modal, SearchSelect, Select } from '../components/ui';

const num = (n) => new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 }).format(Number(n) || 0);
const money = (n) =>
    new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(Number(n) || 0);
// Una fecha sin hora ("2026-09-18") se interpreta como UTC y en Perú se
// mostraría el día anterior: se le fija la medianoche local.
const fecha = (v) => (v ? new Date(String(v).length === 10 ? `${v}T00:00:00` : v).toLocaleDateString('es-PE') : '—');

const COLOR_ESTADO = {
    borrador: 'gray',
    solicitado: 'amber',
    preparando: 'blue',
    separado: 'blue',
    despachado: 'blue',
    facturado: 'green',
    anulado: 'red',
};

const ESTADOS = [
    { value: '', label: 'Todos los estados' },
    { value: 'borrador', label: 'Borrador' },
    { value: 'solicitado', label: 'Solicitado' },
    { value: 'preparando', label: 'Preparando' },
    { value: 'separado', label: 'Separado' },
    { value: 'despachado', label: 'Despachado' },
    { value: 'facturado', label: 'Facturado' },
    { value: 'anulado', label: 'Anulado' },
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
    /** Cliente, almacén, fecha y requerimiento: no valen la pena pedirlos al
        backend, se filtran entre los pedidos ya cargados. */
    const [fCliente, setFCliente] = useState('');
    const [fAlmacen, setFAlmacen] = useState('');
    const [fVendedor, setFVendedor] = useState('');
    const [fDesde, setFDesde] = useState('');
    const [fHasta, setFHasta] = useState('');
    const [fRequerimiento, setFRequerimiento] = useState('');

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
        { key: 'almacen', label: 'Almacén', render: (row) => row.almacen ?? '—' },
        { key: 'vendedor', label: 'Vendedor', render: (row) => row.vendedor ?? '—' },
        {
            key: 'total_lineas',
            label: 'Productos',
            align: 'right',
            searchable: false,
            render: (row) => row.total_lineas ?? 0,
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
                    {row.estado === 'preparando' && (
                        <span className="text-xs text-warm-500">
                            {num(row.metros_asignados)}/{num(row.total_metros)} m cubiertos
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
                    {row.transiciones?.includes('anulado') && (
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

    /** Solo los clientes y almacenes que de verdad aparecen en el listado. */
    const clientesPresentes = [...new Set(pedidos.map((p) => p.cliente).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, 'es'))
        .map((nombre) => ({ value: nombre, label: nombre }));
    const almacenesPresentes = [
        ...new Map(pedidos.filter((p) => p.almacen_id).map((p) => [String(p.almacen_id), p.almacen])).entries(),
    ].map(([value, label]) => ({ value, label }));
    const vendedoresPresentes = [
        ...new Map(pedidos.filter((p) => p.vendedor_id).map((p) => [String(p.vendedor_id), p.vendedor])).entries(),
    ].map(([value, label]) => ({ value, label }));
    const requerimientosPresentes = [...new Set(pedidos.map((p) => p.requerimiento_numero).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, 'es'))
        .map((num_) => ({ value: num_, label: num_ }));

    const filtrosActivos =
        (estado ? 1 : 0) +
        (fCliente ? 1 : 0) +
        (fAlmacen ? 1 : 0) +
        (fVendedor ? 1 : 0) +
        (fDesde ? 1 : 0) +
        (fHasta ? 1 : 0) +
        (fRequerimiento ? 1 : 0);

    const limpiarTodo = () => {
        setEstado('');
        setFCliente('');
        setFAlmacen('');
        setFVendedor('');
        setFDesde('');
        setFHasta('');
        setFRequerimiento('');
    };

    const filtros = (
        <div className="flex flex-wrap items-end gap-3">
            <Select
                label="Estado"
                value={estado}
                onChange={(e) => setEstado(e.target.value)}
                options={ESTADOS}
                className="w-52"
            />
            <SearchSelect
                label="Cliente"
                value={fCliente}
                onChange={(v) => setFCliente(v ?? '')}
                placeholder="Todos"
                emptyText="Sin coincidencias"
                options={clientesPresentes}
                className="w-56"
            />
            <SearchSelect
                label="Almacén"
                value={fAlmacen}
                onChange={(v) => setFAlmacen(v ?? '')}
                placeholder="Todos"
                emptyText="Sin coincidencias"
                options={almacenesPresentes}
                className="w-56"
            />
            <SearchSelect
                label="Vendedor"
                value={fVendedor}
                onChange={(v) => setFVendedor(v ?? '')}
                placeholder="Todos"
                emptyText="Sin coincidencias"
                options={vendedoresPresentes}
                className="w-56"
            />
            <SearchSelect
                label="Requerimiento"
                value={fRequerimiento}
                onChange={(v) => setFRequerimiento(v ?? '')}
                placeholder="Todos"
                emptyText="Sin coincidencias"
                options={requerimientosPresentes}
                className="w-48"
            />
            <DateRangePicker
                label="Rango de fecha"
                desde={fDesde}
                hasta={fHasta}
                onChange={(d, h) => {
                    setFDesde(d);
                    setFHasta(h);
                }}
                className="w-full"
            />
            {filtrosActivos > 0 && (
                <Button variant="ghost" size="sm" onClick={limpiarTodo}>
                    Limpiar
                </Button>
            )}
        </div>
    );

    const pedidosFiltrados = pedidos.filter((p) => {
        if (fCliente && p.cliente !== fCliente) return false;
        if (fAlmacen && String(p.almacen_id) !== String(fAlmacen)) return false;
        if (fVendedor && String(p.vendedor_id) !== String(fVendedor)) return false;
        if (fRequerimiento && p.requerimiento_numero !== fRequerimiento) return false;
        if (fDesde && (!p.fecha_emision || p.fecha_emision < fDesde)) return false;
        if (fHasta && (!p.fecha_emision || p.fecha_emision > fHasta)) return false;
        return true;
    });

    return (
        <Layout>
            <PageHeader
                title="Pedidos"
                description="Reservan la tela para el cliente al solicitarse; el stock se descuenta al despachar"
                actions={<CreateButton onClick={() => navigate('/pedidos/nuevo')}>Nuevo pedido</CreateButton>}
            />

            {error && <Alert variant="error" className="mb-4">{error}</Alert>}

            <DataTable
                columns={columnas}
                rows={pedidosFiltrados}
                loading={loading}
                searchPlaceholder="Buscar pedido o cliente..."
                filterable
                filters={filtros}
                filterCount={filtrosActivos}
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
                open={sheet.open && Boolean(detalle)}
                onClose={sheet.cerrar}
                title={detalle?.documento ?? 'Pedido'}
                subtitle={detalle ? `${detalle.estado_label} · ${detalle.detalles?.length ?? 0} producto(s)` : null}
            >
                {detalle && (
                    <div className="space-y-3">
                        {/* El mismo siguiente paso que en escritorio: cada estado
                            ofrece solo su propia transición. */}
                        <div className="flex flex-wrap items-center gap-2">
                            {detalle.estado === 'borrador' && detalle.transiciones?.includes('solicitado') && (
                                <Button size="sm" loading={procesando} onClick={() => accion(detalle, 'solicitar', 'Pedido solicitado al almacén: el stock quedó reservado.')}>
                                    <PackageCheck className="h-4 w-4" />
                                    Solicitar al almacén
                                </Button>
                            )}
                            {detalle.estado === 'solicitado' && (
                                <Button variant="secondary" size="sm" loading={procesando} onClick={() => accion(detalle, 'devolver', 'Los rollos volvieron a estar disponibles.')}>
                                    <Undo2 className="h-4 w-4" />
                                    Devolver a borrador
                                </Button>
                            )}
                            {detalle.requerimiento_numero && (
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => setPdf({ tipo: 'requerimiento-almacen', id: detalle.id, nombre: detalle.requerimiento_numero, titulo: 'Requerimiento de almacén' })}
                                >
                                    <FileText className="h-4 w-4" />
                                    Requerimiento
                                </Button>
                            )}
                            {detalle.estado === 'despachado' && detalle.transiciones?.includes('facturado') && (
                                <Button size="sm" onClick={() => setFacturar(detalle)}>
                                    <Receipt className="h-4 w-4" />
                                    Emitir nota de venta
                                </Button>
                            )}
                        </div>

                        {(detalle.detalles ?? []).map((d) => (
                            <DetalleCard
                                key={d.id}
                                titulo={d.producto}
                                subtitulo={d.presentacion}
                                campos={[
                                    { label: 'Cant.', value: `${num(d.cantidad)} (${num(d.metros)} m)` },
                                    { label: 'Cubierto', value: `${num(d.metros_asignados)} m` },
                                    { label: 'P. unit.', value: money(d.precio_unitario) },
                                    { label: 'Importe', value: money(d.subtotal), valueClassName: 'text-primary-600' },
                                ]}
                            />
                        ))}
                    </div>
                )}
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
                        {pedido.cliente ?? 'Cliente varios'} · {pedido.detalles?.length ?? 0} producto(s) ·{' '}
                        {num(pedido.total_metros)} m · {money(pedido.total)}
                        {pedido.requerimiento_numero && ` · ${pedido.requerimiento_numero}`}
                    </p>
                </div>

                {/* Cada estado ofrece solo su paso siguiente: mostrar todas las
                    transiciones posibles confundía —"Separar tela" seguía a la
                    vista con el pedido ya en preparación, cuando ahí sería un
                    retroceso, no el paso que toca. */}
                <div className="flex flex-wrap items-center gap-2">
                    {/* El vendedor solo solicita. Preparar, separar y despachar
                        es trabajo del almacenero, desde su propia bandeja. */}
                    {pedido.estado === 'borrador' && puede('solicitado') && (
                        <Button size="sm" loading={procesando} onClick={() => onAccion(pedido, 'solicitar', 'Pedido solicitado al almacén: el stock quedó reservado.')}>
                            <PackageCheck className="h-4 w-4" />
                            Solicitar al almacén
                        </Button>
                    )}
                    {pedido.estado === 'solicitado' && (
                        <Button variant="secondary" size="sm" loading={procesando} onClick={() => onAccion(pedido, 'devolver', 'Los rollos volvieron a estar disponibles.')}>
                            <Undo2 className="h-4 w-4" />
                            Devolver a borrador
                        </Button>
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
                    {pedido.estado === 'despachado' && puede('facturado') && (
                        <Button size="sm" onClick={onFacturar}>
                            <Receipt className="h-4 w-4" />
                            Emitir nota de venta
                        </Button>
                    )}
                </div>
            </div>

            {pedido.estado === 'solicitado' && (
                <div className="border-b border-edge bg-amber-50/70 px-4 py-2 text-xs text-amber-800">
                    La solicitud está en la bandeja del almacén, esperando a que la atiendan.
                    Todavía no hay rollos apartados: los elige el almacenero al prepararla.
                </div>
            )}

            {pedido.estado === 'preparando' && (
                <div className="border-b border-edge bg-blue-50/60 px-4 py-2 text-xs text-blue-800">
                    El almacén está juntando los rollos. Cuando cubra todos los metros dará el
                    pedido por separado.
                </div>
            )}

            {pedido.estado === 'separado' && (
                <div className="border-b border-edge bg-blue-50/60 px-4 py-2 text-xs text-blue-800">
                    Los rollos están apartados y verificados en el almacén, listos para salir.
                </div>
            )}

            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="bg-primary-600 text-left text-xs font-semibold uppercase tracking-wide text-white">
                            <th className="px-4 py-2.5">Producto</th>
                            <th className="px-4 py-2.5">Presentación</th>
                            <th className="px-4 py-2.5 text-right">Cantidad</th>
                            <th className="px-4 py-2.5">Cubierto por</th>
                            <th className="px-4 py-2.5 text-right">P. unit.</th>
                            <th className="px-4 py-2.5 text-right">Importe</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {(pedido.detalles ?? []).map((d) => (
                            <tr key={d.id} className="align-top transition hover:bg-gray-50">
                                <td className="px-4 py-2 font-medium text-warm-900">
                                    {d.producto}
                                    {d.descripcion && (
                                        <span className="block text-xs font-normal text-warm-500">
                                            {d.descripcion}
                                        </span>
                                    )}
                                </td>
                                <td className="px-4 py-2 text-warm-600">{d.presentacion ?? '—'}</td>
                                <td className="px-4 py-2 text-right">
                                    {num(d.cantidad)}
                                    <span className="block text-xs text-warm-400">{num(d.metros)} m</span>
                                </td>
                                {/* Los rollos que el almacén fue asignando a esta línea. */}
                                <td className="px-4 py-2">
                                    {d.rollos?.length ? (
                                        <span className="space-y-0.5">
                                            {d.rollos.map((r) => (
                                                <span key={r.id} className="block text-xs">
                                                    <span className="font-mono text-warm-900">{r.codigo}</span>
                                                    <span className="text-warm-500"> · {num(r.metros)} m</span>
                                                    {r.es_parcial && (
                                                        <Badge variant="amber" className="ml-1">Se corta</Badge>
                                                    )}
                                                </span>
                                            ))}
                                            {!d.cubierta && (
                                                <span className="block text-xs text-amber-600">
                                                    Faltan {num(d.metros_pendientes)} m
                                                </span>
                                            )}
                                        </span>
                                    ) : (
                                        <span className="text-xs text-warm-400">Sin asignar</span>
                                    )}
                                </td>
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
 * Emitir la nota de venta del pedido despachado. La tela ya salió al
 * despachar; aquí se registra la venta y cómo paga el cliente.
 */
const emptyPago = () => ({ tipo: 'efectivo', cuentaId: '', billeteraId: '', monto: '' });

function FacturarModal({ pedido, onClose, onFacturado }) {
    const toast = useToast();
    const [tipoPago, setTipoPago] = useState('contado');
    const [pagos, setPagos] = useState([emptyPago()]);
    /** Off = un solo método que cubre el total (el caso normal). On = varios métodos. */
    const [mixto, setMixto] = useState(false);
    const [cuentas, setCuentas] = useState([]);
    const [billeteras, setBilleteras] = useState([]);
    const [guardando, setGuardando] = useState(false);

    const total = Number(pedido?.total) || 0;

    useEffect(() => {
        if (!pedido) return;
        setTipoPago('contado');
        setPagos([emptyPago()]);
        setMixto(false);
        Promise.all([api.get('/cuentas-bancarias'), api.get('/billeteras-digitales')])
            .then(([cuentasRes, billeterasRes]) => {
                setCuentas(asList(cuentasRes));
                setBilleteras(asList(billeterasRes));
            })
            .catch(() => {
                setCuentas([]);
                setBilleteras([]);
            });
    }, [pedido]);

    const setPago = (i, patch) =>
        setPagos((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
    const addPago = () => setPagos((prev) => [...prev, emptyPago()]);
    const removePago = (i) =>
        setPagos((prev) => (prev.length === 1 ? prev : prev.filter((_, idx) => idx !== i)));

    const alternarMixto = () => {
        setMixto((prev) => {
            if (!prev && !Number(pagos[0].monto)) {
                setPagos((ps) => ps.map((p, i) => (i === 0 ? { ...p, monto: String(total) } : p)));
            }
            if (prev) setPagos((ps) => ps.slice(0, 1));
            return !prev;
        });
    };

    /** En modo simple hay un solo pago que cubre el total. */
    const pagosEfectivos = mixto ? pagos : [{ ...pagos[0], monto: String(total) }];
    const pagado = pagosEfectivos.reduce((acc, p) => acc + (Number(p.monto) || 0), 0);
    const saldo = total - pagado;
    const esContado = tipoPago === 'contado';

    const emitir = async () => {
        if (esContado && mixto && Math.abs(saldo) > 0.001) {
            return toast.error('Los pagos deben sumar exactamente el total.');
        }
        setGuardando(true);
        try {
            const { data } = await api.post(`/ordenes-venta/${pedido.id}/facturar`, {
                tipo_pago: tipoPago,
                pagos: esContado
                    ? pagosEfectivos
                          .filter((p) => p.tipo && Number(p.monto) > 0)
                          .map((p) => ({
                              forma_pago: p.tipo,
                              cuenta_bancaria_id: p.tipo === 'transferencia' ? p.cuentaId || null : null,
                              billetera_id: p.tipo === 'billetera' ? p.billeteraId || null : null,
                              monto: Number(p.monto),
                              fecha: new Date().toISOString().slice(0, 10),
                          }))
                    : [{ forma_pago: 'credito', monto: total, fecha: new Date().toISOString().slice(0, 10) }],
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
                    <Button loading={guardando} onClick={emitir}>Emitir nota de venta</Button>
                </>
            }
        >
            <div className="space-y-4">
                <Alert variant="warning">
                    La tela ya salió del almacén al despachar. Este paso registra la venta y el
                    cobro; los rollos que salieron enteros quedan como vendidos a nombre del cliente.
                </Alert>

                <div className="flex items-center justify-between gap-3">
                    <Select
                        label="Tipo de pago"
                        value={tipoPago}
                        onChange={(e) => setTipoPago(e.target.value)}
                        options={[
                            { value: 'contado', label: 'Contado' },
                            { value: 'credito', label: 'Crédito' },
                        ]}
                        className="flex-1"
                    />
                    {esContado && (
                        <button
                            type="button"
                            role="switch"
                            aria-checked={mixto}
                            onClick={alternarMixto}
                            className="mt-5 inline-flex shrink-0 items-center gap-2 text-xs font-semibold text-warm-500 transition hover:text-warm-900"
                        >
                            Pago mixto
                            <span className={`relative block h-5 w-9 rounded-full transition ${mixto ? 'bg-primary-600' : 'bg-gray-300'}`}>
                                <span className={`absolute top-0.5 block h-4 w-4 rounded-full bg-white shadow transition-all ${mixto ? 'left-[1.125rem]' : 'left-0.5'}`} />
                            </span>
                        </button>
                    )}
                </div>

                {esContado && !mixto && (
                    <div className="space-y-3">
                        <MetodoCajaPicker
                            cuentas={cuentas}
                            billeteras={billeteras}
                            tipo={pagos[0].tipo}
                            cuentaId={pagos[0].cuentaId}
                            billeteraId={pagos[0].billeteraId}
                            onChange={(m) => setPago(0, m)}
                        />
                        <div className="flex items-center justify-between rounded-lg bg-primary-50 px-3 py-2.5 text-sm">
                            <span className="text-warm-500">Se cobra el total</span>
                            <span className="font-bold text-primary-700">{money(total)}</span>
                        </div>
                    </div>
                )}

                {esContado && mixto && (
                    <>
                        <div className="space-y-3">
                            {pagos.map((p, i) => (
                                <div key={i} className="rounded-lg border border-edge p-3">
                                    <MetodoCajaPicker
                                        cuentas={cuentas}
                                        billeteras={billeteras}
                                        tipo={p.tipo}
                                        cuentaId={p.cuentaId}
                                        billeteraId={p.billeteraId}
                                        onChange={(m) => setPago(i, m)}
                                    />
                                    <div className="mt-2 flex items-center gap-2">
                                        <Input
                                            type="number"
                                            min="0"
                                            step="any"
                                            placeholder="Monto"
                                            value={p.monto}
                                            onChange={(e) => setPago(i, { monto: e.target.value })}
                                            className="text-right"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => removePago(i)}
                                            disabled={pagos.length === 1}
                                            className="rounded-md p-2 text-red-600 transition hover:bg-red-50 disabled:opacity-40"
                                            aria-label="Quitar"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <Button type="button" variant="ghost" size="sm" onClick={addPago}>
                            <Plus className="h-4 w-4" /> Agregar pago
                        </Button>

                        <div className="flex justify-between border-t border-dashed border-edge pt-2 text-sm">
                            <span className="text-warm-500">Cobrado</span>
                            <span className="font-semibold text-green-600">{money(pagado)}</span>
                        </div>
                        {Math.abs(saldo) > 0.001 && (
                            <div className="flex justify-between text-sm">
                                <span className="text-warm-500">{saldo > 0 ? 'Falta cobrar' : 'Sobra'}</span>
                                <span className={saldo > 0 ? 'font-semibold text-amber-600' : 'font-semibold text-red-600'}>
                                    {money(Math.abs(saldo))}
                                </span>
                            </div>
                        )}
                    </>
                )}
            </div>
        </Modal>
    );
}
