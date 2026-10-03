<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Requerimiento de traslado: un almacén pide mercadería a otro. El almacén pedido la prepara (escanea los rollos,
 * igual que un despacho) y recién al despacharla se genera la guía y los rollos viajan.
 *
 * Vive sobre `transferencias`: un requerimiento es un traslado que empieza como pedido (RQ002-001) y termina como
 * guía (T001-...). Los traslados de siempre no cambian.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('transferencias', function (Blueprint $table) {
            if (! Schema::hasColumn('transferencias', 'requerimiento_serie')) {
                // RQ + número del almacén PEDIDO (RQ001 = se pide al almacén 1).
                $table->string('requerimiento_serie', 10)->nullable()->after('numero');
                $table->string('requerimiento_numero', 10)->nullable()->after('requerimiento_serie');
                $table->foreignId('usuario_solicita_id')->nullable()->after('usuario_recepcion_id')->constrained('users')->nullOnDelete();
                $table->timestamp('fecha_solicitud')->nullable()->after('fecha_recepcion');
                $table->timestamp('fecha_separacion')->nullable()->after('fecha_solicitud');
                $table->index(['requerimiento_serie', 'requerimiento_numero']);
            }
        });

        Schema::table('transferencia_detalles', function (Blueprint $table) {
            if (! Schema::hasColumn('transferencia_detalles', 'modo')) {
                // "rollos" (N rollos), "metros" (X metros de tela) o "cantidad" (lo que no es tela).
                $table->string('modo', 10)->nullable()->after('producto_color_id');
                $table->unsignedInteger('rollos_pedidos')->nullable()->after('modo');
                $table->decimal('metros_por_rollo', 10, 2)->nullable()->after('rollos_pedidos');
                $table->decimal('metros_pedidos', 12, 2)->nullable()->after('metros_por_rollo');
            }
        });

        if (! Schema::hasTable('transferencia_rollos')) {
            Schema::create('transferencia_rollos', function (Blueprint $table) {
                $table->id();
                $table->foreignId('transferencia_detalle_id')->constrained('transferencia_detalles')->cascadeOnDelete();
                $table->foreignId('rollo_id')->constrained('rollos')->cascadeOnDelete();
                // Cuánto viaja de ese rollo, cuánto medía al tomarlo y si se fue entero o fue un corte.
                $table->decimal('metros', 10, 2);
                $table->decimal('metros_rollo', 10, 2)->nullable();
                $table->boolean('entero')->default(true);
                $table->timestamp('escaneado_at')->nullable();
                $table->foreignId('usuario_escanea_id')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamps();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('transferencia_rollos');

        Schema::table('transferencia_detalles', function (Blueprint $table) {
            foreach (['modo', 'rollos_pedidos', 'metros_por_rollo', 'metros_pedidos'] as $c) {
                if (Schema::hasColumn('transferencia_detalles', $c)) {
                    $table->dropColumn($c);
                }
            }
        });

        Schema::table('transferencias', function (Blueprint $table) {
            if (Schema::hasColumn('transferencias', 'usuario_solicita_id')) {
                $table->dropConstrainedForeignId('usuario_solicita_id');
            }
            foreach (['requerimiento_serie', 'requerimiento_numero', 'fecha_solicitud', 'fecha_separacion'] as $c) {
                if (Schema::hasColumn('transferencias', $c)) {
                    $table->dropColumn($c);
                }
            }
        });
    }
};
