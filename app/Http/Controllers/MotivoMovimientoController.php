<?php

namespace App\Http\Controllers;

use App\Models\MotivoMovimiento;
use Illuminate\Http\Request;

class MotivoMovimientoController extends Controller
{
    public function index(Request $request)
    {
        $query = MotivoMovimiento::query();

        if ($request->filled('ambito')) {
            $query->where('ambito', $request->string('ambito'));
        }
        if ($request->filled('tipo')) {
            $query->where('tipo', $request->string('tipo'));
        }

        return response()->json($query->orderBy('tipo')->orderBy('id')->get());
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'nombre' => 'required|string|max:255',
            'tipo' => 'required|string|in:entrada,salida',
            'categoria_gasto' => 'nullable|in:operativo,compra,no_operativo',
            'activo' => 'boolean',
        ]);
        $data['ambito'] = $request->input('ambito', 'caja');
        return response()->json(MotivoMovimiento::create($data), 201);
    }

    public function show(MotivoMovimiento $motivosMovimiento)
    {
        return response()->json($motivosMovimiento);
    }

    public function update(Request $request, MotivoMovimiento $motivosMovimiento)
    {
        if ($motivosMovimiento->es_sistema) {
            return response()->json(['message' => 'Los motivos del sistema no se pueden editar.'], 422);
        }

        $data = $request->validate([
            'nombre' => 'required|string|max:255',
            'tipo' => 'required|string|in:entrada,salida',
            'categoria_gasto' => 'nullable|in:operativo,compra,no_operativo',
            'activo' => 'boolean',
        ]);
        $motivosMovimiento->update($data);
        return response()->json($motivosMovimiento);
    }

    public function destroy(MotivoMovimiento $motivosMovimiento)
    {
        if ($motivosMovimiento->es_sistema) {
            return response()->json(['message' => 'Los motivos del sistema no se pueden eliminar.'], 422);
        }

        $motivosMovimiento->delete();
        return response()->json(['message' => 'Eliminado']);
    }
}
