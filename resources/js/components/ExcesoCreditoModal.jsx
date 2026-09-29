import { ShieldAlert } from 'lucide-react';
import { Alert, Button, Modal } from './ui';

/**
 * La venta a crédito no cabe en la línea del cliente. Quien tiene el permiso
 * "Autorizar exceso de crédito" puede registrarla igual (queda en la
 * auditoría); los demás, no.
 *
 * `exceso`: { message, detalle } tal como lo devuelve la API (422).
 */
export default function ExcesoCreditoModal({ exceso, onClose, onAutorizar, autorizando }) {
    const puede = Boolean(exceso?.detalle?.puede_autorizar);

    return (
        <Modal
            open={Boolean(exceso)}
            onClose={onClose}
            title="Línea de crédito excedida"
            size="md"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>
                        {puede ? 'Cancelar' : 'Entendido'}
                    </Button>
                    {puede && (
                        <Button variant="danger" loading={autorizando} onClick={onAutorizar}>
                            <ShieldAlert className="h-4 w-4" /> Autorizar y guardar
                        </Button>
                    )}
                </>
            }
        >
            <div className="space-y-3">
                <Alert variant="warning">{exceso?.message}</Alert>
                <p className="text-sm text-warm-600">
                    {puede
                        ? 'Tienes permiso para autorizar esta venta de todos modos. Quedará registrado en la auditoría con tu usuario.'
                        : 'Pide a quien tenga el permiso "Autorizar exceso de crédito" que la registre, o véndela al contado.'}
                </p>
            </div>
        </Modal>
    );
}
