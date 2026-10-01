import { useCallback, useEffect, useState } from 'react';
import { Ban, FileText, Wallet } from 'lucide-react';
import api, { asList } from '../lib/api';
import { useAuth } from '../lib/auth';
import { money } from '../lib/moneda';
import { useToast } from '../lib/toast';
import Layout from '../components/Layout';
import LetraCobroModal from '../components/LetraCobroModal';
import PageHeader from '../components/PageHeader';
import PdfViewerModal from '../components/PdfViewerModal';
import { Alert, Badge, Button, DataTable, Modal, Select } from '../components/ui';

// "2026-10-29" sin hora se leería como UTC y en Perú saldría el día anterior.
const fecha = (v) => (v ? new Date(`${String(v).slice(0, 10)}T00:00:00`).toLocaleDateString('es-PE') : '—');

const hoy = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Días de calendario entre dos fechas "aaaa-mm-dd". */
const diasEntre = (desde, hasta) => {
    const t = (x) => {
        const [y, m, d] = String(x).slice(0, 10).split('-').map(Number);
        return Date.UTC(y, m - 1, d);
    };
    return Math.round((t(hasta) - t(desde)) / 86400000);
};

/** El detalle del estado de una letra: vigencia si está por cobrar, puntualidad si ya se pagó. */
const subEstado = (row) => {
    if (row.estado === 'emitida') {
        const dias = diasEntre(hoy(), row.fecha_vencimiento);
        if (dias > 0) return { texto: `Vigente · vence en ${dias} día${dias === 1 ? '' : 's'}`, color: 'text-warm-700' };
        if (dias === 0) return { texto: 'Vence hoy', color: 'font-medium text-amber-600' };
        return { texto: `Vencida hace ${-dias} día${dias === -1 ? '' : 's'}`, color: 'font-medium text-red-600' };
    }
    if (row.estado === 'pagada') {
        const tarde = row.fecha_pago && diasEntre(row.fecha_vencimiento, row.fecha_pago) > 0;
        return { texto: `${tarde ? 'Pagada con atraso' : 'Pagada a tiempo'}${row.fecha_pago ? ` · ${fecha(row.fecha_pago)}` : ''}`, color: tarde ? 'text-amber-600' : 'text-green-600' };
    }
    return { texto: '—', color: 'text-gray-300' };
};

const ESTADOS = [
    { value: '', label: 'Todas' },
    { value: 'emitida', label: 'Por cobrar' },
    { value: 'pagada', label: 'Pagadas' },
    { value: 'anulada', label: 'Anuladas' },
];

/**
 * Las letras de cambio emitidas desde las cuentas por cobrar: aquí se consultan,
 * se imprime su PDF y se anulan. Se emiten desde Cuentas por cobrar.
 */
