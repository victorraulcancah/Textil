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
            // El neto es el que se pesó al llegar; si no se registró (rollos
            // viejos, o ingresos que no lo piden), no se imprime la línea.
            'peso_kg' => $rollo->peso_kg ? number_format((float) $rollo->peso_kg, 2) : null,
            // La orden es todo el código del rollo menos su correlativo final:
            // así queda siempre igual a lo que dice el propio código impreso,
            // sin depender de que la recepción tenga la relación bien cargada.
            'orden' => preg_replace('/-\d{4,6}$/', '', $rollo->codigo),
            'posicion' => $this->posicion($rollo),
            'ubicacion' => $rollo->ubicacionLegible(),
        ] + $this->etiquetas->codigos($rollo->codigo);
    }

    /**
     * "Rollo 3 de 8": la posición de este rollo entre los que llegaron del
     * mismo producto y color en la misma recepción. Sin recepción (un rollo
     * suelto, cargado a mano) no hay "de cuántos" que mostrar.
     */
    private function posicion(Rollo $rollo): ?string
    {
        if (! $rollo->recepcion_compra_id) {
            return null;
        }

        $hermanos = Rollo::where('recepcion_compra_id', $rollo->recepcion_compra_id)
            ->where('producto_id', $rollo->producto_id)
            ->where('producto_color_id', $rollo->producto_color_id)
            ->orderBy('numero')
            ->pluck('id');

        $indice = $hermanos->search($rollo->id);

        return $indice === false ? null : sprintf('%03d de %03d', $indice + 1, $hermanos->count());
    }

    public function archivo(int $id): string
    {
        return 'etiqueta-'.Rollo::findOrFail($id)->codigo;
    }
}
