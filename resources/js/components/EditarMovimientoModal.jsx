import { useEffect, useState } from 'react';
import api from '../lib/api';
import { hoyIso } from '../lib/fechas';
import { useToast } from '../lib/toast';
import MetodoCajaPicker from './MetodoCajaPicker';
import { Alert, Button, Input, Modal, SearchSelect } from './ui';

const money = (n, moneda = 'PEN') =>
    new Intl.NumberFormat('es-PE', { style: 'currency', currency: moneda || 'PEN' }).format(Number(n) || 0);

const metodoLabel = (row) => {
    if (row.cuenta_bancaria) return `Transf. · ${row.cuenta_bancaria.alias || row.cuenta_bancaria.numero_cuenta}`;
    if (row.billetera) return row.billetera.nombre;
    return 'Efectivo';
};

/** De dónde nace el movimiento decide qué se puede cambiar al editarlo. */
export const claseDeEdicion = (r) => {
    const doc = r.documento_referencia_tipo;
    if (!doc) return 'manual'; // ingreso o gasto a mano: todo
    if (doc === 'cuenta_por_cobrar' || doc === 'cuenta_por_pagar') return 'cuenta'; // fecha, descripción y N.° de operación
    if (doc === 'nota_venta') return 'venta'; // solo la fecha de los cobros
    if (doc === 'anticipo') return 'anticipo'; // fecha y N.° de operación
    return 'descripcion'; // compra o letra: solo la descripción
};

const formDe = (m) => ({
    fecha: String(m.fecha ?? '').slice(0, 10),
    descripcion: m.descripcion ?? '',
    numero_operacion: m.numero_operacion ?? '',
    motivo_movimiento_id: m.motivo_movimiento_id ? String(m.motivo_movimiento_id) : '',
    metodoTipo: m.cuenta_bancaria_id ? 'transferencia' : m.billetera_id ? 'billetera' : 'efectivo',
    cuentaId: m.cuenta_bancaria_id ? String(m.cuenta_bancaria_id) : '',
    billeteraId: m.billetera_id ? String(m.billetera_id) : '',
    monto: String(m.monto ?? ''),
});

/**
 * Editar un movimiento de caja: lo que se puede cambiar depende de dónde nace (a mano, cobro de una cuenta, cobro de
 * una venta, anticipo, compra o letra). Lo usan Mi Caja y Cierres de caja.
 *
 *   url:     a dónde se manda la edición (POST); responde con lo que `onDone` recibe
 *   gestor:  quien gestiona los cierres también cambia el monto y el método del efectivo de un turno ya cerrado
 *   cuentas, billeteras, aceptaEfectivo, motivos: lo que ofrece el selector de método y de motivo
 */
