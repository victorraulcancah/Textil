/**
 * La lista de precios del lado de la venta.
 *
 * Cada presentación trae `precio_venta` —el del tipo principal, desde 1— y
 * `precios`: los de los demás tipos y los precios por cantidad, cada uno con
 * su `desde` (en unidades de la presentación: "Metro desde 100").
 */

/** IGV del Perú: el precio de un producto afecto ya lo incluye. */
export const IGV = 0.18;

/** Cuánto IGV va dentro de un precio que ya lo incluye (S/ 118 → S/ 18). */
export const igvIncluido = (precio) => (Number(precio) || 0) - (Number(precio) || 0) / (1 + IGV);

/** La fila de mayor "desde" que la cantidad ya alcanza. */
const aplicable = (filas, cantidad) =>
    filas
        .filter((f) => Number(f.desde) <= cantidad)
        .sort((a, b) => Number(b.desde) - Number(a.desde))[0] ?? null;

/**
 * El precio de una presentación para un tipo de precio y una cantidad.
 *
 * Con un tipo que no es el principal se busca primero en su lista; si ese
 * tipo no tiene precio para esa presentación (o no desde tan poco), rige el
 * principal: su precio de siempre y sus precios por cantidad.
 */
export function precioPara(presentacion, tipoPrecioId = null, cantidad = 1) {
    if (!presentacion) return 0;

    const cant = Number(cantidad) > 0 ? Number(cantidad) : 1;
    const filas = presentacion.precios ?? [];
    const principal = [
        { desde: 1, precio: Number(presentacion.precio_venta) || 0 },
        ...filas.filter((f) => f.principal),
    ];
    const delTipo = tipoPrecioId
        ? filas.filter((f) => !f.principal && String(f.tipo_precio_id) === String(tipoPrecioId))
        : [];

    const fila = aplicable(delTipo, cant) ?? aplicable(principal, cant) ?? principal[0];
    return Number(fila.precio) || 0;
}
