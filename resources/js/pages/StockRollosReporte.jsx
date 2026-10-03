import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, FileText, RotateCcw } from 'lucide-react';
import api from '../lib/api';
import { useToast } from '../lib/toast';
import Layout from '../components/Layout';
import PageHeader from '../components/PageHeader';
import PdfViewerModal from '../components/PdfViewerModal';
import { Alert, Button, Input, SearchSelect, Select, Spinner } from '../components/ui';

const num = (n) => new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 }).format(Number(n) || 0);
const money = (n) => new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(Number(n) || 0);

const VACIO = { tipo_tela_id: '', producto_id: '', color_id: '', almacen_id: '', proveedor_id: '', estado: 'en_stock', metros_desde: '', metros_hasta: '', agrupar: 'color' };

/** Cómo se pinta cada tipo de columna del reporte. */
const celda = (col, v) => {
    if (v === '' || v === null || v === undefined) return '';
    if (col.tipo === 'entero') return num(v);
    if (col.tipo === 'metros') return num(v);
    if (col.tipo === 'dinero') return money(v);
    return v;
};

/**
 * Reporte dinámico del stock de rollos: se eligen los filtros y el nivel de detalle, se ve en
 * pantalla y se baja en Excel o PDF (los tres traen las mismas filas).
 */
