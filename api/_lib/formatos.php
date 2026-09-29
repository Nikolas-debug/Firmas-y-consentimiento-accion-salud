<?php
/* ============================================================================
 *  formatos.php — las dos plantillas de Excel del control de alimentación.
 *
 *  1) asc_formato_minuta()     MINUTA DE CONTROL DE ALIMENTOS
 *                              Control general (destino vacío).
 *                              Una hoja por persona. Una fila por día, con la
 *                              cantidad de cada comida en su columna.
 *
 *  2) asc_formato_constancia() CONSTANCIA DE PRESTACIÓN DE SERVICIO DE
 *                              ALIMENTACIÓN — CONS-RVAS-005 (Confort Care).
 *                              Una sola hoja. Un bloque de cinco columnas por
 *                              cada persona y tipo de comida, uno al lado del
 *                              otro. Una fila por ración: si el 8 de abril
 *                              recibió cuatro desayunos, el 8 de abril
 *                              aparece cuatro veces.
 *
 *  Las dos reproducen los archivos que entregó la Unidad San Felipe, con sus
 *  textos tal como están escritos allí ('MINUTA  DE CONTROL' con dos espacios,
 *  'DIRECION', 'ALMERZO', 'Codigo' sin tilde).
 * ========================================================================== */

declare(strict_types=1);

require_once __DIR__ . '/Xlsx.php';

const ASC_LOGO_SAN_FELIPE  = __DIR__ . '/logo-san-felipe.png';
const ASC_LOGO_CONFORT     = __DIR__ . '/logo-comfort-care.jpeg';

/** Renglones en blanco que se dejan listos para escribir y firmar a mano. */
const ASC_MIN_FILAS = 20;

/**
 * Alto (en puntos) del renglón que lleva firma. El formato impreso usaba
 * renglones bajos porque la firma se hacía a mano en un espacio chico; con
 * la firma digital hay que darle altura, o se ve como una manchita.
 */
const ASC_ALTO_FILA_FIRMA = 36.0;

/** Ancho de la columna de firma en cada formato (en caracteres, como Excel). */
const ASC_COL_FIRMA_MINUTA     = 45.43;   // columna I
const ASC_COL_FIRMA_CONSTANCIA = 38.00;   // quinta columna del bloque

const ASC_COMIDAS = [
    'desayuno' => 'DESAYUNO',
    'almuerzo' => 'ALMUERZO',
    'cena'     => 'CENA',
];


/* ============================================================================
 *  1. MINUTA DE CONTROL DE ALIMENTOS  (control general)
 * ==========================================================================*/

/**
 * @param array $registros Filas de control_alimentos unidas con usuarios,
 *                         ordenadas por nombre y fecha. Cada una trae:
 *                         id_usuario, nombre_usuario, tipo_documento, n_doc,
 *                         tipo_paciente, direccion, telefono, eps,
 *                         fecha, desayuno, almuerzo, cena, recibe.
 */
