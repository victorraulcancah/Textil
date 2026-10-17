<?php

namespace App\Http\Controllers;

use App\Models\Anticipo;
use App\Services\AnticipoService;
use App\Support\AlmacenAcceso;
use Illuminate\Http\Request;

/** Anticipos de clientes, en soles o en dólares. */
class AnticipoController extends Controller
{
    private const RELACIONES = [
        'cliente:id,nombre',
        'usuario:id,name',
        'almacen:id,nombre',
        'cuentaBancaria:id,alias,numero_cuenta',
        'billetera:id,nombre',
    ];

    public function __construct(private readonly AnticipoService $anticipos) {}

    public function index(Request $request)
    {
        $filtros = $request->validate([
            'cliente_id' => 'nullable|integer',
            'estado' => 'nullable|in:vigente,anulado',
            'moneda' => 'nullable|in:PEN,USD',
            // Solo los que tienen saldo por aplicar.
            'con_saldo' => 'nullable|boolean',
            // Con `con_saldo`: además estos (separados por coma), aunque ya no tengan saldo: los que una venta en edición usa.
            'incluir' => 'nullable|string|max:200',
        ]);
        $incluir = array_filter(array_map('intval', explode(',', (string) ($filtros['incluir'] ?? ''))));

        // Compartidos: el anticipo es del cliente y se ve (y se aplica) desde cualquier almacén; el almacén es donde
        // entró el dinero en caja. Anularlo o corregirlo sí exige acceso a ese almacén.
        $consulta = Anticipo::query()
            ->with(self::RELACIONES)
            ->when($filtros['cliente_id'] ?? null, fn ($q, $v) => $q->where('cliente_id', $v))
            ->when($filtros['estado'] ?? null, fn ($q, $v) => $q->where('estado', $v))
            ->when($filtros['moneda'] ?? null, fn ($q, $v) => $q->where('moneda', $v))
            ->when(! empty($filtros['con_saldo']), fn ($q) => $q->where(
                fn ($w) => $w->where(fn ($v) => $v->where('estado', Anticipo::VIGENTE)->whereColumn('monto_aplicado', '<', 'monto'))
                    ->orWhereIn('id', $incluir),
            ));

        return response()->json($consulta->latest('id')->limit(1000)->get());
    }

    public function show(Anticipo $anticipo)
    {
        return response()->json($anticipo->load(self::RELACIONES));
    }

    public function store(Request $request)
    {
        $datos = $request->validate([
            'cliente_id' => 'required|exists:clientes,id',
            // El día en que el cliente entregó el dinero: cualquiera hasta hoy, nunca uno futuro.
            'fecha' => 'nullable|date|before_or_equal:today',
            'moneda' => 'required|in:PEN,USD',
            'monto' => 'required|numeric|min:0.01',
            'forma_pago' => 'required|in:efectivo,transferencia,billetera',
            'cuenta_bancaria_id' => 'nullable|exists:cuentas_bancarias,id',
            'billetera_id' => 'nullable|exists:billeteras_digitales,id',
            'referencia' => 'nullable|string|max:100',
            'observaciones' => 'nullable|string|max:255',
        ]);

        $anticipo = $this->anticipos->registrar($datos);

        return response()->json($anticipo->load(self::RELACIONES), 201);
    }

    /** Corrige el día, la referencia y las observaciones (el monto y el método no se tocan: se anula y se registra otro). */
    public function update(Request $request, Anticipo $anticipo)
    {
        AlmacenAcceso::exigir($anticipo->almacen_id);

        $datos = $request->validate([
            'fecha' => 'nullable|date|before_or_equal:today',
            'referencia' => 'nullable|string|max:100',
            'observaciones' => 'nullable|string|max:255',
        ]);

        return response()->json($this->anticipos->actualizar($anticipo, $datos)->load(self::RELACIONES));
    }

    public function anular(Request $request, Anticipo $anticipo)
    {
        AlmacenAcceso::exigir($anticipo->almacen_id);

        $datos = $request->validate(['motivo' => 'nullable|string|max:200']);

        return response()->json($this->anticipos->anular($anticipo, $datos['motivo'] ?? null)->load(self::RELACIONES));
    }
}
