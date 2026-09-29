<?php

namespace App\Http\Controllers;

use App\Models\Ubigeo;

class UbigeoController extends Controller
{
    /**
     * Todos los distritos del Perú para elegir departamento → provincia →
     * distrito. Van compactos, [ubigeo, departamento, provincia, distrito]:
     * son 1892 y el navegador los pide una sola vez.
     */
    public function index()
    {
        return response()->json(
            Ubigeo::orderBy('ubigeo')->get()
                ->map(fn (Ubigeo $u) => [$u->ubigeo, $u->departamento, $u->provincia, $u->distrito]),
        );
    }
}