function asc_formato_minuta(array $registros): string
{
    $x = new Xlsx();

    // Se agrupa por persona: el formato lleva los datos de una sola en el
    // encabezado, así que cada persona necesita su propia hoja.
    $porPersona = [];
    foreach ($registros as $r) {
        $porPersona[(string) $r['id_usuario']][] = $r;
    }

    if (!$porPersona) {
        $h = $x->hoja('Sin registros');
        $x->celda($h, 1, 'A', 'No hay entregas registradas en el rango de fechas elegido.',
                  ['negrita' => true, 'tam' => 12]);
        $x->ancho($h, 'A', 70);
        return $x->bytes();
    }

    foreach ($porPersona as $filas) {
        $p = $filas[0];
        $h = $x->hoja(asc_nombre_corto((string) $p['nombre_usuario']));

        /* --- geometría, tomada del archivo original -------------------- */
        $x->ancho($h, 'A',  5.71);
        $x->ancho($h, 'B', 11.43);
        $x->ancho($h, 'D', 57.57);
        $x->ancho($h, 'E', 15.57);
        $x->ancho($h, 'F', 11.71);
        $x->ancho($h, 'H', 13.29);
        $x->ancho($h, 'I', ASC_COL_FIRMA_MINUTA);
        // C no tenía ancho propio: se fija en el mismo que trae Excel por
        // defecto para que el recuadro del logo mida siempre lo mismo.
        $x->ancho($h, 'C', 8.43);

        foreach ([1 => 26.25, 2 => 26.25, 3 => 26.25, 4 => 21.75, 5 => 23.25,
                  6 => 20.25, 7 => 20.25, 8 => 14.25, 9 => 15.0, 10 => 10.5] as $f => $alto) {
            $x->alto($h, $f, $alto);
        }

        /* --- estilos --------------------------------------------------- */
        $caja    = ['borde' => 'tblr'];
        $rotulo  = ['fuente' => 'Calibri', 'tam' => 11, 'negrita' => true,
                    'h' => 'center', 'v' => 'center', 'wrap' => true, 'borde' => 'tblr'];
        $bookman = ['fuente' => 'Bookman Old Style', 'tam' => 11, 'negrita' => true,
                    'h' => 'left', 'v' => 'center', 'borde' => 'tblr'];
        $dato    = ['fuente' => 'Calibri', 'tam' => 11, 'h' => 'left', 'v' => 'center', 'borde' => 'tblr'];
        $centro  = ['fuente' => 'Calibri', 'tam' => 11, 'h' => 'center', 'v' => 'center', 'borde' => 'tblr'];

        /* --- encabezado ------------------------------------------------ */
        // Logo de la Unidad San Felipe sobre A1:C4, fusionadas en un solo
        // recuadro (si no, quedan 12 celdas sin borde y sin línea alrededor).
        $x->celda($h, 1, 'A', null, $caja);
        $x->fusionar($h, 1, 'A', 4, 'C');
        asc_logo_en_caja($x, $h, ASC_LOGO_SAN_FELIPE, 1, 'A',
                         asc_ancho_emu(5.71) + asc_ancho_emu(11.43) + asc_ancho_emu(8.43),
                         asc_alto_emu(26.25 + 26.25 + 26.25 + 21.75));

        $x->celda($h, 1, 'D', 'MINUTA  DE CONTROL DE ALIMENTOS',
                  ['fuente' => 'Bookman Old Style', 'tam' => 18, 'negrita' => true,
                   'h' => 'center', 'v' => 'center', 'borde' => 'tblr']);
        $x->fusionar($h, 1, 'D', 4, 'I');

        // Tipo de paciente: se marca con una X delante de la opción elegida,
        // igual que se hace a mano sobre el formato impreso.
        $tipo = strtoupper(trim((string) ($p['tipo_paciente'] ?? '')));
        $marca = fn(string $opcion): string => ($tipo === $opcion ? 'X  ' : '') . $opcion;

        $x->celda($h, 5, 'A', 'TIPO DE PACIENTE:', $rotulo);
        $x->fusionar($h, 5, 'A', 6, 'C');

        $x->celda($h, 5, 'D', $marca('EVENTO'), $bookman);
        $x->celda($h, 6, 'D', $marca('HOGAR DE PASO'), $bookman);
        $x->celda($h, 5, 'F', $marca('OTROS'),
                  ['fuente' => 'Bookman Old Style', 'tam' => 11, 'negrita' => true,
                   'h' => 'center', 'v' => 'center', 'borde' => 'b']);

        $x->celda($h, 5, 'H', 'DIRECION ',
                  ['fuente' => 'Bookman Old Style', 'tam' => 12, 'negrita' => true,
                   'h' => 'center', 'v' => 'center', 'borde' => 'tblr']);
        $x->celda($h, 5, 'I', (string) ($p['direccion'] ?? ''), $dato);

        $x->celda($h, 6, 'E', 'TEL',
                  ['fuente' => 'Bookman Old Style', 'tam' => 11, 'negrita' => true,
                   'h' => 'center', 'v' => 'center', 'wrap' => true, 'borde' => 'tblr']);
        $x->celda($h, 6, 'F', (string) ($p['telefono'] ?? ''), $centro);

        // G y H van fusionadas: la columna G sola no alcanza para la palabra
        // DOCUMENTO, y en el original solo se leía porque F quedaba vacía.
        $x->celda($h, 6, 'G', 'DOCUMENTO',
                  ['fuente' => 'Bookman Old Style', 'tam' => 11, 'negrita' => true,
                   'h' => 'center', 'v' => 'center', 'borde' => 'blr']);
        $x->fusionar($h, 6, 'G', 6, 'H');
        $x->celda($h, 6, 'I', (string) $p['n_doc'],
                  ['fuente' => 'Century Gothic', 'tam' => 12, 'h' => 'center', 'v' => 'center', 'borde' => 'tblr']);

        $x->celda($h, 7, 'A', null, $caja);
        $x->celda($h, 7, 'B', 'NOMBRE ', $rotulo);
        $x->celda($h, 7, 'C', null, $caja);
        $x->celda($h, 7, 'D', asc_nombre_con_calidad($p),
                  ['fuente' => 'Aptos', 'tam' => 12, 'negrita' => true,
                   'h' => 'center', 'v' => 'center', 'borde' => 'tblr']);

        // El original deja este renglón en 14.25 y el rótulo sale cortado;
        // aquí se le da altura para que las dos líneas quepan dentro del marco.
        $x->alto($h, 8, 26.25);
        $x->celda($h, 8, 'A', 'ENTIDAD PRESTADORA DE SALUD',
                  ['fuente' => 'Calibri', 'tam' => 11, 'negrita' => true,
                   'h' => 'center', 'v' => 'center', 'wrap' => true, 'borde' => 'blr']);
        $x->fusionar($h, 8, 'A', 8, 'C');
        $x->celda($h, 8, 'D', (string) ($p['eps'] ?? ''),
                  ['fuente' => 'Bookman Old Style', 'tam' => 11, 'negrita' => true,
                   'h' => 'left', 'v' => 'center', 'borde' => 'blr']);
        $x->marco($h, 8, 'E', 8, 'H', $caja);

        $x->celda($h, 8, 'I', 'FIRMA DEL USUARIO', $rotulo);
        $x->fusionar($h, 8, 'I', 9, 'I');

        /* --- cabecera de la tabla (dos renglones) ---------------------- */
        $x->celda($h, 9, 'A', 'ITEM', $rotulo);         $x->fusionar($h, 9, 'A', 10, 'A');
        $x->celda($h, 9, 'B', 'FECHA', $rotulo);        $x->fusionar($h, 9, 'B', 10, 'B');
        $x->celda($h, 9, 'C', 'USUARIO', $rotulo);      $x->fusionar($h, 9, 'C', 10, 'D');
        $x->celda($h, 9, 'E', 'N° DOCUMENTO', $rotulo); $x->fusionar($h, 9, 'E', 10, 'E');
        $x->celda($h, 9, 'F', 'CANTIDAD', $rotulo);     $x->fusionar($h, 9, 'F',  9, 'H');

        $chico = ['fuente' => 'Calibri', 'tam' => 8, 'negrita' => true,
                  'h' => 'center', 'v' => 'center', 'borde' => 'tblr'];
        $x->celda($h, 10, 'F', 'DESAYUNO', $chico);
        $x->celda($h, 10, 'G', 'ALMUERZO', $chico);
        $x->celda($h, 10, 'H', 'CENA', $chico);
        $x->celda($h, 10, 'I', null, $caja);

        /* --- filas ----------------------------------------------------- */
        $estFecha = ['fuente' => 'Arial', 'tam' => 11, 'negrita' => true,
                     'h' => 'center', 'v' => 'center', 'wrap' => true,
                     'borde' => 'tblr', 'fmt' => 'fecha'];
        $estDoc   = ['fuente' => 'Century Gothic', 'tam' => 12,
                     'h' => 'center', 'v' => 'center', 'borde' => 'tblr'];

        $fila  = 11;
        $item  = 1;
        $nombre = asc_nombre_con_calidad($p);

        foreach ($filas as $r) {
            // El renglón crece cuando trae firma, para que quepa a buen tamaño.
            $altoFila = !empty($r['firma']) ? ASC_ALTO_FILA_FIRMA : 18.75;
            $x->alto($h, $fila, $altoFila);
            $x->celda($h, $fila, 'A', $item, $centro);
            $x->celda($h, $fila, 'B', $r['fecha'], $estFecha);
            $x->celda($h, $fila, 'C', $nombre, $centro);
            $x->fusionar($h, $fila, 'C', $fila, 'D');
            $x->celda($h, $fila, 'E', (string) $r['n_doc'], $estDoc);
            $x->celda($h, $fila, 'F', asc_cantidad($r['desayuno']), $centro);
            $x->celda($h, $fila, 'G', asc_cantidad($r['almuerzo']), $centro);
            $x->celda($h, $fila, 'H', asc_cantidad($r['cena']), $centro);
            $x->celda($h, $fila, 'I', null, $caja);
            asc_incrustar_firma($x, $h, $fila, 'I', $r['firma'] ?? null,
                                $altoFila, ASC_COL_FIRMA_MINUTA);
            $fila++;
            $item++;
        }

        // Renglones en blanco, como los trae el formato impreso.
        $hasta = max($fila, 11 + ASC_MIN_FILAS);
        for (; $fila < $hasta; $fila++) {
            $x->alto($h, $fila, 18.75);
            $x->marco($h, $fila, 'A', $fila, 'I', $caja);
            $x->fusionar($h, $fila, 'C', $fila, 'D');
        }

        $x->impresion($h, 'landscape', 1);
    }

    return $x->bytes();
}


