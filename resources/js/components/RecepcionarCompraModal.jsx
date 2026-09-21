import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Camera, ClipboardList, PackageCheck, ScanLine, X } from 'lucide-react';
import api, { asList } from '../lib/api';
import { opcionesAlmacen } from '../lib/almacenes';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import ColorSelect from './ColorSelect';
import EscanerCamara from './EscanerCamara';
import { Alert, Badge, Button, Input, Modal, SearchSelect, Select, Spinner, cn } from './ui';

const hoy = () => new Date().toISOString().slice(0, 10);

const num = (n) => new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 }).format(Number(n) || 0);

/**
 * Registra una recepción contra una compra. Admite recepción parcial: cada línea
 * trae su pendiente y se recibe lo que realmente llegó.
 *
 *   onDone — se llama tras registrar, para que el padre recargue.
 */
/**
 * "58 26.5 / 58 26.6 / 64" -> [{metros: 58, peso_kg: 26.5}, …]
 *
 * El packing list se pega tal cual: una línea por rollo, con el metraje y —si
 * viene— el peso. Se acepta cualquier separador porque cada proveedor manda el
 * suyo.
 */
function leerMetrajes(texto) {
    return String(texto || '')
        .split(/\r?\n/)
        .flatMap((linea) => {
            const numeros = (linea.match(/[\d]+(?:[.,][\d]+)?/g) || []).map((n) =>
                Number(n.replace(',', '.')),
            );
            if (!numeros.length) return [];
            // Si en la fila hay dos números, el segundo es el peso.
            return [{ metros: numeros[0], peso_kg: numeros.length > 1 ? numeros[1] : null }];
        })
        .filter((r) => r.metros > 0);
}

/** Los rollos de una línea que se escribieron a mano (sin packing list). */
function rollosDe(cap) {
    return leerMetrajes(cap?.metrajes);
}

/** "14:08" de una fecha ISO, en la hora local. */
const hora = (iso) =>
    iso ? new Date(iso).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }) : '';

const ESTADO_ROLLO = {
    pendiente: { label: 'Por recibir', variant: 'amber' },
    recibido: { label: 'Recibido', variant: 'green' },
    registrado: { label: 'En el almacén', variant: 'blue' },
};

