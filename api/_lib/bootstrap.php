<?php

declare(strict_types=1);

if (!defined('ASC_ENTRADA')) {
    // Alguien pidió este archivo directamente por la URL.
    header('HTTP/1.1 403 Forbidden');
    exit('Acceso directo no permitido.');
}

mb_internal_encoding('UTF-8');

function asc_servidor_de_pruebas(): bool
{
    return PHP_SAPI === 'cli-server';
}

function asc_cargar_config(): array
{
    $raiz_publica = isset($_SERVER['DOCUMENT_ROOT']) && $_SERVER['DOCUMENT_ROOT'] !== ''
        ? realpath($_SERVER['DOCUMENT_ROOT'])
        : null;

    if (asc_servidor_de_pruebas()) $raiz_publica = null;

    $candidatos = [];

    // Ruta fija por variable de entorno, si se quiere forzar.
    $env = getenv('ASC_CONFIG_ALIMENTACION');
    if (is_string($env) && $env !== '') $candidatos[] = $env;

    $dir = __DIR__;
    for ($i = 0; $i < 7; $i++) {
        $candidatos[] = $dir . '/privado_accion/config-alimentacion.php';
        $padre = dirname($dir);
        if ($padre === $dir) break;
        $dir = $padre;
    }

    foreach ($candidatos as $ruta) {
        if (!is_file($ruta) || !is_readable($ruta)) continue;

        $real = realpath($ruta);
        if ($raiz_publica && $real && strpos($real, $raiz_publica . DIRECTORY_SEPARATOR) === 0) {
            // Está dentro de public_html: cualquiera podría descargarlo.
            asc_error(500,
                'El archivo de credenciales quedó dentro del directorio público. ' .
                'Muévalo a la carpeta privado_accion, fuera de public_html.');
        }

        $cfg = require $real;
        if (!is_array($cfg) || !isset($cfg['db'])) {
            asc_error(500, 'El archivo de credenciales no devolvió la configuración esperada.');
        }
        $cfg['__ruta'] = $real;
        return $cfg;
    }

    asc_error(500,
        'No se encontró privado_accion/config-alimentacion.php. ' .
        'Revise que esté subido al mismo nivel que public_html.');
}

/* --- 2. Respuestas ------------------------------------------------------- */

