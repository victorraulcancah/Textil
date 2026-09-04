<?php

namespace App\Http\Controllers;

use App\Http\Requests\Empresa\StoreEmpresaRequest;
use App\Http\Requests\Empresa\UpdateEmpresaRequest;
use App\Models\Empresa;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Storage;

class EmpresaController extends Controller
{
    public function __construct()
    {
    }

    public function index(): JsonResponse
    {
        return response()->json(Empresa::with('users')->latest('id')->get());
    }

    public function store(StoreEmpresaRequest $request): JsonResponse
    {
        $data = $request->validated();
        unset($data['logo']);

        $empresa = Empresa::create($data);

        if ($request->hasFile('logo')) {
            $empresa->logo = $this->guardarLogo($request->file('logo'));
            $empresa->save();
        }

        return response()->json($empresa, 201);
    }

    public function show(int $id): JsonResponse
    {
        return response()->json(Empresa::with('users')->findOrFail($id));
    }

    public function update(UpdateEmpresaRequest $request, int $id): JsonResponse
    {
        $empresa = Empresa::findOrFail($id);
        $logoAnterior = $empresa->logo;

        $data = $request->validated();
        unset($data['logo']);
        $empresa->update($data);

        if ($request->hasFile('logo')) {
            if ($logoAnterior && Storage::disk('public')->exists($logoAnterior)) {
                Storage::disk('public')->delete($logoAnterior);
            }
            $empresa->logo = $this->guardarLogo($request->file('logo'));
            $empresa->save();
        }

        return response()->json($empresa->load('users'));
    }

    public function destroy(int $id): JsonResponse
    {
        Empresa::findOrFail($id)->delete();

        return response()->json(null, 204);
    }

    /**
     * Guarda el logo conservando su extensión real. `store()` deduce la
     * extensión del MIME detectado, y con un SVG puede quedar sin extensión
     * (el navegador entonces no lo muestra como imagen).
     */
    private function guardarLogo(\Illuminate\Http\UploadedFile $archivo): string
    {
        $ext = strtolower($archivo->getClientOriginalExtension() ?: 'png');
        $nombre = \Illuminate\Support\Str::uuid() . '.' . $ext;

        return $archivo->storeAs('empresas', $nombre, 'public');
    }

    /**
     * Datos de marca públicos (sin auth): logo y nombre para el login y el sidebar.
     */
    public function branding(): JsonResponse
    {
        $empresa = Empresa::activa() ?? Empresa::first();

        return response()->json([
            'nombre_comercial' => $empresa?->nombre_comercial,
            'logo_url' => $empresa?->logo_url ?? asset('img/logo-telas.svg'),
            'favicon_url' => $empresa?->favicon_url ?? asset('img/logo-telas-icon.svg'),
        ]);
    }
}
