<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Los estados del pedido pasan a nombrarse como los nombra el negocio.
 *
 *   pendiente      → solicitado   (el vendedor lo solicita al almacén)
 *   en_preparacion → preparando   (lo dispara el primer escaneo)
 *   despachada     → despachado
 *   facturada      → facturado
 *   anulada        → anulado
 *
 * Y aparece uno nuevo, "separado", entre preparando y despachado: el
 * almacenero ya juntó y verificó los rollos, pero todavía no han salido.
 *
 * De paso quedan todos en masculino, que es lo que concuerda con "pedido";
 * venían en femenino de cuando la tabla se llamaba "orden de venta".
 */
return new class extends Migration
{
    /** Nombre viejo → nombre nuevo. */
    private const CAMBIOS = [
        'pendiente' => 'solicitado',
        'separada' => 'solicitado',
        'en_preparacion' => 'preparando',
        'despachada' => 'despachado',
        'facturada' => 'facturado',
        'anulada' => 'anulado',
    ];

    public function up(): void
    {
        foreach (self::CAMBIOS as $viejo => $nuevo) {
            DB::table('ordenes_venta')->where('estado', $viejo)->update(['estado' => $nuevo]);
        }
    }

    public function down(): void
    {
        // "separada" y "pendiente" colapsaron en el mismo estado: al volver se
        // usa el último nombre que tuvieron.
        $inverso = [
            'solicitado' => 'pendiente',
            'preparando' => 'en_preparacion',
            'separado' => 'en_preparacion',
            'despachado' => 'despachada',
            'facturado' => 'facturada',
            'anulado' => 'anulada',
        ];

        foreach ($inverso as $nuevo => $viejo) {
            DB::table('ordenes_venta')->where('estado', $nuevo)->update(['estado' => $viejo]);
        }
    }
};