function asc_json($datos, int $codigo = 200): void
{
    if (!headers_sent()) {
        http_response_code($codigo);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        header('X-Content-Type-Options: nosniff');
    }
    echo json_encode($datos, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function asc_ok(array $datos = []): void
{
    asc_json(['ok' => true] + $datos, 200);
}

/** Mensaje para el usuario. Nunca incluye detalles internos de la base. */
function asc_error(int $codigo, string $mensaje, array $extra = []): void
{
    asc_json(['ok' => false, 'error' => $mensaje] + $extra, $codigo);
}

/* --- 3. Conexión -------------------------------------------------------- */

function asc_pdo(array $cfg): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) return $pdo;

    $d = $cfg['db'];

    // Gancho solo para las pruebas automáticas; en el servidor no existe.
    if (isset($d['dsn_prueba'])) {
        $pdo = new PDO($d['dsn_prueba'], null, null, [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
        return $pdo;
    }

    $dsn = sprintf(
        'mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
        $d['host'], (int) ($d['puerto'] ?? 3306), $d['nombre']
    );

    try {
        $pdo = new PDO($dsn, $d['usuario'], $d['clave'], [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]);
    } catch (PDOException $e) {
        // El detalle va al log del servidor, no a la pantalla: el mensaje de
        // PDO incluye usuario y nombre de la base.
        error_log('[alimentacion] conexión: ' . $e->getMessage());
        asc_error(503, 'No se pudo conectar con la base de datos. Intente de nuevo en un momento.');
    }

    return $pdo;
}

/**
 * ¿La tabla tiene esa columna? Sirve para que una columna nueva no vuelva
 * obligatorio correr el SQL el mismo día: si todavía no está, se guarda lo
 * demás y nada revienta. El SELECT ... LIMIT 0 no trae filas y funciona
 * igual en MySQL y en SQLite.
 */
function asc_hay_columna(PDO $pdo, string $tabla, string $columna): bool
{
    static $visto = [];
    $clave = $tabla . '.' . $columna;
    if (isset($visto[$clave])) return $visto[$clave];

    // Los nombres son literales del código, nunca entrada del usuario.
    try {
        $pdo->query("SELECT `$columna` FROM `$tabla` LIMIT 0");
        $visto[$clave] = true;
    } catch (PDOException $e) {
        $visto[$clave] = false;
    }
    return $visto[$clave];
}

/* --- 4. Sesión ---------------------------------------------------------- */

function asc_sesion(array $cfg): void
{
    if (session_status() === PHP_SESSION_ACTIVE) return;

    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
          || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');

    session_name('ASCALIM');
    session_set_cookie_params([
        'lifetime' => 0,
        'path'     => '/',
        'secure'   => $https,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_start();

    // Caducidad por inactividad.
    $minutos = (int) ($cfg['sesion_minutos'] ?? 60);
    if (isset($_SESSION['asc_visto']) && (time() - $_SESSION['asc_visto']) > $minutos * 60) {
        $_SESSION = [];
        session_destroy();
        session_start();
    }
    $_SESSION['asc_visto'] = time();
}

function asc_hay_sesion(): bool
{
    return !empty($_SESSION['asc_usuario_reportes']);
}

/** Corta el endpoint si no hay sesión de reportes abierta. */
function asc_exigir_sesion(): void
{
    if (!asc_hay_sesion()) {
        asc_error(401, 'Su sesión se cerró. Vuelva a ingresar.');
    }
}

/* --- 5. Entrada --------------------------------------------------------- */

function asc_metodo(string $esperado): void
{
    if (strtoupper($_SERVER['REQUEST_METHOD'] ?? '') !== $esperado) {
        asc_error(405, 'Método no permitido.');
    }
}

/**
 * Cuerpo JSON de un POST. El tope subió de 64 KiB a 320 KiB cuando el
 * registro de alimentación empezó a mandar la firma en PNG: una firma
 * normal en base64 pesa 10-30 KiB, pero una firma grande y elaborada sobre
 * el panel completo puede llegar a 60-80 KiB en base64, y 320 KiB deja
 * margen de sobra sin abrir la puerta a cuerpos enormes.
 */
function asc_cuerpo(): array
{
    $crudo = file_get_contents('php://input');
    if ($crudo === false || $crudo === '') return [];
    if (strlen($crudo) > 320 * 1024) asc_error(413, 'La petición es demasiado grande.');

    $datos = json_decode($crudo, true);
    if (!is_array($datos)) asc_error(400, 'La petición no traía datos válidos.');
    return $datos;
}

/**
 * Verifica que la petición venga de una de nuestras páginas.
 * No es una barrera fuerte —el navegador la pone, no el servidor— pero evita
 * que otro sitio dispare registros desde el navegador de un visitante.
 */
function asc_verificar_origen(array $cfg): void
{
    $permitidos = $cfg['origenes_permitidos'] ?? [];
    if (!$permitidos) return;

    $origen = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($origen === '' && !empty($_SERVER['HTTP_REFERER'])) {
        $p = parse_url($_SERVER['HTTP_REFERER']);
        if (!empty($p['scheme']) && !empty($p['host'])) {
            $origen = $p['scheme'] . '://' . $p['host'] .
                      (isset($p['port']) ? ':' . $p['port'] : '');
        }
    }
    if ($origen === '') return; // navegadores que no lo mandan

    foreach ($permitidos as $ok) {
        if (strcasecmp(rtrim($ok, '/'), rtrim($origen, '/')) === 0) return;
    }

    // Con php -S se acepta cualquier localhost, con el puerto que sea, sin
    // listarlo. En el hosting el SAPI no es cli-server y esto no corre.
    if (asc_servidor_de_pruebas() && asc_origen_local($origen)) return;

    asc_error(403, 'Petición rechazada: origen no autorizado.');
}

/** ¿El origen apunta a la propia máquina? */
function asc_origen_local(string $origen): bool
{
    $host = strtolower((string) (parse_url($origen, PHP_URL_HOST) ?? ''));
    return in_array($host, ['localhost', '127.0.0.1', '::1', '[::1]'], true);
}

/* --- 6. Limpieza de datos ---------------------------------------------- */

function asc_texto($v, int $max): string
{
    $s = is_scalar($v) ? (string) $v : '';
    $s = str_replace(["\r", "\n", "\t"], ' ', $s);
    $s = preg_replace('/\s+/u', ' ', $s);
    $s = trim($s ?? '');
    return mb_substr($s, 0, $max);
}

/** Documento: solo lo que la columna char(10) aguanta. */
function asc_documento($v): string
{
    $s = preg_replace('/[^0-9A-Za-z]/', '', is_scalar($v) ? (string) $v : '');
    return strtoupper(substr($s ?? '', 0, 10));
}

function asc_fecha($v): ?string
{
    $s = is_scalar($v) ? trim((string) $v) : '';
    if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $s, $m)) return null;
    if (!checkdate((int) $m[2], (int) $m[3], (int) $m[1])) return null;
    return $s;
}

/** Cantidad de raciones. Devuelve null cuando la comida no se entregó. */
function asc_racion($v): ?int
{
    if ($v === null || $v === '' || $v === false) return null;
    if (!is_numeric($v)) return null;
    $n = (int) $v;
    if ($n <= 0) return null;
    if ($n > 9999) $n = 9999;   // la columna es int(4) UNSIGNED
    return $n;
}

function asc_imagen($v, int $maxBytes = 1048576): ?string
{
    if (!is_string($v) || trim($v) === '') return null;

    $b64   = preg_replace('#^data:image/[a-z0-9.+-]+;base64,#i', '', trim($v));
    $datos = base64_decode((string) $b64, true);
    if ($datos === false || $datos === '') return null;
    if (strlen($datos) > $maxBytes) return null;

    // Sin esto, cualquier cosa disfrazada de imagen entraría al BLOB.
    return asc_tipo_imagen($datos) === null ? null : $datos;
}

/** 'PNG', 'JPEG' o null, mirando los primeros bytes del archivo. */
function asc_tipo_imagen(string $datos): ?string
{
    if (substr($datos, 0, 8) === "\x89PNG\r\n\x1a\n") return 'PNG';
    if (substr($datos, 0, 3) === "\xFF\xD8\xFF")      return 'JPEG';
    return null;
}

/**
 * Ancho y alto en píxeles de un PNG, leyendo el bloque IHDR (los primeros
 * bytes del archivo, justo después de la firma). No hace falta decodificar
 * la imagen para esto.
 */
function asc_png_dimensiones(string $datos): ?array
{
    if (strlen($datos) < 24 || substr($datos, 12, 4) !== 'IHDR') return null;

    $ancho = unpack('N', substr($datos, 16, 4))[1] ?? 0;
    $alto  = unpack('N', substr($datos, 20, 4))[1] ?? 0;

    return ($ancho > 0 && $alto > 0) ? [$ancho, $alto] : null;
}
