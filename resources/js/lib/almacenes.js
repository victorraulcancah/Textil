/**
 * Opciones de almacén para formularios de operación (ventas, traslados,
 * ajustes, tomas, préstamos, recepciones).
 *
 * Solo se ofrecen los almacenes activos: desactivar uno debe impedir que siga
 * recibiendo movimientos, no ser solo una etiqueta. El almacén ya elegido se
 * conserva aunque esté inactivo — al abrir un documento antiguo el selector no
 * debe vaciarse en silencio — y se marca para que se note.
 *
 * En los filtros de listados NO se usa esto: ahí deben verse todos, porque el
 * historial de un almacén desactivado se sigue consultando.
 */
export const opcionesAlmacen = (almacenes = [], seleccionadoId = null) =>
    almacenes
        .filter((a) => a.activo !== false || String(a.id) === String(seleccionadoId ?? ''))
        .map((a) => ({
            value: String(a.id),
            label: a.activo === false ? `${a.nombre} (inactivo)` : a.nombre,
        }));
