import { Input, cn } from '../ui';

export const ALCANCES = [
    { value: 'una_vez', label: 'Una sola vez', ayuda: 'Se gasta con el primer uso que salga bien.' },
    { value: 'temporal', label: 'Por un tiempo', ayuda: 'Vale hasta la fecha que elijas.' },
    { value: 'permanente', label: 'Permanente', ayuda: 'Vale hasta que alguien lo revoque.' },
];

/** Fecha y hora de mañana a esta hora, en el formato del input datetime-local. */
export function mananaLocal() {
    const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
}

/** Cuánto dura una excepción (para listas). */
export function textoVigencia(e) {
    if (e.alcance === 'una_vez') return 'Una sola vez';
    if (e.alcance === 'temporal') {
        return `Hasta ${new Date(e.expira_en).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' })}`;
    }
    return 'Permanente';
}

/** Elección del alcance de un acceso: una vez, temporal (con vencimiento) o permanente. */
export default function AlcanceFields({ alcance, expiraEn, onAlcance, onExpiraEn, error }) {
    const actual = ALCANCES.find((a) => a.value === alcance);

    return (
        <div className="space-y-3">
            <div>
                <p className="mb-1 block text-sm font-medium text-gray-700">¿Por cuánto tiempo?</p>
                <div className="grid gap-2 sm:grid-cols-3">
                    {ALCANCES.map((a) => (
                        <button
                            key={a.value}
                            type="button"
                            onClick={() => onAlcance(a.value)}
                            className={cn(
                                'rounded-md px-3 py-2 text-sm font-medium ring-1 ring-inset transition',
                                a.value === alcance
                                    ? 'bg-primary-50 text-primary-700 ring-primary-300'
                                    : 'bg-white text-warm-700 ring-gray-300 hover:bg-gray-50',
                            )}
                        >
                            {a.label}
                        </button>
                    ))}
                </div>
                {actual && <p className="mt-1 text-xs text-warm-500">{actual.ayuda}</p>}
            </div>

            {alcance === 'temporal' && (
                <Input
                    label="Vence el"
                    type="datetime-local"
                    value={expiraEn}
                    onChange={(e) => onExpiraEn(e.target.value)}
                    error={error}
                />
            )}
        </div>
    );
}
