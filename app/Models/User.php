<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Spatie\Permission\Traits\HasRoles;
use Tymon\JWTAuth\Contracts\JWTSubject;

#[Fillable(['name', 'dni', 'email', 'password', 'empresa_id', 'caja_id', 'almacen_id'])]
#[Hidden(['password', 'remember_token'])]
class User extends Authenticatable implements JWTSubject
{
    use Auditable;

    /** Nombre del módulo en la bitácora de auditoría. */
    protected string $auditarModulo = 'Usuario';
    /** @use HasFactory<UserFactory> */
    use HasFactory, Notifiable, HasRoles;

    protected $guard_name = 'web';

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
        ];
    }

    public function getJWTIdentifier(): mixed
    {
        return $this->getKey();
    }

    public function getJWTCustomClaims(): array
    {
        return [];
    }

    public function empresa()
    {
        return $this->belongsTo(Empresa::class);
    }

    public function caja()
    {
        return $this->belongsTo(Caja::class);
    }

    /** El almacén (sucursal) donde trabaja: solo ahí vende y opera. Super Admin no lleva uno. */
    public function almacen()
    {
        return $this->belongsTo(Almacen::class);
    }

    /** ¿Opera en todos los almacenes sin restricción? */
    public function esSuperAdmin(): bool
    {
        return $this->hasRole(config('permisos.super_admin'));
    }

    /** Permisos que se le concedieron a esta persona por encima de sus roles. */
    public function excepciones()
    {
        return $this->hasMany(PermisoExcepcion::class);
    }
}
