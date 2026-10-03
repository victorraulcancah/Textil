<?php

namespace App\Http\Controllers;

use App\Http\Requests\User\AssignRoleRequest;
use App\Http\Requests\User\StoreUserRequest;
use App\Http\Requests\User\UpdateUserRequest;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Spatie\Permission\Models\Role;

class UserController extends Controller
{
    public function __construct()
    {
    }

    public function index(): JsonResponse
    {
        return response()->json(User::with('empresa', 'cajas:id,usuario_id,almacen_id,codigo,nombre', 'almacen:id,nombre,numero_serie', 'almacenes:id,nombre,numero_serie', 'roles')->latest('id')->get());
    }

    /**
     * Lista liviana para pickers (ej. "ejecutivo comercial" al crear un
     * cliente): solo id y nombre, sin permiso de gestión de usuarios —
     * cualquiera que pueda crear el registro que lo usa debe poder elegir
     * a quién asignárselo, no solo un administrador.
     */
    public function selector(): JsonResponse
    {
        return response()->json(User::orderBy('name')->get(['id', 'name']));
    }

    public function store(StoreUserRequest $request): JsonResponse
    {
        $data = $request->validated();
        $roles = $this->rolesDe($data);
        unset($data['role'], $data['roles']);

        $user = DB::transaction(function () use ($data, $roles) {
            $user = User::create($data);

            if ($roles) {
                $user->syncRoles($roles);
            }

            return $user;
        });

        $this->incluirAlmacenPrincipal($user);

        return response()->json($user->load('empresa', 'cajas:id,usuario_id,almacen_id,codigo,nombre', 'almacen:id,nombre,numero_serie', 'almacenes:id,nombre,numero_serie', 'roles'), 201);
    }

    /** Su almacén principal siempre está entre los que puede usar. */
    private function incluirAlmacenPrincipal(User $user): void
    {
        if ($user->almacen_id) {
            $user->almacenes()->syncWithoutDetaching([$user->almacen_id]);
        }
    }

    public function show(int $id): JsonResponse
    {
        return response()->json(User::with('empresa', 'cajas:id,usuario_id,almacen_id,codigo,nombre', 'almacen:id,nombre,numero_serie', 'almacenes:id,nombre,numero_serie', 'roles')->findOrFail($id));
    }

    public function update(UpdateUserRequest $request, int $id): JsonResponse
    {
        $user = User::findOrFail($id);
        $data = $request->validated();
        $roles = $this->rolesDe($data);
        unset($data['role'], $data['roles']);

        DB::transaction(function () use ($user, $data, $roles) {
            if (!empty($data)) {
                $user->update($data);
            }

            $this->incluirAlmacenPrincipal($user);

            // Sus permisos son la unión de los de todos sus roles.
            if ($roles) {
                $user->syncRoles($roles);
            }
        });

        return response()->json($user->load('empresa', 'cajas:id,usuario_id,almacen_id,codigo,nombre', 'almacen:id,nombre,numero_serie', 'almacenes:id,nombre,numero_serie', 'roles'));
    }

    public function destroy(int $id): JsonResponse
    {
        User::findOrFail($id)->delete();

        return response()->json(null, 204);
    }

    public function assignRole(AssignRoleRequest $request, int $id): JsonResponse
    {
        $user = User::findOrFail($id);
        $user->assignRole($request->role);

        return response()->json($user->load('roles'));
    }

    /**
     * Los roles que llegan: la lista `roles` o, por compatibilidad, el `role`
     * único. El primero es el principal.
     *
     * @return list<string>
     */
    private function rolesDe(array $data): array
    {
        $roles = $data['roles'] ?? (isset($data['role']) ? [$data['role']] : []);

        return array_values(array_unique($roles));
    }

    public function roles(): JsonResponse
    {
        return response()->json(Role::all()->pluck('name'));
    }
}
