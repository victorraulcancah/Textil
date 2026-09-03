import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical } from 'lucide-react';

/**
 * Menú de acciones por fila: un solo icono (⋮) que despliega los botones
 * hacia abajo. Evita llenar la columna de acciones con muchos iconos.
 *
 *   items: [{ label, icon: Icon, onClick, disabled?, danger?, title? }]
 *   Un item con `hidden: true` no se muestra.
 */
export default function ActionsMenu({ items = [], label = 'Acciones' }) {
    const [open, setOpen] = useState(false);
    const btnRef = useRef(null);
    const menuRef = useRef(null);
    const [pos, setPos] = useState({ top: 0, left: 0 });

    const visibles = items.filter((it) => it && !it.hidden);

    // Posiciona el menú justo debajo del botón, alineado a la derecha.
    useLayoutEffect(() => {
        if (!open || !btnRef.current) return;
        const r = btnRef.current.getBoundingClientRect();
        const ancho = 184;
        let left = r.right - ancho;
        if (left < 8) left = 8;
        setPos({ top: r.bottom + 4, left });
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const cerrar = (e) => {
            if (menuRef.current?.contains(e.target) || btnRef.current?.contains(e.target)) return;
            setOpen(false);
        };
        const onKey = (e) => e.key === 'Escape' && setOpen(false);
        document.addEventListener('mousedown', cerrar);
        document.addEventListener('keydown', onKey);
        window.addEventListener('scroll', () => setOpen(false), true);
        window.addEventListener('resize', () => setOpen(false));
        return () => {
            document.removeEventListener('mousedown', cerrar);
            document.removeEventListener('keydown', onKey);
            window.removeEventListener('scroll', () => setOpen(false), true);
            window.removeEventListener('resize', () => setOpen(false));
        };
    }, [open]);

    if (visibles.length === 0) return null;

    return (
        <>
            <button
                ref={btnRef}
                type="button"
                aria-label={label}
                title={label}
                onClick={(e) => {
                    e.stopPropagation();
                    setOpen((v) => !v);
                }}
                className={`rounded-md p-1.5 transition hover:bg-gray-100 ${open ? 'bg-gray-100 text-warm-900' : 'text-warm-600 hover:text-warm-900'}`}
            >
                <MoreVertical className="h-4 w-4" />
            </button>

            {open &&
                createPortal(
                    <div
                        ref={menuRef}
                        style={{ top: pos.top, left: pos.left, width: 184 }}
                        className="fixed z-[120] overflow-hidden rounded-lg border border-edge bg-white py-1 shadow-lg"
                    >
                        {visibles.map((it, i) => {
                            const Icon = it.icon;
                            // El icono lleva su propio color; el texto queda neutral
                            // (rojo si es una acción peligrosa). Sin fondo al pasar el mouse.
                            const iconColor = it.danger ? 'text-red-600' : it.color ?? 'text-warm-500';
                            return (
                                <button
                                    key={i}
                                    type="button"
                                    disabled={it.disabled}
                                    title={it.title}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setOpen(false);
                                        it.onClick?.();
                                    }}
                                    className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm disabled:cursor-not-allowed disabled:opacity-40 ${
                                        it.danger ? 'text-red-600' : 'text-warm-800'
                                    }`}
                                >
                                    {Icon && <Icon className={`h-4 w-4 shrink-0 ${iconColor}`} />}
                                    <span className="truncate">{it.label}</span>
                                </button>
                            );
                        })}
                    </div>,
                    document.body,
                )}
        </>
    );
}
