import { useCallback, useEffect, useState } from 'react';
import {
    ChevronDown, ChevronRight, Layers, LayoutGrid, Loader2, MapPin, Pencil, Plus, Route, Trash2, Warehouse,
} from 'lucide-react';
import api from '../lib/api';
import { useToast } from '../lib/toast';
import { Button, Input } from './ui';

/** Lo que sigue después de cada nivel; null cuando ya no admite más. */
const SIGUIENTE = { piso: 'pasillo', pasillo: 'rack', rack: 'nivel', nivel: 'posicion', posicion: null };

const ETIQUETA = { piso: 'Piso', pasillo: 'Pasillo', rack: 'Rack', nivel: 'Nivel', posicion: 'Posición' };

const ETIQUETA_PLURAL = { pasillo: 'pasillos', rack: 'racks', nivel: 'niveles', posicion: 'posiciones' };

const ICONO = { piso: Warehouse, pasillo: Route, rack: Layers, nivel: LayoutGrid, posicion: MapPin };

/**
 * El árbol de ubicaciones de un almacén: piso → pasillo → rack → nivel →
 * posición. No todos los almacenes llegan a los 5 niveles —uno chico puede
 * quedarse en pasillo—, así que cada rama crece hasta donde a ese almacén
 * le sirve, y no más. Cada nivel se puede colapsar para no perderse cuando
 * el árbol crece.
 */
