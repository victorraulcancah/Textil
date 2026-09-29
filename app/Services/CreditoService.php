<?php

namespace App\Services;

use App\Exceptions\ExcesoCreditoException;
use App\Models\Auditoria;
use App\Models\Cliente;
use App\Models\CuentaPorCobrar;
use App\Support\Permisos;

/**
 * La línea de crédito en uso: cuánto debe el cliente, cuánto le queda y si
 * una venta a crédito cabe.
 *
 * La deuda en otra moneda que la de la línea se lleva a la de la línea con el
 * tipo de cambio SUNAT (venta) del día.
 */
class CreditoService
{
    public const SIMBOLO = ['PEN' => 'S/', 'USD' => 'US$'];

    public function __construct(protected TipoCambioService $tiposCambio) {}

    /** Lo que debe hoy, por moneda: ['PEN' => 1200.0, 'USD' => 300.0]. */
    public function deudaPorMoneda(int $clienteId): array
    {
        return CuentaPorCobrar::where('cliente_id', $clienteId)
            ->whereIn('estado', ['pendiente', 'parcial'])
            ->selectRaw('moneda, SUM(saldo) AS saldo')
            ->groupBy('moneda')
            ->pluck('saldo', 'moneda')
            ->map(fn ($saldo) => round((float) $saldo, 2))
            ->all();
    }

    /** Un monto de una moneda en otra; null si hace falta tipo de cambio y no hay. */
    public static function convertir(float $monto, string $de, string $a, ?float $tipoCambio): ?float
    {
        if ($de === $a) {
            return round($monto, 2);
        }
        if (! $tipoCambio || $tipoCambio <= 0) {
            return null;
        }

        return round($a === 'PEN' ? $monto * $tipoCambio : $monto / $tipoCambio, 2);
    }

    public static function dinero(float $monto, string $moneda): string
    {
        return (self::SIMBOLO[$moneda] ?? $moneda).' '.number_format($monto, 2);
    }

    /** La línea con lo usado y lo disponible hoy, en la moneda de la línea. */
    public function resumen(Cliente $cliente): array
    {
        $linea = $cliente->lineaCredito;
        $moneda = $linea?->moneda ?? 'PEN';
        $tipoCambio = $this->tiposCambio->venta();

        $porMoneda = $this->deudaPorMoneda($cliente->id);
        $deuda = 0.0;
        foreach ($porMoneda as $monedaDeuda => $saldo) {
            // Sin tipo de cambio no se puede sumar; se cuenta tal cual antes que ignorarla.
            $deuda += self::convertir($saldo, $monedaDeuda, $moneda, $tipoCambio) ?? $saldo;
        }

        $limite = round((float) ($linea?->limite ?? 0), 2);
        $ampliacion = $linea?->ampliacionVigente() ?? 0.0;
        $total = round($limite + $ampliacion, 2);

        return [
            'tiene_linea' => (bool) $linea,
            'moneda' => $moneda,
            'limite' => $limite,
            'ampliacion' => $ampliacion,
            'limite_total' => $total,
            'deuda' => round($deuda, 2),
            'deuda_por_moneda' => $porMoneda,
            'disponible' => round($total - $deuda, 2),
            // Por qué no se le puede vender a crédito (suspendida, vencida, contado…).
            'impedimento' => $linea ? $linea->impedimento() : 'El cliente no tiene línea de crédito.',
            'condicion_venta' => $linea?->condicion_venta ?? 'contado',
            'dias_credito' => (int) ($linea?->dias_credito ?? 0),
            'dias_gracia' => (int) ($linea?->dias_gracia ?? 0),
            'tipo_cambio' => $tipoCambio,
        ];
    }

    /**
     * Si una venta a crédito no cabe en la línea —o el cliente no tiene una
     * vigente— se detiene, salvo que quien vende tenga permiso para
     * autorizarla y la autorice.
     *
     * @throws ExcesoCreditoException
     */
    public function verificarVenta(Cliente $cliente, float $importe, string $moneda, ?float $tipoCambio, bool $autorizar): void
    {
        $resumen = $this->resumen($cliente);
        $monedaLinea = $resumen['moneda'];
        $importeEnLinea = self::convertir($importe, $moneda, $monedaLinea, $tipoCambio ?: $resumen['tipo_cambio']) ?? $importe;

        $excede = $importeEnLinea > $resumen['disponible'] + 0.005;
        if (! $resumen['impedimento'] && ! $excede) {
            return;
        }

        $importeTxt = self::dinero($importeEnLinea, $monedaLinea);
        if ($moneda !== $monedaLinea) {
            $importeTxt .= ' ('.self::dinero($importe, $moneda).')';
        }

        $mensaje = $resumen['impedimento']
            ? "{$resumen['impedimento']} Importe de la venta: {$importeTxt}."
            : 'El cliente excede su línea de crédito. Disponible: '
                .self::dinero(max($resumen['disponible'], 0), $monedaLinea)
                .". Importe de la venta: {$importeTxt}.";

        $puedeAutorizar = Permisos::puede(auth()->user(), 'ventas.notas-venta.exceder_credito');
        if ($autorizar && $puedeAutorizar) {
            // Queda constancia de quién dejó pasar la venta y por qué.
            Auditoria::registrar('autorizo_exceso_credito', [
                'modulo' => 'Línea de crédito',
                'auditable_type' => Cliente::class,
                'auditable_id' => $cliente->id,
                'descripcion' => "Autorizó una venta a crédito a {$cliente->nombre}: {$mensaje}",
            ]);

            return;
        }

        throw new ExcesoCreditoException($mensaje, [
            'moneda' => $monedaLinea,
            'limite' => $resumen['limite_total'],
            'deuda' => $resumen['deuda'],
            'disponible' => $resumen['disponible'],
            'importe' => $importeEnLinea,
            'puede_autorizar' => $puedeAutorizar,
        ]);
    }
}
