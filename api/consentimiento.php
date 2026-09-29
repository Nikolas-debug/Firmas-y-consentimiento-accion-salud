<?php


declare(strict_types=1);

define('ASC_ENTRADA', true);
require __DIR__ . '/_lib/bootstrap.php';

asc_metodo('POST');

$cfg = asc_cargar_config();

/* --- 0. Solo el Apps Script puede entrar aquí ----------------------------- */

$secretoEsperado = (string) ($cfg['secreto_apps_script'] ?? '');

// Sin secreto configurado se rechaza todo: un secreto vacío aceptaría
// cualquier petición, que es justo lo que se quiere evitar.
if ($secretoEsperado === '' && !asc_servidor_de_pruebas()) {
    error_log('[alimentacion] consentimiento: falta secreto_apps_script en la configuración');
    asc_error(503, 'El registro de consentimientos no está configurado.');
}

$secretoRecibido = (string) ($_SERVER['HTTP_X_ASC_SECRETO'] ?? '');

if (!asc_servidor_de_pruebas() && !hash_equals($secretoEsperado, $secretoRecibido)) {
    asc_error(403, 'No autorizado.');
}

$in = asc_cuerpo();

/* --- 1. Validación ------------------------------------------------------- */

$errores = [];

$nombre = asc_texto($in['nombre'] ?? '', 250);
if (mb_strlen($nombre) < 3) $errores['nombre'] = 'Escriba el nombre completo.';

$TIPOS   = ['CC', 'CE', 'PA', 'PEP', 'PPT'];
$tipoDoc = strtoupper(asc_texto($in['tipoDocumento'] ?? '', 5));
if (!in_array($tipoDoc, $TIPOS, true)) $errores['tipoDocumento'] = 'Elija el tipo de documento.';

$documento = asc_documento($in['documento'] ?? '');
if ($documento === '') {
    $errores['documento'] = 'Escriba el número de documento.';
} elseif (strlen($documento) < 5) {
    $errores['documento'] = 'El documento debe tener al menos 5 caracteres.';
}

// Qué consentimiento firmó (código del formato). Solo para dejar rastro.
$codigo = asc_texto($in['codigo'] ?? '', 40) ?: null;

/* Dónde quedó guardado el documento: la ruta de Dropbox si subió, y si no
   al menos el nombre del archivo que salió por correo. Así la ficha del
   paciente apunta al consentimiento firmado y no solo dice que existe. */
$archivo = asc_texto($in['rutaDocumento'] ?? '', 255)
        ?: (asc_texto($in['archivo'] ?? '', 255) ?: null);

// Datos de contacto: son opcionales aquí, se completan cuando lleguen.
$tipoPaciente = strtoupper(asc_texto($in['tipoPaciente'] ?? '', 20));
if (!in_array($tipoPaciente, ['EVENTO', 'HOGAR DE PASO', 'OTROS'], true)) $tipoPaciente = null;

$direccion = asc_texto($in['direccion'] ?? '', 150) ?: null;
$telefono  = asc_texto($in['telefono']  ?? '', 30)  ?: null;
$eps       = asc_texto($in['eps']       ?? '', 100) ?: null;

if ($errores) {
    asc_error(422, 'Revise los datos del consentimiento.', ['campos' => $errores]);
}

/* --- 2. Guardar ---------------------------------------------------------- */

$pdo   = asc_pdo($cfg);
$ahora = date('Y-m-d H:i:s');

try {
    $pdo->beginTransaction();

    $q = $pdo->prepare('SELECT id_usuario, tipo_paciente, direccion, telefono, eps
                          FROM usuarios WHERE n_doc = ? LIMIT 1');
    $q->execute([$documento]);
    $usuario = $q->fetch();

    if ($usuario) {
        $idUsuario = (int) $usuario['id_usuario'];

        /* Se refresca la fecha del consentimiento —firmó de nuevo— y se
           completa solo lo que esté vacío en la ficha, para no pisar datos
           que alguien ya corrigió a mano. */
        $set = ['`nombre_usuario` = ?', '`consentimiento_fecha` = ?', '`consentimiento_codigo` = ?'];
        $val = [$nombre, $ahora, $codigo];

        if ($archivo !== null) { $set[] = '`consentimiento_archivo` = ?'; $val[] = $archivo; }

        foreach ([
            'tipo_paciente' => $tipoPaciente,
            'direccion'     => $direccion,
            'telefono'      => $telefono,
            'eps'           => $eps,
        ] as $columna => $nuevo) {
            $viejo = $usuario[$columna] ?? null;
            if ($nuevo !== null && ($viejo === null || trim((string) $viejo) === '')) {
                $set[] = "`$columna` = ?";
                $val[] = $nuevo;
            }
        }

        $val[] = $idUsuario;
        $pdo->prepare('UPDATE usuarios SET ' . implode(', ', $set) . ' WHERE id_usuario = ?')
            ->execute($val);

        $creado = false;

    } else {
        $ins = $pdo->prepare('INSERT INTO usuarios
                (nombre_usuario, tipo_documento, n_doc, tipo_paciente,
                 direccion, telefono, eps,
                 consentimiento_fecha, consentimiento_codigo, consentimiento_archivo)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        $ins->execute([$nombre, $tipoDoc, $documento, $tipoPaciente,
                       $direccion, $telefono, $eps, $ahora, $codigo, $archivo]);

        $idUsuario = (int) $pdo->lastInsertId();
        $creado    = true;
    }

    $pdo->commit();

} catch (PDOException $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    error_log('[alimentacion] consentimiento: ' . $e->getMessage());
    asc_error(500, 'No se pudo dejar registrado el consentimiento. ' .
                   'Vuelva a intentarlo; si sigue fallando, avise a soporte.');
}

asc_ok([
    'idUsuario' => $idUsuario,
    'creado'    => $creado,
    'fecha'     => $ahora,
]);
