/**
 * El almacén en el que trabaja el Super Admin en esta sesión. Tiene acceso a todos, pero al entrar elige uno y
 * mientras tanto se comporta como un usuario de esa sucursal (ventas, series, cajas, reportes). Cada petición lo
 * manda en el encabezado X-Almacen-Id; el servidor solo lo respeta si el usuario es Super Admin.
 */
const CLAVE = 'almacen_activo';

/** { id, nombre } o null. */
export const leerAlmacenActivo = () => {
    try {
        const v = JSON.parse(localStorage.getItem(CLAVE));
        return v?.id ? v : null;
    } catch {
        return null;
    }
};

export const guardarAlmacenActivo = (almacen) => {
    try {
        localStorage.setItem(CLAVE, JSON.stringify({ id: almacen.id, nombre: almacen.nombre }));
    } catch {
        /* ignorar */
    }
};

export const olvidarAlmacenActivo = () => {
    try {
        localStorage.removeItem(CLAVE);
    } catch {
        /* ignorar */
    }
};
