import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronsUpDown, LogOut, Warehouse } from 'lucide-react';
import api, { asList } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useAlmacenPropio } from '../lib/almacenes';
import { guardarAlmacenActivo, leerAlmacenActivo } from '../lib/almacenActivo';
import { cn } from './ui';

function Avatar({ user, size = 'md' }) {
    const initials = (user?.name ?? '?')
        .split(' ')
        .map((p) => p[0])
        .slice(0, 2)
        .join('')
        .toUpperCase();

    return (
        <div
            className={cn(
                'flex shrink-0 items-center justify-center rounded-full bg-primary-600 font-semibold text-white',
                size === 'md' ? 'h-9 w-9 text-xs' : 'h-8 w-8 text-[10px]',
            )}
        >
            {initials}
        </div>
    );
}

/**
 * El usuario con el que se entró. `barra`: en la barra de arriba, junto a la campana de alertas, con el almacén
 * (sucursal) donde trabaja. Sin `barra`: el bloque de siempre del menú lateral.
 */
export default function UserMenu({ compact = false, barra = false }) {
    const { user, logout } = useAuth();
    const { esSuperAdmin, almacenNombre } = useAlmacenPropio();
    const almacen = almacenNombre ?? (esSuperAdmin ? 'Todos los almacenes' : 'Sin almacén asignado');
    const [open, setOpen] = useState(false);
    /** Los almacenes entre los que el Super Admin puede cambiar (se piden al abrir el menú). */
    const [almacenes, setAlmacenes] = useState([]);
    useEffect(() => {
        if (!open || !esSuperAdmin || almacenes.length) return;
        api.get('/almacenes').then((res) => setAlmacenes(asList(res).filter((a) => a.activo !== false))).catch(() => {});
    }, [open, esSuperAdmin, almacenes.length]);
    const cambiarAlmacen = (a) => {
        if (String(a.id) === String(leerAlmacenActivo()?.id)) return setOpen(false);
        guardarAlmacenActivo(a);
        // Lo que está en pantalla es del almacén anterior: se recarga todo.
        window.location.reload();
    };
    const menuRef = useRef(null);

    useEffect(() => {
        const handler = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    if (barra) {
        return (
            <div ref={menuRef} className="relative">
                <button
                    onClick={() => setOpen((v) => !v)}
                    aria-haspopup="menu"
                    aria-expanded={open}
                    className="flex items-center gap-3 rounded-full border border-edge bg-white py-1 pl-1 pr-3 text-left shadow-sm transition hover:bg-primary-50"
                >
                    <Avatar user={user} />
                    <span className="hidden min-w-0 sm:block">
                        <span className="block max-w-[11rem] truncate text-sm font-semibold leading-tight text-gray-900">{user?.name}</span>
                        <span className="block max-w-[11rem] truncate text-[11px] leading-tight text-gray-500">{user?.email}</span>
                    </span>
                    <span className="hidden items-center gap-1 whitespace-nowrap rounded-full bg-primary-50 px-2.5 py-1 text-xs font-semibold text-primary-700 md:inline-flex" title="Almacén (sucursal) en el que trabajas">
                        <Warehouse className="h-3.5 w-3.5" />
                        {almacen}
                    </span>
                    <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />
                </button>

                {open && (
                    <div role="menu" className="absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-lg border border-edge bg-white shadow-lg">
                        <div className="border-b border-edge bg-gray-50 px-4 py-3">
                            <p className="truncate text-sm font-medium text-gray-900">{user?.name}</p>
                            <p className="truncate text-xs text-gray-500">{user?.email}</p>
                            <p className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-primary-700">
                                <Warehouse className="h-3.5 w-3.5" />
                                {almacen}
                            </p>
                        </div>
                        <div className="p-1.5">
                            {/* El Super Admin cambia de almacén eligiendo otro de la lista. */}
                            {esSuperAdmin && almacenes.length > 0 && (
                                <div className="mb-1.5 border-b border-edge pb-1.5">
                                    <p className="px-3 pb-1 pt-0.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Almacenes</p>
                                    {almacenes.map((a) => {
                                        const actual = String(a.id) === String(leerAlmacenActivo()?.id);
                                        return (
                                            <button
                                                key={a.id}
                                                role="menuitemradio"
                                                aria-checked={actual}
                                                onClick={() => cambiarAlmacen(a)}
                                                className={cn(
                                                    'flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition',
                                                    actual ? 'bg-primary-50 font-semibold text-primary-700' : 'text-warm-700 hover:bg-gray-50',
                                                )}
                                            >
                                                <Warehouse className="h-4 w-4 shrink-0" />
                                                <span className="min-w-0 flex-1 truncate text-left">{a.nombre}</span>
                                                {actual && <Check className="h-4 w-4 shrink-0" />}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                            <button
                                role="menuitem"
                                onClick={logout}
                                className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50"
                            >
                                <LogOut className="h-4 w-4" />
                                Cerrar sesión
                            </button>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div ref={menuRef} className="relative">
            <button
                onClick={() => setOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={open}
                title={compact ? user?.name : undefined}
                className={cn(
                    'flex w-full items-center rounded-lg transition hover:bg-gray-100',
                    compact ? 'justify-center p-1.5' : 'gap-3 px-2 py-2 text-left',
                )}
            >
                <Avatar user={user} size={compact ? 'sm' : 'md'} />
                {!compact && (
                    <>
                        <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-gray-900">
                                {user?.name}
                            </span>
                            <span className="block truncate text-xs text-gray-500">
                                {user?.email}
                            </span>
                        </span>
                        <ChevronsUpDown className="h-4 w-4 shrink-0 text-gray-400" />
                    </>
                )}
            </button>

            {open && (
                <div
                    role="menu"
                    className={cn(
                        'absolute bottom-full z-50 mb-2 overflow-hidden rounded-lg border border-edge bg-white shadow-lg',
                        compact ? 'left-0 w-56' : 'left-0 right-0',
                    )}
                >
                    <div className="border-b border-edge bg-gray-50 px-4 py-3">
                        <p className="truncate text-sm font-medium text-gray-900">{user?.name}</p>
                        <p className="truncate text-xs text-gray-500">{user?.email}</p>
                    </div>
                    <div className="p-1.5">
                        <button
                            role="menuitem"
                            onClick={logout}
                            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50"
                        >
                            <LogOut className="h-4 w-4" />
                            Cerrar sesión
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
