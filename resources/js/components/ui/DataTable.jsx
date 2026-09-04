import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    ArrowDown,
    ArrowUp,
    ChevronsUpDown,
    Columns3,
    Funnel,
    GripVertical,
    Search,
    X,
} from 'lucide-react';
import useDebounce from '../../hooks/useDebounce';
import { cn } from './cn';
import Spinner from './Spinner';

/**
 * Texto comparable de un valor: sin acentos y en minúsculas, para que buscar
 * "razon" encuentre "Razón" y las mayúsculas den igual.
 */
const asText = (value) =>
    (value == null ? '' : String(value))
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase();

/**
 * Texto plano de lo que una columna pinta. Recorre elementos de React para
 * sacar su contenido legible, de modo que una celda con `render` siga siendo
 * buscable/ordenable sin que la página que la usa declare nada extra.
 */
function plainText(node, depth = 0) {
    if (node == null || typeof node === 'boolean' || depth > 6) return '';
    if (typeof node === 'string' || typeof node === 'number') return String(node);
    if (Array.isArray(node)) return node.map((n) => plainText(n, depth + 1)).join(' ');

    const props = node?.props;
    if (!props) return '';

    return [props.children, props.value, props.label]
        .map((p) => plainText(p, depth + 1))
        .filter(Boolean)
        .join(' ');
}

/**
 * Valor de una celda para buscar y ordenar. `col.getSearchValue` manda si
 * existe; si no, el campo crudo, y si ese campo es JSX (viene de `render`),
 * el texto que se ve en pantalla.
 */
function cellValue(col, row) {
    if (!col || !row) return '';
    if (col.getSearchValue) return col.getSearchValue(row);

    const raw = row[col.key];
    if (raw !== null && raw !== undefined && typeof raw !== 'object') return raw;

    if (col.render) {
        const painted = col.render(row);
        if (typeof painted === 'string' || typeof painted === 'number') return painted;
        return plainText(painted);
    }

    return raw ?? '';
}

/** Cierra un panel flotante al hacer clic fuera o con Escape. */
function useDismiss(onDismiss) {
    const ref = useRef(null);

    useEffect(() => {
        const onClick = (e) => {
            if (!ref.current?.contains(e.target)) onDismiss();
        };
        const onKey = (e) => e.key === 'Escape' && onDismiss();

        document.addEventListener('mousedown', onClick);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onClick);
            document.removeEventListener('keydown', onKey);
        };
    }, [onDismiss]);

    return ref;
}

function ToolbarButton({ label, children, onClick, active, badge }) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={label}
            title={label}
            className={cn(
                'relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-600/12 text-primary-700 transition-colors hover:bg-primary-600/20',
                active && 'bg-primary-600/20',
            )}
        >
            {children}
            {badge > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary-600 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white">
                    {badge}
                </span>
            )}
        </button>
    );
}

/** Panel flotante con animación de aparición (usado por filtros y columnas). */
function Dropdown({ open, onClose, children, align = 'right', width = 'w-64' }) {
    const ref = useDismiss(onClose);

    return (
        <div
            ref={ref}
            className={cn(
                'absolute z-30 mt-2 origin-top rounded-xl border border-edge bg-white p-2 shadow-xl shadow-gray-900/10 transition-all duration-150',
                width,
                align === 'right' ? 'right-0 origin-top-right' : 'left-0 origin-top-left',
                open ? 'scale-100 opacity-100' : 'pointer-events-none scale-95 opacity-0',
            )}
        >
            {children}
        </div>
    );
}

