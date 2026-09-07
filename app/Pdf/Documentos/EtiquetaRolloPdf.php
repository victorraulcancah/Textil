<?php

namespace App\Pdf\Documentos;

use App\Models\Rollo;
use App\Pdf\DocumentoPdf;
use App\Services\EtiquetaService;

/**
 * La etiqueta que se pega físicamente al rollo.
 *
 * Lleva lo mínimo que el almacenero necesita leer a simple vista —tela, color,
 * código y metraje— y el código escaneable. Dentro del código va solo el
 * código del rollo: al escanearlo el sistema consulta la base y muestra los
 * datos al día, así que la etiqueta no se queda desactualizada cuando se corta
 * el rollo.
 */
class EtiquetaRolloPdf implements DocumentoPdf
{
    public function __construct(private EtiquetaService $etiquetas) {}

    public function vista(): string
    {
        return 'pdf.documentos.etiqueta-rollo';
    }

    public function formatos(): array
    {
        return ['etiqueta', 'a4'];
    }

    public function datos(int $id): array
    {
        $rollo = Rollo::with(['producto:id,codigo,nombre', 'color', 'almacen:id,nombre'])
            ->findOrFail($id);

        return [
            'etiquetas' => [$this->etiqueta($rollo)],
        ];
    }

    /**
     * Los datos de una etiqueta. Se expone para poder imprimir un lote —los
     * 18 rollos de un color— reutilizando el mismo blade.
     */
    public function etiqueta(Rollo $rollo): array
    {
        return [
            'rollo' => $rollo,
            'producto' => $rollo->producto?->nombre ?? '—',
            'codigo_producto' => $rollo->producto?->codigo ?? '—',
            'color' => $rollo->color?->nombre ?? '—',
            'codigo_color' => $rollo->color?->codigo,
            'codigo' => $rollo->codigo,
            'metros' => number_format((float) $rollo->metros_actual, 2),
            'ubicacion' => $rollo->ubicacionLegible(),
        ] + $this->etiquetas->codigos($rollo->codigo);
    }

    public function archivo(int $id): string
    {
        return 'etiqueta-'.Rollo::findOrFail($id)->codigo;
    }
}
