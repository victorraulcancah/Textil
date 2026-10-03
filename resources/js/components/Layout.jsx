import { useState } from 'react';
import AlertsBell from './AlertsBell';
import Sidebar from './Sidebar';
import UserMenu from './UserMenu';
import SeleccionAlmacen from './SeleccionAlmacen';
import { useAlmacenPropio } from '../lib/almacenes';
import { cn } from './ui';

const COLLAPSE_STORAGE = 'sidebar_collapsed';

export default function Layout({ children }) {
    const { superAdmin } = useAlmacenPropio();
    const [collapsed, setCollapsed] = useState(() => {
        try {
            return localStorage.getItem(COLLAPSE_STORAGE) === '1';
        } catch {
            return false;
        }
    });

    const toggleCollapsed = () => {
        setCollapsed((prev) => {
            const next = !prev;
            try {
                localStorage.setItem(COLLAPSE_STORAGE, next ? '1' : '0');
            } catch {
                /* ignorar */
            }
            return next;
        });
    };

    // El Super Admin tiene que elegir en qué almacén trabaja antes de ver nada.
    if (superAdmin) {
        return <SeleccionAlmacen />;
    }

    return (
        <div className="min-h-screen bg-surface">
            <Sidebar collapsed={collapsed} onToggleCollapse={toggleCollapsed} />
            <div
                className={cn(
                    'flex min-h-screen flex-col transition-[padding]',
                    collapsed ? 'lg:pl-16' : 'lg:pl-52',
                )}
            >
                {/* La barra de arriba: el usuario con su almacén y la campana de alertas. */}
                <div className="flex h-14 shrink-0 items-center justify-end gap-3 px-4 pl-16 sm:px-6 lg:px-8">
                    <UserMenu barra />
                    <AlertsBell />
                </div>
                <main className="flex-1 px-4 pb-6 pt-2 sm:px-6 lg:px-8">{children}</main>
            </div>
        </div>
    );
}
