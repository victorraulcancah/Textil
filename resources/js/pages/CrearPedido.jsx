import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ClipboardList, Plus, Trash2 } from 'lucide-react';
import api, { asList } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import Layout from '../components/Layout';
import ColorSelect from '../components/ColorSelect';
import ProductoPickerModal from '../components/ProductoPickerModal';
import { tipoUnidad } from '../lib/unidades';
import { precioPara } from '../lib/precios';
import { cargarTipoCambio, convertir, money, MONEDAS } from '../lib/moneda';
import { Alert, Button, Input, SearchSelect, Select, Spinner } from '../components/ui';

const num = (n) => new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 }).format(Number(n) || 0);

const hoy = () => new Date().toISOString().slice(0, 10);

const redondear = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** Pedir rollos enteros: cada uno se cobra por sus metros reales, al precio del metro. */
const ROLLOS = 'rollos';

/** El formato "Metro" de una tela; sin él, el producto no se pide por rollos. */
const presentacionMetroDe = (producto) =>
    (producto?.presentaciones ?? []).find((p) => p.activo !== false && tipoUnidad(p) === 'metro') ?? null;

/**
 * El metraje del rollo, solo para estimar (0 si no se sabe). Va por color: el
 * de ese color; sin color (o si no lo tiene), el promedio de los colores de la
 * tela; y si ninguno lo tiene, el de la tela.
 */
const metrajeDe = (producto, colorId) => {
    const colores = producto?.colores ?? [];
    const delColor = colorId ? colores.find((c) => String(c.id) === String(colorId)) : null;
    if (Number(delColor?.metros_por_rollo) > 0) return Number(delColor.metros_por_rollo);

    const conMetraje = colores.map((c) => Number(c.metros_por_rollo) || 0).filter((m) => m > 0);
    if (conMetraje.length) {
        return Math.round((conMetraje.reduce((s, m) => s + m, 0) / conMetraje.length) * 100) / 100;
    }

    return Number(producto?.metros_por_rollo) || 0;
};

/**
 * Las unidades en que se pide un producto. Una tela es un solo producto que
 * se pide por color: en rollos enteros (cada uno con su metraje real) o por
 * metro. Ya no hay formatos ("Rollo 50 m", "Yarda", "Retazo").
 */
const unidadesDe = (producto) => {
    const activas = (producto?.presentaciones ?? []).filter((p) => p.activo !== false);
    const opciones = (lista) => lista.map((p) => ({ value: String(p.id), label: p.nombre }));
    const metro = presentacionMetroDe(producto);

    if (!metro) return opciones(activas);

    return [{ value: ROLLOS, label: 'Rollo (metraje real)' }, ...opciones([metro])];
};

