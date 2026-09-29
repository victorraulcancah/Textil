<?php

namespace App\Http\Controllers;

use App\Services\TipoCambioService;
use Illuminate\Http\Request;

class TipoCambioController extends Controller
{
    public function __construct(protected TipoCambioService $tiposCambio) {}

    /**
     * El que vale para una fecha (hoy si no se dice): el SUNAT, que se trae
     * solo la primera vez que se pide en el día, y el comercial de ese día si
     * ya se cobró con uno. Lo usan la venta, el pedido y los cobros, por eso
     * no pide permiso.
     */
    public function dia(Request $request)
    {
        $request->validate(['fecha' => 'nullable|date']);

        return response()->json($this->tiposCambio->para($request->input('fecha')));
    }
}
