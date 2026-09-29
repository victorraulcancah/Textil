import { useEffect, useState } from 'react';
import api from './api';

/** Monedas en que se vende. */
export const MONEDAS = [
    { value: 'PEN', label: 'Soles (S/)' },
    { value: 'USD', label: 'Dólares (US$)' },
];

export const NOMBRE_MONEDA = { PEN: 'Soles', USD: 'Dólares' };

/** "S/ 1,250.00" o "US$ 1,250.00". */
export const money = (n, moneda = 'PEN') =>
    new Intl.NumberFormat('es-PE', { style: 'currency', currency: moneda || 'PEN' }).format(Number(n) || 0);

export const redondear = (n, decimales = 2) => {
    const f = 10 ** decimales;
    return Math.round((Number(n) || 0) * f) / f;
};

/**
 * Un monto de una moneda en otra con el tipo de cambio (soles por dólar).
 * Si es la misma moneda, o no hay tipo de cambio, queda igual.
 */
export function convertir(monto, de, a, tipoCambio) {
    const valor = Number(monto) || 0;
    const tc = Number(tipoCambio) || 0;
    if (!de || !a || de === a || tc <= 0) return valor;
    return redondear(a === 'PEN' ? valor * tc : valor / tc);
}

/**
 * El tipo de cambio que vale para una fecha (hoy si no se dice):
 * { venta, compra, fecha_venta, comercial, fecha_comercial }. El de SUNAT
 * (venta) es el del documento; el comercial, el que se propone para cobrar
 * en soles lo que es en dólares.
 */
export async function cargarTipoCambio(fecha) {
    const { data } = await api.get('/tipo-cambio', { params: fecha ? { fecha } : {} });
    return data;
}

/** El tipo de cambio de una fecha; null mientras carga o si no hay. */
export function useTipoCambio(fecha) {
    const [tipoCambio, setTipoCambio] = useState(null);

    useEffect(() => {
        let vigente = true;
        cargarTipoCambio(fecha)
            .then((data) => vigente && setTipoCambio(data))
            .catch(() => vigente && setTipoCambio(null));
        return () => {
            vigente = false;
        };
    }, [fecha]);

    return tipoCambio;
}
