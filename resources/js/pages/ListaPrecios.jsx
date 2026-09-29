import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Edit, ListChecks, Lock, Plus, Tags, Trash2 } from 'lucide-react';
import api, { asList } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import { IGV, igvIncluido } from '../lib/precios';
import Layout from '../components/Layout';
import PageHeader, { CreateButton } from '../components/PageHeader';
import { Alert, Badge, Button, DataTable, Input, Modal, SearchSelect, Select, Spinner, Tabs } from '../components/ui';

const money = (n, moneda = 'PEN') =>
    new Intl.NumberFormat('es-PE', { style: 'currency', currency: moneda || 'PEN' }).format(Number(n) || 0);
const num = (n) => new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 }).format(Number(n) || 0);
/** Número → texto con hasta 2 decimales y sin ceros de relleno. */
const dos = (n) => String(+(Number(n) || 0).toFixed(2));

let contador = 0;
const nuevaClave = () => `f${++contador}`;

const TH = 'px-3 py-2.5';
const INPUT =
    'block w-full rounded-md border-0 px-2 py-1.5 text-right text-sm text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-primary-600 disabled:bg-gray-50 disabled:text-gray-500';

/**
 * Todo lo que se calcula de un producto para su lista de precios: el costo en
 * la moneda en que se vende, la unidad de referencia (el metro, o la unidad
 * base si la tela no se mide en metros) y el margen con o sin IGV.
 */
function calculoDe(detalle, afectoIgv) {
    const presentaciones = (detalle?.presentaciones ?? [])
        .filter((p) => p.activo !== false)
        .sort((a, b) => Number(a.factor_conversion) - Number(b.factor_conversion));
    const metro = presentaciones.find((p) => (p.unidad_base?.abreviatura ?? '').toLowerCase() === 'm');
    const base = detalle?.unidad_base ?? detalle?.unidad_medida;
    const ref = metro
        ? { factor: Number(metro.factor_conversion) || 1, abrev: 'm', nombre: 'metro' }
        : { factor: 1, abrev: base?.abreviatura ?? 'u', nombre: (base?.nombre ?? 'unidad').toLowerCase() };

    const moneda = detalle?.moneda_venta || 'PEN';
    const compra = detalle?.moneda_compra || 'PEN';
    const tc = Number(detalle?.tipo_cambio) || 0;
    // Cuánto vale 1 de la moneda de compra en la de venta; null = falta el tipo de cambio.
    const tasa = compra === moneda ? 1 : !tc ? null : compra === 'USD' ? tc : 1 / tc;
    // Con IGV el precio lo incluye: el margen se mide sobre lo que queda sin él.
    const igv = afectoIgv ? 1 + IGV : 1;

    const presentacion = (id) => presentaciones.find((p) => String(p.id) === String(id)) ?? null;
    const cuantasRef = (p) => (Number(p?.factor_conversion) || 1) / ref.factor;
    const costo = (p) => (tasa == null ? null : (Number(p?.precio_compra) || 0) * tasa);
    const margen = (precio, p) => {
        const c = costo(p);
        return c > 0 && Number(precio) > 0 ? (Number(precio) / igv / c - 1) * 100 : null;
    };
    const precioConMargen = (m, p) => {
        const c = costo(p);
        return c > 0 && m !== '' && Number.isFinite(Number(m)) ? c * (1 + Number(m) / 100) * igv : null;
    };

    return { presentaciones, presentacion, ref, moneda, tasa, cuantasRef, costo, margen, precioConMargen };
}

