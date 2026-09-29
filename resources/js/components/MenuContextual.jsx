import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const ANCHO = 232;

/**
 * El menú del clic derecho: aparece donde se hizo clic (sin salirse de la
 * pantalla) y se cierra al elegir, al hacer clic fuera, con Escape o al
 * desplazar.
 *
 *   menu:  { x, y } o null
 *   items: [{ label, icon: Icon, onClick, hidden? } | '-' (separador)]
 */
export default function MenuContextual({ menu, items = [], onClose, titulo }) {
    const ref = useRef(null);
    const [pos, setPos] = useState({ top: 0, left: 0 });

    // Lo que no se ve no se cuenta; y sin separadores de más al inicio, al final ni seguidos.
    const visibles = items
        .filter((it) => it && !it.hidden)
        .filter((it, i, lista) => it !== '-' || (i > 0 && i < lista.length - 1 && lista[i - 1] !== '-'));

    useLayoutEffect(() => {
        if (!menu || !ref.current) return;
        const alto = ref.current.offsetHeight;
        setPos({
            left: Math.max(8, Math.min(menu.x, window.innerWidth - ANCHO - 8)),
            top: Math.max(8, Math.min(menu.y, window.innerHeight - alto - 8)),
        });
    }, [menu]);

    useEffect(() => {
        if (!menu) return undefined;
        const fuera = (e) => !ref.current?.contains(e.target) && onClose();
        const tecla = (e) => e.key === 'Escape' && onClose();
        document.addEventListener('mousedown', fuera);
        document.addEventListener('keydown', tecla);
        window.addEventListener('scroll', onClose, true);
        window.addEventListener('resize', onClose);
        return () => {
            document.removeEventListener('mousedown', fuera);
            document.removeEventListener('keydown', tecla);
            window.removeEventListener('scroll', onClose, true);
            window.removeEventListener('resize', onClose);
        };
    }, [menu, onClose]);

    if (!menu || visibles.length === 0) return null;

    return createPortal(
        <div
            ref={ref}
            role="menu"
            style={{ top: pos.top, left: pos.left, width: ANCHO }}
            className="fixed z-[120] overflow-hidden rounded-lg border border-edge bg-white py-1 shadow-lg"
            onContextMenu={(e) => e.preventDefault()}
        >
            {titulo && (
                <p className="truncate border-b border-edge px-3 pb-1.5 pt-1 text-xs font-semibold text-warm-500">{titulo}</p>
            )}
            {visibles.map((it, i) => {
                if (it === '-') return <div key={`sep-${i}`} className="my-1 border-t border-edge" />;
                const Icon = it.icon;
                return (
                    <button
                        key={it.label}
                        type="button"
                        role="menuitem"
                        onClick={() => {
                            onClose();
                            it.onClick();
                        }}
                        className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-warm-800 transition hover:bg-gray-50"
                    >
                        {Icon && <Icon className="h-4 w-4 shrink-0 text-primary-600" />}
                        {it.label}
                    </button>
                );
            })}
        </div>,
        document.body,
    );
}
