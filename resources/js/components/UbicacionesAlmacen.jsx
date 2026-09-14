import { useCallback, useEffect, useState } from 'react';
import { ChevronRight, Layers, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import api from '../lib/api';
import { useToast } from '../lib/toast';
import { Button, Input } from './ui';

/** Lo que sigue después de cada nivel; null cuando ya no admite más. */
const SIGUIENTE = { piso: 'pasillo', pasillo: 'rack', rack: 'nivel', nivel: 'posicion', posicion: null };

const ETIQUETA = { piso: 'Piso', pasillo: 'Pasillo', rack: 'Rack', nivel: 'Nivel', posicion: 'Posición' };

/**
 * El árbol de ubicaciones de un almacén: piso → pasillo → rack → nivel →
 * posición. No todos los almacenes llegan a los 5 niveles —uno chico puede
 * quedarse en pasillo—, así que cada rama crece hasta donde a ese almacén
 * le sirve, y no más.
 */
export default function UbicacionesAlmacen({ almacenId }) {
    const toast = useToast();
    const [arbol, setArbol] = useState([]);
    const [cargando, setCargando] = useState(true);
    const [creandoEn, setCreandoEn] = useState(null); // id del padre, o 'raiz'
    const [nombreNuevo, setNombreNuevo] = useState('');
    const [guardando, setGuardando] = useState(false);

    const cargar = useCallback(async () => {
        if (!almacenId) return;
        setCargando(true);
        try {
            const { data } = await api.get(`/almacenes/${almacenId}/ubicaciones`);
            setArbol(data);
        } catch {
            toast.error('No se pudo cargar la ubicación del almacén.');
        } finally {
            setCargando(false);
        }
    }, [almacenId, toast]);

    useEffect(() => {
        cargar();
    }, [cargar]);

    const abrirCrear = (padreId) => {
        setCreandoEn(padreId);
        setNombreNuevo('');
    };

    const crear = async () => {
        if (!nombreNuevo.trim()) return;
        setGuardando(true);
        try {
            await api.post(`/almacenes/${almacenId}/ubicaciones`, {
                padre_id: creandoEn === 'raiz' ? null : creandoEn,
                nombre: nombreNuevo.trim(),
            });
            setCreandoEn(null);
            await cargar();
        } catch (err) {
            toast.error(err.response?.data?.message ?? 'No se pudo crear la ubicación.');
        } finally {
            setGuardando(false);
        }
    };

    const eliminar = async (nodo) => {
        if (!window.confirm(`¿Eliminar "${nodo.nombre}"?`)) return;
        try {
            await api.delete(`/almacen-ubicaciones/${nodo.id}`);
            await cargar();
        } catch (err) {
            toast.error(err.response?.data?.message ?? 'No se pudo eliminar.');
        }
    };

    if (!almacenId) {
        return (
            <p className="rounded-lg border border-dashed border-edge px-3 py-4 text-center text-xs text-warm-500">
                Guarda el almacén primero; la ubicación se arma después, editándolo.
            </p>
        );
    }

    if (cargando) {
        return (
            <div className="flex items-center justify-center py-6 text-warm-400">
                <Loader2 className="h-5 w-5 animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-2">
            {arbol.length === 0 && creandoEn !== 'raiz' && (
                <p className="mb-2 text-xs text-warm-400">
                    Sin pisos todavía. Se pide en la recepción solo si los agregas aquí.
                </p>
            )}

            {arbol.map((nodo) => (
                <Nodo
                    key={nodo.id}
                    nodo={nodo}
                    nivel={0}
                    creandoEn={creandoEn}
                    nombreNuevo={nombreNuevo}
                    setNombreNuevo={setNombreNuevo}
                    onAbrirCrear={abrirCrear}
                    onCrear={crear}
                    onCancelarCrear={() => setCreandoEn(null)}
                    onEliminar={eliminar}
                    guardando={guardando}
                    recargar={cargar}
                    toast={toast}
                />
            ))}

            {creandoEn === 'raiz' ? (
                <FilaNueva
                    placeholder="Nombre del piso (ej: Piso 1)"
                    value={nombreNuevo}
                    onChange={setNombreNuevo}
                    onGuardar={crear}
                    onCancelar={() => setCreandoEn(null)}
                    guardando={guardando}
                />
            ) : (
                <Button type="button" variant="secondary" size="sm" onClick={() => abrirCrear('raiz')}>
                    <Plus className="h-3.5 w-3.5" /> Agregar piso
                </Button>
            )}
        </div>
    );
}

/** Un nodo del árbol, con sus hijos debajo (indentados) si los tiene. */
function Nodo({
    nodo, nivel, creandoEn, nombreNuevo, setNombreNuevo,
    onAbrirCrear, onCrear, onCancelarCrear, onEliminar, guardando, recargar, toast,
}) {
    const [renombrando, setRenombrando] = useState(false);
    const [nombreEdit, setNombreEdit] = useState(nodo.nombre);

    const guardarRenombre = async () => {
        if (!nombreEdit.trim() || nombreEdit === nodo.nombre) {
            setRenombrando(false);
            return;
        }
        try {
            await api.put(`/almacen-ubicaciones/${nodo.id}`, { nombre: nombreEdit.trim() });
            setRenombrando(false);
            await recargar();
        } catch {
            toast.error('No se pudo renombrar.');
        }
    };

    const admiteHijos = SIGUIENTE[nodo.tipo] != null;

    return (
        <div style={{ marginLeft: nivel * 20 }}>
            <div className="group flex items-center gap-2 rounded-lg border border-edge bg-white px-3 py-2">
                {nivel > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-warm-300" />}
                <Layers className="h-3.5 w-3.5 shrink-0 text-primary-500" />
                <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-warm-500">
                    {ETIQUETA[nodo.tipo]}
                </span>

                {renombrando ? (
                    <input
                        autoFocus
                        value={nombreEdit}
                        onChange={(e) => setNombreEdit(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && guardarRenombre()}
                        onBlur={guardarRenombre}
                        className="flex-1 rounded border border-primary-300 px-1.5 py-0.5 text-sm"
                    />
                ) : (
                    <span className="flex-1 truncate text-sm font-medium text-warm-900">{nodo.nombre}</span>
                )}

                {nodo.rollos_count > 0 && (
                    <span className="shrink-0 text-[11px] text-warm-400">{nodo.rollos_count} rollo(s)</span>
                )}

                <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
                    {admiteHijos && (
                        <button
                            type="button"
                            title={`Agregar ${ETIQUETA[SIGUIENTE[nodo.tipo]].toLowerCase()}`}
                            onClick={() => onAbrirCrear(nodo.id)}
                            className="rounded p-1 text-primary-600 hover:bg-primary-50"
                        >
                            <Plus className="h-3.5 w-3.5" />
                        </button>
                    )}
                    <button
                        type="button"
                        title="Renombrar"
                        onClick={() => setRenombrando(true)}
                        className="rounded p-1 text-warm-500 hover:bg-gray-100"
                    >
                        <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                        type="button"
                        title="Eliminar"
                        onClick={() => onEliminar(nodo)}
                        className="rounded p-1 text-red-600 hover:bg-red-50"
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                    </button>
                </div>
            </div>

            <div className="mt-1 space-y-1">
                {nodo.hijos.map((hijo) => (
                    <Nodo
                        key={hijo.id}
                        nodo={hijo}
                        nivel={nivel + 1}
                        creandoEn={creandoEn}
                        nombreNuevo={nombreNuevo}
                        setNombreNuevo={setNombreNuevo}
                        onAbrirCrear={onAbrirCrear}
                        onCrear={onCrear}
                        onCancelarCrear={onCancelarCrear}
                        onEliminar={onEliminar}
                        guardando={guardando}
                        recargar={recargar}
                        toast={toast}
                    />
                ))}

                {creandoEn === nodo.id && (
                    <div style={{ marginLeft: (nivel + 1) * 20 }}>
                        <FilaNueva
                            placeholder={`Nombre del ${ETIQUETA[SIGUIENTE[nodo.tipo]].toLowerCase()}`}
                            value={nombreNuevo}
                            onChange={setNombreNuevo}
                            onGuardar={onCrear}
                            onCancelar={onCancelarCrear}
                            guardando={guardando}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}

/** La fila para escribir el nombre de un nodo nuevo antes de guardarlo. */
function FilaNueva({ placeholder, value, onChange, onGuardar, onCancelar, guardando }) {
    return (
        <div className="flex items-center gap-2 rounded-lg border border-dashed border-primary-300 bg-primary-50/40 px-3 py-2">
            <Input
                autoFocus
                placeholder={placeholder}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') onGuardar();
                    if (e.key === 'Escape') onCancelar();
                }}
                className="flex-1"
            />
            <Button type="button" size="sm" onClick={onGuardar} loading={guardando}>
                Agregar
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={onCancelar}>
                Cancelar
            </Button>
        </div>
    );
}
