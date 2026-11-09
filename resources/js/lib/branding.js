import { useEffect, useSyncExternalStore } from 'react';
import api from './api';

/**
 * La marca de la empresa en uso (logo, favicon y nombre): la usan el menú lateral y el login. Vive aquí, fuera de React, para
 * que al poner otra empresa en uso (pantalla Empresa) todos los que la muestran cambien al instante, sin recargar la página.
 */

let marca = null;
let pendiente = null;
const oyentes = new Set();

const suscribir = (f) => {
    oyentes.add(f);

    return () => oyentes.delete(f);
};

/** Aplica la marca a la pestaña del navegador: el icono y el título. */
function aplicarAlNavegador(datos) {
    try {
        const icono = document.querySelector('link[rel~="icon"]');
        if (icono && datos.favicon_url) icono.setAttribute('href', datos.favicon_url);
        if (datos.nombre_comercial) document.title = datos.nombre_comercial;
    } catch {
        /* sin documento (pruebas) */
    }
}

/** Vuelve a pedir la marca al servidor (tras cambiar de empresa en uso, de logo o de nombre). */
export function refrescarBranding() {
    pendiente = api
        .get('/branding')
        .then((res) => {
            marca = res.data;
            aplicarAlNavegador(marca);
            oyentes.forEach((f) => f());
        })
        .catch(() => {})
        .finally(() => {
            pendiente = null;
        });

    return pendiente;
}

/** La marca de la empresa en uso (null mientras carga). */
export function useBranding() {
    const actual = useSyncExternalStore(suscribir, () => marca);

    useEffect(() => {
        if (marca === null && pendiente === null) refrescarBranding();
    }, []);

    return actual;
}