export default function RecepcionarCompraModal({ open, onClose, compraId, onDone }) {
    const toast = useToast();
    const { puede } = useAuth();

    const [cargando, setCargando] = useState(false);
    const [guardando, setGuardando] = useState(false);
    const [datos, setDatos] = useState(null);
    const [almacenes, setAlmacenes] = useState([]);
    /** Embarques ya registrados, solo para sugerir el código al escribirlo. */
    const [importaciones, setImportaciones] = useState([]);
    /** Cantidad a recibir por línea: { [compra_detalle_id]: '5' } */
    const [cantidades, setCantidades] = useState({});
    /**
     * Rollos capturados por línea: { [compra_detalle_id]: { color_id, codigo, metrajes } }.
     * Solo aplica a la mercadería que se maneja pieza por pieza (las telas).
     */
    const [rollosPorLinea, setRollosPorLinea] = useState({});
    /**
     * El árbol de ubicaciones del almacén elegido: piso → pasillo → rack →
     * nivel → posición. Vacío si ese almacén todavía no lo tiene armado: en
     * ese caso los rollos entran sin ubicación y se avisa dónde armarlo.
     */
    const [arbolUbicaciones, setArbolUbicaciones] = useState([]);
    const [subiendoPackingList, setSubiendoPackingList] = useState(false);
    /** La línea (compra_detalle_id) cuyos rollos y ubicación se están viendo en su modal. */
    const [lineaRollosId, setLineaRollosId] = useState(null);
    /**
     * El packing list cargado de esta compra, rollo por rollo, con lo que el
     * almacén ya escaneó. Vive en el servidor: varios almaceneros lo van
     * completando a la vez, cada uno con su usuario.
     */
    const [packingList, setPackingList] = useState({ filas: [], resumen: null });
    /** Lo que no se pudo cargar del último Excel, para corregirlo y volver a subirlo. */
    const [avisosCarga, setAvisosCarga] = useState([]);
    const [codigoEscaneo, setCodigoEscaneo] = useState('');
    const [ultimoEscaneo, setUltimoEscaneo] = useState(null);
    const [camara, setCamara] = useState(false);
    const escanerRef = useRef(null);
    const [form, setForm] = useState({
        almacen_id: '',
        fecha_recepcion: hoy(),
        observaciones: '',
        // El embarque del que llega la mercadería. Se abre solo la primera vez
        // que se escribe su código.
        importacion_codigo: '',
        importacion_documento: '',
    });

    const cargar = useCallback(async () => {
        setCargando(true);
        try {
            const [pendRes, almRes, impRes] = await Promise.all([
                api.get(`/compras/${compraId}/pendientes-recepcion`),
                api.get('/almacenes'),
                // Los embarques ya conocidos, para sugerirlos al escribir.
                api.get('/importaciones').catch(() => ({ data: [] })),
            ]);
            setDatos(pendRes.data);
            const lista = asList(almRes);
            setAlmacenes(lista);
            setImportaciones(asList(impRes));
            setForm({
                almacen_id: lista.length === 1 ? String(lista[0].id) : '',
                fecha_recepcion: hoy(),
                observaciones: '',
                importacion_codigo: '',
                importacion_documento: '',
            });
            // Por defecto se recibe todo lo pendiente; se ajusta lo que no llegó.
            setCantidades(
                Object.fromEntries(
                    (pendRes.data.lineas ?? [])
                        .filter((l) => l.pendiente > 0)
                        .map((l) => [String(l.compra_detalle_id), String(l.pendiente)]),
                ),
            );
        } catch {
            toast.error('No se pudo cargar el pendiente de la compra.');
        } finally {
            setCargando(false);
        }
    }, [compraId, toast]);

    /** Trae del servidor el packing list de la compra y lo que ya se escaneó. */
    const refrescarPackingList = useCallback(async () => {
        if (!compraId) return;
        try {
            const { data } = await api.get(`/compras/${compraId}/packing-list`);
            setPackingList(data);
        } catch {
            /* un fallo de red no debe tumbar el modal: se reintenta en la siguiente vuelta */
        }
    }, [compraId]);

    useEffect(() => {
        if (open && compraId) {
            cargar();
            setAvisosCarga([]);
            setUltimoEscaneo(null);
            setCodigoEscaneo('');
            setLineaRollosId(null);
            refrescarPackingList();
        }
    }, [open, compraId, cargar, refrescarPackingList]);

    // Otro almacenero puede estar escaneando la misma compra: se refresca solo,
    // para ver sus rollos sin recargar y no volver a contarlos.
    useEffect(() => {
        if (!open || !compraId) return undefined;
        const id = setInterval(refrescarPackingList, 4000);
        return () => clearInterval(id);
    }, [open, compraId, refrescarPackingList]);

    /**
     * Lee el Excel del packing list y deja cada rollo "por recibir". Todavía no
     * es stock: los rollos se van confirmando al escanearlos en el almacén.
     * Lo que no se pudo cargar (producto o color desconocido, código repetido)
     * se señala fila por fila para corregir el Excel y volver a subirlo.
     */
    const cargarPackingListExcel = async (file) => {
        if (!file) return;
        setSubiendoPackingList(true);
        try {
            const body = new FormData();
            body.append('compra_id', compraId);
            body.append('archivo', file);
            const { data } = await api.post('/recepciones-compra/leer-packing-list', body, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });

            setPackingList(data.packing_list ?? { filas: [], resumen: null });
            setAvisosCarga(data.advertencias ?? []);

            const leidos = (data.detalles ?? []).reduce((a, d) => a + d.rollos.length, 0);
            if (leidos > 0) toast.success(`Se cargaron ${leidos} rollos: quedan por recibir hasta que se escaneen.`);
            if (data.advertencias?.length) {
                toast.error(`${data.advertencias.length} fila(s) del Excel no se cargaron: revísalas abajo.`);
            }
        } catch (err) {
            toast.error(err.response?.data?.message ?? 'No se pudo leer el packing list.');
        } finally {
            setSubiendoPackingList(false);
        }
    };

    /**
     * Un rollo escaneado: la pistola escribe el código y termina con Enter, o
     * llega de la cámara. El servidor lo marca recibido con quién y cuándo, y
     * avisa si otro almacenero ya lo había escaneado.
     */
    const verificarRollo = useCallback(
        async (valor) => {
            const codigo = String(valor ?? '').trim();
            if (!codigo) return { ok: false, texto: 'Escribe o escanea un código.' };

            try {
                const { data } = await api.post('/recepciones-compra/escanear', { compra_id: compraId, codigo });
                setPackingList(data.packing_list);
                const r = data.packing_list?.resumen;
                const texto = `Rollo correcto · ${num(data.rollo.metros)} m · ${r?.recibidos ?? 0}/${r?.total ?? 0}`;
                setUltimoEscaneo({ ok: true, codigo, texto: 'Rollo correcto', metros: data.rollo.metros });
                return { ok: true, texto };
            } catch (err) {
                const texto = err.response?.data?.message ?? 'No se pudo verificar el rollo.';
                setUltimoEscaneo({ ok: false, codigo, texto });
                return { ok: false, texto };
            }
        },
        [compraId],
    );

    const escanear = async (e) => {
        e?.preventDefault();
        const valor = codigoEscaneo.trim();
        if (!valor) return;
        setCodigoEscaneo('');
        await verificarRollo(valor);
        escanerRef.current?.focus();
    };

    /** Deshace un escaneo equivocado: el rollo vuelve a "por recibir". */
    const quitarEscaneo = async (codigo) => {
        try {
            const { data } = await api.post('/recepciones-compra/quitar-escaneo', { compra_id: compraId, codigo });
            setPackingList(data.packing_list);
        } catch (err) {
            toast.error(err.response?.data?.message ?? 'No se pudo quitar el escaneo.');
        }
    };

    // Cambiar de almacén trae su propio árbol de ubicaciones (o ninguno), y lo
    // que se había elegido en el anterior ya no existe en este.
    useEffect(() => {
        setRollosPorLinea((prev) =>
            Object.fromEntries(
                Object.entries(prev).map(([clave, c]) => [
                    clave,
                    { ...c, ubicacion_seleccion: [], almacen_ubicacion_id: null },
                ]),
            ),
        );
        if (!form.almacen_id) {
            setArbolUbicaciones([]);
            return;
        }
        let vivo = true;
        api.get(`/almacenes/${form.almacen_id}/ubicaciones`)
            .then(({ data }) => vivo && setArbolUbicaciones(data))
            .catch(() => vivo && setArbolUbicaciones([]));
        return () => {
            vivo = false;
        };
    }, [form.almacen_id]);

    const lineas = datos?.lineas ?? [];
    const conPendiente = useMemo(() => lineas.filter((l) => l.pendiente > 0), [lineas]);

    const filasPL = packingList.filas ?? [];
    const resumenPL = packingList.resumen;
    /** Los rollos de una línea que siguen en el packing list (aún no ingresaron). */
    const filasDeLinea = (l) =>
        filasPL.filter((f) => f.compra_detalle_id === l.compra_detalle_id && f.estado !== 'registrado');
    const escaneadosDe = (l) => filasDeLinea(l).filter((f) => f.estado === 'recibido');
    /** Los rollos de una línea que ya ingresaron al almacén en una recepción anterior. */
    const registradosDe = (l) =>
        filasPL.filter((f) => f.compra_detalle_id === l.compra_detalle_id && f.estado === 'registrado');
    const nombreLinea = (id) => lineas.find((l) => l.compra_detalle_id === id)?.producto ?? '—';
    /** Escribe un campo de los rollos de una línea (color, metrajes, ubicación…). */
    const setCapDe = (clave) => (campo, valor) =>
        setRollosPorLinea((prev) => ({ ...prev, [clave]: { ...(prev[clave] ?? {}), [campo]: valor } }));
    const lineaAbierta = lineas.find((l) => String(l.compra_detalle_id) === lineaRollosId) ?? null;

    // Con packing list, lo que se recibe es lo escaneado; sin él, lo escrito a mano.
    const totalARecibir = useMemo(
        () =>
            conPendiente.reduce((acc, l) => {
                const enLista = filasPL.filter(
                    (f) => f.compra_detalle_id === l.compra_detalle_id && f.estado !== 'registrado',
                );
                if (enLista.length > 0) {
                    return acc + enLista.filter((f) => f.estado === 'recibido').reduce((a, f) => a + f.metros, 0);
                }
                return acc + (Number(cantidades[String(l.compra_detalle_id)]) || 0);
            }, 0),
        [conPendiente, cantidades, filasPL],
    );

    const registrar = async () => {
        if (!form.almacen_id) return toast.error('Elige el almacén receptor.');

        const detalles = conPendiente
            .flatMap((l) => {
                const clave = String(l.compra_detalle_id);
                const cap = rollosPorLinea[clave];
                // Dónde se guardan estos rollos: un punto del árbol del almacén.
                const ubicacion = { almacen_ubicacion_id: cap?.almacen_ubicacion_id || null };

                // Con packing list cargado, entra solo lo que el almacén escaneó
                // (un detalle por color); lo que no llegó sigue pendiente.
                if (filasDeLinea(l).length > 0) {
                    const porColor = {};
                    for (const f of escaneadosDe(l)) (porColor[f.producto_color_id ?? 0] ??= []).push(f);

                    return Object.entries(porColor).map(([colorId, grupo]) => ({
                        compra_detalle_id: l.compra_detalle_id,
                        cantidad_recibida: grupo.reduce((a, f) => a + f.metros, 0),
                        producto_color_id: Number(colorId) || null,
                        codigo_proveedor: cap?.codigo || null,
                        rollos: grupo.map((f) => ({ codigo: f.codigo, metros: f.metros, peso_kg: f.peso_kg })),
                        ...ubicacion,
                    }));
                }

                const rollos = rollosDe(cap);
                return [
                    {
                        compra_detalle_id: l.compra_detalle_id,
                        cantidad_recibida: Number(cantidades[clave]) || 0,
                        ...(rollos.length
                            ? {
                                  rollos,
                                  producto_color_id: l.color_id || cap.color_id || null,
                                  codigo_proveedor: cap.codigo || null,
                                  ...ubicacion,
                              }
                            : {}),
                    },
                ];
            })
            .filter((d) => d.cantidad_recibida > 0);

        if (detalles.length === 0) {
            return toast.error(
                filasPL.length > 0
                    ? 'Escanea al menos un rollo del packing list para registrar la recepción.'
                    : 'Indica al menos una cantidad recibida.',
            );
        }

        const excedida = conPendiente.find(
            (l) =>
                filasDeLinea(l).length === 0 &&
                (Number(cantidades[String(l.compra_detalle_id)]) || 0) > l.pendiente,
        );
        if (excedida) {
            return toast.error(`"${excedida.producto}" supera lo pendiente (${num(excedida.pendiente)}).`);
        }

        setGuardando(true);
        try {
            await api.post('/recepciones-compra', {
                compra_id: compraId,
                almacen_id: form.almacen_id,
                fecha_recepcion: form.fecha_recepcion,
                tipo_documento: datos?.compra?.tipo_documento ?? null,
                numero_documento: [datos?.compra?.serie, datos?.compra?.numero].filter(Boolean).join('-') || null,
                observaciones: form.observaciones,
                importacion_codigo: form.importacion_codigo || null,
                importacion_documento: form.importacion_documento || null,
                detalles,
            });
            toast.success('Recepción registrada.');
            onDone?.();
            onClose?.();
        } catch (err) {
            toast.error(err.response?.data?.message ?? 'No se pudo registrar la recepción.');
        } finally {
            setGuardando(false);
        }
    };

    return (
        <Modal
            open={open}
            // Con el modal de rollos de una línea abierto, Escape cierra solo ese.
            onClose={() => {
                if (!lineaRollosId) onClose();
            }}
            title={`Recepcionar compra ${datos?.compra?.numero_compra ?? ''}${datos?.compra?.orden ? ` · Orden ${datos.compra.orden}` : ''}`}
            description="Registra lo que realmente llegó. Puedes recibir por partes."
            size="3xl"
            footer={
                <>
                    <span className="mr-auto text-xs text-warm-500">
                        {resumenPL?.total > 0
                            ? `${resumenPL.recibidos} de ${resumenPL.pendientes + resumenPL.recibidos} rollos escaneados · ${num(totalARecibir)} m a recibir`
                            : `${num(totalARecibir)} unidades a recibir`}
                    </span>
                    <Button variant="secondary" onClick={onClose}>Cancelar</Button>
                    <Button onClick={registrar} loading={guardando} disabled={cargando || conPendiente.length === 0}>
                        <PackageCheck className="h-4 w-4" /> Registrar recepción
                    </Button>
                </>
            }
        >
            {cargando ? (
                <div className="flex items-center justify-center py-16">
                    <Spinner size="lg" className="text-primary-600" />
                </div>
            ) : (
                <>
                    <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <SearchSelect
                            label="Almacén receptor"
                            value={form.almacen_id}
                            onChange={(v) => setForm((p) => ({ ...p, almacen_id: v ?? '' }))}
                            placeholder="Selecciona…"
                            emptyText="Sin coincidencias"
                            options={opcionesAlmacen(almacenes, form.almacen_id)}
                        />
                        <Input
                            label="Fecha de recepción"
                            type="date"
                            value={form.fecha_recepcion}
                            onChange={(e) => setForm((p) => ({ ...p, fecha_recepcion: e.target.value }))}
                        />
                        <Input
                            label="Observaciones"
                            placeholder="Opcional"
                            value={form.observaciones}
                            onChange={(e) => setForm((p) => ({ ...p, observaciones: e.target.value }))}
                        />
                    </div>

                    {/* El embarque. Se escribe aquí porque es el único momento
                        en que se tiene el papeleo delante. */}
                    <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                            <Input
                                label="Importación (opcional)"
                                placeholder="IMP-2026-03"
                                list="importaciones-conocidas"
                                value={form.importacion_codigo}
                                onChange={(e) =>
                                    setForm((p) => ({ ...p, importacion_codigo: e.target.value }))
                                }
                            />
                            <datalist id="importaciones-conocidas">
                                {importaciones.map((i) => (
                                    <option key={i.id} value={i.codigo}>
                                        {[i.documento, i.rollos_count ? `${i.rollos_count} rollos` : null]
                                            .filter(Boolean)
                                            .join(' · ')}
                                    </option>
                                ))}
                            </datalist>
                            <p className="mt-1 text-xs text-warm-500">
                                Si el código es nuevo se crea el embarque; si ya existe, los rollos se
                                suman a él.
                            </p>
                        </div>
                        <Input
                            label="Documento de embarque"
                            placeholder="BL, DUA, factura del exterior…"
                            value={form.importacion_documento}
                            onChange={(e) =>
                                setForm((p) => ({ ...p, importacion_documento: e.target.value }))
                            }
                        />
                    </div>

                    {/* El packing list en Excel deja cada rollo "por recibir":
                        una fila por rollo, con su propio código de fábrica.
                        Todavía no es stock; el almacén los va escaneando al
                        llegar y el encargado confirma. Sin archivo, se sigue
                        capturando a mano por línea, como siempre. */}
                    {(puede('compras.recepciones-compra.importar') || filasPL.length > 0) && (
                        <div className="mb-4 rounded-lg border border-edge p-3">
                            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                <h3 className="text-sm font-semibold text-warm-900">Packing list</h3>
                                {resumenPL?.total > 0 && (
                                    <span className="text-sm font-medium text-warm-700">
                                        Llegaron {resumenPL.recibidos + resumenPL.registrados} de {resumenPL.total} rollos ·{' '}
                                        {num(resumenPL.metros_recibidos)} de {num(resumenPL.metros_total - 0)} m
                                    </span>
                                )}
                            </div>

                            {puede('compras.recepciones-compra.importar') && (
                                <div>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="file"
                                            accept=".xlsx,.xls"
                                            disabled={subiendoPackingList}
                                            onChange={(e) => {
                                                cargarPackingListExcel(e.target.files?.[0]);
                                                e.target.value = '';
                                            }}
                                            aria-label="Cargar packing list"
                                            className="block flex-1 text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-primary-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary-700 hover:file:bg-primary-100"
                                        />
                                        {subiendoPackingList && <Spinner className="h-4 w-4 text-primary-600" />}
                                    </div>
                                    <p className="mt-1 text-xs text-warm-400">
                                        Cargar packing list: un Excel con una fila por rollo (orden, código único,
                                        producto, color, metros, peso neto). Los rollos quedan por recibir hasta que
                                        se escaneen; aún no suman al stock.
                                    </p>
                                </div>
                            )}

                            {avisosCarga.length > 0 && (
                                <Alert variant="warning" className="mt-2">
                                    <div className="flex items-start justify-between gap-3">
                                        <p className="font-medium">
                                            {avisosCarga.length} fila(s) del Excel no se cargaron. Corrígelas y vuelve a
                                            cargar el archivo:
                                        </p>
                                        <button
                                            type="button"
                                            onClick={() => setAvisosCarga([])}
                                            className="shrink-0 text-xs font-semibold underline"
                                        >
                                            Ocultar
                                        </button>
                                    </div>
                                    <ul className="mt-1 max-h-32 list-disc space-y-0.5 overflow-y-auto pl-5 text-xs">
                                        {avisosCarga.map((a, i) => (
                                            <li key={i}>{a}</li>
                                        ))}
                                    </ul>
                                </Alert>
                            )}

                            {filasPL.length > 0 && (
                                <>
                                    {puede('compras.recepciones-compra.editar') && (
                                        <form onSubmit={escanear} className="mt-3">
                                            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-warm-500">
                                                Escanea cada rollo al recibirlo
                                            </label>
                                            <div className="flex items-center gap-2">
                                                <span className="relative flex-1">
                                                    <ScanLine className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-primary-600" />
                                                    <input
                                                        ref={escanerRef}
                                                        value={codigoEscaneo}
                                                        onChange={(e) => setCodigoEscaneo(e.target.value)}
                                                        // La pistola termina cada lectura con Enter.
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') {
                                                                e.preventDefault();
                                                                escanear(e);
                                                            }
                                                        }}
                                                        placeholder="Dispara la pistola sobre la etiqueta…"
                                                        autoComplete="off"
                                                        aria-label="Código del rollo"
                                                        className="w-full rounded-lg border border-edge py-2.5 pl-10 pr-3 font-mono text-sm shadow-sm outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                                                    />
                                                </span>
                                                <Button type="submit" size="sm" disabled={!codigoEscaneo.trim()}>
                                                    Verificar
                                                </Button>
                                                <Button
                                                    type="button"
                                                    variant="secondary"
                                                    size="sm"
                                                    onClick={() => setCamara(true)}
                                                    title="Escanear con la cámara"
                                                >
                                                    <Camera className="h-4 w-4" />
                                                </Button>
                                            </div>
                                            {ultimoEscaneo && (
                                                <div
                                                    role="status"
                                                    className={cn(
                                                        'mt-2 rounded-md px-3 py-2 text-sm',
                                                        ultimoEscaneo.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800',
                                                    )}
                                                >
                                                    <span className="font-mono font-medium">{ultimoEscaneo.codigo}</span> ·{' '}
                                                    {ultimoEscaneo.texto}
                                                </div>
                                            )}
                                        </form>
                                    )}

                                    <div className="mt-3 max-h-56 overflow-y-auto rounded-md border border-edge">
                                        <table className="w-full text-xs">
                                            <thead className="sticky top-0 bg-gray-50 text-left text-warm-500">
                                                <tr>
                                                    <th className="px-2 py-1.5">Rollo</th>
                                                    <th className="px-2 py-1.5">Tela · color</th>
                                                    <th className="px-2 py-1.5 text-right">Metros</th>
                                                    <th className="px-2 py-1.5 text-right">Peso</th>
                                                    <th className="px-2 py-1.5">Estado</th>
                                                    <th className="w-8 px-2 py-1.5" />
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100">
                                                {filasPL.map((f) => {
                                                    const est = ESTADO_ROLLO[f.estado] ?? ESTADO_ROLLO.pendiente;
                                                    return (
                                                        <tr key={f.id} className={f.estado === 'pendiente' ? 'bg-amber-50/40' : ''}>
                                                            <td className="px-2 py-1.5 font-mono font-medium text-warm-900">{f.codigo}</td>
                                                            <td className="px-2 py-1.5 text-warm-600">
                                                                {nombreLinea(f.compra_detalle_id)}
                                                                {f.color ? ` · ${f.color}` : ''}
                                                            </td>
                                                            <td className="px-2 py-1.5 text-right">{num(f.metros)}</td>
                                                            <td className="px-2 py-1.5 text-right text-warm-500">
                                                                {f.peso_kg ? `${num(f.peso_kg)} kg` : '—'}
                                                            </td>
                                                            <td className="px-2 py-1.5">
                                                                <Badge variant={est.variant}>{est.label}</Badge>
                                                                {f.escaneado_por && (
                                                                    <span className="ml-1.5 text-warm-500">
                                                                        {f.escaneado_por} · {hora(f.escaneado_at)}
                                                                    </span>
                                                                )}
                                                            </td>
                                                            <td className="px-2 py-1.5 text-center">
                                                                {f.estado === 'recibido' && puede('compras.recepciones-compra.editar') && (
                                                                    <button
                                                                        type="button"
                                                                        aria-label={`Quitar el escaneo de ${f.codigo}`}
                                                                        title="Deshacer este escaneo"
                                                                        onClick={() => quitarEscaneo(f.codigo)}
                                                                        className="rounded p-0.5 text-red-600 transition hover:bg-red-50"
                                                                    >
                                                                        <X className="h-3.5 w-3.5" />
                                                                    </button>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>

                                    {/* Diferencias: lo que el proveedor dijo que traía y todavía no se escaneó. */}
                                    {resumenPL?.pendientes > 0 && (
                                        <p className="mt-2 text-xs text-amber-700">
                                            Faltan por llegar {resumenPL.pendientes} rollo(s) · {num(resumenPL.metros_pendientes)} m.
                                            Al registrar solo entran los escaneados; el resto queda pendiente en la compra.
                                        </p>
                                    )}
                                    {resumenPL?.pendientes === 0 && resumenPL?.recibidos > 0 && (
                                        <p className="mt-2 text-xs text-green-700">
                                            Llegó todo lo del packing list. Revisa y confirma con "Registrar recepción".
                                        </p>
                                    )}
                                </>
                            )}
                        </div>
                    )}

                    {conPendiente.length === 0 ? (
                        <Alert variant="success">
                            Esta compra ya no tiene nada pendiente de recepcionar.
                        </Alert>
                    ) : (
                        <div className="overflow-x-auto rounded-lg border border-edge">
                            <table className="w-full min-w-[720px] text-sm">
                                <thead>
                                    <tr className="bg-primary-600 text-left text-xs font-semibold uppercase tracking-wide text-white">
                                        <th className="px-3 py-2.5">Código</th>
                                        <th className="px-3 py-2.5">Producto</th>
                                        <th className="px-3 py-2.5">Unidad</th>
                                        <th className="px-3 py-2.5 text-right">Pedida</th>
                                        <th className="px-3 py-2.5 text-right">Recibida</th>
                                        <th className="px-3 py-2.5 text-right">Pendiente</th>
                                        <th className="px-3 py-2.5 text-right">Recibe ahora</th>
                                        <th className="w-14 px-3 py-2.5 text-center">Acc.</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {conPendiente.map((l) => {
                                        const clave = String(l.compra_detalle_id);
                                        const cap = rollosPorLinea[clave];
                                        // Solo la mercadería con muestrario se
                                        // maneja rollo por rollo.
                                        const porRollos = (l.colores?.length ?? 0) > 0;
                                        const leidos = rollosDe(cap);
                                        // Con packing list, lo que se recibe es lo escaneado.
                                        const enLista = filasDeLinea(l);
                                        const escaneados = escaneadosDe(l);
                                        // ¿Ya tiene algo cargado en su detalle de rollos?
                                        const conDatos = leidos.length > 0 || Boolean(cap?.almacen_ubicacion_id);

                                        return (
                                            <tr key={clave}>
                                                <td className="px-3 py-2 text-warm-500">{l.codigo ?? '—'}</td>
                                                <td className="px-3 py-2 font-semibold text-warm-900">
                                                    {l.producto}
                                                    {l.color && (
                                                        <span className="ml-1 text-xs font-normal text-warm-500">
                                                            · {l.color.nombre}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-3 py-2 text-warm-500">{l.unidad ?? '—'}</td>
                                                <td className="px-3 py-2 text-right text-warm-900">{num(l.cantidad_pedida)}</td>
                                                <td className="px-3 py-2 text-right text-warm-500">{num(l.cantidad_recibida)}</td>
                                                <td className="px-3 py-2 text-right font-semibold text-amber-600">{num(l.pendiente)}</td>
                                                <td className="px-3 py-2">
                                                    {enLista.length > 0 ? (
                                                        <div className="text-right text-xs">
                                                            <span className="block text-sm font-semibold text-warm-900">
                                                                {num(escaneados.reduce((a, f) => a + f.metros, 0))} m
                                                            </span>
                                                            <span className="text-warm-500">
                                                                {escaneados.length} de {enLista.length} rollos escaneados
                                                            </span>
                                                        </div>
                                                    ) : (
                                                        <Input
                                                            type="number"
                                                            min="0"
                                                            max={l.pendiente}
                                                            step="any"
                                                            value={cantidades[clave] ?? ''}
                                                            onChange={(e) =>
                                                                setCantidades((prev) => ({
                                                                    ...prev,
                                                                    [clave]: e.target.value,
                                                                }))
                                                            }
                                                            // Con rollos capturados la manda el detalle:
                                                            // la cantidad sale de la suma de sus metros.
                                                            disabled={leidos.length > 0}
                                                            aria-label={`Cantidad recibida de ${l.producto}`}
                                                            className="text-right"
                                                        />
                                                    )}
                                                </td>
                                                {/* Ver recepción: los rollos de la línea y dónde se guardan,
                                                    en su propio modal. El punto verde avisa que ya tiene datos. */}
                                                <td className="px-3 py-2 text-center">
                                                    {porRollos ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => setLineaRollosId(clave)}
                                                            aria-label={`Ver recepción de ${l.producto}`}
                                                            title="Ver recepción"
                                                            className="relative rounded-md p-1.5 text-primary-600 transition hover:bg-primary-50 hover:text-primary-700"
                                                        >
                                                            <ClipboardList className="h-4 w-4" />
                                                            {conDatos && (
                                                                <span className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-green-500 ring-2 ring-white" />
                                                            )}
                                                        </button>
                                                    ) : (
                                                        <span className="text-warm-300">—</span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {conPendiente.length > 0 && (
                        <p className="mt-3 text-xs text-warm-500">
                            Si el proveedor ya no va a enviar lo que falta, registra lo que llegó y luego
                            usa <span className="font-semibold">Finalizar</span> en la recepción para cerrar el pendiente.
                        </p>
                    )}
                </>
            )}

            {/* Los rollos de una línea y dónde se guardan. */}
            {lineaAbierta && (
                <RollosDeLineaModal
                    linea={lineaAbierta}
                    cap={rollosPorLinea[String(lineaAbierta.compra_detalle_id)]}
                    setCap={setCapDe(String(lineaAbierta.compra_detalle_id))}
                    enLista={filasDeLinea(lineaAbierta)}
                    registrados={registradosDe(lineaAbierta)}
                    almacenId={form.almacen_id}
                    arbolUbicaciones={arbolUbicaciones}
                    onClose={() => setLineaRollosId(null)}
                />
            )}

            {/* La misma verificación, leyendo el QR de la etiqueta con la
                cámara del celular. */}
            <EscanerCamara
                abierto={camara}
                onCerrar={() => setCamara(false)}
                onLeer={verificarRollo}
                titulo="Escanear rollos recibidos"
            />
        </Modal>
    );
}

/**
 * Los rollos de una línea de la compra y dónde se guardan. Se abre con el ícono
 * de la columna de acciones, en vez de desplegarse dentro de la tabla. Con
 * packing list sus rollos ya vienen cargados y aquí solo se indica la
 * ubicación; sin él, se capturan a mano (color, código y metrajes).
 */
function RollosDeLineaModal({ linea, cap, setCap, enLista, registrados = [], almacenId, arbolUbicaciones, onClose }) {
    const leidos = rollosDe(cap);

    return (
        <Modal
            open
            onClose={onClose}
            size="xl"
            title={`Ver recepción · ${linea.producto}${linea.color ? ` · ${linea.color.nombre}` : ''}`}
            description="Los rollos de esta línea y dónde se guardan."
            footer={<Button onClick={onClose}>Listo</Button>}
        >
            <div className="space-y-4">
                {enLista.length > 0 ? (
                    <>
                        <p className="text-sm text-warm-600">
                            Los rollos de esta línea vienen del packing list: su color, código, metros y peso ya están
                            cargados. Aquí solo indicas dónde se guardan.
                        </p>
                        <div className="overflow-x-auto rounded-lg border border-edge">
                            <table className="w-full min-w-[460px] text-sm">
                                <thead>
                                    <tr className="bg-primary-600 text-left text-xs font-semibold uppercase tracking-wide text-white">
                                        <th className="px-3 py-2">Rollo</th>
                                        <th className="px-3 py-2 text-right">Metros</th>
                                        <th className="px-3 py-2 text-right">Peso</th>
                                        <th className="px-3 py-2">Estado</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {enLista.map((f) => {
                                        const estado = ESTADO_ROLLO[f.estado] ?? { label: f.estado, variant: 'gray' };
                                        return (
                                            <tr key={f.id}>
                                                <td className="px-3 py-2 font-mono text-xs font-semibold text-warm-900">
                                                    {f.codigo}
                                                </td>
                                                <td className="px-3 py-2 text-right">{num(f.metros)} m</td>
                                                <td className="px-3 py-2 text-right text-warm-600">
                                                    {f.peso_kg != null ? `${num(f.peso_kg)} kg` : '—'}
                                                </td>
                                                <td className="px-3 py-2">
                                                    <Badge variant={estado.variant}>{estado.label}</Badge>
                                                    {f.escaneado_por && (
                                                        <span className="ml-2 text-xs text-warm-500">
                                                            {f.escaneado_por} {hora(f.escaneado_at)}
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </>
                ) : (
                    <div className="grid gap-3 sm:grid-cols-2">
                        {linea.color ? (
                            <div>
                                <p className="mb-1 text-sm font-medium text-warm-800">Color</p>
                                <div className="flex h-10 items-center rounded-md border border-edge bg-gray-50 px-3 text-sm text-warm-900">
                                    {linea.color.nombre}
                                    {linea.color.codigo ? ` (${linea.color.codigo})` : ''}
                                </div>
                                <p className="mt-1 text-xs text-warm-400">Es el color con el que se compró.</p>
                            </div>
                        ) : (
                            <ColorSelect
                                colores={linea.colores}
                                value={cap?.color_id ?? ''}
                                onChange={(id) => setCap('color_id', id)}
                                placeholder="Elegir color…"
                            />
                        )}
                        <div>
                            <Input
                                label="Código de rollo (opcional)"
                                placeholder="Se arma solo si lo dejas vacío"
                                value={cap?.codigo ?? ''}
                                onChange={(e) => setCap('codigo', e.target.value)}
                            />
                            <p className="mt-1 text-xs text-warm-400">
                                Si el proveedor tiene código corto, el rollo se numera solo con el código de la orden
                                (ej. KET-003-26-000001).
                            </p>
                        </div>
                        <div className="sm:col-span-2">
                            <label className="mb-1 block text-sm font-medium text-warm-800">
                                Metrajes del packing list
                            </label>
                            <textarea
                                rows={5}
                                value={cap?.metrajes ?? ''}
                                onChange={(e) => setCap('metrajes', e.target.value)}
                                placeholder={'Pega aquí el packing list, un rollo por línea:\n58   26.5\n58   26.6\n64   28.3'}
                                className="w-full rounded-md border border-edge px-3 py-2 font-mono text-sm shadow-sm outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
                            />
                            <p className="mt-1 text-xs text-warm-500">
                                Un rollo por línea. Si pones dos números, el segundo es el peso en kilos.
                            </p>
                        </div>
                    </div>
                )}

                {/* Lo que de esta línea ya ingresó al almacén en recepciones anteriores. */}
                {registrados.length > 0 && (
                    <div>
                        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-warm-500">
                            Ya ingresaron al almacén · {registrados.length} ·{' '}
                            {num(registrados.reduce((a, f) => a + f.metros, 0))} m
                        </p>
                        <div className="overflow-x-auto rounded-lg border border-edge">
                            <table className="w-full min-w-[460px] text-sm">
                                <tbody className="divide-y divide-gray-100">
                                    {registrados.map((f) => (
                                        <tr key={f.id}>
                                            <td className="px-3 py-2 font-mono text-xs font-semibold text-warm-900">{f.codigo}</td>
                                            <td className="px-3 py-2 text-right">{num(f.metros)} m</td>
                                            <td className="px-3 py-2 text-right text-warm-600">
                                                {f.peso_kg != null ? `${num(f.peso_kg)} kg` : '—'}
                                            </td>
                                            <td className="px-3 py-2">
                                                <Badge variant={ESTADO_ROLLO.registrado.variant}>
                                                    {ESTADO_ROLLO.registrado.label}
                                                </Badge>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <p className="mt-1 text-xs text-warm-400">
                            Dónde quedó cada uno se ve en Compras → Ver recepción.
                        </p>
                    </div>
                )}

                {/* Dónde se guardan. Se aplica a todos los rollos de esta línea;
                    después cada uno se puede mover por su cuenta. Se elige siempre
                    del árbol del almacén (piso → pasillo → rack → nivel →
                    posición), no se escribe. */}
                <div>
                    <p className="mb-1 text-sm font-medium text-warm-800">
                        Ubicación en el almacén <span className="font-normal text-warm-500">(opcional)</span>
                    </p>
                    {!almacenId ? (
                        <p className="text-sm text-warm-500">Elige primero el almacén receptor para ver sus ubicaciones.</p>
                    ) : arbolUbicaciones.length > 0 ? (
                        <CascadaUbicacion arbol={arbolUbicaciones} cap={cap} setCap={setCap} />
                    ) : (
                        <p className="text-sm text-warm-500">
                            Este almacén todavía no tiene ubicaciones armadas, así que los rollos entran sin ubicación. Se
                            arman en{' '}
                            <Link to="/almacenes" className="font-medium text-primary-600 hover:underline">
                                Inventario → Almacenes
                            </Link>{' '}
                            (editar el almacén y agregar sus ubicaciones).
                        </p>
                    )}
                </div>

                {leidos.length > 0 && (
                    <p className="text-sm text-primary-700">
                        Se crearán <strong>{leidos.length} rollos</strong> con{' '}
                        <strong>{num(leidos.reduce((a, r) => a + r.metros, 0))} m</strong>
                        {leidos.some((r) => r.peso_kg) && (
                            <>
                                {' y '}
                                <strong>{num(leidos.reduce((a, r) => a + (r.peso_kg || 0), 0))} kg</strong>
                            </>
                        )}
                        .
                    </p>
                )}
            </div>
        </Modal>
    );
}

const ETIQUETA_NIVEL = { piso: 'Piso', pasillo: 'Pasillo', rack: 'Rack', nivel: 'Nivel', posicion: 'Posición' };

/**
 * Selects en cascada: piso → pasillo → rack → nivel → posición, hasta donde
 * llegue el árbol de ese almacén. Cada select solo muestra las opciones que
 * cuelgan de lo elegido en el anterior; el id final que importa es el del
 * nivel más profundo que el usuario haya seleccionado.
 */
function CascadaUbicacion({ arbol, cap, setCap }) {
    const seleccion = cap?.ubicacion_seleccion || [];

    const niveles = useMemo(() => {
        const resultado = [{ opciones: arbol }];
        let nodos = arbol;
        for (const idSeleccionado of seleccion) {
            const nodo = nodos.find((n) => n.id === idSeleccionado);
            if (!nodo || nodo.hijos.length === 0) break;
            resultado.push({ opciones: nodo.hijos });
            nodos = nodo.hijos;
        }
        return resultado;
    }, [arbol, seleccion]);

    const elegir = (profundidad, idElegido) => {
        const nueva = seleccion.slice(0, profundidad);
        if (idElegido) nueva.push(Number(idElegido));
        setCap('ubicacion_seleccion', nueva);
        setCap('almacen_ubicacion_id', nueva.length ? nueva[nueva.length - 1] : null);
    };

    return (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {niveles.map((n, i) => {
                if (n.opciones.length === 0) return null;
                const tipo = n.opciones[0]?.tipo;
                return (
                    <SearchSelect
                        key={i}
                        value={seleccion[i] ?? ''}
                        onChange={(v) => elegir(i, v)}
                        placeholder={`${ETIQUETA_NIVEL[tipo] ?? 'Ubicación'}…`}
                        emptyText="Sin coincidencias"
                        options={n.opciones.map((op) => ({ value: String(op.id), label: op.nombre }))}
                    />
                );
            })}
        </div>
    );
}
