<?php

/* ============================================================================
 *  firmas.php — la firma del mes.
 *
 *  La regla cambió: ya no se firma cada entrega. Los registros se guardan
 *  con estado PENDIENTE y al cerrar el mes la persona firma una sola vez
 *  desde la página de reportes. Esa firma vive en `firmas_periodo` y todos
 *  sus registros de ese mes la apuntan.
 *
 *  Esto lo comparten alimentación y transporte: cambia la tabla, no la
 *  mecánica. Por eso todo pasa por ASC_MODULOS.
 * ========================================================================== */

declare(strict_types=1);

/**
 * Cada módulo dice en qué tabla vive y con qué columnas apunta a la firma.
 *
 *  - `acomp`: si el formato admite acompañante que también firma.
 */
const ASC_MODULOS = [
    'ALIMENTACION' => [
        'tabla'      => 'control_alimentos',
        'col_firma'  => 'id_firma',
        'col_acomp'  => 'id_firma_acomp',
        'acomp'      => true,
    ],
    'TRANSPORTE' => [
        'tabla'      => 'control_transporte',
        'col_firma'  => 'id_firma',
        'col_acomp'  => null,
        'acomp'      => false,
    ],
];

function asc_modulo(string $nombre): array
{
    $m = strtoupper(trim($nombre));
    if (!isset(ASC_MODULOS[$m])) asc_error(400, 'Módulo desconocido.');
    return ['id' => $m] + ASC_MODULOS[$m];
}

/** 'AAAA-MM' o null. */
function asc_periodo($v): ?string
{
    $s = is_scalar($v) ? trim((string) $v) : '';
    return preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', $s) ? $s : null;
}

/**
 * Quiénes tienen registros sin firmar dentro del rango, agrupados por
 * persona y mes. Una fila por firma que falta: la del paciente y, cuando
 * el módulo lo admite, la de cada acompañante que participó ese mes.
 *
 * @return array<int,array<string,mixed>>
 */
function asc_pendientes(PDO $pdo, array $mod, array $f): array
{
    $tabla = $mod['tabla'];
    $where = ['c.fecha BETWEEN :desde AND :hasta'];
    $par   = ['desde' => $f['desde'], 'hasta' => $f['hasta']];

    if ($mod['id'] === 'ALIMENTACION') {
        $where[]      = 'c.tipo_control = :tipo';
        $par['tipo']  = ($f['formato'] ?? '') === 'confort' ? 'CONFORT' : 'GENERAL';
    }
    if (($f['documento'] ?? '') !== '') {
        $where[]     = 'u.n_doc = :doc';
        $par['doc']  = $f['documento'];
    }

    $filtro = implode(' AND ', $where);
    $mes    = "SUBSTR(c.fecha, 1, 7)";   // 'AAAA-MM' en MySQL y en SQLite

    /* 1. Lo que falta por firmar el propio paciente. */
    $sql = "SELECT $mes AS periodo, u.id_usuario, 0 AS id_acompanante,
                   'PACIENTE' AS quien,
                   u.nombre_usuario AS nombre, u.tipo_documento, u.n_doc,
                   COUNT(*) AS registros,
                   MIN(c.fecha) AS primera, MAX(c.fecha) AS ultima
              FROM $tabla c
              JOIN usuarios u ON u.id_usuario = c.id_usuario
             WHERE $filtro AND c.{$mod['col_firma']} IS NULL
             GROUP BY periodo, u.id_usuario, u.nombre_usuario,
                      u.tipo_documento, u.n_doc
             ORDER BY periodo ASC, u.nombre_usuario ASC";

    $q = $pdo->prepare($sql);
    $q->execute($par);
    $filas = $q->fetchAll();

    /* 2. Y lo que falta por firmar cada acompañante. */
    if ($mod['acomp']) {
        $sql2 = "SELECT $mes AS periodo, u.id_usuario, a.id_acompanante,
                        'ACOMPANANTE' AS quien,
                        a.nombre, a.tipo_documento, a.n_doc,
                        COUNT(*) AS registros,
                        MIN(c.fecha) AS primera, MAX(c.fecha) AS ultima,
                        u.nombre_usuario AS paciente
                   FROM $tabla c
                   JOIN usuarios u     ON u.id_usuario     = c.id_usuario
                   JOIN acompanantes a ON a.id_acompanante = c.id_acompanante
                  WHERE $filtro AND c.{$mod['col_acomp']} IS NULL
                  GROUP BY periodo, u.id_usuario, u.nombre_usuario,
                           a.id_acompanante, a.nombre, a.tipo_documento, a.n_doc
                  ORDER BY periodo ASC, a.nombre ASC";

        $q2 = $pdo->prepare($sql2);
        $q2->execute($par);
        $filas = array_merge($filas, $q2->fetchAll());
    }

    foreach ($filas as &$x) {
        $x['id_usuario']     = (int) $x['id_usuario'];
        $x['id_acompanante'] = (int) $x['id_acompanante'];
        $x['registros']      = (int) $x['registros'];
    }
    unset($x);

    /* Ordenado como se va a leer en pantalla: por mes, y dentro del mes
       cada paciente primero y después sus acompañantes. */
    $orden = static function (array $x): array {
        return [
            $x['periodo'],
            mb_strtolower((string) ($x['paciente'] ?? $x['nombre'])),
            $x['quien'] === 'PACIENTE' ? 0 : 1,
            mb_strtolower((string) $x['nombre']),
        ];
    };
    usort($filas, static function ($a, $b) use ($orden) {
        return $orden($a) <=> $orden($b);
    });

    return $filas;
}

