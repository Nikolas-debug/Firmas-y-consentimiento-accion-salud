<?php

declare(strict_types=1);

define('ASC_ENTRADA', true);
require __DIR__ . '/_lib/bootstrap.php';

asc_metodo('GET');

$cfg = asc_cargar_config();
asc_sesion($cfg);

asc_ok([
    'abierta' => asc_hay_sesion(),
    'usuario' => $_SESSION['asc_usuario_reportes'] ?? null,
]);
