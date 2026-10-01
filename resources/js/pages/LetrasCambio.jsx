import { useCallback, useEffect, useState } from 'react';
import { ArrowLeftRight, Ban, FileText, Wallet } from 'lucide-react';
import api, { asList } from '../lib/api';
import { useAuth } from '../lib/auth';
import { money } from '../lib/moneda';
import { useToast } from '../lib/toast';
import Layout from '../components/Layout';
import ActionsMenu from '../components/ActionsMenu';
import LetraCambioModal from '../components/LetraCambioModal';
import LetraCobroModal from '../components/LetraCobroModal';
import LetraRenovarModal from '../components/LetraRenovarModal';
import PageHeader, { CreateButton } from '../components/PageHeader';
import PdfViewerModal from '../components/PdfViewerModal';
import { Alert, Badge, Button, DataTable, Modal, Select } from '../components/ui';

// "2026-10-29" sin hora se leería como UTC y en Perú saldría el día anterior.
const fecha = (v) => (v ? new Date(`${String(v).slice(0, 10)}T00:00:00`).toLocaleDateString('es-PE') : '—');

const hoy = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Dónde está la letra mientras se cobra (son tres). Nace "en cartera" y se cambia desde la lista. */
const SUB_ESTADOS = [
    { value: 'en_cartera', label: 'En cartera', variant: 'gray' },
    { value: 'cobranza_libre', label: 'Cobranza libre - Banco', variant: 'blue' },
    { value: 'en_descuento', label: 'Letras en descuento - Bancos', variant: 'amber' },
];

const ESTADOS = [
    { value: '', label: 'Todas' },
    { value: 'emitida', label: 'Por cobrar' },
    { value: 'pagada', label: 'Pagadas' },
    { value: 'cancelada', label: 'Canceladas (renovadas)' },
    { value: 'anulada', label: 'Anuladas' },
];

/**
 * Las letras de cambio emitidas desde las cuentas por cobrar: aquí se consultan,
 * se imprime su PDF y se anulan. Se emiten desde Cuentas por cobrar.
 */
/**
 * Letras de cambio y, con `renovaciones`, sus renovaciones: son dos listas separadas para no
 * confundirlas. Las letras (LT001-NNN) salen de cuentas por cobrar; las renovaciones (RV001-NNN)
 * son las letras nuevas que se giran por el saldo de otra, que queda cancelada.
 */
