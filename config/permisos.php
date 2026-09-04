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
 */
return [

    // Acciones disponibles en cada submódulo.
    'acciones' => [
        'ver' => 'Ver',
        'crear' => 'Crear',
        'editar' => 'Editar',
        'eliminar' => 'Eliminar',
    ],

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
                'notas-venta' => ['label' => 'Notas de venta', 'apis' => ['notas-venta']],
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
                'ordenes-compra' => ['label' => 'Órdenes de compra', 'apis' => ['ordenes-compra']],
                'compras' => ['label' => 'Compras', 'apis' => ['compras']],
                'recepciones-compra' => ['label' => 'Recepciones de compra', 'apis' => ['recepciones-compra']],
            ],
        ],

        'inventario' => [
            'label' => 'Inventario',
            'submodulos' => [
                'almacenes' => ['label' => 'Almacenes', 'apis' => ['almacenes']],
                'existencias' => ['label' => 'Existencias', 'apis' => ['existencias']],
                'kardex' => ['label' => 'Kardex', 'apis' => ['movimientos'], 'acciones' => ['ver']],
                'transferencias' => ['label' => 'Traslados', 'apis' => ['transferencias', 'motivos-traslado']],
                'ajustes' => ['label' => 'Ajustes', 'apis' => ['ajustes']],
                'tomas-inventario' => ['label' => 'Tomas de inventario', 'apis' => ['tomas-inventario']],
                'prestamos' => ['label' => 'Préstamos', 'apis' => ['prestamos']],
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
                'movimientos-caja' => ['label' => 'Movimientos de caja', 'apis' => ['movimientos-caja']],
                'cierres-caja' => ['label' => 'Cierres de caja', 'apis' => ['cierres-caja']],
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
