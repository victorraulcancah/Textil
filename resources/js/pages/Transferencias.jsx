import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Ban, Edit, Inbox, ListChecks, Lock, PackageCheck, Printer, Repeat, ShieldCheck, ShieldX, Trash2 } from 'lucide-react';
import api, { asList } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import Layout from '../components/Layout';
import BottomSheet, { useSheet } from '../components/ui/BottomSheet';
import DetalleCard from '../components/ui/DetalleCard';
import PageHeader, { CreateButton } from '../components/PageHeader';
import PdfViewerModal from '../components/PdfViewerModal';
import { Alert, Badge, Button, DataTable, Input, Modal, SearchSelect, Select, Tabs } from '../components/ui';

const estadoInfo = {
    pendiente: { label: 'Pendiente', variant: 'amber' },
    en_transito: { label: 'En tránsito', variant: 'blue' },
    recibida: { label: 'Recibida', variant: 'green' },
    rechazada: { label: 'Rechazada', variant: 'red' },
    cancelada: { label: 'Cancelada', variant: 'red' },
};

const num = (n) => new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 }).format(Number(n) || 0);
const fecha = (f) => (f ? new Date(f).toLocaleDateString('es-PE') : '—');

/**
 * Lista de guías de traslado, su bandeja de solicitudes y el catálogo de
 * motivos. Crear y editar una guía viven en su propia vista (demasiados
 * campos para un modal): ver [[CrearTransferencia]].
 */
