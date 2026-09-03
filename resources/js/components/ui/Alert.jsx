import { cn } from './cn';

const variants = {
    error: 'bg-red-50 text-red-700 ring-red-200',
    success: 'bg-green-50 text-green-700 ring-green-200',
    warning: 'bg-amber-50 text-amber-700 ring-amber-200',
    info: 'bg-primary-50 text-primary-700 ring-primary-200',
};

export default function Alert({ variant = 'info', className, children }) {
    return (
        <div
            role="alert"
            className={cn(
                'rounded-md px-3 py-2 text-sm ring-1 ring-inset',
                variants[variant],
                className,
            )}
        >
            {children}
        </div>
    );
}
