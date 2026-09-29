import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
    ArrowLeft,
    CalendarClock,
    Package,
    Pencil,
    Plus,
    ReceiptText,
    Trash2,
    Wallet,
} from "lucide-react";
import api, { asList } from "../lib/api";
import { precioPara } from "../lib/precios";
import { tipoUnidad } from "../lib/unidades";
import {
    cargarTipoCambio,
    convertir,
    money,
    MONEDAS,
    NOMBRE_MONEDA,
    redondear,
} from "../lib/moneda";
import { opcionesAlmacen } from "../lib/almacenes";
import { useToast } from "../lib/toast";
import { useAuth } from "../lib/auth";
import Layout from "../components/Layout";
import MetodoCajaPicker from "../components/MetodoCajaPicker";
import ProductoPickerModal from "../components/ProductoPickerModal";
import SelectorRollo from "../components/SelectorRollo";
import CreditoVenta from "../components/CreditoVenta";
import ExcesoCreditoModal from "../components/ExcesoCreditoModal";
import {
    Alert,
    Button,
    Input,
    Modal,
    SearchSelect,
    Select,
    Spinner,
} from "../components/ui";

const num = (n) =>
    new Intl.NumberFormat("es-PE", { maximumFractionDigits: 2 }).format(
        Number(n) || 0,
    );

const hoy = () => new Date().toISOString().slice(0, 10);

/** "2026-09-29" → "29/09". */
const diaMes = (f) => (f ? String(f).slice(5, 10).split("-").reverse().join("/") : "");

/** Venta al paso: no se identifica al comprador. */
const CLIENTE_GENERICO = "Clientes varios";

const panelVacio = {
    producto_id: "",
    producto_presentacion_id: "",
    // ROLLOS: la cantidad es de rollos enteros; "": del formato elegido.
    modo: "",
    cantidad: "1",
    precio_unitario: "0",
    // Escrito a mano: ya no se reemplaza con el precio de lista.
    precioManual: false,
};

/**
 * La tela se vende en rollos enteros o en cortes, cobrando los metros reales
 * de cada rollo al precio del metro. Una fila "por rollo" va en el formato
 * Metro y su cantidad son los metros del rollo elegido (se pueden bajar para
 * un corte).
 */
const ROLLOS = "rollos";

/** El formato "Metro" de una tela; sin él, el producto no se vende por rollos. */
const presentacionMetroDe = (producto) =>
    (producto?.presentaciones ?? []).find(
        (p) => p.activo !== false && tipoUnidad(p) === "metro",
    ) ?? null;

/** "1 rollo" / "3 rollos". */
const rollosTexto = (n) => `${num(n)} rollo${Number(n) === 1 ? "" : "s"}`;
const emptyPago = () => ({
    tipo: "efectivo",
    cuentaId: "",
    billeteraId: "",
    monto: "",
    // "" = en la moneda de la venta; "PEN" = una venta en dólares cobrada con soles.
    moneda: "",
    tipoCambio: "",
});

