import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth';
import { ToastProvider } from './lib/toast';
import ProtectedRoute from './components/ProtectedRoute';
import AccesoDenegado from './components/AccesoDenegado';
import RutaProtegida, { pantallaInicial } from './components/RutaProtegida';
import { Spinner } from './components/ui';
import Login from './pages/Login';
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Roles = lazy(() => import('./pages/Roles'));
const Usuarios = lazy(() => import('./pages/Usuarios'));
const Empresa = lazy(() => import('./pages/Empresa'));
const Productos = lazy(() => import('./pages/Productos'));
const ListaPrecios = lazy(() => import('./pages/ListaPrecios'));
const Colores = lazy(() => import('./pages/Colores'));
const TiposTela = lazy(() => import('./pages/TiposTela'));
const StockRollosReporte = lazy(() => import('./pages/StockRollosReporte'));
const FamiliaTela = lazy(() => import('./pages/FamiliaTela'));
const Marcas = lazy(() => import('./pages/Marcas'));
const SubMarcas = lazy(() => import('./pages/SubMarcas'));
const UnidadesMedida = lazy(() => import('./pages/UnidadesMedida'));
const Almacenes = lazy(() => import('./pages/Almacenes'));
const Existencias = lazy(() => import('./pages/Existencias'));
const StockPorRollo = lazy(() => import('./pages/StockPorRollo'));
const Movimientos = lazy(() => import('./pages/Movimientos'));
const KardexDocumento = lazy(() => import('./pages/KardexDocumento'));
const KardexColor = lazy(() => import('./pages/KardexColor'));
const Transferencias = lazy(() => import('./pages/Transferencias'));
const CrearTransferencia = lazy(() => import('./pages/CrearTransferencia'));
const Ajustes = lazy(() => import('./pages/Ajustes'));
const CrearAjuste = lazy(() => import('./pages/CrearAjuste'));
const TomasInventario = lazy(() => import('./pages/TomasInventario'));
const Prestamos = lazy(() => import('./pages/Prestamos'));
const Proveedores = lazy(() => import('./pages/Proveedores'));
const OrdenesCompra = lazy(() => import('./pages/OrdenesCompra'));
const CrearOrdenCompra = lazy(() => import('./pages/CrearOrdenCompra'));
const Compras = lazy(() => import('./pages/Compras'));
const CrearCompra = lazy(() => import('./pages/CrearCompra'));
const RecepcionesCompra = lazy(() => import('./pages/RecepcionesCompra'));
const Clientes = lazy(() => import('./pages/Clientes'));
const CatalogoComercial = lazy(() => import('./pages/CatalogosComerciales'));
const NotasVenta = lazy(() => import('./pages/NotasVenta'));
const Pedidos = lazy(() => import('./pages/Pedidos'));
const CrearPedido = lazy(() => import('./pages/CrearPedido'));
const Despacho = lazy(() => import('./pages/Despacho'));
const Requerimientos = lazy(() => import('./pages/Requerimientos'));
const AtenderRequerimientos = lazy(() => import('./pages/AtenderRequerimientos'));
const CrearRequerimiento = lazy(() => import('./pages/CrearRequerimiento'));
const CrearVenta = lazy(() => import('./pages/CrearVenta'));
const MetodosDePago = lazy(() => import('./pages/MetodosDePago'));
const MiCaja = lazy(() => import('./pages/MiCaja'));
const Cajas = lazy(() => import('./pages/Cajas'));
const MovimientosCaja = lazy(() => import('./pages/MovimientosCaja'));
const CierresCaja = lazy(() => import('./pages/CierresCaja'));
const MotivosMovimiento = lazy(() => import('./pages/MotivosMovimiento'));
const CuentasPorCobrar = lazy(() => import('./pages/CuentasPorCobrar'));
const LetrasCambio = lazy(() => import('./pages/LetrasCambio'));
const Renovaciones = lazy(() => import('./pages/Renovaciones'));
const EstadoCuenta = lazy(() => import('./pages/EstadoCuenta'));
const CuentasPorPagar = lazy(() => import('./pages/CuentasPorPagar'));
const Utilidades = lazy(() => import('./pages/Utilidades'));
const Ganancias = lazy(() => import('./pages/Ganancias'));
const Auditoria = lazy(() => import('./pages/Auditoria'));
const Accesos = lazy(() => import('./pages/Accesos'));
const Inicio = lazy(() => import('./pages/Inicio'));
const EnConstruccion = lazy(() => import('./pages/EnConstruccion'));

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
    { path: '/tipos-tela/familia/:id', element: <FamiliaTela /> },
    { path: '/marcas', element: <Marcas /> },
    { path: '/sub-marcas', element: <SubMarcas /> },
    { path: '/unidades-medida', element: <UnidadesMedida /> },
    { path: '/almacenes', element: <Almacenes /> },
    { path: '/existencias', element: <Existencias /> },
    { path: '/stock-rollos', element: <StockPorRollo /> },
    // Los colores de un tipo de tela y los rollos de un color: la misma pantalla, en la dirección.
    { path: '/stock-rollos/*', element: <StockPorRollo /> },
    { path: '/stock-rollos/reporte', element: <StockRollosReporte /> },
    { path: '/kardex', element: <Movimientos /> },
    { path: '/kardex/color/:telaId/:colorId', element: <KardexColor /> },
    { path: '/kardex/documento/:tipo/:id', element: <KardexDocumento /> },
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
    { path: '/requerimientos', element: <Requerimientos /> },
    { path: '/requerimientos/atender', element: <AtenderRequerimientos /> },
    { path: '/requerimientos/nuevo', element: <CrearRequerimiento /> },
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
    { path: '/letras-cambio', element: <LetrasCambio /> },
    { path: '/renovaciones', element: <Renovaciones /> },
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
                    {/* Cada pantalla es su propio archivo: mientras baja, un indicador en vez de pantalla en blanco. */}
                    <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><Spinner size="lg" className="text-primary-600" /></div>}>
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
                    </Suspense>
                </AuthProvider>
            </ToastProvider>
        </BrowserRouter>
    </StrictMode>,
);
