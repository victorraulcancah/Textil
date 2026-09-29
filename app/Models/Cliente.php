<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Arr;
use Illuminate\Support\Str;

class Cliente extends Model
{
    use Auditable;

    /** PCGE: lo que debe va a la cuenta 12 (terceros) o a la 13 (relacionadas). */
    public const TIPOS_CLIENTE = ['TERCERO', 'RELACIONADO'];

    /** Nombre del módulo en la bitácora de auditoría. */
    protected string $auditarModulo = 'Cliente';
    protected $table = 'clientes';

    protected $fillable = [
        'codigo',
        'nombre',
        'tipo_documento',
        'numero_documento',
        // La dirección predeterminada ya armada; se llena sola desde sus direcciones.
        'direccion',
        'telefono',
        'email',
        'zona',
        'actividad_comercial_id',
        'categoria_comercial_id',
        'tipo_cliente',
        'ejecutivo_id',
        // A qué precio se le vende (Mayorista…). Sin uno, al principal.
        'tipo_precio_id',
        'activo',
    ];

    protected $attributes = [
        'tipo_cliente' => 'TERCERO',
    ];

    protected function casts(): array
    {
        return [
            'activo' => 'boolean',
        ];
    }

    /** El vendedor a cargo de este cliente. Sin uno, solo lo ve quien tenga "ver todo". */
    public function ejecutivo()
    {
        return $this->belongsTo(User::class, 'ejecutivo_id');
    }

    public function tipoPrecio()
    {
        return $this->belongsTo(TipoPrecio::class);
    }

    /** Lo que debe: una cuenta por cada cuota de sus ventas a crédito. */
    public function cuentasPorCobrar()
    {
        return $this->hasMany(CuentaPorCobrar::class);
    }

    /** Cuánto se le fía; sin una, se le vende al contado. */
    public function lineaCredito()
    {
        return $this->hasOne(LineaCredito::class);
    }

    public function categoriaComercial()
    {
        return $this->belongsTo(CategoriaComercial::class);
    }

    public function actividadComercial()
    {
        return $this->belongsTo(ActividadComercial::class);
    }

    /** La fiscal y las de entrega. */
    public function direcciones()
    {
        return $this->hasMany(ClienteDireccion::class)->orderBy('id');
    }

    /** El siguiente código libre: C00001, C00002… Se llama dentro de una transacción. */
    public static function siguienteCodigo(): string
    {
        $ultimo = static::query()
            ->where('codigo', 'regexp', '^C[0-9]+$')
            ->lockForUpdate()
            ->selectRaw('MAX(CAST(SUBSTRING(codigo, 2) AS UNSIGNED)) AS n')
            ->value('n');

        return 'C'.str_pad((string) ((int) $ultimo + 1), 5, '0', STR_PAD_LEFT);
    }

    /**
     * Las direcciones del formulario tal como se van a guardar. Con ubigeo, el
     * lugar sale del catálogo oficial y no de lo que se escribió; fuera del
     * Perú no hay ubigeo y el lugar va escrito.
     */
    public static function normalizarDirecciones(array $filas): array
    {
        $catalogo = Ubigeo::whereIn('ubigeo', collect($filas)->pluck('ubigeo')->filter())->get()->keyBy('ubigeo');

        $filas = array_map(function (array $fila) use ($catalogo) {
            $datos = Arr::only($fila, [
                'tipo', 'direccion', 'referencia', 'pais', 'departamento', 'provincia', 'distrito', 'ubigeo', 'codigo_postal',
            ]);
            $datos['predeterminada'] = (bool) ($fila['predeterminada'] ?? false);
            $datos['pais'] = trim((string) ($datos['pais'] ?? '')) ?: 'PERÚ';
            $delPeru = (new ClienteDireccion(['pais' => $datos['pais']]))->esDelPeru();

            if ($delPeru && ($lugar = $catalogo->get($datos['ubigeo'] ?? null))) {
                $datos['departamento'] = $lugar->departamento;
                $datos['provincia'] = $lugar->provincia;
                $datos['distrito'] = $lugar->distrito;
            } else {
                $datos['ubigeo'] = null;
            }

            return ['id' => $fila['id'] ?? null, ...$datos];
        }, $filas);

        // Siempre hay una predeterminada: si no marcaron ninguna, la primera.
        if ($filas && ! collect($filas)->contains('predeterminada', true)) {
            $filas[0]['predeterminada'] = true;
        }

        return $filas;
    }

    /**
     * La predeterminada ya armada para clientes.direccion. Se calcula antes de
     * guardar para que la auditoría registre un solo cambio del cliente.
     */
    public static function direccionPredeterminada(array $filas): ?string
    {
        $elegida = collect($filas)->firstWhere('predeterminada', true);

        return $elegida ? Str::limit((new ClienteDireccion($elegida))->completa(), 255, '') : null;
    }

    /** Actualiza las que siguen, crea las nuevas y borra las que se quitaron. */
    public function guardarDirecciones(array $filas): void
    {
        $quedan = [];

        foreach ($filas as $fila) {
            $datos = Arr::except($fila, ['id']);
            $direccion = empty($fila['id']) ? null : $this->direcciones()->find($fila['id']);
            if ($direccion) {
                $direccion->update($datos);
            } else {
                $direccion = $this->direcciones()->create($datos);
            }
            $quedan[] = $direccion->id;
        }

        $this->direcciones()->whereNotIn('id', $quedan)->delete();
        $this->unsetRelation('direcciones');
    }
}
