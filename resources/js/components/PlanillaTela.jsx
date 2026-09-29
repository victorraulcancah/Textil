import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { totalesDe } from '../lib/planilla';
import { cn } from './ui';

const num = (n) => new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 }).format(Number(n) || 0);

const money = (n, moneda = 'PEN') =>
    new Intl.NumberFormat('es-PE', { style: 'currency', currency: moneda || 'PEN' }).format(Number(n) || 0);

/** Un número, o el texto tal cual ("Por definir"), o nada. */
const cifra = (v, formato = num) => (typeof v === 'number' ? formato(v) : (v ?? ''));

const th = 'border border-gray-300 bg-primary-600 px-3 py-2 text-center text-xs font-bold uppercase text-white';
const td = 'border border-gray-300 px-3 py-1.5';

/** Las mismas columnas en cada tela y en el TOTAL, para que los números caigan alineados. */
const Columnas = ({ precios, accion }) => (
    <colgroup>
        {(precios ? [17, 17, 9, 11, 12, 17, 17] : [26, 24, 12, 16, 16]).map((ancho, i) => (
            <col key={i} style={{ width: `${ancho}%` }} />
        ))}
        {accion && <col style={{ width: '48px' }} />}
    </colgroup>
);

/**
 * La planilla de telas (pedido, proforma y despacho), como la hoja de Excel:
 *
 *   01-01 TELA: POLINAN CE
 *   ITEM · COLOR · ROLLO · FACTOR · METROS · PRECIO UNITARIO · PRECIO TOTAL
 *   una fila por rollo, SUB TOTAL por tela y TOTAL al final.
 *
 * Cada tela es un desplegable: su título con sus totales, y al tocarlo se
 * abre o se pliega su tabla.
 *
 * `grupos` sale de lib/planilla.js (gruposDeProforma / gruposDePedido).
 *   pendiente — el TOTAL avisa que falta separar rollos.
 *   precios   — con las columnas de precio (por defecto); el almacén las oculta.
 *   accion    — (fila) => nodo: una columna más al final (p. ej. quitar un rollo).
 *   completa  — (fila) => bool: marca la fila como cubierta (verde).
 */
