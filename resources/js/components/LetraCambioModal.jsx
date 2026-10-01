import { useEffect, useState } from 'react';
import { FileSignature } from 'lucide-react';
import api, { asList } from '../lib/api';
import { money } from '../lib/moneda';
import { useToast } from '../lib/toast';
import { Alert, Button, Input, Modal, SearchSelect, Select, Spinner, Tabs } from './ui';

const CAMPOS_VACIOS = {
    cliente_id: '', concepto: '', referencia: '', fecha_giro: '', lugar_giro: '', fecha_vencimiento: '', moneda: 'PEN', importe: '',
    aceptante_nombre: '', aceptante_documento: '', aceptante_domicilio: '', aceptante_localidad: '', aceptante_telefono: '',
    aval_nombre: '', aval_documento: '', aval_domicilio: '', aval_localidad: '',
    aval2_nombre: '', aval2_documento: '', aval2_domicilio: '', aval2_localidad: '',
    banco: '', oficina: '', cuenta: '', dc: '',
};

/** Hoy en la fecha local (no en UTC: de noche en Perú UTC ya es mañana). */
const hoy = () => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
};

/** Fecha "aaaa-mm-dd" + días, con fechas de calendario (sin husos horarios de por medio). */
const sumarDias = (fecha, dias) => {
    const [y, m, d] = String(fecha).split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + dias)).toISOString().slice(0, 10);
};

/** Días entre dos fechas "aaaa-mm-dd" (sin husos horarios de por medio). */
const diasEntre = (desde, hasta) => {
    const t = (x) => {
        const [y, m, d] = String(x).split('-').map(Number);
        return Date.UTC(y, m - 1, d);
    };
    return desde && hasta ? Math.round((t(hasta) - t(desde)) / 86400000) : null;
};

/**
 * Emite una letra de cambio.
 *
 * Con una `cuenta` por cobrar, los datos del cliente (el aceptante), el documento que se
 * financia, el vencimiento y el saldo ya vienen propuestos. Sin cuenta (`manual`) es una letra
 * suelta —por ejemplo, de un préstamo—: se elige o escribe el aceptante, el importe y las fechas.
 * En ambos casos se completan los dos avales permanentes y la cuenta a debitar, si los hay.
 *
 *   onEmitida(letra) — para que quien llama abra el PDF o recargue.
 */
