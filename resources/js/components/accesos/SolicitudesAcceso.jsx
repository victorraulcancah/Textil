import { useCallback, useEffect, useState } from 'react';
import { Check, Inbox, X } from 'lucide-react';
import api from '../../lib/api';
import { useToast } from '../../lib/toast';
import { Alert, Badge, Button, Modal, Spinner, cn } from '../ui';
import AlcanceFields, { mananaLocal } from './AlcanceFields';

const ESTADO = {
    pendiente: { label: 'Pendiente', variant: 'amber' },
    aprobada: { label: 'Aprobada', variant: 'green' },
    rechazada: { label: 'Rechazada', variant: 'red' },
};

const FILTROS = [
    { value: 'pendiente', label: 'Pendientes' },
    { value: '', label: 'Todas' },
];

const fecha = (valor) =>
    valor ? new Date(valor).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' }) : '';

/** Bandeja del administrador: aprobar (eligiendo el alcance) o rechazar lo que piden los usuarios. */
export default function SolicitudesAcceso({ onCambio }) {
    const toast = useToast();
    const [filtro, setFiltro] = useState('pendiente');
    const [lista, setLista] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    /** { solicitud, modo: 'aprobar' | 'rechazar' } */
    const [resolviendo, setResolviendo] = useState(null);

    const cargar = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const { data } = await api.get('/accesos/solicitudes', { params: filtro ? { estado: filtro } : {} });
            setLista(data?.data ?? []);
        } catch {
            setError('No se pudieron cargar las solicitudes.');
        } finally {
            setLoading(false);
        }
    }, [filtro]);

    useEffect(() => {
        cargar();
    }, [cargar]);

    const hecho = async () => {
        await cargar();
        onCambio?.();
    };

    return (
        <div className="space-y-4">
            <div className="flex gap-2">
                {FILTROS.map((f) => (
                    <button
                        key={f.value}
                        type="button"
                        onClick={() => setFiltro(f.value)}
                        className={cn(
                            'rounded-full px-3 py-1 text-sm font-medium ring-1 ring-inset transition',
                            f.value === filtro
                                ? 'bg-primary-50 text-primary-700 ring-primary-300'
                                : 'bg-white text-warm-600 ring-gray-300 hover:bg-gray-50',
                        )}
                    >
                        {f.label}
                    </button>
                ))}
            </div>

            {error && <Alert variant="error">{error}</Alert>}

            <section className="rounded-lg border border-edge bg-white shadow-sm">
                {loading ? (
                    <div className="flex items-center justify-center py-16">
                        <Spinner size="lg" className="text-primary-600" />
                    </div>
                ) : lista.length === 0 ? (
                    <p className="flex items-center justify-center gap-2 px-4 py-16 text-sm text-warm-400">
                        <Inbox className="h-4 w-4" />
                        {filtro ? 'No hay solicitudes pendientes.' : 'Aún no hay solicitudes.'}
                    </p>
                ) : (
                    <ul className="divide-y divide-edge">
                        {lista.map((s) => {
                            const estado = ESTADO[s.estado] ?? { label: s.estado, variant: 'gray' };
                            return (
                                <li key={s.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                                    <div className="min-w-0">
                                        <p className="text-sm font-medium text-warm-900">
                                            {s.usuario?.name}
                                            <span className="font-normal text-warm-500"> pide </span>
                                            {s.etiqueta}
                                        </p>
                                        <p className="mt-0.5 text-xs text-warm-400">{fecha(s.created_at)}</p>
                                        {s.motivo && <p className="mt-1 text-xs text-warm-500">“{s.motivo}”</p>}
                                        {s.estado !== 'pendiente' && (
                                            <p className="mt-1 text-xs text-warm-600">
                                                {s.resuelta_por?.name ?? 'Administrador'} · {fecha(s.resuelta_en)}
                                                {s.respuesta ? ` — ${s.respuesta}` : ''}
                                            </p>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Badge variant={estado.variant}>{estado.label}</Badge>
                                        {s.estado === 'pendiente' && (
                                            <>
                                                <Button size="sm" onClick={() => setResolviendo({ solicitud: s, modo: 'aprobar' })}>
                                                    <Check className="h-4 w-4" />
                                                    Aprobar
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="secondary"
                                                    onClick={() => setResolviendo({ solicitud: s, modo: 'rechazar' })}
                                                >
                                                    <X className="h-4 w-4" />
                                                    Rechazar
                                                </Button>
                                            </>
                                        )}
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </section>

            <ResolverModal
                resolviendo={resolviendo}
                onClose={() => setResolviendo(null)}
                onHecho={hecho}
                toast={toast}
            />
        </div>
    );
}

function ResolverModal({ resolviendo, onClose, onHecho, toast }) {
    const open = Boolean(resolviendo);
    const aprobar = resolviendo?.modo === 'aprobar';
    const s = resolviendo?.solicitud;

    const [alcance, setAlcance] = useState('una_vez');
    const [expiraEn, setExpiraEn] = useState(mananaLocal());
    const [respuesta, setRespuesta] = useState('');
    const [saving, setSaving] = useState(false);
    const [errors, setErrors] = useState({});

    useEffect(() => {
        if (open) {
            setAlcance('una_vez');
            setExpiraEn(mananaLocal());
            setRespuesta('');
            setErrors({});
        }
    }, [open, s?.id]);

    const enviar = async () => {
        setSaving(true);
        setErrors({});
        try {
            if (aprobar) {
                await api.post(`/accesos/solicitudes/${s.id}/aprobar`, {
                    alcance,
                    expira_en: alcance === 'temporal' ? expiraEn.replace('T', ' ') + ':00' : null,
                    respuesta: respuesta.trim() || null,
                });
                toast.success('Solicitud aprobada.');
            } else {
                await api.post(`/accesos/solicitudes/${s.id}/rechazar`, { respuesta: respuesta.trim() || null });
                toast.success('Solicitud rechazada.');
            }
            onClose();
            await onHecho();
        } catch (err) {
            if (err.response?.status === 422 && err.response.data?.errors) {
                const v = err.response.data.errors;
                setErrors(Object.fromEntries(Object.entries(v).map(([k, m]) => [k, m[0]])));
            } else {
                toast.error(err.response?.data?.message ?? 'No se pudo resolver la solicitud.');
                if (err.response?.status === 422) await onHecho();
            }
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal
            open={open}
            onClose={onClose}
            title={aprobar ? 'Aprobar solicitud' : 'Rechazar solicitud'}
            description={s ? `${s.usuario?.name} pide ${s.etiqueta}` : ''}
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>
                        Cancelar
                    </Button>
                    <Button variant={aprobar ? 'primary' : 'danger'} onClick={enviar} loading={saving}>
                        {aprobar ? 'Aprobar' : 'Rechazar'}
                    </Button>
                </>
            }
        >
            <div className="space-y-4">
                {aprobar && (
                    <AlcanceFields
                        alcance={alcance}
                        expiraEn={expiraEn}
                        onAlcance={setAlcance}
                        onExpiraEn={setExpiraEn}
                        error={errors.expira_en}
                    />
                )}
                <div>
                    <label htmlFor="respuesta-acceso" className="mb-1 block text-sm font-medium text-gray-700">
                        Comentario <span className="font-normal text-gray-400">(opcional, lo verá quien lo pidió)</span>
                    </label>
                    <textarea
                        id="respuesta-acceso"
                        rows={2}
                        maxLength={500}
                        value={respuesta}
                        onChange={(e) => setRespuesta(e.target.value)}
                        className="block w-full rounded-md border-0 px-3 py-2 text-sm text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-primary-600"
                    />
                </div>
            </div>
        </Modal>
    );
}
