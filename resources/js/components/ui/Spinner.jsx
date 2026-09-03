import { cn } from './cn';

const sizes = {
    sm: 'h-4 w-4 border-2',
    md: 'h-6 w-6 border-2',
    lg: 'h-8 w-8 border-[3px]',
};

export default function Spinner({ size = 'md', className }) {
    return (
        <span
            aria-hidden="true"
            className={cn(
                'inline-block animate-spin rounded-full border-current border-t-transparent opacity-70',
                sizes[size],
                className,
            )}
        />
    );
}
