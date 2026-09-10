<?php

namespace App\Http\Controllers;

use App\Models\Importacion;
use Illuminate\Http\Request;

/**
 * Los embarques. No hay alta manual: se abren solos al escribir su código en
 * la recepción de compra, que es el momento en que alguien los conoce.
 *
 * Esta pantalla sirve para consultarlos y para completarles el documento o la
 * fecha cuando llega el papeleo, siempre después de la mercadería.
 */
class ImportacionController extends Controller
{
    public function index(Request $request)
    {
        $importaciones = Importacion::with('proveedor:id,nombre')
            ->withCount('rollos')
            ->withSum('rollos', 'metros_actual')
            ->when($request->filled('buscar'), function ($q) use ($request) {
                $texto = $request->input('buscar');
                $q->where(fn ($sub) => $sub
                    ->where('codigo', 'like', "%{$texto}%")
                    ->orWhere('documento', 'like', "%{$texto}%"));
            })
            ->latest('id')
            ->get();

        return response()->json($importaciones);
    }

    public function show(Importacion $importacione)
    {
        return response()->json(
            $importacione->load([
                'proveedor:id,nombre',
                'rollos.producto:id,codigo,nombre',
                'rollos.color:id,nombre,codigo,hex',
                'rollos.almacen:id,nombre',
            ])
        );
    }

    public function update(Request $request, Importacion $importacione)
    {
        $data = $request->validate([
            'codigo' => 'required|string|max:60|unique:importaciones,codigo,'.$importacione->id,
            'proveedor_id' => 'nullable|exists:proveedores,id',
            'fecha_llegada' => 'nullable|date',
            'documento' => 'nullable|string|max:100',
            'observaciones' => 'nullable|string',
        ]);

        $importacione->update($data);

        return response()->json($importacione->load('proveedor:id,nombre'));
    }
}
