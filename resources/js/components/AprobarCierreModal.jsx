import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import api from '../lib/api';
import { useToast } from '../lib/toast';
import { Alert, Badge, Button, Modal, Spinner } from './ui';

const money = (n, moneda = 'PEN') =>
    new Intl.NumberFormat('es-PE', { style: 'currency', currency: moneda || 'PEN' }).format(Number(n) || 0);

const fechaHora = (v) => (v ? new Date(v).toLocaleString('es-PE') : '—');

const metodoLabel = (m) => {
    if (m.cuenta_bancaria) return `Transf. · ${m.cuenta_bancaria.alias || m.cuenta_bancaria.numero_cuenta}`;
    if (m.billetera) return m.billetera.nombre;
    return 'Efectivo';
};

const Dato = ({ etiqueta, valor, destacado = false }) => (
    <div className="flex items-center justify-between gap-3 border-b border-gray-100 py-1.5 last:border-0">
        <span className="text-sm text-warm-500">{etiqueta}</span>
        <span className={destacado ? 'text-sm font-bold text-warm-900' : 'text-sm font-medium text-warm-800'}>{valor}</span>
    </div>
);

/**
 * Aprobar un cierre de caja: lo que se esperaba, lo que se contó, lo que se deja para el siguiente turno, lo que sale
 * (y a qué caja va) y los movimientos del turno. Se abre desde la alerta o desde Cierres de caja.
 */
export default function AprobarCierreModal({ open, cierreId, onClose, onDone }) {
    const toast = useToast();
    const [detalle, setDetalle] = useState(null);
    const [cargando, setCargando] = useState(false);
    const [guardando, setGuardando] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!open || !cierreId) return;
        setDetalle(null);
        setError(null);
        setCargando(true);
        api.get(`/cierres-caja/${cierreId}`)
            .then(({ data }) => setDetalle(data))
            .catch(() => setError('No se pudo cargar el cierre.'))
            .finally(() => setCargando(false));
    }, [open, cierreId]);

    const cierre = detalle?.cierre;
    const movimientos = (detalle?.movimientos ?? []).filter((m) => !m.deleted_at);
    const pendiente = cierre?.estado === 'pendiente';
    const dif = Number(cierre?.diferencia) || 0;

    const aprobar = async () => {
        setGuardando(true);
        setError(null);
        try {
            await api.post(`/cierres-caja/${cierreId}/aprobar`);
            toast.success('Cierre aprobado: la caja ya se puede abrir con lo que se dejó.');
            onDone?.();
            onClose();
        } catch (err) {
            const v = err.response?.data?.errors ?? {};
            setError(Object.values(v)[0]?.[0] ?? err.response?.data?.message ?? 'No se pudo aprobar el cierre.');
        } finally {
            setGuardando(false);
        }
    };

    return (
        <Modal
            open={open}
            onClose={onClose}
            title="Aprobar cierre de caja"
            description={cierre ? `${cierre.apertura?.caja?.codigo ? `${cierre.apertura.caja.codigo} · ` : ''}${cierre.apertura?.caja?.nombre ?? ''} · cerró ${cierre.apertura?.usuario?.name ?? ''}` : ''}
            size="md"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>Cerrar</Button>
                    {pendiente && (
                        <Button loading={guardando} onClick={aprobar}>
                            <Check className="h-4 w-4" /> Aprobar cierre
                        </Button>
                    )}
                </>
            }
        >
            {cargando && <div className="flex justify-center py-10"><Spinner size="lg" className="text-primary-600" /></div>}
            {error && <Alert variant="error" className="mb-3">{error}</Alert>}

            {cierre && (
                <div className="space-y-4">
                    {!pendiente && (
                        <Alert variant="info">Este cierre ya está <strong>{cierre.estado}</strong>.</Alert>
                    )}

                    <div className="rounded-lg border border-edge px-3">
                        <Dato etiqueta="Cerrado el" valor={fechaHora(cierre.fecha_cierre)} />
                        <Dato etiqueta="Efectivo esperado (sistema)" valor={money(cierre.monto_sistema)} />
                        <Dato etiqueta="Efectivo contado" valor={money(cierre.monto_contado)} destacado />
                        <Dato
                            etiqueta="Diferencia"
                            valor={
                                Math.abs(dif) < 0.005
                                    ? <Badge variant="green">Cuadró</Badge>
                                    : <Badge variant={dif < 0 ? 'red' : 'amber'}>{dif < 0 ? 'Faltante' : 'Sobrante'} {money(Math.abs(dif))}</Badge>
                            }
                        />
                        <Dato etiqueta="Deja para el siguiente turno" valor={money(cierre.monto_dejado ?? cierre.monto_contado)} destacado />
                        <Dato
                            etiqueta="Efectivo que sale de la caja"
                            valor={
                                <>
                                    {money(cierre.monto_retirado)}
                                    {cierre.caja_destino && (
                                        <span className="ml-2 text-xs font-normal text-warm-500">
                                            → {cierre.caja_destino.codigo ? `${cierre.caja_destino.codigo} · ` : ''}{cierre.caja_destino.nombre}
                                        </span>
                                    )}
                                </>
                            }
                            destacado
                        />
                    </div>

                    <div>
                        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-warm-500">Movimientos del turno ({movimientos.length})</p>
                        <div className="max-h-52 divide-y divide-gray-100 overflow-auto rounded-lg border border-edge text-sm">
                            {movimientos.length === 0 && <p className="px-3 py-4 text-center text-warm-500">Sin movimientos.</p>}
                            {movimientos.map((m) => (
                                <div key={m.id} className="flex items-center justify-between gap-3 px-3 py-1.5">
                                    <span className="min-w-0 truncate text-warm-700">
                                        <span className={m.tipo === 'ingreso' ? 'text-green-600' : 'text-red-600'}>{m.tipo === 'ingreso' ? '+' : '−'}</span>{' '}
                                        {m.motivo?.nombre ?? '—'} · {metodoLabel(m)}
                                    </span>
                                    <span className="shrink-0 font-medium text-warm-900">{money(m.monto, m.moneda)}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </Modal>
    );
}
