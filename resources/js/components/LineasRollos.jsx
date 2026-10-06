import { Fragment, useMemo, useRef, useState } from 'react';
import { Camera, Check, ChevronRight, Eraser, Plus, ScanLine, Trash2, TriangleAlert } from 'lucide-react';
import api from '../lib/api';
import { useToast } from '../lib/toast';
import { tipoUnidad } from '../lib/unidades';
import { enterCopiar } from '../lib/enterCopiar';
import ColorSelect from './ColorSelect';
import EscanerCamara from './EscanerCamara';
import ProductoPickerModal from './ProductoPickerModal';
import { Button, Input, SearchSelect, cn } from './ui';

const num = (n) => new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 }).format(Number(n) || 0);

/** Una tela se pide en rollos (con un metraje opcional por rollo); lo demás, por cantidad en su unidad. */
export const ROLLOS = 'rollos';

/** El formato "Metro" de una tela; sin él, el producto no se pide por rollos. */
const presentacionMetroDe = (producto) =>
    (producto?.presentaciones ?? []).find((p) => p.activo !== false && tipoUnidad(p) === 'metro') ?? null;

const unidadesDe = (producto) =>
    (producto?.presentaciones ?? []).filter((p) => p.activo !== false).map((p) => ({ value: String(p.id), label: p.nombre }));

/** Rollos libres de una tela (de un color, si se indica) en las existencias dadas (las del almacén de origen). */
const rollosLibresEn = (existencias, productoId, colorId) => {
    const porColor = new Map();
    for (const fila of existencias) {
        if (String(fila.producto?.id ?? fila.producto_id) !== String(productoId)) continue;
        for (const c of fila.colores ?? []) {
            const k = String(c.id ?? 'sin');
            const previo = porColor.get(k) ?? { libres: 0, porAsignar: 0 };
            previo.libres += Number(c.rollos_disponibles ?? c.rollos) || 0;
            previo.porAsignar = Math.max(previo.porAsignar, Number(c.rollos_por_asignar) || 0);
            porColor.set(k, previo);
        }
    }
    let total = 0;
    for (const [k, v] of porColor) {
        if (colorId && k !== String(colorId)) continue;
        total += Math.max(0, v.libres - v.porAsignar);
    }
    return total;
};

/**
 * Las líneas que piden más de lo que hay disponible en el almacén de origen (`existencias` ya es de ese almacén):
 * [{ i, mensaje }], con `i` = posición de la línea. Lo pedido de la misma tela y color en varias líneas se suma.
 */
export const faltantesDeStock = ({ lineas, existencias, productos }) => {
    const productoDe = (presentacionId) =>
        productos.find((p) => (p.presentaciones ?? []).some((pr) => String(pr.id) === String(presentacionId))) ?? null;

    const pedidoPorGrupo = new Map();
    lineas.forEach((l) => {
        if (l.modo !== ROLLOS) return;
        const k = `${productoDe(l.producto_presentacion_id)?.id}|${l.producto_color_id || ''}`;
        pedidoPorGrupo.set(k, (pedidoPorGrupo.get(k) ?? 0) + (Number(l.rollos_pedidos) || 0));
    });

    const faltantes = [];
    lineas.forEach((l, i) => {
        if (l.modo === ROLLOS) {
            const prod = productoDe(l.producto_presentacion_id);
            const pide = pedidoPorGrupo.get(`${prod?.id}|${l.producto_color_id || ''}`) ?? 0;
            const hay = rollosLibresEn(existencias, prod?.id, l.producto_color_id);
            if (pide > hay) {
                faltantes.push({
                    i,
                    mensaje: hay <= 0
                        ? 'Sin stock disponible en el almacén de origen'
                        : `Pides ${num(pide)} rollo${pide === 1 ? '' : 's'} y solo hay ${num(hay)} disponible${hay === 1 ? '' : 's'}`,
                });
            }
        } else if (l.modo === 'cantidad') {
            const prod = productoDe(l.producto_presentacion_id);
            const pres = (prod?.presentaciones ?? []).find((pr) => String(pr.id) === String(l.producto_presentacion_id));
            const stock = existencias
                .filter((f) => String(f.producto?.id ?? f.producto_id) === String(prod?.id))
                .reduce((s, f) => s + Number(f.stock_disponible ?? f.stock_actual ?? 0), 0);
            const hay = stock / (Number(pres?.factor_conversion) || 1);
            const pide = Number(l.cantidad) || 0;
            if (pide > hay + 0.001) {
                faltantes.push({
                    i,
                    mensaje: hay <= 0 ? 'Sin stock disponible en el almacén de origen' : `Pides ${num(pide)} y solo hay ${num(hay)} disponibles`,
                });
            }
        }
    });
    return faltantes;
};

