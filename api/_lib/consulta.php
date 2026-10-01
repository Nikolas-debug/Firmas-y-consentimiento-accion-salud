<?php

declare(strict_types=1);

const ASC_FORMATOS = ['general', 'confort'];

/**
 * Lee y valida los filtros de $_GET.
 *
 * @return array{formato:string,desde:string,hasta:string,documento:string}
 */
function asc_filtros(): array
{
    $formato = strtolower(trim((string) ($_GET['formato'] ?? '')));
    if (!in_array($formato, ASC_FORMATOS, true)) {
        asc_error(400, 'Elija el formato: general o confort.');
    }

    $desde = asc_fecha($_GET['desde'] ?? '');
    $hasta = asc_fecha($_GET['hasta'] ?? '');
    if ($desde === null || $hasta === null) {
        asc_error(400, 'Indique el rango de fechas.');
    }
    if ($desde > $hasta) {
        [$desde, $hasta] = [$hasta, $desde];
    }

    // Un rango de más de dos años casi siempre es un dedazo en el año.
    if ((strtotime($hasta) - strtotime($desde)) > 731 * 86400) {
        asc_error(400, 'El rango no puede pasar de dos años. Exporte por períodos más cortos.');
    }

    return [
        'formato'   => $formato,
        'desde'     => $desde,
        'hasta'     => $hasta,
        'documento' => asc_documento($_GET['documento'] ?? ''),
    ];
}

/**
 * Trae las entregas del rango, ya ordenadas como las necesitan los dos
 * formatos: agrupadas por persona y, dentro de cada persona, por fecha.
 *
 * $conFirma trae también la imagen de la firma (BLOB). Se deja apagado por
 * defecto porque `listar.php` solo pinta una vista previa en texto: traer
 * la firma de cientos de filas ahí sería memoria y tráfico tirados a la
 * basura. `exportar.php`, que sí la manda para el PDF, la pide con true.
 */
function asc_entregas(PDO $pdo, array $f, int $max, bool $conFirma = false): array
{
    $where   = ['c.fecha BETWEEN :desde AND :hasta'];
    $params0 = [];
    /* Antes se deducía del destino: con destino era Confort Care. Ya no
       sirve, porque los dos tipos llevan EPS de destino. Ahora se filtra
       por la columna que guarda lo que eligió quien registró. */
    $where[]         = 'c.tipo_control = :tipo';
    $params0['tipo'] = $f['formato'] === 'confort' ? 'CONFORT' : 'GENERAL';

    $params = $params0 + ['desde' => $f['desde'], 'hasta' => $f['hasta']];

    if ($f['documento'] !== '') {
        $where[]            = 'u.n_doc = :doc';
        $params['doc']      = $f['documento'];
    }

    /* La firma ya no es de la entrega sino del mes: vive una sola vez en
       `firmas_periodo` y la fila la apunta. Las entregas viejas, de cuando
       se firmaba una por una, la tienen en su propia columna — por eso el
       COALESCE: primero lo que traiga la fila, si no, la del mes. */
    $firmas = $conFirma
        ? ', COALESCE(c.firma, fp.firma)                         AS firma' .
          ', COALESCE(c.firma_acompanante, fpa.firma)            AS firma_acompanante'
        : '';

    $sql = 'SELECT c.id_control, c.recibe, c.tipo_control, c.fecha,
                   c.desayuno, c.almuerzo, c.cena, c.destino,
                   c.id_acompanante, c.estado' . $firmas . ',
                   u.id_usuario, u.nombre_usuario, u.tipo_documento, u.n_doc,
                   u.tipo_paciente, u.direccion, u.telefono, u.eps,
                   a.nombre         AS acompanante_nombre,
                   a.tipo_documento AS acompanante_tipo_documento,
                   a.n_doc          AS acompanante_n_doc
              FROM control_alimentos c
              JOIN usuarios u          ON u.id_usuario     = c.id_usuario
         LEFT JOIN acompanantes a      ON a.id_acompanante = c.id_acompanante
         LEFT JOIN firmas_periodo fp   ON fp.id_firma      = c.id_firma
         LEFT JOIN firmas_periodo fpa  ON fpa.id_firma     = c.id_firma_acomp
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
function asc_totales(array $filas): array
{
    $t = ['registros' => count($filas), 'personas' => 0,
          'desayuno' => 0, 'almuerzo' => 0, 'cena' => 0];

    $personas = [];
    foreach ($filas as $r) {
        $personas[(string) $r['id_usuario']] = true;
        $t['desayuno'] += (int) $r['desayuno'];
        $t['almuerzo'] += (int) $r['almuerzo'];
        $t['cena']     += (int) $r['cena'];
    }
    $t['personas'] = count($personas);
    $t['raciones'] = $t['desayuno'] + $t['almuerzo'] + $t['cena'];

    return $t;
}
