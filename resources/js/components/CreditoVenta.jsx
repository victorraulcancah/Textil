import { useEffect, useState } from 'react';
import { CalendarClock, Trash2 } from 'lucide-react';
import api from '../lib/api';
import { convertir, money, redondear } from '../lib/moneda';
import { Alert, Input, Spinner } from './ui';

/** "2026-09-29" sin pasar por UTC (a la noche, toISOString ya es mañana). */
const iso = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const sumarDias = (fecha, dias) => {
    const d = new Date(`${fecha}T00:00:00`);
    d.setDate(d.getDate() + dias);
    return iso(d);
};

/**
 * El total repartido en `n` cuotas, una cada `intervalo` días desde la fecha
 * de la venta (a 30 días: 30, 60, 90…). La última se queda con los céntimos.
 */
export function armarCuotas(total, n, fecha, intervalo) {
    const cantidad = Math.max(1, Math.min(60, Number(n) || 1));
    const monto = Number(total) || 0;
    const base = Math.floor((monto / cantidad) * 100) / 100;
    return Array.from({ length: cantidad }, (_, i) => ({
        fecha_vencimiento: sumarDias(fecha, (intervalo || 30) * (i + 1)),
        monto: i === cantidad - 1 ? redondear(monto - base * (cantidad - 1)) : base,
    }));
}

/**
 * La venta a crédito: cómo está la línea del cliente y en qué cuotas se paga.
 * Arranca con una cuota a los días de crédito del cliente; se puede repartir
 * en más y cambiar cada fecha y monto. Mientras no se toquen a mano, siguen
 * al total y a la fecha de la venta.
 */
export default function CreditoVenta({ clienteId, total, moneda, tipoCambio, fecha, cuotas, onCuotas }) {
    const [credito, setCredito] = useState(null);
    const [cargando, setCargando] = useState(false);
    const [manual, setManual] = useState(false);
    const [numero, setNumero] = useState('1');

    useEffect(() => {
        setManual(false);
        setNumero('1');
        setCredito(null);
        if (!clienteId) return;
        setCargando(true);
        api.get(`/clientes/${clienteId}/credito`)
            .then(({ data }) => setCredito(data.resumen))
            .catch(() => setCredito(null))
            .finally(() => setCargando(false));
    }, [clienteId]);

    const dias = Number(credito?.dias_credito) || 0;
    const intervalo = dias > 0 ? dias : 30;

    useEffect(() => {
        if (manual || !fecha) return;
        onCuotas(armarCuotas(total, numero, fecha, intervalo));
    }, [total, fecha, intervalo, numero, manual]); // eslint-disable-line react-hooks/exhaustive-deps

    const cambiarCuota = (i, patch) => {
        setManual(true);
        onCuotas(cuotas.map((c, j) => (j === i ? { ...c, ...patch } : c)));
    };
    const quitarCuota = (i) => {
        setManual(true);
        onCuotas(cuotas.filter((_, j) => j !== i));
    };
    const repartir = () => {
        setManual(false);
        onCuotas(armarCuotas(total, numero, fecha, intervalo));
    };

    if (!clienteId) {
        return <Alert variant="warning">Una venta al crédito necesita un cliente identificado.</Alert>;
    }
    if (cargando) {
        return (
            <div className="flex justify-center py-4">
                <Spinner className="text-primary-600" />
            </div>
        );
    }

    const monedaLinea = credito?.moneda ?? moneda;
    const importe = convertir(total, moneda, monedaLinea, tipoCambio || credito?.tipo_cambio);
    const disponible = Number(credito?.disponible) || 0;
    const excede = credito && !credito.impedimento && importe > disponible + 0.005;
    const suma = redondear(cuotas.reduce((acc, c) => acc + (Number(c.monto) || 0), 0));
    const descuadre = Math.abs(suma - redondear(total)) > 0.01 * Math.max(cuotas.length, 1);

    return (
        <div className="space-y-3">
            {credito && (
                <div className="grid grid-cols-3 gap-2 rounded-lg bg-gray-50 p-2.5 text-center">
                    <div>
                        <p className="text-[10px] uppercase tracking-wide text-warm-500">Línea</p>
                        <p className="text-xs font-semibold text-warm-900">{money(credito.limite_total, monedaLinea)}</p>
                    </div>
                    <div>
                        <p className="text-[10px] uppercase tracking-wide text-warm-500">Deuda</p>
                        <p className="text-xs font-semibold text-red-600">{money(credito.deuda, monedaLinea)}</p>
                    </div>
                    <div>
                        <p className="text-[10px] uppercase tracking-wide text-warm-500">Disponible</p>
                        <p className={`text-xs font-semibold ${disponible < 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {money(disponible, monedaLinea)}
                        </p>
                    </div>
                </div>
            )}
            {credito?.impedimento && <Alert variant="warning">{credito.impedimento}</Alert>}
            {excede && (
                <Alert variant="warning">
                    El cliente excede su línea de crédito. Disponible: {money(Math.max(disponible, 0), monedaLinea)}.
                    Importe de la venta: {money(importe, monedaLinea)}.
                </Alert>
            )}

            <div className="flex items-end gap-2">
                <div className="w-24">
                    <Input
                        label="Cuotas"
                        type="number"
                        min="1"
                        max="60"
                        value={numero}
                        onChange={(e) => {
                            setNumero(e.target.value);
                            setManual(false);
                        }}
                    />
                </div>
                <p className="pb-2 text-xs text-warm-500">
                    {dias > 0 ? `Cada ${dias} días (sus días de crédito).` : 'Cada 30 días.'}
                </p>
                {manual && (
                    <button type="button" onClick={repartir} className="ml-auto pb-2 text-xs font-semibold text-primary-700 hover:underline">
                        Repartir de nuevo
                    </button>
                )}
            </div>

            <div className="divide-y divide-gray-100 rounded-lg border border-edge">
                {cuotas.map((c, i) => (
                    <div key={i} className="flex items-center gap-2 px-2 py-1.5">
                        <span className="inline-flex w-10 shrink-0 items-center gap-1 text-xs font-semibold text-warm-500">
                            <CalendarClock className="h-3.5 w-3.5" /> {i + 1}
                        </span>
                        <Input
                            type="date"
                            value={c.fecha_vencimiento}
                            min={fecha}
                            onChange={(e) => cambiarCuota(i, { fecha_vencimiento: e.target.value })}
                            aria-label={`Vencimiento de la cuota ${i + 1}`}
                        />
                        <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={c.monto}
                            onChange={(e) => cambiarCuota(i, { monto: e.target.value })}
                            className="text-right"
                            aria-label={`Monto de la cuota ${i + 1}`}
                        />
                        <button
                            type="button"
                            onClick={() => quitarCuota(i)}
                            disabled={cuotas.length === 1}
                            className="rounded-md p-1.5 text-red-600 transition hover:bg-red-50 disabled:opacity-30"
                            aria-label="Quitar cuota"
                        >
                            <Trash2 className="h-4 w-4" />
                        </button>
                    </div>
                ))}
            </div>
            <p className={`text-xs ${descuadre ? 'font-semibold text-red-600' : 'text-warm-500'}`}>
                Suman {money(suma, moneda)} de {money(total, moneda)}
                {descuadre && ': deben sumar el total de la venta.'}
            </p>
        </div>
    );
}
