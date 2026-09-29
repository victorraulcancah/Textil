<?php

namespace App\Exceptions;

/**
 * Una venta a crédito que no cabe en la línea del cliente. Viaja como un 422
 * con su mensaje y, en `exceso_credito`, los números y si quien vende puede
 * autorizarla igual.
 */
class ExcesoCreditoException extends \DomainException
{
    /**
     * @param  array{moneda: string, limite: float, deuda: float, disponible: float, importe: float, puede_autorizar: bool}  $detalle
     */
    public function __construct(string $mensaje, public readonly array $detalle)
    {
        parent::__construct($mensaje);
    }
}
