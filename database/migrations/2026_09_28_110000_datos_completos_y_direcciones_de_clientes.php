<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Los clientes con todos sus datos:
 *
 *  - ubigeos: el catálogo oficial de distritos del Perú (INEI, el que usa
 *    SUNAT), cargado desde database/data/ubigeos.csv.
 *  - cliente_direcciones: un cliente tiene varias direcciones —la fiscal y las
 *    de entrega—, cada una con su país, departamento, provincia, distrito,
 *    ubigeo y código postal.
 *  - clientes: código, zona, actividad y categoría comercial, y el tipo de
 *    cliente del PCGE (tercero o relacionado).
 *
 * clientes.direccion se queda: es la dirección principal ya armada (calle,
 * departamento - provincia - distrito), la que sale en los documentos.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ubigeos', function (Blueprint $table) {
            $table->char('ubigeo', 6)->primary();
            $table->string('departamento', 60);
            $table->string('provincia', 60);
            $table->string('distrito', 80);
            $table->index(['departamento', 'provincia']);
        });
        $this->cargarUbigeos();

        Schema::table('clientes', function (Blueprint $table) {
            $table->string('codigo', 20)->nullable()->unique()->after('id');
            $table->string('zona', 100)->nullable()->after('email');
            $table->string('actividad_comercial')->nullable()->after('zona');
            $table->string('categoria_comercial', 100)->nullable()->after('actividad_comercial');
            // PCGE: lo que debe va a la cuenta 12 (terceros) o a la 13 (relacionadas).
            $table->string('tipo_cliente', 20)->default('TERCERO')->after('categoria_comercial');
        });

        Schema::create('cliente_direcciones', function (Blueprint $table) {
            $table->id();
            $table->foreignId('cliente_id')->constrained('clientes')->cascadeOnDelete();
            // fiscal (una sola: la principal) | entrega
            $table->string('tipo', 20)->default('entrega');
            $table->string('direccion');
            $table->string('referencia')->nullable();
            $table->string('pais', 60)->default('PERÚ');
            $table->string('departamento', 60)->nullable();
            $table->string('provincia', 60)->nullable();
            $table->string('distrito', 80)->nullable();
            $table->char('ubigeo', 6)->nullable();
            $table->string('codigo_postal', 10)->nullable();
            $table->timestamps();
        });

        // Los clientes que ya existen: su código correlativo y su dirección como la fiscal.
        $ahora = now();
        DB::table('clientes')->orderBy('id')->get(['id', 'direccion'])
            ->each(function ($cliente, $i) use ($ahora) {
                DB::table('clientes')->where('id', $cliente->id)
                    ->update(['codigo' => 'C'.str_pad((string) ($i + 1), 5, '0', STR_PAD_LEFT)]);

                if (trim((string) $cliente->direccion) !== '') {
                    DB::table('cliente_direcciones')->insert([
                        'cliente_id' => $cliente->id,
                        'tipo' => 'fiscal',
                        'direccion' => trim($cliente->direccion),
                        'pais' => 'PERÚ',
                        'created_at' => $ahora,
                        'updated_at' => $ahora,
                    ]);
                }
            });
    }

    public function down(): void
    {
        Schema::dropIfExists('cliente_direcciones');

        Schema::table('clientes', function (Blueprint $table) {
            $table->dropUnique(['codigo']);
            $table->dropColumn(['codigo', 'zona', 'actividad_comercial', 'categoria_comercial', 'tipo_cliente']);
        });

        Schema::dropIfExists('ubigeos');
    }

    /** ubigeo,departamento,provincia,distrito: los 1892 distritos con código INEI. */
    private function cargarUbigeos(): void
    {
        $archivo = fopen(database_path('data/ubigeos.csv'), 'r');
        fgetcsv($archivo, escape: ''); // encabezado

        $filas = [];
        while (($fila = fgetcsv($archivo, escape: '')) !== false) {
            [$ubigeo, $departamento, $provincia, $distrito] = array_map('trim', $fila + ['', '', '', '']);
            if (preg_match('/^\d{6}$/', $ubigeo)) {
                $filas[] = compact('ubigeo', 'departamento', 'provincia', 'distrito');
            }
        }
        fclose($archivo);

        foreach (array_chunk($filas, 500) as $lote) {
            DB::table('ubigeos')->insert($lote);
        }
    }
};
