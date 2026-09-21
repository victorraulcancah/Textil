<?php

namespace App\Http\Controllers;

use App\Models\Proveedor;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ProveedorController extends Controller
{
    public function __construct()
    {
    }

    /**
     * Deja los datos como se guardan: el código corto en mayúsculas y el
     * documento solo donde tiene sentido. Un proveedor extranjero se identifica
     * por Tax ID (no lleva tipo de documento) y "sin documento" no lleva número.
     */
    private function normalizar(array $data): array
    {
        $data['codigo_corto'] = ($data['codigo_corto'] ?? null) ? strtoupper($data['codigo_corto']) : null;

        if (($data['tipo'] ?? 'nacional') === 'extranjero') {
            $data['tipo_documento'] = null;
        }

        if (($data['tipo_documento'] ?? null) === 'SIN') {
            $data['ruc'] = null;
        }

        if (($data['tipo_documento'] ?? null) === 'CE' && ! empty($data['ruc'])) {
            $data['ruc'] = strtoupper($data['ruc']);
        }

        return $data;
    }

    public function index()
    {
        return response()->json(Proveedor::latest('id')->get());
    }

    /** El largo del documento se dice según el tipo elegido, no siempre "RUC". */
    private function mensajes(): array
    {
        return [
            'ruc.digits' => request('tipo_documento') === 'DNI'
                ? 'El DNI debe tener 8 dígitos.'
                : 'El RUC debe tener 11 dígitos.',
        ];
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
            // Documento de un proveedor nacional. Cada tipo tiene su largo: el RUC
            // son 11 dígitos y el DNI 8; el carné de extranjería es alfanumérico.
            'tipo_documento' => 'nullable|in:RUC,DNI,CE,SIN',
            'ruc' => [
                'nullable', 'string', 'max:12', "unique:proveedores,ruc{$excepto}",
                Rule::when(request('tipo_documento') === 'RUC', ['digits:11']),
                Rule::when(request('tipo_documento') === 'DNI', ['digits:8']),
            ],
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
        $data = $this->normalizar($request->validate($this->reglas(), $this->mensajes()));

        return response()->json(Proveedor::create($data), 201);
    }

    public function show(Proveedor $proveedore)
    {
        return response()->json($proveedore);
    }

    public function update(Request $request, Proveedor $proveedore)
    {
        $data = $this->normalizar($request->validate($this->reglas($proveedore->id), $this->mensajes()));

        $proveedore->update($data);
        return response()->json($proveedore);
    }

    public function destroy(Proveedor $proveedore)
    {
        $proveedore->delete();
        return response()->json(['message' => 'Eliminado']);
    }
}
