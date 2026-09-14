<?php

namespace App\Http\Controllers;

use App\Models\Almacen;
use App\Models\AlmacenUbicacion;
use Illuminate\Http\Request;

/**
 * El árbol de ubicaciones de un almacén: piso → pasillo → rack → nivel →
 * posición. No se reemplaza completo como los colores de un producto —cada
 * nodo puede tener rollos apuntándole—, así que se gestiona de a un nodo:
 * crear, renombrar, eliminar.
 */
class AlmacenUbicacionController extends Controller
{
    /** El árbol completo de un almacén, anidado. */
    public function index(Almacen $almacen)
    {
        $todas = $almacen->ubicaciones()->withCount('rollos')->orderBy('orden')->orderBy('nombre')->get();

        return response()->json($this->anidar($todas, null));
    }

    /** Arma el árbol en PHP: una sola consulta, en vez de una por nivel. */
    private function anidar($todas, ?int $padreId): array
    {
        return $todas->where('padre_id', $padreId)->map(fn ($nodo) => [
            'id' => $nodo->id,
            'tipo' => $nodo->tipo,
            'nombre' => $nodo->nombre,
            'orden' => $nodo->orden,
            'rollos_count' => $nodo->rollos_count,
            'hijos' => $this->anidar($todas, $nodo->id),
        ])->values()->all();
    }

    public function store(Request $request, Almacen $almacen)
    {
        $data = $request->validate([
            'padre_id' => 'nullable|exists:almacen_ubicaciones,id',
            'nombre' => 'required|string|max:60',
        ]);

        $padre = null;
        $tipo = AlmacenUbicacion::NIVELES[0]; // 'piso': la raíz, sin padre.

        if (! empty($data['padre_id'])) {
            $padre = AlmacenUbicacion::where('almacen_id', $almacen->id)->findOrFail($data['padre_id']);
            $tipo = $padre->tipoHijo();

            if (! $tipo) {
                return response()->json([
                    'message' => "\"{$padre->nombre}\" ya es posición: no admite más niveles debajo.",
                ], 422);
            }
        }

        $ubicacion = AlmacenUbicacion::create([
            'almacen_id' => $almacen->id,
            'padre_id' => $padre?->id,
            'tipo' => $tipo,
            'nombre' => $data['nombre'],
            'orden' => AlmacenUbicacion::where('almacen_id', $almacen->id)
                ->where('padre_id', $padre?->id)
                ->max('orden') + 1,
        ]);

        return response()->json($ubicacion, 201);
    }

    public function update(Request $request, AlmacenUbicacion $ubicacione)
    {
        $data = $request->validate(['nombre' => 'required|string|max:60']);
        $ubicacione->update($data);

        return response()->json($ubicacione);
    }

    /** Solo se borra si no tiene hijos ni rollos guardados ahí: si no, se pierde la trazabilidad. */
    public function destroy(AlmacenUbicacion $ubicacione)
    {
        if ($ubicacione->hijos()->exists()) {
            return response()->json([
                'message' => "\"{$ubicacione->nombre}\" tiene niveles debajo: elimínalos primero.",
            ], 409);
        }

        if ($ubicacione->rollos()->exists()) {
            return response()->json([
                'message' => "\"{$ubicacione->nombre}\" tiene rollos guardados ahí: muévelos antes de eliminarla.",
            ], 409);
        }

        $ubicacione->delete();

        return response()->json(['message' => 'Eliminada']);
    }
}
