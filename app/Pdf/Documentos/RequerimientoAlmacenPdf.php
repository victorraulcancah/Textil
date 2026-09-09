<?php

namespace App\Pdf\Documentos;

use App\Models\OrdenVenta;
use App\Pdf\DocumentoPdf;

/**
 * El papel que baja al almacén: qué hay que juntar.
 *
 * Es el mismo pedido, impreso para otra persona y con otra información: aquí
 * no interesan los precios sino qué tela, cuántos metros y cuánto lleva
 * cubierto. Los rollos concretos no vienen impresos porque los elige el
 * almacenero sobre la marcha; se van anotando debajo conforme los escanea.
 */
class RequerimientoAlmacenPdf implements DocumentoPdf
{
    public function vista(): string
    {
        return 'pdf.documentos.requerimiento-almacen';
    }

    public function formatos(): array
    {
        return ['a4'];
    }

    public function datos(int $id): array
    {
        $orden = OrdenVenta::with([
            'cliente:id,nombre',
            'almacen:id,nombre',
            'vendedor:id,name',
            'usuarioPrepara:id,name',
            'detalles.presentacion.producto:id,codigo,nombre',
            'detalles.rollos.rollo.color',
        ])->findOrFail($id);

        $filas = $orden->detalles->map(fn ($d, $i) => [
            'n' => $i + 1,
            'codigo' => $d->presentacion?->producto?->codigo ?? '—',
            'producto' => $d->presentacion?->producto?->nombre ?? '—',
            'presentacion' => $d->presentacion?->nombre ?? '—',
            'metros' => number_format((float) $d->metros, 2),
            'asignado' => number_format($d->metrosAsignados(), 2),
            'pendiente' => number_format($d->metrosPendientes(), 2),
            'nota' => $d->descripcion,
            // Los rollos que ya se juntaron, para que el papel sirva también
            // como constancia de lo que salió.
            'rollos' => $d->rollos
                ->map(fn ($r) => ($r->rollo?->codigo ?? '—').' ('.number_format((float) $r->metros, 2).' m)')
                ->implode(', '),
        ])->all();

        return [
            'orden' => $orden,
            'documento' => $orden->requerimiento_numero ?? $orden->documento,
            'filas' => $filas,
            'total_lineas' => count($filas),
            'total_metros' => number_format((float) $orden->detalles->sum('metros'), 2),
        ];
    }

    public function archivo(int $id): string
    {
        $orden = OrdenVenta::findOrFail($id);

        return 'requerimiento-'.($orden->requerimiento_numero ?? $orden->documento);
    }
}
