<?php

/* ============================================================================
 *  GET api/exportar-transporte.php?desde=&hasta=[&documento=]
 *
 *  Igual que listar-transporte, pero con la firma del mes en base64: el PDF
 *  se dibuja en el navegador (js/script/pdf-transporte.js).
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
    $r = asc_viajes(asc_pdo($cfg), $f, $max, true);
} catch (PDOException $e) {
    error_log('[transporte] exportar: ' . $e->getMessage());
    asc_error(500, 'No se pudieron leer los viajes. Revise que la base tenga ' .
                   'las tablas de los archivos SQL 05 y 06.');
}

/* La firma es binaria: en JSON tiene que ir en base64. */
$registros = [];
foreach ($r['filas'] as $fila) {
    $fila['firma'] = !empty($fila['firma']) ? base64_encode((string) $fila['firma']) : null;
    $registros[]   = $fila;
}

asc_ok([
    'filtros'   => $f,
    'totales'   => asc_totales_transporte($r['filas']),
    'recortado' => $r['recortado'],
    'maximo'    => $max,
    'registros' => $registros,
]);