export default function LetrasCambio() {
    const toast = useToast();
    const { puede } = useAuth();
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [fEstado, setFEstado] = useState('');
    const [pdf, setPdf] = useState(null);
    const [cobro, setCobro] = useState(null);
    const [anular, setAnular] = useState(null);
    const [anulando, setAnulando] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            setRows(asList(await api.get('/letras-cambio')));
        } catch {
            setError('No se pudieron cargar las letras de cambio.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const confirmarAnular = async () => {
        setAnulando(true);
        try {
            await api.post(`/letras-cambio/${anular.id}/anular`);
            toast.success(`Letra N° ${anular.numero} anulada.`);
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
        { key: 'numero', label: 'Letra Nro', render: (row) => <span className="font-semibold text-warm-900">{row.numero}</span> },
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
            key: 'saldo',
            label: 'Saldo',
            align: 'right',
            // Lo que falta cobrar de la letra: todo el importe mientras esté por cobrar; 0 si ya se pagó o se anuló.
            render: (row) => (
                <span className={row.estado === 'emitida' ? 'font-medium text-red-600' : 'text-gray-400'}>
                    {money(row.estado === 'emitida' ? row.importe : 0, row.moneda)}
                </span>
            ),
        },
        {
            key: 'estado',
            label: 'Estado',
            render: (row) => {
                const info = { emitida: ['amber', 'Por cobrar'], pagada: ['green', 'Pagada'], anulada: ['gray', 'Anulada'] }[row.estado] ?? ['gray', row.estado];
                return <Badge variant={info[0]}>{info[1]}</Badge>;
            },
        },
        {
            key: 'sub_estado',
            label: 'Sub estado',
            // El detalle del estado: si la letra por cobrar sigue vigente o ya venció, y si la pagada llegó a tiempo.
            getSearchValue: (row) => subEstado(row).texto,
            render: (row) => {
                const { texto, color } = subEstado(row);
                return <span className={color}>{texto}</span>;
            },
        },
        {
            key: 'canje',
            label: 'Concepto',
            getSearchValue: (row) => (row.cuenta_por_cobrar?.nota_venta ? `${row.cuenta_por_cobrar.nota_venta.serie}-${row.cuenta_por_cobrar.nota_venta.numero}` : ''),
            render: (row) =>
                row.cuenta_por_cobrar?.nota_venta ? (
                    <span className="whitespace-nowrap text-sm text-warm-800">Canje proforma x letra</span>
                ) : (
                    <span className="text-gray-300">—</span>
                ),
        },
        {
            key: 'acciones',
            label: 'Acciones',
            type: 'actions',
            align: 'right',
            actions: (row) => (
                <>
                    {puede('tesoreria.letras-cambio.imprimir') && (
                        <Button size="sm" variant="secondary" onClick={() => setPdf(row)}>
                            <FileText className="h-4 w-4" /> PDF
                        </Button>
                    )}
                    {row.estado === 'emitida' && puede('tesoreria.letras-cambio.editar') && (
                        <Button size="sm" onClick={() => setCobro(row)}>
                            <Wallet className="h-4 w-4" /> Cobrar
                        </Button>
                    )}
                    {row.estado === 'emitida' && puede('tesoreria.letras-cambio.eliminar') && (
                        <button
                            type="button"
                            aria-label="Anular"
                            title="Anular la letra"
                            onClick={() => setAnular(row)}
                            className="rounded-md p-1.5 text-red-600 transition hover:bg-red-50"
                        >
                            <Ban className="h-4 w-4" />
                        </button>
                    )}
                </>
            ),
        },
    ];

    return (
        <Layout>
            <PageHeader title="Letras de cambio" description="Las letras emitidas desde Cuentas por cobrar: aquí se cobran, se imprimen y se anulan" />

            {error && <Alert variant="error" className="mb-4">{error}</Alert>}

            <DataTable
                columns={columns}
                rows={rows.filter((r) => !fEstado || r.estado === fEstado)}
                loading={loading}
                searchPlaceholder="Buscar por cliente, aceptante o referencia..."
                emptyMessage="Aún no hay letras emitidas. Se emiten desde Cuentas por cobrar."
                filterable
                filterCount={fEstado ? 1 : 0}
                filters={<Select label="Estado" value={fEstado} onChange={(e) => setFEstado(e.target.value)} options={ESTADOS} />}
            />

            <PdfViewerModal
                open={Boolean(pdf)}
                onClose={() => setPdf(null)}
                tipo="letra-cambio"
                id={pdf?.id}
                nombre={pdf ? `Letra ${pdf.numero}` : ''}
                titulo="Letra de cambio"
                formatos={['a4']}
            />

            <LetraCobroModal open={Boolean(cobro)} letra={cobro} onClose={() => setCobro(null)} onCobrada={load} />

            <Modal
                open={Boolean(anular)}
                onClose={() => setAnular(null)}
                title="Anular letra de cambio"
                description={anular ? `Letra N° ${anular.numero} de ${anular.aceptante_nombre}` : ''}
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
