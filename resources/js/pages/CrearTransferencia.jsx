import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Plus, PlusCircle, Repeat, Trash2, Truck } from 'lucide-react';
import api, { asList } from '../lib/api';
import { opcionesAlmacen } from '../lib/almacenes';
import { useToast } from '../lib/toast';
import Layout from '../components/Layout';
import LineasRollos, { aDetallesTraslado } from '../components/LineasRollos';
import { Alert, Button, Input, Modal, SearchSelect, Select, Spinner } from '../components/ui';

const hoy = () => new Date().toISOString().slice(0, 10);

const emptyForm = {
    almacen_origen_id: '',
    almacen_destino_id: '',
    motivo_traslado: 'traslado_entre_establecimientos',
    fecha_inicio_traslado: hoy(),
    modalidad_transporte: 'privado',
    transportista_razon_social: '',
    transportista_ruc: '',
    vehiculo_placa: '',
    conductor_nombre: '',
    conductor_documento: '',
    conductor_licencia: '',
    numero_bultos: '',
    peso_bruto_kg: '',
    observaciones: '',
};

const num = (n) => new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 }).format(Number(n) || 0);

/**
 * Nueva guía de traslado / editar guía: vista aparte, no modal — el traslado
 * junta ruta, transporte y una tabla de productos, es demasiado para un
 * modal (igual que Compra, Pedido y Venta). Al editar no se pueden tocar los
 * productos: la guía ya salió tal como se creó, solo se completan los datos
 * de transporte.
 */
