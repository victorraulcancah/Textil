import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Clock, Lock } from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import { navigation } from '../config/navigation';
import Layout from '../components/Layout';
import { Badge, Modal, Spinner, cn } from '../components/ui';

/** Cómo se lee cada acción cuando va sola, sin la pantalla al lado. */
const ACCION_LABEL = { ver: 'Entrar' };

/**
 * Los módulos del menú como tarjetas: cada grupo con sus pantallas. Una pantalla
 * suelta del menú (el Dashboard) cuenta como su propio módulo. Inicio no entra:
 * es libre y no se pide.
 */
const GRUPOS = navigation
    .map((item) =>
        item.children
            ? item
            : item.libre
              ? null
              : { label: item.label, icon: item.icon, children: [item] },
    )
    .filter(Boolean);

/**
 * La pantalla en la que se cae al entrar, y desde la que se piden accesos.
 *
 * Están los módulos completos, se puedan abrir o no: quien no ve un módulo no
 * sabe que existe, y quien lo necesita tendría que adivinar el nombre de la
 * pantalla para pedirla. Lo que no se puede abrir lleva candado y se pide desde
 * aquí mismo.
 */
export default function Inicio() {
    const { user, recargar } = useAuth();

    const [resumen, setResumen] = useState(null);
    /** Permisos ya pedidos y todavía sin respuesta. */
    const [pendientes, setPendientes] = useState(new Set());
    const [abierto, setAbierto] = useState(null);

    useEffect(() => {
        api.get('/mi-acceso').then(({ data }) => setResumen(data)).catch(() => setResumen({ arbol: [], permisos: [], roles: [] }));
        api.get('/mi-acceso/solicitudes')
            .then(({ data }) =>
                setPendientes(new Set((data ?? []).filter((s) => s.estado === 'pendiente').map((s) => s.permiso))),
            )
            .catch(() => {});
        // Si aprobaron algo mientras estaba fuera, el menú lo refleja sin volver a entrar.
        recargar().catch(() => {});
    }, [recargar]);

    /** Acciones de cada pantalla, del catálogo del servidor: "ventas.clientes" → [{ permiso, label }]. */
    const acciones = useMemo(() => {
        const mapa = new Map();
        (resumen?.arbol ?? []).forEach((m) => m.submodulos.forEach((s) => mapa.set(s.key, s.acciones)));
        return mapa;
    }, [resumen]);

    const tengo = useMemo(() => new Set(resumen?.permisos ?? []), [resumen]);

    if (!resumen) {
        return (
            <Layout>
                <div className="flex items-center justify-center py-24">
                    <Spinner size="lg" className="text-primary-600" />
                </div>
            </Layout>
        );
    }

    const puedeVer = (item) => tengo.has(`${item.permiso}.ver`);
    // Solo cuentan las pantallas que el servidor controla: una que no está en el
    // catálogo no se puede tener ni pedir, y contarla dejaría un candado de más.
    const controladas = (grupo) => grupo.children.filter((i) => i.permiso && acciones.has(i.permiso));

    return (
        <Layout>
            <div className="space-y-5">
                <div className="flex items-center gap-4 rounded-lg border border-edge bg-white p-5 shadow-sm">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary-600 text-lg font-bold text-white">
                        {user?.name?.trim().charAt(0).toUpperCase() ?? '?'}
                    </span>
                    <div className="min-w-0">
                        <p className="text-xs text-warm-500">Hola,</p>
                        <p className="truncate text-lg font-extrabold text-warm-900">{user?.name}</p>
                        {resumen.roles.length > 0 && (
                            <span className="mt-1 flex flex-wrap gap-1">
                                {resumen.roles.map((r) => (
                                    <Badge key={r} variant="blue">
                                        {r}
                                    </Badge>
                                ))}
                            </span>
                        )}
                    </div>
                </div>

                <div>
                    <h2 className="mb-3 text-[15px] font-bold text-warm-900">Módulos</h2>

                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                        {GRUPOS.map((grupo) => {
                            const lista = controladas(grupo);
                            const abiertas = lista.filter(puedeVer).length;
                            const Icono = grupo.icon;

                            return (
                                <button
                                    key={grupo.label}
                                    type="button"
                                    onClick={() => setAbierto(grupo)}
                                    className="flex cursor-pointer flex-col items-start justify-between gap-6 rounded-lg border border-edge bg-white p-4 text-left transition-colors hover:bg-gray-50"
                                >
                                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50 text-primary-700">
                                        <Icono size={20} />
                                    </span>

                                    <span className="min-w-0">
                                        <span className="block truncate text-sm font-bold text-warm-900">{grupo.label}</span>
                                        <span className="flex items-center gap-1 text-[11px] text-warm-500">
                                            {abiertas === lista.length
                                                ? `${lista.length} vistas`
                                                : `${abiertas} de ${lista.length} vistas`}
                                            {abiertas < lista.length && <Lock size={10} />}
                                        </span>
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            <ModuloModal
                grupo={abierto}
                acciones={acciones}
                tengo={tengo}
                pendientes={pendientes}
                onPedido={(permiso) => setPendientes((p) => new Set(p).add(permiso))}
                onClose={() => setAbierto(null)}
            />
        </Layout>
    );
}

/**
 * Todo lo que se puede hacer dentro de un módulo, y en qué está cada cosa. Las
 * acciones salen del catálogo del servidor y no de una lista escrita aquí: si
 * se copiara, una acción nueva quedaría sin poder pedirse aunque el servidor ya
 * la estuviera exigiendo.
 */
function ModuloModal({ grupo, acciones, tengo, pendientes, onPedido, onClose }) {
    const navigate = useNavigate();
    const toast = useToast();
    const [enviando, setEnviando] = useState('');

    if (!grupo) return null;

    const pedir = async (permiso) => {
        setEnviando(permiso);
        try {
            await api.post('/mi-acceso/solicitudes', { permiso });
            onPedido(permiso);
            toast.success('Pedido. Un administrador lo verá en su bandeja.');
        } catch (err) {
            toast.error(err.response?.data?.message ?? 'No pudimos enviar el pedido. Inténtalo de nuevo.');
        } finally {
            setEnviando('');
        }
    };

    return (
        <Modal
            open
            onClose={onClose}
            size="xl"
            title={grupo.label}
            description="Lo que puedes hacer en este módulo. Lo que no, se pide desde aquí."
        >
            <div className="space-y-4">
                {grupo.children.map((item) => {
                    const lista = acciones.get(item.permiso) ?? [];
                    const Icono = item.icon;
                    const entra = tengo.has(`${item.permiso}.ver`);

                    return (
                        <div key={item.to} className="rounded-lg border border-edge p-3">
                            <div className="mb-2 flex items-center gap-2">
                                <Icono size={16} className="shrink-0 text-primary-700" />

                                {/* Se entra desde aquí si se puede: tener la lista delante y
                                    obligar a buscar la misma pantalla en el menú sobra. */}
                                {entra ? (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            onClose();
                                            navigate(item.to);
                                        }}
                                        className="cursor-pointer text-sm font-semibold text-warm-900 hover:underline"
                                    >
                                        {item.label}
                                    </button>
                                ) : (
                                    <span className="text-sm font-semibold text-warm-500">{item.label}</span>
                                )}
                            </div>

                            {lista.length === 0 && (
                                <p className="text-xs text-warm-500">Todavía no se puede pedir: esta pantalla aún no existe.</p>
                            )}

                            <div className="flex flex-wrap gap-1.5">
                                {lista.map((a) => {
                                    const tiene = tengo.has(a.permiso);
                                    const pedida = pendientes.has(a.permiso);

                                    return (
                                        <button
                                            key={a.permiso}
                                            type="button"
                                            disabled={tiene || pedida || enviando === a.permiso}
                                            onClick={() => pedir(a.permiso)}
                                            title={
                                                tiene
                                                    ? 'Ya lo tienes'
                                                    : pedida
                                                      ? 'Pedido, esperando respuesta'
                                                      : 'Pedir este permiso'
                                            }
                                            className={cn(
                                                'flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold',
                                                tiene
                                                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                                    : pedida
                                                      ? 'border-amber-200 bg-amber-50 text-amber-700'
                                                      : 'cursor-pointer border-edge text-warm-600 hover:bg-gray-50',
                                            )}
                                        >
                                            {tiene ? <Check size={12} /> : pedida ? <Clock size={12} /> : <Lock size={12} />}
                                            {ACCION_LABEL[a.accion] ?? a.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>
        </Modal>
    );
}