/**
 * Guarda la firma del mes y marca los registros.
 *
 * Si ya había una firma para esa persona, módulo y mes, se reemplaza: es el
 * caso de volver a tomarla porque la primera salió mal. Los registros que
 * ya la apuntaban siguen apuntándola.
 *
 * @return array{idFirma:int,registros:int}
 */
function asc_firmar_periodo(PDO $pdo, array $mod, string $periodo, int $idUsuario,
                            int $idAcompanante, string $imagen, string $tipo,
                            string $quienRegistra): array
{
    $esAcomp = $idAcompanante > 0;
    if ($esAcomp && !$mod['acomp']) {
        asc_error(400, 'Este formato no lleva firma de acompañante.');
    }

    $columna = $esAcomp ? $mod['col_acomp'] : $mod['col_firma'];
    $tabla   = $mod['tabla'];

    $pdo->beginTransaction();

    try {
        /* 1. La firma: una sola por módulo, mes y persona. */
        $q = $pdo->prepare('SELECT id_firma FROM firmas_periodo
                             WHERE modulo = ? AND periodo = ?
                               AND id_usuario = ? AND id_acompanante = ?
                             LIMIT 1');
        $q->execute([$mod['id'], $periodo, $idUsuario, $idAcompanante]);
        $ya = $q->fetchColumn();

        if ($ya) {
            $idFirma = (int) $ya;
            $pdo->prepare('UPDATE firmas_periodo
                              SET firma = ?, firma_tipo = ?, firmado_por = ?
                            WHERE id_firma = ?')
                ->execute([$imagen, $tipo, $quienRegistra, $idFirma]);
        } else {
            $pdo->prepare('INSERT INTO firmas_periodo
                    (modulo, periodo, id_usuario, id_acompanante,
                     firma, firma_tipo, firmado_por)
                    VALUES (?, ?, ?, ?, ?, ?, ?)')
                ->execute([$mod['id'], $periodo, $idUsuario, $idAcompanante,
                           $imagen, $tipo, $quienRegistra]);
            $idFirma = (int) $pdo->lastInsertId();
        }

        /* 2. Los registros de ese mes que todavía no la apuntaban.
              El estado solo lo mueve la firma del paciente: un renglón se da
              por firmado cuando firma quien recibió. */
        $set = "`$columna` = ?" . ($esAcomp ? '' : ", estado = 'FIRMADO'");
        $sql = "UPDATE $tabla
                   SET $set
                 WHERE id_usuario = ?
                   AND SUBSTR(fecha, 1, 7) = ?
                   AND `$columna` IS NULL" .
               ($esAcomp ? ' AND id_acompanante = ?' : '');

        $par = [$idFirma, $idUsuario, $periodo];
        if ($esAcomp) $par[] = $idAcompanante;

        $up = $pdo->prepare($sql);
        $up->execute($par);
        $tocados = $up->rowCount();

        $pdo->commit();

    } catch (PDOException $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }

    return ['idFirma' => $idFirma, 'registros' => $tocados];
}
