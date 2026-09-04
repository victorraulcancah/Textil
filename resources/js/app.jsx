import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './lib/auth';
import { ToastProvider } from './lib/toast';
import ProtectedRoute from './components/ProtectedRoute';
import RutaProtegida from './components/RutaProtegida';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Roles from './pages/Roles';
import Usuarios from './pages/Usuarios';
import Empresa from './pages/Empresa';
import Productos from './pages/Productos';
import Categorias from './pages/Categorias';
import Marcas from './pages/Marcas';
import SubMarcas from './pages/SubMarcas';
import UnidadesMedida from './pages/UnidadesMedida';
import Almacenes from './pages/Almacenes';
import Existencias from './pages/Existencias';
import Movimientos from './pages/Movimientos';
import Transferencias from './pages/Transferencias';
import Ajustes from './pages/Ajustes';
import TomasInventario from './pages/TomasInventario';
import Prestamos from './pages/Prestamos';
import Proveedores from './pages/Proveedores';
import OrdenesCompra from './pages/OrdenesCompra';
import CrearOrdenCompra from './pages/CrearOrdenCompra';
import Compras from './pages/Compras';
import CrearCompra from './pages/CrearCompra';
import RecepcionesCompra from './pages/RecepcionesCompra';
import Clientes from './pages/Clientes';
import NotasVenta from './pages/NotasVenta';
import CrearVenta from './pages/CrearVenta';
import MetodosDePago from './pages/MetodosDePago';
import MiCaja from './pages/MiCaja';
import Cajas from './pages/Cajas';
import MovimientosCaja from './pages/MovimientosCaja';
import CierresCaja from './pages/CierresCaja';
import MotivosMovimiento from './pages/MotivosMovimiento';
import CuentasPorCobrar from './pages/CuentasPorCobrar';
import CuentasPorPagar from './pages/CuentasPorPagar';
import Utilidades from './pages/Utilidades';
import Ganancias from './pages/Ganancias';
import Auditoria from './pages/Auditoria';
import EnConstruccion from './pages/EnConstruccion';

const routes = [
    // La raíz lleva al escritorio; sin esto caía en el comodín "*" y mostraba
    // "En construcción" al entrar por la URL base o al volver del login.
    { path: '/', element: <Navigate to="/dashboard" replace /> },
    { path: '/dashboard', element: <Dashboard /> },
    { path: '/roles', element: <Roles /> },
    { path: '/usuarios', element: <Usuarios /> },
    { path: '/empresa', element: <Empresa /> },
    { path: '/auditoria', element: <Auditoria /> },
    { path: '/productos', element: <Productos /> },
    { path: '/categorias', element: <Categorias /> },
    { path: '/marcas', element: <Marcas /> },
    { path: '/sub-marcas', element: <SubMarcas /> },
    { path: '/unidades-medida', element: <UnidadesMedida /> },
    { path: '/almacenes', element: <Almacenes /> },
    { path: '/existencias', element: <Existencias /> },
    { path: '/kardex', element: <Movimientos /> },
    // Alias del nombre anterior, para no romper enlaces guardados.
    { path: '/movimientos', element: <Movimientos /> },
    { path: '/transferencias', element: <Transferencias /> },
    { path: '/ajustes', element: <Ajustes /> },
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
    { path: '/cuentas-por-pagar', element: <CuentasPorPagar /> },
    { path: '/reportes/utilidades', element: <Utilidades /> },
    { path: '/reportes/ganancias', element: <Ganancias /> },
];

createRoot(document.getElementById('root')).render(
    <StrictMode>
        <BrowserRouter>
            <ToastProvider>
                <AuthProvider>
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
