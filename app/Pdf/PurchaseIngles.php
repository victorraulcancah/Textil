<?php

namespace App\Pdf;

use App\Models\Empresa;

/** Los datos de la Purchase Order en inglés: los comparten la orden de compra y la compra al exterior. */
class PurchaseIngles
{
    /**
     * La cabecera de la Purchase Order, en inglés y con los datos que ya tiene el
     * sistema: el proveedor es el vendedor (Shipper / Seller), la empresa es el
     * comprador (Consignee / Buyer) y el embarque sale de la orden o de la compra. La mercadería
     * se describe por tela con su ficha técnica.
     *
     * `$orden` es la orden de compra o la compra (comparten los datos de embarque); `$campoPrecio`, la
     * columna del precio de sus líneas; `$fechaAcuerdo`, la fecha del acuerdo con el proveedor; y
     * `$fechaDocumento`, la del documento que se imprime.
     */
    public static function armar($orden, string $campoPrecio, string $moneda, ?string $contenedor, $fechaAcuerdo, $fechaDocumento): array
    {
        $proveedor = $orden->proveedor;
        $empresa = Empresa::query()->where('activa', true)->first() ?? Empresa::first();
        $simbolo = $moneda === 'USD' ? '$' : 'S/';

        $mayus = fn ($v) => mb_strtoupper(trim((string) $v));
        $limpio = fn (array $partes) => collect($partes)->filter(fn ($p) => filled($p))->implode(', ');

        // Una ficha por tela (el color no cambia la ficha): precio pactado y metros de cada rollo.
        $bienes = $orden->detalles
            ->groupBy(fn ($d) => $d->presentacion?->producto?->id)
            ->map(function ($lineas) use ($simbolo, $mayus, $campoPrecio) {
                $producto = $lineas->first()->presentacion?->producto;
                $precios = $lineas->pluck($campoPrecio)->map(fn ($p) => (float) $p)->unique()->values();
                $factores = $lineas
                    ->filter(fn ($d) => (int) $d->rollos > 0)
                    ->map(fn ($d) => round((float) $d->cantidad / (int) $d->rollos, 2))
                    ->unique()->sort()->values();
                $fmt = fn ($n) => rtrim(rtrim(number_format((float) $n, 2, '.', ''), '0'), '.');

                return [
                    'name' => $mayus($producto?->nombre_tecnico ?: $producto?->nombre),
                    // Como en la hoja del proveedor: el gramaje con su mínimo y el ancho medido de orillo a orillo.
                    'weight' => $producto?->gramaje ? $fmt($producto->gramaje).' GSM (NO LESS THAN '.$fmt($producto->gramaje).'GSM)' : '—',
                    'width' => $producto?->ancho_cm ? $fmt($producto->ancho_cm).' CM (HOLE TO HOLE)' : '—',
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
            'container' => $mayus($contenedor) ?: '—',
            'shipment' => $mayus($orden->medio_transporte) ?: '—',
            'origin' => $mayus($orden->pais_origen) ?: '—',
            'destination' => $mayus($orden->pais_destino) ?: '—',
            'incoterms' => $mayus($orden->incoterm) ?: '—',
            'port_departure' => $mayus($orden->puerto_embarque) ?: '—',
            'port_arrival' => $mayus($orden->puerto_destino) ?: '—',
            'date_of_agreement' => optional($fechaAcuerdo)->format('d/m/Y') ?: '—',
            'document_date' => optional($fechaDocumento)->format('d/m/Y') ?: '—',
            'bienes' => $bienes,
            'shipping_date' => optional($orden->fecha_embarque_estimada)->format('d/m/Y') ?: '—',
            'prepared_by' => $orden->elaborado_por ?: '',
            'approved_by' => $orden->aprobado_por ?: '',
            'note' => $orden->observaciones ?: '',
        ];
    }
}
