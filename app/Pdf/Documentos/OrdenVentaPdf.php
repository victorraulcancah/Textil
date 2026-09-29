<?php

namespace App\Pdf\Documentos;

use App\Models\OrdenVenta;
use App\Pdf\DocumentoPdf;
use App\Pdf\PlanillaTela;
use App\Pdf\ProductoConColor;

/**
 * El pedido impreso: lo que se le muestra o se le manda al cliente.
 *
 * Lleva lo que pidió —producto, cantidad y precio—, que es de lo que se habla
 * con el cliente. Los rollos concretos que lo cubren van debajo, y solo
 * aparecen si el almacén ya los asignó.
 */
class OrdenVentaPdf implements DocumentoPdf
{
    public function vista(): string
    {
        return 'pdf.documentos.orden-venta';
    }

    public function formatos(): array
    {
        return ['a4'];
    }

    public function datos(int $id): array
    {
        $orden = $this->cargar($id);

        return [
            'orden' => $orden,
            'documento' => $orden->documento,
            'filas' => $orden->detalles->map(function ($d, $i) {
                // En rollos enteros el metraje lo define el almacén al separar:
                // hasta entonces, metros e importe quedan "por definir".
                $porDefinir = $d->esPorRollos() && ! $d->estaCubierta();

                return [
                    'n' => $i + 1,
                    'codigo' => ProductoConColor::codigo($d->presentacion?->producto, $d->color),
                    'producto' => ProductoConColor::nombre($d->presentacion?->producto, $d->color),
                    'presentacion' => $d->esPorRollos() ? 'Rollos (x metro)' : ($d->presentacion?->nombre ?? '—'),
                    'cantidad' => $d->esPorRollos()
                        ? $d->rollos_pedidos.((int) $d->rollos_pedidos === 1 ? ' rollo' : ' rollos')
                        : number_format((float) $d->cantidad, 2),
                    'metros' => $porDefinir ? 'Por definir' : number_format($d->metrosTotales(), 2),
                    // No se sabe el metraje real del rollo: no se imprime un
                    // precio que todavía es una estimación.
                    'precio' => $d->precio_oculto ? 'Por confirmar' : number_format((float) $d->precio_unitario, 2),
                    'importe' => $d->precio_oculto ? '—' : ($porDefinir ? 'Por definir' : number_format((float) $d->subtotal, 2)),
                ];
            })->all(),
            'rollos' => $this->rollos($orden),
            // El formato de la planilla del cliente: una tabla por tela, rollo por rollo.
            'planilla' => PlanillaTela::dePedido($orden),
            'total_metros' => number_format((float) $orden->detalles->sum(fn ($d) => $d->metrosTotales()), 2),
            // Con rollos sin separar todavía, no hay total ni metros finales.
            'porDefinir' => $orden->detalles->contains(fn ($d) => $d->esPorRollos() && ! $d->estaCubierta()),
        ];
    }

    /**
     * Los rollos con los que el almacén cubrió el pedido, si ya los asignó.
     *
     * @return list<array<string, mixed>>
     */
    public function rollos(OrdenVenta $orden): array
    {
        return $orden->detalles
            ->flatMap(fn ($d) => $d->rollos->map(fn ($r) => [
                'codigo' => $r->rollo?->codigo ?? '—',
                'producto' => $d->presentacion?->producto?->nombre ?? '—',
                'color' => $r->rollo?->color?->nombre ?? '—',
                'metros' => number_format((float) $r->metros, 2),
            ]))
            ->values()
            ->all();
    }

    public function cargar(int $id): OrdenVenta
    {
        return OrdenVenta::with([
            'cliente',
            'almacen:id,nombre',
            'vendedor:id,name',
            'detalles.presentacion.producto:id,codigo,nombre',
            'detalles.color:id,codigo,nombre',
            'detalles.rollos.rollo.color',
        ])->findOrFail($id);
    }

    public function archivo(int $id): string
    {
        return 'pedido-'.OrdenVenta::findOrFail($id)->documento;
    }
}
