<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="utf-8">
    <title>Letra de cambio {{ $letra->codigo }}</title>
    <style>
        @page { margin: 22px; }
        * { box-sizing: border-box; }
        body { font-family: 'DejaVu Sans', sans-serif; font-size: 8.5px; color: #111; margin: 0; }
        table { border-collapse: collapse; width: 100%; }
        td, th { vertical-align: top; }
        .marco { border: 1px solid #111; }
        .celda { border: 1px solid #111; padding: 3px 5px; }
        .cab { font-weight: bold; text-transform: uppercase; font-size: 7.5px; text-align: center; padding: 3px 4px; border: 1px solid #111; background: #f1f1f1; }
        .valor { text-align: center; padding: 4px; border: 1px solid #111; font-size: 10px; font-weight: bold; }
        .peq { font-size: 6.5px; color: #444; text-align: center; letter-spacing: .3px; }
        .dato td { padding: 3px 4px; border: 1px solid #111; }
        .dato .et { width: 70px; font-weight: bold; }
        .linea { border-bottom: 1px solid #111; height: 18px; }
    </style>
</head>
<body>
    @php
        $d = fn ($f) => $f ? \Carbon\Carbon::parse($f)->format('d / m / Y') : '';
    @endphp

    {{-- Un solo título valor: cláusulas a la izquierda y los bloques a la derecha. --}}
    <table class="marco" style="width: 746px;">
        <tr>
            <td style="width: 84px; padding: 0; border-right: 1px solid #111;">
                <img src="{{ $clausulas }}" width="84" height="440" style="display: block;">
            </td>
            <td style="width: 664px; padding: 0;">
                {{-- Cabecera: número, referencia, fechas, lugar e importe --}}
                <table style="width: 664px;">
                    <tr>
                        <td class="cab" style="width: 47px;">Número</td>
                        <td class="cab" style="width: 109px;">Ref. del girador</td>
                        <td class="cab" style="width: 101px;">Fecha de giro</td>
                        <td class="cab" style="width: 109px;">Lugar de giro</td>
                        <td class="cab" style="width: 101px;">Vencimiento</td>
                        <td class="cab" style="width: 143px;">Moneda e importe</td>
                    </tr>
                    <tr>
                        <td class="valor" rowspan="2" style="font-size: 7px;">{{ $letra->codigo }}</td>
                        <td class="valor" rowspan="2">{{ $letra->referencia }}</td>
                        <td class="peq celda" style="border-bottom: 0;">DÍA / MES / AÑO</td>
                        <td class="valor" rowspan="2" style="font-size: 8.5px;">{{ $letra->lugar_giro }}</td>
                        <td class="peq celda" style="border-bottom: 0;">DÍA / MES / AÑO</td>
                        <td class="valor" rowspan="2" style="font-size: 15px;">{{ $simbolo }} {{ $importeTexto }}</td>
                    </tr>
                    <tr>
                        <td class="valor" style="border-top: 0;">{{ $d($letra->fecha_giro) }}</td>
                        <td class="valor" style="border-top: 0;">{{ $d($letra->fecha_vencimiento) }}</td>
                    </tr>
                </table>

                {{-- Bloque del aceptante: texto legal, importe en letras, datos y cuenta a debitar --}}
                <table style="width: 664px;">
                    <tr>
                        <td style="width: 76px; border: 1px solid #111; border-left: 0; height: 190px;"></td>
                        <td style="width: 22px; border: 1px solid #111; padding: 0; text-align: center;">
                            <img src="{{ $etiquetaAceptante }}" width="22" height="120">
                        </td>
                        <td style="width: 548px; border: 1px solid #111; border-right: 0; padding: 5px 6px;">
                            <div>Por esta LETRA DE CAMBIO se servirá(n) pagar incondicionalmente a la Orden de
                                <strong>{{ $girador['nombre'] }}</strong> la cantidad de</div>
                            <div class="celda" style="margin: 5px 0; text-align: center; font-weight: bold; font-size: 9px;">{{ $enLetras }}</div>
                            <div style="margin-bottom: 4px;">En el siguiente lugar de pago, o con cargo en la cuenta del Banco</div>

                            <table style="width: 536px;">
                                <tr>
                                    <td style="width: 276px; padding-right: 6px;">
                                        <table class="dato" style="width: 270px;">
                                            <tr><td class="et">Aceptante:</td><td colspan="3">{{ $letra->aceptante_nombre }}</td></tr>
                                            <tr><td class="et">Domicilio:</td><td colspan="3">{{ $letra->aceptante_domicilio }}</td></tr>
                                            <tr><td class="et">Localidad:</td><td colspan="3">{{ $letra->aceptante_localidad }}</td></tr>
                                            <tr>
                                                <td class="et">DNI/RUC:</td><td>{{ $letra->aceptante_documento }}</td>
                                                <td class="et" style="width: 30px;">TEL.:</td><td>{{ $letra->aceptante_telefono }}</td>
                                            </tr>
                                            <tr><td class="et">Aval Permanente:</td><td colspan="3">{{ $letra->aval_nombre }}</td></tr>
                                            <tr><td class="et">Domicilio:</td><td colspan="3">{{ $letra->aval_domicilio }}</td></tr>
                                            <tr><td class="et">Localidad:</td><td colspan="3">{{ $letra->aval_localidad }}</td></tr>
                                        </table>
                                    </td>
                                    <td style="width: 254px;">
                                        <div class="celda" style="font-size: 6.8px; text-align: center; margin-bottom: 3px;">Importe a debitar en la siguiente cuenta del Banco que se indica</div>
                                        <table style="width: 254px;">
                                            <tr>
                                                <td class="cab" style="width: 58px;">Banco</td>
                                                <td class="cab" style="width: 40px;">Oficina</td>
                                                <td class="cab" style="width: 64px;">Número de cuenta</td>
                                                <td class="cab" style="width: 30px;">DC</td>
                                            </tr>
                                            <tr>
                                                <td class="valor" style="height: 26px; font-size: 7.5px;">{{ $letra->banco }}</td>
                                                <td class="valor" style="font-size: 7.5px;">{{ $letra->oficina }}</td>
                                                <td class="valor" style="font-size: 7.5px;">{{ $letra->cuenta }}</td>
                                                <td class="valor" style="font-size: 7.5px;">{{ $letra->dc }}</td>
                                            </tr>
                                        </table>
                                        <div style="margin-top: 6px; text-align: center; font-weight: bold;">{{ $girador['nombre'] }}</div>
                                        <div style="text-align: center;">RUC: {{ $girador['ruc'] }}</div>
                                        <div style="text-align: center; font-size: 7px;">{{ $girador['direccion'] }}</div>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>

                {{-- Bloque de firmas del aceptante y del aval --}}
                <table style="width: 664px;">
                    <tr>
                        <td style="width: 76px; border: 1px solid #111; border-left: 0; border-bottom: 0; height: 120px;"></td>
                        <td style="width: 22px; border: 1px solid #111; border-bottom: 0; padding: 0; text-align: center;">
                            <img src="{{ $etiquetaAceptante }}" width="22" height="120">
                        </td>
                        <td style="width: 548px; border: 1px solid #111; border-right: 0; border-bottom: 0; padding: 4px 6px;">
                            <table class="dato" style="width: 400px;">
                                <tr><td class="et">DNI/RUC:</td><td>{{ $letra->aval_documento }}</td></tr>
                                <tr><td class="et">Firma:</td><td style="height: 24px;"></td></tr>
                                <tr><td class="et">Aval Permanente:</td><td>{{ $letra->aval2_nombre }}</td></tr>
                                <tr><td class="et">Domicilio:</td><td>{{ $letra->aval2_domicilio }}</td></tr>
                                <tr><td class="et">Localidad:</td><td>{{ $letra->aval2_localidad }}</td></tr>
                                <tr><td class="et">DNI/RUC:</td><td>{{ $letra->aval2_documento }}</td></tr>
                                <tr><td class="et">Firma:</td><td style="height: 24px;"></td></tr>
                            </table>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>

    <div style="margin-top: 3px; font-size: 7px; font-weight: bold; letter-spacing: .4px;">NO ESCRIBIR NI FIRMAR DEBAJO DE ESTA LÍNEA</div>
    @if ($letra->estado === 'anulada')
        <div style="margin-top: 6px; font-size: 14px; font-weight: bold; color: #b91c1c;">LETRA ANULADA</div>
    @endif
</body>
</html>
