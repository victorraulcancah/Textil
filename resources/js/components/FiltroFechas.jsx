import { Input } from './ui';

/**
 * Desde y hasta por separado, a la vista (no dentro de los filtros): dos campos de fecha para poner en la cabecera de un
 * listado, en la misma fila que sus botones. "Desde" no deja pasar de "Hasta" y al revés.
 *
 *   onDesde / onHasta — reciben el texto aaaa-mm-dd ('' si se borra)
 */
export default function FiltroFechas({ desde, hasta, onDesde, onHasta }) {
    return (
        <>
            <label className="flex items-center gap-2 text-sm font-medium text-warm-600">
                Desde
                <span className="w-40">
                    <Input type="date" max={hasta || undefined} value={desde} onChange={(e) => onDesde(e.target.value)} aria-label="Fecha desde" />
                </span>
            </label>
            <label className="flex items-center gap-2 text-sm font-medium text-warm-600">
                Hasta
                <span className="w-40">
                    <Input type="date" min={desde || undefined} value={hasta} onChange={(e) => onHasta(e.target.value)} aria-label="Fecha hasta" />
                </span>
            </label>
        </>
    );
}
