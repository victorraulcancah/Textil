<?php

namespace App\Services;

use App\Models\TipoCambio;
use Carbon\Carbon;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

/**
 * El tipo de cambio para vender y cobrar. No tiene pantalla: se resuelve en
 * el momento en que se vende o se cobra.
 *
 * El de SUNAT se trae solo la primera vez que se necesita en el día, del
 * archivo público que SUNAT publica con el de hoy ("dd/mm/aaaa|compra|venta|").
 * Cada día queda guardado y, para una fecha sin publicación (fin de semana,
 * feriado, un día que SUNAT no respondió), vale el último anterior.
 *
 * El comercial se escribe al cobrar en soles algo que es en dólares. El
 * último con que se cobró queda guardado y se propone en los cobros que
 * siguen ese día; mientras no haya uno, se propone el de SUNAT.
 */
class TipoCambioService
{
    private const URL_SUNAT = 'https://www.sunat.gob.pe/a/txt/tipoCambio.txt';

    /** Si SUNAT no respondió, no se reintenta en cada pedido: espera este rato. */
    private const ESPERA_TRAS_FALLO_MIN = 15;

    /**
     * Lo que vale para una fecha: el SUNAT (venta y compra, con el día del que
     * sale) y el comercial de ese mismo día, si ya se cobró con uno.
     *
     * @return array{fecha: string, venta: ?float, compra: ?float, fecha_venta: ?string, comercial: ?float, fecha_comercial: ?string}
     */
    public function para(?string $fecha = null): array
    {
        $fecha = $fecha ? Carbon::parse($fecha)->toDateString() : today()->toDateString();

        if ($fecha >= today()->toDateString()) {
            $this->traerDeSunat();
        }

        $sunat = TipoCambio::where('fecha', '<=', $fecha)->whereNotNull('venta')->orderByDesc('fecha')->first();
        // El comercial cambia de un día a otro: el de ayer no se propone hoy.
        $comercial = TipoCambio::where('fecha', $fecha)->whereNotNull('comercial')->first();

        return [
            'fecha' => $fecha,
            'venta' => $sunat ? (float) $sunat->venta : null,
            'compra' => $sunat?->compra !== null ? (float) $sunat->compra : null,
            'fecha_venta' => $sunat?->fecha?->toDateString(),
            'comercial' => $comercial ? (float) $comercial->comercial : null,
            'fecha_comercial' => $comercial?->fecha?->toDateString(),
        ];
    }

    /** El SUNAT venta para una fecha (el de ese día o el último anterior). */
    public function venta(?string $fecha = null): ?float
    {
        return $this->para($fecha)['venta'];
    }

    /**
     * Se cobró en soles con este tipo de cambio: queda como el comercial de
     * ese día, y es el que se propone en los cobros que siguen.
     */
    public function recordarComercial(float $tipoCambio, ?string $fecha = null): void
    {
        if ($tipoCambio <= 0) {
            return;
        }

        $fecha = $fecha ? Carbon::parse($fecha)->toDateString() : today()->toDateString();

        // Lo deja el cobro, no una persona editando: no va a la auditoría.
        TipoCambio::withoutEvents(function () use ($fecha, $tipoCambio) {
            try {
                TipoCambio::updateOrCreate(['fecha' => $fecha], ['comercial' => round($tipoCambio, 4)]);
            } catch (QueryException) {
                // Otro cobro lo guardó al mismo tiempo: ya está.
            }
        });
    }

    /**
     * Trae el de hoy de SUNAT si todavía no está. Si SUNAT no responde, no se
     * vuelve a intentar en cada pedido sino pasado un rato; mientras tanto el
     * tipo de cambio se escribe en la venta o el cobro. Devuelve si quedó el
     * de hoy.
     */
    public function traerDeSunat(): bool
    {
        $hoy = today()->toDateString();

        if (TipoCambio::where('fecha', $hoy)->whereNotNull('venta')->exists()) {
            return true;
        }
        if (Cache::has('tipo_cambio.sunat_fallo')) {
            return false;
        }

        $publicado = $this->consultarSunat();
        if (! $publicado) {
            Cache::put('tipo_cambio.sunat_fallo', true, now()->addMinutes(self::ESPERA_TRAS_FALLO_MIN));

            return false;
        }

        // Lo trae el sistema, no una persona: no va a la auditoría.
        TipoCambio::withoutEvents(function () use ($publicado) {
            try {
                TipoCambio::updateOrCreate(
                    ['fecha' => $publicado['fecha']],
                    ['compra' => $publicado['compra'], 'venta' => $publicado['venta']],
                );
            } catch (QueryException) {
                // Otro pedido lo guardó al mismo tiempo: ya está.
            }
        });
        Cache::forget('tipo_cambio.sunat_fallo');

        return $publicado['fecha'] === $hoy;
    }

    /** @return array{fecha: string, compra: float, venta: float}|null */
    private function consultarSunat(): ?array
    {
        try {
            $respuesta = Http::timeout(8)
                ->withHeaders(['User-Agent' => 'Mozilla/5.0'])
                ->get(self::URL_SUNAT);
        } catch (\Throwable) {
            return null;
        }

        if (! $respuesta->successful()) {
            return null;
        }

        // "29/09/2026|3.432|3.44|"
        $partes = array_map('trim', explode('|', trim($respuesta->body())));
        if (count($partes) < 3 || ! preg_match('#^\d{2}/\d{2}/\d{4}$#', $partes[0])) {
            return null;
        }

        $compra = (float) $partes[1];
        $venta = (float) $partes[2];
        if ($compra <= 0 || $venta <= 0) {
            return null;
        }

        return [
            'fecha' => Carbon::createFromFormat('d/m/Y', $partes[0])->toDateString(),
            'compra' => round($compra, 4),
            'venta' => round($venta, 4),
        ];
    }
}
