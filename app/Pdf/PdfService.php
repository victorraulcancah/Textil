<?php

namespace App\Pdf;

use App\Models\Empresa;
use Barryvdh\DomPDF\Facade\Pdf;

/**
 * Renderiza un DocumentoPdf a A4 o ticket. Centraliza el papel, los márgenes
 * y los datos de la empresa (cabecera común) para que cada documento solo se
 * preocupe de su contenido.
 */
class PdfService
{
    private const MM_A_PT = 2.83465;

    /** Resuelve el {tipo} de la ruta a su clase de documento. */
    public function documento(string $tipo): ?DocumentoPdf
    {
        $clase = config("pdf.documentos.$tipo");

        return $clase ? app($clase) : null;
    }

    /**
     * Genera el PDF. Devuelve la instancia de dompdf lista para ->stream()
     * (inline) o ->download().
     */
    public function generar(DocumentoPdf $documento, int $id, string $formato)
    {
        if (!in_array($formato, $documento->formatos(), true)) {
            $formato = $documento->formatos()[0];
        }

        $datos = $documento->datos($id) + [
            'empresa' => Empresa::query()->where('activa', true)->first() ?? Empresa::first(),
            'formato' => $formato,
            'pieLegal' => config('pdf.pie_legal'),
            'generadoEn' => now(),
        ];

        // Un solo blade por documento; internamente extiende el layout según
        // $formato (a4 o ticket).
        $pdf = Pdf::loadView($documento->vista(), $datos);

        $formato === 'ticket'
            ? $pdf->setPaper($this->papelTicket())->setOption('dpi', 96)
            : $pdf->setPaper('a4');

        // El logo y las tildes necesitan que dompdf resuelva rutas locales y
        // trate el HTML como UTF-8.
        $pdf->setOption('isRemoteEnabled', true);
        $pdf->setOption('defaultFont', 'DejaVu Sans');

        return $pdf;
    }

    /** Papel del ticket: ancho fijo (config), alto grande que dompdf recorta. */
    private function papelTicket(): array
    {
        $ancho = (config('pdf.ticket.ancho_mm', 80)) * self::MM_A_PT;

        // Alto amplio: con contenido corto sobra papel en blanco solo en la
        // vista PDF; la impresora térmica corta al final del contenido.
        return [0, 0, $ancho, 3200];
    }
}
