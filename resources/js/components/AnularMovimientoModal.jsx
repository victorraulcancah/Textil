import { useEffect, useState } from 'react';
import api from '../lib/api';
import { useToast } from '../lib/toast';
import { Alert, Button, Input, Modal } from './ui';

const money = (n, moneda = 'PEN') =>
    new Intl.NumberFormat('es-PE', { style: 'currency', currency: moneda || 'PEN' }).format(Number(n) || 0);

const metodoLabel = (row) => {
    if (row.cuenta_bancaria) return `Transf. · ${row.cuenta_bancaria.alias || row.cuenta_bancaria.numero_cuenta}`;
    if (row.billetera) return row.billetera.nombre;
    return 'Efectivo';
};

/**
 * Anular un movimiento de caja, con un aviso de lo que pasa según de dónde nace (a mano, cobro de una cuenta, venta,
 * anticipo). Lo usan Mi Caja y Cierres de caja.
 *
 *   url:    a dónde se manda la anulación (POST); responde con lo que `onDone` recibe
 *   gestor: quien gestiona los cierres puede anular el efectivo de un turno ya cerrado
 */
export default function AnularMovimientoModal({ movimiento, url, gestor = false, onClose, onDone }) {
    const toast = useToast();
    const [motivo, setMotivo] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setMotivo('');
    }, [movimiento]);

    if (!movimiento) return null;

    const doc = movimiento.documento_referencia_tipo;
    const esVenta = doc === 'nota_venta';
    const efectivoCerrado = gestor && !movimiento.cuenta_bancaria && !movimiento.billetera && movimiento.apertura?.estado !== 'abierta';

    const confirmar = async () => {
        setSaving(true);
        try {
            const res = await api.post(url, { motivo: motivo.trim() || null });
            toast.success(esVenta ? 'Venta anulada: volvió el stock y dejó de contar en la caja.' : 'Movimiento anulado: ya no cuenta en la caja.');
            onDone(res.data);
        } catch (err) {
            const v = err.response?.data?.errors ?? {};
            toast.error(Object.values(v)[0]?.[0] ?? err.response?.data?.message ?? 'No se pudo anular el movimiento.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal
            open
            onClose={onClose}
            title={esVenta ? 'Anular venta' : 'Anular movimiento'}
            description={`${movimiento.tipo === 'ingreso' ? 'Ingreso' : 'Gasto'} de ${money(movimiento.monto, movimiento.moneda)} · ${metodoLabel(movimiento)}`}
            size="sm"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>Cancelar</Button>
                    <Button variant="danger" loading={saving} onClick={confirmar}>{esVenta ? 'Anular la venta' : 'Anular movimiento'}</Button>
                </>
            }
        >
            <div className="space-y-3">
                {esVenta ? (
                    <Alert variant="error">
                        Este cobro es de una venta: se anula <strong>la proforma completa</strong>. Vuelve el stock al almacén, se anulan todos sus cobros y,
                        si tenía deuda, desaparece. No se puede deshacer.
                    </Alert>
                ) : doc === 'anticipo' ? (
                    <Alert variant="warning">
                        Se anula el <strong>anticipo del cliente</strong> y este ingreso deja de contar. Uno ya aplicado a una venta no se anula.
                    </Alert>
                ) : doc ? (
                    <Alert variant="warning">
                        Se anula este {movimiento.tipo === 'ingreso' ? 'cobro' : 'pago'} y <strong>la deuda recupera su saldo</strong>. Queda en la lista como{' '}
                        <strong>Anulado</strong>.
                    </Alert>
                ) : (
                    <Alert variant="warning">
                        Deja de contar en los totales de la caja, pero queda en la lista como <strong>Anulado</strong>.
                    </Alert>
                )}
                {efectivoCerrado && (
                    <Alert variant="warning">
                        Es efectivo de un turno ya cerrado: lo que esperaba el sistema en ese cierre se recalcula y la diferencia cambia.
                    </Alert>
                )}
                <Input label="Motivo (opcional)" placeholder="Ej: se registró dos veces" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            </div>
        </Modal>
    );
}
