<?php

namespace App\Http\Controllers;

use App\Models\AperturaCaja;
use App\Models\Empresa;
use App\Models\MovimientoCaja;
use App\Pdf\PdfService;
use App\Services\ContraparteMovimientoCaja;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Validation\ValidationException;

/**
 * La planilla de caja de un día, en PDF: cada movimiento con su documento, el cliente o proveedor, la referencia, el
 * medio de pago y el importe, y debajo el cuadro del día por medio de pago (efectivo, cuenta, billetera, tarjeta) con el
 * saldo anterior y el saldo en caja. El filtro es solo el día; sin día, la caja que tienes abierta ahora.
 */
class MiCajaReporteController extends Controller
{
    public function pdf(Request $request)
    {
        $r = $this->construir($this->fecha($request));

        $pdf = app(PdfService::class)->generarVista('pdf.reportes.caja-dia', [
            'r' => $r,
            'empresa' => Empresa::query()->where('activa', true)->first() ?? Empresa::first(),
        ], 'a4h');

        $archivo = 'caja-'.($r['fecha'] ?? now()->format('Y-m-d')).'.pdf';

        return $request->boolean('descargar') ? $pdf->download($archivo) : $pdf->stream($archivo);
    }

    /** Responde si hay reporte para ese día, antes de abrirlo (así el visor no muestra un error en crudo). */
    public function disponible(Request $request)
    {
        $aperturas = $this->aperturasDelReporte($this->fecha($request));

        return response()->json(['turnos' => $aperturas->count()]);
    }

    /** El día pedido (AAAA-MM-DD, nunca futuro) o null para la caja abierta ahora. */
    private function fecha(Request $request): ?string
    {
        return $request->validate([
            'fecha' => 'nullable|date_format:Y-m-d|before_or_equal:today',
        ])['fecha'] ?? null;
    }

    /**
     * Sin día: la apertura abierta de quien consulta. Con día: todos los turnos que abrió en su caja ese día, aunque ya
     * estén cerrados (puede haber más de uno).
     *
     * @return Collection<int, AperturaCaja>
     */
    private function aperturasDelReporte(?string $fecha): Collection
    {
        $user = auth('api')->user();
        $consulta = AperturaCaja::with(['caja:id,nombre,codigo,almacen_id', 'caja.almacen:id,nombre', 'usuario:id,name'])
            ->where('caja_id', $user?->cajaActual()?->id)
            ->where('usuario_id', $user?->id);

        if ($fecha) {
            $aperturas = $consulta->whereDate('fecha_apertura', $fecha)->orderBy('fecha_apertura')->get();

            if ($aperturas->isEmpty()) {
                throw ValidationException::withMessages(['fecha' => 'No abriste tu caja el '.date('d/m/Y', strtotime($fecha)).'.']);
            }

            return $aperturas;
        }

        $apertura = $consulta->where('estado', 'abierta')->latest('fecha_apertura')->first();

        if (! $apertura) {
            throw ValidationException::withMessages(['caja' => 'No tienes una caja abierta.']);
        }

        return collect([$apertura]);
    }