export default function PlanillaTela({ grupos = [], moneda = 'PEN', pendiente = false, precios = true, accion = null, completa = null }) {
    const totales = totalesDe(grupos);
    /** Telas plegadas: se ven abiertas y se pliegan con la flecha, como en el pedido. */
    const [plegadas, setPlegadas] = useState({});
    const alternar = (clave) => setPlegadas((prev) => ({ ...prev, [clave]: !prev[clave] }));
    const importe = (v) => cifra(v, (n) => money(n, moneda));
    const titulos = precios
        ? ['Ítem', 'Color', 'Rollo', 'Factor', 'Metros', 'Precio unitario', 'Precio total']
        : ['Ítem', 'Color', 'Rollo', 'Factor', 'Metros'];

    if (grupos.length === 0) {
        return <p className="px-3 py-8 text-center text-sm text-warm-500">Sin productos.</p>;
    }

    return (
        <div className="space-y-5">
            {grupos.map((g) => {
                const abierta = !plegadas[g.clave];
                const colores = new Set(g.filas.map((f) => f.color || 'x')).size;

                return (
                    <div key={g.clave} className="overflow-hidden rounded-lg border border-edge">
                        {/* La tela: su título y sus totales; al tocarla se despliega su tabla. */}
                        <button
                            type="button"
                            onClick={() => alternar(g.clave)}
                            aria-expanded={abierta}
                            className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 bg-gray-50 px-3 py-2 text-left transition hover:bg-gray-100"
                        >
                            <ChevronRight className={cn('h-4 w-4 shrink-0 text-warm-500 transition-transform duration-300', abierta && 'rotate-90')} />
                            <span className="text-sm font-bold uppercase text-warm-900">{g.titulo}</span>
                            <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-warm-700 ring-1 ring-black/5">
                                {colores} color{colores === 1 ? '' : 'es'}
                            </span>
                            <span className="ml-auto text-xs text-warm-500">
                                {g.rollos} rollo{g.rollos === 1 ? '' : 's'}
                                {g.metros ? ` · ${num(g.metros)} m` : ''}
                                {precios && (
                                    <>
                                        {' '}
                                        · <span className="font-semibold text-primary-700">{money(g.total, moneda)}</span>
                                    </>
                                )}
                            </span>
                        </button>

                        <div className={cn('grid transition-[grid-template-rows] duration-300 ease-out', abierta ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
                            <div className="overflow-hidden">
                                <div className="overflow-x-auto p-2">
                                    <table className="w-full min-w-[560px] table-fixed border-collapse text-sm">
                                        <Columnas precios={precios} accion={accion} />
                                        <thead>
                                            <tr>
                                                {titulos.map((t) => (
                                                    <th key={t} className={th}>
                                                        {t}
                                                    </th>
                                                ))}
                                                {accion && <th className={th} />}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {g.filas.map((f) => (
                                                <tr key={f.clave} className={cn('hover:bg-gray-50', completa?.(f) && 'bg-green-50/60')}>
                                                    <td className={`${td} whitespace-nowrap font-mono text-xs`}>
                                                        {f.item}
                                                        {f.detalle && <span className="block text-[10px] text-warm-400">{f.detalle}</span>}
                                                    </td>
                                                    <td className={`${td} uppercase`}>
                                                        {f.color ? (
                                                            <span className="inline-flex items-center gap-1.5">
                                                                {f.hex && (
                                                                    <span
                                                                        className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/10"
                                                                        style={{ backgroundColor: f.hex }}
                                                                    />
                                                                )}
                                                                {f.color}
                                                            </span>
                                                        ) : (
                                                            '—'
                                                        )}
                                                    </td>
                                                    <td className={`${td} text-center`}>{f.rollo}</td>
                                                    <td className={`${td} text-center`}>{cifra(f.factor)}</td>
                                                    <td className={`${td} text-center`}>{cifra(f.metros)}</td>
                                                    {precios && (
                                                        <>
                                                            <td className={`${td} text-center`}>{f.precio == null ? 'Por confirmar' : money(f.precio, moneda)}</td>
                                                            <td className={`${td} text-center font-medium`}>{importe(f.total)}</td>
                                                        </>
                                                    )}
                                                    {accion && <td className={`${td} text-center`}>{accion(f)}</td>}
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot>
                                            <tr className="font-bold uppercase">
                                                <td className={`${td} border-x-0`} colSpan={2}>
                                                    Sub total
                                                </td>
                                                <td className={`${td} border-x-0 text-center`}>{g.rollos || ''}</td>
                                                <td className={`${td} border-x-0`} />
                                                <td className={`${td} border-x-0 text-center`}>{g.metros ? num(g.metros) : ''}</td>
                                                {precios && (
                                                    <>
                                                        <td className={`${td} border-x-0`} />
                                                        <td className={`${td} border-x-0 text-center`}>{money(g.total, moneda)}</td>
                                                    </>
                                                )}
                                                {accion && <td className={`${td} border-x-0`} />}
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })}

            <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] table-fixed border-collapse text-sm">
                    <Columnas precios={precios} accion={accion} />
                    <tbody>
                        <tr className="border-y-2 border-gray-400 font-bold uppercase">
                            <td className="px-3 py-2" colSpan={2}>
                                Total{pendiente ? ' (parcial: falta separar rollos)' : ''}
                            </td>
                            <td className="px-3 py-2 text-center">{totales.rollos || ''}</td>
                            <td className="px-3 py-2" />
                            <td className="px-3 py-2 text-center">{totales.metros ? num(totales.metros) : ''}</td>
                            {precios && (
                                <>
                                    <td className="px-3 py-2" />
                                    <td className="px-3 py-2 text-center">{money(totales.total, moneda)}</td>
                                </>
                            )}
                            {accion && <td />}
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    );
}
