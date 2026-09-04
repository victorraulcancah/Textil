import { useState } from 'react';
import AlertsBell from './AlertsBell';
import Sidebar from './Sidebar';
import { cn } from './ui';

const COLLAPSE_STORAGE = 'sidebar_collapsed';

export default function Layout({ children }) {
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

    return (
        <div className="min-h-screen bg-surface">
            <Sidebar collapsed={collapsed} onToggleCollapse={toggleCollapsed} />
            <AlertsBell />
            <div
                className={cn(
                    'flex min-h-screen flex-col transition-[padding]',
                    collapsed ? 'lg:pl-16' : 'lg:pl-64',
                )}
            >
                <main className="flex-1 px-4 pb-6 pt-16 sm:px-6 lg:px-8 lg:pr-20 lg:pt-6">{children}</main>
            </div>
        </div>
    );
}
