<?php

namespace App\Services;

use App\Exceptions\ExcesoCreditoException;
use App\Models\Auditoria;
use App\Models\Cliente;
use App\Models\CuentaPorCobrar;
use App\Support\Permisos;
use Carbon\Carbon;
use Illuminate\Support\Collection;

/**
 * La línea de crédito en uso: cuánto debe el cliente, cuánto le queda, cómo
 * está pagando y si una venta a crédito cabe.
 *
 * La deuda en otra moneda que la de la línea se lleva a la de la línea con el
 * tipo de cambio SUNAT (venta) del día.
 *
 * El estado crediticio no se guarda: se calcula cada vez con las cuotas, los
 * pagos y la línea, así que al registrar un pago o al vencer una cuota ya
 * está al día. Solo el bloqueo (⚫) se pone a mano.
 */
class CreditoService
{
    public const SIMBOLO = ['PEN' => 'S/', 'USD' => 'US$'];

    /** 🟢 al_dia · 🟡 con_atraso · 🔴 restringido · ⚫ bloqueado */
    public const ESTADOS = [
        'al_dia' => 'Al día',
        'con_atraso' => 'Con atraso',
        'restringido' => 'Crédito restringido',
        'bloqueado' => 'Crédito bloqueado',
    ];

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

    /** La línea con lo usado, lo disponible y el estado crediticio de hoy, en la moneda de la línea. */
    public function resumen(Cliente $cliente): array
    {
        $cliente->loadMissing(['lineaCredito', 'bloqueadoPor:id,name']);
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
            'estado' => $this->calcularEstado(
                $cliente,
                $deuda,
                $total,
                $moneda,
                $this->vencidasPorCliente([$cliente->id])->get($cliente->id),
                (int) ($linea?->dias_gracia ?? 0),
            ),
        ];
    }

    /**
     * El estado crediticio de varios clientes a la vez (la lista de
     * clientes), con dos consultas en total. Los clientes vienen con su
     * `lineaCredito` cargada.
     *
     * @return array<int, array> cliente_id => estado
     */
    public function estados(Collection $clientes): array
    {
        $ids = $clientes->pluck('id')->all();
        if ($ids === []) {
            return [];
        }

        $tipoCambio = $this->tiposCambio->venta();
        $deudas = CuentaPorCobrar::whereIn('cliente_id', $ids)
            ->whereIn('estado', ['pendiente', 'parcial'])
            ->selectRaw('cliente_id, moneda, SUM(saldo) AS saldo')
            ->groupBy('cliente_id', 'moneda')
            ->get()
            ->groupBy('cliente_id');
        $vencidas = $this->vencidasPorCliente($ids);

        $estados = [];
        foreach ($clientes as $cliente) {
            $linea = $cliente->lineaCredito;
            $moneda = $linea?->moneda ?? 'PEN';

            $deuda = 0.0;
            foreach ($deudas->get($cliente->id, collect()) as $fila) {
                $deuda += self::convertir((float) $fila->saldo, $fila->moneda, $moneda, $tipoCambio) ?? (float) $fila->saldo;
            }
            $limite = $linea ? round((float) $linea->limite + $linea->ampliacionVigente(), 2) : 0.0;

            $estados[$cliente->id] = $this->calcularEstado(
                $cliente, $deuda, $limite, $moneda, $vencidas->get($cliente->id), (int) ($linea?->dias_gracia ?? 0),
            );
        }

        return $estados;
    }

    /** Por cliente: cuántas cuotas vencidas con saldo tiene y desde cuándo. */
    private function vencidasPorCliente(array $ids): Collection
    {
        return CuentaPorCobrar::whereIn('cliente_id', $ids)
            ->whereIn('estado', ['pendiente', 'parcial'])
            ->whereDate('fecha_vencimiento', '<', today())
            ->selectRaw('cliente_id, COUNT(*) AS vencidas, MIN(fecha_vencimiento) AS mas_antigua')
            ->groupBy('cliente_id')
            ->get()
            ->keyBy('cliente_id');
    }

    /**
     * ⚫ bloqueado a mano; 🔴 con una cuota vencida más allá de sus días de
     * gracia o pasado de su línea; 🟡 con cuotas vencidas dentro de los días
     * de gracia; 🟢 sin cuotas vencidas.
     */
    private function calcularEstado(Cliente $cliente, float $deuda, float $limiteTotal, string $moneda, ?object $vencidas, int $gracia): array
    {
        $cuotas = (int) ($vencidas->vencidas ?? 0);
        $dias = $vencidas ? (int) Carbon::parse($vencidas->mas_antigua)->startOfDay()->diffInDays(today()) : 0;
        $excede = round($deuda - $limiteTotal, 2);

        $estado = fn (string $codigo, string $detalle, ?array $bloqueo = null) => [
            'codigo' => $codigo,
            'etiqueta' => self::ESTADOS[$codigo],
            'detalle' => $detalle,
            'cuotas_vencidas' => $cuotas,
            'dias_atraso' => $dias,
            'dias_gracia' => $gracia,
            'excede' => max($excede, 0),
            'bloqueo' => $bloqueo,
        ];

        if ($cliente->credito_bloqueado) {
            $quien = $cliente->bloqueadoPor?->name;
            $cuando = $cliente->credito_bloqueado_en?->format('d/m/Y');

            return $estado('bloqueado', trim($cliente->credito_bloqueo_motivo ?: 'Bloqueado a mano.'), [
                'motivo' => $cliente->credito_bloqueo_motivo,
                'por' => $quien,
                'en' => $cliente->credito_bloqueado_en?->toIso8601String(),
                'texto' => trim('Bloqueado'.($quien ? " por {$quien}" : '').($cuando ? " el {$cuando}" : '').'.'),
            ]);
        }

        $cuotasTxt = $cuotas === 1 ? '1 cuota vencida' : "{$cuotas} cuotas vencidas";
        $diasTxt = $dias === 1 ? '1 día' : "{$dias} días";

        $motivos = [];
        if ($cuotas > 0 && $dias > $gracia) {
            $motivos[] = "{$cuotasTxt}; la más antigua, hace {$diasTxt}"
                .($gracia > 0 ? " (pasó sus {$gracia} días de gracia)." : '.');
        }
        if ($excede > 0.005) {
            $motivos[] = 'Supera su línea en '.self::dinero($excede, $moneda).'.';
        }
        if ($motivos !== []) {
            return $estado('restringido', implode(' ', $motivos));
        }

        if ($cuotas > 0) {
            return $estado('con_atraso', "{$cuotasTxt} hace {$diasTxt}, dentro de sus {$gracia} días de gracia.");
        }

        return $estado('al_dia', 'Sin cuotas vencidas.');
    }

    /**
     * Si una venta a crédito no se puede —el cliente está bloqueado, tiene
     * atrasos importantes, no tiene una línea vigente o la venta no cabe— se
     * detiene. El bloqueo no lo salta nadie; lo demás lo puede autorizar quien
     * tenga el permiso "Autorizar exceso de crédito".
     *
     * @throws ExcesoCreditoException
     */
    public function verificarVenta(Cliente $cliente, float $importe, string $moneda, ?float $tipoCambio, bool $autorizar): void
    {
        $resumen = $this->resumen($cliente);
        $estado = $resumen['estado'];

        if ($estado['codigo'] === 'bloqueado') {
            throw new \DomainException(
                'El crédito del cliente está bloqueado: '.rtrim($estado['detalle'], '. ').'. Solo se le puede vender al contado.'
            );
        }

        $monedaLinea = $resumen['moneda'];
        $importeEnLinea = self::convertir($importe, $moneda, $monedaLinea, $tipoCambio ?: $resumen['tipo_cambio']) ?? $importe;

        $problemas = [];
        if ($resumen['impedimento']) {
            $problemas[] = $resumen['impedimento'];
        }
        // Atrasos importantes: una cuota vencida más allá de sus días de gracia.
        if ($estado['cuotas_vencidas'] > 0 && $estado['dias_atraso'] > $estado['dias_gracia']) {
            $problemas[] = 'El cliente tiene '.($estado['cuotas_vencidas'] === 1 ? '1 cuota vencida' : "{$estado['cuotas_vencidas']} cuotas vencidas")
                ." (la más antigua, hace {$estado['dias_atraso']} días).";
        }
        if (! $resumen['impedimento'] && $importeEnLinea > $resumen['disponible'] + 0.005) {
            $problemas[] = 'El cliente excede su línea de crédito. Disponible: '
                .self::dinero(max($resumen['disponible'], 0), $monedaLinea).'.';
        }

        if ($problemas === []) {
            return;
        }

        $importeTxt = self::dinero($importeEnLinea, $monedaLinea);
        if ($moneda !== $monedaLinea) {
            $importeTxt .= ' ('.self::dinero($importe, $moneda).')';
        }
        $mensaje = implode(' ', $problemas)." Importe de la venta: {$importeTxt}.";

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
            'estado' => $estado['codigo'],
            'puede_autorizar' => $puedeAutorizar,
        ]);
    }
}
