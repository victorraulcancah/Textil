<?php

namespace App\Http\Requests\OrdenVenta;

/**
 * Edición del pedido. Mismas reglas que el alta: mientras es borrador los
 * rollos no están comprometidos, así que se validan igual que en uno nuevo.
 */
class UpdateOrdenVentaRequest extends StoreOrdenVentaRequest
{
}
