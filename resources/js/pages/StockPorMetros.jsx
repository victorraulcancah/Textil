import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Camera, Package, Scissors } from 'lucide-react';
import api, { asList } from '../lib/api';
import { useToast } from '../lib/toast';
import { useAlmacenPropio } from '../lib/almacenes';
import EscanerCamara from '../components/EscanerCamara';
import Layout from '../components/Layout';
import PageHeader from '../components/PageHeader';
import PestanasStock from '../components/PestanasStock';
import { Alert, Badge, Button, DataTable, Input, SearchSelect } from '../components/ui';

const num = (n) => new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 }).format(Number(n) || 0);

const fechaHora = (v) => (v ? new Date(v).toLocaleString('es-PE') : '—');

/** El mensaje que devolvió el servidor, o uno por defecto. */
const mensajeDe = (e, defecto) => {
    const errores = e.response?.data?.errors;
    return (errores ? Object.values(errores)[0]?.[0] : null) || e.response?.data?.message || defecto;
};

/**
 * Stock por metros: la tela suelta que se vende por corte, sin escanear el QR de un rollo.
 *
 * Aquí se ve cuántos metros sueltos hay de cada tela y color en cada almacén, y se pasan metros de un rollo (por su QR o
 * código) al saldo suelto. La conversión es en el mismo almacén del rollo: el stock total no cambia, solo la forma. Los
 * pedidos con líneas "sin QR" salen de este saldo, y el almacenero solo las marca como preparadas.
 */
