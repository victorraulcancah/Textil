<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Request;

/**
 * Una entrada de la bitácora. Solo se crea: nunca se edita ni se borra desde
 * la aplicación, porque entonces dejaría de servir como auditoría.
 */
class Auditoria extends Model
{
    protected $table = 'auditorias';

    /** El registro es histórico: lleva created_at y nada más. */
    public $timestamps = false;

    protected $fillable = [
        'user_id', 'usuario_nombre', 'accion',
        'auditable_type', 'auditable_id', 'modulo', 'descripcion',
        'antes', 'despues', 'ip', 'user_agent', 'created_at',
    ];

    protected function casts(): array
    {
        return [
            'antes' => 'array',
            'despues' => 'array',
            'created_at' => 'datetime',
        ];
    }

    /** Etiquetas en español para la acción. */
    public const ACCIONES = [
        'creo' => 'Creó',
        'actualizo' => 'Actualizó',
        'elimino' => 'Eliminó',
        'inicio_sesion' => 'Inició sesión',
        'cerro_sesion' => 'Cerró sesión',
    ];

    public function usuario()
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    /**
     * Deja constancia de algo. Toma solo el usuario autenticado y los datos de
     * la petición; no lanza excepciones para no tumbar la operación que se
     * está auditando.
     */
    public static function registrar(string $accion, array $datos = []): ?self
    {
        try {
            $user = auth('api')->user() ?? auth()->user();

            return static::create($datos + [
                'accion' => $accion,
                'user_id' => $user?->id,
                'usuario_nombre' => $user?->name,
                'ip' => Request::ip(),
                'user_agent' => substr((string) Request::userAgent(), 0, 255),
                'created_at' => now(),
            ]);
        } catch (\Throwable) {
            // La auditoría nunca debe impedir que la acción se complete.
            return null;
        }
    }
}
