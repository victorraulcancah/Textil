import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { NavLink, useLocation } from 'react-router-dom';
import { ChevronDown, ChevronsLeft, ChevronsRight, Menu, X } from 'lucide-react';
import { navigation } from '../config/navigation';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { cn } from './ui';
import UserMenu from './UserMenu';

const GROUPS_STORAGE = 'sidebar_groups';
const GROUP_LABELS = navigation.filter((i) => i.children).map((i) => i.label);

// Estado inicial de los grupos: contraídos por defecto (o lo guardado en localStorage).
function initGroups() {
    try {
        const saved = JSON.parse(localStorage.getItem(GROUPS_STORAGE));
        if (saved && typeof saved === 'object') return saved;
    } catch {
        /* localStorage no disponible o corrupto */
    }
    return Object.fromEntries(GROUP_LABELS.map((label) => [label, true]));
}

function persistGroups(groups) {
    try {
        localStorage.setItem(GROUPS_STORAGE, JSON.stringify(groups));
    } catch {
        /* ignorar */
    }
}

/** Barrita azul del elemento activo, pegada al borde izquierdo del sidebar. */
function Accento({ className }) {
    return (
        <span
            aria-hidden
            className={cn(
                'absolute top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-primary-600',
                className,
            )}
        />
    );
}

/** Punto de la derecha: marca discreta de cada módulo. */
function Punto({ activo }) {
    return (
        <span
            aria-hidden
            className={cn(
                'ml-auto h-1.5 w-1.5 shrink-0 rounded-full transition',
                activo ? 'bg-primary-500' : 'bg-gray-300',
            )}
        />
    );
}