export default function UbicacionesAlmacen({ almacenId }) {
    const toast = useToast();
    const [arbol, setArbol] = useState([]);
    const [cargando, setCargando] = useState(true);
    // Ids colapsados; por defecto todo empieza expandido.
    const [colapsados, setColapsados] = useState(() => new Set());
    const [creandoEn, setCreandoEn] = useState('raiz'); // id del padre, o 'raiz'
    const [nombreNuevo, setNombreNuevo] = useState('');
    const [guardando, setGuardando] = useState(false);
    const [renombrando, setRenombrando] = useState(null); // id del nodo
    const [nombreEdit, setNombreEdit] = useState('');

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

    const alternarColapso = (id) => {
        setColapsados((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const abrirCrear = (padreId) => {
        setCreandoEn(padreId);
        setNombreNuevo('');
    };

    const crear = async (padreId) => {
        if (!nombreNuevo.trim()) return;
        setGuardando(true);
        try {
            await api.post(`/almacenes/${almacenId}/ubicaciones`, {
                padre_id: padreId === 'raiz' ? null : padreId,
                nombre: nombreNuevo.trim(),
            });
            setCreandoEn(null);
            if (padreId !== 'raiz') setColapsados((prev) => { const n = new Set(prev); n.delete(padreId); return n; });
            await cargar();
        } catch (err) {
            toast.error(err.response?.data?.message ?? 'No se pudo crear la ubicación.');
        } finally {
            setGuardando(false);
        }
    };

    const guardarRenombre = async (nodo) => {
        if (!nombreEdit.trim() || nombreEdit === nodo.nombre) {
            setRenombrando(null);
            return;
        }
        try {
            await api.put(`/almacen-ubicaciones/${nodo.id}`, { nombre: nombreEdit.trim() });
            setRenombrando(null);
            await cargar();
        } catch {
            toast.error('No se pudo renombrar.');
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
        <div className="rounded-lg border border-edge bg-white p-2">
            <div className="flex flex-col">
                {arbol.length === 0 && creandoEn !== 'raiz' && (
                    <p className="px-2 py-3 text-center text-xs text-warm-400">
                        Sin pisos todavía. Se pide en la recepción solo si los agregas aquí.
                    </p>
                )}

                {arbol.map((nodo) => (
                    <Nodo
                        key={nodo.id}
                        nodo={nodo}
                        nivel={0}
                        colapsados={colapsados}
                        onAlternarColapso={alternarColapso}
                        creandoEn={creandoEn}
                        nombreNuevo={nombreNuevo}
                        setNombreNuevo={setNombreNuevo}
                        onAbrirCrear={abrirCrear}
                        onCrear={crear}
                        onCancelarCrear={() => setCreandoEn(null)}
                        guardando={guardando}
                        renombrando={renombrando}
                        nombreEdit={nombreEdit}
                        setNombreEdit={setNombreEdit}
                        onAbrirRenombrar={(n) => { setRenombrando(n.id); setNombreEdit(n.nombre); }}
                        onGuardarRenombre={guardarRenombre}
                        onEliminar={eliminar}
                    />
                ))}

                {creandoEn === 'raiz' ? (
                    <FilaNueva
                        nivel={0}
                        placeholder="Nombre del piso (ej: Piso 1)"
                        value={nombreNuevo}
                        onChange={setNombreNuevo}
                        onGuardar={() => crear('raiz')}
                        onCancelar={() => setCreandoEn(null)}
                        guardando={guardando}
                    />
                ) : (
                    <button
                        type="button"
                        onClick={() => abrirCrear('raiz')}
                        className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-primary-600 hover:bg-primary-50"
                    >
                        <Plus className="h-3.5 w-3.5" /> Agregar piso
                    </button>
                )}
            </div>
        </div>
    );
}

/** Un nodo del árbol, con sus hijos debajo si está expandido. */
function Nodo({
    nodo, nivel, colapsados, onAlternarColapso,
    creandoEn, nombreNuevo, setNombreNuevo, onAbrirCrear, onCrear, onCancelarCrear, guardando,
    renombrando, nombreEdit, setNombreEdit, onAbrirRenombrar, onGuardarRenombre, onEliminar,
}) {
    const admiteHijos = SIGUIENTE[nodo.tipo] != null;
    const tieneHijos = nodo.hijos.length > 0;
    const colapsado = colapsados.has(nodo.id);
    const Icono = ICONO[nodo.tipo];
    const editando = renombrando === nodo.id;

    const resumen = admiteHijos
        ? `${nodo.hijos.length} ${ETIQUETA_PLURAL[SIGUIENTE[nodo.tipo]]}`
        : nodo.rollos_count > 0
            ? `${nodo.rollos_count} rollo(s)`
            : 'vacío';

    return (
        <div>
            <div
                className="group flex items-center gap-1.5 rounded-md px-2 py-1.5 hover:bg-gray-50"
                style={{ paddingLeft: 8 + nivel * 18 }}
            >
                {(tieneHijos || admiteHijos) ? (
                    <button
                        type="button"
                        onClick={() => onAlternarColapso(nodo.id)}
                        className="shrink-0 text-warm-400 hover:text-warm-600"
                    >
                        {colapsado ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </button>
                ) : (
                    <span className="w-3.5 shrink-0" />
                )}

                <Icono className="h-3.5 w-3.5 shrink-0 text-warm-500" />

                {editando ? (
                    <input
                        autoFocus
                        value={nombreEdit}
                        onChange={(e) => setNombreEdit(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && onGuardarRenombre(nodo)}
                        onBlur={() => onGuardarRenombre(nodo)}
                        className="flex-1 rounded border border-primary-300 px-1.5 py-0.5 text-[13px]"
                    />
                ) : (
                    <span className="flex-1 truncate text-[13px] text-warm-900">{nodo.nombre}</span>
                )}

                <span className="shrink-0 text-[11px] text-warm-400">{resumen}</span>

                <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
                    {admiteHijos && (
                        <button
                            type="button"
                            title={`Agregar ${ETIQUETA[SIGUIENTE[nodo.tipo]].toLowerCase()}`}
                            onClick={() => { if (colapsado) onAlternarColapso(nodo.id); onAbrirCrear(nodo.id); }}
                            className="rounded p-1 text-primary-600 hover:bg-primary-100"
                        >
                            <Plus className="h-3.5 w-3.5" />
                        </button>
                    )}
                    <button
                        type="button"
                        title="Renombrar"
                        onClick={() => onAbrirRenombrar(nodo)}
                        className="rounded p-1 text-warm-500 hover:bg-gray-200"
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

            {!colapsado && (
                <>
                    {nodo.hijos.map((hijo) => (
                        <Nodo
                            key={hijo.id}
                            nodo={hijo}
                            nivel={nivel + 1}
                            colapsados={colapsados}
                            onAlternarColapso={onAlternarColapso}
                            creandoEn={creandoEn}
                            nombreNuevo={nombreNuevo}
                            setNombreNuevo={setNombreNuevo}
                            onAbrirCrear={onAbrirCrear}
                            onCrear={onCrear}
                            onCancelarCrear={onCancelarCrear}
                            guardando={guardando}
                            renombrando={renombrando}
                            nombreEdit={nombreEdit}
                            setNombreEdit={setNombreEdit}
                            onAbrirRenombrar={onAbrirRenombrar}
                            onGuardarRenombre={onGuardarRenombre}
                            onEliminar={onEliminar}
                        />
                    ))}

                    {creandoEn === nodo.id && (
                        <FilaNueva
                            nivel={nivel + 1}
                            placeholder={`Nombre del ${ETIQUETA[SIGUIENTE[nodo.tipo]].toLowerCase()}`}
                            value={nombreNuevo}
                            onChange={setNombreNuevo}
                            onGuardar={() => onCrear(nodo.id)}
                            onCancelar={onCancelarCrear}
                            guardando={guardando}
                        />
                    )}
                </>
            )}
        </div>
    );
}

/** La fila para escribir el nombre de un nodo nuevo antes de guardarlo. */
function FilaNueva({ nivel, placeholder, value, onChange, onGuardar, onCancelar, guardando }) {
    return (
        <div className="flex items-center gap-1.5 py-1" style={{ paddingLeft: 8 + nivel * 18 }}>
            <Input
                autoFocus
                placeholder={placeholder}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        onGuardar();
                    }
                    if (e.key === 'Escape') onCancelar();
                }}
                className="flex-1 py-1 text-xs"
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
