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

    private function reglas(?int $ignorarId = null): array
    {
        // Sin id (alta) la regla queda "unique:tabla,columna"; al editar se le
        // agrega ",id" para no chocar contra el propio registro.
        $excepto = $ignorarId ? ",{$ignorarId}" : '';

        return [
            'nombre' => 'required|string|max:255',
            // De esto depende qué campos pide el formulario: uno nacional se
            // identifica por RUC, uno extranjero por Tax ID.
            'tipo' => 'nullable|in:nacional,extranjero',
            'codigo' => "required|string|max:50|unique:proveedores,codigo{$excepto}",
            // Solo para armar el código de sus órdenes de compra (KET-001-26);
            // opcional porque no todos los proveedores emiten esa numeración.
            'codigo_corto' => "nullable|string|size:3|alpha_num|unique:proveedores,codigo_corto{$excepto}",
            'ruc' => "nullable|string|max:11|unique:proveedores,ruc{$excepto}",
            'tax_id' => 'nullable|string|max:50',
            'pais' => 'nullable|string|max:100',
            'direccion' => 'nullable|string|max:500',
            'telefono' => 'nullable|string|max:20',
            'fax' => 'nullable|string|max:30',
            'email' => 'nullable|email|max:255',
            'contacto_nombre' => 'nullable|string|max:255',
            'activo' => 'boolean',
        ];
    }

    public function store(Request $request)
    {
        $data = $request->validate($this->reglas());
        $data['codigo_corto'] = $data['codigo_corto'] ? strtoupper($data['codigo_corto']) : null;

        return response()->json(Proveedor::create($data), 201);
    }

    public function show(Proveedor $proveedore)
    {
        return response()->json($proveedore);
    }

    public function update(Request $request, Proveedor $proveedore)
    {
        $data = $request->validate($this->reglas($proveedore->id));
        $data['codigo_corto'] = $data['codigo_corto'] ? strtoupper($data['codigo_corto']) : null;

        $proveedore->update($data);
        return response()->json($proveedore);
    }

    public function destroy(Proveedor $proveedore)
    {
        $proveedore->delete();
        return response()->json(['message' => 'Eliminado']);
    }
}
