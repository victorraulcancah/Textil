<?php

namespace App\Services;

use App\Models\Cliente;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;

/**
 * Los clientes: alta, cambios, baja y el bloqueo de su crédito. El controlador solo recibe y responde; aquí está lo que
 * se hace con los datos (código, direcciones, línea de crédito).
 */
class ClienteService
{
    /** Lo que se devuelve con cada cliente. */
    public const RELACIONES = [
        'ejecutivo:id,name',
        'tipoPrecio:id,nombre',
        'categoriaComercial:id,nombre',
        'actividadComercial:id,nombre',
        'direcciones',
        // Condición de venta y días de crédito: la venta los necesita.
        'lineaCredito',
        // Quién le bloqueó el crédito, si está bloqueado.
        'bloqueadoPor:id,name',
    ];

    public function __construct(private readonly CreditoService $credito) {}

    /**
     * Los clientes activos, de la A a la Z, cada uno con su estado crediticio (🟢 🟡 🔴 ⚫) calculado al momento.
     *
     * Los clientes son compartidos por todas las sucursales: quien puede ver Clientes los ve todos. El ejecutivo
     * asignado sigue siendo un dato del cliente, no un filtro de quién lo ve.
     *
     * @return Collection<int, Cliente>
     */
    public function activosConEstadoCredito(): Collection
    {
        $clientes = Cliente::with(self::RELACIONES)
            ->where('activo', true)
            ->orderBy('nombre')->orderBy('id')
            ->get();

        $estados = $this->credito->estados($clientes);
        $clientes->each(fn (Cliente $c) => $c->setAttribute('estado_credito', $estados[$c->id] ?? null));

        return $clientes;
    }

    /** Crea el cliente con sus direcciones y su línea de crédito. Todo cliente nuevo nace activo. */
    public function crear(array $data): Cliente
    {
        $cliente = DB::transaction(function () use ($data) {
            $direcciones = Cliente::normalizarDirecciones($data['direcciones'] ?? []);

            $cliente = Cliente::create([
                ...Arr::except($data, ['direcciones', 'activo', 'linea_credito']),
                // Sin código escrito, el siguiente correlativo.
                'codigo' => ($data['codigo'] ?? null) ?: Cliente::siguienteCodigo(),
                'direccion' => Cliente::direccionPredeterminada($direcciones),
            ]);
            $cliente->guardarDirecciones($direcciones);
            $this->guardarLinea($cliente, $data);

            return $cliente;
        });

        return $cliente->load(self::RELACIONES);
    }

    /** Cambia los datos del cliente; las direcciones y la línea de crédito solo si vinieron. */
    public function actualizar(Cliente $cliente, array $data): Cliente
    {
        DB::transaction(function () use ($cliente, $data) {
            $cambios = Arr::except($data, ['direcciones', 'linea_credito']);
            // El código no se queda vacío: si lo borran, sigue el que tenía.
            if (array_key_exists('codigo', $cambios) && blank($cambios['codigo'])) {
                $cambios['codigo'] = $cliente->codigo ?: Cliente::siguienteCodigo();
            }

            $direcciones = null;
            if (array_key_exists('direcciones', $data)) {
                $direcciones = Cliente::normalizarDirecciones($data['direcciones']);
                $cambios['direccion'] = Cliente::direccionPredeterminada($direcciones);
            }

            $cliente->update($cambios);
            if ($direcciones !== null) {
                $cliente->guardarDirecciones($direcciones);
            }
            $this->guardarLinea($cliente, $data);
        });

        return $cliente->load(self::RELACIONES);
    }

    /** Un cliente no se borra: se desactiva y deja de salir en las listas. */
    public function desactivar(Cliente $cliente): void
    {
        $cliente->update(['activo' => false]);
    }

    /**
     * ⚫ Bloquea el crédito: nadie le vende a crédito, ni con autorización, hasta que se desbloquee. Queda el motivo,
     * quién y cuándo. Devuelve cómo queda su crédito.
     */
    public function bloquearCredito(Cliente $cliente, string $motivo, int $usuarioId): array
    {
        $cliente->update([
            'credito_bloqueado' => true,
            'credito_bloqueo_motivo' => $motivo,
            'credito_bloqueado_por' => $usuarioId,
            'credito_bloqueado_en' => now(),
        ]);

        return $this->credito->resumen($cliente->fresh());
    }

    /** Quita el bloqueo: el estado vuelve a calcularse solo con sus cuotas y su línea. */
    public function desbloquearCredito(Cliente $cliente): array
    {
        $cliente->update([
            'credito_bloqueado' => false,
            'credito_bloqueo_motivo' => null,
            'credito_bloqueado_por' => null,
            'credito_bloqueado_en' => null,
        ]);

        return $this->credito->resumen($cliente->fresh());
    }

    /** Crea, actualiza o quita la línea de crédito, si vino en lo guardado. */
    private function guardarLinea(Cliente $cliente, array $data): void
    {
        if (! array_key_exists('linea_credito', $data)) {
            return;
        }

        $linea = $data['linea_credito'];
        if ($linea === null) {
            $cliente->lineaCredito()->delete();

            return;
        }

        // Sin tipo de ampliación no hay ampliación: ni valor ni fecha.
        if (empty($linea['ampliacion_tipo'])) {
            $linea = ['ampliacion_tipo' => null, 'ampliacion_valor' => 0, 'ampliacion_hasta' => null] + $linea;
        }

        $cliente->lineaCredito()->updateOrCreate(['cliente_id' => $cliente->id], [
            'moneda' => $linea['moneda'],
            'limite' => $linea['limite'],
            'fecha_aprobacion' => $linea['fecha_aprobacion'] ?? null,
            'vigente_hasta' => $linea['vigente_hasta'] ?? null,
            'activa' => (bool) ($linea['activa'] ?? true),
            'condicion_venta' => $linea['condicion_venta'],
            'dias_credito' => (int) ($linea['dias_credito'] ?? 0),
            'dias_gracia' => (int) ($linea['dias_gracia'] ?? 0),
            'ampliacion_tipo' => $linea['ampliacion_tipo'] ?? null,
            'ampliacion_valor' => (float) ($linea['ampliacion_valor'] ?? 0),
            'ampliacion_hasta' => $linea['ampliacion_hasta'] ?? null,
            'observaciones' => $linea['observaciones'] ?? null,
        ]);
        $cliente->unsetRelation('lineaCredito');
    }
}
