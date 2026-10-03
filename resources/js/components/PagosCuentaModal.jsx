import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import api, { asList } from '../lib/api';
import { useAuth } from '../lib/auth';
import { cargarTipoCambio } from '../lib/moneda';
import { useToast } from '../lib/toast';
import MetodoCajaPicker from './MetodoCajaPicker';
import { Alert, Badge, Button, Input, Modal, SearchSelect, Select, cn } from './ui';

const money = (n, moneda = 'PEN') =>
    new Intl.NumberFormat('es-PE', { style: 'currency', currency: moneda || 'PEN' }).format(Number(n) || 0);

/** Hoy en la fecha local (no en UTC: de noche en Perú UTC ya es mañana). */
const hoy = () => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
};

const estadoBadge = (estado) => {
    const map = { pendiente: 'red', parcial: 'amber', pagado: 'green', anulado: 'gray' };
    return <Badge variant={map[estado] ?? 'gray'}>{estado ?? '—'}</Badge>;
};

const metodoPagoLabel = (p) => {
    if (p.cuenta_bancaria) return `Transf. · ${p.cuenta_bancaria.alias || p.cuenta_bancaria.numero_cuenta}`;
    if (p.billetera) return p.billetera.nombre;
    return 'Efectivo';
};

/**
 * `moneda` vacía = la moneda de la deuda; "PEN" = se paga con soles, al
 * `tipoCambio` del día que se escribe a mano.
 */
const emptyLinea = () => ({ tipo: 'efectivo', cuentaId: '', billeteraId: '', monto: '', referencia: '', moneda: '', tipoCambio: '' });

const NOMBRE_MONEDA = { PEN: 'Soles', USD: 'Dólares', CNY: 'Yuanes', EUR: 'Euros' };

/** Antes de elegir el documento (Mi Caja) la ventana se ve completa, con todo en blanco. */
const CUENTA_VACIA = { saldo: 0, monto_total: 0, monto_pagado: 0, pagos: [], estado: null, moneda: 'PEN' };

const TIPOS_COMPRA = { factura: 'Factura', boleta: 'Boleta', no_domiciliado: 'Comprobante no domiciliado' };
const TIPOS_VENTA = { PF: 'Proforma', NV: 'Nota de venta' };

/** Tipo de documento de una cuenta pendiente: de la compra (por pagar) o por la serie de la venta (por cobrar). */
const tipoDeDocumento = (c, esCobrar) => {
    if (!esCobrar) return TIPOS_COMPRA[c.compra?.tipo_documento] ?? 'Compra';
    const prefijo = String(c.nota_venta?.serie ?? '').replace(/\d+/g, '');
    return TIPOS_VENTA[prefijo] ?? (prefijo || 'Venta');
};