/* ============================================================================
 *  2. CONSTANCIA DE PRESTACIÓN DE SERVICIO DE ALIMENTACIÓN  (Confort Care)
 * ==========================================================================*/

function asc_formato_constancia(array $registros): string
{
    $x = new Xlsx();
    $h = $x->hoja('Constancias');

    /* --- armar los bloques -------------------------------------------
     *  Un bloque por persona, tipo de comida y calidad en que recibió.
     *  Dentro del bloque, una fila por ración.
     * --------------------------------------------------------------- */
    $bloques = [];
    foreach ($registros as $r) {
        foreach (ASC_COMIDAS as $columna => $etiqueta) {
            $cantidad = (int) ($r[$columna] ?? 0);
            if ($cantidad <= 0) continue;

            $clave = $r['id_usuario'] . '|' . $columna . '|' . ($r['recibe'] ?? 'PACIENTE');

            if (!isset($bloques[$clave])) {
                $bloques[$clave] = [
                    'persona' => $r,
                    'comida'  => $etiqueta,
                    'filas'   => [],
                ];
            }
            // Una fila por ración: cuatro desayunos el mismo día son cuatro
            // renglones con la misma fecha. Todas comparten la misma firma,
            // porque es una sola: la que se tomó al registrar la entrega,
            // y esa única firma valida todas las comidas de ese registro.
            for ($i = 0; $i < $cantidad; $i++) {
                $bloques[$clave]['filas'][] = [
                    'fecha'   => $r['fecha'],
                    'destino' => (string) ($r['destino'] ?? ''),
                    'firma'   => $r['firma'] ?? null,
                ];
            }
        }
    }

    if (!$bloques) {
        $x->celda($h, 1, 'A', 'No hay entregas de Confort Care registradas en el rango de fechas elegido.',
                  ['negrita' => true, 'tam' => 12]);
        $x->ancho($h, 'A', 80);
        return $x->bytes();
    }

    /* --- alturas de fila, iguales para todos los bloques -------------- */
    $x->alto($h, 1, 101.25);
    $x->alto($h, 2,  18.75);
    $x->alto($h, 3,  48.00);
    $x->alto($h, 4,  40.50);
    $x->alto($h, 5,  60.75);

    $filasMax = ASC_MIN_FILAS;
    $hayFirmas = false;
    foreach ($bloques as $b) {
        $filasMax = max($filasMax, count($b['filas']));
        foreach ($b['filas'] as $r) {
            if (!empty($r['firma'])) { $hayFirmas = true; break; }
        }
    }

    // 26 y no 20 como el original: con Arial 16 un destino largo se parte en
    // dos líneas y con el renglón bajo quedaba cortado. Con firmas sube más,
    // para que se vean a buen tamaño. Aquí el alto va por fila y los bloques
    // van uno al lado del otro, así que es el mismo para todos.
    $altoFila = $hayFirmas ? ASC_ALTO_FILA_FIRMA : 26.00;
    for ($f = 6; $f < 6 + $filasMax; $f++) $x->alto($h, $f, $altoFila);

    /* --- estilos ------------------------------------------------------- */
    $base   = ['fuente' => 'Arial', 'tam' => 16, 'negrita' => true, 'borde' => 'tblr'];
    $titulo = $base + ['h' => 'center', 'v' => 'center', 'wrap' => true];
    $codigo = $base + ['v' => 'center', 'wrap' => true];
    $izq    = $base + ['h' => 'left',   'v' => 'center'];
    $cen    = $base + ['h' => 'center', 'v' => 'center', 'wrap' => true];
    $fecha  = $cen  + ['fmt' => 'fecha'];
    $caja   = ['borde' => 'tblr'];

    $col = 1;
    foreach ($bloques as $b) {
        $c0 = $col; $c1 = $col + 1; $c2 = $col + 2; $c3 = $col + 3; $c4 = $col + 4;

        /* anchos — el de DESTINO se ajusta al nombre de IPS más largo del
           bloque, porque en Arial 16 «INSTITUTO NEUMOLOGICO» no cabe en el
           ancho fijo y se montaba sobre la columna de al lado. */
        $largo = 7;
        foreach ($b['filas'] as $r) $largo = max($largo, mb_strlen($r['destino']));
        // El factor 2.2 sale de medir: en Arial 16 negrita un carácter ocupa
        // poco más del doble de la unidad de ancho de columna, que se calcula
        // sobre Calibri 11.
        $anchoDestino = min(60.0, max(30.0, $largo * 2.2));

        $x->ancho($h, $c0, 10.86);
        $x->ancho($h, $c1, 24.57);
        $x->ancho($h, $c2, $anchoDestino);
        $x->ancho($h, $c3, 38.00);
        $x->ancho($h, $c4, ASC_COL_FIRMA_CONSTANCIA);
        $x->ancho($h, $c4 + 1, 10.71);   // separación con el bloque siguiente

        /* fila 1: logo, título y recuadro del código */
        $x->celda($h, 1, $c0, null, $caja);
        $x->fusionar($h, 1, $c0, 1, $c1);
        $x->imagen($h, ASC_LOGO_CONFORT, 1, $c0, 1362075, 561975, 57149, 180000);

        $x->celda($h, 1, $c2, 'CONSTANCIA DE PRESTACIÓN DE SERVICIO DE ALIMENTACIÓN ', $titulo);
        $x->fusionar($h, 1, $c2, 1, $c3);

        $x->celda($h, 1, $c4,
                  "Codigo: CONS-RVAS-005\nFecha de vigencia: 22-03-2024\nVersión: 01", $codigo);

        /* fila 2: separación */
        $x->celda($h, 2, $c0, null);
        $x->fusionar($h, 2, $c0, 2, $c4);

        /* filas 3 y 4: quién recibió */
        $x->celda($h, 3, $c0, 'NOMBRE: ' . asc_nombre_con_calidad($b['persona']), $izq);
        $x->fusionar($h, 3, $c0, 3, $c4);

        $x->celda($h, 4, $c0, 'N° ID: ' . $b['persona']['n_doc'], $izq);
        $x->fusionar($h, 4, $c0, 4, $c4);

        /* fila 5: cabecera de la tabla */
        $x->celda($h, 5, $c0, '  N°  ', $cen);
        $x->celda($h, 5, $c1, 'FECHA', $cen);
        $x->celda($h, 5, $c2, 'DESTINO', $cen);
        $x->celda($h, 5, $c3, 'TIPO DE ALIMENTACION (DESAYUNO /ALMERZO O CENA)', $cen);
        $x->celda($h, 5, $c4, 'FIRMA', $cen);

        /* filas de datos */
        $f = 6;
        $n = 1;
        foreach ($b['filas'] as $r) {
            $x->celda($h, $f, $c0, $n, $cen);
            $x->celda($h, $f, $c1, $r['fecha'], $fecha);
            $x->celda($h, $f, $c2, $r['destino'], $cen);
            $x->celda($h, $f, $c3, $b['comida'], $cen);
            $x->celda($h, $f, $c4, null, $caja);
            asc_incrustar_firma($x, $h, $f, $c4, $r['firma'] ?? null,
                                $altoFila, ASC_COL_FIRMA_CONSTANCIA);
            $f++;
            $n++;
        }

        /* renglones en blanco hasta igualar el bloque más largo */
        for (; $f < 6 + $filasMax; $f++) {
            $x->marco($h, $f, $c0, $f, $c4, $caja);
        }

        $col = $c4 + 2;   // siguiente bloque, dejando la columna de separación
    }

    $x->impresion($h, 'landscape', 0);
    return $x->bytes();
}


