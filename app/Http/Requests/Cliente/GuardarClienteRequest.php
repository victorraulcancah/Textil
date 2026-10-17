<?php

namespace App\Http\Requests\Cliente;

use App\Models\Cliente;
use App\Models\ClienteDireccion;
use App\Models\LineaCredito;
use App\Support\Permisos;
use Illuminate\Contracts\Validation\Validator;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Crear o editar un cliente (con sus direcciones y su línea de crédito): lo que se acepta y quién puede aprobar crédito.
 * La misma regla sirve para los dos casos: al editar, el cliente llega por la ruta.
 */
class GuardarClienteRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        /** @var Cliente|null $cliente */
        $cliente = $this->route('cliente');

        return [
            'codigo' => ['nullable', 'string', 'max:20', Rule::unique('clientes', 'codigo')->ignore($cliente?->id)],
            'nombre' => ($cliente ? 'sometimes|' : '').'required|string|max:255',
            'tipo_documento' => 'nullable|string|max:20',
            'numero_documento' => 'nullable|string|max:20',
            'telefono' => 'nullable|string|max:20',
            'email' => 'nullable|email|max:255',
            'zona' => 'nullable|string|max:100',
            'actividad_comercial_id' => 'nullable|exists:actividades_comerciales,id',
            'categoria_comercial_id' => 'nullable|exists:categorias_comerciales,id',
            'tipo_cliente' => ['sometimes', Rule::in(Cliente::TIPOS_CLIENTE)],
            'ejecutivo_id' => 'nullable|exists:users,id',
            // A qué precio se le vende; sin uno, al principal.
            'tipo_precio_id' => 'nullable|exists:tipos_precio,id',
            'activo' => 'boolean',

            'direcciones' => 'sometimes|array',
            'direcciones.*.id' => 'nullable|integer',
            'direcciones.*.tipo' => ['required', Rule::in(ClienteDireccion::TIPOS)],
            'direcciones.*.predeterminada' => 'sometimes|boolean',
            'direcciones.*.direccion' => 'required|string|max:255',
            'direcciones.*.referencia' => 'nullable|string|max:255',
            'direcciones.*.pais' => 'nullable|string|max:60',
            'direcciones.*.departamento' => 'nullable|string|max:60',
            'direcciones.*.provincia' => 'nullable|string|max:60',
            'direcciones.*.distrito' => 'nullable|string|max:80',
            'direcciones.*.ubigeo' => 'nullable|digits:6|exists:ubigeos,ubigeo',
            'direcciones.*.codigo_postal' => 'nullable|string|max:10',

            // La línea de crédito viaja con el cliente; null la quita.
            'linea_credito' => 'sometimes|nullable|array',
            'linea_credito.moneda' => 'required_with:linea_credito|in:PEN,USD',
            'linea_credito.limite' => 'required_with:linea_credito|numeric|min:0',
            'linea_credito.fecha_aprobacion' => 'nullable|date',
            'linea_credito.vigente_hasta' => 'nullable|date',
            'linea_credito.activa' => 'boolean',
            'linea_credito.condicion_venta' => ['required_with:linea_credito', Rule::in([LineaCredito::CONTADO, LineaCredito::CREDITO])],
            'linea_credito.dias_credito' => 'nullable|integer|min:0|max:720',
            'linea_credito.dias_gracia' => 'nullable|integer|min:0|max:365',
            'linea_credito.ampliacion_tipo' => ['nullable', Rule::in([LineaCredito::AMPLIACION_IMPORTE, LineaCredito::AMPLIACION_PORCENTAJE])],
            'linea_credito.ampliacion_valor' => 'nullable|numeric|min:0',
            'linea_credito.ampliacion_hasta' => 'nullable|date',
            'linea_credito.observaciones' => 'nullable|string|max:2000',
        ];
    }

    public function messages(): array
    {
        return [
            'codigo.unique' => 'Ya hay otro cliente con ese código.',
            'direcciones.*.direccion.required' => 'Escribe la dirección.',
            'direcciones.*.ubigeo.digits' => 'El ubigeo tiene 6 dígitos.',
            'direcciones.*.ubigeo.exists' => 'Ese ubigeo no existe.',
            'linea_credito.limite.required_with' => 'Pon el límite de la línea de crédito.',
        ];
    }

    /** Lo que ya pasó las reglas simples: quién aprueba crédito y que las direcciones no se contradigan. */
    public function after(): array
    {
        return [
            function (Validator $validator) {
                if ($validator->errors()->isNotEmpty()) {
                    return;
                }

                // Cuánto se le fía lo decide quien aprueba crédito, no cualquiera que edite los datos del cliente.
                if (array_key_exists('linea_credito', $this->all()) && ! Permisos::puede($this->user(), 'ventas.clientes.linea_credito')) {
                    abort(403, 'No tienes permiso para aprobar líneas de crédito.');
                }

                $this->rechazarDocumentoRepetido();

                $direcciones = collect($this->input('direcciones', []));
                if ($direcciones->where('tipo', ClienteDireccion::FISCAL)->count() > 1) {
                    throw ValidationException::withMessages(['direcciones' => 'Solo puede haber una dirección fiscal.']);
                }
                if ($direcciones->filter(fn ($d) => ! empty($d['predeterminada']))->count() > 1) {
                    throw ValidationException::withMessages(['direcciones' => 'Solo una dirección puede ser la predeterminada.']);
                }
            },
        ];
    }

    /**
     * Un documento (tipo + número) es de un solo cliente, esté activo o no. Si ya está registrado se responde con los datos de
     * ese cliente para que quien registra vea de quién se trata y no lo cree dos veces.
     */
    private function rechazarDocumentoRepetido(): void
    {
        $tipo = trim((string) $this->input('tipo_documento'));
        $numero = trim((string) $this->input('numero_documento'));
        if ($tipo === '' || $numero === '') {
            return;
        }

        $campos = ['id', 'codigo', 'nombre', 'tipo_documento', 'numero_documento', 'telefono', 'email', 'direccion', 'activo'];
        $existente = Cliente::query()
            ->where('tipo_documento', $tipo)
            ->where('numero_documento', $numero)
            ->when($this->route('cliente'), fn ($q, $cliente) => $q->whereKeyNot($cliente->id))
            ->first($campos);
        if (! $existente) {
            return;
        }

        $mensaje = "Ya existe un cliente con el {$tipo} {$numero}: {$existente->nombre}.";

        throw new HttpResponseException(response()->json([
            'message' => $mensaje,
            'errors' => ['numero_documento' => [$mensaje]],
            'cliente_existente' => $existente->only($campos),
        ], 422));
    }
}
