import { useSyncExternalStore } from 'react';
import { navigation } from '../config/navigation';

/**
 * Las pestañas de submódulos: con clic derecho en una opción del menú se abre en una pestaña nueva, como en un navegador.
 *
 * Cada pestaña guarda la dirección en la que está (`path`, con su ?consulta) y la opción del menú a la que pertenece
 * (`base`): de ahí salen su título, su icono y su color. Cada página dibuja su propio Layout, así que el estado vive aquí,
 * fuera de React, y se guarda en la sesión del navegador para sobrevivir a una recarga.
 */

const CLAVE = 'pestanas_abiertas';

/** Las opciones del menú con la ruta a la que llevan y a qué grupo pertenecen (para el color). */
const opciones = navigation.flatMap((item, g) =>
    item.children
        ? item.children.map((c) => ({ ...c, grupo: g, grupoLabel: item.label }))
        : [{ ...item, grupo: g, grupoLabel: item.label }],
);

/** La opción del menú a la que pertenece una dirección: la de ruta más larga que la contenga. */
export function opcionDeRuta(ruta) {
    const path = String(ruta ?? '').split('?')[0];
    let mejor = null;

    opciones.forEach((o) => {
        if (path === o.to || path.startsWith(`${o.to}/`)) {
            if (!mejor || o.to.length > mejor.to.length) mejor = o;
        }
    });

    return mejor;
}

/** La opción del menú con esa ruta exacta (para pintar el título y el icono de una pestaña). */
export const opcionPorBase = (base) => opciones.find((o) => o.to === base) ?? null;

const baseDe = (ruta) => opcionDeRuta(ruta)?.to ?? null;

const nuevoId = () => `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function leer() {
    try {
        const guardado = JSON.parse(sessionStorage.getItem(CLAVE));
        if (guardado && Array.isArray(guardado.tabs)) return guardado;
    } catch {
        /* sin sesión del navegador o dato corrupto */
    }

    return { tabs: [], activa: null };
}

let estado = leer();
const oyentes = new Set();

function cambiar(siguiente) {
    estado = siguiente;
    try {
        sessionStorage.setItem(CLAVE, JSON.stringify(estado));
    } catch {
        /* ignorar */
    }
    oyentes.forEach((f) => f());
}

const suscribir = (f) => {
    oyentes.add(f);

    return () => oyentes.delete(f);
};

/** Las pestañas abiertas y cuál está activa: { tabs: [{ id, path, base }], activa }. */
export const usePestanas = () => useSyncExternalStore(suscribir, () => estado);

/**
 * Abre una pestaña nueva en `destino` y la deja activa. Si todavía no había pestañas, la página en la que se estaba pasa
 * a ser la primera, para poder volver a ella.
 */
export function abrirPestana(destino, rutaActual) {
    const tabs = estado.tabs.length
        ? estado.tabs
        : [{ id: nuevoId(), path: rutaActual, base: baseDe(rutaActual) }];
    const nueva = { id: nuevoId(), path: destino, base: baseDe(destino) };

    cambiar({ tabs: [...tabs, nueva], activa: nueva.id });
}

/** Activa una pestaña y devuelve la dirección a la que hay que ir. */
export function activarPestana(id) {
    const tab = estado.tabs.find((t) => t.id === id);
    if (!tab) return null;

    cambiar({ ...estado, activa: id });

    return tab.path;
}

/**
 * Cierra una pestaña. Devuelve la dirección a la que hay que ir si era la activa (la de al lado), o null si no hay que
 * moverse. Al cerrar la última, la barra desaparece y la página queda como está.
 */
export function cerrarPestana(id) {
    const i = estado.tabs.findIndex((t) => t.id === id);
    if (i < 0) return null;

    const tabs = estado.tabs.filter((t) => t.id !== id);
    if (estado.activa !== id) {
        cambiar({ ...estado, tabs });

        return null;
    }

    const vecina = tabs[Math.min(i, tabs.length - 1)] ?? null;
    cambiar({ tabs, activa: vecina?.id ?? null });

    return vecina?.path ?? null;
}

/**
 * La pestaña activa sigue a la página: si se navega dentro de ella (otra opción del menú, bajar a los colores de una
 * tela…), cambia su dirección y, si es otra opción del menú, su título e icono.
 */
export function registrarRuta(ruta) {
    const tab = estado.tabs.find((t) => t.id === estado.activa);
    if (!tab || tab.path === ruta) return;

    const base = baseDe(ruta) ?? tab.base;
    cambiar({
        ...estado,
        tabs: estado.tabs.map((t) => (t.id === tab.id ? { ...t, path: ruta, base } : t)),
    });
}
