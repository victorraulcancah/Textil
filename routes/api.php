<?php

use App\Http\Controllers\AjusteInventarioController;
use App\Http\Controllers\AlertaController;
use App\Http\Controllers\AlmacenController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\BancoController;
use App\Http\Controllers\BilleteraDigitalController;
use App\Http\Controllers\CajaController;
use App\Http\Controllers\CierreCajaController;
use App\Http\Controllers\CuentaBancariaController;
use App\Http\Controllers\CuentaPorCobrarController;
use App\Http\Controllers\CuentaPorPagarController;
use App\Http\Controllers\MiCajaController;
use App\Http\Controllers\MovimientoCajaController;
use App\Http\Controllers\TarjetaBancariaController;
use App\Http\Controllers\CategoriaController;
use App\Http\Controllers\CompraController;
use App\Http\Controllers\ClienteController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\EmpresaController;
use App\Http\Controllers\MarcaController;
use App\Http\Controllers\MetodoPagoController;
use App\Http\Controllers\MotivoMovimientoController;
use App\Http\Controllers\MotivoTrasladoController;
use App\Http\Controllers\MovimientoInventarioController;
use App\Http\Controllers\NotaVentaController;
use App\Http\Controllers\PdfController;
use App\Http\Controllers\OrdenCompraController;
use App\Http\Controllers\ProductoController;
use App\Http\Controllers\ProductoPresentacionController;
use App\Http\Controllers\ProveedorController;
use App\Http\Controllers\PrestamoController;
use App\Http\Controllers\RecepcionCompraController;
use App\Http\Controllers\ReporteController;
use App\Http\Controllers\RoleController;
use App\Http\Controllers\SubMarcaController;
use App\Http\Controllers\TomaInventarioController;
use App\Http\Controllers\TransferenciaController;
use App\Http\Controllers\UnidadMedidaController;
use App\Http\Controllers\UserController;
use Illuminate\Support\Facades\Route;

Route::post('login', [AuthController::class, 'login']);
Route::post('register', [AuthController::class, 'register']);
Route::post('refresh', [AuthController::class, 'refresh']);
Route::get('branding', [EmpresaController::class, 'branding']);

