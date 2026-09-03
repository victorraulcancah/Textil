import { useCallback, useEffect, useMemo, useState } from 'react';
import { Coins, Download, PackageOpen, Percent, PiggyBank, Receipt, TrendingUp } from 'lucide-react';
import api from '../lib/api';
import Layout from '../components/Layout';
import PageHeader from '../components/PageHeader';
import { Alert, Button, Select, Spinner, cn } from '../components/ui';
import {
    AMBER, BLUE, ChartCard, GREEN, KpiCard, PRIMARY, PeriodoPicker, RankingChart, ReportTable, ShareBar, TendenciaChart,
    descargarCsv, etiquetaPeriodo, money, num, pct, rangoPreset, textoRango,
} from '../components/reportes/ReporteUI';

const VER_POR = [
    { value: 'auto', label: 'Automático (día / mes)' },
    { value: 'dia', label: 'Día' },
    { value: 'mes', label: 'Mes' },
    { value: 'producto', label: 'Producto' },
    { value: 'categoria', label: 'Categoría' },
];

const SERIES = [
    { key: 'ventas', name: 'Ventas', color: PRIMARY },
    { key: 'costo', name: 'Costo', color: AMBER, dashed: true },
    { key: 'utilidad_neta', name: 'Utilidad neta', color: GREEN },
];

const TITULOS = {
    dia: { grafico: 'Utilidad por día', columna: 'Día', tabla: 'Detalle por día' },
    mes: { grafico: 'Utilidad por mes', columna: 'Mes', tabla: 'Detalle por mes' },
    producto: { grafico: 'Top 10 productos por ganancia', columna: 'Producto', tabla: 'Detalle por producto' },
    categoria: { grafico: 'Ganancia por categoría', columna: 'Categoría', tabla: 'Detalle por categoría' },
};

/** Cómo se reparte cada sol vendido: ventas → costo → ganancia → gastos → utilidad. */
function EstadoResultados({ tot }) {
    const base = Math.max(Math.abs(Number(tot.ventas) || 0), 1);
    const lineas = [
        { label: 'Ventas', valor: tot.ventas, color: 'bg-primary-500', signo: '' },
        { label: 'Costo de lo vendido', valor: tot.costo, color: 'bg-amber-400', signo: '−' },
        { label: 'Ganancia', valor: tot.ganancia, color: 'bg-blue-500', signo: '=', fuerte: true },
        { label: 'Gastos operativos', valor: tot.gastos, color: 'bg-red-400', signo: '−' },
        { label: 'Utilidad neta', valor: tot.utilidad_neta, color: 'bg-green-500', signo: '=', fuerte: true },
    ];

    return (
        <ul className="space-y-4">
            {lineas.map((l) => {
                const p = ((Number(l.valor) || 0) / base) * 100;
                return (
                    <li key={l.label}>
                        <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                            <span className={cn('text-warm-700', l.fuerte && 'font-semibold text-warm-900')}>
                                <span className="mr-1.5 inline-block w-3 text-center text-warm-400">{l.signo}</span>
                                {l.label}
                            </span>
                            <span className={cn('tabular-nums', l.fuerte ? 'font-bold text-warm-900' : 'text-warm-700')}>
                                {money(l.valor)}
                                <span className="ml-1.5 text-xs font-normal text-warm-400">{pct(p)}</span>
                            </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                            <div className={cn('h-full rounded-full', l.color)} style={{ width: `${Math.max(0, Math.min(100, p))}%` }} />
                        </div>
                    </li>
                );
            })}
        </ul>
    );
}

