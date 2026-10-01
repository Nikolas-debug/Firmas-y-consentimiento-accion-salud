<?php

/* ============================================================================
 *  transporte.php — las consultas del control de transporte urbano.
 *
 *  El formato (CONS-RVAS-005) es una hoja por persona y mes, con un renglón
 *  por viaje: N° | FECHA | TRANSPORTE | FIRMA | CANTIDAD, y las
 *  observaciones al pie.
 *
 *  La firma es del mes, igual que en alimentación: vive en
 *  `firmas_periodo` y cada viaje la apunta. Ver api/_lib/firmas.php.
 * ========================================================================== */

declare(strict_types=1);

/**
 * Lee y valida los filtros de $_GET. Transporte no tiene «formato»: es uno
 * solo.
 *
 * @return array{desde:string,hasta:string,documento:string}
 */
function asc_filtros_transporte(): array
{
    $desde = asc_fecha($_GET['desde'] ?? '');
    $hasta = asc_fecha($_GET['hasta'] ?? '');
    if ($desde === null || $hasta === null) {
        asc_error(400, 'Indique el rango de fechas.');
    }
    if ($desde > $hasta) [$desde, $hasta] = [$hasta, $desde];

    if ((strtotime($hasta) - strtotime($desde)) > 731 * 86400) {
        asc_error(400, 'El rango no puede pasar de dos años. Exporte por períodos más cortos.');
    }

    return [
        'desde'     => $desde,
        'hasta'     => $hasta,
        'documento' => asc_documento($_GET['documento'] ?? ''),
    ];
}

/**
 * Los viajes del rango, ordenados como los arma el PDF: por persona y,
 * dentro de cada persona, por fecha.
 *
 * $conFirma trae además la imagen (BLOB). La vista previa no la necesita.
 */
function asc_viajes(PDO $pdo, array $f, int $max, bool $conFirma = false): array
{
    $where  = ['c.fecha BETWEEN :desde AND :hasta'];
    $params = ['desde' => $f['desde'], 'hasta' => $f['hasta']];

    if ($f['documento'] !== '') {
        $where[]       = 'u.n_doc = :doc';
        $params['doc'] = $f['documento'];
    }

    $firma = $conFirma ? ', fp.firma AS firma' : '';

    $sql = 'SELECT c.id_control, c.fecha, c.tipo_transporte, c.cantidad,
                   c.observaciones, c.estado' . $firma . ',
                   u.id_usuario, u.nombre_usuario, u.tipo_documento, u.n_doc,
                   u.tipo_paciente, u.direccion, u.telefono, u.eps
              FROM control_transporte c
              JOIN usuarios u            ON u.id_usuario = c.id_usuario
         LEFT JOIN firmas_periodo fp     ON fp.id_firma  = c.id_firma
             WHERE ' . implode(' AND ', $where) . '
             ORDER BY u.nombre_usuario ASC, u.id_usuario ASC,
                      c.fecha ASC, c.id_control ASC
             LIMIT ' . (int) ($max + 1);

    $q = $pdo->prepare($sql);
    $q->execute($params);
    $filas = $q->fetchAll();

    $recortado = count($filas) > $max;
    if ($recortado) $filas = array_slice($filas, 0, $max);

    return ['filas' => $filas, 'recortado' => $recortado];
}

/** Totales para mostrar junto a la vista previa. */
function asc_totales_transporte(array $filas): array
{
    $t = ['registros' => count($filas), 'personas' => 0,
          'viajes' => 0, 'pendientes' => 0];

    $personas = [];
    foreach ($filas as $r) {
        $personas[(string) $r['id_usuario']] = true;
        $t['viajes'] += (int) $r['cantidad'];
        if (($r['estado'] ?? '') !== 'FIRMADO') $t['pendientes']++;
    }
    $t['personas'] = count($personas);

    return $t;
}
