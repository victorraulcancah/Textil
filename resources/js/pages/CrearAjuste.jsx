import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronRight, Download, Plus, Scale, Trash2, Upload } from 'lucide-react';
import api, { asList } from '../lib/api';
import { opcionesAlmacen, useAlmacenPropio } from '../lib/almacenes';
import { useToast } from '../lib/toast';
import Layout from '../components/Layout';
import ColorSelect from '../components/ColorSelect';
import ProductoPickerModal from '../components/ProductoPickerModal';
import SelectorRollo from '../components/SelectorRollo';
import TelaCompraModal, { presentacionMetroDe } from '../components/TelaCompraModal';
import { Alert, Button, Input, SearchSelect, Select, Spinner, cn } from '../components/ui';

const num = (n) => new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 }).format(Number(n) || 0);
const money = (n) => new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(Number(n) || 0);
const redondear = (n) => Math.round((Number(n) || 0) * 100) / 100;
/** Sin ceros de relleno: 4.5, no 4.5000. */
const texto = (n) => (Number(n) > 0 ? String(+Number(n).toFixed(4)) : '');

const emptyForm = { almacen_id: '', proveedor_id: '', tipo: 'entrada', motivo: '', observaciones: '' };
const panelVacio = {
    producto_id: '',
    producto_presentacion_id: '',
    color_id: '',
    cantidad: '',
    metros: '',
    rollo_id: '',
    rollo_codigo: '',
    rollo_max: 0,
    costo: '',
};

/**
 * Nuevo ajuste de inventario: vista aparte, no modal (igual que Pedido,
 * Traslado y Compra). Corrige el stock de un almacén con una entrada o una
 * salida manual. Los productos se buscan con el buscador (el modal), como en
 * las demás pantallas.
 *
 * Lo común se ajusta por unidad. Una tela se ajusta por rollos:
 *   · entrada — los rollos de cada color y el metraje de cada uno (arranca con
 *     el metraje de referencia del color, pero se puede cambiar);
 *   · salida  — los metros que se sacan de un rollo (todo el rollo o un corte).
 *
 * El costo sale por defecto del catálogo de productos (su precio de compra) y
 * se puede cambiar.
 */
