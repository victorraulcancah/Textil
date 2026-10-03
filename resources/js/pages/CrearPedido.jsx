import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ChevronRight, ClipboardList, Eraser, Plus, Trash2 } from 'lucide-react';
import api, { asList } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import Layout from '../components/Layout';
import ColorSelect from '../components/ColorSelect';
import ProductoPickerModal from '../components/ProductoPickerModal';
import { tipoUnidad } from '../lib/unidades';
import { precioPara } from '../lib/precios';
import { opcionesAlmacen, useAlmacenPropio } from '../lib/almacenes';
import { cargarTipoCambio, convertir, money, MONEDAS } from '../lib/moneda';
import { Alert, Button, Input, SearchSelect, Select, Spinner, cn } from '../components/ui';

const num = (n) => new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 }).format(Number(n) || 0);

const hoy = () => new Date().toISOString().slice(0, 10);

/** Una tela se pide en rollos enteros y se cobra por metro: cuánto mide cada rollo lo define el almacén. */
const ROLLOS = 'rollos';

/** El formato "Metro" de una tela; sin él, el producto no se pide por rollos. */
const presentacionMetroDe = (producto) =>
    (producto?.presentaciones ?? []).find((p) => p.activo !== false && tipoUnidad(p) === 'metro') ?? null;

/** Las unidades en que se pide un producto que no es tela (una tela se pide siempre en rollos). */
const unidadesDe = (producto) =>
    (producto?.presentaciones ?? [])
        .filter((p) => p.activo !== false)
        .map((p) => ({ value: String(p.id), label: p.nombre }));

/**
 * Alta y edición del pedido: lo que pide el cliente.
 *
 * Se pide por producto y cantidad —"120 metros de Polinán negro"— y no por
 * rollos concretos: el vendedor no puede saber qué piezas hay en el rack ni en
 * qué almacén están. Eso lo resuelve el almacenero al preparar el pedido,
 * escaneando los rollos con los que lo cubre.
 *
 * Una tela se pide por color y solo en rollos —"3 rollos de Polinán negro"— con
 * su precio por metro. El vendedor no sabe cuánto mide cada rollo: eso lo
 * define el almacén al separarlos, y ahí se cobra cada rollo por sus metros
 * reales. Por eso el importe de esas líneas queda "por definir".
 *
 * Por lo mismo aquí no se elige almacén.
 */
