import { useCallback, useEffect, useState } from 'react';
import { KeyRound, Plus, ShieldOff } from 'lucide-react';
import api from '../../lib/api';
import { useToast } from '../../lib/toast';
import { Alert, Badge, Button, Modal, SearchSelect, Spinner } from '../ui';
import AlcanceFields, { mananaLocal, textoVigencia } from './AlcanceFields';

const ESTADO = {
    vigente: { label: 'Vigente', variant: 'green' },
    usada: { label: 'Usada', variant: 'gray' },
    vencida: { label: 'Vencida', variant: 'gray' },
    revocada: { label: 'Revocada', variant: 'red' },
};

const fecha = (valor) =>
    valor ? new Date(valor).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' }) : '';

/**
 * Excepciones por persona: permisos concedidos a alguien por encima de lo que
 * le dan sus roles (una vez, por un tiempo o permanentes).
 */
export default function AccesosPorPersona() {
    const toast = useToast();

    const [usuarios, setUsuarios] = useState([]);
    const [arbol, setArbol] = useState([]);
    const [usuarioId, setUsuarioId] = useState('');
    const [persona, setPersona] = useState(null);
    const [excepciones, setExcepciones] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const [abierto, setAbierto] = useState(false);
    const [revocando, setRevocando] = useState(null);

    useEffect(() => {
        api.get('/usuarios-selector').then(({ data }) => setUsuarios(data ?? [])).catch(() => {});
        api.get('/mi-acceso').then(({ data }) => setArbol(data?.arbol ?? [])).catch(() => {});
    }, []);

    const cargar = useCallback(async () => {
        if (!usuarioId) {
            setExcepciones([]);
            setPersona(null);
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const { data } = await api.get('/accesos/excepciones', { params: { usuario_id: usuarioId } });
            setExcepciones(data ?? []);
            // Los roles son un dato de contexto: si no puede ver usuarios, se omiten.
            api.get(`/users/${usuarioId}`).then((r) => setPersona(r.data)).catch(() => setPersona(null));
        } catch {
            setError('No se pudieron cargar los accesos de esta persona.');
        } finally {
            setLoading(false);
        }
    }, [usuarioId]);

    useEffect(() => {
        cargar();
    }, [cargar]);

    const revocar = async (e) => {
        setRevocando(e.id);
        try {
            await api.delete(`/accesos/excepciones/${e.id}`);
            toast.success('Acceso revocado.');
            await cargar();
        } catch (err) {
            toast.error(err.response?.data?.message ?? 'No se pudo revocar el acceso.');
        } finally {
            setRevocando(null);
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
                <div className="w-full sm:w-80">
                    <SearchSelect
                        label="Persona"
                        value={usuarioId}
                        onChange={(v) => setUsuarioId(v ?? '')}
                        placeholder="Elige un usuario…"
                        emptyText="Sin coincidencias"
                        options={usuarios.map((u) => ({ value: String(u.id), label: u.name }))}
                    />
                </div>
                <Button disabled={!usuarioId} onClick={() => setAbierto(true)}>
                    <Plus className="h-4 w-4" />
                    Conceder acceso
                </Button>
            </div>

            {error && <Alert variant="error">{error}</Alert>}

            {!usuarioId ? (
                <div className="rounded-lg border border-edge bg-white px-4 py-16 text-center text-sm text-warm-400 shadow-sm">
                    Elige una persona para ver y conceder accesos propios, por encima de sus roles.
                </div>
            ) : loading ? (
                <div className="flex items-center justify-center py-16">
                    <Spinner size="lg" className="text-primary-600" />
                </div>
            ) : (
                <section className="rounded-lg border border-edge bg-white shadow-sm">
                    <div className="flex flex-wrap items-center gap-2 border-b border-edge px-4 py-3 text-sm">
                        <span className="font-semibold text-warm-900">
                            {usuarios.find((u) => String(u.id) === String(usuarioId))?.name}
                        </span>
                        {persona?.roles?.map((r) => (
                            <Badge key={r.id} variant="blue">
                                {r.name}
                            </Badge>
                        ))}
                        {persona && !persona.roles?.length && <Badge variant="gray">Sin rol</Badge>}
                    </div>

                    {excepciones.length === 0 ? (
                        <p className="flex items-center justify-center gap-2 px-4 py-12 text-sm text-warm-400">
                            <ShieldOff className="h-4 w-4" />
                            Sin accesos especiales: solo tiene lo que le dan sus roles.
                        </p>
                    ) : (
                        <ul className="divide-y divide-edge">
                            {excepciones.map((e) => {
                                const estado = ESTADO[e.estado] ?? { label: e.estado, variant: 'gray' };
                                return (
                                    <li key={e.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                                        <div className="min-w-0">
                                            <p className="flex items-center gap-2 text-sm font-medium text-warm-900">
                                                <KeyRound className="h-4 w-4 shrink-0 text-primary-600" />
                                                {e.etiqueta}
                                            </p>
                                            <p className="mt-0.5 text-xs text-warm-500">
                                                {textoVigencia(e)} · concedido
                                                {e.concedido_por?.name ? ` por ${e.concedido_por.name}` : ''} el {fecha(e.created_at)}
                                            </p>
                                            {e.motivo && <p className="mt-0.5 text-xs text-warm-400">“{e.motivo}”</p>}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Badge variant={estado.variant}>{estado.label}</Badge>
                                            {e.estado === 'vigente' && (
                                                <Button
                                                    variant="secondary"
                                                    size="sm"
                                                    loading={revocando === e.id}
                                                    onClick={() => revocar(e)}
                                                >
                                                    Revocar
                                                </Button>
                                            )}
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </section>
            )}

            <ConcederModal
                open={abierto}
                usuarioId={usuarioId}
                arbol={arbol}
                onClose={() => setAbierto(false)}
                onHecho={cargar}
            />
        </div>
    );
}

function ConcederModal({ open, usuarioId, arbol, onClose, onHecho }) {
    const toast = useToast();
    const [moduloKey, setModuloKey] = useState('');
    const [submoduloKey, setSubmoduloKey] = useState('');
    const [permiso, setPermiso] = useState('');
    const [alcance, setAlcance] = useState('una_vez');
    const [expiraEn, setExpiraEn] = useState(mananaLocal());
    const [motivo, setMotivo] = useState('');
    const [saving, setSaving] = useState(false);
    const [errors, setErrors] = useState({});

    useEffect(() => {
        if (open) {
            setModuloKey('');
            setSubmoduloKey('');
            setPermiso('');
            setAlcance('una_vez');
            setExpiraEn(mananaLocal());
            setMotivo('');
            setErrors({});
        }
    }, [open]);

    const modulo = arbol.find((m) => m.key === moduloKey);
    const submodulo = modulo?.submodulos.find((s) => s.key === submoduloKey);

    const conceder = async () => {
        setSaving(true);
        setErrors({});
        try {
            await api.post('/accesos/excepciones', {
                usuario_id: Number(usuarioId),
                permiso,
                alcance,
                expira_en: alcance === 'temporal' ? expiraEn.replace('T', ' ') + ':00' : null,
                motivo: motivo.trim() || null,
            });
            toast.success('Acceso concedido.');
            onClose();
            await onHecho();
        } catch (err) {
            if (err.response?.status === 422) {
                const v = err.response.data?.errors ?? {};
                setErrors(Object.fromEntries(Object.entries(v).map(([k, m]) => [k, m[0]])));
            } else {
                toast.error(err.response?.data?.message ?? 'No se pudo conceder el acceso.');
            }
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal
            open={open}
            onClose={onClose}
            title="Conceder acceso"
            description="Un permiso por encima de los roles de la persona"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>
                        Cancelar
                    </Button>
                    <Button onClick={conceder} loading={saving} disabled={!permiso}>
                        Conceder
                    </Button>
                </>
            }
        >
            <div className="space-y-4">
                <SearchSelect
                    label="Módulo"
                    value={moduloKey}
                    onChange={(v) => {
                        setModuloKey(v ?? '');
                        setSubmoduloKey('');
                        setPermiso('');
                    }}
                    placeholder="Elige un módulo…"
                    emptyText="Sin coincidencias"
                    options={arbol.map((m) => ({ value: m.key, label: m.label }))}
                />
                <SearchSelect
                    label="Pantalla"
                    value={submoduloKey}
                    onChange={(v) => {
                        setSubmoduloKey(v ?? '');
                        setPermiso('');
                    }}
                    placeholder={modulo ? 'Elige una pantalla…' : 'Primero el módulo'}
                    emptyText="Sin coincidencias"
                    options={(modulo?.submodulos ?? []).map((s) => ({ value: s.key, label: s.label }))}
                />
                <SearchSelect
                    label="Acción"
                    value={permiso}
                    onChange={(v) => setPermiso(v ?? '')}
                    placeholder={submodulo ? 'Elige una acción…' : 'Primero la pantalla'}
                    emptyText="Sin coincidencias"
                    options={(submodulo?.acciones ?? []).map((a) => ({ value: a.permiso, label: a.label }))}
                    error={errors.permiso}
                />
                <AlcanceFields
                    alcance={alcance}
                    expiraEn={expiraEn}
                    onAlcance={setAlcance}
                    onExpiraEn={setExpiraEn}
                    error={errors.expira_en}
                />
                <div>
                    <label htmlFor="motivo-conceder" className="mb-1 block text-sm font-medium text-gray-700">
                        Motivo <span className="font-normal text-gray-400">(opcional)</span>
                    </label>
                    <textarea
                        id="motivo-conceder"
                        rows={2}
                        maxLength={500}
                        value={motivo}
                        onChange={(e) => setMotivo(e.target.value)}
                        className="block w-full rounded-md border-0 px-3 py-2 text-sm text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-primary-600"
                    />
                </div>
            </div>
        </Modal>
    );
}
