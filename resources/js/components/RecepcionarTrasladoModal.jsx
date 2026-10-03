import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Check, PackageCheck, ScanLine, TriangleAlert, X } from 'lucide-react';
import api from '../lib/api';
import { useToast } from '../lib/toast';
import EscanerCamara from './EscanerCamara';
import { Alert, Badge, Button, Input, Modal, Spinner, cn } from './ui';

const num = (n) => new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 }).format(Number(n) || 0);

/**
 * Recepcionar un traslado escaneando el QR de cada rollo que llegó (pistola o cámara), como se recepciona una compra.
 * Solo entra al stock lo escaneado: si falta algo se confirma con diferencias y una observación. La alternativa es
 * "Recibir todo", que acepta lo enviado de golpe.
 */
export default function RecepcionarTrasladoModal({ traslado, onClose, onRecibido }) {
    const toast = useToast();
    const [datos, setDatos] = useState(null);
    const [codigo, setCodigo] = useState('');
    const [ultimo, setUltimo] = useState(null);
    const [camara, setCamara] = useState(false);
    const [observacion, setObservacion] = useState('');
    const [confirmando, setConfirmando] = useState(false);
    const inputRef = useRef(null);
    const id = traslado?.id;

    const cargar = useCallback(async () => {
        const { data } = await api.get(`/transferencias/${id}/recepcion`);
        setDatos(data);
    }, [id]);

    useEffect(() => {
        if (!id) return;
        setDatos(null);
        setUltimo(null);
        setCodigo('');
        setObservacion('');
        cargar().catch(() => {
            toast.error('No se pudo abrir la recepción.');
            onClose();
        });
    }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (datos) inputRef.current?.focus();
    }, [datos, ultimo]);

    /** La pistola y la cámara pasan por aquí: mismo resultado y mismo aviso. */
    const verificar = useCallback(
        async (valor) => {
            if (!valor) return { ok: false, texto: 'Código vacío.' };
            try {
                const { data } = await api.post(`/transferencias/${id}/recepcion/escanear`, { codigo: valor });
                setUltimo({ ok: true, codigo: data.rollo.codigo, texto: `Rollo correcto · ${num(data.metros)} m` });
                await cargar();
                return { ok: true, texto: `Rollo correcto · ${num(data.metros)} m · ${data.recibidos}/${data.total}` };
            } catch (err) {
                const texto = err.response?.data?.message ?? 'No se pudo verificar el rollo.';
                setUltimo({ ok: false, codigo: valor, texto });
                return { ok: false, texto };
            }
        },
        [id, cargar],
    );

    const escanear = async (e) => {
        e.preventDefault();
        const valor = codigo.trim();
        if (!valor) return;
        setCodigo('');
        await verificar(valor);
    };

    const quitar = async (rolloId) => {
        try {
            const { data } = await api.post(`/transferencias/${id}/recepcion/quitar`, { rollo_id: rolloId });
            setDatos(data);
        } catch (err) {
            toast.error(err.response?.data?.message ?? 'No se pudo quitar el rollo.');
        }
    };

    const confirmar = async () => {
        setConfirmando(true);
        try {
            await api.post(`/transferencias/${id}/recepcion/confirmar`, { observacion: observacion.trim() || undefined });
            toast.success(`${datos.requerimiento ?? datos.documento} recepcionado: el stock ya está en tu almacén.`);
            onRecibido?.();
            onClose();
        } catch (err) {
            toast.error(err.response?.data?.message ?? err.response?.data?.errors?.observacion?.[0] ?? 'No se pudo confirmar la recepción.');
        } finally {
            setConfirmando(false);
        }
    };

    const faltan = datos ? datos.rollos_total - datos.rollos_recibidos : 0;
    const avance = datos ? `${datos.rollos_recibidos}/${datos.rollos_total} rollos` : '';

    return (
        <>
            <Modal
                open={Boolean(traslado)}
                onClose={onClose}
                size="2xl"
                title={`Recepcionar ${datos?.requerimiento ?? datos?.documento ?? traslado?.documento ?? ''}`}
                description={datos ? `De ${datos.origen} a ${datos.destino}${datos.requerimiento ? ` · guía ${datos.documento}` : ''}` : undefined}
                footer={
                    <>
                        <Button variant="secondary" onClick={onClose}>Cerrar</Button>
                        <Button loading={confirmando} disabled={!datos?.con_rollos || datos.rollos_recibidos === 0} onClick={confirmar}>
                            <PackageCheck className="h-4 w-4" />
                            {faltan > 0 && datos?.rollos_recibidos > 0 ? 'Recepcionar con diferencias' : 'Confirmar recepción'}
                        </Button>
                    </>
                }
            >
                {!datos ? (
                    <div className="flex justify-center py-12"><Spinner className="text-primary-600" /></div>
                ) : !datos.con_rollos ? (
                    <Alert variant="info">
                        Este traslado no tiene rollos que escanear (es por cantidad o salió antes de esta función). Usa <strong>Recibir todo</strong>.
                    </Alert>
                ) : (
                    <div className="space-y-4">
                        <form onSubmit={escanear}>
                            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-warm-500">Escanea el rollo que llegó</label>
                            <div className="flex items-center gap-2">
                                <span className="relative flex-1">
                                    <ScanLine className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-primary-600" />
                                    <input
                                        ref={inputRef}
                                        value={codigo}
                                        onChange={(e) => setCodigo(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                escanear(e);
                                            }
                                        }}
                                        placeholder="Dispara la pistola sobre la etiqueta…"
                                        autoComplete="off"
                                        className="w-full rounded-lg border border-edge py-2.5 pl-10 pr-3 font-mono text-sm shadow-sm outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                                    />
                                </span>
                                <Button type="submit" size="sm" disabled={!codigo.trim()}>Verificar</Button>
                                <Button type="button" variant="secondary" size="sm" onClick={() => setCamara(true)} title="Escanear con la cámara">
                                    <Camera className="h-4 w-4" />
                                </Button>
                                <Badge variant={faltan === 0 ? 'green' : 'blue'}>{avance}</Badge>
                            </div>
                            {ultimo && (
                                <div className={cn('mt-2 flex items-center gap-2 rounded-md px-3 py-2 text-sm', ultimo.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800')}>
                                    {ultimo.ok ? <Check className="h-4 w-4 shrink-0" /> : <TriangleAlert className="h-4 w-4 shrink-0" />}
                                    <span><strong>{ultimo.codigo}</strong> · {ultimo.texto}</span>
                                </div>
                            )}
                        </form>

                        <div className="space-y-3">
                            {datos.lineas.map((l) => (
                                <div key={l.id} className="rounded-lg border border-edge">
                                    <div className="flex flex-wrap items-center justify-between gap-2 bg-gray-50 px-3 py-2 text-sm">
                                        <span className="font-semibold text-warm-900">
                                            {l.producto}{l.color && <span className="font-normal text-warm-600"> · {l.color}</span>}
                                        </span>
                                        <span className="text-warm-700">Enviado {num(l.enviado)} {l.presentacion}</span>
                                    </div>
                                    {!l.con_rollos ? (
                                        <p className="px-3 py-2 text-xs text-warm-500">Se recibe por cantidad: no se escanea.</p>
                                    ) : (
                                        <ul className="divide-y divide-edge/60">
                                            {l.rollos.map((x) => (
                                                <li key={x.rollo_id} className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm">
                                                    <span className="flex items-center gap-2 font-mono text-warm-800">
                                                        {x.recibido ? <Check className="h-4 w-4 text-green-600" /> : <span className="h-4 w-4 rounded-full border border-gray-300" />}
                                                        {x.codigo}
                                                    </span>
                                                    <span className="text-warm-600">{num(x.metros)} m</span>
                                                    {x.recibido ? (
                                                        <button type="button" aria-label={`Quitar ${x.codigo}`} title="Deshacer este escaneo" onClick={() => quitar(x.rollo_id)} className="rounded p-0.5 text-red-600 transition hover:bg-red-50">
                                                            <X className="h-3.5 w-3.5" />
                                                        </button>
                                                    ) : (
                                                        <span className="w-4" />
                                                    )}
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            ))}
                        </div>

                        {faltan > 0 && datos.rollos_recibidos > 0 && (
                            <div>
                                <Alert variant="warning">
                                    Faltan <strong>{faltan}</strong> rollo{faltan === 1 ? '' : 's'} por escanear. Si no llegaron, escribe qué pasó y recepciona con diferencias:
                                    solo entra al stock lo escaneado.
                                </Alert>
                                <Input
                                    className="mt-2"
                                    label="Observación"
                                    placeholder="Ej.: el rollo no llegó en el camión"
                                    value={observacion}
                                    onChange={(e) => setObservacion(e.target.value)}
                                />
                            </div>
                        )}
                    </div>
                )}
            </Modal>

            <EscanerCamara abierto={camara} onCerrar={() => setCamara(false)} onLeer={verificar} titulo={datos ? `${datos.requerimiento ?? datos.documento} · ${avance}` : 'Escanear rollo'} />
        </>
    );
}
