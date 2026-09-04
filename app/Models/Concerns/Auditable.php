<?php

namespace App\Models\Concerns;

use App\Models\Auditoria;

/**
 * Deja constancia en la bitácora cada vez que el modelo se crea, se edita o se
 * elimina. Se usa poniendo `use Auditable;` en el modelo.
 *
 * Cada modelo puede afinar tres cosas:
 *
 *   protected array $auditarExcepto = ['stock_actual'];  // campos ruidosos
 *   protected string $auditarModulo = 'Nota de venta';   // nombre legible
 *   public function auditarDescripcion(): string { ... } // cómo se identifica
 */
trait Auditable
{
    /** Campos que nunca se guardan en la bitácora, en ningún modelo. */
    private const NUNCA = ['password', 'remember_token', 'created_at', 'updated_at'];

    public static function bootAuditable(): void
    {
        static::created(function ($modelo) {
            Auditoria::registrar('creo', $modelo->datosAuditoria() + [
                'despues' => $modelo->limpiarAuditoria($modelo->getAttributes()),
            ]);
        });

        static::updated(function ($modelo) {
            $cambios = $modelo->limpiarAuditoria($modelo->getChanges());

            // Si solo cambió algo excluido (o nada), no se registra: la
            // bitácora se llenaría de entradas vacías.
            if ($cambios === []) {
                return;
            }

            $antes = array_intersect_key($modelo->getOriginal(), $cambios);

            Auditoria::registrar('actualizo', $modelo->datosAuditoria() + [
                'antes' => $modelo->limpiarAuditoria($antes),
                'despues' => $cambios,
            ]);
        });

        static::deleted(function ($modelo) {
            Auditoria::registrar('elimino', $modelo->datosAuditoria() + [
                'antes' => $modelo->limpiarAuditoria($modelo->getOriginal()),
            ]);
        });
    }

    /** Módulo y registro al que apunta la entrada. */
    protected function datosAuditoria(): array
    {
        return [
            'auditable_type' => static::class,
            'auditable_id' => $this->getKey(),
            'modulo' => $this->auditarModulo ?? class_basename($this),
            'descripcion' => $this->auditarDescripcion(),
        ];
    }

    /**
     * Cómo se identifica este registro en la bitácora. Se toma el primer campo
     * con nombre reconocible; los modelos pueden sobrescribirlo.
     */
    public function auditarDescripcion(): string
    {
        foreach (['documento', 'numero_compra', 'correlativo', 'codigo', 'nombre', 'razon_social', 'name'] as $campo) {
            if (! empty($this->{$campo})) {
                return (string) $this->{$campo};
            }
        }

        return '#'.$this->getKey();
    }

    /** Quita los campos excluidos y recorta valores demasiado largos. */
    protected function limpiarAuditoria(array $valores): array
    {
        $excluidos = array_merge(self::NUNCA, $this->auditarExcepto ?? []);

        return collect($valores)
            ->except($excluidos)
            ->map(fn ($v) => is_string($v) && mb_strlen($v) > 500 ? mb_substr($v, 0, 500).'…' : $v)
            ->all();
    }
}
