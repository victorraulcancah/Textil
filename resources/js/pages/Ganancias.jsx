import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Award, Coins, Contact, Download, Package, PackageOpen, Percent, PieChart, ReceiptText, Tags, TrendingUp, Users,
} from 'lucide-react';
import api from '../lib/api';
import Layout from '../components/Layout';
import PageHeader from '../components/PageHeader';
import { Alert, Button, Spinner, Tabs } from '../components/ui';
import {
    AMBER, ChartCard, GREEN, HeroBanner, KpiCard, PRIMARY, PeriodoPicker, ReportTable, ShareBar, TendenciaChart,
    descargarCsv, fechaLarga, money, num, pct, rangoPreset, textoRango,
} from '../components/reportes/ReporteUI';

const TABS = [
    { key: 'producto', label: 'Por producto', icon: Package, col: 'Producto', hero: 'Producto con mayor ganancia' },
    { key: 'categoria', label: 'Por categoría', icon: Tags, col: 'Categoría', hero: 'Categoría más rentable' },
    { key: 'venta', label: 'Por venta', icon: ReceiptText, col: 'Venta', hero: 'Venta con mayor ganancia' },
    { key: 'cliente', label: 'Por cliente', icon: Contact, col: 'Cliente', hero: 'Cliente que más ganancia deja' },
    { key: 'vendedor', label: 'Por vendedor', icon: Users, col: 'Vendedor', hero: 'Vendedor con mayor ganancia' },
];

const SERIES = [
    { key: 'ventas', name: 'Ventas', color: PRIMARY },
    { key: 'costo', name: 'Costo', color: AMBER, dashed: true },
    { key: 'ganancia', name: 'Ganancia', color: GREEN },
];

