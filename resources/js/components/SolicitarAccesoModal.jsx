import { useEffect, useState } from 'react';
import { KeyRound } from 'lucide-react';
import api from '../lib/api';
import { useToast } from '../lib/toast';
import { Alert, Button, Modal } from './ui';

/**
 * Pide a un administrador un permiso que falta. La solicitud es idempotente:
 * si ya había una pendiente de este mismo permiso, el servidor devuelve esa.
 */
export default function SolicitarAccesoModal({ open, permiso, etiqueta, onClose, onEnviada }) {
    const toast = useToast();
    const [motivo, setMotivo] = useState('');
    const [sending, setSending] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (open) {
            setMotivo('');
            setError(null);
        }
    }, [open, permiso]);

    const enviar = async () => {
        setSending(true);
        setError(null);
        try {
            await api.post('/mi-acceso/solicitudes', { permiso, motivo: motivo.trim() || null });
            toast.success('Solicitud enviada. Verás la respuesta en tu Inicio.');
            onEnviada?.();
            onClose();
        } catch (err) {
            setError(err.response?.data?.message ?? 'No se pudo enviar la solicitud.');
        } finally {
            setSending(false);
        }
    };

    return (
        <Modal
            open={open}
            onClose={onClose}
            title="Pedir acceso"
            description="Un administrador revisará tu solicitud"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>
                        Cancelar
                    </Button>
                    <Button onClick={enviar} loading={sending}>
                        Enviar solicitud
                    </Button>
                </>
            }
        >
            <div className="space-y-4">
                <div className="flex items-start gap-3 rounded-md bg-primary-50 px-3 py-2.5 ring-1 ring-inset ring-primary-200">
                    <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-primary-600" />
                    <div className="text-sm">
                        <p className="font-medium text-warm-900">{etiqueta ?? permiso}</p>
                        <p className="text-xs text-warm-500">No tienes este permiso con tus roles actuales.</p>
                    </div>
                </div>
                <div>
                    <label htmlFor="motivo-acceso" className="mb-1 block text-sm font-medium text-gray-700">
                        ¿Para qué lo necesitas? <span className="font-normal text-gray-400">(opcional)</span>
                    </label>
                    <textarea
                        id="motivo-acceso"
                        rows={3}
                        maxLength={500}
                        value={motivo}
                        onChange={(e) => setMotivo(e.target.value)}
                        placeholder="Ayuda a quien aprueba a decidir más rápido"
                        className="block w-full rounded-md border-0 px-3 py-2 text-sm text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-primary-600"
                    />
                </div>
                {error && <Alert variant="error">{error}</Alert>}
            </div>
        </Modal>
    );
}