/** Las filas de un tipo de precio: una o más por presentación, por cantidad. */
function armarFilas(calc, tipo) {
    const filas = [];
    for (const p of calc.presentaciones) {
        const lista = tipo.principal
            ? [
                  // El precio de siempre de la presentación: desde 1, fijo.
                  { desde: 1, precio: p.precio_venta, base: true },
                  ...(p.precios ?? []).filter((f) => f.principal && Number(f.desde) > 1),
              ]
            : (p.precios ?? []).filter((f) => String(f.tipo_precio_id) === String(tipo.id));

        // Sin precio en este tipo: una fila vacía (al vender rige el principal).
        const conFila = lista.length ? lista : [{ desde: 1, precio: '' }];

        conFila
            .sort((a, b) => Number(a.desde) - Number(b.desde))
            .forEach((f) =>
                filas.push({
                    clave: nuevaClave(),
                    presentacionId: p.id,
                    base: Boolean(f.base),
                    desde: String(Number(f.desde)),
                    precio: f.precio === '' || f.precio == null ? '' : dos(f.precio),
                    margen: '',
                    precioRef: '',
                }),
            );
    }
    return filas.map((f) => completar(f, calc));
}

/** Deja el margen y el precio por unidad de referencia al día con el precio. */
function completar(fila, calc) {
    const p = calc.presentacion(fila.presentacionId);
    const m = fila.precio === '' ? null : calc.margen(fila.precio, p);
    return {
        ...fila,
        margen: m == null ? '' : dos(m),
        precioRef: fila.precio === '' ? '' : dos(Number(fila.precio) / calc.cuantasRef(p)),
    };
}

/**
 * La lista de precios, separada del producto: se elige el producto y el tipo
 * de precio (Minorista, Mayorista…) y se pone el precio de cada forma en que se
 * vende, y desde qué cantidad rige. Al vender, el precio sale del tipo de
 * precio del cliente y de la cantidad.
 */