export default function LetrasCambio({ renovaciones = false }) {
    const toast = useToast();
    const { puede } = useAuth();
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [fEstado, setFEstado] = useState('');
    const [pdf, setPdf] = useState(null);
    const [cobro, setCobro] = useState(null);
    /** Abre la ventana de nueva letra por renovación. */
    const [renovando, setRenovando] = useState(false);
    /** Abre la ventana para crear una letra suelta (por ejemplo, de un préstamo). */
    const [creando, setCreando] = useState(false);
    /** La letra cuyo sub estado se está cambiando, el valor elegido y si se está guardando. */
    const [cambioSub, setCambioSub] = useState(null);
    const [subElegido, setSubElegido] = useState('en_cartera');
    const [guardandoSub, setGuardandoSub] = useState(false);
    const [anular, setAnular] = useState(null);
    const [anulando, setAnulando] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            setRows(asList(await api.get(renovaciones ? '/renovaciones' : '/letras-cambio')));
        } catch {
            setError('No se pudieron cargar las letras de cambio.');
        } finally {
            setLoading(false);
        }
    }, [renovaciones]);

    useEffect(() => {
        load();
    }, [load]);

    const abrirSubEstado = (row) => {
        setCambioSub(row);
        setSubElegido(row.sub_estado ?? 'en_cartera');
    };

    const guardarSubEstado = async () => {
        setGuardandoSub(true);
        try {
            await api.post(`/letras-cambio/${cambioSub.id}/sub-estado`, { sub_estado: subElegido });
            toast.success(`Letra ${cambioSub.codigo}: ${SUB_ESTADOS.find((x) => x.value === subElegido)?.label}.`);
            setCambioSub(null);
            await load();
        } catch (err) {
            toast.error(err.response?.data?.message ?? 'No se pudo cambiar el sub estado.');
        } finally {
            setGuardandoSub(false);
        }
    };

    const confirmarAnular = async () => {
        setAnulando(true);
        try {
            await api.post(`/letras-cambio/${anular.id}/anular`);
            toast.success(`Letra ${anular.codigo} anulada.`);
            setAnular(null);
            await load();
        } catch (err) {
            toast.error(err.response?.data?.message ?? 'No se pudo anular la letra.');
        } finally {
            setAnulando(false);
        }
    };

    const columns = [
        // El orden de las columnas es el de la hoja de control: letra, giro, vencimiento, cliente,
        // importe, saldo, estado, sub estado y concepto.
        // La serie del documento (LT-001) es aparte del número de la letra, que es el identificador de la fila.
        // En las renovaciones, primero su serie propia (RV001-001) y la letra de la que salen.
        ...(renovaciones
            ? [
                  {
                      key: 'serie_renovacion',
                      label: 'Serie renovación',
                      width: '130px',
                      getSearchValue: (row) => row.serie_renovacion ?? '',
                      render: (row) => <span className="whitespace-nowrap font-semibold text-primary-700">{row.serie_renovacion}</span>,
                  },
              ]
            : []),
        { key: 'numero', label: 'Letra Nro', width: '84px', render: (row) => <span className="font-semibold text-warm-900">{row.numero}</span> },
        // Las renovaciones no llevan serie de letra: su documento es RV001 (primera columna).
        ...(renovaciones
            ? []
            : [{ key: 'serie', label: 'Serie', width: '96px', getSearchValue: (row) => row.codigo, render: (row) => <span className="whitespace-nowrap font-medium text-warm-800">{row.codigo}</span> }]),
        ...(renovaciones
            ? [
                  {
                      key: 'letra_origen',
                      label: 'Letra origen',
                      width: '110px',
                      getSearchValue: (row) => row.anterior?.codigo ?? '',
                      render: (row) => (row.anterior ? <span className="whitespace-nowrap text-warm-800">{row.anterior.codigo}</span> : <span className="text-gray-300">—</span>),
                  },
              ]
            : []),
        { key: 'fecha_giro', label: 'Fecha de giro', render: (row) => fecha(row.fecha_giro) },
        {
            key: 'fecha_vencimiento',
            label: 'Fecha de vencimiento',
            render: (row) => {
                const vencida = row.estado === 'emitida' && String(row.fecha_vencimiento).slice(0, 10) < hoy();
                return <span className={vencida ? 'font-semibold text-red-600' : ''}>{fecha(row.fecha_vencimiento)}</span>;
            },
        },
        {
            key: 'cliente',
            label: 'Cliente',
            // Se busca también por el aceptante y la referencia del girador, aunque no tengan columna.
            getSearchValue: (row) => `${row.cliente?.nombre ?? ''} ${row.aceptante_nombre ?? ''} ${row.referencia ?? ''}`,
            render: (row) => row.cliente?.nombre ?? row.aceptante_nombre ?? <span className="text-gray-300">—</span>,
        },
        { key: 'importe', label: 'Importe', align: 'right', render: (row) => <span className="font-semibold text-warm-900">{money(row.importe, row.moneda)}</span> },
        {
            // Todo lo que ya se cobró de la letra (suma de los cobros, parciales o no).
            key: 'monto_pagado',
            label: 'Total cobrado',
            align: 'right',
            render: (row) => <span className={Number(row.monto_pagado) > 0 ? 'font-medium text-green-600' : 'text-gray-400'}>{money(row.monto_pagado, row.moneda)}</span>,
        },
        {
            key: 'saldo',
            label: 'Saldo',
            align: 'right',
            // Lo que falta cobrar de la letra (baja con cada cobro parcial); 0 si ya se pagó, se renovó o se anuló.
            render: (row) => (
                <span className={row.estado === 'emitida' ? 'font-medium text-red-600' : 'text-gray-400'}>
                    {money(row.estado === 'emitida' ? row.saldo : 0, row.moneda)}
                </span>
            ),
        },
        {
            key: 'estado',
            label: 'Estado',
            render: (row) => {
                const info = { emitida: ['amber', 'Por cobrar'], pagada: ['green', 'Pagada'], cancelada: ['blue', 'Cancelada'], anulada: ['gray', 'Anulada'] }[row.estado] ?? ['gray', row.estado];
                return (
                    <span className="inline-flex flex-col items-start gap-0.5">
                        <Badge variant={info[0]}>{info[1]}</Badge>
                        {/* Una letra cancelada pasó a la nueva: se dice a cuál. */}
                        {row.estado === 'cancelada' && row.renovacion && <span className="text-[11px] text-warm-500">→ renovación {row.renovacion.serie_renovacion ?? row.renovacion.codigo}</span>}
                        {row.estado === 'emitida' && Number(row.monto_pagado) > 0 && <span className="text-[11px] text-green-600">cobrado {money(row.monto_pagado, row.moneda)}</span>}
                    </span>
                );
            },
        },
        {
            key: 'sub_estado',
            label: 'Sub estado',
            getSearchValue: (row) => (SUB_ESTADOS.find((x) => x.value === (row.sub_estado ?? 'en_cartera'))?.label ?? ''),
            // Donde está la letra mientras se cobra (en cartera al crearla); una anulada ya no tiene.
            render: (row) => {
                if (row.estado === 'anulada' || row.estado === 'cancelada') return <span className="text-gray-300">—</span>;
                const info = SUB_ESTADOS.find((x) => x.value === (row.sub_estado ?? 'en_cartera')) ?? SUB_ESTADOS[0];
                return <Badge variant={info.variant}>{info.label}</Badge>;
            },
        },
        {
            key: 'canje',
            label: 'Concepto',
            getSearchValue: (row) => row.concepto ?? (row.cuenta_por_cobrar?.nota_venta ? `${row.cuenta_por_cobrar.nota_venta.serie}-${row.cuenta_por_cobrar.nota_venta.numero}` : ''),
            render: (row) =>
                row.concepto ? (
                    <span className="whitespace-nowrap text-sm text-warm-800">{row.concepto}</span>
                ) : row.anterior ? (
                    <span className="whitespace-nowrap text-sm text-warm-800">Renovación letra {row.anterior.codigo}</span>
                ) : row.cuenta_por_cobrar?.nota_venta ? (
                    <span className="whitespace-nowrap text-sm text-warm-800">Canje proforma x letra</span>
                ) : (
                    <span className="text-gray-300">—</span>
                ),
        },
        {
            // Un menú (⋮) con todas las acciones: la columna es angosta y los iconos sueltos se cortaban.
            key: 'acciones',
            label: 'Acciones',
            type: 'actions',
            width: '70px',
            actions: (row) => {
                const porCobrar = row.estado === 'emitida';
                return (
                    <ActionsMenu
                        items={[
                            { label: 'Imprimir / PDF', icon: FileText, color: 'text-warm-600', hidden: !puede('tesoreria.letras-cambio.imprimir'), onClick: () => setPdf(row) },
                            { label: 'Cambiar sub estado', icon: ArrowLeftRight, color: 'text-primary-600', hidden: !porCobrar || !puede('tesoreria.letras-cambio.editar'), onClick: () => abrirSubEstado(row) },
                            { label: 'Cobrar', icon: Wallet, color: 'text-green-600', hidden: !porCobrar || !puede('tesoreria.letras-cambio.editar'), onClick: () => setCobro(row) },
                            { label: 'Anular', icon: Ban, color: 'text-red-600', hidden: !porCobrar || Number(row.monto_pagado) > 0 || !puede('tesoreria.letras-cambio.eliminar'), onClick: () => setAnular(row) },
                        ]}
                    />
                );
            },
        },
    ];

    return (
        <Layout>
            <PageHeader
                title={renovaciones ? 'Renovaciones de letras' : 'Letras de cambio'}
                description={
                    renovaciones
                        ? 'Las letras nuevas que se giraron por el saldo de otra (serie RV001): aquí se cobran, se imprimen y se anulan'
                        : 'Las letras emitidas desde Cuentas por cobrar: aquí se cobran, se imprimen y se anulan'
                }
                actions={
                    <>
                        {/* Una letra suelta, sin cuenta por cobrar: sirve para las letras de préstamos. */}
                        {!renovaciones && puede('tesoreria.letras-cambio.crear') && (
                            <CreateButton onClick={() => setCreando(true)}>Crear letra</CreateButton>
                        )}
                        {puede('tesoreria.renovaciones.crear') && (
                            // Se elige la letra que se renueva y se gira una nueva por lo que le falta cobrar.
                            <CreateButton onClick={() => setRenovando(true)}>Crear renovación</CreateButton>
                        )}
                    </>
                }
            />

            {error && <Alert variant="error" className="mb-4">{error}</Alert>}

            <DataTable
                columns={columns}
                rows={rows.filter((r) => !fEstado || r.estado === fEstado)}
                loading={loading}
                searchPlaceholder="Buscar por cliente, aceptante o referencia..."
                emptyMessage={renovaciones ? 'Aún no hay renovaciones. Se crean con "Crear renovación".' : 'Aún no hay letras emitidas. Se emiten desde Cuentas por cobrar.'}
                filterable
                filterCount={fEstado ? 1 : 0}
                filters={<Select label="Estado" value={fEstado} onChange={(e) => setFEstado(e.target.value)} options={ESTADOS} />}
            />

            <PdfViewerModal
                open={Boolean(pdf)}
                onClose={() => setPdf(null)}
                tipo="letra-cambio"
                id={pdf?.id}
                nombre={pdf ? `Letra ${pdf.codigo}` : ''}
                titulo="Letra de cambio"
                formatos={['a4']}
            />

            <Modal
                open={Boolean(cambioSub)}
                onClose={() => setCambioSub(null)}
                title="Cambiar sub estado"
                description={cambioSub ? `Letra ${cambioSub.codigo} · ${cambioSub.cliente?.nombre ?? cambioSub.aceptante_nombre}` : ''}
                size="sm"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setCambioSub(null)}>
                            Cancelar
                        </Button>
                        <Button onClick={guardarSubEstado} loading={guardandoSub} disabled={subElegido === (cambioSub?.sub_estado ?? 'en_cartera')}>
                            Guardar
                        </Button>
                    </>
                }
            >
                <div className="space-y-2">
                    {SUB_ESTADOS.map((x) => (
                        <label
                            key={x.value}
                            className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition ${
                                subElegido === x.value ? 'border-primary-300 bg-primary-50' : 'border-edge hover:bg-gray-50'
                            }`}
                        >
                            <input
                                type="radio"
                                name="sub-estado"
                                checked={subElegido === x.value}
                                onChange={() => setSubElegido(x.value)}
                                className="h-4 w-4 accent-primary-600"
                            />
                            <span className="font-medium text-warm-900">{x.label}</span>
                        </label>
                    ))}
                </div>
            </Modal>

            <LetraCambioModal
                manual
                open={creando}
                onClose={() => setCreando(false)}
                onEmitida={(letra) => {
                    load();
                    setPdf(letra);
                }}
            />

            <LetraCobroModal open={Boolean(cobro)} letra={cobro} onClose={() => setCobro(null)} onCobrada={load} />

            {/* Renovar: la nueva letra se abre en PDF para imprimirla. */}
            <LetraRenovarModal
                open={renovando}
                letras={rows.filter((r) => r.estado === 'emitida' && Number(r.saldo) > 0.005)}
                onClose={() => setRenovando(false)}
                onRenovada={(nueva) => {
                    load();
                    setPdf(nueva);
                }}
            />

            <Modal
                open={Boolean(anular)}
                onClose={() => setAnular(null)}
                title="Anular letra de cambio"
                description={anular ? `Letra ${anular.codigo} de ${anular.aceptante_nombre}` : ''}
                size="sm"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setAnular(null)}>
                            Cancelar
                        </Button>
                        <Button variant="danger" loading={anulando} onClick={confirmarAnular}>
                            Anular
                        </Button>
                    </>
                }
            >
                <Alert variant="warning">
                    La letra queda anulada (su número no se reutiliza) y su importe vuelve a estar disponible para girar de la cuenta por cobrar.
                </Alert>
            </Modal>
        </Layout>
    );
}