const lineaVacia = { producto_id: '', producto_presentacion_id: '', producto_color_id: '', cantidad: '', conMetraje: false, metros_por_rollo: '' };

/** Las líneas de un requerimiento: lo que se le pide a otro almacén. */
export const aDetallesRequerimiento = (lineas) =>
    lineas.filter((l) => l.modo !== 'escaneado').map((l) =>
        l.modo === ROLLOS
            ? {
                  modo: ROLLOS,
                  producto_presentacion_id: Number(l.producto_presentacion_id),
                  producto_color_id: l.producto_color_id ? Number(l.producto_color_id) : null,
                  rollos_pedidos: Math.max(1, Math.round(Number(l.rollos_pedidos))),
                  metros_por_rollo: Number(l.metros_por_rollo) > 0 ? Number(l.metros_por_rollo) : null,
              }
            : {
                  modo: 'cantidad',
                  producto_presentacion_id: Number(l.producto_presentacion_id),
                  producto_color_id: l.producto_color_id ? Number(l.producto_color_id) : null,
                  cantidad: Number(l.cantidad),
              },
    );

/** Las líneas de un traslado por stock: una tela va por rollos (el servidor toma los más antiguos del color). */
export const aDetallesTraslado = (lineas) =>
    lineas.map((l) =>
        l.modo === 'escaneado'
            ? {
                  // Rollos escogidos escaneando su QR: salen exactamente esos (enteros, o con el corte que se indique).
                  producto_presentacion_id: Number(l.producto_presentacion_id),
                  producto_color_id: l.producto_color_id ? Number(l.producto_color_id) : null,
                  rollos_escaneados: l.rollos.map((r) => ({ rollo_id: r.rollo_id, metros: Number(r.metros) })),
              }
            : l.modo === ROLLOS
            ? {
                  producto_presentacion_id: Number(l.producto_presentacion_id),
                  producto_color_id: l.producto_color_id ? Number(l.producto_color_id) : null,
                  rollos: Math.max(1, Math.round(Number(l.rollos_pedidos))),
              }
            : {
                  producto_presentacion_id: Number(l.producto_presentacion_id),
                  producto_color_id: l.producto_color_id ? Number(l.producto_color_id) : null,
                  cantidad_enviada: Number(l.cantidad),
              },
    );

/**
 * Productos de un requerimiento o de un traslado, con la misma forma de agregarlos que Nuevo pedido: buscador (con el
 * buscador avanzado), color, disponible, unidad y cantidad; y la tabla con una fila por tela, que se despliega en sus
 * colores con los rollos, y lo demás línea por línea.
 *
 *   existencias   — filas de /existencias del almacén de donde sale la mercadería
 *   conMetraje    — deja pedir "un metraje por rollo" (el almacén corta si no tiene uno de ese largo)
 *   validarStock  — no deja pasar de lo que hay disponible (un traslado); sin esto se puede pedir lo que falta
 */
