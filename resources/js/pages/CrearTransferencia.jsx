import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, PlusCircle, Repeat, Trash2, Truck } from 'lucide-react';
import api, { asList } from '../lib/api';
import { opcionesAlmacen } from '../lib/almacenes';
import { useToast } from '../lib/toast';
import Layout from '../components/Layout';
import ColorSelect from '../components/ColorSelect';
import ProductoPickerModal from '../components/ProductoPickerModal';
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

const panelVacio = { producto_id: '', producto_presentacion_id: '', producto_color_id: '', cantidad: '1' };

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
    const [panel, setPanel] = useState({ ...panelVacio });
    const [items, setItems] = useState([]);
    const [picker, setPicker] = useState({ open: false, query: '' });

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
            }
        } catch {
            toast.error('No se pudo cargar la información.');
        } finally {
            setLoading(false);
        }
    }, [id, toast]);

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    // ── Stock del almacén de origen (en unidad base) ──
    const stockOrigen = useMemo(() => {
        if (!form.almacen_origen_id) return {};
        return existencias
            .filter((e) => String(e.almacen_id) === String(form.almacen_origen_id))
            .reduce((acc, e) => {
                acc[String(e.producto_id)] = Number(e.stock_actual) || 0;
                return acc;
            }, {});
    }, [existencias, form.almacen_origen_id]);

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

    /** Solo se traslada lo que hay en el origen. */
    const productosOptions = useMemo(
        () =>
            productos
                .filter((p) => (stockOrigen[String(p.id)] ?? 0) > 0)
                .map((p) => ({
                    value: String(p.id),
                    label: p.nombre,
                    keywords: `${p.codigo ?? ''} ${p.codigo_barras ?? ''}`,
                })),
        [productos, stockOrigen],
    );

    const unidadesDe = useCallback(
        (productoId) => {
            const p = productoDe(productoId);
            if (!p) return [];
            const base = stockOrigen[String(p.id)] ?? 0;
            return (p.presentaciones ?? [])
                .filter((pres) => pres.activo !== false)
                .map((pres) => {
                    const factor = Number(pres.factor_conversion) || 1;
                    return {
                        value: String(pres.id),
                        label: pres.nombre,
                        disponible: Math.floor((base / factor) * 100) / 100,
                    };
                });
        },
        [productoDe, stockOrigen],
    );

    const disponibleDe = (productoId, presId) =>
        unidadesDe(productoId).find((u) => String(u.value) === String(presId))?.disponible ?? 0;

    const coloresOrigenDe = useCallback(
        (productoId) => {
            if (!productoId || !form.almacen_origen_id) return [];
            const fila = existencias.find(
                (e) =>
                    String(e.producto_id ?? e.producto?.id) === String(productoId) &&
                    String(e.almacen_id) === String(form.almacen_origen_id),
            );
            return fila?.colores ?? [];
        },
        [existencias, form.almacen_origen_id],
    );

    const setField = (name, value) => {
        setForm((prev) => ({ ...prev, [name]: value }));
        if (formErrors[name]) setFormErrors((prev) => ({ ...prev, [name]: undefined }));
    };

    const elegirProducto = (productoId) => {
        const us = unidadesDe(productoId);
        setPanel({
            producto_id: productoId,
            producto_presentacion_id: us.length === 1 ? us[0].value : '',
            producto_color_id: '',
            cantidad: '1',
        });
    };

    /**
     * Disponible para lo que hay elegido ahora mismo en el panel: si el
     * color tiene su propio saldo, ese manda (los rollos son los que de
     * verdad viajan); si no, el total del producto en esa unidad. Se
     * muestra en el campo "Disponible" y también limita al agregar.
     */
    const colorPanel = coloresOrigenDe(panel.producto_id).find((c) => String(c.id) === String(panel.producto_color_id));
    const disponiblePanel = colorPanel
        ? Math.floor(
              (Number(colorPanel.metros) /
                  (Number(
                      productoDe(panel.producto_id)?.presentaciones?.find((p) => String(p.id) === String(panel.producto_presentacion_id))
                          ?.factor_conversion,
                  ) || 1)) *
                  100,
          ) / 100
        : disponibleDe(panel.producto_id, panel.producto_presentacion_id);

    const agregarProducto = () => {
        if (!form.almacen_origen_id) return toast.error('Elige primero el almacén de origen.');
        if (!panel.producto_id) return toast.error('Busca y elige un producto.');
        if (!panel.producto_presentacion_id) return toast.error('Elige la unidad.');
        const colores = coloresOrigenDe(panel.producto_id);
        if (colores.length > 0 && !panel.producto_color_id) return toast.error('Elige el color.');
        const cant = Number(panel.cantidad) || 0;
        if (cant <= 0) return toast.error('La cantidad debe ser mayor a 0.');

        if (cant > disponiblePanel) {
            return toast.error(`Solo hay ${num(disponiblePanel)} disponibles en el origen${colorPanel ? ` de ${colorPanel.nombre}` : ''}.`);
        }

        setItems((prev) => {
            const i = prev.findIndex(
                (it) =>
                    String(it.producto_presentacion_id) === String(panel.producto_presentacion_id) &&
                    String(it.producto_color_id || '') === String(panel.producto_color_id || ''),
            );
            if (i !== -1) {
                return prev.map((it, idx) =>
                    idx === i ? { ...it, cantidad: String((Number(it.cantidad) || 0) + cant) } : it,
                );
            }
            return [
                ...prev,
                {
                    producto_id: panel.producto_id,
                    producto_presentacion_id: panel.producto_presentacion_id,
                    producto_color_id: panel.producto_color_id || '',
                    cantidad: String(cant),
                },
            ];
        });
        setPanel({ ...panelVacio });
    };

    const agregarDesdePicker = (seleccionados) => {
        const utiles = seleccionados.filter((sel) => sel.presentacion && sel.cantidad > 0);
        if (utiles.length === 0) return;
        setItems((prev) => {
            const next = [...prev];
            utiles.forEach(({ producto, presentacion, cantidad }) => {
                const i = next.findIndex((it) => String(it.producto_presentacion_id) === String(presentacion.id));
                if (i !== -1) next[i] = { ...next[i], cantidad: String((Number(next[i].cantidad) || 0) + cantidad) };
                else next.push({ producto_id: String(producto.id), producto_presentacion_id: String(presentacion.id), cantidad: String(cantidad) });
            });
            return next;
        });
        toast.success(utiles.length === 1 ? 'Producto agregado.' : `${utiles.length} productos agregados.`);
        setPanel({ ...panelVacio });
    };

    const setItem = (i, patch) => setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
    const quitarItem = (i) => setItems((prev) => prev.filter((_, idx) => idx !== i));

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
            } else {
                if (items.length === 0) {
                    setFormErrors({ detalles: 'Agrega al menos un producto.' });
                    setSaving(false);
                    return;
                }
                await api.post('/transferencias', {
                    almacen_origen_id: form.almacen_origen_id,
                    almacen_destino_id: form.almacen_destino_id,
                    ...transporte,
                    detalles: items.map((it) => ({
                        producto_presentacion_id: it.producto_presentacion_id,
                        producto_color_id: it.producto_color_id || null,
                        cantidad_enviada: it.cantidad,
                    })),
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
                        {editando ? `Editar guía ${documento}` : 'Nueva guía de traslado'}
                    </h1>
                    <p className="text-sm text-warm-500">
                        {editando
                            ? soloTransporte
                                ? 'Ya fue aprobada: solo se pueden cambiar las observaciones.'
                                : 'Puedes completar los datos del transporte hasta que se apruebe.'
                            : 'Documento interno numerado para mover mercadería entre almacenes.'}
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_400px] *:min-w-0">
                {/* Columna izquierda: productos (alta) o el detalle ya fijo (edición) */}
                <div className="space-y-6">
                    {!editando && (
                        <div className="rounded-xl border border-edge bg-white p-5 shadow-sm">
                            <h2 className="mb-3 text-sm font-semibold text-warm-900">Productos a trasladar</h2>
                            {!form.almacen_origen_id ? (
                                <Alert variant="info">Elige el almacén de origen para ver sus productos con stock.</Alert>
                            ) : (
                                <>
                                    <div className="space-y-3">
                                        <SearchSelect
                                            label="Producto"
                                            value={panel.producto_id}
                                            onChange={elegirProducto}
                                            options={productosOptions}
                                            placeholder="Buscar producto con stock en el origen…"
                                            emptyText="Sin productos con stock en este almacén"
                                            searchTitle="Buscador avanzado con filtros"
                                            onSearch={(q) => setPicker({ open: true, query: q })}
                                        />

                                        {/* Su propia fila: junto al resto se desalineaba el resto de la grilla. */}
                                        {coloresOrigenDe(panel.producto_id).length > 0 && (
                                            <ColorSelect
                                                colores={coloresOrigenDe(panel.producto_id)}
                                                value={panel.producto_color_id}
                                                onChange={(cid) => setPanel((p) => ({ ...p, producto_color_id: cid }))}
                                                placeholder="Elige…"
                                                describir={(c) =>
                                                    c.codigo
                                                        ? `${c.nombre} (${c.codigo}) · ${num(c.metros)} m`
                                                        : `${c.nombre} · ${num(c.metros)} m`
                                                }
                                            />
                                        )}

                                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                            <Input
                                                label="Disponible"
                                                value={panel.producto_id ? `${num(disponiblePanel)} ${unidadesDe(panel.producto_id).find((u) => String(u.value) === String(panel.producto_presentacion_id))?.label ?? ''}`.trim() : ''}
                                                readOnly
                                                disabled
                                            />
                                            <SearchSelect
                                                label="Unidad"
                                                value={panel.producto_presentacion_id}
                                                disabled={!panel.producto_id}
                                                clearable={false}
                                                placeholder={panel.producto_id ? 'Elegir…' : '—'}
                                                emptyText="Sin unidades"
                                                onChange={(pid) => pid && setPanel((p) => ({ ...p, producto_presentacion_id: pid }))}
                                                options={unidadesDe(panel.producto_id).map((u) => ({ value: u.value, label: u.label }))}
                                            />
                                            <Input label="Cantidad" type="number" min="0" step="any" value={panel.cantidad}
                                                onChange={(e) => setPanel((p) => ({ ...p, cantidad: e.target.value }))} />
                                        </div>

                                        <Button type="button" onClick={agregarProducto}>
                                            <Plus className="h-4 w-4" /> Agregar producto
                                        </Button>
                                    </div>

                                    <div className="mt-3 overflow-x-auto rounded-lg border border-edge">
                                        <table className="w-full min-w-[560px] text-sm">
                                            <thead>
                                                <tr className="bg-primary-600 text-left text-xs font-semibold uppercase tracking-wide text-white">
                                                    <th className="px-3 py-2">Producto</th>
                                                    <th className="w-32 px-3 py-2">Unidad</th>
                                                    <th className="w-24 px-3 py-2 text-right">Disp.</th>
                                                    <th className="w-28 px-3 py-2 text-right">Cantidad</th>
                                                    <th className="w-12 px-3 py-2" />
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100">
                                                {items.length === 0 && (
                                                    <tr><td colSpan={5} className="px-3 py-6 text-center text-warm-500">Agrega productos arriba</td></tr>
                                                )}
                                                {items.map((it, i) => {
                                                    const p = productoDe(it.producto_id);
                                                    const u = unidadesDe(it.producto_id).find((x) => String(x.value) === String(it.producto_presentacion_id));
                                                    const excede = u && Number(it.cantidad) > u.disponible;
                                                    const color = coloresOrigenDe(it.producto_id).find((c) => String(c.id) === String(it.producto_color_id));
                                                    return (
                                                        <tr key={i}>
                                                            <td className="px-3 py-2 font-medium text-warm-900">
                                                                {p?.nombre ?? '—'}
                                                                {color && <span className="ml-1 text-xs text-warm-500">· {color.nombre}</span>}
                                                            </td>
                                                            <td className="px-3 py-2 text-warm-500">{u?.label ?? '—'}</td>
                                                            <td className="px-3 py-2 text-right text-warm-500">{u ? num(u.disponible) : '—'}</td>
                                                            <td className="px-3 py-2">
                                                                <Input type="number" min="0" step="any" value={it.cantidad}
                                                                    onChange={(e) => setItem(i, { cantidad: e.target.value })}
                                                                    error={excede ? 'Supera el stock' : undefined} className="text-right" />
                                                            </td>
                                                            <td className="px-3 py-2 text-center">
                                                                <button type="button" onClick={() => quitarItem(i)} aria-label="Quitar"
                                                                    className="rounded-md p-1.5 text-red-600 transition hover:bg-red-50">
                                                                    <Trash2 className="h-4 w-4" />
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                    {formErrors.detalles && <p className="mt-1 text-xs text-red-600">{formErrors.detalles}</p>}
                                </>
                            )}
                        </div>
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
                            <SearchSelect label="Almacén origen" value={form.almacen_origen_id} disabled={editando}
                                onChange={(v) => { setField('almacen_origen_id', v ?? ''); setItems([]); setPanel({ ...panelVacio }); }}
                                placeholder="Selecciona…" emptyText="Sin coincidencias"
                                options={opcionesAlmacen(almacenes, form.almacen_origen_id)}
                                error={formErrors.almacen_origen_id} />
                            <SearchSelect label="Almacén destino" value={form.almacen_destino_id} disabled={editando}
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
                                {editando ? 'Guardar cambios' : 'Crear guía'}
                            </Button>
                            <Button variant="secondary" onClick={() => navigate('/transferencias')} className="w-full justify-center">
                                Cancelar
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            <ProductoPickerModal
                open={picker.open}
                onClose={() => setPicker((p) => ({ ...p, open: false }))}
                onSelect={agregarDesdePicker}
                initialQuery={picker.query}
                multiple
                stockFilter
                productos={productos.filter((p) => (stockOrigen[String(p.id)] ?? 0) > 0)}
                stockPorProducto={stockOrigen}
                title="Buscar productos"
            />

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