/* ============================================================================
 *  Utilidades compartidas
 * ==========================================================================*/

/** Cantidad para la celda: vacía cuando esa comida no se entregó. */
function asc_cantidad($v)
{
    $n = (int) $v;
    return $n > 0 ? $n : null;
}

/** Ancho de columna (en caracteres, como lo mide Excel) llevado a EMU. */
function asc_ancho_emu(float $caracteres): int
{
    // Excel mide el ancho en caracteres de la letra por defecto: son 7
    // píxeles por carácter más 5 de relleno, y cada píxel son 9525 EMU.
    return (int) round((round($caracteres * 7) + 5) * 9525);
}

/** Alto de fila (en puntos) llevado a EMU. */
function asc_alto_emu(float $puntos): int
{
    return (int) round($puntos * 12700);
}

/**
 * Incrusta la firma (PNG) en la celda donde antes se dejaba el espacio en
 * blanco para firmar a mano, ocupando buena parte de ella y centrada.
 *
 * Llena el alto del renglón y calcula el ancho con las proporciones reales
 * de la imagen. Si la firma es muy alargada se encaja por el ancho para no
 * invadir la columna de al lado; si es compacta (un garabato casi cuadrado)
 * se ensancha —hasta el doble— para que no quede perdida en una celda que
 * es mucho más ancha que alta.
 */
