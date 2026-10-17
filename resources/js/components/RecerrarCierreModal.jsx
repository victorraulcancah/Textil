import { useEffect, useState } from 'react';
import api, { asList } from '../lib/api';
import { useToast } from '../lib/toast';
import { Alert, Button, Input, Modal, Select } from './ui';

const money = (n, moneda = 'PEN') =>
    new Intl.NumberFormat('es-PE', { style: 'currency', currency: moneda }).format(Number(n) || 0);
const redondear = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Recierre: corrige lo que se contó en un cierre ya hecho —lo que sale de la caja, lo que se deja, los dólares y la
 * caja destino— sin reabrir la caja. El cierre vuelve a quedar pendiente de aprobación.
 */
export default function RecerrarCierreModal({ cierre, onClose, onDone }) {
    const toast = useToast();
    const [montoEnvio, setMontoEnvio] = useState('');
    const [montoDejado, setMontoDejado] = useState('');
    const [contadoUsd, setContadoUsd] = useState('');
    const [cajaDestino, setCajaDestino] = useState('');
    const [motivo, setMotivo] = useState('');
    const [cajas, setCajas] = useState([]);
    const [saving, setSaving] = useState(false);
    const [errores, setErrores] = useState({});

    // Al abrir, el formulario arranca con lo que tiene el cierre.
    useEffect(() => {
        if (!cierre) return;
        const contado = Number(cierre.monto_contado) || 0;
        // Los cierres antiguos no guardaban cuánto se dejó: dejaban todo lo contado.
        const dejado = cierre.monto_dejado != null ? Number(cierre.monto_dejado) : contado;
        setMontoEnvio(String(redondear(contado - dejado)));
        setMontoDejado(String(redondear(dejado)));
        setContadoUsd(cierre.monto_contado_usd != null ? String(cierre.monto_contado_usd) : '');
        setCajaDestino(cierre.caja_destino_id ? String(cierre.caja_destino_id) : '');
        setMotivo('');
        setErrores({});
        api.get(`/cierres-caja/${cierre.id}/cajas-destino`)
            .then((res) => setCajas(asList(res)))
            .catch(() => setCajas([]));
    }, [cierre]);

    if (!cierre) return null;

    const contadoTotal = redondear((Number(montoEnvio) || 0) + (Number(montoDejado) || 0));
    const diferencia = redondear(contadoTotal - (Number(cierre.monto_sistema) || 0));
    const tieneDolares = cierre.monto_sistema_usd != null && Math.abs(Number(cierre.monto_sistema_usd)) > 0.005;
    const diferenciaUsd = redondear((Number(contadoUsd) || 0) - (Number(cierre.monto_sistema_usd) || 0));
    const origen = cierre.apertura?.caja;

    const guardar = async () => {
        if (motivo.trim().length < 3) {
            setErrores({ motivo: 'Escribe por qué se corrige el cierre.' });
            return;
        }
        if (cajaDestino && !(Number(montoEnvio) > 0)) {
            setErrores({ caja_destino_id: 'No hay efectivo que enviar: escribe cuánto sale de la caja.' });
            return;
        }
        setSaving(true);
        setErrores({});
        try {
            await api.post(`/cierres-caja/${cierre.id}/recerrar`, {
                monto_contado: contadoTotal,
                monto_dejado: Number(montoDejado) || 0,
                ...(tieneDolares || contadoUsd !== '' ? { monto_contado_usd: Number(contadoUsd) || 0 } : {}),
                caja_destino_id: cajaDestino ? Number(cajaDestino) : null,
                motivo: motivo.trim(),
            });
            toast.success('Cierre corregido: queda pendiente de aprobación.');
            onDone?.();
            onClose();
        } catch (err) {
            const v = err.response?.data?.errors ?? {};
            if (Object.keys(v).length) setErrores(Object.fromEntries(Object.entries(v).map(([k, m]) => [k, m[0]])));
            toast.error(Object.values(v)[0]?.[0] ?? err.response?.data?.message ?? 'No se pudo corregir el cierre.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal
            open
            onClose={onClose}
            title="Recierre de caja"
            description={`${origen?.codigo ? `${origen.codigo} · ` : ''}${origen?.nombre ?? ''} · ${cierre.apertura?.usuario?.name ?? ''}`}
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>Cancelar</Button>
                    <Button loading={saving} onClick={guardar}>Guardar recierre</Button>
                </>
            }
        >
            <div className="space-y-4">
                <Alert variant="warning">
                    Corriges lo que se contó sin reabrir la caja. El retiro y el ingreso en la caja destino se rehacen con lo nuevo y el cierre vuelve a
                    quedar <strong>pendiente de aprobación</strong>. Si la caja ya abrió otro turno, el saldo con el que abrió no cambia.
                </Alert>

                <div className="grid grid-cols-2 gap-3">
                    <Input
                        label="Efectivo que sale de la caja (S/)"
                        type="number"
                        min="0"
                        step="0.01"
                        value={montoEnvio}
                        onChange={(e) => setMontoEnvio(e.target.value)}
                    />
                    <Input
                        label="Efectivo que se deja (S/)"
                        type="number"
                        min="0"
                        step="0.01"
                        value={montoDejado}
                        onChange={(e) => setMontoDejado(e.target.value)}
                        error={errores.monto_dejado}
                    />
                </div>

                {tieneDolares && (
                    <Input
                        label={`Dólares contados (el sistema esperaba ${money(cierre.monto_sistema_usd, 'USD')})`}
                        type="number"
                        min="0"
                        step="0.01"
                        value={contadoUsd}
                        onChange={(e) => setContadoUsd(e.target.value)}
                        error={errores.monto_contado_usd}
                    />
                )}

                <Select
                    label="Caja a la que se envía el efectivo (opcional)"
                    value={cajaDestino}
                    onChange={(e) => setCajaDestino(e.target.value)}
                    options={[
                        { value: '', label: 'Ninguna: el efectivo se retira' },
                        ...cajas.map((c) => ({
                            value: String(c.id),
                            label: `${c.codigo ? `${c.codigo} · ` : ''}${c.nombre}${c.abierta ? '' : ' (cerrada: no puede recibir)'}`,
                        })),
                    ]}
                    error={errores.caja_destino_id}
                />

                <div className="rounded-lg bg-gray-50 px-3 py-2.5 text-sm">
                    <div className="flex justify-between"><span className="text-warm-500">Esperado por el sistema</span><span className="font-medium">{money(cierre.monto_sistema)}</span></div>
                    <div className="flex justify-between"><span className="text-warm-500">Contado (sale + se deja)</span><span className="font-medium">{money(contadoTotal)}</span></div>
                    <div className="flex justify-between border-t border-edge pt-1">
                        <span className="text-warm-500">Diferencia</span>
                        <span className={`font-bold ${Math.abs(diferencia) < 0.005 ? 'text-green-600' : 'text-red-600'}`}>
                            {Math.abs(diferencia) < 0.005 ? 'Cuadra' : money(diferencia)}
                        </span>
                    </div>
                    {tieneDolares && (
                        <div className="flex justify-between">
                            <span className="text-warm-500">Diferencia en dólares</span>
                            <span className={`font-bold ${Math.abs(diferenciaUsd) < 0.005 ? 'text-green-600' : 'text-red-600'}`}>
                                {Math.abs(diferenciaUsd) < 0.005 ? 'Cuadra' : money(diferenciaUsd, 'USD')}
                            </span>
                        </div>
                    )}
                </div>

                <Input
                    label="Motivo de la corrección"
                    placeholder="Ej: se contó mal el efectivo"
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    error={errores.motivo}
                />
            </div>
        </Modal>
    );
}
