<?php

namespace App\Http\Controllers;

use App\Models\TipoPrecio;
use Illuminate\Http\Request;

/**
 * Los tipos de precio: Minorista, Mayorista… El principal no se elimina ni se
 * desactiva: es el precio de siempre, el que usan los clientes sin tipo.
 */
class TipoPrecioController extends Controller
{
    public function index()
    {
        return response()->json(
            TipoPrecio::withCount(['precios', 'clientes'])
                ->orderByDesc('principal')->orderBy('orden')->orderBy('nombre')
                ->get()
        );
    }

    /** Los activos, para elegir el de un cliente (lo ve quien ve clientes). */
    public function opciones()
    {
        return response()->json(
            TipoPrecio::where('activo', true)
                ->orderByDesc('principal')->orderBy('orden')->orderBy('nombre')
                ->get(['id', 'nombre', 'principal'])
        );
    }

    public function store(Request $request)
    {
        $data = $this->validar($request);
        $data['orden'] = (int) TipoPrecio::max('orden') + 1;

        return response()->json(TipoPrecio::create($data), 201);
    }

    public function update(Request $request, TipoPrecio $tipoPrecio)
    {
        $data = $this->validar($request, $tipoPrecio);

        // El principal siempre está activo: sin él no hay precio de base.
        if ($tipoPrecio->principal) {
            $data['activo'] = true;
        }

        $tipoPrecio->update($data);

        return response()->json($tipoPrecio->fresh());
    }

    /**
     * Si ya tiene precios cargados o clientes, se desactiva en lugar de
     * borrarse: borrarlo se llevaría esos precios.
     */
    public function destroy(TipoPrecio $tipoPrecio)
    {
        if ($tipoPrecio->principal) {
            return response()->json(['message' => 'El tipo de precio principal no se puede eliminar.'], 422);
        }

        if ($tipoPrecio->precios()->exists() || $tipoPrecio->clientes()->exists()) {
            $tipoPrecio->update(['activo' => false]);

            return response()->json(['desactivado' => true, 'message' => 'Estaba en uso: se desactivó.']);
        }

        $tipoPrecio->delete();

        return response()->json(['message' => 'Eliminado']);
    }

    private function validar(Request $request, ?TipoPrecio $tipo = null): array
    {
        return $request->validate([
            'nombre' => 'required|string|max:60|unique:tipos_precio,nombre'.($tipo ? ','.$tipo->id : ''),
            // % de ganancia sugerido sobre el costo.
            'margen' => 'nullable|numeric|min:0|max:1000',
            'activo' => 'boolean',
        ], [
            'nombre.required' => 'Escribe el nombre del tipo de precio.',
            'nombre.unique' => 'Ya existe un tipo de precio con ese nombre.',
        ]);
    }
}