function asc_incrustar_firma(Xlsx $x, int $hoja, int $fila, $col, ?string $firma,
                             float $altoFilaPt, float $anchoColumna): void
{
    if (!$firma) return;   // entregas viejas, o de cuando aún se firmaba en papel

    $wh = asc_formato_dimensiones_png($firma);
    if (!$wh) return;
    [$anchoPx, $altoPx] = $wh;

    $celdaAncho = asc_ancho_emu($anchoColumna);
    $celdaAlto  = asc_alto_emu($altoFilaPt);

    $alto  = (int) round($celdaAlto * 0.86);
    $ancho = (int) round($alto * ($anchoPx / $altoPx));

    $anchoMax = (int) round($celdaAncho * 0.92);
    $anchoMin = (int) round($celdaAncho * 0.45);

    if ($ancho > $anchoMax) {
        $ancho = $anchoMax;
        $alto  = (int) round($ancho * ($altoPx / $anchoPx));
    } elseif ($ancho < $anchoMin) {
        $ancho = (int) min($anchoMin, $ancho * 2);
    }

    $x->imagenDatos($hoja, $firma, 'png', $fila, $col, $ancho, $alto,
                    (int) round(max(0, $celdaAncho - $ancho) / 2),
                    (int) round(max(0, $celdaAlto  - $alto)  / 2));
}