export default function ListaPrecios() {
    const toast = useToast();
    const { puede } = useAuth();
    const puedeEditar = puede('catalogo.lista-precios.editar');
    const [params, setParams] = useSearchParams();

    const [tab, setTab] = useState('precios');
    const [productos, setProductos] = useState([]);
    const [tipos, setTipos] = useState([]);
    const [productoId, setProductoId] = useState(params.get('producto') ?? '');
    const [tipoId, setTipoId] = useState('');
    const [detalle, setDetalle] = useState(null);
    const [cargando, setCargando] = useState(false);
    const [filas, setFilas] = useState([]);
    const [afectoIgv, setAfectoIgv] = useState(false);
    const [margenGeneral, setMargenGeneral] = useState('');
    const [sucio, setSucio] = useState(false);
    const [guardando, setGuardando] = useState(false);

    /** Tipos de precio: { editing: tipo|null } o null. */
    const [tipoModal, setTipoModal] = useState(null);
    const [tipoForm, setTipoForm] = useState({ nombre: '', margen: '', activo: true });
    const [tipoGuardando, setTipoGuardando] = useState(false);
    const [tipoBorrar, setTipoBorrar] = useState(null);

    const cargarTipos = useCallback(async () => {
        const lista = asList(await api.get('/tipos-precio'));
        setTipos(lista);
        return lista;
    }, []);

    useEffect(() => {
        (async () => {
            try {
                const [prodRes, lista] = await Promise.all([
                    api.get('/productos', { params: { per_page: 500 } }),
                    cargarTipos(),
                ]);
                setProductos(asList(prodRes));
                const principal = lista.find((t) => t.principal) ?? lista[0];
                setTipoId((prev) => prev || (principal ? String(principal.id) : ''));
            } catch {
                toast.error('No se pudo cargar la lista de precios.');
            }
        })();
    }, [cargarTipos, toast]);

    const cargarDetalle = useCallback(
        async (id) => {
            if (!id) {
                setDetalle(null);
                return;
            }
            setCargando(true);
            try {
                const { data } = await api.get(`/productos/${id}`);
                setDetalle(data?.data ?? data);
            } catch {
                toast.error('No se pudo cargar el producto.');
                setDetalle(null);
            } finally {
                setCargando(false);
            }
        },
        [toast],
    );

    useEffect(() => {
        cargarDetalle(productoId);
    }, [productoId, cargarDetalle]);

    const tipo = tipos.find((t) => String(t.id) === String(tipoId)) ?? null;
    const calc = useMemo(() => calculoDe(detalle, afectoIgv), [detalle, afectoIgv]);

    // Otro producto u otro tipo: la tabla se arma de nuevo desde lo guardado.
    useEffect(() => {
        if (!detalle || !tipo) {
            setFilas([]);
            return;
        }
        const afecto = Boolean(detalle.afecto_igv);
        setAfectoIgv(afecto);
        setFilas(armarFilas(calculoDe(detalle, afecto), tipo));
        setMargenGeneral(tipo.margen != null ? dos(tipo.margen) : '');
        setSucio(false);
    }, [detalle, tipo]);

    const descartarSiHayCambios = () =>
        !sucio || window.confirm('Tienes precios sin guardar. ¿Descartarlos?');

    const elegirProducto = (id) => {
        if (String(id ?? '') === String(productoId) || !descartarSiHayCambios()) return;
        setProductoId(id ?? '');
        setParams(id ? { producto: id } : {});
    };

    const elegirTipo = (id) => {
        if (String(id) === String(tipoId) || !descartarSiHayCambios()) return;
        setTipoId(id);
    };

    // ── Edición de filas: precio, margen y precio por metro se mueven juntos ──
    const cambiarFila = (clave, cambio) => {
        setFilas((prev) => prev.map((f) => (f.clave === clave ? cambio(f) : f)));
        setSucio(true);
    };

    const ponerPrecio = (clave, valor) =>
        cambiarFila(clave, (f) => ({ ...completar({ ...f, precio: valor }, calc), precio: valor }));

    const ponerMargen = (clave, valor) =>
        cambiarFila(clave, (f) => {
            const p = calc.presentacion(f.presentacionId);
            const precio = calc.precioConMargen(valor, p);
            if (precio == null) return { ...f, margen: valor };
            return { ...f, margen: valor, precio: dos(precio), precioRef: dos(precio / calc.cuantasRef(p)) };
        });

    const ponerPrecioRef = (clave, valor) =>
        cambiarFila(clave, (f) => {
            const p = calc.presentacion(f.presentacionId);
            const precio = valor === '' ? '' : dos(Number(valor) * calc.cuantasRef(p));
            const m = precio === '' ? null : calc.margen(precio, p);
            return { ...f, precioRef: valor, precio, margen: m == null ? '' : dos(m) };
        });

    const ponerDesde = (clave, valor) => cambiarFila(clave, (f) => ({ ...f, desde: valor }));

    /** Otro precio de la misma presentación, desde una cantidad mayor. */
    const agregarFila = (presentacionId) => {
        setFilas((prev) => {
            const ultima = prev.map((f) => String(f.presentacionId)).lastIndexOf(String(presentacionId));
            const nueva = { clave: nuevaClave(), presentacionId, base: false, desde: '', precio: '', margen: '', precioRef: '' };
            return [...prev.slice(0, ultima + 1), nueva, ...prev.slice(ultima + 1)];
        });
        setSucio(true);
    };

    const quitarFila = (clave) => {
        setFilas((prev) => prev.filter((f) => f.clave !== clave));
        setSucio(true);
    };

    /** El mismo % a todas las filas, calculado sobre el costo. */
    const llenar = () => {
        const m = Number(margenGeneral);
        if (margenGeneral === '' || !Number.isFinite(m)) return toast.error('Escribe el % de margen.');
        if (calc.tasa == null) return toast.error('Falta el tipo de cambio del producto para calcular desde el costo.');
        setFilas((prev) =>
            prev.map((f) => {
                const p = calc.presentacion(f.presentacionId);
                const precio = calc.precioConMargen(m, p);
                if (precio == null) return f;
                return { ...f, margen: dos(m), precio: dos(precio), precioRef: dos(precio / calc.cuantasRef(p)) };
            }),
        );
        setSucio(true);
    };

    /** Con IGV el precio ya lo incluye: los precios quedan, el margen se recalcula. */
    const cambiarIgv = (valor) => {
        setAfectoIgv(valor);
        const nuevo = calculoDe(detalle, valor);
        setFilas((prev) => prev.map((f) => completar(f, nuevo)));
        setSucio(true);
    };

    const guardar = async () => {
        for (const f of filas) {
            if (f.base && f.precio === '') return toast.error('Falta el precio de alguna presentación.');
            if (f.precio !== '' && !(Number(f.desde) >= 1)) {
                return toast.error('Pon desde qué cantidad rige cada precio (1 o más).');
            }
        }
        const conPrecio = filas.filter((f) => f.precio !== '');
        const vistas = new Set();
        for (const f of conPrecio) {
            const k = `${f.presentacionId}|${Number(f.desde)}`;
            if (vistas.has(k)) return toast.error('Hay dos precios de la misma presentación desde la misma cantidad.');
            vistas.add(k);
        }

        setGuardando(true);
        try {
            await api.put(`/lista-precios/${productoId}`, {
                tipo_precio_id: Number(tipoId),
                afecto_igv: afectoIgv,
                filas: conPrecio.map((f) => ({
                    producto_presentacion_id: f.presentacionId,
                    desde: Number(f.desde),
                    precio: Number(f.precio),
                    margen: f.margen === '' ? null : Number(f.margen),
                })),
            });
            toast.success('Precios guardados.');
            await cargarDetalle(productoId);
        } catch (err) {
            toast.error(err.response?.data?.message ?? 'No se pudieron guardar los precios.');
        } finally {
            setGuardando(false);
        }
    };

    const cancelar = () => {
        if (!detalle || !tipo) return;
        setAfectoIgv(Boolean(detalle.afecto_igv));
        setFilas(armarFilas(calculoDe(detalle, Boolean(detalle.afecto_igv)), tipo));
        setSucio(false);
    };

    // ── Tipos de precio ──
    const abrirTipo = (editing = null) => {
        setTipoForm({
            nombre: editing?.nombre ?? '',
            margen: editing?.margen != null ? dos(editing.margen) : '',
            activo: editing?.activo ?? true,
        });
        setTipoModal({ editing });
    };

    const guardarTipo = async (e) => {
        e?.preventDefault?.();
        if (!tipoForm.nombre.trim()) return toast.error('Escribe el nombre del tipo de precio.');
        setTipoGuardando(true);
        const cuerpo = {
            nombre: tipoForm.nombre.trim(),
            margen: tipoForm.margen === '' ? null : Number(tipoForm.margen),
            activo: tipoForm.activo,
        };
        try {
            if (tipoModal.editing) await api.put(`/tipos-precio/${tipoModal.editing.id}`, cuerpo);
            else await api.post('/tipos-precio', cuerpo);
            toast.success(tipoModal.editing ? 'Tipo de precio actualizado.' : 'Tipo de precio creado.');
            setTipoModal(null);
            await cargarTipos();
        } catch (err) {
            toast.error(err.response?.data?.errors?.nombre?.[0] ?? err.response?.data?.message ?? 'No se pudo guardar.');
        } finally {
            setTipoGuardando(false);
        }
    };

    const eliminarTipo = async () => {
        try {
            const { data } = await api.delete(`/tipos-precio/${tipoBorrar.id}`);
            toast.success(data?.desactivado ? 'Estaba en uso: se desactivó.' : 'Tipo de precio eliminado.');
            setTipoBorrar(null);
            const lista = await cargarTipos();
            // Si era el que se estaba viendo, se vuelve al principal.
            if (!lista.some((t) => String(t.id) === String(tipoId) && t.activo)) {
                const principal = lista.find((t) => t.principal);
                if (principal) setTipoId(String(principal.id));
            }
        } catch (err) {
            toast.error(err.response?.data?.message ?? 'No se pudo eliminar.');
        }
    };

    const columnasTipos = [
        {
            key: 'nombre',
            label: 'Tipo de precio',
            render: (row) => (
                <span className="inline-flex items-center gap-2 font-medium text-warm-900">
                    {row.principal && <Lock className="h-4 w-4 text-primary-600" />}
                    {row.nombre}
                    {row.principal && <Badge variant="blue">Principal</Badge>}
                </span>
            ),
        },
        {
            key: 'margen',
            label: '% sugerido',
            width: '120px',
            align: 'right',
            render: (row) => (row.margen != null ? `${num(row.margen)} %` : '—'),
        },
        { key: 'precios_count', label: 'Precios cargados', width: '140px', align: 'right', searchable: false },
        { key: 'clientes_count', label: 'Clientes', width: '100px', align: 'right', searchable: false },
        {
            key: 'activo',
            label: 'Estado',
            width: '100px',
            searchable: false,
            render: (row) => (row.activo ? <Badge variant="green">Activo</Badge> : <Badge variant="red">Inactivo</Badge>),
        },
        {
            type: 'actions',
            key: 'actions',
            label: 'Acciones',
            width: '110px',
            actions: (row) => (
                <>
                    {puede('catalogo.lista-precios.editar') && (
                        <button aria-label="Editar" title="Editar" onClick={() => abrirTipo(row)}
                            className="rounded-md p-1.5 text-primary-600 transition hover:bg-primary-50">
                            <Edit className="h-4 w-4" />
                        </button>
                    )}
                    {!row.principal && puede('catalogo.lista-precios.eliminar') && (
                        <button aria-label="Eliminar" title="Eliminar" onClick={() => setTipoBorrar(row)}
                            className="rounded-md p-1.5 text-red-600 transition hover:bg-red-50">
                            <Trash2 className="h-4 w-4" />
                        </button>
                    )}
                </>
            ),
        },
    ];

    const tiposActivos = tipos.filter((t) => t.activo);
    const refNombre = calc.ref.abrev.toUpperCase();

    return (
        <Layout>
            <PageHeader
                title="Lista de precios"
                description={
                    tab === 'precios'
                        ? 'Elige el producto y pon el precio de cada forma en que lo vendes.'
                        : 'Minorista, Mayorista… A cada cliente se le vende a su tipo de precio.'
                }
                actions={
                    tab === 'tipos' && puede('catalogo.lista-precios.crear') ? (
                        <CreateButton onClick={() => abrirTipo()}>Nuevo tipo de precio</CreateButton>
                    ) : null
                }
            />

            <div className="mb-4">
                <Tabs
                    items={[
                        { key: 'precios', label: 'Precios', icon: Tags },
                        { key: 'tipos', label: 'Tipos de precio', icon: ListChecks },
                    ]}
                    value={tab}
                    onChange={setTab}
                />
            </div>

            {tab === 'tipos' && (
                <DataTable columns={columnasTipos} rows={tipos} searchPlaceholder="Buscar tipos de precio..." emptyMessage="No hay tipos de precio" />
            )}

            {tab === 'precios' && (
                <div className="rounded-xl border border-edge bg-white shadow-sm">
                    <div className="grid gap-3 border-b border-edge p-5 lg:grid-cols-[1fr_14rem_7rem_auto] lg:items-end">
                        <SearchSelect
                            label="Producto"
                            value={productoId}
                            onChange={elegirProducto}
                            placeholder="Buscar producto por nombre o código…"
                            emptyText="Sin coincidencias"
                            options={productos.map((p) => ({ value: String(p.id), label: p.nombre, keywords: p.codigo }))}
                        />
                        <Select
                            label="Tipo de precio"
                            value={tipoId}
                            onChange={(e) => elegirTipo(e.target.value)}
                            options={tiposActivos.map((t) => ({
                                value: String(t.id),
                                label: t.principal ? `${t.nombre} (principal)` : t.nombre,
                            }))}
                        />
                        <Input
                            label="Margen %"
                            type="number"
                            step="any"
                            value={margenGeneral}
                            placeholder="25"
                            onChange={(e) => setMargenGeneral(e.target.value)}
                            className="text-right"
                            disabled={!puedeEditar || !detalle}
                        />
                        <Button type="button" variant="secondary" onClick={llenar} disabled={!puedeEditar || !detalle}>
                            Llenar %
                        </Button>
                    </div>

                    {!productoId ? (
                        <div className="p-5">
                            <Alert variant="info">Elige un producto para ver y poner sus precios.</Alert>
                        </div>
                    ) : cargando || !detalle ? (
                        <div className="flex justify-center py-16">
                            <Spinner size="lg" className="text-primary-600" />
                        </div>
                    ) : (
                        <>
                            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                                <label className="inline-flex items-center gap-2 font-medium text-warm-800">
                                    <input
                                        type="checkbox"
                                        checked={afectoIgv}
                                        disabled={!puedeEditar}
                                        onChange={(e) => cambiarIgv(e.target.checked)}
                                        className="h-4 w-4 rounded border-gray-300 accent-primary-600"
                                    />
                                    Afecto a IGV
                                    <span className="font-normal text-warm-500">(el precio ya incluye el 18 %)</span>
                                </label>
                                <span className="text-xs text-warm-500">
                                    Precios en {calc.moneda}
                                    {calc.tasa != null && calc.tasa !== 1 && ` · costo convertido al T.C. ${num(detalle.tipo_cambio)}`}
                                    {calc.tasa == null && ' · falta el tipo de cambio del producto para calcular el costo'}
                                    {tipo && !tipo.principal && ' · sin precio en este tipo, al vender rige el principal'}
                                </span>
                            </div>

                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[1080px] text-sm">
                                    <thead>
                                        <tr className="bg-primary-600 text-left text-xs font-semibold uppercase tracking-wide text-white">
                                            <th className={TH}>Presentación</th>
                                            <th className={`${TH} w-24`}>Desde</th>
                                            <th className={`${TH} w-24`}>Equivale</th>
                                            <th className={`${TH} w-28 text-right`}>Costo</th>
                                            <th className={`${TH} w-32`}>Precio</th>
                                            <th className={`${TH} w-24 text-right`}>IGV</th>
                                            <th className={`${TH} w-28`}>Margen %</th>
                                            <th className={`${TH} w-28 text-right`}>Costo por {refNombre}</th>
                                            <th className={`${TH} w-32`}>Precio por {refNombre}</th>
                                            <th className={`${TH} w-20 text-center`}>Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {filas.length === 0 && (
                                            <tr>
                                                <td colSpan={10} className="px-3 py-10 text-center text-warm-500">
                                                    Este producto no tiene formas de venta.
                                                </td>
                                            </tr>
                                        )}
                                        {filas.map((f, i) => {
                                            const p = calc.presentacion(f.presentacionId);
                                            const primera = i === 0 || String(filas[i - 1].presentacionId) !== String(f.presentacionId);
                                            const costo = calc.costo(p);
                                            const cuantas = calc.cuantasRef(p);
                                            return (
                                                <tr key={f.clave} className={primera ? '' : 'bg-gray-50/60'}>
                                                    <td className="px-3 py-2 font-semibold text-warm-900">
                                                        {primera ? p?.nombre : <span className="pl-3 font-normal text-warm-400">↳ por cantidad</span>}
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <input type="number" min="1" step="any" value={f.desde} placeholder="Ej. 100"
                                                            disabled={f.base || !puedeEditar}
                                                            onChange={(e) => ponerDesde(f.clave, e.target.value)}
                                                            className={INPUT} aria-label="Desde" />
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <Badge variant="blue">{num(cuantas)} {refNombre}</Badge>
                                                    </td>
                                                    <td className="px-3 py-2 text-right font-semibold text-warm-900">
                                                        {costo == null ? '—' : money(costo, calc.moneda)}
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <input type="number" min="0" step="any" value={f.precio}
                                                            placeholder={f.base ? '0.00' : 'Sin precio'}
                                                            disabled={!puedeEditar}
                                                            onChange={(e) => ponerPrecio(f.clave, e.target.value)}
                                                            className={INPUT} aria-label="Precio" />
                                                    </td>
                                                    <td className="px-3 py-2 text-right text-warm-600">
                                                        {afectoIgv && f.precio !== '' ? money(igvIncluido(f.precio), calc.moneda) : '—'}
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <input type="number" step="any" value={f.margen}
                                                            placeholder={costo > 0 ? '%' : 'sin costo'}
                                                            disabled={!puedeEditar || !(costo > 0)}
                                                            onChange={(e) => ponerMargen(f.clave, e.target.value)}
                                                            className={INPUT} aria-label="Margen" />
                                                    </td>
                                                    <td className="px-3 py-2 text-right font-semibold text-warm-900">
                                                        {costo == null ? '—' : money(costo / cuantas, calc.moneda)}
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <input type="number" min="0" step="any" value={f.precioRef}
                                                            disabled={!puedeEditar}
                                                            onChange={(e) => ponerPrecioRef(f.clave, e.target.value)}
                                                            className={INPUT} aria-label={`Precio por ${calc.ref.nombre}`} />
                                                    </td>
                                                    <td className="px-3 py-2 text-center">
                                                        {puedeEditar && (primera ? (
                                                            <button type="button" onClick={() => agregarFila(f.presentacionId)}
                                                                title="Otro precio desde una cantidad mayor"
                                                                className="rounded-md p-1.5 text-primary-600 transition hover:bg-primary-50">
                                                                <Plus className="h-4 w-4" />
                                                            </button>
                                                        ) : (
                                                            <button type="button" onClick={() => quitarFila(f.clave)} title="Quitar este precio"
                                                                className="rounded-md p-1.5 text-red-600 transition hover:bg-red-50">
                                                                <Trash2 className="h-4 w-4" />
                                                            </button>
                                                        ))}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {puedeEditar && (
                                <div className="flex justify-end gap-2 border-t border-edge px-5 py-4">
                                    <Button variant="secondary" onClick={cancelar} disabled={!sucio || guardando}>
                                        Cancelar
                                    </Button>
                                    <Button onClick={guardar} loading={guardando} disabled={!sucio}>
                                        Guardar precios
                                    </Button>
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}

            <Modal
                open={Boolean(tipoModal)}
                onClose={() => setTipoModal(null)}
                title={tipoModal?.editing ? 'Editar tipo de precio' : 'Nuevo tipo de precio'}
                description={
                    tipoModal?.editing?.principal
                        ? 'El principal es el precio de siempre: se puede renombrar, no desactivar.'
                        : 'Luego pones sus precios en la lista, o los llenas con su % sugerido.'
                }
                size="md"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setTipoModal(null)}>Cancelar</Button>
                        <Button type="submit" form="tipo-precio-form" loading={tipoGuardando}>
                            {tipoModal?.editing ? 'Guardar' : 'Crear'}
                        </Button>
                    </>
                }
            >
                <form id="tipo-precio-form" onSubmit={guardarTipo} noValidate className="space-y-4">
                    <Input label="Nombre" placeholder="Ej: Mayorista" value={tipoForm.nombre}
                        onChange={(e) => setTipoForm((f) => ({ ...f, nombre: e.target.value }))} />
                    <Input label="% de ganancia sugerido (opcional)" type="number" step="any" min="0" placeholder="Ej: 15"
                        value={tipoForm.margen}
                        onChange={(e) => setTipoForm((f) => ({ ...f, margen: e.target.value }))} />
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                        <input type="checkbox" checked={tipoForm.activo} disabled={Boolean(tipoModal?.editing?.principal)}
                            onChange={(e) => setTipoForm((f) => ({ ...f, activo: e.target.checked }))}
                            className="h-4 w-4 rounded border-gray-300 accent-primary-600" />
                        Activo
                    </label>
                </form>
            </Modal>

            <Modal
                open={Boolean(tipoBorrar)}
                onClose={() => setTipoBorrar(null)}
                title="Eliminar tipo de precio"
                description={`¿Eliminar "${tipoBorrar?.nombre ?? ''}"?`}
                size="sm"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setTipoBorrar(null)}>Cancelar</Button>
                        <Button variant="danger" onClick={eliminarTipo}>Eliminar</Button>
                    </>
                }
            >
                <Alert variant="warning">Si ya tiene precios o clientes, se desactiva en lugar de eliminarse.</Alert>
            </Modal>
        </Layout>
    );
}
