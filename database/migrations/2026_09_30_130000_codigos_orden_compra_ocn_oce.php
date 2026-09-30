<?php

use App\Models\OrdenCompra;
use App\Models\SerieDocumento;
use Illuminate\Database\Migrations\Migration;

/**
 * Las órdenes de compra pasan a numerarse por tipo: OCN-001, OCN-002… las
 * nacionales y OCE-001, OCE-002… las de exterior. Las que ya existían se
 * renumeran en el orden en que se crearon, y el contador de cada serie queda
 * en la última, para que la siguiente continúe.
 *
 * Los rollos ya recibidos conservan el código con el que nacieron.
 */
return new class extends Migration
{
    public function up(): void
    {
        foreach (['nacional' => 'OCN', 'exterior' => 'OCE'] as $tipo => $serie) {
            $n = 0;

            OrdenCompra::where('tipo', $tipo)->orderBy('id')->get()->each(function (OrdenCompra $orden) use (&$n, $serie) {
                $n++;
                // Sin eventos: es un recodificado, no una edición de una persona.
                OrdenCompra::withoutEvents(fn () => $orden->update(['codigo' => sprintf('%s-%03d', $serie, $n)]));
            });

            SerieDocumento::updateOrCreate(
                ['tipo_documento' => 'orden_compra', 'serie' => $serie],
                ['numero_actual' => $n, 'activo' => true],
            );
        }
    }

    public function down(): void
    {
        // No se puede volver al código anterior: no se guardó.
    }
};
