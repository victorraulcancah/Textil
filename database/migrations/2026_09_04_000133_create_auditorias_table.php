<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Bitácora de auditoría: quién hizo qué, cuándo y desde dónde.
 *
 *  - usuario_nombre guarda una copia del nombre: si el usuario se elimina, el
 *    registro histórico debe seguir diciendo quién fue.
 *  - antes / despues guardan solo los campos que cambiaron, no la fila entera.
 *  - Es un registro histórico: se escribe una vez y no se edita, por eso solo
 *    lleva created_at.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('auditorias', function (Blueprint $table) {
            $table->id();

            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('usuario_nombre')->nullable();

            // creo | actualizo | elimino | inicio_sesion | cerro_sesion
            $table->string('accion', 30);

            // A qué apunta: modelo y id. Nulos en login/logout.
            $table->string('auditable_type')->nullable();
            $table->unsignedBigInteger('auditable_id')->nullable();

            // Nombre legible del módulo ("Producto", "Nota de venta") y del
            // registro ("TEL001 · Popelina"), para no tener que ir a buscarlo:
            // el documento puede haberse eliminado.
            $table->string('modulo')->nullable();
            $table->string('descripcion')->nullable();

            $table->json('antes')->nullable();
            $table->json('despues')->nullable();

            $table->string('ip', 45)->nullable();
            $table->string('user_agent')->nullable();

            $table->timestamp('created_at')->useCurrent();

            $table->index(['auditable_type', 'auditable_id']);
            $table->index(['user_id', 'created_at']);
            $table->index('accion');
            $table->index('created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('auditorias');
    }
};
