<?php

namespace App\Http\Controllers;

use App\Models\MovimientoInventario;
use App\Models\RecepcionCompra;

class MovimientoInventarioController extends Controller
{
    public function index()
    {
        $movimientos = MovimientoInventario::with([
            'producto:id,codigo,nombre,unidad_base_id',
            'producto.unidadBase:id,nombre,abreviatura',
            // Para poder expresar la cantidad en sacos, cajas, kilos…
            'producto.presentaciones:id,producto_id,nombre,factor_conversion,activo',
            'almacen:id,nombre',
            'usuario:id,name',
        ])
            ->latest('fecha')
            ->latest('id')
            ->limit(1000)
            ->get();

        // Proveedor: solo aplica a movimientos originados por una recepción de compra.
        $recepIds = $movimientos
            ->where('documento_referencia_tipo', 'recepcion_compra')
            ->pluck('documento_referencia_id')
            ->filter()
            ->unique();

        $proveedorPorRecepcion = $recepIds->isEmpty()
            ? collect()
            : RecepcionCompra::with('proveedor:id,nombre')
                ->whereIn('id', $recepIds)
                ->get()
                ->keyBy('id');

        $movimientos->each(function (MovimientoInventario $mov) use ($proveedorPorRecepcion) {
            $mov->proveedor_nombre = $mov->documento_referencia_tipo === 'recepcion_compra'
                ? optional(optional($proveedorPorRecepcion->get($mov->documento_referencia_id))->proveedor)->nombre
                : null;
        });

        return response()->json($movimientos);
    }
}
