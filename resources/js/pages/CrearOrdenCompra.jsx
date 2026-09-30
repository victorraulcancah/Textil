import { paisConCodigo } from '../lib/paises';
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ChevronRight, FileText, Package, Pencil, Plus, Ship, Trash2 } from 'lucide-react';
import api, { asList } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import Layout from '../components/Layout';
import CatalogoSelect from '../components/CatalogoSelect';
import ContenedorSelect from '../components/ContenedorSelect';
import ColorSelect from '../components/ColorSelect';
import ProductoPickerModal from '../components/ProductoPickerModal';
import TelaCompraModal, { presentacionMetroDe } from '../components/TelaCompraModal';
import { Button, Input, Modal, SearchSelect, Select, Spinner, cn } from '../components/ui';

const money = (n, moneda = 'PEN') =>
    new Intl.NumberFormat(moneda === 'USD' ? 'en-US' : 'es-PE', {
        style: 'currency',
        currency: moneda === 'USD' ? 'USD' : 'PEN',
    }).format(Number(n) || 0);

const hoy = () => new Date().toISOString().slice(0, 10);

const panelVacio = {
    producto_id: '',
    producto_presentacion_id: '',
    producto_color_id: '',
    rollos: '',
    cantidad: '1',
    precio_unitario: '0',
};

/** Datos propios de una compra al exterior: se limpian al pasar a nacional. */
const exteriorVacio = {
    cargo_type: '',
    medio_transporte: '',
    incoterm: '',
    pais_origen: '',
    // La mercadería llega al Perú: es lo que se propone (se puede cambiar).
    pais_destino: 'PERÚ - PE',
    puerto_embarque: '',
    puerto_destino: '',
    numero_contenedor: '',
    fecha_embarque_estimada: '',
    elaborado_por: '',
    aprobado_por: '',
    // El usuario que aprueba (se elige de la lista): solo él podrá aprobarla.
    aprobador_id: '',
};

