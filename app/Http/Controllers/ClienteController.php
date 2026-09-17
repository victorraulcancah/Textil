<?php

namespace App\Http\Controllers;

use App\Models\Cliente;
use Illuminate\Http\Request;

class ClienteController extends Controller
{
    public function index(Request $request)
    {
        $query = Cliente::with('ejecutivo:id,name')->where('activo', true);

        // Sin "ver todo", cada quien ve solo los clientes que tiene a cargo.
        // Los que no tienen ejecutivo asignado nadie los ve por esta vía —
        // hay que asignarlos primero— salvo quien sí tenga "ver todo".
        if (! $this->puedeVerTodo($request)) {
            $query->where('ejecutivo_id', $request->user()->id);
        }

        return response()->json($query->latest('id')->get());
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'nombre' => 'required|string|max:255',
            'tipo_documento' => 'nullable|string|max:20',
            'numero_documento' => 'nullable|string|max:20',
            'direccion' => 'nullable|string|max:255',
            'telefono' => 'nullable|string|max:20',
            'email' => 'nullable|email|max:255',
            'ejecutivo_id' => 'nullable|exists:users,id',
        ]);
        $cliente = Cliente::create($data);
        return response()->json($cliente->load('ejecutivo:id,name'), 201);
    }

    public function show(Cliente $cliente)
    {
        return response()->json($cliente->load('ejecutivo:id,name'));
    }

    public function update(Request $request, Cliente $cliente)
    {
        $data = $request->validate([
            'nombre' => 'string|max:255',
            'tipo_documento' => 'nullable|string|max:20',
            'numero_documento' => 'nullable|string|max:20',
            'direccion' => 'nullable|string|max:255',
            'telefono' => 'nullable|string|max:20',
            'email' => 'nullable|email|max:255',
            'ejecutivo_id' => 'nullable|exists:users,id',
            'activo' => 'boolean',
        ]);
        $cliente->update($data);
        return response()->json($cliente->load('ejecutivo:id,name'));
    }

    public function destroy(Cliente $cliente)
    {
        $cliente->update(['activo' => false]);
        return response()->json(['message' => 'Cliente desactivado correctamente']);
    }

    /** El super-admin y quien tenga el permiso "ver todo" ven la cartera completa. */
    private function puedeVerTodo(Request $request): bool
    {
        $user = $request->user();

        return $user->hasRole(config('permisos.super_admin')) || $user->can('ventas.clientes.ver_todo');
    }
}
