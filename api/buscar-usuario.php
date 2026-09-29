<?php

/* ============================================================================
 *  buscar-usuario.php — el buscador de pacientes del control de alimentación.
 *
 *  Dos modos:
 *    ?q=texto         lista hasta 20 coincidencias por nombre o documento
 *    ?documento=NNN   la ficha completa de una persona y sus últimas entregas
 *
 *  Exige sesión a propósito. Si respondiera sin ella, cualquiera podría
 *  recorrer números de cédula desde internet y armar la lista de quienes
 *  reciben alimentación en la Unidad.
 * ========================================================================== */

declare(strict_types=1);

define('ASC_ENTRADA', true);
require __DIR__ . '/_lib/bootstrap.php';

asc_metodo('GET');

$cfg = asc_cargar_config();
asc_sesion($cfg);
asc_exigir_sesion();

$pdo = asc_pdo($cfg);

/* --- Modo lista: ?q=texto ------------------------------------------------ */

$q = asc_texto($_GET['q'] ?? '', 80);

if ($q !== '') {
    if (mb_strlen($q) < 3) {
        asc_error(400, 'Escriba al menos 3 caracteres para buscar.');
    }

    /* El LIKE va con comodín a lado y lado en el nombre y solo al final en
       el documento (así puede usar el índice). El texto se escapa para que
       un % o un _ escrito por el usuario no se tome como comodín. Se usa «!»
       como carácter de escape y no la barra invertida, porque la barra se
       interpreta distinto según el motor. */
    $escapado = str_replace(['!', '%', '_'], ['!!', '!%', '!_'], $q);

    /* Van también dirección y teléfono: la página de alimentación deja
       completarlos ahí mismo cuando el consentimiento no los trajo. */
    $st = $pdo->prepare("SELECT id_usuario, nombre_usuario, tipo_documento, n_doc,
                                tipo_paciente, direccion, telefono, eps,
                                consentimiento_fecha
                           FROM usuarios
                          WHERE nombre_usuario LIKE ? ESCAPE '!'
                             OR n_doc          LIKE ? ESCAPE '!'
                          ORDER BY nombre_usuario ASC
                          LIMIT 20");
    $st->execute(['%' . $escapado . '%', $escapado . '%']);
    $filas = $st->fetchAll();

    foreach ($filas as &$f) {
        // La pantalla necesita saber si puede o no registrarle alimentación.
        $f['consentido'] = !empty($f['consentimiento_fecha']);
    }
    unset($f);

    asc_ok(['resultados' => $filas]);
}

/* --- Modo ficha: ?documento=NNN ------------------------------------------ */

$documento = asc_documento($_GET['documento'] ?? '');
if ($documento === '') asc_error(400, 'Indique el número de documento o un texto de búsqueda.');

$st = $pdo->prepare('SELECT id_usuario, nombre_usuario, tipo_documento, n_doc,
                            tipo_paciente, direccion, telefono, eps,
                            consentimiento_fecha, consentimiento_codigo
                       FROM usuarios WHERE n_doc = ? LIMIT 1');
$st->execute([$documento]);
$usuario = $st->fetch();

if (!$usuario) asc_ok(['existe' => false]);

$usuario['consentido'] = !empty($usuario['consentimiento_fecha']);

$st = $pdo->prepare('SELECT c.id_control, c.tipo_control, c.fecha,
                            c.desayuno, c.almuerzo, c.cena, c.destino,
                            a.nombre AS acompanante
                       FROM control_alimentos c
                  LEFT JOIN acompanantes a ON a.id_acompanante = c.id_acompanante
                      WHERE c.id_usuario = ?
                   ORDER BY c.fecha DESC, c.id_control DESC
                      LIMIT 60');
$st->execute([$usuario['id_usuario']]);

asc_ok([
    'existe'   => true,
    'usuario'  => $usuario,
    'entregas' => $st->fetchAll(),
]);