export default function CrearVenta() {
    const toast = useToast();
    const navigate = useNavigate();
    const { user } = useAuth();
    /** Con id en la URL se edita una venta existente; sin id, se crea una nueva. */
    const { id: ventaId } = useParams();
    const editando = Boolean(ventaId);

    const [clientes, setClientes] = useState([]);
    const [almacenes, setAlmacenes] = useState([]);
    const [productos, setProductos] = useState([]);
    const [existencias, setExistencias] = useState([]);
    const [cuentas, setCuentas] = useState([]);
    const [billeteras, setBilleteras] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [form, setForm] = useState({
        cliente_id: "",
        almacen_id: "",
        fecha_emision: hoy(),
        tipo_pago: "contado",
        moneda: "PEN",
        // SUNAT venta de la fecha, si la venta es en dólares.
        tipo_cambio: "",
        observaciones: "",
    });

    /** El tipo de cambio de la fecha de la venta: SUNAT (venta) y comercial. */
    const [tcDia, setTcDia] = useState(null);
    /** El de la venta se escribió a mano (o viene guardado): ya no sigue al SUNAT. */
    const [tcManual, setTcManual] = useState(false);
    /** A crédito: en qué cuotas se paga. */
    const [cuotas, setCuotas] = useState([]);
    /** La venta no cupo en la línea de crédito: el aviso y si se puede autorizar. */
    const [exceso, setExceso] = useState(null);

    /** Panel superior de búsqueda/alta. */
    const [panel, setPanel] = useState({ ...panelVacio });
    /** Productos ya agregados a la venta. */
    const [items, setItems] = useState([]);
    /** Buscador avanzado de productos. */
    const [picker, setPicker] = useState({ open: false, query: "" });

    const [pagos, setPagos] = useState([emptyPago()]);
    /** Off = un solo método de pago (el caso normal). On = varios métodos. */
    const [mixto, setMixto] = useState(false);
    /** El cobro son varios campos: se edita en un modal aparte. */
    const [modalCobro, setModalCobro] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [
                cliRes,
                almRes,
                prodRes,
                existRes,
                cuentasRes,
                billeterasRes,
            ] = await Promise.all([
                api.get("/clientes"),
                api.get("/almacenes"),
                api.get("/productos", { params: { per_page: 500 } }),
                api.get("/existencias"),
                api.get("/cuentas-bancarias"),
                api.get("/billeteras-digitales"),
            ]);
            setClientes(asList(cliRes));
            const listaAlmacenes = asList(almRes);
            setAlmacenes(listaAlmacenes);
            setProductos(asList(prodRes));
            setExistencias(asList(existRes));
            setCuentas(asList(cuentasRes));
            setBilleteras(asList(billeterasRes));

            // Almacén de arranque: el marcado como predeterminado en
            // /almacenes y, si no hay ninguno, el único que exista.
            const porDefecto =
                listaAlmacenes.find((a) => a.predeterminado && a.activo !== false) ??
                (listaAlmacenes.length === 1 ? listaAlmacenes[0] : null);

            if (porDefecto) {
                setForm((prev) => ({
                    ...prev,
                    almacen_id: String(porDefecto.id),
                }));
            }

            // Modo edición: la venta se vuelca al formulario, los ítems y los pagos.
            if (ventaId) {
                const res = await api.get(`/notas-venta/${ventaId}`);
                const venta = res.data?.data ?? res.data;

                setForm({
                    cliente_id: venta.cliente_id
                        ? String(venta.cliente_id)
                        : "",
                    almacen_id: venta.almacen_id
                        ? String(venta.almacen_id)
                        : "",
                    fecha_emision:
                        String(venta.fecha_emision ?? "").slice(0, 10) || hoy(),
                    tipo_pago: venta.tipo_pago ?? "contado",
                    moneda: venta.moneda ?? "PEN",
                    tipo_cambio: venta.tipo_cambio
                        ? String(Number(venta.tipo_cambio))
                        : "",
                    observaciones: venta.observaciones ?? "",
                });
                // El tipo de cambio guardado no se reemplaza por el del día.
                setTcManual(Boolean(venta.tipo_cambio));

                setItems(
                    (venta.detalles ?? []).map((d) => ({
                        producto_id: String(d.presentacion?.producto?.id ?? ""),
                        producto_presentacion_id: String(
                            d.producto_presentacion_id,
                        ),
                        // El rollo del que salió, para que al corregir la
                        // venta la tela vuelva y se corte del mismo.
                        rollo_id: d.rollo_id ? String(d.rollo_id) : "",
                        modo: d.rollo_id && d.rollo_entero ? ROLLOS : "",
                        // Lo que medía al venderlo: al corregir, vuelve a tenerlo.
                        rollo_metros:
                            d.metros_rollo != null ? Number(d.metros_rollo) : undefined,
                        cantidad: String(Number(d.cantidad) || 0),
                        precio_unitario: String(Number(d.precio_unitario) || 0),
                        // Lo guardado no se recalcula solo.
                        precio_manual: true,
                    })),
                );

                // Al crédito el pago es un apunte automático, no un cobro real.
                const cobros = (venta.pagos ?? []).filter(
                    (p) => p.forma_pago !== "credito",
                );
                if (cobros.length) {
                    setPagos(
                        cobros.map((p) => ({
                            tipo: p.forma_pago ?? "efectivo",
                            cuentaId: p.cuenta_bancaria_id
                                ? String(p.cuenta_bancaria_id)
                                : "",
                            billeteraId: p.billetera_id
                                ? String(p.billetera_id)
                                : "",
                            // Cobrado con soles: se edita lo que entró en soles.
                            monto: String(
                                Number(p.monto_pen ?? p.monto) || 0,
                            ),
                            moneda: p.monto_pen != null ? "PEN" : "",
                            tipoCambio:
                                p.monto_pen != null && p.tipo_cambio
                                    ? String(Number(p.tipo_cambio))
                                    : "",
                        })),
                    );
                    setMixto(cobros.length > 1);
                }
            }
        } catch {
            toast.error("No se pudieron cargar los datos.");
        } finally {
            setLoading(false);
        }
    }, [toast, ventaId]);

    useEffect(() => {
        load();
    }, [load]);

    const productoDe = useCallback(
        (productoId) =>
            productos.find((p) => String(p.id) === String(productoId)) ?? null,
        [productos],
    );

    const presentacionDe = useCallback(
        (productoId, presentacionId) =>
            (productoDe(productoId)?.presentaciones ?? []).find(
                (pres) => String(pres.id) === String(presentacionId),
            ) ?? null,
        [productoDe],
    );

    /** A qué tipo de precio se le vende a este cliente; sin cliente o sin tipo, al principal. */
    const cliente =
        clientes.find((c) => String(c.id) === String(form.cliente_id)) ?? null;
    const tipoPrecioId = cliente?.tipo_precio_id ?? null;

    /** Un precio del producto (en su moneda) llevado a la moneda de la venta. */
    const enMonedaVenta = (precio, productoId) =>
        convertir(
            precio,
            productoDe(productoId)?.moneda_venta || "PEN",
            form.moneda,
            form.tipo_cambio,
        );

    /** El precio de lista: el del tipo de precio del cliente, según la cantidad, en la moneda de la venta. */
    const precioDeLista = (productoId, presentacionId, cantidad) =>
        String(
            enMonedaVenta(
                precioPara(
                    presentacionDe(productoId, presentacionId),
                    tipoPrecioId,
                    cantidad,
                ),
                productoId,
            ),
        );

    // Otro cliente, otro tipo de precio, otra moneda u otro tipo de cambio: lo
    // que no tiene precio a mano se recalcula.
    useEffect(() => {
        setItems((prev) =>
            prev.map((it) =>
                it.precio_manual
                    ? it
                    : {
                          ...it,
                          precio_unitario: precioDeLista(
                              it.producto_id,
                              it.producto_presentacion_id,
                              it.cantidad,
                          ),
                      },
            ),
        );
        setPanel((prev) =>
            prev.precioManual || !prev.producto_presentacion_id
                ? prev
                : {
                      ...prev,
                      precio_unitario: precioDeLista(
                          prev.producto_id,
                          prev.producto_presentacion_id,
                          prev.cantidad,
                      ),
                  },
        );
    }, [tipoPrecioId, form.moneda, form.tipo_cambio]); // eslint-disable-line react-hooks/exhaustive-deps

    // El tipo de cambio de la fecha de la venta. El de la venta sigue al SUNAT
    // mientras no se escriba otro.
    useEffect(() => {
        if (!form.fecha_emision) return;
        cargarTipoCambio(form.fecha_emision)
            .then((tc) => {
                setTcDia(tc);
                if (!tcManual && tc?.venta) {
                    setForm((prev) => ({ ...prev, tipo_cambio: String(tc.venta) }));
                }
            })
            .catch(() => setTcDia(null));
    }, [form.fecha_emision]); // eslint-disable-line react-hooks/exhaustive-deps

    /** Stock (en unidad base) de cada producto en el almacén elegido. */
    const stockDelAlmacen = useMemo(() => {
        if (!form.almacen_id) return {};
        return existencias
            .filter(
                (e) =>
                    String(e.almacen_id ?? e.almacen?.id) ===
                    String(form.almacen_id),
            )
            .reduce((acc, e) => {
                acc[String(e.producto_id)] = Number(e.stock_actual) || 0;
                return acc;
            }, {});
    }, [existencias, form.almacen_id]);

    /** Se vende lo que hay: solo productos con stock en el almacén elegido. */
    const productosDisponibles = useMemo(
        () => productos.filter((p) => (stockDelAlmacen[String(p.id)] ?? 0) > 0),
        [productos, stockDelAlmacen],
    );

    /**
     * Lo mismo que stockDelAlmacen pero con una entrada por cada producto del
     * catálogo. El buscador avanzado lista todo, y necesita saber que lo que
     * no aparece en existencias está en cero para poder marcarlo como tal.
     */
    const stockDeTodos = useMemo(() => {
        if (!form.almacen_id) return {};
        return productos.reduce((acc, p) => {
            acc[String(p.id)] = stockDelAlmacen[String(p.id)] ?? 0;
            return acc;
        }, {});
    }, [productos, stockDelAlmacen, form.almacen_id]);

    const productosOptions = useMemo(
        () =>
            productosDisponibles.map((p) => ({
                value: String(p.id),
                label: p.nombre,
                keywords: `${p.codigo ?? ""} ${p.codigo_barras ?? ""}`,
            })),
        [productosDisponibles],
    );

    /** Almacén elegido, para saber cómo vende. */
    const almacenActual = useMemo(
        () =>
            almacenes.find((a) => String(a.id) === String(form.almacen_id)) ??
            null,
        [almacenes, form.almacen_id],
    );

    /**
     * ¿Este local vende en esta unidad? Cada almacén marca sus unidades
     * (Metro, Rollo, Yarda…); sin ninguna marcada, vende en todas.
     */
    const permiteVender = useCallback(
        (unidadId) => {
            const permitidas = almacenActual?.unidades_venta ?? [];
            if (permitidas.length === 0) return true;
            return permitidas.some((u) => String(u.id) === String(unidadId));
        },
        [almacenActual],
    );

    /**
     * ¿Este local vende rollos enteros? Sin unidades marcadas vende en todas;
     * si no, cuando entre ellas hay una "Rollo".
     */
    const vendeRollos = useMemo(() => {
        const permitidas = almacenActual?.unidades_venta ?? [];
        return (
            permitidas.length === 0 ||
            permitidas.some((u) => /rollo/i.test(`${u.nombre} ${u.abreviatura ?? ""}`))
        );
    }, [almacenActual]);

    /** Rollos libres de la tela en el almacén elegido (de todos sus colores). */
    const rollosLibresDe = useCallback(
        (productoId) =>
            existencias
                .filter(
                    (e) =>
                        String(e.almacen_id ?? e.almacen?.id) === String(form.almacen_id) &&
                        String(e.producto_id ?? e.producto?.id) === String(productoId),
                )
                .flatMap((e) => e.colores ?? [])
                .reduce((acc, c) => acc + (Number(c.rollos_disponibles ?? c.rollos) || 0), 0),
        [existencias, form.almacen_id],
    );

    /** Unidades del producto con el disponible ya convertido a esa unidad. */
    const unidadesDe = useCallback(
        (productoId) => {
            const p = productoDe(productoId);
            if (!p) return [];

            const stockBase = stockDelAlmacen[String(p.id)] ?? 0;
            const abrev = p.unidad_medida?.abreviatura ?? "";
            const metro = presentacionMetroDe(p);

            // La tela: rollos enteros con su metraje real, cobrados por metro.
            const porRollos =
                metro && vendeRollos
                    ? [
                          {
                              value: ROLLOS,
                              label: "Rollo (metraje real)",
                              factor: Number(metro.factor_conversion) || 1,
                              abrev,
                              stockBase,
                              disponible:
                                  Math.floor(
                                      (stockBase / (Number(metro.factor_conversion) || 1)) * 100,
                                  ) / 100,
                          },
                      ]
                    : [];

            return [
                ...porRollos,
                ...(p.presentaciones ?? [])
                    .filter((pres) => pres.activo !== false)
                    // Una tela ya no tiene formatos: se vende por metro (o en
                    // rollos enteros, arriba) y lo que varía es color y metraje.
                    .filter((pres) => !metro || String(pres.id) === String(metro.id))
                    // Cada local vende en ciertas unidades: el mayorista despacha
                    // rollos y la tienda corta metro a metro. Lo que no se vende
                    // aquí, no se ofrece.
                    .filter((pres) => permiteVender(pres.unidad_base_id))
                    .map((pres) => {
                        const factor = Number(pres.factor_conversion) || 1;
                        return {
                            value: String(pres.id),
                            label: pres.nombre,
                            factor,
                            abrev,
                            stockBase,
                            disponible:
                                Math.floor((stockBase / factor) * 100) / 100,
                        };
                    }),
            ];
        },
        [productoDe, stockDelAlmacen, permiteVender, vendeRollos],
    );

    /** La unidad de una fila o del panel: ROLLOS o el formato elegido. */
    const unidadDe = (it) => (it.modo === ROLLOS ? ROLLOS : it.producto_presentacion_id);

    const disponibleDe = (productoId, presentacionId) =>
        unidadesDe(productoId).find(
            (u) => String(u.value) === String(presentacionId),
        ) ?? null;

    const productoPanel = productoDe(panel.producto_id);
    const unidadesPanel = unidadesDe(panel.producto_id);
    const disponiblePanel = disponibleDe(panel.producto_id, unidadDe(panel));
    const porRollosPanel = panel.modo === ROLLOS;

    const setField = (name, value) =>
        setForm((prev) => ({ ...prev, [name]: value }));
    const setPanelCampo = (patch) =>
        setPanel((prev) => ({ ...prev, ...patch }));

    /**
     * Otra moneda: lo que tiene precio a mano se lleva a la nueva con el tipo
     * de cambio; lo demás lo recalcula la lista de precios. Los cobros vuelven
     * a la moneda de la venta.
     */
    const cambiarMoneda = (nueva) => {
        if (nueva === form.moneda) return;
        const tc = Number(form.tipo_cambio) || Number(tcDia?.venta) || 0;
        const llevar = (precio) => String(convertir(precio, form.moneda, nueva, tc));
        setItems((prev) =>
            prev.map((it) =>
                it.precio_manual ? { ...it, precio_unitario: llevar(it.precio_unitario) } : it,
            ),
        );
        setPanel((prev) =>
            prev.precioManual ? { ...prev, precio_unitario: llevar(prev.precio_unitario) } : prev,
        );
        setPagos((prev) => prev.map((p) => ({ ...p, moneda: "", tipoCambio: "", monto: "" })));
        setForm((prev) => ({
            ...prev,
            moneda: nueva,
            tipo_cambio: prev.tipo_cambio || (tcDia?.venta ? String(tcDia.venta) : ""),
        }));
    };

    /** Al elegir el cliente, la venta sale como él compra: a crédito o al contado. */
    const elegirCliente = (clienteId) => {
        const c = clientes.find((x) => String(x.id) === String(clienteId));
        const linea = c?.linea_credito;
        const aCredito = linea?.condicion_venta === "credito" && linea?.activa;
        setForm((prev) => ({
            ...prev,
            cliente_id: clienteId ?? "",
            ...(editando ? {} : { tipo_pago: aCredito ? "credito" : "contado" }),
        }));
    };

    /**
     * La unidad elegida en el panel. En rollos, la línea va en el formato
     * Metro (así se cobra) y la cantidad pasa a ser de rollos.
     */
    const unidadPanel = (productoId, valor, cantidad) => {
        if (valor === ROLLOS) {
            const metro = presentacionMetroDe(productoDe(productoId));
            return {
                modo: ROLLOS,
                producto_presentacion_id: metro ? String(metro.id) : "",
                precio_unitario: metro ? precioDeLista(productoId, metro.id, 1) : "0",
                precioManual: false,
            };
        }
        return {
            modo: "",
            producto_presentacion_id: valor,
            precio_unitario: valor ? precioDeLista(productoId, valor, cantidad || 1) : "0",
            precioManual: false,
        };
    };

    const elegirProducto = (productoId) => {
        const unidades = unidadesDe(productoId);
        setPanel({
            producto_id: productoId,
            cantidad: "1",
            ...unidadPanel(productoId, unidades.length === 1 ? unidades[0].value : "", 1),
        });
    };

    const elegirUnidad = (valor) =>
        setPanelCampo(unidadPanel(panel.producto_id, valor, panel.cantidad));

    const limpiarPanel = () => setPanel({ ...panelVacio });

    const agregarDesdePicker = (seleccionados) => {
        const utiles = seleccionados.filter(
            (s) => s.presentacion && s.cantidad > 0,
        );
        if (utiles.length === 0) return;

        setItems((prev) => {
            const next = [...prev];

            utiles.forEach(({ producto, presentacion, cantidad }) => {
                // El "Rollo" de una tela: una fila por rollo, cada uno con su
                // metraje real al precio del metro (el rollo se elige en la fila).
                const metro =
                    tipoUnidad(presentacion) === "rollo" ? presentacionMetroDe(producto) : null;
                if (metro) {
                    for (let k = 0; k < Math.max(1, Math.round(cantidad)); k++) {
                        next.push({
                            producto_id: String(producto.id),
                            producto_presentacion_id: String(metro.id),
                            modo: ROLLOS,
                            rollo_id: "",
                            cantidad: "",
                            precio_unitario: String(
                                enMonedaVenta(precioPara(metro, tipoPrecioId, 1), producto.id),
                            ),
                            precio_manual: false,
                        });
                    }
                    return;
                }

                const i = next.findIndex(
                    (it) =>
                        // Una línea que ya tiene rollo no se engorda: más tela
                        // del mismo producto puede salir de otro rollo.
                        !it.rollo_id &&
                        it.modo !== ROLLOS &&
                        String(it.producto_presentacion_id) ===
                        String(presentacion.id),
                );
                if (i !== -1) {
                    const total = (Number(next[i].cantidad) || 0) + cantidad;
                    next[i] = {
                        ...next[i],
                        cantidad: String(total),
                        // Más cantidad puede entrar en otro precio por cantidad.
                        ...(next[i].precio_manual
                            ? {}
                            : {
                                  precio_unitario: String(
                                      enMonedaVenta(
                                          precioPara(presentacion, tipoPrecioId, total),
                                          producto.id,
                                      ),
                                  ),
                              }),
                    };
                } else {
                    next.push({
                        producto_id: String(producto.id),
                        producto_presentacion_id: String(presentacion.id),
                        cantidad: String(cantidad),
                        precio_unitario: String(
                            enMonedaVenta(
                                precioPara(presentacion, tipoPrecioId, cantidad),
                                producto.id,
                            ),
                        ),
                        precio_manual: false,
                    });
                }
            });

            return next;
        });

        toast.success(
            utiles.length === 1
                ? "Producto agregado."
                : `${utiles.length} productos agregados.`,
        );
        limpiarPanel();
    };

    const agregarProducto = () => {
        if (!form.almacen_id) return toast.error("Elige primero el almacén.");
        if (!panel.producto_id)
            return toast.error("Busca y elige un producto.");
        if (!panel.producto_presentacion_id)
            return toast.error("Elige la unidad de medida.");
        if (!(Number(panel.cantidad) > 0))
            return toast.error("La cantidad debe ser mayor a 0.");

        // Rollos enteros: una fila por rollo. Los metros los pone el rollo que
        // se elija (o escanee) en cada fila.
        if (porRollosPanel) {
            if (!Number.isInteger(Number(panel.cantidad)))
                return toast.error("Los rollos se venden enteros: indica cuántos.");
            const filas = Array.from({ length: Number(panel.cantidad) }, () => ({
                producto_id: panel.producto_id,
                producto_presentacion_id: panel.producto_presentacion_id,
                modo: ROLLOS,
                rollo_id: "",
                cantidad: "",
                precio_unitario: panel.precio_unitario || "0",
                precio_manual: Boolean(panel.precioManual),
            }));
            setItems((prev) => [...prev, ...filas]);
            toast.success(
                filas.length === 1
                    ? "Elige o escanea el rollo en la fila agregada."
                    : `Elige o escanea el rollo de cada una de las ${filas.length} filas.`,
            );
            limpiarPanel();
            return;
        }

        const nuevo = {
            producto_id: panel.producto_id,
            producto_presentacion_id: panel.producto_presentacion_id,
            cantidad: panel.cantidad,
            precio_unitario: panel.precio_unitario || "0",
            precio_manual: Boolean(panel.precioManual),
        };

        // Si ya existe la misma presentación, se acumula en vez de duplicar la línea.
        const yaEsta = items.findIndex(
            (it) =>
                // Una línea que ya tiene rollo no se engorda: más tela
                        // del mismo producto puede salir de otro rollo.
                        !it.rollo_id &&
                        it.modo !== ROLLOS &&
                        String(it.producto_presentacion_id) ===
                String(nuevo.producto_presentacion_id),
        );
        if (yaEsta !== -1) {
            setItems((prev) =>
                prev.map((it, i) =>
                    i === yaEsta
                        ? {
                              ...it,
                              cantidad: String(
                                  (Number(it.cantidad) || 0) +
                                      (Number(nuevo.cantidad) || 0),
                              ),
                              // Con la cantidad sumada puede entrar en otro
                              // precio por cantidad, salvo que sea a mano.
                              precio_unitario: nuevo.precio_manual
                                  ? nuevo.precio_unitario
                                  : precioDeLista(
                                        it.producto_id,
                                        it.producto_presentacion_id,
                                        (Number(it.cantidad) || 0) +
                                            (Number(nuevo.cantidad) || 0),
                                    ),
                              precio_manual: nuevo.precio_manual,
                          }
                        : it,
                ),
            );
            toast.success("Se sumó la cantidad al producto ya agregado.");
        } else {
            setItems((prev) => [...prev, nuevo]);
        }
        limpiarPanel();
    };

    const setItem = (i, patch) =>
        setItems((prev) =>
            prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)),
        );

    /**
     * Cambiar la unidad de una fila trae su precio de lista. Pasar a "Rollo"
     * vende el rollo elegido entero (sus metros); volver a metros los deja.
     */
    const cambiarUnidadItem = (i, valor) => {
        const it = items[i];
        if (valor === ROLLOS) {
            const metro = presentacionMetroDe(productoDe(it.producto_id));
            if (!metro) return;
            const metros = it.rollo_metros ?? it.cantidad;
            setItem(i, {
                modo: ROLLOS,
                producto_presentacion_id: String(metro.id),
                ...(it.rollo_metros ? { cantidad: String(it.rollo_metros) } : {}),
                precio_unitario: precioDeLista(it.producto_id, metro.id, metros || 1),
                precio_manual: false,
            });
            return;
        }
        setItem(i, {
            modo: "",
            producto_presentacion_id: valor,
            precio_unitario: precioDeLista(it.producto_id, valor, it.cantidad),
            precio_manual: false,
        });
    };

    /**
     * El rollo de una fila. En una fila por rollo se lleva entero: la cantidad
     * son sus metros (se pueden bajar para vender un corte).
     */
    const elegirRollo = (i, rolloId, rollo) => {
        const it = items[i];
        const metros = rollo ? Number(rollo.metros_actual) : undefined;
        setItem(i, {
            rollo_id: rolloId,
            rollo_metros: metros,
            ...(it.modo === ROLLOS && metros
                ? {
                      cantidad: String(metros),
                      ...(it.precio_manual
                          ? {}
                          : {
                                precio_unitario: precioDeLista(
                                    it.producto_id,
                                    it.producto_presentacion_id,
                                    metros,
                                ),
                            }),
                  }
                : {}),
        });
    };

    /** Escanear la etiqueta del rollo: llena una fila por rollo que lo esté esperando, o agrega una. */
    const [codigoRollo, setCodigoRollo] = useState("");
    const escanearRollo = async (e) => {
        e.preventDefault();
        const codigo = codigoRollo.trim();
        if (!codigo) return;
        if (!form.almacen_id) return toast.error("Elige primero el almacén.");

        try {
            const res = await api.get(`/rollos/codigo/${encodeURIComponent(codigo)}`);
            const rollo = res.data?.data ?? res.data;
            const producto = productoDe(rollo.producto_id);
            const metro = presentacionMetroDe(producto);

            if (String(rollo.almacen_id) !== String(form.almacen_id))
                return toast.error(`El rollo ${rollo.codigo} está en ${rollo.almacen ?? "otro almacén"}.`);
            if (rollo.estado !== "disponible")
                return toast.error(`El rollo ${rollo.codigo} no está disponible: ${String(rollo.estado_label ?? rollo.estado).toLowerCase()}.`);
            if (items.some((it) => String(it.rollo_id) === String(rollo.id)))
                return toast.error(`El rollo ${rollo.codigo} ya está en la venta.`);
            if (!producto || !metro)
                return toast.error(`"${rollo.producto?.nombre ?? "Esa tela"}" no se vende por metro.`);

            const metros = Number(rollo.metros_actual);
            const esperando = items.findIndex(
                (it) =>
                    it.modo === ROLLOS &&
                    !it.rollo_id &&
                    String(it.producto_id) === String(producto.id),
            );

            if (esperando !== -1) {
                elegirRollo(esperando, String(rollo.id), rollo);
            } else {
                setItems((prev) => [
                    ...prev,
                    {
                        producto_id: String(producto.id),
                        producto_presentacion_id: String(metro.id),
                        modo: ROLLOS,
                        rollo_id: String(rollo.id),
                        rollo_metros: metros,
                        cantidad: String(metros),
                        precio_unitario: precioDeLista(producto.id, metro.id, metros),
                        precio_manual: false,
                    },
                ]);
            }
            toast.success(`${rollo.codigo} · ${rollo.color?.nombre ?? "sin color"} · ${num(metros)} m`);
            setCodigoRollo("");
        } catch (err) {
            toast.error(err.response?.data?.message ?? "No se encontró el rollo.");
        }
    };

    const quitarItem = (i) =>
        setItems((prev) => prev.filter((_, idx) => idx !== i));

    const setPago = (i, patch) =>
        setPagos((prev) =>
            prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)),
        );
    const addPago = () => setPagos((prev) => [...prev, emptyPago()]);
    const removePago = (i) =>
        setPagos((prev) =>
            prev.length === 1 ? prev : prev.filter((_, idx) => idx !== i),
        );

    const total = items.reduce(
        (acc, it) =>
            acc +
            (Number(it.cantidad) || 0) * (Number(it.precio_unitario) || 0),
        0,
    );
    const esContado = form.tipo_pago === "contado";
    /** Un monto en la moneda de la venta. */
    const m = (n) => money(n, form.moneda);

    /**
     * Una venta en dólares se puede cobrar con soles: cada cobro dice en qué
     * moneda entró, y los soles se llevan a dólares con el tipo de cambio
     * comercial del día (se propone y se puede cambiar).
     */
    const admiteSoles = form.moneda !== "PEN";
    const tcComercial = Number(tcDia?.comercial) || Number(form.tipo_cambio) || 0;
    const enSoles = (p) => admiteSoles && p.moneda === "PEN";
    const tcDe = (p) => Number(p.tipoCambio) || tcComercial;
    /** Lo que un cobro abona a la venta, en la moneda de la venta. */
    const abonoDe = (p) =>
        enSoles(p)
            ? tcDe(p) > 0
                ? redondear((Number(p.monto) || 0) / tcDe(p))
                : 0
            : Number(p.monto) || 0;
    /** El total de la venta en la moneda en que entra ese cobro. */
    const totalEn = (p) => (enSoles(p) ? redondear(total * tcDe(p)) : total);

    /** En modo simple hay un solo pago que cubre el total. */
    const pagosEfectivos = mixto
        ? pagos
        : [{ ...pagos[0], monto: String(totalEn(pagos[0])) }];
    const pagado = pagosEfectivos.reduce((acc, p) => acc + abonoDe(p), 0);
    const saldo = total - pagado;

    /** Cambia la moneda de un cobro, llevando lo ya escrito a la otra moneda. */
    const cambiarMonedaPago = (i, moneda) =>
        setPagos((prev) =>
            prev.map((p, idx) => {
                if (idx !== i || (p.moneda || "") === moneda) return p;
                const tc = Number(p.tipoCambio) || tcComercial;
                const monto = Number(p.monto) || 0;
                return {
                    ...p,
                    moneda,
                    tipoCambio:
                        moneda === "PEN" && !p.tipoCambio && tcComercial
                            ? String(tcComercial)
                            : p.tipoCambio,
                    monto:
                        monto && tc > 0
                            ? String(moneda === "PEN" ? redondear(monto * tc) : redondear(monto / tc))
                            : p.monto,
                };
            }),
        );

    /** "Dólares | Soles" y, en soles, el tipo de cambio comercial. Solo en una venta que no es en soles. */
    const controlesMoneda = (p, i) =>
        admiteSoles ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-lg border border-edge bg-gray-50 p-0.5">
                    {[form.moneda, "PEN"].map((mon) => {
                        const activa = (p.moneda || form.moneda) === mon;
                        return (
                            <button
                                key={mon}
                                type="button"
                                onClick={() => cambiarMonedaPago(i, mon === form.moneda ? "" : "PEN")}
                                className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
                                    activa ? "bg-white text-primary-700 shadow-sm" : "text-warm-500 hover:text-warm-700"
                                }`}
                            >
                                {NOMBRE_MONEDA[mon] ?? mon}
                            </button>
                        );
                    })}
                </div>
                {enSoles(p) && (
                    <>
                        <Input
                            type="number"
                            min="0"
                            step="0.0001"
                            placeholder="T.C. comercial"
                            value={p.tipoCambio}
                            onChange={(e) => setPago(i, { tipoCambio: e.target.value })}
                            className="w-28 text-right"
                            aria-label="Tipo de cambio comercial"
                        />
                        <span className="text-xs text-warm-500">
                            T.C. comercial
                            {mixto ? ` · abona ${money(abonoDe(p), form.moneda)}` : ""}
                        </span>
                    </>
                )}
            </div>
        ) : null;

    const alternarMixto = () => {
        setMixto((prev) => {
            if (!prev && !Number(pagos[0].monto)) {
                setPagos((ps) =>
                    ps.map((p, i) =>
                        i === 0 ? { ...p, monto: String(totalEn(p)) } : p,
                    ),
                );
            }
            if (prev) setPagos((ps) => ps.slice(0, 1));
            return !prev;
        });
    };

    /** Con `autorizarExceso`, quien tiene permiso registra la venta aunque pase la línea. */
    const guardar = async (autorizarExceso = false) => {
        if (items.length === 0)
            return toast.error("Agrega al menos un producto.");
        if (form.moneda !== "PEN" && !(Number(form.tipo_cambio) > 0))
            return toast.error("Pon el tipo de cambio de la venta.");
        if (!esContado) {
            const suma = cuotas.reduce((acc, c) => acc + (Number(c.monto) || 0), 0);
            if (cuotas.length === 0 || Math.abs(suma - total) > 0.01 * Math.max(cuotas.length, 1))
                return toast.error("Las cuotas deben sumar el total de la venta.");
        }
        if (esContado && pagosEfectivos.some((p) => enSoles(p) && Number(p.monto) > 0 && !(tcDe(p) > 0)))
            return toast.error("Para cobrar en soles, pon el tipo de cambio comercial.");
        if (!form.almacen_id) return toast.error("Selecciona el almacén.");
        if (form.tipo_pago === "credito" && !form.cliente_id) {
            return toast.error(
                "Para una venta al crédito debes seleccionar un cliente.",
            );
        }

        // Cada fila por rollo necesita su rollo, y un corte no puede pasar de lo que mide.
        const sinRollo = items.findIndex((it) => it.modo === ROLLOS && !it.rollo_id);
        if (sinRollo !== -1)
            return toast.error(`Elige o escanea el rollo de la fila ${sinRollo + 1}.`);
        const pasada = items.findIndex(
            (it) => it.rollo_id && it.rollo_metros && Number(it.cantidad) > it.rollo_metros + 0.001,
        );
        if (pasada !== -1)
            return toast.error(
                `La fila ${pasada + 1} pide más de lo que tiene su rollo (${num(items[pasada].rollo_metros)} m).`,
            );

        // El stock se descuenta al vender: se avisa aquí antes de que falle el backend.
        const sinStock = items.find((it) => {
            const u = disponibleDe(it.producto_id, unidadDe(it));
            return u && Number(it.cantidad) > u.disponible;
        });
        if (sinStock) {
            const u = disponibleDe(sinStock.producto_id, unidadDe(sinStock));
            const nombre =
                productoDe(sinStock.producto_id)?.nombre ?? "El producto";
            return toast.error(
                `"${nombre}" solo tiene ${num(u.disponible)} disponibles.`,
            );
        }

        setSaving(true);

        const detalles = items.map((it) => {
            const cantidad = Number(it.cantidad) || 0;
            const precio = Number(it.precio_unitario) || 0;
            return {
                producto_presentacion_id: it.producto_presentacion_id,
                // De qué rollo sale la tela; null en lo que no va por rollos.
                rollo_id: it.rollo_id || null,
                cantidad,
                precio_unitario: precio,
                descuento: 0,
                subtotal: Math.round(cantidad * precio * 100) / 100,
            };
        });

        const pagosPayload = esContado
            ? pagosEfectivos
                  .filter((p) => p.tipo && Number(p.monto) > 0)
                  .map((p) => ({
                      metodo_pago_id: null,
                      forma_pago: p.tipo,
                      cuenta_bancaria_id:
                          p.tipo === "transferencia"
                              ? p.cuentaId || null
                              : null,
                      billetera_id:
                          p.tipo === "billetera" ? p.billeteraId || null : null,
                      // En soles: el backend abona su equivalente al tipo de cambio.
                      monto: Number(p.monto),
                      ...(enSoles(p) ? { moneda: "PEN", tipo_cambio: tcDe(p) } : {}),
                      fecha: form.fecha_emision,
                      referencia: null,
                  }))
            : [
                  {
                      metodo_pago_id: null,
                      forma_pago: "credito",
                      monto: total,
                      fecha: form.fecha_emision,
                      referencia: null,
                  },
              ];

        if (pagosPayload.length === 0) {
            toast.error("Indica el método de pago.");
            setSaving(false);
            return;
        }

        try {
            const cuerpo = {
                cliente_id: form.cliente_id || null,
                almacen_id: form.almacen_id,
                vendedor_id: user?.id,
                fecha_emision: form.fecha_emision,
                moneda: form.moneda,
                tipo_cambio:
                    form.moneda !== "PEN" ? Number(form.tipo_cambio) || null : null,
                tipo_pago: form.tipo_pago,
                ...(esContado
                    ? {}
                    : {
                          cuotas: cuotas.map((c) => ({
                              fecha_vencimiento: c.fecha_vencimiento,
                              monto: Number(c.monto) || 0,
                          })),
                      }),
                ...(autorizarExceso ? { autorizar_exceso: true } : {}),
                subtotal: total,
                descuento_total: 0,
                total,
                observaciones: form.observaciones,
                serie: "NV01",
                detalles,
                pagos: pagosPayload,
            };

            if (editando) {
                await api.put(`/notas-venta/${ventaId}`, cuerpo);
            } else {
                await api.post("/notas-venta", cuerpo);
            }

            toast.success(
                editando
                    ? "Venta actualizada. Stock y caja recalculados."
                    : "Venta registrada. Stock descontado del almacén.",
            );
            navigate("/notas-venta");
        } catch (err) {
            // No cabe en la línea de crédito: el aviso, y "Autorizar" si se puede.
            if (err.response?.data?.exceso_credito) {
                setExceso({
                    message: err.response.data.message,
                    detalle: err.response.data.exceso_credito,
                });
                return;
            }
            const msg = err.response?.data?.message;
            const firstErr = err.response?.data?.errors
                ? Object.values(err.response.data.errors)[0]?.[0]
                : null;
            toast.error(firstErr ?? msg ?? "No se pudo registrar la venta.");
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
            {/* Encabezado, con la misma forma que el de Pedidos */}
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-100 text-primary-700">
                        <ReceiptText className="h-5 w-5" />
                    </span>
                    <div>
                        <h1 className="text-xl font-bold text-warm-900">
                            {editando ? "Editar venta" : "Nueva venta"}
                        </h1>
                        <p className="text-sm text-warm-500">
                            Nota de venta y registro del cobro. Al registrarla
                            se descuenta el stock.
                        </p>
                    </div>
                </div>
                <Button
                    variant="secondary"
                    onClick={() => navigate("/notas-venta")}
                >
                    <ArrowLeft className="h-4 w-4" />
                    Volver
                </Button>
            </div>

            {/* Dos columnas: a la izquierda lo que se vende, a la derecha la
                venta en sí y su total. */}
            <div className="grid gap-4 lg:grid-cols-[1fr_22rem] lg:items-start *:min-w-0">
                <div className="space-y-4">
                    {/* Panel de búsqueda y alta de producto */}
                    <div className="rounded-xl border border-edge bg-white p-5 shadow-sm">
                        <h2 className="mb-3 text-sm font-semibold text-warm-900">
                            Buscar Producto
                        </h2>

                        {!form.almacen_id ? (
                            <Alert variant="info">
                                Elige un almacén para ver los productos con
                                stock.
                            </Alert>
                        ) : (
                            <>
                                <SearchSelect
                                    value={panel.producto_id}
                                    onChange={elegirProducto}
                                    options={productosOptions}
                                    placeholder="Buscar producto por nombre o código…"
                                    emptyText="Sin productos con stock en este almacén"
                                    searchTitle="Buscador avanzado con filtros"
                                    onSearch={(q) =>
                                        setPicker({ open: true, query: q })
                                    }
                                />

                                <div className="mt-4">
                                    <label className="mb-1 block text-sm font-medium text-gray-700">
                                        Descripción
                                    </label>
                                    <input
                                        readOnly
                                        value={
                                            productoPanel?.descripcion ??
                                            productoPanel?.nombre ??
                                            ""
                                        }
                                        placeholder="—"
                                        className="block w-full rounded-md border-0 bg-white px-3 py-2 text-sm text-warm-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400"
                                    />
                                </div>

                                <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
                                    <div>
                                        <label className="mb-1 block text-sm font-medium text-gray-700">
                                            Disponible
                                        </label>
                                        <input
                                            readOnly
                                            value={
                                                !disponiblePanel
                                                    ? ""
                                                    : porRollosPanel
                                                      ? `${rollosTexto(rollosLibresDe(panel.producto_id))} · ${num(disponiblePanel.disponible)} m`
                                                      : num(disponiblePanel.disponible)
                                            }
                                            placeholder="—"
                                            className="block w-full rounded-md border-0 bg-gray-50 px-3 py-2 text-center text-sm text-gray-500 shadow-sm ring-1 ring-inset ring-gray-300"
                                        />
                                    </div>
                                    <SearchSelect
                                        label="Unidad"
                                        value={unidadDe(panel)}
                                        disabled={!panel.producto_id}
                                        clearable={false}
                                        placeholder={
                                            panel.producto_id ? "Elegir…" : "—"
                                        }
                                        emptyText="Sin unidades"
                                        onChange={(id) =>
                                            id &&
                                            String(id) !== String(unidadDe(panel)) &&
                                            elegirUnidad(id)
                                        }
                                        options={unidadesPanel}
                                    />
                                    <Input
                                        label={porRollosPanel ? "Rollos" : "Cantidad"}
                                        type="number"
                                        min="0"
                                        step={porRollosPanel ? "1" : "any"}
                                        value={panel.cantidad}
                                        onChange={(e) =>
                                            setPanel((prev) => ({
                                                ...prev,
                                                cantidad: e.target.value,
                                                // Puede entrar en un precio por cantidad
                                                // (en rollos, lo pone cada rollo al elegirlo).
                                                ...(prev.precioManual ||
                                                prev.modo === ROLLOS ||
                                                !prev.producto_presentacion_id
                                                    ? {}
                                                    : {
                                                          precio_unitario:
                                                              precioDeLista(
                                                                  prev.producto_id,
                                                                  prev.producto_presentacion_id,
                                                                  e.target.value,
                                                              ),
                                                      }),
                                            }))
                                        }
                                        className="text-center"
                                    />
                                    <Input
                                        label={porRollosPanel ? "Precio x metro" : "Precio"}
                                        type="number"
                                        min="0"
                                        step="any"
                                        value={panel.precio_unitario}
                                        onChange={(e) =>
                                            setPanelCampo({
                                                precio_unitario: e.target.value,
                                                precioManual: true,
                                            })
                                        }
                                        className="text-center"
                                    />
                                </div>

                                {/* En rollos se cobran los metros reales de cada uno. */}
                                {porRollosPanel && (
                                    <p className="mt-2 text-xs text-warm-500">
                                        Se agrega una fila por rollo: elige o escanea cada rollo y se
                                        cobra por sus metros reales. Para un corte, baja los metros de
                                        la fila.
                                    </p>
                                )}

                                <Button
                                    type="button"
                                    onClick={agregarProducto}
                                    className="mt-4 w-full justify-center md:w-auto md:min-w-[280px]"
                                >
                                    <Plus className="h-4 w-4" /> Agregar
                                    Producto
                                </Button>

                                {/* Con la pistola: el rollo entra entero a la venta. */}
                                <form onSubmit={escanearRollo} className="mt-4 flex flex-wrap items-end gap-2 border-t border-edge pt-4">
                                    <Input
                                        label="Escanear rollo"
                                        placeholder="Código del rollo…"
                                        value={codigoRollo}
                                        onChange={(e) => setCodigoRollo(e.target.value)}
                                        className="min-w-[220px]"
                                    />
                                    <Button type="submit" variant="secondary" disabled={!codigoRollo.trim()}>
                                        Agregar rollo
                                    </Button>
                                </form>
                            </>
                        )}
                    </div>

                    {/* Productos agregados */}
                    <div className="rounded-xl border border-edge bg-white shadow-sm">
                        <div className="flex items-center justify-between border-b border-edge px-5 py-3">
                            <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-warm-900">
                                <Package className="h-4 w-4 text-primary-600" />{" "}
                                Productos
                            </h2>
                            <span className="text-xs text-warm-500">
                                {items.length}{" "}
                                {items.length === 1
                                    ? "ítem agregado"
                                    : "ítems agregados"}
                            </span>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[880px] text-sm">
                                <thead>
                                    <tr className="bg-primary-600 text-left text-xs font-semibold uppercase tracking-wide text-white">
                                        <th className="w-12 px-3 py-2.5 text-center">
                                            #
                                        </th>
                                        <th className="w-28 px-3 py-2.5">
                                            Código
                                        </th>
                                        <th className="px-3 py-2.5">
                                            Producto
                                        </th>
                                        <th className="w-36 px-3 py-2.5">
                                            Unidad
                                        </th>
                                        {/* De qué rollo sale la tela: así el
                                            color queda en el kardex y los rollos
                                            no se descuadran del stock. */}
                                        <th className="w-64 px-3 py-2.5">
                                            Rollo
                                        </th>
                                        <th className="w-24 px-3 py-2.5 text-right">
                                            Disp.
                                        </th>
                                        <th className="w-28 px-3 py-2.5 text-right">
                                            Cant
                                        </th>
                                        <th className="w-28 px-3 py-2.5 text-right">
                                            Precio
                                        </th>
                                        <th className="w-28 px-3 py-2.5 text-right">
                                            Subtotal
                                        </th>
                                        <th className="w-16 px-3 py-2.5 text-center">
                                            —
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {items.length === 0 && (
                                        <tr>
                                            <td
                                                colSpan={10}
                                                className="px-3 py-10 text-center text-sm text-warm-500"
                                            >
                                                Busca un producto arriba para
                                                agregarlo a la venta
                                            </td>
                                        </tr>
                                    )}

                                    {items.map((it, i) => {
                                        const producto = productoDe(
                                            it.producto_id,
                                        );
                                        const u = disponibleDe(
                                            it.producto_id,
                                            unidadDe(it),
                                        );
                                        // Con rollo elegido: se va entero o es un corte.
                                        const entero =
                                            it.rollo_id && it.rollo_metros
                                                ? Number(it.cantidad) + 0.001 >= it.rollo_metros
                                                : null;
                                        const excede =
                                            u &&
                                            Number(it.cantidad) > u.disponible;
                                        const sub =
                                            (Number(it.cantidad) || 0) *
                                            (Number(it.precio_unitario) || 0);

                                        return (
                                            <tr key={i}>
                                                <td className="px-3 py-2 text-center text-warm-500">
                                                    {i + 1}
                                                </td>
                                                <td className="px-3 py-2 font-medium text-warm-900">
                                                    {producto?.codigo ?? "—"}
                                                </td>
                                                <td className="px-3 py-2 font-semibold text-warm-900">
                                                    {producto?.nombre ?? "—"}
                                                </td>
                                                <td className="px-3 py-2">
                                                    <SearchSelect
                                                        value={unidadDe(it)}
                                                        clearable={false}
                                                        emptyText="Sin unidades"
                                                        onChange={(id) =>
                                                            id &&
                                                            String(id) !==
                                                                String(unidadDe(it)) &&
                                                            cambiarUnidadItem(
                                                                i,
                                                                id,
                                                            )
                                                        }
                                                        options={(() => {
                                                            const opciones = unidadesDe(it.producto_id);
                                                            // Una venta antigua en un formato que ya no se
                                                            // ofrece (un "Rollo 50 m"): se sigue viendo el suyo.
                                                            if (
                                                                it.modo !== ROLLOS &&
                                                                !opciones.some((o) => o.value === String(it.producto_presentacion_id))
                                                            ) {
                                                                const actual = presentacionDe(it.producto_id, it.producto_presentacion_id);
                                                                if (actual) opciones.push({ value: String(actual.id), label: actual.nombre });
                                                            }
                                                            return opciones;
                                                        })()}
                                                        className="min-w-[120px]"
                                                    />
                                                </td>
                                                <td className="px-3 py-2">
                                                    <SelectorRollo
                                                        productoId={
                                                            it.producto_id
                                                        }
                                                        almacenId={
                                                            form.almacen_id
                                                        }
                                                        value={it.rollo_id}
                                                        // Un rollo no puede estar en dos filas.
                                                        excluir={items
                                                            .filter((x, j) => j !== i && x.rollo_id)
                                                            .map((x) => x.rollo_id)}
                                                        onChange={(v, rollo) =>
                                                            elegirRollo(i, v, rollo)
                                                        }
                                                    />
                                                    {it.modo === ROLLOS && !it.rollo_id && (
                                                        <span className="mt-0.5 block text-[11px] font-medium text-amber-600">
                                                            Elige o escanea el rollo
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-3 py-2 text-right text-warm-500">
                                                    {u
                                                        ? num(u.disponible)
                                                        : "—"}
                                                </td>
                                                <td className="px-3 py-2">
                                                    <Input
                                                        type="number"
                                                        min="0"
                                                        step="any"
                                                        value={it.cantidad}
                                                        onChange={(e) =>
                                                            setItem(i, {
                                                                cantidad:
                                                                    e.target
                                                                        .value,
                                                                // Puede entrar en un precio por cantidad.
                                                                ...(it.precio_manual
                                                                    ? {}
                                                                    : {
                                                                          precio_unitario:
                                                                              precioDeLista(
                                                                                  it.producto_id,
                                                                                  it.producto_presentacion_id,
                                                                                  e.target.value,
                                                                              ),
                                                                      }),
                                                            })
                                                        }
                                                        aria-label="Cantidad"
                                                        error={
                                                            excede
                                                                ? "Sin stock"
                                                                : undefined
                                                        }
                                                        className="text-right"
                                                    />
                                                    {entero !== null && (
                                                        <span
                                                            className={`mt-0.5 block text-right text-[11px] font-medium ${
                                                                entero ? "text-green-700" : "text-amber-600"
                                                            }`}
                                                        >
                                                            {entero
                                                                ? "Rollo entero"
                                                                : `Corte · quedan ${num(it.rollo_metros - Number(it.cantidad || 0))} m`}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-3 py-2">
                                                    <Input
                                                        type="number"
                                                        min="0"
                                                        step="any"
                                                        value={
                                                            it.precio_unitario
                                                        }
                                                        onChange={(e) =>
                                                            setItem(i, {
                                                                precio_unitario:
                                                                    e.target
                                                                        .value,
                                                                precio_manual: true,
                                                            })
                                                        }
                                                        aria-label="Precio unitario"
                                                        className="text-right"
                                                    />
                                                </td>
                                                <td className="px-3 py-2 text-right font-semibold text-primary-600">
                                                    {m(sub)}
                                                </td>
                                                <td className="px-3 py-2">
                                                    <div className="flex items-center justify-center">
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                quitarItem(i)
                                                            }
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

                <div className="space-y-4 lg:sticky lg:top-6">
                    <div className="rounded-xl border border-edge bg-white shadow-sm">
                        <div className="border-b border-edge px-5 py-3">
                            <h2 className="text-xs font-bold uppercase tracking-wide text-warm-500">
                                Datos de la venta
                            </h2>
                        </div>
                        <div className="grid grid-cols-1 gap-4 p-5">
                            <Input
                                label="Fecha"
                                type="date"
                                value={form.fecha_emision}
                                onChange={(e) =>
                                    setField("fecha_emision", e.target.value)
                                }
                            />
                            <div>
                                <SearchSelect
                                    label={
                                        esContado
                                            ? "Cliente (opcional)"
                                            : "Cliente"
                                    }
                                    value={form.cliente_id}
                                    onChange={elegirCliente}
                                    options={clientes.map((c) => ({
                                        value: String(c.id),
                                        label:
                                            c.nombre ??
                                            c.razon_social ??
                                            `#${c.id}`,
                                        keywords: c.numero_documento ?? "",
                                    }))}
                                    placeholder={CLIENTE_GENERICO}
                                    emptyText="Sin coincidencias"
                                />
                                {cliente?.tipo_precio && (
                                    <p className="mt-1 text-xs font-medium text-primary-700">
                                        Se le vende a precio {cliente.tipo_precio.nombre}.
                                    </p>
                                )}
                                {/* Sin cliente la venta va al genérico; a crédito no se puede. */}
                                {!form.cliente_id && (
                                    <p
                                        className={`mt-1 text-xs ${esContado ? "text-warm-500" : "text-red-600"}`}
                                    >
                                        {esContado
                                            ? `Sin cliente se registra como "${CLIENTE_GENERICO}".`
                                            : "Una venta al crédito necesita un cliente identificado."}
                                    </p>
                                )}
                            </div>
                            <SearchSelect
                                label="Almacén"
                                value={form.almacen_id}
                                // Cambiar de almacén invalida los productos ya elegidos.
                                onChange={(id) => {
                                    // Elegir el mismo almacén no vacía lo ya cargado.
                                    if ((id ?? "") === String(form.almacen_id ?? "")) return;
                                    setField("almacen_id", id ?? "");
                                    setItems([]);
                                    limpiarPanel();
                                }}
                                placeholder="Seleccione un almacén"
                                emptyText="Sin coincidencias"
                                options={opcionesAlmacen(
                                    almacenes,
                                    form.almacen_id,
                                )}
                            />
                            <Select
                                label="Tipo de pago"
                                value={form.tipo_pago}
                                onChange={(e) =>
                                    setField("tipo_pago", e.target.value)
                                }
                                options={[
                                    { value: "contado", label: "Contado" },
                                    { value: "credito", label: "Crédito" },
                                ]}
                            />
                            <Select
                                label="Moneda"
                                value={form.moneda}
                                onChange={(e) => cambiarMoneda(e.target.value)}
                                options={MONEDAS}
                            />
                            {form.moneda !== "PEN" && (
                                <div>
                                    <Input
                                        label="Tipo de cambio (SUNAT venta)"
                                        type="number"
                                        min="0"
                                        step="0.0001"
                                        value={form.tipo_cambio}
                                        onChange={(e) => {
                                            setTcManual(true);
                                            setField("tipo_cambio", e.target.value);
                                        }}
                                        className="text-right"
                                    />
                                    <p className="mt-1 text-xs text-warm-500">
                                        {tcDia?.venta
                                            ? `SUNAT del ${diaMes(tcDia.fecha_venta)}: ${tcDia.venta}`
                                            : "Sin tipo de cambio de SUNAT: escríbelo."}
                                        {tcDia?.comercial ? ` · Comercial: ${tcDia.comercial}` : ""}
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* A crédito: cómo está la línea del cliente y en qué cuotas paga. */}
                    {!esContado && (
                        <div className="rounded-xl border border-edge bg-white p-5 shadow-sm">
                            <h2 className="mb-3 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-warm-500">
                                <CalendarClock className="h-4 w-4" /> Crédito y cuotas
                            </h2>
                            <CreditoVenta
                                clienteId={form.cliente_id}
                                total={total}
                                moneda={form.moneda}
                                tipoCambio={form.tipo_cambio}
                                fecha={form.fecha_emision}
                                cuotas={cuotas}
                                onCuotas={setCuotas}
                            />
                        </div>
                    )}

                    {/* Al crédito no hay cobro que editar: la venta genera una
                        cuenta por cobrar y ahí se registran los pagos. */}
                    {esContado && (
                        <div className="rounded-xl border border-edge bg-white p-5 shadow-sm">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <h2 className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-warm-500">
                                        <Wallet className="h-4 w-4" /> Cobro
                                    </h2>
                                    <p className="mt-1 text-sm text-warm-900">
                                        {mixto
                                            ? `${pagos.length} métodos · Cobrado ${m(pagado)}`
                                            : `${pagos[0].tipo === "efectivo" ? "Efectivo" : pagos[0].tipo === "transferencia" ? "Transferencia" : "Billetera"} · ${
                                                  enSoles(pagos[0])
                                                      ? `${money(totalEn(pagos[0]), "PEN")} (= ${m(total)})`
                                                      : m(total)
                                              }`}
                                    </p>
                                    {mixto && Math.abs(saldo) > 0.001 && (
                                        <p
                                            className={`mt-0.5 text-xs font-semibold ${saldo > 0 ? "text-amber-600" : "text-red-600"}`}
                                        >
                                            {saldo > 0 ? "Falta cobrar" : "Vuelto"}: {m(Math.abs(saldo))}
                                        </p>
                                    )}
                                </div>
                                <Button type="button" variant="secondary" onClick={() => setModalCobro(true)}>
                                    <Pencil className="h-4 w-4" /> Editar cobro
                                </Button>
                            </div>
                        </div>
                    )}

                    <Modal
                        open={modalCobro}
                        onClose={() => setModalCobro(false)}
                        title="Cobro"
                        size="lg"
                        footer={
                            <Button type="button" onClick={() => setModalCobro(false)}>
                                Listo
                            </Button>
                        }
                    >
                        <div className="mb-4 flex items-center justify-between">
                            <span className="text-sm font-medium text-warm-700">Modo de cobro</span>
                            <button
                                type="button"
                                role="switch"
                                aria-checked={mixto}
                                onClick={alternarMixto}
                                className="inline-flex items-center gap-2 text-xs font-semibold text-warm-500 transition hover:text-warm-900"
                            >
                                Pago mixto
                                <span
                                    className={`relative block h-5 w-9 rounded-full transition ${mixto ? "bg-primary-600" : "bg-gray-300"}`}
                                >
                                    <span
                                        className={`absolute top-0.5 block h-4 w-4 rounded-full bg-white shadow transition-all ${mixto ? "left-[1.125rem]" : "left-0.5"}`}
                                    />
                                </span>
                            </button>
                        </div>

                        {!mixto ? (
                            <div className="space-y-3">
                                <MetodoCajaPicker
                                    cuentas={cuentas}
                                    billeteras={billeteras}
                                    tipo={pagos[0].tipo}
                                    cuentaId={pagos[0].cuentaId}
                                    billeteraId={pagos[0].billeteraId}
                                    onChange={({
                                        tipo,
                                        cuentaId,
                                        billeteraId,
                                    }) =>
                                        setPago(0, {
                                            tipo,
                                            cuentaId,
                                            billeteraId,
                                        })
                                    }
                                />
                                {controlesMoneda(pagos[0], 0)}
                                <div className="flex items-center justify-between rounded-lg bg-primary-50 px-3 py-2.5 text-sm">
                                    <span className="text-warm-500">
                                        Se cobra el total
                                    </span>
                                    <span className="font-bold text-primary-700">
                                        {enSoles(pagos[0])
                                            ? `${money(totalEn(pagos[0]), "PEN")} (= ${m(total)})`
                                            : m(total)}
                                    </span>
                                </div>
                            </div>
                        ) : (
                            <>
                                <div className="space-y-3">
                                    {pagos.map((p, i) => (
                                        <div
                                            key={i}
                                            className="rounded-lg border border-edge p-3"
                                        >
                                            <MetodoCajaPicker
                                                cuentas={cuentas}
                                                billeteras={billeteras}
                                                tipo={p.tipo}
                                                cuentaId={p.cuentaId}
                                                billeteraId={p.billeteraId}
                                                onChange={({
                                                    tipo,
                                                    cuentaId,
                                                    billeteraId,
                                                }) =>
                                                    setPago(i, {
                                                        tipo,
                                                        cuentaId,
                                                        billeteraId,
                                                    })
                                                }
                                            />
                                            <div className="mt-2 flex items-center gap-2">
                                                <Input
                                                    type="number"
                                                    min="0"
                                                    step="any"
                                                    placeholder={enSoles(p) ? "Monto en soles" : "Monto"}
                                                    value={p.monto}
                                                    onChange={(e) =>
                                                        setPago(i, {
                                                            monto: e.target
                                                                .value,
                                                        })
                                                    }
                                                    className="text-right"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        removePago(i)
                                                    }
                                                    disabled={
                                                        pagos.length === 1
                                                    }
                                                    className="rounded-md p-2 text-red-600 transition hover:bg-red-50 disabled:opacity-40"
                                                    aria-label="Quitar"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            </div>
                                            {controlesMoneda(p, i)}
                                        </div>
                                    ))}
                                </div>

                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={addPago}
                                    className="mt-3"
                                >
                                    <Plus className="h-4 w-4" /> Agregar pago
                                </Button>

                                <div className="mt-3 flex justify-between border-t border-dashed border-edge pt-2 text-sm">
                                    <span className="text-warm-500">
                                        Cobrado
                                    </span>
                                    <span className="font-semibold text-green-600">
                                        {m(pagado)}
                                    </span>
                                </div>
                                {Math.abs(saldo) > 0.001 && (
                                    <div className="flex justify-between text-sm">
                                        <span className="text-warm-500">
                                            {saldo > 0
                                                ? "Falta cobrar"
                                                : "Vuelto"}
                                        </span>
                                        <span
                                            className={
                                                saldo > 0
                                                    ? "font-semibold text-amber-600"
                                                    : "font-semibold text-red-600"
                                            }
                                        >
                                            {m(Math.abs(saldo))}
                                        </span>
                                    </div>
                                )}
                            </>
                        )}
                    </Modal>

                    <div className="rounded-xl border border-edge bg-white p-5 shadow-sm">
                        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-warm-500">
                            Observaciones
                        </h2>
                        <textarea
                            rows={3}
                            value={form.observaciones}
                            onChange={(e) =>
                                setField("observaciones", e.target.value)
                            }
                            placeholder="Notas de esta venta…"
                            className="block w-full resize-none rounded-lg border-0 bg-white p-3 text-sm text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-primary-600"
                        />
                    </div>

                    <div className="rounded-xl border border-edge bg-white p-5 shadow-sm">
                        <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-warm-500">
                            Resumen
                        </h2>
                        <div className="flex items-center justify-between border-b border-dashed border-edge pb-2 text-sm">
                            <span className="text-warm-500">Cliente</span>
                            <span className="max-w-[180px] truncate font-medium text-warm-900">
                                {clientes.find(
                                    (c) =>
                                        String(c.id) ===
                                        String(form.cliente_id),
                                )?.nombre ?? CLIENTE_GENERICO}
                            </span>
                        </div>
                        <div className="mt-1 flex items-center justify-between border-t border-edge pt-3">
                            <span className="text-sm font-bold uppercase tracking-wide text-primary-700">
                                Total
                            </span>
                            <span className="text-2xl font-extrabold text-warm-900">
                                {m(total)}
                            </span>
                        </div>
                        {form.moneda !== "PEN" && Number(form.tipo_cambio) > 0 && (
                            <p className="mt-1 text-right text-xs text-warm-500">
                                ≈ {money(total * Number(form.tipo_cambio), "PEN")} al T.C. {form.tipo_cambio}
                            </p>
                        )}

                        <div className="mt-5 flex flex-col gap-2">
                            <Button
                                onClick={() => guardar()}
                                loading={saving}
                                className="w-full justify-center"
                            >
                                {editando
                                    ? "Guardar cambios"
                                    : "Registrar venta"}
                            </Button>
                            <Button
                                variant="secondary"
                                onClick={() => navigate("/notas-venta")}
                                className="w-full justify-center"
                            >
                                Cancelar
                            </Button>
                        </div>
                        <p className="mt-3 text-xs text-gray-400">
                            Al registrar la venta se descuenta el stock del
                            almacén elegido.
                        </p>
                    </div>
                </div>
            </div>

            <ExcesoCreditoModal
                exceso={exceso}
                onClose={() => setExceso(null)}
                autorizando={saving}
                onAutorizar={async () => {
                    await guardar(true);
                    setExceso(null);
                }}
            />

            {/* El buscador avanzado muestra el catálogo completo; lo que no
                tiene stock en el almacén se ve pero no se puede agregar. */}
            <ProductoPickerModal
                open={picker.open}
                onClose={() => setPicker((prev) => ({ ...prev, open: false }))}
                onSelect={agregarDesdePicker}
                initialQuery={picker.query}
                multiple
                productos={productos}
                stockPorProducto={stockDeTodos}
                // Stock de cada almacén y por color, sin códigos de rollo.
                existencias={existencias}
                almacenId={form.almacen_id}
                title="Buscar productos"
            />
        </Layout>
    );
}
