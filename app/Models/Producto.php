<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Storage;

class Producto extends Model
{
    protected $table = 'productos';

    protected $fillable = [
        'codigo',
        'codigo_barras',
        'nombre',
        'descripcion_ticket',
        'marca_id',
        'sub_marca_id',
        'categoria_id',
        'sub_categoria_id',
        'unidad_medida_id',
        'unidad_compra_id',
        'unidad_base_id',
        'factor_compra_base',
        'descripcion',
        'imagen',
        'ficha_tecnica',
        'accion_tecnica',
        // Ficha técnica de tela (todo opcional).
        'composicion',
        'ancho_cm',
        'gramaje',
        'tipo_tejido',
        'elasticidad',
        'encogimiento',
        'minimo_compra',
        'usos',
        'propiedades',
        'cuidados',
        'precio_base',
        'stock_minimo',
        'stock_maximo',
        'activo',
    ];

    protected $appends = ['imagen_url'];

    /** URL pública de la foto del producto, o null si no tiene. */
    public function getImagenUrlAttribute(): ?string
    {
        if (! $this->imagen || ! Storage::disk('public')->exists($this->imagen)) {
            return null;
        }

        return Storage::disk('public')->url($this->imagen);
    }

    /**
     * Siguiente código correlativo (PROD001, PROD002…) para cuando no se envía
     * uno. Toma el mayor número usado con ese prefijo y avanza hasta encontrar
     * uno libre, por si hay huecos o códigos escritos a mano.
     */
    public static function generarCodigo(string $prefijo = 'PROD'): string
    {
        $ultimo = static::where('codigo', 'like', $prefijo.'%')
            ->orderByRaw('LENGTH(codigo) DESC, codigo DESC')
            ->value('codigo');

        $n = (int) preg_replace('/\D/', '', (string) $ultimo);

        do {
            $n++;
            $codigo = $prefijo.str_pad((string) $n, 3, '0', STR_PAD_LEFT);
        } while (static::where('codigo', $codigo)->exists());

        return $codigo;
    }

    protected function casts(): array
    {
        return [
            'precio_base' => 'decimal:4',
            'factor_compra_base' => 'decimal:2',
            'stock_minimo' => 'decimal:2',
            'stock_maximo' => 'decimal:2',
            'activo' => 'boolean',
        ];
    }

    public function marca() { return $this->belongsTo(Marca::class); }
    public function subMarca() { return $this->belongsTo(SubMarca::class); }
    public function categoria() { return $this->belongsTo(Categoria::class); }
    public function subCategoria() { return $this->belongsTo(Categoria::class, 'sub_categoria_id'); }
    public function unidadMedida() { return $this->belongsTo(UnidadMedida::class); }
    public function unidadCompra() { return $this->belongsTo(UnidadMedida::class, 'unidad_compra_id'); }
    public function unidadBase() { return $this->belongsTo(UnidadMedida::class, 'unidad_base_id'); }

    public function presentaciones() { return $this->hasMany(ProductoPresentacion::class); }
    public function lotes() { return $this->hasMany(ProductoLote::class); }
    /** Gama de colores del muestrario. */
    public function colores() { return $this->hasMany(ProductoColor::class); }
    public function stocks() { return $this->hasMany(ProductoAlmacenStock::class); }
    public function movimientos() { return $this->hasMany(MovimientoInventario::class); }
}
