<?php

namespace Database\Seeders;

use App\Models\FamiliaTela;
use App\Models\TipoTela;
use Illuminate\Database\Seeder;

/**
 * Familias y tipos de tela del cliente (Codificacion_colores_y_tipos_de_tela.xlsx,
 * hoja "Tipos de tela"). Solo se cargan los tipos que ya tienen nombre en el
 * archivo original; el resto (17 filas vacías) se agrega cuando el cliente
 * los complete.
 */
class FamiliasYTiposTelaSeeder extends Seeder
{
    public function run(): void
    {
        $familias = [
    ['01', 'POLIESTER'],
    ['02', 'RAYON- VISCOSA'],
    ['03', 'LANA ACRILICA'],
    ['04', 'SPANDEX - LICRA'],
    ['05', 'LUREX'],
    ['06', 'LANA'],
    ['07', 'SEDA'],
    ['08', 'PIELES'],
    ['09', 'CUERO'],
    ['10', 'ALGODON'],
    ['11', 'LINO'],
    ['12', 'NYLON'],
    ['13', 'ALGODON POLIESTER'],
];

        $idsPorCodigo = [];
        foreach ($familias as [$codigo, $nombre]) {
            $familia = FamiliaTela::firstOrCreate(['codigo' => $codigo], ['nombre' => $nombre]);
            $idsPorCodigo[$codigo] = $familia->id;
        }

        $tipos = [
    ['001', 'POLINAN', '01'],
    ['002', 'PIEL DE DURAZNO', '01'],
    ['003', 'TAFFETA 190T PVC', '01'],
    ['004', 'TAFFETA 210T WHITE', '01'],
    ['005', 'TAFFETA CAMUFLADA SILVER 210T', '01'],
    ['006', 'TAFFETA 210T COATING', '01'],
    ['007', 'TAFFETA PLATINADO SILVER 210T', '01'],
    ['008', 'TAFFETA FORRO 210T', '01'],
    ['009', 'PELUCHE SHERPA', '01'],
    ['010', 'FELPA CORAL', '01'],
    ['011', 'KATANIA FABRIC PD', '01'],
    ['012', 'POLAR 200GSM', '01'],
    ['013', 'RIB', '01'],
    ['014', 'BABY RIB', '01'],
    ['015', 'BONNY', '01'],
    ['016', 'POLIESTER TASLONE', '01'],
    ['017', 'POLINAN 1,50', '01'],
    ['018', 'POLINAN 1,70 ESTRELLA DORADA', '01'],
    ['019', 'MALLA', '01'],
    ['020', 'TASLAN GAMUZADO', '01'],
    ['021', 'MICROPOLAR', '01'],
    ['022', 'POLINAN PLK', '01'],
    ['023', 'PIEL DE DURAZNO ESTAMPADO', '01'],
    ['024', 'JACQUARD PD', '01'],
    ['025', 'GABARDINA CE', '01'],
    ['026', 'DKTA MELANGE POLYESTER', '01'],
    ['027', 'SOFT NEGRO', '01'],
    ['028', 'BABY WAFFER PD', '01'],
    ['029', 'MICROPOLAR ESTAMPADO', '01'],
    ['030', 'TRENZA', '01'],
    ['031', 'DKT COLORES', '01'],
    ['032', 'RIB PANAMEÑO PD', '01'],
    ['033', 'POLI CUADRO', '01'],
    ['034', 'KODRA GUCHI', '01'],
    ['001', 'CHALIS LICRADO 1,50 AZUL MARINO - ESTRELLA DORADA', '02'],
    ['002', 'CHALIS LICRADO 1,50', '02'],
    ['003', 'CHALIS LICRADO 1,60', '02'],
    ['007', 'CHALIS LICRADO 1,60 CE ESTRELLA', '02'],
    ['002', 'SEDA ESTAMPADA FRANCESA', '07'],
    ['001', 'PIQUE BLANCO', '10'],
    ['004', 'YERSEY BLANCO', '10'],
    ['005', 'CUERLLO PIQUE BLANCO', '10'],
    ['006', 'PUÑO PIQUE BLANCO', '10'],
    ['001', 'LINO 1,60', '11'],
    ['002', 'LINO CREPE VIENA', '11'],
    ['003', 'LINO ESTAMPADO', '11'],
    ['001', 'NYLON PU', '12'],
    ['006', 'NYLON TASLONE', '12'],
];

        foreach ($tipos as [$codigoTipo, $nombre, $codigoFamilia]) {
            $familiaId = $idsPorCodigo[$codigoFamilia] ?? null;
            if (! $familiaId) {
                continue;
            }
            TipoTela::firstOrCreate(
                ['familia_tela_id' => $familiaId, 'codigo' => $codigoTipo],
                ['nombre' => $nombre],
            );
        }
    }
}
