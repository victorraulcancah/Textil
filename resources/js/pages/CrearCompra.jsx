import { paisConCodigo } from '../lib/paises';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Package, Pencil, Plus, Ship, ShoppingBag, Trash2, Wallet } from 'lucide-react';
import api, { asList } from '../lib/api';
import { useAuth } from '../lib/auth';
import { cargarTipoCambio } from '../lib/moneda';
import { useToast } from '../lib/toast';
import Layout from '../components/Layout';
import MetodoCajaPicker from '../components/MetodoCajaPicker';
import ColorSelect from '../components/ColorSelect';
import GastosCompraModal, { montoEnMonedaCompra } from '../components/GastosCompraModal';
import ProductoPickerModal from '../components/ProductoPickerModal';
import TelaCompraModal, { presentacionMetroDe } from '../components/TelaCompraModal';
import { Button, Input, Modal, SearchSelect, Select, Spinner } from '../components/ui';

const money = (n, moneda = 'PEN') =>
    new Intl.NumberFormat('es-PE', { style: 'currency', currency: moneda || 'PEN' }).format(Number(n) || 0);

const hoy = () => new Date().toISOString().slice(0, 10);

const panelVacio = {
    producto_id: '',
    producto_presentacion_id: '',
    producto_color_id: '',
    rollos: '',
    cantidad: '1',
    costo_unitario: '0',
};
/** `moneda` vacía = la moneda de la compra; "PEN" = se paga con soles. */
const emptyPago = () => ({ tipo: 'efectivo', cuentaId: '', billeteraId: '', monto: '', moneda: '' });

const NOMBRE_MONEDA = { PEN: 'Soles', USD: 'Dólares', CNY: 'Yuanes', EUR: 'Euros' };

const redondear = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** Datos propios de una compra al exterior: iguales a los de la orden de compra. */
const exteriorVacio = {
    cargo_type: '',
    medio_transporte: '',
    incoterm: '',
    pais_destino: 'PERÚ - PE',
    puerto_embarque: '',
    puerto_destino: '',
    fecha_embarque_estimada: '',
    elaborado_por: '',
    aprobado_por: '',
};

