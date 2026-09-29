import PlanillaTela from './PlanillaTela';
import { gruposDeProforma } from '../lib/planilla';

/**
 * Los productos de una proforma con el formato de la planilla del cliente:
 * una tabla por tela (ítem, color, rollo, factor, metros, precio) con su sub
 * total, y el total al final.
 */
export default function DetalleProforma({ detalles = [], moneda = 'PEN' }) {
    return <PlanillaTela grupos={gruposDeProforma(detalles)} moneda={moneda} />;
}
