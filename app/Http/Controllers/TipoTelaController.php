<?php

namespace App\Http\Controllers;

use App\Models\TipoTela;
use Illuminate\Http\Request;

/** Tipos de tela dentro de una familia (Trenza, dentro de Poliéster). */
class TipoTelaController extends Controller
{
    public function index(Request $request)
    {
        return TipoTela::with('familia')
            ->when($request->filled('familia_tela_id'), fn ($q) => $q->where('familia_tela_id', $request->familia_tela_id))
            ->withCount('productos')
            ->orderBy('codigo')
            ->get();
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'familia_tela_id' => 'required|exists:familias_tela,id',
            'nombre' => 'required|string|max:150',
            'codigo' => 'nullable|string|size:3',
            'activo' => 'boolean',
        ]);

        $data['codigo'] = $data['codigo'] ?? TipoTela::generarCodigo($data['familia_tela_id']);

        $existe = TipoTela::where('familia_tela_id', $data['familia_tela_id'])
            ->where('codigo', $data['codigo'])->exists();
        if ($existe) {
            return response()->json(['message' => 'Ese código ya existe en esta familia.'], 422);
        }

        $tipo = TipoTela::create($data);

        return response()->json($tipo->load('familia'), 201);
    }

    // El parámetro de ruta se llama "tipos_tela" (mismo criterio que
    // "familias_tela": Laravel no lo singulariza porque termina en vocal).
    public function update(Request $request, TipoTela $tipos_tela)
    {
        $data = $request->validate([
            'nombre' => 'required|string|max:150',
            'activo' => 'boolean',
        ]);

        $tipos_tela->update($data);

        return response()->json($tipos_tela->load('familia'));
    }

    public function destroy(TipoTela $tipos_tela)
    {
        if ($tipos_tela->productos()->exists()) {
            return response()->json([
                'message' => "\"{$tipos_tela->nombre}\" ya tiene telas registradas: no se puede eliminar.",
            ], 409);
        }

        $tipos_tela->delete();

        return response()->json(['message' => 'Tipo de tela eliminado']);
    }
}
