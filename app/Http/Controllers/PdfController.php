<?php

namespace App\Http\Controllers;

use App\Pdf\PdfService;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Http\Request;

class PdfController extends Controller
{
    public function __construct(private PdfService $pdf)
    {
    }

    /**
     * GET /api/pdf/{tipo}/{id}?formato=a4|ticket&descargar=1
     * Genera el PDF de un documento. inline por defecto; descarga con ?descargar=1.
     */
    public function show(Request $request, string $tipo, int $id)
    {
        $documento = $this->pdf->documento($tipo);
        if (!$documento) {
            return response()->json(['message' => "Documento '$tipo' no soportado."], 404);
        }

        $formato = $request->query('formato', 'a4');

        try {
            $pdf = $this->pdf->generar($documento, $id, $formato);
        } catch (ModelNotFoundException) {
            return response()->json(['message' => 'El documento no existe.'], 404);
        }

        $archivo = $documento->archivo($id) . '.pdf';

        return $request->boolean('descargar')
            ? $pdf->download($archivo)
            : $pdf->stream($archivo);
    }
}
