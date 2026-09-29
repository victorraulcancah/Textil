import { useEffect, useMemo, useState } from 'react';
import { FileSearch } from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import { convertir, money, MONEDAS } from '../lib/moneda';
import { Alert, Button, Input, Modal, Select, Spinner } from './ui';

const hoy = () => new Date().toISOString().slice(0, 10);

/** Así arranca una línea nueva: a crédito, a 30 días. */
export const lineaVacia = () => ({
    moneda: 'PEN',
    limite: '',
    fecha_aprobacion: hoy(),
    vigente_hasta: '',
    activa: true,
    condicion_venta: 'credito',
    dias_credito: '30',
    dias_gracia: '0',
    ampliacion_tipo: '',
    ampliacion_valor: '',
    ampliacion_hasta: '',
    observaciones: '',
});

/** La línea como la manda la API, lista para el formulario. */
export const lineaDesdeApi = (l) =>
    l
        ? {
              moneda: l.moneda ?? 'PEN',
              limite: String(Number(l.limite) || 0),
              fecha_aprobacion: l.fecha_aprobacion ?? '',
              vigente_hasta: l.vigente_hasta ?? '',
              activa: Boolean(l.activa),
              condicion_venta: l.condicion_venta ?? 'contado',
              dias_credito: String(l.dias_credito ?? 0),
              dias_gracia: String(l.dias_gracia ?? 0),
              ampliacion_tipo: l.ampliacion_tipo ?? '',
              ampliacion_valor: l.ampliacion_tipo ? String(Number(l.ampliacion_valor) || 0) : '',
              ampliacion_hasta: l.ampliacion_hasta ?? '',
              observaciones: l.observaciones ?? '',
          }
        : null;

/** Lo que se manda a la API. */
export const lineaParaApi = (l) => ({
    moneda: l.moneda,
    limite: Number(l.limite) || 0,
    fecha_aprobacion: l.fecha_aprobacion || null,
    vigente_hasta: l.vigente_hasta || null,
    activa: Boolean(l.activa),
    condicion_venta: l.condicion_venta,
    dias_credito: Number(l.dias_credito) || 0,
    dias_gracia: Number(l.dias_gracia) || 0,
    ampliacion_tipo: l.ampliacion_tipo || null,
    ampliacion_valor: l.ampliacion_tipo ? Number(l.ampliacion_valor) || 0 : 0,
    ampliacion_hasta: l.ampliacion_tipo ? l.ampliacion_hasta || null : null,
    observaciones: l.observaciones || null,
});

/** Lo que suma hoy la ampliación, igual que en el servidor. */
const ampliacionDe = (l) => {
    const valor = Number(l.ampliacion_valor) || 0;
    if (!l.ampliacion_tipo || valor <= 0) return 0;
    if (l.ampliacion_hasta && l.ampliacion_hasta < hoy()) return 0;
    return l.ampliacion_tipo === 'porcentaje' ? ((Number(l.limite) || 0) * valor) / 100 : valor;
};

function Seccion({ titulo, children, className = '' }) {
    return (
        <fieldset className={`rounded-lg border border-edge p-3 ${className}`}>
            <legend className="px-1 text-xs font-bold uppercase tracking-wide text-warm-500">{titulo}</legend>
            {children}
        </fieldset>
    );
}

/**
 * La línea de crédito de un cliente. Con el cliente ya creado se guarda
 * aquí mismo; en uno nuevo se aplica al formulario y se guarda al crearlo.
 * Sin permiso para aprobar crédito se ve pero no se cambia.
 */
