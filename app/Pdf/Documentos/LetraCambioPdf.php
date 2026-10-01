<?php

namespace App\Pdf\Documentos;

use App\Models\Empresa;
use App\Models\LetraCambio;
use App\Pdf\DocumentoPdf;
use App\Pdf\MontoEnLetras;

/**
 * La letra de cambio impresa, con el formato del título valor: cláusulas
 * especiales a la izquierda (de abajo hacia arriba), cabecera con número,
 * referencia, fechas, lugar e importe, y los bloques del aceptante y del aval.
 */
class LetraCambioPdf implements DocumentoPdf
{
    public function vista(): string
    {
        return 'pdf.documentos.letra-cambio';
    }

    public function formatos(): array
    {
        return ['a4'];
    }

    private const CLAUSULAS = [
        '(1) En caso de mora, esta Letra de Cambio generará las tasas de intereses compensatorio y moratorio más altas que la ley permite a su último tenedor.',
        '(2) El plazo de su vencimiento podrá ser prorrogado por el tenedor, por el plazo que éste señale, sin que sea necesaria la intervención del obligado principal ni de los solidarios.',
        '(3) Su importe debe ser pagado sólo en la misma moneda que expresa este título valor.',
        '(4) Esta Letra de Cambio no requiere ser protestada por falta de pago.',
    ];

    public function datos(int $id): array
    {
        $letra = LetraCambio::with('cliente:id,nombre')->findOrFail($id);
        $empresa = Empresa::query()->where('activa', true)->first() ?? Empresa::first();
        $dolares = $letra->moneda === 'USD';
        $importe = (float) $letra->importe;

        return [
            'letra' => $letra,
            'girador' => [
                'nombre' => mb_strtoupper((string) ($empresa?->razon_social ?: $empresa?->nombre_comercial)),
                'ruc' => $empresa?->ruc,
                'direccion' => mb_strtoupper(collect([$empresa?->direccion, $empresa?->distrito, $empresa?->provincia])->filter()->implode(' ')),
            ],
            'simbolo' => $dolares ? 'US$' : 'S/',
            'importeTexto' => number_format($importe, 2),
            'enLetras' => MontoEnLetras::convertir($importe, $dolares ? 'DÓLARES AMERICANOS' : 'SOLES'),
            // Las imágenes con texto girado: dompdf no gira texto, pero sí dibuja SVG.
            'clausulas' => $this->svgClausulas(),
            'etiquetaAceptante' => $this->svgVertical('ACEPTANTE', 22, 120, 8.5, true),
        ];
    }

    public function archivo(int $id): string
    {
        return 'letra-cambio-' . LetraCambio::findOrFail($id)->codigo;
    }

    /** "ACEPTANTE" girado 90° (se lee de abajo hacia arriba), centrado en su recuadro. */
    private function svgVertical(string $texto, int $ancho, int $alto, float $tamano, bool $negrita = false): string
    {
        $x = $ancho / 2 + $tamano * 0.35;
        $y = $alto / 2;
        $svg = sprintf(
            '<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d">'
            . '<text transform="translate(%.2f,%.2f) rotate(-90)" text-anchor="middle" font-family="DejaVu Sans" font-size="%.1f" font-weight="%s" fill="#111">%s</text></svg>',
            $ancho, $alto, $ancho, $alto, $x, $y, $tamano, $negrita ? 'bold' : 'normal', htmlspecialchars($texto, ENT_XML1),
        );

        return 'data:image/svg+xml;base64,' . base64_encode($svg);
    }

    /** Las cláusulas especiales, en renglones girados, de abajo hacia arriba. */
    private function svgClausulas(): string
    {
        $ancho = 84;
        $alto = 440;
        $tamano = 6.6;
        $paso = 8.4;

        $lineas = [['CLÁUSULAS ESPECIALES', true]];
        foreach (self::CLAUSULAS as $clausula) {
            foreach (explode("\n", wordwrap($clausula, 100, "\n", true)) as $linea) {
                $lineas[] = [$linea, false];
            }
        }

        $texto = '';
        foreach ($lineas as $i => [$linea, $negrita]) {
            $texto .= sprintf(
                '<text transform="translate(%.1f,%d) rotate(-90)" font-family="DejaVu Sans" font-size="%.1f" font-weight="%s" fill="#111">%s</text>',
                12 + $i * $paso + ($i > 0 ? 4 : 0), $alto - 8, $negrita ? 7.2 : $tamano, $negrita ? 'bold' : 'normal', htmlspecialchars($linea, ENT_XML1),
            );
        }

        $svg = sprintf('<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d">%s</svg>', $ancho, $alto, $ancho, $alto, $texto);

        return 'data:image/svg+xml;base64,' . base64_encode($svg);
    }
}
