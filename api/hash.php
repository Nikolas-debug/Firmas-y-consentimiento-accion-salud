<?php

declare(strict_types=1);

header('Content-Type: text/plain; charset=utf-8');

$clave = $_GET['clave'] ?? '';

if (!is_string($clave) || strlen($clave) < 10) {
    http_response_code(400);
    echo "Pase una clave de al menos 10 caracteres:\n";
    echo "  hash.php?clave=LaClaveQueQuiera\n";
    exit;
}

echo password_hash($clave, PASSWORD_DEFAULT), "\n\n";
echo "Pegue esa línea en config-alimentacion.php, dentro de 'usuarios_reportes',\n";
echo "y borre este archivo del servidor.\n";