export default function EditarMovimientoModal({ movimiento, url, gestor = false, cuentas = [], billeteras = [], aceptaEfectivo = true, motivos = [], onClose, onDone }) {
    const toast = useToast();
    const [f, setF] = useState({});
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (movimiento) setF(formDe(movimiento));
    }, [movimiento]);

    if (!movimiento) return null;

    const clase = claseDeEdicion(movimiento);
    const set = (patch) => setF((prev) => ({ ...prev, ...patch }));
    const esDigitalOriginal = Boolean(movimiento.cuenta_bancaria || movimiento.billetera);
    const turnoCerrado = movimiento.apertura?.estado !== 'abierta';
    // Un movimiento en efectivo de una caja ya cerrada: el monto y el método ya se contaron en el arqueo.
    const bloqueaDinero = turnoCerrado && !esDigitalOriginal && !gestor;
    const motivosDelTipo = motivos.filter((m) => !m.es_sistema && (movimiento.tipo === 'ingreso' ? m.tipo === 'entrada' : m.tipo === 'salida'));
    // El motivo que ya tiene siempre se ve, aunque la lista no lo traiga.
    if (movimiento.motivo && !motivosDelTipo.some((m) => m.id === movimiento.motivo.id)) motivosDelTipo.unshift(movimiento.motivo);
    const digitalNuevo = f.metodoTipo === 'transferencia' || f.metodoTipo === 'billetera';
    const hayOperacion = clase === 'manual' ? digitalNuevo : esDigitalOriginal;
    const hayFecha = clase !== 'descripcion';
    const hayDescripcion = clase !== 'venta' && clase !== 'anticipo';

    const guardar = async () => {
        const cuerpo =
            clase === 'manual'
                ? {
                      fecha: f.fecha || null,
                      descripcion: f.descripcion,
                      numero_operacion: f.numero_operacion || null,
                      motivo_movimiento_id: f.motivo_movimiento_id || null,
                      forma: f.metodoTipo,
                      cuenta_bancaria_id: f.metodoTipo === 'transferencia' ? f.cuentaId || null : null,
                      billetera_id: f.metodoTipo === 'billetera' ? f.billeteraId || null : null,
                      monto: Number(f.monto),
                  }
                : clase === 'cuenta'
                  ? { fecha: f.fecha || null, descripcion: f.descripcion, numero_operacion: f.numero_operacion || null }
                  : clase === 'venta'
                    ? { fecha: f.fecha || null }
                    : clase === 'anticipo'
                      ? { fecha: f.fecha || null, numero_operacion: f.numero_operacion || null }
                      : { descripcion: f.descripcion };

        setSaving(true);
        try {
            const res = await api.post(url, cuerpo);
            toast.success('Movimiento actualizado.');
            onDone(res.data);
        } catch (err) {
            const v = err.response?.data?.errors ?? {};
            toast.error(Object.values(v)[0]?.[0] ?? err.response?.data?.message ?? 'No se pudo editar el movimiento.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal
            open
            onClose={onClose}
            title="Editar movimiento"
            description={`${movimiento.tipo === 'ingreso' ? 'Ingreso' : 'Gasto'} de ${money(movimiento.monto, movimiento.moneda)} · ${metodoLabel(movimiento)}`}
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>Cancelar</Button>
                    <Button loading={saving} onClick={guardar}>Guardar cambios</Button>
                </>
            }
        >
            <div className="space-y-4">
                {clase === 'venta' && (
                    <Alert variant="info">
                        Este cobro es de una venta: la fecha se cambia en todos sus cobros a la vez. El monto y el método se cambian con
                        <strong> Corregir pago</strong>.
                    </Alert>
                )}
                {clase === 'anticipo' && (
                    <Alert variant="info">
                        Este ingreso es de un anticipo de cliente: aquí cambias la fecha y el N.° de operación. El monto y el método se cambian
                        anulando el anticipo y registrando otro.
                    </Alert>
                )}
                {clase === 'cuenta' && (
                    <Alert variant="info">Aquí cambias la fecha y los datos. Para cambiar el monto o el método, anula el pago y regístralo de nuevo.</Alert>
                )}
                {clase === 'descripcion' && (
                    <Alert variant="info">
                        Este movimiento nace de una {movimiento.documento_referencia_tipo === 'compra' ? 'compra' : 'letra de cambio'}: aquí solo se cambia la
                        descripción; el resto, desde su documento.
                    </Alert>
                )}
                {bloqueaDinero && clase === 'manual' && (
                    <Alert variant="warning">
                        Es efectivo de una caja ya cerrada: el monto y el método ya se contaron en el arqueo y no cambian. Puedes cambiar la fecha y la
                        descripción.
                    </Alert>
                )}
                {gestor && turnoCerrado && !esDigitalOriginal && clase === 'manual' && (
                    <Alert variant="warning">
                        Es efectivo de un turno ya cerrado: al cambiarlo, lo que esperaba el sistema en ese cierre se recalcula y la diferencia cambia.
                    </Alert>
                )}

                {clase === 'manual' && (
                    <SearchSelect
                        label="Motivo"
                        value={f.motivo_movimiento_id}
                        onChange={(v) => set({ motivo_movimiento_id: v ?? '' })}
                        placeholder="Selecciona un motivo"
                        emptyText="Sin coincidencias"
                        options={motivosDelTipo.map((m) => ({ value: String(m.id), label: m.nombre }))}
                    />
                )}

                {clase === 'manual' && !bloqueaDinero && (
                    <>
                        <MetodoCajaPicker
                            cuentas={cuentas}
                            billeteras={billeteras}
                            aceptaEfectivo={aceptaEfectivo && (!turnoCerrado || gestor)}
                            tipo={f.metodoTipo}
                            cuentaId={f.cuentaId}
                            billeteraId={f.billeteraId}
                            onChange={({ tipo, cuentaId, billeteraId }) => set({ metodoTipo: tipo, cuentaId, billeteraId })}
                        />
                        <Input label="Monto" type="number" min="0.01" step="0.01" value={f.monto} onChange={(e) => set({ monto: e.target.value })} />
                    </>
                )}

                {hayOperacion && clase !== 'venta' && (
                    <Input label="N° de operación (opcional)" value={f.numero_operacion} onChange={(e) => set({ numero_operacion: e.target.value })} />
                )}

                {hayFecha && <Input label="Fecha" type="date" max={hoyIso()} value={f.fecha} onChange={(e) => set({ fecha: e.target.value })} />}

                {hayDescripcion && (
                    <Input label="Descripción" placeholder="Ej: recibo de luz" value={f.descripcion} onChange={(e) => set({ descripcion: e.target.value })} />
                )}
            </div>
        </Modal>
    );
}
