import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import api from '../lib/api';
import { money } from '../lib/moneda';
import { useToast } from '../lib/toast';
import { Alert, Button, Input, Modal, SearchSelect } from './ui';

/** Hoy en la fecha local (no en UTC: de noche en Perú UTC ya es mañana). */
const hoy = () => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
};

/** Fecha "aaaa-mm-dd" + días, con fechas de calendario (sin husos horarios de por medio). */
const sumarDias = (fecha, dias) => {
    const [y, m, d] = String(fecha).split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + dias)).toISOString().slice(0, 10);
};

/**
 * Crea una letra nueva por renovación: se elige la letra que se renueva y se gira una nueva
 * por lo que le falta cobrar; la anterior queda cancelada, porque lo que debía ya se cobró o
 * pasó a la nueva. El aceptante, el aval y la cuenta a debitar se copian; aquí solo se dicen
 * las fechas.
 *
 *   letras      — las letras que se pueden renovar (por cobrar y con saldo)
 *   onRenovada  — (letraNueva) para abrir su PDF y recargar la lista.
 */
export default function LetraRenovarModal({ open, letras = [], onClose, onRenovada }) {
    const toast = useToast();
    const [letraId, setLetraId] = useState('');
    const [fechaGiro, setFechaGiro] = useState(hoy());
    const [vencimiento, setVencimiento] = useState('');
    const [lugar, setLugar] = useState('');
    const [guardando, setGuardando] = useState(false);
    const [error, setError] = useState(null);

    const letra = letras.find((l) => String(l.id) === String(letraId)) ?? null;

    // Al abrir: si solo hay una letra que renovar, ya viene elegida.
    useEffect(() => {
        if (!open) return;
        setLetraId(letras.length === 1 ? String(letras[0].id) : '');
        setFechaGiro(hoy());
        setVencimiento(sumarDias(hoy(), 30));
        setError(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    useEffect(() => {
        setLugar(letra?.lugar_giro ?? '');
    }, [letra]);

    const renovar = async () => {
        setGuardando(true);
        setError(null);
        try {
            const { data } = await api.post(`/letras-cambio/${letra.id}/renovar`, {
                fecha_giro: fechaGiro,
                fecha_vencimiento: vencimiento,
                lugar_giro: lugar || null,
            });
            toast.success(`Letra ${data.codigo} emitida. La letra ${letra.codigo} quedó cancelada.`);
            onRenovada?.(data);
            onClose();
        } catch (err) {
            const e = err.response?.data;
            setError(e?.errors ? Object.values(e.errors)[0]?.[0] : e?.message ?? 'No se pudo renovar la letra.');
        } finally {
            setGuardando(false);
        }
    };

    const saldo = Number(letra?.saldo) || 0;
    const pagado = Number(letra?.monto_pagado) || 0;

    return (
        <Modal
            open={open}
            onClose={onClose}
            title="Nueva letra por renovación"
            description="Se gira una letra nueva por lo que falta cobrar de otra, que queda cancelada"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>
                        Cancelar
                    </Button>
                    <Button onClick={renovar} loading={guardando} disabled={!letra || !fechaGiro || !vencimiento}>
                        <RefreshCw className="h-4 w-4" />
                        Crear nueva letra
                    </Button>
                </>
            }
        >
            <div className="space-y-4">
                {error && <Alert variant="error">{error}</Alert>}

                <SearchSelect
                    label="Letra que se renueva"
                    value={letraId}
                    onChange={(v) => setLetraId(v ?? '')}
                    placeholder={letras.length ? 'Elige la letra…' : 'No hay letras por cobrar con saldo'}
                    emptyText="Sin coincidencias"
                    options={letras.map((l) => ({
                        value: String(l.id),
                        label: `Letra ${l.codigo} · ${l.cliente?.nombre ?? l.aceptante_nombre} · saldo ${money(l.saldo, l.moneda)}`,
                    }))}
                />

                <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-lg border border-edge bg-gray-50 px-3 py-2">
                        <p className="text-xs uppercase tracking-wide text-warm-500">Importe</p>
                        <p className="font-semibold text-warm-900">{money(letra?.importe, letra?.moneda)}</p>
                    </div>
                    <div className="rounded-lg border border-edge bg-gray-50 px-3 py-2">
                        <p className="text-xs uppercase tracking-wide text-warm-500">Ya cobrado</p>
                        <p className="font-semibold text-green-600">{money(pagado, letra?.moneda)}</p>
                    </div>
                    <div className="rounded-lg border border-primary-200 bg-primary-50 px-3 py-2">
                        <p className="text-xs uppercase tracking-wide text-primary-700">Pasa a la nueva</p>
                        <p className="font-semibold text-primary-700">{money(saldo, letra?.moneda)}</p>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <Input label="Fecha de giro" type="date" value={fechaGiro} onChange={(e) => setFechaGiro(e.target.value)} />
                    <Input label="Nuevo vencimiento" type="date" min={fechaGiro} value={vencimiento} onChange={(e) => setVencimiento(e.target.value)} />
                </div>
                <Input label="Lugar de giro" value={lugar} onChange={(e) => setLugar(e.target.value)} placeholder="LA VICTORIA LIMA" />

                <Alert variant="info">
                    Se gira una letra nueva por {money(saldo, letra?.moneda)} con los mismos datos del aceptante y del aval. La letra {letra?.codigo} queda{' '}
                    <strong>cancelada</strong> y su saldo pasa a la nueva.
                </Alert>
            </div>
        </Modal>
    );
}
