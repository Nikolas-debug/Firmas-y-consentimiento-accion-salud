<?php
/* ============================================================================
 *  GET api/listar.php?formato=general|confort&desde=&hasta=[&documento=]
 *
 *  Vista previa de lo que va a salir en el PDF. Mismo filtro, misma
 *  consulta: si aquí se ven 40 registros, el PDF trae 40.
 * ========================================================================== */

declare(strict_types=1);

define('ASC_ENTRADA', true);
require __DIR__ . '/_lib/bootstrap.php';
require __DIR__ . '/_lib/consulta.php';

asc_metodo('GET');

$cfg = asc_cargar_config();
asc_sesion($cfg);
asc_exigir_sesion();

$f   = asc_filtros();
$max = (int) ($cfg['max_registros_export'] ?? 5000);

try {
    $r = asc_entregas(asc_pdo($cfg), $f, $max);
} catch (PDOException $e) {
    // Sin esto, una columna que falte llega al navegador como «No se pudo
    // completar la consulta», sin decir de qué se queja.
    error_log('[alimentacion] listar: ' . $e->getMessage());
    asc_error(500, 'No se pudieron leer los registros. Revise que la base tenga ' .
                   'las columnas de los archivos SQL 02 y 03.');
}

asc_ok([
    'filtros'   => $f,
    'totales'   => asc_totales($r['filas']),
    'recortado' => $r['recortado'],
    'maximo'    => $max,
    'registros' => $r['filas'],
]);