export default function Sidebar({ collapsed = false, onToggleCollapse }) {
    const { puede } = useAuth();
    const { pathname } = useLocation();

    /**
     * Solo lo que el rol puede ver: se ocultan los módulos sin permiso, y un
     * grupo desaparece cuando se queda sin hijos visibles.
     */
    const navegacion = useMemo(() => {
        const visible = (item) => !item.permiso || puede(item.permiso);

        return navigation
            .map((item) => {
                if (!item.children) return visible(item) ? item : null;
                const hijos = item.children.filter(visible);
                return hijos.length ? { ...item, children: hijos } : null;
            })
            .filter(Boolean);
    }, [puede]);

    /** Un grupo se resalta cuando la ruta actual pertenece a alguno de sus hijos. */
    const grupoActivo = useCallback(
        (item) => item.children.some((c) => pathname === c.to || pathname.startsWith(c.to + '/')),
        [pathname],
    );

    const [branding, setBranding] = useState(null);
    useEffect(() => {
        api.get('/branding')
            .then((res) => setBranding(res.data))
            .catch(() => {});
    }, []);

    const [collapsedGroups, setCollapsedGroups] = useState(initGroups);
    const [mobileOpen, setMobileOpen] = useState(false);
    const [isDesktop, setIsDesktop] = useState(
        () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches,
    );

    // Detecta escritorio para saber si el modo "rail" (barra de iconos) aplica.
    useEffect(() => {
        const mq = window.matchMedia('(min-width: 1024px)');
        const handler = (e) => setIsDesktop(e.matches);
        mq.addEventListener('change', handler);
        return () => mq.removeEventListener('change', handler);
    }, []);

    // El sidebar se contrae a iconos solo en escritorio; en móvil siempre es el drawer completo.
    const rail = collapsed && isDesktop;

    /** Submenú flotante del modo rail: { label, top, children }. */
    const [flyout, setFlyout] = useState(null);
    const flyoutRef = useRef(null);

    const cerrarFlyout = useCallback(() => setFlyout(null), []);

    // Al desplegar el sidebar el flyout deja de tener sentido.
    useEffect(() => {
        if (!rail) cerrarFlyout();
    }, [rail, cerrarFlyout]);

    // Se cierra al hacer clic fuera, con Escape o si cambia el tamaño de la ventana.
    useEffect(() => {
        if (!flyout) return undefined;

        const alClic = (e) => {
            if (flyoutRef.current?.contains(e.target)) return;
            if (e.target.closest?.('[data-rail-group]')) return;
            cerrarFlyout();
        };
        const alTeclado = (e) => e.key === 'Escape' && cerrarFlyout();

        document.addEventListener('mousedown', alClic);
        document.addEventListener('keydown', alTeclado);
        window.addEventListener('resize', cerrarFlyout);
        return () => {
            document.removeEventListener('mousedown', alClic);
            document.removeEventListener('keydown', alTeclado);
            window.removeEventListener('resize', cerrarFlyout);
        };
    }, [flyout, cerrarFlyout]);

    /** Abre el submenú junto al icono, sin salirse de la pantalla. */
    const abrirFlyout = (item, e) => {
        if (flyout?.label === item.label) return cerrarFlyout();

        const r = e.currentTarget.getBoundingClientRect();
        const alto = 52 + item.children.length * 38;
        const top = Math.max(8, Math.min(r.top, window.innerHeight - alto - 8));

        setFlyout({ label: item.label, top, children: item.children, icon: item.icon });
    };

    const toggleGroup = (label) => {
        setCollapsedGroups((prev) => {
            const next = { ...prev, [label]: !prev[label] };
            persistGroups(next);
            return next;
        });
    };

    return (
        <>
            <button
                onClick={() => setMobileOpen(true)}
                aria-label="Abrir menú"
                className="fixed left-4 top-4 z-40 rounded-md p-2 text-gray-600 hover:bg-gray-100 lg:hidden"
            >
                <Menu className="h-5 w-5" />
            </button>

            {mobileOpen && (
                <div
                    className="fixed inset-0 z-40 bg-black/50 lg:hidden"
                    onClick={() => setMobileOpen(false)}
                />
            )}

            <aside
                className={cn(
                    'fixed inset-y-0 left-0 z-50 flex w-60 flex-col border-r border-edge bg-white transition-[transform,width] duration-200 ease-out lg:translate-x-0',
                    mobileOpen ? 'translate-x-0' : '-translate-x-full',
                    collapsed ? 'lg:w-16' : 'lg:w-52',
                )}
            >
                <div
                    className={cn(
                        'flex h-14 shrink-0 items-center border-b border-edge',
                        rail ? 'justify-center px-2' : 'justify-between pl-3 pr-2',
                    )}
                >
                    {rail ? (
                        <div className="flex flex-col items-center gap-1">
                            <img
                                src={branding?.favicon_url ?? '/img/logo-telas-icon.svg'}
                                alt={branding?.nombre_comercial ?? 'Logo'}
                                className="h-6 w-6 object-contain"
                            />
                            <button
                                onClick={onToggleCollapse}
                                aria-label="Desplegar menú"
                                title="Desplegar menú"
                                className="rounded-md p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
                            >
                                <ChevronsRight className="h-4 w-4" />
                            </button>
                        </div>
                    ) : (
                        <>
                            <img
                                src={branding?.logo_url ?? '/img/logo-telas.svg'}
                                alt={branding?.nombre_comercial ?? 'Logo'}
                                className="h-9 w-auto max-w-[8.5rem] object-contain"
                            />
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={onToggleCollapse}
                                    aria-label="Contraer menú"
                                    title="Contraer menú"
                                    className="hidden rounded-md p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 lg:inline-flex"
                                >
                                    <ChevronsLeft className="h-4 w-4" />
                                </button>
                                <button
                                    onClick={() => setMobileOpen(false)}
                                    aria-label="Cerrar menú"
                                    className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 lg:hidden"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            </div>
                        </>
                    )}
                </div>

                <nav className="flex-1 overflow-y-auto overscroll-contain px-2 py-3 [scrollbar-width:thin]">
                    {rail ? (
                        navegacion.map((item) => {
                            const Icon = item.icon;
                            if (!item.children) {
                                return (
                                    <NavLink
                                        key={item.to}
                                        to={item.to}
                                        title={item.label}
                                        className={({ isActive }) =>
                                            cn(
                                                'relative mb-1 flex items-center justify-center rounded-lg p-2.5 transition',
                                                isActive
                                                    ? 'bg-primary-50 text-primary-700'
                                                    : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900',
                                            )
                                        }
                                    >
                                        {({ isActive }) => (
                                            <>
                                                {isActive && <Accento className="-left-2" />}
                                                <Icon className="h-[18px] w-[18px]" />
                                            </>
                                        )}
                                    </NavLink>
                                );
                            }
                            // Grupo en modo rail: despliega sus submódulos al costado.
                            const abierto = flyout?.label === item.label;
                            const activo = grupoActivo(item);
                            return (
                                <button
                                    key={item.label}
                                    data-rail-group
                                    onClick={(e) => abrirFlyout(item, e)}
                                    title={item.label}
                                    aria-expanded={abierto}
                                    className={cn(
                                        'relative mb-1 flex w-full items-center justify-center rounded-lg p-2.5 transition',
                                        abierto || activo
                                            ? 'bg-primary-50 text-primary-700'
                                            : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900',
                                    )}
                                >
                                    {activo && <Accento className="-left-2" />}
                                    <Icon className="h-[18px] w-[18px]" />
                                </button>
                            );
                        })
                    ) : (
                        <>
                            <div className="mb-1.5 px-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400">
                                Principal
                            </div>
                            {navegacion.map((item) => {
                                if (!item.children) {
                                    return (
                                        <NavLink
                                            key={item.to}
                                            to={item.to}
                                            onClick={() => setMobileOpen(false)}
                                            className={({ isActive }) =>
                                                cn(
                                                    'relative mb-0.5 flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition',
                                                    isActive
                                                        ? 'bg-primary-50 font-semibold text-primary-700'
                                                        : 'font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900',
                                                )
                                            }
                                        >
                                            {({ isActive }) => (
                                                <>
                                                    {isActive && <Accento className="-left-2" />}
                                                    <item.icon
                                                        className={cn(
                                                            'h-[17px] w-[17px] shrink-0',
                                                            isActive
                                                                ? 'text-primary-600'
                                                                : 'text-gray-400',
                                                        )}
                                                    />
                                                    <span className="truncate">{item.label}</span>
                                                    <Punto activo={isActive} />
                                                </>
                                            )}
                                        </NavLink>
                                    );
                                }

                                const open = !collapsedGroups[item.label];
                                const activo = grupoActivo(item);
                                return (
                                    <div key={item.label} className="mb-0.5">
                                        <button
                                            onClick={() => toggleGroup(item.label)}
                                            aria-expanded={open}
                                            className={cn(
                                                'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-semibold transition',
                                                activo
                                                    ? 'text-primary-700'
                                                    : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800',
                                            )}
                                        >
                                            <item.icon className="h-[17px] w-[17px] shrink-0" />
                                            <span className="flex-1 truncate text-left">
                                                {item.label}
                                            </span>
                                            <ChevronDown
                                                className={cn(
                                                    'h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform duration-200',
                                                    open && 'rotate-180',
                                                )}
                                            />
                                        </button>
                                        {open && (
                                            <div
                                                className="my-0.5 ml-[1.3rem] border-l border-gray-200 pl-2"
                                                style={{ animation: 'accordion-in 0.18s ease-out' }}
                                            >
                                                {item.children.map((child) => (
                                                    <NavLink
                                                        key={child.to}
                                                        to={child.to}
                                                        onClick={() => setMobileOpen(false)}
                                                        className={({ isActive }) =>
                                                            cn(
                                                                'relative mb-0.5 flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px] transition',
                                                                isActive
                                                                    ? 'bg-primary-50 font-semibold text-primary-700'
                                                                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
                                                            )
                                                        }
                                                    >
                                                        {({ isActive }) => (
                                                            <>
                                                                {isActive && (
                                                                    <Accento className="-left-[9px]" />
                                                                )}
                                                                <child.icon
                                                                    className={cn(
                                                                        'h-4 w-4 shrink-0',
                                                                        isActive
                                                                            ? 'text-primary-600'
                                                                            : 'text-gray-400',
                                                                    )}
                                                                />
                                                                <span className="truncate">
                                                                    {child.label}
                                                                </span>
                                                                <Punto activo={isActive} />
                                                            </>
                                                        )}
                                                    </NavLink>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </>
                    )}
                </nav>

                <div className="shrink-0 border-t border-edge p-2">
                    <UserMenu compact={rail} />
                </div>
            </aside>

            {/* Submenú del modo contraído. Va en un portal porque el nav recorta
                su contenido con overflow-y-auto. */}
            {rail &&
                flyout &&
                createPortal(
                    <div
                        ref={flyoutRef}
                        role="menu"
                        style={{
                            position: 'fixed',
                            top: flyout.top,
                            left: '4.25rem',
                            zIndex: 60,
                            animation: 'flyout-in 0.15s ease-out',
                        }}
                        className="w-56 rounded-xl border border-edge bg-white p-1.5 shadow-xl"
                    >
                        <div className="mb-1 flex items-center gap-2 px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400">
                            <flyout.icon className="h-3.5 w-3.5" />
                            {flyout.label}
                        </div>
                        {flyout.children.map((child) => (
                            <NavLink
                                key={child.to}
                                to={child.to}
                                onClick={cerrarFlyout}
                                className={({ isActive }) =>
                                    cn(
                                        'flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px] transition',
                                        isActive
                                            ? 'bg-primary-50 font-semibold text-primary-700'
                                            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
                                    )
                                }
                            >
                                {({ isActive }) => (
                                    <>
                                        <child.icon
                                            className={cn(
                                                'h-4 w-4 shrink-0',
                                                isActive ? 'text-primary-600' : 'text-gray-400',
                                            )}
                                        />
                                        <span className="truncate">{child.label}</span>
                                        <Punto activo={isActive} />
                                    </>
                                )}
                            </NavLink>
                        ))}
                    </div>,
                    document.body,
                )}
        </>
    );
}
