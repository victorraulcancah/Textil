import { useEffect, useState } from 'react';
import api from '../lib/api';
import { useToast } from '../lib/toast';
import MetodoCajaPicker from './MetodoCajaPicker';
import { Alert, Button, Input, Modal } from './ui';

const money = (n, moneda = 'PEN') =>
    new Intl.NumberFormat('es-PE', { style: 'currency', currency: moneda || 'PEN' }).format(Number(n) || 0);

const metodoLabel = (row) => {
    if (row.cuenta_bancaria) return `Transf. · ${row.cuenta_bancaria.alias || row.cuenta_bancaria.numero_cuenta}`;
    if (row.billetera) return row.billetera.nombre;
    return 'Efectivo';
};

/** ¿Es un cobro o pago al que se le puede cambiar el método? (de una venta o de una cuenta por cobrar o pagar) */
export const esCambiableDeMetodo = (m) =>
    !m.deleted_at && ['nota_venta', 'cuenta_por_cobrar', 'cuenta_por_pagar'].includes(m.documento_referencia_tipo);

/**
 * Cambia el método de un cobro ya registrado: se anotó efectivo y en realidad fue una transferencia. El monto, el documento y
 * el día no cambian; solo si entró por el cajón o por el banco. Lo usa Cierres de caja (quien gestiona los cierres).
 */
export default function CambiarMetodoModal({ movimiento, url, cuentas = [], billeteras = [], onClose, onDone }) {
    const toast = useToast();
    const [m, setM] = useState({ tipo: '', cuentaId: '', billeteraId: '' });
    const [referencia, setReferencia] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (movimiento) {
            setM({ tipo: '', cuentaId: '', billeteraId: '' });
            setReferencia(movimiento.numero_operacion ?? '');
        }
    }, [movimiento]);

    if (!movimiento) return null;

    const turnoCerrado = movimiento.apertura?.estado !== 'abierta';
    const eraEfectivo = !movimiento.cuenta_bancaria && !movimiento.billetera;

    const guardar = async () => {
        if (!m.tipo) {
            toast.error('Elige el método correcto.');
            return;
        }
        setSaving(true);
        try {
            const res = await api.post(url, {
                forma: m.tipo,
                cuenta_bancaria_id: m.tipo === 'transferencia' ? m.cuentaId || null : null,
                billetera_id: m.tipo === 'billetera' ? m.billeteraId || null : null,
                numero_operacion: m.tipo !== 'efectivo' ? referencia.trim() || null : null,
            });
            toast.success('Método de pago corregido.');
            onDone(res.data);
        } catch (err) {
            const v = err.response?.data?.errors ?? {};
            toast.error(Object.values(v)[0]?.[0] ?? err.response?.data?.message ?? 'No se pudo cambiar el método.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal
            open
            onClose={onClose}
            title="Cambiar método de pago"
            description={`${movimiento.descripcion || 'Cobro'} · ${money(movimiento.monto, movimiento.moneda)} · hoy figura como ${metodoLabel(movimiento)}`}
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>Cancelar</Button>
                    <Button loading={saving} onClick={guardar}>Guardar método</Button>
                </>
            }
        >
            <div className="space-y-4">
                <Alert variant="info">
                    Solo cambia cómo se cobró: el monto, el documento y el día quedan igual.
                    {turnoCerrado && (
                        <>
                            {' '}Es de un turno <strong>ya cerrado</strong>
                            {eraEfectivo ? ': ese efectivo sale del arqueo de ese turno' : ''}; lo que esperaba el sistema en el cierre se recalcula y la diferencia
                            cambia.
                        </>
                    )}
                </Alert>
                <MetodoCajaPicker
                    cuentas={cuentas}
                    billeteras={billeteras}
                    aceptaEfectivo
                    tipo={m.tipo}
                    cuentaId={m.cuentaId}
                    billeteraId={m.billeteraId}
                    onChange={({ tipo, cuentaId, billeteraId }) => setM({ tipo, cuentaId, billeteraId })}
                    referencia={referencia}
                    onReferencia={setReferencia}
                />
            </div>
        </Modal>
    );
}
