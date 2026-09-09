import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Save, Shield, ShieldCheck } from 'lucide-react';
import api from '../lib/api';
import { useToast } from '../lib/toast';
import Layout from '../components/Layout';
import PageHeader from '../components/PageHeader';
import { Alert, Badge, Button, Select, Spinner, cn } from '../components/ui';

/**
 * Qué puede hacer cada rol, en tres niveles: módulo → submódulo → acciones.
 *
 * Vive aparte de la pantalla de Roles (donde solo se crean y renombran) porque
 * el árbol es largo y necesita espacio propio.
 */
export default function Accesos() {
    const toast = useToast();
    const [params, setParams] = useSearchParams();

    const [roles, setRoles] = useState([]);
    const [arbol, setArbol] = useState([]);
    const [superAdmin, setSuperAdmin] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    /** Rol que se está editando. */
    const [rolId, setRolId] = useState(params.get('rol') ?? '');
    const [permisos, setPermisos] = useState(new Set());
    const [abiertos, setAbiertos] = useState({});
    const [saving, setSaving] = useState(false);

    const todosLosPermisos = useMemo(
        () => arbol.flatMap((m) => m.submodulos.flatMap((s) => s.acciones.map((a) => a.permiso))),
        [arbol],
    );

    const rol = useMemo(
        () => roles.find((r) => String(r.id) === String(rolId)) ?? null,
        [roles, rolId],
    );

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [rolesRes, arbolRes] = await Promise.all([
                api.get('/roles'),
                api.get('/roles/permisos'),
            ]);
            setRoles(rolesRes.data ?? []);
            setArbol(arbolRes.data?.arbol ?? []);
            setSuperAdmin([].concat(arbolRes.data?.super_admin ?? []));
        } catch {
            setError('No se pudieron cargar los accesos.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    // Sin rol elegido se abre el primero, para no ver la pantalla vacía.
    useEffect(() => {
        if (!rolId && roles.length) {
            setRolId(String(roles[0].id));
        }
    }, [roles, rolId]);

    // Al cambiar de rol se cargan sus permisos y se refleja en la URL, para
    // poder llegar directo desde la pantalla de Roles.
    useEffect(() => {
        if (!rol) return;
        setPermisos(new Set(rol.es_super_admin ? todosLosPermisos : rol.permisos ?? []));
        setParams(rol ? { rol: String(rol.id) } : {}, { replace: true });
    }, [rol, todosLosPermisos, setParams]);

    const alternar = (permiso) =>
        setPermisos((prev) => {
            const next = new Set(prev);
            next.has(permiso) ? next.delete(permiso) : next.add(permiso);
            return next;
        });

    const alternarGrupo = (lista, marcar) =>
        setPermisos((prev) => {
            const next = new Set(prev);
            lista.forEach((p) => (marcar ? next.add(p) : next.delete(p)));
            return next;
        });

    const permisosDe = (modulo) =>
        modulo.submodulos.flatMap((s) => s.acciones.map((a) => a.permiso));

    const guardar = async () => {
        if (!rol) return;
        setSaving(true);
        try {
            await api.put(`/roles/${rol.id}`, { name: rol.name, permisos: [...permisos] });
            toast.success(`Accesos de "${rol.name}" guardados.`);
            await load();
        } catch (err) {
            toast.error(err.response?.data?.message ?? 'No se pudieron guardar los accesos.');
        } finally {
            setSaving(false);
        }
    };

    /** ¿Cambió algo respecto a lo guardado? */
    const hayCambios = useMemo(() => {
        if (!rol) return false;
        const guardados = new Set(rol.permisos ?? []);
        if (guardados.size !== permisos.size) return true;
        return [...permisos].some((p) => !guardados.has(p));
    }, [rol, permisos]);

    return (
        <Layout>
            <PageHeader
                title="Accesos"
                description="Qué puede ver y hacer cada rol en el sistema"
                actions={
                    rol && !rol.es_super_admin ? (
                        <Button onClick={guardar} loading={saving} disabled={!hayCambios}>
                            <Save className="h-4 w-4" />
                            Guardar cambios
                        </Button>
                    ) : null
                }
            />

            {error && <Alert variant="error" className="mb-4">{error}</Alert>}

            {loading ? (
                <div className="flex items-center justify-center py-24">
                    <Spinner size="lg" className="text-primary-600" />
                </div>
            ) : (
                <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
                    {/* Roles: lista en escritorio, selector en móvil */}
                    <aside className="lg:sticky lg:top-4 lg:self-start">
                        <div className="lg:hidden">
                            <Select
                                label="Rol"
                                value={rolId}
                                onChange={(e) => setRolId(e.target.value)}
                                options={roles.map((r) => ({ value: String(r.id), label: r.name }))}
                            />
                        </div>

                        <div className="hidden overflow-hidden rounded-lg border border-edge bg-white shadow-sm lg:block">
                            <p className="border-b border-edge px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                                Roles
                            </p>
                            <ul className="max-h-[70vh] overflow-y-auto p-1">
                                {roles.map((r) => {
                                    const activo = String(r.id) === String(rolId);
                                    const n = r.es_super_admin
                                        ? todosLosPermisos.length
                                        : r.permisos?.length ?? 0;

                                    return (
                                        <li key={r.id}>
                                            <button
                                                type="button"
                                                onClick={() => setRolId(String(r.id))}
                                                className={cn(
                                                    'flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-sm transition',
                                                    activo
                                                        ? 'bg-primary-50 font-medium text-primary-700'
                                                        : 'text-warm-700 hover:bg-gray-50',
                                                )}
                                            >
                                                <span className="flex min-w-0 items-center gap-2">
                                                    <Shield className="h-4 w-4 shrink-0 text-primary-600" />
                                                    <span className="truncate">{r.name}</span>
                                                </span>
                                                <span className="shrink-0 text-xs text-warm-500">
                                                    {n}/{todosLosPermisos.length}
                                                </span>
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    </aside>

                    {/* Árbol de permisos del rol elegido */}
                    <section className="rounded-lg border border-edge bg-white shadow-sm">
                        {!rol ? (
                            <p className="px-4 py-16 text-center text-sm text-warm-400">
                                Elige un rol para ver sus accesos.
                            </p>
                        ) : rol.es_super_admin ? (
                            <div className="p-4">
                                <Alert variant="info">
                                    <strong>{rol.name}</strong> siempre conserva todos los accesos: no
                                    se puede limitar, para que nadie quede fuera del sistema.
                                </Alert>
                            </div>
                        ) : (
                            <>
                                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-edge px-4 py-3">
                                    <div className="min-w-0">
                                        <h2 className="truncate text-sm font-semibold text-warm-900">
                                            {rol.name}
                                        </h2>
                                        <p className="text-xs text-warm-500">
                                            {permisos.size} de {todosLosPermisos.length} accesos
                                            {rol.usuarios_count > 0 && ` · ${rol.usuarios_count} usuario(s)`}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Button
                                            variant="secondary"
                                            size="sm"
                                            onClick={() => setPermisos(new Set(todosLosPermisos))}
                                        >
                                            Marcar todo
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setPermisos(new Set())}
                                        >
                                            Quitar todo
                                        </Button>
                                    </div>
                                </div>

                                <div className="space-y-2 p-3">
                                    {arbol.map((modulo) => {
                                        const delModulo = permisosDe(modulo);
                                        const marcados = delModulo.filter((p) => permisos.has(p)).length;
                                        const todos = marcados === delModulo.length;
                                        const abierto = abiertos[modulo.key] ?? false;

                                        return (
                                            <div key={modulo.key} className="rounded-lg border border-edge">
                                                {/* Nivel 1: módulo */}
                                                <div className="flex items-center gap-2 bg-gray-50 px-3 py-2">
                                                    <input
                                                        type="checkbox"
                                                        checked={todos}
                                                        ref={(el) => {
                                                            if (el) el.indeterminate = marcados > 0 && !todos;
                                                        }}
                                                        onChange={(e) => alternarGrupo(delModulo, e.target.checked)}
                                                        className="h-4 w-4 rounded border-gray-300 accent-primary-600"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            setAbiertos((prev) => ({
                                                                ...prev,
                                                                [modulo.key]: !abierto,
                                                            }))
                                                        }
                                                        className="flex flex-1 items-center justify-between gap-2 text-left"
                                                    >
                                                        <span className="text-sm font-semibold text-warm-900">
                                                            {modulo.label}
                                                        </span>
                                                        <Badge
                                                            variant={
                                                                marcados === 0
                                                                    ? 'gray'
                                                                    : todos
                                                                      ? 'green'
                                                                      : 'amber'
                                                            }
                                                        >
                                                            {marcados}/{delModulo.length}
                                                        </Badge>
                                                    </button>
                                                </div>

                                                {abierto && (
                                                    <div className="divide-y divide-gray-100">
                                                        {modulo.submodulos.map((sub) => {
                                                            const delSub = sub.acciones.map((a) => a.permiso);
                                                            const subTodos = delSub.every((p) => permisos.has(p));

                                                            return (
                                                                <div
                                                                    key={sub.key}
                                                                    className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2"
                                                                >
                                                                    {/* Nivel 2: submódulo */}
                                                                    <label className="flex min-w-[13rem] flex-1 cursor-pointer items-center gap-2">
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={subTodos}
                                                                            ref={(el) => {
                                                                                if (el)
                                                                                    el.indeterminate =
                                                                                        delSub.some((p) => permisos.has(p)) &&
                                                                                        !subTodos;
                                                                            }}
                                                                            onChange={(e) =>
                                                                                alternarGrupo(delSub, e.target.checked)
                                                                            }
                                                                            className="h-4 w-4 rounded border-gray-300 accent-primary-600"
                                                                        />
                                                                        <span className="text-sm text-warm-900">
                                                                            {sub.label}
                                                                        </span>
                                                                    </label>

                                                                    {/* Nivel 3: acciones */}
                                                                    <div className="flex flex-wrap items-center gap-3">
                                                                        {sub.acciones.map((a) => (
                                                                            <label
                                                                                key={a.permiso}
                                                                                className="flex cursor-pointer items-center gap-1.5 text-xs text-warm-600"
                                                                            >
                                                                                <input
                                                                                    type="checkbox"
                                                                                    checked={permisos.has(a.permiso)}
                                                                                    onChange={() => alternar(a.permiso)}
                                                                                    className="h-3.5 w-3.5 rounded border-gray-300 accent-primary-600"
                                                                                />
                                                                                {a.label}
                                                                            </label>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>

                                <p className="flex items-center gap-2 border-t border-edge px-4 py-3 text-xs text-warm-400">
                                    <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                                    Sin acceso, el módulo no aparece en el menú y la API rechaza la
                                    petición.
                                </p>
                            </>
                        )}
                    </section>
                </div>
            )}
        </Layout>
    );
}
