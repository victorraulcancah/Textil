import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, KeyRound, ShieldAlert } from 'lucide-react';
import { navigation } from '../config/navigation';
import { useAuth } from '../lib/auth';
import Layout from './Layout';
import PageHeader from './PageHeader';
import SolicitarAccesoModal from './SolicitarAccesoModal';
import { Alert, Button } from './ui';

/** Todas las entradas del menú, aplanadas: [{ to, permiso }]. */
const entradas = navigation.flatMap((item) => (item.children ? item.children : [item]));

/** La entrada de menú que corresponde a una ruta: su `to` exacto o el prefijo más largo. */
function entradaDeRuta(path) {
    return entradas
        .filter((e) => e.to && (path === e.to || path.startsWith(e.to + '/')))
        .sort((a, b) => b.to.length - a.to.length)[0];
}

/**
 * Permiso que exige una ruta. "/notas-venta/nueva" hereda de "/notas-venta".
 */
export function permisoDeRuta(path) {
    return entradaDeRuta(path)?.permiso ?? null;
}

/**
 * Pantalla con la que se abre la aplicación: el escritorio si puede verlo y,
 * si no, su Inicio (que todos tienen) desde donde se piden los accesos.
 */
export function pantallaInicial(puede) {
    const primera = entradas.find((e) => e.to && e.permiso && puede(e.permiso));
    return primera?.to ?? '/inicio';
}

/**
 * Envuelve una pantalla: si el usuario no tiene permiso para verla, no se
 * renderiza. Sin esto, la pantalla se monta, la API responde 403 y la vista
 * queda en blanco al intentar leer datos que nunca llegaron.
 */
export default function RutaProtegida({ children }) {
    const { puede } = useAuth();
    const { pathname } = useLocation();
    const [pidiendo, setPidiendo] = useState(false);

    const entrada = entradaDeRuta(pathname);
    const permiso = entrada?.permiso ?? null;

    if (!permiso || puede(permiso)) {
        return children;
    }

    // Se pide el permiso de ver: con él se abre la pantalla.
    const pedido = permiso.split('.').length === 2 ? `${permiso}.ver` : permiso;

    return (
        <Layout>
            <PageHeader title="Sin acceso" description="No tienes permiso para esta sección" />
            <Alert variant="warning">
                <span className="flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4 shrink-0" />
                    Tus roles no incluyen el acceso a esta pantalla. Puedes pedirlo y un
                    administrador lo revisará.
                </span>
            </Alert>
            <div className="mt-4 flex flex-wrap gap-2">
                <Button onClick={() => setPidiendo(true)}>
                    <KeyRound className="h-4 w-4" />
                    Pedir acceso
                </Button>
                <Link to={pantallaInicial(puede)}>
                    <Button variant="secondary">
                        <Home className="h-4 w-4" />
                        Ir al inicio
                    </Button>
                </Link>
            </div>
            <SolicitarAccesoModal
                open={pidiendo}
                permiso={pedido}
                etiqueta={entrada?.label ? `Ver ${entrada.label}` : pedido}
                onClose={() => setPidiendo(false)}
            />
        </Layout>
    );
}
