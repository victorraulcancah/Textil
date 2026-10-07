import { ArrowUpRight } from 'lucide-react';
import { cn } from './ui';

const SITIO = 'https://magus-ecommerce.com/';

/**
 * La firma de quien desarrolló el sistema. El logo de Magus es celeste neón: sobre blanco casi no se ve, así que
 * siempre va sobre su propio fondo oscuro, donde brilla. Lleva al sitio de Magus Technologies.
 *
 *   variante "bloque" — la firma grande, para el login: logo, nombre y sitio
 *   variante "chip"   — la firma compacta, para el menú lateral; con `compacto` solo el logo (menú replegado)
 */
export default function CreditoMagus({ variante = 'chip', compacto = false, className }) {
    const comun =
        'group relative flex items-center bg-[#0a1424] outline-none ring-1 ring-[#00e5ff]/20 transition duration-200 ' +
        'hover:ring-[#00e5ff]/60 focus-visible:ring-2 focus-visible:ring-[#00e5ff]';

    if (variante === 'bloque') {
        return (
            <a
                href={SITIO}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Desarrollado por Magus Technologies (abre magus-ecommerce.com)"
                className={cn(comun, 'gap-4 rounded-2xl px-5 py-4 hover:shadow-[0_10px_32px_-10px_rgba(0,229,255,0.5)]', className)}
            >
                <img src="/img/mgs.png" alt="" className="h-10 w-auto shrink-0" />
                <span className="min-w-0 flex-1 border-l border-white/10 pl-4">
                    <span className="block text-sm font-semibold leading-snug text-white">
                        Desarrollado por Magus Technologies
                    </span>
                    <span className="mt-0.5 flex items-center gap-1 text-xs text-[#7fefff]">
                        magus-ecommerce.com
                        <ArrowUpRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                    </span>
                </span>
            </a>
        );
    }

    return (
        <a
            href={SITIO}
            target="_blank"
            rel="noopener noreferrer"
            title="Desarrollado por Magus Technologies"
            aria-label="Desarrollado por Magus Technologies (abre magus-ecommerce.com)"
            className={cn(comun, 'justify-center gap-2.5 rounded-xl', compacto ? 'px-1.5 py-2' : 'px-3 py-2.5', className)}
        >
            <img src="/img/mgs.png" alt="" className={cn('w-auto shrink-0', compacto ? 'h-3.5' : 'h-5')} />
            {!compacto && (
                <span className="min-w-0 text-[11px] leading-tight text-[#9fb4c7]">
                    Desarrollado por <span className="block font-semibold text-white">Magus Technologies</span>
                </span>
            )}
        </a>
    );
}
