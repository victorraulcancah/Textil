<?php

namespace App\Http\Controllers;

use App\Models\SolicitudCompra;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class SolicitudCompraController extends Controller
{
    public function index()
    {
        return response()->json(
            SolicitudCompra::withCount('detalles')->latest('id')->get()
        );
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'codigo' => 'required|string|max:50|unique:solicitudes_compra,codigo',
            'estado' => 'nullable|string|max:50',
            'observaciones' => 'nullable|string',
            'detalles' => 'required|array|min:1',
            'detalles.*.producto_presentacion_id' => 'required|exists:producto_presentaciones,id',
            'detalles.*.cantidad_solicitada' => 'required|numeric|min:0.01',
        ]);

        $solicitud = DB::transaction(function () use ($data) {
            $solicitud = SolicitudCompra::create([
                'codigo' => $data['codigo'],
                'estado' => $data['estado'] ?? 'pendiente',
                'observaciones' => $data['observaciones'] ?? null,
                'fecha_solicitud' => now(),
                'usuario_solicita_id' => auth()->id(),
            ]);

            foreach ($data['detalles'] as $detalle) {
                $solicitud->detalles()->create([
                    'producto_presentacion_id' => $detalle['producto_presentacion_id'],
                    'cantidad_solicitada' => $detalle['cantidad_solicitada'],
                ]);
            }

            return $solicitud;
        });

        return response()->json($solicitud->load('detalles.presentacion.producto'), 201);
    }

    public function show(SolicitudCompra $solicitudesCompra)
    {
        return response()->json($solicitudesCompra->load('detalles.presentacion.producto'));
    }

    public function update(Request $request, SolicitudCompra $solicitudesCompra)
    {
        $data = $request->validate([
            'estado' => 'nullable|string|max:50',
            'observaciones' => 'nullable|string',
        ]);
        $solicitudesCompra->update($data);
        return response()->json($solicitudesCompra);
    }

    public function destroy(SolicitudCompra $solicitudesCompra)
    {
        $solicitudesCompra->delete();
        return response()->json(['message' => 'Eliminado']);
    }
}
