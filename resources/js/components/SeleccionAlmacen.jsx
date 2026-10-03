import { useEffect, useState } from 'react';
import { LogOut, Warehouse } from 'lucide-react';
import api, { asList } from '../lib/api';
import { useAuth } from '../lib/auth';
import { guardarAlmacenActivo } from '../lib/almacenActivo';
import { Spinner } from './ui';

/**
 * Pantalla que el Super Admin ve al entrar: tiene acceso a todos los almacenes, pero tiene que elegir en cuál va a
 * trabajar. Con esa elección ve y opera como la sucursal (y puede cambiarla desde el menú de arriba).
 */
export default function SeleccionAlmacen() {
    const { user, logout } = useAuth();
    const [almacenes, setAlmacenes] = useState(null);
    const [error, setError] = useState(false);

    useEffect(() => {
        api.get('/almacenes')
            .then((res) => setAlmacenes(asList(res).filter((a) => a.activo !== false)))
            .catch(() => setError(true));
    }, []);

    const elegir = (almacen) => {
        guardarAlmacenActivo(almacen);
        // Todo lo que está cargado es del almacén anterior: se empieza de cero.
        window.location.reload();
    };

    return (
        <div className="flex min-h-screen items-center justify-center bg-surface px-4">
            <div className="w-full max-w-lg rounded-xl border border-edge bg-white p-6 shadow-sm">
                <h1 className="text-lg font-semibold text-warm-900">¿En qué almacén vas a trabajar?</h1>
                <p className="mt-1 text-sm text-warm-500">
                    {user?.name}, tienes acceso a todos los almacenes. Elige uno: ventas, series, cajas y reportes serán de esa sucursal.
                    Puedes cambiarlo cuando quieras desde tu menú.
                </p>

                <div className="mt-5 space-y-2">
                    {error && <p className="text-sm text-red-600">No se pudieron cargar los almacenes.</p>}
                    {!almacenes && !error && (
                        <div className="flex justify-center py-8"><Spinner className="text-primary-600" /></div>
                    )}
                    {almacenes?.length === 0 && <p className="text-sm text-warm-500">No hay almacenes activos. Crea uno primero.</p>}
                    {almacenes?.map((a) => (
                        <button
                            key={a.id}
                            type="button"
                            onClick={() => elegir(a)}
                            className="flex w-full items-center gap-3 rounded-lg border border-edge px-4 py-3 text-left transition hover:border-primary-400 hover:bg-primary-50"
                        >
                            <Warehouse className="h-5 w-5 shrink-0 text-primary-600" />
                            <span className="min-w-0">
                                <span className="block truncate text-sm font-semibold text-warm-900">{a.nombre}</span>
                                {a.numero_serie != null && (
                                    <span className="block text-xs text-warm-500">Almacén {a.numero_serie}</span>
                                )}
                            </span>
                        </button>
                    ))}
                </div>

                <button type="button" onClick={logout} className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-red-600 hover:text-red-700">
                    <LogOut className="h-4 w-4" /> Cerrar sesión
                </button>
            </div>
        </div>
    );
}
