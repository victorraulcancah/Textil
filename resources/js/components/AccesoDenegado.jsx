import { useEffect, useState } from 'react';
import SolicitarAccesoModal from './SolicitarAccesoModal';

/**
 * Escucha las respuestas 403 de la API (ver lib/api.js) y ofrece pedir el
 * permiso que faltó. Vive una sola vez en la aplicación.
 */
export default function AccesoDenegado() {
    const [pendiente, setPendiente] = useState(null);

    useEffect(() => {
        const onDenegado = (e) => setPendiente((actual) => actual ?? e.detail);
        window.addEventListener('permiso-denegado', onDenegado);
        return () => window.removeEventListener('permiso-denegado', onDenegado);
    }, []);

    return (
        <SolicitarAccesoModal
            open={Boolean(pendiente)}
            permiso={pendiente?.permiso}
            etiqueta={pendiente?.etiqueta}
            onClose={() => setPendiente(null)}
        />
    );
}