export default function Transferencias() {
    const toast = useToast();
    const navigate = useNavigate();
    const { puede } = useAuth();
    // Aprobar/rechazar es la bandeja de solicitudes: no todo el que crea una
    // guía puede autorizar que el stock salga del origen.
    const puedeAprobar = puede('inventario.transferencias.aprobar');
    const [transferencias, setTransferencias] = useState([]);
    const [almacenes, setAlmacenes] = useState([]);
    /** Catálogo administrable de motivos de traslado. */
    const [motivos, setMotivos] = useState([]);
    const [tab, setTab] = useState('guias');
    /** Modal de motivo: { editing: motivo|null } o null. */
    const [motivoModal, setMotivoModal] = useState(null);
    const [motivoForm, setMotivoForm] = useState({ nombre: '', activo: true });
    const [motivoSaving, setMotivoSaving] = useState(false);
    const [motivoDelete, setMotivoDelete] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const [actionId, setActionId] = useState(null);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [pdfTarget, setPdfTarget] = useState(null);
    const [deleting, setDeleting] = useState(false);

    /** Guía que se está por rechazar: pide un motivo antes de confirmar. */
    const [rechazarTarget, setRechazarTarget] = useState(null);
    const [motivoRechazo, setMotivoRechazo] = useState('');
    const [rechazando, setRechazando] = useState(false);

    /** Guía cuyo detalle se muestra en la segunda tabla. */
    const [seleccionada, setSeleccionada] = useState(null);
    const sheet = useSheet();

    const [filterEstado, setFilterEstado] = useState('');
    const [filterAlmacen, setFilterAlmacen] = useState('');
    const [activeFilters, setActiveFilters] = useState({});

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [transRes, almRes, motRes] = await Promise.all([
                api.get('/transferencias'),
                api.get('/almacenes'),
                api.get('/motivos-traslado'),
            ]);
            setMotivos(asList(motRes));
            const lista = asList(transRes);
            setTransferencias(lista);
            setSeleccionada((prev) => lista.find((t) => t.id === prev?.id) ?? lista[0] ?? null);
            setAlmacenes(asList(almRes));
        } catch {
            setError('No se pudieron cargar las guías de traslado.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const MOTIVO_LABEL = useMemo(() => Object.fromEntries(motivos.map((m) => [m.codigo, m.nombre])), [motivos]);

    // ── CRUD de motivos ──
    const abrirMotivo = (editing = null) => {
        setMotivoForm({ nombre: editing?.nombre ?? '', activo: editing?.activo ?? true });
        setMotivoModal({ editing });
    };

    const guardarMotivo = async (e) => {
        e?.preventDefault?.();
        if (!motivoForm.nombre.trim()) return toast.error('Ingresa el nombre del motivo.');
        setMotivoSaving(true);
        try {
            if (motivoModal.editing) {
                await api.put(`/motivos-traslado/${motivoModal.editing.id}`, motivoForm);
                toast.success('Motivo actualizado.');
            } else {
                await api.post('/motivos-traslado', motivoForm);
                toast.success('Motivo creado.');
            }
            const { data: lista } = await api.get('/motivos-traslado');
            setMotivos(asList({ data: lista }));
            setMotivoModal(null);
        } catch (err) {
            toast.error(err.response?.data?.errors?.nombre?.[0] ?? err.response?.data?.message ?? 'No se pudo guardar el motivo.');
        } finally {
            setMotivoSaving(false);
        }
    };

    const eliminarMotivo = async () => {
        try {
            const { data } = await api.delete(`/motivos-traslado/${motivoDelete.id}`);
            toast.success(data?.desactivado ? 'El motivo estaba en uso: se desactivó.' : 'Motivo eliminado.');
            setMotivoDelete(null);
            const { data: lista } = await api.get('/motivos-traslado');
            setMotivos(asList({ data: lista }));
        } catch (err) {
            toast.error(err.response?.data?.message ?? 'No se pudo eliminar.');
        }
    };

    const runAccion = async (row, accion, exito) => {
        setActionId(row.id);
        try {
            await api.post(`/transferencias/${row.id}/${accion}`);
            toast.success(exito);
            await load();
        } catch (err) {
            toast.error(err.response?.data?.message ?? 'No se pudo completar la acción.');
        } finally {
            setActionId(null);
        }
    };

    const handleRechazar = async () => {
        setRechazando(true);
        try {
            await api.post(`/transferencias/${rechazarTarget.id}/rechazar`, {
                motivo: motivoRechazo.trim() || null,
            });
            toast.success('Solicitud rechazada.');
            setRechazarTarget(null);
            await load();
        } catch (err) {
            toast.error(err.response?.data?.message ?? 'No se pudo rechazar la solicitud.');
        } finally {
            setRechazando(false);
        }
    };

    const handleDelete = async () => {
        setDeleting(true);
        try {
            await api.delete(`/transferencias/${deleteTarget.id}`);
            toast.success('Guía eliminada.');
            setDeleteTarget(null);
            await load();
        } catch (err) {
            toast.error(err.response?.data?.message ?? 'No se pudo eliminar.');
        } finally {
            setDeleting(false);
        }
    };

    // ── Bandeja de solicitudes: lo pendiente de aprobar y lo en tránsito
    // pendiente de recepcionar, lo que de verdad requiere una acción ahora. ──
    const porAprobar = useMemo(() => transferencias.filter((t) => t.estado === 'pendiente'), [transferencias]);
    const porRecepcionar = useMemo(() => transferencias.filter((t) => t.estado === 'en_transito'), [transferencias]);
    const bandejaRows = useMemo(() => [...porAprobar, ...porRecepcionar], [porAprobar, porRecepcionar]);

    // ── Filtros ──
    const applyFilters = () => {
        const next = {};
        if (filterEstado) next.estado = filterEstado;
        if (filterAlmacen) next.almacen = filterAlmacen;
        setActiveFilters(next);
    };
    const clearFilters = () => {
        setFilterEstado('');
        setFilterAlmacen('');
        setActiveFilters({});
    };
    const filtered = transferencias.filter((t) => {
        if (activeFilters.estado && t.estado !== activeFilters.estado) return false;
        if (activeFilters.almacen) {
            const a = activeFilters.almacen;
            if (String(t.almacen_origen_id) !== a && String(t.almacen_destino_id) !== a) return false;
        }
        return true;
    });
    const filterCount = Object.keys(activeFilters).length;

    const filters = (
        <div className="flex flex-wrap items-end gap-3">
            <Select
                label="Estado"
                value={filterEstado}
                onChange={(e) => setFilterEstado(e.target.value)}
                options={[
                    { value: '', label: 'Todos' },
                    ...Object.entries(estadoInfo).map(([value, info]) => ({ value, label: info.label })),
                ]}
                className="w-40"
            />
            <SearchSelect
                label="Almacén"
                value={filterAlmacen}
                onChange={(v) => setFilterAlmacen(v ?? '')}
                placeholder="Todos"
                emptyText="Sin coincidencias"
                options={almacenes.map((a) => ({ value: String(a.id), label: a.nombre }))}
                className="w-48"
            />
        </div>
    );

    // ── Columnas ──
    const columns = [
        {
            key: 'documento',
            label: 'N° Guía',
            width: '130px',
            getSearchValue: (row) => row.documento,
            render: (row) => <span className="font-semibold text-warm-900">{row.documento ?? `#${row.id}`}</span>,
        },
        {
            key: 'fecha_inicio_traslado',
            label: 'Fecha',
            width: '100px',
            render: (row) => fecha(row.fecha_inicio_traslado ?? row.created_at),
        },
        {
            key: 'ruta',
            label: 'Origen → Destino',
            getSearchValue: (row) => `${row.almacen_origen?.nombre} ${row.almacen_destino?.nombre}`,
            render: (row) => (
                <span className="inline-flex items-center gap-2 font-medium text-warm-900">
                    <Repeat className="h-4 w-4 shrink-0 text-primary-600" />
                    <span className="truncate">{row.almacen_origen?.nombre ?? '—'}</span>
                    <ArrowRight className="h-3 w-3 shrink-0 text-gray-400" />
                    <span className="truncate">{row.almacen_destino?.nombre ?? '—'}</span>
                </span>
            ),
        },
        {
            key: 'motivo_traslado',
            label: 'Motivo',
            width: '170px',
            render: (row) => (
                <span className="block truncate text-warm-500" title={MOTIVO_LABEL[row.motivo_traslado] ?? ''}>
                    {MOTIVO_LABEL[row.motivo_traslado] ?? row.motivo_traslado ?? '—'}
                </span>
            ),
        },
        {
            key: 'transporte',
            label: 'Transporte',
            width: '160px',
            searchable: false,
            render: (row) => (
                <span className="block truncate text-warm-500">
                    {row.modalidad_transporte === 'publico'
                        ? row.transportista_razon_social || 'Público'
                        : row.vehiculo_placa
                          ? `Propio · ${row.vehiculo_placa}`
                          : 'Propio'}
                </span>
            ),
        },
        {
            key: 'detalles_count',
            label: 'Ítems',
            width: '75px',
            align: 'right',
            searchable: false,
            render: (row) => <Badge variant="blue">{row.detalles_count ?? row.detalles?.length ?? 0}</Badge>,
        },
        {
            key: 'estado',
            label: 'Estado',
            width: '110px',
            render: (row) => {
                const info = estadoInfo[row.estado] ?? { label: row.estado ?? '—', variant: 'gray' };
                return <Badge variant={info.variant}>{info.label}</Badge>;
            },
        },
        {
            type: 'actions',
            key: 'actions',
            label: 'Acciones',
            width: '150px',
            actions: (row) => (
                <>
                    <button aria-label="Imprimir" title="Imprimir / PDF"
                        onClick={(e) => { e.stopPropagation(); setPdfTarget(row); }}
                        className="rounded-md p-1.5 text-warm-600 transition hover:bg-gray-100 hover:text-warm-900">
                        <Printer className="h-4 w-4" />
                    </button>

                    {row.estado === 'pendiente' && puedeAprobar && (
                        <button aria-label="Aprobar" title="Aprobar (descuenta stock del origen y lo pone en tránsito)" disabled={actionId === row.id}
                            onClick={(e) => { e.stopPropagation(); runAccion(row, 'aprobar', 'Solicitud aprobada. Stock descontado del origen.'); }}
                            className="rounded-md p-1.5 text-blue-600 transition hover:bg-blue-50 disabled:opacity-40">
                            <ShieldCheck className="h-4 w-4" />
                        </button>
                    )}
                    {row.estado === 'pendiente' && puedeAprobar && (
                        <button aria-label="Rechazar" title="Rechazar la solicitud" disabled={actionId === row.id}
                            onClick={(e) => { e.stopPropagation(); setRechazarTarget(row); setMotivoRechazo(''); }}
                            className="rounded-md p-1.5 text-red-600 transition hover:bg-red-50 disabled:opacity-40">
                            <ShieldX className="h-4 w-4" />
                        </button>
                    )}
                    {row.estado === 'en_transito' && (
                        <button aria-label="Recibir" title="Recibir (ingresa stock al destino)" disabled={actionId === row.id}
                            onClick={(e) => { e.stopPropagation(); runAccion(row, 'recibir', 'Guía recibida. Stock ingresado al destino.'); }}
                            className="rounded-md p-1.5 text-green-600 transition hover:bg-green-50 disabled:opacity-40">
                            <PackageCheck className="h-4 w-4" />
                        </button>
                    )}
                    {row.estado === 'pendiente' && (
                        <button aria-label="Anular" title="Anular" disabled={actionId === row.id}
                            onClick={(e) => { e.stopPropagation(); runAccion(row, 'anular', 'Guía anulada.'); }}
                            className="rounded-md p-1.5 text-gray-500 transition hover:bg-gray-100 disabled:opacity-40">
                            <Ban className="h-4 w-4" />
                        </button>
                    )}
                    <button aria-label="Editar" title={row.estado === 'pendiente' ? 'Editar datos de transporte' : 'Editar observaciones'}
                        onClick={(e) => { e.stopPropagation(); navigate(`/transferencias/${row.id}/editar`); }}
                        className="rounded-md p-1.5 text-primary-600 transition hover:bg-primary-50">
                        <Edit className="h-4 w-4" />
                    </button>
                    {row.estado === 'pendiente' && (
                        <button aria-label="Eliminar" title="Eliminar"
                            onClick={(e) => { e.stopPropagation(); setDeleteTarget(row); }}
                            className="rounded-md p-1.5 text-red-600 transition hover:bg-red-50">
                            <Trash2 className="h-4 w-4" />
                        </button>
                    )}
                </>
            ),
        },
    ];

    const detalles = seleccionada?.detalles ?? [];

    const motivoColumns = [
        {
            key: 'nombre',
            label: 'Motivo',
            render: (row) => (
                <span className="inline-flex items-center gap-2 font-medium text-warm-900">
                    {row.es_sistema && <Lock className="h-4 w-4 text-primary-600" />}
                    {row.nombre}
                </span>
            ),
        },
        { key: 'codigo', label: 'Código', width: '240px', render: (row) => <span className="font-mono text-xs text-warm-500">{row.codigo}</span> },
        {
            key: 'es_sistema', label: 'Origen', width: '110px', searchable: false,
            render: (row) => (row.es_sistema ? <Badge variant="blue">Sistema</Badge> : <Badge variant="gray">Manual</Badge>),
        },
        {
            key: 'activo', label: 'Estado', width: '100px', searchable: false,
            render: (row) => (row.activo ? <Badge variant="green">Activo</Badge> : <Badge variant="red">Inactivo</Badge>),
        },
        {
            type: 'actions', key: 'actions', label: 'Acciones', width: '110px',
            actions: (row) => (
                <>
                    <button aria-label="Editar" title={row.es_sistema ? 'Activar / desactivar' : 'Editar'} onClick={() => abrirMotivo(row)}
                        className="rounded-md p-1.5 text-primary-600 transition hover:bg-primary-50">
                        <Edit className="h-4 w-4" />
                    </button>
                    {!row.es_sistema && (
                        <button aria-label="Eliminar" title="Eliminar" onClick={() => setMotivoDelete(row)}
                            className="rounded-md p-1.5 text-red-600 transition hover:bg-red-50">
                            <Trash2 className="h-4 w-4" />
                        </button>
                    )}
                </>
            ),
        },
    ];

    return (
        <Layout>
            <PageHeader
                title="Guías de Traslado"
                description={
                    tab === 'guias'
                        ? 'Traslado de mercadería entre almacenes: guía de remisión interna numerada'
                        : tab === 'bandeja'
                          ? 'Solicitudes que esperan una decisión o su recepción en el destino'
                          : 'Catálogo de motivos de traslado de la guía'
                }
                actions={
                    tab === 'motivos'
                        ? <CreateButton onClick={() => abrirMotivo()}>Nuevo motivo</CreateButton>
                        : <CreateButton onClick={() => navigate('/transferencias/nueva')}>Nueva guía</CreateButton>
                }
            />

            {error && <Alert variant="error" className="mb-4">{error}</Alert>}

            <div className="mb-4">
                <Tabs
                    items={[
                        { key: 'guias', label: 'Guías', icon: Repeat },
                        {
                            key: 'bandeja',
                            label: `Bandeja${porAprobar.length + porRecepcionar.length > 0 ? ` (${porAprobar.length + porRecepcionar.length})` : ''}`,
                            icon: Inbox,
                        },
                        { key: 'motivos', label: 'Motivos de traslado', icon: ListChecks },
                    ]}
                    value={tab}
                    onChange={setTab}
                />
            </div>

            {tab === 'motivos' && (
                <DataTable columns={motivoColumns} rows={motivos} loading={loading} searchPlaceholder="Buscar motivos..." emptyMessage="No hay motivos de traslado" />
            )}

            {tab === 'bandeja' && (
                <div className="space-y-5">
                    {!puedeAprobar && (
                        <Alert variant="info">
                            Puedes ver la bandeja, pero no tienes permiso para aprobar o rechazar solicitudes.
                        </Alert>
                    )}
                    {bandejaRows.length === 0 ? (
                        <Alert variant="success">No hay nada pendiente: ninguna solicitud espera aprobación ni recepción.</Alert>
                    ) : (
                        <>
                            {porAprobar.length > 0 && (
                                <section>
                                    <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-warm-900">
                                        <ShieldCheck className="h-4 w-4 text-amber-600" />
                                        Por aprobar · {porAprobar.length}
                                    </h3>
                                    <DataTable columns={columns} rows={porAprobar} searchPlaceholder="Buscar..." />
                                </section>
                            )}
                            {porRecepcionar.length > 0 && (
                                <section>
                                    <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-warm-900">
                                        <PackageCheck className="h-4 w-4 text-blue-600" />
                                        Por recepcionar · {porRecepcionar.length}
                                    </h3>
                                    <DataTable columns={columns} rows={porRecepcionar} searchPlaceholder="Buscar..." />
                                </section>
                            )}
                        </>
                    )}
                </div>
            )}

            {tab === 'guias' && (<>
            <DataTable
                columns={columns}
                rows={filtered}
                loading={loading}
                searchPlaceholder="Buscar guías..."
                filterable
                filters={filters}
                filterCount={filterCount}
                onApplyFilters={applyFilters}
                onClearFilters={clearFilters}
                onRowClick={(row) => { setSeleccionada(row); sheet.abrir(); }}
                rowClassName={(row) => (row.id === seleccionada?.id ? 'bg-primary-50' : undefined)}
            />

            {/* Móvil: el detalle sube desde abajo al tocar una card (en escritorio no pinta nada). */}
            <BottomSheet
                open={sheet.open && Boolean(seleccionada)}
                onClose={sheet.cerrar}
                title={seleccionada ? `Guía ${seleccionada.documento ?? `#${seleccionada.id}`}` : ''}
                subtitle={seleccionada ? `${MOTIVO_LABEL[seleccionada.motivo_traslado] ?? '—'} · ${seleccionada.modalidad_transporte === 'publico' ? 'Público' : 'Privado'}${seleccionada.vehiculo_placa ? ` · ${seleccionada.vehiculo_placa}` : ''}` : ''}
            >
                {detalles.length === 0 ? (
                    <p className="py-6 text-center text-sm text-warm-500">Esta guía no tiene productos.</p>
                ) : (
                    <div className="space-y-3">
                        {detalles.map((d) => {
                            const producto = d.presentacion?.producto;
                            return (
                                <DetalleCard
                                    key={d.id}
                                    titulo={[producto?.nombre, d.color?.nombre].filter(Boolean).join(' · ')}
                                    subtitulo={[producto?.codigo, d.presentacion?.nombre, producto?.marca?.nombre].filter(Boolean).join(' · ')}
                                    columnas={2}
                                    campos={[
                                        { label: 'Enviado', value: num(d.cantidad_enviada), valueClassName: 'text-primary-600' },
                                        { label: 'Recibido', value: d.cantidad_recibida != null ? num(d.cantidad_recibida) : '—' },
                                    ]}
                                />
                            );
                        })}
                    </div>
                )}
            </BottomSheet>

            {/* Detalle de la guía seleccionada (escritorio) */}
            <div className="mt-6 hidden rounded-xl border border-edge bg-white shadow-sm md:block">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-edge px-5 py-3">
                    <h2 className="text-sm font-semibold text-warm-900">
                        Detalle {seleccionada?.documento ? `de ${seleccionada.documento}` : ''}
                    </h2>
                    {seleccionada && (
                        <span className="flex flex-wrap gap-3 text-xs text-warm-500">
                            <span>Motivo: <strong className="text-warm-900">{MOTIVO_LABEL[seleccionada.motivo_traslado] ?? '—'}</strong></span>
                            <span>Transporte: <strong className="text-warm-900">{seleccionada.modalidad_transporte === 'publico' ? 'Público' : 'Privado'}</strong></span>
                            {seleccionada.vehiculo_placa && <span>Placa: <strong className="text-warm-900">{seleccionada.vehiculo_placa}</strong></span>}
                            {seleccionada.conductor_nombre && <span>Conductor: <strong className="text-warm-900">{seleccionada.conductor_nombre}</strong></span>}
                            {seleccionada.numero_bultos != null && <span>Bultos: <strong className="text-warm-900">{seleccionada.numero_bultos}</strong></span>}
                            {seleccionada.peso_bruto_kg != null && <span>Peso: <strong className="text-warm-900">{num(seleccionada.peso_bruto_kg)} kg</strong></span>}
                        </span>
                    )}
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[820px] text-sm">
                        <thead>
                            <tr className="bg-primary-600 text-left text-xs font-semibold uppercase tracking-wide text-white">
                                <th className="w-12 px-3 py-2.5 text-center">#</th>
                                <th className="w-28 px-3 py-2.5">Código</th>
                                <th className="px-3 py-2.5">Producto</th>
                                <th className="w-28 px-3 py-2.5">Color</th>
                                <th className="w-32 px-3 py-2.5">Marca</th>
                                <th className="w-32 px-3 py-2.5">Unidad</th>
                                <th className="w-28 px-3 py-2.5 text-right">Enviado</th>
                                <th className="w-28 px-3 py-2.5 text-right">Recibido</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {detalles.length === 0 && (
                                <tr>
                                    <td colSpan={8} className="px-3 py-10 text-center text-sm text-warm-500">
                                        {seleccionada ? 'Esta guía no tiene productos.' : 'Selecciona una guía arriba para ver su detalle.'}
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
                                        <td className="px-3 py-2 text-warm-500">{d.color?.nombre ?? '—'}</td>
                                        <td className="px-3 py-2 text-warm-500">{producto?.marca?.nombre ?? '—'}</td>
                                        <td className="px-3 py-2 text-warm-500">{d.presentacion?.nombre ?? '—'}</td>
                                        <td className="px-3 py-2 text-right font-semibold text-primary-600">{num(d.cantidad_enviada)}</td>
                                        <td className="px-3 py-2 text-right text-warm-900">{d.cantidad_recibida != null ? num(d.cantidad_recibida) : '—'}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
            </>)}

            <Modal open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} title="Eliminar guía"
                description={`¿Eliminar la guía ${deleteTarget?.documento ?? ''}?`} size="sm"
                footer={<>
                    <Button variant="secondary" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
                    <Button variant="danger" loading={deleting} onClick={handleDelete}>Eliminar</Button>
                </>}>
                <Alert variant="warning">Solo se pueden eliminar guías pendientes; no afecta al stock.</Alert>
            </Modal>

            <Modal open={Boolean(rechazarTarget)} onClose={() => setRechazarTarget(null)} title="Rechazar solicitud"
                description={`¿Rechazar la guía ${rechazarTarget?.documento ?? ''}? El stock del origen no se toca.`} size="sm"
                footer={<>
                    <Button variant="secondary" onClick={() => setRechazarTarget(null)}>Cancelar</Button>
                    <Button variant="danger" loading={rechazando} onClick={handleRechazar}>Rechazar</Button>
                </>}>
                <Input label="Motivo (opcional)" placeholder="Por qué se rechaza…" value={motivoRechazo}
                    onChange={(e) => setMotivoRechazo(e.target.value)} />
            </Modal>

            {/* Motivo de traslado: crear / editar */}
            <Modal open={Boolean(motivoModal)} onClose={() => setMotivoModal(null)}
                title={motivoModal?.editing ? 'Editar motivo' : 'Nuevo motivo de traslado'}
                description={motivoModal?.editing?.es_sistema ? 'Los motivos del sistema solo se pueden activar o desactivar.' : 'Aparecerá en el selector de la guía.'}
                size="md"
                footer={<>
                    <Button variant="secondary" onClick={() => setMotivoModal(null)}>Cancelar</Button>
                    <Button type="submit" form="motivo-form" loading={motivoSaving}>{motivoModal?.editing ? 'Guardar' : 'Crear'}</Button>
                </>}>
                <form id="motivo-form" onSubmit={guardarMotivo} noValidate className="space-y-4">
                    <Input label="Nombre" placeholder="Ej: Traslado a feria" value={motivoForm.nombre}
                        disabled={Boolean(motivoModal?.editing?.es_sistema)}
                        onChange={(e) => setMotivoForm((f) => ({ ...f, nombre: e.target.value }))} />
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                        <input type="checkbox" checked={motivoForm.activo}
                            onChange={(e) => setMotivoForm((f) => ({ ...f, activo: e.target.checked }))}
                            className="h-4 w-4 rounded border-gray-300 accent-primary-600" />
                        <ListChecks className="h-4 w-4 text-primary-600" /> Motivo activo
                    </label>
                </form>
            </Modal>

            <Modal open={Boolean(motivoDelete)} onClose={() => setMotivoDelete(null)} title="Eliminar motivo"
                description={`¿Eliminar "${motivoDelete?.nombre ?? ''}"?`} size="sm"
                footer={<>
                    <Button variant="secondary" onClick={() => setMotivoDelete(null)}>Cancelar</Button>
                    <Button variant="danger" onClick={eliminarMotivo}>Eliminar</Button>
                </>}>
                <Alert variant="warning">Si alguna guía ya lo usa, se desactivará en lugar de eliminarse.</Alert>
            </Modal>

            <PdfViewerModal
                open={Boolean(pdfTarget)}
                onClose={() => setPdfTarget(null)}
                tipo="guia-traslado"
                id={pdfTarget?.id}
                nombre={pdfTarget?.documento}
                titulo="Guía de traslado"
                formatos={['a4', 'ticket']}
            />
        </Layout>
    );
}
