/**
 * Cómo se lee cada movimiento de inventario: de dónde viene (origen) y a qué
 * documento apunta. Los usan el Kardex y los movimientos de un producto.
 */
export const ORIGEN_LABEL = {
    recepcion: 'Recepción',
    recepcion_deshecha: 'Recepción deshecha',
    // Histórico: antes las recepciones se registraban con origen "compra".
    compra: 'Recepción',
    venta: 'Venta',
    nota_venta: 'Venta',
    edicion_nota_venta: 'Venta corregida',
    anulacion_nota_venta: 'Venta anulada',
    despacho_pedido: 'Despacho de pedido',
    anulacion_despacho: 'Despacho anulado',
    ingreso_rollos: 'Ingreso de rollos',
    devolucion: 'Devolución',
    merma: 'Merma',
    transferencia: 'Traslado',
    ajuste_manual: 'Ajuste',
    prestamo: 'Préstamo',
    toma_inventario: 'Toma inventario',
};

export const DOC_LABEL = {
    recepcion_compra: 'Recepción',
    ajuste_inventario: 'Ajuste',
    transferencia: 'Traslado',
    prestamo: 'Préstamo',
    toma_inventario: 'Toma',
    nota_venta: 'Venta',
    orden_venta: 'Pedido',
};
