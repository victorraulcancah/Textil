/**
 * Traduce el modelo mental del comerciante — "compro en sacos de 50 kg y vendo
 * por kilo y por gramo" — a lo que guarda la base de datos: una unidad base en
 * la que se cuenta el stock y un factor de conversión por cada formato de venta.
 *
 * Las unidades traen `factor_base`: cuántas unidades mínimas de su familia
 * valen (g=1, kg=1000, ml=1, l=1000, unidad=1, docena=12). Los envases
 * (saco, caja, bolsa) valen 1 porque su contenido lo define el usuario.
 */

const nUnidad = (u) => Number(u?.factor_base) || 1;

export const buscarUnidad = (unidades, id) =>
    unidades.find((u) => String(u.id) === String(id)) ?? null;

/**
 * "rollo", "metro" o null. Sirve para recordar qué unidad se viene usando en un
 * pedido y proponerla en el siguiente producto que se agregue, sin forzar
 * nada: cada línea la puede cambiar por su cuenta.
 */
export const tipoUnidad = (presentacion) => {
    if (!presentacion) return null;
    if ((presentacion.unidad_base?.abreviatura ?? '').toLowerCase() === 'm') return 'metro';
    if (/rollo/i.test(presentacion.nombre ?? '')) return 'rollo';
    return null;
};

/**
 * Cuánto vale un formato de venta, en unidades canónicas de su familia.
 * El envase de compra es un caso aparte: vale lo que el usuario dijo que trae
 * (un saco no son "1 gramos", son los 50 kg que le cargamos).
 */
export const tamanoVenta = (unidades, unidadId, compra) => {
    const esEnvaseDeCompra =
        compra?.unidad_compra_id && String(unidadId) === String(compra.unidad_compra_id);

    if (esEnvaseDeCompra) {
        const contenido = buscarUnidad(unidades, compra.unidad_contenido_id);
        return (Number(compra.cantidad) || 0) * nUnidad(contenido);
    }

    return nUnidad(buscarUnidad(unidades, unidadId));
};

/**
 * Calcula la estructura interna a partir de la compra y los formatos de venta.
 *
 *   compra = { unidad_compra_id, cantidad, unidad_contenido_id, precio }
 *   ventas = [{ unidad_id, margen, precio_venta }]
 *
 * Devuelve la unidad base (el formato más pequeño que se vende), cuántas
 * unidades base trae una compra, el costo unitario y las filas ya valorizadas.
 *
 * `tasa` convierte la moneda en que se compra a la moneda en que se vende
 * (1 si es la misma; el tipo de cambio si se compra en dólares y se vende en
 * soles; null si son distintas y todavía no hay tipo de cambio). El precio de
 * compra se guarda en la moneda de compra, tal cual; el % de ganancia se aplica
 * sobre el costo ya convertido, para no sumar dólares con soles.
 */
export const calcularPresentaciones = ({ unidades, compra, ventas, tasa = 1 }) => {
    const conTamano = ventas
        .filter((v) => v.unidad_id)
        .map((v) => ({ ...v, tamano: tamanoVenta(unidades, v.unidad_id, compra) }))
        .filter((v) => v.tamano > 0);

    if (conTamano.length === 0) {
        return { baseId: null, factorCompraBase: 0, costoBase: 0, filas: [] };
    }

    // La unidad base es el formato de venta más pequeño: así el stock se puede
    // descontar vendiendo en cualquiera de los formatos sin perder precisión.
    const menor = conTamano.reduce((a, b) => (b.tamano < a.tamano ? b : a));

    const contenido = buscarUnidad(unidades, compra?.unidad_contenido_id);
    const factorCompraBase = ((Number(compra?.cantidad) || 0) * nUnidad(contenido)) / menor.tamano;

    const precioCompra = Number(compra?.precio) || 0;
    const costoBase = factorCompraBase > 0 ? precioCompra / factorCompraBase : 0;

    const filas = conTamano.map((v) => {
        const factor = v.tamano / menor.tamano;
        const compraFila = costoBase * factor;
        // Lo mismo, pero en la moneda en que se vende; null si falta el tipo de cambio.
        const costoEnVenta = tasa == null ? null : compraFila * tasa;
        const margen = v.margen === '' || v.margen == null ? null : Number(v.margen);
        const ventaCalculada =
            margen == null || costoEnVenta == null ? null : costoEnVenta * (1 + margen / 100);

        return {
            unidad_id: v.unidad_id,
            factor,
            precio_compra: compraFila,
            costo_en_venta: costoEnVenta,
            precio_venta: v.precio_venta !== '' && v.precio_venta != null
                ? Number(v.precio_venta)
                : (ventaCalculada ?? 0),
            margen: margen ?? 0,
        };
    });

    return { baseId: menor.unidad_id, factorCompraBase, costoBase, filas };
};

/**
 * Al editar, reconstruye "trae N unidades" en la unidad más grande que quepa
 * exacta, para no mostrar "50000 gramos" cuando el usuario escribió "50 kilos".
 * Se descartan las que darían cantidad 1 (un saco "trae 1 saco" no informa).
 */
export const describirContenido = (unidades, baseId, factorCompraBase) => {
    const total = Number(factorCompraBase) || 0;
    const base = buscarUnidad(unidades, baseId);
    if (total <= 0 || ! base) return { cantidad: '', unidad_contenido_id: baseId ?? '' };

    const canonico = total * nUnidad(base);
    const candidatas = unidades
        .filter((u) => {
            const f = nUnidad(u);
            return f > 0 && canonico % f === 0 && canonico / f > 1;
        })
        .sort((a, b) => nUnidad(b) - nUnidad(a));

    const elegida = candidatas[0] ?? base;

    return {
        cantidad: String(canonico / nUnidad(elegida)),
        unidad_contenido_id: String(elegida.id),
    };
};
