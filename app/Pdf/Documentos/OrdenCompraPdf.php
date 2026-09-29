<?php

namespace App\Pdf\Documentos;

use App\Models\Empresa;
use App\Models\OrdenCompra;
use App\Pdf\DocumentoPdf;
use App\Pdf\MontoEnLetras;
use App\Pdf\PlanillaTela;
use App\Pdf\ProductoConColor;

class OrdenCompraPdf implements DocumentoPdf
{
    public function vista(): string
    {
        return 'pdf.documentos.orden-compra';
    }

    public function formatos(): array
    {
        return ['a4', 'ticket'];
    }

    public function datos(int $id): array
    {
        $orden = OrdenCompra::with([
            'proveedor',
            'usuarioCrea:id,name',
            'detalles.presentacion.producto:id,codigo,nombre,nombre_tecnico,gramaje,ancho_cm,composicion,codigo_arancelario,metros_por_rollo',
            'detalles.presentacion.unidadBase:id,abreviatura',
            'detalles.color:id,codigo,nombre',
        ])->findOrFail($id);

        $filas = $orden->detalles->map(fn ($d, $i) => [
            'n' => $i + 1,
            'codigo' => ProductoConColor::codigo($d->presentacion?->producto, $d->color),
            // Si se compra por rollos, la orden dice cuántos: el metraje real
            // de cada uno llega recién con el packing list.
            'producto' => ProductoConColor::nombre($d->presentacion?->producto, $d->color)
                . ($d->rollos ? " ({$d->rollos} " . ($d->rollos == 1 ? 'rollo' : 'rollos') . ')' : ''),
            'unidad' => $d->presentacion?->nombre ?? '—',
            'cantidad' => number_format((float) $d->cantidad, 2),
            'precio' => number_format((float) $d->precio_unitario, 2),
            'subtotal' => number_format((float) $d->subtotal, 2),
            // Para el ticket (nombre + línea de detalle + importe).
            'nombre' => ProductoConColor::nombre($d->presentacion?->producto, $d->color),
            'detalle' => number_format((float) $d->cantidad, 2) . ' ' . ($d->presentacion?->nombre ?? '') . ' x ' . number_format((float) $d->precio_unitario, 2),
            'importe' => number_format((float) $d->subtotal, 2),
        ])->all();

        $total = (float) $orden->detalles->sum('subtotal');
        $moneda = $orden->moneda === 'USD' ? '$' : 'S/';

        return [
            'orden' => $orden,
            'documento' => $orden->codigo,
            'filas' => $filas,
            // La planilla (una tabla por tela, con su color code), en el A4.
            'planilla' => PlanillaTela::deOrdenCompra($orden),
            'total' => $total,
            'moneda' => $moneda,
            'enLetras' => MontoEnLetras::convertir($total, $orden->moneda === 'USD' ? 'DÓLARES' : 'SOLES'),
            // La cabecera en inglés de la Purchase Order (solo compras al exterior).
            'ingles' => $orden->tipo === 'exterior' ? $this->ingles($orden) : null,
            // Solo tienen sentido en una compra al exterior; el blade los
            // omite del todo cuando la orden es nacional.
            'datosExterior' => $orden->tipo === 'exterior' ? [
                'Incoterm' => $orden->incoterm ?: '—',
                'Tipo de carga' => $orden->cargo_type ?: '—',
                'Medio de embarque' => $orden->medio_transporte ?: '—',
                'Contenedor' => $orden->numero_contenedor ?: '—',
                'País origen' => $orden->pais_origen ?: '—',
                'País destino' => $orden->pais_destino ?: '—',
                'Puerto embarque' => $orden->puerto_embarque ?: '—',
                'Puerto destino' => $orden->puerto_destino ?: '—',
                'F. embarque est.' => optional($orden->fecha_embarque_estimada)->format('d/m/Y') ?: '—',
                'Elaborado por' => $orden->elaborado_por ?: '—',
                'Aprobado por' => $orden->aprobado_por ?: '—',
            ] : null,
        ];
    }