/**
 * Coloca un logo dentro de una celda sin que se salga: se reduce hasta
 * caber entero, respetando sus proporciones, y queda centrado en la caja.
 */
function asc_logo_en_caja(Xlsx $x, int $hoja, string $ruta, int $fila, $col,
                          int $celdaAncho, int $celdaAlto, float $margen = 0.08): void
{
    if (!is_file($ruta)) return;

    $wh = asc_formato_dimensiones_png((string) file_get_contents($ruta));
    if (!$wh) return;
    [$anchoPx, $altoPx] = $wh;

    $cabeAncho = $celdaAncho * (1 - $margen);
    $cabeAlto  = $celdaAlto  * (1 - $margen);

    // Se toma la reducción más exigente de las dos: así entra por completo.
    $escala = min($cabeAncho / ($anchoPx * 9525), $cabeAlto / ($altoPx * 9525));

    $ancho = (int) round($anchoPx * 9525 * $escala);
    $alto  = (int) round($altoPx  * 9525 * $escala);

    $x->imagen($hoja, $ruta, $fila, $col, $ancho, $alto,
               (int) round(max(0, $celdaAncho - $ancho) / 2),
               (int) round(max(0, $celdaAlto  - $alto)  / 2));
}

/** Ancho y alto en píxeles de un PNG, leyendo el bloque IHDR. */
function asc_formato_dimensiones_png(string $datos): ?array
{
    if (strlen($datos) < 24 || substr($datos, 12, 4) !== 'IHDR') return null;

    $ancho = unpack('N', substr($datos, 16, 4))[1] ?? 0;
    $alto  = unpack('N', substr($datos, 20, 4))[1] ?? 0;

    return ($ancho > 0 && $alto > 0) ? [$ancho, $alto] : null;
}

