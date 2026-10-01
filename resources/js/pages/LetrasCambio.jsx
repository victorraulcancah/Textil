import { useCallback, useEffect, useState } from 'react';
import { Ban, FileText } from 'lucide-react';
import api, { asList } from '../lib/api';
import { useAuth } from '../lib/auth';
import { money } from '../lib/moneda';
import { useToast } from '../lib/toast';
import Layout from '../components/Layout';
import PageHeader from '../components/PageHeader';
import PdfViewerModal from '../components/PdfViewerModal';
import { Alert, Badge, Button, DataTable, Modal, Select } from '../components/ui';

// "2026-10-29" sin hora se leería como UTC y en Perú saldría el día anterior.
const fecha = (v) => (v ? new Date(`${String(v).slice(0, 10)}T00:00:00`).toLocaleDateString('es-PE') : '—');

const hoy = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const ESTADOS = [
    { value: '', label: 'Todas' },
    { value: 'emitida', label: 'Emitidas' },
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
        { key: 'numero', label: 'N°', render: (row) => <span className="font-semibold text-warm-900">{row.numero}</span> },
        { key: 'referencia', label: 'Referencia', render: (row) => (row.referencia ? <Badge variant="blue">{row.referencia}</Badge> : <span className="text-gray-400">—</span>) },
        { key: 'aceptante_nombre', label: 'Aceptante', render: (row) => row.aceptante_nombre },
        { key: 'fecha_giro', label: 'Giro', render: (row) => fecha(row.fecha_giro) },
        {
            key: 'fecha_vencimiento',
            label: 'Vence',
            render: (row) => {
                const vencida = row.estado === 'emitida' && String(row.fecha_vencimiento).slice(0, 10) < hoy();
                return <span className={vencida ? 'font-semibold text-red-600' : ''}>{fecha(row.fecha_vencimiento)}</span>;
            },
        },
        { key: 'importe', label: 'Importe', align: 'right', render: (row) => <span className="font-semibold text-warm-900">{money(row.importe, row.moneda)}</span> },
        {
            key: 'estado',
            label: 'Estado',
            render: (row) => <Badge variant={row.estado === 'emitida' ? 'green' : 'gray'}>{row.estado === 'emitida' ? 'Emitida' : 'Anulada'}</Badge>,
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
            <PageHeader title="Letras de cambio" description="Las letras emitidas desde Cuentas por cobrar" />

            {error && <Alert variant="error" className="mb-4">{error}</Alert>}

            <DataTable
                columns={columns}
                rows={rows.filter((r) => !fEstado || r.estado === fEstado)}
                loading={loading}
                searchPlaceholder="Buscar por aceptante o referencia..."
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