/** Buscador de una columna: flota en un portal, anclado a su celda de cabecera. */
function ColumnSearchPopover({ column, anchor, value, onChange, onClose }) {
    const ref = useDismiss(onClose);
    const inputRef = useRef(null);
    const [shown, setShown] = useState(false);
    const [pos, setPos] = useState(null);

    useEffect(() => {
        if (!anchor) return undefined;

        const colocar = () => {
            const r = anchor.getBoundingClientRect();
            const ancho = Math.min(224, window.innerWidth - 32);
            setPos({
                top: r.bottom + 4,
                left: Math.min(Math.max(8, r.left), window.innerWidth - ancho - 8),
            });
        };

        colocar();
        inputRef.current?.focus();
        const id = requestAnimationFrame(() => setShown(true));

        window.addEventListener('resize', colocar);
        window.addEventListener('scroll', colocar, true);
        return () => {
            cancelAnimationFrame(id);
            window.removeEventListener('resize', colocar);
            window.removeEventListener('scroll', colocar, true);
        };
    }, [anchor]);

    if (!pos) return null;

    return createPortal(
        <div
            ref={ref}
            style={{ top: pos.top, left: pos.left }}
            className={cn(
                'fixed z-50 w-[min(14rem,calc(100vw-2rem))] origin-top rounded-lg border border-edge bg-white p-2 shadow-xl shadow-gray-900/20 transition-all duration-150',
                shown ? 'translate-y-0 scale-100 opacity-100' : '-translate-y-1 scale-95 opacity-0',
            )}
        >
            <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                <input
                    ref={inputRef}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && onClose()}
                    placeholder={`Buscar ${column.label.toLowerCase()}`}
                    className="w-full rounded-md border border-gray-200 py-1.5 pl-7 pr-6 text-xs normal-case text-gray-900 outline-none focus:border-primary-500"
                />
                {value && (
                    <button
                        type="button"
                        onClick={() => onChange('')}
                        aria-label="Limpiar"
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-gray-400 hover:text-gray-700"
                    >
                        <X className="h-3 w-3" />
                    </button>
                )}
            </div>
        </div>,
        document.body,
    );
}

