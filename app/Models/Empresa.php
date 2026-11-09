<?php

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Storage;

class Empresa extends Model
{
    use Auditable;

    /** Nombre del módulo en la bitácora de auditoría. */
    protected string $auditarModulo = 'Empresa';
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
     * La empresa en uso: la marcada como activa (solo una a la vez). De ella salen el logo y los datos del menú, el login, el
     * favicon y todos los PDF.
     */
    public static function activa(): ?self
    {
        return static::where('activa', true)->orderBy('id')->first();
    }

    /** La empresa en uso o, si ninguna está marcada, la primera: nunca hay un PDF o un menú sin empresa si existe alguna. */
    public static function enUso(): ?self
    {
        return static::activa() ?? static::orderBy('id')->first();
    }

    /** Deja a esta empresa como la única en uso: las demás se desmarcan (cada una con su registro en la bitácora). */
    public function marcarEnUso(): void
    {
        static::where('id', '!=', $this->id)->where('activa', true)->get()->each->update(['activa' => false]);

        if (! $this->activa) {
            $this->update(['activa' => true]);
        }
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

        // Sin los márgenes en blanco: así el logo ocupa su caja y no se ve chico.
        if ($recortado = $this->logoRecortado()) {
            $ruta = $recortado;
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

    /**
     * El logo (PNG/JPG/WebP) sin los bordes en blanco o transparentes que suelen traer las imágenes: se recorta a lo que se
     * ve, con un poco de aire, y se guarda aparte (el original no se toca). Así un logo casi cuadrado con mucho margen no sale
     * diminuto en el login, el menú y los PDF. El SVG no se recorta (su caja ya viene en el archivo).
     *
     * @return string|null ruta relativa en el disco público (empresas/recortados/…), o null si no hace falta recortar
     */
    public function logoRecortadoRelativo(): ?string
    {
        if (!$this->logo || !Storage::disk('public')->exists($this->logo)) {
            return null;
        }
        if (!preg_match('/\.(png|jpe?g|webp)$/i', $this->logo) || !function_exists('imagecreatefromstring')) {
            return null;
        }

        $origen = Storage::disk('public')->path($this->logo);
        $relativo = 'empresas/recortados/' . md5($this->logo . filemtime($origen)) . '.png';

        // Ya recortado antes (o ya visto que no hace falta: se deja una marca vacía).
        if (Storage::disk('public')->exists($relativo)) {
            return Storage::disk('public')->size($relativo) > 0 ? $relativo : null;
        }

        $guardado = $this->recortarBordes($origen, Storage::disk('public')->path($relativo));
        if (!$guardado) {
            Storage::disk('public')->put($relativo, '');
        }

        return $guardado ? $relativo : null;
    }

    /** Ruta física del logo recortado, o null si no se recorta. */
    public function logoRecortado(): ?string
    {
        $relativo = $this->logoRecortadoRelativo();

        return $relativo ? Storage::disk('public')->path($relativo) : null;
    }

    /**
     * Recorta los bordes que son transparentes o casi blancos. Devuelve false si no hay nada que recortar (el logo ya llena su
     * imagen) o si no se pudo leer.
     */
    private function recortarBordes(string $origen, string $destino): bool
    {
        $im = @imagecreatefromstring((string) @file_get_contents($origen));
        if (!$im) {
            return false;
        }

        $w = imagesx($im);
        $h = imagesy($im);
        // Se mira un píxel de cada tantos en imágenes grandes: basta para encontrar los bordes.
        $paso = max(1, (int) floor(max($w, $h) / 600));
        [$minX, $minY, $maxX, $maxY] = [$w, $h, -1, -1];

        for ($y = 0; $y < $h; $y += $paso) {
            for ($x = 0; $x < $w; $x += $paso) {
                $c = imagecolorat($im, $x, $y);
                $alfa = ($c >> 24) & 0x7F; // 0 = opaco, 127 = transparente
                $r = ($c >> 16) & 0xFF;
                $g = ($c >> 8) & 0xFF;
                $b = $c & 0xFF;
                $esFondo = $alfa > 100 || ($r >= 242 && $g >= 242 && $b >= 242);
                if (!$esFondo) {
                    $minX = min($minX, $x);
                    $maxX = max($maxX, $x);
                    $minY = min($minY, $y);
                    $maxY = max($maxY, $y);
                }
            }
        }

        // Sin contenido, o el contenido ya llena casi toda la imagen: no hay nada que ajustar.
        if ($maxX < 0 || (($maxX - $minX + 1) >= $w * 0.94 && ($maxY - $minY + 1) >= $h * 0.94)) {
            imagedestroy($im);

            return false;
        }

        // Un poco de aire alrededor, para que no quede pegado al borde.
        $aire = (int) round(max($maxX - $minX, $maxY - $minY) * 0.04);
        $x0 = max(0, $minX - $aire);
        $y0 = max(0, $minY - $aire);
        $x1 = min($w - 1, $maxX + $aire);
        $y1 = min($h - 1, $maxY + $aire);

        $nuevo = imagecreatetruecolor($x1 - $x0 + 1, $y1 - $y0 + 1);
        imagealphablending($nuevo, false);
        imagesavealpha($nuevo, true);
        imagefill($nuevo, 0, 0, imagecolorallocatealpha($nuevo, 255, 255, 255, 127));
        imagecopy($nuevo, $im, 0, 0, $x0, $y0, $x1 - $x0 + 1, $y1 - $y0 + 1);

        if (!is_dir(dirname($destino))) {
            mkdir(dirname($destino), 0775, true);
        }
        $ok = imagepng($nuevo, $destino);
        imagedestroy($im);
        imagedestroy($nuevo);

        return $ok && is_file($destino);
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
            // El logo sin márgenes en blanco, si los tenía.
            return Storage::disk('public')->url($this->logoRecortadoRelativo() ?? $this->logo);
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
            return Storage::disk('public')->url($this->logoRecortadoRelativo() ?? $this->logo);
        }

        return asset('img/logo-telas-icon.svg');
    }
}
