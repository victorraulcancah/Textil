import { useEffect, useState } from 'react';
import api, { asList } from '../lib/api';
import { guardarAlmacenActivo } from '../lib/almacenActivo';
import { Alert, Spinner } from './ui';

/**
 * El Super Admin tiene acceso a todos los almacenes pero trabaja en uno a la vez. Al entrar queda en el primero que
 * se creó (el de menor id); desde el menú de arriba elige otro de la lista.
 */
export default function SeleccionAlmacen() {
    const [error, setError] = useState(false);

    useEffect(() => {
        api.get('/almacenes')
            .then((res) => {
                const primero = asList(res)
                    .filter((a) => a.activo !== false)
                    .sort((a, b) => a.id - b.id)[0];
                if (!primero) return setError(true);
                guardarAlmacenActivo(primero);
                window.location.reload();
            })
            .catch(() => setError(true));
    }, []);

    return (
        <div className="flex min-h-screen items-center justify-center bg-surface px-4">
            {error ? (
                <Alert variant="warning">No hay almacenes activos: crea uno para poder trabajar.</Alert>
            ) : (
                <Spinner size="lg" className="text-primary-600" />
            )}
        </div>
    );
}
