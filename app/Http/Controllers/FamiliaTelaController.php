<?php

namespace App\Http\Controllers;

use App\Models\FamiliaTela;
use Illuminate\Http\Request;

/** Familias de tela (poliéster, algodón...): el primer tramo del código de una tela. */
class FamiliaTelaController extends Controller
{
    public function index()
    {
        return FamiliaTela::withCount('tipos')->orderBy('codigo')->get();
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'nombre' => 'required|string|max:100',
            'codigo' => 'nullable|string|size:2|unique:familias_tela,codigo',
            'activo' => 'boolean',
        ]);

        $data['codigo'] = $data['codigo'] ?? FamiliaTela::generarCodigo();

        return response()->json(FamiliaTela::create($data), 201);
    }

    // El parámetro de ruta se llama "familias_tela" (Laravel no singulariza
    // un nombre que ya termina en vocal, igual que otros recursos compuestos
    // del proyecto).
    public function update(Request $request, FamiliaTela $familias_tela)
    {
        $data = $request->validate([
            'nombre' => 'required|string|max:100',
            'activo' => 'boolean',
        ]);

        $familias_tela->update($data);

        return response()->json($familias_tela);
    }

    public function destroy(FamiliaTela $familias_tela)
    {
        if ($familias_tela->tipos()->exists()) {
            return response()->json([
                'message' => "\"{$familias_tela->nombre}\" tiene tipos de tela registrados: elimínalos primero.",
            ], 409);
        }

        $familias_tela->delete();

        return response()->json(['message' => 'Familia eliminada']);
    }
}
