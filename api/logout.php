<?php
/* POST api/logout.php — cierra la sesión de reportes. */

declare(strict_types=1);

define('ASC_ENTRADA', true);
require __DIR__ . '/_lib/bootstrap.php';

asc_metodo('POST');

$cfg = asc_cargar_config();
asc_sesion($cfg);

$_SESSION = [];
if (ini_get('session.use_cookies')) {
    $p = session_get_cookie_params();
    setcookie(session_name(), '', time() - 42000,
              $p['path'], $p['domain'], $p['secure'], $p['httponly']);
}
session_destroy();

asc_ok();
