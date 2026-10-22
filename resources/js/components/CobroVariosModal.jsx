import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import api, { asList } from '../lib/api';
import { diaLocal, hoyIso } from '../lib/fechas';
import { useToast } from '../lib/toast';
import MetodoCajaPicker from './MetodoCajaPicker';
import { Alert, Button, Input, Modal, SearchSelect, Select, cn } from './ui';

const money = (n, moneda = 'PEN') =>
    new Intl.NumberFormat('es-PE', { style: 'currency', currency: moneda || 'PEN' }).format(Number(n) || 0);
const redondear = (n) => Math.round((Number(n) || 0) * 100) / 100;

const fechaCorta = (valor) => {
    const dia = diaLocal(valor);
    return dia ? dia.split('-').reverse().join('/') : '';
};

const documentoDe = (c) => (c.nota_venta ? `${c.nota_venta.serie}-${c.nota_venta.numero}` : `#${c.id}`);
/** Lo que todavía se puede cobrar aquí: el saldo menos lo que pasó a letras de cambio. */
const cobrableDe = (c) => Math.max(redondear((Number(c.saldo) || 0) - (Number(c.en_letras) || 0)), 0);

const linea = () => ({ tipo: '', cuentaId: '', billeteraId: '', referencia: '', monto: '' });

/**
 * Cobrar varios documentos de un cliente con un solo pago: una transferencia de 300 que paga una guía de 100 y otra de
 * 200. Se marcan los documentos, se indica cuánto se abona a cada uno (por defecto, su saldo) y cómo pagó el cliente. El
 * pago se reparte entre los documentos y cada uno queda con su abono y su movimiento en la caja abierta.
 */
