import { useEffect, useState } from 'react';
import api, { asList } from '../lib/api';
import { useToast } from '../lib/toast';
import { Alert, Button, Input, Modal, SearchSelect } from './ui';

const money = (n, moneda = 'PEN') =>
    new Intl.NumberFormat('es-PE', { style: 'currency', currency: moneda || 'PEN' }).format(Number(n) || 0);

/** ¿Es un ingreso hecho a mano que se puede convertir en anticipo? (no una venta, un cobro, un cierre ni otro del sistema) */
export const esConvertibleEnAnticipo = (m) =>
    !m.deleted_at && m.tipo === 'ingreso' && !m.documento_referencia_tipo && !m.motivo?.es_sistema && !m.por_aprobar;

/**
 * Convierte un ingreso registrado a mano en el anticipo de un cliente: para los casos en que se anotó un «Otro ingreso»
 * porque todavía no había dónde registrar un anticipo. No entra plata nueva: el ingreso que ya está en la caja (y en su
 * arqueo) pasa a ser el ingreso del anticipo. Lo usan Mi Caja y Cierres de caja.
 */
export default function ConvertirEnAnticipoModal({ movimiento, url, onClose, onDone }) {
    const toast = useToast();
    const [clientes, setClientes] = useState([]);
    const [clienteId, setClienteId] = useState('');
    const [observaciones, setObservaciones] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!movimiento) return;
        setClienteId('');
        setError('');
        setObservaciones(movimiento.descripcion ?? '');
        api.get('/clientes')
            .then((res) => setClientes(asList(res)))
            .catch(() => setClientes([]));
    }, [movimiento]);

    if (!movimiento) return null;

    const convertir = async () => {
        if (!clienteId) {
            setError('Elige el cliente del anticipo.');
            return;
        }
        setSaving(true);
        setError('');
        try {
            const res = await api.post(url, { cliente_id: Number(clienteId), observaciones: observaciones.trim() || null });
            toast.success('Ya es un anticipo del cliente: lo verás en Anticipos y podrás usarlo en sus ventas.');
            onDone(res.data);
        } catch (err) {
            const v = err.response?.data?.errors ?? {};
            const msg = Object.values(v)[0]?.[0] ?? err.response?.data?.message ?? 'No se pudo convertir en anticipo.';
            setError(msg);
            toast.error(msg);
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal
            open
            onClose={onClose}
            title="Convertir en anticipo"
            description={`Ingreso de ${money(movimiento.monto, movimiento.moneda)} · ${movimiento.descripcion || movimiento.motivo?.nombre || ''}`}
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>Cancelar</Button>
                    <Button loading={saving} onClick={convertir}>Convertir en anticipo</Button>
                </>
            }
        >
            <div className="space-y-4">
                <Alert variant="info">
                    No entra plata nueva: este ingreso ya está en la caja y en su arqueo. Pasa a ser el <strong>anticipo del cliente</strong>, con su mismo
                    día, monto y método, para que se use luego en sus ventas.
                </Alert>
                <SearchSelect
                    label="Cliente del anticipo"
                    value={clienteId}
                    onChange={(v) => setClienteId(v ?? '')}
                    placeholder="Busca el cliente"
                    emptyText="Sin coincidencias: créalo primero en Clientes"
                    options={clientes.map((c) => ({ value: String(c.id), label: c.nombre }))}
                    error={error}
                />
                <Input label="Observaciones (opcional)" value={observaciones} onChange={(e) => setObservaciones(e.target.value)} />
            </div>
        </Modal>
    );
}
