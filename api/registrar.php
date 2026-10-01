<?php

/* ============================================================================
 *  registrar.php — guarda una entrega de alimentación.
 *
 *  Cambió de raíz respecto a la primera versión:
 *
 *  - Ya NO crea pacientes. El paciente tiene que existir y haber firmado el
 *    consentimiento informado (api/consentimiento.php). Si no, se rechaza.
 *  - Exige sesión: el módulo de alimentación va detrás del mismo ingreso
 *    que la página de reportes.
 *  - El tipo de control se guarda aparte (ya no se deduce del destino,
 *    porque ahora los dos tipos llevan EPS de destino).
 *  - Si alguna comida va en 2 o más, hubo acompañante: se piden sus datos y
 *    queda en su propia tabla.
 *  - Ya NO se firma acá. La entrega nace PENDIENTE y se firma al cerrar el
 *    mes, desde reportes, con una sola firma por persona.
 * ========================================================================== */

declare(strict_types=1);

define('ASC_ENTRADA', true);
require __DIR__ . '/_lib/bootstrap.php';

asc_metodo('POST');

$cfg = asc_cargar_config();
asc_verificar_origen($cfg);
asc_sesion($cfg);
asc_exigir_sesion();

$in = asc_cuerpo();

/**
 * Los datos de la ficha que se pueden completar desde esta pantalla cuando el
 * consentimiento informado no los trajo. Solo llega lo que se escribió: lo
 * que venga vacío se descarta acá mismo, para que nunca borre lo que ya está
 * guardado.
 *
 * @return array<string,string> columna => valor
 */
function asc_ficha_paciente($in): array
{
    $d = is_array($in) ? $in : [];
    $ficha = [];

    $tipo = strtoupper(asc_texto($d['tipoPaciente'] ?? '', 20));
    if (in_array($tipo, ['EVENTO', 'HOGAR DE PASO', 'OTROS'], true)) {
        $ficha['tipo_paciente'] = $tipo;
    }

    foreach (['eps' => 100, 'direccion' => 150, 'telefono' => 30] as $col => $max) {
        $v = asc_texto($d[$col] ?? '', $max);
        if ($v !== '') $ficha[$col] = $v;
    }

    return $ficha;
}

/* --- 1. Validación de la entrega ----------------------------------------- */

$errores = [];

$idUsuario = (int) ($in['idUsuario'] ?? 0);
if ($idUsuario <= 0) $errores['paciente'] = 'Busque y elija al paciente.';

$tipoControl = strtolower(asc_texto($in['tipoControl'] ?? '', 20));
if (!in_array($tipoControl, ['general', 'confort'], true)) {
    $errores['tipoControl'] = 'Elija el tipo de control.';
}

// Ahora los dos formatos llevan EPS de destino.
$destino = asc_texto($in['destino'] ?? '', 100);
if ($destino === '') $errores['destino'] = 'Elija la EPS de destino.';

$fecha = asc_fecha($in['fecha'] ?? '');
if ($fecha === null) {
    $errores['fecha'] = 'Indique la fecha de la entrega.';
} elseif ($fecha > date('Y-m-d')) {
    $errores['fecha'] = 'La fecha no puede ser posterior a hoy.';
}

$desayuno = asc_racion($in['desayuno'] ?? null);
$almuerzo = asc_racion($in['almuerzo'] ?? null);
$cena     = asc_racion($in['cena'] ?? null);

if ($desayuno === null && $almuerzo === null && $cena === null) {
    $errores['alimentacion'] = 'Indique la cantidad de al menos una comida.';
}

/* La firma dejó de pedirse acá. Ahora la entrega se guarda PENDIENTE y al
   cerrar el mes la persona firma una sola vez desde la página de reportes
   (api/firmar-mes.php); esa firma vale para todos sus registros del mes. */

/* --- 2. ¿Hubo acompañante? -----------------------------------------------
 *  La regla la puso la Unidad: dos de una misma comida significa que vino
 *  alguien con el paciente. Tres desayunos, lo mismo. En cambio un desayuno
 *  más un almuerzo más una cena es una sola persona comiendo tres veces.
 * -------------------------------------------------------------------------*/

$maxComida = max((int) $desayuno, (int) $almuerzo, (int) $cena);
$hayAcompanante = $maxComida >= 2;

$ficha = asc_ficha_paciente($in['paciente'] ?? null);

$acomp       = is_array($in['acompanante'] ?? null) ? $in['acompanante'] : [];
$acompNombre = asc_texto($acomp['nombre'] ?? '', 250);
$acompTipo   = strtoupper(asc_texto($acomp['tipoDocumento'] ?? '', 5));
$acompDoc    = asc_documento($acomp['documento'] ?? '');
$acompTel    = asc_texto($acomp['telefono'] ?? '', 30) ?: null;
$acompParent = asc_texto($acomp['parentesco'] ?? '', 60) ?: null;

if ($hayAcompanante) {
    if (mb_strlen($acompNombre) < 3) {
        $errores['acompananteNombre'] = 'Escriba el nombre del acompañante.';
    }
    if (!in_array($acompTipo, ['CC', 'CE', 'PA', 'PEP', 'PPT'], true)) {
        $errores['acompananteTipoDocumento'] = 'Elija el tipo de documento del acompañante.';
    }
    if (strlen($acompDoc) < 5) {
        $errores['acompananteDocumento'] = 'Escriba el documento del acompañante.';
    }
}

