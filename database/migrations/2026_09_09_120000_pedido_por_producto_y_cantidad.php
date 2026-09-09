<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * El pedido pasa a pedirse por producto y cantidad, no por rollo concreto.
 *
 * El vendedor no sabe qué rollos hay en el rack ni en qué almacén están: lo
 * que sabe es que el cliente quiere 150 metros de Polinán negro. Quién cubre
 * esos metros —y desde qué almacén— lo decide el almacenero cuando prepara el
 * pedido, escaneando los rollos que va bajando.
 *
 * Por eso la línea se parte en dos tablas:
 *
 *   orden_venta_detalles → lo que pidió el cliente (producto, cantidad, precio)
 *   orden_venta_rollos   → los rollos que el almacén asignó a cada línea
 *
 * Antes las dos cosas vivían juntas, lo que obligaba al vendedor a elegir
 * rollos que no puede conocer.
 *
 * Cada paso comprueba si ya está hecho: MySQL no deshace los cambios de
 * estructura si algo falla a medias, y así la migración se puede repetir sin
 * dejar la base a medio camino.
 */
return new class extends Migration
{
    public function up(): void
    {
        // 1. La tabla vieja pasa a ser el detalle pedido.
        if (Schema::hasTable('orden_venta_rollos') && ! Schema::hasTable('orden_venta_detalles')) {
            $this->soltarIndicesViejos();
            Schema::rename('orden_venta_rollos', 'orden_venta_detalles');
        }

        // 2. Lo que pide el cliente: cantidad en la unidad de la presentación.
        Schema::table('orden_venta_detalles', function (Blueprint $table) {
            if (! Schema::hasColumn('orden_venta_detalles', 'cantidad')) {
                $table->decimal('cantidad', 12, 2)->default(0)->after('producto_presentacion_id');
            }
            if (! Schema::hasColumn('orden_venta_detalles', 'descripcion')) {
                $table->text('descripcion')->nullable()->after('cantidad');
            }
        });

        DB::table('orden_venta_detalles')->where('cantidad', 0)->update(['cantidad' => DB::raw('metros')]);

        // 3. Los rollos que ya estaban asignados se guardan antes de borrar
        //    las columnas de las que salen.
        $asignados = Schema::hasColumn('orden_venta_detalles', 'rollo_id')
            ? DB::table('orden_venta_detalles')->whereNotNull('rollo_id')->get()
            : collect();

        // 4. Las columnas de rollo se van del detalle: ahora viven aparte.
        if (Schema::hasColumn('orden_venta_detalles', 'rollo_id')) {
            $this->soltarForanea('orden_venta_detalles', 'usuario_escanea_id');

            Schema::table('orden_venta_detalles', function (Blueprint $table) {
                if (Schema::hasIndex('orden_venta_detalles', 'ovr_rollo_id_index')) {
                    $table->dropIndex('ovr_rollo_id_index');
                }
                $table->dropColumn(['rollo_id', 'escaneado_at', 'usuario_escanea_id']);
            });
        }

        // 5. Tabla nueva: qué rollos cubren cada línea.
        if (! Schema::hasTable('orden_venta_rollos')) {
            Schema::create('orden_venta_rollos', function (Blueprint $table) {
                $table->id();
                $table->foreignId('orden_venta_detalle_id')
                    ->constrained('orden_venta_detalles')
                    ->cascadeOnDelete();
                $table->foreignId('rollo_id')->constrained('rollos');
                // Cuántos metros de ese rollo se usan para esta línea.
                $table->decimal('metros', 12, 2);
                $table->timestamp('escaneado_at')->nullable();
                $table->foreignId('usuario_escanea_id')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamps();
                // Un rollo se asigna una sola vez a la misma línea.
                $table->unique(['orden_venta_detalle_id', 'rollo_id'], 'ovr_detalle_rollo_unique');
            });
        }

        foreach ($asignados as $fila) {
            DB::table('orden_venta_rollos')->insertOrIgnore([
                'orden_venta_detalle_id' => $fila->id,
                'rollo_id' => $fila->rollo_id,
                'metros' => $fila->metros,
                'escaneado_at' => $fila->escaneado_at,
                'usuario_escanea_id' => $fila->usuario_escanea_id,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        // 6. El almacén lo decide el almacenero al preparar, no el vendedor.
        Schema::table('ordenes_venta', function (Blueprint $table) {
            $table->foreignId('almacen_id')->nullable()->change();
        });
    }

    /**
     * El único (orden_venta_id, rollo_id) es el índice con el que MySQL
     * sostiene las dos foráneas de la tabla. Antes de quitarlo hay que darle a
     * cada una su propio índice, o se niega a soltarlo.
     */
    private function soltarIndicesViejos(): void
    {
        foreach (['orden_venta_id' => 'ovr_orden_venta_id_index', 'rollo_id' => 'ovr_rollo_id_index'] as $columna => $indice) {
            if (! Schema::hasIndex('orden_venta_rollos', $indice)) {
                Schema::table('orden_venta_rollos', fn (Blueprint $t) => $t->index($columna, $indice));
            }
        }

        if (Schema::hasIndex('orden_venta_rollos', 'orden_venta_rollos_orden_venta_id_rollo_id_unique')) {
            Schema::table('orden_venta_rollos', fn (Blueprint $t) => $t->dropUnique('orden_venta_rollos_orden_venta_id_rollo_id_unique'));
        }

        $this->soltarForanea('orden_venta_rollos', 'rollo_id');
    }

    /**
     * Suelta la foránea de una columna buscando su nombre real.
     *
     * No se puede deducir del nombre de la tabla: al renombrarla, MySQL
     * conserva los nombres de las restricciones, así que la de
     * `orden_venta_detalles` sigue llamándose `orden_venta_rollos_…`.
     */
    private function soltarForanea(string $tabla, string $columna): void
    {
        $nombre = DB::selectOne(
            'SELECT CONSTRAINT_NAME AS nombre
               FROM information_schema.KEY_COLUMN_USAGE
              WHERE TABLE_SCHEMA = DATABASE()
                AND TABLE_NAME = ?
                AND COLUMN_NAME = ?
                AND REFERENCED_TABLE_NAME IS NOT NULL
              LIMIT 1',
            [$tabla, $columna],
        );

        if ($nombre) {
            Schema::table($tabla, fn (Blueprint $t) => $t->dropForeign($nombre->nombre));
        }
    }

    public function down(): void
    {
        Schema::table('orden_venta_detalles', function (Blueprint $table) {
            $table->foreignId('rollo_id')->nullable()->after('orden_venta_id')->constrained('rollos');
            $table->timestamp('escaneado_at')->nullable();
            $table->foreignId('usuario_escanea_id')->nullable()->constrained('users')->nullOnDelete();
        });

        foreach (DB::table('orden_venta_rollos')->get() as $fila) {
            DB::table('orden_venta_detalles')
                ->where('id', $fila->orden_venta_detalle_id)
                ->update([
                    'rollo_id' => $fila->rollo_id,
                    'escaneado_at' => $fila->escaneado_at,
                    'usuario_escanea_id' => $fila->usuario_escanea_id,
                ]);
        }

        Schema::dropIfExists('orden_venta_rollos');

        Schema::table('orden_venta_detalles', fn (Blueprint $t) => $t->dropColumn(['cantidad', 'descripcion']));

        Schema::rename('orden_venta_detalles', 'orden_venta_rollos');
    }
};
