<?php

namespace App\Http\Controllers;

use App\Models\Proveedor;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Style\Alignment;
use PhpOffice\PhpSpreadsheet\Style\Fill;
use PhpOffice\PhpSpreadsheet\Style\NumberFormat;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;

/**
 * Carga masiva de proveedores desde Excel: la plantilla para llenar y la
 * importación. El código (EXT-1, NAC-1…) lo asigna el sistema, igual que al
 * crear uno solo; por eso la plantilla no lo pide.
 */
class ProveedorExcelController extends Controller
{
    /**
     * Columnas de la plantilla: clave interna => [cabecera, ancho, alias que se aceptan al leer].
     * La cabecera es la primera de cada lista; el resto son variantes de cómo
     * un cliente suele llamarla.
     */
    private const COLUMNAS = [
        'tipo' => ['Tipo', 14, ['tipo', 'tipo de proveedor']],
        'nombre' => ['Nombre', 38, ['nombre', 'razon social', 'razón social', 'proveedor', 'nombre del proveedor']],
        'tipo_documento' => ['Tipo de documento', 18, ['tipo de documento', 'tipo documento', 'tipo doc']],
        'ruc' => ['RUC / Documento', 18, ['ruc / documento', 'ruc', 'documento', 'numero de documento', 'número de documento', 'nro documento']],
        'tax_id' => ['Tax ID', 18, ['tax id', 'taxid', 'tax']],
        'pais' => ['País', 16, ['pais', 'país']],
        'direccion' => ['Dirección', 40, ['direccion', 'dirección']],
        'telefono' => ['Teléfono', 16, ['telefono', 'teléfono', 'celular']],
        'fax' => ['Fax', 14, ['fax']],
        'email' => ['Email', 28, ['email', 'correo', 'correo electronico', 'correo electrónico', 'e-mail']],
        'contacto_nombre' => ['Contacto', 24, ['contacto', 'nombre de contacto', 'persona de contacto']],
        'codigo_corto' => ['Código corto', 14, ['codigo corto', 'código corto']],
    ];