export default function Utilidades() {
    const [[desde, hasta], setRango] = useState(() => rangoPreset('mes'));
    const [verPor, setVerPor] = useState('auto');
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.get(`/reportes/utilidades?desde=${desde}&hasta=${hasta}&agrupar=${verPor}`);
            setData(res.data);
        } catch {
            setError('No se pudo cargar el reporte de utilidades.');
        } finally {
            setLoading(false);
        }
    }, [desde, hasta, verPor]);

    useEffect(() => {
        load();
    }, [load]);

    const agrupar = data?.agrupar ?? 'dia';
    const esTiempo = agrupar === 'dia' || agrupar === 'mes';
    const titulos = TITULOS[agrupar] ?? TITULOS.dia;
    const filas = data?.filas ?? [];
    const tot = data?.totales ?? {};
    const ant = data?.anterior ?? {};
    const top = useMemo(() => filas.slice(0, 10), [filas]);
    const costoPct = tot.ventas > 0 ? pct((tot.costo / tot.ventas) * 100) : '—';

    const columns = useMemo(() => {
        const cols = [
            {
                key: 'grupo', label: titulos.columna,
                render: (r) => <span className="font-medium text-warm-900">{etiquetaPeriodo(r.grupo, agrupar, true)}</span>,
                searchValue: (r) => etiquetaPeriodo(r.grupo, agrupar, true),
                total: () => 'Total',
            },
            { key: 'num_ventas', label: 'N° ventas', align: 'right', render: (r) => num(r.num_ventas), total: (t) => num(t.num_ventas) },
            { key: 'ventas', label: 'Ventas', align: 'right', render: (r) => money(r.ventas), total: (t) => money(t.ventas) },
            { key: 'costo', label: 'Costo', align: 'right', className: 'text-amber-600', render: (r) => money(r.costo), total: (t) => money(t.costo) },
            { key: 'ganancia', label: 'Ganancia', align: 'right', className: 'text-blue-600', render: (r) => money(r.ganancia), total: (t) => money(t.ganancia) },
            { key: 'margen_ganancia', label: '% Gan.', align: 'right', render: (r) => pct(r.margen_ganancia), total: (t) => pct(t.margen_ganancia) },
        ];
        if (esTiempo) {
            cols.push(
                { key: 'gastos', label: 'Gastos', align: 'right', className: 'text-red-600', render: (r) => money(r.gastos), total: (t) => money(t.gastos) },
                { key: 'utilidad_neta', label: 'Utilidad neta', align: 'right', className: 'font-semibold text-green-600', render: (r) => money(r.utilidad_neta), total: (t) => money(t.utilidad_neta) },
                { key: 'margen', label: 'Margen', align: 'right', render: (r) => pct(r.margen), total: (t) => pct(t.margen) },
            );
        } else {
            cols.push({
                key: 'participacion', label: 'Participación', align: 'right', width: 160,
                render: (r) => <ShareBar value={r.participacion} color="bg-blue-500" />,
                total: () => '100%',
            });
        }
        return cols;
    }, [agrupar, esTiempo, titulos]);

    const exportCsv = () => {
        const headers = [
            titulos.columna, 'N° ventas', 'Ventas', 'Costo', 'Ganancia', '% Ganancia',
            ...(esTiempo ? ['Gastos', 'Utilidad neta', 'Margen %'] : ['Participación %']),
        ];
        const rows = filas.map((f) => [
            etiquetaPeriodo(f.grupo, agrupar, true), f.num_ventas, f.ventas, f.costo, f.ganancia, f.margen_ganancia,
            ...(esTiempo ? [f.gastos, f.utilidad_neta, f.margen] : [f.participacion]),
        ]);
        descargarCsv(`utilidades_${agrupar}_${desde}_${hasta}.csv`, headers, rows);
    };

    return (
        <Layout>
            <PageHeader
                title="Utilidades"
                description="Estado de resultados: ventas − costo − gastos operativos (solo soles, sin IGV)"
                actions={
                    <>
                        {loading && data && <Spinner size="sm" className="text-primary-600" />}
                        <Button variant="secondary" onClick={exportCsv} disabled={!filas.length}>
                            <Download className="h-4 w-4" /> Exportar CSV
                        </Button>
                    </>
                }
            />

            <PeriodoPicker desde={desde} hasta={hasta} onChange={(d, h) => setRango([d, h])}>
                <div className="w-52">
                    <Select label="Ver por" value={verPor} onChange={(e) => setVerPor(e.target.value)} options={VER_POR} />
                </div>
            </PeriodoPicker>

            {error && <Alert variant="error" className="mb-4">{error}</Alert>}

            {loading && !data ? (
                <div className="flex items-center justify-center py-24">
                    <Spinner size="lg" className="text-primary-600" />
                </div>
            ) : data ? (
                <>
                    {/* KPIs con variación contra el periodo anterior de igual duración */}
                    <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                        <KpiCard
                            icon={Coins} label="Ventas" value={money(tot.ventas)}
                            hint={`${num(tot.num_ventas)} ventas · ticket ${money(tot.ticket_promedio)}`}
                            actual={tot.ventas} anterior={ant.ventas}
                        />
                        <KpiCard
                            icon={PackageOpen} label="Costo" value={money(tot.costo)} accent="text-amber-600" bg="bg-amber-50"
                            hint={`${costoPct} de las ventas`}
                            actual={tot.costo} anterior={ant.costo} invertir
                        />
                        <KpiCard
                            icon={TrendingUp} label="Ganancia" value={money(tot.ganancia)} accent="text-blue-600" bg="bg-blue-50"
                            hint={`${pct(tot.margen_ganancia)} sobre el costo`}
                            actual={tot.ganancia} anterior={ant.ganancia}
                        />
                        <KpiCard
                            icon={Receipt} label="Gastos" value={money(tot.gastos)} accent="text-red-600" bg="bg-red-50"
                            hint="gastos operativos de caja"
                            actual={tot.gastos} anterior={ant.gastos} invertir
                        />
                        <KpiCard
                            icon={PiggyBank} label="Utilidad neta" value={money(tot.utilidad_neta)} accent="text-green-600" bg="bg-green-50"
                            hint={`${pct(tot.margen)} de las ventas`}
                            actual={tot.utilidad_neta} anterior={ant.utilidad_neta}
                        />
                        <KpiCard
                            icon={Percent} label="Margen neto" value={pct(tot.margen)} accent="text-purple-600" bg="bg-purple-50"
                            hint={`antes ${pct(ant.margen)}`}
                        />
                    </div>

                    {/* Tendencia / ranking + estado de resultados */}
                    <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
                        <ChartCard className="lg:col-span-2" title={titulos.grafico} subtitle={textoRango(desde, hasta)}>
                            {esTiempo ? (
                                <TendenciaChart data={filas} agrupar={agrupar} series={SERIES} />
                            ) : (
                                <RankingChart data={top} dataKey="ganancia" color={BLUE} label="Ganancia" />
                            )}
                        </ChartCard>
                        <ChartCard title="Estado de resultados" subtitle="Cómo se reparte cada sol vendido">
                            <EstadoResultados tot={tot} />
                        </ChartCard>
                    </div>

                    {/* Detalle */}
                    <ChartCard
                        title={titulos.tabla}
                        subtitle={esTiempo ? 'Incluye los días/meses sin ventas. Ordena haciendo clic en una columna.' : 'Ordena haciendo clic en una columna.'}
                    >
                        <ReportTable
                            key={agrupar}
                            columns={columns}
                            rows={filas}
                            totales={tot}
                            loading={loading}
                            searchable={!esTiempo}
                            searchPlaceholder={`Buscar ${titulos.columna.toLowerCase()}…`}
                        />
                        {!esTiempo && (
                            <p className="mt-3 text-xs text-warm-400">
                                Los gastos operativos no se reparten por producto/categoría: aquí se muestra la ganancia (ventas − costo) y su participación en la ganancia total.
                            </p>
                        )}
                    </ChartCard>
                </>
            ) : null}
        </Layout>
    );
}