export default function CrearOrdenCompra() {
    const toast = useToast();
    const { user } = useAuth();
    const navigate = useNavigate();
    /** Con :id la pantalla trabaja en modo edición sobre una orden existente. */
    const { id } = useParams();
    const editando = Boolean(id);

    const [codigo, setCodigo] = useState('');

    const [proveedores, setProveedores] = useState([]);
    /** Usuarios que pueden aprobar órdenes: de ahí se elige el aprobador. */
    const [aprobadores, setAprobadores] = useState([]);
    const [productos, setProductos] = useState([]);
    const [stockPorProducto, setStockPorProducto] = useState({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [formErrors, setFormErrors] = useState({});

    const [form, setForm] = useState({
        tipo: 'nacional',
        moneda: 'PEN',
        proveedor_id: '',
        fecha_emision: hoy(),
        fecha_entrega_estimada: '',
        observaciones: '',
        ...exteriorVacio,
    });

    // "Elaborado por": quien entró al sistema, salvo que sea una orden ya guardada o
    // se haya escrito otro nombre. No pisa lo que ya hay.
    useEffect(() => {
        if (id || !user?.name) return;
        setForm((prev) => (prev.elaborado_por ? prev : { ...prev, elaborado_por: user.name }));
    }, [id, user?.name]); // eslint-disable-line react-hooks/exhaustive-deps

    /** Panel superior de búsqueda/alta. */
    const [panel, setPanel] = useState({ ...panelVacio });
    /** Productos ya agregados a la orden. */
    const [items, setItems] = useState([]);
    /** Telas desplegadas en la tabla: { [id del producto]: true }. */
    const [abiertas, setAbiertas] = useState({});
    /** Buscador avanzado de productos. */
    const [picker, setPicker] = useState({ open: false, query: '' });
    /** La tela cuya tabla de colores (rollos, factor, precio) se está llenando. */
    const [telaCompra, setTelaCompra] = useState(null);
    /** Los datos de embarque son muchos campos: se editan en un modal aparte. */
    const [modalExterior, setModalExterior] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [provRes, prodRes, existRes, aprobRes] = await Promise.all([
                api.get('/proveedores'),
                api.get('/productos', { params: { per_page: 500 } }),
                api.get('/existencias'),
                api.get('/ordenes-compra/aprobadores').catch(() => ({ data: [] })),
            ]);
            setProveedores(asList(provRes));
            setAprobadores(asList(aprobRes));
            setProductos(asList(prodRes));

            // El stock vive por almacén: lo acumulamos por producto (en unidad base).
            setStockPorProducto(
                asList(existRes).reduce((acc, fila) => {
                    const pid = String(fila.producto_id);
                    acc[pid] = (acc[pid] ?? 0) + (Number(fila.stock_actual) || 0);
                    return acc;
                }, {}),
            );

            if (!id) return;

            // Modo edición: la orden se vuelca al formulario y a la tabla.
            const { data: orden } = await api.get(`/ordenes-compra/${id}`);
            setCodigo(orden.codigo ?? '');
            setForm({
                tipo: orden.tipo ?? 'nacional',
                moneda: orden.moneda ?? 'PEN',
                proveedor_id: orden.proveedor_id ? String(orden.proveedor_id) : '',
                fecha_emision: (orden.fecha_emision ?? '').slice(0, 10),
                fecha_entrega_estimada: (orden.fecha_entrega_estimada ?? '').slice(0, 10),
                observaciones: orden.observaciones ?? '',
                ...exteriorVacio,
                cargo_type: orden.cargo_type ?? '',
                medio_transporte: orden.medio_transporte ?? '',
                incoterm: orden.incoterm ?? '',
                pais_origen: orden.pais_origen ?? '',
                pais_destino: orden.pais_destino ?? '',
                puerto_embarque: orden.puerto_embarque ?? '',
                puerto_destino: orden.puerto_destino ?? '',
                numero_contenedor: orden.numero_contenedor ?? '',
                fecha_embarque_estimada: (orden.fecha_embarque_estimada ?? '').slice(0, 10),
                elaborado_por: orden.elaborado_por ?? '',
                aprobado_por: orden.aprobado_por ?? '',
                aprobador_id: orden.aprobador_id ? String(orden.aprobador_id) : '',
            });
            setItems(
                (orden.detalles ?? []).map((d) => ({
                    producto_id: String(d.presentacion?.producto_id ?? d.presentacion?.producto?.id ?? ''),
                    producto_presentacion_id: String(d.producto_presentacion_id),
                    producto_color_id: d.producto_color_id ? String(d.producto_color_id) : '',
                    color_code: d.color_code ?? '',
                    rollos: d.rollos != null ? String(d.rollos) : '',
                    cantidad: String(d.cantidad),
                    precio_unitario: String(d.precio_unitario),
                })),
            );
        } catch {
            toast.error('No se pudieron cargar los datos de la orden.');
        } finally {
            setLoading(false);
        }
    }, [toast, id]);

    useEffect(() => {
        load();
    }, [load]);

    const productoDe = useCallback(
        (productoId) => productos.find((p) => String(p.id) === String(productoId)) ?? null,
        [productos],
    );

    const presentacionDe = useCallback(
        (productoId, presentacionId) =>
            (productoDe(productoId)?.presentaciones ?? []).find(
                (pres) => String(pres.id) === String(presentacionId),
            ) ?? null,
        [productoDe],
    );

    const productosOptions = useMemo(
        () =>
            productos.map((p) => ({
                value: String(p.id),
                label: p.nombre,
                keywords: `${p.codigo ?? ''} ${p.codigo_barras ?? ''}`,
            })),
        [productos],
    );

    /** Unidades (presentaciones activas) del producto elegido. */
    const unidadesDe = useCallback(
        (productoId) =>
            (productoDe(productoId)?.presentaciones ?? [])
                .filter((pres) => pres.activo !== false)
                .map((pres) => ({ value: String(pres.id), label: pres.nombre })),
        [productoDe],
    );

    const productoPanel = productoDe(panel.producto_id);
    const unidadesPanel = unidadesDe(panel.producto_id);

    const stockPanel = useMemo(() => {
        if (!productoPanel) return '';
        const cantidad = stockPorProducto[String(productoPanel.id)] ?? 0;
        const abrev = productoPanel.unidad_medida?.abreviatura ?? '';
        return `${new Intl.NumberFormat('es-PE').format(cantidad)}${abrev ? ` ${abrev}` : ''}`;
    }, [productoPanel, stockPorProducto]);

    /**
     * Al elegir el proveedor se llena el país de origen con el suyo (CHINA - CN).
     * No pisa lo que se escribió a mano: solo se rellena si estaba vacío o si era
     * el país del proveedor anterior.
     */
    const elegirProveedor = (valor) => {
        const proveedor = proveedores.find((p) => String(p.id) === String(valor));
        setForm((prev) => {
            const anterior = proveedores.find((p) => String(p.id) === String(prev.proveedor_id));
            const rellenar = !prev.pais_origen || prev.pais_origen === paisConCodigo(anterior?.pais);

            return {
                ...prev,
                proveedor_id: valor ?? '',
                ...(proveedor?.pais && rellenar ? { pais_origen: paisConCodigo(proveedor.pais) } : {}),
            };
        });
        if (formErrors.proveedor_id) setFormErrors((prev) => ({ ...prev, proveedor_id: undefined }));
    };

    const setField = (name, value) => {
        setForm((prev) => ({ ...prev, [name]: value }));
        if (formErrors[name]) setFormErrors((prev) => ({ ...prev, [name]: undefined }));
    };

    const setPanelCampo = (patch) => setPanel((prev) => ({ ...prev, ...patch }));

    const elegirProducto = (productoId) => {
        // Una tela se compra por color, en una tabla (rollos, factor, precio).
        const producto = productoDe(productoId);
        if (producto && presentacionMetroDe(producto)) {
            setTelaCompra(producto);
            limpiarPanel();
            return;
        }

        const unidades = unidadesDe(productoId);
        const presentacionId = unidades.length === 1 ? unidades[0].value : '';
        setPanel({
            producto_id: productoId,
            producto_presentacion_id: presentacionId,
            // Otro producto, otro color: nunca se hereda del anterior.
            producto_color_id: '',
            rollos: '',
            cantidad: '1',
            precio_unitario: presentacionId
                ? String(Number(presentacionDe(productoId, presentacionId)?.precio_compra) || 0)
                : '0',
        });
    };

    const elegirUnidad = (presentacionId) =>
        setPanelCampo({
            producto_presentacion_id: presentacionId,
            precio_unitario: String(
                Number(presentacionDe(panel.producto_id, presentacionId)?.precio_compra) || 0,
            ),
        });

    /**
     * Resultado del buscador avanzado: llegan los productos marcados con su unidad y
     * la cantidad escrita ahí mismo. Van directo a la tabla.
     */
    const agregarDesdePicker = (seleccionados) => {
        const utiles = seleccionados.filter((s) => s.presentacion && s.cantidad > 0);
        if (utiles.length === 0) return;

        setItems((prev) => {
            let next = [...prev];

            utiles.forEach(({ producto, presentacion, cantidad, color, rollos, precio, compra }) => {
                // Un color de una tela, de su tabla de compra.
                if (compra) {
                    next = sumarTela(next, { producto, presentacion, color, rollos, cantidad, precio });
                    return;
                }

                // El buscador no elige color, así que solo se acumula sobre
                // líneas que tampoco lo tengan.
                const i = next.findIndex(
                    (it) =>
                        String(it.producto_presentacion_id) === String(presentacion.id) &&
                        !it.producto_color_id,
                );
                if (i !== -1) {
                    next[i] = {
                        ...next[i],
                        cantidad: String((Number(next[i].cantidad) || 0) + cantidad),
                    };
                } else {
                    next.push({
                        producto_id: String(producto.id),
                        producto_presentacion_id: String(presentacion.id),
                        producto_color_id: '',
                        rollos: '',
                        cantidad: String(cantidad),
                        precio_unitario: String(Number(presentacion.precio_compra) || 0),
                    });
                }
            });

            return next;
        });

        toast.success(
            utiles.length === 1 ? 'Producto agregado.' : `${utiles.length} productos agregados.`,
        );
        limpiarPanel();
    };

    const limpiarPanel = () => setPanel({ ...panelVacio });

    /** Suma un color de una tela a las líneas: si ya estaba, se le suman rollos y metros. */
    const sumarTela = (lista, { producto, presentacion, color, rollos, cantidad, precio }) => {
        const next = [...lista];
        const i = next.findIndex(
            (it) =>
                String(it.producto_presentacion_id) === String(presentacion.id) &&
                String(it.producto_color_id || '') === String(color?.id ?? ''),
        );

        if (i !== -1) {
            next[i] = {
                ...next[i],
                rollos: String((Number(next[i].rollos) || 0) + rollos),
                cantidad: String(Math.round(((Number(next[i].cantidad) || 0) + cantidad) * 100) / 100),
                precio_unitario: String(precio),
            };
        } else {
            next.push({
                producto_id: String(producto.id),
                producto_presentacion_id: String(presentacion.id),
                producto_color_id: color ? String(color.id) : '',
                rollos: String(rollos),
                cantidad: String(cantidad),
                precio_unitario: String(precio),
            });
        }

        return next;
    };

    /** De la tabla de una tela: una línea por color con rollos. */
    const agregarTela = ({ producto, presentacion, lineas }) => {
        setItems((prev) =>
            lineas.reduce(
                (acc, l) =>
                    sumarTela(acc, { producto, presentacion, color: l.color, rollos: l.rollos, cantidad: l.metros, precio: l.precio }),
                prev,
            ),
        );
        setTelaCompra(null);
        toast.success(`${producto.nombre}: ${lineas.length} color${lineas.length === 1 ? '' : 'es'} agregado${lineas.length === 1 ? '' : 's'}.`);
    };

    const agregarProducto = () => {
        if (!panel.producto_id) return toast.error('Busca y elige un producto.');
        if (!panel.producto_presentacion_id) return toast.error('Elige la unidad de medida.');
        if (!(Number(panel.cantidad) > 0)) return toast.error('La cantidad debe ser mayor a 0.');

        const nuevo = {
            producto_id: panel.producto_id,
            producto_presentacion_id: panel.producto_presentacion_id,
            producto_color_id: panel.producto_color_id || '',
            rollos: panel.rollos || '',
            cantidad: panel.cantidad,
            precio_unitario: panel.precio_unitario || '0',
        };

        // Se acumula en la misma línea si coincide presentación y color; un
        // color distinto de la misma tela es una línea aparte.
        const yaEsta = items.findIndex(
            (it) =>
                String(it.producto_presentacion_id) === String(nuevo.producto_presentacion_id) &&
                String(it.producto_color_id || '') === String(nuevo.producto_color_id || ''),
        );
        if (yaEsta !== -1) {
            setItems((prev) =>
                prev.map((it, i) =>
                    i === yaEsta
                        ? {
                              ...it,
                              cantidad: String((Number(it.cantidad) || 0) + (Number(nuevo.cantidad) || 0)),
                              rollos: String((Number(it.rollos) || 0) + (Number(nuevo.rollos) || 0)),
                              precio_unitario: nuevo.precio_unitario,
                          }
                        : it,
                ),
            );
            toast.success('Se sumó la cantidad al producto ya agregado.');
        } else {
            setItems((prev) => [...prev, nuevo]);
        }
        limpiarPanel();
    };

    const setItem = (i, patch) =>
        setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));

    /**
     * Cambiar los rollos de un color mantiene el factor (los metros de cada
     * rollo) y recalcula los metros: 1 rollo de 70 m → 11 rollos = 770 m. Sin
     * esto el factor, que es metros ÷ rollos, cambiaría al teclear los rollos.
     * Si se borran los rollos, el factor se recuerda para cuando se vuelvan a poner.
     */
    const cambiarRollos = (i, valor) =>
        setItems((prev) =>
            prev.map((it, idx) => {
                if (idx !== i) return it;
                const antes = Number(it.rollos) || 0;
                const factor = it.factor_rollo || (antes > 0 ? (Number(it.cantidad) || 0) / antes : 0);
                const rollos = Number(valor) || 0;
                return {
                    ...it,
                    rollos: valor,
                    factor_rollo: factor > 0 ? factor : it.factor_rollo,
                    ...(factor > 0 && rollos > 0 ? { cantidad: String(Math.round(rollos * factor * 100) / 100) } : {}),
                };
            }),
        );

    /** Cambiar la unidad de una fila trae el precio de compra de esa presentación. */
    const cambiarUnidadItem = (i, presentacionId) =>
        setItem(i, {
            producto_presentacion_id: presentacionId,
            precio_unitario: String(
                Number(presentacionDe(items[i].producto_id, presentacionId)?.precio_compra) || 0,
            ),
        });

    const quitarItem = (i) => setItems((prev) => prev.filter((_, idx) => idx !== i));
    /** Quita de una vez todos los colores de una tela. */
    const quitarVarias = (indices) => setItems((prev) => prev.filter((_, j) => !indices.includes(j)));
    /** Un solo precio por metro para todos los colores de una tela. */
    const precioDeTela = (indices, valor) =>
        setItems((prev) => prev.map((it, j) => (indices.includes(j) ? { ...it, precio_unitario: valor } : it)));
    const alternar = (clave) => setAbiertas((prev) => ({ ...prev, [clave]: !prev[clave] }));

    /**
     * Lo que se ve en la tabla, como en el pedido: cada tela es una sola fila
     * (sus colores se despliegan debajo); lo demás va línea por línea.
     */
    const filasTabla = useMemo(() => {
        const filas = [];
        const telas = new Map();

        items.forEach((it, i) => {
            const esTela = Boolean(presentacionMetroDe(productos.find((p) => String(p.id) === String(it.producto_id))));
            if (!esTela) {
                filas.push({ tipo: 'linea', clave: `l${i}`, it, i });
                return;
            }
            const clave = String(it.producto_id);
            if (!telas.has(clave)) {
                const tela = { tipo: 'tela', clave, producto_id: it.producto_id, indices: [] };
                telas.set(clave, tela);
                filas.push(tela);
            }
            telas.get(clave).indices.push(i);
        });

        return filas;
    }, [items, productos]);

    const total = items.reduce(
        (acc, it) => acc + (Number(it.cantidad) || 0) * (Number(it.precio_unitario) || 0),
        0,
    );

    const guardar = async () => {
        if (items.length === 0) {
            toast.error('Agrega al menos un producto.');
            return;
        }

        setSaving(true);
        setFormErrors({});

        // El código lo asigna el backend: OCN-001 (nacional) u OCE-001 (exterior).
        const payload = {
            tipo: form.tipo,
            proveedor_id: form.proveedor_id,
            fecha_emision: form.fecha_emision,
            fecha_entrega_estimada: form.fecha_entrega_estimada || null,
            moneda: form.moneda,
            observaciones: form.observaciones,
            // Los campos de embarque solo importan en una compra al exterior;
            // se mandan igual, el backend los ignora si la orden es nacional.
            cargo_type: form.cargo_type || null,
            medio_transporte: form.medio_transporte || null,
            incoterm: form.incoterm || null,
            pais_origen: form.pais_origen || null,
            pais_destino: form.pais_destino || null,
            puerto_embarque: form.puerto_embarque || null,
            puerto_destino: form.puerto_destino || null,
            numero_contenedor: form.numero_contenedor || null,
            fecha_embarque_estimada: form.fecha_embarque_estimada || null,
            elaborado_por: form.elaborado_por || null,
            aprobado_por: form.aprobado_por || null,
            aprobador_id: form.aprobador_id || null,
            detalles: items.map((it) => ({
                producto_presentacion_id: it.producto_presentacion_id,
                producto_color_id: it.producto_color_id || null,
                color_code: it.color_code?.trim() || null,
                rollos: it.rollos !== '' ? Number(it.rollos) : null,
                cantidad: it.cantidad,
                precio_unitario: it.precio_unitario || 0,
            })),
        };

        try {
            if (editando) await api.put(`/ordenes-compra/${id}`, payload);
            else await api.post('/ordenes-compra', payload);

            toast.success(editando ? 'Orden actualizada correctamente.' : 'Orden de compra creada correctamente.');
            navigate('/ordenes-compra');
        } catch (err) {
            const errores = err.response?.data?.errors;
            if (err.response?.status === 422 && errores) {
                setFormErrors(
                    Object.fromEntries(Object.entries(errores).map(([k, v]) => [k, v[0]])),
                );
                toast.error('Revisa los datos del formulario.');
            } else {
                // El backend bloquea editar una orden ya transformada en compra.
                toast.error(err.response?.data?.message ?? 'No se pudo guardar la orden.');
            }
        } finally {
            setSaving(false);
        }
    };

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
            <div className="mb-6 flex items-center gap-3">
                <button
                    onClick={() => navigate('/ordenes-compra')}
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-edge text-gray-500 transition hover:bg-gray-50 hover:text-gray-800"
                    aria-label="Volver"
                >
                    <ArrowLeft className="h-4 w-4" />
                </button>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
                    <FileText className="h-5 w-5" />
                </div>
                <div>
                    <h1 className="text-xl font-bold tracking-tight text-warm-900">
                        {editando ? `Editar Orden ${codigo}` : 'Crear Orden de Compra'}
                    </h1>
                    <p className="text-sm text-warm-500">Pedido formal de productos al proveedor</p>
                </div>
            </div>

            <Modal
                open={modalExterior}
                onClose={() => setModalExterior(false)}
                title="Compra al exterior"
                description="Para la orden de importación (Purchase Order) que se envía al proveedor."
                size="2xl"
                footer={
                    <Button type="button" onClick={() => setModalExterior(false)}>
                        Listo
                    </Button>
                }
            >
                <div className="space-y-6">
                    {/* Qué se embarca y cómo */}
                    <section>
                        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Embarque</h3>
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                            <Select
                                label="Tipo de carga"
                                value={form.cargo_type}
                                onChange={(e) => setField('cargo_type', e.target.value)}
                                options={[
                                    { value: '', label: '—' },
                                    { value: 'FCL', label: 'FCL (contenedor completo)' },
                                    { value: 'LCL', label: 'LCL (carga consolidada)' },
                                ]}
                            />
                            <Select
                                label="Medio de embarque"
                                value={form.medio_transporte}
                                onChange={(e) => setField('medio_transporte', e.target.value)}
                                options={[
                                    { value: '', label: '—' },
                                    { value: 'SEAFREIGHT', label: 'Marítimo (seafreight)' },
                                    { value: 'AIRFREIGHT', label: 'Aéreo (airfreight)' },
                                ]}
                            />
                            <Select
                                label="Incoterm"
                                value={form.incoterm}
                                onChange={(e) => setField('incoterm', e.target.value)}
                                options={[
                                    { value: '', label: '—' },
                                    { value: 'FOB', label: 'FOB' },
                                    { value: 'CIF', label: 'CIF' },
                                    { value: 'CFR', label: 'CFR' },
                                    { value: 'EXW', label: 'EXW' },
                                    { value: 'DDP', label: 'DDP' },
                                ]}
                            />
                            {/* Cuántos contenedores y de qué tipo: sale "2X40 HC". */}
                            <ContenedorSelect className="md:col-span-2" value={form.numero_contenedor} onChange={(v) => setField('numero_contenedor', v)} />
                            <Input
                                label="Fecha de embarque"
                                type="date"
                                value={form.fecha_embarque_estimada}
                                onChange={(e) => setField('fecha_embarque_estimada', e.target.value)}
                            />
                        </div>
                    </section>

                    {/* De dónde a dónde */}
                    <section>
                        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Ruta</h3>
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <Input
                                label="País de origen"
                                placeholder="CHINA - CN"
                                value={form.pais_origen}
                                onChange={(e) => setField('pais_origen', e.target.value)}
                            />
                            <Input
                                label="País de destino"
                                placeholder="PERÚ - PE"
                                value={form.pais_destino}
                                onChange={(e) => setField('pais_destino', e.target.value)}
                            />
                            {/* Los puertos son una lista que se administra con el icono de más. */}
                            <CatalogoSelect
                                label="Puerto de embarque"
                                titulo="Puertos"
                                endpoint="/puertos"
                                value={form.puerto_embarque}
                                onChange={(v) => setField('puerto_embarque', v)}
                                placeholder="—"
                            />
                            <CatalogoSelect
                                label="Puerto de llegada"
                                titulo="Puertos"
                                endpoint="/puertos"
                                value={form.puerto_destino}
                                onChange={(v) => setField('puerto_destino', v)}
                                placeholder="—"
                            />
                        </div>
                    </section>

                    {/* Quién la elabora y la aprueba */}
                    <section>
                        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Responsables</h3>
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <Input
                                label="Elaborado por"
                                value={form.elaborado_por}
                                onChange={(e) => setField('elaborado_por', e.target.value)}
                            />
                            {/* Se elige de la lista: solo esa persona podrá aprobar la orden. */}
                            <div>
                                <SearchSelect
                                    label="Aprobado por"
                                    value={form.aprobador_id}
                                    onChange={(v) => setField('aprobador_id', v ?? '')}
                                    options={aprobadores.map((u) => ({ value: String(u.id), label: u.name }))}
                                    placeholder="Elige quién aprueba…"
                                    emptyText="Sin coincidencias"
                                />
                                <p className="mt-1 text-xs text-warm-400">Solo esta persona podrá aprobar la orden.</p>
                            </div>
                        </div>
                    </section>
                </div>
            </Modal>

            {/* Productos a la izquierda, datos de la orden a la derecha. */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_380px] *:min-w-0">
                {/* Columna izquierda: buscador y tabla de productos */}
                <div className="space-y-6">
                    {/* Panel de búsqueda y alta de producto */}
                    <div className="rounded-xl border border-edge bg-white p-5 shadow-sm">
                        <h2 className="mb-3 text-sm font-semibold text-warm-900">Buscar Producto</h2>

                        <SearchSelect
                            value={panel.producto_id}
                            onChange={elegirProducto}
                            options={productosOptions}
                            placeholder="Buscar producto por nombre o código…"
                            emptyText="Sin coincidencias"
                            searchTitle="Buscador avanzado con filtros"
                            onSearch={(q) => setPicker({ open: true, query: q })}
                        />

                        <div className="mt-4">
                            <label className="mb-1 block text-sm font-medium text-gray-700">Descripción</label>
                            <input
                                readOnly
                                value={productoPanel?.descripcion ?? productoPanel?.nombre ?? ''}
                                placeholder="—"
                                className="block w-full rounded-md border-0 bg-white px-3 py-2 text-sm text-warm-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400"
                            />
                        </div>

                        {/* Solo si la tela tiene colores registrados: hay insumos
                            (hilos, cierres) que no se piden por color. */}
                        {productoPanel?.colores?.length > 0 && (
                            <div className="mt-4 grid grid-cols-2 gap-4">
                                <ColorSelect
                                    colores={productoPanel.colores}
                                    value={panel.producto_color_id}
                                    onChange={(id) => setPanelCampo({ producto_color_id: id })}
                                />
                                <Input
                                    label="Rollos"
                                    type="number"
                                    min="0"
                                    step="1"
                                    placeholder="Cuántos rollos de ese color"
                                    value={panel.rollos}
                                    onChange={(e) => setPanelCampo({ rollos: e.target.value })}
                                />
                            </div>
                        )}

                        <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
                            <div>
                                <label className="mb-1 block text-sm font-medium text-gray-700">Stock</label>
                                <input
                                    readOnly
                                    value={stockPanel}
                                    placeholder="—"
                                    className="block w-full rounded-md border-0 bg-gray-50 px-3 py-2 text-center text-sm text-gray-500 shadow-sm ring-1 ring-inset ring-gray-300"
                                />
                            </div>
                            <SearchSelect
                                label="Unidad"
                                value={panel.producto_presentacion_id}
                                disabled={!panel.producto_id}
                                clearable={false}
                                placeholder={panel.producto_id ? 'Elegir…' : '—'}
                                emptyText="Sin unidades"
                                onChange={(id) =>
                                    id && String(id) !== String(panel.producto_presentacion_id) && elegirUnidad(id)
                                }
                                options={unidadesPanel}
                            />
                            <Input
                                label="Cantidad"
                                type="number"
                                min="0"
                                step="any"
                                value={panel.cantidad}
                                onChange={(e) => setPanelCampo({ cantidad: e.target.value })}
                                className="text-center"
                            />
                            <Input
                                label="Precio"
                                type="number"
                                min="0"
                                step="any"
                                value={panel.precio_unitario}
                                onChange={(e) => setPanelCampo({ precio_unitario: e.target.value })}
                                className="text-center"
                            />
                        </div>

                        <Button type="button" onClick={agregarProducto} className="mt-4 w-full justify-center md:w-auto md:min-w-[280px]">
                            <Plus className="h-4 w-4" /> Agregar Producto
                        </Button>
                    </div>

                    {/* Productos agregados */}
                    <div className="rounded-xl border border-edge bg-white shadow-sm">
                        <div className="flex items-center justify-between border-b border-edge px-5 py-3">
                            <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-warm-900">
                                <Package className="h-4 w-4 text-primary-600" /> Productos
                            </h2>
                            <span className="text-xs text-warm-500">
                                {items.length} {items.length === 1 ? 'ítem agregado' : 'ítems agregados'}
                            </span>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[980px] text-sm">
                                <thead>
                                    <tr className="bg-primary-600 text-left text-xs font-semibold uppercase tracking-wide text-white">
                                        <th className="px-3 py-2.5 text-center">#</th>
                                        <th className="px-3 py-2.5">Código</th>
                                        <th className="px-3 py-2.5">Producto</th>
                                        <th className="px-3 py-2.5">Color code</th>
                                        <th className="px-3 py-2.5">Color</th>
                                        <th className="px-3 py-2.5">Unidad</th>
                                        <th className="px-3 py-2.5 text-right">Rollos</th>
                                        <th className="px-3 py-2.5 text-right">Cant</th>
                                        <th className="px-3 py-2.5 text-right">P.Unit</th>
                                        <th className="px-3 py-2.5 text-right">Subtotal</th>
                                        <th className="px-3 py-2.5 text-center">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {items.length === 0 && (
                                        <tr>
                                            <td colSpan={11} className="px-3 py-10 text-center text-sm text-warm-500">
                                                Busca un producto arriba para agregarlo a la orden
                                            </td>
                                        </tr>
                                    )}

                                    {filasTabla.map((fila, n) => {
                                        // Una tela: una fila y, al desplegarla, sus colores con los rollos.
                                        if (fila.tipo === 'tela') {
                                            const producto = productoDe(fila.producto_id);
                                            const colores = fila.indices.map((i) => ({ it: items[i], i }));
                                            const rollos = colores.reduce((suma, { it }) => suma + (Number(it.rollos) || 0), 0);
                                            const metros = colores.reduce((suma, { it }) => suma + (Number(it.cantidad) || 0), 0);
                                            const importe = colores.reduce(
                                                (suma, { it }) => suma + (Number(it.cantidad) || 0) * (Number(it.precio_unitario) || 0),
                                                0,
                                            );
                                            const precios = [...new Set(colores.map(({ it }) => String(it.precio_unitario)))];
                                            const abierta = Boolean(abiertas[fila.clave]);
                                            const colorDe = (it) => (producto?.colores ?? []).find((c) => String(c.id) === String(it.producto_color_id));

                                            return (
                                                <Fragment key={fila.clave}>
                                                    <tr className="cursor-pointer transition hover:bg-gray-50" onClick={() => alternar(fila.clave)}>
                                                        <td className="px-3 py-2 text-center text-warm-500">{n + 1}</td>
                                                        <td className="px-3 py-2 font-medium text-warm-900">{producto?.codigo ?? '—'}</td>
                                                        <td className="px-3 py-2">
                                                            <span className="flex items-center gap-2">
                                                                <button
                                                                    type="button"
                                                                    aria-expanded={abierta}
                                                                    aria-label={abierta ? 'Ocultar colores' : 'Ver colores'}
                                                                    className="rounded p-0.5 text-warm-500 hover:bg-gray-100"
                                                                >
                                                                    <ChevronRight className={cn('h-4 w-4 transition-transform duration-300', abierta && 'rotate-90')} />
                                                                </button>
                                                                <span className="font-semibold text-warm-900">{producto?.nombre ?? '—'}</span>
                                                                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-warm-700">
                                                                    {colores.length} color{colores.length === 1 ? '' : 'es'}
                                                                </span>
                                                            </span>
                                                        </td>
                                                        <td className="px-3 py-2 text-warm-600">—</td>
                                                        <td className="px-3 py-2 text-warm-600">—</td>
                                                        <td className="px-3 py-2 text-warm-700">Rollo</td>
                                                        <td className="px-3 py-2 text-right font-medium text-warm-900">{rollos}</td>
                                                        <td className="px-3 py-2 text-right font-medium text-warm-900">{metros ? `${Math.round(metros * 100) / 100} m` : ''}</td>
                                                        {/* Un precio por metro para toda la tela; cada color puede llevar el suyo. */}
                                                        <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                                                            <Input
                                                                type="number"
                                                                min="0"
                                                                step="any"
                                                                value={precios.length === 1 ? precios[0] : ''}
                                                                placeholder={precios.length === 1 ? undefined : 'varios'}
                                                                onChange={(e) => precioDeTela(fila.indices, e.target.value)}
                                                                aria-label={`Precio por metro de ${producto?.nombre}`}
                                                                className="text-right"
                                                            />
                                                            <span className="mt-0.5 block text-right text-[11px] text-warm-500">por metro</span>
                                                        </td>
                                                        <td className="px-3 py-2 text-right font-semibold text-primary-600">{money(importe, form.moneda)}</td>
                                                        <td className="px-3 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                                                            <button
                                                                type="button"
                                                                onClick={() => quitarVarias(fila.indices)}
                                                                aria-label={`Quitar ${producto?.nombre}`}
                                                                className="rounded-md p-1.5 text-red-600 transition hover:bg-red-50"
                                                            >
                                                                <Trash2 className="h-4 w-4" />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                    {/* Los colores se despliegan con una animación de altura. */}
                                                    <tr className="border-b-0">
                                                        <td colSpan={11} className="p-0">
                                                            <div className={cn('grid transition-[grid-template-rows] duration-300 ease-out', abierta ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
                                                                <div className="overflow-hidden">
                                                                    <div className={cn('bg-gray-50/70 py-1 pl-14 pr-3 transition-opacity duration-300', abierta ? 'border-b border-gray-100 opacity-100' : 'opacity-0')}>
                                                                        <div className="grid grid-cols-[8rem_1fr_6rem_6rem_7rem_7rem_7rem_2.5rem] items-center gap-3 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-warm-500">
                                                                            <span>Color code</span>
                                                                            <span>Color</span>
                                                                            <span className="text-right">Rollos</span>
                                                                            <span className="text-right">Factor (m)</span>
                                                                            <span className="text-right">Metros</span>
                                                                            <span className="text-right">Precio por metro</span>
                                                                            <span className="text-right">Subtotal</span>
                                                                            <span />
                                                                        </div>
                                                                        {colores.map(({ it, i }) => {
                                                                            const color = colorDe(it);
                                                                            const rollosIt = Number(it.rollos) || 0;
                                                                            const factor = rollosIt > 0 ? Math.round(((Number(it.cantidad) || 0) / rollosIt) * 100) / 100 : 0;
                                                                            return (
                                                                                <div key={i} className="grid grid-cols-[8rem_1fr_6rem_6rem_7rem_7rem_7rem_2.5rem] items-center gap-3 px-2 py-1.5">
                                                                                    <Input
                                                                                        value={it.color_code ?? ''}
                                                                                        onChange={(e) => setItem(i, { color_code: e.target.value })}
                                                                                        placeholder="Código"
                                                                                        maxLength={50}
                                                                                        aria-label={`Color code de ${producto?.nombre} ${color?.nombre ?? ''}`}
                                                                                        tabIndex={abierta ? 0 : -1}
                                                                                    />
                                                                                    <span className="inline-flex items-center gap-2 font-medium uppercase text-warm-800">
                                                                                        <span className="h-3 w-3 shrink-0 rounded-full ring-1 ring-black/10" style={{ backgroundColor: color?.hex || '#9ca3af' }} />
                                                                                        {color?.nombre ?? 'Sin color'}
                                                                                    </span>
                                                                                    <Input
                                                                                        type="number"
                                                                                        min="0"
                                                                                        step="1"
                                                                                        value={it.rollos}
                                                                                        onChange={(e) => cambiarRollos(i, e.target.value)}
                                                                                        className="text-right"
                                                                                        aria-label={`Rollos de ${producto?.nombre} ${color?.nombre ?? ''}`}
                                                                                        tabIndex={abierta ? 0 : -1}
                                                                                    />
                                                                                    {/* El factor: los metros de cada rollo. Al cambiar los rollos se
                                                                                        mantiene; al cambiar los metros a mano, se recalcula (metros ÷ rollos). */}
                                                                                    <span className="text-right text-warm-700">{factor || '—'}</span>
                                                                                    <Input
                                                                                        type="number"
                                                                                        min="0"
                                                                                        step="any"
                                                                                        value={it.cantidad}
                                                                                        onChange={(e) => setItem(i, { cantidad: e.target.value, factor_rollo: undefined })}
                                                                                        className="text-right"
                                                                                        aria-label={`Metros de ${producto?.nombre} ${color?.nombre ?? ''}`}
                                                                                        tabIndex={abierta ? 0 : -1}
                                                                                    />
                                                                                    <Input
                                                                                        type="number"
                                                                                        min="0"
                                                                                        step="any"
                                                                                        value={it.precio_unitario}
                                                                                        onChange={(e) => setItem(i, { precio_unitario: e.target.value })}
                                                                                        className="text-right"
                                                                                        aria-label={`Precio por metro de ${producto?.nombre} ${color?.nombre ?? ''}`}
                                                                                        tabIndex={abierta ? 0 : -1}
                                                                                    />
                                                                                    <span className="text-right font-medium text-warm-900">
                                                                                        {money((Number(it.cantidad) || 0) * (Number(it.precio_unitario) || 0), form.moneda)}
                                                                                    </span>
                                                                                    <button
                                                                                        type="button"
                                                                                        aria-label={`Quitar ${color?.nombre ?? 'color'}`}
                                                                                        onClick={() => quitarItem(i)}
                                                                                        tabIndex={abierta ? 0 : -1}
                                                                                        className="rounded-md p-1.5 text-red-600 transition hover:bg-red-50"
                                                                                    >
                                                                                        <Trash2 className="h-4 w-4" />
                                                                                    </button>
                                                                                </div>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                </Fragment>
                                            );
                                        }

                                        // Lo demás (hilos, cierres…): una línea por producto.
                                        const { it, i } = fila;
                                        const producto = productoDe(it.producto_id);
                                        const subtotal = (Number(it.cantidad) || 0) * (Number(it.precio_unitario) || 0);
                                        const colorItem = (producto?.colores ?? []).find(
                                            (c) => String(c.id) === String(it.producto_color_id),
                                        );

                                        return (
                                            <tr key={i}>
                                                <td className="px-3 py-2 text-center text-warm-500">{n + 1}</td>
                                                <td className="px-3 py-2 font-medium text-warm-900">{producto?.codigo ?? '—'}</td>
                                                <td className="px-3 py-2 font-semibold text-warm-900">{producto?.nombre ?? '—'}</td>
                                                <td className="px-3 py-2">
                                                    <Input
                                                        value={it.color_code ?? ''}
                                                        onChange={(e) => setItem(i, { color_code: e.target.value })}
                                                        placeholder="Código"
                                                        maxLength={50}
                                                        aria-label="Color code"
                                                    />
                                                </td>
                                                <td className="px-3 py-2 text-warm-600">{colorItem?.nombre ?? '—'}</td>
                                                <td className="px-3 py-2">
                                                    <SearchSelect
                                                        value={it.producto_presentacion_id}
                                                        clearable={false}
                                                        emptyText="Sin unidades"
                                                        onChange={(id) =>
                                                            id &&
                                                            String(id) !== String(it.producto_presentacion_id) &&
                                                            cambiarUnidadItem(i, id)
                                                        }
                                                        options={unidadesDe(it.producto_id)}
                                                        className="min-w-[120px]"
                                                    />
                                                </td>
                                                <td className="px-3 py-2">
                                                    <Input
                                                        type="number"
                                                        min="0"
                                                        step="1"
                                                        value={it.rollos}
                                                        onChange={(e) => setItem(i, { rollos: e.target.value })}
                                                        aria-label="Rollos"
                                                        className="text-right"
                                                    />
                                                </td>
                                                <td className="px-3 py-2">
                                                    <Input
                                                        type="number"
                                                        min="0"
                                                        step="any"
                                                        value={it.cantidad}
                                                        onChange={(e) => setItem(i, { cantidad: e.target.value })}
                                                        aria-label="Cantidad"
                                                        className="text-right"
                                                    />
                                                </td>
                                                <td className="px-3 py-2">
                                                    <Input
                                                        type="number"
                                                        min="0"
                                                        step="any"
                                                        value={it.precio_unitario}
                                                        onChange={(e) => setItem(i, { precio_unitario: e.target.value })}
                                                        aria-label="Precio unitario"
                                                        className="text-right"
                                                    />
                                                </td>
                                                <td className="px-3 py-2 text-right font-semibold text-primary-600">{money(subtotal, form.moneda)}</td>
                                                <td className="px-3 py-2">
                                                    <div className="flex items-center justify-center">
                                                        <button
                                                            type="button"
                                                            onClick={() => quitarItem(i)}
                                                            aria-label="Quitar"
                                                            className="rounded-md p-1.5 text-red-600 transition hover:bg-red-50"
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* Columna derecha: datos de la orden, embarque, observaciones, resumen */}
                <div className="space-y-6 lg:sticky lg:top-6 lg:self-start">
                    {/* Datos de la orden */}
                    <div className="rounded-xl border border-edge bg-white shadow-sm">
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-edge px-5 py-3">
                            <h2 className="text-xs font-bold uppercase tracking-wide text-warm-500">Datos de la orden</h2>

                            {/* Nacional o al exterior: de eso depende si se piden los
                                datos de embarque y en qué moneda se cotiza. */}
                            <div className="inline-flex rounded-lg border border-edge bg-gray-50 p-0.5">
                                {[
                                    { value: 'nacional', label: 'Nacional' },
                                    { value: 'exterior', label: 'Al exterior' },
                                ].map((opcion) => (
                                    <button
                                        key={opcion.value}
                                        type="button"
                                        onClick={() =>
                                            setForm((prev) => {
                                                // El proveedor elegido deja de valer si es del otro tipo.
                                                const elegido = proveedores.find((p) => String(p.id) === String(prev.proveedor_id));
                                                const sigue = !elegido || (elegido.tipo === 'extranjero') === (opcion.value === 'exterior');
                                                return {
                                                    ...prev,
                                                    tipo: opcion.value,
                                                    moneda: opcion.value === 'exterior' ? 'USD' : 'PEN',
                                                    ...(sigue ? {} : { proveedor_id: '' }),
                                                };
                                            })
                                        }
                                        className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
                                            form.tipo === opcion.value
                                                ? 'bg-white text-primary-700 shadow-sm'
                                                : 'text-warm-500 hover:text-warm-700'
                                        }`}
                                    >
                                        {opcion.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4 p-5">
                            {/* Al crear no se muestra: el correlativo lo asigna el backend
                                y todavía no existe. Al editar sí, como referencia. */}
                            {editando && (
                                <div className="col-span-2">
                                    <label className="mb-1 block text-sm font-medium text-gray-700">Código</label>
                                    <input
                                        readOnly
                                        value={codigo}
                                        className="block w-full rounded-md border-0 bg-gray-50 px-3 py-2 text-sm text-gray-500 shadow-sm ring-1 ring-inset ring-gray-300"
                                    />
                                </div>
                            )}
                            <div className="col-span-2">
                                <SearchSelect
                                    label="Proveedor"
                                    value={form.proveedor_id}
                                    onChange={elegirProveedor}
                                    // Solo los del tipo de la orden: nacionales o extranjeros.
                                    options={proveedores
                                        .filter((p) => (p.tipo === 'extranjero') === (form.tipo === 'exterior') || String(p.id) === String(form.proveedor_id))
                                        .map((p) => ({
                                            value: String(p.id),
                                            label: p.codigo_corto ? `${p.nombre} (${p.codigo_corto})` : p.nombre,
                                        }))}
                                    placeholder="Buscar proveedor…"
                                    emptyText="Sin coincidencias"
                                    error={formErrors.proveedor_id}
                                />
                            </div>
                            <Input label="Fecha emisión" type="date" value={form.fecha_emision} onChange={(e) => setField('fecha_emision', e.target.value)} error={formErrors.fecha_emision} />
                            <Input label="Entrega estimada" type="date" value={form.fecha_entrega_estimada} onChange={(e) => setField('fecha_entrega_estimada', e.target.value)} />
                            <div className="col-span-2">
                                <Select
                                    label="Moneda"
                                    value={form.moneda}
                                    onChange={(e) => setField('moneda', e.target.value)}
                                    options={[
                                        { value: 'PEN', label: 'Soles (PEN)' },
                                        { value: 'USD', label: 'Dólares (USD)' },
                                    ]}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Datos de embarque: solo para una orden al exterior. Son muchos
                        campos, así que se editan en un modal aparte. */}
                    {form.tipo === 'exterior' && (
                        <div className="rounded-xl border border-edge bg-white p-5 shadow-sm">
                            <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
                                        <Ship className="h-4 w-4" />
                                    </div>
                                    <h2 className="text-sm font-semibold text-warm-900">Compra al exterior</h2>
                                </div>
                                <Button type="button" variant="secondary" size="sm" onClick={() => setModalExterior(true)}>
                                    <Pencil className="h-4 w-4" /> Editar
                                </Button>
                            </div>
                            <p className="mt-2 text-xs text-warm-500">
                                {form.puerto_embarque || form.incoterm || form.cargo_type
                                    ? [form.cargo_type, form.incoterm, form.puerto_embarque && `desde ${form.puerto_embarque}`]
                                          .filter(Boolean)
                                          .join(' · ')
                                    : 'Para la orden de importación (Purchase Order) que se envía al proveedor.'}
                            </p>
                        </div>
                    )}

                    <div className="rounded-xl border border-edge bg-white p-5 shadow-sm">
                        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-warm-500">Observaciones</h2>
                        <textarea
                            rows={3}
                            value={form.observaciones}
                            onChange={(e) => setField('observaciones', e.target.value)}
                            placeholder="Notas para el proveedor o internas…"
                            className="block w-full resize-none rounded-lg border-0 bg-white p-3 text-sm text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-primary-600"
                        />
                    </div>

                    {/* Resumen */}
                    <div className="rounded-xl border border-edge bg-white p-5 shadow-sm">
                        <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-warm-500">Resumen</h2>
                        <div className="flex items-center justify-between border-t border-edge pt-3">
                            <span className="text-sm font-bold uppercase tracking-wide text-primary-700">Total</span>
                            <span className="text-2xl font-extrabold text-warm-900">{money(total, form.moneda)}</span>
                        </div>
                        <div className="mt-5 flex flex-col gap-2">
                            <Button onClick={guardar} loading={saving} className="w-full justify-center">
                                {editando ? 'Guardar cambios' : 'Crear orden'}
                            </Button>
                            <Button variant="secondary" onClick={() => navigate('/ordenes-compra')} className="w-full justify-center">
                                Cancelar
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            <ProductoPickerModal
                open={picker.open}
                onClose={() => setPicker((prev) => ({ ...prev, open: false }))}
                onSelect={agregarDesdePicker}
                initialQuery={picker.query}
                multiple
                stockFilter
                // Una tela se compra por color: rollos, factor y precio en una tabla.
                porColor="compra"
                moneda={form.moneda}
                productos={productos}
                stockPorProducto={stockPorProducto}
                title="Buscar productos"
            />

            {telaCompra && (
                <TelaCompraModal
                    producto={telaCompra}
                    moneda={form.moneda}
                    onClose={() => setTelaCompra(null)}
                    onAgregar={agregarTela}
                />
            )}
        </Layout>
    );
}
