import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileSearch, FileSignature, Wallet } from 'lucide-react';
import api, { asList } from '../lib/api';
import { useAuth } from '../lib/auth';
import { money } from '../lib/moneda';
import Layout from '../components/Layout';
import PageHeader from '../components/PageHeader';
import LetraCambioModal from '../components/LetraCambioModal';
import PagosCuentaModal from '../components/PagosCuentaModal';
import PdfViewerModal from '../components/PdfViewerModal';
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

/**
 * Lo que todavía se cobra en la cuenta: el saldo menos lo que pasó a letras de cambio.
 * Lo que está en letras se cobra con la letra, como si la cuenta se hubiera cancelado.
 */
const cobrable = (row) => Math.max((Number(row.saldo) || 0) - (Number(row.en_letras) || 0), 0);
const enLetrasTotal = (row) => Number(row.saldo) > 0.005 && cobrable(row) <= 0.005;

const estadoBadge = (row) => {
    if (enLetrasTotal(row)) return <Badge variant="blue">En letras</Badge>;
    const map = { pendiente: 'red', parcial: 'amber', pagado: 'green', anulado: 'gray' };
    return <Badge variant={map[row.estado] ?? 'gray'}>{row.estado ?? '—'}</Badge>;
};

export default function CuentasPorCobrar() {
    const navigate = useNavigate();
    const { puede } = useAuth();
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [pagoCuenta, setPagoCuenta] = useState(null);
    /** La cuenta de la que se emite una letra, y la letra recién emitida (para abrir su PDF). */
    const [letraCuenta, setLetraCuenta] = useState(null);
    const [letraEmitida, setLetraEmitida] = useState(null);
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
            // La serie ahora es más larga (PF002-001): con poco ancho el número se partía en dos líneas.
            width: '215px',
            getSearchValue: (row) => (row.nota_venta ? `${row.nota_venta.serie}-${row.nota_venta.numero}` : ''),
            render: (row) => (
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                    <Badge variant="blue" className="whitespace-nowrap">
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
            width: '105px',
            render: (row) => {
                const vencida = ['pendiente', 'parcial'].includes(row.estado) && !enLetrasTotal(row) && String(row.fecha_vencimiento).slice(0, 10) < hoy();
                return <span className={vencida ? 'font-semibold text-red-600' : ''}>{fecha(row.fecha_vencimiento)}</span>;
            },
        },
        { key: 'monto_total', label: 'Total', width: '110px', align: 'right', render: (row) => money(row.monto_total, row.moneda) },
        {
            key: 'monto_pagado',
            label: 'Pagado',
            width: '110px',
            align: 'right',
            render: (row) => <span className="text-green-600">{money(row.monto_pagado, row.moneda)}</span>,
        },
        {
            key: 'saldo',
            label: 'Saldo',
            width: '110px',
            align: 'right',
            // Lo que pasó a letras ya no es saldo por cobrar aquí.
            render: (row) => (
                <span className={enLetrasTotal(row) ? 'text-gray-400' : 'font-medium text-red-600'}>
                    {money(cobrable(row), row.moneda)}
                    {Number(row.en_letras) > 0 && !enLetrasTotal(row) && (
                        <span className="block text-[11px] font-normal text-warm-500">+ {money(row.en_letras, row.moneda)} en letras</span>
                    )}
                </span>
            ),
        },
        { key: 'estado', label: 'Estado', render: (row) => estadoBadge(row) },
        {
            key: 'canje',
            label: 'Concepto',
            // Qué proforma se cambió por qué letra: solo si de esta cuenta se giró una letra.
            getSearchValue: (row) => (row.letras ?? []).map((l) => `letra ${l.codigo}`).join(' '),
            render: (row) => {
                return row.letras?.length ? (
                    <span className="whitespace-nowrap text-sm text-warm-800">Canje proforma x letra</span>
                ) : (
                    <span className="text-gray-300">—</span>
                );
            },
        },
        {
            key: 'letras',
            label: 'Letras',
            // De qué letras salió esta cuenta: cada una abre su PDF.
            render: (row) =>
                row.letras?.length ? (
                    <span className="flex flex-wrap gap-1">
                        {row.letras.map((l) => (
                            <button
                                key={l.id}
                                type="button"
                                title={`Letra ${l.codigo} · ${money(l.importe, l.moneda)} · vence ${fecha(l.fecha_vencimiento)}`}
                                onClick={() => setLetraEmitida(l)}
                                className="inline-flex"
                            >
                                <Badge variant="blue">{l.serie_renovacion ?? l.codigo}</Badge>
                            </button>
                        ))}
                    </span>
                ) : (
                    <span className="text-gray-300">—</span>
                ),
        },
        {
            key: 'acciones',
            label: 'Acciones',
            type: 'actions',
            // Solo iconos (y "Ver letras" cuando la deuda pasó a letras): con 120 px por defecto se cortaba.
            width: '170px',
            align: 'right',
            actions: (row) => (
                <>
                    {enLetrasTotal(row) ? (
                        puede('tesoreria.letras-cambio') && (
                            <Button size="sm" variant="secondary" onClick={() => navigate('/letras-cambio')}>
                                <FileSignature className="h-4 w-4" /> Ver letras
                            </Button>
                        )
                    ) : (
                        <button
                            type="button"
                            aria-label="Pagos"
                            title="Pagos"
                            onClick={() => setPagoCuenta(row)}
                            className="rounded-md bg-emerald-50 p-1.5 text-emerald-600 ring-1 ring-inset ring-emerald-200 transition hover:bg-emerald-100 hover:text-emerald-700"
                        >
                            <Wallet className="h-4 w-4" />
                        </button>
                    )}
                    {puede('tesoreria.letras-cambio.crear') && ['pendiente', 'parcial'].includes(row.estado) && !enLetrasTotal(row) && (
                        <button
                            type="button"
                            aria-label="Emitir letra de cambio"
                            title="Emitir letra de cambio"
                            onClick={() => setLetraCuenta(row)}
                            className="rounded-md p-1.5 text-primary-600 transition hover:bg-primary-50"
                        >
                            <FileSignature className="h-4 w-4" />
                        </button>
                    )}
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

            <LetraCambioModal
                open={!!letraCuenta}
                cuenta={letraCuenta}
                onClose={() => setLetraCuenta(null)}
                onEmitida={(letra) => setLetraEmitida(letra)}
            />

            {/* Recién emitida: se abre su PDF para imprimirla. */}
            <PdfViewerModal
                open={Boolean(letraEmitida)}
                onClose={() => setLetraEmitida(null)}
                tipo="letra-cambio"
                id={letraEmitida?.id}
                nombre={letraEmitida ? `Letra ${letraEmitida.codigo}` : ''}
                titulo="Letra de cambio"
                formatos={['a4']}
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
