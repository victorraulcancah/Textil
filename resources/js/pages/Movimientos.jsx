import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PackageSearch } from 'lucide-react';
import api, { asList } from '../lib/api';
import { claveColor, entero, num, texto, vacio } from '../lib/kardex';
import Layout from '../components/Layout';
import PageHeader from '../components/PageHeader';
import { Alert, DataTable, SearchSelect, Spinner } from '../components/ui';

export default function Movimientos() {
    const navigate = useNavigate();
    // La tela elegida viaja en la dirección: al volver de un color o un documento todo sigue donde estaba.
    const [params, setParams] = useSearchParams();

    /** Las telas que se pueden buscar: no se lista nada hasta elegir una. */
    const [telas, setTelas] = useState([]);
    const [almacenes, setAlmacenes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const [telaId, setTelaId] = useState('');
    const [almacenId, setAlmacenId] = useState(params.get('almacen') ?? '');
    /** Los colores de la tela elegida con sus rollos y metros (null mientras cargan). */
    const [colores, setColores] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [telasRes, almRes] = await Promise.all([api.get('/movimientos/telas'), api.get('/almacenes')]);
            setTelas(asList(telasRes));
            setAlmacenes(asList(almRes));
        } catch {
            setError('No se pudo cargar el kardex.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const tela = telas.find((t) => String(t.id) === String(telaId)) ?? null;
    const unidad = tela?.unidad ?? '';

    // Los colores se piden otra vez al cambiar de almacén: cada almacén tiene sus propios rollos.
    useEffect(() => {
        if (!telaId) return undefined;
        let vivo = true;
        setColores(null);
        api.get('/movimientos/colores', { params: { producto_id: telaId, almacen_id: almacenId || undefined } })
            .then((res) => vivo && setColores(asList(res)))
            .catch(() => vivo && setColores([]));
        return () => {
            vivo = false;
        };
    }, [telaId, almacenId]);

    const guardarEnDireccion = (tela, almacen) => {
        const p = {};
        if (tela) p.tela = tela;
        if (tela && almacen) p.almacen = almacen;
        setParams(p, { replace: true });
    };

    const elegirTela = (id) => {
        setTelaId(id ?? '');
        setColores(null);
        guardarEnDireccion(id, almacenId);
    };

    const elegirAlmacen = (id) => {
        setAlmacenId(id ?? '');
        guardarEnDireccion(telaId, id);
    };

    // Al entrar con una tela en la dirección —por ejemplo al volver de un color— se vuelve a abrir.
    useEffect(() => {
        const t = params.get('tela');
        if (t && !telaId && telas.some((x) => String(x.id) === t)) setTelaId(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [telas]);

    /** Un color se ve en su propia vista: todos sus documentos. */
    const abrirColor = (color) => {
        const query = almacenId ? `?almacen=${almacenId}` : '';
        navigate(`/kardex/color/${telaId}/${claveColor(color.id)}${query}`);
    };

    const resumen = useMemo(() => {
        const lista = colores ?? [];
        const suma = (k) => lista.reduce((s, c) => s + (Number(c[k]) || 0), 0);
        return { colores: lista.filter((c) => c.id != null).length, rollos: suma('rollos'), fisico: suma('fisico'), disponible: suma('disponible') };
    }, [colores]);

    // ───────────── La tabla de colores de la tela
    const columnasColores = [
        {
            key: 'codigo',
            label: 'Código',
            width: '110px',
            getSearchValue: (row) => [tela?.codigo, row.codigo].filter(Boolean).join('-'),
            render: (row) => <span className="whitespace-nowrap font-medium text-gray-700">{[tela?.codigo, row.codigo].filter(Boolean).join('-') || '—'}</span>,
        },
        {
            key: 'marca',
            label: 'Marca',
            width: '130px',
            getSearchValue: () => tela?.marca,
            render: () => texto(tela?.marca, '130px'),
        },
        {
            key: 'descripcion',
            label: 'Descripción',
            getSearchValue: (row) => `${tela?.nombre ?? ''} ${row.nombre}`,
            render: (row) => (
                <span className="inline-flex min-w-0 items-center gap-2">
                    <span className="h-3 w-3 shrink-0 rounded-full ring-1 ring-black/10" style={{ backgroundColor: row.hex || '#9ca3af' }} />
                    <span className="min-w-0">
                        <span className="block truncate font-semibold uppercase text-primary-700">{row.nombre}</span>
                        <span className="block truncate text-xs text-gray-400">{tela?.nombre}</span>
                    </span>
                </span>
            ),
        },
        {
            key: 'fisico',
            label: 'Stock físico',
            width: '120px',
            align: 'right',
            searchable: false,
            render: (row) => <span className="font-semibold text-gray-900">{num(row.fisico)}</span>,
        },
        {
            key: 'um',
            label: 'U.M',
            width: '60px',
            searchable: false,
            render: () => <span className="text-gray-500">{unidad}</span>,
        },
        {
            // Lo comprado que aún no llega, con la orden de compra de la que viene.
            key: 'transito',
            label: 'Tránsito',
            width: '140px',
            align: 'right',
            getSearchValue: (row) => (row.ordenes ?? []).map((o) => o.codigo).join(' '),
            render: (row) =>
                Number(row.transito) > 0 ? (
                    <span className="block text-right leading-tight" title={(row.ordenes ?? []).map((o) => `${o.codigo}: ${num(o.metros)} ${unidad}`).join('\n')}>
                        <span className="block text-blue-700">{num(row.transito)}</span>
                        <span className="block truncate text-[11px] text-gray-500">{(row.ordenes ?? []).map((o) => o.codigo).join(', ')}</span>
                    </span>
                ) : (
                    vacio
                ),
        },
        {
            // Los rollos que un pedido ya separó o está preparando, con su pedido.
            key: 'reservado_p',
            label: 'Reservado (P)',
            width: '150px',
            align: 'right',
            getSearchValue: (row) => (row.pedidos ?? []).map((p) => `${p.pedido} ${p.cliente ?? ''}`).join(' '),
            render: (row) =>
                Number(row.reservado_p) > 0 ? (
                    <span
                        className="block text-right leading-tight"
                        title={(row.pedidos ?? []).map((p) => `${p.pedido} · ${p.cliente ?? ''} · ${p.rollos} rollo${p.rollos === 1 ? '' : 's'} · ${num(p.metros)} ${unidad} (${p.estado})`).join('\n')}
                    >
                        <span className="block text-amber-700">{num(row.reservado_p)}</span>
                        <span className="block truncate text-[11px] text-gray-500">{(row.pedidos ?? []).map((p) => p.pedido).join(', ')}</span>
                    </span>
                ) : (
                    vacio
                ),
        },
        {
            // El stock físico menos lo reservado.
            key: 'disponible',
            label: 'Disponible',
            width: '115px',
            align: 'right',
            searchable: false,
            render: (row) => (
                <span
                    className={Number(row.disponible) > 0 ? 'font-semibold text-green-700' : 'font-semibold text-red-600'}
                    title={`Stock físico ${num(row.fisico)} − reservado ${num(row.reservado_p)}${Number(row.reservado_f) > 0 ? ` − pedido sin rollo asignado ${num(row.reservado_f)}` : ''}`}
                >
                    {num(row.disponible)}
                </span>
            ),
        },
    ];

    return (
        <Layout>
            <PageHeader title="Kardex" description="Busca una tela y mira cada uno de sus colores con sus rollos, su stock y sus movimientos" />

            {error && <Alert variant="error" className="mb-4">{error}</Alert>}

            <div className="mb-4 flex flex-wrap items-end gap-3">
                <div className="min-w-[260px] max-w-xl flex-1">
                    <SearchSelect
                        value={telaId}
                        onChange={(v) => elegirTela(v)}
                        placeholder={loading ? 'Cargando telas…' : 'Escribe el nombre o el código de la tela…'}
                        emptyText="Ninguna tela coincide"
                        options={telas.map((t) => ({
                            value: String(t.id),
                            label: [t.codigo, t.nombre, t.tipo_tela].filter(Boolean).join(' · '),
                        }))}
                    />
                </div>
                {tela && (
                    <div className="w-56">
                        <SearchSelect
                            value={almacenId}
                            onChange={(v) => elegirAlmacen(v)}
                            placeholder="Todos los almacenes"
                            emptyText="Sin coincidencias"
                            options={almacenes.map((a) => ({ value: String(a.id), label: a.nombre }))}
                        />
                    </div>
                )}
            </div>

            {!tela ? (
                <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-edge bg-white py-20 text-center">
                    <PackageSearch className="h-8 w-8 text-warm-500" />
                    <p className="text-sm text-warm-500">Elige una tela y aquí aparecerán sus colores.</p>
                </div>
            ) : colores === null ? (
                <div className="flex items-center justify-center py-20">
                    <Spinner size="lg" className="text-primary-600" />
                </div>
            ) : (
                <DataTable
                    columns={columnasColores}
                    rows={colores}
                    keyField="id"
                    searchPlaceholder="Buscar color..."
                    emptyMessage="Esta tela no tiene colores con stock ni movimientos."
                    onRowClick={abrirColor}
                    encabezado={
                        <p className="text-sm text-warm-600">
                            <strong className="text-warm-900">{entero(resumen.colores)}</strong> color{resumen.colores === 1 ? '' : 'es'} ·{' '}
                            <strong className="text-warm-900">{entero(resumen.rollos)}</strong> rollos ·{' '}
                            <strong className="text-warm-900">{num(resumen.fisico)} {unidad}</strong> en almacén ·{' '}
                            <strong className="text-green-700">{num(resumen.disponible)} {unidad}</strong> disponibles
                        </p>
                    }
                />
            )}
        </Layout>
    );
}