if ($errores) {
    asc_error(422, 'Revise los datos del registro.', ['campos' => $errores]);
}

/* --- 3. Guardar ---------------------------------------------------------- */

$pdo = asc_pdo($cfg);

try {
    $pdo->beginTransaction();

    /* 3.1 El paciente tiene que existir y tener consentimiento firmado. */
    $q = $pdo->prepare('SELECT id_usuario, nombre_usuario, consentimiento_fecha,
                               tipo_paciente, direccion, telefono, eps
                          FROM usuarios WHERE id_usuario = ? LIMIT 1');
    $q->execute([$idUsuario]);
    $usuario = $q->fetch();

    if (!$usuario) {
        $pdo->rollBack();
        asc_error(422, 'Ese paciente ya no está en la base. Búsquelo de nuevo.',
                  ['campos' => ['paciente' => 'Paciente no encontrado.']]);
    }

    if (empty($usuario['consentimiento_fecha'])) {
        $pdo->rollBack();
        asc_error(409,
            'No se puede registrar la entrega: ' . $usuario['nombre_usuario'] .
            ' todavía no ha firmado el consentimiento informado. ' .
            'Diligéncielo primero y vuelva a intentarlo.',
            ['campos' => ['paciente' => 'Falta el consentimiento informado.']]);
    }

    /* 3.1b La ficha del paciente: tipo, EPS, dirección y teléfono se pueden
       completar desde esta pantalla cuando el consentimiento no los trajo.
       Solo se escribe lo que llegó y cambió; lo vacío ya se descartó antes. */
    $cambios = [];
    foreach ($ficha as $col => $valor) {
        if (trim((string) ($usuario[$col] ?? '')) !== $valor) $cambios[$col] = $valor;
    }

    if ($cambios) {
        $sets = [];
        foreach (array_keys($cambios) as $col) $sets[] = "`$col` = ?";

        $vals   = array_values($cambios);
        $vals[] = $idUsuario;

        $pdo->prepare('UPDATE usuarios SET ' . implode(', ', $sets) .
                      ' WHERE id_usuario = ?')->execute($vals);
    }

    /* 3.2 El acompañante: se busca por documento y se reutiliza si ya estaba. */
    $idAcompanante = null;

    if ($hayAcompanante) {
        $q = $pdo->prepare('SELECT id_acompanante, telefono, parentesco
                              FROM acompanantes WHERE n_doc = ? LIMIT 1');
        $q->execute([$acompDoc]);
        $ya = $q->fetch();

        if ($ya) {
            $idAcompanante = (int) $ya['id_acompanante'];

            // Se actualiza el nombre y se completa lo que estuviera vacío.
            $set = ['`nombre` = ?'];
            $val = [$acompNombre];
            foreach (['telefono' => $acompTel, 'parentesco' => $acompParent] as $col => $nuevo) {
                $viejo = $ya[$col] ?? null;
                if ($nuevo !== null && ($viejo === null || trim((string) $viejo) === '')) {
                    $set[] = "`$col` = ?";
                    $val[] = $nuevo;
                }
            }
            $val[] = $idAcompanante;
            $pdo->prepare('UPDATE acompanantes SET ' . implode(', ', $set) .
                          ' WHERE id_acompanante = ?')->execute($val);
        } else {
            $ins = $pdo->prepare('INSERT INTO acompanantes
                    (nombre, tipo_documento, n_doc, telefono, parentesco)
                    VALUES (?, ?, ?, ?, ?)');
            $ins->execute([$acompNombre, $acompTipo, $acompDoc, $acompTel, $acompParent]);
            $idAcompanante = (int) $pdo->lastInsertId();
        }
    }

    /* 3.3 La entrega. */
    $cols = ['id_usuario', 'id_acompanante', 'recibe', 'tipo_control', 'fecha',
             'desayuno', 'almuerzo', 'cena', 'destino', 'estado'];
    $vals = [
        $idUsuario,
        $idAcompanante,
        'PACIENTE',
        $tipoControl === 'confort' ? 'CONFORT' : 'GENERAL',
        $fecha,
        $desayuno, $almuerzo, $cena,
        $destino,
        'PENDIENTE',
    ];

    $ins = $pdo->prepare('INSERT INTO control_alimentos (`' . implode('`, `', $cols) . '`)
            VALUES (' . implode(', ', array_fill(0, count($cols), '?')) . ')');
    $ins->execute($vals);
    $idControl = (int) $pdo->lastInsertId();

    $pdo->commit();

} catch (PDOException $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    error_log('[alimentacion] registrar: ' . $e->getMessage());
    asc_error(500, 'No se pudo guardar el registro. Vuelva a intentarlo; ' .
                   'si sigue fallando, avise a soporte.');
}

/* Los nombres de lo que se completó, como para leerlos en pantalla. */
$NOMBRES = [
    'tipo_paciente' => 'tipo de paciente',
    'eps'           => 'EPS',
    'direccion'     => 'dirección',
    'telefono'      => 'teléfono',
];
$fichaActualizada = [];
foreach (array_keys($cambios) as $col) {
    $fichaActualizada[] = $NOMBRES[$col] ?? $col;
}

asc_ok([
    'idControl'      => $idControl,
    'idUsuario'      => $idUsuario,
    'idAcompanante'  => $idAcompanante,
    'conAcompanante' => $hayAcompanante,
    'estado'         => 'PENDIENTE',
    // Para que la pantalla pueda decir qué se completó de la ficha.
    'fichaActualizada' => $fichaActualizada,
]);
