import { useAuth } from './auth';
import { leerAlmacenActivo } from './almacenActivo';

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
export const opcionesAlmacen = (almacenes = [], seleccionadoId = null, propioId = null) =>
    almacenes
        // Un usuario de sucursal solo opera en la suya (propioId); el Super Admin elige entre todos.
        .filter((a) => !propioId || String(a.id) === String(propioId))
        .filter((a) => a.activo !== false || String(a.id) === String(seleccionadoId ?? ''))
        .map((a) => ({
            value: String(a.id),
            label: a.activo === false ? `${a.nombre} (inactivo)` : a.nombre,
        }));

/**
 * El almacén (sucursal) donde trabaja el usuario: ahí vende, hace ajustes y préstamos. Los demás los puede ver,
 * no operar. El Super Admin no tiene uno: opera en todos (propioId = null).
 */
export function useAlmacenPropio() {
    const { user } = useAuth();
    const esSuperAdmin = (user?.roles ?? []).some((r) => (r?.name ?? r) === 'super-admin');
    // El Super Admin elige un almacén al entrar y trabaja como esa sucursal: para las pantallas es un usuario más.
    const activo = esSuperAdmin ? leerAlmacenActivo() : null;
    const superAdmin = esSuperAdmin && !activo;

    return {
        superAdmin,
        esSuperAdmin,
        propioId: esSuperAdmin ? (activo?.id ?? null) : (user?.almacen_id ?? null),
        /** Nombre del almacén en el que trabaja (el asignado, o el que eligió el Super Admin). */
        almacenNombre: esSuperAdmin ? (activo?.nombre ?? null) : (user?.almacen?.nombre ?? null),
    };
}
