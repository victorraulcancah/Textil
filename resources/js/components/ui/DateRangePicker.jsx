import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, X } from 'lucide-react';
import { cn } from './cn';

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MESES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const pad = (n) => String(n).padStart(2, '0');
/** 'YYYY-MM-DD' → Date local (sin líos de zona horaria de toISOString). */
const toIso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromIso = (s) => {
    if (!s) return null;
    const [y, m, d] = s.split('-').map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
};
const fmtCorto = (s) => {
    const d = fromIso(s);
    return d ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}` : '';
};
const sameDay = (a, b) =>
    a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const addDays = (d, n) => {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
};
const startOfWeek = (d) => addDays(d, -((d.getDay() + 6) % 7));
const hoy = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
};

/** Rangos rápidos que se ven en la barra lateral del calendario. */
export const RANGOS_RAPIDOS = [
    { key: 'esta_semana', label: 'Esta semana', rango: () => [startOfWeek(hoy()), hoy()] },
    {
        key: 'ultima_semana',
        label: 'Última semana',
        rango: () => {
            const finPasada = addDays(startOfWeek(hoy()), -1);
            return [addDays(finPasada, -6), finPasada];
        },
    },
    { key: 'este_mes', label: 'Este mes', rango: () => [new Date(hoy().getFullYear(), hoy().getMonth(), 1), hoy()] },
    {
        key: 'ultimo_mes',
        label: 'Último mes',
        rango: () => {
            const h = hoy();
            return [new Date(h.getFullYear(), h.getMonth() - 1, 1), new Date(h.getFullYear(), h.getMonth(), 0)];
        },
    },
    { key: 'este_anio', label: 'Este año', rango: () => [new Date(hoy().getFullYear(), 0, 1), hoy()] },
    {
        key: 'ultimo_anio',
        label: 'Último año',
        rango: () => {
            const h = hoy();
            return [new Date(h.getFullYear() - 1, 0, 1), new Date(h.getFullYear() - 1, 11, 31)];
        },
    },
];

/** 6 semanas (42 días) que cubren el mes, empezando en lunes. */
const diasDelMes = (year, month) => {
    const inicio = startOfWeek(new Date(year, month, 1));
    return Array.from({ length: 42 }, (_, i) => addDays(inicio, i));
};

function MesCalendario({ year, month, desdeDate, hastaDate, hoverDate, onPick, onHover }) {
    const dias = useMemo(() => diasDelMes(year, month), [year, month]);
    const t = hoy();

    const enRango = (d) => {
        const fin = hastaDate ?? (desdeDate && hoverDate ? hoverDate : null);
        if (!desdeDate || !fin) return false;
        const [lo, hi] = desdeDate <= fin ? [desdeDate, fin] : [fin, desdeDate];
        return d >= lo && d <= hi;
    };

    return (
        <div className="w-full select-none">
            <div className="grid grid-cols-7 gap-y-1 text-center text-xs">
                {DIAS.map((d) => (
                    <div key={d} className="pb-1 font-semibold text-warm-500">
                        {d}
                    </div>
                ))}
                {dias.map((d, i) => {
                    const fueraDeMes = d.getMonth() !== month;
                    const esDesde = sameDay(d, desdeDate);
                    const esHasta = sameDay(d, hastaDate);
                    const esExtremo = esDesde || esHasta;
                    const dentro = !esExtremo && enRango(d);

                    return (
                        <button
                            key={i}
                            type="button"
                            tabIndex={-1}
                            disabled={fueraDeMes}
                            onMouseEnter={() => onHover(d)}
                            onClick={() => onPick(d)}
                            className={cn(
                                'flex h-8 w-8 items-center justify-center rounded-full text-sm transition mx-auto',
                                fueraDeMes && 'invisible',
                                !fueraDeMes && !esExtremo && !dentro && 'text-warm-800 hover:bg-primary-50',
                                dentro && 'rounded-none bg-primary-50 text-primary-700',
                                esExtremo && 'bg-primary-600 font-semibold text-white hover:bg-primary-600',
                                !fueraDeMes && sameDay(d, t) && !esExtremo && 'ring-1 ring-inset ring-primary-300',
                            )}
                        >
                            {d.getDate()}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

/**
 * Selector de rango de fechas: un solo campo ("01/09/2026 → 17/09/2026") que
 * abre un calendario de dos meses con rangos rápidos al costado.
 *
 * Controlado igual que los demás campos: `desde`/`hasta` en 'YYYY-MM-DD' y
 * `onChange(desde, hasta)`. Mientras el rango está a medio elegir (ya hay
 * `desde` pero no `hasta`), el segundo clic lo completa y cierra el popover.
 */
export default function DateRangePicker({
    label,
    desde = '',
    hasta = '',
    onChange,
    presets = RANGOS_RAPIDOS,
    placeholder = 'Selecciona un rango…',
    clearable = true,
    error,
    disabled = false,
    className,
    id: idProp,
}) {
    const autoId = useId();
    const id = idProp ?? autoId;

    const [abierto, setAbierto] = useState(false);
    const [hoverDate, setHoverDate] = useState(null);
    const [menuStyle, setMenuStyle] = useState(null);

    const anchorRef = useRef(null);
    const menuRef = useRef(null);

    const desdeDate = useMemo(() => fromIso(desde), [desde]);
    const hastaDate = useMemo(() => fromIso(hasta), [hasta]);

    /** Primer día visible del mes izquierdo; el derecho es el siguiente. */
    const [base, setBase] = useState(() => {
        const ref = hastaDate ?? desdeDate ?? hoy();
        return new Date(ref.getFullYear(), ref.getMonth() - 1, 1);
    });

    const abrir = useCallback(() => {
        if (disabled) return;
        const ref = hastaDate ?? desdeDate ?? hoy();
        setBase(new Date(ref.getFullYear(), ref.getMonth() - 1, 1));
        setAbierto(true);
    }, [disabled, desdeDate, hastaDate]);

    const cerrar = useCallback(() => setAbierto(false), []);

    const posicionar = useCallback(() => {
        const el = anchorRef.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const abajo = window.innerHeight - r.bottom;
        const haciaArriba = abajo < 420 && r.top > abajo;
        setMenuStyle({
            left: Math.max(8, Math.min(r.left, window.innerWidth - 640)),
            ...(haciaArriba ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }),
        });
    }, []);

    useLayoutEffect(() => {
        if (!abierto) return undefined;
        posicionar();
        window.addEventListener('scroll', posicionar, true);
        window.addEventListener('resize', posicionar);
        return () => {
            window.removeEventListener('scroll', posicionar, true);
            window.removeEventListener('resize', posicionar);
        };
    }, [abierto, posicionar]);

    useEffect(() => {
        if (!abierto) return undefined;
        const alClic = (e) => {
            if (anchorRef.current?.contains(e.target) || menuRef.current?.contains(e.target)) return;
            cerrar();
        };
        document.addEventListener('mousedown', alClic);
        return () => document.removeEventListener('mousedown', alClic);
    }, [abierto, cerrar]);

    useEffect(() => {
        if (!abierto) return undefined;
        const alEscape = (e) => {
            if (e.key !== 'Escape') return;
            e.stopPropagation();
            cerrar();
        };
        document.addEventListener('keydown', alEscape, true);
        return () => document.removeEventListener('keydown', alEscape, true);
    }, [abierto, cerrar]);

    /** Un rango a medio elegir (hay `desde` pero no `hasta`) se completa al
        segundo clic; cualquier otro clic empieza uno nuevo. */
    const elegirDia = (d) => {
        if (desdeDate && !hastaDate) {
            if (sameDay(d, desdeDate)) return;
            if (d < desdeDate) onChange?.(toIso(d), toIso(desdeDate));
            else onChange?.(toIso(desdeDate), toIso(d));
            cerrar();
        } else {
            onChange?.(toIso(d), '');
        }
    };

    const elegirPreset = (preset) => {
        const [a, b] = preset.rango();
        onChange?.(toIso(a), toIso(b));
        cerrar();
    };

    const limpiar = (e) => {
        e.stopPropagation();
        onChange?.('', '');
    };

    const mesIzq = base;
    const mesDer = new Date(base.getFullYear(), base.getMonth() + 1, 1);

    const texto =
        desde && hasta
            ? `${fmtCorto(desde)}  →  ${fmtCorto(hasta)}`
            : desde
              ? `${fmtCorto(desde)}  →  …`
              : '';

    const menu =
        abierto && menuStyle
            ? createPortal(
                  <div
                      ref={menuRef}
                      style={{ position: 'fixed', ...menuStyle, zIndex: 200 }}
                      className="flex overflow-hidden rounded-lg border border-edge bg-white shadow-2xl"
                  >
                      {/* Rangos rápidos */}
                      <div className="w-40 shrink-0 border-r border-edge bg-gray-50 py-2">
                          {presets.map((p) => (
                              <button
                                  key={p.key}
                                  type="button"
                                  onClick={() => elegirPreset(p)}
                                  className="block w-full px-4 py-2 text-left text-sm text-warm-700 transition hover:bg-primary-50 hover:text-primary-700"
                              >
                                  {p.label}
                              </button>
                          ))}
                      </div>

                      {/* Dos meses */}
                      <div className="w-[36rem] p-4">
                          <div className="mb-3 flex items-center justify-between">
                              <div className="flex items-center gap-1">
                                  <button
                                      type="button"
                                      aria-label="Año anterior"
                                      onClick={() => setBase(new Date(base.getFullYear() - 1, base.getMonth(), 1))}
                                      className="rounded p-1 text-warm-500 hover:bg-gray-100"
                                  >
                                      <ChevronsLeft className="h-4 w-4" />
                                  </button>
                                  <button
                                      type="button"
                                      aria-label="Mes anterior"
                                      onClick={() => setBase(new Date(base.getFullYear(), base.getMonth() - 1, 1))}
                                      className="rounded p-1 text-warm-500 hover:bg-gray-100"
                                  >
                                      <ChevronLeft className="h-4 w-4" />
                                  </button>
                              </div>
                              <span className="text-sm font-semibold text-warm-900">
                                  {MESES[mesIzq.getMonth()]} {mesIzq.getFullYear()}
                              </span>
                              <span className="text-sm font-semibold text-warm-900">
                                  {MESES[mesDer.getMonth()]} {mesDer.getFullYear()}
                              </span>
                              <div className="flex items-center gap-1">
                                  <button
                                      type="button"
                                      aria-label="Mes siguiente"
                                      onClick={() => setBase(new Date(base.getFullYear(), base.getMonth() + 1, 1))}
                                      className="rounded p-1 text-warm-500 hover:bg-gray-100"
                                  >
                                      <ChevronRight className="h-4 w-4" />
                                  </button>
                                  <button
                                      type="button"
                                      aria-label="Año siguiente"
                                      onClick={() => setBase(new Date(base.getFullYear() + 1, base.getMonth(), 1))}
                                      className="rounded p-1 text-warm-500 hover:bg-gray-100"
                                  >
                                      <ChevronsRight className="h-4 w-4" />
                                  </button>
                              </div>
                          </div>
                          <div className="grid grid-cols-2 gap-6" onMouseLeave={() => setHoverDate(null)}>
                              <MesCalendario
                                  year={mesIzq.getFullYear()}
                                  month={mesIzq.getMonth()}
                                  desdeDate={desdeDate}
                                  hastaDate={hastaDate}
                                  hoverDate={hoverDate}
                                  onPick={elegirDia}
                                  onHover={setHoverDate}
                              />
                              <MesCalendario
                                  year={mesDer.getFullYear()}
                                  month={mesDer.getMonth()}
                                  desdeDate={desdeDate}
                                  hastaDate={hastaDate}
                                  hoverDate={hoverDate}
                                  onPick={elegirDia}
                                  onHover={setHoverDate}
                              />
                          </div>
                      </div>
                  </div>,
                  document.body,
              )
            : null;

    return (
        <div className={cn('w-full', className)}>
            {label && (
                <label htmlFor={id} className="mb-1 block text-sm font-medium text-gray-700">
                    {label}
                </label>
            )}
            <div ref={anchorRef} className="relative">
                <button
                    id={id}
                    type="button"
                    disabled={disabled}
                    onClick={() => (abierto ? cerrar() : abrir())}
                    className={cn(
                        'flex h-[38px] w-full items-center gap-2 rounded-md border-0 bg-white px-3 text-left text-sm shadow-sm ring-1 ring-inset ring-gray-300',
                        'focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-600',
                        disabled && 'cursor-not-allowed bg-gray-50 text-gray-500',
                        error && 'ring-red-500 focus:ring-red-500',
                    )}
                >
                    <Calendar className="h-4 w-4 shrink-0 text-gray-400" />
                    <span className={cn('flex-1 truncate', texto ? 'text-warm-900' : 'text-gray-400')}>
                        {texto || placeholder}
                    </span>
                    {clearable && (desde || hasta) && !disabled && (
                        <span
                            role="button"
                            tabIndex={-1}
                            onClick={limpiar}
                            aria-label="Limpiar rango"
                            className="rounded p-0.5 text-gray-400 transition hover:bg-gray-100 hover:text-warm-900"
                        >
                            <X className="h-3.5 w-3.5" />
                        </span>
                    )}
                </button>
            </div>
            {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
            {menu}
        </div>
    );
}