export default function DataTable({
    columns,
    rows = [],
    keyField = 'id',
    searchable = true,
    searchPlaceholder = 'Buscar...',
    filterable = false,
    filters = null,
    filterCount = 0,
    toggleableColumns = true,
    loading = false,
    emptyMessage = 'No hay registros para mostrar',
    onRowClick = null,
    /** (row) => string — clases extra por fila, p. ej. para marcar la seleccionada. */
    rowClassName = null,
    maxHeight = '60vh',
    /** Alto fijo: la tabla lo mantiene aunque haya pocas filas. */
    height = null,
    /** Filas más bajas (menos padding vertical). */
    dense = false,
}) {
    const [search, setSearch] = useState('');
    const debouncedSearch = useDebounce(search, 300);
    const [hiddenColumns, setHiddenColumns] = useState({});
    const [filterOpen, setFilterOpen] = useState(false);
    const [columnsOpen, setColumnsOpen] = useState(false);

    const dataColumns = useMemo(() => columns.filter((c) => c.type !== 'actions'), [columns]);
    const actionsCol = useMemo(() => columns.find((c) => c.type === 'actions'), [columns]);

    // Orden de columnas (para poder arrastrar las cabeceras). Se re-sincroniza
    // cuando la página agrega/quita columnas, si no una nueva nunca se pintaría.
    const [order, setOrder] = useState(() => dataColumns.map((c) => c.key));
    useEffect(() => {
        setOrder((prev) => {
            const keys = dataColumns.map((c) => c.key);
            const vigentes = prev.filter((k) => keys.includes(k));
            const nuevas = keys.filter((k) => !vigentes.includes(k));
            if (nuevas.length === 0 && vigentes.length === prev.length) return prev;
            return [...vigentes, ...nuevas];
        });
    }, [dataColumns]);

    const byKey = useMemo(
        () => Object.fromEntries(dataColumns.map((c) => [c.key, c])),
        [dataColumns],
    );

    const visibleColumns = useMemo(
        () => order.map((k) => byKey[k]).filter((c) => c && !hiddenColumns[c.key]),
        [order, byKey, hiddenColumns],
    );
    const allColumns = actionsCol ? [...visibleColumns, actionsCol] : visibleColumns;

    const toggleColumn = (key) => {
        setHiddenColumns((prev) => {
            const next = { ...prev };
            if (next[key]) delete next[key];
            else next[key] = true;
            return next;
        });
    };
    const resetColumns = () => setHiddenColumns({});

    // Arrastrar cabeceras para reordenar.
    const [dragging, setDragging] = useState(null);
    const [dragOver, setDragOver] = useState(null);
    const handleDrop = (targetKey) => {
        if (!dragging || dragging === targetKey) return;
        setOrder((prev) => {
            const next = prev.filter((k) => k !== dragging);
            next.splice(next.indexOf(targetKey), 0, dragging);
            return next;
        });
        setDragging(null);
        setDragOver(null);
    };

    // Redimensionar arrastrando el borde derecho de una cabecera.
    const [widths, setWidths] = useState({});
    const [resizingKey, setResizingKey] = useState(null);
    const startResize = (e, key) => {
        e.preventDefault();
        e.stopPropagation();
        const th = e.currentTarget.closest('th');
        if (!th) return;
        const startX = e.clientX;
        const startWidth = th.getBoundingClientRect().width;
        setResizingKey(key);
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'col-resize';

        const onMove = (ev) =>
            setWidths((prev) => ({ ...prev, [key]: Math.max(90, startWidth + ev.clientX - startX) }));
        const onUp = () => {
            setResizingKey(null);
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    };
    /** Doble clic en el borde: la columna vuelve a su ancho automático. */
    const resetWidth = (key) =>
        setWidths((prev) => {
            const next = { ...prev };
            delete next[key];
            return next;
        });

    // Orden ascendente/descendente por columna.
    const [sort, setSort] = useState({ key: null, dir: null });
    const toggleSort = (key) =>
        setSort((prev) =>
            prev.key !== key
                ? { key, dir: 'asc' }
                : prev.dir === 'asc'
                  ? { key, dir: 'desc' }
                  : { key: null, dir: null },
        );

    // Búsqueda por columna: popover flotante anclado a la celda de cabecera.
    const [columnSearch, setColumnSearch] = useState({});
    const [openColSearch, setOpenColSearch] = useState(null);
    const [anchorColSearch, setAnchorColSearch] = useState(null);
    const activeColumnSearches = Object.values(columnSearch).filter((v) => v?.trim()).length;

    const filteredRows = useMemo(() => {
        let result = rows;

        if (debouncedSearch.trim()) {
            const q = asText(debouncedSearch);
            result = result.filter((row) =>
                visibleColumns.some((col) => col.searchable !== false && asText(cellValue(col, row)).includes(q)),
            );
        }

        for (const [key, term] of Object.entries(columnSearch)) {
            if (!term?.trim()) continue;
            const col = byKey[key];
            result = result.filter((row) => asText(cellValue(col, row)).includes(asText(term)));
        }

        if (sort.key && byKey[sort.key]) {
            const factor = sort.dir === 'desc' ? -1 : 1;
            const col = byKey[sort.key];
            result = [...result].sort((a, b) => {
                const x = cellValue(col, a);
                const y = cellValue(col, b);
                if (typeof x === 'number' && typeof y === 'number') return (x - y) * factor;
                return String(x ?? '').localeCompare(String(y ?? ''), 'es', { numeric: true }) * factor;
            });
        }

        return result;
    }, [rows, debouncedSearch, columnSearch, sort, visibleColumns, byKey]);

    const isActionsColumn = (col) => col.type === 'actions';

    // Ancho real de la barra de scroll (para reservar el hueco en el encabezado y que
    // el encabezado fijo quede alineado con el cuerpo desplazable).
    const [scrollbarW, setScrollbarW] = useState(0);
    useEffect(() => {
        const el = document.createElement('div');
        el.style.cssText = 'overflow:scroll;position:absolute;top:-9999px;width:100px;height:100px';
        document.body.appendChild(el);
        setScrollbarW(el.offsetWidth - el.clientWidth);
        document.body.removeChild(el);
    }, []);

    // Solo se reserva el hueco de la barra cuando el cuerpo realmente tiene
    // scroll; si no, quedaba una franja blanca a la derecha.
    const bodyRef = useRef(null);
    const [hasScroll, setHasScroll] = useState(false);
    useEffect(() => {
        const el = bodyRef.current;
        if (!el) return undefined;
        const check = () => setHasScroll(el.scrollHeight > el.clientHeight + 1);
        check();
        const ro = new ResizeObserver(check);
        ro.observe(el);
        return () => ro.disconnect();
    });
    const gutter = hasScroll ? scrollbarW : 0;

    // Ancho por columna (para alinear encabezado y cuerpo con table-fixed). Los
    // anchos arrastrados por el usuario mandan sobre el ancho por defecto.
    const colWidth = (col) => {
        if (widths[col.key]) return widths[col.key];
        if (col.width) return col.width;
        if (col.type === 'actions') return '120px';
        if (col.key === 'id') return '72px';
        return `${100 / Math.max(1, visibleColumns.length)}%`;
    };

    /**
     * Ancho mínimo que necesita la tabla. Sin esto, con muchas columnas el
     * table-fixed las comprime y las últimas quedan fuera del contenedor.
     * Las columnas sin ancho declarado reservan un mínimo razonable.
     */
    const minTableWidth =
        allColumns.reduce((acc, col) => {
            const w = colWidth(col);
            // Ancho arrastrado por el usuario: llega como número.
            if (typeof w === 'number') return acc + (Number.isFinite(w) ? w : 170);
            // Ancho declarado en px por la página.
            if (typeof w === 'string' && w.endsWith('px')) return acc + (parseFloat(w) || 170);
            // Porcentaje (columna automática): reserva un mínimo razonable.
            return acc + 170;
        }, 0) +
        // Sumar el hueco de la barra vertical: así el contenedor es exactamente
        // "columnas + barra", y el encabezado (que reserva ese hueco con padding)
        // y el cuerpo (que lo ocupa con la barra) terminan con el mismo ancho.
        gutter;

    return (
        <div className="relative">
            {(searchable || filterable || toggleableColumns) && (
                <div className="mb-2 flex flex-wrap items-center justify-end gap-2">
                    {searchable && (
                        <div className="relative w-full sm:w-64">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                            <input
                                type="search"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder={searchPlaceholder}
                                className="block w-full rounded-lg border-0 bg-white py-2 pl-9 pr-9 text-sm text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-primary-600"
                            />
                            {search && (
                                <button
                                    type="button"
                                    onClick={() => setSearch('')}
                                    aria-label="Limpiar búsqueda"
                                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-gray-400 hover:text-gray-600"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            )}
                        </div>
                    )}

                    {(filterable || toggleableColumns) && (
                        <div className="flex items-center gap-1">
                            {filterable && (
                                <div className="relative">
                                    <ToolbarButton
                                        label="Filtros"
                                        active={filterOpen}
                                        badge={filterCount}
                                        onClick={() => {
                                            setFilterOpen((v) => !v);
                                            setColumnsOpen(false);
                                        }}
                                    >
                                        <Funnel className="h-4 w-4" />
                                    </ToolbarButton>
                                    <Dropdown open={filterOpen} onClose={() => setFilterOpen(false)} width="w-80">
                                        <p className="px-2 pb-2 pt-0.5 text-xs font-semibold uppercase tracking-wider text-gray-500">
                                            Filtros
                                        </p>
                                        <div className="max-h-96 overflow-y-auto px-2 pb-1">{filters}</div>
                                    </Dropdown>
                                </div>
                            )}

                            {toggleableColumns && (
                                <div className="relative">
                                    <ToolbarButton
                                        label="Mostrar u ocultar columnas"
                                        active={columnsOpen}
                                        badge={Object.keys(hiddenColumns).length}
                                        onClick={() => {
                                            setColumnsOpen((v) => !v);
                                            setFilterOpen(false);
                                        }}
                                    >
                                        <Columns3 className="h-4 w-4" />
                                    </ToolbarButton>
                                    <Dropdown open={columnsOpen} onClose={() => setColumnsOpen(false)}>
                                        <div className="flex items-center justify-between px-2 pb-1 pt-0.5">
                                            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                                                Columnas
                                            </p>
                                            {Object.keys(hiddenColumns).length > 0 && (
                                                <button
                                                    type="button"
                                                    onClick={resetColumns}
                                                    className="text-xs font-medium text-danger-600 hover:text-danger-700"
                                                >
                                                    Restablecer
                                                </button>
                                            )}
                                        </div>
                                        <div className="max-h-72 overflow-y-auto">
                                            {order.map((key) => {
                                                const col = byKey[key];
                                                if (!col) return null;
                                                return (
                                                    <label
                                                        key={key}
                                                        className="flex cursor-pointer select-none items-center gap-2 rounded-md px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={!hiddenColumns[key]}
                                                            onChange={() => toggleColumn(key)}
                                                            className="h-4 w-4 rounded border-gray-300 accent-primary-600"
                                                        />
                                                        {col.label}
                                                    </label>
                                                );
                                            })}
                                        </div>
                                        <p className="border-t border-gray-100 px-2 pt-2 text-[10px] leading-relaxed text-gray-400">
                                            Arrastra las cabeceras para cambiar su orden.
                                        </p>
                                    </Dropdown>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {activeColumnSearches > 0 && (
                <div className="mb-2 flex flex-wrap items-center gap-1.5">
                    {Object.entries(columnSearch)
                        .filter(([, v]) => v?.trim())
                        .map(([key, value]) => (
                            <span
                                key={key}
                                style={{ animation: 'fade-in 150ms ease-out' }}
                                className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 py-1 pl-2.5 pr-1.5 text-[11px] text-gray-600"
                            >
                                <Search className="h-2.5 w-2.5" />
                                <span className="font-medium">{byKey[key]?.label}</span>
                                <span>{value}</span>
                                <button
                                    type="button"
                                    onClick={() => setColumnSearch((prev) => ({ ...prev, [key]: '' }))}
                                    aria-label="Quitar búsqueda de columna"
                                    className="rounded-full p-0.5 hover:bg-gray-200"
                                >
                                    <X className="h-2.5 w-2.5" />
                                </button>
                            </span>
                        ))}
                    <button
                        type="button"
                        onClick={() => setColumnSearch({})}
                        className="ml-auto text-[11px] font-medium text-gray-500 hover:text-gray-800"
                    >
                        Limpiar todo
                    </button>
                </div>
            )}

            <div className="overflow-hidden rounded-lg border border-edge bg-white shadow-sm">
                {loading ? (
                    <div className="flex items-center justify-center py-16">
                        <Spinner size="lg" className="text-primary-600" />
                    </div>
                ) : (
                    <>
                        {/* Scroll horizontal común: encabezado y cuerpo se desplazan juntos. */}
                        <div className="hidden overflow-x-auto md:block">
                          <div style={{ minWidth: minTableWidth }}>
                            {/* Encabezado fijo (fuera del scroll vertical). Reserva el hueco de la
                                barra y lo pinta del mismo color para que no quede un espacio en blanco. */}
                            <div className="bg-gradient-to-br from-primary-600 to-primary-700" style={{ paddingRight: gutter }}>
                                <table className="w-full table-fixed text-left text-sm">
                                    <colgroup>
                                        {allColumns.map((col) => (
                                            <col key={col.key} style={{ width: colWidth(col) }} />
                                        ))}
                                    </colgroup>
                                    <thead>
                                        <tr className="text-white">
                                            {visibleColumns.map((col) => {
                                                const isSorted = sort.key === col.key;
                                                const isDragged = dragging === col.key;
                                                const isTarget = dragOver === col.key && dragging !== col.key;

                                                return (
                                                    <th
                                                        key={col.key}
                                                        scope="col"
                                                        draggable={resizingKey === null}
                                                        onDragStart={() => setDragging(col.key)}
                                                        onDragEnd={() => {
                                                            setDragging(null);
                                                            setDragOver(null);
                                                        }}
                                                        onDragOver={(e) => {
                                                            e.preventDefault();
                                                            setDragOver(col.key);
                                                        }}
                                                        onDrop={() => handleDrop(col.key)}
                                                        className={cn(
                                                            'group relative overflow-hidden px-4',
                                                            dense ? 'py-2' : 'py-3',
                                                            resizingKey === col.key ? 'select-none' : 'transition-[background-color,opacity] duration-150',
                                                            isDragged && 'opacity-40',
                                                            isTarget && 'bg-white/15',
                                                            col.headerClassName,
                                                        )}
                                                    >
                                                        {isTarget && <span className="absolute inset-y-0 left-0 w-0.5 bg-white" />}

                                                        <div className={cn('flex min-w-0 items-center gap-1', col.align === 'right' && 'justify-end')}>
                                                            <GripVertical
                                                                className="hidden h-3.5 w-3.5 shrink-0 cursor-grab text-white/60 group-hover:inline-block hover:text-white active:cursor-grabbing"
                                                                aria-hidden="true"
                                                            />

                                                            <span className="min-w-0 truncate text-xs font-semibold uppercase tracking-wide">
                                                                {col.label}
                                                            </span>

                                                            {col.sortable !== false && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => toggleSort(col.key)}
                                                                    aria-label={`Ordenar por ${col.label}`}
                                                                    className={cn(
                                                                        'shrink-0 rounded p-0.5 text-white transition-opacity',
                                                                        isSorted ? 'opacity-100' : 'hidden opacity-60 group-hover:block hover:opacity-100',
                                                                    )}
                                                                >
                                                                    {isSorted && sort.dir === 'asc' ? (
                                                                        <ArrowUp className="h-3.5 w-3.5" />
                                                                    ) : isSorted ? (
                                                                        <ArrowDown className="h-3.5 w-3.5" />
                                                                    ) : (
                                                                        <ChevronsUpDown className="h-3.5 w-3.5" />
                                                                    )}
                                                                </button>
                                                            )}

                                                            {col.searchable !== false && (
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => {
                                                                        const th = e.currentTarget.closest('th');
                                                                        setAnchorColSearch(th);
                                                                        setOpenColSearch((k) => (k === col.key ? null : col.key));
                                                                    }}
                                                                    aria-label={`Buscar en ${col.label}`}
                                                                    className={cn(
                                                                        'shrink-0 rounded p-0.5 text-white transition-opacity',
                                                                        columnSearch[col.key]?.trim()
                                                                            ? 'opacity-100'
                                                                            : 'hidden opacity-60 group-hover:block hover:opacity-100',
                                                                    )}
                                                                >
                                                                    <Search className="h-3.5 w-3.5" />
                                                                </button>
                                                            )}
                                                        </div>

                                                        {/* tirador para agrandar o reducir la columna */}
                                                        <span
                                                            role="separator"
                                                            aria-orientation="vertical"
                                                            aria-label={`Redimensionar ${col.label}`}
                                                            onMouseDown={(e) => startResize(e, col.key)}
                                                            onDoubleClick={() => resetWidth(col.key)}
                                                            onDragStart={(e) => e.preventDefault()}
                                                            className={cn(
                                                                'absolute right-0 top-0 z-10 flex h-full w-2 cursor-col-resize items-center justify-center',
                                                                'after:h-1/2 after:w-0.5 after:rounded-full after:bg-white after:opacity-60 after:transition-opacity',
                                                                resizingKey === col.key ? 'after:opacity-100' : 'hover:after:opacity-100',
                                                            )}
                                                        />
                                                    </th>
                                                );
                                            })}

                                            {actionsCol && (
                                                <th
                                                    scope="col"
                                                    className={cn(
                                                        'px-4 text-xs font-semibold uppercase tracking-wide',
                                                        dense ? 'py-2' : 'py-3',
                                                    )}
                                                >
                                                    {actionsCol.label}
                                                </th>
                                            )}
                                        </tr>
                                    </thead>
                                </table>
                            </div>
                            {/* Cuerpo desplazable: la barra de scroll aparece solo aquí. */}
                            <div
                                ref={bodyRef}
                                className="overflow-y-auto"
                                style={{
                                    height: height ?? undefined,
                                    maxHeight: height ?? maxHeight,
                                    // 'clip' (a diferencia de 'hidden') no crea un contexto de scroll propio
                                    // en este eje: el scroll horizontal queda solo en el contenedor de afuera,
                                    // así el encabezado y el cuerpo nunca se desalinean entre sí.
                                    overflowX: 'clip',
                                }}
                            >
                                <table className="w-full table-fixed text-left text-sm">
                                    <colgroup>
                                        {allColumns.map((col) => (
                                            <col key={col.key} style={{ width: colWidth(col) }} />
                                        ))}
                                    </colgroup>
                                    <tbody className="divide-y divide-gray-100">
                                        {filteredRows.length === 0 && (
                                            <tr>
                                                <td colSpan={allColumns.length} className="px-4 py-12 text-center text-sm text-gray-400">
                                                    {emptyMessage}
                                                </td>
                                            </tr>
                                        )}
                                        {filteredRows.map((row, index) => (
                                            <tr
                                                key={row[keyField] ?? index}
                                                onClick={onRowClick ? () => onRowClick(row) : undefined}
                                                className={cn(
                                                    'transition',
                                                    onRowClick ? 'cursor-pointer hover:bg-primary-50/50' : 'hover:bg-gray-50',
                                                    rowClassName?.(row),
                                                )}
                                            >
                                                {visibleColumns.map((col) => (
                                                    <td
                                                        key={col.key}
                                                        className={cn(
                                                            // overflow-hidden: con table-fixed, un contenido largo
                                                            // se montaba sobre la columna siguiente.
                                                            'overflow-hidden px-4 align-middle text-gray-700',
                                                            dense ? 'py-2' : 'py-3',
                                                            col.align === 'right' && 'text-right',
                                                        )}
                                                    >
                                                        {col.render ? col.render(row) : row[col.key]}
                                                    </td>
                                                ))}

                                                {actionsCol && (
                                                    <td className={cn('overflow-hidden px-4 align-middle', dense ? 'py-2' : 'py-3')}>
                                                        {isActionsColumn(actionsCol) && actionsCol.render ? (
                                                            actionsCol.render(row)
                                                        ) : (
                                                            <span className="flex items-center justify-end gap-1">
                                                                {actionsCol.actions?.(row)}
                                                            </span>
                                                        )}
                                                    </td>
                                                )}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                          </div>
                        </div>

                    <div
                        className="space-y-3 overflow-y-auto bg-gray-50 p-3 md:hidden"
                        style={{ height: height ?? undefined, maxHeight: height ?? maxHeight }}
                    >
                        {filteredRows.length === 0 && (
                            <p className="px-4 py-12 text-center text-sm text-gray-400">
                                {emptyMessage}
                            </p>
                        )}
                        {filteredRows.map((row, index) => {
                            const titleCol = visibleColumns[0];
                            const title = titleCol?.render
                                ? titleCol.render(row)
                                : row[titleCol?.key];
                            const bodyCols = visibleColumns.slice(1);

                            return (
                                <div
                                    key={row[keyField] ?? index}
                                    onClick={
                                        onRowClick ? () => onRowClick(row) : undefined
                                    }
                                    className={cn(
                                        'rounded-xl border border-edge bg-white p-4 shadow-sm transition-colors',
                                        onRowClick && 'cursor-pointer active:bg-primary-50/50',
                                        rowClassName?.(row),
                                    )}
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="text-sm font-semibold text-warm-900">
                                                {title}
                                            </div>
                                        </div>
                                        {actionsCol && (
                                            <div
                                                className="flex shrink-0 items-center gap-1"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                {actionsCol.render ? actionsCol.render(row) : actionsCol.actions?.(row)}
                                            </div>
                                        )}
                                    </div>
                                    {bodyCols.length > 0 && (
                                        <dl className="mt-2 space-y-1">
                                            {bodyCols.map((col) => (
                                                <div
                                                    key={col.key}
                                                    className="flex items-center justify-between gap-3 text-sm"
                                                >
                                                    <dt className="shrink-0 text-xs text-gray-500">
                                                        {col.label}
                                                    </dt>
                                                    <dd className="min-w-0 truncate text-right text-gray-800">
                                                        {col.render
                                                            ? col.render(row)
                                                            : row[col.key]}
                                                    </dd>
                                                </div>
                                            ))}
                                        </dl>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                    </>
                )}
            </div>

            {openColSearch && byKey[openColSearch] && (
                <ColumnSearchPopover
                    column={byKey[openColSearch]}
                    anchor={anchorColSearch}
                    value={columnSearch[openColSearch] ?? ''}
                    onChange={(v) => setColumnSearch((prev) => ({ ...prev, [openColSearch]: v }))}
                    onClose={() => setOpenColSearch(null)}
                />
            )}
        </div>
    );
}