export default function Ganancias() {
    const [[desde, hasta], setRango] = useState(() => rangoPreset('mes'));
    const [tab, setTab] = useState('producto');
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.get(`/reportes/ganancias?desde=${desde}&hasta=${hasta}&agrupar=${tab}`);
            setData(res.data);
        } catch {
            setError('No se pudo cargar el reporte de ganancias.');
        } finally {
            setLoading(false);
        }
    }, [desde, hasta, tab]);

    useEffect(() => {
        load();
    }, [load]);

    const tabActual = TABS.find((t) => t.key === tab);
    const filas = data?.filas ?? [];
    const tot = data?.totales ?? {};
    const ant = data?.anterior ?? {};
    const seriePor = data?.serie_por ?? 'dia';
    const top = filas[0];

    const columns = useMemo(() => {
        const cols = [
            {
                key: 'rank', label: '#', width: 48, sortable: false, mobile: 'prefix',
                render: (_, i) => <span className="text-warm-400">{i + 1}</span>,
            },
            {
                key: 'grupo', label: tabActual.col, mobile: 'title',
                render: (r) => (
                    <div className="min-w-0">
                        <p className="truncate font-medium text-warm-900">{r.grupo}</p>
                        {r.detalle && <p className="truncate text-xs text-warm-400">{r.detalle}</p>}
                    </div>
                ),
                searchValue: (r) => `${r.grupo} ${r.detalle ?? ''}`,
                total: () => 'Total',
            },
        ];
        if (tab === 'venta') {
            cols.push({ key: 'fecha', label: 'Fecha', render: (r) => fechaLarga(r.fecha), sortValue: (r) => String(r.fecha ?? '') });
        }
        cols.push({ key: 'unidades', label: 'Unidades', align: 'right', render: (r) => num(r.unidades, 2), total: (t) => num(t.unidades, 2) });
        if (tab !== 'venta') {
            cols.push({ key: 'num_ventas', label: 'N° ventas', align: 'right', render: (r) => num(r.num_ventas), total: (t) => num(t.num_ventas) });
        }
        cols.push(
            { key: 'ventas', label: 'Ventas', align: 'right', render: (r) => money(r.ventas), total: (t) => money(t.ventas) },
            { key: 'costo', label: 'Costo', align: 'right', className: 'text-amber-600', render: (r) => money(r.costo), total: (t) => money(t.costo) },
            { key: 'ganancia', label: 'Ganancia', align: 'right', className: 'font-semibold text-green-600', render: (r) => money(r.ganancia), total: (t) => money(t.ganancia) },
            { key: 'margen_ganancia', label: '% Gan.', align: 'right', render: (r) => pct(r.margen_ganancia), total: (t) => pct(t.margen_ganancia) },
            { key: 'margen_bruto', label: 'Margen', align: 'right', render: (r) => pct(r.margen_bruto), total: (t) => pct(t.margen_bruto) },
            { key: 'participacion', label: 'Participación', align: 'right', width: 160, render: (r) => <ShareBar value={r.participacion} />, total: () => '100%' },
        );
        return cols;
    }, [tab, tabActual]);

    const exportCsv = () => {
        const headers = [tabActual.col, 'Detalle', 'Fecha', 'Unidades', 'N° ventas', 'Ventas', 'Costo', 'Ganancia', '% Ganancia', 'Margen', 'Participación %'];
        const rows = filas.map((f) => [
            f.grupo, f.detalle ?? '', f.fecha ?? '', f.unidades, f.num_ventas, f.ventas, f.costo, f.ganancia, f.margen_ganancia, f.margen_bruto, f.participacion,
        ]);
        descargarCsv(`ganancias_${tab}_${desde}_${hasta}.csv`, headers, rows);
    };

    return (
        <Layout>
            <PageHeader
                title="Ganancias"
                description="Cuánto ganas en lo que vendes: precio de venta − costo del producto (sin gastos, solo soles, sin IGV)"
                actions={
                    <Button variant="secondary" onClick={exportCsv} disabled={!filas.length}>
                        <Download className="h-4 w-4" /> Exportar CSV
                    </Button>
                }
            />

            <PeriodoPicker desde={desde} hasta={hasta} onChange={(d, h) => setRango([d, h])} />

            {error && <Alert variant="error" className="mb-4">{error}</Alert>}

            {loading && !data ? (
                <div className="flex items-center justify-center py-24">
                    <Spinner size="lg" className="text-primary-600" />
                </div>
            ) : data ? (
                <>
                    {/* KPIs */}
                    <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                        <KpiCard
                            icon={Coins} label="Ventas" value={money(tot.ventas)}
                            hint={`${num(tot.num_ventas)} ventas · ticket ${money(tot.ticket_promedio)}`}
                            actual={tot.ventas} anterior={ant.ventas}
                        />
                        <KpiCard
                            icon={PackageOpen} label="Costo" value={money(tot.costo)} accent="text-amber-600" bg="bg-amber-50"
                            hint={`${num(tot.unidades, 2)} unidades vendidas`}
                            actual={tot.costo} anterior={ant.costo} invertir
                        />
                        <KpiCard
                            icon={TrendingUp} label="Ganancia" value={money(tot.ganancia)} accent="text-green-600" bg="bg-green-50"
                            hint={`${pct(tot.margen_bruto)} de las ventas`}
                            actual={tot.ganancia} anterior={ant.ganancia}
                        />
                        <KpiCard
                            icon={Percent} label="% Ganancia" value={pct(tot.margen_ganancia)} accent="text-blue-600" bg="bg-blue-50"
                            hint={`sobre el costo · antes ${pct(ant.margen_ganancia)}`}
                        />
                        <KpiCard
                            icon={PieChart} label="Margen" value={pct(tot.margen_bruto)} accent="text-purple-600" bg="bg-purple-50"
                            hint={`sobre las ventas · antes ${pct(ant.margen_bruto)}`}
                        />
                        <KpiCard
                            icon={ReceiptText} label="N° de ventas" value={num(tot.num_ventas)}
                            hint={`antes ${num(ant.num_ventas)} ventas`}
                            actual={tot.num_ventas} anterior={ant.num_ventas}
                        />
                    </div>

                    {top && top.ganancia > 0 && (
                        <HeroBanner icon={Award} label={`${tabActual.hero} · ${textoRango(desde, hasta)}`} title={top.grupo}>
                            <strong>{money(top.ganancia)} de ganancia</strong> · {money(top.ventas)} vendidos · {pct(top.margen_ganancia)} sobre el costo · {pct(top.participacion)} del total
                        </HeroBanner>
                    )}

                    <ChartCard
                        className="mb-6"
                        title="Tendencia de ganancia"
                        subtitle={`Ventas, costo y ganancia por ${seriePor === 'dia' ? 'día' : 'mes'} · ${textoRango(desde, hasta)}`}
                    >
                        <TendenciaChart data={data.serie ?? []} agrupar={seriePor} series={SERIES} />
                    </ChartCard>

                    <ChartCard title="Detalle de ganancias" subtitle="Ordena haciendo clic en una columna. La participación es sobre la ganancia total del periodo.">
                        <div className="mb-4">
                            <Tabs items={TABS} value={tab} onChange={setTab} />
                        </div>
                        <ReportTable
                            key={tab}
                            columns={columns}
                            rows={filas}
                            totales={tot}
                            keyField="id"
                            loading={loading}
                            searchPlaceholder={`Buscar ${tabActual.col.toLowerCase()}…`}
                        />
                    </ChartCard>
                </>
            ) : null}
        </Layout>
    );
}
