<?php

/* ============================================================================
 *  GET api/exportar.php?formato=general|confort&desde=&hasta=[&documento=]
 *
 *  Devuelve los registros en JSON. Ya NO arma el archivo: el PDF se dibuja
 *  en el navegador con pdf-writer.js, el mismo escritor de los
 *  consentimientos (ver js/script/pdf-alimentacion.js).
 *
 *  Las firmas viajan en base64. Son lo que más pesa de la respuesta, así que
 *  solo se piden aquí —la vista previa de `listar.php` no las trae.
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
    $r = asc_entregas(asc_pdo($cfg), $f, $max, true);
} catch (PDOException $e) {
    // Sin esto, una columna que falte se vuelve un error de PHP sin capturar
    // y el navegador solo recibe «respuesta inesperada», sin pista de nada.
    error_log('[alimentacion] exportar: ' . $e->getMessage());
    asc_error(500, 'No se pudieron leer los registros. Revise que la base tenga ' .
                   'las columnas de los archivos SQL 02 y 03.');
}

/* Las firmas son binarias: en JSON tienen que ir en base64. */
$registros = [];
foreach ($r['filas'] as $fila) {
    foreach (['firma', 'firma_acompanante'] as $col) {
        $fila[$col] = !empty($fila[$col]) ? base64_encode((string) $fila[$col]) : null;
    }
    $registros[] = $fila;
}

asc_ok([
    'filtros'   => $f,
    'totales'   => asc_totales($r['filas']),
    'recortado' => $r['recortado'],
    'maximo'    => $max,
    'registros' => $registros,
]);
