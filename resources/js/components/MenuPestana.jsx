import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ExternalLink, SquareArrowOutUpRight } from 'lucide-react';

/**
 * El menú del clic derecho sobre una opción del menú lateral: abrirla en una pestaña nueva o en la actual. Va en un portal
 * porque el menú lateral recorta su contenido, y se cierra con cualquier clic fuera, con Esc o al desplazarse.
 */
export default function MenuPestana({ menu, onCerrar, onNueva, onActual }) {
    useEffect(() => {
        if (!menu) return undefined;

        const cerrar = () => onCerrar();
        const tecla = (e) => e.key === 'Escape' && onCerrar();

        window.addEventListener('click', cerrar);
        window.addEventListener('scroll', cerrar, true);
        window.addEventListener('resize', cerrar);
        window.addEventListener('keydown', tecla);

        return () => {
            window.removeEventListener('click', cerrar);
            window.removeEventListener('scroll', cerrar, true);
            window.removeEventListener('resize', cerrar);
            window.removeEventListener('keydown', tecla);
        };
    }, [menu, onCerrar]);

    if (!menu) return null;

    // Que no se salga de la pantalla por la derecha ni por abajo.
    const left = Math.min(menu.x, window.innerWidth - 232);
    const top = Math.min(menu.y, window.innerHeight - 96);

    return createPortal(
        <div
            role="menu"
            style={{ position: 'fixed', top, left, zIndex: 70 }}
            onContextMenu={(e) => e.preventDefault()}
            className="w-56 rounded-xl border border-edge bg-white p-1.5 text-[13px] shadow-xl"
        >
            <div className="truncate px-2.5 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400">
                {menu.item.label}
            </div>
            <button
                type="button"
                role="menuitem"
                onClick={() => onNueva(menu.item)}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-left text-gray-700 transition hover:bg-primary-50 hover:text-primary-700"
            >
                <SquareArrowOutUpRight className="h-4 w-4 shrink-0" />
                Abrir en una pestaña nueva
            </button>
            <button
                type="button"
                role="menuitem"
                onClick={() => onActual(menu.item)}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-left text-gray-700 transition hover:bg-gray-100"
            >
                <ExternalLink className="h-4 w-4 shrink-0" />
                Abrir aquí
            </button>
        </div>,
        document.body,
    );
}
