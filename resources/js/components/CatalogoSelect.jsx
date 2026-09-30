import { useCallback, useEffect, useState } from 'react';
import { Check, Pencil, PlusCircle, Trash2, X } from 'lucide-react';
import api, { asList } from '../lib/api';
import { useToast } from '../lib/toast';
import { Badge, Button, Input, Modal, Select } from './ui';

const norma = (t) => String(t ?? '').replace(/\s+/g, '').toUpperCase();

/**
 * Una lista de un catálogo chico (tipos de contenedor, puertos…) con su
 * administración a un lado: el icono de más abre el mantenimiento — agregar,
 * renombrar y eliminar — sin salir del formulario.
 *
 *   endpoint  — "/puertos": GET lista, POST crea, PUT/DELETE /{id}
 *   value     — el nombre elegido (texto: el documento guarda el nombre)
 *   onChange  — (nombre) => void
 *
 * Un valor que ya no está en la lista (de una orden anterior) se sigue mostrando.
 */
export default function CatalogoSelect({ label, endpoint, value, onChange, titulo, placeholder = 'Elige…', className }) {
    const toast = useToast();
    const [items, setItems] = useState([]);
    const [abierto, setAbierto] = useState(false);
    const [nuevo, setNuevo] = useState('');
    const [editId, setEditId] = useState(null);
    const [editNombre, setEditNombre] = useState('');
    const [guardando, setGuardando] = useState(false);

    const cargar = useCallback(async () => {
        try {
            setItems(asList(await api.get(endpoint)));
        } catch {
            setItems([]);
        }
    }, [endpoint]);

    useEffect(() => {
        cargar();
    }, [cargar]);

    const activos = items.filter((i) => i.activo !== false);
    // El valor escrito de otra forma ("40HC") se reconoce con el de la lista ("40 HC").
    const enLista = activos.find((i) => norma(i.nombre) === norma(value));
    const actual = enLista?.nombre ?? value ?? '';

    const opciones = [
        { value: '', label: placeholder },
        ...activos.map((i) => ({ value: i.nombre, label: i.nombre })),
        ...(actual && !enLista ? [{ value: actual, label: actual }] : []),
    ];

    const mensaje = (err, defecto) => err.response?.data?.errors?.nombre?.[0] ?? err.response?.data?.message ?? defecto;

    const agregar = async (e) => {
        e?.preventDefault?.();
        if (!nuevo.trim()) return;
        setGuardando(true);
        try {
            const { data } = await api.post(endpoint, { nombre: nuevo.trim(), activo: true });
            await cargar();
            setNuevo('');
            onChange?.(data.nombre);
            toast.success(`"${data.nombre}" agregado.`);
        } catch (err) {
            toast.error(mensaje(err, 'No se pudo agregar.'));
        } finally {
            setGuardando(false);
        }
    };

    const guardarEdicion = async (item) => {
        if (!editNombre.trim()) return;
        setGuardando(true);
        try {
            const { data } = await api.put(`${endpoint}/${item.id}`, { nombre: editNombre.trim() });
            await cargar();
            // Si era el elegido, el formulario pasa al nombre nuevo.
            if (norma(item.nombre) === norma(value)) onChange?.(data.nombre);
            setEditId(null);
        } catch (err) {
            toast.error(mensaje(err, 'No se pudo guardar.'));
        } finally {
            setGuardando(false);
        }
    };

    const eliminar = async (item) => {
        setGuardando(true);
        try {
            const { data } = await api.delete(`${endpoint}/${item.id}`);
            await cargar();
            if (data?.desactivado) toast.success(data.message);
            else if (norma(item.nombre) === norma(value)) onChange?.('');
        } catch (err) {
            toast.error(mensaje(err, 'No se pudo eliminar.'));
        } finally {
            setGuardando(false);
        }
    };

    return (
        <div className={className}>
            <div className="flex items-end gap-2">
                <div className="min-w-0 flex-1">
                    <Select label={label} value={actual} onChange={(e) => onChange?.(e.target.value)} options={opciones} />
                </div>
                <button
                    type="button"
                    onClick={() => setAbierto(true)}
                    title={`Administrar: ${titulo ?? label}`}
                    aria-label={`Administrar ${titulo ?? label}`}
                    className="mb-0.5 rounded-md p-1.5 text-emerald-600 transition hover:bg-emerald-50"
                >
                    <PlusCircle className="h-5 w-5" />
                </button>
            </div>

            <Modal
                open={abierto}
                onClose={() => setAbierto(false)}
                title={titulo ?? label}
                description="Agrega, renombra o elimina. Lo que agregues queda disponible en la lista."
                size="md"
                footer={<Button type="button" onClick={() => setAbierto(false)}>Listo</Button>}
            >
                <form onSubmit={agregar} className="mb-4 flex items-end gap-2">
                    <Input label="Nuevo" placeholder="Nombre" value={nuevo} onChange={(e) => setNuevo(e.target.value)} className="flex-1" />
                    <Button type="submit" loading={guardando} disabled={!nuevo.trim()}>
                        Agregar
                    </Button>
                </form>

                <div className="divide-y divide-gray-100 rounded-lg border border-edge">
                    {items.length === 0 && <p className="px-3 py-6 text-center text-sm text-warm-500">Todavía no hay ninguno.</p>}
                    {items.map((item) =>
                        editId === item.id ? (
                            <div key={item.id} className="flex items-center gap-2 bg-amber-50 px-3 py-2">
                                <Input value={editNombre} onChange={(e) => setEditNombre(e.target.value)} className="flex-1" aria-label="Nombre" />
                                <button type="button" onClick={() => guardarEdicion(item)} disabled={guardando} className="rounded-md p-1.5 text-green-600 hover:bg-green-100" aria-label="Guardar">
                                    <Check className="h-4 w-4" />
                                </button>
                                <button type="button" onClick={() => setEditId(null)} className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100" aria-label="Cancelar">
                                    <X className="h-4 w-4" />
                                </button>
                            </div>
                        ) : (
                            <div key={item.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                                <span className="font-medium text-warm-900">{item.nombre}</span>
                                {item.activo === false && <Badge variant="gray">Inactivo</Badge>}
                                <div className="ml-auto flex items-center gap-1">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setEditId(item.id);
                                            setEditNombre(item.nombre);
                                        }}
                                        className="rounded-md p-1.5 text-blue-600 hover:bg-blue-50"
                                        aria-label={`Editar ${item.nombre}`}
                                    >
                                        <Pencil className="h-4 w-4" />
                                    </button>
                                    <button type="button" onClick={() => eliminar(item)} disabled={guardando} className="rounded-md p-1.5 text-red-600 hover:bg-red-50" aria-label={`Eliminar ${item.nombre}`}>
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>
                        ),
                    )}
                </div>
            </Modal>
        </div>
    );
}
