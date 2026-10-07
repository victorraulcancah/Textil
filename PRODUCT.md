# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Personal de una empresa textil en Perú que entra al sistema cada día: administración y compras en PC de oficina; ventas, caja y almacén en PC, celular o tablet. Entran muchas veces al día, con prisa, y quieren llegar a su trabajo sin fricción.

## Product Purpose

ERP para la gestión de una empresa de telas: catálogo, compras y recepción, inventario por rollos con etiquetas QR, pedidos y proformas, despacho, caja y tesorería, cuentas por cobrar y por pagar. Éxito: cada persona del equipo opera su área sin errores y con datos al día. El login es la puerta de todo eso.

## Operating Context

Interfaz en español (Perú). Se usa en PC de oficina y en celular/tablet dentro del almacén. Cada usuario tiene su rol y su almacén. Accesos con correo y contraseña, opción de recordar credenciales y recuperación de contraseña.

## Capabilities and Constraints

- Pantalla de login con correo, contraseña (con ver/ocultar), "Recordar credenciales", enlace "¿Olvidaste tu contraseña?" a `/recuperar`, y mensajes de error de credenciales o conexión. Todo eso debe seguir funcionando igual.
- El logo y el nombre comercial pueden venir de la configuración de la empresa (`branding.logo_url`, `branding.nombre_comercial`); el logo de respaldo es TELAS.
- Stack existente: React 19 + Vite + Tailwind v4 (Laravel por detrás).

## Brand Commitments

- Se conserva el logo TELAS y el azul de marca como color principal (decisión del usuario).
- La firma "Desarrollado por Magus Technologies" es obligatoria y debe notarse: logo MGS celeste neón (`public/img/mgs.png`, sobre fondo oscuro propio porque sobre blanco no se ve) y enlace a https://magus-ecommerce.com/. Ya existe como componente `CreditoMagus` (variante "bloque").

## Evidence on Hand

Logo TELAS (`public/img/logo-telas.svg`), logo MGS (`public/img/mgs.png`). No hay fotos de la empresa ni de sus telas: no inventar clientes, cifras ni testimonios.

## Product Principles

- El login es una puerta, no una portada: se resuelve en segundos y sin distracciones.
- La marca del cliente manda; la firma de Magus se nota sin competir con ella.
- Igual de bueno en celular que en PC.
- Cada estado (error, cargando, vacío) dice qué pasó y qué hacer.

## Accessibility & Inclusion

Contraste legible, foco de teclado visible, campos con etiqueta, objetivos táctiles cómodos para uso con una mano en celular.
