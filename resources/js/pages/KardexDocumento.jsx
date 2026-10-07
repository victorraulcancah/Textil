import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import api, { asList } from '../lib/api';
import { DOC_LABEL } from '../lib/movimientos';
import { entero, fmtFecha, num, precio, simboloMoneda, texto, vacio } from '../lib/kardex';
import Layout from '../components/Layout';
import PageHeader from '../components/PageHeader';
import { Alert, Badge, Button, DataTable, Modal, Spinner } from '../components/ui';

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

/** El estado de un documento, con su nombre de pantalla. */
const ESTADO_DOC = {
    completa: 'Completa',
    deshecha: 'Deshecha',
    emitida: 'Emitida',
    borrador: 'Borrador',
    solicitado: 'Solicitado',
    preparando: 'Preparando',
    separado: 'Separado',
    despachado: 'Despachado',
    facturado: 'Facturado',
    anulado: 'Anulado',
    solicitada: 'Solicitada',
    recibida: 'Recibida',
    aprobado: 'Aprobado',
};

/**
 * Un documento del kardex visto completo, como una nota: arriba el documento en una tabla y abajo, en otra, su detalle
 * (los productos y colores que movió). Tocar una línea muestra los rollos que entraron o salieron en ella.
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
    const lineas = useMemo(() => (datos?.lineas ?? []).map((l, i) => ({ ...l, _i: i })), [datos]);
    const nombreTipo = DOC_LABEL[tipo] ?? 'Documento';

    const totalRollos = lineas.reduce((s, l) => s + (Number(l.rollos) || 0), 0);

    // ───────────── La tabla del documento (una sola fila)
    const columnasDocumento = [
        { key: 'documento', label: 'Número', width: '130px', render: (r) => <span className="whitespace-nowrap font-semibold text-primary-700">{r.documento ?? '—'}</span> },
        {
            key: 'fecha',
            label: 'Fecha',
            width: '150px',
            render: (r) => {
                const f = fmtFecha(r.fecha);
                return f ? <span className="whitespace-nowrap text-gray-700">{f.dia} <span className="text-xs text-gray-400">{f.hora}</span></span> : vacio;
            },
        },
        { key: 'nombre', label: 'Nombre', width: '260px', render: (r) => texto(r.nombre, '260px') },
        { key: 'almacen', label: 'Almacén', width: '170px', render: (r) => texto((r.almacenes ?? []).join(' · '), '170px') },
        { key: 'moneda', label: 'M', width: '60px', render: (r) => <span className="text-gray-700">{simboloMoneda(r.moneda)}</span> },
        { key: 'tipo_cambio', label: 'T/C', width: '80px', align: 'right', render: (r) => (r.tipo_cambio ? <span className="text-gray-700">{Number(r.tipo_cambio).toFixed(4)}</span> : vacio) },
        { key: 'total', label: 'Total', width: '120px', align: 'right', render: (r) => <span className="font-semibold text-gray-900">{num(r.total)}</span> },
        {
            key: 'estado',
            label: 'St.',
            width: '110px',
            render: (r) => (r.estado ? <Badge variant={['deshecha', 'anulado'].includes(r.estado) ? 'red' : 'gray'}>{ESTADO_DOC[r.estado] ?? r.estado}</Badge> : vacio),
        },
        { key: 'glosa', label: 'Glosa', width: '200px', render: (r) => texto(r.glosa, '200px') },
        { key: 'referencia', label: 'Doc. Referencia', width: '140px', render: (r) => texto(r.referencia, '140px') },
        { key: 'orden_compra', label: 'O.Compra', width: '110px', render: (r) => texto(r.orden_compra, '110px') },
        { key: 'doc_registro', label: 'Doc. Registro', width: '120px', render: (r) => texto(r.doc_registro, '120px') },
    ];

    // ───────────── El detalle: los productos del documento
    const columnasDetalle = [
        {
            key: 'codigo',
            label: 'Código',
            width: '120px',
            getSearchValue: (row) => [row.producto_codigo, row.color?.codigo].filter(Boolean).join('-'),
            render: (row) => <span className="whitespace-nowrap text-gray-700">{[row.producto_codigo, row.color?.codigo].filter(Boolean).join('-') || '—'}</span>,
        },
        { key: 'marca', label: 'Marca', width: '120px', getSearchValue: (row) => row.marca, render: (row) => texto(row.marca, '120px') },
        {
            key: 'descripcion',
            label: 'Descripción',
            width: '340px',
            getSearchValue: (row) => `${row.producto} ${row.color?.nombre ?? ''}`,
            render: (row) => (
                <span className="inline-flex min-w-0 items-center gap-2">
                    {row.color && (
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/10" style={{ backgroundColor: row.color.hex || '#9ca3af' }} />
                    )}
                    <span className="truncate font-medium uppercase text-gray-900">
                        {row.producto}
                        {row.color ? ` - ${row.color.nombre}` : ''}
                    </span>
                </span>
            ),
        },
        {
            key: 'rollos',
            label: 'Rollos',
            width: '80px',
            align: 'right',
            searchable: false,
            render: (row) =>
                Number(row.rollos) > 0 ? (
                    <span className="font-medium text-primary-700 underline decoration-dotted underline-offset-2">{entero(row.rollos)}</span>
                ) : (
                    vacio
                ),
        },
        { key: 'cantidad', label: 'Cantidad', width: '120px', align: 'right', searchable: false, render: (row) => <span className="font-semibold text-gray-900">{num(row.cantidad)}</span> },
        { key: 'um', label: 'UM', width: '60px', searchable: false, render: (row) => <span className="uppercase text-gray-500">{row.unidad}</span> },
        { key: 'precio', label: 'Precio', width: '100px', align: 'right', searchable: false, render: (row) => <span className="text-gray-700">{precio(row.costo_unitario)}</span> },
        { key: 'total', label: 'Total', width: '120px', align: 'right', searchable: false, render: (row) => <span className="font-medium text-gray-900">{num(row.total)}</span> },
        { key: 'descuento', label: 'Dscto', width: '90px', align: 'right', searchable: false, render: (row) => <span className="text-gray-500">{num(row.descuento)}</span> },
        { key: 'almacen', label: 'Almacén', width: '150px', getSearchValue: (row) => row.almacen, render: (row) => texto(row.almacen, '150px') },
        {
            key: 'tipo_movimiento',
            label: 'Mov.',
            width: '90px',
            searchable: false,
            render: (row) => <Badge variant={row.tipo_movimiento === 'entrada' ? 'green' : 'red'}>{row.tipo_movimiento === 'entrada' ? 'Entra' : 'Sale'}</Badge>,
        },
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

    return (
        <Layout>
            <PageHeader
                title={cab ? `${nombreTipo} ${cab.documento ?? ''}` : 'Documento'}
                description="El documento arriba y, abajo, el detalle de lo que movió"
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
                <div className="space-y-5">
                    {/* El documento: una fila con sus datos. */}
                    <DataTable
                        columns={columnasDocumento}
                        rows={[{ ...cab, id: 'documento' }]}
                        searchable={false}
                        toggleableColumns={false}
                        dense
                    />

                    {/* Su detalle: los productos. */}
                    <div>
                        <div className="rounded-t-lg border border-b-0 border-edge bg-gray-100 px-4 py-2 text-center text-sm font-semibold text-warm-800">
                            Detalle de la {nombreTipo.toLowerCase()}: {cab.documento}
                            <span className="ml-3 font-normal text-warm-500">
                                {lineas.length} línea{lineas.length === 1 ? '' : 's'} · {entero(totalRollos)} rollos
                            </span>
                        </div>
                        <DataTable
                            columns={columnasDetalle}
                            rows={lineas}
                            keyField="_i"
                            searchable={false}
                            toggleableColumns={false}
                            dense
                            emptyMessage="Este documento no tiene líneas."
                            onRowClick={(l) => Number(l.rollos) > 0 && abrirLinea(l)}
                        />
                    </div>
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
