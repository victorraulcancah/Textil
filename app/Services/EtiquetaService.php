<?php

namespace App\Services;

use Endroid\QrCode\Encoding\Encoding;
use Endroid\QrCode\ErrorCorrectionLevel;
use Endroid\QrCode\QrCode;
use Endroid\QrCode\Writer\PngWriter;
use Picqer\Barcode\Types\TypeCode128;

/**
 * Genera los códigos escaneables de la etiqueta del rollo.
 *
 * Se emiten como data URI porque dompdf no descarga imágenes remotas de forma
 * fiable: la imagen viaja incrustada en el propio HTML.
 *
 * Se soportan las dos simbologías a propósito. Una pistola láser barata (1D)
 * lee código de barras pero no QR; una de imagen (2D) lee las dos. Mientras no
 * se sepa qué lector compra la tienda, la etiqueta lleva ambos y no hay que
 * reimprimir nada si cambian de idea (config/rollos.php).
 */
class EtiquetaService
{
    /** ¿Qué se imprime? 'qr', 'barras' o 'ambos'. */
    public function simbologia(): string
    {
        $valor = config('rollos.etiqueta.simbologia', 'ambos');

        return in_array($valor, ['qr', 'barras', 'ambos'], true) ? $valor : 'ambos';
    }

    public function imprimeQr(): bool
    {
        return in_array($this->simbologia(), ['qr', 'ambos'], true);
    }

    public function imprimeBarras(): bool
    {
        return in_array($this->simbologia(), ['barras', 'ambos'], true);
    }

    /** QR con el código del rollo, como data URI listo para un <img src>. */
    public function qr(string $texto): string
    {
        $qr = new QrCode(
            data: $texto,
            encoding: new Encoding('UTF-8'),
            // Alta corrección de errores: la etiqueta va pegada a un rollo de
            // tela, se dobla y se ensucia, y aun así tiene que leerse.
            errorCorrectionLevel: ErrorCorrectionLevel::High,
            size: (int) config('rollos.etiqueta.qr_lado', 220),
            margin: 8,
        );

        return (new PngWriter)->write($qr)->getDataUri();
    }

    /**
     * Código de barras Code 128, como data URI.
     *
     * Code 128 acepta letras, números y guiones, que es justo la forma del
     * código del rollo (A103-01-0001).
     */
    public function barras(string $texto): string
    {
        $png = (new \Picqer\Barcode\Renderers\PngRenderer)->render(
            (new TypeCode128)->getBarcode($texto),
            (int) config('rollos.etiqueta.barras_ancho_barra', 2) * 100,
            (int) config('rollos.etiqueta.barras_alto', 60),
        );

        return 'data:image/png;base64,'.base64_encode($png);
    }

    /**
     * Los códigos que corresponden según la configuración.
     *
     * @return array{qr: ?string, barras: ?string, simbologia: string}
     */
    public function codigos(string $texto): array
    {
        return [
            'qr' => $this->imprimeQr() ? $this->qr($texto) : null,
            'barras' => $this->imprimeBarras() ? $this->barras($texto) : null,
            'simbologia' => $this->simbologia(),
        ];
    }
}
