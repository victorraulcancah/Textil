import { PlusCircle } from 'lucide-react';

/**
 * Un selector con el "+" a la derecha para crear ahí mismo lo que falta en su
 * catálogo, como en Productos. Sin `onAdd` (p. ej. sin permiso) no hay "+".
 */
export default function CampoConAgregar({ children, onAdd, titulo = 'Crear nuevo' }) {
    return (
        <div className="flex items-end gap-2">
            <div className="flex-1">{children}</div>
            {onAdd && (
                <button
                    type="button"
                    onClick={onAdd}
                    title={titulo}
                    aria-label={titulo}
                    className="mb-0.5 rounded-md p-1.5 text-emerald-600 transition hover:bg-emerald-50"
                >
                    <PlusCircle className="h-5 w-5" />
                </button>
            )}
        </div>
    );
}
