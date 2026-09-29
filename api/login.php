<?php

declare(strict_types=1);

define('ASC_ENTRADA', true);
require __DIR__ . '/_lib/bootstrap.php';

asc_metodo('POST');

$cfg = asc_cargar_config();
asc_verificar_origen($cfg);
asc_sesion($cfg);

$in      = asc_cuerpo();
$usuario = strtolower(asc_texto($in['usuario'] ?? '', 60));
$clave   = is_string($in['clave'] ?? null) ? $in['clave'] : '';


const ASC_MAX_INTENTOS = 8;
const ASC_VENTANA      = 900;  

function asc_archivo_intentos(): string
{
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'sin-ip';
    return sys_get_temp_dir() . '/asc_login_' . sha1($ip) . '.txt';
}

function asc_intentos(): array
{
    $f = asc_archivo_intentos();
    if (!is_file($f)) return ['n' => 0, 'desde' => time()];

    $d = @json_decode((string) @file_get_contents($f), true);
    if (!is_array($d) || !isset($d['n'], $d['desde'])) return ['n' => 0, 'desde' => time()];
    if (time() - (int) $d['desde'] > ASC_VENTANA)       return ['n' => 0, 'desde' => time()];

    return ['n' => (int) $d['n'], 'desde' => (int) $d['desde']];
}

function asc_sumar_intento(array $i): void
{
    @file_put_contents(asc_archivo_intentos(),
        json_encode(['n' => $i['n'] + 1, 'desde' => $i['desde']]), LOCK_EX);
}

function asc_limpiar_intentos(): void
{
    @unlink(asc_archivo_intentos());
}

$intentos = asc_intentos();
if ($intentos['n'] >= ASC_MAX_INTENTOS) {
    $faltan = (int) ceil((ASC_VENTANA - (time() - $intentos['desde'])) / 60);
    asc_error(429, 'Demasiados intentos. Espere ' . max(1, $faltan) . ' minutos e intente de nuevo.');
}

/* --- Verificación ------------------------------------------------------- */

$cuentas = $cfg['usuarios_reportes'] ?? [];
$hash    = null;

foreach ($cuentas as $nombre => $h) {
    if (hash_equals(strtolower((string) $nombre), $usuario)) {
        $hash = (string) $h;
        break;
    }
}

// Si el usuario no existe se verifica igual contra un hash de mentira, para
// que responder «usuario incorrecto» y «clave incorrecta» tarde lo mismo.
$ok = $hash !== null
    ? password_verify($clave, $hash)
    : (password_verify($clave, '$2y$10$' . str_repeat('x', 53)) && false);

if (!$ok) {
    asc_sumar_intento($intentos);
    asc_error(401, 'Usuario o clave incorrectos.');
}

asc_limpiar_intentos();

// Identificador nuevo: evita que una sesión abierta antes del ingreso sirva
// después de él.
session_regenerate_id(true);
$_SESSION['asc_usuario_reportes'] = $usuario;
$_SESSION['asc_visto']            = time();

asc_ok(['usuario' => $usuario]);
