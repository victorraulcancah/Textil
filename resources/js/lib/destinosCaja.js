import { useCallback, useEffect, useState } from 'react';
import api, { asList } from './api';

/** A dónde fue el dinero de un movimiento: 'efectivo' (el cajón), 'c<id>' (cuenta bancaria) o 'b<id>' (billetera digital). */
export const destinoDe = (m) => (m.cuenta_bancaria ? `c${m.cuenta_bancaria.id}` : m.billetera ? `b${m.billetera.id}` : 'efectivo');

const etiquetaCuenta = (c) => `Cuenta · ${c.alias || c.numero_cuenta}`;
const etiquetaBilletera = (b) => `Billetera · ${b.nombre}`;

/**
 * Opciones del filtro "Cuenta / billetera" de los movimientos de caja. Salen del catálogo de la sucursal (no solo de lo
 * que se movió), más lo que aparezca en los movimientos aunque ya esté inactivo. Según el tipo de movimiento elegido:
 * efectivo → solo "Efectivo"; pagos digitales → solo cuentas y billeteras; todos → las tres cosas.
 */
export function useCatalogoDestinos() {
    const [cuentas, setCuentas] = useState([]);
    const [billeteras, setBilleteras] = useState([]);

    useEffect(() => {
        api.get('/cuentas-bancarias').then((r) => setCuentas(asList(r))).catch(() => {});
        api.get('/billeteras-digitales').then((r) => setBilleteras(asList(r))).catch(() => {});
    }, []);

    return useCallback(
        (tipoMov, movimientos = []) => {
            const digitales = new Map();
            cuentas.filter((c) => c.activo !== false && c.activo !== 0).forEach((c) => digitales.set(`c${c.id}`, etiquetaCuenta(c)));
            billeteras.filter((b) => b.activo !== false && b.activo !== 0).forEach((b) => digitales.set(`b${b.id}`, etiquetaBilletera(b)));
            movimientos.forEach((m) => {
                if (m.cuenta_bancaria && !digitales.has(destinoDe(m))) digitales.set(destinoDe(m), etiquetaCuenta(m.cuenta_bancaria));
                if (m.billetera && !digitales.has(destinoDe(m))) digitales.set(destinoDe(m), etiquetaBilletera(m.billetera));
            });

            const lista = [];
            if (tipoMov !== 'digital') lista.push({ value: 'efectivo', label: 'Efectivo' });
            if (tipoMov !== 'efectivo') {
                [...digitales.entries()]
                    .map(([value, label]) => ({ value, label }))
                    .sort((a, b) => a.label.localeCompare(b.label, 'es'))
                    .forEach((o) => lista.push(o));
            }
            return lista;
        },
        [cuentas, billeteras],
    );
}
