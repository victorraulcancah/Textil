import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
    Download,
    Edit,
    Eye,
    FileSpreadsheet,
    History,
    Layers,
    Package,
    Palette,
    Plus,
    PlusCircle,
    Save,
    Tag,
    Trash2,
} from 'lucide-react';
import api, { asList } from '../lib/api';
import { calcularPresentaciones, describirContenido } from '../lib/unidades';
import { useToast } from '../lib/toast';
import { useAuth } from '../lib/auth';
import Layout from '../components/Layout';
import MenuContextual from '../components/MenuContextual';
import PageHeader, { CreateButton } from '../components/PageHeader';
import { Alert, Badge, Button, DataTable, Input, Modal, OptionSelect, SearchSelect, Select, Tabs, cn } from '../components/ui';

/**
 * Hasta 4 decimales: el costo por gramo puede ser S/ 0.0028. En USD porque las
 * compras al exterior se cotizan así; el resto del sistema sigue en soles.
 */
const money = (n, moneda = 'PEN') =>
    new Intl.NumberFormat(moneda === 'USD' ? 'en-US' : 'es-PE', {
        style: 'currency',
        currency: moneda === 'USD' ? 'USD' : 'PEN',
        maximumFractionDigits: 4,
    }).format(Number(n) || 0);

const emptyProducto = {
    codigo: '',
    codigo_barras: '',
    nombre: '',
    nombre_tecnico: '',
    descripcion_ticket: '',
    categoria_id: '',
    sub_categoria_id: '',
    // Solo para telas: de ahí sale el código si se deja en blanco.
    tipo_tela_id: '',
    marca_id: '',
    sub_marca_id: '',
    unidad_medida_id: '',
    factor_compra_base: '1',
    stock_minimo: '',
    stock_maximo: '',
    activo: true,
    // Ficha técnica de tela (opcional: mercería y avíos la dejan vacía).
    descripcion: '',
    composicion: '',
    codigo_arancelario: '',
    ancho_cm: '',
    gramaje: '',
    peso_por_metro: '',
    tipo_tejido: '',
    elasticidad: '',
    minimo_compra: '',
    unidad_minimo_compra: '',
    propiedades: '',
    // En qué moneda se compra y en qué moneda se vende esta tela. Suelen
    // diferir: las compras al exterior son en dólares, las ventas en soles.
    moneda_compra: 'PEN',
    moneda_venta: 'PEN',
    // Solo cuando esas dos monedas difieren: cuántos soles vale un dólar al
    // calcular el precio de venta y la ganancia.
    tipo_cambio: '',
};

/** Pestañas del modal: el formulario es largo y se parte por temas. */
const TABS = [
    { key: 'general', label: 'General' },
    { key: 'ficha', label: 'Ficha técnica' },
    { key: 'colores', label: 'Colores' },
    { key: 'comercial', label: 'Compra y venta' },
];

/**
 * A qué pestaña pertenece cada campo, para llevar al usuario hasta el error.
 * Sin esto, un fallo en "Compra y venta" deja el modal quieto en General y
 * nadie entiende por qué no guarda.
 */
const PESTANA_DEL_CAMPO = {
    general: [
        'codigo', 'codigo_barras', 'nombre', 'descripcion_ticket', 'activo',
        'categoria_id', 'sub_categoria_id', 'marca_id', 'sub_marca_id', 'proveedores',
    ],
    ficha: [
        'composicion', 'ancho_cm', 'gramaje', 'peso_por_metro', 'tipo_tejido',
        'elasticidad', 'minimo_compra', 'descripcion', 'propiedades',
    ],
    colores: ['colores'],
    comercial: [
        'unidad_medida_id', 'unidad_base_id', 'unidad_compra_id',
        'factor_compra_base', 'presentaciones', 'stock_minimo', 'stock_maximo', 'colores',
        // Nombres que usa la validación del propio formulario.
        'compra_unidad', 'compra_cantidad', 'compra_contenido', 'ventas', 'tipo_cambio',
    ],
};

/** La primera pestaña que tiene un error, para saltar a ella. */
function pestanaConError(campos) {
    const raiz = (c) => String(c).split('.')[0];

    for (const [pestana, suyos] of Object.entries(PESTANA_DEL_CAMPO)) {
        if (campos.some((c) => suyos.includes(raiz(c)))) {
            return pestana;
        }
    }
    return null;
}

/** Un color del muestrario: "Azul Marino - Cód. 402". */
const colorVacio = () => ({
    color_id: '',
    nombre: '',
    nombre_proveedor: '',
    // El metraje del rollo de este color (su "factor").
    metros_por_rollo: '',
    codigo: '',
    hex: '#1f3a93',
});

const formatoMetros = (n) => new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 }).format(Number(n) || 0);

/** Un proveedor de la tela: la misma la puede traer más de uno. */
const provVacio = () => ({
    proveedor_id: '',
    codigo_proveedor: '',
    precio_referencia: '',
    dias_entrega: '',
    principal: false,
});

/** Cómo se compra el producto: "un saco que trae 50 kilos, a S/ 140". */
const compraVacia = () => ({
    unidad_compra_id: '',
    cantidad: '',
    unidad_contenido_id: '',
    precio: '',
});

/** Un formato en que se vende: "por kilo, con 25% de ganancia". */
const ventaVacia = () => ({ unidad_id: '', margen: '25', precio_venta: '' });

