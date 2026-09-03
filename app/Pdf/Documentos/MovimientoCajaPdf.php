<?php

namespace App\Pdf\Documentos;

use App\Models\MovimientoCaja;
use App\Pdf\DocumentoPdf;

class MovimientoCajaPdf implements DocumentoPdf
{
    public function vista(): string
    {
        return 'pdf.documentos.movimiento-caja';
    }

    public function formatos(): array
    {
        // Solo ticket: comprobante de ingreso / egreso de caja.
        return ['ticket'];
    }

    public function datos(int $id): array
    {
        $mov = MovimientoCaja::with([
            'motivo:id,nombre,tipo',
            'apertura:id,caja_id,usuario_id',
            'apertura.caja:id,nombre',
            'apertura.usuario:id,name',
            'cuentaBancaria:id,alias,numero_cuenta',
            'billetera:id,nombre',
            'metodoPago:id,nombre',
        ])->findOrFail($id);

        $metodo = $mov->cuentaBancaria?->alias
            ?? $mov->billetera?->nombre
            ?? $mov->metodoPago?->nombre
            ?? 'Efectivo';

        return [
            'mov' => $mov,
            'documento' => 'Mov. #' . str_pad((string) $mov->id, 6, '0', STR_PAD_LEFT),
            'esIngreso' => $mov->tipo === 'ingreso',
            'metodoTexto' => $metodo,
        ];
    }

    public function archivo(int $id): string
    {
        return 'movimiento-caja-' . str_pad((string) $id, 6, '0', STR_PAD_LEFT);
    }
}
