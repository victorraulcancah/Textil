<?php

namespace App\Services;

use App\Models\TipoCambio;
use Carbon\Carbon;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

/**
 * El tipo de cambio para vender y cobrar.
 *
 * El de SUNAT se trae solo, una vez al día, del archivo público que SUNAT
 * publica con el de hoy ("dd/mm/aaaa|compra|venta|"). Cada día queda guardado:
 * así se arma el historial y, para una fecha sin publicación (fin de semana,
 * feriado, un día que SUNAT no respondió), vale el último anterior.
 *
 * El comercial lo pone la empresa a mano; es el que se propone para cobrar
 * en soles una deuda en dólares.
 */
class TipoCambioService
{
    private const URL_SUNAT = 'https://www.sunat.gob.pe/a/txt/tipoCambio.txt';

    /** Si SUNAT no respondió, no se reintenta en cada pedido: espera este rato. */
    private const ESPERA_TRAS_FALLO_MIN = 15;

    /**
     * Lo que vale para una fecha: el SUNAT (venta y compra) y el comercial,
     * cada uno con el día del que sale.
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
        $comercial = TipoCambio::where('fecha', '<=', $fecha)->whereNotNull('comercial')->orderByDesc('fecha')->first();

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
     * Trae el de hoy de SUNAT si todavía no está. Con `$forzar` lo vuelve a
     * pedir aunque ya esté o aunque acabe de fallar (botón "Traer de SUNAT").
     * Devuelve si quedó el de hoy.
     */
    public function traerDeSunat(bool $forzar = false): bool
    {
        $hoy = today()->toDateString();

        if (! $forzar) {
            if (TipoCambio::where('fecha', $hoy)->whereNotNull('venta')->exists()) {
                return true;
            }
            if (Cache::has('tipo_cambio.sunat_fallo')) {
                return false;
            }
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