export default function StockRollosReporte() {
    const toast = useToast();
    const navigate = useNavigate();
    const [opciones, setOpciones] = useState(null);
    const [filtros, setFiltros] = useState(VACIO);
    const [reporte, setReporte] = useState(null);
    const [cargando, setCargando] = useState(false);
    const [error, setError] = useState(null);
    const [pdf, setPdf] = useState(null);

    const poner = (campo) => (valor) => setFiltros((f) => ({ ...f, [campo]: valor ?? '' }));

    /** Los filtros con valor, como parámetros de la API (sirven igual para pantalla, Excel y PDF). */
    const parametros = useMemo(
        () => Object.fromEntries(Object.entries(filtros).filter(([, v]) => v !== '' && v !== null)),
        [filtros],
    );

    const generar = useCallback(async () => {
        setCargando(true);
        setError(null);
        try {
            const { data } = await api.get('/rollos/reporte', { params: parametros });
            setReporte(data);
        } catch {
            setError('No se pudo generar el reporte.');
        } finally {
            setCargando(false);
        }
    }, [parametros]);

    useEffect(() => {
        api.get('/rollos/reporte/opciones')
            .then(({ data }) => setOpciones(data))
            .catch(() => setError('No se pudieron cargar las opciones del reporte.'));
    }, []);

    // Se recalcula solo al cambiar un filtro: lo que se ve es siempre lo que se exporta.
    useEffect(() => {
        const t = setTimeout(generar, 250);
        return () => clearTimeout(t);
    }, [generar]);

    const descargarExcel = async () => {
        try {
            const { data } = await api.get('/rollos/reporte/excel', { params: parametros, responseType: 'blob' });
            const url = URL.createObjectURL(data);
            const a = document.createElement('a');
            a.href = url;
            a.download = `stock-rollos-${new Date().toISOString().slice(0, 10)}.xlsx`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 4000);
        } catch {
            toast.error('No se pudo generar el Excel.');
        }
    };

    const verPdf = () => {
        const query = new URLSearchParams(parametros).toString();
        setPdf({ url: `/rollos/reporte/pdf?${query}`, titulo: 'Stock de rollos' });
    };

    const telas = (opciones?.telas ?? []).filter((t) => !filtros.tipo_tela_id || String(t.tipo_tela_id) === String(filtros.tipo_tela_id));
    // Cada lista empieza con "Todos": es la forma de quitar el filtro una vez elegido.
    const lista = (items, todos = 'Todos', etiqueta = (i) => i.nombre) => [
        { value: '', label: todos },
        ...(items ?? []).map((i) => ({ value: String(i.id), label: etiqueta(i) })),
    ];

    return (
        <Layout>
            <PageHeader
                title="Reporte de stock de rollos"
                description="Elige los filtros y cómo agrupar; sale en pantalla, Excel y PDF"
                actions={
                    <div className="flex flex-wrap items-center gap-2">
                        <Button variant="secondary" onClick={() => navigate('/stock-rollos')}>
                            <ArrowLeft className="h-4 w-4" />
                            Stock
                        </Button>
                        <Button variant="secondary" onClick={verPdf} disabled={!reporte?.filas?.length}>
                            <FileText className="h-4 w-4" />
                            PDF
                        </Button>
                        <Button onClick={descargarExcel} disabled={!reporte?.filas?.length}>
                            <Download className="h-4 w-4" />
                            Excel
                        </Button>
                    </div>
                }
            />

            {error && <Alert variant="error" className="mb-4">{error}</Alert>}

            <div className="mb-4 rounded-xl border border-edge bg-white p-4 shadow-sm">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <SearchSelect
                        label="Tipo de tela"
                        value={filtros.tipo_tela_id}
                        onChange={(v) => setFiltros((f) => ({ ...f, tipo_tela_id: v ?? '', producto_id: '' }))}
                        placeholder="Todos"
                        emptyText="Sin coincidencias"
                        options={lista(opciones?.tipos)}
                    />
                    <SearchSelect
                        label="Tela"
                        value={filtros.producto_id}
                        onChange={poner('producto_id')}
                        placeholder="Todas"
                        emptyText="Sin coincidencias"
                        options={lista(telas, 'Todas', (t) => `${t.nombre} (${t.codigo})`)}
                    />
                    <SearchSelect
                        label="Color"
                        value={filtros.color_id}
                        onChange={poner('color_id')}
                        placeholder="Todos"
                        emptyText="Sin coincidencias"
                        options={lista(opciones?.colores)}
                    />
                    <SearchSelect
                        label="Almacén"
                        value={filtros.almacen_id}
                        onChange={poner('almacen_id')}
                        placeholder="Todos"
                        emptyText="Sin coincidencias"
                        options={lista(opciones?.almacenes)}
                    />
                    <SearchSelect
                        label="Proveedor"
                        value={filtros.proveedor_id}
                        onChange={poner('proveedor_id')}
                        placeholder="Todos"
                        emptyText="Sin coincidencias"
                        options={lista(opciones?.proveedores)}
                    />
                    <Select
                        label="Estado del rollo"
                        value={filtros.estado}
                        onChange={(e) => poner('estado')(e.target.value)}
                        options={[
                            { value: 'en_stock', label: 'En stock (disponible, separado, en preparación)' },
                            ...(opciones?.estados ?? []).map((e) => ({ value: e.value, label: e.label })),
                            { value: 'todos', label: 'Todos (incluye despachados y agotados)' },
                        ]}
                    />
                    <Input label="Metros desde" type="number" min="0" value={filtros.metros_desde} onChange={(e) => poner('metros_desde')(e.target.value)} placeholder="50" />
                    <Input label="Metros hasta" type="number" min="0" value={filtros.metros_hasta} onChange={(e) => poner('metros_hasta')(e.target.value)} placeholder="70" />
                </div>

                <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-edge pt-3">
                    <Select
                        label="Agrupar por"
                        value={filtros.agrupar}
                        onChange={(e) => poner('agrupar')(e.target.value)}
                        options={(opciones?.agrupaciones ?? [{ value: 'color', label: 'Por tela y color' }])}
                        className="w-60"
                    />
                    <Button variant="ghost" onClick={() => setFiltros(VACIO)}>
                        <RotateCcw className="h-4 w-4" />
                        Limpiar
                    </Button>
                    {reporte && (
                        <span className="ml-auto text-sm text-warm-600">
                            <strong className="text-warm-900">{num(reporte.totales.rollos)}</strong> rollos ·{' '}
                            <strong className="text-warm-900">{num(reporte.totales.metros)} m</strong> ·{' '}
                            <strong className="text-primary-600">{money(reporte.totales.valor)}</strong>
                        </span>
                    )}
                </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-edge bg-white shadow-sm">
                {cargando && !reporte ? (
                    <div className="flex justify-center py-16">
                        <Spinner className="text-primary-600" />
                    </div>
                ) : (
                    <table className={`w-full text-sm ${cargando ? 'opacity-60' : ''}`}>
                        <thead>
                            <tr className="bg-primary-600 text-xs font-semibold uppercase tracking-wide text-white">
                                {(reporte?.columnas ?? []).map((c) => (
                                    <th key={c.key} className={`px-3 py-2.5 ${c.align === 'right' ? 'text-right' : 'text-left'}`}>{c.label}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {(reporte?.filas ?? []).map((f, i) => (
                                <tr key={i} className="hover:bg-gray-50">
                                    {reporte.columnas.map((c) => (
                                        <td key={c.key} className={`whitespace-nowrap px-3 py-2 ${c.align === 'right' ? 'text-right' : ''}`}>{celda(c, f[c.key])}</td>
                                    ))}
                                </tr>
                            ))}
                            {reporte && reporte.filas.length === 0 && (
                                <tr>
                                    <td colSpan={reporte.columnas.length} className="px-3 py-12 text-center text-warm-500">
                                        No hay rollos con esos filtros.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                )}
            </div>

            <PdfViewerModal open={Boolean(pdf)} onClose={() => setPdf(null)} url={pdf?.url} titulo={pdf?.titulo} nombre={pdf?.titulo} />
        </Layout>
    );
}
