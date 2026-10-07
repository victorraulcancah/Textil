import { cn } from './ui';

// Un centímetro mide 80 px: 36 números cubren hasta pantallas de 2880 px.
const CENTIMETROS = Array.from({ length: 36 }, (_, i) => i);

// Las marcas: cada centímetro (la más larga), cada 5 mm y cada milímetro, todas colgando del borde de arriba.
const MARCAS = {
    backgroundImage: [
        'linear-gradient(to right, rgba(20,20,20,.9) 1.5px, transparent 1.5px)',
        'linear-gradient(to right, rgba(20,20,20,.85) 1px, transparent 1px)',
        'linear-gradient(to right, rgba(20,20,20,.7) 1px, transparent 1px)',
    ].join(','),
    backgroundSize: '80px 26px, 40px 18px, 8px 10px',
    backgroundRepeat: 'repeat-x',
    backgroundPosition: 'left top',
};

/**
 * Una cinta métrica amarilla con su marcador. Es decorativa: el marcador avanza con lo que se va llenando del
 * formulario (`progreso` de 0 a 1) y se pone rojo y se queda cuando hay un error.
 */
export default function CintaMetrica({ progreso = 0, error = false, className }) {
    // Del 6 % al 94 %: así el marcador nunca queda cortado por el borde.
    const posicion = 6 + Math.min(1, Math.max(0, progreso)) * 88;
    const tinta = error ? 'bg-red-600' : 'bg-primary-900';

    return (
        <div
            aria-hidden="true"
            className={cn('relative h-14 select-none overflow-hidden bg-[#f6c915] shadow-[0_-1px_0_rgba(0,0,0,.25),0_1px_0_rgba(0,0,0,.25)]', className)}
            style={MARCAS}
        >
            {CENTIMETROS.map((cm) => (
                <span
                    key={cm}
                    className="absolute top-[29px] text-[11px] font-bold leading-none tabular-nums text-neutral-900"
                    style={{ left: cm * 80 + 5 }}
                >
                    {cm}
                </span>
            ))}

            <span
                className="absolute inset-y-0 w-0.5 -translate-x-1/2 motion-safe:transition-[left] motion-safe:duration-700 motion-safe:ease-[cubic-bezier(0.16,1,0.3,1)]"
                style={{ left: `${posicion}%` }}
            >
                <span className={cn('absolute inset-0 transition-colors', tinta)} />
                <span className={cn('absolute -left-[5px] top-0 h-3 w-3 transition-colors', tinta)} />
            </span>
        </div>
    );
}
