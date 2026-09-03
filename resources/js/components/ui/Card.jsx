import { cn } from './cn';

export default function Card({ title, actions, className, children }) {
    return (
        <div
            className={cn(
                'rounded-lg border border-gray-200 bg-white shadow-sm',
                className,
            )}
        >
            {(title || actions) && (
                <div className="flex items-center justify-between gap-4 border-b border-gray-200 px-4 py-3 sm:px-6">
                    {title && (
                        <h3 className="text-base font-semibold text-gray-900">
                            {title}
                        </h3>
                    )}
                    {actions && <div className="flex items-center gap-2">{actions}</div>}
                </div>
            )}
            <div className="p-4 sm:p-6">{children}</div>
        </div>
    );
}
