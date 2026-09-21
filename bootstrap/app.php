<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        channels: __DIR__.'/../routes/channels.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // Comprueba los permisos del rol en cada petición de la API, según la
        // ruta y el método (config/permisos.php).
        $middleware->api(append: [
            \App\Http\Middleware\VerificarPermiso::class,
        ]);

        // Sin sesión y sin pedir JSON (p. ej. abrir una ruta de la API en la
        // barra de direcciones) se va al login del SPA, no a un error 500.
        $middleware->redirectGuestsTo('/login');
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*'),
        );

        // Las reglas de negocio se lanzan como DomainException desde los
        // servicios ("ese rollo ya no está disponible"). No son errores del
        // sistema: son avisos para el usuario, y viajan como un 422 igual que
        // los de validación, que es lo que el frontend ya sabe mostrar.
        //
        // Por lo mismo no se registran en el log: un rollo rechazado al
        // escanear es lo normal, no algo que revisar. Y así un log sin permisos
        // de escritura no convierte cada aviso en un error 500.
        $exceptions->dontReport(\DomainException::class);

        $exceptions->render(function (\DomainException $e, Request $request) {
            if ($request->is('api/*')) {
                return response()->json(['message' => $e->getMessage()], 422);
            }
        });
    })->create();
