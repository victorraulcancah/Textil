import { useCallback, useEffect, useMemo, useState } from 'react';
import { Edit, Eye, Package, Plus, PlusCircle, Save, Trash2 } from 'lucide-react';
import api, { asList } from '../lib/api';
import { calcularPresentaciones, describirContenido } from '../lib/unidades';
import { useToast } from '../lib/toast';
import Layout from '../components/Layout';
import PageHeader, { CreateButton } from '../components/PageHeader';
import { Alert, Badge, Button, DataTable, Input, Modal, Select, Tabs, cn } from '../components/ui';

/** Soles con hasta 4 decimales: el costo por gramo puede ser S/ 0.0028. */
const money = (n) =>
    new Intl.NumberFormat('es-PE', {
        style: 'currency',
        currency: 'PEN',
        maximumFractionDigits: 4,
    }).format(Number(n) || 0);

const emptyProducto = {
    codigo: '',
    codigo_barras: '',
    nombre: '',
    descripcion_ticket: '',
    categoria_id: '',
    sub_categoria_id: '',
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
    ancho_cm: '',
    gramaje: '',
    tipo_tejido: '',
    elasticidad: '',
    encogimiento: '',
    minimo_compra: '',
    usos: '',
    propiedades: '',
    cuidados: '',
};

