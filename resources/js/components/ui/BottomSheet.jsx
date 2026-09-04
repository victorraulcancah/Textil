import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from './cn';

/** true por debajo del breakpoint `md` de Tailwind (768px). */
export function useIsMobile() {
    const [mobile, setMobile] = useState(
        () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches,
    );
    useEffect(() => {
        const mq = window.matchMedia('(max-width: 767px)');
        const handler = (e) => setMobile(e.matches);
        mq.addEventListener('change', handler);
        return () => mq.removeEventListener('change', handler);
    }, []);
    return mobile;
}

/**
 * Panel que se desliza desde abajo, solo en móvil. En escritorio no pinta
 * nada: la página muestra su detalle normal. Pensado para las pantallas
 * maestro-detalle (tocar una card → ver su detalle sin salir de la lista).
 */
export default function BottomSheet({ open, onClose, title, subtitle, children, className }) {
    const isMobile = useIsMobile();
    const visible = open && isMobile;

    // Sin scroll de fondo mientras el panel está abierto; Escape lo cierra.
    useEffect(() => {
        if (!visible) return undefined;
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const onKey = (e) => e.key === 'Escape' && onClose?.();
        document.addEventListener('keydown', onKey);
        return () => {
            document.body.style.overflow = prev;
            document.removeEventListener('keydown', onKey);
        };
    }, [visible, onClose]);

    if (!visible) return null;

    return createPortal(
        <div className="fixed inset-0 z-[70] md:hidden">
            <div
                className="absolute inset-0 bg-black/40"
                style={{ animation: 'fade-in 150ms ease-out' }}
                onClick={onClose}
            />
            <div
                role="dialog"
                aria-modal="true"
                aria-label={typeof title === 'string' ? title : undefined}
                style={{ animation: 'sheet-in 220ms cubic-bezier(.2,.8,.2,1)' }}
                className={cn(
                    'absolute inset-x-0 bottom-0 flex max-h-[85vh] flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl',
                    className,
                )}
            >
                <div className="flex items-start justify-between gap-3 bg-primary-600 px-4 py-3 text-white">
                    <div className="min-w-0">
                        <p className="text-sm font-bold leading-snug">{title}</p>
                        {subtitle && <p className="text-xs text-white/80">{subtitle}</p>}
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Cerrar"
                        className="-mr-1 shrink-0 rounded-md p-1 text-white/90 transition hover:bg-white/15 hover:text-white"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>
                <div className="overflow-y-auto p-3">{children}</div>
            </div>
        </div>,
        document.body,
    );
}