    /**
     * La cabecera de la Purchase Order, en inglés y con los datos que ya tiene el
     * sistema: el proveedor es el vendedor (Shipper / Seller), la empresa es el
     * comprador (Consignee / Buyer) y el embarque sale de la orden. La mercadería
     * se describe por tela con su ficha técnica.
     */
    private function ingles(OrdenCompra $orden): array
    {
        $proveedor = $orden->proveedor;
        $empresa = Empresa::query()->where('activa', true)->first() ?? Empresa::first();
        $simbolo = $orden->moneda === 'USD' ? '$' : 'S/';

        $mayus = fn ($v) => mb_strtoupper(trim((string) $v));
        $limpio = fn (array $partes) => collect($partes)->filter(fn ($p) => filled($p))->implode(', ');

        // Una ficha por tela (el color no cambia la ficha): precio pactado y metros de cada rollo.
        $bienes = $orden->detalles
            ->groupBy(fn ($d) => $d->presentacion?->producto?->id)
            ->map(function ($lineas) use ($simbolo, $mayus) {
                $producto = $lineas->first()->presentacion?->producto;
                $precios = $lineas->pluck('precio_unitario')->map(fn ($p) => (float) $p)->unique()->values();
                $factores = $lineas
                    ->filter(fn ($d) => (int) $d->rollos > 0)
                    ->map(fn ($d) => round((float) $d->cantidad / (int) $d->rollos, 2))
                    ->unique()->sort()->values();
                $fmt = fn ($n) => rtrim(rtrim(number_format((float) $n, 2, '.', ''), '0'), '.');

                return [
                    'name' => $mayus($producto?->nombre_tecnico ?: $producto?->nombre),
                    'weight' => $producto?->gramaje ? $fmt($producto->gramaje).' GSM' : '—',
                    'width' => $producto?->ancho_cm ? $fmt($producto->ancho_cm).' CM' : '—',
                    'specification' => $mayus($producto?->composicion) ?: '—',
                    'price' => $precios->map(fn ($p) => $simbolo.number_format($p, 2))->implode(' / '),
                    'hs_code' => $producto?->codigo_arancelario ?: '—',
                    'roll' => $factores->isNotEmpty()
                        ? $factores->map($fmt)->implode(' - ')
                        : ($producto?->metros_por_rollo ? $fmt($producto->metros_por_rollo) : '—'),
                ];
            })
            ->values()
            ->all();

        // "ITEM 1": una tabla por tela con su código de producto, su color code y sus rollos y metros.
        $porTela = $orden->detalles->groupBy(fn ($d) => $d->presentacion?->producto?->id)->values();
        $items = $porTela->map(function ($lineas, $i) use ($porTela, $mayus) {
            $producto = $lineas->first()->presentacion?->producto;

            return [
                'title' => 'ITEM '.($i + 1).($porTela->count() > 1 ? ' - '.$mayus($producto?->nombre_tecnico ?: $producto?->nombre) : ''),
                'rows' => $lineas->map(fn ($d) => [
                    'product_code' => collect([$producto?->codigo, $d->color?->codigo])->filter()->implode('-'),
                    'color_code' => $d->color_code ?: '',
                    'color' => $mayus($d->color?->nombre),
                    'rolls' => (int) $d->rollos,
                    'meters' => (float) $d->cantidad,
                ])->all(),
                'rolls' => (int) $lineas->sum('rollos'),
                'meters' => (float) $lineas->sum('cantidad'),
            ];
        })->all();

        return [
            'shipper' => [
                'name' => $mayus($proveedor?->nombre),
                'address' => $mayus($proveedor?->direccion) ?: '—',
                'tax_id' => $proveedor?->tax_id ?: ($proveedor?->ruc ?: '—'),
                'telephone' => $proveedor?->telefono ?: '—',
                'fax' => $proveedor?->fax ?: null,
            ],
            'consignee' => [
                'name' => $mayus($empresa?->razon_social),
                'address' => $mayus($limpio([$empresa?->direccion, $empresa?->distrito, $empresa?->provincia, $empresa?->departamento])) ?: '—',
                'ruc' => $empresa?->ruc ?: '—',
                'telephone' => $empresa?->telefono ?: '—',
            ],
            'cargo_type' => $mayus($orden->cargo_type) ?: '—',
            'container' => $mayus($orden->numero_contenedor) ?: '—',
            'shipment' => $mayus($orden->medio_transporte) ?: '—',
            'origin' => $mayus($orden->pais_origen) ?: '—',
            'destination' => $mayus($orden->pais_destino) ?: '—',
            'incoterms' => $mayus($orden->incoterm) ?: '—',
            'port_departure' => $mayus($orden->puerto_embarque) ?: '—',
            'port_arrival' => $mayus($orden->puerto_destino) ?: '—',
            'date_of_agreement' => optional($orden->fecha_emision)->format('d/m/Y') ?: '—',
            'bienes' => $bienes,
            'items' => $items,
            'total_rolls' => (int) $orden->detalles->sum('rollos'),
            'total_meters' => (float) $orden->detalles->sum('cantidad'),
            'shipping_date' => optional($orden->fecha_embarque_estimada)->format('d/m/Y') ?: '—',
            'prepared_by' => $orden->elaborado_por ?: '',
            'approved_by' => $orden->aprobado_por ?: '',
            'note' => $orden->observaciones ?: '',
        ];
    }

    public function archivo(int $id): string
    {
        return 'orden-compra-' . OrdenCompra::findOrFail($id)->codigo;
    }
}
