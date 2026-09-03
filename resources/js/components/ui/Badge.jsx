import { cn } from './cn';

const variants = {
    gray: 'bg-gray-100 text-gray-700 ring-gray-200',
    green: 'bg-green-50 text-green-700 ring-green-200',
    red: 'bg-red-50 text-red-700 ring-red-200',
    amber: 'bg-amber-50 text-amber-700 ring-amber-200',
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
