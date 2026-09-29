import api from './api';

/**
 * Distritos del Perú con su ubigeo (código INEI, el que usa SUNAT). Se piden
 * una sola vez por sesión; llegan como [ubigeo, departamento, provincia, distrito].
 */
let pedido = null;

export function cargarUbigeos() {
    pedido ??= api
        .get('/ubigeos')
        .then(({ data }) =>
            data.map(([ubigeo, departamento, provincia, distrito]) => ({ ubigeo, departamento, provincia, distrito })),
        )
        .catch((err) => {
            pedido = null; // que se pueda volver a intentar
            throw err;
        });

    return pedido;
}

/** Mayúsculas y sin tildes, para comparar nombres ("Áncash" = "ANCASH"). */
export const normalizar = (texto) =>
    String(texto ?? '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .trim()
        .toUpperCase();

/** Sin país o Perú: el lugar se elige del catálogo y lleva ubigeo. */
export const esPeru = (pais) => ['', 'PERU'].includes(normalizar(pais));

const unicos = (valores) => [...new Set(valores)].sort((a, b) => a.localeCompare(b, 'es'));

export const departamentos = (lista) => unicos(lista.map((u) => u.departamento));

export const provincias = (lista, departamento) =>
    unicos(lista.filter((u) => u.departamento === departamento).map((u) => u.provincia));

export const distritos = (lista, departamento, provincia) =>
    lista
        .filter((u) => u.departamento === departamento && u.provincia === provincia)
        .sort((a, b) => a.distrito.localeCompare(b.distrito, 'es'));

export const porCodigo = (lista, codigo) => lista.find((u) => u.ubigeo === String(codigo ?? '').trim()) ?? null;

/** Por nombres, como los devuelve SUNAT, sin importar tildes ni mayúsculas. */
export function porNombres(lista, departamento, provincia, distrito) {
    const [dep, prov, dist] = [departamento, provincia, distrito].map(normalizar);

    return (
        lista.find(
            (u) =>
                normalizar(u.departamento) === dep &&
                normalizar(u.provincia) === prov &&
                normalizar(u.distrito) === dist,
        ) ?? null
    );
}

/**
 * SUNAT pega el lugar al final de la dirección ("AV. X 123 LIMA LIMA LIMA");
 * aquí va en sus propios campos, así que se le quita.
 */
export function quitarLugar(direccion, { departamento, provincia, distrito } = {}) {
    const texto = String(direccion ?? '').trim();
    if (texto === '-') return '';

    const partes = [departamento, provincia, distrito].map((p) => String(p ?? '').trim());
    if (partes.some((p) => !p)) return texto;

    const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const cola = new RegExp(`[\\s-]+${partes.map(escapar).join('[\\s-]+')}\\s*$`, 'i');

    return texto.replace(cola, '').trim() || texto;
}