/**
 * Alta y edición del pedido: lo que pide el cliente.
 *
 * Se pide por producto y cantidad —"120 metros de Polinán negro"— y no por
 * rollos concretos: el vendedor no puede saber qué piezas hay en el rack ni en
 * qué almacén están. Eso lo resuelve el almacenero al preparar el pedido,
 * escaneando los rollos con los que lo cubre.
 *
 * Una tela también se pide en rollos enteros —"3 rollos de Polinán negro"—:
 * cada rollo trae su metraje y se cobra por metro, así que el importe es una
 * estimación (al metraje del rollo de ese color) hasta que el almacén escanea
 * los rollos.
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
    const [stockPorProducto, setStockPorProducto] = useState({});
    /** Filas de existencias (producto × almacén, con metros por color). */
    const [existencias, setExistencias] = useState([]);
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
        // "rollos": la cantidad es de rollos enteros; "metros": del formato elegido.
        modo: 'metros',
        descripcion: '',
        cantidad: '',
        precio_unitario: '',
        // Escrito a mano: ya no se reemplaza con el precio de lista.
        precioManual: false,
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

                setClientes(asList(clientesRes));
                setProductos(asList(productosRes));

                // Se suma el DISPONIBLE de todos los almacenes (físico menos lo
                // que otros pedidos ya reservaron): el vendedor no elige desde
                // cuál sale, así que lo que le importa es cuánto puede prometer.
                const porProducto = {};
                for (const fila of asList(existenciasRes)) {
                    const pid = fila.producto?.id ?? fila.producto_id;
                    if (!pid) continue;
                    porProducto[pid] = (porProducto[pid] ?? 0) + Number(fila.stock_disponible ?? fila.stock_actual ?? 0);
                }
                setStockPorProducto(porProducto);
                // Las filas completas, para que el buscador muestre el stock de
                // cada almacén y por color.
                setExistencias(asList(existenciasRes));

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

                    setLineas(
                        (p.detalles ?? []).map((d) => ({
                            producto_presentacion_id: String(d.producto_presentacion_id),
                            producto_color_id: d.producto_color_id ? String(d.producto_color_id) : '',
                            producto: d.producto,
                            color: d.color?.nombre ?? '',
                            modo: d.modo ?? 'metros',
                            rollos_pedidos: d.rollos_pedidos ? String(d.rollos_pedidos) : '',
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

    // En rollos, la cantidad escrita son rollos: los metros se estiman al promedio.
    const promedioNueva = metrajeDe(producto, nueva.producto_color_id);
    const porRollosNueva = nueva.modo === ROLLOS;
    const metrosNueva = porRollosNueva ? redondear((Number(nueva.cantidad) || 0) * promedioNueva) : Number(nueva.cantidad) || 0;

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
                    : { ...l, precio_unitario: precioDeLista(presentacionDe(l.producto_presentacion_id), l.cantidad) },
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

    /** Los rollos libres de la tela (del color elegido, si hay uno), sumando todos los almacenes. */
    const rollosLibres = useMemo(() => {
        if (!producto) return 0;
        let rollos = 0;
        for (const fila of existencias) {
            if (String(fila.producto?.id ?? fila.producto_id) !== String(producto.id)) continue;
            for (const c of fila.colores ?? []) {
                if (nueva.producto_color_id && String(c.id) !== String(nueva.producto_color_id)) continue;
                rollos += Number(c.rollos_disponibles ?? c.rollos) || 0;
            }
        }
        return rollos;
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

        // Se viene pidiendo en rollos y es una tela: rollos enteros, al precio del metro.
        const metro = presentacionMetroDe(producto);
        if (unidadPreferida === 'rollo' && metro) {
            setNueva((prev) => ({
                ...prev,
                modo: ROLLOS,
                producto_presentacion_id: String(metro.id),
                precio_unitario: precioDeLista(metro, (Number(prev.cantidad) || 1) * (metrajeDe(producto) || 1)),
                precioManual: false,
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
            modo: 'metros',
            producto_presentacion_id: elegida ? String(elegida.id) : '',
            precio_unitario: elegida ? precioDeLista(elegida, prev.cantidad || 1) : '',
            precioManual: false,
            // Otro producto, otro color: nunca se hereda de la línea anterior.
            producto_color_id: '',
        }));
    }, [producto]);

    // El precio sugerido sigue al formato, al cliente y a la cantidad (puede
    // entrar en un precio por cantidad), mientras no se escriba uno a mano.
    useEffect(() => {
        if (!presentacion) return;
        setNueva((prev) =>
            prev.precioManual ? prev : { ...prev, precio_unitario: precioDeLista(presentacion, metrosNueva || 1) },
        );
    }, [presentacion?.id, tipoPrecioId, nueva.cantidad, nueva.modo]); // eslint-disable-line react-hooks/exhaustive-deps

    const puedeAgregar =
        nueva.producto_presentacion_id &&
        Number(nueva.cantidad) > 0 &&
        Number(nueva.precio_unitario) >= 0 &&
        // En rollos: rollos enteros, y hace falta el promedio para estimar.
        (!porRollosNueva || (Number.isInteger(Number(nueva.cantidad)) && promedioNueva > 0));

    const agregar = () => {
        if (!puedeAgregar) return;

        const colorElegido = (producto?.colores ?? []).find(
            (c) => String(c.id) === String(nueva.producto_color_id),
        );

        // La unidad de este ítem queda propuesta para el siguiente, aunque
        // nadie haya tocado el selector (el metro por defecto, por ejemplo).
        const tipo = porRollosNueva ? 'rollo' : tipoUnidad(presentacion);
        if (tipo) setUnidadPreferida(tipo);

        setLineas((prev) => [
            ...prev,
            {
                producto_presentacion_id: nueva.producto_presentacion_id,
                producto_color_id: nueva.producto_color_id || '',
                producto: producto?.nombre,
                color: colorElegido?.nombre ?? '',
                modo: porRollosNueva ? ROLLOS : 'metros',
                rollos_pedidos: porRollosNueva ? String(Number(nueva.cantidad)) : '',
                presentacion: porRollosNueva ? 'Rollo' : presentacion?.nombre,
                descripcion: nueva.descripcion.trim(),
                // En rollos, los metros estimados: el importe se ajusta al escanear.
                cantidad: porRollosNueva ? String(metrosNueva) : nueva.cantidad,
                precio_unitario: nueva.precio_unitario,
                precio_oculto: false,
                precio_manual: Boolean(nueva.precioManual),
            },
        ]);

        setNueva({
            producto_id: '',
            producto_presentacion_id: '',
            producto_color_id: '',
            modo: 'metros',
            descripcion: '',
            cantidad: '',
            precio_unitario: '',
            precioManual: false,
        });
    };

    /**
     * Alta en lote desde el buscador avanzado. Lo que ya está en el pedido no
     * se duplica: se le suma la cantidad, igual que en la nota de venta.
     */
    const agregarDesdePicker = (seleccionados) => {
        const utiles = seleccionados.filter((s) => s.presentacion && s.cantidad > 0);
        if (!utiles.length) return;

        setLineas((prev) => {
            const next = [...prev];

            utiles.forEach(({ producto, presentacion, cantidad, color }) => {
                // El "Rollo" de una tela son rollos enteros con su metraje real,
                // cobrados al precio del metro.
                const metro = tipoUnidad(presentacion) === 'rollo' ? presentacionMetroDe(producto) : null;
                if (metro) {
                    const promedio = metrajeDe(producto, color?.id);
                    const rollos = Math.max(1, Math.round(cantidad));
                    const j = next.findIndex(
                        (l) =>
                            l.modo === ROLLOS &&
                            String(l.producto_presentacion_id) === String(metro.id) &&
                            String(l.producto_color_id || '') === String(color?.id ?? ''),
                    );

                    if (j !== -1) {
                        const suma = (Number(next[j].rollos_pedidos) || 0) + rollos;
                        next[j] = {
                            ...next[j],
                            rollos_pedidos: String(suma),
                            cantidad: String(redondear(suma * promedio)),
                            ...(next[j].precio_manual ? {} : { precio_unitario: precioDeLista(metro, suma * promedio) }),
                        };
                        return;
                    }

                    next.push({
                        producto_presentacion_id: String(metro.id),
                        producto_color_id: color ? String(color.id) : '',
                        producto: producto.nombre,
                        color: color?.nombre ?? '',
                        modo: ROLLOS,
                        rollos_pedidos: String(rollos),
                        presentacion: 'Rollo',
                        descripcion: '',
                        cantidad: String(redondear(rollos * promedio)),
                        precio_unitario: precioDeLista(metro, rollos * (promedio || 1)),
                        precio_oculto: false,
                        precio_manual: false,
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
        const tipo = tipoUnidad(utiles[utiles.length - 1].presentacion);
        if (tipo) setUnidadPreferida(tipo);

        setPicker((prev) => ({ ...prev, open: false }));
        toast.success(
            utiles.length === 1 ? 'Producto agregado al pedido.' : `${utiles.length} productos agregados al pedido.`,
        );
    };

    /**
     * Escribir el precio lo deja fijo. Cambiar la cantidad vuelve a buscar el
     * precio de lista (puede entrar en un precio por cantidad), salvo que el
     * precio se haya escrito a mano.
     */
    const cambiar = (i, campo, valor) =>
        setLineas((prev) =>
            prev.map((l, j) => {
                if (j !== i) return l;
                const next = { ...l, [campo]: valor };
                if (campo === 'precio_unitario') next.precio_manual = true;
                if (campo === 'rollos_pedidos') {
                    next.cantidad = String(
                        redondear((Number(valor) || 0) * metrajeDe(productoDe(l.producto_presentacion_id), l.producto_color_id)),
                    );
                }
                if ((campo === 'cantidad' || campo === 'rollos_pedidos') && !l.precio_manual) {
                    next.precio_unitario = precioDeLista(presentacionDe(l.producto_presentacion_id), next.cantidad);
                }
                return next;
            }),
        );

    /**
     * Otra unidad para una línea ya agregada. Pasar a "Rollo" pide los rollos
     * que den más o menos los mismos metros; volver a metros deja los metros
     * estimados. Otra unidad, otro precio de lista.
     */
    const cambiarUnidad = (i, valor) =>
        setLineas((prev) =>
            prev.map((x, j) => {
                if (j !== i) return x;
                const prod = productoDe(x.producto_presentacion_id);

                if (valor === ROLLOS) {
                    const metro = presentacionMetroDe(prod);
                    if (!metro || x.modo === ROLLOS) return x;
                    const actual = presentacionDe(x.producto_presentacion_id);
                    const metros =
                        ((Number(x.cantidad) || 0) * (Number(actual?.factor_conversion) || 1)) /
                        (Number(metro.factor_conversion) || 1);
                    const promedio = metrajeDe(prod, x.producto_color_id);
                    const rollos = promedio > 0 ? Math.max(1, Math.round(metros / promedio)) : 1;

                    return {
                        ...x,
                        modo: ROLLOS,
                        rollos_pedidos: String(rollos),
                        producto_presentacion_id: String(metro.id),
                        presentacion: 'Rollo',
                        cantidad: String(redondear(rollos * promedio)),
                        precio_unitario: precioDeLista(metro, rollos * (promedio || 1)),
                        precio_manual: false,
                        precio_oculto: false,
                    };
                }

                if (valor === String(x.producto_presentacion_id) && x.modo !== ROLLOS) return x;
                const elegida = (prod?.presentaciones ?? []).find((pr) => String(pr.id) === valor);

                return {
                    ...x,
                    modo: 'metros',
                    rollos_pedidos: '',
                    producto_presentacion_id: valor,
                    presentacion: elegida?.nombre ?? x.presentacion,
                    precio_unitario: elegida ? precioDeLista(elegida, x.cantidad) : x.precio_unitario,
                    precio_manual: false,
                };
            }),
        );

    const quitar = (i) => setLineas((prev) => prev.filter((_, j) => j !== i));
    const hayRollos = lineas.some((l) => l.modo === ROLLOS);

    const total = useMemo(
        () =>
            lineas.reduce(
                // Una línea con precio por confirmar no suma: no se sabe el
                // metraje real del rollo todavía.
                (s, l) => (l.precio_oculto ? s : s + (Number(l.cantidad) || 0) * (Number(l.precio_unitario) || 0)),
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
            const cuerpo = {
                ...cabecera,
                tipo_cambio: cabecera.moneda !== 'PEN' ? Number(cabecera.tipo_cambio) || null : null,
                cliente_id: cabecera.cliente_id || null,
                fecha_entrega: cabecera.fecha_entrega || null,
                vendedor_id: user?.id,
                detalles: lineas.map((l) => ({
                    producto_presentacion_id: Number(l.producto_presentacion_id),
                    producto_color_id: l.producto_color_id ? Number(l.producto_color_id) : null,
                    modo: l.modo === ROLLOS ? ROLLOS : 'metros',
                    rollos_pedidos: l.modo === ROLLOS ? Number(l.rollos_pedidos) || 0 : null,
                    // En rollos los metros los estima el servidor con el promedio.
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
                            Lo que pide el cliente. El almacén decide después con qué rollos lo cubre.
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
                                        : porRollosNueva
                                          ? `${num(rollosLibres)} rollo${rollosLibres === 1 ? '' : 's'} · ${num(stockEnUnidad)} m`
                                          : `${num(stockEnUnidad)} ${presentacion?.nombre ?? ''}`.trim()
                                }
                                readOnly
                                disabled
                            />
                            <SearchSelect
                                label="Unidad"
                                value={porRollosNueva ? ROLLOS : nueva.producto_presentacion_id}
                                disabled={!producto}
                                clearable={false}
                                placeholder={producto ? 'Elegir…' : '—'}
                                emptyText="Sin unidades"
                                onChange={(id) => {
                                    if (!id) return;
                                    // Rollos enteros: la línea va en el formato Metro
                                    // (así se cobra) y la cantidad pasa a ser de rollos.
                                    if (id === ROLLOS) {
                                        const metro = presentacionMetroDe(producto);
                                        if (!metro) return;
                                        setNueva((prev) => ({
                                            ...prev,
                                            modo: ROLLOS,
                                            producto_presentacion_id: String(metro.id),
                                            precioManual: false,
                                        }));
                                        setUnidadPreferida('rollo');
                                        return;
                                    }
                                    const elegida = presentaciones.find((p) => String(p.id) === id);
                                    // Se cambia esta línea nada más; la
                                    // preferencia para las siguientes se
                                    // actualiza al agregarla.
                                    setNueva((prev) => ({ ...prev, modo: 'metros', producto_presentacion_id: id, precioManual: false }));
                                    if (elegida) setUnidadPreferida(tipoUnidad(elegida));
                                }}
                                options={unidadesDe(producto)}
                            />
                            <Input
                                label={porRollosNueva ? 'Rollos' : 'Cantidad'}
                                type="number"
                                step={porRollosNueva ? '1' : '0.01'}
                                min="0"
                                value={nueva.cantidad}
                                onChange={(e) => setNueva((prev) => ({ ...prev, cantidad: e.target.value }))}
                            />
                            <Input
                                label={porRollosNueva ? 'Precio por metro' : 'Precio de venta'}
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

                        {/* En rollos: cuántos metros serían, a ojo. Cada rollo se
                            cobra después por lo que mide de verdad. */}
                        {porRollosNueva &&
                            (promedioNueva > 0 ? (
                                <p className="-mt-2 text-xs text-warm-500">
                                    {Number(nueva.cantidad) > 0 ? `≈ ${num(metrosNueva)} m · ` : ''}
                                    Rollo de ≈ {num(promedioNueva)} m
                                    {nueva.producto_color_id ? '' : ' (promedio de sus colores)'}. Se cobran los metros
                                    reales de cada rollo.
                                </p>
                            ) : (
                                <p className="-mt-2 text-xs font-medium text-red-600">
                                    Esta tela no tiene el metraje del rollo de sus colores: ponlo en Productos →
                                    Compra y venta para pedirla por rollos.
                                </p>
                            ))}

                        <Button onClick={agregar} disabled={!puedeAgregar}>
                            <Plus className="h-4 w-4" />
                            Agregar producto
                        </Button>
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

                                {lineas.map((l, i) => {
                                    // Con Rollo no se sabe el metraje real hasta pesarlo: se
                                    // ofrece marcar el precio como "por confirmar".
                                    const presentacionLinea = presentacionDe(l.producto_presentacion_id);
                                    const esRollo = tipoUnidad(presentacionLinea) === 'rollo';
                                    // Rollos enteros: la cantidad son rollos y el importe, una estimación.
                                    const porRollos = l.modo === ROLLOS;
                                    const promedioLinea = porRollos
                                        ? metrajeDe(productoDe(l.producto_presentacion_id), l.producto_color_id)
                                        : 0;

                                    return (
                                    <tr key={i}>
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
                                            {(errores[`detalles.${i}.cantidad`] ?? errores[`detalles.${i}.rollos_pedidos`]) && (
                                                <span className="block text-xs text-red-600">
                                                    {(errores[`detalles.${i}.cantidad`] ?? errores[`detalles.${i}.rollos_pedidos`])[0]}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-3 py-2">
                                            {(() => {
                                                // La línea no guarda el producto: se deduce de su
                                                // presentación, así funciona también al editar.
                                                const opciones = unidadesDe(productoDe(l.producto_presentacion_id));
                                                // Un pedido antiguo en un formato que ya no se ofrece
                                                // (un "Rollo 50 m"): se sigue viendo el suyo.
                                                if (
                                                    !porRollos &&
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
                                                        value={porRollos ? ROLLOS : String(l.producto_presentacion_id)}
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
                                            {porRollos ? (
                                                <>
                                                    <Input
                                                        type="number"
                                                        step="1"
                                                        min="1"
                                                        value={l.rollos_pedidos}
                                                        onChange={(e) => cambiar(i, 'rollos_pedidos', e.target.value)}
                                                        className="w-24 text-right"
                                                        aria-label="Rollos"
                                                    />
                                                    {promedioLinea > 0 ? (
                                                        <span className="mt-0.5 block text-[11px] text-warm-500">
                                                            rollos · ≈ {num(l.cantidad)} m
                                                        </span>
                                                    ) : (
                                                        <span className="mt-0.5 block text-[11px] font-medium text-red-600">
                                                            Sin metraje del rollo
                                                        </span>
                                                    )}
                                                </>
                                            ) : (
                                                <Input
                                                    type="number"
                                                    step="0.01"
                                                    min="0"
                                                    value={l.cantidad}
                                                    onChange={(e) => cambiar(i, 'cantidad', e.target.value)}
                                                    className="w-24 text-right"
                                                />
                                            )}
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
                                                    className="w-28 text-right"
                                                />
                                            )}
                                        </td>
                                        <td className="px-3 py-2 text-right font-medium text-warm-900">
                                            {l.precio_oculto ? (
                                                <span className="font-normal text-warm-400">Por confirmar</span>
                                            ) : (
                                                `${porRollos ? '≈ ' : ''}${money((Number(l.cantidad) || 0) * (Number(l.precio_unitario) || 0), cabecera.moneda)}`
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
                            El almacén no se elige aquí: lo define el almacenero al preparar el pedido,
                            según dónde estén los rollos que use.
                        </Alert>
                    </section>

                    <section className="rounded-xl border border-edge bg-white p-5 shadow-sm">
                        <h2 className="mb-3 text-base font-semibold text-warm-900">Resumen</h2>
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold uppercase tracking-wide text-warm-500">
                                Total del pedido
                            </span>
                            <span className="text-2xl font-bold text-primary-600">{money(total, cabecera.moneda)}</span>
                        </div>
                        {cabecera.moneda !== 'PEN' && Number(cabecera.tipo_cambio) > 0 && (
                            <p className="mt-1 text-right text-xs text-warm-500">
                                ≈ {money(total * Number(cabecera.tipo_cambio), 'PEN')} al T.C. {cabecera.tipo_cambio}
                            </p>
                        )}
                        {hayRollos && (
                            <p className="mt-2 text-xs text-warm-500">
                                Los rollos se cobran por sus metros reales: el total se ajusta cuando el almacén
                                los escanea.
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
