<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;

class Proveedor extends Model
{
    use Auditable;

    /** Nombre del módulo en la bitácora de auditoría. */
    protected string $auditarModulo = 'Proveedor';
    protected $table = 'proveedores';

    protected $fillable = [
        'nombre',
        'codigo',
        // De eso depende qué campos pide el formulario: uno nacional se
        // identifica por RUC, uno extranjero por Tax ID.
        'tipo',
        // Código corto (3 caracteres) con el que el cliente arma su propia
        // numeración de orden de compra: KET-001-26.
        'codigo_corto',
        'ruc',
        // De qué documento es el número guardado en `ruc`: RUC, DNI, CE o SIN.
        'tipo_documento',
        // Identificador tributario del proveedor extranjero: no todos usan
        // RUC peruano.
        'tax_id',
        'pais',
        'direccion',
        'telefono',
        'fax',
        'email',
        'contacto_nombre',
        'activo',
    ];

    protected function casts(): array
    {
        return [
            'activo' => 'boolean',
        ];
    }

    public function ordenesCompra()
    {
        return $this->hasMany(OrdenCompra::class);
    }

    /** Prefijo del código automático: EXT- para extranjeros, NAC- para nacionales. */
    public static function prefijoDe(?string $tipo): string
    {
        return $tipo === 'extranjero' ? 'EXT-' : 'NAC-';
    }

    /**
     * Siguiente código libre de su tipo: EXT-1, EXT-2… o NAC-1, NAC-2…
     * No se reutiliza el de un proveedor borrado: se avanza desde el mayor.
     */
    public static function generarCodigo(?string $tipo): string
    {
        $prefijo = static::prefijoDe($tipo);

        $mayor = static::where('codigo', 'like', $prefijo.'%')
            ->pluck('codigo')
            ->map(fn ($c) => preg_match('/^'.preg_quote($prefijo, '/').'(\d+)$/', $c, $m) ? (int) $m[1] : 0)
            ->max() ?? 0;

        return $prefijo.($mayor + 1);
    }

    public function esExtranjero(): bool
    {
        return $this->tipo === 'extranjero';
    }
}