export default function LineasRollos({
    productos = [],
    existencias = [],
    lineas,
    setLineas,
    titulo = 'Productos',
    conMetraje = false,
    validarStock = false,
    /** Marca en rojo lo que pide más de lo que hay en el origen (sin impedir agregarlo; quien guarda decide si deja pasar). */
    avisarStock = false,
    deshabilitado = false,
    avisoDeshabilitado = null,
    errores = {},
    /** Con un almacén de origen, se puede escoger un rollo exacto escaneando su QR (pistola o cámara). */
    almacenOrigenId = null,
}) {
    const toast = useToast();
    const [codigo, setCodigo] = useState('');
    const [ultimo, setUltimo] = useState(null);
    const [camara, setCamara] = useState(false);
    const [nueva, setNueva] = useState(lineaVacia);
    const [abiertas, setAbiertas] = useState({});
    const [picker, setPicker] = useState({ open: false, query: '' });

    const stockPorProducto = useMemo(() => {
        const porProducto = {};
        for (const fila of existencias) {
            const pid = fila.producto?.id ?? fila.producto_id;
            if (!pid) continue;
            porProducto[pid] = (porProducto[pid] ?? 0) + Number(fila.stock_disponible ?? fila.stock_actual ?? 0);
        }
        return porProducto;
    }, [existencias]);

    const producto = useMemo(() => productos.find((p) => String(p.id) === String(nueva.producto_id)) ?? null, [productos, nueva.producto_id]);
    const presentaciones = (producto?.presentaciones ?? []).filter((p) => p.activo !== false);
    const presentacion = presentaciones.find((p) => String(p.id) === String(nueva.producto_presentacion_id)) ?? null;
    const metroNueva = presentacionMetroDe(producto);
    const esTelaNueva = Boolean(metroNueva);

    const productoDe = (presentacionId) =>
        productos.find((p) => (p.presentaciones ?? []).some((pr) => String(pr.id) === String(presentacionId))) ?? null;

    /** Rollos libres de una tela (de un color, si se indica) en el almacén de origen. */
    const rollosLibresDe = (productoId, colorId) => rollosLibresEn(existencias, productoId, colorId);

    /** Lo que se pide de más (con `avisarStock`): se marca en su línea y en la fila de la tela. */
    const faltantes = useMemo(
        () => (avisarStock ? faltantesDeStock({ lineas, existencias, productos }) : []),
        [avisarStock, lineas, existencias, productos], // eslint-disable-line react-hooks/exhaustive-deps
    );
    const faltaDe = (i) => faltantes.find((f) => f.i === i);

    const rollosLibres = useMemo(
        () => (producto ? rollosLibresDe(producto.id, nueva.producto_color_id) : 0),
        [producto, existencias, nueva.producto_color_id], // eslint-disable-line react-hooks/exhaustive-deps
    );

    /** El stock del producto en la unidad elegida (lo que no es tela). */
    const stockEnUnidad = useMemo(() => {
        if (!producto) return null;
        return (stockPorProducto[producto.id] ?? 0) / (Number(presentacion?.factor_conversion) || 1);
    }, [producto, presentacion, stockPorProducto]);

    /** Lo ya agregado de esa tela y color, para no pasarse del disponible al sumar. */
    const yaAgregado = (presentacionId, colorId) =>
        lineas
            .filter((l) => (l.modo === ROLLOS || l.modo === 'escaneado') && String(l.producto_presentacion_id) === String(presentacionId) && String(l.producto_color_id || '') === String(colorId || ''))
            .reduce((s, l) => s + (l.modo === 'escaneado' ? l.rollos.length : Number(l.rollos_pedidos) || 0), 0);

    /** Valida el rollo escaneado en el servidor y lo agrega a su tela y color. */
    const verificar = async (valor) => {
        if (!valor || !almacenOrigenId) return { ok: false, texto: 'Elige el almacén de origen.' };
        try {
            const { data: r } = await api.post('/transferencias/rollo-escaneado', { codigo: valor, almacen_origen_id: Number(almacenOrigenId) });
            if (lineas.some((l) => l.modo === 'escaneado' && l.rollos.some((x) => x.rollo_id === r.rollo_id))) {
                const texto = `El rollo ${r.codigo} ya está agregado.`;
                setUltimo({ ok: false, codigo: r.codigo, texto });
                return { ok: false, texto };
            }
            setLineas((prev) => {
                const rollo = { rollo_id: r.rollo_id, codigo: r.codigo, metros: String(r.metros), metros_rollo: r.metros_rollo };
                const j = prev.findIndex(
                    (l) =>
                        l.modo === 'escaneado' &&
                        String(l.producto_presentacion_id) === String(r.producto_presentacion_id) &&
                        String(l.producto_color_id || '') === String(r.producto_color_id ?? ''),
                );
                if (j !== -1) return prev.map((l, k) => (k === j ? { ...l, rollos: [...l.rollos, rollo] } : l));
                return [
                    ...prev,
                    {
                        modo: 'escaneado',
                        producto_presentacion_id: String(r.producto_presentacion_id),
                        producto_color_id: r.producto_color_id ? String(r.producto_color_id) : '',
                        producto: r.producto,
                        color: r.color ?? '',
                        presentacion: 'Rollo',
                        rollos: [rollo],
                    },
                ];
            });
            const texto = `Rollo correcto · ${num(r.metros)} m`;
            setUltimo({ ok: true, codigo: r.codigo, texto });
            return { ok: true, texto };
        } catch (err) {
            const texto = err.response?.data?.message ?? 'No se pudo verificar el rollo.';
            setUltimo({ ok: false, codigo: valor, texto });
            return { ok: false, texto };
        }
    };

    const escanear = async (e) => {
        e.preventDefault();
        const valor = codigo.trim();
        if (!valor) return;
        setCodigo('');
        await verificar(valor);
    };

    /** Los metros de un rollo escaneado: por defecto entero; menos metros = se corta. */
    const cambiarMetrosRollo = (i, rolloId, valor) =>
        setLineas((prev) => prev.map((l, j) => (j === i ? { ...l, rollos: l.rollos.map((r) => (r.rollo_id === rolloId ? { ...r, metros: valor } : r)) } : l)));
    const quitarRollo = (i, rolloId) =>
        setLineas((prev) =>
            prev
                .map((l, j) => (j === i ? { ...l, rollos: l.rollos.filter((r) => r.rollo_id !== rolloId) } : l))
                .filter((l) => l.modo !== 'escaneado' || l.rollos.length > 0),
        );

    const elegirProducto = (id) => {
        const pr = productos.find((p) => String(p.id) === String(id));
        const pres = (pr?.presentaciones ?? []).filter((p) => p.activo !== false);
        const tela = Boolean(presentacionMetroDe(pr));
        setNueva({
            ...lineaVacia,
            producto_id: id ?? '',
            producto_presentacion_id: !tela && pres.length === 1 ? String(pres[0].id) : '',
        });
    };

    const puedeAgregar =
        Boolean(producto) &&
        Number(nueva.cantidad) > 0 &&
        (esTelaNueva
            ? Number.isInteger(Number(nueva.cantidad)) && (!nueva.conMetraje || Number(nueva.metros_por_rollo) > 0)
            : Boolean(nueva.producto_presentacion_id));

    /** Suma rollos a la línea de la misma tela, color y metraje, o crea una nueva. */
    const conRollos = (lista, { prod, metro, color, rollos, metrosPorRollo = null }) => {
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
        });
        return next;
    };

    /** Suma cantidad a la línea del mismo formato y color, o crea una nueva. */
    const conCantidad = (lista, { prod, pres, color, cantidad }) => {
        const next = [...lista];
        const j = next.findIndex(
            (l) =>
                l.modo !== ROLLOS &&
                String(l.producto_presentacion_id) === String(pres.id) &&
                String(l.producto_color_id || '') === String(color?.id ?? ''),
        );
        if (j !== -1) {
            next[j] = { ...next[j], cantidad: String((Number(next[j].cantidad) || 0) + cantidad) };
            return next;
        }
        next.push({
            producto_presentacion_id: String(pres.id),
            producto_color_id: color ? String(color.id) : '',
            producto: prod.nombre,
            color: color?.nombre ?? '',
            modo: 'cantidad',
            cantidad: String(cantidad),
            presentacion: pres.nombre,
        });
        return next;
    };

    const agregar = () => {
        if (!puedeAgregar) return toast.error('Completa el producto y la cantidad.');
        const color = (producto.colores ?? []).find((c) => String(c.id) === String(nueva.producto_color_id));
        const cantidad = Number(nueva.cantidad);

        if (validarStock) {
            if (producto.colores?.length > 0 && !nueva.producto_color_id) return toast.error('Elige el color.');
            if (esTelaNueva) {
                const quedan = rollosLibres - yaAgregado(metroNueva.id, nueva.producto_color_id);
                if (cantidad > quedan) {
                    return toast.error(`Solo hay ${num(Math.max(0, quedan))} rollo${quedan === 1 ? '' : 's'} disponible${quedan === 1 ? '' : 's'} en el origen${color ? ` de ${color.nombre}` : ''}.`);
                }
            } else if (stockEnUnidad != null && cantidad > stockEnUnidad) {
                return toast.error(`Solo hay ${num(stockEnUnidad)} disponibles en el origen.`);
            }
        }

        if (esTelaNueva) {
            setLineas((prev) =>
                conRollos(prev, { prod: producto, metro: metroNueva, color, rollos: cantidad, metrosPorRollo: conMetraje && nueva.conMetraje ? Number(nueva.metros_por_rollo) : null }),
            );
        } else {
            setLineas((prev) => conCantidad(prev, { prod: producto, pres: presentacion, color, cantidad }));
        }
        setNueva(lineaVacia);
    };

    /** Lo que se marca en el buscador avanzado: una tela por color va en rollos; el resto, en su unidad. */
    const agregarDesdePicker = (seleccionados) => {
        const utiles = seleccionados.filter((x) => x.presentacion && x.cantidad > 0);
        if (!utiles.length) return;

        setLineas((prev) => {
            let next = [...prev];
            utiles.forEach(({ producto: pr, presentacion: pres, cantidad, color, porRollos }) => {
                const metro = presentacionMetroDe(pr);
                if (metro && (porRollos || tipoUnidad(pres) === 'metro')) {
                    next = conRollos(next, { prod: pr, metro, color, rollos: Math.max(1, Math.round(cantidad)) });
                } else {
                    next = conCantidad(next, { prod: pr, pres, color, cantidad });
                }
            });
            return next;
        });
        setPicker((prev) => ({ ...prev, open: false }));
    };

    /** La fila cuyos rollos se están escribiendo (Enter los copia a la siguiente). */
    const editandoRollos = useRef(null);
    const cambiar = (i, campo, valor) => setLineas((prev) => prev.map((l, j) => (j === i ? { ...l, [campo]: valor } : l)));
    const quitar = (i) => setLineas((prev) => prev.filter((_, j) => j !== i));
    const quitarVarias = (indices) => setLineas((prev) => prev.filter((_, j) => !indices.includes(j)));
    const alternar = (clave) => setAbiertas((prev) => ({ ...prev, [clave]: !prev[clave] }));

    /** Lo que se ve en la tabla: cada tela en rollos es una fila (sus colores se despliegan); lo demás, línea por línea. */
    const filasTabla = useMemo(() => {
        const filas = [];
        const telas = new Map();
        lineas.forEach((l, i) => {
            if (l.modo !== ROLLOS && l.modo !== 'escaneado') {
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

    return (
        <>
            <section className="rounded-xl border border-edge bg-white p-5 shadow-sm">
                <h2 className="text-base font-semibold text-warm-900">{titulo}</h2>
                <p className="mb-4 text-sm text-warm-500">
                    {lineas.length} producto{lineas.length === 1 ? '' : 's'} agregado{lineas.length === 1 ? '' : 's'}
                </p>

                {deshabilitado ? (
                    <p className="rounded-md bg-primary-50 px-3 py-2 text-sm text-primary-700">{avisoDeshabilitado}</p>
                ) : (
                    <div className="space-y-4">
                        <SearchSelect
                            label="Buscar producto"
                            placeholder="Nombre o código…"
                            value={nueva.producto_id}
                            onChange={(v) => elegirProducto(v)}
                            options={productos.map((p) => ({ value: String(p.id), label: p.nombre, keywords: p.codigo }))}
                            searchTitle="Buscador avanzado con filtros"
                            onSearch={(q) => setPicker({ open: true, query: q })}
                        />

                        {/* Escoger un rollo exacto: pistola o cámara (traslados). */}
                        {almacenOrigenId && (
                            <form onSubmit={escanear}>
                                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-warm-500">O escanea el rollo que quieres mandar</label>
                                <div className="flex items-center gap-2">
                                    <span className="relative flex-1">
                                        <ScanLine className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-primary-600" />
                                        <input
                                            value={codigo}
                                            onChange={(e) => setCodigo(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    e.preventDefault();
                                                    escanear(e);
                                                }
                                            }}
                                            placeholder="Dispara la pistola sobre la etiqueta…"
                                            autoComplete="off"
                                            className="w-full rounded-lg border border-edge py-2.5 pl-10 pr-3 font-mono text-sm shadow-sm outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                                        />
                                    </span>
                                    <Button type="submit" size="sm" variant="secondary" disabled={!codigo.trim()}>Agregar rollo</Button>
                                    <Button type="button" variant="secondary" size="sm" onClick={() => setCamara(true)} title="Escanear con la cámara">
                                        <Camera className="h-4 w-4" />
                                    </Button>
                                </div>
                                {ultimo && (
                                    <div className={cn('mt-2 flex items-center gap-2 rounded-md px-3 py-2 text-sm', ultimo.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800')}>
                                        {ultimo.ok ? <Check className="h-4 w-4 shrink-0" /> : <TriangleAlert className="h-4 w-4 shrink-0" />}
                                        <span><strong>{ultimo.codigo}</strong> · {ultimo.texto}</span>
                                    </div>
                                )}
                            </form>
                        )}

                        {/* Solo si la tela tiene colores registrados: hay insumos que no se piden por color. */}
                        {producto?.colores?.length > 0 && (
                            <ColorSelect
                                colores={producto.colores}
                                value={nueva.producto_color_id}
                                onChange={(id) => setNueva((prev) => ({ ...prev, producto_color_id: id }))}
                            />
                        )}

                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
                                    onChange={(id) => id && setNueva((prev) => ({ ...prev, producto_presentacion_id: id }))}
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
                        </div>

                        {/* Una tela: rollos enteros, o (en un requerimiento) rollos de un metraje que el almacén corta. */}
                        {esTelaNueva && (
                            <div className="-mt-2 space-y-2">
                                {conMetraje && (
                                    <div className="flex flex-wrap items-end gap-4">
                                        <label className="flex cursor-pointer items-center gap-2 pb-2 text-sm font-medium text-warm-700">
                                            <input
                                                type="checkbox"
                                                checked={nueva.conMetraje}
                                                onChange={(e) => setNueva((prev) => ({ ...prev, conMetraje: e.target.checked, metros_por_rollo: e.target.checked ? prev.metros_por_rollo : '' }))}
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
                                )}
                                <p className="text-xs text-warm-500">
                                    {producto?.colores?.length > 0 && !nueva.producto_color_id ? 'Elige el color de la tela. ' : ''}
                                    {conMetraje && nueva.conMetraje
                                        ? 'Cada rollo sale con ese metraje: si el almacén no tiene uno de ese largo, corta la tela de otro más grande.'
                                        : 'Se mandan rollos enteros, midan lo que midan.'}
                                </p>
                            </div>
                        )}

                        <div className="flex flex-wrap items-center gap-2">
                            <Button onClick={agregar} disabled={!puedeAgregar}>
                                <Plus className="h-4 w-4" />
                                Agregar producto
                            </Button>
                            <Button type="button" variant="secondary" onClick={() => setNueva(lineaVacia)}>
                                <Eraser className="h-4 w-4" />
                                Limpiar
                            </Button>
                        </div>
                    </div>
                )}

                {/* Líneas */}
                <div className="mt-5 overflow-x-auto rounded-lg border border-edge">
                    <table className="w-full min-w-[560px] text-sm">
                        <thead>
                            <tr className="bg-primary-600 text-left text-xs font-semibold uppercase tracking-wide text-white">
                                <th className="px-3 py-2">Producto</th>
                                <th className="px-3 py-2">Presentación</th>
                                <th className="px-3 py-2 text-right">Cantidad</th>
                                <th className="w-14 px-3 py-2 text-center">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {lineas.length === 0 && (
                                <tr>
                                    <td colSpan={4} className="px-3 py-10 text-center text-warm-400">
                                        Agrega productos con el buscador de arriba.
                                    </td>
                                </tr>
                            )}

                            {filasTabla.map((fila) => {
                                // Una tela: una fila y, al desplegarla, sus colores con los rollos.
                                if (fila.tipo === 'tela') {
                                    const colores = fila.indices.map((i) => ({ l: lineas[i], i }));
                                    const rollos = colores.reduce((suma, { l }) => suma + (l.modo === 'escaneado' ? l.rollos.length : Number(l.rollos_pedidos) || 0), 0);
                                    const hayFalta = colores.some(({ i }) => faltaDe(i));
                                    // Con faltantes se queda abierta: ahí está el mensaje de cada color.
                                    const abierta = Boolean(abiertas[fila.clave]) || hayFalta;
                                    const error = colores.map(({ i }) => errores[`detalles.${i}.rollos`] ?? errores[`detalles.${i}.cantidad_enviada`]).find(Boolean);
                                    const hexDe = (l) =>
                                        (productoDe(l.producto_presentacion_id)?.colores ?? []).find((c) => String(c.id) === String(l.producto_color_id))?.hex;

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
                                                        <span className="font-medium text-warm-900">{fila.producto}</span>
                                                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-warm-700">
                                                            {colores.length} color{colores.length === 1 ? '' : 'es'}
                                                        </span>
                                                        {hayFalta && (
                                                            <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
                                                                <TriangleAlert className="h-3 w-3" /> Sin stock suficiente
                                                            </span>
                                                        )}
                                                    </span>
                                                    {error && <span className="block pl-7 text-xs text-red-600">{error[0] ?? error}</span>}
                                                </td>
                                                <td className="px-3 py-2 text-warm-700">Rollo</td>
                                                <td className="px-3 py-2 text-right font-medium text-warm-900">
                                                    {rollos} rollo{rollos === 1 ? '' : 's'}
                                                </td>
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
                                                <td colSpan={4} className="p-0">
                                                    <div className={cn('grid transition-[grid-template-rows] duration-300 ease-out', abierta ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
                                                        <div className="overflow-hidden">
                                                            <div className={cn('bg-gray-50/70 py-1 pl-10 pr-3 transition-opacity duration-300', abierta ? 'border-b border-gray-100 opacity-100' : 'opacity-0')}>
                                                                <div className="grid grid-cols-[1fr_7rem_2.5rem] items-center gap-3 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-warm-500">
                                                                    <span>Color</span>
                                                                    <span className="text-right">Rollos / metros</span>
                                                                    <span />
                                                                </div>
                                                                {colores.map(({ l, i }, n) => l.modo === 'escaneado' ? (
                                                                    <div key={i}>
                                                                        <div className="px-2 py-1.5">
                                                                            <span className="inline-flex items-center gap-2 font-medium uppercase text-warm-800">
                                                                                <span className="h-3 w-3 shrink-0 rounded-full ring-1 ring-black/10" style={{ backgroundColor: hexDe(l) || '#9ca3af' }} />
                                                                                {l.color || 'Sin color'}
                                                                                <span className="text-xs font-semibold normal-case text-primary-700">· {l.rollos.length} escaneado{l.rollos.length === 1 ? '' : 's'}</span>
                                                                            </span>
                                                                        </div>
                                                                        {l.rollos.map((r) => (
                                                                            <div key={r.rollo_id} className="grid grid-cols-[1fr_7rem_2.5rem] items-center gap-3 px-2 py-1 pl-7">
                                                                                <span className="font-mono text-xs text-warm-700">
                                                                                    {r.codigo}
                                                                                    {Number(r.metros) + 0.001 < Number(r.metros_rollo) && (
                                                                                        <span className="ml-2 font-sans text-[11px] font-semibold text-primary-700">corte de {num(r.metros_rollo)} m</span>
                                                                                    )}
                                                                                </span>
                                                                                <Input
                                                                                    type="number"
                                                                                    step="0.01"
                                                                                    min="0.01"
                                                                                    max={r.metros_rollo}
                                                                                    value={r.metros}
                                                                                    onChange={(e) => cambiarMetrosRollo(i, r.rollo_id, e.target.value)}
                                                                                    className="text-right"
                                                                                    aria-label={`Metros del rollo ${r.codigo}`}
                                                                                    tabIndex={abierta ? 0 : -1}
                                                                                />
                                                                                <button
                                                                                    type="button"
                                                                                    aria-label={`Quitar ${r.codigo}`}
                                                                                    onClick={() => quitarRollo(i, r.rollo_id)}
                                                                                    tabIndex={abierta ? 0 : -1}
                                                                                    className="rounded-md p-1.5 text-red-600 transition hover:bg-red-50"
                                                                                >
                                                                                    <Trash2 className="h-4 w-4" />
                                                                                </button>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                ) : (
                                                                    <div key={i}>
                                                                    <div className="grid grid-cols-[1fr_7rem_2.5rem] items-center gap-3 px-2 py-1.5">
                                                                        <span className="inline-flex items-center gap-2 font-medium uppercase text-warm-800">
                                                                            <span className="h-3 w-3 shrink-0 rounded-full ring-1 ring-black/10" style={{ backgroundColor: hexDe(l) || '#9ca3af' }} />
                                                                            {l.color || 'Cualquier color'}
                                                                            {Number(l.metros_por_rollo) > 0 && (
                                                                                <span className="text-xs font-semibold normal-case text-primary-700">· rollos de {num(l.metros_por_rollo)} m</span>
                                                                            )}
                                                                        </span>
                                                                        <Input
                                                                            type="number"
                                                                            step="1"
                                                                            min="1"
                                                                            value={l.rollos_pedidos}
                                                                            onChange={(e) => {
                                                                                editandoRollos.current = i;
                                                                                cambiar(i, 'rollos_pedidos', e.target.value);
                                                                            }}
                                                                            onFocus={() => {
                                                                                if (editandoRollos.current !== i) editandoRollos.current = null;
                                                                            }}
                                                                            onKeyDown={(e) => {
                                                                                const sig = colores[n + 1];
                                                                                enterCopiar({
                                                                                    e,
                                                                                    editando: editandoRollos,
                                                                                    actual: { clave: i, valor: l.rollos_pedidos },
                                                                                    // Los rollos escaneados no se copian: solo la fila de rollos pedidos que sigue.
                                                                                    siguiente: sig && sig.l.modo !== 'escaneado' ? { clave: sig.i, valor: sig.l.rollos_pedidos } : null,
                                                                                    copiar: (j, v) => cambiar(j, 'rollos_pedidos', v),
                                                                                    atributo: 'data-rollos',
                                                                                });
                                                                            }}
                                                                            data-rollos={i}
                                                                            className="text-right"
                                                                            aria-label={`Rollos de ${fila.producto} ${l.color}`}
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
                                                                    {faltaDe(i) && (
                                                                        <p className="flex items-center gap-1.5 px-2 pb-1.5 pl-7 text-xs font-medium text-red-600">
                                                                            <TriangleAlert className="h-3.5 w-3.5 shrink-0" /> {faltaDe(i).mensaje}
                                                                        </p>
                                                                    )}
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
                                const opciones = unidadesDe(productoDe(l.producto_presentacion_id));

                                return (
                                    <tr key={fila.clave}>
                                        <td className="px-3 py-2">
                                            <span className="font-medium text-warm-900">{l.producto}</span>
                                            {l.color && <span className="ml-1.5 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-warm-700">{l.color}</span>}
                                            {faltaDe(i) && (
                                                <span className="mt-0.5 flex items-center gap-1 text-xs font-medium text-red-600">
                                                    <TriangleAlert className="h-3.5 w-3.5 shrink-0" /> {faltaDe(i).mensaje}
                                                </span>
                                            )}
                                            {(errores[`detalles.${i}.cantidad_enviada`] ?? errores[`detalles.${i}.cantidad`]) && (
                                                <span className="block text-xs text-red-600">{errores[`detalles.${i}.cantidad_enviada`] ?? errores[`detalles.${i}.cantidad`]}</span>
                                            )}
                                        </td>
                                        <td className="px-3 py-2">
                                            {opciones.length === 0 ? (
                                                <span className="text-warm-600">{l.presentacion}</span>
                                            ) : (
                                                <SearchSelect
                                                    value={String(l.producto_presentacion_id)}
                                                    clearable={false}
                                                    emptyText="Sin unidades"
                                                    onChange={(id) => id && cambiar(i, 'producto_presentacion_id', id)}
                                                    options={opciones}
                                                />
                                            )}
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

            <EscanerCamara abierto={camara} onCerrar={() => setCamara(false)} onLeer={verificar} titulo="Escanear rollo para el traslado" />

            {/* Buscador avanzado: el stock que muestra es el del almacén de donde sale la mercadería. */}
            <ProductoPickerModal
                open={picker.open}
                onClose={() => setPicker((prev) => ({ ...prev, open: false }))}
                onSelect={agregarDesdePicker}
                initialQuery={picker.query}
                multiple
                // Una tela se elige por color y en rollos.
                porColor
                productos={productos}
                stockPorProducto={stockPorProducto}
                bloquearSinStock={validarStock}
                sinPrecios
                existencias={existencias}
                title="Buscar productos"
            />
        </>
    );
}
