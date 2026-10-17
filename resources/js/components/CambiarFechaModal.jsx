import { useEffect, useState } from 'react';
import { diaLocal, hoyIso } from '../lib/fechas';
import { Alert, Button, Input, Modal } from './ui';

/**
 * Corrige el día de un documento (pedido, proforma…). Solo cambia la fecha: el día y la hora en que se registró de
 * verdad quedan como estaban. Cualquier día hasta hoy, nunca uno futuro.
 */
export default function CambiarFechaModal({ documento, titulo, fechaActual, nota, onClose, onGuardar }) {
    const [fecha, setFecha] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        setFecha(diaLocal(fechaActual));
        setError('');
    }, [documento, fechaActual]);

    const guardar = async () => {
        if (!fecha) {
            setError('Elige la fecha.');
            return;
        }
        setSaving(true);
        setError('');
        try {
            await onGuardar(fecha);
        } catch (err) {
            const v = err.response?.data?.errors ?? {};
            setError(Object.values(v)[0]?.[0] ?? err.response?.data?.message ?? 'No se pudo cambiar la fecha.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal
            open={Boolean(documento)}
            onClose={onClose}
            title={titulo}
            description={documento ? `${documento}` : ''}
            size="sm"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>Cancelar</Button>
                    <Button loading={saving} onClick={guardar}>Guardar fecha</Button>
                </>
            }
        >
            <div className="space-y-3">
                <Input label="Fecha" type="date" max={hoyIso()} value={fecha} onChange={(e) => setFecha(e.target.value)} error={error} />
                {nota && <Alert variant="info">{nota}</Alert>}
            </div>
        </Modal>
    );
}