export default function Productos() {
    const toast = useToast();
    const navigate = useNavigate();
    const { puede } = useAuth();
    /** Clic derecho sobre un producto: dónde se abrió el menú y de qué producto. */
    const [menu, setMenu] = useState(null);
    const cerrarMenu = useCallback(() => setMenu(null), []);
    /** El producto cuyos colores (con su stock) se ven en el modal. */
    const [coloresDe, setColoresDe] = useState(null);
    const [productos, setProductos] = useState([]);
    const [categorias, setCategorias] = useState([]);
    const [marcas, setMarcas] = useState([]);
    const [proveedores, setProveedores] = useState([]);
    const [subMarcas, setSubMarcas] = useState([]);
    const [unidades, setUnidades] = useState([]);
    /** Catálogo compartido de colores: se crea una vez y toda tela lo elige de aquí. */
    const [coloresCatalogo, setColoresCatalogo] = useState([]);
    /** Familia + tipo de tela: de ahí sale el código "01-familia-tipo". */
    const [tiposTela, setTiposTela] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const [modalOpen, setModalOpen] = useState(false);
    const [tab, setTab] = useState('general');
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState(emptyProducto);
    /** Último peso por metro que salió del ancho y el gramaje (no lo escrito a mano). */
    const pesoAutoRef = useRef('');
    const [compra, setCompra] = useState(compraVacia);
    const [ventas, setVentas] = useState([ventaVacia()]);
    const [colores, setColores] = useState([]);
    /** Carga de colores desde Excel: si está subiendo y lo que no pudo agregar. */
    const [cargandoColores, setCargandoColores] = useState(false);
    const [avisosColores, setAvisosColores] = useState([]);
    const excelColoresRef = useRef(null);
    /** Proveedores que traen esta tela, cada uno con su código y su precio. */
    const [provs, setProvs] = useState([]);
    /** Foto elegida en el formulario; se sube después de guardar el producto. */
    const [imagenFile, setImagenFile] = useState(null);
    const [errors, setErrors] = useState({});
    const [saving, setSaving] = useState(false);

    const [deleteTarget, setDeleteTarget] = useState(null);
    const [detalle, setDetalle] = useState(null);
    const [deleting, setDeleting] = useState(false);

    const [quick, setQuick] = useState(null); // { tipo }

    const [filterEstado, setFilterEstado] = useState('');
    const [filterCategoria, setFilterCategoria] = useState('');
    const [filterMarca, setFilterMarca] = useState('');
    const [filterTipoTela, setFilterTipoTela] = useState('');
    const [activeFilters, setActiveFilters] = useState({});

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [prodsRes, catRes, marRes, subRes, uniRes, provRes, colRes, tipRes] = await Promise.all([
                api.get('/productos'),
                api.get('/categorias'),
                api.get('/marcas'),
                api.get('/sub-marcas'),
                api.get('/unidades-medida'),
                api.get('/proveedores'),
                api.get('/colores'),
                api.get('/tipos-tela'),
            ]);
            setProductos(asList(prodsRes));
            setCategorias(asList(catRes));
            setMarcas(asList(marRes));
            setSubMarcas(asList(subRes));
            setUnidades(asList(uniRes));
            setProveedores(asList(provRes));
            setColoresCatalogo(asList(colRes));
            setTiposTela(asList(tipRes));
        } catch {
            setError('No se pudieron cargar los productos.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    // Peso por metro = ancho (m) × gramaje ÷ 1000. Se rellena solo al cargar
    // ancho y gramaje, pero únicamente si el campo está vacío o trae lo que
    // este mismo cálculo puso antes: lo que alguien escribió a mano (el dato
    // de la ficha del fabricante) se respeta.
    useEffect(() => {
        const ancho = Number(form.ancho_cm);
        const gramaje = Number(form.gramaje);
        if (!modalOpen || !(ancho > 0 && gramaje > 0)) return;

        const calculado = ((ancho / 100) * (gramaje / 1000)).toFixed(4);
        setForm((p) => {
            const actual = String(p.peso_por_metro ?? '');
            if (actual !== '' && actual !== pesoAutoRef.current) return p;
            pesoAutoRef.current = calculado;
            return actual === calculado ? p : { ...p, peso_por_metro: calculado };
        });
    }, [form.ancho_cm, form.gramaje, modalOpen]);

    // ---- Catálogos derivados ----
    const categoriasRaiz = categorias.filter((c) => !c.categoria_padre_id);
    const subCategoriasDe = (padreId) =>
        categorias.filter((c) => String(c.categoria_padre_id ?? '') === String(padreId));
    const subMarcasDe = (marcaId) =>
        subMarcas.filter((s) => String(s.marca_id) === String(marcaId));

    const unidadOptions = unidades.map((u) => ({
        value: String(u.id),
        label: u.abreviatura ? `${u.nombre} (${u.abreviatura})` : u.nombre,
    }));
    const unidadNombre = (id) => unidades.find((u) => String(u.id) === String(id))?.nombre ?? '';
    /**
     * El nombre con que se guarda el formato de esa unidad. Al editar, el que
     * ya tenía ("Metro (al corte)"): el servidor reconoce los formatos por
     * nombre, y con otro lo daría por nuevo y se perderían sus precios.
     */
    const nombreDeFormato = (unidadId) =>
        (editing?.presentaciones ?? []).find(
            (p) => p.activo !== false && String(p.unidad_base?.id ?? '') === String(unidadId),
        )?.nombre || unidadNombre(unidadId);

    // ---- Abrir / editar ----
    const openCreate = () => {
        setEditing(null);
        pesoAutoRef.current = '';
        setForm(emptyProducto);
        setCompra(compraVacia());
        // Un producto se vende en una sola unidad: la tela, por metro.
        const unidadMetro = unidades.find((u) => (u.abreviatura ?? '').toLowerCase() === 'm');
        setVentas([{ ...ventaVacia(), unidad_id: unidadMetro ? String(unidadMetro.id) : '' }]);
        setColores([]);
        setAvisosColores([]);
        setProvs([]);
        setImagenFile(null);
        setErrors({});
        setTab('general');
        setModalOpen(true);
    };

    const openEdit = (prod) => {
        const relId = (direct, rel) =>
            prod[direct] ? String(prod[direct]) : prod[rel]?.id ? String(prod[rel].id) : '';
        setEditing(prod);
        // Si el peso guardado es justo lo que da el ancho y el gramaje, sigue
        // siendo "automático": cambiar el ancho lo vuelve a calcular.
        const pesoDeFicha =
            Number(prod.ancho_cm) > 0 && Number(prod.gramaje) > 0
                ? ((Number(prod.ancho_cm) / 100) * (Number(prod.gramaje) / 1000)).toFixed(4)
                : '';
        pesoAutoRef.current = pesoDeFicha !== '' && String(prod.peso_por_metro ?? '') === pesoDeFicha ? pesoDeFicha : '';
        setForm({
            codigo: prod.codigo ?? '',
            codigo_barras: prod.codigo_barras ?? '',
            nombre: prod.nombre ?? '',
            nombre_tecnico: prod.nombre_tecnico ?? '',
            descripcion_ticket: prod.descripcion_ticket ?? '',
            categoria_id: relId('categoria_id', 'categoria'),
            sub_categoria_id: relId('sub_categoria_id', 'sub_categoria'),
            tipo_tela_id: relId('tipo_tela_id', 'tipo_tela'),
            marca_id: relId('marca_id', 'marca'),
            sub_marca_id: relId('sub_marca_id', 'sub_marca'),
            unidad_medida_id: relId('unidad_medida_id', 'unidad_medida'),
            factor_compra_base: prod.factor_compra_base ?? '1',
            stock_minimo: prod.stock_minimo ?? '',
            stock_maximo: prod.stock_maximo ?? '',
            activo: prod.activo !== false,
            descripcion: prod.descripcion ?? '',
            composicion: prod.composicion ?? '',
            codigo_arancelario: prod.codigo_arancelario ?? '',
            ancho_cm: prod.ancho_cm ?? '',
            gramaje: prod.gramaje ?? '',
            peso_por_metro: prod.peso_por_metro ?? '',
            tipo_tejido: prod.tipo_tejido ?? '',
            elasticidad: prod.elasticidad ?? '',
            minimo_compra: prod.minimo_compra ?? '',
            unidad_minimo_compra: prod.unidad_minimo_compra ?? '',
            propiedades: prod.propiedades ?? '',
            moneda_compra: prod.moneda_compra || 'PEN',
            moneda_venta: prod.moneda_venta || 'PEN',
            tipo_cambio: prod.tipo_cambio != null ? String(prod.tipo_cambio) : '',
        });
        setTab('general');
        // Se reconstruye "compro / vendo" desde lo guardado.
        const baseId = relId('unidad_medida_id', 'unidad_medida');
        const contenido = describirContenido(unidades, baseId, prod.factor_compra_base);
        const unidadCompraId = relId('unidad_compra_id', 'unidad_compra');
        const pres = Array.isArray(prod.presentaciones) ? prod.presentaciones : [];
        const precioCompraTotal = pres.find(
            (p) => Number(p.factor_conversion) === Number(prod.factor_compra_base),
        )?.precio_compra;

        setCompra({
            unidad_compra_id: unidadCompraId,
            cantidad: contenido.cantidad,
            unidad_contenido_id: contenido.unidad_contenido_id,
            // Si no se vendía el envase entero, se deduce del costo por unidad base.
            precio:
                precioCompraTotal != null
                    ? String(precioCompraTotal)
                    : String(
                          (Number(pres[0]?.precio_compra ?? 0) /
                              (Number(pres[0]?.factor_conversion) || 1)) *
                              (Number(prod.factor_compra_base) || 0) || '',
                      ),
        });
        // Se vende en una sola unidad: la del metro si la tiene; si no, la menor.
        const activas = pres.filter((p) => p.activo !== false);
        const principal =
            activas.find((p) => (p.unidad_base?.abreviatura ?? '').toLowerCase() === 'm') ??
            [...activas].sort((a, b) => (Number(a.factor_conversion) || 0) - (Number(b.factor_conversion) || 0))[0];
        setVentas(
            principal
                ? [
                      {
                          unidad_id: principal.unidad_base?.id ? String(principal.unidad_base.id) : '',
                          margen: principal.margen != null ? String(principal.margen) : '',
                          precio_venta: principal.precio_venta != null ? String(principal.precio_venta) : '',
                      },
                  ]
                : [ventaVacia()],
        );
        setAvisosColores([]);
        setProvs(
            (Array.isArray(prod.proveedores) ? prod.proveedores : []).map((pv) => ({
                proveedor_id: String(pv.proveedor_id ?? ''),
                codigo_proveedor: pv.codigo_proveedor ?? '',
                precio_referencia: pv.precio_referencia != null ? String(pv.precio_referencia) : '',
                dias_entrega: pv.dias_entrega != null ? String(pv.dias_entrega) : '',
                principal: Boolean(pv.principal),
            })),
        );
        setColores(
            (Array.isArray(prod.colores) ? prod.colores : []).map((c) => ({
                color_id: c.color_id ? String(c.color_id) : '',
                nombre: c.nombre ?? '',
                nombre_proveedor: c.nombre_proveedor ?? '',
                metros_por_rollo: c.metros_por_rollo != null ? String(Number(c.metros_por_rollo)) : '',
                codigo: c.codigo ?? '',
                hex: c.hex ?? '#1f3a93',
            })),
        );
        setImagenFile(null);
        setErrors({});
        setModalOpen(true);
    };

    const setField = (field) => (e) => {
        const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
        setForm((prev) => ({ ...prev, [field]: value }));
        setErrors((prev) => ({ ...prev, [field]: undefined }));
    };

    // ---- Formatos de venta ----
    const setCompraField = (campo) => (e) => {
        const valor = e.target.value;
        setCompra((prev) => ({ ...prev, [campo]: valor }));
    };

    /**
     * El % de ganancia y el precio de venta son dos vistas del mismo dato: al
     * mover uno se recalcula el otro sobre el costo de esa fila.
     */
    const setVentaField = (index, campo, valor) =>
        setVentas((prev) =>
            prev.map((v, i) => {
                if (i !== index) return v;

                if (campo === 'margen') {
                    // Se limpia el precio para que vuelva a derivarse del %.
                    return { ...v, margen: valor, precio_venta: '' };
                }

                if (campo === 'precio_venta') {
                    const costo = costoDe(v.unidad_id);
                    const precio = Number(valor);
                    const margen =
                        costo > 0 && valor !== '' && Number.isFinite(precio)
                            ? String(+((precio / costo - 1) * 100).toFixed(1))
                            : v.margen;
                    return { ...v, precio_venta: valor, margen };
                }

                return { ...v, [campo]: valor };
            }),
        );

    // Todo el cálculo (unidad base, factores y costos) sale de compra + ventas.
    /** "1 saco" una vez elegida la unidad de compra; si no, "cada uno". */
    const unidadCompraTexto = compra.unidad_compra_id
        ? `1 ${unidadNombre(compra.unidad_compra_id).toLowerCase()}`
        : 'cada uno';

    // Compra y venta en monedas distintas (dólares → soles): el costo hay que
    // convertirlo antes de aplicarle el % de ganancia, o se suman dólares con soles.
    const monedasDistintas = form.moneda_compra !== form.moneda_venta;
    const tipoCambio = Number(form.tipo_cambio) > 0 ? Number(form.tipo_cambio) : null;
    // Cuánto vale 1 de la moneda de compra en la moneda de venta; null = falta el dato.
    const tasa = !monedasDistintas
        ? 1
        : tipoCambio == null
          ? null
          : form.moneda_compra === 'USD'
            ? tipoCambio
            : 1 / tipoCambio;

    /** La unidad en que se vende (el metro, en una tela). */
    const ventaPrincipal = ventas[0] ?? ventaVacia();
    const vendePorMetro =
        (unidades.find((u) => String(u.id) === String(ventaPrincipal.unidad_id))?.abreviatura ?? '').toLowerCase() ===
        'm';

    /**
     * Una tela que se compra por rollo (o por metro) no necesita decir cuánto
     * trae: cada rollo trae el metraje de su color (la tabla de la tela) y un
     * metro, un metro. El formato de compra toma como contenido el promedio
     * del metraje de los colores, en metros.
     */
    const unidadCompra = unidades.find((u) => String(u.id) === String(compra.unidad_compra_id)) ?? null;
    const unidadMetro = unidades.find((u) => (u.abreviatura ?? '').toLowerCase() === 'm') ?? null;
    const compraPorRollo = /rollo/i.test(`${unidadCompra?.nombre ?? ''} ${unidadCompra?.abreviatura ?? ''}`);
    const compraPorMetro = (unidadCompra?.abreviatura ?? '').toLowerCase() === 'm';
    const contenidoAutomatico = vendePorMetro && Boolean(unidadMetro) && (compraPorRollo || compraPorMetro);
    const metrajeColores = useMemo(() => {
        const metrajes = colores.map((c) => Number(c.metros_por_rollo) || 0).filter((m) => m > 0);
        return metrajes.length
            ? Math.round((metrajes.reduce((suma, m) => suma + m, 0) / metrajes.length) * 100) / 100
            : 0;
    }, [colores]);
    const compraEfectiva = useMemo(
        () =>
            contenidoAutomatico
                ? {
                      ...compra,
                      cantidad: String(compraPorMetro ? 1 : metrajeColores || ''),
                      unidad_contenido_id: String(unidadMetro.id),
                  }
                : compra,
        [compra, contenidoAutomatico, compraPorMetro, metrajeColores, unidadMetro],
    );

    /**
     * Lo que se guarda: la unidad en que se vende y, aparte, la de compra (sin
     * ella no se podría registrar la compra en esa unidad). Ya no hay formatos:
     * un producto es uno solo y lo que varía es el color y el metraje del rollo.
     */
    const ventasParaCalculo = useMemo(() => {
        const lista = ventas.filter((v) => v.unidad_id).slice(0, 1);
        if (
            compra.unidad_compra_id &&
            !lista.some((v) => String(v.unidad_id) === String(compra.unidad_compra_id))
        ) {
            lista.push({ ...ventaVacia(), unidad_id: String(compra.unidad_compra_id) });
        }
        return lista;
    }, [ventas, compra.unidad_compra_id]);

    const calculo = useMemo(
        () => calcularPresentaciones({ unidades, compra: compraEfectiva, ventas: ventasParaCalculo, tasa }),
        [unidades, compraEfectiva, ventasParaCalculo, tasa],
    );

    /** Al editar: los formatos que tenía y que, al guardar, dejan de venderse. */
    const formatosQueSalen = useMemo(() => {
        if (!editing) return [];
        const quedan = new Set(calculo.filas.map((fila) => nombreDeFormato(fila.unidad_id)));
        return (editing.presentaciones ?? [])
            .filter((p) => p.activo !== false && !quedan.has(p.nombre))
            .map((p) => p.nombre);
    }, [editing, calculo]); // eslint-disable-line react-hooks/exhaustive-deps

    const filaDe = (unidadId) =>
        calculo.filas.find((f) => String(f.unidad_id) === String(unidadId)) ?? null;
    // Lo que cuesta, en la moneda en que se vende: sobre eso se calcula el margen.
    const costoDe = (unidadId) => filaDe(unidadId)?.costo_en_venta ?? 0;
    /** Number -> texto sin ceros de relleno: 3.5 y 0.0035, no 3.5000. */
    const conDecimales = (n) => String(+Number(n).toFixed(4));

    // ---- Guardar ----
    const validate = () => {
        const next = {};
        // El código ya no se pide en el formulario: lo genera el servidor.
        if (!form.nombre.trim()) next.nombre = 'Ingrese el nombre';
        if (!compra.unidad_compra_id) next.compra_unidad = 'Indique en qué compra el producto';
        if (contenidoAutomatico) {
            // Lo que trae cada rollo sale del metraje de sus colores.
            if (!(Number(compraEfectiva.cantidad) > 0)) {
                next.compra_cantidad = 'Pon el metraje del rollo de los colores en la tabla de la tela';
            }
        } else {
            if (!(Number(compra.cantidad) > 0)) next.compra_cantidad = 'Indique cuánto trae';
            if (!compra.unidad_contenido_id) next.compra_contenido = 'Indique la unidad del contenido';
        }
        if (!ventaPrincipal.unidad_id) {
            next.ventas = 'Elige en qué unidad se vende (la tela, por metro)';
        }
        // Sin tipo de cambio no hay cómo sugerir el precio: o se escribe la tasa
        // o cada formato lleva su precio a mano. Guardar un 0 en silencio dejaría
        // la tela a la venta gratis.
        if (monedasDistintas && tipoCambio == null) {
            const sinPrecio = ventas
                .filter((v) => v.unidad_id)
                .some((v) => !(Number(v.precio_venta) > 0));
            if (sinPrecio) {
                next.tipo_cambio = `Compras en ${form.moneda_compra} y ventas en ${form.moneda_venta}: escribe el tipo de cambio para sugerir el precio de los formatos nuevos`;
            }
        }
        setErrors(next);

        if (Object.keys(next).length) {
            // El error casi siempre está en otra pestaña: se lleva al usuario
            // hasta él en vez de dejar el botón sin reacción aparente.
            const destino = pestanaConError(Object.keys(next));
            if (destino) setTab(destino);
            toast.error(Object.values(next)[0]);
            return false;
        }

        return true;
    };

    const buildPresentaciones = () =>
        calculo.filas.map((f, i) => ({
            nombre: nombreDeFormato(f.unidad_id) || `Presentación ${i + 1}`,
            unidad_base_id: f.unidad_id,
            factor_conversion: f.factor,
            precio_compra: +f.precio_compra.toFixed(4),
            margen: f.margen,
            precio_venta: +f.precio_venta.toFixed(4),
            cantidad_complementaria: 0,
        }));

    const handleSave = async () => {
        if (!validate()) return;
        setSaving(true);
        setErrors({});

        const num = (v) => (v === '' || v == null ? undefined : Number(v));
        const str = (v) => (v && String(v).trim() ? String(v).trim() : undefined);

        const payload = {
            codigo: form.codigo.trim(),
            nombre: form.nombre.trim(),
            nombre_tecnico: str(form.nombre_tecnico),
            // La unidad base es el formato de venta más pequeño, calculado solo.
            unidad_medida_id: calculo.baseId,
            unidad_base_id: calculo.baseId,
            unidad_compra_id: compra.unidad_compra_id || undefined,
            activo: form.activo,
            codigo_barras: str(form.codigo_barras),
            descripcion_ticket: str(form.descripcion_ticket),
            categoria_id: form.categoria_id || undefined,
            sub_categoria_id: form.sub_categoria_id || undefined,
            tipo_tela_id: form.tipo_tela_id || undefined,
            marca_id: form.marca_id || undefined,
            sub_marca_id: form.sub_marca_id || undefined,
            factor_compra_base: calculo.factorCompraBase || undefined,
            stock_minimo: num(form.stock_minimo),
            stock_maximo: num(form.stock_maximo),
            descripcion: str(form.descripcion),
            composicion: str(form.composicion),
            codigo_arancelario: str(form.codigo_arancelario),
            ancho_cm: num(form.ancho_cm),
            gramaje: num(form.gramaje),
            peso_por_metro: num(form.peso_por_metro),
            tipo_tejido: str(form.tipo_tejido),
            elasticidad: str(form.elasticidad),
            minimo_compra: num(form.minimo_compra),
            unidad_minimo_compra: str(form.unidad_minimo_compra),
            propiedades: str(form.propiedades),
            moneda_compra: form.moneda_compra || 'PEN',
            moneda_venta: form.moneda_venta || 'PEN',
            // Solo tiene sentido con monedas distintas; si no, se limpia.
            tipo_cambio: monedasDistintas ? (tipoCambio ?? null) : null,
            presentaciones: buildPresentaciones(),
            colores: colores
                .filter((c) => c.nombre.trim())
                .map((c) => ({
                    nombre: c.nombre.trim(),
                    color_id: c.color_id || undefined,
                    nombre_proveedor: str(c.nombre_proveedor),
                    // Vacío como null: así se puede borrar.
                    metros_por_rollo: Number(c.metros_por_rollo) > 0 ? Number(c.metros_por_rollo) : null,
                    codigo: str(c.codigo),
                    hex: str(c.hex),
                })),
            proveedores: provs
                .filter((pv) => pv.proveedor_id)
                .map((pv) => ({
                    proveedor_id: Number(pv.proveedor_id),
                    codigo_proveedor: str(pv.codigo_proveedor),
                    precio_referencia: num(pv.precio_referencia),
                    dias_entrega: num(pv.dias_entrega),
                    principal: Boolean(pv.principal),
                })),
        };

        try {
            let productoId = editing?.id;
            if (editing) {
                await api.put(`/productos/${editing.id}`, payload);
                toast.success('Producto actualizado correctamente.');
            } else {
                const { data } = await api.post('/productos', payload);
                productoId = data?.data?.id ?? data?.id;
                toast.success('Producto creado correctamente.');
            }

            // La foto va aparte: el producto se manda como JSON y una imagen
            // necesita multipart.
            if (imagenFile && productoId) {
                const fd = new FormData();
                fd.append('imagen', imagenFile);
                try {
                    await api.post(`/productos/${productoId}/imagen`, fd, {
                        headers: { 'Content-Type': 'multipart/form-data' },
                    });
                } catch {
                    toast.error('El producto se guardó, pero no se pudo subir la foto.');
                }
            }
            setModalOpen(false);
            await load();
        } catch (err) {
            if (err.response?.status === 422) {
                const validation = err.response.data?.errors ?? {};
                setErrors(Object.fromEntries(Object.entries(validation).map(([k, v]) => [k, v[0]])));

                // Se dice qué está mal y se abre la pestaña donde está, en vez
                // de un "revisa los datos" que obliga a buscar a ciegas.
                const campos = Object.keys(validation);
                const destino = pestanaConError(campos);
                if (destino) setTab(destino);

                const mensajes = Object.values(validation).map((v) => v[0]);
                toast.error(
                    mensajes[0]
                        ? mensajes[0] + (mensajes.length > 1 ? ` (y ${mensajes.length - 1} error(es) más)` : '')
                        : 'Verifique los datos del producto.',
                );
            } else {
                // El servidor rechaza cambios que dejarían el stock mal contado
                // (409) y explica por qué. Repetirlo tal cual es más útil que un
                // "no se pudo guardar" que obliga a adivinar.
                toast.error(err.response?.data?.message ?? 'No se pudo guardar el producto.');
            }
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        setDeleting(true);
        try {
            await api.delete(`/productos/${deleteTarget.id}`);
            toast.success('Producto eliminado.');
            setDeleteTarget(null);
            await load();
        } catch {
            toast.error('No se pudo eliminar el producto.');
        } finally {
            setDeleting(false);
        }
    };

    // ---- Creación rápida de catálogos ----
    /**
     * La plantilla de colores (Código, Nombre, Nombre del proveedor, Metraje y
     * el catálogo aparte). Al editar trae los colores guardados de la tela; si
     * no, unas filas de ejemplo.
     */
    const descargarPlantillaColores = async () => {
        try {
            const { data } = await api.get('/productos/plantilla-colores', {
                params: editing ? { producto_id: editing.id } : {},
                responseType: 'blob',
            });
            const url = URL.createObjectURL(data);
            const a = document.createElement('a');
            a.href = url;
            a.download = editing?.colores?.length ? `colores-${editing.codigo}.xlsx` : 'plantilla-colores.xlsx';
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 4000);
        } catch {
            toast.error('No se pudo descargar la plantilla.');
        }
    };

    /**
     * Los colores de un Excel. El servidor los cruza con el catálogo (y crea
     * los que falten); aquí se suman a la lista sin repetir los que ya están.
     * Se guardan con el producto, igual que los que se agregan a mano.
     */
    const subirExcelColores = async (e) => {
        const archivo = e.target.files?.[0];
        e.target.value = '';
        if (!archivo) return;

        setCargandoColores(true);
        setAvisosColores([]);
        try {
            const fd = new FormData();
            fd.append('archivo', archivo);
            const { data } = await api.post('/productos/colores-excel', fd, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });

            const lista = colores.filter((c) => c.color_id || c.nombre.trim());
            let agregados = 0;
            for (const c of data.colores ?? []) {
                const i = lista.findIndex(
                    (x) =>
                        (x.color_id && String(x.color_id) === String(c.color_id)) ||
                        x.nombre.trim().toLowerCase() === String(c.nombre).toLowerCase(),
                );
                if (i !== -1) {
                    // Ya estaba: el Excel completa o corrige su proveedor y su metraje.
                    lista[i] = {
                        ...lista[i],
                        ...(c.nombre_proveedor ? { nombre_proveedor: c.nombre_proveedor } : {}),
                        ...(c.metros_por_rollo ? { metros_por_rollo: String(c.metros_por_rollo) } : {}),
                    };
                    continue;
                }
                lista.push({
                    color_id: String(c.color_id),
                    nombre: c.nombre,
                    codigo: c.codigo ?? '',
                    hex: c.hex || '#1f3a93',
                    nombre_proveedor: c.nombre_proveedor ?? '',
                    metros_por_rollo: c.metros_por_rollo ? String(c.metros_por_rollo) : '',
                });
                agregados++;
            }
            setColores(lista);
            setAvisosColores(data.advertencias ?? []);

            // Los nuevos del catálogo, para que el selector los tenga.
            if ((data.nuevos ?? []).length) {
                api.get('/colores').then((r) => setColoresCatalogo(asList(r))).catch(() => {});
            }

            const nuevos = (data.nuevos ?? []).length;
            toast.success(
                `${agregados} color${agregados === 1 ? '' : 'es'} agregado${agregados === 1 ? '' : 's'}` +
                    (nuevos ? ` · ${nuevos} nuevo${nuevos === 1 ? '' : 's'} en el catálogo` : '') +
                    '. Se guardan con el producto.',
            );
        } catch (err) {
            const v = err.response?.data?.errors;
            toast.error(
                (v && Object.values(v)[0]?.[0]) ?? err.response?.data?.message ?? 'No se pudo leer el Excel.',
            );
        } finally {
            setCargandoColores(false);
        }
    };

    const handleQuickCreated = async (tipo, nuevo, quickInfo) => {
        await load();
        if (tipo === 'marca') setForm((p) => ({ ...p, marca_id: String(nuevo.id), sub_marca_id: '' }));
        if (tipo === 'submarca') setForm((p) => ({ ...p, sub_marca_id: String(nuevo.id) }));
        if (tipo === 'categoria')
            setForm((p) => ({ ...p, categoria_id: String(nuevo.id), sub_categoria_id: '' }));
        if (tipo === 'subcategoria') setForm((p) => ({ ...p, sub_categoria_id: String(nuevo.id) }));
        // Unidad: no autoselecciona base; el usuario decide dónde usarla.
        if (tipo === 'color' && quickInfo?.rowIndex != null) {
            setColores((prev) =>
                prev.map((x, j) =>
                    j === quickInfo.rowIndex
                        ? { ...x, color_id: String(nuevo.id), nombre: nuevo.nombre, codigo: nuevo.codigo, hex: nuevo.hex || x.hex }
                        : x,
                ),
            );
        }
    };

    // ---- Tabla lista ----
    const relName = (row, key) => {
        const r = row[key];
        return r && typeof r === 'object' ? (r.nombre ?? '') : '';
    };

    const columns = [
        {
            // El código del fabricante es con lo que trabajan a diario: va en su
            // propia columna, no de subtítulo.
            key: 'codigo',
            label: 'Código',
            render: (row) => (
                <span className="font-mono text-sm font-medium text-warm-900">{row.codigo}</span>
            ),
        },
        {
            key: 'nombre',
            label: 'Producto',
            render: (row) => (
                <span className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-100 text-primary-700">
                        <Package className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                        <span className="block truncate font-medium text-warm-900">{row.nombre}</span>
                        {row.codigo_barras && (
                            <span className="block truncate text-xs text-gray-500">{row.codigo_barras}</span>
                        )}
                    </span>
                </span>
            ),
        },
        {
            key: 'categoria',
            label: 'Categoría',
            render: (row) => {
                const cat = relName(row, 'categoria');
                const sub = relName(row, 'sub_categoria');
                if (!cat) return <span className="text-gray-400">—</span>;
                return (
                    <span className="text-sm">
                        {cat}
                        {sub && <span className="text-gray-400"> · {sub}</span>}
                    </span>
                );
            },
        },
        {
            key: 'marca',
            label: 'Marca',
            render: (row) => relName(row, 'marca') || <span className="text-gray-400">—</span>,
        },
        {
            key: 'unidad_medida',
            label: 'Unidad',
            render: (row) => {
                const u = row.unidad_medida;
                return u && typeof u === 'object' ? (
                    <Badge variant="blue">{u.abreviatura ?? u.nombre}</Badge>
                ) : (
                    <span className="text-gray-400">—</span>
                );
            },
        },
        {
            key: 'presentaciones',
            label: 'Unid. derivadas',
            align: 'right',
            render: (row) =>
                Array.isArray(row.presentaciones) ? (
                    <Badge variant="gray">{row.presentaciones.length}</Badge>
                ) : (
                    <span className="text-gray-400">—</span>
                ),
        },
        {
            key: 'colores',
            label: 'Colores',
            align: 'right',
            searchable: false,
            render: (row) =>
                Array.isArray(row.colores) && row.colores.length ? (
                    <span className="inline-flex items-center gap-1">
                        {/* Un vistazo al muestrario sin abrir el producto. */}
                        {row.colores.slice(0, 4).map((c) => (
                            <span
                                key={c.id}
                                title={c.codigo ? `${c.nombre} (${c.codigo})` : c.nombre}
                                className="h-3.5 w-3.5 rounded-full border border-edge"
                                style={{ background: c.hex || '#e5e7eb' }}
                            />
                        ))}
                        <span className="ml-1 text-xs text-warm-500">{row.colores.length}</span>
                    </span>
                ) : (
                    <span className="text-gray-400">—</span>
                ),
        },
        {
            key: 'proveedor',
            label: 'Proveedor',
            render: (row) => <CeldaProveedores proveedores={row.proveedores} />,
        },
        {
            key: 'precio_venta',
            label: 'Precio venta',
            align: 'right',
            searchable: false,
            render: (row) => {
                // El de la presentación más pequeña: es el precio de mostrador.
                const precios = (row.presentaciones ?? [])
                    .map((p) => Number(p.precio_venta) || 0)
                    .filter((n) => n > 0);
                return precios.length ? money(Math.min(...precios), row.moneda_venta) : <span className="text-gray-400">—</span>;
            },
        },
        {
            key: 'activo',
            label: 'Estado',
            render: (row) =>
                row.activo ? <Badge variant="green">Activo</Badge> : <Badge variant="red">Inactivo</Badge>,
        },
        {
            type: 'actions',
            key: 'actions',
            label: 'Acciones',
            actions: (row) => (
                <>
                    <button
                        aria-label="Ver detalle"
                        title="Ver detalle"
                        onClick={() => setDetalle(row)}
                        className="rounded-md p-1.5 text-blue-600 transition hover:bg-blue-50 hover:text-blue-700"
                    >
                        <Eye className="h-4 w-4" />
                    </button>
                    <button
                        aria-label="Editar"
                        onClick={() => openEdit(row)}
                        className="rounded-md p-1.5 text-primary-600 transition hover:bg-primary-50 hover:text-primary-700"
                    >
                        <Edit className="h-4 w-4" />
                    </button>
                    <button
                        aria-label="Eliminar"
                        onClick={() => setDeleteTarget(row)}
                        className="rounded-md p-1.5 text-red-600 transition hover:bg-red-50 hover:text-red-700"
                    >
                        <Trash2 className="h-4 w-4" />
                    </button>
                </>
            ),
        },
    ];

    const applyFilters = () =>
        setActiveFilters({
            ...(filterEstado ? { estado: filterEstado } : {}),
            ...(filterCategoria ? { categoria: filterCategoria } : {}),
            ...(filterMarca ? { marca: filterMarca } : {}),
            ...(filterTipoTela ? { tipoTela: filterTipoTela } : {}),
        });
    const clearFilters = () => {
        setFilterEstado('');
        setFilterCategoria('');
        setFilterMarca('');
        setFilterTipoTela('');
        setActiveFilters({});
    };
    const filteredProductos = productos.filter((p) => {
        if (activeFilters.estado === 'activos' && p.activo === false) return false;
        if (activeFilters.estado === 'inactivos' && p.activo !== false) return false;
        if (activeFilters.categoria && String(p.categoria?.id) !== String(activeFilters.categoria)) return false;
        if (activeFilters.marca && String(p.marca?.id) !== String(activeFilters.marca)) return false;
        if (activeFilters.tipoTela && String(p.tipo_tela_id) !== String(activeFilters.tipoTela)) return false;
        return true;
    });
    const filterCount = Object.keys(activeFilters).length;

    const productFilters = (
        <div className="flex flex-wrap items-end gap-3">
            <Select
                label="Estado"
                value={filterEstado}
                onChange={(e) => setFilterEstado(e.target.value)}
                options={[
                    { value: '', label: 'Todos' },
                    { value: 'activos', label: 'Solo activos' },
                    { value: 'inactivos', label: 'Solo inactivos' },
                ]}
                className="w-44"
            />
            <SearchSelect
                label="Categoría"
                value={filterCategoria}
                onChange={(v) => setFilterCategoria(v ?? '')}
                placeholder="Todas"
                emptyText="Sin coincidencias"
                options={categoriasRaiz.map((c) => ({ value: String(c.id), label: c.nombre }))}
                className="w-52"
            />
            <SearchSelect
                label="Marca"
                value={filterMarca}
                onChange={(v) => setFilterMarca(v ?? '')}
                placeholder="Todas"
                emptyText="Sin coincidencias"
                options={marcas.map((m) => ({ value: String(m.id), label: m.nombre }))}
                className="w-52"
            />
            <SearchSelect
                label="Tipo de tela"
                value={filterTipoTela}
                onChange={(v) => setFilterTipoTela(v ?? '')}
                placeholder="Todos"
                emptyText="Sin coincidencias"
                options={tiposTela.map((t) => ({ value: String(t.id), label: t.nombre }))}
                className="w-52"
            />
        </div>
    );


    return (
        <Layout>
            <PageHeader
                title="Productos"
                description="Administra el catálogo y sus colores. Clic derecho sobre uno para ver sus colores, movimientos y más."
                actions={<CreateButton onClick={openCreate}>Crear producto</CreateButton>}
            />

            {error && (
                <Alert variant="error" className="mb-4">
                    {error}
                </Alert>
            )}

            <DataTable
                columns={columns}
                onRowContextMenu={(row, e) => {
                    e.preventDefault();
                    setMenu({ x: e.clientX, y: e.clientY, producto: row });
                }}
                rows={filteredProductos}
                loading={loading}
                searchPlaceholder="Buscar productos..."
                filterable
                filters={productFilters}
                filterCount={filterCount}
                onApplyFilters={applyFilters}
                onClearFilters={clearFilters}
            />

            <Modal
                open={modalOpen}
                onClose={() => setModalOpen(false)}
                title={editing ? 'Editar producto' : 'Agregar producto'}
                description={editing ? `Modifica "${editing.nombre}"` : 'Completa los datos del producto'}
                size="3xl"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setModalOpen(false)}>
                            Cancelar
                        </Button>
                        <Button loading={saving} onClick={handleSave}>
                            <Save className="h-4 w-4" />
                            {editing ? 'Guardar cambios' : 'Crear producto'}
                        </Button>
                    </>
                }
            >
                {/* El formulario es largo: se parte en pestañas. Todas siguen
                    montadas para no perder lo escrito al cambiar de pestaña. */}
                <div className="-mt-2 mb-4">
                    <Tabs items={TABS} value={tab} onChange={setTab} />
                </div>

                <div className={cn('space-y-6', tab !== 'general' && 'hidden')}>
                    {/* Identificación */}
                    <section>
                        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                            Identificación
                        </h3>
                        <div className="grid gap-4 sm:grid-cols-3">
                            <Input
                                label="Nombre comercial"
                                placeholder="Con el que se vende"
                                value={form.nombre}
                                onChange={setField('nombre')}
                                error={errors.nombre}
                                className="sm:col-span-2"
                            />
                            {/* El código de tela dice qué tela es (01-01-001); al
                                sumarle el código del color (-0074) queda el
                                producto que se compra y se vende. Es la clave
                                del cruce con el packing list del proveedor. Se
                                deja escribir; si se deja vacío, el servidor
                                genera uno. */}
                            <Input
                                label="Código de tela"
                                placeholder="01-01-001"
                                value={form.codigo}
                                onChange={setField('codigo')}
                                error={errors.codigo}
                            />
                            <div>
                                <SearchSelect
                                    label="Tipo de tela (opcional)"
                                    value={form.tipo_tela_id}
                                    onChange={(tipoId) => {
                                        const tipo = tiposTela.find((t) => String(t.id) === tipoId);
                                        setForm((p) => ({
                                            ...p,
                                            tipo_tela_id: tipoId ?? '',
                                            // Si no se escribió un código a mano,
                                            // se muestra el que va a salir: familia + tipo.
                                            codigo:
                                                !p.codigo.trim() && tipo
                                                    ? `01-${tipo.familia?.codigo ?? '00'}-${tipo.codigo}`
                                                    : p.codigo,
                                        }));
                                    }}
                                    placeholder="Sin asignar"
                                    emptyText="Sin coincidencias"
                                    options={tiposTela.map((t) => ({
                                        value: String(t.id),
                                        label: `01-${t.familia?.codigo ?? '00'}-${t.codigo} — ${t.nombre} (${t.familia?.nombre ?? ''})`,
                                    }))}
                                />
                                <p className="mt-1 text-xs text-warm-400">
                                    Si lo eliges, el código de tela sale de aquí. Se administra en Catálogo
                                    → Familias y tipos de tela.
                                </p>
                            </div>
                            <div className="sm:col-span-2">
                                <Input
                                    label="Código de barras"
                                    placeholder="Opcional"
                                    value={form.codigo_barras}
                                    onChange={setField('codigo_barras')}
                                    error={errors.codigo_barras}
                                />
                                <p className="mt-1 text-xs text-warm-400">
                                    Para leerlo con un lector de código de barras en el punto de venta.
                                    Se escribe a mano; si no lo usas, déjalo vacío.
                                </p>
                            </div>
                            <label className="flex items-end gap-2 pb-2 text-sm text-gray-700">
                                <input
                                    type="checkbox"
                                    checked={form.activo}
                                    onChange={setField('activo')}
                                    className="h-4 w-4 rounded border-gray-300 accent-primary-600"
                                />
                                Producto activo
                            </label>
                        </div>
                    </section>

                    {/* Clasificación con creación rápida */}
                    <section>
                        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                            Clasificación
                        </h3>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <FieldWithAdd onAdd={() => setQuick({ tipo: 'categoria' })}>
                                <SearchSelect
                                    label="Categoría"
                                    value={form.categoria_id}
                                    onChange={(v) =>
                                        setForm((p) => ({
                                            ...p,
                                            categoria_id: v ?? '',
                                            sub_categoria_id: '',
                                        }))
                                    }
                                    placeholder="Seleccionar categoría"
                                    emptyText="Sin coincidencias"
                                    options={categoriasRaiz.map((c) => ({
                                        value: String(c.id),
                                        label: c.nombre,
                                    }))}
                                />
                            </FieldWithAdd>
                            <FieldWithAdd
                                onAdd={() =>
                                    form.categoria_id
                                        ? setQuick({ tipo: 'subcategoria' })
                                        : toast.error('Elige una categoría primero.')
                                }
                            >
                                <SearchSelect
                                    label="Subcategoría"
                                    value={form.sub_categoria_id}
                                    onChange={(v) => setForm((p) => ({ ...p, sub_categoria_id: v ?? '' }))}
                                    placeholder="Seleccionar subcategoría"
                                    emptyText="Sin coincidencias"
                                    options={subCategoriasDe(form.categoria_id).map((c) => ({
                                        value: String(c.id),
                                        label: c.nombre,
                                    }))}
                                />
                            </FieldWithAdd>
                            <FieldWithAdd onAdd={() => setQuick({ tipo: 'marca' })}>
                                <SearchSelect
                                    label="Marca"
                                    value={form.marca_id}
                                    onChange={(v) =>
                                        setForm((p) => ({
                                            ...p,
                                            marca_id: v ?? '',
                                            sub_marca_id: '',
                                        }))
                                    }
                                    placeholder="Seleccionar marca"
                                    emptyText="Sin coincidencias"
                                    options={marcas.map((m) => ({ value: String(m.id), label: m.nombre }))}
                                />
                            </FieldWithAdd>
                            <FieldWithAdd
                                onAdd={() =>
                                    form.marca_id
                                        ? setQuick({ tipo: 'submarca' })
                                        : toast.error('Elige una marca primero.')
                                }
                            >
                                <SearchSelect
                                    label="Submarca"
                                    value={form.sub_marca_id}
                                    onChange={(v) => setForm((p) => ({ ...p, sub_marca_id: v ?? '' }))}
                                    placeholder="Seleccionar submarca"
                                    emptyText="Sin coincidencias"
                                    options={subMarcasDe(form.marca_id).map((s) => ({
                                        value: String(s.id),
                                        label: s.nombre,
                                    }))}
                                />
                            </FieldWithAdd>
                        </div>
                    </section>

                    {/* Quiénes traen la tela. La misma se le puede comprar a
                        varios, y cada uno la llama con su código y la cotiza a
                        su precio: por eso es una lista y no un solo campo. */}
                    <section>
                        <div className="mb-2 flex items-center justify-between">
                            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                                Proveedores
                            </h3>
                            <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={() => setProvs((prev) => [...prev, provVacio()])}
                            >
                                <Plus className="h-4 w-4" />
                                Agregar proveedor
                            </Button>
                        </div>

                        {provs.length === 0 ? (
                            <p className="rounded-lg border border-dashed border-edge px-4 py-6 text-center text-sm text-warm-400">
                                Sin proveedores asignados.
                            </p>
                        ) : (
                            <div className="space-y-2">
                                {provs.map((pv, i) => (
                                    <div key={i} className="flex flex-wrap items-end gap-2 rounded-lg border border-edge p-2">
                                        <SearchSelect
                                            label="Proveedor"
                                            className="min-w-[12rem] flex-1"
                                            value={pv.proveedor_id}
                                            onChange={(v) =>
                                                setProvs((prev) =>
                                                    prev.map((x, j) =>
                                                        j === i ? { ...x, proveedor_id: v ?? '' } : x,
                                                    ),
                                                )
                                            }
                                            placeholder="Elegir proveedor…"
                                            emptyText="Sin coincidencias"
                                            options={proveedores
                                                .filter(
                                                    (op) =>
                                                        String(op.id) === String(pv.proveedor_id) ||
                                                        !provs.some((o) => String(o.proveedor_id) === String(op.id)),
                                                )
                                                .map((op) => ({ value: String(op.id), label: op.nombre }))}
                                        />
                                        <Input
                                            label="Su código"
                                            placeholder="A103"
                                            className="w-32"
                                            value={pv.codigo_proveedor}
                                            onChange={(e) =>
                                                setProvs((prev) =>
                                                    prev.map((x, j) =>
                                                        j === i ? { ...x, codigo_proveedor: e.target.value } : x,
                                                    ),
                                                )
                                            }
                                        />
                                        <Input
                                            label="Precio ref."
                                            type="number"
                                            step="0.0001"
                                            placeholder="4.20"
                                            className="w-28"
                                            value={pv.precio_referencia}
                                            onChange={(e) =>
                                                setProvs((prev) =>
                                                    prev.map((x, j) =>
                                                        j === i ? { ...x, precio_referencia: e.target.value } : x,
                                                    ),
                                                )
                                            }
                                        />
                                        <Input
                                            label="Días entrega"
                                            type="number"
                                            placeholder="45"
                                            className="w-28"
                                            value={pv.dias_entrega}
                                            onChange={(e) =>
                                                setProvs((prev) =>
                                                    prev.map((x, j) =>
                                                        j === i ? { ...x, dias_entrega: e.target.value } : x,
                                                    ),
                                                )
                                            }
                                        />
                                        {/* Solo uno es el habitual: marcar otro desmarca el anterior. */}
                                        <label className="flex items-center gap-1.5 pb-2 text-sm text-gray-700">
                                            <input
                                                type="radio"
                                                name="proveedor-principal"
                                                checked={Boolean(pv.principal)}
                                                onChange={() =>
                                                    setProvs((prev) =>
                                                        prev.map((x, j) => ({ ...x, principal: j === i })),
                                                    )
                                                }
                                                className="h-4 w-4 accent-primary-600"
                                            />
                                            Principal
                                        </label>
                                        <button
                                            type="button"
                                            aria-label="Quitar proveedor"
                                            onClick={() => setProvs((prev) => prev.filter((_, j) => j !== i))}
                                            className="mb-1.5 rounded-md p-1.5 text-red-600 transition hover:bg-red-50"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>

                </div>

                {/* ── Ficha técnica de la tela ── */}
                <div className={cn('space-y-6', tab !== 'ficha' && 'hidden')}>
                    <section>
                        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                            Especificaciones
                        </h3>
                        <p className="mb-3 text-xs text-warm-400">
                            Todo es opcional: la mercería y los avíos no usan estos datos.
                        </p>
                        <div className="grid gap-4 sm:grid-cols-3">
                            <Input
                                label="Nombre técnico"
                                placeholder="Como la llama la fábrica, si es distinto"
                                value={form.nombre_tecnico}
                                onChange={setField('nombre_tecnico')}
                                error={errors.nombre_tecnico}
                            />
                            <Input
                                label="Partida arancelaria"
                                placeholder="600632"
                                value={form.codigo_arancelario}
                                onChange={setField('codigo_arancelario')}
                                error={errors.codigo_arancelario}
                            />
                            <Input
                                label="Composición"
                                placeholder="100% Algodón / 65% Poliéster 35% Algodón"
                                value={form.composicion}
                                onChange={setField('composicion')}
                                error={errors.composicion}
                                className="sm:col-span-3"
                            />
                            <Input
                                label="Ancho útil (cm)"
                                type="number"
                                step="0.5"
                                placeholder="150"
                                value={form.ancho_cm}
                                onChange={setField('ancho_cm')}
                                error={errors.ancho_cm}
                            />
                            <Input
                                label="Gramaje (g/m²)"
                                type="number"
                                step="1"
                                placeholder="180"
                                value={form.gramaje}
                                onChange={setField('gramaje')}
                                error={errors.gramaje}
                            />
                            {/* El packing list pesa cada rollo (58 m ~ 26 kg).
                                Guardar la equivalencia permite detectar un
                                metraje mal tecleado y vender por kilo. Con
                                ancho y gramaje ya cargados, no hace falta
                                calcularlo a mano: peso = ancho(m) × gramaje ÷ 1000. */}
                            <div>
                                <div className="flex items-end gap-2">
                                    <Input
                                        label="Peso por metro (kg)"
                                        type="number"
                                        step="0.0001"
                                        placeholder="0.45"
                                        value={form.peso_por_metro}
                                        onChange={setField('peso_por_metro')}
                                        error={errors.peso_por_metro}
                                        className="flex-1"
                                    />
                                    {form.ancho_cm > 0 && form.gramaje > 0 && (
                                        <Button
                                            type="button"
                                            variant="secondary"
                                            className="mb-px shrink-0"
                                            onClick={() =>
                                                setForm((p) => ({
                                                    ...p,
                                                    peso_por_metro: (
                                                        (Number(p.ancho_cm) / 100) *
                                                        (Number(p.gramaje) / 1000)
                                                    ).toFixed(4),
                                                }))
                                            }
                                        >
                                            Calcular
                                        </Button>
                                    )}
                                </div>
                                {form.ancho_cm > 0 && form.gramaje > 0 && (
                                    <p className="mt-1 text-xs text-warm-400">
                                        Se calcula solo con el ancho y el gramaje (
                                        {(
                                            (Number(form.ancho_cm) / 100) *
                                            (Number(form.gramaje) / 1000)
                                        ).toFixed(4)}{' '}
                                        kg/m). Si escribes otro valor —el de la ficha del
                                        fabricante—, se respeta; "Calcular" vuelve al automático.
                                    </p>
                                )}
                            </div>
                            <Select
                                label="Tipo de tejido"
                                value={form.tipo_tejido}
                                onChange={setField('tipo_tejido')}
                                options={[
                                    { value: '', label: 'Sin especificar' },
                                    { value: 'plano', label: 'Plano (rígido)' },
                                    { value: 'punto', label: 'Punto (elástico)' },
                                ]}
                                error={errors.tipo_tejido}
                            />
                            <Select
                                label="Elasticidad"
                                value={form.elasticidad}
                                onChange={setField('elasticidad')}
                                options={[
                                    { value: '', label: 'Sin especificar' },
                                    { value: 'ninguna', label: 'Sin elasticidad' },
                                    { value: 'mono', label: 'Estira a lo ancho' },
                                    { value: 'bi', label: 'Bielástico' },
                                ]}
                                error={errors.elasticidad}
                            />
                            <div className="flex gap-2">
                                <Input
                                    label="Mínimo de compra"
                                    type="number"
                                    step="0.5"
                                    placeholder="5"
                                    value={form.minimo_compra}
                                    onChange={setField('minimo_compra')}
                                    error={errors.minimo_compra}
                                    className="flex-1"
                                />
                                <Select
                                    label="Unidad"
                                    value={form.unidad_minimo_compra}
                                    onChange={setField('unidad_minimo_compra')}
                                    options={[
                                        { value: '', label: '—' },
                                        { value: 'metros', label: 'Metros' },
                                        { value: 'rollos', label: 'Rollos' },
                                    ]}
                                    className="w-32 shrink-0"
                                />
                            </div>
                        </div>
                        {(form.ancho_cm || form.gramaje) && (
                            <p className="mt-2 text-xs text-warm-500">
                                {form.ancho_cm > 0 && (
                                    <>
                                        Ancho: <strong>{(Number(form.ancho_cm) / 100).toFixed(2)} m</strong>
                                        {' · '}
                                        {Number(form.ancho_cm) <= 120
                                            ? 'sencillo'
                                            : Number(form.ancho_cm) <= 160
                                              ? 'doble ancho'
                                              : 'gran ancho'}
                                    </>
                                )}
                                {form.ancho_cm > 0 && form.gramaje > 0 && ' · '}
                                {form.gramaje > 0 && (
                                    <>
                                        Tela{' '}
                                        <strong>
                                            {Number(form.gramaje) < 150
                                                ? 'liviana'
                                                : Number(form.gramaje) <= 250
                                                  ? 'media'
                                                  : 'pesada'}
                                        </strong>
                                    </>
                                )}
                            </p>
                        )}
                    </section>

                    <section>
                        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                            Descripción
                        </h3>
                        <div className="grid gap-4">
                            <Input
                                label="Descripción"
                                placeholder="Detalle libre del producto"
                                value={form.descripcion}
                                onChange={setField('descripcion')}
                                error={errors.descripcion}
                            />
                            <Input
                                label="Propiedades especiales"
                                placeholder="Antipilling, repelente al agua, protección UV, preencogido…"
                                value={form.propiedades}
                                onChange={setField('propiedades')}
                                error={errors.propiedades}
                            />
                        </div>
                    </section>
                </div>

                {/* ── Gama de colores del muestrario ── */}
                <div className={cn('space-y-6', tab !== 'colores' && 'hidden')}>
                    <section>
                        <div className="mb-2 flex items-center justify-between">
                            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                                Colores disponibles
                            </h3>
                            <div className="flex flex-wrap items-center gap-2">
                                <Button type="button" variant="ghost" size="sm" onClick={descargarPlantillaColores}>
                                    <Download className="h-4 w-4" />
                                    Plantilla
                                </Button>
                                {/* Todos los colores de la tela de una vez, desde Excel. */}
                                <input
                                    ref={excelColoresRef}
                                    type="file"
                                    accept=".xlsx,.xls"
                                    className="hidden"
                                    onChange={subirExcelColores}
                                />
                                <Button
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    loading={cargandoColores}
                                    onClick={() => excelColoresRef.current?.click()}
                                >
                                    <FileSpreadsheet className="h-4 w-4" />
                                    Subir Excel
                                </Button>
                                <Button
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => setColores((prev) => [...prev, colorVacio()])}
                                >
                                    <Plus className="h-4 w-4" />
                                    Agregar color
                                </Button>
                            </div>
                        </div>
                        <p className="mb-3 text-xs text-warm-400">
                            En qué colores existe esta tela. El código del color se suma al de la
                            tela y forma el producto con color: tela 01-01-001 + color 0074 →
                            01-01-001-0074. Cada rollo lleva su propio código único, el de la
                            orden de compra (KET-001-26-000001).
                        </p>
                        <p className="mb-3 text-xs text-warm-400">
                            Para cargar muchos de una vez, sube un Excel con Código, Nombre, Nombre del
                            proveedor y Metraje (m) (descarga la plantilla: trae el catálogo de colores). Lo que
                            no esté en el catálogo se crea. El metraje del rollo de cada color se ve y se
                            corrige en Compra y venta.
                        </p>
                        {avisosColores.length > 0 && (
                            <Alert variant="warning" className="mb-3">
                                <p className="font-medium">No se agregaron {avisosColores.length} fila(s):</p>
                                <ul className="mt-1 list-disc pl-5 text-xs">
                                    {avisosColores.map((a, i) => (
                                        <li key={i}>{a}</li>
                                    ))}
                                </ul>
                            </Alert>
                        )}

                        {colores.length === 0 ? (
                            <p className="rounded-lg border border-dashed border-edge px-4 py-8 text-center text-sm text-warm-400">
                                Sin colores registrados.
                            </p>
                        ) : (
                            <div className="space-y-2">
                                {colores.map((c, i) => (
                                    <div
                                        key={i}
                                        className="flex flex-wrap items-end gap-2 rounded-lg border border-edge p-2"
                                    >
                                        <input
                                            type="color"
                                            aria-label="Muestra de color"
                                            value={c.hex || '#1f3a93'}
                                            onChange={(e) =>
                                                setColores((prev) =>
                                                    prev.map((x, j) =>
                                                        j === i ? { ...x, hex: e.target.value } : x,
                                                    ),
                                                )
                                            }
                                            className="h-[38px] w-12 shrink-0 cursor-pointer rounded-md border border-edge bg-white p-1"
                                        />
                                        <div className="min-w-[12rem] flex-1">
                                            <SearchSelect
                                                label="Color"
                                                value={c.color_id || ''}
                                                placeholder={c.nombre ? `${c.nombre} (sin catálogo)` : 'Elegir color…'}
                                                emptyText="Sin coincidencias"
                                                onChange={(colorId, elegido) => {
                                                    setColores((prev) =>
                                                        prev.map((x, j) =>
                                                            j === i
                                                                ? {
                                                                      ...x,
                                                                      color_id: colorId,
                                                                      nombre: elegido?.nombre ?? x.nombre,
                                                                      codigo: elegido?.codigo ?? x.codigo,
                                                                      hex: elegido?.hex || x.hex,
                                                                  }
                                                                : x,
                                                        ),
                                                    );
                                                }}
                                                options={coloresCatalogo.map((col) => ({
                                                    value: String(col.id),
                                                    label: `${col.codigo} — ${col.nombre}`,
                                                    keywords: col.codigo,
                                                    nombre: col.nombre,
                                                    codigo: col.codigo,
                                                    hex: col.hex,
                                                }))}
                                            />
                                            {!c.color_id && c.nombre && (
                                                <p className="mt-1 text-xs text-amber-600">
                                                    Color sin catálogo (de antes de tener este listado).
                                                </p>
                                            )}
                                        </div>
                                        {c.codigo && (
                                            <Badge variant="blue" className="mb-2">
                                                {c.codigo}
                                            </Badge>
                                        )}
                                        <button
                                            type="button"
                                            title="Crear color nuevo en el catálogo"
                                            onClick={() => setQuick({ tipo: 'color', rowIndex: i })}
                                            className="mb-0.5 rounded-md p-1.5 text-emerald-600 transition hover:bg-emerald-50"
                                        >
                                            <PlusCircle className="h-5 w-5" />
                                        </button>
                                        {/* El proveedor nombra los colores a su
                                            manera ("Verde oscuro (Ha Qing)") y la
                                            tienda a la suya ("ANTIQUE"). Con los dos
                                            se puede cruzar el packing list del
                                            siguiente contenedor. */}
                                        <Input
                                            label="Nombre del proveedor"
                                            placeholder="Verde oscuro (Ha Qing)"
                                            className="min-w-[10rem] flex-1"
                                            value={c.nombre_proveedor}
                                            onChange={(e) =>
                                                setColores((prev) =>
                                                    prev.map((x, j) =>
                                                        j === i
                                                            ? { ...x, nombre_proveedor: e.target.value }
                                                            : x,
                                                    ),
                                                )
                                            }
                                        />
                                        <button
                                            type="button"
                                            aria-label="Quitar color"
                                            onClick={() =>
                                                setColores((prev) => prev.filter((_, j) => j !== i))
                                            }
                                            className="mb-px rounded-md p-2 text-danger-600 transition hover:bg-danger-50"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>

                    <section>
                        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                            Foto del producto
                        </h3>
                        {(imagenFile || editing?.imagen_url) && (
                            <img
                                src={
                                    imagenFile
                                        ? URL.createObjectURL(imagenFile)
                                        : editing.imagen_url
                                }
                                alt="Foto del producto"
                                className="mb-2 h-28 w-28 rounded-lg border border-edge object-cover"
                            />
                        )}
                        <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            onChange={(e) => setImagenFile(e.target.files?.[0] ?? null)}
                            className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-primary-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary-700 hover:file:bg-primary-100"
                        />
                        <p className="mt-1 text-xs text-warm-400">
                            PNG, JPG o WEBP, hasta 4 MB. Se sube al guardar el producto.
                        </p>
                    </section>
                </div>

                {/* ── Compra y venta ── */}
                <div className={cn('space-y-6', tab !== 'comercial' && 'hidden')}>
                    {/* Cómo lo compro */}
                    <section>
                        <div className="mb-2 flex items-center justify-between gap-3">
                            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                                Cómo lo compro
                            </h3>
                            {/* Las compras al exterior se cotizan en dólares;
                                las nacionales, en soles. Solo cambia cómo se
                                lee la cifra de abajo, no la convierte. */}
                            <div className="inline-flex items-center gap-1.5 text-xs">
                                <span className="text-warm-500">Moneda:</span>
                                {['PEN', 'USD'].map((m) => (
                                    <button
                                        key={m}
                                        type="button"
                                        onClick={() => setForm((p) => ({ ...p, moneda_compra: m }))}
                                        className={cn(
                                            'rounded-full px-2.5 py-1 font-semibold transition',
                                            form.moneda_compra === m
                                                ? 'bg-primary-600 text-white'
                                                : 'bg-gray-100 text-warm-600 hover:bg-gray-200',
                                        )}
                                    >
                                        {m}
                                    </button>
                                ))}
                            </div>
                        </div>
                        {/* Rejilla de 2x2, igual que Clasificación: cada campo con
                            su etiqueta encima y todos alineados. */}
                        <div className="grid gap-4 sm:grid-cols-2">
                            <FieldWithAdd onAdd={() => setQuick({ tipo: 'unidad' })}>
                                <SearchSelect
                                    label="Compro por"
                                    value={compra.unidad_compra_id}
                                    onChange={(v) => setCompraField('unidad_compra_id')({ target: { value: v ?? '' } })}
                                    placeholder="Seleccionar unidad…"
                                    emptyText="Sin coincidencias"
                                    options={unidadOptions}
                                    error={errors.compra_unidad}
                                />
                            </FieldWithAdd>
                            <Input
                                label={`¿Cuánto pagas por ${unidadCompraTexto}? (${form.moneda_compra})`}
                                type="number"
                                step="any"
                                min="0"
                                placeholder="140.00"
                                value={compra.precio}
                                onChange={setCompraField('precio')}
                            />
                            {/* Una tela por rollo o por metro no pregunta cuánto trae:
                                lo dice el metraje de cada color (abajo). */}
                            {!contenidoAutomatico && (
                                <>
                                    <Input
                                        label={`¿Cuánto trae ${unidadCompraTexto}?`}
                                        type="number"
                                        step="any"
                                        min="0"
                                        placeholder="50"
                                        value={compra.cantidad}
                                        onChange={setCompraField('cantidad')}
                                        error={errors.compra_cantidad}
                                    />
                                    <SearchSelect
                                        label="¿En qué unidad?"
                                        value={compra.unidad_contenido_id}
                                        onChange={(v) => setCompraField('unidad_contenido_id')({ target: { value: v ?? '' } })}
                                        placeholder="Seleccionar unidad…"
                                        emptyText="Sin coincidencias"
                                        options={unidadOptions}
                                        error={errors.compra_contenido}
                                    />
                                </>
                            )}
                        </div>
                        {contenidoAutomatico && (
                            <p className={cn('mt-2 text-xs', errors.compra_cantidad ? 'font-medium text-red-600' : 'text-warm-500')}>
                                {compraPorMetro
                                    ? 'Se compra por metro: no hace falta decir cuánto trae.'
                                    : metrajeColores > 0
                                      ? `Cada rollo trae el metraje de su color (la tabla de la tela, en Cómo lo vendo): en promedio ${formatoMetros(metrajeColores)} m.`
                                      : 'Cada rollo trae el metraje de su color: ponlo en la tabla de la tela, en Cómo lo vendo.'}
                            </p>
                        )}
                    </section>

                    {/* Cómo lo vendo: un solo producto en una sola unidad (la tela, por
                        metro). Lo que varía es el color y el metraje de cada rollo,
                        no el formato: ya no hay "Rollo 50 m", "Yarda" ni "Retazo". */}
                    <section>
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
                            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                                Cómo lo vendo
                            </h3>
                            <div className="flex items-center gap-3">
                                {/* Casi siempre soles; rara vez una tela se
                                    vende al exterior también en dólares. */}
                                <div className="inline-flex items-center gap-1.5 text-xs">
                                    <span className="text-warm-500">Moneda:</span>
                                    {['PEN', 'USD'].map((m) => (
                                        <button
                                            key={m}
                                            type="button"
                                            onClick={() => setForm((p) => ({ ...p, moneda_venta: m }))}
                                            className={cn(
                                                'rounded-full px-2.5 py-1 font-semibold transition',
                                                form.moneda_venta === m
                                                    ? 'bg-primary-600 text-white'
                                                    : 'bg-gray-100 text-warm-600 hover:bg-gray-200',
                                            )}
                                        >
                                            {m}
                                        </button>
                                    ))}
                                </div>
                                {/* Los precios ya no se ponen aquí: tienen su propia vista. */}
                                {editing && (
                                    <Link
                                        to={`/lista-precios?producto=${editing.id}`}
                                        className="inline-flex items-center gap-1 text-xs font-semibold text-primary-600 hover:text-primary-800"
                                    >
                                        Poner precios →
                                    </Link>
                                )}
                            </div>
                        </div>
                        {monedasDistintas && (
                            <div className="mb-2 rounded-md bg-blue-50 p-3 ring-1 ring-inset ring-blue-200">
                                <div className="flex flex-wrap items-end gap-3">
                                    <div className="w-44">
                                        <Input
                                            label="Tipo de cambio (1 USD = S/)"
                                            type="number"
                                            step="0.0001"
                                            min="0"
                                            placeholder="3.7500"
                                            value={form.tipo_cambio}
                                            onChange={setField('tipo_cambio')}
                                            error={errors.tipo_cambio}
                                        />
                                    </div>
                                    <p className="min-w-[16rem] flex-1 text-xs text-blue-800">
                                        Compras en {form.moneda_compra} y vendes en {form.moneda_venta}: el costo se
                                        convierte con este tipo de cambio antes de calcular el precio de venta y lo
                                        que ganas. Si el tipo de cambio cambia, ajusta el precio a mano. La ganancia
                                        real de cada compra usa el tipo de cambio de ese día al recepcionarla.
                                    </p>
                                </div>
                            </div>
                        )}
                        {(() => {
                            const fila = filaDe(ventaPrincipal.unidad_id);
                            const por = unidadNombre(ventaPrincipal.unidad_id).toLowerCase();
                            return (
                                <div className="grid gap-4 sm:grid-cols-3">
                                    <SearchSelect
                                        label="Vendo por"
                                        value={ventaPrincipal.unidad_id}
                                        onChange={(val) => setVentaField(0, 'unidad_id', val ?? '')}
                                        placeholder="Elegir unidad…"
                                        emptyText="Sin coincidencias"
                                        options={unidadOptions}
                                        error={errors.ventas}
                                    />
                                    <div>
                                        <span className="mb-1 block text-sm font-medium text-gray-700">
                                            Me cuesta{por ? ` (por ${por})` : ''}
                                        </span>
                                        <p className="py-2 text-sm text-warm-700">
                                            {fila ? money(fila.precio_compra, form.moneda_compra) : '—'}
                                            {/* En la moneda de venta, para comparar con el precio. */}
                                            {fila && monedasDistintas && fila.costo_en_venta != null && (
                                                <span className="ml-1 text-xs text-warm-400">
                                                    ≈ {money(fila.costo_en_venta, form.moneda_venta)}
                                                </span>
                                            )}
                                        </p>
                                    </div>
                                    {/* El precio se pone en la lista de precios. A un
                                        producto nuevo se le sugiere uno con el % de siempre. */}
                                    <div>
                                        <span className="mb-1 block text-sm font-medium text-gray-700">
                                            Precio principal{por ? ` (por ${por})` : ''}
                                        </span>
                                        <p className="py-2 text-sm">
                                            {ventaPrincipal.precio_venta !== '' ? (
                                                <span className="font-medium text-warm-900">
                                                    {money(ventaPrincipal.precio_venta, form.moneda_venta)}
                                                </span>
                                            ) : fila && fila.costo_en_venta != null ? (
                                                <span className="text-warm-500" title="Se guarda así; luego lo ajustas en la lista de precios">
                                                    ≈ {money(fila.precio_venta, form.moneda_venta)}
                                                    <span className="ml-1 text-xs">sugerido</span>
                                                </span>
                                            ) : (
                                                '—'
                                            )}
                                        </p>
                                    </div>
                                </div>
                            );
                        })()}

                        {/* La tela con todos sus colores, como en la nota de venta:
                            cada color es su rollo, con su metraje (el factor) y lo que
                            vale al precio del metro. El metraje se pone aquí. */}
                        {vendePorMetro &&
                            (() => {
                                const filaPrincipal = filaDe(ventaPrincipal.unidad_id);
                                const precioMetro =
                                    ventaPrincipal.precio_venta !== ''
                                        ? Number(ventaPrincipal.precio_venta) || 0
                                        : Number(filaPrincipal?.precio_venta) || 0;
                                const filas = colores.filter((c) => c.color_id || c.nombre.trim());
                                const metrosTotal = filas.reduce((s, c) => s + (Number(c.metros_por_rollo) || 0), 0);
                                const sinMetraje = filas.filter((c) => !(Number(c.metros_por_rollo) > 0)).length;

                                return (
                                    <div className="mt-4">
                                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                            <h4 className="text-sm font-bold uppercase text-warm-900">
                                                Tela: {form.nombre.trim() || 'sin nombre'}
                                            </h4>
                                            <Button type="button" variant="secondary" size="sm" onClick={() => setTab('colores')}>
                                                <Plus className="h-4 w-4" />
                                                Agregar colores
                                            </Button>
                                        </div>
                                        <div className="overflow-x-auto rounded-lg border border-edge">
                                            <table className="w-full min-w-[680px] text-sm">
                                                <thead>
                                                    <tr className="bg-primary-600 text-left text-xs font-semibold uppercase tracking-wide text-white">
                                                        <th className="px-3 py-2">Ítem</th>
                                                        <th className="px-3 py-2">Color</th>
                                                        <th className="px-3 py-2 text-center">Rollo</th>
                                                        <th className="px-3 py-2 text-right">Factor (m)</th>
                                                        <th className="px-3 py-2 text-right">Metros</th>
                                                        <th className="px-3 py-2 text-right">Precio unitario</th>
                                                        <th className="px-3 py-2 text-right">Precio total</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-100">
                                                    {filas.length === 0 && (
                                                        <tr>
                                                            <td colSpan={7} className="px-3 py-6 text-center text-sm text-warm-400">
                                                                Agrega los colores de la tela en la pestaña Colores (o súbelos de un
                                                                Excel con su metraje).
                                                            </td>
                                                        </tr>
                                                    )}
                                                    {filas.map((c) => {
                                                        const i = colores.indexOf(c);
                                                        const metros = Number(c.metros_por_rollo) || 0;
                                                        return (
                                                            <tr key={i}>
                                                                <td className="px-3 py-1.5 font-mono text-xs text-warm-700">
                                                                    {[form.codigo.trim(), c.codigo].filter(Boolean).join('-') || '—'}
                                                                </td>
                                                                <td className="px-3 py-1.5">
                                                                    <span className="inline-flex items-center gap-2 font-medium uppercase text-warm-900">
                                                                        <span
                                                                            className="h-3 w-3 shrink-0 rounded-full ring-1 ring-black/10"
                                                                            style={{ backgroundColor: c.hex || '#9ca3af' }}
                                                                        />
                                                                        {c.nombre || '—'}
                                                                    </span>
                                                                </td>
                                                                <td className="px-3 py-1.5 text-center text-warm-700">1R</td>
                                                                <td className="px-3 py-1.5">
                                                                    <Input
                                                                        type="number"
                                                                        step="0.01"
                                                                        min="0"
                                                                        placeholder="0"
                                                                        value={c.metros_por_rollo}
                                                                        onChange={(e) =>
                                                                            setColores((prev) =>
                                                                                prev.map((x, j) =>
                                                                                    j === i ? { ...x, metros_por_rollo: e.target.value } : x,
                                                                                ),
                                                                            )
                                                                        }
                                                                        aria-label={`Metraje del rollo ${c.nombre}`}
                                                                        className="ml-auto w-24 text-right"
                                                                    />
                                                                </td>
                                                                <td className="px-3 py-1.5 text-right text-warm-900">
                                                                    {metros ? formatoMetros(metros) : '—'}
                                                                </td>
                                                                <td className="px-3 py-1.5 text-right text-warm-700">
                                                                    {money(precioMetro, form.moneda_venta)}
                                                                </td>
                                                                <td className="px-3 py-1.5 text-right font-medium text-warm-900">
                                                                    {metros ? money(metros * precioMetro, form.moneda_venta) : '—'}
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                                {filas.length > 0 && (
                                                    <tfoot>
                                                        <tr className="border-t-2 border-edge bg-gray-50 text-sm font-bold text-warm-900">
                                                            <td className="px-3 py-2 uppercase" colSpan={2}>
                                                                Sub total
                                                            </td>
                                                            <td className="px-3 py-2 text-center">{filas.length}</td>
                                                            <td />
                                                            <td className="px-3 py-2 text-right">{formatoMetros(metrosTotal)}</td>
                                                            <td />
                                                            <td className="px-3 py-2 text-right">
                                                                {money(metrosTotal * precioMetro, form.moneda_venta)}
                                                            </td>
                                                        </tr>
                                                    </tfoot>
                                                )}
                                            </table>
                                        </div>
                                        <p className="mt-2 text-xs text-warm-500">
                                            Es un solo producto: lo que varía es el color y el metraje de su rollo (el
                                            factor). Se vende en rollos enteros o en cortes, cobrando los metros reales de
                                            cada rollo al precio del metro; este metraje sirve para estimar un pedido en
                                            rollos de ese color.
                                            {sinMetraje > 0 &&
                                                ` Falta el metraje de ${sinMetraje} color${sinMetraje === 1 ? '' : 'es'}.`}
                                        </p>
                                    </div>
                                );
                            })()}

                        {formatosQueSalen.length > 0 && (
                            <Alert variant="info" className="mt-3">
                                Al guardar dejan de venderse los formatos {formatosQueSalen.join(', ')}: el producto
                                se vende {vendePorMetro ? 'por metro, en rollos enteros o cortes' : 'en una sola unidad'}.
                            </Alert>
                        )}

                        <p className="mt-2 text-xs text-warm-500">
                            La unidad en que compras se guarda aparte, para poder registrar la compra en ella. El
                            costo sale de tu precio de compra. Los precios de venta (Minorista, Mayorista, por
                            cantidad, IGV) se ponen en la Lista de precios; a un producto nuevo se le sugiere uno
                            con {ventaVacia().margen} % de ganancia.
                            {calculo.baseId && (
                                <>
                                    {' '}El stock se contará en{' '}
                                    <strong>{unidadNombre(calculo.baseId).toLowerCase()}</strong>.
                                </>
                            )}
                        </p>
                    </section>
                </div>
            </Modal>

            <QuickCreateModal
                quick={quick}
                onClose={() => setQuick(null)}
                onCreated={handleQuickCreated}
                marcaId={form.marca_id}
                categoriaId={form.categoria_id}
                marcas={marcas}
                categoriasRaiz={categoriasRaiz}
            />

            <Modal
                open={Boolean(deleteTarget)}
                onClose={() => setDeleteTarget(null)}
                title="Eliminar producto"
                description={`¿Seguro que deseas eliminar "${deleteTarget?.nombre}"?`}
                size="sm"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
                            Cancelar
                        </Button>
                        <Button variant="danger" loading={deleting} onClick={handleDelete}>
                            Eliminar
                        </Button>
                    </>
                }
            >
                <Alert variant="warning">Se eliminarán también sus unidades derivadas.</Alert>
            </Modal>

            {/* Detalle de solo lectura */}
            <Modal
                open={Boolean(detalle)}
                onClose={() => setDetalle(null)}
                title={detalle?.nombre ?? 'Detalle del producto'}
                description={detalle?.codigo ? `Código ${detalle.codigo}` : undefined}
                size="lg"
                footer={
                    <Button variant="secondary" onClick={() => setDetalle(null)}>Cerrar</Button>
                }
            >
                {detalle && (
                    <div className="space-y-5">
                        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
                            {[
                                ['Código', detalle.codigo],
                                ['Cód. barras', detalle.codigo_barras],
                                ['Marca', detalle.marca?.nombre],
                                ['Sub-marca', detalle.sub_marca?.nombre],
                                ['Categoría', detalle.categoria?.nombre],
                                ['Sub-categoría', detalle.sub_categoria?.nombre],
                                ['Unidad base', detalle.unidad_medida?.nombre],
                                ['Precio base', detalle.precio_base != null ? `S/ ${Number(detalle.precio_base).toFixed(2)}` : null],
                                ['Stock mín.', detalle.stock_minimo],
                                ['Stock máx.', detalle.stock_maximo],
                            ].map(([label, valor]) => (
                                <div key={label}>
                                    <p className="text-xs uppercase tracking-wide text-warm-500">{label}</p>
                                    <p className="font-medium text-warm-900">{valor ?? '—'}</p>
                                </div>
                            ))}
                            <div>
                                <p className="text-xs uppercase tracking-wide text-warm-500">Estado</p>
                                {detalle.activo ? <Badge variant="green">Activo</Badge> : <Badge variant="red">Inactivo</Badge>}
                            </div>
                        </div>

                        {detalle.descripcion && (
                            <div>
                                <p className="text-xs uppercase tracking-wide text-warm-500">Descripción</p>
                                <p className="text-sm text-warm-900">{detalle.descripcion}</p>
                            </div>
                        )}

                        <div>
                            <p className="mb-2 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-warm-500">
                                <Package className="h-4 w-4 text-primary-600" /> Unidades derivadas
                            </p>
                            <div className="overflow-x-auto rounded-lg border border-edge">
                                <table className="w-full min-w-[420px] text-sm">
                                    <thead>
                                        <tr className="bg-primary-600 text-left text-xs font-semibold uppercase tracking-wide text-white">
                                            <th className="px-3 py-2">Unidad</th>
                                            <th className="px-3 py-2 text-right">Factor</th>
                                            <th className="px-3 py-2 text-right">P. compra</th>
                                            <th className="px-3 py-2 text-right">P. venta</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {(detalle.presentaciones ?? []).length === 0 && (
                                            <tr><td colSpan={4} className="px-3 py-4 text-center text-warm-500">Sin unidades derivadas</td></tr>
                                        )}
                                        {(detalle.presentaciones ?? []).map((pres) => (
                                            <tr key={pres.id}>
                                                <td className="px-3 py-2 font-medium text-warm-900">{pres.nombre}</td>
                                                <td className="px-3 py-2 text-right text-warm-500">{Number(pres.factor_conversion)}</td>
                                                {/* Cada precio en su moneda: se compra en dólares y se vende en soles. */}
                                                <td className="px-3 py-2 text-right">{money(pres.precio_compra, detalle.moneda_compra)}</td>
                                                <td className="px-3 py-2 text-right font-semibold text-primary-600">{money(pres.precio_venta, detalle.moneda_venta)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}
            </Modal>

            <MenuContextual
                menu={menu}
                onClose={cerrarMenu}
                titulo={menu?.producto?.nombre}
                items={[
                    { label: 'Ver detalle', icon: Eye, onClick: () => setDetalle(menu.producto) },
                    { label: 'Editar producto', icon: Edit, onClick: () => openEdit(menu.producto) },
                    '-',
                    { label: 'Colores y stock', icon: Palette, onClick: () => setColoresDe(menu.producto) },
                    {
                        label: 'Movimientos (kardex)',
                        icon: History,
                        hidden: !puede('inventario.kardex'),
                        onClick: () =>
                            navigate(
                                `/kardex?producto=${menu.producto.id}&nombre=${encodeURIComponent(menu.producto.nombre)}`,
                            ),
                    },
                    {
                        label: 'Rollos en stock',
                        icon: Layers,
                        hidden: !puede('inventario.rollos'),
                        onClick: () => navigate(`/stock-rollos?producto=${menu.producto.id}`),
                    },
                    '-',
                    {
                        label: 'Lista de precios',
                        icon: Tag,
                        hidden: !puede('catalogo.lista-precios'),
                        onClick: () => navigate(`/lista-precios?producto=${menu.producto.id}`),
                    },
                ]}
            />

            {coloresDe && (
                <ColoresProductoModal
                    producto={coloresDe}
                    onClose={() => setColoresDe(null)}
                    verRollos={
                        puede('inventario.rollos')
                            ? (colorId) =>
                                  navigate(
                                      `/stock-rollos?producto=${coloresDe.id}${colorId ? `&color=${colorId}` : ''}`,
                                  )
                            : null
                    }
                />
            )}
        </Layout>
    );
}

/**
 * Los colores de una tela, cada uno con el metraje de su rollo y lo que hay
 * disponible de él (rollos y metros, sumando todos los almacenes). Lo que no
 * está disponible —separado para un pedido, por ejemplo— no cuenta.
 */
function ColoresProductoModal({ producto, onClose, verRollos }) {
    const [stock, setStock] = useState(null);
    const [sinPermiso, setSinPermiso] = useState(false);

    useEffect(() => {
        let vivo = true;
        api.get('/existencias', { params: { producto_id: producto.id } })
            .then((res) => {
                if (!vivo) return;
                // Por color: sumando todos los almacenes.
                const porColor = {};
                for (const fila of asList(res)) {
                    for (const c of fila.colores ?? []) {
                        const clave = String(c.id ?? 'sin');
                        const actual = porColor[clave] ?? { id: c.id, nombre: c.nombre, codigo: c.codigo, hex: c.hex, rollos: 0, metros: 0 };
                        actual.rollos += Number(c.rollos_disponibles ?? c.rollos) || 0;
                        actual.metros += Number(c.metros_disponibles ?? c.metros) || 0;
                        porColor[clave] = actual;
                    }
                }
                setStock(porColor);
            })
            .catch(() => {
                if (!vivo) return;
                setSinPermiso(true);
                setStock({});
            });
        return () => {
            vivo = false;
        };
    }, [producto.id]);

    // Los colores de la tela y, además, lo que haya en stock de un color que ya no está en su lista.
    const filas = [
        ...(producto.colores ?? []).map((c) => ({
            id: c.id,
            nombre: c.nombre,
            codigo: c.codigo,
            hex: c.hex,
            proveedor: c.nombre_proveedor,
            metraje: Number(c.metros_por_rollo) || 0,
        })),
        ...Object.values(stock ?? {})
            .filter((s) => !(producto.colores ?? []).some((c) => String(c.id) === String(s.id)))
            .map((s) => ({ id: s.id, nombre: s.nombre ?? 'Sin color', codigo: s.codigo, hex: s.hex, proveedor: null, metraje: 0 })),
    ];
    const stockDe = (id) => stock?.[String(id ?? 'sin')] ?? { rollos: 0, metros: 0 };
    const totalRollos = filas.reduce((s, f) => s + stockDe(f.id).rollos, 0);
    const totalMetros = filas.reduce((s, f) => s + stockDe(f.id).metros, 0);

    return (
        <Modal
            open
            onClose={onClose}
            title={`Colores de ${producto.nombre}`}
            description={`${filas.length} color${filas.length === 1 ? '' : 'es'} · lo disponible, sumando todos los almacenes`}
            size="3xl"
            footer={
                <>
                    {verRollos && (
                        <Button variant="secondary" onClick={() => verRollos(null)}>
                            <Layers className="h-4 w-4" />
                            Ver todos los rollos
                        </Button>
                    )}
                    <Button variant="secondary" onClick={onClose}>
                        Cerrar
                    </Button>
                </>
            }
        >
            {sinPermiso && (
                <Alert variant="warning" className="mb-3">
                    No se pudo consultar el stock (Existencias): se muestran solo los colores.
                </Alert>
            )}
            <div className="overflow-x-auto rounded-lg border border-edge">
                <table className="w-full min-w-[680px] text-sm">
                    <thead>
                        <tr className="bg-primary-600 text-left text-xs font-semibold uppercase tracking-wide text-white">
                            <th className="px-3 py-2">Ítem</th>
                            <th className="px-3 py-2">Color</th>
                            <th className="px-3 py-2">Nombre del proveedor</th>
                            <th className="px-3 py-2 text-right">Metraje del rollo</th>
                            <th className="px-3 py-2 text-right">Rollos disp.</th>
                            <th className="px-3 py-2 text-right">Metros disp.</th>
                            {verRollos && <th className="w-24 px-3 py-2" />}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {filas.length === 0 && (
                            <tr>
                                <td colSpan={7} className="px-3 py-8 text-center text-sm text-warm-400">
                                    Esta tela no tiene colores. Agrégalos en Editar producto → Colores.
                                </td>
                            </tr>
                        )}
                        {filas.map((f) => {
                            const s = stockDe(f.id);
                            return (
                                <tr key={f.id ?? 'sin'}>
                                    <td className="px-3 py-2 font-mono text-xs text-warm-700">
                                        {[producto.codigo, f.codigo].filter(Boolean).join('-') || '—'}
                                    </td>
                                    <td className="px-3 py-2">
                                        <span className="inline-flex items-center gap-2 font-medium uppercase text-warm-900">
                                            <span
                                                className="h-3 w-3 shrink-0 rounded-full ring-1 ring-black/10"
                                                style={{ backgroundColor: f.hex || '#9ca3af' }}
                                            />
                                            {f.nombre}
                                        </span>
                                    </td>
                                    <td className="px-3 py-2 text-warm-600">{f.proveedor || '—'}</td>
                                    <td className="px-3 py-2 text-right text-warm-900">
                                        {f.metraje ? `${formatoMetros(f.metraje)} m` : '—'}
                                    </td>
                                    <td className="px-3 py-2 text-right text-warm-900">
                                        {stock === null ? '…' : formatoMetros(s.rollos)}
                                    </td>
                                    <td className="px-3 py-2 text-right font-medium text-warm-900">
                                        {stock === null ? '…' : `${formatoMetros(s.metros)} m`}
                                    </td>
                                    {verRollos && (
                                        <td className="px-3 py-2 text-right">
                                            {s.rollos > 0 && (
                                                <button
                                                    type="button"
                                                    onClick={() => verRollos(f.id)}
                                                    className="text-xs font-semibold text-primary-600 hover:text-primary-800"
                                                >
                                                    Rollos →
                                                </button>
                                            )}
                                        </td>
                                    )}
                                </tr>
                            );
                        })}
                    </tbody>
                    {filas.length > 0 && stock !== null && (
                        <tfoot>
                            <tr className="border-t-2 border-edge bg-gray-50 text-sm font-bold text-warm-900">
                                <td className="px-3 py-2 uppercase" colSpan={4}>
                                    Total
                                </td>
                                <td className="px-3 py-2 text-right">{formatoMetros(totalRollos)}</td>
                                <td className="px-3 py-2 text-right">{formatoMetros(totalMetros)} m</td>
                                {verRollos && <td />}
                            </tr>
                        </tfoot>
                    )}
                </table>
            </div>
        </Modal>
    );
}

// Envuelve un Select con un botón "+" a la derecha para creación rápida.
function FieldWithAdd({ children, onAdd }) {
    return (
        <div className="flex items-end gap-2">
            <div className="flex-1">{children}</div>
            <button
                type="button"
                onClick={onAdd}
                title="Crear nuevo"
                className="mb-0.5 rounded-md p-1.5 text-emerald-600 transition hover:bg-emerald-50"
            >
                <PlusCircle className="h-5 w-5" />
            </button>
        </div>
    );
}

// Mini-modal de creación rápida de catálogos.
function QuickCreateModal({ quick, onClose, onCreated, marcaId, categoriaId, marcas, categoriasRaiz }) {
    const toast = useToast();
    const [values, setValues] = useState({});
    const [saving, setSaving] = useState(false);

    const cfg = useMemo(() => {
        switch (quick?.tipo) {
            case 'marca':
                return {
                    title: 'Nueva marca',
                    endpoint: '/marcas',
                    build: (v) => ({ nombre: v.nombre, activo: true }),
                    fields: [{ key: 'nombre', label: 'Nombre de marca', required: true }],
                };
            case 'submarca':
                return {
                    title: 'Nueva submarca',
                    endpoint: '/sub-marcas',
                    build: (v) => ({ marca_id: marcaId, nombre: v.nombre, activo: true }),
                    fields: [{ key: 'nombre', label: 'Nombre de submarca', required: true }],
                };
            case 'categoria':
                return {
                    title: 'Nueva categoría',
                    endpoint: '/categorias',
                    build: (v) => ({ nombre: v.nombre, nivel: 1, activo: true }),
                    fields: [{ key: 'nombre', label: 'Nombre de categoría', required: true }],
                };
            case 'subcategoria':
                return {
                    title: 'Nueva subcategoría',
                    endpoint: '/categorias',
                    build: (v) => ({
                        nombre: v.nombre,
                        categoria_padre_id: categoriaId,
                        nivel: 2,
                        activo: true,
                    }),
                    fields: [{ key: 'nombre', label: 'Nombre de subcategoría', required: true }],
                };
            case 'color':
                return {
                    title: 'Nuevo color',
                    endpoint: '/colores',
                    build: (v) => ({ nombre: v.nombre, activo: true }),
                    fields: [{ key: 'nombre', label: 'Nombre del color', required: true }],
                };
            case 'unidad':
                return {
                    title: 'Nueva unidad de medida',
                    endpoint: '/unidades-medida',
                    build: (v) => ({
                        nombre: v.nombre,
                        abreviatura: v.abreviatura,
                        factor_base: v.factor_base === '' || v.factor_base == null ? 1 : Number(v.factor_base),
                    }),
                    fields: [
                        { key: 'nombre', label: 'Nombre (ej: SACO)', required: true },
                        { key: 'abreviatura', label: 'Abreviatura (ej: sc)', required: true },
                        {
                            key: 'factor_base',
                            label: 'Equivale a (en su unidad mínima)',
                            type: 'number',
                        },
                    ],
                };
            default:
                return null;
        }
    }, [quick, marcaId, categoriaId]);

    useEffect(() => {
        setValues({});
    }, [quick]);

    if (!quick || !cfg) return null;

    const canSave = cfg.fields.every((f) => !f.required || (values[f.key] ?? '').toString().trim());

    const submit = async () => {
        setSaving(true);
        try {
            const res = await api.post(cfg.endpoint, cfg.build(values));
            const nuevo = res.data?.data ?? res.data;
            toast.success(`${cfg.title.replace('Nueva ', '').replace('Nuevo ', '')} creada.`);
            await onCreated(quick.tipo, nuevo, quick);
            onClose();
        } catch {
            toast.error('No se pudo crear. Verifica los datos.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal
            open
            onClose={onClose}
            title={cfg.title}
            size="sm"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>
                        Cancelar
                    </Button>
                    <Button loading={saving} disabled={!canSave} onClick={submit}>
                        Guardar
                    </Button>
                </>
            }
        >
            <div className="space-y-3">
                {quick.tipo === 'submarca' && (
                    <p className="text-xs text-gray-500">
                        Marca: <strong>{marcas.find((m) => String(m.id) === String(marcaId))?.nombre}</strong>
                    </p>
                )}
                {quick.tipo === 'subcategoria' && (
                    <p className="text-xs text-gray-500">
                        Categoría:{' '}
                        <strong>
                            {categoriasRaiz.find((c) => String(c.id) === String(categoriaId))?.nombre}
                        </strong>
                    </p>
                )}
                {cfg.fields.map((f) => (
                    <Input
                        key={f.key}
                        label={f.label}
                        type={f.type ?? 'text'}
                        value={values[f.key] ?? ''}
                        onChange={(e) => setValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
                    />
                ))}
            </div>
        </Modal>
    );
}

/**
 * Los proveedores de una tela dentro de la tabla.
 *
 * Con uno solo se muestra su nombre y ya. Con varios se ofrece un selector,
 * porque lo que interesa comparar es a qué precio y con qué código la trae
 * cada uno, y eso no cabe en una celda de texto.
 *
 * No modifica nada: solo cambia qué proveedor se está mirando.
 */
function CeldaProveedores({ proveedores }) {
    const lista = Array.isArray(proveedores) ? proveedores : [];
    const principal = lista.find((p) => p.principal) ?? lista[0];
    const [elegido, setElegido] = useState(String(principal?.proveedor_id ?? ''));

    if (!lista.length) return <span className="text-gray-400">—</span>;

    if (lista.length === 1) {
        return (
            <span className="text-sm">
                <span className="block truncate">{principal.nombre}</span>
                <span className="text-xs text-warm-400">
                    {[principal.codigo_proveedor, principal.precio_referencia && money(principal.precio_referencia)]
                        .filter(Boolean)
                        .join(' · ') || '—'}
                </span>
            </span>
        );
    }

    // El código y el precio son la segunda línea de cada opción: es lo que se
    // compara entre proveedores, y en un <select> nativo no cabría.
    const detalle = (p) =>
        [p.codigo_proveedor, p.precio_referencia && money(p.precio_referencia)]
            .filter(Boolean)
            .join(' · ') || 'sin datos';

    return (
        // La fila no debe reaccionar al usar el selector.
        <div onClick={(e) => e.stopPropagation()} className="min-w-[13rem]">
            <OptionSelect
                size="sm"
                value={elegido}
                onChange={(v) => setElegido(v)}
                aria-label={`Proveedores (${lista.length})`}
                options={lista.map((p) => ({
                    value: String(p.proveedor_id),
                    label: p.nombre,
                    detail: detalle(p),
                    badge: p.principal ? <Badge variant="blue">Principal</Badge> : null,
                }))}
            />
        </div>
    );
}
