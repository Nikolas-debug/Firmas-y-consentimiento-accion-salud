<?php

/* ============================================================================
 *  POST api/firmar-mes.php
 *
 *  {
 *    "modulo": "ALIMENTACION",      // o TRANSPORTE
 *    "periodo": "2026-09",
 *    "idUsuario": 12,
 *    "idAcompanante": 0,            // 0 = la firma del paciente
 *    "firma": "data:image/png;base64,...",
 *    "firmaTipo": "FIRMA"           // o HUELLA
 *  }
 *
 *  Guarda la firma del mes y marca todos los registros de esa persona en
 *  ese mes. Es lo que reemplaza a firmar entrega por entrega.
 * ========================================================================== */

declare(strict_types=1);

define('ASC_ENTRADA', true);
require __DIR__ . '/_lib/bootstrap.php';
require __DIR__ . '/_lib/firmas.php';

asc_metodo('POST');

$cfg = asc_cargar_config();
asc_verificar_origen($cfg);
asc_sesion($cfg);
asc_exigir_sesion();

$in  = asc_cuerpo();
$mod = asc_modulo((string) ($in['modulo'] ?? 'ALIMENTACION'));

$errores = [];

$periodo = asc_periodo($in['periodo'] ?? '');
if ($periodo === null) $errores['periodo'] = 'Indique el mes en formato AAAA-MM.';

$idUsuario = (int) ($in['idUsuario'] ?? 0);
if ($idUsuario <= 0) $errores['idUsuario'] = 'Falta el paciente.';

$idAcompanante = (int) ($in['idAcompanante'] ?? 0);
if ($idAcompanante < 0) $idAcompanante = 0;

$imagen = asc_imagen($in['firma'] ?? null);
if ($imagen === null) $errores['firma'] = 'Debe capturar la firma o la huella.';

$tipo = strtoupper(asc_texto($in['firmaTipo'] ?? '', 10)) === 'HUELLA' ? 'HUELLA' : 'FIRMA';

if ($errores) asc_error(422, 'Revise los datos de la firma.', ['campos' => $errores]);

$pdo = asc_pdo($cfg);

/* El paciente tiene que existir; el acompañante también, si se indicó. */
$q = $pdo->prepare('SELECT nombre_usuario FROM usuarios WHERE id_usuario = ? LIMIT 1');
$q->execute([$idUsuario]);
$nombre = $q->fetchColumn();
if ($nombre === false) asc_error(422, 'Ese paciente ya no está en la base.');

if ($idAcompanante > 0) {
    $q = $pdo->prepare('SELECT nombre FROM acompanantes WHERE id_acompanante = ? LIMIT 1');
    $q->execute([$idAcompanante]);
    $nombreAcomp = $q->fetchColumn();
    if ($nombreAcomp === false) asc_error(422, 'Ese acompañante ya no está en la base.');
    $nombre = $nombreAcomp;
}

try {
    $r = asc_firmar_periodo($pdo, $mod, $periodo, $idUsuario, $idAcompanante,
                            $imagen, $tipo, (string) ($_SESSION['asc_usuario_reportes'] ?? ''));
} catch (PDOException $e) {
    error_log('[firmas] firmar-mes: ' . $e->getMessage());
    asc_error(500, 'No se pudo guardar la firma. Vuelva a intentarlo; ' .
                   'si sigue fallando, avise a soporte.');
}

asc_ok([
    'modulo'    => $mod['id'],
    'periodo'   => $periodo,
    'nombre'    => $nombre,
    'idFirma'   => $r['idFirma'],
    'registros' => $r['registros'],
    'marca'     => $tipo,
]);
