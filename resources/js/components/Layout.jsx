import { Suspense, createContext, useContext, useState } from 'react';
import { Outlet } from 'react-router-dom';
import AlertsBell from './AlertsBell';
import BarraPestanas from './BarraPestanas';
import Sidebar from './Sidebar';
import UserMenu from './UserMenu';
import SeleccionAlmacen from './SeleccionAlmacen';
import { useAlmacenPropio } from '../lib/almacenes';
import { usePestanas } from '../lib/pestanas';
import { Spinner, cn } from './ui';

const COLLAPSE_STORAGE = 'sidebar_collapsed';

/** ¿Ya está puesto el marco de la aplicación (menú y barra de arriba) por encima de la página? */
const EnMarco = createContext(false);

/**
 * El marco de la aplicación: el menú lateral, la barra de arriba (pestañas, usuario y alertas) y el contenido.
 */
function Marco({ children }) {
    const { superAdmin } = useAlmacenPropio();
    const hayPestanas = usePestanas().tabs.length > 0;
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
                {/* La barra de arriba: a la izquierda las pestañas de los submódulos abiertos (clic derecho en una opción
                    del menú) y a la derecha el usuario con su almacén y la campana de alertas. */}
                <div
                    className={cn(
                        'flex h-10 shrink-0 items-end gap-3 px-4 pl-16 sm:px-6 lg:px-8',
                        hayPestanas && 'bg-gray-200/70',
                    )}
                >
                    <BarraPestanas />
                    <div className="ml-auto flex shrink-0 items-center gap-3 self-center">
                        <UserMenu barra />
                        <AlertsBell />
                    </div>
                </div>
                <main className="flex-1 px-4 pb-6 pt-2 sm:px-6 lg:px-8">{children}</main>
            </div>
        </div>
    );
}

/**
 * El marco que no se desmonta al cambiar de página: lo usan las rutas (en app.jsx) para que el menú lateral y la barra de
 * pestañas se queden quietos —con su desplazamiento y sus grupos abiertos— y solo cambie el contenido de abajo.
 */
export function MarcoPersistente() {
    return (
        <EnMarco.Provider value>
            <Marco>
                {/* Mientras baja la página, el indicador va solo en el contenido: el menú no parpadea. */}
                <Suspense
                    fallback={
                        <div className="flex items-center justify-center py-24">
                            <Spinner size="lg" className="text-primary-600" />
                        </div>
                    }
                >
                    <Outlet />
                </Suspense>
            </Marco>
        </EnMarco.Provider>
    );
}

/**
 * El Layout de cada página. Dentro del marco persistente solo deja pasar su contenido (el marco ya está); fuera de él, se
 * dibuja completo como siempre.
 */
export default function Layout({ children }) {
    const enMarco = useContext(EnMarco);

    return enMarco ? <>{children}</> : <Marco>{children}</Marco>;
}
