# Despliegue

Servidor de pruebas: `173.249.36.119`, carpeta `/var/www/html/Textil`,
se sirve en el puerto **8090** sin dominio.

Este servidor tiene sus rarezas y ninguna es opcional: si te saltas alguna,
falla. Léelas antes de tocar nada.

## Las cuatro rarezas del servidor

**1. `php` es 8.2, el proyecto necesita 8.3.** Usa siempre `php83`. El `php`
a secas te dará errores de sintaxis o de versión en composer.

**2. Composer no está en el PATH del proyecto.** Hay que darle la ruta:

```bash
php83 /usr/local/bin/composer install --no-dev --optimize-autoloader
```

**3. `--no-dev` no es un lujo.** Sin él, composer intenta instalar phpunit y
`laravel/pail`, que exigen PHP ≥ 8.3 con requisitos más estrictos y revientan
la instalación entera.

**4. No hay Vite en el servidor.** `npm run build` falla con
`vite: command not found` porque no está `node_modules`, y el Node instalado
es anterior al 20 que pide Vite 8. **El frontend se compila en local.**

## Lo que no viaja con el repositorio

Está todo en `.gitignore`, así que en un servidor recién clonado no existe:

| Falta | Cómo aparece |
|---|---|
| `vendor/` | `composer install` |
| `.env` | copiar de `.env.example` y editar |
| `public/build/` | compilar en local y subir |
| `public/storage` | `artisan storage:link` |

Si ves *"Failed to open stream: vendor/autoload.php"*, es siempre lo mismo:
todavía no corriste composer.

---

## Primera instalación

### 1. Extensión sodium

El login es JWT y `lcobucci/jwt` exige `ext-sodium`. Sin ella composer se
niega a instalar.

```bash
dnf install -y php83-php-sodium && systemctl restart php83-php-fpm
```

No uses `--ignore-platform-req=ext-sodium`: la instalación pasaría, pero el
login fallaría en producción.

### 2. Dependencias

```bash
cd /var/www/html/Textil && php83 /usr/local/bin/composer install --no-dev --optimize-autoloader
```

### 3. Configuración

```bash
cp .env.example .env && php83 artisan key:generate && php83 artisan jwt:secret
```

En `.env`:

```
APP_ENV=production
APP_DEBUG=false
APP_URL=http://173.249.36.119:8090

DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=Textil
DB_USERNAME=root
DB_PASSWORD='c4p1cu4$$'
```

Las **comillas simples** en la contraseña importan: sin ellas dotenv se come
el `$$`.

Comprueba antes de seguir:

```bash
php83 artisan db:show
```

### 4. Permisos y enlaces

```bash
chown -R apache:apache storage bootstrap/cache && chmod -R 775 storage bootstrap/cache && php83 artisan storage:link
```

### 5. Base de datos

```bash
php83 artisan migrate --force && php83 artisan db:seed --class=PermisosSeeder --force
```

### 6. El vhost

Este comando lo escribe detectando solo el socket de PHP-FPM:

```bash
L=$(grep -h '^listen *=' /etc/opt/remi/php83/php-fpm.d/*.conf | head -1 | sed 's/.*=[[:space:]]*//') && H=$([ "${L:0:1}" = "/" ] && echo "proxy:unix:${L}|fcgi://localhost" || echo "proxy:fcgi://${L}") && printf '%s\n' "Listen 8090" "<VirtualHost *:8090>" "    DocumentRoot /var/www/html/Textil/public" "    <Directory /var/www/html/Textil/public>" "        AllowOverride All" "        Require all granted" "    </Directory>" "    <FilesMatch \\.php\$>" "        SetHandler \"$H\"" "    </FilesMatch>" "    ErrorLog /var/log/httpd/textil-error.log" "</VirtualHost>" > /etc/httpd/conf.d/textil.conf
```

Sin el bloque `FilesMatch`, Apache sirve el `index.php` como archivo y el
navegador te lo descarga en vez de ejecutarlo.

```bash
firewall-cmd --add-port=8090/tcp --permanent && firewall-cmd --reload && apachectl configtest && systemctl restart httpd
```

**`Listen` en un puerto nuevo exige `restart`, no `reload`.** Recargar no abre
puertos, y te vas a pasar un rato viendo `ERR_CONNECTION_REFUSED` sin
entender por qué.

### 7. Comprobar

```bash
ss -tlnp | grep 8090 && curl -sI http://127.0.0.1:8090 | head -3
```

Debe decir `HTTP/1.1 200` y `Content-Type: text/html`.

---

## Subir cambios

### En tu PC

```bash
npm run build
```

Sube por SFTP la carpeta `public/build/` completa a
`/var/www/html/Textil/public/build/`. **Bórrala antes en el servidor**: Vite
pone un hash en cada archivo y si mezclas compilaciones el `manifest.json`
apunta a archivos que ya no existen y la pantalla sale en blanco.

### En el servidor

```bash
cd /var/www/html/Textil && git pull && php83 /usr/local/bin/composer install --no-dev -o && php83 artisan migrate --force && php83 artisan optimize:clear && php83 artisan optimize
```

`optimize:clear` antes de `optimize` no es redundante: sin limpiar primero,
la caché vieja de configuración y rutas sigue viva y los cambios no aparecen.

### Cuando cambian los permisos

Si el despliegue agrega módulos o acciones nuevas en `config/permisos.php`,
hay que crearlos en la base o los roles se quedan sin acceso:

```bash
php83 artisan db:seed --class=PermisosSeeder --force
```

Ojo: ese seeder **le da todos los permisos a todos los roles**. Si en
producción hay roles limitados a mano, revisa antes cuáles son, porque los
va a dejar con acceso completo.

---

## Si algo falla

| Síntoma | Causa |
|---|---|
| `vendor/autoload.php not found` | Falta `composer install` |
| `ext-sodium is missing` | Falta `php83-php-sodium` |
| `Please run composer update` | Corriste sin `--no-dev`, o usaste `php` en vez de `php83` |
| `vite: command not found` | Estás compilando en el servidor; hazlo en local |
| `ERR_CONNECTION_REFUSED` | Hiciste `reload` en vez de `restart`, o no existe `textil.conf` |
| El navegador descarga `index.php` | Al vhost le falta el bloque `FilesMatch` |
| Pantalla en blanco, sin estilos | Falta `public/build` o está mezclado con una compilación vieja |
| Los cambios no se ven | Falta `php83 artisan optimize:clear` |
| 500 sin explicación | `tail -50 storage/logs/laravel.log` y `tail -50 /var/log/httpd/textil-error.log` |

## Lo que este proyecto NO necesita

Por si vienes de `bautista`, que está en el mismo servidor: aquí **no hay**
worker de colas, ni servicio de WhatsApp, ni websockets. No hay ningún daemon
que reiniciar después de desplegar. Es solo web.
