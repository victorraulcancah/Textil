import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth';
import { ToastProvider } from './lib/toast';
import ProtectedRoute from './components/ProtectedRoute';
import AccesoDenegado from './components/AccesoDenegado';
import RutaProtegida, { pantallaInicial } from './components/RutaProtegida';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Roles from './pages/Roles';
import Usuarios from './pages/Usuarios';
import Empresa from './pages/Empresa';
import Productos from './pages/Productos';
import ListaPrecios from './pages/ListaPrecios';
import Colores from './pages/Colores';
import TiposTela from './pages/TiposTela';
import Marcas from './pages/Marcas';
import SubMarcas from './pages/SubMarcas';
import UnidadesMedida from './pages/UnidadesMedida';
import Almacenes from './pages/Almacenes';
import Existencias from './pages/Existencias';
import StockPorRollo from './pages/StockPorRollo';
import Movimientos from './pages/Movimientos';
import Transferencias from './pages/Transferencias';
import CrearTransferencia from './pages/CrearTransferencia';
import Ajustes from './pages/Ajustes';
import CrearAjuste from './pages/CrearAjuste';
import TomasInventario from './pages/TomasInventario';
import Prestamos from './pages/Prestamos';
import Proveedores from './pages/Proveedores';
import OrdenesCompra from './pages/OrdenesCompra';
import CrearOrdenCompra from './pages/CrearOrdenCompra';
import Compras from './pages/Compras';
import CrearCompra from './pages/CrearCompra';
import RecepcionesCompra from './pages/RecepcionesCompra';
import Clientes from './pages/Clientes';
import CatalogoComercial from './pages/CatalogosComerciales';
import NotasVenta from './pages/NotasVenta';
import Pedidos from './pages/Pedidos';
import CrearPedido from './pages/CrearPedido';
import Despacho from './pages/Despacho';
import CrearVenta from './pages/CrearVenta';
import MetodosDePago from './pages/MetodosDePago';
import MiCaja from './pages/MiCaja';
import Cajas from './pages/Cajas';
import MovimientosCaja from './pages/MovimientosCaja';
import CierresCaja from './pages/CierresCaja';
import MotivosMovimiento from './pages/MotivosMovimiento';
import CuentasPorCobrar from './pages/CuentasPorCobrar';
import EstadoCuenta from './pages/EstadoCuenta';
import CuentasPorPagar from './pages/CuentasPorPagar';
import Utilidades from './pages/Utilidades';
import Ganancias from './pages/Ganancias';
import Auditoria from './pages/Auditoria';
import Accesos from './pages/Accesos';
import Inicio from './pages/Inicio';
import EnConstruccion from './pages/EnConstruccion';

/**
 * La raíz lleva al escritorio si el usuario puede verlo y, si no, a su Inicio;
 * sin esto caía en el comodín "*" y mostraba "En construcción".
 */
function Raiz() {
    const { puede } = useAuth();
    return <Navigate to={pantallaInicial(puede)} replace />;
}

