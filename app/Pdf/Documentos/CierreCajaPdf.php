<?php

namespace App\Pdf\Documentos;

use App\Models\CierreCaja;
use App\Models\MovimientoCaja;
use App\Pdf\DocumentoPdf;

class CierreCajaPdf implements DocumentoPdf
{
    public function vista(): string
    {
        return 'pdf.documentos.cierre-caja';
    }

    public function formatos(): array
    {
        // Solo ticket: es un comprobante de arqueo de caja.
        return ['ticket'];
    }

    public function datos(int $id): array
    {
        $cierre = CierreCaja::with([
            'apertura:id,caja_id,usuario_id,monto_inicial,fecha_apertura',
            'apertura.caja:id,nombre',
            'apertura.usuario:id,name',
        ])->findOrFail($id);

        $movimientos = MovimientoCaja::where('apertura_caja_id', $cierre->apertura_caja_id)->get();
        $ingresos = (float) $movimientos->where('tipo', 'ingreso')->sum('monto');
        $egresos = (float) $movimientos->where('tipo', 'egreso')->sum('monto');

        return [
            'cierre' => $cierre,
            'documento' => 'Cierre #' . str_pad((string) $cierre->id, 5, '0', STR_PAD_LEFT),
            'ingresos' => $ingresos,
            'egresos' => $egresos,
            'movimientosCount' => $movimientos->count(),
        ];
    }

    public function archivo(int $id): string
    {
        return 'cierre-caja-' . str_pad((string) $id, 5, '0', STR_PAD_LEFT);
    }
}
