import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from './cn';

const MENU_MAX_HEIGHT = 280;

/**
 * Selector con opciones de dos líneas, dibujado por la aplicación.
 *
 * El `<select>` nativo lo pinta el sistema operativo: no acepta estilos, no
 * deja poner una segunda línea y en Windows se ve como una lista gris que
 * desentona con el resto. Este lo reemplaza cuando cada opción necesita
 * mostrar algo más que su nombre —un código, un precio, un estado—.
 *
 * Para elegir entre valores simples sigue estando `Select`; para listas largas
 * donde hace falta escribir para encontrar, `SearchSelect`.
 *
 *   options  — [{ value, label, detail?, badge?, disabled? }]
 *   value    — value de la opción elegida ('' si ninguna)
 *   onChange — (value, option) => void
 *   size     — 'sm' para celdas de tabla, 'md' (por defecto) para formularios
 */
export default function OptionSelect({
    label,
    value = '',
    onChange,
    options = [],
    placeholder = 'Elegir…',
    emptyText = 'Sin opciones',
    error,
    disabled = false,
    size = 'md',
    className,
    id: idProp,
    ...props
}) {
    const autoId = useId();
    const id = idProp ?? autoId;
    const listboxId = `${id}-listbox`;

    const [abierto, setAbierto] = useState(false);
    const [activo, setActivo] = useState(0);
    const [menuStyle, setMenuStyle] = useState(null);

    const anchorRef = useRef(null);
    const botonRef = useRef(null);
    const menuRef = useRef(null);

    const seleccionada = useMemo(
        () => options.find((o) => String(o.value) === String(value)) ?? null,
        [options, value],
    );

    const abrir = useCallback(() => {
        if (disabled || !options.length) return;
        setActivo(Math.max(0, options.findIndex((o) => String(o.value) === String(value))));
        setAbierto(true);
    }, [disabled, options, value]);

    const cerrar = useCallback(() => setAbierto(false), []);

    const elegir = useCallback(
        (opcion) => {
            if (!opcion || opcion.disabled) return;
            onChange?.(opcion.value, opcion);
            cerrar();
            botonRef.current?.focus();
        },
        [onChange, cerrar],
    );

    // Ancla el menú al botón; se despliega hacia arriba si abajo no cabe.
    const posicionar = useCallback(() => {
        const el = anchorRef.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const abajo = window.innerHeight - r.bottom;
        const haciaArriba = abajo < 180 && r.top > abajo;

        setMenuStyle({
            left: r.left,
            minWidth: r.width,
            ...(haciaArriba ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }),
            maxHeight: Math.max(140, Math.min(MENU_MAX_HEIGHT, (haciaArriba ? r.top : abajo) - 12)),
        });
    }, []);

    useLayoutEffect(() => {
        if (!abierto) return undefined;
        posicionar();
        // El menú va en un portal: si la página o una tabla se desplazan, hay
        // que reposicionarlo o quedaría flotando en el sitio equivocado.
        window.addEventListener('scroll', posicionar, true);
        window.addEventListener('resize', posicionar);
        return () => {
            window.removeEventListener('scroll', posicionar, true);
            window.removeEventListener('resize', posicionar);
        };
    }, [abierto, posicionar]);

    // Se cierra al tocar fuera o con Escape.
    useEffect(() => {
        if (!abierto) return undefined;
        const fuera = (e) => {
            if (anchorRef.current?.contains(e.target) || menuRef.current?.contains(e.target)) return;
            cerrar();
        };
        document.addEventListener('mousedown', fuera);
        return () => document.removeEventListener('mousedown', fuera);
    }, [abierto, cerrar]);

    const teclado = (e) => {
        if (!abierto) {
            if (['Enter', ' ', 'ArrowDown'].includes(e.key)) {
                e.preventDefault();
                abrir();
            }
            return;
        }

        if (e.key === 'Escape') {
            e.preventDefault();
            cerrar();
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActivo((i) => Math.min(options.length - 1, i + 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActivo((i) => Math.max(0, i - 1));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            elegir(options[activo]);
        }
    };

    const compacto = size === 'sm';

    return (
        <div className={cn('w-full', className)} ref={anchorRef} {...props}>
            {label && (
                <label htmlFor={id} className="mb-1 block text-sm font-medium text-gray-700">
                    {label}
                </label>
            )}

            <button
                id={id}
                ref={botonRef}
                type="button"
                disabled={disabled || !options.length}
                onClick={() => (abierto ? cerrar() : abrir())}
                onKeyDown={teclado}
                aria-haspopup="listbox"
                aria-expanded={abierto}
                aria-controls={abierto ? listboxId : undefined}
                className={cn(
                    'flex w-full items-center justify-between gap-2 rounded-md bg-white text-left text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 transition',
                    'hover:ring-gray-400 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-600',
                    'disabled:bg-gray-50 disabled:text-gray-500 disabled:hover:ring-gray-300',
                    compacto ? 'px-2 py-1 text-xs' : 'px-3 py-2 text-sm',
                    error && 'ring-red-500 focus:ring-red-500',
                )}
            >
                <span className="min-w-0 flex-1">
                    {seleccionada ? (
                        <>
                            <span className="block truncate font-medium">{seleccionada.label}</span>
                            {seleccionada.detail && (
                                <span className="block truncate text-[11px] font-normal text-warm-500">
                                    {seleccionada.detail}
                                </span>
                            )}
                        </>
                    ) : (
                        <span className="block truncate text-gray-400">{placeholder}</span>
                    )}
                </span>
                <ChevronDown
                    className={cn(
                        'h-4 w-4 shrink-0 text-gray-400 transition-transform',
                        abierto && 'rotate-180',
                    )}
                />
            </button>

            {error && <p className="mt-1 text-xs text-red-600">{error}</p>}

            {/* En un portal para que no lo recorte el overflow de la tabla. */}
            {abierto &&
                menuStyle &&
                createPortal(
                    <ul
                        id={listboxId}
                        ref={menuRef}
                        role="listbox"
                        style={{ position: 'fixed', zIndex: 60, ...menuStyle }}
                        className="overflow-y-auto rounded-lg border border-edge bg-white p-1 shadow-lg"
                    >
                        {options.length === 0 && (
                            <li className="px-3 py-2 text-sm text-gray-400">{emptyText}</li>
                        )}

                        {options.map((o, i) => {
                            const elegida = String(o.value) === String(value);
                            return (
                                <li key={o.value}>
                                    <button
                                        type="button"
                                        role="option"
                                        aria-selected={elegida}
                                        disabled={o.disabled}
                                        onMouseEnter={() => setActivo(i)}
                                        onClick={() => elegir(o)}
                                        className={cn(
                                            'flex w-full items-start gap-2 rounded-md px-2.5 py-1.5 text-left transition',
                                            i === activo && !o.disabled && 'bg-primary-50',
                                            o.disabled && 'cursor-not-allowed opacity-40',
                                        )}
                                    >
                                        <span className="min-w-0 flex-1">
                                            <span className="flex items-center gap-1.5">
                                                <span
                                                    className={cn(
                                                        'truncate text-sm',
                                                        elegida
                                                            ? 'font-semibold text-primary-700'
                                                            : 'text-warm-900',
                                                    )}
                                                >
                                                    {o.label}
                                                </span>
                                                {o.badge}
                                            </span>
                                            {o.detail && (
                                                <span className="block truncate text-xs text-warm-500">
                                                    {o.detail}
                                                </span>
                                            )}
                                        </span>
                                        {elegida && (
                                            <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary-600" />
                                        )}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>,
                    document.body,
                )}
        </div>
    );
}
