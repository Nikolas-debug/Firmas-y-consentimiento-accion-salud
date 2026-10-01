<?php

/* ============================================================================
 *  POST api/registrar-transporte.php — guarda un viaje.
 *
 *  Misma regla que alimentación: el paciente tiene que existir y haber
 *  firmado el consentimiento informado, y el viaje nace PENDIENTE. La firma
 *  se toma al cerrar el mes, desde reportes-transporte.php.
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

/* --- 1. Validación -------------------------------------------------------*/

$errores = [];

$idUsuario = (int) ($in['idUsuario'] ?? 0);
if ($idUsuario <= 0) $errores['paciente'] = 'Busque y elija al paciente.';

$fecha = asc_fecha($in['fecha'] ?? '');
if ($fecha === null) {
    $errores['fecha'] = 'Indique la fecha del viaje.';
} elseif ($fecha > date('Y-m-d')) {
    $errores['fecha'] = 'La fecha no puede ser posterior a hoy.';
}

$tipo = asc_texto($in['tipoTransporte'] ?? '', 60);
if ($tipo === '') $errores['tipoTransporte'] = 'Indique el tipo de transporte.';

$cantidad = asc_racion($in['cantidad'] ?? null) ?? 1;
if ($cantidad > 20) $errores['cantidad'] = 'Revise la cantidad: no puede pasar de 20.';

$observaciones = asc_texto($in['observaciones'] ?? '', 255) ?: null;

/* Los mismos datos de la ficha que se pueden completar desde alimentación. */
$ficha = [];
$fichaIn = is_array($in['paciente'] ?? null) ? $in['paciente'] : [];
$tp = strtoupper(asc_texto($fichaIn['tipoPaciente'] ?? '', 20));
if (in_array($tp, ['EVENTO', 'HOGAR DE PASO', 'OTROS'], true)) $ficha['tipo_paciente'] = $tp;
foreach (['eps' => 100, 'direccion' => 150, 'telefono' => 30] as $col => $max) {
    $v = asc_texto($fichaIn[$col] ?? '', $max);
    if ($v !== '') $ficha[$col] = $v;
}

if ($errores) asc_error(422, 'Revise los datos del registro.', ['campos' => $errores]);

/* --- 2. Guardar ----------------------------------------------------------*/

$pdo = asc_pdo($cfg);

try {
    $pdo->beginTransaction();

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
            'No se puede registrar el viaje: ' . $usuario['nombre_usuario'] .
            ' todavía no ha firmado el consentimiento informado. ' .
            'Diligéncielo primero y vuelva a intentarlo.',
            ['campos' => ['paciente' => 'Falta el consentimiento informado.']]);
    }

    /* La ficha se completa igual que en alimentación: solo lo que cambió, y
       lo vacío nunca borra. */
    $cambios = [];
    foreach ($ficha as $col => $valor) {
        if (trim((string) ($usuario[$col] ?? '')) !== $valor) $cambios[$col] = $valor;
    }
    if ($cambios) {
        $sets = [];
        foreach (array_keys($cambios) as $col) $sets[] = "`$col` = ?";
        $vals = array_values($cambios);
        $vals[] = $idUsuario;
        $pdo->prepare('UPDATE usuarios SET ' . implode(', ', $sets) .
                      ' WHERE id_usuario = ?')->execute($vals);
    }

    $ins = $pdo->prepare('INSERT INTO control_transporte
            (id_usuario, fecha, tipo_transporte, cantidad, observaciones, estado)
            VALUES (?, ?, ?, ?, ?, ?)');
    $ins->execute([$idUsuario, $fecha, $tipo, $cantidad, $observaciones, 'PENDIENTE']);
    $idControl = (int) $pdo->lastInsertId();

    $pdo->commit();

} catch (PDOException $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    error_log('[transporte] registrar: ' . $e->getMessage());
    asc_error(500, 'No se pudo guardar el viaje. Vuelva a intentarlo; ' .
                   'si sigue fallando, avise a soporte.');
}

$NOMBRES = ['tipo_paciente' => 'tipo de paciente', 'eps' => 'EPS',
            'direccion' => 'dirección', 'telefono' => 'teléfono'];
$fichaActualizada = [];
foreach (array_keys($cambios) as $col) $fichaActualizada[] = $NOMBRES[$col] ?? $col;

asc_ok([
    'idControl'        => $idControl,
    'idUsuario'        => $idUsuario,
    'estado'           => 'PENDIENTE',
    'fichaActualizada' => $fichaActualizada,
]);