export default function StockPorMetros() {
    const toast = useToast();
    const [params, setParams] = useSearchParams();
    const { propioId } = useAlmacenPropio();

    const [saldos, setSaldos] = useState([]);
    const [historial, setHistorial] = useState([]);
    const [almacenes, setAlmacenes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [almacenSel, setAlmacenSel] = useState(propioId ? String(propioId) : 'todos');
    const almacenId = almacenSel === 'todos' ? '' : almacenSel;

    // El formulario de conversión; el código puede venir de "Stock por rollo" (?rollo=...).
    const [codigo, setCodigo] = useState(params.get('rollo') ?? '');
    const [metros, setMetros] = useState('');
    const [observaciones, setObservaciones] = useState('');
    const [convirtiendo, setConvirtiendo] = useState(false);
    /** El rollo que corresponde al código escrito, para ver su tela, color y cuánto mide antes de convertir. */
    const [rollo, setRollo] = useState(null);
    const campoCodigo = useRef(null);
    /** El visor de la cámara abierto: lee el QR de la etiqueta del rollo en vez de la pistola. */
    const [camara, setCamara] = useState(false);

    /** La cámara leyó una etiqueta: el código pasa al campo y el visor se cierra (es un solo rollo por conversión). */
    const alLeerCamara = useCallback(async (leido) => {
        setCodigo(String(leido).trim());
        setCamara(false);

        return { ok: true, texto: 'Código leído' };
    }, []);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [res, almacenesRes] = await Promise.all([
                api.get('/stock-metros', { params: almacenId ? { almacen_id: almacenId } : {} }),
                api.get('/almacenes'),
            ]);
            setSaldos(res.data?.saldos ?? []);
            setHistorial(res.data?.historial ?? []);
            setAlmacenes(asList(almacenesRes));
        } catch {
            setError('No se pudo cargar el stock por metros.');
        } finally {
            setLoading(false);
        }
    }, [almacenId]);

    useEffect(() => {
        load();
    }, [load]);

    // Al llegar con un rollo en la dirección (desde Stock por rollo), se usa una sola vez.
    useEffect(() => {
        if (params.has('rollo')) {
            const siguiente = new URLSearchParams(params);
            siguiente.delete('rollo');
            setParams(siguiente, { replace: true });
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Busca el rollo del código escrito (con una pausa, para no consultar en cada tecla).
    useEffect(() => {
        const texto = codigo.trim();
        if (texto.length < 4) {
            setRollo(null);
            return undefined;
        }

        let vigente = true;
        const t = setTimeout(async () => {
            try {
                const { data } = await api.get('/rollos', { params: { buscar: texto } });
                const filas = asList({ data });
                const exacto = filas.find((r) => String(r.codigo).toLowerCase() === texto.toLowerCase());
                if (vigente) setRollo(exacto ?? null);
            } catch {
                if (vigente) setRollo(null);
            }
        }, 350);

        return () => {
            vigente = false;
            clearTimeout(t);
        };
    }, [codigo]);

    const convertir = async (e) => {
        e?.preventDefault();
        if (!codigo.trim()) {
            toast.error('Escanea o escribe el código del rollo.');
            return;
        }

        setConvirtiendo(true);
        try {
            const { data } = await api.post('/stock-metros/convertir', {
                codigo: codigo.trim(),
                metros: metros ? Number(metros) : null,
                observaciones: observaciones.trim() || null,
            });
            toast.success(data?.message ?? 'Metros convertidos.');
            setCodigo('');
            setMetros('');
            setObservaciones('');
            setRollo(null);
            campoCodigo.current?.focus();
            await load();
        } catch (err) {
            toast.error(mensajeDe(err, 'No se pudo convertir el rollo.'));
        } finally {
            setConvirtiendo(false);
        }
    };

    const totalMetros = useMemo(() => saldos.reduce((t, s) => t + Number(s.metros || 0), 0), [saldos]);
    const totalDisponible = useMemo(() => saldos.reduce((t, s) => t + Number(s.disponible || 0), 0), [saldos]);

    const columnasSaldos = [
        {
            key: 'producto',
            label: 'Tela',
            render: (row) => (
                <span className="inline-flex items-center gap-2 font-medium text-warm-900">
                    <Package className="h-4 w-4 shrink-0 text-primary-600" />
                    <span className="truncate">{row.producto}</span>
                </span>
            ),
        },
        {
            key: 'color',
            label: 'Color',
            render: (row) => (
                <span className="inline-flex items-center gap-2">
                    <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-edge" style={{ background: row.color_hex || '#e5e7eb' }} />
                    {row.color ?? '—'}
                </span>
            ),
        },
        { key: 'almacen', label: 'Almacén', render: (row) => row.almacen },
        { key: 'metros', label: 'Metros sueltos', align: 'right', searchable: false, render: (row) => <span className="font-medium">{num(row.metros)} m</span> },
        {
            key: 'reservado',
            label: 'Apartados',
            align: 'right',
            searchable: false,
            render: (row) => (Number(row.reservado) > 0 ? <span className="text-amber-600">{num(row.reservado)} m</span> : <span className="text-warm-400">—</span>),
        },
        {
            key: 'disponible',
            label: 'Disponibles',
            align: 'right',
            searchable: false,
            render: (row) => <span className="font-semibold text-warm-900">{num(row.disponible)} m</span>,
        },
    ];

    const columnasHistorial = [
        { key: 'fecha', label: 'Fecha', searchable: false, render: (row) => fechaHora(row.fecha) },
        { key: 'rollo', label: 'Rollo', render: (row) => <span className="font-mono text-xs font-semibold">{row.rollo}</span> },
        { key: 'producto', label: 'Tela y color', render: (row) => `${row.producto ?? ''}${row.color ? ` · ${row.color}` : ''}` },
        { key: 'almacen', label: 'Almacén', render: (row) => row.almacen },
        { key: 'metros', label: 'Pasaron', align: 'right', searchable: false, render: (row) => <span className="font-medium">{num(row.metros)} m</span> },
        {
            key: 'despues',
            label: 'Quedó en el rollo',
            align: 'right',
            searchable: false,
            render: (row) => (Number(row.metros_rollo_despues) > 0 ? `${num(row.metros_rollo_despues)} m` : <Badge variant="gray">Agotado</Badge>),
        },
        { key: 'usuario', label: 'Por', render: (row) => row.usuario ?? '—' },
    ];

    return (
        <Layout>
            <PageHeader
                title="Stock por metros"
                description="Tela suelta para vender por corte, sin escanear el QR: se llena pasando metros de un rollo"
            />

            <PestanasStock activa="metros" />

            {error && <Alert variant="error" className="mb-4">{error}</Alert>}

            {/* Convertir un rollo (o parte de él) a metros: en el mismo almacén del rollo. */}
            <form onSubmit={convertir} className="mb-6 rounded-lg border border-edge bg-white p-4 shadow-sm">
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-warm-900">
                    <Scissors className="h-4 w-4 text-primary-600" />
                    Convertir un rollo a metros
                </h2>
                <div className="flex flex-wrap items-end gap-3">
                    <div className="flex items-end gap-2">
                        <div className="w-64">
                            <Input
                                ref={campoCodigo}
                                label="Código o QR del rollo"
                                value={codigo}
                                onChange={(e) => setCodigo(e.target.value)}
                                placeholder="Escanea o escribe el código"
                                autoComplete="off"
                                autoFocus
                            />
                        </div>
                        {/* La misma lectura con la cámara del celular, como en Preparación y despacho. */}
                        <Button type="button" variant="secondary" onClick={() => setCamara(true)} title="Escanear con la cámara" aria-label="Escanear con la cámara">
                            <Camera className="h-4 w-4" />
                        </Button>
                    </div>
                    <div className="w-44">
                        <Input
                            label="Metros a pasar"
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={metros}
                            onChange={(e) => setMetros(e.target.value)}
                            placeholder={rollo ? `Todo (${num(rollo.metros_actual)} m)` : 'Todo el rollo'}
                        />
                    </div>
                    <div className="min-w-56 flex-1">
                        <Input label="Observación (opcional)" value={observaciones} onChange={(e) => setObservaciones(e.target.value)} autoComplete="off" />
                    </div>
                    <Button type="submit" loading={convirtiendo} disabled={!codigo.trim()}>
                        <Scissors className="h-4 w-4" />
                        Convertir
                    </Button>
                </div>

                {codigo.trim().length >= 4 && (
                    <p className="mt-3 text-sm text-warm-600">
                        {rollo ? (
                            <>
                                <span className="font-medium text-warm-900">{rollo.producto?.nombre ?? rollo.producto}</span>
                                {rollo.color?.nombre ? ` · ${rollo.color.nombre}` : ''} · {num(rollo.metros_actual)} m ·{' '}
                                {rollo.almacen?.nombre ?? rollo.almacen ?? ''} · {rollo.estado}
                                {rollo.estado !== 'disponible' && <span className="ml-2 text-red-600">(no se puede convertir)</span>}
                            </>
                        ) : (
                            <span className="text-warm-400">Sin rollo con ese código todavía…</span>
                        )}
                    </p>
                )}
                <p className="mt-2 text-xs text-warm-400">
                    Los metros pasan al stock por metros del mismo almacén del rollo, que se queda con lo que sobra. El stock total no cambia.
                </p>
            </form>

            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                <SearchSelect
                    label="Almacén"
                    value={almacenSel}
                    onChange={(v) => setAlmacenSel(v || 'todos')}
                    clearable={false}
                    placeholder="Todos los almacenes"
                    emptyText="Sin coincidencias"
                    options={[
                        { value: 'todos', label: 'Todos los almacenes' },
                        ...almacenes.filter((a) => a.activo !== false).map((a) => ({ value: String(a.id), label: a.nombre })),
                    ]}
                    className="w-56"
                />
                <p className="text-sm text-warm-500">
                    <span className="font-semibold text-warm-900">{num(totalMetros)} m</span> sueltos ·{' '}
                    <span className="font-semibold text-warm-900">{num(totalDisponible)} m</span> disponibles
                </p>
            </div>

            <DataTable columns={columnasSaldos} rows={saldos} loading={loading} searchPlaceholder="Buscar tela o color..." />

            <h2 className="mb-2 mt-8 text-sm font-semibold text-warm-900">Últimas conversiones</h2>
            <DataTable columns={columnasHistorial} rows={historial} loading={loading} searchPlaceholder="Buscar rollo..." />

            <EscanerCamara abierto={camara} onCerrar={() => setCamara(false)} onLeer={alLeerCamara} titulo="Escanear el rollo a convertir" />
        </Layout>
    );
}
