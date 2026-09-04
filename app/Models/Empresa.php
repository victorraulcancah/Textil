<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Storage;

class Empresa extends Model
{
    protected $appends = ['logo_url'];

    protected $fillable = [
        'ruc',
        'razon_social',
        'nombre_comercial',
        'direccion',
        'departamento',
        'provincia',
        'distrito',
        'ciudad',
        'telefono',
        'email',
        'web',
        'logo',
        'activa',
    ];

    protected function casts(): array
    {
        return [
            'activa' => 'boolean',
        ];
    }

    public function users()
    {
        return $this->hasMany(User::class);
    }

    /**
     * Empresa activa que se usa como marca global (login, panel, favicon).
     */
    public static function activa(): ?self
    {
        return static::where('activa', true)->orderBy('id')->first();
    }

    /**
     * Logo para los PDF: ruta física y tamaño ya ajustado a una caja máxima.
     * dompdf ignora max-width/max-height (sobre todo con SVG), así que hay que
     * darle width/height explícitos conservando la proporción de la imagen.
     *
     * @return array{ruta: string, ancho: int, alto: int}|null
     */
    public function logoPdf(int $maxAncho = 145, int $maxAlto = 54): ?array
    {
        if (!$this->logo) {
            return null;
        }
        $ruta = public_path('storage/' . ltrim($this->logo, '/'));
        if (!is_file($ruta)) {
            return null;
        }

        $esSvg = str_ends_with(strtolower($ruta), '.svg');
        [$w, $h] = $esSvg ? $this->dimensionesSvg($ruta) : $this->dimensionesRaster($ruta);
        if ($w <= 0 || $h <= 0) {
            [$w, $h] = [$maxAncho, $maxAlto];
        }

        $escala = min($maxAncho / $w, $maxAlto / $h);
        // Un raster pequeño no se agranda (se vería pixelado); el SVG sí puede.
        if (!$esSvg) {
            $escala = min($escala, 1);
        }

        $ancho = max(1, (int) round($w * $escala));
        $alto = max(1, (int) round($h * $escala));

        // El motor SVG de dompdf no escala de forma fiable: el SVG se rasteriza
        // a PNG (ImageMagick, con caché). Si no se puede, no hay logo en el PDF
        // y la cabecera cae a la marca de texto.
        if ($esSvg) {
            $ruta = $this->svgAPng($ruta, $ancho, $alto);
            if (!$ruta) {
                return null;
            }
        }

        return ['ruta' => $ruta, 'ancho' => $ancho, 'alto' => $alto];
    }

    /** PNG cacheado del SVG, a 3x del tamaño final para que no se vea pixelado. */
    private function svgAPng(string $ruta, int $ancho, int $alto): ?string
    {
        $destino = storage_path('app/pdf-logos/' . md5($ruta . filemtime($ruta)) . "-{$ancho}x{$alto}.png");
        if (is_file($destino)) {
            return $destino;
        }
        if (!is_dir(dirname($destino))) {
            mkdir(dirname($destino), 0775, true);
        }
        [$px, $py] = [$ancho * 3, $alto * 3];

        // 1) Extensión Imagick.
        if (class_exists(\Imagick::class)) {
            try {
                $im = new \Imagick();
                $im->setBackgroundColor(new \ImagickPixel('transparent'));
                $im->setResolution(288, 288);
                $im->readImage($ruta);
                $im->setImageFormat('png32');
                $im->resizeImage($px, $py, \Imagick::FILTER_LANCZOS, 1, true);
                $im->writeImage($destino);
                $im->clear();
                if (is_file($destino)) {
                    return $destino;
                }
            } catch (\Throwable) {
                // se intenta con la CLI
            }
        }

        // 2) CLI de ImageMagick (`magick`), si está en el PATH.
        $cmd = sprintf(
            'magick -background none -density 288 %s -resize %dx%d %s 2>&1',
            escapeshellarg($ruta),
            $px,
            $py,
            escapeshellarg($destino),
        );
        @exec($cmd, $salida, $codigo);

        return $codigo === 0 && is_file($destino) ? $destino : null;
    }

    /** Ancho/alto de un SVG: atributos width/height, o el viewBox si no los tiene. */
    private function dimensionesSvg(string $ruta): array
    {
        $xml = @simplexml_load_file($ruta);
        if (!$xml) {
            return [0, 0];
        }
        $attr = $xml->attributes();
        $num = static function ($v): float {
            return preg_match('/^\s*([\d.]+)\s*(px)?\s*$/i', (string) $v, $m) ? (float) $m[1] : 0.0;
        };
        $w = $num($attr['width'] ?? '');
        $h = $num($attr['height'] ?? '');
        if (($w <= 0 || $h <= 0) && isset($attr['viewBox'])) {
            $vb = preg_split('/[\s,]+/', trim((string) $attr['viewBox']));
            if (count($vb) === 4) {
                [$w, $h] = [(float) $vb[2], (float) $vb[3]];
            }
        }

        return [$w, $h];
    }

    /** Ancho/alto de un PNG/JPG. */
    private function dimensionesRaster(string $ruta): array
    {
        $info = @getimagesize($ruta);

        return $info ? [(float) $info[0], (float) $info[1]] : [0, 0];
    }

    /**
     * URL pública del logo. Si la empresa no tiene logo subido,
     * cae al logo por defecto del sistema en /public/img/logo-telas.svg.
     */
    public function getLogoUrlAttribute(): string
    {
        if ($this->logo && Storage::disk('public')->exists($this->logo)) {
            return Storage::disk('public')->url($this->logo);
        }

        return asset('img/logo-telas.svg');
    }

    /**
     * URL para el favicon: usa el logo subido de la empresa si existe,
     * si no, el ícono compacto del proyecto.
     */
    public function getFaviconUrlAttribute(): string
    {
        if ($this->logo && Storage::disk('public')->exists($this->logo)) {
            return Storage::disk('public')->url($this->logo);
        }

        return asset('img/logo-telas-icon.svg');
    }
}
