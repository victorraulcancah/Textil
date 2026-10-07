/** Lo que comparten las vistas del kardex: formatos de números y fechas, y la unión de movimientos por documento. */

/** Fecha y hora en dos líneas: cabe en una columna estrecha sin desbordarse. */
export const fmtFecha = (value) => {
    if (!value) return null;
    const d = new Date(value);
    return {
        dia: d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' }),
        hora: d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }),
    };
};

// Sin el "-0.00" que deja un redondeo.
export const num = (n) =>
    (Math.abs(Number(n ?? 0)) < 0.005 ? 0 : Number(n)).toLocaleString('es-PE', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });

/** Precios y costos unitarios: hasta 4 decimales, que es como se pagan (S/ 1.2500 el metro). */
export const precio = (n) => Number(n ?? 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 4 });

export const entero = (n) => Number(n ?? 0).toLocaleString('es-PE');

export const vacio = <span className="text-gray-300">—</span>;

/** Una celda de texto que se corta con "…" y muestra el texto entero al pasar el cursor. */
export const texto = (valor, ancho) =>
    valor ? (
        <span className="block truncate" style={ancho ? { maxWidth: ancho } : undefined} title={valor}>
            {valor}
        </span>
    ) : (
        vacio
    );

export const esEntrada = (row) => row.tipo_movimiento === 'entrada';
export const cantAbs = (row) => Math.abs(Number(row.cantidad ?? 0));

/** La clave de un color en las direcciones: su id, o "sin" para lo que no tiene color. */
export const claveColor = (id) => String(id ?? 'sin');

/** El nombre con el que el kardex presenta cada clase de documento (la columna Glosa). */
export const NOMBRE_DOCUMENTO = {
    recepcion_compra: 'Recepción',
    ajuste_inventario: 'Ajuste',
    transferencia: 'Traslado',
    prestamo: 'Préstamo',
    toma_inventario: 'Toma de inventario',
    nota_venta: 'Proforma',
    orden_venta: 'Venta',
};

/** "S/" o "US$" para la moneda de un documento. */
export const simboloMoneda = (moneda) => (moneda === 'USD' ? 'US$' : 'S/');

/**
 * Un documento puede mover varios colores (una recepción trae un movimiento por color): en el kardex de un color
 * es una sola fila, con lo que entró o salió en total y el stock con que quedó al final.
 */
export const juntarPorDocumento = (movs) => {
    const grupos = new Map();
    movs.forEach((m) => {
        const clave = m.documento_referencia_id
            ? [m.documento_referencia_tipo, m.documento_referencia_id, m.almacen_id, m.tipo_movimiento].join(':')
            : `solo:${m.id}`;
        if (!grupos.has(clave)) grupos.set(clave, []);
        grupos.get(clave).push(m);
    });

    return [...grupos.values()].map((grupo) => {
        // El último movimiento del documento deja el stock y el costo promedio con que quedó.
        const ultimo = grupo.reduce((a, b) => (b.id > a.id ? b : a));
        if (grupo.length === 1) return ultimo;

        const total = grupo.reduce((s, m) => s + Math.abs(Number(m.cantidad) || 0), 0);
        const costo = grupo.reduce((s, m) => s + Math.abs(Number(m.cantidad) || 0) * (Number(m.costo_unitario) || 0), 0);
        const signo = Number(ultimo.cantidad) < 0 ? -1 : 1;

        return {
            ...ultimo,
            cantidad: signo * total,
            costo_unitario: total > 0 ? costo / total : ultimo.costo_unitario,
        };
    });
};