/**
 * El nombre tal como lo piden los dos formatos: en mayúsculas, y con
 * «(ACOMPAÑANTE)» detrás cuando quien recibió no era el paciente.
 */
function asc_nombre_con_calidad(array $r): string
{
    $nombre = mb_strtoupper(trim((string) ($r['nombre_usuario'] ?? '')), 'UTF-8');
    if (($r['recibe'] ?? 'PACIENTE') === 'ACOMPANANTE') {
        $nombre .= ' (ACOMPAÑANTE)';
    }
    return $nombre;
}

/** Nombre de hoja: Excel no admite más de 31 caracteres. */
function asc_nombre_corto(string $nombre): string
{
    $nombre = mb_strtoupper(trim($nombre), 'UTF-8');
    if ($nombre === '') return 'Sin nombre';
    if (mb_strlen($nombre) <= 31) return $nombre;

    // Se recorta por palabras para que siga siendo reconocible.
    $partes = preg_split('/\s+/u', $nombre) ?: [];
    $corto  = array_shift($partes) ?? '';
    foreach ($partes as $p) {
        if (mb_strlen($corto . ' ' . $p) > 31) break;
        $corto .= ' ' . $p;
    }
    return mb_substr($corto !== '' ? $corto : $nombre, 0, 31);
}
