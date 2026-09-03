<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Spatie\Permission\Models\Role;

class RoleController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(
            Role::where('guard_name', 'web')->orderBy('name')->get(['id', 'name', 'guard_name'])
        );
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => 'required|string|max:255|unique:roles,name',
        ]);

        $role = Role::create(['name' => $data['name'], 'guard_name' => 'web']);

        return response()->json($role, 201);
    }

    public function show(int $id): JsonResponse
    {
        $role = Role::where('guard_name', 'web')->findOrFail($id);

        return response()->json($role->only(['id', 'name', 'guard_name']));
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $role = Role::where('guard_name', 'web')->findOrFail($id);

        $data = $request->validate([
            'name' => 'required|string|max:255|unique:roles,name,' . $role->id,
        ]);

        $role->update(['name' => $data['name']]);

        return response()->json($role->only(['id', 'name', 'guard_name']));
    }

    public function destroy(int $id): JsonResponse
    {
        Role::where('guard_name', 'web')->findOrFail($id)->delete();

        return response()->json(['message' => 'Rol eliminado']);
    }
}