const redondear = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** "2026-09-29T05:00:00.000000Z" o "2026-09-29" → "29/09/2026" (sin pasar por la zona horaria: el día es el escrito). */
const fechaCorta = (valor) => {
    const m = String(valor ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : (valor ?? '');
};

const cuentaLabel = (c) => [c.banco?.nombre, c.alias, c.numero_cuenta].filter(Boolean).join(' · ');
const billeteraLabel = (b) => [b.nombre, b.titular, b.numero_asociado].filter(Boolean).join(' · ');

/** Un bloque de la pantalla, con su título arriba a la izquierda (como en una hoja de captura). */
function Bloque({ titulo, children, className }) {
    return (
        <fieldset className={cn('rounded-lg border border-edge px-4 pb-3 pt-1', className)}>
            <legend className="px-2 text-xs font-bold uppercase tracking-wide text-primary-700">{titulo}</legend>
            {children}
        </fieldset>
    );
}

/** Un dato de solo lectura del bloque de referencia. */
function Dato({ etiqueta, children, className }) {
    return (
        <div className={className}>
            <p className="text-[11px] font-medium uppercase tracking-wide text-warm-500">{etiqueta}</p>
            <p className="text-sm font-semibold text-warm-900">{children || '—'}</p>
        </div>
    );
}

/**
 * Amortización de un documento: el cobro de una cuenta por cobrar (o el pago de una por pagar) ordenado por bloques —
 * documento de control, referencia, importe de abono y tipo de pago—. Los pagos anteriores se pueden editar o anular.
 * @param {'cobrar'|'pagar'} tipo
 */
export default function PagosCuentaModal({ open, onClose, cuenta, tipo: tipoProp, onSaved, elegir = false, cerrarAlGuardar = false, permitidos = ['cobrar', 'pagar'] }) {
    const toast = useToast();
    const { user } = useAuth();
    /** Desde Mi Caja un solo botón sirve para cobrar y para pagar: aquí se elige cuál (por defecto, el primero permitido). */
    const [tipoElegido, setTipoElegido] = useState(permitidos[0] ?? 'cobrar');
    const tipo = elegir ? (permitidos.includes(tipoElegido) ? tipoElegido : (permitidos[0] ?? 'cobrar')) : tipoProp;
    const basePath = tipo === 'cobrar' ? '/cuentas-por-cobrar' : '/cuentas-por-pagar';
    const esCobrar = tipo === 'cobrar';

    const [state, setState] = useState(cuenta);
    /** Desde Mi Caja no se llega con un documento: se elige aquí entre los que tienen saldo. */
    const [pendientes, setPendientes] = useState([]);
    const [filtroNombre, setFiltroNombre] = useState('');
    const [filtroTipoDoc, setFiltroTipoDoc] = useState('');
    const [cargandoPendientes, setCargandoPendientes] = useState(false);
    const [cuentas, setCuentas] = useState([]);
    const [billeteras, setBilleteras] = useState([]);
    const [lineas, setLineas] = useState([emptyLinea()]);
    /** Cómo se paga: una sola forma o "multiple" (varias en el mismo abono). */
    const [modo, setModo] = useState('efectivo');
    const [glosa, setGlosa] = useState('');
    const [glosaEditada, setGlosaEditada] = useState(false);
    const [editId, setEditId] = useState(null);
    const [editForm, setEditForm] = useState(emptyLinea());
    const [saving, setSaving] = useState(false);
    /** Al cobrar, el tipo de cambio comercial del día se propone para pagar en soles. */
    const [tcComercial, setTcComercial] = useState(null);
    /** Día en que se recibió el pago: hoy, o uno pasado si se registra tarde. */
    const [fecha, setFecha] = useState(hoy());
    /** Lo último que se propuso como tipo de cambio: si la línea todavía lo tiene, no la tocó nadie. */
    const tcPropuesto = useRef(null);
    /** Fecha para la que no hay tipo de cambio guardado: SUNAT solo publica el de hoy. */
    const [tcSinDato, setTcSinDato] = useState(null);

    useEffect(() => {
        if (!elegir) setState(cuenta);
        setLineas([emptyLinea()]);
        setModo('efectivo');
        setGlosa('');
        setGlosaEditada(false);
        setEditId(null);
        setFecha(hoy());
    }, [cuenta]);

    // Elegir el documento (Mi Caja): los de este almacén con saldo por cobrar o pagar.
    useEffect(() => {
        if (!open || !elegir) return;
        setState(null);
        setFiltroNombre('');
        setFiltroTipoDoc('');
        setCargandoPendientes(true);
        api.get(basePath)
            .then((res) =>
                setPendientes(
                    asList(res).filter((c) => !['anulado', 'pagado', 'pagada'].includes(c.estado) && Number(c.saldo) - (Number(c.en_letras) || 0) > 0.005),
                ),
            )
            .catch(() => toast.error('No se pudieron cargar los documentos con saldo.'))
            .finally(() => setCargandoPendientes(false));
    }, [open, elegir, basePath]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!open) return;
        (async () => {
            try {
                const [c, b] = await Promise.all([api.get('/cuentas-bancarias'), api.get('/billeteras-digitales')]);
                setCuentas(asList(c));
                setBilleteras(asList(b));
            } catch {
                /* ignore */
            }
        })();
    }, [open]);

    // El tipo de cambio que se propone es el del día del pago: el comercial de ese día
    // si ya se cobró con uno y, si no, el de SUNAT de esa fecha. Se escribe a mano igual.
    useEffect(() => {
        if (!open || !esCobrar || !fecha) return;
        let vigente = true;
        cargarTipoCambio(fecha)
            .then((tc) => {
                if (!vigente) return;
                const nuevo = tc?.comercial ?? tc?.venta ?? null;
                const anterior = tcPropuesto.current;
                tcPropuesto.current = nuevo;
                setTcComercial(nuevo);
                setTcSinDato(nuevo ? null : fecha);
                // Las líneas en soles que conservan lo propuesto pasan al de la nueva fecha.
                setLineas((ls) =>
                    ls.map((l) =>
                        l.moneda === 'PEN' && (!l.tipoCambio || (anterior != null && Number(l.tipoCambio) === Number(anterior)))
                            ? { ...l, tipoCambio: nuevo ? String(nuevo) : '' }
                            : l,
                    ),
                );
            })
            .catch(() => vigente && (setTcComercial(null), setTcSinDato(fecha)));
        return () => {
            vigente = false;
        };
    }, [open, esCobrar, fecha]);

    /** La cuenta con la que se trabaja: la elegida o, antes de elegir, una vacía. */
    const cur = state ?? CUENTA_VACIA;
    const hayDoc = Boolean(state);

    const pagos = useMemo(() => (Array.isArray(cur?.pagos) ? cur.pagos : []), [state]);
    const nombre = esCobrar ? cur?.cliente?.nombre : cur?.proveedor?.nombre;
    const anulada = cur?.estado === 'anulado';
    // Lo que pasó a letras de cambio se cobra con la letra: aquí solo se cobra el resto.
    const enLetras = esCobrar ? Number(cur?.en_letras) || 0 : 0;
    const saldo = Math.max((Number(cur?.saldo) || 0) - enLetras, 0);
    const puedePagar = !anulada && saldo > 0.005;

    /** El documento al que se aplica el abono, como se lee en la glosa: "PF002-001" o "C001-001". */
    const documento = esCobrar
        ? cur?.nota_venta
            ? `${cur.nota_venta.serie}-${cur.nota_venta.numero}`
            : `#${cur?.id ?? ''}`
        : (cur?.compra?.numero_compra ?? (cur?.compra ? `${cur.compra.serie ?? ''}-${cur.compra.numero ?? ''}` : `#${cur?.id ?? ''}`));
    const condicion = esCobrar ? cur?.nota_venta?.tipo_pago : cur?.compra?.forma_pago;
    const condicionTexto = condicion ? String(condicion).charAt(0).toUpperCase() + String(condicion).slice(1) : '';
    const ultimoAbono = pagos.reduce((max, p) => (String(p.fecha ?? '') > max ? String(p.fecha ?? '') : max), '');

    /**
     * Una deuda en dólares se puede pagar con soles: el monto va en soles y se
     * abona su equivalente al tipo de cambio. Al cobrar a un cliente se
     * propone el comercial del día; al pagar a un proveedor se escribe.
     */
    const monedaDeuda = cur?.moneda || 'PEN';
    const admiteSoles = monedaDeuda !== 'PEN';
    const enSoles = (l) => admiteSoles && l.moneda === 'PEN';
    /** Lo que una línea abona a la deuda, en la moneda de la deuda. */
    const abonoDe = (l) => {
        if (!enSoles(l)) return Number(l.monto) || 0;
        const tc = Number(l.tipoCambio) || 0;
        return tc > 0 ? redondear((Number(l.monto) || 0) / tc) : 0;
    };
    const multiple = modo === 'multiple';
    /** Las líneas que se van a registrar: todas en "Múltiple", solo la primera en una forma sola. */
    const activas = multiple ? lineas : [lineas[0]];
    const nuevoTotal = activas.reduce((acc, l) => acc + abonoDe(l), 0);
    const pendienteTras = Math.max(saldo - nuevoTotal, 0);
    const faltaTipoCambio = (l) => enSoles(l) && Number(l.monto) > 0 && !(Number(l.tipoCambio) > 0);

    // La glosa se arma sola ("CANC D: PF002-001, CLIENTE") mientras nadie la escriba a mano.
    const glosaAuto = useMemo(() => {
        const cancela = nuevoTotal >= saldo - 0.01 && nuevoTotal > 0;
        return `${cancela ? 'CANC' : 'AMORT'} D: ${documento}${nombre ? `, ${nombre}` : ''}`.slice(0, 255);
    }, [nuevoTotal, saldo, documento, nombre]);
    useEffect(() => {
        if (!glosaEditada) setGlosa(glosaAuto);
    }, [glosaAuto, glosaEditada]);

    const setLinea = (i, patch) => setLineas((p) => p.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
    const addLinea = () => setLineas((p) => [...p, emptyLinea()]);
    const removeLinea = (i) => setLineas((p) => (p.length === 1 ? p : p.filter((_, idx) => idx !== i)));

    /** Cambia la forma de pago: una sola (efectivo, transferencia, billetera) o "múltiple". */
    const elegirModo = (nuevo) => {
        setModo(nuevo);
        if (nuevo === 'multiple') return;
        // Una forma sola: se queda con la primera línea y su moneda.
        setLineas((p) => [{ ...p[0], tipo: nuevo, cuentaId: '', billeteraId: '' }]);
    };

    const apiError = (err, fallback) => {
        const first = err.response?.data?.errors ? Object.values(err.response.data.errors)[0]?.[0] : null;
        toast.error(first ?? err.response?.data?.message ?? fallback);
    };

    const toPayload = (l) => ({
        forma_pago: l.tipo,
        cuenta_bancaria_id: l.tipo === 'transferencia' ? l.cuentaId || null : null,
        billetera_id: l.tipo === 'billetera' ? l.billeteraId || null : null,
        monto: Number(l.monto),
        referencia: l.referencia || null,
        // En soles: el backend abona su equivalente al tipo de cambio del día.
        ...(enSoles(l) ? { moneda: 'PEN', tipo_cambio: Number(l.tipoCambio) } : {}),
    });

    /** "Dólares | Soles" y, en soles, el tipo de cambio del día. */
    const controlesMoneda = (l, onChange) =>
        admiteSoles ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-lg border border-edge bg-gray-50 p-0.5">
                    {[monedaDeuda, 'PEN'].map((m) => {
                        const activa = (l.moneda || monedaDeuda) === m;
                        return (
                            <button
                                key={m}
                                type="button"
                                onClick={() =>
                                    onChange({
                                        moneda: m === monedaDeuda ? '' : 'PEN',
                                        // Al cobrar, se propone el comercial del día.
                                        ...(m === 'PEN' && esCobrar && !l.tipoCambio && tcComercial
                                            ? { tipoCambio: String(tcComercial) }
                                            : {}),
                                    })
                                }
                                className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
                                    activa ? 'bg-white text-primary-700 shadow-sm' : 'text-warm-500 hover:text-warm-700'
                                }`}
                            >
                                {NOMBRE_MONEDA[m] ?? m}
                            </button>
                        );
                    })}
                </div>
                {enSoles(l) && (
                    <>
                        <Input
                            type="number"
                            min="0"
                            step="0.0001"
                            placeholder={esCobrar ? 'T.C. comercial' : 'T.C. del día'}
                            value={l.tipoCambio}
                            onChange={(e) => onChange({ tipoCambio: e.target.value })}
                            className="w-32 text-right"
                            aria-label="Tipo de cambio"
                        />
                        <span className="text-xs text-warm-500">
                            {Number(l.tipoCambio) > 0
                                ? `= ${money(abonoDe(l), monedaDeuda)}${esCobrar ? ' (T.C. comercial)' : ''}`
                                : esCobrar && !l.id && tcSinDato === fecha
                                  ? `No hay tipo de cambio guardado del ${fechaCorta(fecha)}: escríbelo`
                                  : 'Pon el tipo de cambio del día'}
                        </span>
                    </>
                )}
            </div>
        ) : null;

    const registrar = async () => {
        const validos = activas.filter((l) => Number(l.monto) > 0);
        if (!fecha || fecha > hoy()) return toast.error('La fecha del abono no puede ser futura.');
        if (validos.length === 0) return toast.error('Escribe el importe del abono.');
        if (validos.some(faltaTipoCambio)) return toast.error('Para pagar en soles, pon el tipo de cambio del día.');
        if (validos.some((l) => l.tipo === 'transferencia' && !l.cuentaId)) return toast.error('Elige el banco o cuenta de la transferencia.');
        if (validos.some((l) => l.tipo === 'billetera' && !l.billeteraId)) return toast.error('Elige la billetera.');
        if (nuevoTotal > saldo + 0.01) return toast.error('El abono excede el saldo pendiente.');
        setSaving(true);
        try {
            const res = await api.post(`${basePath}/${cur.id}/pagos`, { fecha, glosa: glosa.trim() || undefined, pagos: validos.map(toPayload) });
            setState(res.data);
            setLineas([emptyLinea()]);
            setModo('efectivo');
            setGlosaEditada(false);
            toast.success('Abono registrado.');
            onSaved?.(res.data);
            // Desde Mi Caja se vuelve a la caja: el movimiento ya está ahí.
            if (cerrarAlGuardar) onClose();
        } catch (err) {
            apiError(err, 'No se pudo registrar el abono.');
        } finally {
            setSaving(false);
        }
    };

    const startEdit = (p) => {
        const pagadoEnSoles = p.monto_pen != null;
        setEditId(p.id);
        setEditForm({
            tipo: p.forma_pago,
            cuentaId: p.cuenta_bancaria_id ? String(p.cuenta_bancaria_id) : '',
            billeteraId: p.billetera_id ? String(p.billetera_id) : '',
            // Pagado en soles: se edita lo que salió en soles, con su tipo de cambio.
            monto: String(pagadoEnSoles ? Number(p.monto_pen) : Number(p.monto)),
            referencia: p.referencia ?? '',
            moneda: pagadoEnSoles ? 'PEN' : '',
            tipoCambio: pagadoEnSoles && p.tipo_cambio ? String(Number(p.tipo_cambio)) : '',
            fecha: String(p.fecha ?? '').slice(0, 10),
        });
    };

    const guardarEdit = async () => {
        if (!(Number(editForm.monto) > 0)) return toast.error('El monto debe ser mayor a 0.');
        if (faltaTipoCambio(editForm)) return toast.error('Para pagar en soles, pon el tipo de cambio del día.');
        setSaving(true);
        try {
            const res = await api.put(`${basePath}/pagos/${editId}`, { ...toPayload(editForm), fecha: editForm.fecha || undefined });
            setState(res.data);
            setEditId(null);
            toast.success('Abono actualizado.');
            onSaved?.(res.data);
        } catch (err) {
            apiError(err, 'No se pudo actualizar el abono.');
        } finally {
            setSaving(false);
        }
    };

    const anular = async (p) => {
        const importe = p.monto_pen != null ? money(p.monto_pen, 'PEN') : money(p.monto, p.moneda || cur.moneda);
        if (!window.confirm(`¿Anular este abono de ${importe}? Se revertirá el movimiento de caja.`)) return;
        setSaving(true);
        try {
            const res = await api.delete(`${basePath}/pagos/${p.id}`);
            setState(res.data);
            toast.success('Abono anulado.');
            onSaved?.(res.data);
        } catch (err) {
            apiError(err, 'No se pudo anular el abono.');
        } finally {
            setSaving(false);
        }
    };

    if (!state && !elegir) return null;

    const formas = [
        { value: 'efectivo', label: 'Efectivo' },
        ...(cuentas.length ? [{ value: 'transferencia', label: 'Transferencia' }] : []),
        ...(billeteras.length ? [{ value: 'billetera', label: 'Billetera' }] : []),
        { value: 'multiple', label: 'Múltiple' },
    ];
    const unica = lineas[0];

    return (
        <Modal
            open={open}
            onClose={onClose}
            size="2xl"
            title="Amortización de documentos"
            description={
                hayDoc
                    ? `${esCobrar ? 'Cobro' : 'Pago'} del documento ${documento}${
                          esCobrar && cur?.total_cuotas > 1 ? ` · cuota ${cur.numero_cuota} de ${cur.total_cuotas}` : ''
                      }`
                    : 'Elige el documento en Referencia y registra el abono.'
            }
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>Salir</Button>
                    <Button onClick={registrar} loading={saving} disabled={!hayDoc || !puedePagar || nuevoTotal <= 0}>Guardar</Button>
                </>
            }
        >
            <div className="space-y-4">
                {anulada && <Alert variant="warning">Esta cuenta está anulada.</Alert>}
                {hayDoc && !anulada && !puedePagar && <Alert variant="success">Cuenta saldada. No hay saldo pendiente.</Alert>}
                {enLetras > 0 && (
                    <Alert variant="info">
                        {money(enLetras, monedaDeuda)} de esta cuenta están en letras de cambio y se cobran con la letra.
                    </Alert>
                )}

                {/* ── Documento de control ─────────────────────────────── */}
                <Bloque titulo="Documento de control">
                    <div className="grid gap-3 pt-2 sm:grid-cols-3">
                        <Dato etiqueta={esCobrar ? 'Cobrador' : 'Pagador'}>{user?.name}</Dato>
                        <Input label={esCobrar ? 'Fecha de abono' : 'Fecha de pago'} type="date" max={hoy()} value={fecha} onChange={(e) => setFecha(e.target.value)} disabled={!puedePagar} />
                        <div>
                            <p className="text-[11px] font-medium uppercase tracking-wide text-warm-500">Estado</p>
                            <div className="mt-1">{estadoBadge(cur.estado)}</div>
                        </div>
                    </div>
                </Bloque>

                {/* ── Referencia ────────────────────────────────────────── */}
                <Bloque titulo="Referencia">
                    {/* Desde Mi Caja el documento se elige aquí mismo: por cobrar o por pagar, y luego cuál. */}
                    {elegir && permitidos.length > 1 && (
                        <div className="inline-flex rounded-lg border border-edge bg-gray-50 p-0.5">
                            {[['cobrar', 'Por cobrar'], ['pagar', 'Por pagar']].filter(([k]) => permitidos.includes(k)).map(([k, t]) => (
                                <button
                                    key={k}
                                    type="button"
                                    onClick={() => { setTipoElegido(k); setState(null); setFiltroNombre(''); setFiltroTipoDoc(''); }}
                                    className={`rounded-md px-4 py-1.5 text-sm font-semibold transition ${tipo === k ? 'bg-white text-primary-700 shadow-sm' : 'text-warm-500 hover:text-warm-700'}`}
                                >
                                    {t}
                                </button>
                            ))}
                        </div>
                    )}
                    {elegir && (
                        <div className="grid gap-3 pt-2 sm:grid-cols-3">
                            <SearchSelect
                                label={esCobrar ? 'Cliente' : 'Proveedor'}
                                value={filtroNombre}
                                onChange={(v) => { setFiltroNombre(v ?? ''); setState(null); }}
                                placeholder="Todos"
                                emptyText="Sin resultados"
                                options={[...new Set(pendientes.map((c) => (esCobrar ? c.cliente?.nombre : c.proveedor?.nombre)).filter(Boolean))]
                                    .sort((a, b) => a.localeCompare(b))
                                    .map((nom) => ({ value: nom, label: nom }))}
                            />
                            <Select
                                label="Tipo de documento"
                                value={filtroTipoDoc}
                                onChange={(e) => { setFiltroTipoDoc(e.target.value); setState(null); }}
                                options={[
                                    { value: '', label: 'Todos' },
                                    ...[...new Set(pendientes.map((c) => tipoDeDocumento(c, esCobrar)))].sort().map((t) => ({ value: t, label: t })),
                                ]}
                            />
                            <SearchSelect
                                label="N.° documento / nombre"
                                value={state ? String(state.id) : ''}
                                clearable={false}
                                onChange={(v) => {
                                    const elegida = pendientes.find((c) => String(c.id) === String(v));
                                    if (elegida) {
                                        setState(elegida);
                                        setLineas([emptyLinea()]);
                                        setModo('efectivo');
                                        setGlosaEditada(false);
                                    }
                                }}
                                placeholder={cargandoPendientes ? 'Cargando…' : 'Busca por documento o por nombre…'}
                                emptyText={cargandoPendientes ? 'Cargando…' : 'No hay documentos con saldo'}
                                options={pendientes.filter((c) => (
                                    (!filtroNombre || (esCobrar ? c.cliente?.nombre : c.proveedor?.nombre) === filtroNombre)
                                    && (!filtroTipoDoc || tipoDeDocumento(c, esCobrar) === filtroTipoDoc)
                                )).map((c) => {
                                    const doc = esCobrar
                                        ? c.nota_venta ? `${c.nota_venta.serie}-${c.nota_venta.numero}` : `#${c.id}`
                                        : (c.compra?.numero_compra ?? `#${c.id}`);
                                    const quien = esCobrar ? c.cliente?.nombre : c.proveedor?.nombre;
                                    const cuota = esCobrar && c.total_cuotas > 1 ? ` · cuota ${c.numero_cuota}/${c.total_cuotas}` : '';
                                    return {
                                        value: String(c.id),
                                        label: `${doc}${cuota} · ${quien ?? '—'} · saldo ${money(c.saldo, c.moneda)}`,
                                        keywords: `${doc} ${quien ?? ''}`,
                                    };
                                })}
                            />
                        </div>
                    )}
                    <div className="grid gap-x-4 gap-y-3 pt-2 sm:grid-cols-3">
                        <Dato etiqueta="Documento">{hayDoc ? documento : ''}</Dato>
                        <Dato etiqueta={esCobrar ? 'Cliente' : 'Proveedor'} className="sm:col-span-2">{nombre}</Dato>
                        <Dato etiqueta="Saldo">
                            <span className="text-red-600">{money(cur.saldo, cur.moneda)}</span>
                        </Dato>
                        {esCobrar && <Dato etiqueta="Vendedor">{cur.nota_venta?.vendedor?.name}</Dato>}
                        <Dato etiqueta="Fec. venc.">{cur.fecha_vencimiento ? fechaCorta(cur.fecha_vencimiento) : ''}</Dato>
                        <Dato etiqueta="Importe">{money(cur.monto_total, cur.moneda)}</Dato>
                        <Dato etiqueta="Pagado">
                            <span className="text-green-600">{money(cur.monto_pagado, cur.moneda)}</span>
                        </Dato>
                        <Dato etiqueta="Último abono">{ultimoAbono ? fechaCorta(ultimoAbono) : ''}</Dato>
                    </div>
                </Bloque>

                {(puedePagar || !hayDoc) && (
                    <fieldset disabled={!hayDoc} className={cn('m-0 min-w-0 space-y-4 border-0 p-0', !hayDoc && 'opacity-60')}>
                        {/* ── Importe de abono ──────────────────────────────── */}
                        <Bloque titulo="Importe de abono">
                            <div className="grid gap-4 pt-2 lg:grid-cols-[1fr_14rem]">
                                <div className="space-y-3">
                                    <div className="grid gap-3 sm:grid-cols-2">
                                        {multiple ? (
                                            <Input label="Importe (suma de las formas)" value={money(nuevoTotal, monedaDeuda)} readOnly disabled className="text-right" />
                                        ) : (
                                            <Input
                                                label={enSoles(unica) ? 'Importe en soles' : 'Importe'}
                                                type="number"
                                                min="0"
                                                step="any"
                                                placeholder="0.00"
                                                value={unica.monto}
                                                onChange={(e) => setLinea(0, { monto: e.target.value })}
                                                className="text-right"
                                            />
                                        )}
                                        <Dato etiqueta="Condición de venta" className="pt-6">{condicionTexto}</Dato>
                                    </div>
                                    {/* Moneda y tipo de cambio de la forma de pago (en "Múltiple", cada forma lleva los suyos). */}
                                    {!multiple && controlesMoneda(unica, (patch) => setLinea(0, patch))}
                                    {!admiteSoles && (
                                        <p className="text-xs text-warm-500">Moneda: <strong>{NOMBRE_MONEDA[monedaDeuda] ?? monedaDeuda}</strong></p>
                                    )}
                                    <Input
                                        label="Glosa"
                                        value={glosa}
                                        maxLength={255}
                                        onChange={(e) => {
                                            setGlosa(e.target.value);
                                            setGlosaEditada(true);
                                        }}
                                    />
                                </div>
                                <div className="flex flex-col justify-center rounded-lg border border-edge bg-gray-50 px-4 py-3 text-center">
                                    <p className="text-[11px] font-bold uppercase tracking-wide text-warm-500">Saldo pendiente</p>
                                    <p className={cn('mt-1 text-2xl font-bold', nuevoTotal > saldo + 0.01 ? 'text-red-600' : 'text-primary-700')}>
                                        {money(pendienteTras, monedaDeuda)}
                                    </p>
                                    {nuevoTotal > saldo + 0.01 && <p className="mt-1 text-xs text-red-600">El abono excede el saldo.</p>}
                                </div>
                            </div>
                        </Bloque>

                        {/* ── Tipo de pago ──────────────────────────────────── */}
                        <Bloque titulo="Tipo de pago">
                            <div className="flex flex-wrap items-center gap-2 pt-2">
                                {formas.map((f) => (
                                    <label
                                        key={f.value}
                                        className={cn(
                                            'inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition',
                                            modo === f.value ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-edge text-warm-600 hover:bg-gray-50',
                                        )}
                                    >
                                        <input type="radio" name="forma-abono" className="sr-only" checked={modo === f.value} onChange={() => elegirModo(f.value)} />
                                        <span className={cn('h-3 w-3 rounded-full border', modo === f.value ? 'border-primary-600 bg-primary-600' : 'border-gray-400')} />
                                        {f.label}
                                    </label>
                                ))}
                            </div>

                            {!multiple ? (
                                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                    {unica.tipo === 'transferencia' && (
                                        <SearchSelect
                                            label="Banco / cuenta"
                                            value={unica.cuentaId}
                                            onChange={(v) => setLinea(0, { cuentaId: v ?? '' })}
                                            placeholder="Selecciona la cuenta"
                                            emptyText="Sin coincidencias"
                                            options={cuentas.map((c) => ({ value: String(c.id), label: cuentaLabel(c) }))}
                                        />
                                    )}
                                    {unica.tipo === 'billetera' && (
                                        <SearchSelect
                                            label="Billetera"
                                            value={unica.billeteraId}
                                            onChange={(v) => setLinea(0, { billeteraId: v ?? '' })}
                                            placeholder="Selecciona la billetera"
                                            emptyText="Sin coincidencias"
                                            options={billeteras.map((b) => ({ value: String(b.id), label: billeteraLabel(b) }))}
                                        />
                                    )}
                                    <Input
                                        label="Número doc. pago"
                                        placeholder={unica.tipo === 'efectivo' ? 'Opcional' : 'N.° de operación'}
                                        value={unica.referencia}
                                        onChange={(e) => setLinea(0, { referencia: e.target.value })}
                                    />
                                </div>
                            ) : (
                                <div className="mt-3 space-y-3">
                                    {lineas.map((l, i) => (
                                        <div key={i} className="rounded-lg border border-edge p-3">
                                            <MetodoCajaPicker
                                                cuentas={cuentas} billeteras={billeteras}
                                                tipo={l.tipo} cuentaId={l.cuentaId} billeteraId={l.billeteraId}
                                                onChange={({ tipo: t, cuentaId, billeteraId }) => setLinea(i, { tipo: t, cuentaId, billeteraId })}
                                            />
                                            <div className="mt-2 flex items-center gap-2">
                                                <Input type="number" min="0" step="any" placeholder={enSoles(l) ? 'Monto en soles' : 'Monto'} value={l.monto} onChange={(e) => setLinea(i, { monto: e.target.value })} className="w-28 text-right" />
                                                <Input placeholder="N.° doc. pago (opc.)" value={l.referencia} onChange={(e) => setLinea(i, { referencia: e.target.value })} className="flex-1" />
                                                <button type="button" onClick={() => removeLinea(i)} disabled={lineas.length === 1} className="rounded-md p-2 text-red-600 hover:bg-red-50 disabled:opacity-40" aria-label="Quitar"><Trash2 className="h-4 w-4" /></button>
                                            </div>
                                            {controlesMoneda(l, (patch) => setLinea(i, patch))}
                                        </div>
                                    ))}
                                    <Button type="button" variant="ghost" size="sm" onClick={addLinea}><Plus className="h-4 w-4" /> Agregar forma</Button>
                                </div>
                            )}
                        </Bloque>
                    </fieldset>
                )}

                {/* ── Abonos anteriores ─────────────────────────────────── */}
                <Bloque titulo="Abonos registrados">
                    {pagos.length === 0 ? (
                        <p className="py-3 text-center text-sm text-warm-500">Aún no hay abonos registrados.</p>
                    ) : (
                        <div className="mt-2 divide-y divide-gray-100 rounded-lg border border-edge">
                            {pagos.map((p) =>
                                editId === p.id ? (
                                    <div key={p.id} className="space-y-2 bg-amber-50 p-3">
                                        <MetodoCajaPicker
                                            cuentas={cuentas} billeteras={billeteras}
                                            tipo={editForm.tipo} cuentaId={editForm.cuentaId} billeteraId={editForm.billeteraId}
                                            onChange={({ tipo: t, cuentaId, billeteraId }) => setEditForm((f) => ({ ...f, tipo: t, cuentaId, billeteraId }))}
                                        />
                                        <div className="flex items-center gap-2">
                                            <Input type="date" max={hoy()} value={editForm.fecha ?? ''} onChange={(e) => setEditForm((f) => ({ ...f, fecha: e.target.value }))} className="w-40" aria-label="Fecha del abono" />
                                            <Input type="number" min="0" step="any" placeholder={enSoles(editForm) ? 'Monto en soles' : 'Monto'} value={editForm.monto} onChange={(e) => setEditForm((f) => ({ ...f, monto: e.target.value }))} className="w-28 text-right" />
                                            <Input placeholder="Número doc. pago" value={editForm.referencia} onChange={(e) => setEditForm((f) => ({ ...f, referencia: e.target.value }))} className="flex-1" />
                                            <button type="button" onClick={guardarEdit} disabled={saving} className="rounded-md p-2 text-green-600 hover:bg-green-100" aria-label="Guardar"><Check className="h-4 w-4" /></button>
                                            <button type="button" onClick={() => setEditId(null)} className="rounded-md p-2 text-gray-500 hover:bg-gray-100" aria-label="Cancelar"><X className="h-4 w-4" /></button>
                                        </div>
                                        {controlesMoneda(editForm, (patch) => setEditForm((f) => ({ ...f, ...patch })))}
                                    </div>
                                ) : (
                                    <div key={p.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                                        <Badge variant="blue">{metodoPagoLabel(p)}</Badge>
                                        {p.monto_pen != null ? (
                                            // Pagado en soles: lo que salió y lo que abonó a la deuda.
                                            <span className="font-medium text-warm-900">
                                                {money(p.monto_pen, 'PEN')}
                                                <span className="ml-2 text-xs font-normal text-warm-500">
                                                    · T.C. {Number(p.tipo_cambio)} = {money(p.monto, p.moneda || cur.moneda)}
                                                </span>
                                            </span>
                                        ) : (
                                            <span className="font-medium text-warm-900">{money(p.monto, p.moneda || cur.moneda)}</span>
                                        )}
                                        <span className="text-warm-500">{fechaCorta(p.fecha)}</span>
                                        {p.referencia && <span className="text-warm-400">· {p.referencia}</span>}
                                        {p.glosa && <span className="w-full text-xs text-warm-500">{p.glosa}</span>}
                                        <div className="ml-auto flex items-center gap-1">
                                            <button type="button" onClick={() => startEdit(p)} disabled={anulada || saving} className="rounded-md p-1.5 text-blue-600 hover:bg-blue-50 disabled:opacity-40" aria-label="Editar"><Pencil className="h-4 w-4" /></button>
                                            <button type="button" onClick={() => anular(p)} disabled={anulada || saving} className="rounded-md p-1.5 text-red-600 hover:bg-red-50 disabled:opacity-40" aria-label="Anular"><Trash2 className="h-4 w-4" /></button>
                                        </div>
                                    </div>
                                ),
                            )}
                        </div>
                    )}
                </Bloque>
            </div>
        </Modal>
    );
}
