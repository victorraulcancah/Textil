import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api, { asList } from '../lib/api';
import { useToast } from '../lib/toast';
import EstadoCuentaDetalle from '../components/EstadoCuentaDetalle';
import Layout from '../components/Layout';
import PageHeader from '../components/PageHeader';
import { Alert, SearchSelect } from '../components/ui';

/**
 * El estado de cuenta de un cliente, eligiéndolo de los que compraron a
 * crédito. El detalle es el mismo que sale con el clic derecho en Clientes.
 */
export default function EstadoCuenta() {
    const toast = useToast();
    const [params, setParams] = useSearchParams();
    const [clientes, setClientes] = useState([]);
    const [clienteId, setClienteId] = useState(params.get('cliente') ?? '');

    useEffect(() => {
        api.get('/estado-cuenta')
            .then((res) => setClientes(asList(res)))
            .catch(() => toast.error('No se pudieron cargar los clientes.'));
    }, [toast]);

    const elegirCliente = (id) => {
        setClienteId(id ?? '');
        setParams(id ? { cliente: id } : {}, { replace: true });
    };

    return (
        <Layout>
            <PageHeader title="Estado de cuenta" description="Ventas al crédito, pagos y cuotas pendientes de un cliente" />

            <div className="mb-4 rounded-xl border border-edge bg-white p-4 shadow-sm">
                <SearchSelect
                    label="Cliente"
                    value={clienteId}
                    onChange={elegirCliente}
                    placeholder="Elegir cliente…"
                    emptyText="Ningún cliente ha comprado a crédito"
                    options={clientes.map((c) => ({
                        value: String(c.id),
                        label: c.nombre,
                        keywords: `${c.codigo ?? ''} ${c.numero_documento ?? ''}`,
                    }))}
                />
            </div>

            {clienteId ? (
                <EstadoCuentaDetalle key={clienteId} clienteId={clienteId} />
            ) : (
                <Alert variant="info">Elige un cliente para ver su estado de cuenta.</Alert>
            )}
        </Layout>
    );
}
