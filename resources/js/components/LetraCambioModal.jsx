import { useEffect, useState } from 'react';
import { FileSignature } from 'lucide-react';
import api from '../lib/api';
import { money } from '../lib/moneda';
import { useToast } from '../lib/toast';
import { Alert, Button, Input, Modal, Spinner } from './ui';

const CAMPOS_VACIOS = {
    referencia: '', fecha_giro: '', lugar_giro: '', fecha_vencimiento: '', moneda: 'PEN', importe: '',
    aceptante_nombre: '', aceptante_documento: '', aceptante_domicilio: '', aceptante_localidad: '', aceptante_telefono: '',
    aval_nombre: '', aval_documento: '', aval_domicilio: '', aval_localidad: '',
    banco: '', oficina: '', cuenta: '', dc: '',
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
 * Emite una letra de cambio desde una cuenta por cobrar. Los datos del cliente
 * (el aceptante), el documento que se financia, el vencimiento y el saldo ya
 * vienen propuestos; se completan el aval y la cuenta a debitar, si los hay.
 *
 *   onEmitida(letra) — para que quien llama abra el PDF o recargue.
 */
export default function LetraCambioModal({ open, cuenta, onClose, onEmitida }) {
    const toast = useToast();
    const [form, setForm] = useState(CAMPOS_VACIOS);
    const [info, setInfo] = useState(null);
    const [cargando, setCargando] = useState(false);
    const [guardando, setGuardando] = useState(false);
    const [errores, setErrores] = useState({});
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!open || !cuenta) return;
        let vigente = true;
        setCargando(true);
        setErrores({});
        setError(null);
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
    }, [open, cuenta]);

    const poner = (campo) => (e) => setForm((prev) => ({ ...prev, [campo]: e.target.value }));
    const plazo = diasEntre(form.fecha_giro, form.fecha_vencimiento);

    const emitir = async () => {
        setGuardando(true);
        setErrores({});
        setError(null);
        try {
            const { data } = await api.post('/letras-cambio', {
                ...form,
                cuenta_por_cobrar_id: cuenta.id,
                importe: Number(form.importe),
            });
            toast.success(`Letra ${data.codigo} emitida.`);
            onEmitida?.(data);
            onClose();
        } catch (err) {
            if (err.response?.status === 422 && err.response.data?.errors) {
                setErrores(Object.fromEntries(Object.entries(err.response.data.errors).map(([k, v]) => [k, v[0]])));
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

    return (
        <Modal
            open={open}
            onClose={onClose}
            size="2xl"
            title="Emitir letra de cambio"
            description={cuenta ? `${cuenta.cliente?.nombre ?? ''}${cuenta.nota_venta ? ` · ${cuenta.nota_venta.serie}-${cuenta.nota_venta.numero}` : ''}` : ''}
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>
                        Cancelar
                    </Button>
                    <Button onClick={emitir} loading={guardando} disabled={cargando || !Number(form.importe)}>
                        <FileSignature className="h-4 w-4" />
                        Emitir letra
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

                    <section>
                        <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-warm-500">La letra</h3>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                            {campo('Ref. del girador', 'referencia', { placeholder: 'F001-1191' })}
                            {campo('Fecha de giro', 'fecha_giro', { type: 'date' })}
                            {campo('Vencimiento', 'fecha_vencimiento', { type: 'date' })}
                            {campo('Importe', 'importe', { type: 'number', min: '0', step: 'any' })}
                            <div className="col-span-2">{campo('Lugar de giro', 'lugar_giro', { placeholder: 'LA VICTORIA LIMA' })}</div>
                            <div className="col-span-2 flex items-end pb-2 text-xs text-warm-500">
                                {plazo !== null && plazo >= 0 ? `Vence a los ${plazo} día${plazo === 1 ? '' : 's'} del giro · ${form.moneda === 'USD' ? 'Dólares' : 'Soles'}` : ''}
                            </div>
                        </div>
                    </section>

                    <section>
                        <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-warm-500">Aceptante (el cliente)</h3>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                            <div className="col-span-2">{campo('Nombre / razón social', 'aceptante_nombre')}</div>
                            {campo('DNI / RUC', 'aceptante_documento')}
                            {campo('Teléfono', 'aceptante_telefono')}
                            <div className="col-span-2">{campo('Domicilio', 'aceptante_domicilio')}</div>
                            <div className="col-span-2">{campo('Localidad', 'aceptante_localidad', { placeholder: 'LIMA LIMA LA VICTORIA' })}</div>
                        </div>
                    </section>

                    <section>
                        <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-warm-500">Aval permanente <span className="font-normal normal-case text-warm-400">(opcional)</span></h3>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                            <div className="col-span-2">{campo('Nombre', 'aval_nombre')}</div>
                            {campo('DNI / RUC', 'aval_documento')}
                            <div />
                            <div className="col-span-2">{campo('Domicilio', 'aval_domicilio')}</div>
                            <div className="col-span-2">{campo('Localidad', 'aval_localidad')}</div>
                        </div>
                    </section>

                    <section>
                        <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-warm-500">Cuenta a debitar <span className="font-normal normal-case text-warm-400">(opcional)</span></h3>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                            {campo('Banco', 'banco')}
                            {campo('Oficina', 'oficina')}
                            {campo('Número de cuenta', 'cuenta')}
                            {campo('DC', 'dc', { maxLength: 4 })}
                        </div>
                    </section>
                </div>
            )}
        </Modal>
    );
}
