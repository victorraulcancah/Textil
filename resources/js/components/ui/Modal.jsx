import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { cn } from './cn';

const sizes = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-2xl',
    '2xl': 'max-w-4xl',
    '3xl': 'max-w-6xl',
};

export default function Modal({
    open,
    onClose,
    title,
    description,
    footer,
    size = 'md',
    children,
}) {
    useEffect(() => {
        if (!open) return;

        const handler = (e) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handler);
        document.body.style.overflow = 'hidden';

        return () => {
            document.removeEventListener('keydown', handler);
            document.body.style.overflow = '';
        };
    }, [open, onClose]);

    if (!open) return null;

    return createPortal(
        <div className="fixed inset-0 z-[100] overflow-y-auto">
            <div className="flex min-h-dvh items-center justify-center p-4">
                <div
                    className="fixed inset-0 bg-black/50"
                    onClick={onClose}
                    aria-hidden="true"
                />
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-label={title}
                    className={cn(
                        'relative z-10 flex max-h-[90vh] w-full flex-col rounded-2xl bg-white shadow-2xl',
                        sizes[size],
                    )}
                >
                {(title || description) && (
                    <div className="px-6 pt-5">
                        {title && (
                            <h2 className="text-lg font-semibold text-warm-900">
                                {title}
                            </h2>
                        )}
                        {description && (
                            <p className="mt-0.5 text-sm text-warm-500">
                                {description}
                            </p>
                        )}
                    </div>
                )}

                <div className="flex-1 overflow-y-auto px-6 py-4">{children}</div>

                {footer && (
                    <div className="flex items-center justify-end gap-2 px-6 pb-5">
                        {footer}
                    </div>
                )}
            </div>
            </div>
        </div>,
        document.body,
    );
}