export default function CobroVariosModal({ open, onClose, onSaved, inicial = null, onUnDocumento = null }) {
    const toast = useToast();
    const [pendientes, setPendientes] = useState([]);
    const [cargando, setCargando] = useState(false);
    const [cuentas, setCuentas] = useState([]);
    const [billeteras, setBilleteras] = useState([]);

    const [clienteId, setClienteId] = useState('');
    const [moneda, setMoneda] = useState('PEN');
    /** Los documentos marcados con lo que se abona a cada uno: { [cuentaId]: '100.00' }. */
    const [marcados, setMarcados] = useState({});
    const [lineas, setLineas] = useState([linea()]);
    const [fecha, setFecha] = useState(hoyIso());
    const [glosa, setGlosa] = useState('');
    const [glosaEditada, setGlosaEditada] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!open) return;
        setClienteId('');
        setMoneda('PEN');
        setMarcados({});
        setLineas([linea()]);
        setFecha(hoyIso());
        setGlosa('');
        setGlosaEditada(false);
        setCargando(true);
        api.get('/cuentas-por-cobrar')
            .then((res) => {
                const lista = asList(res).filter((c) => c.cliente_id && !['anulado', 'pagado', 'pagada'].includes(c.estado) && cobrableDe(c) > 0.005);
                setPendientes(lista);
                // Viene de cobrar un documento: el cliente y ese documento ya quedan elegidos.
                if (inicial?.clienteId) {
                    const propias = lista.filter((c) => String(c.cliente_id) === String(inicial.clienteId));
                    const elegido = propias.find((c) => c.id === inicial.cuentaId);
                    setClienteId(String(inicial.clienteId));
                    setMoneda(elegido ? elegido.moneda || 'PEN' : propias.some((c) => (c.moneda || 'PEN') === 'PEN') ? 'PEN' : (propias[0]?.moneda || 'PEN'));
                    setMarcados(elegido ? { [elegido.id]: String(cobrableDe(elegido)) } : {});
                }
            })
            .catch(() => toast.error('No se pudieron cargar los documentos con saldo.'))
            .finally(() => setCargando(false));
        Promise.all([api.get('/cuentas-bancarias'), api.get('/billeteras-digitales')])
            .then(([c, b]) => {
                setCuentas(asList(c));
                setBilleteras(asList(b));
            })
            .catch(() => {});
    }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

    const clientes = useMemo(() => {
        const mapa = new Map();
        pendientes.forEach((c) => mapa.set(String(c.cliente_id), c.cliente?.nombre ?? `Cliente ${c.cliente_id}`));
        return [...mapa.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, 'es'));
    }, [pendientes]);

    const delCliente = useMemo(() => pendientes.filter((c) => String(c.cliente_id) === String(clienteId)), [pendientes, clienteId]);
    const monedas = useMemo(() => [...new Set(delCliente.map((c) => c.moneda || 'PEN'))], [delCliente]);

    /** Los documentos que se pueden marcar: los de la moneda elegida, del más antiguo al más nuevo. */
    const documentos = useMemo(
        () =>
            delCliente
                .filter((c) => (c.moneda || 'PEN') === moneda)
                .sort((a, b) => String(a.nota_venta?.fecha_emision ?? '').localeCompare(String(b.nota_venta?.fecha_emision ?? '')) || a.id - b.id),
        [delCliente, moneda],
    );

    const elegirCliente = (v) => {
        const id = v ?? '';
        setClienteId(id);
        setMarcados({});
        setLineas([linea()]);
        setGlosaEditada(false);
        const propias = pendientes.filter((c) => String(c.cliente_id) === String(id)).map((c) => c.moneda || 'PEN');
        setMoneda(propias.includes('PEN') || !propias.length ? 'PEN' : propias[0]);
    };

    const marcar = (c, si) =>
        setMarcados((prev) => {
            const { [c.id]: _quitado, ...resto } = prev;
            return si ? { ...resto, [c.id]: String(cobrableDe(c)) } : resto;
        });

    const marcarTodos = () =>
        setMarcados(Object.fromEntries(documentos.map((c) => [c.id, String(cobrableDe(c))])));

    const seleccion = documentos.filter((c) => marcados[c.id] !== undefined);
    const montoDe = (c) => Number(marcados[c.id]) || 0;
    const totalDocs = redondear(seleccion.reduce((acc, c) => acc + montoDe(c), 0));

    /** Con un solo método, lo recibido es el total de los documentos; con varios, cada uno lleva su monto. */
    const mixto = lineas.length > 1;
    const recibido = mixto ? redondear(lineas.reduce((acc, l) => acc + (Number(l.monto) || 0), 0)) : totalDocs;
    const diferencia = redondear(totalDocs - recibido);

    const glosaAuto = useMemo(() => {
        const cancela = seleccion.length > 0 && seleccion.every((c) => montoDe(c) >= cobrableDe(c) - 0.01);
        const nombre = clientes.find((c) => c.value === String(clienteId))?.label;
        return `${cancela ? 'CANC' : 'AMORT'} D: ${seleccion.map(documentoDe).join(', ')}${nombre ? `, ${nombre}` : ''}`.slice(0, 255);
    }, [seleccion, marcados, clienteId, clientes]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => {
        if (!glosaEditada) setGlosa(glosaAuto);
    }, [glosaAuto, glosaEditada]);

    const setLinea = (i, patch) => setLineas((p) => p.map((l, k) => (k === i ? { ...l, ...patch } : l)));

    const agregarMetodo = () =>
        setLineas((p) => (p.length === 1 ? [{ ...p[0], monto: String(totalDocs || '') }, linea()] : [...p, linea()]));
    const quitarMetodo = (i) => setLineas((p) => (p.length === 2 ? [{ ...p.find((_, k) => k !== i), monto: '' }] : p.filter((_, k) => k !== i)));

    const excede = seleccion.some((c) => montoDe(c) > cobrableDe(c) + 0.01);
    const metodosIncompletos = lineas.some((l) => !l.tipo || (l.tipo === 'transferencia' && !l.cuentaId) || (l.tipo === 'billetera' && !l.billeteraId));
    const puedeGuardar = seleccion.length > 0 && totalDocs > 0 && !excede && !metodosIncompletos && Math.abs(diferencia) < 0.005 && seleccion.every((c) => montoDe(c) > 0);

    const guardar = async () => {
        if (!fecha || fecha > hoyIso()) return toast.error('La fecha del abono no puede ser futura.');
        setSaving(true);
        try {
            await api.post('/cuentas-por-cobrar/pagos-varios', {
                fecha,
                glosa: glosa.trim() || null,
                documentos: seleccion.map((c) => ({ cuenta_id: c.id, monto: montoDe(c) })),
                pagos: lineas.map((l) => ({
                    forma_pago: l.tipo,
                    cuenta_bancaria_id: l.tipo === 'transferencia' ? l.cuentaId || null : null,
                    billetera_id: l.tipo === 'billetera' ? l.billeteraId || null : null,
                    monto: mixto ? Number(l.monto) : totalDocs,
                    referencia: l.tipo !== 'efectivo' ? l.referencia.trim() || null : null,
                })),
            });
            toast.success(`Cobro registrado en ${seleccion.length} documento${seleccion.length === 1 ? '' : 's'}.`);
            onSaved?.();
            onClose();
        } catch (err) {
            const v = err.response?.data?.errors ?? {};
            toast.error(Object.values(v)[0]?.[0] ?? err.response?.data?.message ?? 'No se pudo registrar el cobro.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal
            open={open}
            onClose={onClose}
            size="2xl"
            title="Amortización de documentos"
            description="Cobro de varios documentos de un cliente con un solo pago"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>Salir</Button>
                    <Button onClick={guardar} loading={saving} disabled={!puedeGuardar}>
                        Cobrar {totalDocs > 0 ? money(totalDocs, moneda) : ''}
                    </Button>
                </>
            }
        >
            <div className="space-y-4">
                {onUnDocumento && (
                    <div className="flex items-center justify-between gap-3 rounded-lg bg-primary-50 px-3 py-2 text-sm">
                        <span className="text-primary-800">Estás cobrando <strong>varios documentos</strong> con un solo pago.</span>
                        <Button size="sm" variant="secondary" onClick={onUnDocumento}>Cobrar un solo documento</Button>
                    </div>
                )}
                <div className="grid gap-3 sm:grid-cols-3">
                    <SearchSelect
                        className="sm:col-span-2"
                        label="Cliente"
                        value={clienteId}
                        onChange={elegirCliente}
                        clearable={false}
                        placeholder={cargando ? 'Cargando…' : 'Busca al cliente…'}
                        emptyText={cargando ? 'Cargando…' : 'No hay clientes con documentos por cobrar'}
                        options={clientes}
                    />
                    <Input label="Fecha de abono" type="date" max={hoyIso()} value={fecha} onChange={(e) => setFecha(e.target.value)} />
                </div>

                {clienteId && monedas.length > 1 && (
                    <Select
                        label="Moneda"
                        value={moneda}
                        onChange={(e) => {
                            setMoneda(e.target.value);
                            setMarcados({});
                        }}
                        options={monedas.map((m) => ({ value: m, label: m === 'USD' ? 'Dólares' : 'Soles' }))}
                        className="w-48"
                    />
                )}

                {clienteId && (
                    <div>
                        <div className="mb-1 flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-warm-900">Documentos por cobrar</h3>
                            {documentos.length > 1 && (
                                <button type="button" onClick={seleccion.length === documentos.length ? () => setMarcados({}) : marcarTodos} className="text-xs font-semibold text-primary-600 hover:underline">
                                    {seleccion.length === documentos.length ? 'Quitar todos' : 'Marcar todos'}
                                </button>
                            )}
                        </div>
                        <div className="divide-y divide-gray-100 rounded-lg border border-edge">
                            {documentos.map((c) => {
                                const marcado = marcados[c.id] !== undefined;
                                const cobrable = cobrableDe(c);
                                return (
                                    <label key={c.id} className={cn('flex flex-wrap items-center gap-3 px-3 py-2 text-sm', marcado && 'bg-primary-50/50')}>
                                        <input type="checkbox" checked={marcado} onChange={(e) => marcar(c, e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-primary-600" />
                                        <span className="min-w-0 flex-1">
                                            <span className="font-semibold text-warm-900">{documentoDe(c)}</span>
                                            {c.total_cuotas > 1 && <span className="text-warm-500"> · cuota {c.numero_cuota}/{c.total_cuotas}</span>}
                                            <span className="block text-xs text-warm-500">
                                                {c.nota_venta?.fecha_emision ? `Emitido ${fechaCorta(c.nota_venta.fecha_emision)}` : ''}
                                                {c.fecha_vencimiento ? ` · vence ${fechaCorta(c.fecha_vencimiento)}` : ''}
                                            </span>
                                        </span>
                                        <span className="text-right text-xs text-warm-500">
                                            Saldo
                                            <span className="block text-sm font-semibold text-red-600">{money(cobrable, moneda)}</span>
                                        </span>
                                        <div className="w-28 shrink-0">
                                            <Input
                                                type="number"
                                                min="0"
                                                step="0.01"
                                                disabled={!marcado}
                                                value={marcado ? marcados[c.id] : ''}
                                                placeholder="Abona"
                                                onChange={(e) => setMarcados((prev) => ({ ...prev, [c.id]: e.target.value }))}
                                                className="text-right"
                                                aria-label={`Importe a abonar a ${documentoDe(c)}`}
                                            />
                                        </div>
                                    </label>
                                );
                            })}
                            {documentos.length === 0 && <p className="px-3 py-4 text-center text-sm text-warm-500">Este cliente no tiene documentos con saldo.</p>}
                        </div>
                        {excede && <p className="mt-1 text-xs text-red-600">Algún importe es mayor que el saldo de su documento.</p>}
                    </div>
                )}

                {seleccion.length > 0 && (
                    <>
                        <div className="rounded-lg bg-gray-50 px-3 py-2.5 text-sm">
                            <div className="flex justify-between">
                                <span className="text-warm-500">{seleccion.length} documento{seleccion.length === 1 ? '' : 's'} · total a cobrar</span>
                                <span className="font-bold text-primary-700">{money(totalDocs, moneda)}</span>
                            </div>
                        </div>

                        <div>
                            <h3 className="mb-1 text-sm font-semibold text-warm-900">Cómo pagó el cliente</h3>
                            <div className="space-y-3">
                                {lineas.map((l, i) => (
                                    <div key={i} className="rounded-lg border border-edge p-3">
                                        <MetodoCajaPicker
                                            cuentas={cuentas}
                                            billeteras={billeteras}
                                            tipo={l.tipo}
                                            cuentaId={l.cuentaId}
                                            billeteraId={l.billeteraId}
                                            onChange={({ tipo, cuentaId, billeteraId }) => setLinea(i, { tipo, cuentaId, billeteraId })}
                                            referencia={l.referencia}
                                            onReferencia={(referencia) => setLinea(i, { referencia })}
                                        />
                                        {mixto && (
                                            <div className="mt-2 flex items-center gap-2">
                                                <div className="w-32">
                                                    <Input type="number" min="0" step="0.01" placeholder="Monto" value={l.monto} onChange={(e) => setLinea(i, { monto: e.target.value })} className="text-right" aria-label="Monto con este método" />
                                                </div>
                                                <button type="button" onClick={() => quitarMetodo(i)} className="rounded-md p-2 text-red-600 hover:bg-red-50" aria-label="Quitar este método">
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                            <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={agregarMetodo}>
                                <Plus className="h-4 w-4" /> Pagó con otro método también
                            </Button>
                            {mixto && Math.abs(diferencia) >= 0.005 && (
                                <Alert variant="warning" className="mt-2">
                                    {diferencia > 0 ? `Faltan ${money(diferencia, moneda)}` : `Sobran ${money(-diferencia, moneda)}`} para igualar el total de los documentos.
                                </Alert>
                            )}
                        </div>

                        <Input label="Glosa" value={glosa} maxLength={255} onChange={(e) => { setGlosa(e.target.value); setGlosaEditada(true); }} />
                        <p className="text-xs text-warm-500">
                            Cada documento queda con su abono y su movimiento en tu caja abierta, con la misma referencia de pago.
                        </p>
                    </>
                )}
            </div>
        </Modal>
    );
}
