<?php

namespace Database\Seeders;

use App\Models\MotivoMovimiento;
use Illuminate\Database\Seeder;

class MotivosMovimientoSeeder extends Seeder
{
    /**
     * Motivos base del sistema. Idempotente: se puede correr varias veces.
     * es_sistema = true  → los usa el sistema, no se pueden eliminar desde la UI.
     * es_sistema = false → manuales / de ajuste (editables y borrables).
     * ambito: 'inventario' (movimientos de stock) o 'caja' (ingresos/egresos de tesorería).
     */
    public function run(): void
    {
        // [nombre, tipo, es_sistema, ambito, categoria_gasto]
        // categoria_gasto solo aplica a egresos de caja (operativo | compra | no_operativo).
        $motivos = [
            // ── Entradas (ingresos) ──
            // La mercadería entra al almacén por recepción; "compra" no es un motivo.
            ['Recepción', 'entrada', true, 'inventario', null],
            ['Devolución de cliente', 'entrada', false, 'inventario', null],
            ['Ajuste positivo', 'entrada', false, 'inventario', null],
            ['Carga inicial', 'entrada', false, 'inventario', null],

            // ── Salidas ──
            ['Salida por venta', 'salida', true, 'inventario', null],
            ['Merma / pérdida', 'salida', false, 'inventario', null],
            ['Consumo interno', 'salida', false, 'inventario', null],
            ['Ajuste negativo', 'salida', false, 'inventario', null],
            ['Devolución a proveedor', 'salida', false, 'inventario', null],

            // ── Tesorería / Caja (entradas) ──
            ['Ingreso por venta', 'entrada', true, 'caja', null],
            ['Ingreso por cobranza', 'entrada', true, 'caja', null],
            ['Ingreso por préstamo', 'entrada', false, 'caja', null],
            ['Otro ingreso', 'entrada', false, 'caja', null],

            // ── Tesorería / Caja (salidas) ──
            ['Salida por pago de compra', 'salida', true, 'caja', 'compra'],
            ['Salida por pago a proveedor', 'salida', true, 'caja', 'compra'],
            ['Salida por gasto', 'salida', false, 'caja', 'operativo'],
            ['Salida por sueldo', 'salida', false, 'caja', 'operativo'],
            ['Otro egreso', 'salida', false, 'caja', 'no_operativo'],
        ];

        foreach ($motivos as [$nombre, $tipo, $sistema, $ambito, $categoria]) {
            MotivoMovimiento::updateOrCreate(
                ['nombre' => $nombre, 'tipo' => $tipo, 'ambito' => $ambito],
                ['es_sistema' => $sistema, 'activo' => true, 'categoria_gasto' => $categoria],
            );
        }
    }
}