export default function LineaCreditoModal({ open, onClose, cliente, valor, tipoPrecioId, tiposPrecio = [], onAplicar, onGuardado }) {
    const toast = useToast();
    const { puede } = useAuth();
    const puedeAprobar = puede('ventas.clientes.linea_credito');
    const puedeEditarCliente = puede('ventas.clientes.editar') || (!cliente && puede('ventas.clientes.crear'));

    const [linea, setLinea] = useState(lineaVacia());
    const [tipoPrecio, setTipoPrecio] = useState('');
    const [resumen, setResumen] = useState(null);
    const [cargando, setCargando] = useState(false);
    const [guardando, setGuardando] = useState(false);
    const [errores, setErrores] = useState({});

    useEffect(() => {
        if (!open) return;
        setLinea(valor ?? lineaVacia());
        setTipoPrecio(tipoPrecioId ? String(tipoPrecioId) : '');
        setErrores({});
        setResumen(null);
        if (!cliente?.id) return;
        setCargando(true);
        api.get(`/clientes/${cliente.id}/credito`)
            .then(({ data }) => {
                setResumen(data.resumen);
                if (data.linea) setLinea(lineaDesdeApi(data.linea));
            })
            .catch(() => toast.error('No se pudo cargar la línea de crédito.'))
            .finally(() => setCargando(false));
    }, [open, cliente?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    const campo = (nombre, v) => {
        setLinea((prev) => ({ ...prev, [nombre]: v }));
        if (errores[nombre]) setErrores((prev) => ({ ...prev, [nombre]: undefined }));
    };

    /** Lo usado y lo disponible con lo que se está escribiendo, en la moneda elegida. */
    const calculo = useMemo(() => {
        const deuda = Object.entries(resumen?.deuda_por_moneda ?? {}).reduce(
            (acc, [m, saldo]) => acc + convertir(saldo, m, linea.moneda, resumen?.tipo_cambio),
            0,
        );
        const ampliacion = ampliacionDe(linea);
        const total = (Number(linea.limite) || 0) + ampliacion;
        return { deuda, ampliacion, total, disponible: total - deuda };
    }, [resumen, linea]);

    const soloLectura = !puedeAprobar;

    const guardar = async () => {
        if (!cliente?.id) {
            onAplicar?.({ linea, tipo_precio_id: tipoPrecio });
            onClose();
            return;
        }
        setGuardando(true);
        setErrores({});
        try {
            const { data } = await api.put(`/clientes/${cliente.id}`, {
                tipo_precio_id: tipoPrecio || null,
                ...(puedeAprobar ? { linea_credito: lineaParaApi(linea) } : {}),
            });
            toast.success('Línea de crédito guardada.');
            onGuardado?.(data);
            onClose();
        } catch (err) {
            if (err.response?.status === 422) {
                const e = err.response.data?.errors ?? {};
                setErrores(Object.fromEntries(Object.entries(e).map(([k, v]) => [k.replace('linea_credito.', ''), v[0]])));
            } else {
                toast.error(err.response?.data?.message ?? 'No se pudo guardar la línea de crédito.');
            }
        } finally {
            setGuardando(false);
        }
    };

    const esCredito = linea.condicion_venta === 'credito';

    return (
        <Modal
            open={open}
            onClose={onClose}
            title="Línea de crédito"
            description={cliente?.nombre ?? 'Cliente nuevo: se guarda al crear el cliente.'}
            size="2xl"
            footer={
                <div className="flex w-full flex-wrap items-center justify-between gap-2">
                    {cliente?.id && puede('tesoreria.estado-cuenta') ? (
                        <Button
                            variant="secondary"
                            onClick={() => window.open(`/estado-cuenta?cliente=${cliente.id}`, '_blank', 'noopener')}
                            title="Ver el estado de cuenta del cliente"
                        >
                            <FileSearch className="h-4 w-4" /> Consulta
                        </Button>
                    ) : (
                        <span />
                    )}
                    <div className="flex gap-2">
                        <Button variant="secondary" onClick={onClose}>
                            {soloLectura && !puedeEditarCliente ? 'Cerrar' : 'Cancelar'}
                        </Button>
                        {(puedeAprobar || puedeEditarCliente) && (
                            <Button loading={guardando} onClick={guardar}>
                                {cliente?.id ? 'Guardar' : 'Aceptar'}
                            </Button>
                        )}
                    </div>
                </div>
            }
        >
            {cargando ? (
                <div className="flex justify-center py-10">
                    <Spinner className="text-primary-600" />
                </div>
            ) : (
                <div className="space-y-4">
                    {soloLectura && (
                        <Alert variant="info">
                            Solo quien tiene el permiso "Aprobar línea de crédito" puede cambiar la línea.
                        </Alert>
                    )}

                    {/* Lo aprobado, lo que debe y lo que le queda, en vivo. */}
                    <div className="grid grid-cols-2 gap-3 rounded-xl border border-edge bg-gray-50 p-3 sm:grid-cols-4">
                        <div>
                            <p className="text-[11px] uppercase tracking-wide text-warm-500">Línea aprobada</p>
                            <p className="font-semibold text-warm-900">{money(calculo.total, linea.moneda)}</p>
                            {calculo.ampliacion > 0 && (
                                <p className="text-[11px] text-warm-500">incluye ampliación {money(calculo.ampliacion, linea.moneda)}</p>
                            )}
                        </div>
                        <div>
                            <p className="text-[11px] uppercase tracking-wide text-warm-500">Deuda pendiente</p>
                            <p className="font-semibold text-red-600">{money(calculo.deuda, linea.moneda)}</p>
                        </div>
                        <div>
                            <p className="text-[11px] uppercase tracking-wide text-warm-500">Disponible</p>
                            <p className={`font-semibold ${calculo.disponible < 0 ? 'text-red-600' : 'text-green-600'}`}>
                                {money(calculo.disponible, linea.moneda)}
                            </p>
                        </div>
                        <div>
                            <p className="text-[11px] uppercase tracking-wide text-warm-500">Estado</p>
                            <p className="text-sm font-medium text-warm-900">
                                {resumen?.impedimento && cliente?.id ? resumen.impedimento : esCredito ? 'Puede comprar a crédito' : 'Compra al contado'}
                            </p>
                        </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                        <Seccion titulo="Línea de crédito">
                            <div className="space-y-3">
                                <Select
                                    label="Moneda"
                                    value={linea.moneda}
                                    onChange={(e) => campo('moneda', e.target.value)}
                                    options={MONEDAS}
                                    disabled={soloLectura}
                                />
                                <Input
                                    label="Límite"
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={linea.limite}
                                    onChange={(e) => campo('limite', e.target.value)}
                                    error={errores.limite}
                                    disabled={soloLectura}
                                    className="text-right"
                                />
                                <Input
                                    label="Fecha de aprobación"
                                    type="date"
                                    value={linea.fecha_aprobacion}
                                    onChange={(e) => campo('fecha_aprobacion', e.target.value)}
                                    error={errores.fecha_aprobacion}
                                    disabled={soloLectura}
                                />
                            </div>
                        </Seccion>

                        <Seccion titulo="Condición de venta">
                            <div className="space-y-3">
                                <Select
                                    label="Condición"
                                    value={linea.condicion_venta}
                                    onChange={(e) => campo('condicion_venta', e.target.value)}
                                    options={[
                                        { value: 'contado', label: 'Contado' },
                                        { value: 'credito', label: 'Crédito' },
                                    ]}
                                    disabled={soloLectura}
                                />
                                <div className="grid grid-cols-2 gap-3">
                                    <Input
                                        label="Días de crédito"
                                        type="number"
                                        min="0"
                                        list="dias-credito"
                                        value={linea.dias_credito}
                                        onChange={(e) => campo('dias_credito', e.target.value)}
                                        error={errores.dias_credito}
                                        disabled={soloLectura || !esCredito}
                                    />
                                    <Input
                                        label="Días de gracia"
                                        type="number"
                                        min="0"
                                        value={linea.dias_gracia}
                                        onChange={(e) => campo('dias_gracia', e.target.value)}
                                        error={errores.dias_gracia}
                                        disabled={soloLectura || !esCredito}
                                    />
                                </div>
                                <datalist id="dias-credito">
                                    {[7, 15, 30, 45, 60, 90].map((d) => (
                                        <option key={d} value={d} />
                                    ))}
                                </datalist>
                                <p className="text-xs text-warm-400">
                                    Las cuotas de una venta a crédito vencen a estos días. Con días de gracia, una cuota
                                    recién cuenta como vencida pasados esos días.
                                </p>
                            </div>
                        </Seccion>
                    </div>

                    <Seccion titulo="Ampliación de línea de crédito">
                        <div className="flex flex-wrap items-end gap-4">
                            <div className="flex flex-wrap gap-4 pb-2">
                                {[
                                    ['', '(Ninguna)'],
                                    ['importe', 'Importe'],
                                    ['porcentaje', 'Porcentaje (%)'],
                                ].map(([v, etiqueta]) => (
                                    <label key={v || 'ninguna'} className="flex items-center gap-1.5 text-sm text-gray-700">
                                        <input
                                            type="radio"
                                            name="ampliacion"
                                            checked={linea.ampliacion_tipo === v}
                                            onChange={() => campo('ampliacion_tipo', v)}
                                            disabled={soloLectura}
                                            className="h-4 w-4 accent-primary-600"
                                        />
                                        {etiqueta}
                                    </label>
                                ))}
                            </div>
                            <div className="w-36">
                                <Input
                                    label={linea.ampliacion_tipo === 'porcentaje' ? 'Porcentaje' : 'Importe'}
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={linea.ampliacion_valor}
                                    onChange={(e) => campo('ampliacion_valor', e.target.value)}
                                    disabled={soloLectura || !linea.ampliacion_tipo}
                                    error={errores.ampliacion_valor}
                                    className="text-right"
                                />
                            </div>
                            <div className="w-44">
                                <Input
                                    label="Caduca"
                                    type="date"
                                    value={linea.ampliacion_hasta}
                                    onChange={(e) => campo('ampliacion_hasta', e.target.value)}
                                    disabled={soloLectura || !linea.ampliacion_tipo}
                                    error={errores.ampliacion_hasta}
                                />
                            </div>
                        </div>
                    </Seccion>

                    <div className="grid gap-4 md:grid-cols-2">
                        <Seccion titulo="Vigencia">
                            <div className="space-y-3">
                                <Input
                                    label="Vigente hasta"
                                    type="date"
                                    value={linea.vigente_hasta}
                                    onChange={(e) => campo('vigente_hasta', e.target.value)}
                                    error={errores.vigente_hasta}
                                    disabled={soloLectura}
                                />
                                <p className="-mt-2 text-xs text-warm-400">Vacío: no vence.</p>
                                <label className="flex items-center gap-2 text-sm text-gray-700">
                                    <input
                                        type="checkbox"
                                        checked={linea.activa}
                                        onChange={(e) => campo('activa', e.target.checked)}
                                        disabled={soloLectura}
                                        className="h-4 w-4 rounded border-gray-300 accent-primary-600"
                                    />
                                    Línea de crédito vigente
                                </label>
                            </div>
                        </Seccion>

                        <Seccion titulo="Lista de precio">
                            <Select
                                label="Tipo de precio"
                                value={tipoPrecio}
                                onChange={(e) => setTipoPrecio(e.target.value)}
                                options={[
                                    { value: '', label: 'El principal' },
                                    ...tiposPrecio.filter((t) => !t.principal).map((t) => ({ value: String(t.id), label: t.nombre })),
                                ]}
                                disabled={!puedeEditarCliente}
                            />
                            <p className="mt-1 text-xs text-warm-400">
                                Los precios por cantidad ("desde") se arman en Lista de precios.
                            </p>
                        </Seccion>
                    </div>

                    <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">Observaciones</label>
                        <textarea
                            rows={3}
                            value={linea.observaciones}
                            onChange={(e) => campo('observaciones', e.target.value)}
                            disabled={soloLectura}
                            className="block w-full resize-none rounded-md border-0 p-3 text-sm text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-primary-600 disabled:bg-gray-50"
                        />
                    </div>
                </div>
            )}
        </Modal>
    );
}
