import { Plus } from 'lucide-react';
import { Button } from './ui';

export default function PageHeader({ title, description, actions }) {
    return (
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-warm-900">{title}</h1>
                {description && <p className="mt-1 text-sm text-warm-500">{description}</p>}
            </div>
            {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
    );
}

export function CreateButton({ children = 'Crear', ...props }) {
    return (
        <Button {...props}>
            <Plus className="h-4 w-4" />
            {children}
        </Button>
    );
}
