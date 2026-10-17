import { useEffect, useState } from 'react';
import api, { asList } from '../lib/api';
import { diaLocal } from '../lib/fechas';
import { Input } from './ui';

const money = (n, moneda = 'PEN') =>
    new Intl.NumberFormat('es-PE', { style: 'currency', currency: moneda || 'PEN' }).format(Number(n) || 0);

const redondear = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Los anticipos del cliente que se pueden usar para pagar una venta: de cualquier almacén, de la misma moneda y con
 * saldo. Se pueden elegir varios, y de cada uno se usa todo el saldo o solo una parte.
 *
 *   value:    [{ id, monto }]  los elegidos y cuánto se usa de cada uno
 *   total:    lo que cuesta la venta: entre todos no pueden pasarlo
 *   devuelto: { [anticipoId]: monto } lo que esta misma venta ya tenía aplicado (al editarla vuelve a estar disponible)
 *
 * No muestra nada si el cliente no tiene anticipos.
 */
export default function AnticiposAplicar({ clienteId, moneda = 'PEN', value = [], onChange, total = 0, devuelto = {} }) {
    const [lista, setLista] = useState([]);

    useEffect(() => {
        if (!clienteId) {
            setLista([]);
            return undefined;
        }
        let vigente = true;
        const incluir = Object.keys(devuelto).join(',');
        api.get('/anticipos', { params: { cliente_id: clienteId, con_saldo: 1, moneda, ...(incluir ? { incluir } : {}) } })
            .then((res) => vigente && setLista(asList(res)))
            .catch(() => vigente && setLista([]));
        return () => {
            vigente = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [clienteId, moneda, Object.keys(devuelto).join(',')]);

    // Lo disponible de cada uno: su saldo, más lo que esta misma venta ya usaba de él.
    const disponible = (a) => redondear((Number(a.saldo) || 0) + (Number(devuelto[a.id]) || 0));
    const usadoPorOtros = (id) => value.filter((v) => v.id !== id).reduce((acc, v) => acc + (Number(v.monto) || 0), 0);
    const montoDe = (id) => value.find((v) => v.id === id)?.monto ?? '';

    const alternar = (a) => {
        if (value.some((v) => v.id === a.id)) {
            onChange(value.filter((v) => v.id !== a.id));
            return;
        }
        const falta = Math.max(0, redondear(total - usadoPorOtros(a.id)));
        onChange([...value, { id: a.id, monto: String(Math.min(disponible(a), falta)) }]);
    };

    const cambiarMonto = (a, texto) => {
        // Entre lo que tiene el anticipo y lo que falta de la venta.
        const tope = Math.max(0, Math.min(disponible(a), redondear(total - usadoPorOtros(a.id))));
        const n = Number(texto);
        const monto = texto === '' ? '' : String(Math.min(Math.max(n, 0), tope));
        onChange(value.map((v) => (v.id === a.id ? { ...v, monto } : v)));
    };

    // Los de esta venta que ya no figuran en la lista (se aplicaron del todo) siguen disponibles al editarla.
    const filas = lista.filter((a) => disponible(a) > 0);
    if (filas.length === 0) return null;

    const aplicado = value.reduce((acc, v) => acc + (Number(v.monto) || 0), 0);

    return (
        <div className="rounded-lg border border-edge p-3">
            <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-semibold text-warm-900">Anticipos del cliente</span>
                {aplicado > 0 && <span className="text-xs font-semibold text-green-700">Aplicas {money(aplicado, moneda)}</span>}
            </div>
            <div className="space-y-2">
                {filas.map((a) => {
                    const elegido = value.some((v) => v.id === a.id);
                    return (
                        <label
                            key={a.id}
                            className={`flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-2 rounded-md border px-3 py-2.5 transition ${
                                elegido ? 'border-primary-300 bg-primary-50' : 'border-edge hover:bg-gray-50'
                            }`}
                        >
                            <input
                                type="checkbox"
                                checked={elegido}
                                onChange={() => alternar(a)}
                                className="h-4 w-4 shrink-0 rounded border-gray-300 text-primary-600 focus:ring-primary-600"
                                aria-label={`Usar el anticipo ${a.documento}`}
                            />
                            <div className="min-w-[11rem] flex-1">
                                <p className="whitespace-nowrap text-sm font-semibold text-warm-900">
                                    {a.documento}
                                    <span className="ml-2 text-xs font-normal text-warm-500">{a.almacen?.nombre ?? '—'}</span>
                                </p>
                                <p className="text-xs text-warm-500">
                                    {new Date(`${diaLocal(a.fecha)}T00:00:00`).toLocaleDateString('es-PE')} · disponible{' '}
                                    <strong className="text-warm-800">{money(disponible(a), moneda)}</strong>
                                    {disponible(a) < Number(a.monto) - 0.001 && <span> de {money(a.monto, moneda)}</span>}
                                </p>
                            </div>
                            {elegido && (
                                <div className="w-32 shrink-0" onClick={(e) => e.preventDefault()}>
                                    <Input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={montoDe(a.id)}
                                        onChange={(e) => cambiarMonto(a, e.target.value)}
                                        className="text-right"
                                        aria-label={`Monto a usar del anticipo ${a.documento}`}
                                    />
                                </div>
                            )}
                        </label>
                    );
                })}
            </div>
        </div>
    );
}
