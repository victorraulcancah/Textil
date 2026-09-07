<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Una tela la puede traer más de un proveedor.
 *
 * El `proveedor_id` que tenía el producto solo admitía uno, y eso no es lo que
 * pasa: la misma tela se le compra a varios fabricantes según precio y plazo,
 * y cada uno la llama con su propio código —el packing list de Suzhou dice
 * A103, el del siguiente proveedor dirá otra cosa—.
 *
 * Por eso la relación pasa a ser de muchos a muchos, y cada pareja guarda lo
 * que cambia entre proveedores: su código, su precio y cuánto tarda en traerla.
 * El marcado como principal es el habitual, el que se propone al recomprar.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('producto_proveedor', function (Blueprint $table) {
            $table->id();

            $table->foreignId('producto_id')->constrained('productos')->cascadeOnDelete();
            $table->foreignId('proveedor_id')->constrained('proveedores')->cascadeOnDelete();

            // Cómo llama este proveedor a la tela (A103 en Suzhou Liangjin).
            $table->string('codigo_proveedor')->nullable();

            $table->decimal('precio_referencia', 12, 4)->nullable();
            $table->string('moneda', 10)->default('PEN');
            $table->unsignedSmallInteger('dias_entrega')->nullable();

            $table->boolean('principal')->default(false);
            $table->boolean('activo')->default(true);
            $table->text('observaciones')->nullable();

            $table->timestamps();

            $table->unique(['producto_id', 'proveedor_id']);
            $table->index('codigo_proveedor');
        });

        // Lo que ya estaba asignado pasa a ser el proveedor principal.
        DB::table('productos')
            ->whereNotNull('proveedor_id')
            ->orderBy('id')
            ->chunkById(200, function ($productos) {
                foreach ($productos as $p) {
                    DB::table('producto_proveedor')->insert([
                        'producto_id' => $p->id,
                        'proveedor_id' => $p->proveedor_id,
                        'codigo_proveedor' => $p->codigo,
                        'principal' => true,
                        'activo' => true,
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);
                }
            });

        Schema::table('productos', function (Blueprint $table) {
            $table->dropConstrainedForeignId('proveedor_id');
        });
    }

    public function down(): void
    {
        Schema::table('productos', function (Blueprint $table) {
            $table->foreignId('proveedor_id')
                ->nullable()
                ->after('sub_marca_id')
                ->constrained('proveedores')
                ->nullOnDelete();
        });

        // Se recupera el principal, que es lo único que cabía antes.
        foreach (DB::table('producto_proveedor')->where('principal', true)->get() as $fila) {
            DB::table('productos')
                ->where('id', $fila->producto_id)
                ->update(['proveedor_id' => $fila->proveedor_id]);
        }

        Schema::dropIfExists('producto_proveedor');
    }
};