    /** La plantilla para llenar: cabeceras con listas desplegables y una hoja de instrucciones. */
    public function plantilla()
    {
        $libro = new Spreadsheet();
        $hoja = $libro->getActiveSheet();
        $hoja->setTitle('Proveedores');

        $letra = 'A';
        foreach (self::COLUMNAS as $clave => [$cabecera, $ancho]) {
            $hoja->setCellValue("{$letra}1", $cabecera);
            $hoja->getColumnDimension($letra)->setWidth($ancho);
            // Todo como texto: si no, Excel se come los ceros del DNI y pone
            // el RUC en notación científica.
            $hoja->getStyle("{$letra}2:{$letra}500")->getNumberFormat()->setFormatCode(NumberFormat::FORMAT_TEXT);
            $columnas[$clave] = $letra++;
        }

        $ultima = chr(ord('A') + count(self::COLUMNAS) - 1);
        $hoja->getStyle("A1:{$ultima}1")->applyFromArray([
            'font' => ['bold' => true, 'color' => ['rgb' => 'FFFFFF']],
            'fill' => ['fillType' => Fill::FILL_SOLID, 'startColor' => ['rgb' => '2563EB']],
            'alignment' => ['vertical' => Alignment::VERTICAL_CENTER],
        ]);
        $hoja->getRowDimension(1)->setRowHeight(22);
        $hoja->freezePane('A2');

        // Listas desplegables para los dos campos de valores fijos.
        $this->lista($hoja, $columnas['tipo'], '"Nacional,Extranjero"');
        $this->lista($hoja, $columnas['tipo_documento'], '"RUC,DNI,CE,SIN"');

        $ayuda = $libro->createSheet();
        $ayuda->setTitle('Instrucciones');
        $filas = [
            ['Cómo llenar la plantilla'],
            [''],
            ['• Una fila por proveedor, desde la fila 2 de la hoja "Proveedores". No cambies las cabeceras.'],
            ['• Solo "Nombre" es obligatorio.'],
            ['• Tipo: Nacional o Extranjero (si lo dejas vacío, se toma Nacional).'],
            ['• El código del proveedor (NAC-1, EXT-1…) lo asigna el sistema: no va en la plantilla.'],
            ['• Nacional: Tipo de documento RUC (11 dígitos), DNI (8 dígitos), CE o SIN, y el número en "RUC / Documento".'],
            ['   Si dejas el tipo de documento vacío, se deduce por el largo del número (11 = RUC, 8 = DNI).'],
            ['• Extranjero: usa "Tax ID" y "País"; el tipo de documento y el RUC no se usan.'],
            ['• Código corto: opcional, 3 letras o números (KET). Numera las compras sin orden de ese proveedor.'],
            ['• Un proveedor cuyo RUC/documento ya existe, o que ya existe con ese mismo nombre, se omite (así puedes volver a subir el archivo sin duplicar).'],
            ['• Las filas con errores se omiten y se te dice cuáles y por qué; el resto se carga.'],
            [''],
            ['Ejemplos'],
            ['Nacional', 'TEXTILES LIMA SAC', 'RUC', '20123456789', '', 'Perú', 'Av. Industrial 123, Lima', '999888777', '', 'ventas@textileslima.pe', 'Juan Pérez', 'TLM'],
            ['Extranjero', 'HA QING TEXTILE CO. LTD', '', '', 'CN-91330000XXXX', 'China', 'Shaoxing, Zhejiang', '+86 575 0000 0000', '', 'sales@haqing.cn', 'Li Wei', 'HQT'],
        ];
        foreach ($filas as $i => $fila) {
            $ayuda->fromArray($fila, null, 'A'.($i + 1));
        }
        $ayuda->getStyle('A1')->getFont()->setBold(true)->setSize(14);
        $ayuda->getStyle('A14')->getFont()->setBold(true);
        $ayuda->getColumnDimension('A')->setWidth(14);
        $ayuda->getColumnDimension('B')->setWidth(28);

        $libro->setActiveSheetIndex(0);

        return response()->streamDownload(function () use ($libro) {
            (new Xlsx($libro))->save('php://output');
        }, 'plantilla-proveedores.xlsx', [
            'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ]);
    }

    private function lista($hoja, string $letra, string $opciones): void
    {
        $validacion = $hoja->getCell("{$letra}2")->getDataValidation();
        $validacion->setType(\PhpOffice\PhpSpreadsheet\Cell\DataValidation::TYPE_LIST)
            ->setAllowBlank(true)
            ->setShowDropDown(false)
            ->setFormula1($opciones);

        for ($fila = 3; $fila <= 500; $fila++) {
            $hoja->getCell("{$letra}{$fila}")->setDataValidation(clone $validacion);
        }
    }

    /** Crea los proveedores del Excel; lo que no se puede cargar vuelve como advertencia. */
    public function importar(Request $request)
    {
        $request->validate(['archivo' => 'required|file|mimes:xlsx,xls|max:5120']);

        try {
            $hoja = IOFactory::load($request->file('archivo')->getRealPath())->getSheet(0);
        } catch (\Throwable) {
            return response()->json(['message' => 'No se pudo leer el archivo: ¿es un Excel válido?'], 422);
        }

        $filas = $hoja->toArray(null, true, true, false);
        if (count($filas) < 2) {
            return response()->json(['message' => 'El archivo no tiene filas de datos.'], 422);
        }

        $col = $this->mapaColumnas($filas[0]);
        if (! isset($col['nombre'])) {
            return response()->json(['message' => 'Falta la columna "Nombre". Descarga la plantilla para ver las columnas.'], 422);
        }

        $creados = 0;
        $advertencias = [];
        // Lo que ya entró en este mismo archivo cuenta como existente.
        $vistosRuc = [];
        $vistosNombre = [];
        $vistosCorto = [];

        // Todo o nada ante un error inesperado: una carga a medias obliga a
        // adivinar qué filas ya entraron antes de volver a subir el archivo.
        DB::transaction(function () use ($filas, $col, &$creados, &$advertencias, &$vistosRuc, &$vistosNombre, &$vistosCorto) {
            foreach (array_slice($filas, 1) as $i => $fila) {
                $n = $i + 2;
                $valor = fn (string $clave) => isset($col[$clave]) ? trim((string) ($fila[$col[$clave]] ?? '')) : '';

                $nombre = $valor('nombre');
                if ($nombre === '' && implode('', array_map(fn ($c) => trim((string) $c), $fila)) === '') {
                    continue; // fila vacía
                }
                if ($nombre === '') {
                    $advertencias[] = "Fila {$n}: falta el nombre, se omite.";
                    continue;
                }

                $tipo = $this->tipo($valor('tipo'));
                if ($tipo === null) {
                    $advertencias[] = "Fila {$n}: el tipo \"{$valor('tipo')}\" no es válido (Nacional o Extranjero), se omite \"{$nombre}\".";
                    continue;
                }

                $datos = [
                    'nombre' => $nombre,
                    'tipo' => $tipo,
                    'tipo_documento' => null,
                    'ruc' => null,
                    'tax_id' => $valor('tax_id') ?: null,
                    'pais' => $valor('pais') ?: null,
                    'direccion' => $valor('direccion') ?: null,
                    'telefono' => $valor('telefono') ?: null,
                    'fax' => $valor('fax') ?: null,
                    'email' => $valor('email') ?: null,
                    'contacto_nombre' => $valor('contacto_nombre') ?: null,
                    'codigo_corto' => strtoupper($valor('codigo_corto')) ?: null,
                    'activo' => true,
                ];

                if ($tipo === 'nacional') {
                    $numero = $this->soloNumero($valor('ruc'));
                    $tipoDoc = strtoupper($valor('tipo_documento'));
                    if ($tipoDoc === '') {
                        $tipoDoc = $numero === '' ? 'SIN' : (strlen($numero) === 8 ? 'DNI' : 'RUC');
                    }
                    if (! in_array($tipoDoc, ['RUC', 'DNI', 'CE', 'SIN'], true)) {
                        $advertencias[] = "Fila {$n}: el tipo de documento \"{$tipoDoc}\" no es válido (RUC, DNI, CE o SIN), se omite \"{$nombre}\".";
                        continue;
                    }
                    if ($tipoDoc === 'CE') {
                        $numero = strtoupper(trim($valor('ruc')));
                    }
                    if ($tipoDoc === 'SIN') {
                        $numero = '';
                    }
                    $datos['tipo_documento'] = $tipoDoc;
                    $datos['ruc'] = $numero !== '' ? $numero : null;
                }

                $validador = Validator::make($datos, [
                    'ruc' => array_filter([
                        'nullable', 'string', 'max:12',
                        $datos['tipo_documento'] === 'RUC' && $datos['ruc'] ? 'digits:11' : null,
                        $datos['tipo_documento'] === 'DNI' && $datos['ruc'] ? 'digits:8' : null,
                    ]),
                    'email' => 'nullable|email|max:255',
                    'telefono' => 'nullable|string|max:20',
                    'fax' => 'nullable|string|max:30',
                    'tax_id' => 'nullable|string|max:50',
                    'pais' => 'nullable|string|max:100',
                    'direccion' => 'nullable|string|max:500',
                    'contacto_nombre' => 'nullable|string|max:255',
                    'codigo_corto' => 'nullable|string|size:3|alpha_num',
                ], [
                    'ruc.digits' => $datos['tipo_documento'] === 'DNI' ? 'el DNI debe tener 8 dígitos' : 'el RUC debe tener 11 dígitos',
                    'email.email' => 'el correo no es válido',
                    'codigo_corto.size' => 'el código corto son 3 caracteres',
                    'codigo_corto.alpha_num' => 'el código corto solo lleva letras y números',
                    'telefono.max' => 'el teléfono es demasiado largo',
                ]);
                if ($validador->fails()) {
                    $advertencias[] = "Fila {$n}: ".$validador->errors()->first().", se omite \"{$nombre}\".";
                    continue;
                }

                // Duplicados: por documento si lo trae; si no, por nombre.
                if ($datos['ruc']) {
                    if (isset($vistosRuc[$datos['ruc']]) || Proveedor::where('ruc', $datos['ruc'])->exists()) {
                        $advertencias[] = "Fila {$n}: el documento {$datos['ruc']} ya existe, se omite \"{$nombre}\".";
                        continue;
                    }
                } elseif (isset($vistosNombre[mb_strtolower($nombre)]) || Proveedor::whereRaw('LOWER(nombre) = ?', [mb_strtolower($nombre)])->exists()) {
                    $advertencias[] = "Fila {$n}: ya existe un proveedor llamado \"{$nombre}\", se omite.";
                    continue;
                }

                // El código corto es único: si choca, el proveedor se carga sin él.
                if ($datos['codigo_corto'] && (isset($vistosCorto[$datos['codigo_corto']]) || Proveedor::where('codigo_corto', $datos['codigo_corto'])->exists())) {
                    $advertencias[] = "Fila {$n}: el código corto {$datos['codigo_corto']} ya lo usa otro proveedor; \"{$nombre}\" se carga sin código corto.";
                    $datos['codigo_corto'] = null;
                }

                $datos['codigo'] = Proveedor::generarCodigo($tipo);
                Proveedor::create($datos);
                $creados++;

                if ($datos['ruc']) {
                    $vistosRuc[$datos['ruc']] = true;
                }
                $vistosNombre[mb_strtolower($nombre)] = true;
                if ($datos['codigo_corto']) {
                    $vistosCorto[$datos['codigo_corto']] = true;
                }
            }
        });

        return response()->json(['creados' => $creados, 'advertencias' => $advertencias]);
    }

    /** "Nacional"/"Extranjero" (y variantes) → valor guardado; vacío = nacional; otra cosa = null. */
    private function tipo(string $texto): ?string
    {
        return match (mb_strtolower(trim($texto))) {
            '', 'nacional', 'nac', 'local' => 'nacional',
            'extranjero', 'exterior', 'ext', 'internacional' => 'extranjero',
            default => null,
        };
    }

    /** Un RUC/DNI que Excel devolvió como número ("20123456789.0") queda solo con dígitos. */
    private function soloNumero(string $texto): string
    {
        $texto = trim($texto);
        if (preg_match('/^\d+(\.0+)?$/', $texto)) {
            $texto = explode('.', $texto)[0];
        }

        return $texto;
    }

    /** Ubica cada columna por el texto de su cabecera, sin importar el orden ni las tildes. */
    private function mapaColumnas(array $cabecera): array
    {
        $normalizar = fn ($t) => strtolower(trim((string) preg_replace('/\s+/', ' ', str_replace(
            ['á', 'é', 'í', 'ó', 'ú', 'Á', 'É', 'Í', 'Ó', 'Ú'], ['a', 'e', 'i', 'o', 'u', 'a', 'e', 'i', 'o', 'u'], (string) $t
        ))));

        $mapa = [];
        foreach ($cabecera as $indice => $texto) {
            $texto = $normalizar($texto);
            foreach (self::COLUMNAS as $clave => [, , $alias]) {
                if (in_array($texto, array_map($normalizar, $alias), true)) {
                    $mapa[$clave] = $indice;
                }
            }
        }

        return $mapa;
    }
}
