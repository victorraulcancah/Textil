import { cn } from './cn';

const variants = {
    gray: 'bg-gray-100 text-gray-700 ring-gray-200',
    green: 'bg-success-50 text-success-700 ring-success-200',
    red: 'bg-danger-50 text-danger-700 ring-danger-200',
    amber: 'bg-warning-50 text-warning-700 ring-warning-200',
    blue: 'bg-primary-50 text-primary-700 ring-primary-200',
};

export default function Badge({ variant = 'gray', className, children }) {
    return (
        <span
            className={cn(
                'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
                variants[variant],
                className,
            )}
        >
            {children}
        </span>
    );
}
