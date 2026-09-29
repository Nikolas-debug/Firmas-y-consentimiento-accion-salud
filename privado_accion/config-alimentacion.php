<?php

return [

    /* ---- Base de datos -------------------------------------------------- */
    'db' => [
        // En cPanel el host casi siempre es localhost.
        'host'   => 'localhost',
        'puerto' => 3306,
        'nombre' => 'accion_alimentacion_unidad_san_felipe',
        'usuario' => 'hola',
        'clave'   => '123456789',
    ],

    'usuarios_reportes' => [
        // 'usuario' => 'hash de la clave'
        'admin' => '$2y$12$AJesO5lQPMSTC4HHdIKX5.IVc/o/sZf5wih4mM9zA7OIlNnzpOQe2',
    ],

    'secreto_apps_script' => 'ASC_SECRETO_CONSENTIMIENTO',

    /* ---- Sesión ---------------------------------------------------------- */
    // Minutos de inactividad antes de que se cierre la sesión de reportes.
    'sesion_minutos' => 60,

    'origenes_permitidos' => [
        'https://accionsalud.com.co',
        'https://www.accionsalud.com.co',
    ],

    /* ---- Tope de registros por exportación ------------------------------
     *  Freno para que un rango de fechas enorme no tumbe el servidor.
     * -------------------------------------------------------------------- */
    'max_registros_export' => 5000,
];
