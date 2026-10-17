<?php

/**
 * Árbol de permisos en tres niveles: módulo → submódulo → acciones.
 *
 * Es la única fuente de verdad: de aquí salen los permisos que se crean en la
 * base, el árbol que pinta la pantalla de roles y el bloqueo de la API.
 *
 * El permiso se llama "modulo.submodulo.accion" (ventas.clientes.crear).
 *
 * En cada submódulo, `apis` son los prefijos de ruta que protege. El método
 * HTTP decide la acción: GET → ver, POST → crear, PUT/PATCH → editar,
 * DELETE → eliminar. Un submódulo sin `apis` solo controla el menú.
 *
 * Cuando eso no alcanza —el almacenero debe poder despachar un pedido pero no
 * crearlo, y ambas cosas son POST sobre la misma ruta— el submódulo declara
 * `patrones`: rutas concretas con la acción que exigen. Los patrones ganan
 * sobre los prefijos, porque son más específicos.
 */
return [

    // Etiqueta de cada acción.
    'acciones' => [
        'ver' => 'Ver',
        // Solo la tienen los submódulos que declaran su propio dueño
        // (vendedor, ejecutivo): sin ella, "ver" muestra nada más lo propio.
        'ver_todo' => 'Ver de todos',
        'crear' => 'Crear',
        'editar' => 'Editar',
        'eliminar' => 'Eliminar',
        'imprimir' => 'Imprimir',
        // Cargar o descargar un Excel es su propia acción: alguien puede
        // necesitar exportar el catálogo sin poder importarlo (o al revés).
        'importar' => 'Importar',
        'exportar' => 'Exportar',
        // Repartir los pedidos entre los almaceneros: lo hace el encargado.
        'asignar' => 'Asignar tareas',
        // La bandeja de solicitudes de traslado: decide si el traslado sale
        // o no. Quien lo crea no necesariamente puede autorizarlo.
        'aprobar' => 'Aprobar / rechazar',
        // Cuánto se le fía a un cliente lo decide quien aprueba el crédito,
        // no cualquiera que edite sus datos.
        'linea_credito' => 'Aprobar línea de crédito',
        // Tesorería: lo que se hace sobre movimientos y cierres ya registrados. Anular un movimiento es libre por
        // defecto; lo demás lo hace solo quien tenga el permiso.
        'anular_movimiento' => 'Anular movimientos',
        'editar_movimiento' => 'Editar movimientos',
        'corregir_pago' => 'Corregir pagos',
        'convertir_anticipo' => 'Convertir un ingreso en anticipo',
        'anular_cierre' => 'Anular cierres',
        'recerrar' => 'Hacer el recierre (corregir un cierre)',
        'modificar_cerrado' => 'Modificar una caja ya cerrada',
        // Anticipos: devolverle al cliente lo que sobra.
        'devolver' => 'Devolver anticipos',
        // Vender a crédito por encima de lo disponible de la línea.
        'exceder_credito' => 'Autorizar exceso de crédito',
    ],

    // Las que tiene cualquier submódulo. "Imprimir" no está aquí: solo la
    // reciben los que declaran documentos PDF (clave `pdf`), porque en un
    // catálogo de marcas no hay nada que imprimir.
    'acciones_base' => ['ver', 'crear', 'editar', 'eliminar'],

    /**
     * Roles que siempre lo pueden todo, sin depender de sus permisos. Evita
     * quedarse fuera del sistema por un permiso mal quitado. Tampoco se les
     * puede limitar ni eliminar desde la pantalla de roles.
     */
    'super_admin' => ['super-admin', 'admin'],

    'modulos' => [
        'dashboard' => [
            'label' => 'Escritorio',
            'submodulos' => [
                'dashboard' => [
                    'label' => 'Escritorio',
                    'apis' => ['dashboard', 'alertas'],
                    // Un tablero solo se consulta.
                    'acciones' => ['ver'],
                ],
            ],
        ],

        'ventas' => [
            'label' => 'Ventas',
            'submodulos' => [
                'clientes' => [
                    'label' => 'Clientes',
                    'apis' => ['clientes'],
                    // Sin "ver todo", cada quien ve solo los clientes a su cargo.
                    'acciones' => ['ver', 'ver_todo', 'crear', 'editar', 'eliminar', 'linea_credito'],
                    // El bloqueo de crédito (⚫) lo pone y lo quita quien aprueba la línea.
                    'patrones' => [
                        'clientes/*/bloquear-credito' => 'linea_credito',
                        'clientes/*/desbloquear-credito' => 'linea_credito',
                    ],
                ],
                'categorias-comerciales' => ['label' => 'Categorías comerciales', 'apis' => ['categorias-comerciales']],
                'actividades-comerciales' => ['label' => 'Actividades comerciales', 'apis' => ['actividades-comerciales']],
                'pedidos' => [
                    'label' => 'Pedidos',
                    'apis' => ['ordenes-venta'],
                    'pdf' => ['orden-venta', 'requerimiento-almacen'],
                    // Sin "ver todo", cada vendedor ve solo los pedidos que tomó.
                    'acciones' => ['ver', 'ver_todo', 'crear', 'editar', 'eliminar'],
                    // Corregir la fecha de un pedido es editarlo, no crear otro.
                    'patrones' => ['ordenes-venta/*/fecha' => 'editar'],
                ],
                'notas-venta' => [
                    'label' => 'Proformas',
                    'apis' => ['notas-venta'],
                    'pdf' => ['nota-venta'],
                    'acciones' => ['ver', 'crear', 'editar', 'eliminar', 'exceder_credito'],
                    // Facturar un pedido es crear una venta, no crear un pedido.
                    'patrones' => ['ordenes-venta/*/facturar' => 'crear', 'notas-venta/*/fecha' => 'editar'],
                ],
                // Dinero que el cliente entrega antes de la venta, en soles o en dólares; anular es eliminar.
                'anticipos' => [
                    'label' => 'Anticipos',
                    'apis' => ['anticipos'],
                    'acciones' => ['ver', 'crear', 'editar', 'eliminar', 'devolver'],
                    // Devolver dinero al cliente lo decide quien gestiona: tiene su propio permiso. Primero la de las
                    // devoluciones: el "*" también cubre las barras y "anticipos/*/anular" la tragaría.
                    'patrones' => [
                        'anticipos/devoluciones/*/anular' => 'devolver',
                        'anticipos/*/devolver' => 'devolver',
                        'anticipos/*/anular' => 'eliminar',
                    ],
                ],
            ],
        ],

        'catalogo' => [
            'label' => 'Catálogo',
            'submodulos' => [
                'productos' => ['label' => 'Productos', 'apis' => ['productos', 'presentaciones']],
                // Los precios de cada producto por tipo (Minorista, Mayorista…)
                // y por cantidad. Elegir el tipo de un cliente cuelga de
                // "clientes/tipos-precio", que va con Clientes.
                'lista-precios' => ['label' => 'Lista de precios', 'apis' => ['lista-precios', 'tipos-precio']],
                'categorias' => ['label' => 'Categorías', 'apis' => ['categorias']],
                'colores' => [
                    'label' => 'Colores',
                    'apis' => ['colores'],
                    'acciones' => ['ver', 'crear', 'editar', 'eliminar', 'importar', 'exportar'],
                    // Son POST/GET sobre "colores", igual que crear uno solo
                    // o listarlos: sin esto, importar el Excel exigiría el
                    // mismo permiso que crear un color a mano, y exportar el
                    // mismo que solo verlos.
                    'patrones' => [
                        'colores/importar-excel' => 'importar',
                        'colores/exportar-excel' => 'exportar',
                    ],
                ],
                'tipos-tela' => ['label' => 'Familias y tipos de tela', 'apis' => ['familias-tela', 'tipos-tela']],
                'marcas' => ['label' => 'Marcas', 'apis' => ['marcas', 'sub-marcas']],
                'unidades-medida' => ['label' => 'Unidades de medida', 'apis' => ['unidades-medida']],
            ],
        ],

        'compras' => [
            'label' => 'Compras',
            'submodulos' => [
                'proveedores' => [
                    'label' => 'Proveedores',
                    'apis' => ['proveedores'],
                    'acciones' => ['ver', 'crear', 'editar', 'eliminar', 'importar'],
                    // La plantilla y la carga por Excel son su propia acción.
                    'patrones' => [
                        'proveedores/plantilla-excel' => 'importar',
                        'proveedores/importar-excel' => 'importar',
                    ],
                ],
                'ordenes-compra' => [
                    'label' => 'Órdenes de compra',
                    'apis' => ['ordenes-compra', 'tipos-contenedor', 'puertos'],
                    'pdf' => ['orden-compra'],
                    // Aprobar/enviar/anular es parte de editar la orden, no una acción propia.
                    'patrones' => [
                        'ordenes-compra/*/aprobar' => 'editar',
                        'ordenes-compra/*/enviar' => 'editar',
                        'ordenes-compra/*/anular' => 'editar',
                    ],
                ],
                'compras' => ['label' => 'Compras', 'apis' => ['compras', 'conceptos-gasto'], 'pdf' => ['compra']],
                'recepciones-compra' => [
                    'label' => 'Recepciones de compra',
                    'apis' => ['recepciones-compra'],
                    'pdf' => ['recepcion-compra'],
                    'acciones' => ['ver', 'crear', 'editar', 'eliminar', 'importar'],
                    // Leer el packing list es distinto de registrar la recepción, y
                    // escanear los rollos al llegar lo hace el almacenero sin
                    // poder confirmarla: eso lo hace el encargado ("crear").
                    'patrones' => [
                        'recepciones-compra/leer-packing-list' => 'importar',
                        // Quien carga el packing list baja su plantilla.
                        'recepciones-compra/plantilla-packing-list/*' => 'importar',
                        'recepciones-compra/escanear' => 'editar',
                        'recepciones-compra/quitar-escaneo' => 'editar',
                        'recepciones-compra/escanear-todos' => 'editar',
                    ],
                ],
            ],
        ],

        'inventario' => [
            'label' => 'Inventario',
            'submodulos' => [
                // 'almacen-ubicaciones' es aparte porque "PUT /almacen-ubicaciones/5"
                // no empieza con "almacenes/", que es lo único que matchea el prefijo.
                'almacenes' => ['label' => 'Almacenes', 'apis' => ['almacenes', 'almacen-ubicaciones']],
                'existencias' => ['label' => 'Existencias', 'apis' => ['existencias']],
                'rollos' => [
                    'label' => 'Stock por rollo',
                    'apis' => ['rollos'],
                    'pdf' => ['etiqueta-rollo'],
                    // Resolver un rollo que no se encontró al preparar un pedido: editar, no solo ver.
                    'patrones' => [
                        'rollos/*/revision-aparecio' => 'editar',
                        'rollos/*/revision-perdido' => 'editar',
                    ],
                ],
                'importaciones' => [
                    'label' => 'Importaciones',
                    // No hay alta: los embarques nacen en la recepción de compra.
                    'apis' => ['importaciones'],
                    'acciones' => ['ver', 'editar'],
                ],
                'despacho' => [
                    'label' => 'Preparación y despacho',
                    // El almacenero mueve el pedido por el almacén, pero no lo
                    // crea ni lo cotiza: eso es de Ventas.
                    'patrones' => [
                        // Ver quién puede recibir una tarea es parte de ver la bandeja.
                        'ordenes-venta/almaceneros' => 'ver',
                        'ordenes-venta/*/asignar' => 'asignar',
                        'ordenes-venta/*/escanear' => 'editar',
                        'ordenes-venta/motivos-ajuste' => 'ver',
                        // Agregar un motivo nuevo es escribir: pide editar, no solo ver.
                        'ordenes-venta/motivos-ajuste/nuevo' => 'editar',
                        'ordenes-venta/*/descontar-metraje' => 'editar',
                        'ordenes-venta/*/quitar-rollo' => 'editar',
                        'ordenes-venta/*/rollo-no-encontrado' => 'editar',
                        'ordenes-venta/*/reducir' => 'editar',
                        'ordenes-venta/*/no-encontrado' => 'editar',
                        'ordenes-venta/*/separar' => 'editar',
                        'ordenes-venta/*/despachar' => 'editar',
                        // Atender un requerimiento de traslado es el mismo trabajo del almacenero que despachar un pedido:
                        // escanear, separar y despachar. Pedirlo es crear en Traslados.
                        'transferencias/requerimientos/*/escanear' => 'editar',
                        'transferencias/requerimientos/*/quitar-rollo' => 'editar',
                        'transferencias/requerimientos/*/separar' => 'editar',
                        'transferencias/requerimientos/*/despachar' => 'editar',
                        'transferencias/requerimientos/*/rechazar' => 'editar',
                    ],
                    'acciones' => ['ver', 'editar', 'asignar'],
                ],
                'kardex' => ['label' => 'Kardex', 'apis' => ['movimientos'], 'acciones' => ['ver']],
                'transferencias' => [
                    'label' => 'Traslados',
                    'apis' => ['transferencias', 'motivos-traslado'],
                    'pdf' => ['guia-traslado'],
                    // Bandeja de solicitudes: aprobar (autoriza y descuenta el
                    // origen) y rechazar los decide quien autoriza el traslado,
                    // no necesariamente quien lo crea. Recepcionar es del
                    // almacén destino, no de quien solo puede crear guías.
                    'patrones' => [
                        'transferencias/*/aprobar' => 'aprobar',
                        'transferencias/*/rechazar' => 'aprobar',
                        'transferencias/*/recibir' => 'editar',
                        // Recepcionar escaneando los rollos es recibir: lo hace el almacén destino.
                        'transferencias/*/recepcion/*' => 'editar',
                    ],
                    'acciones' => ['ver', 'crear', 'editar', 'eliminar', 'aprobar'],
                ],
                'ajustes' => ['label' => 'Ajustes', 'apis' => ['ajustes'], 'pdf' => ['ajuste']],
                'tomas-inventario' => ['label' => 'Tomas de inventario', 'apis' => ['tomas-inventario']],
                'prestamos' => ['label' => 'Préstamos', 'apis' => ['prestamos'], 'pdf' => ['prestamo']],
            ],
        ],

        'tesoreria' => [
            'label' => 'Tesorería',
            'submodulos' => [
                'mi-caja' => [
                    'label' => 'Mi caja',
                    'apis' => ['mi-caja'],
                    // Lo que se hace sobre los movimientos de tus turnos: cada acción tiene su permiso (anular es libre por
                    // defecto). Abrir, cerrar y registrar siguen con "crear".
                    'patrones' => [
                        'mi-caja/movimientos/*/anular' => 'anular_movimiento',
                        'mi-caja/movimientos/*/editar' => 'editar_movimiento',
                        'mi-caja/movimientos/*/corregir-pago' => 'corregir_pago',
                        'mi-caja/movimientos/*/convertir-anticipo' => 'convertir_anticipo',
                    ],
                    'acciones' => ['ver', 'crear', 'editar', 'eliminar', 'anular_movimiento', 'editar_movimiento', 'corregir_pago', 'convertir_anticipo'],
                ],
                'metodos-pago' => [
                    'label' => 'Cuentas y medios de pago',
                    'apis' => ['metodos-pago', 'bancos', 'cuentas-bancarias', 'billeteras-digitales', 'tarjetas-bancarias'],
                ],
                'cajas' => ['label' => 'Cajas', 'apis' => ['cajas']],
                'movimientos-caja' => ['label' => 'Movimientos de caja', 'apis' => ['movimientos-caja'], 'pdf' => ['movimiento-caja']],
                'cierres-caja' => [
                    'label' => 'Cierres de caja',
                    'apis' => ['cierres-caja'],
                    'pdf' => ['cierre-caja'],
                    // Al cerrar, el turno queda bloqueado: cada cosa que se pueda hacer sobre un cierre o sobre lo ya
                    // cerrado la hace solo quien tiene su permiso. Anular un movimiento es libre por defecto.
                    'patrones' => [
                        // Los de movimientos van primero: el "*" también cubre las barras y "…/*/anular" los tragaría.
                        'cierres-caja/*/movimientos/*/anular' => 'anular_movimiento',
                        'cierres-caja/*/movimientos/*/editar' => 'modificar_cerrado',
                        'cierres-caja/*/movimientos/*/convertir-anticipo' => 'modificar_cerrado',
                        'cierres-caja/*/movimientos/*/cambiar-metodo' => 'modificar_cerrado',
                        'cierres-caja/*/aprobar' => 'aprobar',
                        'cierres-caja/*/anular' => 'anular_cierre',
                        'cierres-caja/*/recerrar' => 'recerrar',
                    ],
                    'acciones' => ['ver', 'aprobar', 'anular_cierre', 'recerrar', 'anular_movimiento', 'modificar_cerrado'],
                ],
                'motivos-movimiento' => ['label' => 'Motivos de movimiento', 'apis' => ['motivos-movimiento']],
                'cuentas-por-cobrar' => ['label' => 'Cuentas por cobrar', 'apis' => ['cuentas-por-cobrar']],
                // Las letras de cambio se emiten desde una cuenta por cobrar y se consultan aquí, con su PDF.
                'letras-cambio' => [
                    'label' => 'Letras de cambio',
                    'apis' => ['letras-cambio'],
                    'pdf' => ['letra-cambio'],
                    'patrones' => [
                        // Los datos que se proponen al emitir son parte de crear la letra; anular es eliminar.
                        'letras-cambio/prellenar' => 'crear',
                        'letras-cambio/*/anular' => 'eliminar',
                        // Cobrar una letra es editarla: queda pagada y entra a caja.
                        'letras-cambio/*/cobrar' => 'editar',
                        'letras-cambio/*/sub-estado' => 'editar',
                    ],
                ],
                // Las letras que nacieron de renovar otra (serie RV001): su lista y crear una renovación.
                'renovaciones' => [
                    'label' => 'Renovaciones de letras',
                    'apis' => ['renovaciones'],
                    'patrones' => ['letras-cambio/*/renovar' => 'crear'],
                ],
                'estado-cuenta' => [
                    'label' => 'Estado de cuenta',
                    'apis' => ['estado-cuenta'],
                    'pdf' => ['estado-cuenta'],
                    'acciones' => ['ver', 'exportar'],
                    'patrones' => ['estado-cuenta/*/excel' => 'exportar'],
                ],
                'cuentas-por-pagar' => ['label' => 'Cuentas por pagar', 'apis' => ['cuentas-por-pagar']],
            ],
        ],

        'reportes' => [
            'label' => 'Reportes',
            'submodulos' => [
                'ganancias' => ['label' => 'Ganancias', 'apis' => ['reportes/ganancias'], 'acciones' => ['ver', 'exportar']],
                'utilidades' => ['label' => 'Utilidades', 'apis' => ['reportes/utilidades'], 'acciones' => ['ver', 'exportar']],
            ],
        ],

        'gestion' => [
            'label' => 'Gestión',
            'submodulos' => [
                'roles' => ['label' => 'Roles y permisos', 'apis' => ['roles']],
                // Excepciones por persona y bandeja de solicitudes de acceso.
                // Conceder = crear, revocar = eliminar, resolver = editar.
                // Lo que pide cada usuario para sí va en "mi-acceso/", libre.
                'accesos' => [
                    'label' => 'Accesos',
                    'apis' => ['accesos'],
                    'patrones' => [
                        'accesos/solicitudes/*/aprobar' => 'editar',
                        'accesos/solicitudes/*/rechazar' => 'editar',
                    ],
                ],
                'usuarios' => ['label' => 'Usuarios', 'apis' => ['users']],
                'empresa' => ['label' => 'Empresa', 'apis' => ['empresas']],
                'auditoria' => ['label' => 'Auditoría', 'apis' => ['auditorias'], 'acciones' => ['ver']],
            ],
        ],
    ],
];
