import { Navigate, useLocation } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { navigation } from '../config/navigation';
import { useAuth } from '../lib/auth';
import Layout from './Layout';
import PageHeader from './PageHeader';
import { Alert } from './ui';

/** Todas las entradas del menú, aplanadas: [{ to, permiso }]. */
const entradas = navigation.flatMap((item) => (item.children ? item.children : [item]));

/**
 * Permiso que exige una ruta. Se busca la entrada de menú cuyo `to` coincida,
 * o el prefijo más largo: "/notas-venta/nueva" hereda de "/notas-venta".
 */
export function permisoDeRuta(path) {
    const candidatas = entradas
        .filter((e) => e.to && (path === e.to || path.startsWith(e.to + '/')))
        .sort((a, b) => b.to.length - a.to.length);

    return candidatas[0]?.permiso ?? null;
}

/** Primera pantalla que el usuario sí puede abrir, para no dejarlo en blanco. */
export function primeraRutaPermitida(puede) {
    return entradas.find((e) => e.to && (!e.permiso || puede(e.permiso)))?.to ?? null;
}

/**
 * Envuelve una pantalla: si el rol no tiene permiso para verla, no se renderiza.
 * Sin esto, la pantalla se monta, la API responde 403 y la vista queda en
 * blanco al intentar leer datos que nunca llegaron.
 */
export default function RutaProtegida({ children }) {
    const { puede } = useAuth();
    const { pathname } = useLocation();

    const permiso = permisoDeRuta(pathname);

    if (!permiso || puede(permiso)) {
        return children;
    }

    // Si hay otra pantalla disponible, se lleva ahí; si no tiene ninguna, se
    // le explica en vez de dejarlo dando vueltas entre redirecciones.
    const destino = primeraRutaPermitida(puede);
    if (destino && destino !== pathname) {
        return <Navigate to={destino} replace />;
    }

    return (
        <Layout>
            <PageHeader title="Sin acceso" description="No tienes permiso para esta sección" />
            <Alert variant="warning">
                <span className="flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4 shrink-0" />
                    Tu rol no tiene permiso para ver esta pantalla. Pide a un administrador que
                    te lo otorgue desde Gestión → Roles.
                </span>
            </Alert>
        </Layout>
    );
}
