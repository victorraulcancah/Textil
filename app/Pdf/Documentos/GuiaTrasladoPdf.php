<?php

namespace App\Pdf\Documentos;

use App\Models\Transferencia;
use App\Pdf\DocumentoPdf;

class GuiaTrasladoPdf implements DocumentoPdf
{
    public function vista(): string
    {
        return 'pdf.documentos.guia-traslado';
    }

    public function formatos(): array
    {
        return ['a4', 'ticket'];
    }

    public function datos(int $id): array
    {
        $guia = Transferencia::with([
            'motivo:id,codigo,nombre',
            'almacenOrigen:id,nombre',
            'almacenDestino:id,nombre',
            'usuarioEnvio:id,name',
            'detalles.presentacion.producto:id,codigo,nombre',
        ])->findOrFail($id);

        $filas = $guia->detalles->map(fn ($d, $i) => [
            'n' => $i + 1,
            'codigo' => $d->presentacion?->producto?->codigo ?? '—',
            'producto' => $d->presentacion?->producto?->nombre ?? '—',
            'unidad' => $d->presentacion?->nombre ?? '—',
            'enviado' => number_format((float) $d->cantidad_enviada, 2),
            'recibido' => $d->cantidad_recibida !== null ? number_format((float) $d->cantidad_recibida, 2) : '—',
            // Ticket
            'nombre' => $d->presentacion?->producto?->nombre ?? '—',
            'detalle' => 'Env ' . number_format((float) $d->cantidad_enviada, 2) . ' ' . ($d->presentacion?->nombre ?? ''),
            'importe' => $d->cantidad_recibida !== null ? 'Rec ' . number_format((float) $d->cantidad_recibida, 2) : '',
        ])->all();

        return [
            'filas' => $filas,
            'guia' => $guia,
            'documento' => $guia->documento ?? ('#' . $guia->id),
        ];
    }

    public function archivo(int $id): string
    {
        $guia = Transferencia::findOrFail($id);

        return 'guia-traslado-' . ($guia->documento ?? $guia->id);
    }
}