    /**
     * Los datos de la planilla.
     *
     * @return array<string, mixed>
     */
    private function construir(?string $fecha = null): array
    {
        $aperturas = $this->aperturasDelReporte($fecha);
        $apertura = $aperturas->first();

        // Con los anulados: salen marcados, sin importe y sin sumar.
        $movs = MovimientoCaja::withTrashed()
            ->with(['motivo:id,nombre', 'cuentaBancaria:id,alias,numero_cuenta', 'billetera:id,nombre'])
            ->whereIn('apertura_caja_id', $aperturas->pluck('id'))
            ->orderBy('created_at')->orderBy('id')
            ->get();

        app(ContraparteMovimientoCaja::class)->adjuntar($movs);

        $medioDe = fn (MovimientoCaja $m): string => match (true) {
            (bool) $m->tarjeta_id => 'tarjeta',
            (bool) $m->billetera_id => 'billetera',
            (bool) $m->cuenta_bancaria_id => 'banco',
            default => 'efectivo',
        };

        $detalleMedio = fn (MovimientoCaja $m): string => match ($medioDe($m)) {
            'tarjeta' => 'Tarjeta',
            'billetera' => 'Billetera · '.($m->billetera?->nombre ?? ''),
            'banco' => 'Cuenta · '.($m->cuentaBancaria ? ($m->cuentaBancaria->alias ?: $m->cuentaBancaria->numero_cuenta) : ''),
            default => 'Efectivo',
        };

        $filas = $movs->values()->map(function (MovimientoCaja $m, int $i) use ($detalleMedio) {
            $anulado = $m->trashed();
            $moneda = $m->moneda ?: 'PEN';

            return [
                'n' => $i + 1,
                'hora' => $m->created_at?->timezone(config('app.timezone'))->format('H:i') ?? '',
                'documento' => $m->documento ?: 'MC-'.str_pad((string) $m->id, 6, '0', STR_PAD_LEFT),
                // Cliente o proveedor; en un movimiento a mano, lo que se escribió.
                'nombre' => $anulado ? '***ANULADO***' : ($m->contraparte ?: ((string) $m->descripcion ?: ($m->motivo?->nombre ?? ''))),
                'rol' => $anulado ? null : $m->contraparte_tipo,
                'referencia' => $m->motivo?->nombre ?? '',
                'medio' => $detalleMedio($m),
                'operacion' => (string) $m->numero_operacion,
                'moneda' => $moneda === 'USD' ? 'US$' : 'S/',
                'ingreso' => ! $anulado && $m->tipo === 'ingreso' ? (float) $m->monto : null,
                'egreso' => ! $anulado && $m->tipo === 'egreso' ? (float) $m->monto : null,
                'anulado' => $anulado,
            ];
        })->all();

        return [
            'apertura' => $apertura,
            'fecha' => $fecha,
            'dia' => date('d/m/Y', strtotime($fecha ?? $apertura->fecha_apertura?->toDateString() ?? 'now')),
            'turnos' => $aperturas->count(),
            'movimientos' => $filas,
            'cuadro' => $this->cuadro($movs->reject->trashed(), (float) $apertura->monto_inicial, $medioDe),
        ];
    }

    /**
     * El cuadro del día por medio de pago y moneda: ingreso, egreso, saldo del día, saldo anterior (lo que dejó el turno
     * previo, solo en efectivo soles) y saldo en caja.
     *
     * @param  Collection<int, MovimientoCaja>  $movs  vigentes (sin anulados)
     * @return array{medios: array<string, string>, monedas: array<string, string>, filas: list<array<string, mixed>>}
     */
    private function cuadro(Collection $movs, float $saldoAnterior, callable $medioDe): array
    {
        $medios = ['efectivo' => 'Efectivo', 'banco' => 'Cuenta bancaria', 'billetera' => 'Billetera', 'tarjeta' => 'Tarjeta'];
        $monedas = ['PEN' => 'S/', 'USD' => 'US$'];

        $celda = function (string $tipo, string $medio, string $moneda) use ($movs, $medioDe) {
            return round((float) $movs
                ->filter(fn (MovimientoCaja $m) => $m->tipo === $tipo && $medioDe($m) === $medio && ($m->moneda ?: 'PEN') === $moneda)
                ->sum('monto'), 2);
        };

        $rotulos = [
            'ingreso' => 'Ingreso del día',
            'egreso' => 'Egreso del día',
            'saldo_dia' => 'Saldo del día',
            'anterior' => 'Saldo anterior',
            'saldo_caja' => 'Saldo en caja',
        ];

        $filas = [];
        foreach ($rotulos as $clave => $rotulo) {
            $valores = [];
            foreach ($medios as $medio => $_) {
                foreach ($monedas as $codigo => $__) {
                    $ing = $celda('ingreso', $medio, $codigo);
                    $egr = $celda('egreso', $medio, $codigo);
                    $ant = $medio === 'efectivo' && $codigo === 'PEN' ? round($saldoAnterior, 2) : 0.0;

                    $valores["{$medio}.{$codigo}"] = match ($clave) {
                        'ingreso' => $ing,
                        'egreso' => $egr,
                        'saldo_dia' => round($ing - $egr, 2),
                        'anterior' => $ant,
                        'saldo_caja' => round($ant + $ing - $egr, 2),
                    };
                }
            }

            foreach ($monedas as $codigo => $__) {
                $valores["total.{$codigo}"] = round(collect($medios)->keys()->sum(fn ($medio) => $valores["{$medio}.{$codigo}"]), 2);
            }

            $filas[] = ['rotulo' => $rotulo, 'clave' => $clave, 'valores' => $valores];
        }

        return ['medios' => $medios + ['total' => 'Total'], 'monedas' => $monedas, 'filas' => $filas];
    }
}