export default function CrearAjuste() {
    const navigate = useNavigate();
    const toast = useToast();

    const [loading, setLoading] = useState(true);
    const [almacenes, setAlmacenes] = useState([]);
    const [productos, setProductos] = useState([]);
    const [existencias, setExistencias] = useState([]);
    const [proveedores, setProveedores] = useState([]);
    const [motivos, setMotivos] = useState([]);

    const { propioId } = useAlmacenPropio();
    const [form, setForm] = useState(() => ({ ...emptyForm, almacen_id: propioId ? String(propioId) : '' }));
    const [panel, setPanel] = useState({ ...panelVacio });
    const [items, setItems] = useState([]);
    const [errors, setErrors] = useState({});
    const [saving, setSaving] = useState(false);

    /** El detalle desde Excel: el archivo que se carga y las filas que no se pudieron leer. */
    const inputExcel = useRef(null);
    const [importando, setImportando] = useState(false);
    const [erroresExcel, setErroresExcel] = useState([]);

    /** El buscador de productos y la tabla de colores de una tela (entrada). */
    const [picker, setPicker] = useState({ open: false, query: '' });
    const [telaEntrada, setTelaEntrada] = useState(null);
    /** Telas desplegadas en la tabla: { [id del producto]: true }. */
    const [abiertas, setAbiertas] = useState({});

    useEffect(() => {
        let vivo = true;
        (async () => {
            try {
                const [almRes, prodRes, existRes, motivosRes, provRes] = await Promise.all([
                    api.get('/almacenes'),
                    api.get('/productos', { params: { per_page: 500 } }),
                    api.get('/existencias'),
                    api.get('/motivos-movimiento?ambito=inventario'),
                    api.get('/proveedores'),
                ]);
                if (!vivo) return;
                setAlmacenes(asList(almRes));
                setProductos(asList(prodRes));
                setExistencias(asList(existRes));
                setMotivos(asList(motivosRes));
                setProveedores(asList(provRes));
            } catch {
                if (vivo) toast.error('No se pudieron cargar los datos del ajuste.');
            } finally {
                if (vivo) setLoading(false);
            }
        })();
        return () => {
            vivo = false;
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const esSalida = form.tipo === 'salida';

    /** Motivos activos de inventario que aplican al tipo elegido. */
    const motivosOptions = useMemo(
        () =>
            motivos
                // Los del sistema (Recepción, Salida por venta) los genera el
                // propio flujo de compras y ventas: no son motivos de ajuste.
                .filter((m) => m.activo !== false && m.tipo === form.tipo && !m.categoria_gasto && !m.es_sistema)
                .map((m) => ({ value: m.nombre, label: m.nombre })),
        [motivos, form.tipo],
    );

    /** Stock (en unidad base) de cada producto en el almacén elegido. */
    const stockDelAlmacen = useMemo(() => {
        if (!form.almacen_id) return null;
        return existencias
            .filter((e) => String(e.almacen_id ?? e.almacen?.id) === String(form.almacen_id))
            .reduce((acc, e) => {
                acc[String(e.producto_id)] = Number(e.stock_actual) || 0;
                return acc;
            }, {});
    }, [existencias, form.almacen_id]);

    /**
     * En una entrada vale cualquier producto del catálogo, aunque nunca haya
     * estado en este almacén: justamente se está cargando por primera vez. En
     * una salida solo los que tienen stock: no se puede restar de lo que no hay.
     */
    const productosDisponibles = useMemo(() => {
        if (!stockDelAlmacen) return [];
        return productos.filter((p) => (!esSalida ? p.activo !== false : (stockDelAlmacen[String(p.id)] ?? 0) > 0));
    }, [productos, stockDelAlmacen, esSalida]);

    const productosOptions = useMemo(
        () =>
            productosDisponibles.map((p) => ({
                value: String(p.id),
                label: p.nombre,
                keywords: `${p.codigo ?? ''} ${p.codigo_barras ?? ''}`,
            })),
        [productosDisponibles],
    );

    const productoDe = (id) => productos.find((p) => String(p.id) === String(id)) ?? null;
    const esTela = (id) => Boolean(presentacionMetroDe(productoDe(id)));
    /** El costo por metro del catálogo de una tela. */
    const costoMetroDe = (id) => texto(presentacionMetroDe(productoDe(id))?.precio_compra);

    /** Colores de la tela en una salida: los que hay en este almacén. */
    const coloresDeSalida = (id) => {
        if (!id) return [];
        const fila = existencias.find(
            (e) => String(e.producto_id ?? e.producto?.id) === String(id) && String(e.almacen_id) === String(form.almacen_id),
        );
        return (fila?.colores ?? []).filter((c) => Number(c.rollos_disponibles) > 0);
    };

    /**
     * Unidades derivadas de un producto con su factor de conversión, su costo
     * de catálogo y cuánto hay disponible expresado en esa unidad. El stock se
     * guarda en unidad base: sin convertir se leería "1000" donde en realidad
     * hay 2 paquetes de 500g.
     */
    const unidadesDe = (id) => {
        const p = productoDe(id);
        if (!p) return [];

        const stockBase = stockDelAlmacen?.[String(p.id)] ?? 0;
        const abrev = p.unidad_medida?.abreviatura ?? '';

        return (p.presentaciones ?? [])
            .filter((pres) => pres.activo !== false)
            .map((pres) => {
                const factor = Number(pres.factor_conversion) || 1;
                return {
                    value: String(pres.id),
                    label: `${pres.nombre} (x${num(factor)} ${abrev})`,
                    unidad: pres.nombre,
                    factor,
                    costo: texto(pres.precio_compra),
                    disponible: Math.floor((stockBase / factor) * 100) / 100,
                };
            });
    };

    const unidadDe = (productoId, presId) =>
        unidadesDe(productoId).find((u) => String(u.value) === String(presId)) ?? null;

    const limpiarError = (campo) => setErrors((prev) => (prev[campo] ? { ...prev, [campo]: undefined } : prev));

    // ── Elegir producto ──
    /** Desde el select del panel: una tela abre su tabla por color (entrada) o pide color y rollo (salida). */
    const elegirProducto = (id) => {
        if (!id) return setPanel({ ...panelVacio });
        limpiarError('detalles');

        if (esTela(id) && !esSalida) {
            setPanel({ ...panelVacio });
            setTelaEntrada(productoDe(id));
            return;
        }

        const us = unidadesDe(id);
        setPanel({
            ...panelVacio,
            producto_id: id,
            producto_presentacion_id: us.length === 1 ? us[0].value : '',
            costo: esTela(id) ? costoMetroDe(id) : us.length === 1 ? us[0].costo : '',
        });
    };

    const elegirUnidad = (presId) =>
        setPanel((p) => ({ ...p, producto_presentacion_id: presId, costo: unidadDe(p.producto_id, presId)?.costo ?? '' }));

    const elegirColor = (colorId) =>
        setPanel((p) => ({ ...p, color_id: colorId, rollo_id: '', rollo_codigo: '', rollo_max: 0, metros: '' }));

    const unidadPanel = unidadDe(panel.producto_id, panel.producto_presentacion_id);

    // ── Agregar a la tabla ──
    /** Una tela por color, de la tabla del buscador o del select (entrada): cada color con sus rollos y su metraje. */
    const agregarRollos = (lineas) => {
        const utiles = lineas.filter((l) => l.producto && Number(l.rollos) > 0 && Number(l.cantidad) > 0);
        if (utiles.length === 0) return;
        setItems((prev) => [
            ...prev,
            ...utiles.map((l) => ({
                tipo: 'rollos',
                producto_id: String(l.producto.id),
                color_id: l.color?.id ? String(l.color.id) : '',
                rollos: String(l.rollos),
                metros: String(redondear(Number(l.cantidad) / Number(l.rollos))),
                costo: texto(l.precio),
            })),
        ]);
        limpiarError('detalles');
    };

    /**
     * Salida de tela desde el buscador: "3 rollos de NEGRO". Se toman los 3
     * primeros rollos disponibles de ese color en el almacén (enteros; los
     * metros se pueden bajar en la tabla para un corte).
     */
    const agregarRollosDeSalida = async (lineas) => {
        let faltaron = 0;
        const nuevos = [];
        const tomados = new Set(items.filter((it) => it.tipo === 'rollo').map((it) => String(it.rollo_id)));

        for (const l of lineas) {
            try {
                const res = await api.get('/rollos', {
                    params: {
                        producto_id: l.producto.id,
                        almacen_id: form.almacen_id,
                        solo_disponibles: 1,
                        ...(l.color?.id ? { producto_color_id: l.color.id } : {}),
                    },
                });
                const libres = asList(res).filter((r) => !tomados.has(String(r.id)));
                const quiere = Number(l.cantidad) || 0;
                libres.slice(0, quiere).forEach((r) => {
                    tomados.add(String(r.id));
                    nuevos.push({
                        tipo: 'rollo',
                        producto_id: String(l.producto.id),
                        color_id: r.producto_color_id ? String(r.producto_color_id) : '',
                        rollo_id: String(r.id),
                        rollo_codigo: r.codigo,
                        rollo_max: Number(r.metros_actual) || 0,
                        metros: String(Number(r.metros_actual) || 0),
                        costo: costoMetroDe(l.producto.id),
                    });
                });
                if (libres.length < quiere) faltaron += quiere - libres.length;
            } catch {
                toast.error('No se pudieron leer los rollos disponibles.');
            }
        }

        if (nuevos.length) setItems((prev) => [...prev, ...nuevos]);
        if (faltaron) toast.error(`Faltaron ${faltaron} rollo${faltaron === 1 ? '' : 's'}: no hay más disponibles.`);
        limpiarError('detalles');
    };

    /** Lo que devuelve el buscador. */
    const agregarDesdePicker = (seleccionados) => {
        const utiles = seleccionados.filter((s) => s.presentacion && s.cantidad > 0);
        if (utiles.length === 0) return;

        const telas = utiles.filter((s) => s.porRollos);
        const comunes = utiles.filter((s) => !s.porRollos);

        if (telas.length) {
            if (esSalida) agregarRollosDeSalida(telas);
            else agregarRollos(telas);
        }

        if (comunes.some((s) => esTela(s.producto.id))) {
            toast.error('Las telas se ajustan por rollos: elige el color en su tabla.');
        }

        const validos = comunes.filter((s) => !esTela(s.producto.id));
        if (validos.length) {
            setItems((prev) => {
                const next = [...prev];
                validos.forEach(({ producto, presentacion, cantidad }) => {
                    const i = next.findIndex((it) => it.tipo === 'comun' && String(it.producto_presentacion_id) === String(presentacion.id));
                    if (i !== -1) next[i] = { ...next[i], cantidad: String((Number(next[i].cantidad) || 0) + cantidad) };
                    else
                        next.push({
                            tipo: 'comun',
                            producto_id: String(producto.id),
                            producto_presentacion_id: String(presentacion.id),
                            cantidad: String(cantidad),
                            costo: texto(presentacion.precio_compra),
                        });
                });
                return next;
            });
            limpiarError('detalles');
        }

        setPanel({ ...panelVacio });
    };

    /** El botón del panel: lo común (unidad y cantidad) o el rollo de una salida de tela. */
    const agregar = () => {
        if (!form.almacen_id) return toast.error('Elige primero el almacén.');
        if (!panel.producto_id) return toast.error('Busca y elige un producto.');

        if (esTela(panel.producto_id)) {
            // Solo llega aquí una salida: la entrada usa la tabla por color.
            if (coloresDeSalida(panel.producto_id).length > 0 && !panel.color_id) return toast.error('Elige el color.');
            if (!panel.rollo_id) return toast.error('Elige el rollo.');
            const metros = Number(panel.metros) || 0;
            if (!(metros > 0)) return toast.error('Los metros deben ser mayores a 0.');
            if (metros > panel.rollo_max) return toast.error(`El rollo solo tiene ${num(panel.rollo_max)} m.`);
            setItems((prev) => [
                ...prev,
                {
                    tipo: 'rollo',
                    producto_id: panel.producto_id,
                    color_id: panel.color_id,
                    rollo_id: panel.rollo_id,
                    rollo_codigo: panel.rollo_codigo,
                    rollo_max: panel.rollo_max,
                    metros: String(metros),
                    costo: panel.costo,
                },
            ]);
        } else {
            if (!panel.producto_presentacion_id) return toast.error('Elige la unidad.');
            const cant = Number(panel.cantidad) || 0;
            if (!(cant > 0)) return toast.error('La cantidad debe ser mayor a 0.');
            if (esSalida && unidadPanel && cant > unidadPanel.disponible) {
                return toast.error(`Solo hay ${num(unidadPanel.disponible)} disponibles.`);
            }
            setItems((prev) => {
                const i = prev.findIndex((it) => it.tipo === 'comun' && String(it.producto_presentacion_id) === String(panel.producto_presentacion_id));
                if (i !== -1) return prev.map((it, idx) => (idx === i ? { ...it, cantidad: String((Number(it.cantidad) || 0) + cant) } : it));
                return [
                    ...prev,
                    { tipo: 'comun', producto_id: panel.producto_id, producto_presentacion_id: panel.producto_presentacion_id, cantidad: String(cant), costo: panel.costo },
                ];
            });
        }

        limpiarError('detalles');
        setPanel({ ...panelVacio });
    };

    /** Quita de una vez todos los colores (o rollos) de una tela. */
    const quitarVarias = (indices) => setItems((prev) => prev.filter((_, j) => !indices.includes(j)));
    /** Un solo costo por metro para todos los colores de una tela. */
    const costoDeTela = (indices, valor) =>
        setItems((prev) => prev.map((it, j) => (indices.includes(j) ? { ...it, costo: valor } : it)));
    const alternar = (clave) => setAbiertas((prev) => ({ ...prev, [clave]: !prev[clave] }));

    /**
     * Lo que se ve en la tabla, como en el pedido: cada tela es una sola fila
     * (sus colores y rollos se despliegan debajo); lo demás va línea por línea.
     */
    const filasTabla = useMemo(() => {
        const filas = [];
        const telas = new Map();

        items.forEach((it, i) => {
            if (it.tipo === 'comun') {
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
    }, [items]);

    const setItem = (i, patch) => setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
    const quitar = (i) => setItems((prev) => prev.filter((_, idx) => idx !== i));

    /** Cuánto es la línea, en la unidad en que se cuenta (metros o unidades). */
    const cantidadDe = (it) =>
        it.tipo === 'rollos' ? (Number(it.rollos) || 0) * (Number(it.metros) || 0) : it.tipo === 'rollo' ? Number(it.metros) || 0 : Number(it.cantidad) || 0;
    const totalDe = (it) => redondear(cantidadDe(it) * (Number(it.costo) || 0));
    const totalAjuste = items.reduce((s, it) => s + totalDe(it), 0);

    /** La plantilla de Excel para llenar el detalle: sus columnas cambian según sea entrada o salida. */
    const descargarPlantilla = async (conEjemplos = false) => {
        try {
            const { data } = await api.get('/ajustes/plantilla', {
                params: { tipo: form.tipo, almacen_id: form.almacen_id || undefined, ejemplo: conEjemplos ? 1 : undefined },
                responseType: 'blob',
            });
            const url = URL.createObjectURL(data);
            const a = document.createElement('a');
            a.href = url;
            a.download = `plantilla-ajuste-${form.tipo}${conEjemplos ? '-prueba' : ''}.xlsx`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 4000);
        } catch {
            toast.error('No se pudo descargar la plantilla.');
        }
    };

    /**
     * Carga el Excel: el servidor lo lee y devuelve las líneas ya resueltas (producto, color, rollo, unidad y costo)
     * y las filas que no pudo leer. Las líneas se agregan a la tabla; nada se guarda hasta registrar el ajuste.
     */
    const importarExcel = async (archivo) => {
        if (!archivo) return;
        if (!form.almacen_id) return toast.error('Elige primero el almacén.');
        const datos = new FormData();
        datos.append('archivo', archivo);
        datos.append('tipo', form.tipo);
        datos.append('almacen_id', form.almacen_id);

        setImportando(true);
        try {
            const { data } = await api.post('/ajustes/importar-detalle', datos, { headers: { 'Content-Type': 'multipart/form-data' } });
            const errores = [...(data.errores ?? [])];
            const nuevos = [];
            const tomados = new Set(items.filter((it) => it.tipo === 'rollo').map((it) => String(it.rollo_id)));

            (data.items ?? []).forEach((it) => {
                // Un rollo que ya está en la tabla no se vuelve a agregar.
                if (it.tipo === 'rollo' && tomados.has(String(it.rollo_id))) {
                    errores.push({ fila: null, mensaje: `El rollo ${it.rollo_codigo} ya estaba en la tabla.` });
                    return;
                }
                nuevos.push(it);
            });

            setItems((prev) => {
                const next = [...prev];
                nuevos.forEach((it) => {
                    const i =
                        it.tipo === 'comun'
                            ? next.findIndex((x) => x.tipo === 'comun' && String(x.producto_presentacion_id) === String(it.producto_presentacion_id))
                            : -1;
                    if (i !== -1) next[i] = { ...next[i], cantidad: String((Number(next[i].cantidad) || 0) + (Number(it.cantidad) || 0)) };
                    else next.push(it);
                });
                return next;
            });
            if (nuevos.length) limpiarError('detalles');
            setErroresExcel(errores);

            if (nuevos.length) toast.success(`${nuevos.length} línea${nuevos.length === 1 ? '' : 's'} agregada${nuevos.length === 1 ? '' : 's'} desde el Excel.`);
            if (errores.length) toast.error(`${errores.length} fila${errores.length === 1 ? '' : 's'} no se pudieron cargar: revisa la lista.`);
            if (!nuevos.length && !errores.length) toast.error('El archivo no tiene filas para cargar.');
        } catch (err) {
            toast.error(err.response?.data?.message ?? 'No se pudo leer el Excel.');
        } finally {
            setImportando(false);
            if (inputExcel.current) inputExcel.current.value = '';
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setErrors({});

        const faltan = {};
        if (!form.almacen_id) faltan.almacen_id = 'Elige el almacén';
        if (!form.motivo) faltan.motivo = 'Elige el motivo';
        if (items.length === 0) faltan.detalles = 'Agrega al menos un producto.';

        if (!faltan.detalles) {
            for (const it of items) {
                const nombre = productoDe(it.producto_id)?.nombre ?? 'El producto';
                if (it.tipo === 'rollos' && !((Number(it.rollos) || 0) > 0 && (Number(it.metros) || 0) > 0)) {
                    faltan.detalles = `"${nombre}": indica los rollos y los metros de cada uno.`;
                } else if (it.tipo === 'rollo' && !((Number(it.metros) || 0) > 0 && Number(it.metros) <= it.rollo_max)) {
                    faltan.detalles = `"${nombre}": el rollo ${it.rollo_codigo} tiene ${num(it.rollo_max)} m.`;
                } else if (it.tipo === 'comun') {
                    const u = unidadDe(it.producto_id, it.producto_presentacion_id);
                    if (!((Number(it.cantidad) || 0) > 0)) faltan.detalles = `"${nombre}": indica la cantidad.`;
                    else if (esSalida && u && Number(it.cantidad) > u.disponible) faltan.detalles = `"${nombre} — ${u.unidad}" solo tiene ${num(u.disponible)} disponibles.`;
                }
                if (faltan.detalles) break;
            }
        }

        if (Object.keys(faltan).length) {
            setErrors(faltan);
            toast.error(Object.values(faltan)[0]);
            return;
        }

        // El costo vacío se manda sin costo: el servidor pone el del catálogo.
        const costo = (it, clave) => (it.costo !== '' && it.costo != null ? { [clave]: Number(it.costo) } : {});

        setSaving(true);
        try {
            await api.post('/ajustes', {
                almacen_id: form.almacen_id,
                proveedor_id: form.proveedor_id || null,
                tipo: form.tipo,
                motivo: form.motivo,
                observaciones: form.observaciones,
                detalles: items.map((it) =>
                    it.tipo === 'rollos'
                        ? { producto_id: it.producto_id, producto_color_id: it.color_id || null, rollos: Number(it.rollos), metros_por_rollo: Number(it.metros), ...costo(it, 'costo_por_metro') }
                        : it.tipo === 'rollo'
                          ? { rollo_id: it.rollo_id, metros: Number(it.metros), ...costo(it, 'costo_por_metro') }
                          : { producto_presentacion_id: it.producto_presentacion_id, cantidad: Number(it.cantidad), ...costo(it, 'costo_unitario') },
                ),
            });
            toast.success('Ajuste creado y stock actualizado.');
            navigate('/ajustes');
        } catch (err) {
            if (err.response?.status === 422) {
                const validation = err.response.data?.errors ?? {};
                setErrors(Object.fromEntries(Object.entries(validation).map(([k, v]) => [k, v[0]])));
                toast.error(err.response.data?.message ?? 'Revisa los datos del ajuste.');
            } else {
                toast.error(err.response?.data?.message ?? 'No se pudo guardar el ajuste.');
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

    const tela = esTela(panel.producto_id);
    const coloresPanel = coloresDeSalida(panel.producto_id);

    return (
        <Layout>
            {/* Encabezado */}
            <div className="mb-6 flex items-center gap-3">
                <button
                    type="button"
                    onClick={() => navigate('/ajustes')}
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-edge text-gray-500 transition hover:bg-gray-50 hover:text-gray-800"
                    aria-label="Volver"
                >
                    <ArrowLeft className="h-4 w-4" />
                </button>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
                    <Scale className="h-5 w-5" />
                </div>
                <div>
                    <h1 className="text-xl font-bold tracking-tight text-warm-900">Nuevo ajuste</h1>
                    <p className="text-sm text-warm-500">
                        Corrige el stock de un almacén con una entrada o una salida manual. Las telas se ajustan por rollos.
                    </p>
                </div>
            </div>

            <form onSubmit={handleSubmit} noValidate>
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_400px] *:min-w-0">
                    {/* Izquierda: buscar y agregar productos */}
                    <div className="space-y-6">
                        <div className="rounded-xl border border-edge bg-white p-5 shadow-sm">
                            <h2 className="mb-3 text-sm font-semibold text-warm-900">
                                Productos ({esSalida ? 'a restar' : 'a sumar'})
                            </h2>

                            {!form.almacen_id ? (
                                <Alert variant="info">Elige un almacén para ver sus productos disponibles.</Alert>
                            ) : productosOptions.length === 0 ? (
                                <Alert variant="warning">
                                    {esSalida ? 'Este almacén no tiene productos con stock para restar.' : 'No hay productos registrados.'}
                                </Alert>
                            ) : (
                                <div className="space-y-3">
                                    <SearchSelect
                                        label="Producto"
                                        value={panel.producto_id}
                                        onChange={elegirProducto}
                                        options={productosOptions}
                                        placeholder={esSalida ? 'Buscar producto con stock en el almacén…' : 'Buscar producto…'}
                                        emptyText="Sin coincidencias"
                                        searchTitle="Buscador avanzado con filtros"
                                        onSearch={(q) => setPicker({ open: true, query: q })}
                                    />

                                    {/* Salida de tela: el color y el rollo. */}
                                    {tela && esSalida && coloresPanel.length > 0 && (
                                        <ColorSelect
                                            colores={coloresPanel}
                                            value={panel.color_id}
                                            onChange={elegirColor}
                                            placeholder="Elige el color…"
                                            describir={(c) => `${c.nombre}${c.codigo ? ` (${c.codigo})` : ''} · ${c.rollos_disponibles} rollos · ${num(c.metros)} m`}
                                        />
                                    )}

                                    {tela && esSalida && panel.producto_id && (coloresPanel.length === 0 || panel.color_id) && (
                                        <div>
                                            <span className="mb-1 block text-sm font-medium text-gray-700">Rollo</span>
                                            <SelectorRollo
                                                productoId={panel.producto_id}
                                                almacenId={form.almacen_id}
                                                colorId={panel.color_id}
                                                value={panel.rollo_id}
                                                excluir={items.filter((it) => it.tipo === 'rollo').map((it) => it.rollo_id)}
                                                onChange={(id, rollo) =>
                                                    setPanel((p) => ({
                                                        ...p,
                                                        rollo_id: id,
                                                        rollo_codigo: rollo?.codigo ?? '',
                                                        rollo_max: Number(rollo?.metros_actual) || 0,
                                                        // Por defecto, todo el rollo; se puede bajar para un corte.
                                                        metros: rollo ? String(Number(rollo.metros_actual)) : '',
                                                    }))
                                                }
                                            />
                                        </div>
                                    )}

                                    {tela && esSalida && (
                                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                            <Input label="Disponible en el rollo (m)" value={panel.rollo_id ? num(panel.rollo_max) : ''} readOnly disabled />
                                            <Input
                                                label="Metros a restar"
                                                type="number"
                                                min="0"
                                                step="0.01"
                                                placeholder="0"
                                                value={panel.metros}
                                                onChange={(e) => setPanel((p) => ({ ...p, metros: e.target.value }))}
                                            />
                                            <Input
                                                label="Costo por metro"
                                                type="number"
                                                min="0"
                                                step="0.0001"
                                                placeholder="0"
                                                value={panel.costo}
                                                onChange={(e) => setPanel((p) => ({ ...p, costo: e.target.value }))}
                                            />
                                        </div>
                                    )}

                                    {panel.producto_id && !tela && (
                                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                            <Input label="Disponible" value={unidadPanel ? `${num(unidadPanel.disponible)} ${unidadPanel.unidad}` : ''} readOnly disabled />
                                            <SearchSelect
                                                label="Unidad"
                                                value={panel.producto_presentacion_id}
                                                clearable={false}
                                                placeholder="Elegir…"
                                                emptyText="Sin unidades"
                                                onChange={(pid) => pid && elegirUnidad(pid)}
                                                options={unidadesDe(panel.producto_id).map((u) => ({ value: u.value, label: u.label }))}
                                            />
                                            <Input
                                                label="Cantidad"
                                                type="number"
                                                min="0"
                                                step="any"
                                                placeholder="0"
                                                value={panel.cantidad}
                                                onChange={(e) => setPanel((p) => ({ ...p, cantidad: e.target.value }))}
                                            />
                                            <Input
                                                label="Costo"
                                                type="number"
                                                min="0"
                                                step="0.0001"
                                                placeholder="0"
                                                value={panel.costo}
                                                onChange={(e) => setPanel((p) => ({ ...p, costo: e.target.value }))}
                                            />
                                        </div>
                                    )}

                                    <div className="flex flex-wrap gap-2">
                                        {panel.producto_id && (
                                            <Button type="button" onClick={agregar}>
                                                <Plus className="h-4 w-4" /> Agregar producto
                                            </Button>
                                        )}
                                        <Button type="button" variant="secondary" onClick={() => setPicker({ open: true, query: '' })}>
                                            Buscar en el catálogo
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Lo agregado: una fila por tela, con sus colores desplegables (como el pedido). */}
                        <div className="rounded-xl border border-edge bg-white p-5 shadow-sm">
                            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                                <h2 className="text-sm font-semibold text-warm-900">Detalle del ajuste</h2>
                                <div className="flex flex-wrap gap-2">
                                    <Button type="button" variant="secondary" size="sm" onClick={() => descargarPlantilla(false)}>
                                        <Download className="h-4 w-4" /> Plantilla Excel
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        size="sm"
                                        title="La misma plantilla con filas de prueba hechas con productos y rollos reales, para ver cómo se carga"
                                        onClick={() => descargarPlantilla(true)}
                                    >
                                        <Download className="h-4 w-4" /> Con datos de prueba
                                    </Button>
                                    <Button type="button" variant="secondary" size="sm" loading={importando} onClick={() => inputExcel.current?.click()}>
                                        <Upload className="h-4 w-4" /> Cargar Excel
                                    </Button>
                                    <input
                                        ref={inputExcel}
                                        type="file"
                                        accept=".xlsx,.xls"
                                        className="hidden"
                                        onChange={(e) => importarExcel(e.target.files?.[0])}
                                    />
                                </div>
                            </div>

                            {/* Las filas del Excel que no se pudieron cargar, para corregirlas y volver a subir. */}
                            {erroresExcel.length > 0 && (
                                <Alert variant="warning" className="mb-3">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="font-medium">
                                                {erroresExcel.length} fila{erroresExcel.length === 1 ? '' : 's'} del Excel no se cargaron:
                                            </p>
                                            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">
                                                {erroresExcel.slice(0, 12).map((er, i) => (
                                                    <li key={i}>
                                                        {er.fila ? <strong>Fila {er.fila}: </strong> : null}
                                                        {er.mensaje}
                                                    </li>
                                                ))}
                                            </ul>
                                            {erroresExcel.length > 12 && <p className="mt-1 text-sm">…y {erroresExcel.length - 12} más.</p>}
                                        </div>
                                        <button type="button" onClick={() => setErroresExcel([])} className="shrink-0 text-xs font-medium underline">
                                            Cerrar
                                        </button>
                                    </div>
                                </Alert>
                            )}
                            <div className="overflow-x-auto rounded-lg border border-edge">
                                <table className="w-full min-w-[760px] text-sm">
                                    <thead>
                                        <tr className="bg-primary-600 text-left text-xs font-semibold uppercase tracking-wide text-white">
                                            <th className="px-3 py-2">Producto</th>
                                            <th className="px-3 py-2">Presentación</th>
                                            <th className="px-3 py-2 text-right">Cantidad</th>
                                            <th className="px-3 py-2 text-right">Costo</th>
                                            <th className="px-3 py-2 text-right">Total</th>
                                            <th className="w-14 px-3 py-2 text-center">Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {items.length === 0 && (
                                            <tr>
                                                <td colSpan={6} className="px-3 py-10 text-center text-warm-400">
                                                    Agrega productos con el buscador de arriba o carga un Excel.
                                                </td>
                                            </tr>
                                        )}

                                        {filasTabla.map((fila) => {
                                            // Una tela: una fila y, al desplegarla, sus colores con los rollos.
                                            if (fila.tipo === 'tela') {
                                                const lineas = fila.indices.map((i) => ({ it: items[i], i }));
                                                const producto = productoDe(fila.producto_id);
                                                const colores = new Set(lineas.map(({ it }) => it.color_id || 'x'));
                                                const rollos = lineas.reduce((suma, { it }) => suma + (it.tipo === 'rollos' ? Number(it.rollos) || 0 : 1), 0);
                                                const metros = lineas.reduce((suma, { it }) => suma + cantidadDe(it), 0);
                                                const total = lineas.reduce((suma, { it }) => suma + totalDe(it), 0);
                                                const costos = [...new Set(lineas.map(({ it }) => String(it.costo)))];
                                                const abierta = Boolean(abiertas[fila.clave]);
                                                const colorDe = (it) => (producto?.colores ?? []).find((c) => String(c.id) === String(it.color_id));

                                                return (
                                                    <Fragment key={fila.clave}>
                                                        <tr className="cursor-pointer transition hover:bg-gray-50" onClick={() => alternar(fila.clave)}>
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
                                                                    <span className="font-medium text-warm-900">{producto?.nombre ?? '—'}</span>
                                                                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-warm-700">
                                                                        {colores.size} color{colores.size === 1 ? '' : 'es'}
                                                                    </span>
                                                                </span>
                                                            </td>
                                                            <td className="px-3 py-2 text-warm-700">Rollo</td>
                                                            <td className="px-3 py-2 text-right font-medium text-warm-900">
                                                                {rollos} rollo{rollos === 1 ? '' : 's'}
                                                                <span className="block text-[11px] font-normal text-warm-500">{num(metros)} m</span>
                                                            </td>
                                                            {/* Un costo por metro para toda la tela; cada color puede llevar el suyo. */}
                                                            <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                                                                <Input
                                                                    type="number"
                                                                    step="0.0001"
                                                                    min="0"
                                                                    value={costos.length === 1 ? costos[0] : ''}
                                                                    placeholder={costos.length === 1 ? undefined : 'varios'}
                                                                    onChange={(e) => costoDeTela(fila.indices, e.target.value)}
                                                                    className="ml-auto w-28 text-right"
                                                                    aria-label={`Costo por metro de ${producto?.nombre}`}
                                                                />
                                                                <span className="mt-0.5 block text-[11px] text-warm-500">por metro</span>
                                                            </td>
                                                            <td className="px-3 py-2 text-right font-semibold text-primary-600">{money(total)}</td>
                                                            <td className="px-3 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                                                                <button
                                                                    type="button"
                                                                    aria-label={`Quitar ${producto?.nombre}`}
                                                                    onClick={() => quitarVarias(fila.indices)}
                                                                    className="rounded-md p-1.5 text-red-600 transition hover:bg-red-50"
                                                                >
                                                                    <Trash2 className="h-4 w-4" />
                                                                </button>
                                                            </td>
                                                        </tr>
                                                        {/* Los colores se despliegan con una animación de altura. */}
                                                        <tr className="border-b-0">
                                                            <td colSpan={6} className="p-0">
                                                                <div className={cn('grid transition-[grid-template-rows] duration-300 ease-out', abierta ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
                                                                    <div className="overflow-hidden">
                                                                        <div className={cn('bg-gray-50/70 py-1 pl-10 pr-3 transition-opacity duration-300', abierta ? 'border-b border-gray-100 opacity-100' : 'opacity-0')}>
                                                                            <div className="grid grid-cols-[1fr_5.5rem_7rem_6rem_7rem_2.5rem] items-center gap-3 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-warm-500">
                                                                                <span>Color</span>
                                                                                <span className="text-right">{esSalida ? 'Rollo' : 'Rollos'}</span>
                                                                                <span className="text-right">{esSalida ? 'Metros a restar' : 'Metros por rollo'}</span>
                                                                                <span className="text-right">Total (m)</span>
                                                                                <span className="text-right">Costo por metro</span>
                                                                                <span />
                                                                            </div>
                                                                            {lineas.map(({ it, i }) => {
                                                                                const excede = it.tipo === 'rollo' && Number(it.metros) > it.rollo_max;
                                                                                const color = colorDe(it);
                                                                                return (
                                                                                    <div key={i} className="grid grid-cols-[1fr_5.5rem_7rem_6rem_7rem_2.5rem] items-center gap-3 px-2 py-1.5">
                                                                                        <span className="inline-flex items-center gap-2 font-medium uppercase text-warm-800">
                                                                                            <span className="h-3 w-3 shrink-0 rounded-full ring-1 ring-black/10" style={{ backgroundColor: color?.hex || '#9ca3af' }} />
                                                                                            {color?.nombre || 'Sin color'}
                                                                                        </span>
                                                                                        {it.tipo === 'rollos' ? (
                                                                                            <Input
                                                                                                type="number"
                                                                                                step="1"
                                                                                                min="1"
                                                                                                value={it.rollos}
                                                                                                onChange={(e) => setItem(i, { rollos: e.target.value })}
                                                                                                className="text-right"
                                                                                                aria-label={`Rollos de ${producto?.nombre} ${color?.nombre ?? ''}`}
                                                                                                tabIndex={abierta ? 0 : -1}
                                                                                            />
                                                                                        ) : (
                                                                                            <span className="truncate text-right text-xs text-warm-600" title={it.rollo_codigo}>
                                                                                                {it.rollo_codigo}
                                                                                            </span>
                                                                                        )}
                                                                                        <Input
                                                                                            type="number"
                                                                                            step="0.01"
                                                                                            min="0"
                                                                                            value={it.metros}
                                                                                            onChange={(e) => setItem(i, { metros: e.target.value })}
                                                                                            error={excede ? `Máx. ${num(it.rollo_max)}` : undefined}
                                                                                            className="text-right"
                                                                                            aria-label={it.tipo === 'rollos' ? 'Metros por rollo' : 'Metros a restar'}
                                                                                            tabIndex={abierta ? 0 : -1}
                                                                                        />
                                                                                        <span className="text-right font-medium text-warm-900">{num(cantidadDe(it))} m</span>
                                                                                        <Input
                                                                                            type="number"
                                                                                            step="0.0001"
                                                                                            min="0"
                                                                                            value={it.costo}
                                                                                            onChange={(e) => setItem(i, { costo: e.target.value })}
                                                                                            className="text-right"
                                                                                            aria-label="Costo por metro"
                                                                                            tabIndex={abierta ? 0 : -1}
                                                                                        />
                                                                                        <button
                                                                                            type="button"
                                                                                            aria-label="Quitar"
                                                                                            onClick={() => quitar(i)}
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
                                            const p = productoDe(it.producto_id);
                                            const u = unidadDe(it.producto_id, it.producto_presentacion_id);
                                            const excede = esSalida && u && Number(it.cantidad) > u.disponible;

                                            return (
                                                <tr key={fila.clave}>
                                                    <td className="px-3 py-2 font-medium text-warm-900">{p?.nombre ?? '—'}</td>
                                                    <td className="px-3 py-2 text-warm-700">
                                                        {u?.unidad ?? '—'}
                                                        {esSalida && u && <span className="block text-xs text-warm-400">disp. {num(u.disponible)}</span>}
                                                    </td>
                                                    <td className="px-3 py-2 text-right">
                                                        <Input
                                                            type="number"
                                                            min="0"
                                                            step="any"
                                                            value={it.cantidad}
                                                            onChange={(e) => setItem(i, { cantidad: e.target.value })}
                                                            error={excede ? 'Supera el stock' : undefined}
                                                            className="ml-auto w-28 text-right"
                                                        />
                                                    </td>
                                                    <td className="px-3 py-2 text-right">
                                                        <Input
                                                            type="number"
                                                            min="0"
                                                            step="0.0001"
                                                            placeholder="0"
                                                            value={it.costo}
                                                            onChange={(e) => setItem(i, { costo: e.target.value })}
                                                            aria-label="Costo"
                                                            className="ml-auto w-28 text-right"
                                                        />
                                                    </td>
                                                    <td className="px-3 py-2 text-right font-semibold text-primary-600">{money(totalDe(it))}</td>
                                                    <td className="px-3 py-2 text-center">
                                                        <button
                                                            type="button"
                                                            onClick={() => quitar(i)}
                                                            aria-label="Quitar"
                                                            className="rounded-md p-1.5 text-red-600 transition hover:bg-red-50"
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                    {items.length > 0 && (
                                        <tfoot>
                                            <tr className="border-t-2 border-edge bg-gray-50 text-sm font-bold uppercase text-warm-900">
                                                <td colSpan={4} className="px-3 py-2 text-right">
                                                    Total del ajuste
                                                </td>
                                                <td className="px-3 py-2 text-right text-primary-700">{money(totalAjuste)}</td>
                                                <td />
                                            </tr>
                                        </tfoot>
                                    )}
                                </table>
                            </div>
                            {errors.detalles && <p className="mt-2 text-xs text-red-600">{errors.detalles}</p>}
                        </div>
                    </div>

                    {/* Derecha: los datos del ajuste */}
                    <div className="space-y-4 self-start rounded-xl border border-edge bg-white p-5 shadow-sm">
                        <h2 className="text-sm font-semibold text-warm-900">Datos del ajuste</h2>
                        <SearchSelect
                            label="Almacén"
                            value={form.almacen_id}
                            // Cambiar de almacén invalida lo ya elegido.
                            onChange={(v) => {
                                setForm((prev) => ({ ...prev, almacen_id: v ?? '' }));
                                setItems([]);
                                setPanel({ ...panelVacio });
                                limpiarError('almacen_id');
                            }}
                            placeholder="Seleccione un almacén"
                            emptyText="Sin coincidencias"
                            options={opcionesAlmacen(almacenes, form.almacen_id, propioId)}
                            error={errors.almacen_id}
                        />
                        <Select
                            label="Tipo"
                            name="tipo"
                            value={form.tipo}
                            // El tipo cambia qué productos y motivos aplican.
                            onChange={(e) => {
                                setForm((prev) => ({ ...prev, tipo: e.target.value, motivo: '' }));
                                setItems([]);
                                setPanel({ ...panelVacio });
                            }}
                            options={[
                                { value: 'entrada', label: 'Entrada' },
                                { value: 'salida', label: 'Salida' },
                            ]}
                            error={errors.tipo}
                        />
                        <Select
                            label="Motivo"
                            name="motivo"
                            value={form.motivo}
                            onChange={(e) => {
                                setForm((prev) => ({ ...prev, motivo: e.target.value }));
                                limpiarError('motivo');
                            }}
                            options={[{ value: '', label: 'Seleccione un motivo' }, ...motivosOptions]}
                            error={errors.motivo}
                        />
                        <SearchSelect
                            label="Proveedor (opcional)"
                            value={form.proveedor_id}
                            onChange={(v) => setForm((prev) => ({ ...prev, proveedor_id: v ?? '' }))}
                            options={proveedores.map((p) => ({ value: String(p.id), label: p.nombre }))}
                            placeholder="Sin proveedor"
                            emptyText="Sin coincidencias"
                        />
                        <Input
                            label="Observaciones"
                            name="observaciones"
                            placeholder="Opcional"
                            value={form.observaciones}
                            onChange={(e) => setForm((prev) => ({ ...prev, observaciones: e.target.value }))}
                        />

                        <div className="flex justify-end gap-2 border-t border-edge pt-4">
                            <Button type="button" variant="secondary" onClick={() => navigate('/ajustes')}>
                                Cancelar
                            </Button>
                            <Button type="submit" loading={saving}>
                                Crear ajuste
                            </Button>
                        </div>
                    </div>
                </div>
            </form>

            {/* El buscador de productos: una tela se elige por color. */}
            <ProductoPickerModal
                open={picker.open}
                onClose={() => setPicker((prev) => ({ ...prev, open: false }))}
                onSelect={agregarDesdePicker}
                initialQuery={picker.query}
                multiple
                // Entrada: la tabla por color (rollos, metraje, costo). Salida: los rollos de cada color.
                porColor={esSalida ? true : 'compra'}
                costo
                bloquearSinStock={esSalida}
                productos={productosDisponibles}
                existencias={esSalida ? existencias : null}
                almacenId={form.almacen_id || null}
                title="Buscar productos"
            />

            {/* Una tela elegida en el select (entrada): su tabla por color. */}
            {telaEntrada && (
                <TelaCompraModal
                    producto={telaEntrada}
                    moneda="PEN"
                    costo
                    onClose={() => setTelaEntrada(null)}
                    onAgregar={({ producto, lineas }) => {
                        agregarRollos(lineas.map((l) => ({ producto, color: l.color, rollos: l.rollos, cantidad: l.metros, precio: l.precio })));
                        setTelaEntrada(null);
                    }}
                />
            )}
        </Layout>
    );
}
