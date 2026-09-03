import { useEffect, useMemo, useRef, useState } from 'react';
import { Columns3, Funnel, Search, X } from 'lucide-react';
import useDebounce from '../../hooks/useDebounce';
import { cn } from './cn';
import Spinner from './Spinner';

function ToolbarButton({ label, children, onClick }) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={label}
            title={label}
            className="relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-gray-500 transition hover:bg-gray-100 hover:text-gray-900"
        >
            {children}
        </button>
    );
}

function Dropdown({ open, onClose, children, align = 'right', width = 'w-64' }) {
    const ref = useRef(null);

    useEffect(() => {
        const handler = (e) => {
            if (ref.current && !ref.current.contains(e.target)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [onClose]);

    if (!open) return null;

    return (
        <div
            ref={ref}
            style={{ animation: 'dropdown-in 0.15s ease-out' }}
            className={cn(
                'absolute z-50 mt-1 rounded-lg border border-edge bg-white p-2 shadow-xl',
                width,
                align === 'right' ? 'right-0' : 'left-0',
            )}
        >
            {children}
        </div>
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

    const visibleColumns = useMemo(
        () => columns.filter((col) => !hiddenColumns[col.key]),
        [columns, hiddenColumns],
    );

    const filteredRows = useMemo(() => {
        if (!debouncedSearch.trim()) return rows;
        const q = debouncedSearch.trim().toLowerCase();
        return rows.filter((row) =>
            visibleColumns.some((col) => {
                if (col.searchable === false) return false;
                const value = col.getSearchValue
                    ? col.getSearchValue(row)
                    : row[col.key];
                return value != null && String(value).toLowerCase().includes(q);
            }),
        );
    }, [rows, debouncedSearch, visibleColumns]);

    const toggleColumn = (key) => {
        setHiddenColumns((prev) => {
            const next = { ...prev };
            if (next[key]) {
                delete next[key];
            } else {
                next[key] = true;
            }
            return next;
        });
    };

    const resetColumns = () => setHiddenColumns({});

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
        if (!el) return;
        const check = () => setHasScroll(el.scrollHeight > el.clientHeight + 1);
        check();
        const ro = new ResizeObserver(check);
        ro.observe(el);
        return () => ro.disconnect();
    });
    const gutter = hasScroll ? scrollbarW : 0;

    // Ancho por columna (para alinear encabezado y cuerpo con table-fixed).
    const colWidth = (col) => col.width ?? (col.type === 'actions' ? '120px' : col.key === 'id' ? '72px' : undefined);

    /**
     * Ancho mínimo que necesita la tabla. Sin esto, con muchas columnas el
     * table-fixed las comprime y las últimas quedan fuera del contenedor.
     * Las columnas sin ancho declarado reservan un mínimo razonable.
     */
    const minTableWidth = visibleColumns.reduce((acc, col) => {
        const w = colWidth(col);
        const px = typeof w === 'string' && w.endsWith('px') ? parseFloat(w) : 170;
        return acc + (Number.isFinite(px) ? px : 170);
    }, 0);

    return (
        <div className="relative rounded-lg border border-edge bg-white shadow-sm">
            {(searchable || filterable || toggleableColumns) && (
                <div className="flex flex-wrap items-center justify-end gap-2 border-b border-edge px-3 py-2.5 sm:px-4">
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
                                        onClick={() => {
                                            setFilterOpen((v) => !v);
                                            setColumnsOpen(false);
                                        }}
                                    >
                                        <Funnel className="h-4 w-4" />
                                        {filterCount > 0 && (
                                            <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary-600 text-[10px] font-bold text-white">
                                                {filterCount}
                                            </span>
                                        )}
                                    </ToolbarButton>
                                    <Dropdown
                                        open={filterOpen}
                                        onClose={() => setFilterOpen(false)}
                                        width="w-80"
                                    >
                                        <p className="px-2 pb-2 pt-0.5 text-xs font-semibold uppercase tracking-wider text-gray-500">
                                            Filtros
                                        </p>
                                        <div className="max-h-96 overflow-y-auto px-2 pb-1">
                                            {filters}
                                        </div>
                                    </Dropdown>
                                </div>
                            )}

                            {toggleableColumns && (
                                <div className="relative">
                                    <ToolbarButton
                                        label="Alternar columnas"
                                        onClick={() => {
                                            setColumnsOpen((v) => !v);
                                            setFilterOpen(false);
                                        }}
                                    >
                                        <Columns3 className="h-4 w-4" />
                                    </ToolbarButton>
                                    <Dropdown
                                        open={columnsOpen}
                                        onClose={() => setColumnsOpen(false)}
                                    >
                                        <div className="flex items-center justify-between px-2 pb-1 pt-0.5">
                                            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                                                Columnas
                                            </p>
                                            {Object.keys(hiddenColumns).length > 0 && (
                                                <button
                                                    type="button"
                                                    onClick={resetColumns}
                                                    className="text-xs font-medium text-red-600 hover:text-red-700"
                                                >
                                                    Restablecer
                                                </button>
                                            )}
                                        </div>
                                        {columns
                                            .filter((col) => col.type !== 'actions')
                                            .map((col) => (
                                                <label
                                                    key={col.key}
                                                    className="flex cursor-pointer select-none items-center gap-2 rounded-md px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={!hiddenColumns[col.key]}
                                                        onChange={() => toggleColumn(col.key)}
                                                        className="h-4 w-4 rounded border-gray-300 accent-primary-600"
                                                    />
                                                    {col.label}
                                                </label>
                                            ))}
                                    </Dropdown>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            <div>
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
                            <div className="bg-primary-600" style={{ paddingRight: gutter }}>
                                <table className="w-full table-fixed text-left text-sm">
                                    <colgroup>
                                        {visibleColumns.map((col) => (
                                            <col key={col.key} style={{ width: colWidth(col) }} />
                                        ))}
                                    </colgroup>
                                    <thead>
                                        <tr className="bg-primary-600 text-white">
                                            {visibleColumns.map((col) => (
                                                <th
                                                    key={col.key}
                                                    scope="col"
                                                    className={cn(
                                                        'px-4 text-xs font-semibold uppercase tracking-wide',
                                                        dense ? 'py-2' : 'py-3',
                                                        col.align === 'right' && 'text-right',
                                                        col.headerClassName,
                                                    )}
                                                >
                                                    {col.label}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                </table>
                            </div>
                            {/* Cuerpo desplazable: la barra de scroll aparece solo aquí. */}
                            <div
                                ref={bodyRef}
                                className="overflow-y-auto"
                                style={{ height: height ?? undefined, maxHeight: height ?? maxHeight }}
                            >
                                <table className="w-full table-fixed text-left text-sm">
                                    <colgroup>
                                        {visibleColumns.map((col) => (
                                            <col key={col.key} style={{ width: colWidth(col) }} />
                                        ))}
                                    </colgroup>
                                    <tbody className="divide-y divide-gray-100">
                                        {filteredRows.length === 0 && (
                                            <tr>
                                                <td
                                                    colSpan={visibleColumns.length}
                                                    className="px-4 py-12 text-center text-sm text-gray-400"
                                                >
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
                                                    onRowClick
                                                        ? 'cursor-pointer hover:bg-primary-50/50'
                                                        : 'hover:bg-gray-50',
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
                                                        {isActionsColumn(col) ? (
                                                            col.render ? (
                                                                col.render(row)
                                                            ) : (
                                                                <span className="flex items-center justify-end gap-1">
                                                                    {col.actions?.(row)}
                                                                </span>
                                                            )
                                                        ) : col.render ? (
                                                            col.render(row)
                                                        ) : (
                                                            row[col.key]
                                                        )}
                                                    </td>
                                                ))}
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
                            const titleCol = columns[0];
                            const title = titleCol?.render
                                ? titleCol.render(row)
                                : row[titleCol?.key];
                            const bodyCols = columns.filter((col, i) => {
                                if (i === 0 || hiddenColumns[col.key]) return false;
                                if (col.type === 'actions') return false;
                                return true;
                            });
                            const actionsCol = columns.find(isActionsColumn);

                            return (
                                <div
                                    key={row[keyField] ?? index}
                                    onClick={
                                        onRowClick ? () => onRowClick(row) : undefined
                                    }
                                    className={cn(
                                        'rounded-xl border border-edge bg-white p-4 shadow-sm',
                                        onRowClick && 'cursor-pointer',
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
                                                {actionsCol.actions?.(row)}
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
        </div>
    );
}
