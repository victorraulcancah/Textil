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
        $user = auth('api')->user()->load('empresa', 'roles', 'almacen:id,nombre,numero_serie');

        return $this->conAlmacenes($user) + ['permisos' => $this->permisosDe($user)];
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
        $user = auth('api')->user()->load('empresa', 'roles', 'almacen:id,nombre,numero_serie');

        return response()->json(
            $this->conAlmacenes($user) + ['permisos' => $this->permisosDe($user)],
        );
    }

    /**
     * El usuario con los almacenes donde puede trabajar (para elegir en el menú) y el id de la caja con la que opera
     * en el almacén actual.
     */
    private function conAlmacenes(User $user): array
    {
        $almacenes = \App\Models\Almacen::whereIn('id', $user->almacenesIds())->orderBy('id')->get(['id', 'nombre', 'numero_serie']);

        return $user->toArray() + ['almacenes' => $almacenes, 'caja_id' => $user->cajaActual()?->id];
    }

    /**
     * Permisos efectivos del usuario (todos sus roles más sus excepciones
     * vigentes), para que la interfaz oculte lo que no puede usar.
     */
    private function permisosDe(User $user): array
    {
        return \App\Support\Permisos::efectivos($user);
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
