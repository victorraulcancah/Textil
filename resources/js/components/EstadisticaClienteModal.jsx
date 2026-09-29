import { useEffect, useState } from 'react';
import { BarChart3, Table2 } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import api from '../lib/api';
import { money } from '../lib/moneda';
import { useToast } from '../lib/toast';
import { colors, tooltipStyle } from '../theme/colors';
import { Alert, Modal, Spinner } from './ui';

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic'];
const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre'];

/** "2026-09" → "set 26" (eje) o "setiembre 2026" (tooltip y tabla). */
const mesCorto = (m) => `${MESES[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`;
const mesLargo = (m) => `${MESES_LARGOS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;

/** 3400 → "3.4k" en el eje, para que no se amontone. */
const compacto = (v) => (v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : String(v));

const fecha = (v) => (v ? new Date(`${String(v).slice(0, 10)}T00:00:00`).toLocaleDateString('es-PE') : '—');
const hace = (v) => {
    if (!v) return null;
    const dias = Math.round((Date.now() - new Date(`${v}T00:00:00`).getTime()) / 86400000);
    return dias <= 0 ? 'hoy' : `hace ${dias} ${dias === 1 ? 'día' : 'días'}`;
};
const cantidad = (n) => new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 }).format(Number(n) || 0);

function Indicador({ label, valor, nota, clase = 'text-warm-900' }) {
    return (
        <div className="rounded-xl border border-edge bg-white px-4 py-3 shadow-sm">
            <p className="text-[11px] uppercase tracking-wide text-warm-500">{label}</p>
            <p className={`text-lg font-bold ${clase}`}>{valor}</p>
            {nota && <p className="text-[11px] text-warm-500">{nota}</p>}
        </div>
    );
}

/**
 * Lo que compra un cliente: cuánto y cuántas veces en los últimos meses, mes
 * por mes, y los productos que más lleva. Todo en soles (lo vendido en
 * dólares, al tipo de cambio de su día). Se abre con el clic derecho en
 * Clientes.
 */
export default function EstadisticaClienteModal({ cliente, onClose }) {
    const toast = useToast();
    const [meses, setMeses] = useState(12);
    const [datos, setDatos] = useState(null);
    const [cargando, setCargando] = useState(false);
    const [comoTabla, setComoTabla] = useState(false);

    useEffect(() => {
        if (!cliente) return;
        setCargando(true);
        api.get(`/clientes/${cliente.id}/estadistica`, { params: { meses } })
            .then(({ data }) => setDatos(data))
            .catch(() => toast.error('No se pudo cargar la estadística del cliente.'))
            .finally(() => setCargando(false));
    }, [cliente, meses, toast]);

    const p = datos?.periodo;
    const credito = datos?.credito;

    return (
        <Modal open={Boolean(cliente)} onClose={onClose} title="Estadística de ventas" description={cliente?.nombre} size="3xl">
            <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="inline-flex rounded-lg border border-edge bg-gray-50 p-0.5" role="group" aria-label="Periodo">
                        {[3, 6, 12, 24].map((m) => (
                            <button
                                key={m}
                                type="button"
                                onClick={() => setMeses(m)}
                                aria-pressed={meses === m}
                                className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
                                    meses === m ? 'bg-white text-primary-700 shadow-sm' : 'text-warm-500 hover:text-warm-700'
                                }`}
                            >
                                {m} meses
                            </button>
                        ))}
                    </div>
                    {datos?.siempre?.primera && (
                        <p className="text-xs text-warm-500">
                            Cliente desde el {fecha(datos.siempre.primera)} · En total {money(datos.siempre.total)} en{' '}
                            {datos.siempre.compras} {datos.siempre.compras === 1 ? 'compra' : 'compras'}
                        </p>
                    )}
                </div>

                {cargando || !datos ? (
                    <div className="flex justify-center py-16">
                        <Spinner size="lg" className="text-primary-600" />
                    </div>
                ) : (
                    <>
                        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                            <Indicador
                                label={`Compró en ${meses} meses`}
                                valor={money(p.total)}
                                nota={p.a_credito > 0 ? `${money(p.a_credito)} a crédito` : null}
                            />
                            <Indicador label="Compras" valor={p.compras} nota={`Ticket promedio ${money(p.ticket)}`} />
                            <Indicador label="Última compra" valor={fecha(datos.siempre.ultima)} nota={hace(datos.siempre.ultima)} />
                            {credito?.tiene_linea ? (
                                <Indicador
                                    label="Crédito disponible"
                                    valor={money(credito.disponible, credito.moneda)}
                                    clase={credito.disponible < 0 ? 'text-red-600' : 'text-green-600'}
                                    nota={`Debe ${money(credito.deuda, credito.moneda)} de ${money(credito.limite_total, credito.moneda)}`}
                                />
                            ) : (
                                <Indicador label="Crédito" valor="Sin línea" nota="Compra al contado" />
                            )}
                        </div>

                        <section className="rounded-xl border border-edge bg-white p-4 shadow-sm">
                            <div className="mb-2 flex items-center justify-between gap-2">
                                <h3 className="text-sm font-semibold text-warm-900">Compras por mes (S/)</h3>
                                <button
                                    type="button"
                                    onClick={() => setComoTabla((v) => !v)}
                                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-700 hover:underline"
                                >
                                    {comoTabla ? <BarChart3 className="h-3.5 w-3.5" /> : <Table2 className="h-3.5 w-3.5" />}
                                    {comoTabla ? 'Ver gráfico' : 'Ver como tabla'}
                                </button>
                            </div>

                            {p.compras === 0 ? (
                                <Alert variant="info">No compró en los últimos {meses} meses.</Alert>
                            ) : comoTabla ? (
                                <div className="max-h-72 overflow-auto">
                                    <table className="w-full text-sm">
                                        <thead className="sticky top-0 bg-gray-50 text-xs uppercase tracking-wide text-warm-500">
                                            <tr>
                                                <th className="px-3 py-2 text-left">Mes</th>
                                                <th className="px-3 py-2 text-right">Compras</th>
                                                <th className="px-3 py-2 text-right">Total</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {datos.por_mes.map((f) => (
                                                <tr key={f.mes}>
                                                    <td className="px-3 py-1.5 capitalize">{mesLargo(f.mes)}</td>
                                                    <td className="px-3 py-1.5 text-right">{f.compras}</td>
                                                    <td className="px-3 py-1.5 text-right font-medium">{money(f.total)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div className="h-64">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={datos.por_mes} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="20%">
                                            <CartesianGrid strokeDasharray="3 3" stroke={colors.chartGrid} vertical={false} />
                                            <XAxis dataKey="mes" tickFormatter={mesCorto} tick={{ fontSize: 11 }} stroke={colors.warm500} tickLine={false} />
                                            <YAxis tickFormatter={compacto} tick={{ fontSize: 11 }} stroke={colors.warm500} width={44} tickLine={false} axisLine={false} />
                                            <Tooltip
                                                cursor={{ fill: colors.chartGrid }}
                                                contentStyle={tooltipStyle}
                                                labelFormatter={(mes) => mesLargo(mes)}
                                                formatter={(v, _nombre, item) => [
                                                    `${money(v)} · ${item.payload.compras} ${item.payload.compras === 1 ? 'compra' : 'compras'}`,
                                                    'Compró',
                                                ]}
                                            />
                                            <Bar dataKey="total" fill={colors.primary600} radius={[4, 4, 0, 0]} maxBarSize={48} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            )}
                        </section>

                        <section className="overflow-hidden rounded-xl border border-edge bg-white shadow-sm">
                            <h3 className="border-b border-edge px-4 py-3 text-sm font-semibold text-warm-900">
                                Lo que más compra
                            </h3>
                            {datos.productos.length === 0 ? (
                                <p className="px-4 py-6 text-center text-sm text-warm-500">Sin compras en el periodo.</p>
                            ) : (
                                <table className="w-full text-sm">
                                    <thead className="bg-gray-50 text-xs uppercase tracking-wide text-warm-500">
                                        <tr>
                                            <th className="px-4 py-2 text-left">Producto</th>
                                            <th className="px-4 py-2 text-right">Cantidad</th>
                                            <th className="px-4 py-2 text-right">Compras</th>
                                            <th className="px-4 py-2 text-right">Total</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {datos.productos.map((prod) => (
                                            <tr key={prod.codigo}>
                                                <td className="px-4 py-2">
                                                    <span className="font-medium text-warm-900">{prod.nombre}</span>
                                                    <span className="block text-xs text-warm-500">{prod.codigo}</span>
                                                </td>
                                                <td className="px-4 py-2 text-right">
                                                    {cantidad(prod.cantidad)} {prod.unidad ?? ''}
                                                </td>
                                                <td className="px-4 py-2 text-right">{prod.compras}</td>
                                                <td className="px-4 py-2 text-right font-medium">{money(prod.total)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </section>

                        <p className="text-xs text-warm-400">
                            Montos en soles: lo vendido en dólares se lleva a soles con el tipo de cambio de su día. No
                            cuenta las ventas anuladas.
                        </p>
                    </>
                )}
            </div>
        </Modal>
    );
}