export default function LetraCambioModal({ open, cuenta, manual = false, onClose, onEmitida }) {
    const toast = useToast();
    const [form, setForm] = useState(CAMPOS_VACIOS);
    const [info, setInfo] = useState(null);
    const [clientes, setClientes] = useState([]);
    const [cargando, setCargando] = useState(false);
    const [guardando, setGuardando] = useState(false);
    const [errores, setErrores] = useState({});
    const [error, setError] = useState(null);
    /** La pestaña abierta: la letra, el aceptante, los avales o la cuenta a debitar. */
    const [pestana, setPestana] = useState('letra');

    useEffect(() => {
        if (!open) return;
        setPestana('letra');
        setErrores({});
        setError(null);

        // Letra suelta: arranca vacía, con el concepto, las fechas y la moneda más comunes.
        if (manual) {
            setInfo(null);
            setForm({ ...CAMPOS_VACIOS, concepto: 'Préstamo', fecha_giro: hoy(), fecha_vencimiento: sumarDias(hoy(), 30) });
            api.get('/clientes').then((r) => setClientes(asList(r))).catch(() => setClientes([]));
            return;
        }

        if (!cuenta) return;
        let vigente = true;
        setCargando(true);
        api.get('/letras-cambio/prellenar', { params: { cuenta_id: cuenta.id } })
            .then(({ data }) => {
                if (!vigente) return;
                setInfo({ saldo: data.saldo, enLetras: data.en_letras });
                setForm({ ...CAMPOS_VACIOS, ...Object.fromEntries(Object.entries(data).filter(([k]) => k in CAMPOS_VACIOS).map(([k, v]) => [k, v ?? ''])) });
            })
            .catch(() => vigente && setError('No se pudieron cargar los datos de la cuenta.'))
            .finally(() => vigente && setCargando(false));
        return () => {
            vigente = false;
        };
    }, [open, cuenta, manual]);

    const poner = (campo) => (e) => setForm((prev) => ({ ...prev, [campo]: e.target.value }));
    const plazo = diasEntre(form.fecha_giro, form.fecha_vencimiento);

    /** Elegir un cliente llena los datos del aceptante (se pueden corregir). */
    const elegirCliente = (id) => {
        const c = clientes.find((x) => String(x.id) === String(id));
        setForm((prev) => ({
            ...prev,
            cliente_id: id ?? '',
            ...(c
                ? {
                      aceptante_nombre: c.nombre ?? '',
                      aceptante_documento: c.numero_documento ?? '',
                      aceptante_domicilio: c.direccion ?? '',
                      aceptante_telefono: c.telefono ?? '',
                  }
                : {}),
        }));
    };

    const emitir = async () => {
        setGuardando(true);
        setErrores({});
        setError(null);
        try {
            const { data } = await api.post('/letras-cambio', {
                ...form,
                cliente_id: form.cliente_id || null,
                ...(manual ? {} : { cuenta_por_cobrar_id: cuenta.id }),
                importe: Number(form.importe),
            });
            toast.success(`Letra ${data.codigo} emitida.`);
            onEmitida?.(data);
            onClose();
        } catch (err) {
            if (err.response?.status === 422 && err.response.data?.errors) {
                const campos = Object.keys(err.response.data.errors);
                setErrores(Object.fromEntries(Object.entries(err.response.data.errors).map(([k, v]) => [k, v[0]])));
                // Va a la pestaña del primer campo con error, para que se vea.
                const deTab = (c) => (c.startsWith('aceptante') || c === 'cliente_id' ? 'aceptante' : c.startsWith('aval') ? 'avales' : ['banco', 'oficina', 'cuenta', 'dc'].includes(c) ? 'banco' : 'letra');
                if (campos.length) setPestana(deTab(campos[0]));
            } else {
                setError(err.response?.data?.message ?? 'No se pudo emitir la letra.');
            }
        } finally {
            setGuardando(false);
        }
    };

    const campo = (etiqueta, nombre, props = {}) => (
        <Input label={etiqueta} value={form[nombre]} onChange={poner(nombre)} error={errores[nombre]} {...props} />
    );

    /** Un aval permanente: nombre, documento, domicilio y localidad. `p` es el prefijo de sus campos. */
    const aval = (titulo, p) => (
        <section>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-warm-500">
                {titulo} <span className="font-normal normal-case text-warm-400">(opcional)</span>
            </h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="col-span-2">{campo('Nombre', `${p}_nombre`)}</div>
                {campo('DNI / RUC', `${p}_documento`)}
                <div />
                <div className="col-span-2">{campo('Domicilio', `${p}_domicilio`)}</div>
                <div className="col-span-2">{campo('Localidad', `${p}_localidad`)}</div>
            </div>
        </section>
    );

    return (
        <Modal
            open={open}
            onClose={onClose}
            size="2xl"
            title={manual ? 'Crear letra' : 'Emitir letra de cambio'}
            description={
                manual
                    ? 'Una letra suelta, sin cuenta por cobrar (por ejemplo, de un préstamo)'
                    : cuenta
                      ? `${cuenta.cliente?.nombre ?? ''}${cuenta.nota_venta ? ` · ${cuenta.nota_venta.serie}-${cuenta.nota_venta.numero}` : ''}`
                      : ''
            }
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>
                        Cancelar
                    </Button>
                    <Button onClick={emitir} loading={guardando} disabled={cargando || !Number(form.importe) || (manual && !form.aceptante_nombre.trim())}>
                        <FileSignature className="h-4 w-4" />
                        {manual ? 'Crear letra' : 'Emitir letra'}
                    </Button>
                </>
            }
        >
            {cargando ? (
                <div className="flex items-center justify-center py-16">
                    <Spinner size="lg" className="text-primary-600" />
                </div>
            ) : (
                <div className="space-y-5">
                    {error && <Alert variant="error">{error}</Alert>}

                    {info && (
                        <p className="text-xs text-warm-500">
                            Saldo de la cuenta {money(info.saldo, form.moneda)}
                            {info.enLetras > 0 && ` · ya girado en letras ${money(info.enLetras, form.moneda)}`}. Puedes girar varias letras de una misma cuenta.
                        </p>
                    )}

                    {/* Cada bloque del formulario en su pestaña; si falla una validación, se abre la pestaña del error. */}
                    <Tabs
                        value={pestana}
                        onChange={setPestana}
                        items={[
                            { key: 'letra', label: 'Letra' },
                            { key: 'aceptante', label: 'Aceptante' },
                            { key: 'avales', label: 'Avales' },
                            { key: 'banco', label: 'Cuenta a debitar' },
                        ]}
                    />

                    {pestana === 'letra' && (
                        <section>
                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                                {manual && <div className="col-span-2">{campo('Concepto', 'concepto', { placeholder: 'Préstamo' })}</div>}
                                {campo('Ref. del girador', 'referencia', { placeholder: manual ? 'PRÉSTAMO 001' : 'F001-1191' })}
                                {manual && (
                                    <Select
                                        label="Moneda"
                                        value={form.moneda}
                                        onChange={poner('moneda')}
                                        options={[
                                            { value: 'PEN', label: 'Soles (S/)' },
                                            { value: 'USD', label: 'Dólares (US$)' },
                                        ]}
                                    />
                                )}
                                {campo('Fecha de giro', 'fecha_giro', { type: 'date' })}
                                {campo('Vencimiento', 'fecha_vencimiento', { type: 'date' })}
                                {campo('Importe', 'importe', { type: 'number', min: '0', step: 'any' })}
                                <div className="col-span-2">{campo('Lugar de giro', 'lugar_giro', { placeholder: 'LA VICTORIA LIMA' })}</div>
                                <div className="col-span-2 flex items-end pb-2 text-xs text-warm-500">
                                    {plazo !== null && plazo >= 0 ? `Vence a los ${plazo} día${plazo === 1 ? '' : 's'} del giro · ${form.moneda === 'USD' ? 'Dólares' : 'Soles'}` : ''}
                                </div>
                            </div>
                        </section>
                    )}

                    {pestana === 'aceptante' && (
                        <section>
                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                                {manual && (
                                    <div className="col-span-2 sm:col-span-4">
                                        <SearchSelect
                                            label="Cliente (opcional: llena los datos de abajo)"
                                            value={form.cliente_id ? String(form.cliente_id) : ''}
                                            onChange={elegirCliente}
                                            placeholder="Buscar un cliente…"
                                            emptyText="Sin coincidencias"
                                            options={clientes.map((c) => ({ value: String(c.id), label: c.nombre }))}
                                        />
                                    </div>
                                )}
                                <div className="col-span-2">{campo('Nombre / razón social', 'aceptante_nombre', { error: errores.aceptante_nombre })}</div>
                                {campo('DNI / RUC', 'aceptante_documento')}
                                {campo('Teléfono', 'aceptante_telefono')}
                                <div className="col-span-2">{campo('Domicilio', 'aceptante_domicilio')}</div>
                                <div className="col-span-2">{campo('Localidad', 'aceptante_localidad', { placeholder: 'LIMA LIMA LA VICTORIA' })}</div>
                            </div>
                        </section>
                    )}

                    {pestana === 'avales' && (
                        <div className="space-y-5">
                            {aval('Aval permanente 1', 'aval')}
                            {aval('Aval permanente 2', 'aval2')}
                        </div>
                    )}

                    {pestana === 'banco' && (
                        <section>
                            <p className="mb-2 text-xs text-warm-500">Opcional: la cuenta del aceptante de la que se debita el importe.</p>
                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                                {campo('Banco', 'banco')}
                                {campo('Oficina', 'oficina')}
                                {campo('Número de cuenta', 'cuenta')}
                                {campo('DC', 'dc', { maxLength: 4 })}
                            </div>
                        </section>
                    )}
                </div>
            )}
        </Modal>
    );
}
