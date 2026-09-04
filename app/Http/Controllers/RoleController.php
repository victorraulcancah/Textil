<?php

namespace App\Http\Controllers;

use App\Support\Permisos;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

class RoleController extends Controller
{
    public function index(): JsonResponse
    {
        $roles = Role::where('guard_name', 'web')
            ->with('permissions:id,name')
            ->orderBy('name')
            ->get(['id', 'name', 'guard_name']);

        return response()->json(
            $roles->map(fn ($rol) => $this->comoArreglo($rol)),
        );
    }

    /**
     * El árbol de módulos → submódulos → acciones que pinta la pantalla.
     * Va aquí y no en su propia ruta porque solo lo usa esta pantalla.
     */
    public function arbolPermisos(): JsonResponse
    {
        return response()->json([
            'arbol' => Permisos::arbol(),
            'super_admin' => config('permisos.super_admin'),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => 'required|string|max:255|unique:roles,name',
            'permisos' => 'nullable|array',
            'permisos.*' => 'string',
        ], [
            'name.required' => 'El nombre del rol es obligatorio',
            'name.unique' => 'Ya existe un rol con ese nombre',
        ]);

        $role = Role::create(['name' => $data['name'], 'guard_name' => 'web']);

        // Un rol nuevo nace con todos los permisos: se le quitan los que no
        // deba tener, en vez de tener que dárselos uno por uno.
        $role->syncPermissions(
            $this->permisosValidos($data['permisos'] ?? Permisos::todos()),
        );

        return response()->json($this->comoArreglo($role->load('permissions:id,name')), 201);
    }

    public function show(int $id): JsonResponse
    {
        $role = Role::where('guard_name', 'web')->with('permissions:id,name')->findOrFail($id);

        return response()->json($this->comoArreglo($role));
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $role = Role::where('guard_name', 'web')->findOrFail($id);

        $data = $request->validate([
            'name' => 'required|string|max:255|unique:roles,name,'.$role->id,
            'permisos' => 'nullable|array',
            'permisos.*' => 'string',
        ], [
            'name.required' => 'El nombre del rol es obligatorio',
            'name.unique' => 'Ya existe un rol con ese nombre',
        ]);

        $role->update(['name' => $data['name']]);

        if ($request->has('permisos')) {
            // El rol de administración no se puede limitar: si se le quitan
            // permisos, nadie podría volver a otorgarlos.
            if ($role->name === config('permisos.super_admin')) {
                return response()->json([
                    'message' => 'El rol de administración siempre conserva todos los permisos.',
                ], 422);
            }

            $role->syncPermissions($this->permisosValidos($data['permisos'] ?? []));
        }

        app(PermissionRegistrar::class)->forgetCachedPermissions();

        return response()->json($this->comoArreglo($role->load('permissions:id,name')));
    }

    public function destroy(int $id): JsonResponse
    {
        $role = Role::where('guard_name', 'web')->findOrFail($id);

        if ($role->name === config('permisos.super_admin')) {
            return response()->json([
                'message' => 'El rol de administración no se puede eliminar.',
            ], 422);
        }

        if ($role->users()->exists()) {
            return response()->json([
                'message' => 'No se puede eliminar un rol que tiene usuarios asignados.',
            ], 422);
        }

        $role->delete();

        return response()->json(['message' => 'Rol eliminado']);
    }

    /** Solo permisos que existen en el árbol: descarta nombres inventados. */
    private function permisosValidos(array $permisos): array
    {
        $delArbol = array_intersect($permisos, Permisos::todos());

        return Permission::where('guard_name', 'web')
            ->whereIn('name', $delArbol)
            ->pluck('name')
            ->all();
    }

    private function comoArreglo(Role $rol): array
    {
        return [
            'id' => $rol->id,
            'name' => $rol->name,
            'guard_name' => $rol->guard_name,
            'es_super_admin' => $rol->name === config('permisos.super_admin'),
            'usuarios_count' => $rol->users()->count(),
            'permisos' => $rol->permissions->pluck('name')->all(),
        ];
    }
}
