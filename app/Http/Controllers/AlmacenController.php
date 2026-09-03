<?php

namespace App\Http\Controllers;

use App\Models\Almacen;
use App\Models\ProductoAlmacenStock;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class AlmacenController extends Controller
{
    /**
     * Documentos que dejan historial en un almacén: [tabla, columna, etiqueta].
     * Si alguno existe, el almacén no se puede borrar — se desactiva.
     * Se comprueba con Schema porque algunas columnas se quitaron por migración
     * (p. ej. cajas.almacen_id) y no deben romper la verificación.
     */
    private const DEPENDENCIAS = [
        ['movimientos_inventario', 'almacen_id', 'movimiento(s) de inventario'],
        ['notas_venta', 'almacen_id', 'nota(s) de venta'],
        ['ajustes_inventario', 'almacen_id', 'ajuste(s) de inventario'],
        ['tomas_inventario', 'almacen_id', 'toma(s) de inventario'],
        ['recepciones_compra', 'almacen_id', 'recepción(es) de compra'],
        ['devoluciones_proveedor', 'almacen_id', 'devolución(es) a proveedor'],
        ['prestamos', 'almacen_id', 'préstamo(s)'],
        ['series_documento', 'almacen_id', 'serie(s) de documento'],
        ['transferencias', 'almacen_origen_id', 'traslado(s) de salida'],
        ['transferencias', 'almacen_destino_id', 'traslado(s) de entrada'],
        ['cajas', 'almacen_id', 'caja(s)'],
    ];

    public function __construct()
    {
    }

    public function index()
    {
        return response()->json(Almacen::latest('id')->get());
    }

    /**
     * Existencias (stock de productos) por almacén.
     * Si viene `almacen_id`, filtra; si no, devuelve todas ("Todos").
     */
    public function existencias(Request $request)
    {
        $query = ProductoAlmacenStock::with([
            'producto:id,codigo,codigo_barras,nombre,categoria_id,marca_id,precio_base,unidad_base_id,unidad_medida_id,stock_minimo,stock_maximo,activo',
            'producto.categoria:id,nombre',
            'producto.marca:id,nombre',
            'producto.unidadBase:id,nombre,abreviatura',
            'producto.unidadMedida:id,nombre,abreviatura',
            // Para poder expresar el stock en cada unidad derivada.
            'producto.presentaciones:id,producto_id,nombre,factor_conversion,precio_venta,precio_compra,activo',
            'almacen:id,nombre',
        ]);

        if ($request->filled('almacen_id')) {
            $query->where('almacen_id', $request->integer('almacen_id'));
        }

        // Lo último cargado primero, igual que en el resto de listados.
        return response()->json($query->latest('id')->get());
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'nombre' => 'required|string|max:255',
            'codigo' => 'required|string|max:50|unique:almacenes,codigo',
            'tipo' => 'nullable|string|max:50',
            'direccion' => 'nullable|string|max:500',
            'activo' => 'boolean',
        ]);
        return response()->json(Almacen::create($data), 201);
    }

    public function show(Almacen $almacene)
    {
        return response()->json($almacene);
    }

    public function update(Request $request, Almacen $almacene)
    {
        $data = $request->validate([
            'nombre' => 'required|string|max:255',
            'codigo' => 'required|string|max:50|unique:almacenes,codigo,' . $almacene->id,
            'tipo' => 'nullable|string|max:50',
            'direccion' => 'nullable|string|max:500',
            'activo' => 'boolean',
        ]);
        $almacene->update($data);
        return response()->json($almacene);
    }

    /**
     * Eliminar y desactivar son cosas distintas: un almacén con historial no se
     * borra nunca (perdería la trazabilidad y rompería las claves foráneas), se
     * desactiva. Solo se elimina el que está realmente vacío.
     */
    public function destroy(Almacen $almacene)
    {
        $motivos = $this->motivosParaNoEliminar($almacene);

        if ($motivos) {
            return response()->json([
                'message' => 'Este almacén no se puede eliminar porque ya tiene movimientos registrados. Desactívalo para dejar de usarlo sin perder su historial.',
                'motivos' => $motivos,
                'puede_desactivar' => (bool) $almacene->activo,
            ], 409);
        }

        try {
            DB::transaction(function () use ($almacene) {
                // Filas de stock en cero: no son historial, se limpian con el almacén.
                $almacene->stocks()->delete();
                $almacene->delete();
            });
        } catch (QueryException $e) {
            // Red de seguridad por si alguna tabla nueva apunta al almacén y no
            // está en DEPENDENCIAS: mejor un aviso claro que un error 500.
            if ($e->getCode() !== '23000') {
                throw $e;
            }

            return response()->json([
                'message' => 'Este almacén no se puede eliminar porque hay registros que dependen de él. Desactívalo para dejar de usarlo sin perder su historial.',
                'motivos' => [],
                'puede_desactivar' => (bool) $almacene->activo,
            ], 409);
        }

        return response()->json(['message' => 'Almacén eliminado.']);
    }

    /** Lista legible de lo que impide borrar el almacén; vacía si está libre. */
    private function motivosParaNoEliminar(Almacen $almacene): array
    {
        $motivos = [];

        foreach (self::DEPENDENCIAS as [$tabla, $columna, $etiqueta]) {
            if (! Schema::hasTable($tabla) || ! Schema::hasColumn($tabla, $columna)) {
                continue;
            }

            $n = DB::table($tabla)->where($columna, $almacene->id)->count();
            if ($n > 0) {
                $motivos[] = "$n $etiqueta";
            }
        }

        $conStock = $almacene->stocks()
            ->where(fn ($q) => $q->where('stock_actual', '!=', 0)->orWhere('stock_reservado', '!=', 0))
            ->count();

        if ($conStock > 0) {
            $motivos[] = "$conStock producto(s) con stock";
        }

        return $motivos;
    }
}