export default function CrearCompra() {
    const toast = useToast();
    const { user } = useAuth();
    const navigate = useNavigate();
    /** ?orden=12 → la compra nace de esa orden de compra y queda ligada a ella. */
    const [searchParams] = useSearchParams();
    const ordenCompraId = searchParams.get('orden');
    const [ordenCodigo, setOrdenCodigo] = useState('');
    /** Con :id la pantalla trabaja en modo edición sobre una compra existente. */
    const { id } = useParams();
    const editando = Boolean(id);
    const [numeroCompra, setNumeroCompra] = useState('');

    const [proveedores, setProveedores] = useState([]);
    const [productos, setProductos] = useState([]);
    const [stockPorProducto, setStockPorProducto] = useState({});
    const [cuentas, setCuentas] = useState([]);
    const [billeteras, setBilleteras] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [formErrors, setFormErrors] = useState({});

    const [form, setForm] = useState({
        proveedor_id: '',
        tipo_documento: 'factura',
        serie: '',
        numero: '',
        fecha: hoy(),
        forma_pago: 'contado',
        dias_credito: 0,
        fecha_vencimiento: hoy(),
        flete: '0',
        observaciones: '',

        // Datos del embarque. Solo se piden si la compra viene del exterior.
        es_importacion: false,
        numero_importacion: '',
        contenedor: '',
        precinto: '',
        bl: '',
        pais_origen: '',
        fecha_llegada: '',
        moneda_origen: 'PEN',
        tipo_cambio: '',
        ...exteriorVacio,
    });

    // "Elaborado por": quien entró al sistema, salvo que sea una orden ya guardada o
    // se haya escrito otro nombre. No pisa lo que ya hay.
    useEffect(() => {
        if (id || ordenCompraId || !user?.name) return;
        setForm((prev) => (prev.elaborado_por ? prev : { ...prev, elaborado_por: user.name }));
    }, [id, user?.name]); // eslint-disable-line react-hooks/exhaustive-deps

    /** Panel superior de búsqueda/alta. */
    const [panel, setPanel] = useState({ ...panelVacio });
    /** Productos ya agregados a la compra. */
    const [items, setItems] = useState([]);
    /** Buscador avanzado de productos. */
    const [picker, setPicker] = useState({ open: false, query: '' });
    /** La tela cuya tabla de colores (rollos, factor, precio) se está llenando. */
    const [telaCompra, setTelaCompra] = useState(null);

    const [pagos, setPagos] = useState([emptyPago()]);
    /** Off = un solo método de pago (el caso normal). On = varios métodos. */
    const [mixto, setMixto] = useState(false);
    /** Pago y embarque son muchos campos: se editan en modales aparte. */
    const [modalPago, setModalPago] = useState(false);
    const [modalExterior, setModalExterior] = useState(false);
    /** Otros gastos que se suman al costo de la mercadería (seguro, aduana, transporte…). */
    const [gastos, setGastos] = useState([]);
    const [modalGastos, setModalGastos] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [provRes, prodRes, existRes, cuentasRes, billeterasRes] = await Promise.all([
                api.get('/proveedores'),
                api.get('/productos', { params: { per_page: 500 } }),
                api.get('/existencias'),
                api.get('/cuentas-bancarias'),
                api.get('/billeteras-digitales'),
            ]);
            setProveedores(asList(provRes));
            setProductos(asList(prodRes));
            setCuentas(asList(cuentasRes));
            setBilleteras(asList(billeterasRes));

            // El stock vive por almacén: lo acumulamos por producto (en unidad base).
            setStockPorProducto(
                asList(existRes).reduce((acc, fila) => {
                    const pid = String(fila.producto_id);
                    acc[pid] = (acc[pid] ?? 0) + (Number(fila.stock_actual) || 0);
                    return acc;
                }, {}),
            );

            if (id) {
                // Modo edición: la compra se vuelca al formulario, la tabla y los pagos.
                const { data: compra } = await api.get(`/compras/${id}`);
                setNumeroCompra(compra.numero_compra ?? '');
                setForm({
                    proveedor_id: compra.proveedor_id ? String(compra.proveedor_id) : '',
                    tipo_documento: compra.tipo_documento ?? 'factura',
                    serie: compra.serie ?? '',
                    numero: compra.numero ?? '',
                    fecha: (compra.fecha ?? '').slice(0, 10),
                    forma_pago: compra.forma_pago ?? 'contado',
                    dias_credito: compra.dias_credito ?? 0,
                    fecha_vencimiento: (compra.fecha_vencimiento ?? hoy()).slice(0, 10),
                    flete: String(compra.flete ?? '0'),
                    observaciones: compra.observaciones ?? '',

                    es_importacion: Boolean(compra.es_importacion),
                    numero_importacion: compra.numero_importacion ?? '',
                    contenedor: compra.contenedor ?? '',
                    precinto: compra.precinto ?? '',
                    bl: compra.bl ?? '',
                    pais_origen: compra.pais_origen ?? '',
                    fecha_llegada: (compra.fecha_llegada ?? '').slice(0, 10),
                    moneda_origen: compra.moneda_origen ?? 'PEN',
                    tipo_cambio: compra.tipo_cambio ? String(compra.tipo_cambio) : '',

                    cargo_type: compra.cargo_type ?? '',
                    medio_transporte: compra.medio_transporte ?? '',
                    incoterm: compra.incoterm ?? '',
                    pais_destino: compra.pais_destino ?? '',
                    puerto_embarque: compra.puerto_embarque ?? '',
                    puerto_destino: compra.puerto_destino ?? '',
                    fecha_embarque_estimada: (compra.fecha_embarque_estimada ?? '').slice(0, 10),
                    elaborado_por: compra.elaborado_por ?? '',
                    aprobado_por: compra.aprobado_por ?? '',
                });
                setItems(
                    (compra.detalles ?? []).map((d) => ({
                        producto_id: String(d.presentacion?.producto_id ?? d.presentacion?.producto?.id ?? ''),
                        producto_presentacion_id: String(d.producto_presentacion_id),
                        producto_color_id: d.producto_color_id ? String(d.producto_color_id) : '',
                        color_code: d.color_code ?? '',
                        rollos: d.rollos != null ? String(d.rollos) : '',
                        cantidad: String(d.cantidad),
                        costo_unitario: String(d.costo_unitario),
                    })),
                );

                setGastos(
                    (compra.gastos ?? []).map((g) => ({
                        concepto: g.concepto,
                        monto: String(Number(g.monto_origen)),
                        moneda: g.moneda,
                        incluye_costo: Boolean(g.incluye_costo),
                    })),
                );

                const pagosCompra = (compra.pagos ?? []).map((p) => ({
                    tipo: p.metodo,
                    cuentaId: p.cuenta_bancaria_id ? String(p.cuenta_bancaria_id) : '',
                    billeteraId: p.billetera_id ? String(p.billetera_id) : '',
                    // Pagado en soles: se vuelve a mostrar lo que salió en soles.
                    moneda: p.monto_pen != null ? 'PEN' : '',
                    monto: String(p.monto_pen != null ? Number(p.monto_pen) : p.monto),
                }));
                if (pagosCompra.length) {
                    setPagos(pagosCompra);
                    // Con más de un pago la pantalla arranca en modo mixto.
                    setMixto(pagosCompra.length > 1);
                }
                return;
            }

            if (!ordenCompraId) return;

            // Transformar orden → compra: se copian proveedor, embarque y líneas
            // completas, para no perder lo que ya se llenó en la orden.
            const { data: orden } = await api.get(`/ordenes-compra/${ordenCompraId}`);
            // Una orden solo se transforma en compra cuando ya está aprobada.
            if (!['aprobada', 'enviada', 'parcial', 'completada'].includes(orden.estado)) {
                toast.error('La orden debe estar aprobada para transformarla en compra.');
                navigate('/ordenes-compra');
                return;
            }
            setOrdenCodigo(orden.codigo ?? '');
            const esExterior = orden.tipo === 'exterior';
            setForm((prev) => ({
                ...prev,
                proveedor_id: orden.proveedor_id ? String(orden.proveedor_id) : '',
                fecha: (orden.fecha_emision ?? '').slice(0, 10) || prev.fecha,
                observaciones: orden.observaciones ?? '',

                es_importacion: esExterior,
                pais_origen: orden.pais_origen ?? '',
                contenedor: orden.numero_contenedor ?? '',
                moneda_origen: orden.moneda ?? 'PEN',

                cargo_type: orden.cargo_type ?? '',
                medio_transporte: orden.medio_transporte ?? '',
                incoterm: orden.incoterm ?? '',
                pais_destino: orden.pais_destino ?? '',
                puerto_embarque: orden.puerto_embarque ?? '',
                puerto_destino: orden.puerto_destino ?? '',
                fecha_embarque_estimada: (orden.fecha_embarque_estimada ?? '').slice(0, 10),
                elaborado_por: orden.elaborado_por ?? '',
                aprobado_por: orden.aprobado_por ?? '',
            }));
            setItems(
                (orden.detalles ?? []).map((d) => ({
                    producto_id: String(d.presentacion?.producto_id ?? d.presentacion?.producto?.id ?? ''),
                    producto_presentacion_id: String(d.producto_presentacion_id),
                    producto_color_id: d.producto_color_id ? String(d.producto_color_id) : '',
                    // El color code de cada línea viaja con la orden; se puede corregir aquí.
                    color_code: d.color_code ?? '',
                    rollos: d.rollos != null ? String(d.rollos) : '',
                    cantidad: String(d.cantidad),
                    costo_unitario: String(d.precio_unitario),
                })),
            );
        } catch {
            toast.error('No se pudieron cargar proveedores/productos.');
        } finally {
            setLoading(false);
        }
    }, [toast, ordenCompraId, id]);

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

    /**
     * En dólares, el tipo de cambio se trae solo: el de SUNAT de la fecha de la
     * compra. No pisa uno escrito a mano ni el de una compra ya guardada: solo se
     * rellena si está vacío o si sigue siendo el que se puso solo antes.
     */
    const tcAuto = useRef('');
    const [tcFuente, setTcFuente] = useState(null);
    useEffect(() => {
        if (form.moneda_origen !== 'USD' || !form.fecha) {
            setTcFuente(null);
            return;
        }
        let vigente = true;
        cargarTipoCambio(form.fecha)
            .then((tc) => {
                if (!vigente) return;
                const sunat = tc?.venta ? String(tc.venta) : '';
                setTcFuente(sunat ? tc.fecha_venta : null);
                setForm((prev) => {
                    if (prev.moneda_origen !== 'USD' || !sunat) return prev;
                    const propio = prev.tipo_cambio !== '' && prev.tipo_cambio !== tcAuto.current;
                    if (propio) return prev;
                    tcAuto.current = sunat;
                    return { ...prev, tipo_cambio: sunat };
                });
            })
            .catch(() => vigente && setTcFuente(null));
        return () => {
            vigente = false;
        };
    }, [form.moneda_origen, form.fecha]);

    /** "2026-09-30" + 10 días → "2026-10-10" (con fechas de calendario, sin husos horarios de por medio). */
    const sumarDias = (fecha, dias) => {
        const [y, m, d] = String(fecha).split('-').map(Number);
        if (!y || !m || !d) return '';
        const f = new Date(Date.UTC(y, m - 1, d + (Number(dias) || 0)));
        return f.toISOString().slice(0, 10);
    };
    const diasEntre = (desde, hasta) => {
        const t = (x) => {
            const [y, m, d] = String(x).split('-').map(Number);
            return Date.UTC(y, m - 1, d);
        };
        return Math.max(0, Math.round((t(hasta) - t(desde)) / 86400000));
    };

    /**
     * A crédito, los días y el vencimiento van juntos: los días se cuentan desde la
     * fecha de la compra. Poner los días calcula el vencimiento; cambiar el vencimiento
     * calcula los días; y cambiar la fecha de la compra mueve el vencimiento.
     */
    const setCredito = (campo, valor) =>
        setForm((prev) => {
            if (campo === 'dias_credito') {
                return { ...prev, dias_credito: valor, fecha_vencimiento: sumarDias(prev.fecha, valor) || prev.fecha_vencimiento };
            }
            if (campo === 'fecha_vencimiento') {
                return { ...prev, fecha_vencimiento: valor, dias_credito: valor ? String(diasEntre(prev.fecha, valor)) : prev.dias_credito };
            }
            // 'fecha': el plazo se conserva y el vencimiento se corre con la fecha.
            return { ...prev, fecha: valor, fecha_vencimiento: sumarDias(valor, prev.dias_credito) || prev.fecha_vencimiento };
        });

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
            costo_unitario: presentacionId
                ? String(Number(presentacionDe(productoId, presentacionId)?.precio_compra) || 0)
                : '0',
        });
    };

    const elegirUnidad = (presentacionId) =>
        setPanelCampo({
            producto_presentacion_id: presentacionId,
            costo_unitario: String(
                Number(presentacionDe(panel.producto_id, presentacionId)?.precio_compra) || 0,
            ),
        });

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
                costo_unitario: String(precio),
            };
        } else {
            next.push({
                producto_id: String(producto.id),
                producto_presentacion_id: String(presentacion.id),
                producto_color_id: color ? String(color.id) : '',
                rollos: String(rollos),
                cantidad: String(cantidad),
                costo_unitario: String(precio),
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
                        costo_unitario: String(Number(presentacion.precio_compra) || 0),
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
            costo_unitario: panel.costo_unitario || '0',
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
                              costo_unitario: nuevo.costo_unitario,
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

    /** Cambiar la unidad de una fila trae el precio de compra de esa presentación. */
    const cambiarUnidadItem = (i, presentacionId) =>
        setItem(i, {
            producto_presentacion_id: presentacionId,
            costo_unitario: String(
                Number(presentacionDe(items[i].producto_id, presentacionId)?.precio_compra) || 0,
            ),
        });

    const quitarItem = (i) => setItems((prev) => prev.filter((_, idx) => idx !== i));

    const setPago = (i, patch) => setPagos((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
    const addPago = () => setPagos((prev) => [...prev, emptyPago()]);
    const removePago = (i) => setPagos((prev) => (prev.length === 1 ? prev : prev.filter((_, idx) => idx !== i)));

    const subtotal = items.reduce(
        (acc, it) => acc + (Number(it.cantidad) || 0) * (Number(it.costo_unitario) || 0),
        0,
    );
    const flete = Number(form.flete) || 0;
    const total = subtotal + flete;
    /**
     * El seguro se escribe directo en el resumen, como el flete: es el gasto
     * "SEGURO" de la lista de gastos (mismo que en el modal), en la moneda de la
     * compra y dentro del costo de la mercadería.
     */
    const esSeguro = (g) => g.concepto.trim().toUpperCase() === 'SEGURO';
    const seguro = gastos.find(esSeguro);
    // Tal como se está tecleando; si se cargó en otra moneda desde el modal, ya convertido.
    const seguroMonto = !seguro
        ? ''
        : seguro.moneda === (form.moneda_origen || 'PEN')
          ? seguro.monto
          : montoEnMonedaCompra(seguro, form.moneda_origen || 'PEN', form.tipo_cambio) ?? '';
    const cambiarSeguro = (valor) =>
        setGastos((prev) => {
            const resto = prev.filter((g) => !esSeguro(g));
            if (valor === '') return resto;
            return [{ concepto: 'SEGURO', monto: valor, moneda: form.moneda_origen || 'PEN', incluye_costo: true }, ...resto];
        });

    /** Lo que los gastos marcados suman al costo, en la moneda de la compra. */
    const gastosCosto = gastos.reduce(
        (s, g) => s + (g.incluye_costo ? montoEnMonedaCompra(g, form.moneda_origen || 'PEN', form.tipo_cambio) || 0 : 0),
        0,
    );
    const esContado = form.forma_pago === 'contado';

    /**
     * Una compra en otra moneda se puede pagar con soles: cada pago dice en
     * qué moneda salió, y los soles se llevan a la moneda de la compra con el
     * tipo de cambio que se puso a mano arriba.
     */
    const tipoCambio = Number(form.tipo_cambio) || 0;
    const admiteSoles = Boolean(form.moneda_origen) && form.moneda_origen !== 'PEN';
    const enSoles = (p) => admiteSoles && p.moneda === 'PEN';
    /** Lo que un pago abona a la compra, en la moneda de la compra. */
    const abonoDe = (p) =>
        enSoles(p) ? (tipoCambio > 0 ? redondear((Number(p.monto) || 0) / tipoCambio) : 0) : Number(p.monto) || 0;
    /** El total de la compra en la moneda en que sale ese pago. */
    const totalEn = (p) => (enSoles(p) ? redondear(total * tipoCambio) : total);

    /**
     * En modo simple hay un solo pago: al contado cubre el total automáticamente,
     * y a crédito es un adelanto opcional. El modo mixto abre la lista completa.
     */
    const pagosEfectivos = mixto
        ? pagos
        : [{ ...pagos[0], monto: esContado ? String(totalEn(pagos[0])) : pagos[0].monto }];

    const pagado = pagosEfectivos.reduce((acc, p) => acc + abonoDe(p), 0);
    const saldo = total - pagado;

    /** Cambia la moneda de un pago, llevando lo ya escrito a la otra moneda. */
    const cambiarMonedaPago = (i, moneda) =>
        setPagos((prev) =>
            prev.map((p, idx) => {
                if (idx !== i || p.moneda === moneda) return p;
                const monto = Number(p.monto) || 0;
                if (!monto || tipoCambio <= 0) return { ...p, moneda };
                return {
                    ...p,
                    moneda,
                    monto: String(moneda === 'PEN' ? redondear(monto * tipoCambio) : redondear(monto / tipoCambio)),
                };
            }),
        );

    const alternarMixto = () => {
        setMixto((prev) => {
            // Al abrir el modo mixto, el primer pago arranca con el total pendiente.
            if (!prev && !Number(pagos[0].monto)) {
                setPagos((ps) => ps.map((p, i) => (i === 0 ? { ...p, monto: String(totalEn(p)) } : p)));
            }
            // Al volver a simple se conserva solo el primer pago.
            if (prev) setPagos((ps) => ps.slice(0, 1));
            return !prev;
        });
    };

    /** "Pagar en: Dólares | Soles", solo si la compra no es en soles. */
    const selectorMoneda = (pago, onChange) =>
        admiteSoles ? (
            <div className="inline-flex rounded-lg border border-edge bg-gray-50 p-0.5">
                {[form.moneda_origen, 'PEN'].map((m) => {
                    const activa = (pago.moneda || form.moneda_origen) === m;
                    return (
                        <button
                            key={m}
                            type="button"
                            onClick={() => onChange(m === form.moneda_origen ? '' : 'PEN')}
                            className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
                                activa ? 'bg-white text-primary-700 shadow-sm' : 'text-warm-500 hover:text-warm-700'
                            }`}
                        >
                            {NOMBRE_MONEDA[m] ?? m}
                        </button>
                    );
                })}
            </div>
        ) : null;

    const guardar = async () => {
        if (items.length === 0) {
            toast.error('Agrega al menos un producto.');
            return;
        }

        setSaving(true);
        setFormErrors({});

        const payload = {
            proveedor_id: form.proveedor_id || null,
            ...(ordenCompraId ? { orden_compra_id: ordenCompraId } : {}),
            tipo_documento: form.tipo_documento,
            serie: form.serie,
            numero: form.numero,
            fecha: form.fecha,
            forma_pago: form.forma_pago,
            dias_credito: form.forma_pago === 'credito' ? Number(form.dias_credito) || 0 : 0,
            fecha_vencimiento: form.forma_pago === 'credito' ? form.fecha_vencimiento : null,
            flete,
            gastos: gastos.filter((g) => g.concepto.trim() && Number(g.monto) > 0).map((g) => ({
                concepto: g.concepto,
                monto: Number(g.monto),
                moneda: g.moneda,
                incluye_costo: g.incluye_costo,
            })),
            observaciones: form.observaciones,

            // La moneda se pacta con el proveedor, sea la compra nacional o
            // al exterior: no depende de ese interruptor, por eso va siempre.
            moneda_origen: form.moneda_origen || 'PEN',
            tipo_cambio: form.moneda_origen !== 'PEN' && form.tipo_cambio ? Number(form.tipo_cambio) : null,

            es_importacion: form.es_importacion,
            ...(form.es_importacion
                ? {
                      numero_importacion: form.numero_importacion || null,
                      contenedor: form.contenedor || null,
                      precinto: form.precinto || null,
                      bl: form.bl || null,
                      pais_origen: form.pais_origen || null,
                      fecha_llegada: form.fecha_llegada || null,
                      cargo_type: form.cargo_type || null,
                      medio_transporte: form.medio_transporte || null,
                      incoterm: form.incoterm || null,
                      pais_destino: form.pais_destino || null,
                      puerto_embarque: form.puerto_embarque || null,
                      puerto_destino: form.puerto_destino || null,
                      fecha_embarque_estimada: form.fecha_embarque_estimada || null,
                      elaborado_por: form.elaborado_por || null,
                      aprobado_por: form.aprobado_por || null,
                  }
                : {}),
            detalles: items.map((it) => ({
                producto_presentacion_id: it.producto_presentacion_id,
                producto_color_id: it.producto_color_id || null,
                color_code: it.color_code?.trim() || null,
                rollos: it.rollos !== '' ? Number(it.rollos) : null,
                cantidad: it.cantidad,
                costo_unitario: it.costo_unitario || 0,
            })),
            // Al crédito no se envía ningún pago: la deuda se salda desde
            // Cuentas por Pagar.
            pagos: (esContado ? pagosEfectivos : [])
                .filter((p) => p.tipo && Number(p.monto) > 0)
                .map((p) => ({
                    metodo: p.tipo,
                    cuenta_bancaria_id: p.tipo === 'transferencia' ? p.cuentaId || null : null,
                    billetera_id: p.tipo === 'billetera' ? p.billeteraId || null : null,
                    monto: p.monto,
                    // En soles: el backend abona su equivalente al tipo de cambio.
                    ...(enSoles(p) ? { moneda: 'PEN' } : {}),
                })),
        };

        try {
            if (editando) await api.put(`/compras/${id}`, payload);
            else await api.post('/compras', payload);

            toast.success(editando ? 'Compra actualizada correctamente.' : 'Compra registrada correctamente.');
            navigate('/compras');
        } catch (err) {
            const errores = err.response?.data?.errors;
            if (err.response?.status === 422 && errores) {
                setFormErrors(Object.fromEntries(Object.entries(errores).map(([k, v]) => [k, v[0]])));
                toast.error('Revisa los datos del formulario.');
            } else {
                toast.error(err.response?.data?.message ?? 'No se pudo guardar la compra.');
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
            {/* Encabezado */}
            <div className="mb-6 flex items-center gap-3">
                <button
                    onClick={() => navigate('/compras')}
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-edge text-gray-500 transition hover:bg-gray-50 hover:text-gray-800"
                    aria-label="Volver"
                >
                    <ArrowLeft className="h-4 w-4" />
                </button>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
                    <ShoppingBag className="h-5 w-5" />
                </div>
                <div>
                    <h1 className="text-xl font-bold tracking-tight text-warm-900">
                        {editando ? `Editar Compra ${numeroCompra}` : 'Crear Compra'}
                    </h1>
                    <p className="text-sm text-warm-500">
                        {ordenCodigo
                            ? `Generada desde la orden ${ordenCodigo}`
                            : 'Comprobante del proveedor y registro de pago'}
                    </p>
                </div>
            </div>

            {/* Productos a la izquierda, datos del pedido a la derecha. */}
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
                                label="Costo"
                                type="number"
                                min="0"
                                step="any"
                                value={panel.costo_unitario}
                                onChange={(e) => setPanelCampo({ costo_unitario: e.target.value })}
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
                                        <th className="px-3 py-2.5 text-right">Costo ({form.moneda_origen || 'PEN'})</th>
                                        <th className="px-3 py-2.5 text-right">Subtotal</th>
                                        <th className="px-3 py-2.5 text-center">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {items.length === 0 && (
                                        <tr>
                                            <td colSpan={11} className="px-3 py-10 text-center text-sm text-warm-500">
                                                Busca un producto arriba para agregarlo a la compra
                                            </td>
                                        </tr>
                                    )}

                                    {items.map((it, i) => {
                                        const producto = productoDe(it.producto_id);
                                        const sub = (Number(it.cantidad) || 0) * (Number(it.costo_unitario) || 0);
                                        const colorItem = (producto?.colores ?? []).find(
                                            (c) => String(c.id) === String(it.producto_color_id),
                                        );

                                        return (
                                            <tr key={i}>
                                                <td className="px-3 py-2 text-center text-warm-500">{i + 1}</td>
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
                                                        value={it.costo_unitario}
                                                        onChange={(e) => setItem(i, { costo_unitario: e.target.value })}
                                                        aria-label="Costo unitario"
                                                        className="text-right"
                                                    />
                                                    {/* Es lo que de verdad va a costear el stock: el
                                                        costo en dólares se convierte a soles al
                                                        recepcionar, con este tipo de cambio. */}
                                                    {form.moneda_origen === 'USD' && Number(form.tipo_cambio) > 0 && (
                                                        <p className="mt-0.5 text-right text-[11px] text-warm-400">
                                                            ≈ {money((Number(it.costo_unitario) || 0) * Number(form.tipo_cambio), 'PEN')}
                                                        </p>
                                                    )}
                                                </td>
                                                <td className="px-3 py-2 text-right font-semibold text-primary-600">
                                                    {money(sub, form.moneda_origen)}
                                                </td>
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

                {/* Columna derecha: datos del pedido, pago, embarque, resumen */}
                <div className="space-y-6 lg:sticky lg:top-6 lg:self-start">
                    {/* Datos del comprobante */}
                    <div className="rounded-xl border border-edge bg-white shadow-sm">
                        <div className="border-b border-edge px-5 py-3">
                            <h2 className="text-xs font-bold uppercase tracking-wide text-warm-500">Datos del comprobante</h2>
                        </div>
                        <div className="grid grid-cols-2 gap-4 p-5">
                            <div className="col-span-2">
                                <SearchSelect
                                    label="Proveedor"
                                    value={form.proveedor_id}
                                    onChange={elegirProveedor}
                                    // Solo los del tipo de la compra: nacionales o extranjeros.
                                    options={proveedores
                                        .filter((p) => (p.tipo === 'extranjero') === form.es_importacion || String(p.id) === String(form.proveedor_id))
                                        .map((p) => ({ value: String(p.id), label: p.nombre }))}
                                    placeholder="Buscar proveedor…"
                                    emptyText="Sin coincidencias"
                                    error={formErrors.proveedor_id}
                                />
                            </div>
                            <Input label="Fecha" type="date" value={form.fecha} onChange={(e) => (form.forma_pago === 'credito' ? setCredito('fecha', e.target.value) : setField('fecha', e.target.value))} error={formErrors.fecha} />
                            <Select
                                label="Tipo documento"
                                value={form.tipo_documento}
                                onChange={(e) =>
                                    // El comprobante de un no domiciliado trae un solo número (el de la
                                    // invoice): no lleva serie.
                                    setForm((prev) => ({
                                        ...prev,
                                        tipo_documento: e.target.value,
                                        ...(e.target.value === 'no_domiciliado' ? { serie: '' } : {}),
                                    }))
                                }
                                options={[
                                    { value: 'factura', label: 'Factura' },
                                    { value: 'boleta', label: 'Boleta' },
                                    { value: 'no_domiciliado', label: 'Comprobante no domiciliado' },
                                ]}
                            />
                            {form.tipo_documento === 'no_domiciliado' ? (
                                <Input
                                    label="Factura / Invoice"
                                    placeholder="N° de la factura del proveedor"
                                    value={form.numero}
                                    onChange={(e) => setField('numero', e.target.value)}
                                    error={formErrors.numero}
                                />
                            ) : (
                                <>
                                    <Input label="Serie" placeholder="F001" value={form.serie} onChange={(e) => setField('serie', e.target.value)} error={formErrors.serie} />
                                    <Input label="Número" placeholder="00000000" value={form.numero} onChange={(e) => setField('numero', e.target.value)} error={formErrors.numero} />
                                </>
                            )}
                            <div className="col-span-2">
                                <Select
                                    label="Forma de pago"
                                    value={form.forma_pago}
                                    onChange={(e) => {
                                        setField('forma_pago', e.target.value);
                                        if (e.target.value === 'credito') setCredito('dias_credito', form.dias_credito);
                                    }}
                                    options={[
                                        { value: 'contado', label: 'Contado' },
                                        { value: 'credito', label: 'Crédito' },
                                    ]}
                                />
                            </div>
                            {form.forma_pago === 'credito' && (
                                <>
                                    <Input label="N° días" type="number" min="0" value={form.dias_credito} onChange={(e) => setCredito('dias_credito', e.target.value)} />
                                    <Input label="Vencimiento" type="date" value={form.fecha_vencimiento} onChange={(e) => setCredito('fecha_vencimiento', e.target.value)} />
                                </>
                            )}
                        </div>
                    </div>

                    {/* Al crédito no se cobra al registrar: la compra genera una
                        cuenta por pagar y ahí se registran los pagos. */}
                    {esContado && (
                    <div className="rounded-xl border border-edge bg-white p-5 shadow-sm">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <h2 className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-warm-500">
                                    <Wallet className="h-4 w-4" /> Pago
                                </h2>
                                <p className="mt-1 text-sm text-warm-900">
                                    {mixto
                                        ? `${pagos.length} métodos · Pagado ${money(pagado, form.moneda_origen)}`
                                        : `${pagos[0].tipo === 'efectivo' ? 'Efectivo' : pagos[0].tipo === 'transferencia' ? 'Transferencia' : 'Billetera'} · ${
                                              enSoles(pagos[0])
                                                  ? `${money(totalEn(pagos[0]), 'PEN')} (= ${money(total, form.moneda_origen)})`
                                                  : money(total, form.moneda_origen)
                                          }`}
                                </p>
                                {mixto && Math.abs(saldo) > 0.001 && (
                                    <p className={`mt-0.5 text-xs font-semibold ${saldo > 0 ? 'text-amber-600' : 'text-red-600'}`}>
                                        {saldo > 0 ? 'Saldo por pagar' : 'Exceso'}: {money(Math.abs(saldo), form.moneda_origen)}
                                    </p>
                                )}
                            </div>
                            <Button type="button" variant="secondary" onClick={() => setModalPago(true)}>
                                <Pencil className="h-4 w-4" /> Editar pago
                            </Button>
                        </div>
                    </div>
                    )}

                    <Modal
                        open={modalPago}
                        onClose={() => setModalPago(false)}
                        title="Pago"
                        size="lg"
                        footer={
                            <Button type="button" onClick={() => setModalPago(false)}>
                                Listo
                            </Button>
                        }
                    >
                        <div className="mb-4 flex items-center justify-between">
                            <span className="text-sm font-medium text-warm-700">Modo de pago</span>
                            <button
                                type="button"
                                role="switch"
                                aria-checked={mixto}
                                onClick={alternarMixto}
                                className="inline-flex items-center gap-2 text-xs font-semibold text-warm-500 transition hover:text-warm-900"
                            >
                                Pago mixto
                                <span
                                    className={`relative block h-5 w-9 rounded-full transition ${mixto ? 'bg-primary-600' : 'bg-gray-300'}`}
                                >
                                    <span
                                        className={`absolute top-0.5 block h-4 w-4 rounded-full bg-white shadow transition-all ${mixto ? 'left-[1.125rem]' : 'left-0.5'}`}
                                    />
                                </span>
                            </button>
                        </div>

                        {/* Modo simple: un método y listo. */}
                        {!mixto && (
                            <div className="space-y-3">
                                <MetodoCajaPicker
                                    cuentas={cuentas}
                                    billeteras={billeteras}
                                    tipo={pagos[0].tipo}
                                    cuentaId={pagos[0].cuentaId}
                                    billeteraId={pagos[0].billeteraId}
                                    onChange={({ tipo, cuentaId, billeteraId }) => setPago(0, { tipo, cuentaId, billeteraId })}
                                />

                                {admiteSoles && (
                                    <div className="flex items-center justify-between gap-3">
                                        <span className="text-sm font-medium text-warm-700">Pagar en</span>
                                        {selectorMoneda(pagos[0], (moneda) => setPago(0, { moneda }))}
                                    </div>
                                )}

                                {esContado ? (
                                    <div className="rounded-lg bg-primary-50 px-3 py-2.5 text-sm">
                                        <div className="flex items-center justify-between">
                                            <span className="text-warm-500">Se paga el total</span>
                                            <span className="font-bold text-primary-700">
                                                {enSoles(pagos[0]) && tipoCambio <= 0
                                                    ? '—'
                                                    : money(totalEn(pagos[0]), enSoles(pagos[0]) ? 'PEN' : form.moneda_origen)}
                                            </span>
                                        </div>
                                        {enSoles(pagos[0]) && (
                                            <p className="mt-1 text-right text-xs text-warm-500">
                                                {tipoCambio > 0
                                                    ? `= ${money(total, form.moneda_origen)} al tipo de cambio ${tipoCambio}`
                                                    : 'Pon el tipo de cambio de la compra para calcular cuánto es en soles.'}
                                            </p>
                                        )}
                                    </div>
                                ) : (
                                    <Input
                                        label="Adelanto (opcional)"
                                        type="number"
                                        min="0"
                                        step="any"
                                        placeholder="0.00"
                                        value={pagos[0].monto}
                                        onChange={(e) => setPago(0, { monto: e.target.value })}
                                        className="text-right"
                                    />
                                )}
                            </div>
                        )}

                        {/* Modo mixto: varios métodos con su monto. */}
                        {mixto && (
                            <>
                                <div className="space-y-3">
                                    {pagos.map((p, i) => (
                                        <div key={i} className="rounded-lg border border-edge p-3">
                                            <MetodoCajaPicker
                                                cuentas={cuentas} billeteras={billeteras}
                                                tipo={p.tipo} cuentaId={p.cuentaId} billeteraId={p.billeteraId}
                                                onChange={({ tipo, cuentaId, billeteraId }) => setPago(i, { tipo, cuentaId, billeteraId })}
                                            />
                                            <div className="mt-2 flex items-center gap-2">
                                                {selectorMoneda(p, (moneda) => cambiarMonedaPago(i, moneda))}
                                                <Input type="number" min="0" step="any" placeholder={enSoles(p) ? 'Monto en soles' : 'Monto'} value={p.monto} onChange={(e) => setPago(i, { monto: e.target.value })} className="text-right" />
                                                <button type="button" onClick={() => removePago(i)} disabled={pagos.length === 1}
                                                    className="rounded-md p-2 text-red-600 transition hover:bg-red-50 disabled:opacity-40" aria-label="Quitar">
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            </div>
                                            {enSoles(p) && (
                                                <p className="mt-1 text-right text-xs text-warm-500">
                                                    {tipoCambio > 0
                                                        ? `= ${money(abonoDe(p), form.moneda_origen)} al tipo de cambio ${tipoCambio}`
                                                        : 'Pon el tipo de cambio de la compra para convertir los soles.'}
                                                </p>
                                            )}
                                        </div>
                                    ))}
                                </div>

                                <Button type="button" variant="ghost" size="sm" onClick={addPago} className="mt-3">
                                    <Plus className="h-4 w-4" /> Agregar pago
                                </Button>

                                <div className="mt-3 flex justify-between border-t border-dashed border-edge pt-2 text-sm">
                                    <span className="text-warm-500">Pagado</span>
                                    <span className="font-semibold text-green-600">{money(pagado, form.moneda_origen)}</span>
                                </div>
                                {Math.abs(saldo) > 0.001 && (
                                    <div className="flex justify-between text-sm">
                                        <span className="text-warm-500">{saldo > 0 ? 'Saldo por pagar' : 'Exceso'}</span>
                                        <span className={saldo > 0 ? 'font-semibold text-amber-600' : 'font-semibold text-red-600'}>{money(Math.abs(saldo), form.moneda_origen)}</span>
                                    </div>
                                )}
                            </>
                        )}
                    </Modal>

                    {/* Nacional o al exterior: igual que en la orden de compra, para
                        que ambas pantallas se vean y se sientan lo mismo. La moneda es
                        aparte: una compra nacional también puede pactarse en dólares
                        (el proveedor factura en USD aunque la mercadería no venga de
                        afuera), así que no depende de este interruptor. */}
                    <div className="rounded-xl border border-edge bg-white p-5 shadow-sm">
                        <div className="flex items-center justify-between gap-3">
                            <div className="inline-flex rounded-lg border border-edge bg-gray-50 p-0.5">
                                {[
                                    { value: false, label: 'Nacional' },
                                    { value: true, label: 'Al exterior' },
                                ].map((opcion) => (
                                    <button
                                        key={String(opcion.value)}
                                        type="button"
                                        onClick={() =>
                                            setForm((prev) => {
                                                // El proveedor elegido deja de valer si es del otro tipo.
                                                const elegido = proveedores.find((p) => String(p.id) === String(prev.proveedor_id));
                                                const sigue = !elegido || (elegido.tipo === 'extranjero') === opcion.value;
                                                return { ...prev, es_importacion: opcion.value, ...(sigue ? {} : { proveedor_id: '' }) };
                                            })
                                        }
                                        className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
                                            form.es_importacion === opcion.value
                                                ? 'bg-white text-primary-700 shadow-sm'
                                                : 'text-warm-500 hover:text-warm-700'
                                        }`}
                                    >
                                        {opcion.label}
                                    </button>
                                ))}
                            </div>
                            {form.es_importacion && (
                                <Button type="button" variant="secondary" size="sm" onClick={() => setModalExterior(true)}>
                                    <Ship className="h-4 w-4" /> Editar embarque
                                </Button>
                            )}
                        </div>

                        {form.es_importacion && (
                            <p className="mt-2 text-xs text-warm-500">
                                {[form.numero_importacion, form.contenedor, form.cargo_type, form.puerto_embarque && `desde ${form.puerto_embarque}`]
                                    .filter(Boolean)
                                    .join(' · ') || 'Sin datos de embarque aún.'}
                            </p>
                        )}

                        <div className="mt-4 grid grid-cols-2 gap-3">
                            <Select
                                label="Moneda de origen"
                                value={form.moneda_origen}
                                onChange={(e) => setField('moneda_origen', e.target.value)}
                                options={[
                                    { value: 'PEN', label: 'Soles (PEN)' },
                                    { value: 'USD', label: 'Dólares (USD)' },
                                    { value: 'CNY', label: 'Yuan (CNY)' },
                                    { value: 'EUR', label: 'Euros (EUR)' },
                                ]}
                            />
                            {form.moneda_origen !== 'PEN' && (
                                <Input
                                    label="Tipo de cambio"
                                    type="number"
                                    step="0.0001"
                                    placeholder="T.C."
                                    value={form.tipo_cambio}
                                    onChange={(e) => setField('tipo_cambio', e.target.value)}
                                    error={formErrors.tipo_cambio}
                                />
                            )}
                            {form.moneda_origen === 'USD' && tcFuente && (
                                <p className="col-span-2 -mt-1 text-xs text-warm-400">
                                    T.C. SUNAT del {tcFuente.split('-').reverse().join('/')}. Puedes cambiarlo.
                                </p>
                            )}
                        </div>
                    </div>

                    <Modal
                        open={modalExterior}
                        onClose={() => setModalExterior(false)}
                        title="Datos de la importación"
                        description="Los mismos que ya pregunta la orden de compra al exterior, para que ambas pantallas calcen."
                        size="2xl"
                        footer={
                            <Button type="button" onClick={() => setModalExterior(false)}>
                                Listo
                            </Button>
                        }
                    >
                        <div className="grid gap-3 sm:grid-cols-2">
                            <Input
                                label="N.º de importación"
                                placeholder="IMP-2026-014"
                                value={form.numero_importacion}
                                onChange={(e) => setField('numero_importacion', e.target.value)}
                            />
                            <Input
                                label="Contenedor"
                                placeholder="FFAU1941760"
                                value={form.contenedor}
                                onChange={(e) => setField('contenedor', e.target.value)}
                            />
                            <Input
                                label="Precinto"
                                placeholder="FX46406368"
                                value={form.precinto}
                                onChange={(e) => setField('precinto', e.target.value)}
                            />
                            <Input
                                label="BL (conocimiento de embarque)"
                                placeholder="177FGNGNN20655A"
                                value={form.bl}
                                onChange={(e) => setField('bl', e.target.value)}
                            />
                            <Input
                                label="País de origen"
                                placeholder="China"
                                value={form.pais_origen}
                                onChange={(e) => setField('pais_origen', e.target.value)}
                            />
                            <Input
                                label="Fecha de llegada"
                                type="date"
                                value={form.fecha_llegada}
                                onChange={(e) => setField('fecha_llegada', e.target.value)}
                            />
                            {/* Datos de embarque: los mismos que ya pregunta la orden de
                                compra al exterior, para que ambas pantallas calcen. */}
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
                            <Input
                                label="País de destino"
                                placeholder="PERÚ - PE"
                                value={form.pais_destino}
                                onChange={(e) => setField('pais_destino', e.target.value)}
                            />
                            <Input
                                label="Puerto de embarque"
                                placeholder="NINGBO"
                                value={form.puerto_embarque}
                                onChange={(e) => setField('puerto_embarque', e.target.value)}
                            />
                            <Input
                                label="Puerto de llegada"
                                placeholder="CHANCAY"
                                value={form.puerto_destino}
                                onChange={(e) => setField('puerto_destino', e.target.value)}
                            />
                            <Input
                                label="Fecha de embarque"
                                type="date"
                                value={form.fecha_embarque_estimada}
                                onChange={(e) => setField('fecha_embarque_estimada', e.target.value)}
                            />
                            <Input
                                label="Elaborado por"
                                value={form.elaborado_por}
                                onChange={(e) => setField('elaborado_por', e.target.value)}
                            />
                            <Input
                                label="Aprobado por"
                                placeholder="Se llena al aprobar"
                                value={form.aprobado_por}
                                onChange={(e) => setField('aprobado_por', e.target.value)}
                            />
                        </div>
                    </Modal>

                    <div className="rounded-xl border border-edge bg-white p-5 shadow-sm">
                        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-warm-500">Observaciones</h2>
                        <textarea
                            rows={3}
                            value={form.observaciones}
                            onChange={(e) => setField('observaciones', e.target.value)}
                            placeholder="Notas internas de esta compra…"
                            className="block w-full resize-none rounded-lg border-0 bg-white p-3 text-sm text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-primary-600"
                        />
                    </div>

                    {/* Resumen */}
                    <div className="rounded-xl border border-edge bg-white p-5 shadow-sm">
                        <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-warm-500">Resumen</h2>
                        <div className="flex justify-between border-b border-dashed border-edge py-2 text-sm">
                            {/* La mercadería puesta a bordo: así se le llama al valor de una compra al exterior. */}
                            <span className="text-warm-500">{form.es_importacion ? 'FOB' : 'Subtotal'}</span>
                            <span className="font-medium text-warm-900">{money(subtotal, form.moneda_origen)}</span>
                        </div>
                        <div className="flex items-center justify-between border-b border-dashed border-edge py-2 text-sm">
                            <span className="text-warm-500">Flete</span>
                            <input
                                type="number"
                                min="0"
                                step="any"
                                value={form.flete}
                                onChange={(e) => setField('flete', e.target.value)}
                                className="w-28 rounded-md border-0 bg-white px-2 py-1 text-right text-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-primary-600"
                            />
                        </div>
                        <div className="flex items-center justify-between border-b border-dashed border-edge py-2 text-sm">
                            <span className="text-warm-500">Seguro</span>
                            <input
                                type="number"
                                min="0"
                                step="any"
                                value={seguroMonto ?? ''}
                                onChange={(e) => cambiarSeguro(e.target.value)}
                                className="w-28 rounded-md border-0 bg-white px-2 py-1 text-right text-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-primary-600"
                                aria-label="Seguro"
                            />
                        </div>
                        <div className="flex items-center justify-between border-b border-dashed border-edge py-2 text-sm">
                            <span className="text-warm-500">Gastos en el costo</span>
                            <span className="flex items-center gap-2">
                                {gastosCosto > 0 && <span className="font-medium text-warm-900">{money(gastosCosto, form.moneda_origen)}</span>}
                                <Button type="button" variant="secondary" size="sm" onClick={() => setModalGastos(true)}>
                                    <Plus className="h-4 w-4" />
                                    {gastos.length ? `Gastos (${gastos.length})` : 'Agregar gastos'}
                                </Button>
                            </span>
                        </div>
                        <div className="mt-3 flex items-center justify-between border-t border-edge pt-3">
                            <span className="text-sm font-bold uppercase tracking-wide text-primary-700">Total</span>
                            <span className="text-2xl font-extrabold text-warm-900">{money(total, form.moneda_origen)}</span>
                        </div>
                        {form.moneda_origen === 'USD' && Number(form.tipo_cambio) > 0 && (
                            <p className="mt-1 text-right text-xs text-warm-500">
                                ≈ {money(total * Number(form.tipo_cambio), 'PEN')} al tipo de cambio de hoy
                            </p>
                        )}
                        {gastosCosto > 0 && subtotal > 0 && (
                            <p className="mt-2 rounded-md bg-primary-50 px-2.5 py-1.5 text-right text-xs text-primary-700">
                                Costo de la mercadería con gastos: {money(subtotal + gastosCosto, form.moneda_origen)}{' '}
                                (+{((gastosCosto / subtotal) * 100).toFixed(2)} %). No cambia el total a pagar.
                            </p>
                        )}

                        <div className="mt-5 flex flex-col gap-2">
                            <Button onClick={guardar} loading={saving} className="w-full justify-center">
                                {editando ? 'Guardar cambios' : 'Registrar compra'}
                            </Button>
                            <Button variant="secondary" onClick={() => navigate('/compras')} className="w-full justify-center">
                                Cancelar
                            </Button>
                        </div>
                        <p className="mt-3 text-xs text-gray-400">
                            La compra registra el comprobante y el pago. El stock ingresa al almacén desde Recepciones.
                        </p>
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
                moneda={form.moneda_origen || 'PEN'}
                productos={productos}
                stockPorProducto={stockPorProducto}
                title="Buscar productos"
            />

            <GastosCompraModal
                open={modalGastos}
                gastos={gastos}
                monedaCompra={form.moneda_origen || 'PEN'}
                tipoCambio={form.tipo_cambio}
                subtotal={subtotal}
                onClose={() => setModalGastos(false)}
                onGuardar={setGastos}
            />

            {telaCompra && (
                <TelaCompraModal
                    producto={telaCompra}
                    moneda={form.moneda_origen || 'PEN'}
                    onClose={() => setTelaCompra(null)}
                    onAgregar={agregarTela}
                />
            )}
        </Layout>
    );
}
