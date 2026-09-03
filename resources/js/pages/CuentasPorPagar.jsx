import { useCallback, useEffect, useState } from 'react';
import { Wallet } from 'lucide-react';
import api, { asList } from '../lib/api';
import Layout from '../components/Layout';
import PageHeader from '../components/PageHeader';
import PagosCuentaModal from '../components/PagosCuentaModal';
import { Alert, Badge, Button, DataTable, Select } from '../components/ui';

const ESTADOS = [
    { value: '', label: 'Todos los estados' },
    { value: 'pendiente', label: 'Pendiente' },
    { value: 'parcial', label: 'Parcial' },
    { value: 'pagado', label: 'Pagado' },
    { value: 'anulado', label: 'Anulado' },
];

const money = (n) =>
    new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(Number(n) || 0);

const fecha = (v) => (v ? new Date(v).toLocaleDateString('es-PE') : '—');

const estadoBadge = (estado) => {
    const map = { pendiente: 'red', parcial: 'amber', pagado: 'green', anulado: 'gray' };
    return <Badge variant={map[estado] ?? 'gray'}>{estado ?? '—'}</Badge>;
};

export default function CuentasPorPagar() {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [pagoCuenta, setPagoCuenta] = useState(null);
    const [fEstado, setFEstado] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            setRows(asList(await api.get('/cuentas-por-pagar')));
        } catch {
            setError('No se pudieron cargar las cuentas por pagar.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const columns = [
        { key: 'id', label: '#', render: (row) => <Badge variant="blue">{String(row.id).padStart(2, '0')}</Badge> },
        {
            key: 'proveedor',
            label: 'Proveedor',
            render: (row) => row.proveedor?.nombre ?? <span className="text-gray-400">—</span>,
        },
        { key: 'fecha_vencimiento', label: 'Vence', render: (row) => fecha(row.fecha_vencimiento) },
        { key: 'monto_total', label: 'Total', align: 'right', render: (row) => money(row.monto_total) },
        {
            key: 'monto_pagado',
            label: 'Pagado',
            align: 'right',
            render: (row) => <span className="text-green-600">{money(row.monto_pagado)}</span>,
        },
        {
            key: 'saldo',
            label: 'Saldo',
            align: 'right',
            render: (row) => <span className="font-medium text-red-600">{money(row.saldo)}</span>,
        },
        { key: 'estado', label: 'Estado', render: (row) => estadoBadge(row.estado) },
        {
            key: 'acciones',
            label: 'Acciones',
            type: 'actions',
            align: 'right',
            actions: (row) => (
                <Button size="sm" variant="secondary" onClick={() => setPagoCuenta(row)}>
                    <Wallet className="h-4 w-4" /> Pagos
                </Button>
            ),
        },
    ];

    return (
        <Layout>
            <PageHeader
                title="Cuentas por Pagar"
                description="Deudas pendientes con tus proveedores (compras al crédito)"
            />

            {error && <Alert variant="error" className="mb-4">{error}</Alert>}

            <DataTable
                columns={columns}
                rows={fEstado ? rows.filter((r) => r.estado === fEstado) : rows}
                loading={loading}
                searchPlaceholder="Buscar por proveedor..."
                emptyMessage="No hay cuentas por pagar registradas."
                filterable
                filterCount={fEstado ? 1 : 0}
                filters={
                    <div className="space-y-2">
                        <Select label="Estado" value={fEstado} onChange={(e) => setFEstado(e.target.value)} options={ESTADOS} />
                        {fEstado && (
                            <button onClick={() => setFEstado('')} className="text-xs font-medium text-red-600 hover:text-red-700">
                                Limpiar filtros
                            </button>
                        )}
                    </div>
                }
            />

            <PagosCuentaModal
                open={!!pagoCuenta}
                cuenta={pagoCuenta}
                tipo="pagar"
                onClose={() => setPagoCuenta(null)}
                onSaved={(updated) => {
                    setPagoCuenta(updated);
                    load();
                }}
            />
        </Layout>
    );
}
