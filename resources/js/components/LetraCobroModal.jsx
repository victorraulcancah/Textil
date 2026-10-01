import { useEffect, useState } from 'react';
import { Wallet } from 'lucide-react';
import api, { asList } from '../lib/api';
import { cargarTipoCambio, money } from '../lib/moneda';
import { useToast } from '../lib/toast';
import MetodoCajaPicker from './MetodoCajaPicker';
import { Alert, Button, Input, Modal } from './ui';

/** Hoy en la fecha local (no en UTC: de noche en Perú UTC ya es mañana). */
const hoy = () => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
};

const redondear = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Cobra una letra de cambio completa. Queda "pagada" y el cobro entra a caja como
 * un pago de la cuenta por cobrar de la que salió. Una letra en dólares se puede
 * cobrar con soles: se propone el tipo de cambio del día del cobro y se puede cambiar.
 */
export default function LetraCobroModal({ open, letra, onClose, onCobrada }) {
    const toast = useToast();
    const [cuentas, setCuentas] = useState([]);
    const [billeteras, setBilleteras] = useState([]);
    const [metodo, setMetodo] = useState({ tipo: 'efectivo', cuentaId: '', billeteraId: '' });
    const [fecha, setFecha] = useState(hoy());
    const [referencia, setReferencia] = useState('');
    const [enSoles, setEnSoles] = useState(false);
    const [tipoCambio, setTipoCambio] = useState('');
    const [guardando, setGuardando] = useState(false);
    const [error, setError] = useState(null);

    const enDolares = letra?.moneda && letra.moneda !== 'PEN';

    useEffect(() => {
        if (!open) return;
        setMetodo({ tipo: 'efectivo', cuentaId: '', billeteraId: '' });
        setFecha(hoy());
        setReferencia('');
        setEnSoles(false);
        setTipoCambio('');
        setError(null);
        Promise.all([api.get('/cuentas-bancarias'), api.get('/billeteras-digitales')])
            .then(([c, b]) => {
                setCuentas(asList(c));
                setBilleteras(asList(b));
            })
            .catch(() => {});
    }, [open]);

    // Al cobrar con soles se propone el tipo de cambio del día del cobro (el comercial, si ya se usó uno).
    useEffect(() => {
        if (!open || !enSoles || !fecha) return;
        let vigente = true;
        cargarTipoCambio(fecha)
            .then((tc) => vigente && setTipoCambio(String(tc?.comercial ?? tc?.venta ?? '')))
            .catch(() => {});
        return () => {
            vigente = false;
        };
    }, [open, enSoles, fecha]);

    const importe = Number(letra?.importe) || 0;
    const soles = enSoles && Number(tipoCambio) > 0 ? redondear(importe * Number(tipoCambio)) : null;

    const cobrar = async () => {
        setGuardando(true);
        setError(null);
        try {
            await api.post(`/letras-cambio/${letra.id}/cobrar`, {
                fecha,
                forma_pago: metodo.tipo,
                cuenta_bancaria_id: metodo.tipo === 'transferencia' ? metodo.cuentaId || null : null,
                billetera_id: metodo.tipo === 'billetera' ? metodo.billeteraId || null : null,
                referencia: referencia.trim() || null,
                ...(enSoles ? { moneda: 'PEN', tipo_cambio: Number(tipoCambio) } : {}),
            });
            toast.success(`Letra N° ${letra.numero} cobrada.`);
            onCobrada?.();
            onClose();
        } catch (err) {
            const e = err.response?.data;
            setError(e?.errors ? Object.values(e.errors)[0]?.[0] : e?.message ?? 'No se pudo cobrar la letra.');
        } finally {
            setGuardando(false);
        }
    };

    return (
        <Modal
            open={open}
            onClose={onClose}
            title="Cobrar letra de cambio"
            description={letra ? `Letra N° ${letra.numero} · ${letra.aceptante_nombre}` : ''}
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>
                        Cancelar
                    </Button>
                    <Button onClick={cobrar} loading={guardando} disabled={enSoles && !(Number(tipoCambio) > 0)}>
                        <Wallet className="h-4 w-4" />
                        Cobrar {enSoles && soles ? money(soles, 'PEN') : money(importe, letra?.moneda)}
                    </Button>
                </>
            }
        >
            <div className="space-y-4">
                {error && <Alert variant="error">{error}</Alert>}

                <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg border border-edge bg-gray-50 px-3 py-2">
                        <p className="text-xs uppercase tracking-wide text-warm-500">Importe de la letra</p>
                        <p className="text-lg font-semibold text-warm-900">{money(importe, letra?.moneda)}</p>
                    </div>
                    <Input label="Fecha del cobro" type="date" max={hoy()} value={fecha} onChange={(e) => setFecha(e.target.value)} />
                </div>

                <MetodoCajaPicker
                    cuentas={cuentas}
                    billeteras={billeteras}
                    tipo={metodo.tipo}
                    cuentaId={metodo.cuentaId}
                    billeteraId={metodo.billeteraId}
                    onChange={setMetodo}
                />

                {enDolares && (
                    <div className="space-y-2">
                        <div className="inline-flex rounded-lg border border-edge bg-gray-50 p-0.5">
                            {[
                                { v: false, label: 'Dólares' },
                                { v: true, label: 'Soles' },
                            ].map((o) => (
                                <button
                                    key={String(o.v)}
                                    type="button"
                                    onClick={() => setEnSoles(o.v)}
                                    className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
                                        enSoles === o.v ? 'bg-white text-primary-700 shadow-sm' : 'text-warm-500 hover:text-warm-700'
                                    }`}
                                >
                                    {o.label}
                                </button>
                            ))}
                        </div>
                        {enSoles && (
                            <div className="flex items-end gap-3">
                                <div className="w-36">
                                    <Input label="Tipo de cambio" type="number" min="0" step="0.0001" value={tipoCambio} onChange={(e) => setTipoCambio(e.target.value)} className="text-right" />
                                </div>
                                <p className="pb-2 text-sm text-warm-600">{soles ? `= ${money(soles, 'PEN')} en soles` : 'Pon el tipo de cambio del día'}</p>
                            </div>
                        )}
                    </div>
                )}

                <Input label="Referencia (opcional)" value={referencia} onChange={(e) => setReferencia(e.target.value)} placeholder="N° de operación" />
            </div>
        </Modal>
    );
}
