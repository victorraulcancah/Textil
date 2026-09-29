import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileSearch, Wallet } from 'lucide-react';
import api, { asList } from '../lib/api';
import { useAuth } from '../lib/auth';
import { money } from '../lib/moneda';
import Layout from '../components/Layout';
import PageHeader from '../components/PageHeader';
import PagosCuentaModal from '../components/PagosCuentaModal';
import { Alert, Badge, Button, DataTable, SearchSelect, Select } from '../components/ui';

const ESTADOS = [
    { value: '', label: 'Todos los estados' },
    { value: 'pendiente', label: 'Pendiente' },
    { value: 'parcial', label: 'Parcial' },
    { value: 'pagado', label: 'Pagado' },
    { value: 'anulado', label: 'Anulado' },
];

// "2026-10-29" sin hora se leería como UTC y en Perú saldría el día anterior.
const fecha = (v) => (v ? new Date(`${String(v).slice(0, 10)}T00:00:00`).toLocaleDateString('es-PE') : '—');

const hoy = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const estadoBadge = (estado) => {
    const map = { pendiente: 'red', parcial: 'amber', pagado: 'green', anulado: 'gray' };
    return <Badge variant={map[estado] ?? 'gray'}>{estado ?? '—'}</Badge>;
};

export default function CuentasPorCobrar() {
    const navigate = useNavigate();
    const { puede } = useAuth();
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [pagoCuenta, setPagoCuenta] = useState(null);
    const [fEstado, setFEstado] = useState('');
    const [fCliente, setFCliente] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            setRows(asList(await api.get('/cuentas-por-cobrar')));
        } catch {
            setError('No se pudieron cargar las cuentas por cobrar.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const columns = [
        {
            key: 'documento',
            label: 'Venta',
            getSearchValue: (row) => (row.nota_venta ? `${row.nota_venta.serie}-${row.nota_venta.numero}` : ''),
            render: (row) => (
                <span className="inline-flex items-center gap-1.5">
                    <Badge variant="blue">
                        {row.nota_venta ? `${row.nota_venta.serie}-${row.nota_venta.numero}` : `#${row.id}`}
                    </Badge>
                    {row.total_cuotas > 1 && (
                        <span className="text-xs text-warm-500">
                            Cuota {row.numero_cuota}/{row.total_cuotas}
                        </span>
                    )}
                </span>
            ),
        },
        {
            key: 'cliente',
            label: 'Cliente',
            render: (row) => row.cliente?.nombre ?? <span className="text-gray-400">—</span>,
        },
        {
            key: 'fecha_vencimiento',
            label: 'Vence',
            render: (row) => {
                const vencida = ['pendiente', 'parcial'].includes(row.estado) && String(row.fecha_vencimiento).slice(0, 10) < hoy();
                return <span className={vencida ? 'font-semibold text-red-600' : ''}>{fecha(row.fecha_vencimiento)}</span>;
            },
        },
        { key: 'monto_total', label: 'Total', align: 'right', render: (row) => money(row.monto_total, row.moneda) },
        {
            key: 'monto_pagado',
            label: 'Pagado',
            align: 'right',
            render: (row) => <span className="text-green-600">{money(row.monto_pagado, row.moneda)}</span>,
        },
        {
            key: 'saldo',
            label: 'Saldo',
            align: 'right',
            render: (row) => <span className="font-medium text-red-600">{money(row.saldo, row.moneda)}</span>,
        },
        { key: 'estado', label: 'Estado', render: (row) => estadoBadge(row.estado) },
        {
            key: 'acciones',
            label: 'Acciones',
            type: 'actions',
            align: 'right',
            actions: (row) => (
                <>
                    <Button size="sm" variant="secondary" onClick={() => setPagoCuenta(row)}>
                        <Wallet className="h-4 w-4" /> Pagos
                    </Button>
                    {puede('tesoreria.estado-cuenta') && (
                        <button
                            type="button"
                            aria-label="Estado de cuenta"
                            title="Estado de cuenta del cliente"
                            onClick={() => navigate(`/estado-cuenta?cliente=${row.cliente_id}`)}
                            className="rounded-md p-1.5 text-primary-600 transition hover:bg-primary-50"
                        >
                            <FileSearch className="h-4 w-4" />
                        </button>
                    )}
                </>
            ),
        },
    ];

    return (
        <Layout>
            <PageHeader
                title="Cuentas por Cobrar"
                description="Deudas pendientes de tus clientes (ventas al crédito)"
            />

            {error && <Alert variant="error" className="mb-4">{error}</Alert>}

            <DataTable
                columns={columns}
                rows={rows.filter((r) => {
                    if (fEstado && r.estado !== fEstado) return false;
                    if (fCliente && String(r.cliente_id) !== String(fCliente)) return false;
                    return true;
                })}
                loading={loading}
                searchPlaceholder="Buscar por cliente..."
                emptyMessage="No hay cuentas por cobrar registradas."
                filterable
                filterCount={(fEstado ? 1 : 0) + (fCliente ? 1 : 0)}
                filters={
                    <div className="space-y-2">
                        <Select label="Estado" value={fEstado} onChange={(e) => setFEstado(e.target.value)} options={ESTADOS} />
                        <SearchSelect
                            label="Cliente"
                            value={fCliente}
                            onChange={(v) => setFCliente(v ?? '')}
                            placeholder="Todos"
                            emptyText="Sin coincidencias"
                            options={[
                                ...new Map(
                                    rows.filter((r) => r.cliente_id).map((r) => [String(r.cliente_id), r.cliente?.nombre]),
                                ).entries(),
                            ].map(([value, label]) => ({ value, label }))}
                        />
                        {(fEstado || fCliente) && (
                            <button
                                onClick={() => {
                                    setFEstado('');
                                    setFCliente('');
                                }}
                                className="text-xs font-medium text-red-600 hover:text-red-700"
                            >
                                Limpiar filtros
                            </button>
                        )}
                    </div>
                }
            />

            <PagosCuentaModal
                open={!!pagoCuenta}
                cuenta={pagoCuenta}
                tipo="cobrar"
                onClose={() => setPagoCuenta(null)}
                onSaved={(updated) => {
                    setPagoCuenta(updated);
                    load();
                }}
            />
        </Layout>
    );
}
