<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Los puertos de embarque y de llegada de la orden de compra al exterior: una
 * sola lista para los dos (NINGBO sale en uno y en otro se llega a CHANCAY).
 * Se administra desde el propio formulario.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('puertos', function (Blueprint $table) {
            $table->id();
            $table->string('nombre', 100)->unique();
            $table->boolean('activo')->default(true);
            $table->timestamps();
        });

        // Los de siempre, más los que ya se escribieron a mano en órdenes y compras.
        $usados = collect(['ordenes_compra', 'compras'])
            ->flatMap(fn ($tabla) => collect(['puerto_embarque', 'puerto_destino'])
                ->flatMap(fn ($col) => Schema::hasColumn($tabla, $col) ? DB::table($tabla)->whereNotNull($col)->pluck($col) : collect()));

        $nombres = collect(['NINGBO', 'SHANGHAI', 'QINGDAO', 'CHANCAY', 'CALLAO'])
            ->merge($usados->map(fn ($n) => mb_strtoupper(trim((string) $n))))
            ->filter()
            ->unique();

        foreach ($nombres as $nombre) {
            DB::table('puertos')->insert(['nombre' => $nombre, 'activo' => true, 'created_at' => now(), 'updated_at' => now()]);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('puertos');
    }
};
