import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import api, { asList } from '../lib/api';
import { DOC_LABEL, ORIGEN_LABEL } from '../lib/movimientos';
import Layout from '../components/Layout';
import PageHeader from '../components/PageHeader';
import { Alert, Badge, Button, DataTable, Modal, Spinner } from '../components/ui';

const num = (n) =>
    (Math.abs(Number(n ?? 0)) < 0.005 ? 0 : Number(n)).toLocaleString('es-PE', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
const precio = (n) => Number(n ?? 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
const entero = (n) => Number(n ?? 0).toLocaleString('es-PE');

const fmtFecha = (value) =>
    value
        ? new Date(value).toLocaleString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
        : '—';

const ESTADO_ROLLO = {
    disponible: { label: 'Disponible', variant: 'green' },
    separado: { label: 'Separado', variant: 'amber' },
    en_preparacion: { label: 'En preparación', variant: 'amber' },
    en_transito: { label: 'En tránsito', variant: 'blue' },
    en_revision: { label: 'En revisión', variant: 'amber' },
    despachado: { label: 'Despachado', variant: 'gray' },
    vendido: { label: 'Vendido', variant: 'gray' },
    agotado: { label: 'Agotado', variant: 'gray' },
};

const vacio = <span className="text-gray-300">—</span>;

/**
 * Un documento del kardex visto completo: arriba su ficha, abajo su detalle (los productos y colores que movió).
 * Tocar una línea muestra los rollos que entraron o salieron en ella.
 */
export default function KardexDocumento() {
    const { tipo, id } = useParams();
    const navigate = useNavigate();
    const location = useLocation();

    const [datos, setDatos] = useState(null);
    const [error, setError] = useState(null);

    /** La línea abierta y sus rollos. */
    const [linea, setLinea] = useState(null);
    const [rollos, setRollos] = useState(null);

    useEffect(() => {
        let vivo = true;
        setDatos(null);
        setError(null);
        api.get(`/movimientos/documento/${tipo}/${id}`)
            .then((res) => vivo && setDatos(res.data ?? res))
            .catch((err) => vivo && setError(err.response?.data?.message ?? 'No se pudo cargar el documento.'));
        return () => {
            vivo = false;
        };
    }, [tipo, id]);

    const volver = () => (location.key === 'default' ? navigate('/kardex') : navigate(-1));

    const abrirLinea = (l) => {
        setLinea(l);
        setRollos(null);
        api.get(`/movimientos/${l.movimiento_id}/rollos`, { params: { solo_color: 1 } })
            .then((res) => setRollos(asList(res)))
            .catch(() => setRollos([]));
    };

    const cab = datos?.cabecera;
    const lineas = datos?.lineas ?? [];

    const totales = useMemo(
        () => ({
            rollos: lineas.reduce((s, l) => s + (Number(l.rollos) || 0), 0),
            total: lineas.reduce((s, l) => s + (Number(l.total) || 0), 0),
        }),
        [lineas],
    );

    const columnas = [
        { key: 'n', label: '#', width: '50px', searchable: false, render: (row) => <span className="text-gray-400">{row._i + 1}</span> },
        {
            key: 'codigo',
            label: 'Código',
            width: '120px',
            getSearchValue: (row) => [row.producto_codigo, row.color?.codigo].filter(Boolean).join('-'),
            render: (row) => <span className="whitespace-nowrap text-gray-700">{[row.producto_codigo, row.color?.codigo].filter(Boolean).join('-') || '—'}</span>,
        },
        {
            key: 'producto',
            label: 'Producto',
            getSearchValue: (row) => `${row.producto} ${row.color?.nombre ?? ''}`,
            render: (row) => <span className="font-medium text-gray-900">{row.producto}</span>,
        },
        {
            key: 'color',
            label: 'Color',
            width: '170px',
            getSearchValue: (row) => row.color?.nombre,
            render: (row) =>
                row.color ? (
                    <span className="inline-flex items-center gap-1.5 text-warm-800">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/10" style={{ backgroundColor: row.color.hex || '#9ca3af' }} />
                        <span className="truncate uppercase">{row.color.nombre}</span>
                    </span>
                ) : (
                    <span className="text-gray-400">Sin color</span>
                ),
        },
        { key: 'almacen', label: 'Almacén', width: '150px', getSearchValue: (row) => row.almacen, render: (row) => row.almacen ?? vacio },
        {
            key: 'tipo_movimiento',
            label: 'Movimiento',
            width: '110px',
            searchable: false,
            render: (row) => (
                <Badge variant={row.tipo_movimiento === 'entrada' ? 'green' : 'red'}>{row.tipo_movimiento === 'entrada' ? 'Entra' : 'Sale'}</Badge>
            ),
        },
        {
            key: 'rollos',
            label: 'Rollos',
            width: '80px',
            align: 'right',
            searchable: false,
            render: (row) => (Number(row.rollos) > 0 ? <span className="font-medium text-primary-700 underline decoration-dotted underline-offset-2">{entero(row.rollos)}</span> : vacio),
        },
        {
            key: 'cantidad',
            label: 'Cantidad',
            width: '130px',
            align: 'right',
            searchable: false,
            render: (row) => (
                <span className="whitespace-nowrap font-semibold text-gray-900">
                    {num(row.cantidad)} <span className="text-[11px] font-normal text-gray-400">{row.unidad}</span>
                </span>
            ),
        },
        { key: 'costo', label: 'Precio', width: '100px', align: 'right', searchable: false, render: (row) => <span className="text-gray-600">{precio(row.costo_unitario)}</span> },
        { key: 'total', label: 'Total', width: '120px', align: 'right', searchable: false, render: (row) => <span className="font-medium text-gray-900">{num(row.total)}</span> },
    ];

    const rollosPorColor = useMemo(() => {
        const grupos = new Map();
        (rollos ?? []).forEach((r) => {
            const clave = String(r.color?.id ?? 'sin');
            if (!grupos.has(clave)) grupos.set(clave, { color: r.color, rollos: [], metros: 0 });
            const g = grupos.get(clave);
            g.rollos.push(r);
            g.metros += Number(r.metros) || 0;
        });
        return [...grupos.values()];
    }, [rollos]);

    /** Un dato de la ficha: rótulo chico arriba y el valor abajo. */
    const Dato = ({ rotulo, children }) => (
        <div className="min-w-0">
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-warm-500">{rotulo}</dt>
            <dd className="mt-0.5 truncate text-sm text-warm-900" title={typeof children === 'string' ? children : undefined}>
                {children || vacio}
            </dd>
        </div>
    );

    return (
        <Layout>
            <PageHeader
                title={cab ? `${DOC_LABEL[cab.tipo] ?? 'Documento'} ${cab.documento ?? ''}` : 'Documento'}
                description="La ficha del documento y el detalle de lo que movió"
                actions={
                    <Button variant="secondary" onClick={volver}>
                        <ArrowLeft className="h-4 w-4" /> Volver al kardex
                    </Button>
                }
            />

            {error && <Alert variant="error" className="mb-4">{error}</Alert>}

            {!datos && !error && (
                <div className="flex items-center justify-center py-20">
                    <Spinner size="lg" className="text-primary-600" />
                </div>
            )}

            {cab && (
                <div className="space-y-6">
                    {/* La ficha del documento. */}
                    <section>
                        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-warm-600">Documento</h2>
                        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 rounded-xl border border-edge bg-white p-5 md:grid-cols-3 xl:grid-cols-5">
                            <Dato rotulo="Documento">{cab.documento}</Dato>
                            <Dato rotulo="Tipo">{DOC_LABEL[cab.tipo] ?? cab.tipo}</Dato>
                            <Dato rotulo="Fecha">{fmtFecha(cab.fecha)}</Dato>
                            <Dato rotulo="Nombre">{cab.nombre}</Dato>
                            <Dato rotulo="Almacén">{(cab.almacenes ?? []).join(' · ')}</Dato>
                            <Dato rotulo="Movimiento">{ORIGEN_LABEL[cab.origen] ?? cab.origen}</Dato>
                            <Dato rotulo="Glosa">{cab.glosa}</Dato>
                            <Dato rotulo="Referencia">{cab.referencia}</Dato>
                            <Dato rotulo="O.Compra">{cab.orden_compra}</Dato>
                            <Dato rotulo="Doc. Registro">{cab.doc_registro}</Dato>
                            <Dato rotulo="Registrado por">{cab.usuario}</Dato>
                        </dl>
                    </section>

                    {/* El detalle: los productos (con su color) que movió. */}
                    <section>
                        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                            <h2 className="text-sm font-semibold uppercase tracking-wide text-warm-600">Detalle del documento</h2>
                            <p className="text-sm text-warm-600">
                                {lineas.length} línea{lineas.length === 1 ? '' : 's'} · <strong className="text-warm-900">{entero(totales.rollos)}</strong> rollos ·
                                Total <strong className="text-warm-900">{num(totales.total)}</strong>
                            </p>
                        </div>
                        <DataTable
                            columns={columnas}
                            rows={lineas.map((l, i) => ({ ...l, _i: i }))}
                            keyField="_i"
                            searchPlaceholder="Buscar en el detalle..."
                            emptyMessage="Este documento no tiene líneas."
                            onRowClick={(l) => Number(l.rollos) > 0 && abrirLinea(l)}
                        />
                    </section>
                </div>
            )}

            {/* Los rollos de una línea del detalle, por color y con su metraje. */}
            <Modal
                open={Boolean(linea)}
                onClose={() => setLinea(null)}
                title={linea ? `${linea.producto}${linea.color ? ` · ${linea.color.nombre}` : ''}` : ''}
                description={linea ? `${cab?.documento ?? ''} · ${linea.almacen ?? ''} · ${linea.tipo_movimiento === 'entrada' ? 'Entran' : 'Salen'} ${num(linea.cantidad)} ${linea.unidad ?? ''}` : ''}
                size="2xl"
                footer={<Button variant="secondary" onClick={() => setLinea(null)}>Cerrar</Button>}
            >
                {rollos === null ? (
                    <div className="flex items-center justify-center py-12">
                        <Spinner size="lg" className="text-primary-600" />
                    </div>
                ) : rollos.length === 0 ? (
                    <p className="py-10 text-center text-sm text-warm-500">Esta línea no tiene rollos registrados.</p>
                ) : (
                    <div className="space-y-4">
                        {rollosPorColor.map((g) => (
                            <div key={g.color?.id ?? 'sin'} className="overflow-hidden rounded-lg border border-edge">
                                <div className="flex items-center gap-2 bg-gray-50 px-3 py-2">
                                    <span className="h-3 w-3 shrink-0 rounded-full ring-1 ring-black/10" style={{ backgroundColor: g.color?.hex || '#9ca3af' }} />
                                    <span className="text-sm font-semibold uppercase text-warm-900">{g.color?.nombre ?? 'Sin color'}</span>
                                    <span className="ml-auto text-xs text-warm-600">
                                        {entero(g.rollos.length)} rollo{g.rollos.length === 1 ? '' : 's'} · <strong className="text-warm-900">{num(g.metros)} {linea?.unidad}</strong>
                                    </span>
                                </div>
                                <div className="max-h-64 overflow-auto">
                                    <table className="w-full text-sm">
                                        <thead className="sticky top-0 bg-white text-left text-[11px] font-semibold uppercase tracking-wide text-warm-500">
                                            <tr>
                                                <th className="px-3 py-1.5">Rollo</th>
                                                <th className="px-3 py-1.5 text-right">Metraje</th>
                                                <th className="px-3 py-1.5 text-right">Hoy tiene</th>
                                                <th className="px-3 py-1.5">Estado</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {g.rollos.map((r) => {
                                                const estado = ESTADO_ROLLO[r.estado] ?? { label: r.estado, variant: 'gray' };
                                                return (
                                                    <tr key={r.id}>
                                                        <td className="px-3 py-1.5 font-mono text-xs text-warm-800">{r.codigo}</td>
                                                        <td className="px-3 py-1.5 text-right font-medium text-warm-900">{num(r.metros)} {linea?.unidad}</td>
                                                        <td className="px-3 py-1.5 text-right text-warm-600">{num(r.metros_actual)} {linea?.unidad}</td>
                                                        <td className="px-3 py-1.5"><Badge variant={estado.variant}>{estado.label}</Badge></td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </Modal>
        </Layout>
    );
}
