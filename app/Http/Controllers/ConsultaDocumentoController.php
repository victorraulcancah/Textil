<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Http;

/**
 * Consulta RUC (SUNAT) y DNI (RENIEC) vía apisperu.com para autocompletar los
 * formularios de cliente, usuario y empresa. El token vive en el servidor
 * (config/services.php) y nunca llega al navegador.
 */
class ConsultaDocumentoController extends Controller
{
    public function ruc(string $ruc): JsonResponse
    {
        if (!preg_match('/^\d{11}$/', $ruc)) {
            return response()->json(['message' => 'El RUC debe tener 11 dígitos'], 422);
        }

        $d = $this->consultar("ruc/{$ruc}");
        if (!$d) {
            return response()->json(['message' => 'No se encontró el RUC'], 404);
        }

        return response()->json([
            'ruc' => $d['ruc'] ?? $ruc,
            'razon_social' => $d['razonSocial'] ?? null,
            'nombre_comercial' => $d['nombreComercial'] ?? null,
            'direccion' => $d['direccion'] ?? null,
            'departamento' => $d['departamento'] ?? null,
            'provincia' => $d['provincia'] ?? null,
            'distrito' => $d['distrito'] ?? null,
            'estado' => $d['estado'] ?? null,
            'condicion' => $d['condicion'] ?? null,
            'telefono' => $d['telefonos'][0] ?? null,
        ]);
    }

    public function dni(string $dni): JsonResponse
    {
        if (!preg_match('/^\d{8}$/', $dni)) {
            return response()->json(['message' => 'El DNI debe tener 8 dígitos'], 422);
        }

        $d = $this->consultar("dni/{$dni}");
        if (!$d) {
            return response()->json(['message' => 'No se encontró el DNI'], 404);
        }

        $nombres = trim($d['nombres'] ?? '');
        $paterno = trim($d['apellidoPaterno'] ?? '');
        $materno = trim($d['apellidoMaterno'] ?? '');

        return response()->json([
            'dni' => $d['dni'] ?? $dni,
            'nombres' => $nombres,
            'apellido_paterno' => $paterno,
            'apellido_materno' => $materno,
            'nombre_completo' => trim("{$nombres} {$paterno} {$materno}"),
        ]);
    }

    /** Llama a la API; devuelve el arreglo de datos o null si no hay resultado. */
    private function consultar(string $recurso): ?array
    {
        $token = config('services.apisperu.token');
        if (!$token) {
            abort(500, 'Falta configurar APISPERU_TOKEN en .env');
        }

        try {
            $res = Http::timeout(12)
                ->acceptJson()
                ->get(rtrim(config('services.apisperu.url'), '/') . '/' . $recurso, ['token' => $token]);
        } catch (\Throwable) {
            abort(503, 'El servicio de consulta no responde');
        }

        if (!$res->ok()) {
            return null;
        }

        $data = $res->json();
        // La API responde {success:false, message} cuando no existe el documento.
        if (!is_array($data) || (isset($data['success']) && $data['success'] === false)) {
            return null;
        }

        return $data;
    }
}
