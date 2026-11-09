import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { activarPestana, cerrarPestana, opcionPorBase, registrarRuta, usePestanas } from '../lib/pestanas';
import { cn } from './ui';

/** Un color por grupo del menú: la raya de la pestaña activa y el texto con el icono de cada pestaña. */
const COLORES = [
    { raya: 'border-t-blue-500', texto: 'text-blue-600' },
    { raya: 'border-t-green-500', texto: 'text-green-600' },
    { raya: 'border-t-teal-500', texto: 'text-teal-600' },
    { raya: 'border-t-purple-500', texto: 'text-purple-600' },
    { raya: 'border-t-amber-500', texto: 'text-amber-600' },
    { raya: 'border-t-rose-500', texto: 'text-rose-600' },
    { raya: 'border-t-indigo-500', texto: 'text-indigo-600' },
];

/**
 * Las pestañas de los submódulos abiertos, en la barra de arriba (a la izquierda del usuario y las alertas). Solo se ven si
 * hay alguna: se abren con clic derecho en el menú lateral y se cierran con su X (o con el botón del medio). La activa se
 * une con el contenido de abajo; cada una recuerda la dirección en la que quedó.
 */
export default function BarraPestanas() {
    const { tabs, activa } = usePestanas();
    const { pathname, search } = useLocation();
    const navigate = useNavigate();
    const ruta = `${pathname}${search}`;
    const lista = useRef(null);

    // La pestaña activa acompaña a la página en la que se está.
    useEffect(() => {
        registrarRuta(ruta);
    }, [ruta]);

    // Con muchas pestañas, la barra se desplaza sola hasta la activa (solo de lado: la página no se mueve).
    useEffect(() => {
        const el = lista.current?.querySelector('[aria-selected="true"]');
        if (!el || !lista.current) return;
        const caja = lista.current;
        if (el.offsetLeft < caja.scrollLeft) caja.scrollLeft = el.offsetLeft;
        else if (el.offsetLeft + el.offsetWidth > caja.scrollLeft + caja.clientWidth) {
            caja.scrollLeft = el.offsetLeft + el.offsetWidth - caja.clientWidth;
        }
    }, [activa, tabs.length]);

    if (tabs.length === 0) return null;

    const ir = (destino) => {
        if (destino && destino !== ruta) navigate(destino);
    };

    return (
        <div
            ref={lista}
            role="tablist"
            aria-label="Pestañas abiertas"
            className="flex h-8 min-w-0 flex-1 items-end overflow-x-auto overflow-y-hidden [scrollbar-width:none]"
        >
            {tabs.map((tab, i) => {
                const opcion = opcionPorBase(tab.base);
                const Icono = opcion?.icon;
                const color = COLORES[(opcion?.grupo ?? 0) % COLORES.length];
                const esActiva = tab.id === activa;
                const sigueActiva = tabs[i + 1]?.id === activa;

                return (
                    <div
                        key={tab.id}
                        role="tab"
                        aria-selected={esActiva}
                        tabIndex={0}
                        onClick={() => ir(activarPestana(tab.id))}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                ir(activarPestana(tab.id));
                            }
                        }}
                        // El botón del medio cierra, como en el navegador.
                        onAuxClick={(e) => {
                            if (e.button === 1) {
                                e.preventDefault();
                                ir(cerrarPestana(tab.id));
                            }
                        }}
                        className={cn(
                            'group flex h-full min-w-[7.5rem] max-w-[14rem] shrink-0 cursor-pointer items-center gap-2 border-t-2 px-3.5 text-[13px] transition',
                            color.texto,
                            esActiva
                                ? cn('rounded-t-lg bg-surface font-semibold', color.raya)
                                : cn(
                                      'border-t-transparent font-medium hover:bg-black/5',
                                      // Una rayita entre pestañas que no tocan a la activa.
                                      !sigueActiva && 'border-r border-r-black/10',
                                  ),
                        )}
                    >
                        {Icono && <Icono className="h-3.5 w-3.5 shrink-0" />}
                        <span className="truncate">{opcion?.label ?? 'Página'}</span>
                        <button
                            type="button"
                            aria-label={`Cerrar ${opcion?.label ?? 'pestaña'}`}
                            onClick={(e) => {
                                e.stopPropagation();
                                ir(cerrarPestana(tab.id));
                            }}
                            className={cn(
                                'ml-auto shrink-0 rounded p-0.5 text-gray-400 transition hover:bg-black/10 hover:text-gray-700',
                                !esActiva && 'hidden',
                            )}
                        >
                            <X className="h-3.5 w-3.5" />
                        </button>
                    </div>
                );
            })}
        </div>
    );
}
