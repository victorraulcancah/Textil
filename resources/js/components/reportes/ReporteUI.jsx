import { Fragment, useId, useMemo, useState } from 'react';
import {
    ArrowDownRight, ArrowUpRight, ChevronDown, ChevronUp, ChevronsUpDown, Minus, Search,
} from 'lucide-react';
import {
    Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { Card, Input, cn } from '../ui';
import { colors, tooltipStyle } from '../../theme/colors';

/* ------------------------------------------------------------------ */
/*  Formato y paleta                                                   */
/* ------------------------------------------------------------------ */

export const money = (n) =>
    new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(Number(n) || 0);
export const num = (n, decimales = 0) =>
    new Intl.NumberFormat('es-PE', { maximumFractionDigits: decimales }).format(Number(n) || 0);
export const pct = (n) => `${num(n, 1)}%`;

// Colores tomados de resources/js/theme/colors.js (única fuente: resources/css/app.css)
export const PRIMARY = colors.primary600;
export const GREEN = colors.success;
export const AMBER = colors.warning;
export const RED = colors.danger;
export const BLUE = colors.info;

export { tooltipStyle };

/* ------------------------------------------------------------------ */
/*  Fechas y periodos                                                  */
/* ------------------------------------------------------------------ */

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const MESES_LARGO = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

/** Fecha local como YYYY-MM-DD (toISOString usa UTC y en la noche corre el día). */
export const iso = (d) => {
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/**
 * Etiqueta legible de un periodo del backend.
 *  dia: '2026-08-01' → '01 Ago'  | largo: '01 Agosto 2026'
 *  mes: '2026-08'    → 'Ago 26'  | largo: 'Agosto 2026'
 * Cualquier otro valor (producto, categoría…) se devuelve tal cual.
 */
export const etiquetaPeriodo = (grupo, agrupar, largo = false) => {
    const s = String(grupo ?? '');
    if (agrupar === 'dia' && s.length >= 10) {
        const [y, m, d] = s.slice(0, 10).split('-');
        const mes = (largo ? MESES_LARGO : MESES)[Number(m) - 1] ?? m;
        return largo ? `${d} ${mes} ${y}` : `${d} ${mes}`;
    }
    if (agrupar === 'mes' && s.length >= 7) {
        const [y, m] = s.split('-');
        const mes = (largo ? MESES_LARGO : MESES)[Number(m) - 1] ?? m;
        return largo ? `${mes} ${y}` : `${mes} ${String(y).slice(2)}`;
    }
    return s;
};

export const fechaLarga = (s) => etiquetaPeriodo(s, 'dia', true);

const hoy = () => new Date();
const sumaDias = (d, n) => {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
};

/** Rangos rápidos. Cada uno devuelve [desde, hasta] como Date. */
export const PRESETS = [
    { key: 'hoy', label: 'Hoy', rango: () => [hoy(), hoy()] },
    {
        key: 'semana',
        label: 'Esta semana',
        rango: () => {
            const h = hoy();
            return [sumaDias(h, -((h.getDay() + 6) % 7)), h];
        },
    },
    { key: 'mes', label: 'Este mes', rango: () => [new Date(hoy().getFullYear(), hoy().getMonth(), 1), hoy()] },
    {
        key: 'mes_anterior',
        label: 'Mes anterior',
        rango: () => {
            const h = hoy();
            return [new Date(h.getFullYear(), h.getMonth() - 1, 1), new Date(h.getFullYear(), h.getMonth(), 0)];
        },
    },
    { key: '30d', label: 'Últimos 30 días', rango: () => [sumaDias(hoy(), -29), hoy()] },
    { key: 'anio', label: 'Este año', rango: () => [new Date(hoy().getFullYear(), 0, 1), hoy()] },
    {
        key: '12m',
        label: 'Últimos 12 meses',
        rango: () => [new Date(hoy().getFullYear(), hoy().getMonth() - 11, 1), hoy()],
    },
];

/** [desde, hasta] en ISO para un preset. */
export const rangoPreset = (key) => PRESETS.find((p) => p.key === key).rango().map(iso);

/** Texto del rango: '01 Agosto 2026 – 22 Agosto 2026'. */
export const textoRango = (desde, hasta) => `${fechaLarga(desde)} – ${fechaLarga(hasta)}`;

/* ------------------------------------------------------------------ */
/*  Selector de periodo                                                */
/* ------------------------------------------------------------------ */

/**
 * Chips de rangos rápidos + fechas personalizadas. `children` se muestra a la
 * derecha de las fechas (p. ej. un selector de agrupación).
 */
export function PeriodoPicker({ desde, hasta, onChange, children }) {
    const activo = useMemo(
        () => PRESETS.find((p) => {
            const [a, b] = p.rango().map(iso);
            return a === desde && b === hasta;
        })?.key ?? null,
        [desde, hasta],
    );

    return (
        <Card className="mb-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                <div className="min-w-0">
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-warm-500">Periodo</p>
                    <div className="flex flex-wrap gap-2">
                        {PRESETS.map((p) => (
                            <button
                                key={p.key}
                                type="button"
                                onClick={() => onChange(...p.rango().map(iso))}
                                className={cn(
                                    'rounded-lg px-3 py-1.5 text-sm font-medium transition',
                                    activo === p.key
                                        ? 'bg-primary-600 text-white shadow-sm'
                                        : 'bg-white text-warm-600 ring-1 ring-inset ring-edge hover:bg-primary-50',
                                )}
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="flex flex-wrap items-end gap-3">
                    <div className="w-40">
                        <Input
                            label="Desde"
                            type="date"
                            value={desde}
                            max={hasta}
                            onChange={(e) => e.target.value && onChange(e.target.value, hasta)}
                        />
                    </div>
                    <div className="w-40">
                        <Input
                            label="Hasta"
                            type="date"
                            value={hasta}
                            min={desde}
                            onChange={(e) => e.target.value && onChange(desde, e.target.value)}
                        />
                    </div>
                    {children}
                </div>
            </div>
        </Card>
    );
}

/* ------------------------------------------------------------------ */
/*  KPIs                                                               */
/* ------------------------------------------------------------------ */

/** Variación de `actual` respecto a `anterior`: { pct, diff } o null si falta un dato. */
export const variacion = (actual, anterior) => {
    if (actual == null || anterior == null) return null;
    const a = Number(actual) || 0;
    const b = Number(anterior) || 0;
    return { pct: b ? ((a - b) / Math.abs(b)) * 100 : null, diff: a - b };
};

function Delta({ pct: p, diff, invertir }) {
    if (p == null) {
        return <p className="mt-1 text-xs text-warm-400">Sin datos del periodo anterior</p>;
    }
    const igual = Math.abs(diff) < 0.005;
    const sube = diff > 0;
    const bueno = sube !== invertir;
    const Icon = igual ? Minus : sube ? ArrowUpRight : ArrowDownRight;

    return (
        <p
            className={cn(
                'mt-1 inline-flex items-center gap-1 text-xs font-semibold',
                igual ? 'text-warm-400' : bueno ? 'text-green-600' : 'text-red-600',
            )}
        >
            <Icon className="h-3.5 w-3.5" />
            {num(Math.abs(p), 1)}%
            <span className="font-normal text-warm-400">vs periodo anterior</span>
        </p>
    );
}

/**
 * Tarjeta de indicador con ícono, valor, pista y variación contra el periodo
 * anterior (pasar `actual` y `anterior`). `invertir` = subir es malo (costos, gastos).
 */
export function KpiCard({
    icon: Icon, label, value, hint, accent = 'text-primary-600', bg = 'bg-primary-50',
    actual, anterior, invertir = false,
}) {
    const delta = variacion(actual, anterior);

    return (
        <Card>
            <div className="flex items-start gap-3">
                <div className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', bg, accent)}>
                    <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium uppercase tracking-wide text-warm-500">{label}</p>
                    <p className="truncate text-lg font-extrabold text-warm-900">{value}</p>
                    {hint && <p className="truncate text-xs text-warm-400">{hint}</p>}
                    {delta && <Delta {...delta} invertir={invertir} />}
                </div>
            </div>
        </Card>
    );
}

export function ChartCard({ title, subtitle, actions, children, className = '' }) {
    return (
        <Card className={className}>
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                <div>
                    <h2 className="text-sm font-bold text-warm-900">{title}</h2>
                    {subtitle && <p className="text-xs text-warm-500">{subtitle}</p>}
                </div>
                {actions}
            </div>
            {children}
        </Card>
    );
}

/** Banner destacado (mismo estilo que "Producto estrella" del escritorio). */
export function HeroBanner({ icon: Icon, label, title, children, className = '' }) {
    return (
        <div
            className={cn(
                'mb-6 flex items-center gap-4 rounded-2xl bg-gradient-to-r from-primary-600 to-primary-500 p-5 text-white shadow-sm',
                className,
            )}
        >
            <Icon className="h-8 w-8 shrink-0" />
            <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-white/80">{label}</p>
                <p className="truncate text-lg font-extrabold">{title}</p>
                <p className="text-sm text-white/90">{children}</p>
            </div>
        </div>
    );
}

export const EmptyChart = ({ text = 'Sin datos en este periodo' }) => (
    <div className="flex h-full items-center justify-center text-sm text-warm-400">{text}</div>
);

/* ------------------------------------------------------------------ */
/*  Gráficos                                                           */
/* ------------------------------------------------------------------ */

/**
 * Área suavizada con degradado (estilo "tendencia"). El eje X usa `grupo`
 * (YYYY-MM-DD o YYYY-MM) y se etiqueta según `agrupar`.
 * series: [{ key, name, color, dashed }] — dashed = línea punteada sin relleno.
 */
export function TendenciaChart({ data = [], agrupar = 'dia', series, height = 'h-80' }) {
    const uid = useId().replace(/[^a-zA-Z0-9]/g, '');

    return (
        <div className={height}>
            {data.length ? (
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                        <defs>
                            {series.filter((s) => !s.dashed).map((s) => (
                                <linearGradient key={s.key} id={`g${uid}${s.key}`} x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor={s.color} stopOpacity={0.55} />
                                    <stop offset="100%" stopColor={s.color} stopOpacity={0.04} />
                                </linearGradient>
                            ))}
                        </defs>
                        <CartesianGrid strokeDasharray="4 4" stroke={colors.chartGrid} />
                        <XAxis
                            dataKey="grupo"
                            tickFormatter={(v) => etiquetaPeriodo(v, agrupar)}
                            tick={{ fontSize: 11 }}
                            stroke={colors.warm500}
                            tickLine={false}
                            interval={agrupar === 'mes' ? 0 : 'preserveStartEnd'}
                            minTickGap={24}
                        />
                        <YAxis tick={{ fontSize: 11 }} stroke={colors.warm500} tickLine={false} width={64} tickFormatter={(v) => num(v)} />
                        <Tooltip
                            contentStyle={tooltipStyle}
                            formatter={(v) => money(v)}
                            labelFormatter={(v) => etiquetaPeriodo(v, agrupar, true)}
                        />
                        <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
                        {series.map((s) => (
                            <Area
                                key={s.key}
                                type="monotone"
                                dataKey={s.key}
                                name={s.name}
                                stroke={s.color}
                                strokeWidth={s.dashed ? 1.5 : 2}
                                strokeDasharray={s.dashed ? '5 4' : undefined}
                                fill={s.dashed ? 'none' : `url(#g${uid}${s.key})`}
                                dot={false}
                                activeDot={{ r: 5 }}
                            />
                        ))}
                    </AreaChart>
                </ResponsiveContainer>
            ) : (
                <EmptyChart />
            )}
        </div>
    );
}

/** Ranking horizontal (top N) para agrupaciones no temporales. */
export function RankingChart({
    data = [], dataKey = 'ganancia', nameKey = 'grupo', color = GREEN, label = 'Ganancia',
    formatter = money, height = 'h-80',
}) {
    const corto = (v) => (String(v).length > 24 ? `${String(v).slice(0, 23)}…` : v);

    return (
        <div className={height}>
            {data.length ? (
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="4 4" stroke={colors.chartGrid} horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 11 }} stroke={colors.warm500} tickLine={false} tickFormatter={(v) => num(v)} />
                        <YAxis type="category" dataKey={nameKey} width={150} tick={{ fontSize: 11 }} stroke={colors.warm500} tickLine={false} tickFormatter={corto} />
                        <Tooltip contentStyle={tooltipStyle} formatter={(v) => [formatter(v), label]} />
                        <Bar dataKey={dataKey} fill={color} radius={[0, 6, 6, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            ) : (
                <EmptyChart />
            )}
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  Tabla de reporte                                                   */
/* ------------------------------------------------------------------ */

/** Barra de participación (%) para celdas de tabla. */
export function ShareBar({ value, color = 'bg-green-500' }) {
    const v = Math.max(0, Math.min(100, Number(value) || 0));

    return (
        <span className="inline-flex w-full items-center justify-end gap-2">
            <span className="h-1.5 w-16 overflow-hidden rounded-full bg-gray-100">
                <span className={cn('block h-full rounded-full', color)} style={{ width: `${v}%` }} />
            </span>
            <span className="w-14 text-right tabular-nums">{pct(value)}</span>
        </span>
    );
}

/**
 * Tabla de reporte con encabezado fijo, orden por columna, búsqueda y totales.
 * En móvil (< md) se muestra como lista de tarjetas, igual que DataTable.
 *
 * columns: [{ key, label, align: 'left' | 'right', width, className, sortable,
 *            render(row, index), total(totales), sortValue(row), searchValue(row),
 *            mobile: 'title' | 'prefix' | 'hidden' }]
 *  - mobile 'title'  → título de la tarjeta (si no hay, la primera columna).
 *  - mobile 'prefix' → se muestra como insignia delante del título (p. ej. el #).
 *  - mobile 'hidden' → no se muestra en la tarjeta.
 */
export function ReportTable({
    columns, rows = [], totales = null, keyField = 'grupo', searchable = true,
    searchPlaceholder = 'Buscar…', emptyText = 'Sin datos en el periodo.', maxHeight = '60vh',
    defaultSort = null, toolbar = null, loading = false,
}) {
    const [q, setQ] = useState('');
    const [sort, setSort] = useState(defaultSort);

    const ordenables = columns.filter((c) => c.sortable !== false);
    const tituloCol = columns.find((c) => c.mobile === 'title') ?? columns.find((c) => !c.mobile);
    const prefijoCols = columns.filter((c) => c.mobile === 'prefix');
    const cuerpoCols = columns.filter((c) => c !== tituloCol && c.mobile !== 'prefix' && c.mobile !== 'hidden');
    const celda = (c, r, i) => (c.render ? c.render(r, i) : r[c.key]);

    const filtradas = useMemo(() => {
        const t = q.trim().toLowerCase();
        if (!t) return rows;
        const cols = columns.filter((c) => c.searchValue || c.align !== 'right');
        return rows.filter((r) =>
            cols.some((c) => String((c.searchValue ? c.searchValue(r) : r[c.key]) ?? '').toLowerCase().includes(t)),
        );
    }, [rows, q, columns]);

    const ordenadas = useMemo(() => {
        const col = sort && columns.find((c) => c.key === sort.key);
        if (!col) return filtradas;
        const val = (r) => (col.sortValue ? col.sortValue(r) : r[col.key]);
        const dir = sort.dir === 'asc' ? 1 : -1;
        return [...filtradas].sort((a, b) => {
            const x = val(a);
            const y = val(b);
            if (typeof x === 'number' && typeof y === 'number') return (x - y) * dir;
            return String(x ?? '').localeCompare(String(y ?? ''), 'es') * dir;
        });
    }, [filtradas, sort, columns]);

    const toggleSort = (key) =>
        setSort((s) => (s?.key === key ? (s.dir === 'desc' ? { key, dir: 'asc' } : null) : { key, dir: 'desc' }));

    const barraEscritorio = searchable || toolbar;
    const sinFilas = (
        <p className="px-3 py-10 text-center text-sm text-warm-400">
            {rows.length ? 'Sin resultados para la búsqueda.' : emptyText}
        </p>
    );

    return (
        <div>
            {(barraEscritorio || ordenables.length > 0) && (
                <div className={cn('mb-3 flex flex-wrap items-center justify-between gap-3', !barraEscritorio && 'md:hidden')}>
                    {searchable ? (
                        <div className="relative w-full sm:w-72">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                            <input
                                value={q}
                                onChange={(e) => setQ(e.target.value)}
                                placeholder={searchPlaceholder}
                                className="block w-full rounded-md border-0 py-2 pl-9 pr-3 text-sm text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-primary-600"
                            />
                        </div>
                    ) : (
                        <span className="hidden md:block" />
                    )}
                    <div className="flex w-full items-center gap-2 sm:w-auto">
                        {/* En móvil no hay encabezado clicable: el orden se elige aquí. */}
                        {ordenables.length > 0 && (
                            <select
                                aria-label="Ordenar por"
                                value={sort ? `${sort.key}:${sort.dir}` : ''}
                                onChange={(e) => {
                                    const [key, dir] = e.target.value.split(':');
                                    setSort(key ? { key, dir } : null);
                                }}
                                className="block w-full rounded-md border-0 py-2 pl-3 pr-8 text-sm text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-primary-600 sm:w-auto md:hidden"
                            >
                                <option value="">Orden original</option>
                                {ordenables.map((c) => (
                                    <Fragment key={c.key}>
                                        <option value={`${c.key}:desc`}>{c.label} ↓</option>
                                        <option value={`${c.key}:asc`}>{c.label} ↑</option>
                                    </Fragment>
                                ))}
                            </select>
                        )}
                        {toolbar}
                    </div>
                </div>
            )}

            {/* Móvil: tarjetas */}
            <div
                className={cn('space-y-3 overflow-y-auto rounded-lg border border-edge bg-gray-50 p-3 transition md:hidden', loading && 'opacity-50')}
                style={{ maxHeight }}
            >
                {ordenadas.length === 0 && sinFilas}
                {ordenadas.map((r, i) => (
                    <div key={r[keyField] ?? i} className="rounded-xl border border-edge bg-white p-4 shadow-sm">
                        <div className="flex items-start gap-2">
                            {prefijoCols.map((c) => (
                                <span key={c.key} className="shrink-0 rounded-md bg-gray-100 px-1.5 py-0.5 text-xs font-semibold text-warm-500">
                                    {celda(c, r, i)}
                                </span>
                            ))}
                            <div className="min-w-0 flex-1 text-sm font-semibold text-warm-900">
                                {tituloCol ? celda(tituloCol, r, i) : null}
                            </div>
                        </div>
                        {cuerpoCols.length > 0 && (
                            <dl className="mt-2 space-y-1">
                                {cuerpoCols.map((c) => (
                                    <div key={c.key} className="flex items-center justify-between gap-3 text-sm">
                                        <dt className="shrink-0 text-xs text-gray-500">{c.label}</dt>
                                        <dd className={cn('min-w-0 truncate text-right tabular-nums text-gray-800', c.className)}>
                                            {celda(c, r, i)}
                                        </dd>
                                    </div>
                                ))}
                            </dl>
                        )}
                    </div>
                ))}
                {totales && rows.length > 0 && (
                    <div className="rounded-xl border border-primary-200 bg-primary-50/60 p-4 shadow-sm">
                        <div className="text-sm font-bold text-warm-900">Total</div>
                        <dl className="mt-2 space-y-1">
                            {cuerpoCols.filter((c) => c.total).map((c) => (
                                <div key={c.key} className="flex items-center justify-between gap-3 text-sm">
                                    <dt className="shrink-0 text-xs text-warm-600">{c.label}</dt>
                                    <dd className="min-w-0 truncate text-right font-bold tabular-nums text-warm-900">{c.total(totales)}</dd>
                                </div>
                            ))}
                        </dl>
                    </div>
                )}
            </div>

            {/* Escritorio / tablet: tabla */}
            <div
                className={cn('hidden overflow-auto rounded-lg border border-edge transition md:block', loading && 'opacity-50')}
                style={{ maxHeight }}
            >
                <table className="w-full min-w-[720px] text-sm">
                    <thead className="sticky top-0 z-10">
                        <tr className="bg-primary-600 text-left text-xs font-semibold uppercase tracking-wide text-white">
                            {columns.map((c) => {
                                const ordenable = c.sortable !== false;
                                const activo = sort?.key === c.key;
                                const Icon = activo ? (sort.dir === 'asc' ? ChevronUp : ChevronDown) : ChevronsUpDown;
                                return (
                                    <th
                                        key={c.key}
                                        style={{ width: c.width }}
                                        onClick={() => ordenable && toggleSort(c.key)}
                                        className={cn(
                                            'select-none px-3 py-2.5',
                                            c.align === 'right' && 'text-right',
                                            ordenable && 'cursor-pointer hover:bg-primary-700',
                                        )}
                                    >
                                        <span className={cn('inline-flex items-center gap-1', c.align === 'right' && 'flex-row-reverse')}>
                                            {c.label}
                                            {ordenable && <Icon className={cn('h-3 w-3', activo ? 'opacity-100' : 'opacity-50')} />}
                                        </span>
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                        {ordenadas.length === 0 && (
                            <tr>
                                <td colSpan={columns.length}>{sinFilas}</td>
                            </tr>
                        )}
                        {ordenadas.map((r, i) => (
                            <tr key={r[keyField] ?? i} className="hover:bg-primary-50/40">
                                {columns.map((c) => (
                                    <td
                                        key={c.key}
                                        className={cn('px-3 py-2 text-warm-800', c.align === 'right' && 'text-right tabular-nums', c.className)}
                                    >
                                        {celda(c, r, i)}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                    {totales && rows.length > 0 && (
                        <tfoot className="sticky bottom-0 z-10">
                            <tr className="border-t-2 border-edge bg-gray-50 font-bold text-warm-900">
                                {columns.map((c) => (
                                    <td key={c.key} className={cn('px-3 py-2.5', c.align === 'right' && 'text-right tabular-nums')}>
                                        {c.total ? c.total(totales) : ''}
                                    </td>
                                ))}
                            </tr>
                        </tfoot>
                    )}
                </table>
            </div>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  Exportar                                                           */
/* ------------------------------------------------------------------ */

/** Descarga un CSV (separador ;, con BOM para que Excel lo abra en UTF-8). */
export function descargarCsv(nombre, headers, rows) {
    const csv = [headers, ...rows].map((r) => r.join(';')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    a.click();
    URL.revokeObjectURL(url);
}
