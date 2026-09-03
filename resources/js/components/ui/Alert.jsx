import { cn } from './cn';

const variants = {
    error: 'bg-danger-50 text-danger-700 ring-danger-200',
    success: 'bg-success-50 text-success-700 ring-success-200',
    warning: 'bg-warning-50 text-warning-700 ring-warning-200',
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
