<?php

namespace App\Http\Controllers;

use App\Models\Proveedor;
use Illuminate\Http\Request;

class ProveedorController extends Controller
{
    public function __construct()
    {
    }

    public function index()
    {
        return response()->json(Proveedor::latest('id')->get());
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'nombre' => 'required|string|max:255',
            'codigo' => 'required|string|max:50|unique:proveedores,codigo',
            'ruc' => 'nullable|string|max:11|unique:proveedores,ruc',
            'direccion' => 'nullable|string|max:500',
            'telefono' => 'nullable|string|max:20',
            'email' => 'nullable|email|max:255',
            'contacto_nombre' => 'nullable|string|max:255',
            'activo' => 'boolean',
        ]);
        return response()->json(Proveedor::create($data), 201);
    }

    public function show(Proveedor $proveedore)
    {
        return response()->json($proveedore);
    }

    public function update(Request $request, Proveedor $proveedore)
    {
        $data = $request->validate([
            'nombre' => 'required|string|max:255',
            'codigo' => 'required|string|max:50|unique:proveedores,codigo,' . $proveedore->id,
            'ruc' => 'nullable|string|max:11|unique:proveedores,ruc,' . $proveedore->id,
            'direccion' => 'nullable|string|max:500',
            'telefono' => 'nullable|string|max:20',
            'email' => 'nullable|email|max:255',
            'contacto_nombre' => 'nullable|string|max:255',
            'activo' => 'boolean',
        ]);
        $proveedore->update($data);
        return response()->json($proveedore);
    }

    public function destroy(Proveedor $proveedore)
    {
        $proveedore->delete();
        return response()->json(['message' => 'Eliminado']);
    }
}
