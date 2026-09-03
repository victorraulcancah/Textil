import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { cn } from './cn';

/** Minúsculas y sin tildes, para que "nunez" encuentre "Nuñez". */
const normalize = (texto) =>
    String(texto ?? '')
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .toLowerCase();

const MENU_MAX_HEIGHT = 260;

/** Resalta el tramo de la opción que coincide con lo escrito. */
function Coincidencia({ texto, busqueda, activo }) {
    const q = normalize(busqueda);
    if (!q) return texto;
    const desde = normalize(texto).indexOf(q);
    if (desde === -1) return texto;

    return (
        <>
            {texto.slice(0, desde)}
            <span className={cn('font-semibold', activo ? 'text-white' : 'text-primary-700')}>
                {texto.slice(desde, desde + q.length)}
            </span>
            {texto.slice(desde + q.length)}
        </>
    );
}

/**
 * Select con buscador integrado: se escribe para filtrar la lista.
 *
 * Props principales:
 *   options   — [{ value, label, keywords?, disabled? }]
 *   value     — value de la opción elegida ('' si ninguna)
 *   onChange  — (value, option) => void
 */
const SearchSelect = function SearchSelect({
    label,
    value = '',
    onChange,
    options = [],
    placeholder = 'Buscar…',
    emptyText = 'Sin resultados',
    error,
    disabled = false,
    clearable = true,
    /** Si se pasa, aparece una lupa que entrega lo escrito (p.ej. para abrir un buscador avanzado). */
    onSearch,
    searchTitle = 'Búsqueda avanzada',
    className,
    id: idProp,
}) {
    const autoId = useId();
    const id = idProp ?? autoId;
    const listboxId = `${id}-listbox`;

    const [abierto, setAbierto] = useState(false);
    const [busqueda, setBusqueda] = useState('');
    const [activo, setActivo] = useState(0);
    const [menuStyle, setMenuStyle] = useState(null);

    const anchorRef = useRef(null);
    const inputRef = useRef(null);
    const menuRef = useRef(null);

    const seleccionada = useMemo(
        () => options.find((o) => String(o.value) === String(value)) ?? null,
        [options, value],
    );

    const filtradas = useMemo(() => {
        const q = normalize(busqueda);
        if (!q) return options;
        // `keywords` permite buscar por datos que no se muestran (código, SKU…).
        return options.filter((o) => normalize(`${o.label} ${o.keywords ?? ''}`).includes(q));
    }, [options, busqueda]);

    const abrir = useCallback(() => {
        if (disabled) return;
        setAbierto(true);
        setBusqueda('');
        setActivo(Math.max(0, options.findIndex((o) => String(o.value) === String(value))));
    }, [disabled, options, value]);

    const cerrar = useCallback(() => {
        setAbierto(false);
        setBusqueda('');
    }, []);

    const elegir = useCallback(
        (opcion) => {
            if (!opcion || opcion.disabled) return;
            onChange?.(opcion.value, opcion);
            cerrar();
            inputRef.current?.blur();
        },
        [onChange, cerrar],
    );

    const limpiar = useCallback(() => {
        onChange?.('', null);
        cerrar();
    }, [onChange, cerrar]);

    // Ancla el menú al campo; se despliega hacia arriba si no hay espacio abajo.
    const posicionar = useCallback(() => {
        const el = anchorRef.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const abajo = window.innerHeight - r.bottom;
        const haciaArriba = abajo < 180 && r.top > abajo;

        setMenuStyle({
            left: r.left,
            width: r.width,
            ...(haciaArriba
                ? { bottom: window.innerHeight - r.top + 4 }
                : { top: r.bottom + 4 }),
            maxHeight: Math.max(140, Math.min(MENU_MAX_HEIGHT, (haciaArriba ? r.top : abajo) - 12)),
        });
    }, []);

    useLayoutEffect(() => {
        if (!abierto) return undefined;
        posicionar();
        window.addEventListener('scroll', posicionar, true);
        window.addEventListener('resize', posicionar);
        return () => {
            window.removeEventListener('scroll', posicionar, true);
            window.removeEventListener('resize', posicionar);
        };
    }, [abierto, posicionar]);

    // Cerrar al hacer clic fuera del campo y del menú.
    useEffect(() => {
        if (!abierto) return undefined;
        const alClic = (e) => {
            if (anchorRef.current?.contains(e.target) || menuRef.current?.contains(e.target)) return;
            cerrar();
        };
        document.addEventListener('mousedown', alClic);
        return () => document.removeEventListener('mousedown', alClic);
    }, [abierto, cerrar]);

    // Escape cierra solo el desplegable: se captura antes de que llegue al modal
    // que pueda estar debajo, para no cerrarlo también.
    useEffect(() => {
        if (!abierto) return undefined;
        const alEscape = (e) => {
            if (e.key !== 'Escape') return;
            e.stopPropagation();
            cerrar();
        };
        document.addEventListener('keydown', alEscape, true);
        return () => document.removeEventListener('keydown', alEscape, true);
    }, [abierto, cerrar]);

    // Mantiene visible la opción resaltada al navegar con el teclado.
    useEffect(() => {
        if (!abierto) return;
        menuRef.current?.querySelector(`[data-idx="${activo}"]`)?.scrollIntoView({ block: 'nearest' });
    }, [abierto, activo]);

    const alTeclado = (e) => {
        if (disabled) return;

        if (!abierto && ['ArrowDown', 'ArrowUp', 'Enter'].includes(e.key)) {
            e.preventDefault();
            abrir();
            return;
        }
        if (!abierto) return;

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setActivo((i) => (filtradas.length ? (i + 1) % filtradas.length : 0));
                break;
            case 'ArrowUp':
                e.preventDefault();
                setActivo((i) => (filtradas.length ? (i - 1 + filtradas.length) % filtradas.length : 0));
                break;
            case 'Home':
                e.preventDefault();
                setActivo(0);
                break;
            case 'End':
                e.preventDefault();
                setActivo(Math.max(0, filtradas.length - 1));
                break;
            case 'Enter':
                e.preventDefault();
                // Sin coincidencias, Enter abre el buscador avanzado con lo escrito.
                if (!filtradas.length && onSearch) {
                    const q = busqueda;
                    cerrar();
                    onSearch(q);
                    break;
                }
                elegir(filtradas[activo]);
                break;
            case 'Tab':
                cerrar();
                break;
            default:
                break;
        }
    };

    const menu =
        abierto && menuStyle
            ? createPortal(
                  <div
                      ref={menuRef}
                      id={listboxId}
                      role="listbox"
                      // Por encima de los modales (z-100), que también pueden contener un SearchSelect.
                      style={{ position: 'fixed', ...menuStyle, zIndex: 200 }}
                      className="overflow-y-auto rounded-lg border border-edge bg-white py-1 shadow-lg"
                  >
                      {filtradas.length === 0 && (
                          <p className="px-3 py-2.5 text-sm text-warm-500">{emptyText}</p>
                      )}

                      {filtradas.map((opcion, i) => {
                          const esActiva = i === activo;
                          const esElegida = String(opcion.value) === String(value);

                          return (
                              <div
                                  key={opcion.value}
                                  data-idx={i}
                                  role="option"
                                  aria-selected={esElegida}
                                  onMouseEnter={() => setActivo(i)}
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() => elegir(opcion)}
                                  className={cn(
                                      'flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm',
                                      esActiva ? 'bg-primary-600 text-white' : 'text-warm-900',
                                      !esActiva && esElegida && 'bg-primary-50 text-primary-700',
                                      opcion.disabled && 'cursor-not-allowed opacity-40',
                                  )}
                              >
                                  <span className="truncate">
                                      <Coincidencia texto={opcion.label} busqueda={busqueda} activo={esActiva} />
                                  </span>
                                  {esElegida && <Check className="h-4 w-4 shrink-0" />}
                              </div>
                          );
                      })}
                  </div>,
                  document.body,
              )
            : null;

    return (
        <div className="w-full">
            {label && (
                <label htmlFor={id} className="mb-1 block text-sm font-medium text-gray-700">
                    {label}
                </label>
            )}

            <div ref={anchorRef} className="relative">
                <input
                    id={id}
                    ref={inputRef}
                    type="text"
                    role="combobox"
                    autoComplete="off"
                    aria-expanded={abierto}
                    aria-controls={abierto ? listboxId : undefined}
                    aria-autocomplete="list"
                    disabled={disabled}
                    placeholder={seleccionada ? seleccionada.label : placeholder}
                    value={abierto ? busqueda : (seleccionada?.label ?? '')}
                    onChange={(e) => {
                        setBusqueda(e.target.value);
                        setActivo(0);
                        if (!abierto) setAbierto(true);
                    }}
                    onMouseDown={() => (abierto ? cerrar() : abrir())}
                    onKeyDown={alTeclado}
                    className={cn(
                        'block w-full cursor-pointer truncate rounded-md border-0 py-2 pl-3 text-sm text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300',
                        onSearch ? 'pr-[5.25rem]' : 'pr-14',
                        'placeholder:text-gray-400 focus:cursor-text focus:ring-2 focus:ring-inset focus:ring-primary-600',
                        'disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500',
                        error && 'ring-red-500 focus:ring-red-500',
                        className,
                    )}
                />

                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center gap-1 pr-2">
                    {onSearch && !disabled && (
                        <button
                            type="button"
                            tabIndex={-1}
                            title={searchTitle}
                            aria-label={searchTitle}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                                const q = busqueda;
                                cerrar();
                                onSearch(q);
                            }}
                            className="pointer-events-auto rounded p-1 text-primary-600 transition hover:bg-primary-50"
                        >
                            <Search className="h-4 w-4" />
                        </button>
                    )}
                    {clearable && seleccionada && !disabled && (
                        <button
                            type="button"
                            tabIndex={-1}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={limpiar}
                            aria-label="Limpiar selección"
                            className="pointer-events-auto rounded p-0.5 text-gray-400 transition hover:bg-gray-100 hover:text-warm-900"
                        >
                            <X className="h-3.5 w-3.5" />
                        </button>
                    )}
                    <ChevronDown
                        className={cn(
                            'h-4 w-4 text-gray-400 transition-transform',
                            abierto && 'rotate-180 text-primary-600',
                        )}
                    />
                </div>
            </div>

            {error && <p className="mt-1 text-xs text-red-600">{error}</p>}

            {menu}
        </div>
    );
};

export default SearchSelect;