Route::middleware('auth:api')->group(function () {
    Route::post('logout', [AuthController::class, 'logout']);
    Route::get('me', [AuthController::class, 'me']);

    // Auditoría (solo lectura: la bitácora no se edita ni se borra)
    Route::get('auditorias/filtros', [\App\Http\Controllers\AuditoriaController::class, 'filtros']);
    Route::get('auditorias', [\App\Http\Controllers\AuditoriaController::class, 'index']);

    // Consulta RUC / DNI para autocompletar formularios
    Route::get('consulta/ruc/{ruc}', [\App\Http\Controllers\ConsultaDocumentoController::class, 'ruc']);
    Route::get('consulta/dni/{dni}', [\App\Http\Controllers\ConsultaDocumentoController::class, 'dni']);

    // Dashboard / escritorio
    Route::get('dashboard', [DashboardController::class, 'index']);
    Route::get('alertas', [AlertaController::class, 'index']);

    // Reportes
    Route::get('reportes/utilidades', [ReporteController::class, 'utilidades']);
    Route::get('reportes/ganancias', [ReporteController::class, 'ganancias']);

    // Documentos PDF (A4 / ticket). tipo definido en config/pdf.php
    Route::get('pdf/{tipo}/{id}', [PdfController::class, 'show']);

    // Catálogo
    Route::apiResource('categorias', CategoriaController::class);
    Route::apiResource('marcas', MarcaController::class);
    Route::apiResource('sub-marcas', SubMarcaController::class);
    // Antes del apiResource: si no, {producto} capturaría "…/imagen".
    Route::post('productos/{producto}/imagen', [ProductoController::class, 'subirImagen']);
    Route::apiResource('productos', ProductoController::class);
    Route::apiResource('productos.presentaciones', ProductoPresentacionController::class)->shallow();
    Route::apiResource('unidades-medida', UnidadMedidaController::class);

    // Compras
    Route::apiResource('proveedores', ProveedorController::class);
    Route::apiResource('ordenes-compra', OrdenCompraController::class);
    Route::apiResource('compras', CompraController::class);
    Route::post('compras/{compra}/anular', [CompraController::class, 'anular']);
    Route::post('compras/{compra}/finalizar', [CompraController::class, 'finalizar']);
    Route::get('compras/{compra}/pendientes-recepcion', [RecepcionCompraController::class, 'pendientesDeCompra']);
    Route::apiResource('recepciones-compra', RecepcionCompraController::class);
    Route::post('recepciones-compra/{recepcionesCompra}/deshacer', [RecepcionCompraController::class, 'deshacer']);

    // Inventario
    Route::get('existencias', [AlmacenController::class, 'existencias']);
    Route::apiResource('almacenes', AlmacenController::class);
    Route::get('movimientos', [MovimientoInventarioController::class, 'index']);
    Route::apiResource('transferencias', TransferenciaController::class);
    Route::apiResource('motivos-traslado', MotivoTrasladoController::class)->except(['show']);
    Route::post('transferencias/{transferencia}/enviar', [TransferenciaController::class, 'enviar']);
    Route::post('transferencias/{transferencia}/recibir', [TransferenciaController::class, 'recibir']);
    Route::post('transferencias/{transferencia}/anular', [TransferenciaController::class, 'anular']);
    Route::apiResource('ajustes', AjusteInventarioController::class);
    Route::apiResource('tomas-inventario', TomaInventarioController::class);
    Route::post('tomas-inventario/{toma}/cerrar', [TomaInventarioController::class, 'cerrar']);
    Route::apiResource('motivos-movimiento', MotivoMovimientoController::class);
    Route::get('cierres-caja', [CierreCajaController::class, 'index']);
    Route::get('cierres-caja/{cierresCaja}', [CierreCajaController::class, 'show']);
    Route::apiResource('prestamos', PrestamoController::class);
    Route::post('prestamos/{prestamo}/devoluciones', [PrestamoController::class, 'devolucion']);
    // Facturación
    Route::apiResource('clientes', ClienteController::class);
    Route::get('notas-venta', [NotaVentaController::class, 'index']);
    Route::post('notas-venta', [NotaVentaController::class, 'store']);
    Route::get('notas-venta/{notaVenta}', [NotaVentaController::class, 'show']);
    Route::put('notas-venta/{notaVenta}', [NotaVentaController::class, 'update']);
    Route::post('notas-venta/{notaVenta}/anular', [NotaVentaController::class, 'anular']);
    Route::delete('notas-venta/{notaVenta}', [NotaVentaController::class, 'destroy']);

    // Tesorería
    Route::apiResource('bancos', BancoController::class);
    Route::get('metodos-pago', [MetodoPagoController::class, 'index']);
    Route::apiResource('cuentas-bancarias', CuentaBancariaController::class);
    Route::apiResource('tarjetas-bancarias', TarjetaBancariaController::class);
    Route::apiResource('billeteras-digitales', BilleteraDigitalController::class);
    Route::apiResource('cajas', CajaController::class);
    Route::get('mi-caja', [MiCajaController::class, 'show']);
    Route::post('mi-caja/abrir', [MiCajaController::class, 'abrir']);
    Route::post('mi-caja/cerrar', [MiCajaController::class, 'cerrar']);
    Route::get('movimientos-caja', [MovimientoCajaController::class, 'index']);
Route::post('movimientos-caja', [MovimientoCajaController::class, 'store']);
    Route::get('cuentas-por-cobrar', [CuentaPorCobrarController::class, 'index']);
    Route::get('cuentas-por-cobrar/{cuenta}', [CuentaPorCobrarController::class, 'show']);
    Route::post('cuentas-por-cobrar/{cuenta}/pagos', [CuentaPorCobrarController::class, 'registrarPago']);
    Route::put('cuentas-por-cobrar/pagos/{pago}', [CuentaPorCobrarController::class, 'actualizarPago']);
    Route::delete('cuentas-por-cobrar/pagos/{pago}', [CuentaPorCobrarController::class, 'anularPago']);

    Route::get('cuentas-por-pagar', [CuentaPorPagarController::class, 'index']);
    Route::get('cuentas-por-pagar/{cuenta}', [CuentaPorPagarController::class, 'show']);
    Route::post('cuentas-por-pagar/{cuenta}/pagos', [CuentaPorPagarController::class, 'registrarPago']);
    Route::put('cuentas-por-pagar/pagos/{pago}', [CuentaPorPagarController::class, 'actualizarPago']);
    Route::delete('cuentas-por-pagar/pagos/{pago}', [CuentaPorPagarController::class, 'anularPago']);

    // Gestión
    Route::apiResource('empresas', EmpresaController::class);
    Route::get('users', [UserController::class, 'index']);
    Route::post('users', [UserController::class, 'store']);
    Route::get('users/{id}', [UserController::class, 'show']);
    Route::put('users/{id}', [UserController::class, 'update']);
    Route::delete('users/{id}', [UserController::class, 'destroy']);
    Route::post('users/{id}/assign-role', [UserController::class, 'assignRole']);
    // Antes del apiResource: si no, {role} capturaría "permisos".
    Route::get('roles/permisos', [RoleController::class, 'arbolPermisos']);
    Route::apiResource('roles', RoleController::class);
});
