<?php

namespace App\Support;

use Illuminate\Support\Facades\Cache;

/**
 * Lee el árbol de config/permisos.php y lo traduce a lo que necesitan las
 * demás piezas: la lista de permisos, el árbol para la pantalla de roles y
 * qué permiso protege cada ruta de la API.
 */
class Permisos
{
    /**
     * Acciones de un submódulo: las que declare o las básicas, más "imprimir"
     * si tiene documentos PDF.
     */
    public static function accionesDe(array $submodulo): array
    {
        $acciones = $submodulo['acciones'] ?? config('permisos.acciones_base');

        if (! empty($submodulo['pdf'])) {
            $acciones[] = 'imprimir';
        }

        return $acciones;
    }

    /**
     * Todos los nombres de permiso: ['ventas.clientes.ver', …].
     *
     * @return list<string>
     */
    public static function todos(): array
    {
        $lista = [];

        foreach (config('permisos.modulos') as $modulo => $datos) {
            foreach ($datos['submodulos'] as $sub => $subDatos) {
                foreach (self::accionesDe($subDatos) as $accion) {
                    $lista[] = "{$modulo}.{$sub}.{$accion}";
                }
            }
        }

        return $lista;
    }

    /**
     * El árbol con etiquetas, para pintar la pantalla de roles.
     *
     * [['key' => 'ventas', 'label' => 'Ventas', 'submodulos' => [
     *     ['key' => 'ventas.clientes', 'label' => 'Clientes',
     *      'acciones' => [['permiso' => 'ventas.clientes.ver', 'label' => 'Ver'], …]]]]]
     */
    public static function arbol(): array
    {
        $etiquetas = config('permisos.acciones');
        $arbol = [];

        foreach (config('permisos.modulos') as $modulo => $datos) {
            $submodulos = [];

            foreach ($datos['submodulos'] as $sub => $subDatos) {
                $acciones = [];
                foreach (self::accionesDe($subDatos) as $accion) {
                    $acciones[] = [
                        'permiso' => "{$modulo}.{$sub}.{$accion}",
                        'accion' => $accion,
                        'label' => $etiquetas[$accion] ?? $accion,
                    ];
                }

                $submodulos[] = [
                    'key' => "{$modulo}.{$sub}",
                    'label' => $subDatos['label'],
                    'acciones' => $acciones,
                ];
            }

            $arbol[] = [
                'key' => $modulo,
                'label' => $datos['label'],
                'submodulos' => $submodulos,
            ];
        }

        return $arbol;
    }

    /**
     * Prefijo de ruta → submódulo. Se cachea porque se consulta en cada
     * petición: ['clientes' => 'ventas.clientes', …].
     *
     * @return array<string, string>
     */
    public static function rutas(): array
    {
        return Cache::rememberForever('permisos.rutas', function () {
            $mapa = [];

            foreach (config('permisos.modulos') as $modulo => $datos) {
                foreach ($datos['submodulos'] as $sub => $subDatos) {
                    foreach ($subDatos['apis'] ?? [] as $api) {
                        $mapa[$api] = "{$modulo}.{$sub}";
                    }
                }
            }

            // Las rutas más específicas primero: "reportes/ganancias" debe
            // ganarle a "reportes" si algún día existe.
            uksort($mapa, fn ($a, $b) => substr_count($b, '/') <=> substr_count($a, '/'));

            return $mapa;
        });
    }

    /**
     * Permiso que exige una petición, o null si la ruta no está protegida
     * (login, consultas de apoyo, PDF…).
     */
    public static function paraPeticion(string $uri, string $metodo): ?string
    {
        $ruta = ltrim(preg_replace('#^api/#', '', $uri), '/');

        // Los PDF son su propia acción: "pdf/nota-venta/12" exige el permiso
        // de imprimir del submódulo dueño de ese documento.
        if (str_starts_with($ruta, 'pdf/')) {
            $tipo = explode('/', $ruta)[1] ?? null;
            $submodulo = self::documentos()[$tipo] ?? null;

            return $submodulo ? $submodulo.'.imprimir' : null;
        }

        foreach (self::rutas() as $api => $submodulo) {
            if ($ruta === $api || str_starts_with($ruta, $api.'/')) {
                return $submodulo.'.'.self::accionDe($metodo);
            }
        }

        return null;
    }

    /**
     * Tipo de documento PDF → submódulo que lo imprime:
     * ['nota-venta' => 'ventas.notas-venta', …].
     *
     * @return array<string, string>
     */
    public static function documentos(): array
    {
        return Cache::rememberForever('permisos.documentos', function () {
            $mapa = [];

            foreach (config('permisos.modulos') as $modulo => $datos) {
                foreach ($datos['submodulos'] as $sub => $subDatos) {
                    foreach ($subDatos['pdf'] ?? [] as $tipo) {
                        $mapa[$tipo] = "{$modulo}.{$sub}";
                    }
                }
            }

            return $mapa;
        });
    }

    /** Qué acción representa cada método HTTP. */
    private static function accionDe(string $metodo): string
    {
        return match (strtoupper($metodo)) {
            'POST' => 'crear',
            'PUT', 'PATCH' => 'editar',
            'DELETE' => 'eliminar',
            default => 'ver',
        };
    }
}
