import { useCallback, useEffect, useState } from 'react';
import {
    AlertTriangle, ArrowDownCircle, ArrowUpCircle, Boxes, Coins,
    PackageX, PiggyBank, Receipt, Sparkles, TrendingUp, Wallet,
} from 'lucide-react';
import {
    Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend,
    Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import api from '../lib/api';
import Layout from '../components/Layout';
import PageHeader from '../components/PageHeader';
import { Alert, Badge, Card, Spinner } from '../components/ui';
import { colors, CAT_COLORS, tooltipStyle } from '../theme/colors';

const money = (n) =>
    new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(Number(n) || 0);
const num = (n) => new Intl.NumberFormat('es-PE').format(Number(n) || 0);

// Colores tomados de resources/js/theme/colors.js (única fuente: resources/css/app.css)
const PRIMARY = colors.primary600;
const GREEN = colors.success;
const RED = colors.danger;
const AMBER = colors.warning;

const RANGOS = [
    { value: 7, label: '7 días' },
    { value: 30, label: '30 días' },
    { value: 90, label: '90 días' },
    { value: 365, label: '1 año' },
];

const fechaCorta = (v) => {
    const s = String(v).slice(0, 10);
    const [, m, d] = s.split('-');
    return m && d ? `${d}/${m}` : s;
};

function KpiCard({ icon: Icon, label, value, accent = 'text-primary-600', bg = 'bg-primary-50', hint }) {
    return (
        <Card className="flex items-center gap-3">
            <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${bg} ${accent}`}>
                <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
                <p className="truncate text-xs font-medium uppercase tracking-wide text-warm-500">{label}</p>
                <p className="truncate text-lg font-extrabold text-warm-900">{value}</p>
                {hint && <p className="truncate text-xs text-warm-400">{hint}</p>}
            </div>
        </Card>
    );
}

function ChartCard({ title, subtitle, children, className = '' }) {
    return (
        <Card className={className}>
            <div className="mb-3">
                <h2 className="text-sm font-bold text-warm-900">{title}</h2>
                {subtitle && <p className="text-xs text-warm-500">{subtitle}</p>}
            </div>
            {children}
        </Card>
    );
}

const EmptyChart = ({ text = 'Sin datos en este periodo' }) => (
    <div className="flex h-full items-center justify-center text-sm text-warm-400">{text}</div>
);

export default function Dashboard() {
    const [dias, setDias] = useState(30);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.get(`/dashboard?dias=${dias}`);
            setData(res.data);
        } catch {
            setError('No se pudo cargar el dashboard.');
        } finally {
            setLoading(false);
        }
    }, [dias]);

    useEffect(() => {
        load();
    }, [load]);

    const k = data?.kpis ?? {};
    const insights = data?.insights ?? {};
    const estrella = insights.producto_estrella;

    return (
        <Layout>
            <PageHeader title="Escritorio" description="Panel inteligente de tu negocio" />

            {/* Selector de rango */}
            <div className="mb-4 flex flex-wrap items-center gap-2">
                <span className="text-sm text-warm-500">Periodo:</span>
                {RANGOS.map((r) => (
                    <button
                        key={r.value}
                        onClick={() => setDias(r.value)}
                        className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                            dias === r.value
                                ? 'bg-primary-600 text-white'
                                : 'bg-white text-warm-600 ring-1 ring-inset ring-edge hover:bg-primary-50'
                        }`}
                    >
                        {r.label}
                    </button>
                ))}
            </div>

            {error && <Alert variant="error" className="mb-4">{error}</Alert>}

            {loading ? (
                <div className="flex items-center justify-center py-24">
                    <Spinner size="lg" className="text-primary-600" />
                </div>
            ) : (
                <>
                    {/* KPIs */}
                    <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
                        <KpiCard icon={Coins} label="Ventas" value={money(k.ventas_total)} hint={`${num(k.num_ventas)} ventas`} />
                        <KpiCard icon={Receipt} label="Ticket promedio" value={money(k.ticket_promedio)} accent="text-blue-600" bg="bg-blue-50" />
                        <KpiCard icon={TrendingUp} label="Margen estimado" value={money(k.margen_estimado)} accent="text-green-600" bg="bg-green-50" />
                        <KpiCard icon={Wallet} label="Por cobrar" value={money(k.por_cobrar)} accent="text-amber-600" bg="bg-amber-50" />
                        <KpiCard icon={ArrowUpCircle} label="Por pagar" value={money(k.por_pagar)} accent="text-red-600" bg="bg-red-50" />
                        <KpiCard icon={PiggyBank} label="Capital en stock" value={money(k.capital_inmovilizado)} accent="text-purple-600" bg="bg-purple-50" hint="dinero inmovilizado" />
                        <KpiCard icon={AlertTriangle} label="Alertas de stock" value={num(k.productos_alerta)} accent="text-red-600" bg="bg-red-50" hint="productos por reponer" />
                        <KpiCard icon={Boxes} label="N° de ventas" value={num(k.num_ventas)} accent="text-primary-600" bg="bg-primary-50" />
                    </div>

                    {/* Producto estrella */}
                    {estrella && (
                        <div className="mb-6 flex items-center gap-4 rounded-2xl bg-gradient-to-r from-primary-600 to-primary-500 p-5 text-white shadow-sm">
                            <Sparkles className="h-8 w-8 shrink-0" />
                            <div className="min-w-0">
                                <p className="text-xs font-semibold uppercase tracking-wide text-white/80">Producto estrella del periodo</p>
                                <p className="truncate text-lg font-extrabold">{estrella.producto}</p>
                                <p className="text-sm text-white/90">
                                    {num(estrella.unidades)} unidades · {money(estrella.total)} vendidos · <strong>{money(estrella.ganancia)} de ganancia</strong>
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Fila 1: tendencia + categorías */}
                    <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
                        <ChartCard title="Tendencia de ventas" subtitle="Total vendido por día" className="lg:col-span-2">
                            <div className="h-72">
                                {data.ventas_por_dia?.length ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={data.ventas_por_dia} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                                            <defs>
                                                <linearGradient id="gVentas" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor={PRIMARY} stopOpacity={0.35} />
                                                    <stop offset="95%" stopColor={PRIMARY} stopOpacity={0} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" stroke={colors.chartGrid} vertical={false} />
                                            <XAxis dataKey="fecha" tickFormatter={fechaCorta} tick={{ fontSize: 11 }} stroke={colors.warm500} />
                                            <YAxis tick={{ fontSize: 11 }} stroke={colors.warm500} width={48} />
                                            <Tooltip contentStyle={tooltipStyle} formatter={(v) => [money(v), 'Ventas']} labelFormatter={fechaCorta} />
                                            <Area type="monotone" dataKey="total" stroke={PRIMARY} strokeWidth={2} fill="url(#gVentas)" />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                ) : <EmptyChart />}
                            </div>
                        </ChartCard>

                        <ChartCard title="Ventas por categoría" subtitle="Participación en el total">
                            <div className="h-72">
                                {data.ventas_por_categoria?.length ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie data={data.ventas_por_categoria} dataKey="total" nameKey="categoria" cx="50%" cy="50%" outerRadius={90} innerRadius={45} paddingAngle={2}>
                                                {data.ventas_por_categoria.map((_, i) => (
                                                    <Cell key={i} fill={CAT_COLORS[i % CAT_COLORS.length]} />
                                                ))}
                                            </Pie>
                                            <Tooltip contentStyle={tooltipStyle} formatter={(v) => money(v)} />
                                            <Legend wrapperStyle={{ fontSize: 11 }} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                ) : <EmptyChart />}
                            </div>
                        </ChartCard>
                    </div>

                    {/* Fila 2: top vendidos + top ganancia */}
                    <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
                        <ChartCard title="Top 10 más vendidos" subtitle="Por unidades">
                            <div className="h-80">
                                {data.top_vendidos?.length ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={data.top_vendidos} layout="vertical" margin={{ left: 10, right: 16 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke={colors.chartGrid} horizontal={false} />
                                            <XAxis type="number" tick={{ fontSize: 11 }} stroke={colors.warm500} />
                                            <YAxis type="category" dataKey="producto" width={120} tick={{ fontSize: 10 }} stroke={colors.warm500} />
                                            <Tooltip contentStyle={tooltipStyle} formatter={(v) => [num(v), 'Unidades']} />
                                            <Bar dataKey="unidades" fill={PRIMARY} radius={[0, 6, 6, 0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                ) : <EmptyChart />}
                            </div>
                        </ChartCard>

                        <ChartCard title="Top 10 por ganancia" subtitle="Margen generado (venta − costo)">
                            <div className="h-80">
                                {data.top_ganancia?.length ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={data.top_ganancia} layout="vertical" margin={{ left: 10, right: 16 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke={colors.chartGrid} horizontal={false} />
                                            <XAxis type="number" tick={{ fontSize: 11 }} stroke={colors.warm500} />
                                            <YAxis type="category" dataKey="producto" width={120} tick={{ fontSize: 10 }} stroke={colors.warm500} />
                                            <Tooltip contentStyle={tooltipStyle} formatter={(v) => [money(v), 'Ganancia']} />
                                            <Bar dataKey="ganancia" fill={GREEN} radius={[0, 6, 6, 0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                ) : <EmptyChart />}
                            </div>
                        </ChartCard>
                    </div>

                    {/* Fila 3: pago tipo + caja */}
                    <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
                        <ChartCard title="Contado vs Crédito" subtitle="Cómo te pagan las ventas">
                            <div className="h-64">
                                {data.pago_tipo?.length ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie data={data.pago_tipo} dataKey="total" nameKey="tipo" cx="50%" cy="50%" outerRadius={90} label={(e) => e.tipo}>
                                                {data.pago_tipo.map((e, i) => (
                                                    <Cell key={i} fill={e.tipo === 'contado' ? GREEN : AMBER} />
                                                ))}
                                            </Pie>
                                            <Tooltip contentStyle={tooltipStyle} formatter={(v) => money(v)} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                ) : <EmptyChart />}
                            </div>
                        </ChartCard>

                        <ChartCard title="Ingresos vs Egresos de caja" subtitle="Movimientos del periodo">
                            <div className="h-64">
                                {data.caja?.length ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={data.caja} margin={{ left: 0, right: 10 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke={colors.chartGrid} vertical={false} />
                                            <XAxis dataKey="tipo" tick={{ fontSize: 11 }} stroke={colors.warm500} />
                                            <YAxis tick={{ fontSize: 11 }} stroke={colors.warm500} width={48} />
                                            <Tooltip contentStyle={tooltipStyle} formatter={(v) => money(v)} />
                                            <Bar dataKey="total" radius={[6, 6, 0, 0]}>
                                                {data.caja.map((e, i) => (
                                                    <Cell key={i} fill={e.tipo === 'ingreso' ? GREEN : RED} />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                ) : <EmptyChart />}
                            </div>
                        </ChartCard>
                    </div>

                    {/* Insights inteligentes */}
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                        <ChartCard title="🔴 Reposición urgente" subtitle="Tus más vendidos que ya están bajos de stock">
                            <InsightList
                                items={insights.reposicion_urgente}
                                empty="Sin urgencias. Tu stock de los más vendidos está sano."
                                render={(r) => (
                                    <>
                                        <span className="truncate">{r.producto}</span>
                                        <span className="shrink-0 text-right">
                                            <Badge variant={r.stock <= 0 ? 'red' : 'amber'}>{num(r.stock)} en stock</Badge>
                                            <span className="ml-2 text-xs text-warm-400">vendió {num(r.unidades)}</span>
                                        </span>
                                    </>
                                )}
                            />
                        </ChartCard>

                        <ChartCard title="⚠️ Venden mucho, margen bajo" subtitle="Candidatos a subir precio o negociar costo">
                            <InsightList
                                items={insights.margen_bajo}
                                empty="Sin datos suficientes."
                                render={(r) => (
                                    <>
                                        <span className="truncate">{r.producto}</span>
                                        <span className="shrink-0 text-right">
                                            <Badge variant="amber">{money(r.margen_unitario)}/u</Badge>
                                            <span className="ml-2 text-xs text-warm-400">{num(r.unidades)} u</span>
                                        </span>
                                    </>
                                )}
                            />
                        </ChartCard>

                        <ChartCard title="🐌 Sin rotación" subtitle="Tienen stock pero no se vendieron en el periodo">
                            <InsightList
                                items={insights.sin_rotacion}
                                empty="Todo lo que tienes en stock ha rotado. 👌"
                                render={(r) => (
                                    <>
                                        <span className="truncate">{r.producto}</span>
                                        <Badge variant="gray">{num(r.stock)} en stock</Badge>
                                    </>
                                )}
                            />
                        </ChartCard>

                        <ChartCard title="📦 Bajo stock / quiebre" subtitle="Productos en o bajo el mínimo">
                            <InsightList
                                items={data.bajo_stock}
                                empty="Sin productos bajos de stock."
                                render={(r) => (
                                    <>
                                        <span className="truncate">{r.producto}</span>
                                        <span className="shrink-0 text-right">
                                            <Badge variant={r.stock <= 0 ? 'red' : 'amber'}>{num(r.stock)}</Badge>
                                            <span className="ml-2 text-xs text-warm-400">mín {num(r.minimo)}</span>
                                        </span>
                                    </>
                                )}
                            />
                        </ChartCard>
                    </div>
                </>
            )}
        </Layout>
    );
}

function InsightList({ items, render, empty }) {
    if (!items?.length) {
        return <p className="py-6 text-center text-sm text-warm-400">{empty}</p>;
    }
    return (
        <ul className="divide-y divide-gray-100">
            {items.map((r, i) => (
                <li key={i} className="flex items-center justify-between gap-3 py-2 text-sm text-warm-800">
                    {render(r)}
                </li>
            ))}
        </ul>
    );
}
