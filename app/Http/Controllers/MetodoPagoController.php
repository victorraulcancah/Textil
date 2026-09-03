<?php

namespace App\Http\Controllers;

use App\Models\MetodoPago;
use Illuminate\Http\JsonResponse;

class MetodoPagoController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(
            MetodoPago::where('activo', true)
                ->orderBy('es_sistema', 'desc')
                ->orderBy('nombre')
                ->get(['id', 'nombre', 'tipo', 'es_sistema', 'requiere_cuenta_bancaria', 'requiere_tarjeta', 'requiere_numero_operacion', 'requiere_captura', 'activo'])
        );
    }
}
