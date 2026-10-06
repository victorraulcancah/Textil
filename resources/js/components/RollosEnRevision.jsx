import { useCallback, useEffect, useState } from 'react';
import { PackageSearch } from 'lucide-react';
import api, { asList } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import { Alert, Badge, Button, Modal, Select, Input } from './ui';

const num = (n) => new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 }).format(Number(n) || 0);

/**
 * Los rollos que no se encontraron al preparar un pedido: quedan bloqueados "en revisión" (no se ofrecen como
 * disponibles). Aquí se resuelve cada uno: apareció (vuelve a estar disponible) o se confirma que se perdió (se registra
 * el ajuste de inventario por todo su metraje, con su motivo). La entrega del pedido no depende de esto.
 *
 *   almacenId — solo los de ese almacén ('' = todos)
 *   onCambio  — se llama al resolver uno, para refrescar el stock de la pantalla
 */
export default function RollosEnRevision({ almacenId = '', onCambio }) {
    const toast = useToast();
    const { puede } = useAuth();
    const puedeResolver = puede('inventario.rollos.editar');

    const [rollos, setRollos] = useState([]);
    const [abierto, setAbierto] = useState(false);
    const [perdido, setPerdido] = useState(null); // el rollo cuya pérdida se confirma
    const [motivos, setMotivos] = useState(null);
    const [form, setForm] = useState({ motivo: '', observaciones: '' });
    const [guardando, setGuardando] = useState(false);

    const cargar = useCallback(async () => {
        try {
            const { data } = await api.get('/rollos', { params: { estado: 'en_revision', almacen_id: almacenId || undefined } });
            setRollos(asList({ data }));
        } catch {
            setRollos([]);
        }
    }, [almacenId]);

    useEffect(() => {
        cargar();
    }, [cargar]);

    const resuelto = async () => {
        await cargar();
        onCambio?.();
    };

    const aparecio = async (rollo) => {
        setGuardando(true);
        try {
            await api.post(`/rollos/${rollo.id}/revision-aparecio`);
            toast.success(`${rollo.codigo} apareció: vuelve a estar disponible.`);
            await resuelto();
        } catch (err) {
            toast.error(err.response?.data?.message ?? 'No se pudo devolver el rollo a disponible.');
        } finally {
            setGuardando(false);
        }
    };

    const abrirPerdido = async (rollo) => {
        setPerdido(rollo);
        setForm({ motivo: '', observaciones: '' });
        if (motivos) return;
        try {
            const { data } = await api.get('/rollos/motivos-ajuste');
            setMotivos(asList({ data }));
        } catch (err) {
            setPerdido(null);
            toast.error(err.response?.data?.message ?? 'No se pudieron cargar los motivos de ajuste.');
        }
    };

    const confirmarPerdido = async () => {
        setGuardando(true);
        try {
            await api.post(`/rollos/${perdido.id}/revision-perdido`, { motivo: form.motivo, observaciones: form.observaciones || undefined });
            toast.success(`${perdido.codigo}: pérdida confirmada y ajuste de inventario registrado.`);
            setPerdido(null);
            await resuelto();
        } catch (err) {
            toast.error(err.response?.data?.message ?? 'No se pudo registrar la pérdida.');
        } finally {
            setGuardando(false);
        }
    };

    if (rollos.length === 0) return null;

    return (
        <>
            <Alert variant="warning" className="mb-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="flex items-center gap-2">
                        <PackageSearch className="h-4 w-4 shrink-0" />
                        <span>
                            <strong>{rollos.length} rollo{rollos.length === 1 ? '' : 's'} en revisión</strong>: no se encontraron al preparar un pedido y
                            no se ofrecen como disponibles.
                        </span>
                    </span>
                    <Button variant="secondary" size="sm" onClick={() => setAbierto(true)}>Revisar</Button>
                </div>
            </Alert>

            <Modal open={abierto} onClose={() => setAbierto(false)} title="Rollos en revisión" description="Resuelve cada rollo cuando lo ubiques o confirmes su pérdida." size="2xl">
                <ul className="divide-y divide-edge rounded-lg border border-edge text-sm">
                    {rollos.map((r) => (
                        <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
                            <span className="min-w-0">
                                <span className="font-mono font-semibold text-warm-900">{r.codigo}</span>
                                <span className="ml-2 text-warm-700">{r.producto?.nombre}{r.color ? ` · ${r.color.nombre}` : ''}</span>
                                <span className="block text-xs text-warm-500">
                                    {num(r.metros_actual)} m · {r.almacen ?? '—'}
                                    {r.ubicacion ? ` · última ubicación: ${r.ubicacion}` : ''}
                                </span>
                            </span>
                            {puedeResolver ? (
                                <span className="flex gap-2">
                                    <Button variant="secondary" size="sm" disabled={guardando} onClick={() => aparecio(r)}>Apareció</Button>
                                    <Button variant="danger" size="sm" disabled={guardando} onClick={() => abrirPerdido(r)}>Confirmar pérdida</Button>
                                </span>
                            ) : (
                                <Badge variant="amber">En revisión</Badge>
                            )}
                        </li>
                    ))}
                </ul>
            </Modal>

            <Modal
                open={Boolean(perdido)}
                onClose={() => setPerdido(null)}
                title="Confirmar pérdida"
                description={perdido ? `${perdido.codigo} · ${num(perdido.metros_actual)} m` : ''}
                size="sm"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setPerdido(null)}>Cancelar</Button>
                        <Button variant="danger" loading={guardando} disabled={!form.motivo} onClick={confirmarPerdido}>Registrar pérdida</Button>
                    </>
                }
            >
                <div className="space-y-3">
                    <Alert variant="warning">
                        Se registra un ajuste de inventario de salida por todo el metraje del rollo y el rollo queda agotado.
                    </Alert>
                    <Select
                        label="Motivo del ajuste"
                        value={form.motivo}
                        onChange={(e) => setForm((f) => ({ ...f, motivo: e.target.value }))}
                        options={[{ value: '', label: motivos ? 'Elige el motivo' : 'Cargando…' }, ...(motivos ?? []).map((m) => ({ value: m.nombre, label: m.nombre }))]}
                    />
                    <Input label="Observación (opcional)" value={form.observaciones} onChange={(e) => setForm((f) => ({ ...f, observaciones: e.target.value }))} />
                </div>
            </Modal>
        </>
    );
}
