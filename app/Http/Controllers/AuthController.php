<?php

namespace App\Http\Controllers;

use App\Http\Requests\Auth\LoginRequest;
use App\Http\Requests\Auth\RegisterRequest;
use App\Models\Auditoria;
use App\Models\User;
use Illuminate\Http\JsonResponse;

class AuthController extends Controller
{
    public function login(LoginRequest $request): JsonResponse
    {
        if (!$token = auth('api')->attempt($request->validated())) {
            return response()->json(['error' => 'Credenciales inválidas'], 401);
        }

        Auditoria::registrar('inicio_sesion', ['modulo' => 'Sesión']);

        return $this->respondWithToken($token);
    }

    /** Datos del usuario y sus permisos, para la respuesta del login. */
    private function usuarioConPermisos(): array
    {
        $user = auth('api')->user()->load('empresa', 'roles');

        return $user->toArray() + ['permisos' => $this->permisosDe($user)];
    }

    public function register(RegisterRequest $request): JsonResponse
    {
        $user = User::create($request->validated());
        $user->assignRole('user');

        $token = auth('api')->login($user);

        return $this->respondWithToken($token);
    }

    public function me(): JsonResponse
    {
        $user = auth('api')->user()->load('empresa', 'roles');

        return response()->json(
            $user->toArray() + ['permisos' => $this->permisosDe($user)],
        );
    }

    /**
     * Permisos efectivos del usuario, para que la interfaz oculte lo que no
     * puede usar. El rol de administración los recibe todos.
     */
    private function permisosDe(User $user): array
    {
        if ($user->hasRole(config('permisos.super_admin'))) {
            return \App\Support\Permisos::todos();
        }

        return $user->getAllPermissions()->pluck('name')->all();
    }

    public function logout(): JsonResponse
    {
        // Antes de cerrar: después ya no hay usuario del que dejar constancia.
        Auditoria::registrar('cerro_sesion', ['modulo' => 'Sesión']);

        auth('api')->logout();

        return response()->json(['message' => 'Sesión cerrada exitosamente']);
    }

    public function refresh(): JsonResponse
    {
        return $this->respondWithToken(auth('api')->refresh());
    }

    protected function respondWithToken(string $token): JsonResponse
    {
        return response()->json([
            'access_token' => $token,
            'token_type' => 'bearer',
            'expires_in' => auth('api')->factory()->getTTL() * 60,
            // Con sus permisos: la interfaz los usa para ocultar lo que el
            // usuario no puede abrir.
            'user' => $this->usuarioConPermisos(),
        ]);
    }
}
