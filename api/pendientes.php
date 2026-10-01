<?php

/* ============================================================================
 *  GET api/pendientes.php?modulo=ALIMENTACION&formato=&desde=&hasta=[&documento=]
 *
 *  Quiénes tienen registros sin firmar en el rango, agrupados por persona y
 *  mes. Es lo que la página de reportes muestra antes de dejar descargar.
 * ========================================================================== */

declare(strict_types=1);

define('ASC_ENTRADA', true);
require __DIR__ . '/_lib/bootstrap.php';
require __DIR__ . '/_lib/consulta.php';
require __DIR__ . '/_lib/firmas.php';

asc_metodo('GET');

$cfg = asc_cargar_config();
asc_sesion($cfg);
asc_exigir_sesion();

$mod = asc_modulo((string) ($_GET['modulo'] ?? 'ALIMENTACION'));

/* El filtro de formato solo aplica a alimentación; transporte no lo manda. */
$desde = asc_fecha($_GET['desde'] ?? '');
$hasta = asc_fecha($_GET['hasta'] ?? '');
if ($desde === null || $hasta === null) asc_error(400, 'Indique el rango de fechas.');
if ($desde > $hasta) [$desde, $hasta] = [$hasta, $desde];

$f = [
    'desde'     => $desde,
    'hasta'     => $hasta,
    'documento' => asc_documento($_GET['documento'] ?? ''),
    'formato'   => strtolower(trim((string) ($_GET['formato'] ?? ''))),
];

try {
    $pendientes = asc_pendientes(asc_pdo($cfg), $mod, $f);
} catch (PDOException $e) {
    error_log('[firmas] pendientes: ' . $e->getMessage());
    asc_error(500, 'No se pudieron leer los pendientes. Revise que la base tenga ' .
                   'las tablas de los archivos SQL 05 y 06.');
}

asc_ok([
    'modulo'     => $mod['id'],
    'filtros'    => $f,
    'pendientes' => $pendientes,
]);
