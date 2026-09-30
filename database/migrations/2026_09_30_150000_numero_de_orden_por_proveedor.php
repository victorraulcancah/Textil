<?php

use App\Models\OrdenCompra;
use App\Models\SerieDocumento;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * El número que lleva el documento de la orden (HAN-002-26) es el correlativo
 * de las órdenes de ese proveedor: la primera es 001, la segunda 002… No es el
 * de la serie OCN/OCE, que cuenta todas las órdenes del tipo.
 *
 * Se guarda en la orden para que no se mueva si se borra otra. Las que ya
 * existen se numeran por proveedor en el orden en que se crearon.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('ordenes_compra', function (Blueprint $table) {
            $table->unsignedInteger('numero_proveedor')->nullable()->after('codigo');
        });

        OrdenCompra::orderBy('id')->get()->groupBy('proveedor_id')->each(function ($ordenes, $proveedorId) {
            $n = 0;
            foreach ($ordenes as $orden) {
                $n++;
                OrdenCompra::withoutEvents(fn () => $orden->forceFill(['numero_proveedor' => $n])->saveQuietly());
            }

            // El contador del proveedor sigue desde la última, sin bajar el que ya tenía.
            $serie = SerieDocumento::firstOrCreate(
                ['tipo_documento' => 'orden_compra_proveedor', 'serie' => 'PROV'.$proveedorId],
                ['numero_actual' => 0, 'activo' => true],
            );
            $serie->update(['numero_actual' => max((int) $serie->numero_actual, $n)]);
        });
    }

    public function down(): void
    {
        Schema::table('ordenes_compra', function (Blueprint $table) {
            $table->dropColumn('numero_proveedor');
        });
    }
};
