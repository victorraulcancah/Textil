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
        'crear' => 'Crear',
        'editar' => 'Editar',
        'eliminar' => 'Eliminar',
        'imprimir' => 'Imprimir',
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
                'clientes' => ['label' => 'Clientes', 'apis' => ['clientes']],
                'pedidos' => [
                    'label' => 'Pedidos',
                    'apis' => ['ordenes-venta'],
                    'pdf' => ['orden-venta', 'requerimiento-almacen'],
                ],
                'notas-venta' => [
                    'label' => 'Notas de venta',
                    'apis' => ['notas-venta'],
                    'pdf' => ['nota-venta'],
                    // Facturar un pedido es crear una venta, no crear un pedido.
                    'patrones' => ['ordenes-venta/*/facturar' => 'crear'],
                ],
            ],
        ],

        'catalogo' => [
            'label' => 'Catálogo',
            'submodulos' => [
                'productos' => ['label' => 'Productos', 'apis' => ['productos', 'presentaciones']],
                'categorias' => ['label' => 'Categorías', 'apis' => ['categorias']],
                'marcas' => ['label' => 'Marcas', 'apis' => ['marcas', 'sub-marcas']],
                'unidades-medida' => ['label' => 'Unidades de medida', 'apis' => ['unidades-medida']],
            ],
        ],

        'compras' => [
            'label' => 'Compras',
            'submodulos' => [
                'proveedores' => ['label' => 'Proveedores', 'apis' => ['proveedores']],
                'ordenes-compra' => ['label' => 'Órdenes de compra', 'apis' => ['ordenes-compra'], 'pdf' => ['orden-compra']],
                'compras' => ['label' => 'Compras', 'apis' => ['compras'], 'pdf' => ['compra']],
                'recepciones-compra' => ['label' => 'Recepciones de compra', 'apis' => ['recepciones-compra'], 'pdf' => ['recepcion-compra']],
            ],
        ],

        'inventario' => [
            'label' => 'Inventario',
            'submodulos' => [
                'almacenes' => ['label' => 'Almacenes', 'apis' => ['almacenes']],
                'existencias' => ['label' => 'Existencias', 'apis' => ['existencias']],
                'rollos' => [
                    'label' => 'Stock por rollo',
                    'apis' => ['rollos'],
                    'pdf' => ['etiqueta-rollo'],
                ],
                'despacho' => [
                    'label' => 'Preparación y despacho',
                    // El almacenero mueve el pedido por el almacén, pero no lo
                    // crea ni lo cotiza: eso es de Ventas.
                    'patrones' => [
                        'ordenes-venta/*/preparar' => 'editar',
                        'ordenes-venta/*/escanear' => 'editar',
                        'ordenes-venta/*/despachar' => 'editar',
                    ],
                    'acciones' => ['ver', 'editar'],
                ],
                'kardex' => ['label' => 'Kardex', 'apis' => ['movimientos'], 'acciones' => ['ver']],
                'transferencias' => ['label' => 'Traslados', 'apis' => ['transferencias', 'motivos-traslado'], 'pdf' => ['guia-traslado']],
                'ajustes' => ['label' => 'Ajustes', 'apis' => ['ajustes'], 'pdf' => ['ajuste']],
                'tomas-inventario' => ['label' => 'Tomas de inventario', 'apis' => ['tomas-inventario']],
                'prestamos' => ['label' => 'Préstamos', 'apis' => ['prestamos'], 'pdf' => ['prestamo']],
            ],
        ],

        'tesoreria' => [
            'label' => 'Tesorería',
            'submodulos' => [
                'mi-caja' => ['label' => 'Mi caja', 'apis' => ['mi-caja']],
                'metodos-pago' => [
                    'label' => 'Cuentas y medios de pago',
                    'apis' => ['metodos-pago', 'bancos', 'cuentas-bancarias', 'billeteras-digitales', 'tarjetas-bancarias'],
                ],
                'cajas' => ['label' => 'Cajas', 'apis' => ['cajas']],
                'movimientos-caja' => ['label' => 'Movimientos de caja', 'apis' => ['movimientos-caja'], 'pdf' => ['movimiento-caja']],
                'cierres-caja' => ['label' => 'Cierres de caja', 'apis' => ['cierres-caja'], 'pdf' => ['cierre-caja']],
                'motivos-movimiento' => ['label' => 'Motivos de movimiento', 'apis' => ['motivos-movimiento']],
                'cuentas-por-cobrar' => ['label' => 'Cuentas por cobrar', 'apis' => ['cuentas-por-cobrar']],
                'cuentas-por-pagar' => ['label' => 'Cuentas por pagar', 'apis' => ['cuentas-por-pagar']],
            ],
        ],

        'reportes' => [
            'label' => 'Reportes',
            'submodulos' => [
                'ganancias' => ['label' => 'Ganancias', 'apis' => ['reportes/ganancias'], 'acciones' => ['ver']],
                'utilidades' => ['label' => 'Utilidades', 'apis' => ['reportes/utilidades'], 'acciones' => ['ver']],
            ],
        ],

        'gestion' => [
            'label' => 'Gestión',
            'submodulos' => [
                'roles' => ['label' => 'Roles y permisos', 'apis' => ['roles']],
                'usuarios' => ['label' => 'Usuarios', 'apis' => ['users']],
                'empresa' => ['label' => 'Empresa', 'apis' => ['empresas']],
                'auditoria' => ['label' => 'Auditoría', 'apis' => ['auditorias'], 'acciones' => ['ver']],
            ],
        ],
    ],
];
