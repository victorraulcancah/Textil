import Spinner from './Spinner';
import { cn } from './cn';

const variants = {
    primary:
        'bg-primary-600 text-white hover:bg-primary-700 focus-visible:ring-primary-500 disabled:hover:bg-primary-600',
    secondary:
        'bg-white text-gray-700 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus-visible:ring-primary-500',
    danger:
        'bg-danger-600 text-white hover:bg-danger-700 focus-visible:ring-danger-500 disabled:hover:bg-danger-600',
    success:
        'bg-success-600 text-white hover:bg-success-700 focus-visible:ring-success-500 disabled:hover:bg-success-600',
    ghost: 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
};

const sizes = {
    sm: 'px-2.5 py-1.5 text-xs',
    md: 'px-3 py-2 text-sm',
    lg: 'px-4 py-2.5 text-base',
};

export default function Button({
    variant = 'primary',
    size = 'md',
    loading = false,
    className,
    disabled,
    children,
    ...props
}) {
    return (
        <button
            className={cn(
                'inline-flex items-center justify-center gap-2 rounded-md font-medium shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60',
                variants[variant],
                sizes[size],
                className,
            )}
            disabled={disabled || loading}
            {...props}
        >
            {loading && <Spinner size="sm" />}
            {children}
        </button>
    );
}