export default function CrearTransferencia() {
    const toast = useToast();
    const navigate = useNavigate();
    const { id } = useParams();
    const editando = Boolean(id);
    // Viene de "Despachar" en Atender requerimientos: el traslado ya trae el requerimiento (origen, destino y los
    // rollos separados) y se le pueden agregar más cosas antes de crearlo.
    const [searchParams] = useSearchParams();
    const rqId = searchParams.get('requerimiento');
    const [requerimiento, setRequerimiento] = useState(null);

    const [documento, setDocumento] = useState('');
    const [estadoActual, setEstadoActual] = useState('pendiente');
    const [detallesGuardados, setDetallesGuardados] = useState([]);

    const [almacenes, setAlmacenes] = useState([]);
    const [productos, setProductos] = useState([]);
    const [existencias, setExistencias] = useState([]);
    const [motivos, setMotivos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [formErrors, setFormErrors] = useState({});

    const [form, setForm] = useState(emptyForm);
    const [items, setItems] = useState([]);

    /** Modal rápido de motivo, para no tener que ir a la otra pantalla. */
    const [motivoModal, setMotivoModal] = useState(false);
    const [motivoForm, setMotivoForm] = useState({ nombre: '', activo: true });
    const [motivoSaving, setMotivoSaving] = useState(false);

    /** El transporte es opcional y son muchos campos: se editan aparte, como el embarque de una compra al exterior. */
    const [transporteModal, setTransporteModal] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [almRes, prodRes, existRes, motRes] = await Promise.all([
                api.get('/almacenes'),
                api.get('/productos', { params: { per_page: 500 } }),
                api.get('/existencias'),
                api.get('/motivos-traslado'),
            ]);
            setAlmacenes(asList(almRes));
            setProductos(asList(prodRes));
            setExistencias(asList(existRes));
            setMotivos(asList(motRes));

            if (id) {
                const { data: t } = await api.get(`/transferencias/${id}`);
                setDocumento(t.documento ?? `#${t.id}`);
                setEstadoActual(t.estado);
                setDetallesGuardados(t.detalles ?? []);
                setForm({
                    ...emptyForm,
                    almacen_origen_id: String(t.almacen_origen_id ?? ''),
                    almacen_destino_id: String(t.almacen_destino_id ?? ''),
                    motivo_traslado: t.motivo_traslado ?? 'traslado_entre_establecimientos',
                    fecha_inicio_traslado: (t.fecha_inicio_traslado ?? '').slice(0, 10) || hoy(),
                    modalidad_transporte: t.modalidad_transporte ?? 'privado',
                    transportista_razon_social: t.transportista_razon_social ?? '',
                    transportista_ruc: t.transportista_ruc ?? '',
                    vehiculo_placa: t.vehiculo_placa ?? '',
                    conductor_nombre: t.conductor_nombre ?? '',
                    conductor_documento: t.conductor_documento ?? '',
                    conductor_licencia: t.conductor_licencia ?? '',
                    numero_bultos: t.numero_bultos ?? '',
                    peso_bruto_kg: t.peso_bruto_kg ?? '',
                    observaciones: t.observaciones ?? '',
                });
            } else if (rqId) {
                const { data: rq } = await api.get(`/transferencias/requerimientos/${rqId}`);
                if (rq.estado !== 'separada') {
                    toast.error('Ese requerimiento no está separado: termina de prepararlo primero.');
                    navigate('/requerimientos/atender');
                    return;
                }
                setRequerimiento(rq);
                setForm({
                    ...emptyForm,
                    almacen_origen_id: String(rq.origen?.id ?? ''),
                    almacen_destino_id: String(rq.destino?.id ?? ''),
                    observaciones: rq.observaciones ?? '',
                });
            }
        } catch {
            toast.error('No se pudo cargar la información.');
        } finally {
            setLoading(false);
        }
    }, [id, rqId, toast]);

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id, rqId]);

    /** Las existencias del almacén de origen: de ahí sale la mercadería y se limita lo que se agrega. */
    const existenciasOrigen = useMemo(
        () => (form.almacen_origen_id ? existencias.filter((e) => String(e.almacen_id) === String(form.almacen_origen_id)) : []),
        [existencias, form.almacen_origen_id],
    );
    /** Solo se traslada lo que hay en el origen. */
    const productosConStock = useMemo(() => {
        const conStock = new Set(
            existenciasOrigen.filter((e) => Number(e.stock_actual) > 0).map((e) => String(e.producto_id ?? e.producto?.id)),
        );
        return productos.filter((p) => conStock.has(String(p.id)));
    }, [productos, existenciasOrigen]);

    const productoDe = useCallback((pid) => productos.find((p) => String(p.id) === String(pid)) ?? null, [productos]);

    const MOTIVO_LABEL = useMemo(() => Object.fromEntries(motivos.map((m) => [m.codigo, m.nombre])), [motivos]);
    const motivosOptions = useMemo(
        () =>
            motivos
                .filter((m) => m.activo || m.codigo === form.motivo_traslado)
                .map((m) => ({ value: m.codigo, label: m.nombre })),
        [motivos, form.motivo_traslado],
    );

    const guardarMotivo = async (e) => {
        e?.preventDefault?.();
        if (!motivoForm.nombre.trim()) return toast.error('Ingresa el nombre del motivo.');
        setMotivoSaving(true);
        try {
            const { data: creado } = await api.post('/motivos-traslado', motivoForm);
            toast.success('Motivo creado.');
            const { data: lista } = await api.get('/motivos-traslado');
            setMotivos(asList({ data: lista }));
            setField('motivo_traslado', creado.codigo);
            setMotivoModal(false);
        } catch (err) {
            toast.error(err.response?.data?.errors?.nombre?.[0] ?? err.response?.data?.message ?? 'No se pudo guardar el motivo.');
        } finally {
            setMotivoSaving(false);
        }
    };

    const setField = (name, value) => {
        setForm((prev) => ({ ...prev, [name]: value }));
        if (formErrors[name]) setFormErrors((prev) => ({ ...prev, [name]: undefined }));
    };

    const guardar = async (e) => {
        e?.preventDefault?.();
        setSaving(true);
        setFormErrors({});

        const transporte = {
            motivo_traslado: form.motivo_traslado,
            fecha_inicio_traslado: form.fecha_inicio_traslado,
            modalidad_transporte: form.modalidad_transporte,
            transportista_razon_social: form.transportista_razon_social || null,
            transportista_ruc: form.transportista_ruc || null,
            vehiculo_placa: form.vehiculo_placa || null,
            conductor_nombre: form.conductor_nombre || null,
            conductor_documento: form.conductor_documento || null,
            conductor_licencia: form.conductor_licencia || null,
            numero_bultos: form.numero_bultos === '' ? null : Number(form.numero_bultos),
            peso_bruto_kg: form.peso_bruto_kg === '' ? null : Number(form.peso_bruto_kg),
            observaciones: form.observaciones,
        };

        try {
            if (editando) {
                await api.put(`/transferencias/${id}`, transporte);
                toast.success('Guía actualizada.');
            } else if (requerimiento) {
                // El requerimiento sale con sus rollos y con lo que se haya agregado aquí.
                const { data } = await api.post(`/transferencias/requerimientos/${requerimiento.id}/despachar`, {
                    ...transporte,
                    extras: aDetallesTraslado(items),
                });
                toast.success(`Traslado creado desde ${requerimiento.requerimiento}: guía ${data.guia}. Quedó en tránsito.`);
            } else {
                if (items.length === 0 && !requerimiento) {
                    setFormErrors({ detalles: 'Agrega al menos un producto.' });
                    setSaving(false);
                    return;
                }
                await api.post('/transferencias', {
                    almacen_origen_id: form.almacen_origen_id,
                    almacen_destino_id: form.almacen_destino_id,
                    ...transporte,
                    detalles: aDetallesTraslado(items),
                });
                toast.success('Guía de traslado creada. Apruébala desde la bandeja para descontar el stock del origen.');
            }
            navigate('/transferencias');
        } catch (err) {
            if (err.response?.status === 422) {
                const v = err.response.data?.errors ?? {};
                setFormErrors(Object.fromEntries(Object.entries(v).map(([k, val]) => [k, val[0]])));
                toast.error(err.response.data?.message ?? 'Revisa los datos.');
            } else {
                toast.error('No se pudo guardar la guía.');
            }
        } finally {
            setSaving(false);
        }
    };

    const esPublico = form.modalidad_transporte === 'publico';
    const soloTransporte = editando && estadoActual !== 'pendiente';
    const hayDatosTransporte = Boolean(
        esPublico || form.vehiculo_placa || form.conductor_nombre || form.conductor_documento ||
        form.conductor_licencia || form.numero_bultos || form.peso_bruto_kg,
    );
    const resumenTransporte = [
        esPublico ? (form.transportista_razon_social || 'Transporte público') : form.vehiculo_placa ? `Propio · ${form.vehiculo_placa}` : null,
        form.conductor_nombre,
        form.numero_bultos ? `${form.numero_bultos} bultos` : null,
        form.peso_bruto_kg ? `${num(form.peso_bruto_kg)} kg` : null,
    ].filter(Boolean).join(' · ');

    if (loading) {
        return (
            <Layout>
                <div className="flex items-center justify-center py-24">
                    <Spinner size="lg" className="text-primary-600" />
                </div>
            </Layout>
        );
    }

    return (
        <Layout>
            {/* Encabezado */}
            <div className="mb-6 flex items-center gap-3">
                <button
                    onClick={() => navigate('/transferencias')}
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-edge text-gray-500 transition hover:bg-gray-50 hover:text-gray-800"
                    aria-label="Volver"
                >
                    <ArrowLeft className="h-4 w-4" />
                </button>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
                    <Repeat className="h-5 w-5" />
                </div>
                <div>
                    <h1 className="text-xl font-bold tracking-tight text-warm-900">
                        {editando ? `Editar guía ${documento}` : requerimiento ? `Nuevo traslado · ${requerimiento.requerimiento}` : 'Nueva guía de traslado'}
                    </h1>
                    <p className="text-sm text-warm-500">
                        {editando
                            ? soloTransporte
                                ? 'Ya fue aprobada: solo se pueden cambiar las observaciones.'
                                : 'Puedes completar los datos del transporte hasta que se apruebe.'
                            : requerimiento
                              ? `Trae el requerimiento ${requerimiento.requerimiento} con sus rollos separados. Agrega más productos si quieres mandar algo más.`
                              : 'Documento interno numerado para mover mercadería entre almacenes.'}
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_400px] *:min-w-0">
                {/* Columna izquierda: productos (alta) o el detalle ya fijo (edición) */}
                <div className="space-y-6">
                    {/* Lo que ya viene del requerimiento: sus rollos separados salen tal cual. */}
                    {requerimiento && (
                        <div className="rounded-xl border border-edge bg-white p-5 shadow-sm">
                            <h2 className="mb-1 text-sm font-semibold text-warm-900">Del requerimiento {requerimiento.requerimiento}</h2>
                            <p className="mb-3 text-xs text-warm-500">Lo pidió {requerimiento.destino?.nombre}. Estos rollos ya están separados y salen con el traslado.</p>
                            {requerimiento.saldo_accion && (
                                <Alert variant="warning" className="mb-3">
                                    <strong>Atención parcial.</strong> Sale solo lo escaneado.{' '}
                                    {requerimiento.saldo_accion === 'pendiente'
                                        ? 'Al crear el traslado, lo que falta queda pendiente en un nuevo requerimiento.'
                                        : 'Al crear el traslado, lo que falta se cancela.'}
                                    {requerimiento.detalles.filter((d) => d.modo !== 'cantidad' && !d.cubierta).length > 0 && (
                                        <span className="mt-1 block text-xs">
                                            Falta:{' '}
                                            {requerimiento.detalles
                                                .filter((d) => d.modo !== 'cantidad' && !d.cubierta)
                                                .map((d) => `${d.producto}${d.color ? ` · ${d.color}` : ''} (${d.modo === 'rollos' ? `${num(d.rollos_pendientes)} rollos` : `${num(d.metros_pendientes)} m`})`)
                                                .join('; ')}
                                        </span>
                                    )}
                                </Alert>
                            )}
                            <div className="space-y-2">
                                {requerimiento.detalles.filter((d) => d.modo === 'cantidad' || d.rollos.length > 0).map((d) => (
                                    <div key={d.id} className="rounded-lg border border-edge">
                                        <div className="flex flex-wrap items-center justify-between gap-2 bg-gray-50 px-3 py-2 text-sm">
                                            <span className="font-semibold text-warm-900">
                                                {d.producto}{d.color && <span className="font-normal text-warm-600"> · {d.color}</span>}
                                            </span>
                                            <span className="text-warm-700">
                                                {d.rollos.length > 0 ? `${d.rollos.length} rollo${d.rollos.length === 1 ? '' : 's'} · ${num(d.metros_asignados)} m` : `${num(d.cantidad_enviada)} ${d.presentacion ?? ''}`}
                                            </span>
                                        </div>
                                        {d.rollos.length > 0 && (
                                            <ul className="divide-y divide-edge/60">
                                                {d.rollos.map((x) => (
                                                    <li key={x.rollo_id} className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm">
                                                        <span className="font-mono text-warm-800">{x.codigo}</span>
                                                        <span className="text-warm-600">{num(x.metros)} m {x.entero ? 'entero' : `· corte de ${num(x.metros_rollo)} m`}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Mismo diseño y misma forma de agregar productos que Nuevo pedido. */}
                    {!editando && (
                        <>
                            <LineasRollos
                                titulo={requerimiento ? 'Agregar más productos (opcional)' : 'Productos a trasladar'}
                                productos={productosConStock}
                                existencias={existenciasOrigen}
                                lineas={items}
                                setLineas={setItems}
                                validarStock
                                almacenOrigenId={form.almacen_origen_id || null}
                                deshabilitado={!form.almacen_origen_id}
                                avisoDeshabilitado="Elige el almacén de origen para ver sus productos con stock."
                                errores={formErrors}
                            />
                            {formErrors.detalles && <p className="-mt-3 text-xs text-red-600">{formErrors.detalles}</p>}
                        </>
                    )}

                    {/* Al editar los productos ya quedaron fijos: se muestran solo de referencia. */}
                    {editando && (
                        <div className="rounded-xl border border-edge bg-white p-5 shadow-sm">
                            <h2 className="mb-3 text-sm font-semibold text-warm-900">Productos de la guía</h2>
                            <div className="overflow-x-auto rounded-lg border border-edge">
                                <table className="w-full min-w-[520px] text-sm">
                                    <thead>
                                        <tr className="bg-primary-600 text-left text-xs font-semibold uppercase tracking-wide text-white">
                                            <th className="px-3 py-2">Producto</th>
                                            <th className="w-28 px-3 py-2">Color</th>
                                            <th className="w-32 px-3 py-2">Unidad</th>
                                            <th className="w-28 px-3 py-2 text-right">Enviado</th>
                                            <th className="w-28 px-3 py-2 text-right">Recibido</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {detallesGuardados.length === 0 && (
                                            <tr><td colSpan={5} className="px-3 py-6 text-center text-warm-500">Esta guía no tiene productos.</td></tr>
                                        )}
                                        {detallesGuardados.map((d) => (
                                            <tr key={d.id}>
                                                <td className="px-3 py-2 font-medium text-warm-900">{d.presentacion?.producto?.nombre ?? '—'}</td>
                                                <td className="px-3 py-2 text-warm-500">{d.color?.nombre ?? '—'}</td>
                                                <td className="px-3 py-2 text-warm-500">{d.presentacion?.nombre ?? '—'}</td>
                                                <td className="px-3 py-2 text-right font-semibold text-primary-600">{num(d.cantidad_enviada)}</td>
                                                <td className="px-3 py-2 text-right text-warm-900">{d.cantidad_recibida != null ? num(d.cantidad_recibida) : '—'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <p className="mt-2 text-xs text-warm-400">Ya no se pueden cambiar: elimina la guía y crea otra si el pedido cambió.</p>
                        </div>
                    )}
                </div>

                {/* Columna derecha: ruta, transporte y observaciones */}
                <div className="space-y-4">
                    <div className="rounded-xl border border-edge bg-white p-5 shadow-sm">
                        <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-warm-500">Traslado</h3>
                        <div className="space-y-3">
                            <SearchSelect label="Almacén origen" value={form.almacen_origen_id} disabled={editando || Boolean(requerimiento)}
                                onChange={(v) => { setField('almacen_origen_id', v ?? ''); setItems([]); }}
                                placeholder="Selecciona…" emptyText="Sin coincidencias"
                                options={opcionesAlmacen(almacenes, form.almacen_origen_id)}
                                error={formErrors.almacen_origen_id} />
                            <SearchSelect label="Almacén destino" value={form.almacen_destino_id} disabled={editando || Boolean(requerimiento)}
                                onChange={(v) => setField('almacen_destino_id', v ?? '')}
                                placeholder="Selecciona…" emptyText="Sin coincidencias"
                                options={opcionesAlmacen(almacenes, form.almacen_destino_id).filter((o) => o.value !== String(form.almacen_origen_id))}
                                error={formErrors.almacen_destino_id} />
                            <Input label="Fecha de inicio" type="date" value={form.fecha_inicio_traslado}
                                onChange={(e) => setField('fecha_inicio_traslado', e.target.value)}
                                disabled={soloTransporte} error={formErrors.fecha_inicio_traslado} />
                            <div className="flex items-end gap-2">
                                <div className="flex-1">
                                    <SearchSelect label="Motivo de traslado" value={form.motivo_traslado}
                                        onChange={(v) => setField('motivo_traslado', v ?? '')}
                                        placeholder="Selecciona…" emptyText="Sin coincidencias"
                                        options={motivosOptions}
                                        disabled={soloTransporte} error={formErrors.motivo_traslado} />
                                </div>
                                {!soloTransporte && (
                                    <button type="button" onClick={() => { setMotivoForm({ nombre: '', activo: true }); setMotivoModal(true); }} title="Crear motivo"
                                        className="mb-0.5 rounded-md p-1.5 text-emerald-600 transition hover:bg-emerald-50">
                                        <PlusCircle className="h-5 w-5" />
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="rounded-xl border border-edge bg-white p-5 shadow-sm">
                        <div className="flex items-center justify-between gap-3">
                            <h3 className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-warm-500">
                                <Truck className="h-4 w-4" /> Transporte
                                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold normal-case tracking-normal text-warm-500">
                                    Opcional
                                </span>
                            </h3>
                            <Button type="button" variant="secondary" size="sm" onClick={() => setTransporteModal(true)}>
                                {hayDatosTransporte ? 'Editar' : 'Agregar'}
                            </Button>
                        </div>
                        <p className="mt-2 text-xs text-warm-500">
                            {hayDatosTransporte ? resumenTransporte : 'Sin datos de transporte aún. Puedes completarlos después, mientras la guía esté pendiente.'}
                        </p>
                    </div>

                    <div className="rounded-xl border border-edge bg-white p-5 shadow-sm">
                        <Input label="Observaciones" placeholder="Opcional" value={form.observaciones}
                            onChange={(e) => setField('observaciones', e.target.value)} />
                        <div className="mt-4 flex flex-col gap-2">
                            <Button onClick={guardar} loading={saving} className="w-full justify-center">
                                {editando ? 'Guardar cambios' : requerimiento ? 'Crear traslado y despachar' : 'Crear guía'}
                            </Button>
                            <Button variant="secondary" onClick={() => navigate('/transferencias')} className="w-full justify-center">
                                Cancelar
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            <Modal open={motivoModal} onClose={() => setMotivoModal(false)} title="Nuevo motivo de traslado"
                description="Aparecerá en el selector de la guía." size="md"
                footer={<>
                    <Button variant="secondary" onClick={() => setMotivoModal(false)}>Cancelar</Button>
                    <Button type="submit" form="motivo-rapido-form" loading={motivoSaving}>Crear</Button>
                </>}>
                <form id="motivo-rapido-form" onSubmit={guardarMotivo} noValidate>
                    <Input label="Nombre" placeholder="Ej: Traslado a feria" value={motivoForm.nombre}
                        onChange={(e) => setMotivoForm((f) => ({ ...f, nombre: e.target.value }))} />
                </form>
            </Modal>

            <Modal open={transporteModal} onClose={() => setTransporteModal(false)} title="Datos de transporte"
                description="Todo opcional: puedes dejarlo vacío y completarlo después, mientras la guía esté pendiente."
                size="lg"
                footer={<Button type="button" onClick={() => setTransporteModal(false)}>Listo</Button>}>
                <div className="grid gap-3 sm:grid-cols-2">
                    <Select label="Modalidad" value={form.modalidad_transporte}
                        onChange={(e) => setField('modalidad_transporte', e.target.value)}
                        options={[{ value: 'privado', label: 'Privado (vehículo propio)' }, { value: 'publico', label: 'Público (empresa de transporte)' }]}
                        disabled={soloTransporte} className="sm:col-span-2" />
                    {esPublico && (
                        <>
                            <Input label="Transportista (razón social) *" value={form.transportista_razon_social}
                                onChange={(e) => setField('transportista_razon_social', e.target.value)}
                                error={formErrors.transportista_razon_social} className="sm:col-span-2" />
                            <Input label="RUC transportista *" value={form.transportista_ruc} maxLength={11}
                                onChange={(e) => setField('transportista_ruc', e.target.value.replace(/\D/g, ''))}
                                error={formErrors.transportista_ruc} className="sm:col-span-2" />
                        </>
                    )}
                    <Input label="Placa del vehículo (opcional)" placeholder="ABC-123" value={form.vehiculo_placa}
                        onChange={(e) => setField('vehiculo_placa', e.target.value.toUpperCase())} error={formErrors.vehiculo_placa} />
                    <Input label="Conductor (opcional)" value={form.conductor_nombre}
                        onChange={(e) => setField('conductor_nombre', e.target.value)} error={formErrors.conductor_nombre} />
                    <Input label="DNI del conductor (opcional)" value={form.conductor_documento}
                        onChange={(e) => setField('conductor_documento', e.target.value)} error={formErrors.conductor_documento} />
                    <Input label="Licencia (opcional)" value={form.conductor_licencia}
                        onChange={(e) => setField('conductor_licencia', e.target.value.toUpperCase())} error={formErrors.conductor_licencia} />
                    <Input label="N° de bultos (opcional)" type="number" min="0" value={form.numero_bultos}
                        onChange={(e) => setField('numero_bultos', e.target.value)} error={formErrors.numero_bultos} />
                    <Input label="Peso bruto en kg (opcional)" type="number" min="0" step="any" value={form.peso_bruto_kg}
                        onChange={(e) => setField('peso_bruto_kg', e.target.value)} error={formErrors.peso_bruto_kg} />
                </div>
            </Modal>
        </Layout>
    );
}
