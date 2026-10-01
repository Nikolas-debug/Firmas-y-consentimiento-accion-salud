<?php

/* ============================================================================
 *  GET api/listar-transporte.php?desde=&hasta=[&documento=]
 *
 *  Vista previa de lo que va a salir en la constancia de transporte.
 * ========================================================================== */

declare(strict_types=1);

define('ASC_ENTRADA', true);
require __DIR__ . '/_lib/bootstrap.php';
require __DIR__ . '/_lib/transporte.php';

asc_metodo('GET');

$cfg = asc_cargar_config();
asc_sesion($cfg);
asc_exigir_sesion();

$f   = asc_filtros_transporte();
$max = (int) ($cfg['max_registros_export'] ?? 5000);

try {
    $r = asc_viajes(asc_pdo($cfg), $f, $max);
} catch (PDOException $e) {
    error_log('[transporte] listar: ' . $e->getMessage());
    asc_error(500, 'No se pudieron leer los viajes. Revise que la base tenga ' .
                   'las tablas de los archivos SQL 05 y 06.');
}

asc_ok([
    'filtros'   => $f,
    'totales'   => asc_totales_transporte($r['filas']),
    'recortado' => $r['recortado'],
    'maximo'    => $max,
    'registros' => $r['filas'],
]);