export default function CrearPedido() {
    const { id } = useParams();
    const navigate = useNavigate();
    const toast = useToast();
    const { user } = useAuth();

    const [clientes, setClientes] = useState([]);
    const [productos, setProductos] = useState([]);
    /** Stock disponible por producto, en unidad base. */
    /** Filas de existencias de TODOS los almacenes (producto × almacén, con metros por color). */
    const [todasExistencias, setTodasExistencias] = useState([]);
    /** El almacén (sucursal) del pedido: un usuario de sucursal usa el suyo; el Super Admin elige. */
    const { propioId, superAdmin } = useAlmacenPropio();
    const [almacenes, setAlmacenes] = useState([]);
    const [almacenId, setAlmacenId] = useState(propioId ? String(propioId) : '');

    /** Solo lo del almacén del pedido: es de donde sale la mercadería. */
    const existencias = useMemo(
        () => todasExistencias.filter((f) => !almacenId || String(f.almacen_id ?? f.almacen?.id) === String(almacenId)),
        [todasExistencias, almacenId],
    );
    /** Lo que se puede prometer de cada producto en ese almacén (lo disponible, no lo físico). */
    const stockPorProducto = useMemo(() => {
        const porProducto = {};
        for (const fila of existencias) {
            const pid = fila.producto?.id ?? fila.producto_id;
            if (!pid) continue;
            porProducto[pid] = (porProducto[pid] ?? 0) + Number(fila.stock_disponible ?? fila.stock_actual ?? 0);
        }
        return porProducto;
    }, [existencias]);
    const [cargando, setCargando] = useState(true);
    const [guardando, setGuardando] = useState(false);
    const [errores, setErrores] = useState({});

    const [cabecera, setCabecera] = useState({
        cliente_id: '',
        fecha_emision: hoy(),
        fecha_entrega: '',
        moneda: 'PEN',
        // SUNAT venta de la fecha, si el pedido es en dólares.
        tipo_cambio: '',
        observaciones: '',
    });

    /** El tipo de cambio de la fecha del pedido: SUNAT (venta) y comercial. */
    const [tcDia, setTcDia] = useState(null);
    /** El del pedido se escribió a mano (o viene guardado): ya no sigue al SUNAT. */
    const [tcManual, setTcManual] = useState(false);

    /** Líneas ya agregadas al pedido. */
    const [lineas, setLineas] = useState([]);
    /** Las telas desplegadas en la tabla (sus colores a la vista): { [productoId]: true }. */
    const [abiertas, setAbiertas] = useState({});

    /** Buscador avanzado: se abre con lo que ya se haya escrito arriba. */
    const [picker, setPicker] = useState({ open: false, query: '' });

    /**
     * 'rollo' | 'metro' | null. La unidad del primer producto agregado queda
     * propuesta para los siguientes; cada línea la puede cambiar aparte.
     */
    const [unidadPreferida, setUnidadPreferida] = useState(null);

    /** El renglón de arriba, donde se arma la línea antes de agregarla. */
    const [nueva, setNueva] = useState({
        producto_id: '',
        producto_presentacion_id: '',
        producto_color_id: '',
        descripcion: '',
        // En una tela, los rollos; en lo demás, la cantidad de la unidad elegida.
        cantidad: '',
        precio_unitario: '',
        // Escrito a mano: ya no se reemplaza con el precio de lista.
        precioManual: false,
        // Una tela puede pedirse con un metraje por rollo ("1 rollo de 50 m").
        conMetraje: false,
        metros_por_rollo: '',
    });

    /* ------------------------------ carga ------------------------------ */

    useEffect(() => {
        (async () => {
            try {
                const [clientesRes, productosRes, existenciasRes] = await Promise.all([
                    api.get('/clientes'),
                    api.get('/productos', { params: { per_page: 500 } }),
                    api.get('/existencias'),
                ]);
                // El Super Admin elige el almacén del pedido; los demás ya tienen el suyo.
                if (superAdmin) {
                    const almRes = await api.get('/almacenes');
                    const lista = asList(almRes);
                    setAlmacenes(lista);
                    setAlmacenId((actual) => actual || String((lista.find((a) => a.predeterminado && a.activo !== false) ?? lista[0])?.id ?? ''));
                }

                setClientes(asList(clientesRes));
                setProductos(asList(productosRes));

                // Las filas de todos los almacenes: el stock que se muestra y se promete es el del almacén del pedido.
                setTodasExistencias(asList(existenciasRes));

                if (id) {
                    const { data } = await api.get(`/ordenes-venta/${id}`);
                    const p = data?.data ?? data;

                    if (!p.editable) {
                        toast.error('Este pedido ya no es editable.');
                        navigate('/pedidos');
                        return;
                    }

                    setCabecera({
                        cliente_id: p.cliente_id ? String(p.cliente_id) : '',
                        fecha_emision: p.fecha_emision,
                        fecha_entrega: p.fecha_entrega ?? '',
                        moneda: p.moneda ?? 'PEN',
                        tipo_cambio: p.tipo_cambio ? String(Number(p.tipo_cambio)) : '',
                        observaciones: p.observaciones ?? '',
                    });
                    setTcManual(Boolean(p.tipo_cambio));
                    if (p.almacen_id) setAlmacenId(String(p.almacen_id));

                    setLineas(
                        (p.detalles ?? []).map((d) => ({
                            producto_presentacion_id: String(d.producto_presentacion_id),
                            producto_color_id: d.producto_color_id ? String(d.producto_color_id) : '',
                            producto: d.producto,
                            color: d.color?.nombre ?? '',
                            modo: d.modo ?? 'metros',
                            rollos_pedidos: d.rollos_pedidos ? String(d.rollos_pedidos) : '',
                            metros_por_rollo: d.metros_por_rollo ? String(d.metros_por_rollo) : '',
                            presentacion: d.modo === ROLLOS ? 'Rollo' : d.presentacion,
                            descripcion: d.descripcion ?? '',
                            cantidad: String(d.cantidad),
                            precio_unitario: String(d.precio_unitario),
                            precio_oculto: Boolean(d.precio_oculto),
                            // Lo guardado no se recalcula solo.
                            precio_manual: true,
                        })),
                    );
                }
            } catch {
                toast.error('No se pudieron cargar los datos del pedido.');
            } finally {
                setCargando(false);
            }
        })();
    }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

    /* ------------------------------ renglón ------------------------------ */

    const producto = useMemo(
        () => productos.find((p) => String(p.id) === String(nueva.producto_id)) ?? null,
        [productos, nueva.producto_id],
    );

    const presentaciones = useMemo(
        () => (producto?.presentaciones ?? []).filter((p) => p.activo !== false),
        [producto],
    );

    const presentacion = useMemo(
        () => presentaciones.find((p) => String(p.id) === String(nueva.producto_presentacion_id)) ?? null,
        [presentaciones, nueva.producto_presentacion_id],
    );

    /** A qué tipo de precio se le vende a este cliente; sin cliente o sin tipo, al principal. */
    const cliente = clientes.find((c) => String(c.id) === String(cabecera.cliente_id)) ?? null;
    const tipoPrecioId = cliente?.tipo_precio_id ?? null;

    /** La presentación de una línea, para buscarle su precio. */
    const presentacionDe = (id) =>
        productos.flatMap((p) => p.presentaciones ?? []).find((pr) => String(pr.id) === String(id)) ?? null;

    /** El producto de una presentación (la línea no lo guarda: se deduce, también al editar). */
    const productoDe = (presentacionId) =>
        productos.find((p) => (p.presentaciones ?? []).some((pr) => String(pr.id) === String(presentacionId))) ??
        null;

    // Una tela se pide siempre en rollos, al precio del metro.
    const metroNueva = presentacionMetroDe(producto);
    const esTelaNueva = Boolean(metroNueva);

    /** En qué moneda se vende el producto de esa presentación. */
    const monedaDe = (pres) =>
        productos.find((p) => (p.presentaciones ?? []).some((pr) => String(pr.id) === String(pres?.id)))?.moneda_venta ||
        'PEN';

    /** El precio de lista: el del tipo de precio del cliente, según la cantidad, en la moneda del pedido. */
    const precioDeLista = (pres, cantidad) =>
        String(convertir(precioPara(pres, tipoPrecioId, cantidad), monedaDe(pres), cabecera.moneda, cabecera.tipo_cambio));

    // Otro cliente, otro tipo de precio, otra moneda u otro tipo de cambio: las
    // líneas sin precio a mano se recalculan.
    useEffect(() => {
        setLineas((prev) =>
            prev.map((l) =>
                l.precio_manual
                    ? l
                    : {
                          ...l,
                          // En rollos no se sabe cuántos metros: rige el precio base.
                          precio_unitario: precioDeLista(
                              presentacionDe(l.producto_presentacion_id),
                              l.modo === ROLLOS ? 1 : l.cantidad,
                          ),
                      },
            ),
        );
    }, [tipoPrecioId, cabecera.moneda, cabecera.tipo_cambio]); // eslint-disable-line react-hooks/exhaustive-deps

    // El tipo de cambio de la fecha. El del pedido sigue al SUNAT mientras no se escriba otro.
    useEffect(() => {
        if (!cabecera.fecha_emision) return;
        cargarTipoCambio(cabecera.fecha_emision)
            .then((tc) => {
                setTcDia(tc);
                if (!tcManual && tc?.venta) setCabecera((p) => ({ ...p, tipo_cambio: String(tc.venta) }));
            })
            .catch(() => setTcDia(null));
    }, [cabecera.fecha_emision]); // eslint-disable-line react-hooks/exhaustive-deps

    /** Otra moneda: lo que tiene precio a mano se lleva a la nueva; lo demás lo recalcula la lista. */
    const cambiarMoneda = (nueva) => {
        if (nueva === cabecera.moneda) return;
        const tc = Number(cabecera.tipo_cambio) || Number(tcDia?.venta) || 0;
        setLineas((prev) =>
            prev.map((l) =>
                l.precio_manual
                    ? { ...l, precio_unitario: String(convertir(l.precio_unitario, cabecera.moneda, nueva, tc)) }
                    : l,
            ),
        );
        setCabecera((p) => ({
            ...p,
            moneda: nueva,
            tipo_cambio: p.tipo_cambio || (tcDia?.venta ? String(tcDia.venta) : ''),
        }));
    };

    /**
     * El stock del producto, expresado en la unidad elegida. Con un color
     * elegido cuenta solo los metros libres de ese color (los rollos son los
     * que saben de colores) sumando todos los almacenes.
     */
    const stockEnUnidad = useMemo(() => {
        if (!producto) return null;

        if (nueva.producto_color_id) {
            let metros = 0;
            for (const fila of existencias) {
                if (String(fila.producto?.id ?? fila.producto_id) !== String(producto.id)) continue;
                for (const c of fila.colores ?? []) {
                    if (String(c.id) === String(nueva.producto_color_id)) {
                        metros += Number(c.metros_disponibles ?? c.metros) || 0;
                    }
                }
            }
            // Cuántos metros trae una unidad de la presentación elegida.
            const porMetro = (producto.presentaciones ?? []).find(
                (p) => (p.unidad_base?.abreviatura ?? '').toLowerCase() === 'm',
            );
            const metrosPorUnidad =
                (Number(presentacion?.factor_conversion) || 1) / (Number(porMetro?.factor_conversion) || 1);
            return metros / metrosPorUnidad;
        }

        const base = stockPorProducto[producto.id] ?? 0;
        const factor = Number(presentacion?.factor_conversion) || 1;
        return base / factor;
    }, [producto, presentacion, stockPorProducto, existencias, nueva.producto_color_id]);

    /**
     * Los rollos libres de la tela (del color elegido, si hay uno), sumando
     * todos los almacenes y restando los que otros pedidos ya pidieron y el
     * almacén aún no asigna.
     */
    const rollosLibres = useMemo(() => {
        if (!producto) return 0;
        const porColor = new Map();
        for (const fila of existencias) {
            if (String(fila.producto?.id ?? fila.producto_id) !== String(producto.id)) continue;
            for (const c of fila.colores ?? []) {
                const k = String(c.id ?? 'sin');
                const previo = porColor.get(k) ?? { libres: 0, porAsignar: 0 };
                previo.libres += Number(c.rollos_disponibles ?? c.rollos) || 0;
                // El mismo número en cada almacén: se resta una sola vez.
                previo.porAsignar = Math.max(previo.porAsignar, Number(c.rollos_por_asignar) || 0);
                porColor.set(k, previo);
            }
        }
        let total = 0;
        for (const [k, v] of porColor) {
            if (nueva.producto_color_id && k !== String(nueva.producto_color_id)) continue;
            total += Math.max(0, v.libres - v.porAsignar);
        }
        return total;
    }, [producto, existencias, nueva.producto_color_id]);

    /**
     * Al elegir producto se propone un formato.
     *
     * Primero se intenta seguir con la unidad del último ítem agregado
     * (rollo o metro): si el pedido viene en rollos, lo natural es seguir
     * pidiendo rollos. Si esta tela no tiene esa unidad, o todavía no hay
     * preferencia, se propone el metro (así se pide la tela) y si tampoco
     * hay, el formato más pequeño — el mayor a secas dejaba "Retazo (saldo)",
     * que es para restos y nadie pide así.
     */
    useEffect(() => {
        if (!producto) return;

        // Una tela se pide en rollos, al precio del metro.
        const metro = presentacionMetroDe(producto);
        if (metro) {
            setNueva((prev) => ({
                ...prev,
                producto_presentacion_id: String(metro.id),
                precio_unitario: precioDeLista(metro, 1),
                precioManual: false,
                // Otro producto, otro color: nunca se hereda de la línea anterior.
                producto_color_id: '',
            }));
            return;
        }

        const activas = (producto.presentaciones ?? []).filter((p) => p.activo !== false);
        const porPreferida = unidadPreferida
            ? activas.find((p) => tipoUnidad(p) === unidadPreferida)
            : null;
        const porMetro = activas.find(
            (p) => (p.unidad_base?.abreviatura ?? '').toLowerCase() === 'm',
        );
        const menor = [...activas].sort(
            (a, b) => (Number(a.factor_conversion) || 1) - (Number(b.factor_conversion) || 1),
        )[0];
        const elegida = porPreferida ?? porMetro ?? menor;

        setNueva((prev) => ({
            ...prev,
            producto_presentacion_id: elegida ? String(elegida.id) : '',
            precio_unitario: elegida ? precioDeLista(elegida, prev.cantidad || 1) : '',
            precioManual: false,
            // Otro producto, otro color: nunca se hereda de la línea anterior.
            producto_color_id: '',
        }));
    }, [producto]);

    // El precio sugerido sigue al formato, al cliente y a la cantidad (puede
    // entrar en un precio por cantidad), mientras no se escriba uno a mano. Una
    // tela se pide en rollos: sus metros no se saben, así que rige el precio base.
    useEffect(() => {
        if (!presentacion) return;
        setNueva((prev) =>
            prev.precioManual
                ? prev
                : { ...prev, precio_unitario: precioDeLista(presentacion, esTelaNueva ? 1 : prev.cantidad || 1) },
        );
    }, [presentacion?.id, tipoPrecioId, nueva.cantidad]); // eslint-disable-line react-hooks/exhaustive-deps

    const puedeAgregar =
        nueva.producto_presentacion_id &&
        Number(nueva.cantidad) > 0 &&
        Number(nueva.precio_unitario) >= 0 &&
        // Una tela: rollos enteros y, si tiene colores, el color (cada rollo es de uno).
        (!esTelaNueva ||
            (Number.isInteger(Number(nueva.cantidad)) &&
                (!nueva.conMetraje || Number(nueva.metros_por_rollo) > 0) &&
                (!(producto?.colores?.length > 0) || Boolean(nueva.producto_color_id))));

    /** Suma rollos de un color de una tela a las líneas: si ya estaba pedido, se le suman. */
    const conRollos = (lista, { producto: prod, metro, color, rollos, descripcion = '', precio = null, manual = false, metrosPorRollo = '' }) => {
        const next = [...lista];
        const j = next.findIndex(
            (l) =>
                l.modo === ROLLOS &&
                String(l.producto_presentacion_id) === String(metro.id) &&
                String(l.producto_color_id || '') === String(color?.id ?? '') &&
                // Rollos de otro metraje son otra línea (no se suman a los de 50 m).
                String(l.metros_por_rollo || '') === String(metrosPorRollo || ''),
        );

        if (j !== -1) {
            next[j] = { ...next[j], rollos_pedidos: String((Number(next[j].rollos_pedidos) || 0) + rollos) };
            return next;
        }

        next.push({
            producto_presentacion_id: String(metro.id),
            producto_color_id: color ? String(color.id) : '',
            producto: prod.nombre,
            color: color?.nombre ?? '',
            modo: ROLLOS,
            rollos_pedidos: String(rollos),
            metros_por_rollo: metrosPorRollo ? String(metrosPorRollo) : '',
            presentacion: 'Rollo',
            descripcion,
            // Sin metraje pedido no se sabe cuánto mide cada rollo: el almacén lo define al separar.
            cantidad: '0',
            precio_unitario: precio ?? precioDeLista(metro, 1),
            precio_oculto: false,
            precio_manual: manual,
        });

        return next;
    };

    const agregar = () => {
        if (!puedeAgregar) return;

        const colorElegido = (producto?.colores ?? []).find(
            (c) => String(c.id) === String(nueva.producto_color_id),
        );

        if (esTelaNueva) {
            setLineas((prev) =>
                conRollos(prev, {
                    producto,
                    metro: metroNueva,
                    color: colorElegido ?? null,
                    rollos: Number(nueva.cantidad),
                    descripcion: nueva.descripcion.trim(),
                    precio: nueva.precio_unitario,
                    manual: Boolean(nueva.precioManual),
                    metrosPorRollo: nueva.conMetraje ? nueva.metros_por_rollo : '',
                }),
            );
        } else {
            // La unidad de este ítem queda propuesta para el siguiente, aunque
            // nadie haya tocado el selector (el metro por defecto, por ejemplo).
            const tipo = tipoUnidad(presentacion);
            if (tipo) setUnidadPreferida(tipo);

            setLineas((prev) => [
                ...prev,
                {
                    producto_presentacion_id: nueva.producto_presentacion_id,
                    producto_color_id: nueva.producto_color_id || '',
                    producto: producto?.nombre,
                    color: colorElegido?.nombre ?? '',
                    modo: 'metros',
                    rollos_pedidos: '',
                    presentacion: presentacion?.nombre,
                    descripcion: nueva.descripcion.trim(),
                    cantidad: nueva.cantidad,
                    precio_unitario: nueva.precio_unitario,
                    precio_oculto: false,
                    precio_manual: Boolean(nueva.precioManual),
                },
            ]);
        }

        // Lo escrito se queda: para pedir otro color de la misma tela solo se
        // cambia lo que difiere. Para empezar de cero está "Limpiar".
    };

    /** Vacía el renglón de arriba. */
    const limpiar = () =>
        setNueva({
            producto_id: '',
            producto_presentacion_id: '',
            producto_color_id: '',
            descripcion: '',
            cantidad: '',
            precio_unitario: '',
            precioManual: false,
            conMetraje: false,
            metros_por_rollo: '',
        });

    /**
     * Alta en lote desde el buscador avanzado. Lo que ya está en el pedido no
     * se duplica: se le suma la cantidad, igual que en la proforma.
     */
    const agregarDesdePicker = (seleccionados) => {
        const utiles = seleccionados.filter((s) => s.presentacion && s.cantidad > 0);
        if (!utiles.length) return;

        setLineas((prev) => {
            let next = [...prev];

            utiles.forEach(({ producto, presentacion, cantidad, color, porRollos }) => {
                // Una tela marcada por color: rollos enteros al precio del metro.
                if (porRollos) {
                    next = conRollos(next, {
                        producto,
                        metro: presentacion,
                        color,
                        rollos: Math.max(1, Math.round(cantidad)),
                    });
                    return;
                }

                // Un mismo formato en otro color es otra línea: el almacén
                // verifica que el rollo escaneado sea del color pedido.
                const i = next.findIndex(
                    (l) =>
                        l.modo !== ROLLOS &&
                        String(l.producto_presentacion_id) === String(presentacion.id) &&
                        String(l.producto_color_id || '') === String(color?.id ?? ''),
                );

                if (i !== -1) {
                    const total = (Number(next[i].cantidad) || 0) + cantidad;
                    next[i] = {
                        ...next[i],
                        cantidad: String(total),
                        // Más cantidad puede entrar en otro precio por cantidad.
                        ...(next[i].precio_manual ? {} : { precio_unitario: precioDeLista(presentacion, total) }),
                    };
                    return;
                }

                next.push({
                    producto_presentacion_id: String(presentacion.id),
                    // El color que se filtró en el buscador viaja con la línea.
                    producto_color_id: color ? String(color.id) : '',
                    producto: producto.nombre,
                    color: color?.nombre ?? '',
                    modo: 'metros',
                    rollos_pedidos: '',
                    presentacion: presentacion.nombre,
                    descripcion: '',
                    cantidad: String(cantidad),
                    precio_unitario: precioDeLista(presentacion, cantidad),
                    precio_oculto: false,
                    precio_manual: false,
                });
            });

            return next;
        });

        // La unidad con la que se viene pidiendo queda propuesta para lo siguiente.
        const ultimo = utiles.filter((u) => !u.porRollos).pop();
        const tipo = ultimo ? tipoUnidad(ultimo.presentacion) : null;
        if (tipo) setUnidadPreferida(tipo);

        setPicker((prev) => ({ ...prev, open: false }));
        toast.success(
            utiles.length === 1 ? 'Producto agregado al pedido.' : `${utiles.length} productos agregados al pedido.`,
        );
    };

    /**
     * Escribir el precio lo deja fijo. Cambiar la cantidad vuelve a buscar el
     * precio de lista (puede entrar en un precio por cantidad), salvo que el
     * precio se haya escrito a mano. En rollos no hay metros que cambien el precio.
     */
    const cambiar = (i, campo, valor) =>
        setLineas((prev) =>
            prev.map((l, j) => {
                if (j !== i) return l;
                const next = { ...l, [campo]: valor };
                if (campo === 'precio_unitario') next.precio_manual = true;
                if (campo === 'cantidad' && !l.precio_manual) {
                    next.precio_unitario = precioDeLista(presentacionDe(l.producto_presentacion_id), valor);
                }
                return next;
            }),
        );

    /** Otra unidad para una línea que no es tela en rollos: otro formato, otro precio de lista. */
    const cambiarUnidad = (i, valor) =>
        setLineas((prev) =>
            prev.map((x, j) => {
                if (j !== i || valor === String(x.producto_presentacion_id)) return x;
                const elegida = (productoDe(x.producto_presentacion_id)?.presentaciones ?? []).find(
                    (pr) => String(pr.id) === valor,
                );

                return {
                    ...x,
                    producto_presentacion_id: valor,
                    presentacion: elegida?.nombre ?? x.presentacion,
                    precio_unitario: elegida ? precioDeLista(elegida, x.cantidad) : x.precio_unitario,
                    precio_manual: false,
                };
            }),
        );

    const quitar = (i) => setLineas((prev) => prev.filter((_, j) => j !== i));
    /** Quita de una vez todos los colores de una tela. */
    const quitarVarias = (indices) => setLineas((prev) => prev.filter((_, j) => !indices.includes(j)));
    /** Un solo precio por metro para todos los colores de una tela. */
    const precioDeTela = (indices, valor) =>
        setLineas((prev) =>
            prev.map((l, j) => (indices.includes(j) ? { ...l, precio_unitario: valor, precio_manual: true } : l)),
        );
    const alternar = (clave) => setAbiertas((prev) => ({ ...prev, [clave]: !prev[clave] }));
    const hayRollos = lineas.some((l) => l.modo === ROLLOS);

    /**
     * Lo que se ve en la tabla: cada tela pedida en rollos es una sola fila
     * (sus colores se despliegan debajo); lo demás va línea por línea.
     */
    const filasTabla = useMemo(() => {
        const filas = [];
        const telas = new Map();

        lineas.forEach((l, i) => {
            if (l.modo !== ROLLOS) {
                filas.push({ tipo: 'linea', clave: `l${i}`, l, i });
                return;
            }
            const clave = String(productoDe(l.producto_presentacion_id)?.id ?? `p${l.producto_presentacion_id}`);
            if (!telas.has(clave)) {
                const tela = { tipo: 'tela', clave, producto: l.producto, indices: [] };
                telas.set(clave, tela);
                filas.push(tela);
            }
            telas.get(clave).indices.push(i);
        });

        return filas;
    }, [lineas, productos]); // eslint-disable-line react-hooks/exhaustive-deps

    /**
     * Lo que ya se sabe cobrar. Una línea con precio por confirmar no suma, y
     * los rollos tampoco: se cobran por sus metros reales cuando el almacén los separa.
     */
    const total = useMemo(
        () =>
            lineas.reduce(
                (s, l) =>
                    l.precio_oculto || l.modo === ROLLOS
                        ? s
                        : s + (Number(l.cantidad) || 0) * (Number(l.precio_unitario) || 0),
                0,
            ),
        [lineas],
    );

    /* ------------------------------ guardar ------------------------------ */

    const guardar = async () => {
        setGuardando(true);
        setErrores({});

        try {
            if (cabecera.moneda !== 'PEN' && !(Number(cabecera.tipo_cambio) > 0)) {
                toast.error('Pon el tipo de cambio del pedido.');
                return;
            }
            if (!id && !almacenId) {
                toast.error('Elige el almacén del pedido.');
                return;
            }
            const cuerpo = {
                ...cabecera,
                almacen_id: almacenId ? Number(almacenId) : null,
                tipo_cambio: cabecera.moneda !== 'PEN' ? Number(cabecera.tipo_cambio) || null : null,
                cliente_id: cabecera.cliente_id || null,
                fecha_entrega: cabecera.fecha_entrega || null,
                vendedor_id: user?.id,
                detalles: lineas.map((l) => ({
                    producto_presentacion_id: Number(l.producto_presentacion_id),
                    producto_color_id: l.producto_color_id ? Number(l.producto_color_id) : null,
                    modo: l.modo === ROLLOS ? ROLLOS : 'metros',
                    rollos_pedidos: l.modo === ROLLOS ? Number(l.rollos_pedidos) || 0 : null,
                    metros_por_rollo: l.modo === ROLLOS && Number(l.metros_por_rollo) > 0 ? Number(l.metros_por_rollo) : null,
                    // En rollos no hay metros: los define el almacén al separar.
                    cantidad: l.modo === ROLLOS ? null : Number(l.cantidad) || 0,
                    precio_unitario: Number(l.precio_unitario) || 0,
                    descripcion: l.descripcion || null,
                    precio_oculto: Boolean(l.precio_oculto),
                })),
            };

            if (id) {
                await api.put(`/ordenes-venta/${id}`, cuerpo);
                toast.success('Pedido actualizado.');
            } else {
                await api.post('/ordenes-venta', cuerpo);
                toast.success('Pedido creado. Solicítalo al almacén para que lo preparen.');
            }
            navigate('/pedidos');
        } catch (err) {
            if (err.response?.status === 422) {
                const v = err.response.data?.errors ?? {};
                setErrores(v);
                const primero = Object.values(v)[0]?.[0];
                if (primero) toast.error(primero);
            } else {
                toast.error(err.response?.data?.message ?? 'No se pudo guardar el pedido.');
            }
        } finally {
            setGuardando(false);
        }
    };

    if (cargando) {
        return (
            <Layout>
                <div className="flex justify-center py-24">
                    <Spinner size="lg" className="text-primary-600" />
                </div>
            </Layout>
        );
    }

    return (
        <Layout>
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-100 text-primary-700">
                        <ClipboardList className="h-5 w-5" />
                    </span>
                    <div>
                        <h1 className="text-xl font-bold text-warm-900">
                            {id ? 'Editar pedido' : 'Nuevo pedido'}
                        </h1>
                        <p className="text-sm text-warm-500">
                            Lo que pide el cliente. Sale de tu almacén; el almacenero decide con qué rollos lo cubre.
                        </p>
                    </div>
                </div>
                <Button variant="secondary" onClick={() => navigate('/pedidos')}>
                    <ArrowLeft className="h-4 w-4" />
                    Volver
                </Button>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1fr_22rem] lg:items-start *:min-w-0">
                {/* ── Productos ───────────────────────────────────────── */}
                <section className="rounded-xl border border-edge bg-white p-5 shadow-sm">
                    <h2 className="text-base font-semibold text-warm-900">Productos</h2>
                    <p className="mb-4 text-sm text-warm-500">
                        {lineas.length} producto{lineas.length === 1 ? '' : 's'} agregado
                        {lineas.length === 1 ? '' : 's'}
                    </p>

                    <div className="space-y-4">
                        <SearchSelect
                            label="Buscar producto"
                            placeholder="Nombre o código…"
                            value={nueva.producto_id}
                            onChange={(v) => setNueva((prev) => ({ ...prev, producto_id: v }))}
                            options={productos.map((p) => ({
                                value: String(p.id),
                                label: p.nombre,
                                keywords: p.codigo,
                            }))}
                            searchTitle="Buscador avanzado con filtros"
                            onSearch={(q) => setPicker({ open: true, query: q })}
                        />

                        <Input
                            label="Descripción"
                            placeholder="Detalle para esta línea (opcional)"
                            value={nueva.descripcion}
                            onChange={(e) => setNueva((prev) => ({ ...prev, descripcion: e.target.value }))}
                        />

                        {/* Solo si la tela tiene colores registrados: hay
                            insumos (hilos, cierres) que no se piden por color. */}
                        {producto?.colores?.length > 0 && (
                            <ColorSelect
                                colores={producto.colores}
                                value={nueva.producto_color_id}
                                onChange={(id) => setNueva((prev) => ({ ...prev, producto_color_id: id }))}
                            />
                        )}

                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                            <Input
                                label="Disponible"
                                value={
                                    !producto
                                        ? ''
                                        : esTelaNueva
                                          ? `${num(rollosLibres)} rollo${rollosLibres === 1 ? '' : 's'}`
                                          : `${num(stockEnUnidad)} ${presentacion?.nombre ?? ''}`.trim()
                                }
                                readOnly
                                disabled
                            />
                            {/* Una tela se pide siempre en rollos; lo demás, en la unidad que se elija. */}
                            {esTelaNueva ? (
                                <Input label="Unidad" value="Rollo" readOnly disabled />
                            ) : (
                                <SearchSelect
                                    label="Unidad"
                                    value={nueva.producto_presentacion_id}
                                    disabled={!producto}
                                    clearable={false}
                                    placeholder={producto ? 'Elegir…' : '—'}
                                    emptyText="Sin unidades"
                                    onChange={(id) => {
                                        if (!id) return;
                                        const elegida = presentaciones.find((p) => String(p.id) === id);
                                        // Se cambia esta línea nada más; la
                                        // preferencia para las siguientes se
                                        // actualiza al agregarla.
                                        setNueva((prev) => ({ ...prev, producto_presentacion_id: id, precioManual: false }));
                                        if (elegida) setUnidadPreferida(tipoUnidad(elegida));
                                    }}
                                    options={unidadesDe(producto)}
                                />
                            )}
                            <Input
                                label={esTelaNueva ? 'Rollos' : 'Cantidad'}
                                type="number"
                                step={esTelaNueva ? '1' : '0.01'}
                                min="0"
                                value={nueva.cantidad}
                                onChange={(e) => setNueva((prev) => ({ ...prev, cantidad: e.target.value }))}
                            />
                            <Input
                                label={esTelaNueva ? 'Precio por metro' : 'Precio de venta'}
                                type="number"
                                step="0.01"
                                min="0"
                                placeholder="0.00"
                                value={nueva.precio_unitario}
                                onChange={(e) =>
                                    setNueva((prev) => ({ ...prev, precio_unitario: e.target.value, precioManual: true }))
                                }
                            />
                        </div>

                        {/* Una tela: rollos enteros, o rollos de un metraje que el almacén corta si no lo tiene. */}
                        {esTelaNueva && (
                            <div className="-mt-2 space-y-2">
                                <div className="flex flex-wrap items-end gap-4">
                                    <label className="flex cursor-pointer items-center gap-2 pb-2 text-sm font-medium text-warm-700">
                                        <input
                                            type="checkbox"
                                            checked={nueva.conMetraje}
                                            onChange={(e) =>
                                                setNueva((prev) => ({ ...prev, conMetraje: e.target.checked, metros_por_rollo: e.target.checked ? prev.metros_por_rollo : '' }))
                                            }
                                            className="h-4 w-4 rounded border-gray-300 accent-primary-600"
                                        />
                                        Pedir un metraje por rollo
                                    </label>
                                    {nueva.conMetraje && (
                                        <div className="w-44">
                                            <Input
                                                label="Metros por rollo"
                                                type="number"
                                                step="0.01"
                                                min="0"
                                                placeholder="Ej.: 50"
                                                value={nueva.metros_por_rollo}
                                                onChange={(e) => setNueva((prev) => ({ ...prev, metros_por_rollo: e.target.value }))}
                                                className="text-right"
                                            />
                                        </div>
                                    )}
                                </div>
                                <p className="text-xs text-warm-500">
                                    {producto?.colores?.length > 0 && !nueva.producto_color_id
                                        ? 'Elige el color de la tela. '
                                        : ''}
                                    {nueva.conMetraje
                                        ? 'Cada rollo sale con ese metraje: si el almacén no tiene uno de ese largo, corta la tela de otro más grande. Se cobra por los metros que salgan.'
                                        : 'Se piden rollos enteros. Cuánto mide cada uno lo define el almacén al separarlo y se cobra por sus metros reales.'}
                                </p>
                            </div>
                        )}

                        <div className="flex flex-wrap items-center gap-2">
                            <Button onClick={agregar} disabled={!puedeAgregar}>
                                <Plus className="h-4 w-4" />
                                Agregar producto
                            </Button>
                            <Button type="button" variant="secondary" onClick={limpiar}>
                                <Eraser className="h-4 w-4" />
                                Limpiar
                            </Button>
                        </div>
                    </div>

                    {/* Líneas del pedido */}
                    <div className="mt-5 overflow-x-auto rounded-lg border border-edge">
                        <table className="w-full min-w-[640px] text-sm">
                            <thead>
                                <tr className="bg-primary-600 text-left text-xs font-semibold uppercase tracking-wide text-white">
                                    <th className="px-3 py-2">Producto</th>
                                    <th className="px-3 py-2">Presentación</th>
                                    <th className="px-3 py-2 text-right">Cantidad</th>
                                    <th className="px-3 py-2 text-right">Precio de venta</th>
                                    <th className="px-3 py-2 text-right">Subtotal</th>
                                    <th className="w-14 px-3 py-2 text-center">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {lineas.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="px-3 py-10 text-center text-warm-400">
                                            Agrega productos con el buscador de arriba.
                                        </td>
                                    </tr>
                                )}

                                {filasTabla.map((fila) => {
                                    // Una tela: una fila y, al desplegarla, sus colores con los rollos.
                                    if (fila.tipo === 'tela') {
                                        const colores = fila.indices.map((i) => ({ l: lineas[i], i }));
                                        const rollos = colores.reduce((suma, { l }) => suma + (Number(l.rollos_pedidos) || 0), 0);
                                        const precios = [...new Set(colores.map(({ l }) => String(l.precio_unitario)))];
                                        const abierta = Boolean(abiertas[fila.clave]);
                                        const error = colores
                                            .map(({ i }) => errores[`detalles.${i}.cantidad`] ?? errores[`detalles.${i}.rollos_pedidos`])
                                            .find(Boolean);
                                        const hexDe = (l) =>
                                            (productoDe(l.producto_presentacion_id)?.colores ?? []).find(
                                                (c) => String(c.id) === String(l.producto_color_id),
                                            )?.hex;

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
                                                                <ChevronRight
                                                                    className={cn(
                                                                        'h-4 w-4 transition-transform duration-300',
                                                                        abierta && 'rotate-90',
                                                                    )}
                                                                />
                                                            </button>
                                                            <span className="font-medium text-warm-900">{fila.producto}</span>
                                                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-warm-700">
                                                                {colores.length} color{colores.length === 1 ? '' : 'es'}
                                                            </span>
                                                        </span>
                                                        {error && <span className="block pl-7 text-xs text-red-600">{error[0]}</span>}
                                                    </td>
                                                    <td className="px-3 py-2 text-warm-700">Rollo</td>
                                                    <td className="px-3 py-2 text-right font-medium text-warm-900">
                                                        {rollos} rollo{rollos === 1 ? '' : 's'}
                                                    </td>
                                                    {/* Un precio por metro para toda la tela; cada color puede llevar el suyo. */}
                                                    <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                                                        <Input
                                                            type="number"
                                                            step="0.01"
                                                            min="0"
                                                            value={precios.length === 1 ? precios[0] : ''}
                                                            placeholder={precios.length === 1 ? undefined : 'varios'}
                                                            onChange={(e) => precioDeTela(fila.indices, e.target.value)}
                                                            className="ml-auto w-28 text-right"
                                                            aria-label={`Precio por metro de ${fila.producto}`}
                                                        />
                                                        <span className="mt-0.5 block text-[11px] text-warm-500">por metro</span>
                                                    </td>
                                                    <td className="px-3 py-2 text-right font-normal text-warm-500">Por definir</td>
                                                    <td className="px-3 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                                                        <button
                                                            type="button"
                                                            aria-label={`Quitar ${fila.producto}`}
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
                                                        <div
                                                            className={cn(
                                                                'grid transition-[grid-template-rows] duration-300 ease-out',
                                                                abierta ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
                                                            )}
                                                        >
                                                            <div className="overflow-hidden">
                                                                <div
                                                                    className={cn(
                                                                        'bg-gray-50/70 py-1 pl-10 pr-3 transition-opacity duration-300',
                                                                        abierta ? 'border-b border-gray-100 opacity-100' : 'opacity-0',
                                                                    )}
                                                                >
                                                                    <div className="grid grid-cols-[1fr_7rem_8rem_2.5rem] items-center gap-3 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-warm-500">
                                                                        <span>Color</span>
                                                                        <span className="text-right">Rollos</span>
                                                                        <span className="text-right">Precio por metro</span>
                                                                        <span />
                                                                    </div>
                                                                    {colores.map(({ l, i }) => (
                                                                        <div
                                                                            key={i}
                                                                            className="grid grid-cols-[1fr_7rem_8rem_2.5rem] items-center gap-3 px-2 py-1.5"
                                                                        >
                                                                            <span className="inline-flex items-center gap-2 font-medium uppercase text-warm-800">
                                                                                <span
                                                                                    className="h-3 w-3 shrink-0 rounded-full ring-1 ring-black/10"
                                                                                    style={{ backgroundColor: hexDe(l) || '#9ca3af' }}
                                                                                />
                                                                                {l.color || 'Cualquier color'}
                                                                                {Number(l.metros_por_rollo) > 0 && (
                                                                                    <span className="text-xs font-semibold normal-case text-primary-700">
                                                                                        · rollos de {num(l.metros_por_rollo)} m
                                                                                    </span>
                                                                                )}
                                                                            </span>
                                                                            <Input
                                                                                type="number"
                                                                                step="1"
                                                                                min="1"
                                                                                value={l.rollos_pedidos}
                                                                                onChange={(e) => cambiar(i, 'rollos_pedidos', e.target.value)}
                                                                                className="text-right"
                                                                                aria-label={`Rollos de ${fila.producto} ${l.color}`}
                                                                                tabIndex={abierta ? 0 : -1}
                                                                            />
                                                                            <Input
                                                                                type="number"
                                                                                step="0.01"
                                                                                min="0"
                                                                                value={l.precio_unitario}
                                                                                onChange={(e) => cambiar(i, 'precio_unitario', e.target.value)}
                                                                                className="text-right"
                                                                                aria-label={`Precio por metro de ${fila.producto} ${l.color}`}
                                                                                tabIndex={abierta ? 0 : -1}
                                                                            />
                                                                            <button
                                                                                type="button"
                                                                                aria-label={`Quitar ${l.color || 'color'}`}
                                                                                onClick={() => quitar(i)}
                                                                                tabIndex={abierta ? 0 : -1}
                                                                                className="rounded-md p-1.5 text-red-600 transition hover:bg-red-50"
                                                                            >
                                                                                <Trash2 className="h-4 w-4" />
                                                                            </button>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>
                                            </Fragment>
                                        );
                                    }

                                    // Lo demás (hilos, cierres…): una línea por producto.
                                    const { l, i } = fila;
                                    // Con un formato "Rollo" de metraje fijo (antiguo) no se sabe
                                    // el metraje real: se ofrece marcar el precio como "por confirmar".
                                    const esRollo = tipoUnidad(presentacionDe(l.producto_presentacion_id)) === 'rollo';

                                    return (
                                        <tr key={fila.clave}>
                                            <td className="px-3 py-2">
                                                <span className="font-medium text-warm-900">{l.producto}</span>
                                                {l.color && (
                                                    <span className="ml-1.5 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-warm-700">
                                                        {l.color}
                                                    </span>
                                                )}
                                                {l.descripcion && (
                                                    <span className="block text-xs text-warm-500">{l.descripcion}</span>
                                                )}
                                                {errores[`detalles.${i}.cantidad`] && (
                                                    <span className="block text-xs text-red-600">
                                                        {errores[`detalles.${i}.cantidad`][0]}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-3 py-2">
                                                {(() => {
                                                    // La línea no guarda el producto: se deduce de su
                                                    // presentación, así funciona también al editar.
                                                    const opciones = unidadesDe(productoDe(l.producto_presentacion_id));
                                                    // Un pedido antiguo en un formato que ya no se ofrece:
                                                    // se sigue viendo el suyo.
                                                    if (
                                                        opciones.length > 0 &&
                                                        !opciones.some((o) => o.value === String(l.producto_presentacion_id))
                                                    ) {
                                                        opciones.push({
                                                            value: String(l.producto_presentacion_id),
                                                            label: l.presentacion ?? 'Formato',
                                                        });
                                                    }

                                                    if (opciones.length === 0) {
                                                        return <span className="text-warm-600">{l.presentacion}</span>;
                                                    }

                                                    return (
                                                        <SearchSelect
                                                            value={String(l.producto_presentacion_id)}
                                                            clearable={false}
                                                            emptyText="Sin unidades"
                                                            // Otra unidad, otro precio: se toma el de
                                                            // venta de la nueva, igual que en la venta.
                                                            onChange={(id) => id && cambiarUnidad(i, id)}
                                                            options={opciones}
                                                        />
                                                    );
                                                })()}
                                            </td>
                                            <td className="px-3 py-2 text-right">
                                                <Input
                                                    type="number"
                                                    step="0.01"
                                                    min="0"
                                                    value={l.cantidad}
                                                    onChange={(e) => cambiar(i, 'cantidad', e.target.value)}
                                                    className="ml-auto w-24 text-right"
                                                />
                                            </td>
                                            <td className="px-3 py-2 text-right">
                                                {esRollo && (
                                                    <label className="mb-1 flex items-center justify-end gap-1.5 text-[11px] font-medium text-warm-500">
                                                        <input
                                                            type="checkbox"
                                                            checked={Boolean(l.precio_oculto)}
                                                            onChange={(e) => cambiar(i, 'precio_oculto', e.target.checked)}
                                                            className="h-3.5 w-3.5 rounded border-gray-300 accent-primary-600"
                                                        />
                                                        Por confirmar
                                                    </label>
                                                )}
                                                {l.precio_oculto ? (
                                                    <span className="text-warm-400">—</span>
                                                ) : (
                                                    <Input
                                                        type="number"
                                                        step="0.01"
                                                        min="0"
                                                        value={l.precio_unitario}
                                                        onChange={(e) => cambiar(i, 'precio_unitario', e.target.value)}
                                                        className="ml-auto w-28 text-right"
                                                        aria-label="Precio de venta"
                                                    />
                                                )}
                                            </td>
                                            <td className="px-3 py-2 text-right font-medium text-warm-900">
                                                {l.precio_oculto ? (
                                                    <span className="font-normal text-warm-400">Por confirmar</span>
                                                ) : (
                                                    money((Number(l.cantidad) || 0) * (Number(l.precio_unitario) || 0), cabecera.moneda)
                                                )}
                                            </td>
                                            <td className="px-3 py-2 text-center">
                                                <button
                                                    type="button"
                                                    aria-label="Quitar"
                                                    onClick={() => quitar(i)}
                                                    className="rounded-md p-1.5 text-red-600 transition hover:bg-red-50"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </section>

                {/* ── Pedido y resumen ────────────────────────────────── */}
                <div className="space-y-4">
                    <section className="rounded-xl border border-edge bg-white p-5 shadow-sm">
                        <h2 className="mb-4 text-base font-semibold text-warm-900">Pedido</h2>

                        <div className="space-y-4">
                            {/* La sucursal del pedido: de su almacén sale la mercadería. */}
                            {superAdmin ? (
                                <SearchSelect
                                    label="Almacén"
                                    placeholder="Elige el almacén"
                                    value={almacenId}
                                    // Con líneas ya cargadas no se cambia: su stock se calculó con el almacén anterior.
                                    disabled={lineas.length > 0}
                                    onChange={(v) => setAlmacenId(v ?? '')}
                                    options={opcionesAlmacen(almacenes, almacenId)}
                                />
                            ) : (
                                <p className="rounded-md bg-primary-50 px-3 py-2 text-xs font-medium text-primary-700">
                                    Pedido de tu almacén: {user?.almacen?.nombre ?? 'sin almacén asignado'}. La mercadería sale de ahí.
                                </p>
                            )}
                            <SearchSelect
                                label="Cliente"
                                placeholder="Buscar cliente…"
                                value={cabecera.cliente_id}
                                onChange={(v) => setCabecera((p) => ({ ...p, cliente_id: v }))}
                                options={clientes.map((c) => ({
                                    value: String(c.id),
                                    label: c.nombre,
                                    keywords: c.numero_documento,
                                }))}
                            />
                            {cliente?.tipo_precio && (
                                <p className="-mt-2 text-xs font-medium text-primary-700">
                                    Se le vende a precio {cliente.tipo_precio.nombre}.
                                </p>
                            )}
                            <Input
                                label="Fecha"
                                type="date"
                                value={cabecera.fecha_emision}
                                onChange={(e) => setCabecera((p) => ({ ...p, fecha_emision: e.target.value }))}
                                error={errores.fecha_emision?.[0]}
                            />
                            <Input
                                label="Fecha de entrega"
                                type="date"
                                value={cabecera.fecha_entrega}
                                onChange={(e) => setCabecera((p) => ({ ...p, fecha_entrega: e.target.value }))}
                                error={errores.fecha_entrega?.[0]}
                            />
                            <Select
                                label="Moneda"
                                value={cabecera.moneda}
                                onChange={(e) => cambiarMoneda(e.target.value)}
                                options={MONEDAS}
                            />
                            {cabecera.moneda !== 'PEN' && (
                                <div>
                                    <Input
                                        label="Tipo de cambio (SUNAT venta)"
                                        type="number"
                                        min="0"
                                        step="0.0001"
                                        value={cabecera.tipo_cambio}
                                        onChange={(e) => {
                                            setTcManual(true);
                                            setCabecera((p) => ({ ...p, tipo_cambio: e.target.value }));
                                        }}
                                        className="text-right"
                                    />
                                    <p className="mt-1 text-xs text-warm-500">
                                        {tcDia?.venta
                                            ? `SUNAT: ${tcDia.venta}${tcDia.comercial ? ` · Comercial: ${tcDia.comercial}` : ''}`
                                            : 'Sin tipo de cambio de SUNAT: escríbelo.'}
                                    </p>
                                </div>
                            )}
                            <Input
                                label="Observación"
                                placeholder="Referencia…"
                                value={cabecera.observaciones}
                                onChange={(e) => setCabecera((p) => ({ ...p, observaciones: e.target.value }))}
                            />
                        </div>

                        <Alert variant="info" className="mt-4">
                            El pedido sale del almacén que ves arriba: el almacenero lo prepara con los rollos de ese almacén.
                        </Alert>
                    </section>

                    <section className="rounded-xl border border-edge bg-white p-5 shadow-sm">
                        <h2 className="mb-3 text-base font-semibold text-warm-900">Resumen</h2>
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold uppercase tracking-wide text-warm-500">
                                Total del pedido
                            </span>
                            <span className="text-2xl font-bold text-primary-600">
                                {hayRollos && total === 0 ? 'Por definir' : money(total, cabecera.moneda)}
                            </span>
                        </div>
                        {cabecera.moneda !== 'PEN' && Number(cabecera.tipo_cambio) > 0 && total > 0 && (
                            <p className="mt-1 text-right text-xs text-warm-500">
                                ≈ {money(total * Number(cabecera.tipo_cambio), 'PEN')} al T.C. {cabecera.tipo_cambio}
                            </p>
                        )}
                        {hayRollos && (
                            <p className="mt-2 text-xs text-warm-500">
                                Los rollos se cobran por sus metros reales: su importe se define cuando el almacén
                                los separa{total > 0 ? ' y se suma a este total' : ''}.
                            </p>
                        )}
                    </section>

                    <div className="flex justify-end gap-2">
                        <Button variant="secondary" onClick={() => navigate('/pedidos')}>
                            Cancelar
                        </Button>
                        <Button loading={guardando} disabled={!lineas.length} onClick={guardar}>
                            {id ? 'Guardar cambios' : 'Registrar pedido'}
                        </Button>
                    </div>
                </div>
            </div>

            {/* El pedido no se ata a un almacén, así que aquí se lista el
                catálogo entero con el stock sumado de todos los almacenes, y
                se puede pedir incluso lo que está en cero. */}
            <ProductoPickerModal
                open={picker.open}
                onClose={() => setPicker((prev) => ({ ...prev, open: false }))}
                onSelect={agregarDesdePicker}
                initialQuery={picker.query}
                multiple
                // Una tela se elige por color y solo en rollos.
                porColor
                productos={productos}
                stockPorProducto={stockPorProducto}
                unidadPreferida={unidadPreferida}
                bloquearSinStock={false}
                // Stock de cada almacén y por color, sin códigos de rollo.
                existencias={existencias}
                title="Buscar productos"
            />
        </Layout>
    );
}
