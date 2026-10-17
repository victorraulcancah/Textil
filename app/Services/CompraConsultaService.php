<?php

namespace App\Services;

use App\Models\Compra;
use Illuminate\Database\Eloquent\Collection;

/** Lectura de compras: el listado con el avance de recepción de cada línea. */
class CompraConsultaService
{
    /**
     * Todas las compras, las más recientes primero, con lo recibido y lo pendiente de cada línea.
     *
     * @return Collection<int, Compra>
     */
    public function listado(): Collection
    {
        $compras = Compra::with([
            'proveedor:id,nombre,tipo',
            'ordenCompra:id,codigo,proveedor_id,numero_proveedor,fecha_emision',
            'ordenCompra.proveedor:id,codigo_corto',
            'detalles.presentacion.producto.marca',
            // Solo las vigentes: una recepción deshecha devolvió su mercadería.
            'recepciones' => fn ($q) => $q->where('activo', true)->with('detalles'),
        ])->withCount('detalles')->latest('id')->get();

        $compras->each(fn (Compra $compra) => $this->agregarAvanceDeRecepcion($compra));

        return $compras;
    }

    /**
     * Deja en cada línea cuánto se recibió y cuánto sigue pendiente, para que el listado muestre el avance sin
     * consultar las recepciones una por una.
     */
    private function agregarAvanceDeRecepcion(Compra $compra): void
    {
        $recibido = $compra->recepciones
            ->flatMap->detalles
            ->groupBy('compra_detalle_id')
            ->map(fn ($lineas) => (float) $lineas->sum('cantidad_recibida'));

        $compra->detalles->each(function ($d) use ($recibido) {
            $d->recibido = (float) ($recibido[$d->id] ?? 0);
            $d->pendiente = max(0, round(
                (float) $d->cantidad - $d->recibido - (float) $d->cantidad_finalizada,
                2,
            ));
        });

        // Ya se usó para calcular el avance: no hace falta enviarla.
        $compra->unsetRelation('recepciones');
    }
}
