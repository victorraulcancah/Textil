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

#[Fillable(['name', 'dni', 'email', 'password', 'empresa_id', 'almacen_id'])]
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

    /** Sus cajas: una por cada almacén donde trabaja (una caja puede compartirse con otros usuarios, por turnos). */
    public function cajas()
    {
        return $this->belongsToMany(Caja::class, 'caja_usuario', 'usuario_id', 'caja_id')->withTimestamps();
    }

    /**
     * La caja con la que opera ahora: la que tiene en el almacén en que trabaja (o en el que se pida). null si en
     * ese almacén no tiene una.
     */
    public function cajaActual(?int $almacenId = null): ?Caja
    {
        $almacenId ??= \App\Support\AlmacenAcceso::propio();

        return $this->cajas()->where('cajas.activo', true)
            ->when($almacenId, fn ($q) => $q->where('cajas.almacen_id', $almacenId))
            ->first();
    }

    /** Los almacenes donde puede trabajar (el suyo y los de sus cajas); elige uno a la vez. */
    public function almacenes()
    {
        return $this->belongsToMany(Almacen::class, 'almacen_user')->withTimestamps();
    }

    /** Ids de los almacenes donde puede trabajar, el principal incluido. */
    public function almacenesIds(): array
    {
        return collect($this->almacenes()->pluck('almacenes.id'))
            ->when($this->almacen_id, fn ($c) => $c->push((int) $this->almacen_id))
            ->map(fn ($id) => (int) $id)->unique()->values()->all();
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
