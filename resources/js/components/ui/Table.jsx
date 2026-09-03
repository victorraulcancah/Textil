import { cn } from './cn';

export function Table({ className, children }) {
    return (
        <div className="overflow-x-auto">
            <table className={cn('w-full text-left text-sm', className)}>
                {children}
            </table>
        </div>
    );
}

export function THead({ className, children }) {
    return (
        <thead className={cn('border-b border-gray-200', className)}>
            {children}
        </thead>
    );
}

export function TBody({ className, children }) {
    return <tbody className={cn('divide-y divide-gray-100', className)}>{children}</tbody>;
}

export function TR({ className, children }) {
    return <tr className={cn('transition hover:bg-gray-50', className)}>{children}</tr>;
}

export function TH({ className, children }) {
    return (
        <th
            scope="col"
            className={cn('px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500', className)}
        >
            {children}
        </th>
    );
}

export function TD({ className, children }) {
    return <td className={cn('px-4 py-3 text-gray-700', className)}>{children}</td>;
}

export function TableEmpty({ colSpan, message = 'No hay registros para mostrar' }) {
    return (
        <tr>
            <td colSpan={colSpan} className="px-4 py-10 text-center text-sm text-gray-400">
                {message}
            </td>
        </tr>
    );
}
