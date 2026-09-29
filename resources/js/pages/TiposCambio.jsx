import { useCallback, useEffect, useState } from 'react';
import { DollarSign, Edit, RefreshCw } from 'lucide-react';
import api, { asList } from '../lib/api';
import { useAuth } from '../lib/auth';
import { cargarTipoCambio } from '../lib/moneda';
import { useToast } from '../lib/toast';
import Layout from '../components/Layout';
import PageHeader from '../components/PageHeader';
import { Alert, Button, DataTable, Input, Modal } from '../components/ui';

const iso = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fecha = (v) => (v ? new Date(`${String(v).slice(0, 10)}T00:00:00`).toLocaleDateString('es-PE') : '—');
const tc = (v) => (v == null || v === '' ? '—' : Number(v).toFixed(3));

/**
 * El tipo de cambio de cada día. El de SUNAT (compra y venta) se trae solo;
 * el comercial —el que se propone para cobrar en soles lo que se debe en
 * dólares— lo pone la empresa. Si SUNAT no respondió, también se puede
 * escribir el suyo a mano.
 */
export default function TiposCambio() {
    const toast = useToast();
    const { puede } = useAuth();
    const puedeEditar = puede('tesoreria.tipos-cambio.editar');
    const hoy = iso(new Date());

    const [mes, setMes] = useState(hoy.slice(0, 7));
    const [dias, setDias] = useState([]);
    const [delDia, setDelDia] = useState(null);
    const [cargando, setCargando] = useState(true);
    const [trayendo, setTrayendo] = useState(false);

    const [comercialHoy, setComercialHoy] = useState('');
    const [guardandoHoy, setGuardandoHoy] = useState(false);

    const [editando, setEditando] = useState(null);
    const [form, setForm] = useState({ comercial: '', venta: '', compra: '' });
    const [guardando, setGuardando] = useState(false);

    const cargar = useCallback(async () => {
        setCargando(true);
        try {
            const [lista, dia] = await Promise.all([api.get('/tipos-cambio', { params: { mes } }), cargarTipoCambio()]);
            setDias(asList(lista));
            setDelDia(dia);
            setComercialHoy(dia?.fecha_comercial === dia?.fecha && dia?.comercial ? String(dia.comercial) : '');
        } catch {
            toast.error('No se pudo cargar el tipo de cambio.');
        } finally {
            setCargando(false);
        }
    }, [mes, toast]);

    useEffect(() => {
        cargar();
    }, [cargar]);

    const traerDeSunat = async () => {
        setTrayendo(true);
        try {
            await api.post('/tipos-cambio/sunat');
            toast.success('Tipo de cambio de SUNAT actualizado.');
            await cargar();
        } catch (err) {
            toast.error(err.response?.data?.message ?? 'No se pudo traer de SUNAT.');
        } finally {
            setTrayendo(false);
        }
    };

    const guardar = async (dia, datos) => {
        await api.put('/tipos-cambio', { fecha: dia, ...datos });
        await cargar();
    };

    const guardarHoy = async () => {
        if (!(Number(comercialHoy) > 0)) return toast.error('Escribe el tipo de cambio comercial.');
        setGuardandoHoy(true);
        try {
            await guardar(hoy, { comercial: Number(comercialHoy) });
            toast.success('Tipo de cambio comercial de hoy guardado.');
        } catch (err) {
            toast.error(err.response?.data?.message ?? 'No se pudo guardar.');
        } finally {
            setGuardandoHoy(false);
        }
    };

    const abrirEdicion = (fila) => {
        setEditando(fila);
        setForm({
            comercial: fila.comercial != null ? String(Number(fila.comercial)) : '',
            venta: fila.venta != null ? String(Number(fila.venta)) : '',
            compra: fila.compra != null ? String(Number(fila.compra)) : '',
        });
    };

    const guardarEdicion = async () => {
        setGuardando(true);
        try {
            await guardar(String(editando.fecha).slice(0, 10), {
                comercial: form.comercial === '' ? null : Number(form.comercial),
                ...(form.venta !== '' ? { venta: Number(form.venta) } : {}),
                ...(form.compra !== '' ? { compra: Number(form.compra) } : {}),
            });
            toast.success('Tipo de cambio guardado.');
            setEditando(null);
        } catch (err) {
            const errores = err.response?.data?.errors;
            toast.error(errores ? Object.values(errores)[0]?.[0] : err.response?.data?.message ?? 'No se pudo guardar.');
        } finally {
            setGuardando(false);
        }
    };

    const columns = [
        { key: 'fecha', label: 'Fecha', render: (row) => <span className="font-medium text-warm-900">{fecha(row.fecha)}</span> },
        { key: 'compra', label: 'SUNAT compra', align: 'right', render: (row) => tc(row.compra) },
        { key: 'venta', label: 'SUNAT venta', align: 'right', render: (row) => <span className="font-semibold">{tc(row.venta)}</span> },
        {
            key: 'comercial',
            label: 'Comercial',
            align: 'right',
            render: (row) => <span className="font-semibold text-primary-700">{tc(row.comercial)}</span>,
        },
        ...(puedeEditar
            ? [
                  {
                      type: 'actions',
                      key: 'acciones',
                      label: 'Acciones',
                      actions: (row) => (
                          <button
                              aria-label="Editar"
                              onClick={() => abrirEdicion(row)}
                              className="rounded-md p-1.5 text-primary-600 transition hover:bg-primary-50 hover:text-primary-700"
                          >
                              <Edit className="h-4 w-4" />
                          </button>
                      ),
                  },
              ]
            : []),
    ];

    const sunatDeHoy = delDia?.fecha_venta === hoy;

    return (
        <Layout>
            <PageHeader
                title="Tipo de cambio"
                description="El de SUNAT se trae solo cada día; el comercial se usa para cobrar en soles lo que se debe en dólares"
                actions={
                    puedeEditar && (
                        <Button variant="secondary" loading={trayendo} onClick={traerDeSunat}>
                            <RefreshCw className="h-4 w-4" /> Traer de SUNAT
                        </Button>
                    )
                }
            />

            <div className="mb-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-edge bg-white p-4 shadow-sm">
                    <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-warm-500">
                        <DollarSign className="h-4 w-4" /> SUNAT de hoy
                    </p>
                    {delDia?.venta ? (
                        <div className="mt-2 flex items-end gap-6">
                            <div>
                                <p className="text-[11px] text-warm-500">Compra</p>
                                <p className="text-xl font-bold text-warm-900">{tc(delDia.compra)}</p>
                            </div>
                            <div>
                                <p className="text-[11px] text-warm-500">Venta</p>
                                <p className="text-xl font-bold text-warm-900">{tc(delDia.venta)}</p>
                            </div>
                            {!sunatDeHoy && (
                                <p className="pb-1 text-xs text-amber-600">Es el del {fecha(delDia.fecha_venta)}: hoy SUNAT aún no publica.</p>
                            )}
                        </div>
                    ) : (
                        <Alert variant="warning" className="mt-2">
                            No hay tipo de cambio de SUNAT. Usa "Traer de SUNAT" o escríbelo a mano en el día.
                        </Alert>
                    )}
                </div>

                <div className="rounded-xl border border-edge bg-white p-4 shadow-sm">
                    <p className="text-xs font-bold uppercase tracking-wide text-warm-500">Comercial de hoy</p>
                    <div className="mt-2 flex items-end gap-2">
                        <Input
                            type="number"
                            min="0"
                            step="0.0001"
                            placeholder={delDia?.comercial ? `Último: ${tc(delDia.comercial)}` : 'Ej. 3.500'}
                            value={comercialHoy}
                            onChange={(e) => setComercialHoy(e.target.value)}
                            disabled={!puedeEditar}
                            className="text-right"
                            aria-label="Tipo de cambio comercial de hoy"
                        />
                        {puedeEditar && (
                            <Button loading={guardandoHoy} onClick={guardarHoy}>
                                Guardar
                            </Button>
                        )}
                    </div>
                    <p className="mt-1 text-xs text-warm-400">
                        Se propone al cobrar en soles una venta o deuda en dólares; se puede cambiar en cada cobro.
                        {delDia?.comercial && delDia.fecha_comercial !== hoy && ` Hoy aún no se puso: se propone el del ${fecha(delDia.fecha_comercial)}.`}
                    </p>
                </div>
            </div>

            <div className="mb-3 flex items-end gap-2">
                <div className="w-48">
                    <Input label="Mes" type="month" value={mes} max={hoy.slice(0, 7)} onChange={(e) => e.target.value && setMes(e.target.value)} />
                </div>
            </div>

            <DataTable
                columns={columns}
                rows={dias}
                loading={cargando}
                searchPlaceholder="Buscar fecha..."
                emptyMessage="No hay tipos de cambio en este mes."
            />

            <Modal
                open={Boolean(editando)}
                onClose={() => setEditando(null)}
                title={`Tipo de cambio del ${fecha(editando?.fecha)}`}
                size="sm"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setEditando(null)}>Cancelar</Button>
                        <Button loading={guardando} onClick={guardarEdicion}>Guardar</Button>
                    </>
                }
            >
                <div className="space-y-3">
                    <Input
                        label="Comercial"
                        type="number"
                        min="0"
                        step="0.0001"
                        value={form.comercial}
                        onChange={(e) => setForm((p) => ({ ...p, comercial: e.target.value }))}
                        className="text-right"
                    />
                    <p className="text-xs text-warm-500">Si SUNAT no respondió ese día, puedes poner el suyo a mano:</p>
                    <div className="grid grid-cols-2 gap-3">
                        <Input
                            label="SUNAT compra"
                            type="number"
                            min="0"
                            step="0.0001"
                            value={form.compra}
                            onChange={(e) => setForm((p) => ({ ...p, compra: e.target.value }))}
                            className="text-right"
                        />
                        <Input
                            label="SUNAT venta"
                            type="number"
                            min="0"
                            step="0.0001"
                            value={form.venta}
                            onChange={(e) => setForm((p) => ({ ...p, venta: e.target.value }))}
                            className="text-right"
                        />
                    </div>
                </div>
            </Modal>
        </Layout>
    );
}
