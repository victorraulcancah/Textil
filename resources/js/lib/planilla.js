/**
 * La planilla de telas: el formato de las hojas de Excel del cliente, para el
 * pedido y la proforma.
 *
 *   01-01 TELA: POLINAN CE
 *   ITEM · COLOR · ROLLO · FACTOR · METROS · PRECIO UNITARIO · PRECIO TOTAL
 *   …una fila por rollo…
 *   SUB TOTAL (rollos · metros · total)
 *
 * Cada constructor devuelve grupos ya calculados para <PlanillaTela />:
 *
 *   { clave, titulo, filas: [{ clave, item, color, hex, rollo, factor, metros, precio, total, detalle }],
 *     rollos, metros, total }
 *
 * En una fila, factor / metros / total son números, o null si no aplica, o
 * 'Por definir' si el almacén todavía no separó el rollo.
 */

const PENDIENTE = 'Por definir';

const esNumero = (v) => typeof v === 'number' && Number.isFinite(v);

const redondear = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** "01-01-001": el código de la tela y, si lo hay, el de su color. */
const codigoItem = (productoCodigo, colorCodigo) => [productoCodigo, colorCodigo].filter(Boolean).join('-') || '—';

const tituloDe = (esTela, codigo, nombre) => `${codigo ?? ''} ${esTela ? 'TELA' : 'PRODUCTO'}: ${nombre ?? '—'}`.trim();

/** Junta las filas por producto y suma rollos, metros y total de cada grupo. */
function agrupar(lineas) {
    const grupos = new Map();

    lineas.forEach((l, i) => {
        if (!grupos.has(l.grupo)) {
            grupos.set(l.grupo, { clave: l.grupo, titulo: l.titulo, filas: [], rollos: 0, metros: 0, total: 0 });
        }
        const g = grupos.get(l.grupo);
        g.filas.push({ clave: `${l.grupo}-${i}`, ...l.fila });
        g.rollos += l.rollos ?? 0;
        if (esNumero(l.fila.metros)) g.metros += l.fila.metros;
        if (esNumero(l.fila.total)) g.total += l.fila.total;
    });

    return [...grupos.values()].map((g) => ({ ...g, metros: redondear(g.metros), total: redondear(g.total) }));
}

/** Lo de todos los grupos juntos: la fila TOTAL del final. */
export const totalesDe = (grupos) => ({
    rollos: grupos.reduce((s, g) => s + g.rollos, 0),
    metros: redondear(grupos.reduce((s, g) => s + g.metros, 0)),
    total: redondear(grupos.reduce((s, g) => s + g.total, 0)),
});

/** Una proforma: cada línea ya es un rollo (o un corte, o algo que no es tela). */
export function gruposDeProforma(detalles = []) {
    return agrupar(
        detalles.map((d) => {
            const f = d.proforma ?? {};
            const esTela = d.rollo_id != null || f.u === 'R' || f.u === '';
            const entero = f.u === 'R';

            return {
                grupo: String(d.producto_id ?? d.producto_nombre ?? 'sin'),
                titulo: tituloDe(esTela, d.producto_codigo, d.producto_nombre),
                rollos: entero ? 1 : 0,
                fila: {
                    item: codigoItem(d.producto_codigo, d.rollo?.color_codigo),
                    color: f.color || '',
                    // Rollo entero "1R"; un corte, "Corte"; lo que no es tela, su unidad.
                    rollo: esTela ? (entero ? '1R' : 'Corte') : f.u,
                    factor: esTela ? (d.metros_rollo != null ? Number(d.metros_rollo) : null) : null,
                    metros: Number(f.cantidad ?? d.cantidad) || 0,
                    precio: Number(f.precio ?? d.precio_unitario) || 0,
                    total: Number(d.subtotal) || 0,
                    detalle: d.rollo?.codigo ?? null,
                },
            };
        }),
    );
}

