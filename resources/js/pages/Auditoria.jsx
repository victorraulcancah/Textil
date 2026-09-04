import { useCallback, useEffect, useState } from 'react';
import { Eye, ShieldCheck } from 'lucide-react';
import api from '../lib/api';
import Layout from '../components/Layout';
import PageHeader from '../components/PageHeader';
import { Alert, Badge, Button, DataTable, Input, Modal, Select } from '../components/ui';

const fechaHora = (v) => (v ? new Date(v).toLocaleString('es-PE') : '—');

/** Color del distintivo según lo que se hizo. */
const ACCION_VARIANTE = {
    creo: 'green',
    actualizo: 'blue',
    elimino: 'red',
    inicio_sesion: 'gray',
    cerro_sesion: 'gray',
};

const ACCION_LABEL = {
    creo: 'Creó',
    actualizo: 'Actualizó',
    elimino: 'Eliminó',
    inicio_sesion: 'Inició sesión',
    cerro_sesion: 'Cerró sesión',
};

/** Muestra un valor de la bitácora tal como se guardó. */
const comoTexto = (v) => {
    if (v === null || v === undefined || v === '') return '—';
    if (typeof v === 'boolean') return v ? 'Sí' : 'No';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
};

export default function Auditoria() {
    const [registros, setRegistros] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const [opciones, setOpciones] = useState({ acciones: [], modulos: [], usuarios: [] });
    const [fAccion, setFAccion] = useState('');
    const [fModulo, setFModulo] = useState('');
    const [fUsuario, setFUsuario] = useState('');
    const [fDesde, setFDesde] = useState('');
    const [fHasta, setFHasta] = useState('');
    const [aplicados, setAplicados] = useState({});

    const [detalle, setDetalle] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const { data } = await api.get('/auditorias', {
                params: { ...aplicados, per_page: 200 },
            });
            setRegistros(data?.data ?? []);
        } catch {
            setError('No se pudo cargar la auditoría.');
        } finally {
            setLoading(false);
        }
    }, [aplicados]);

    useEffect(() => {
        load();
    }, [load]);

    useEffect(() => {
        api.get('/auditorias/filtros')
            .then((res) => setOpciones(res.data))
            .catch(() => {});
    }, []);

    const aplicar = () => {
        const next = {};
        if (fAccion) next.accion = fAccion;
        if (fModulo) next.modulo = fModulo;
        if (fUsuario) next.user_id = fUsuario;
        if (fDesde) next.desde = fDesde;
        if (fHasta) next.hasta = fHasta;
        setAplicados(next);
    };

    const limpiar = () => {
        setFAccion('');
        setFModulo('');
        setFUsuario('');
        setFDesde('');
        setFHasta('');
        setAplicados({});
    };

    const filtros = (
        <div className="space-y-2">
            <Select
                label="Acción"
                value={fAccion}
                onChange={(e) => setFAccion(e.target.value)}
                options={[{ value: '', label: 'Todas' }, ...opciones.acciones]}
            />
            <Select
                label="Módulo"
                value={fModulo}
                onChange={(e) => setFModulo(e.target.value)}
                options={[
                    { value: '', label: 'Todos' },
                    ...(opciones.modulos ?? []).map((m) => ({ value: m, label: m })),
                ]}
            />
            <Select
                label="Usuario"
                value={fUsuario}
                onChange={(e) => setFUsuario(e.target.value)}
                options={[{ value: '', label: 'Todos' }, ...(opciones.usuarios ?? [])]}
            />
            <div className="grid grid-cols-2 gap-2">
                <Input label="Desde" type="date" value={fDesde} onChange={(e) => setFDesde(e.target.value)} />
                <Input label="Hasta" type="date" value={fHasta} onChange={(e) => setFHasta(e.target.value)} />
            </div>
            <div className="flex gap-2 pt-1">
                <Button size="sm" onClick={aplicar}>Aplicar</Button>
                {Object.keys(aplicados).length > 0 && (
                    <Button variant="ghost" size="sm" onClick={limpiar}>Limpiar</Button>
                )}
            </div>
        </div>
    );

    const columns = [
        {
            key: 'created_at',
            label: 'Fecha',
            width: '160px',
            render: (row) => (
                <span className="whitespace-nowrap text-warm-500">{fechaHora(row.created_at)}</span>
            ),
        },
        {
            key: 'usuario_nombre',
            label: 'Usuario',
            width: '150px',
            getSearchValue: (row) => row.usuario_nombre ?? row.usuario?.name,
            render: (row) => (
                <span className="block truncate font-medium text-warm-900">
                    {row.usuario_nombre ?? row.usuario?.name ?? 'Sistema'}
                </span>
            ),
        },
        {
            key: 'accion',
            label: 'Acción',
            width: '130px',
            render: (row) => (
                <Badge variant={ACCION_VARIANTE[row.accion] ?? 'gray'}>
                    {ACCION_LABEL[row.accion] ?? row.accion}
                </Badge>
            ),
        },
        {
            key: 'modulo',
            label: 'Módulo',
            width: '160px',
            render: (row) => <span className="text-warm-700">{row.modulo ?? '—'}</span>,
        },
        {
            key: 'descripcion',
            label: 'Registro',
            render: (row) => (
                <span className="block truncate text-warm-900">{row.descripcion ?? '—'}</span>
            ),
        },
        {
            key: 'ip',
            label: 'IP',
            width: '120px',
            render: (row) => <span className="text-warm-500">{row.ip ?? '—'}</span>,
        },
        {
            type: 'actions',
            key: 'actions',
            label: 'Acciones',
            actions: (row) => (
                <button
                    aria-label="Ver detalle"
                    onClick={() => setDetalle(row)}
                    className="rounded-md p-1.5 text-primary-600 transition hover:bg-primary-50 hover:text-primary-700"
                >
                    <Eye className="h-4 w-4" />
                </button>
            ),
        },
    ];

    // Campos que cambiaron, con su valor anterior y el nuevo.
    const cambios = (() => {
        if (!detalle) return [];
        const claves = [
            ...new Set([
                ...Object.keys(detalle.antes ?? {}),
                ...Object.keys(detalle.despues ?? {}),
            ]),
        ];
        return claves.map((campo) => ({
            campo,
            antes: detalle.antes?.[campo],
            despues: detalle.despues?.[campo],
        }));
    })();

    return (
        <Layout>
            <PageHeader
                title="Auditoría"
                description="Quién creó, modificó o eliminó cada registro del sistema"
            />

            {error && <Alert variant="error" className="mb-4">{error}</Alert>}

            <DataTable
                columns={columns}
                rows={registros}
                loading={loading}
                searchPlaceholder="Buscar en la auditoría..."
                filterable
                filters={filtros}
                filterCount={Object.keys(aplicados).length}
                emptyMessage="No hay movimientos registrados."
            />

            <Modal
                open={Boolean(detalle)}
                onClose={() => setDetalle(null)}
                title={`${ACCION_LABEL[detalle?.accion] ?? ''} · ${detalle?.modulo ?? ''}`}
                description={detalle?.descripcion ?? ''}
                size="2xl"
                footer={
                    <Button variant="secondary" onClick={() => setDetalle(null)}>
                        Cerrar
                    </Button>
                }
            >
                {detalle && (
                    <div className="space-y-4">
                        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                            {[
                                ['Usuario', detalle.usuario_nombre ?? detalle.usuario?.name ?? 'Sistema'],
                                ['Fecha', fechaHora(detalle.created_at)],
                                ['IP', detalle.ip ?? '—'],
                                ['Registro', `#${detalle.auditable_id ?? '—'}`],
                            ].map(([label, valor]) => (
                                <div key={label}>
                                    <dt className="text-xs text-warm-500">{label}</dt>
                                    <dd className="truncate font-medium text-warm-900">{valor}</dd>
                                </div>
                            ))}
                        </dl>

                        {cambios.length === 0 ? (
                            <p className="rounded-lg border border-dashed border-edge px-4 py-8 text-center text-sm text-warm-400">
                                Sin detalle de campos.
                            </p>
                        ) : (
                            <div className="overflow-x-auto rounded-lg border border-edge">
                                <table className="w-full min-w-[520px] text-sm">
                                    <thead>
                                        <tr className="bg-primary-600 text-left text-xs uppercase tracking-wide text-white">
                                            <th className="px-3 py-2 font-medium">Campo</th>
                                            <th className="px-3 py-2 font-medium">Antes</th>
                                            <th className="px-3 py-2 font-medium">Después</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {cambios.map((c) => (
                                            <tr key={c.campo}>
                                                <td className="px-3 py-2 font-medium text-warm-900">{c.campo}</td>
                                                <td className="px-3 py-2 text-danger-600">{comoTexto(c.antes)}</td>
                                                <td className="px-3 py-2 text-success-600">{comoTexto(c.despues)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        <p className="flex items-center gap-2 text-xs text-warm-400">
                            <ShieldCheck className="h-3.5 w-3.5" />
                            La bitácora es solo lectura: no se puede editar ni borrar desde el sistema.
                        </p>
                    </div>
                )}
            </Modal>
        </Layout>
    );
}
