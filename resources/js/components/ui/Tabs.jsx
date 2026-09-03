import { cn } from './cn';

export default function Tabs({ items = [], value, onChange, color = 'primary' }) {
    const activeColor = {
        primary: 'border-primary-600 text-primary-700',
        amber: 'border-amber-500 text-amber-600',
        blue: 'border-blue-600 text-blue-700',
        green: 'border-green-600 text-green-700',
        red: 'border-red-600 text-red-700',
    }[color];

    return (
        <div className="flex gap-1 overflow-x-auto border-b border-edge">
            {items.map((item) => {
                const Icon = item.icon;
                const active = item.key === value;

                return (
                    <button
                        key={item.key}
                        type="button"
                        onClick={() => onChange(item.key)}
                        className={cn(
                            'flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition',
                            active
                                ? activeColor
                                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-800',
                        )}
                    >
                        {Icon && (
                            <Icon
                                className={cn('h-4 w-4', active && 'text-current')}
                            />
                        )}
                        {item.label}
                    </button>
                );
            })}
        </div>
    );
}