/**
 * Un pedido: los rollos que el almacén ya asignó van uno por fila, con su
 * metraje real; lo que falta por separar sale como "N R" por definir.
 */
export function gruposDePedido(detalles = []) {
    const lineas = [];

    detalles.forEach((d) => {
        const esTela = d.modo === 'rollos' || Boolean(d.color);
        const grupo = String(d.producto_codigo ?? d.producto);
        const titulo = tituloDe(esTela, d.producto_codigo, d.producto);
        const precio = d.precio_oculto ? null : Number(d.precio_unitario) || 0;
        const color = d.color?.nombre ?? '';
        const hex = d.color?.hex ?? null;
        const itemDeLinea = codigoItem(d.producto_codigo, d.color?.codigo);
        const importe = (metros) => (precio == null ? null : redondear(metros * precio));

        if (d.modo !== 'rollos') {
            // Por metros (o una unidad): una sola fila.
            lineas.push({
                grupo,
                titulo,
                rollos: 0,
                fila: {
                    item: itemDeLinea,
                    color,
                    hex,
                    rollo: esTela ? '' : (d.presentacion ?? ''),
                    factor: null,
                    metros: esTela ? Number(d.metros) || 0 : Number(d.cantidad) || 0,
                    precio,
                    total: precio == null ? null : Number(d.subtotal) || 0,
                    detalle: null,
                },
            });
            return;
        }

        const asignados = d.rollos ?? [];

        if (asignados.length) {
            asignados.forEach((r) => {
                lineas.push({
                    grupo,
                    titulo,
                    rollos: r.es_parcial ? 0 : 1,
                    fila: {
                        item: codigoItem(d.producto_codigo, r.color_codigo ?? d.color?.codigo),
                        color: r.color ?? color,
                        hex: r.color_hex ?? hex,
                        rollo: r.es_parcial ? 'Corte' : '1R',
                        factor: Number(r.metros_rollo) || Number(r.metros) || null,
                        metros: Number(r.metros) || 0,
                        precio,
                        total: importe(Number(r.metros) || 0),
                        detalle:
                            [
                                r.codigo,
                                r.es_parcial && Number(r.metros_rollo) > Number(r.metros)
                                    ? `quedan ${redondear(Number(r.metros_rollo) - Number(r.metros))} m`
                                    : null,
                                r.escaneado_por,
                            ]
                                .filter(Boolean)
                                .join(' · ') || null,
                        // Para el despacho: este rollo ya está juntado y se puede quitar.
                        hecho: true,
                        rolloId: r.rollo_id,
                    },
                });
            });
        } else if (Number(d.rollos_asignados) > 0) {
            // Sin acceso a los rollos (solo ventas): se ve cuánto lleva cubierto, no con cuáles.
            lineas.push({
                grupo,
                titulo,
                rollos: Number(d.rollos_asignados),
                fila: {
                    item: itemDeLinea,
                    color,
                    hex,
                    rollo: `${d.rollos_asignados}R`,
                    factor: null,
                    metros: Number(d.metros_asignados) || 0,
                    precio,
                    total: importe(Number(d.metros_asignados) || 0),
                    detalle: null,
                },
            });
        }

        // Lo que todavía no tiene rollo.
        const faltan = Number(d.rollos_pendientes) || 0;
        if (faltan > 0 || (!asignados.length && !(Number(d.rollos_asignados) > 0))) {
            const cuantos = faltan > 0 ? faltan : Number(d.rollos_pedidos) || 0;
            lineas.push({
                grupo,
                titulo,
                rollos: cuantos,
                fila: {
                    item: itemDeLinea,
                    color,
                    hex,
                    rollo: `${cuantos}R`,
                    factor: PENDIENTE,
                    metros: PENDIENTE,
                    precio,
                    total: PENDIENTE,
                    detalle: null,
                },
            });
        }
    });

    return agrupar(lineas);
}