const routes = [
    { path: '/', element: <Raiz /> },
    // Inicio es de todos: no exige permiso, desde aquí se piden los accesos.
    { path: '/inicio', element: <Inicio /> },
    { path: '/dashboard', element: <Dashboard /> },
    { path: '/roles', element: <Roles /> },
    { path: '/usuarios', element: <Usuarios /> },
    { path: '/empresa', element: <Empresa /> },
    { path: '/accesos', element: <Accesos /> },
    { path: '/auditoria', element: <Auditoria /> },
    { path: '/productos', element: <Productos /> },
    { path: '/lista-precios', element: <ListaPrecios /> },
    { path: '/colores', element: <Colores /> },
    { path: '/tipos-tela', element: <TiposTela /> },
    { path: '/marcas', element: <Marcas /> },
    { path: '/sub-marcas', element: <SubMarcas /> },
    { path: '/unidades-medida', element: <UnidadesMedida /> },
    { path: '/almacenes', element: <Almacenes /> },
    { path: '/existencias', element: <Existencias /> },
    { path: '/stock-rollos', element: <StockPorRollo /> },
    { path: '/kardex', element: <Movimientos /> },
    // Alias del nombre anterior, para no romper enlaces guardados.
    { path: '/movimientos', element: <Movimientos /> },
    { path: '/transferencias', element: <Transferencias /> },
    { path: '/transferencias/nueva', element: <CrearTransferencia /> },
    { path: '/transferencias/:id/editar', element: <CrearTransferencia /> },
    { path: '/ajustes', element: <Ajustes /> },
    { path: '/ajustes/nuevo', element: <CrearAjuste /> },
    { path: '/tomas-inventario', element: <TomasInventario /> },
    { path: '/prestamos', element: <Prestamos /> },
    { path: '/proveedores', element: <Proveedores /> },
    { path: '/ordenes-compra', element: <OrdenesCompra /> },
    { path: '/ordenes-compra/nueva', element: <CrearOrdenCompra /> },
    { path: '/ordenes-compra/:id/editar', element: <CrearOrdenCompra /> },
    { path: '/compras', element: <Compras /> },
    { path: '/compras/nueva', element: <CrearCompra /> },
    { path: '/compras/:id/editar', element: <CrearCompra /> },
    { path: '/recepciones-compra', element: <RecepcionesCompra /> },
    { path: '/clientes', element: <Clientes /> },
    // La misma pantalla para los dos: el key evita que una herede el estado de la otra.
    { path: '/categorias-comerciales', element: <CatalogoComercial key="categorias" tipo="categorias" /> },
    { path: '/actividades-comerciales', element: <CatalogoComercial key="actividades" tipo="actividades" /> },
    { path: '/pedidos', element: <Pedidos /> },
    { path: '/pedidos/nuevo', element: <CrearPedido /> },
    { path: '/pedidos/:id/editar', element: <CrearPedido /> },
    { path: '/despacho', element: <Despacho /> },
    { path: '/notas-venta', element: <NotasVenta /> },
    { path: '/notas-venta/nueva', element: <CrearVenta /> },
    { path: '/notas-venta/:id/editar', element: <CrearVenta /> },
    { path: '/metodos-de-pago', element: <MetodosDePago /> },
    { path: '/mi-caja', element: <MiCaja /> },
    { path: '/cajas', element: <Cajas /> },
    { path: '/movimientos-caja', element: <MovimientosCaja /> },
    { path: '/cierres-caja', element: <CierresCaja /> },
    { path: '/motivos-movimiento', element: <MotivosMovimiento /> },
    { path: '/cuentas-por-cobrar', element: <CuentasPorCobrar /> },
    { path: '/estado-cuenta', element: <EstadoCuenta /> },
    { path: '/cuentas-por-pagar', element: <CuentasPorPagar /> },
    { path: '/reportes/utilidades', element: <Utilidades /> },
    { path: '/reportes/ganancias', element: <Ganancias /> },
];

createRoot(document.getElementById('root')).render(
    <StrictMode>
        <BrowserRouter>
            <ToastProvider>
                <AuthProvider>
                    <AccesoDenegado />
                    <Routes>
                    <Route path="/login" element={<Login />} />
                    {routes.map(({ path, element }) => (
                        <Route
                            key={path}
                            path={path}
                            element={
                                <ProtectedRoute>
                                    <RutaProtegida>{element}</RutaProtegida>
                                </ProtectedRoute>
                            }
                        />
                    ))}
                        {/* Rutas del menú aún sin página: muestran "En construcción"
                            (con sidebar) en vez de botar al login. Si el usuario no
                            está autenticado, ProtectedRoute lo manda a /login. */}
                        <Route
                            path="*"
                            element={
                                <ProtectedRoute>
                                    <EnConstruccion />
                                </ProtectedRoute>
                            }
                        />
                    </Routes>
                </AuthProvider>
            </ToastProvider>
        </BrowserRouter>
    </StrictMode>,
);