/** Pestañas del modal: el formulario es largo y se parte por temas. */
const TABS = [
    { key: 'general', label: 'General' },
    { key: 'ficha', label: 'Ficha técnica' },
    { key: 'comercial', label: 'Compra y venta' },
];

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
    const [productos, setProductos] = useState([]);
    const [categorias, setCategorias] = useState([]);
    const [marcas, setMarcas] = useState([]);
    const [subMarcas, setSubMarcas] = useState([]);
    const [unidades, setUnidades] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const [modalOpen, setModalOpen] = useState(false);
    const [tab, setTab] = useState('general');
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState(emptyProducto);
    const [compra, setCompra] = useState(compraVacia);
    const [ventas, setVentas] = useState([ventaVacia()]);
    const [errors, setErrors] = useState({});
    const [saving, setSaving] = useState(false);

    const [deleteTarget, setDeleteTarget] = useState(null);
    const [detalle, setDetalle] = useState(null);
    const [deleting, setDeleting] = useState(false);

    const [quick, setQuick] = useState(null); // { tipo }

    const [filterEstado, setFilterEstado] = useState('');
    const [activeFilters, setActiveFilters] = useState({});

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [prodsRes, catRes, marRes, subRes, uniRes] = await Promise.all([
                api.get('/productos'),
                api.get('/categorias'),
                api.get('/marcas'),
                api.get('/sub-marcas'),
                api.get('/unidades-medida'),
            ]);
            setProductos(asList(prodsRes));
            setCategorias(asList(catRes));
            setMarcas(asList(marRes));
            setSubMarcas(asList(subRes));
            setUnidades(asList(uniRes));
        } catch {
            setError('No se pudieron cargar los productos.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

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

    // ---- Abrir / editar ----
    const openCreate = () => {
        setEditing(null);
        setForm(emptyProducto);
        setCompra(compraVacia());
        setVentas([ventaVacia()]);
        setErrors({});
        setTab('general');
        setModalOpen(true);
    };

    const openEdit = (prod) => {
        const relId = (direct, rel) =>
            prod[direct] ? String(prod[direct]) : prod[rel]?.id ? String(prod[rel].id) : '';
        setEditing(prod);
        setForm({
            codigo: prod.codigo ?? '',
            codigo_barras: prod.codigo_barras ?? '',
            nombre: prod.nombre ?? '',
            descripcion_ticket: prod.descripcion_ticket ?? '',
            categoria_id: relId('categoria_id', 'categoria'),
            sub_categoria_id: relId('sub_categoria_id', 'sub_categoria'),
            marca_id: relId('marca_id', 'marca'),
            sub_marca_id: relId('sub_marca_id', 'sub_marca'),
            unidad_medida_id: relId('unidad_medida_id', 'unidad_medida'),
            factor_compra_base: prod.factor_compra_base ?? '1',
            stock_minimo: prod.stock_minimo ?? '',
            stock_maximo: prod.stock_maximo ?? '',
            activo: prod.activo !== false,
            descripcion: prod.descripcion ?? '',
            composicion: prod.composicion ?? '',
            ancho_cm: prod.ancho_cm ?? '',
            gramaje: prod.gramaje ?? '',
            tipo_tejido: prod.tipo_tejido ?? '',
            elasticidad: prod.elasticidad ?? '',
            encogimiento: prod.encogimiento ?? '',
            minimo_compra: prod.minimo_compra ?? '',
            usos: prod.usos ?? '',
            propiedades: prod.propiedades ?? '',
            cuidados: prod.cuidados ?? '',
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
        setVentas(
            pres.length
                ? pres.map((p) => ({
                      unidad_id: p.unidad_base?.id ? String(p.unidad_base.id) : '',
                      margen: p.margen != null ? String(p.margen) : '',
                      precio_venta: p.precio_venta != null ? String(p.precio_venta) : '',
                  }))
                : [ventaVacia()],
        );
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

        // La unidad de compra se guarda siempre como formato (si no, no se
        // podría registrar la compra en esa unidad). Se agrega a la lista para
        // que se vea y se le pueda poner precio de venta; se puede quitar.
        if (campo === 'unidad_compra_id' && valor) {
            setVentas((prev) =>
                prev.some((v) => String(v.unidad_id) === String(valor))
                    ? prev
                    : [...prev.filter((v) => v.unidad_id), { ...ventaVacia(), unidad_id: valor }],
            );
        }
    };

    const addVenta = () => setVentas((prev) => [...prev, ventaVacia()]);
    const removeVenta = (index) =>
        setVentas((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)));

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

    const calculo = useMemo(
        () => calcularPresentaciones({ unidades, compra, ventas }),
        [unidades, compra, ventas],
    );

    const filaDe = (unidadId) =>
        calculo.filas.find((f) => String(f.unidad_id) === String(unidadId)) ?? null;
    const costoDe = (unidadId) => filaDe(unidadId)?.precio_compra ?? 0;
    /** Number -> texto sin ceros de relleno: 3.5 y 0.0035, no 3.5000. */
    const conDecimales = (n) => String(+Number(n).toFixed(4));

    // ---- Guardar ----
    const validate = () => {
        const next = {};
        // El código ya no se pide en el formulario: lo genera el servidor.
        if (!form.nombre.trim()) next.nombre = 'Ingrese el nombre';
        if (!compra.unidad_compra_id) next.compra_unidad = 'Indique en qué compra el producto';
        if (!(Number(compra.cantidad) > 0)) next.compra_cantidad = 'Indique cuánto trae';
        if (!compra.unidad_contenido_id) next.compra_contenido = 'Indique la unidad del contenido';
        if (ventas.filter((v) => v.unidad_id).length === 0) {
            next.ventas = 'Agregue al menos un formato de venta';
        }
        const repetidas = ventas.map((v) => String(v.unidad_id)).filter(Boolean);
        if (new Set(repetidas).size !== repetidas.length) {
            next.ventas = 'Hay formatos de venta repetidos';
        }
        setErrors(next);
        return Object.keys(next).length === 0;
    };

    const buildPresentaciones = () =>
        calculo.filas.map((f, i) => ({
            nombre: unidadNombre(f.unidad_id) || `Presentación ${i + 1}`,
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
            // La unidad base es el formato de venta más pequeño, calculado solo.
            unidad_medida_id: calculo.baseId,
            unidad_base_id: calculo.baseId,
            unidad_compra_id: compra.unidad_compra_id || undefined,
            activo: form.activo,
            codigo_barras: str(form.codigo_barras),
            descripcion_ticket: str(form.descripcion_ticket),
            categoria_id: form.categoria_id || undefined,
            sub_categoria_id: form.sub_categoria_id || undefined,
            marca_id: form.marca_id || undefined,
            sub_marca_id: form.sub_marca_id || undefined,
            factor_compra_base: calculo.factorCompraBase || undefined,
            stock_minimo: num(form.stock_minimo),
            stock_maximo: num(form.stock_maximo),
            descripcion: str(form.descripcion),
            composicion: str(form.composicion),
            ancho_cm: num(form.ancho_cm),
            gramaje: num(form.gramaje),
            tipo_tejido: str(form.tipo_tejido),
            elasticidad: str(form.elasticidad),
            encogimiento: num(form.encogimiento),
            minimo_compra: num(form.minimo_compra),
            usos: str(form.usos),
            propiedades: str(form.propiedades),
            cuidados: str(form.cuidados),
            presentaciones: buildPresentaciones(),
        };

        try {
            if (editing) {
                await api.put(`/productos/${editing.id}`, payload);
                toast.success('Producto actualizado correctamente.');
            } else {
                await api.post('/productos', payload);
                toast.success('Producto creado correctamente.');
            }
            setModalOpen(false);
            await load();
        } catch (err) {
            if (err.response?.status === 422) {
                const validation = err.response.data?.errors ?? {};
                setErrors(Object.fromEntries(Object.entries(validation).map(([k, v]) => [k, v[0]])));
                toast.error('Verifique los datos del producto.');
            } else {
                toast.error('No se pudo guardar el producto.');
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
    const handleQuickCreated = async (tipo, nuevo) => {
        await load();
        if (tipo === 'marca') setForm((p) => ({ ...p, marca_id: String(nuevo.id), sub_marca_id: '' }));
        if (tipo === 'submarca') setForm((p) => ({ ...p, sub_marca_id: String(nuevo.id) }));
        if (tipo === 'categoria')
            setForm((p) => ({ ...p, categoria_id: String(nuevo.id), sub_categoria_id: '' }));
        if (tipo === 'subcategoria') setForm((p) => ({ ...p, sub_categoria_id: String(nuevo.id) }));
        // Unidad: no autoselecciona base; el usuario decide dónde usarla.
    };

    // ---- Tabla lista ----
    const relName = (row, key) => {
        const r = row[key];
        return r && typeof r === 'object' ? (r.nombre ?? '') : '';
    };

    const columns = [
        {
            key: 'nombre',
            label: 'Producto',
            render: (row) => (
                <span className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-100 text-primary-700">
                        <Package className="h-4 w-4" />
                    </span>
                    <span>
                        <span className="block font-medium text-warm-900">{row.nombre}</span>
                        <span className="block text-xs text-gray-500">{row.codigo}</span>
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

    const applyFilters = () => setActiveFilters(filterEstado ? { estado: filterEstado } : {});
    const clearFilters = () => {
        setFilterEstado('');
        setActiveFilters({});
    };
    const filteredProductos = productos.filter((p) => {
        if (activeFilters.estado === 'activos') return p.activo !== false;
        if (activeFilters.estado === 'inactivos') return p.activo === false;
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
            <Button variant="primary" size="sm" onClick={applyFilters}>
                Aplicar
            </Button>
            {filterCount > 0 && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                    Limpiar
                </Button>
            )}
        </div>
    );


    return (
        <Layout>
            <PageHeader
                title="Productos"
                description="Administra el catálogo, sus unidades derivadas y precios"
                actions={<CreateButton onClick={openCreate}>Crear producto</CreateButton>}
            />

            {error && (
                <Alert variant="error" className="mb-4">
                    {error}
                </Alert>
            )}

            <DataTable
                columns={columns}
                rows={filteredProductos}
                loading={loading}
                searchPlaceholder="Buscar productos..."
                filterable
                filters={productFilters}
                filterCount={filterCount}
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
                            {/* El código se genera solo en el servidor (PROD001, PROD002…). */}
                            <Input
                                label="Producto"
                                value={form.nombre}
                                onChange={setField('nombre')}
                                error={errors.nombre}
                                className="sm:col-span-2"
                            />
                            <Input
                                label="Código de barra"
                                value={form.codigo_barras}
                                onChange={setField('codigo_barras')}
                                error={errors.codigo_barras}
                            />
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
                                <Select
                                    label="Categoría"
                                    value={form.categoria_id}
                                    onChange={(e) =>
                                        setForm((p) => ({
                                            ...p,
                                            categoria_id: e.target.value,
                                            sub_categoria_id: '',
                                        }))
                                    }
                                    options={[
                                        { value: '', label: 'Seleccionar categoría' },
                                        ...categoriasRaiz.map((c) => ({
                                            value: String(c.id),
                                            label: c.nombre,
                                        })),
                                    ]}
                                />
                            </FieldWithAdd>
                            <FieldWithAdd
                                onAdd={() =>
                                    form.categoria_id
                                        ? setQuick({ tipo: 'subcategoria' })
                                        : toast.error('Elige una categoría primero.')
                                }
                            >
                                <Select
                                    label="Subcategoría"
                                    value={form.sub_categoria_id}
                                    onChange={setField('sub_categoria_id')}
                                    options={[
                                        { value: '', label: 'Seleccionar subcategoría' },
                                        ...subCategoriasDe(form.categoria_id).map((c) => ({
                                            value: String(c.id),
                                            label: c.nombre,
                                        })),
                                    ]}
                                />
                            </FieldWithAdd>
                            <FieldWithAdd onAdd={() => setQuick({ tipo: 'marca' })}>
                                <Select
                                    label="Marca"
                                    value={form.marca_id}
                                    onChange={(e) =>
                                        setForm((p) => ({
                                            ...p,
                                            marca_id: e.target.value,
                                            sub_marca_id: '',
                                        }))
                                    }
                                    options={[
                                        { value: '', label: 'Seleccionar marca' },
                                        ...marcas.map((m) => ({ value: String(m.id), label: m.nombre })),
                                    ]}
                                />
                            </FieldWithAdd>
                            <FieldWithAdd
                                onAdd={() =>
                                    form.marca_id
                                        ? setQuick({ tipo: 'submarca' })
                                        : toast.error('Elige una marca primero.')
                                }
                            >
                                <Select
                                    label="Submarca"
                                    value={form.sub_marca_id}
                                    onChange={setField('sub_marca_id')}
                                    options={[
                                        { value: '', label: 'Seleccionar submarca' },
                                        ...subMarcasDe(form.marca_id).map((s) => ({
                                            value: String(s.id),
                                            label: s.nombre,
                                        })),
                                    ]}
                                />
                            </FieldWithAdd>
                        </div>
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
                            <Input
                                label="Encogimiento (%)"
                                type="number"
                                step="0.5"
                                placeholder="5"
                                value={form.encogimiento}
                                onChange={setField('encogimiento')}
                                error={errors.encogimiento}
                            />
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
                            <Input
                                label="Mínimo de compra"
                                type="number"
                                step="0.5"
                                placeholder="5"
                                value={form.minimo_compra}
                                onChange={setField('minimo_compra')}
                                error={errors.minimo_compra}
                            />
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
                            Usos y cuidados
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
                                label="Usos recomendados"
                                placeholder="Camisería, vestidos de verano, mantelería…"
                                value={form.usos}
                                onChange={setField('usos')}
                                error={errors.usos}
                            />
                            <Input
                                label="Propiedades especiales"
                                placeholder="Antipilling, repelente al agua, protección UV, preencogido…"
                                value={form.propiedades}
                                onChange={setField('propiedades')}
                                error={errors.propiedades}
                            />
                            <Input
                                label="Cuidados de lavado"
                                placeholder="Lavar a 30 °C, no usar lejía, planchado medio…"
                                value={form.cuidados}
                                onChange={setField('cuidados')}
                                error={errors.cuidados}
                            />
                        </div>
                    </section>
                </div>

                {/* ── Compra y venta ── */}
                <div className={cn('space-y-6', tab !== 'comercial' && 'hidden')}>
                    {/* Cómo lo compro */}
                    <section>
                        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                            Cómo lo compro
                        </h3>
                        {/* Rejilla de 2x2, igual que Clasificación: cada campo con
                            su etiqueta encima y todos alineados. */}
                        <div className="grid gap-4 sm:grid-cols-2">
                            <FieldWithAdd onAdd={() => setQuick({ tipo: 'unidad' })}>
                                <Select
                                    label="Compro por"
                                    value={compra.unidad_compra_id}
                                    onChange={setCompraField('unidad_compra_id')}
                                    options={[
                                        { value: '', label: unidadOptions.length ? 'Seleccionar unidad…' : '' },
                                        ...unidadOptions,
                                    ]}
                                    error={errors.compra_unidad}
                                />
                            </FieldWithAdd>
                            <Input
                                label={`¿Cuánto pagas por ${unidadCompraTexto}?`}
                                type="number"
                                step="any"
                                min="0"
                                placeholder="140.00"
                                value={compra.precio}
                                onChange={setCompraField('precio')}
                            />
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
                            <Select
                                label="¿En qué unidad?"
                                value={compra.unidad_contenido_id}
                                onChange={setCompraField('unidad_contenido_id')}
                                options={[
                                    // Sin unidades registradas no se lista nada (ni un ejemplo).
                                    { value: '', label: unidadOptions.length ? 'Seleccionar unidad…' : '' },
                                    ...unidadOptions,
                                ]}
                                error={errors.compra_contenido}
                            />
                        </div>
                    </section>

                    {/* Cómo lo vendo */}
                    <section>
                        <div className="mb-2 flex items-center justify-between">
                            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                                Cómo lo vendo
                            </h3>
                            <Button variant="secondary" size="sm" onClick={addVenta}>
                                <Plus className="h-4 w-4" />
                                Agregar formato
                            </Button>
                        </div>
                        {errors.ventas && (
                            <Alert variant="warning" className="mb-2">
                                {errors.ventas}
                            </Alert>
                        )}
                        <div className="overflow-x-auto rounded-lg border border-edge">
                            <table className="w-full min-w-[640px] text-sm">
                                <thead>
                                    <tr className="bg-primary-600 text-left text-xs text-white">
                                        <th className="px-2 py-2 font-medium">Vendo por</th>
                                        <th className="px-2 py-2 font-medium">Me cuesta</th>
                                        <th className="px-2 py-2 font-medium">% ganancia</th>
                                        <th className="px-2 py-2 font-medium">Precio de venta</th>
                                        <th className="px-2 py-2 font-medium">Ganas</th>
                                        <th className="w-10 px-2 py-2" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {ventas.map((v, i) => {
                                        const fila = filaDe(v.unidad_id);
                                        const ganancia = fila ? fila.precio_venta - fila.precio_compra : 0;
                                        return (
                                            <tr key={i} className="border-t border-edge">
                                                <td className="px-2 py-1.5">
                                                    <select
                                                        className="h-8 w-full rounded-md border border-gray-300 bg-white px-2 text-sm"
                                                        value={v.unidad_id}
                                                        onChange={(e) =>
                                                            setVentaField(i, 'unidad_id', e.target.value)
                                                        }
                                                    >
                                                        <option value="">Elegir formato…</option>
                                                        {unidadOptions.map((o) => (
                                                            <option key={o.value} value={o.value}>
                                                                {o.label}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </td>
                                                <td className="px-2 py-1.5 text-warm-600">
                                                    {fila ? money(fila.precio_compra) : '—'}
                                                </td>
                                                <td className="px-2 py-1.5">
                                                    <input
                                                        type="number"
                                                        step="any"
                                                        className="h-8 w-20 rounded-md border border-gray-300 px-2 text-sm"
                                                        value={v.margen}
                                                        onChange={(e) =>
                                                            setVentaField(i, 'margen', e.target.value)
                                                        }
                                                    />
                                                </td>
                                                <td className="px-2 py-1.5">
                                                    <input
                                                        type="number"
                                                        step="any"
                                                        min="0"
                                                        className="h-8 w-28 rounded-md border border-gray-300 bg-emerald-50 px-2 text-sm font-medium"
                                                        value={
                                                            v.precio_venta !== ''
                                                                ? v.precio_venta
                                                                : fila
                                                                  ? conDecimales(fila.precio_venta)
                                                                  : ''
                                                        }
                                                        onChange={(e) =>
                                                            setVentaField(i, 'precio_venta', e.target.value)
                                                        }
                                                    />
                                                </td>
                                                <td className="px-2 py-1.5 text-warm-600">
                                                    {fila && fila.precio_compra > 0 ? (
                                                        <span
                                                            className={
                                                                ganancia < 0 ? 'text-red-600' : 'text-green-700'
                                                            }
                                                        >
                                                            {money(ganancia)}
                                                        </span>
                                                    ) : (
                                                        '—'
                                                    )}
                                                </td>
                                                <td className="px-2 py-1.5 text-center">
                                                    <button
                                                        type="button"
                                                        aria-label="Quitar"
                                                        disabled={ventas.length === 1}
                                                        onClick={() => removeVenta(i)}
                                                        className="rounded p-1 text-red-600 transition hover:bg-red-50 disabled:opacity-30"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        <p className="mt-2 text-xs text-warm-500">
                            La unidad en que compras se guarda siempre como formato, para poder
                            registrar la compra en ella.{' '}
                            El costo de cada formato sale de tu precio de compra. El precio de venta se
                            calcula con el % de ganancia; si escribes uno a mano, manda el tuyo.
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
                                                <td className="px-3 py-2 text-right">S/ {Number(pres.precio_compra ?? 0).toFixed(2)}</td>
                                                <td className="px-3 py-2 text-right font-semibold text-primary-600">S/ {Number(pres.precio_venta ?? 0).toFixed(2)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}
            </Modal>
        </Layout>
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
            await onCreated(quick.tipo, nuevo);
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
