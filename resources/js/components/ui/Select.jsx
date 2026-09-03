import { forwardRef, useId } from 'react';
import { cn } from './cn';

const Select = forwardRef(function Select(
    { label, error, options = [], className, id: idProp, ...props },
    ref,
) {
    const autoId = useId();
    const id = idProp ?? autoId;

    return (
        <div className="w-full">
            {label && (
                <label
                    htmlFor={id}
                    className="mb-1 block text-sm font-medium text-gray-700"
                >
                    {label}
                </label>
            )}
            <select
                id={id}
                ref={ref}
                className={cn(
                    'block w-full rounded-md border-0 px-3 py-2 text-sm text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-primary-600 disabled:bg-gray-50 disabled:text-gray-500',
                    error && 'ring-red-500 focus:ring-red-500',
                    className,
                )}
                {...props}
            >
                {options.map(({ value, label: optionLabel }) => (
                    <option key={value} value={value}>
                        {optionLabel}
                    </option>
                ))}
            </select>
            {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
        </div>
    );
});

export default Select;
