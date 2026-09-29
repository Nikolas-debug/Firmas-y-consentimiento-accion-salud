<?php
/* ============================================================================
 *  Xlsx.php — escritor de libros de Excel (.xlsx) sin dependencias.
 *
 *  Cubre exactamente lo que piden los dos formatos de alimentación: celdas de
 *  texto, número y fecha, tipo de letra por celda, negrita, alineación,
 *  ajuste de texto, bordes, celdas fusionadas, ancho de columna, alto de fila
 *  e imágenes (el logo). Nada más, a propósito.
 *
 *  Uso:
 *      $x = new Xlsx();
 *      $h = $x->hoja('Julio');
 *      $x->ancho($h, 'A', 12.5);
 *      $x->alto($h, 1, 26.25);
 *      $x->celda($h, 1, 'A', 'NOMBRE', ['negrita' => true, 'borde' => 'tblr']);
 *      $x->fusionar($h, 1, 'A', 1, 'C');
 *      $x->imagen($h, '/ruta/logo.png', 1, 'A', 1362075, 561975);
 *      file_put_contents('salida.xlsx', $x->bytes());
 *
 *  Las columnas se nombran con letra ('A', 'AB') o con número base 1.
 * ========================================================================== */

declare(strict_types=1);

require_once __DIR__ . '/Zip.php';

final class Xlsx
{
    /** Formatos de número propios. El 164 es el primero libre. */
    private const FORMATOS = [
        'fecha' => ['id' => 164, 'codigo' => 'dd/mm/yyyy'],
        'texto' => ['id' => 165, 'codigo' => '@'],
    ];

    /** @var array<int,array<string,mixed>> */
    private array $hojas = [];

    /** @var array<string,int> firma del tipo de letra -> índice */
    private array $fuentes = [];
    /** @var array<int,array<string,mixed>> */
    private array $listaFuentes = [];

    /** @var array<string,int> */
    private array $bordes = ['' => 0];
    /** @var array<int,string> */
    private array $listaBordes = [''];

    /** @var array<string,int> */
    private array $estilos = [];
    /** @var array<int,array<string,mixed>> */
    private array $listaEstilos = [];

    /** @var array<string,array{nombre:string,tipo:string,datos:string}> */
    private array $medios = [];

    public function __construct()
    {
        // El estilo 0 es el de Excel por defecto y debe existir.
        $this->idEstilo([]);
    }

    /* ====================================================================
     *  Hojas
     * ================================================================== */

    public function hoja(string $nombre): int
    {
        $this->hojas[] = [
            'nombre'    => $this->nombreHoja($nombre),
            'celdas'    => [],   // [fila][col] => ['v','t','s']
            'fusiones'  => [],
            'anchos'    => [],   // col => ancho
            'altos'     => [],   // fila => alto
            'imagenes'  => [],
            'ajuste'    => null, // configuración de impresión
        ];
        return count($this->hojas) - 1;
    }

    /** Orientación y ajuste a lo ancho de la página al imprimir. */
    public function impresion(int $hoja, string $orientacion = 'portrait', int $anchoPaginas = 1): void
    {
        $this->hojas[$hoja]['ajuste'] = [
            'orientacion' => $orientacion === 'landscape' ? 'landscape' : 'portrait',
            'ancho'       => max(1, $anchoPaginas),
        ];
    }

    /* ====================================================================
     *  Contenido
     * ================================================================== */

    /**
     * @param string|int|float|null $valor  Texto, número, o 'YYYY-MM-DD' con
     *                                      ['fmt' => 'fecha'] en el estilo.
     */
    public function celda(int $hoja, int $fila, $col, $valor, array $estilo = []): void
    {
        $c = $this->numeroCol($col);
        $s = $this->idEstilo($estilo);

        if ($valor === null || $valor === '') {
            // Celda vacía con borde: hay que escribirla para que el marco salga.
            $this->hojas[$hoja]['celdas'][$fila][$c] = ['v' => null, 't' => '', 's' => $s];
            return;
        }

        if (($estilo['fmt'] ?? '') === 'fecha') {
            $serie = $this->serieFecha((string) $valor);
            if ($serie !== null) {
                $this->hojas[$hoja]['celdas'][$fila][$c] = ['v' => (string) $serie, 't' => 'n', 's' => $s];
                return;
            }
            // Fecha ilegible: se escribe tal cual, mejor eso que perderla.
        }

        if (is_int($valor) || is_float($valor)) {
            $this->hojas[$hoja]['celdas'][$fila][$c] = ['v' => (string) $valor, 't' => 'n', 's' => $s];
            return;
        }

        $this->hojas[$hoja]['celdas'][$fila][$c] = ['v' => (string) $valor, 't' => 's', 's' => $s];
    }

    public function fusionar(int $hoja, int $f1, $c1, int $f2, $c2): void
    {
        $a = $this->numeroCol($c1);
        $b = $this->numeroCol($c2);

        // Excel/LibreOffice arman el marco de una celda fusionada tomando el
        // borde superior e izquierdo de la celda ancla (arriba-izquierda),
        // pero el inferior y el derecho los toman de la celda opuesta
        // (abajo-derecha) del rango. Si esa celda opuesta queda sin escribir
        // —el caso normal, porque solo se estiliza la ancla antes de
        // fusionar— el marco se ve sin lado de abajo ni de la derecha. Se
        // empareja el borde ahí para que la celda fusionada salga completa.
        if (($f1 !== $f2 || $a !== $b) && isset($this->hojas[$hoja]['celdas'][$f1][$a])) {
            $ancla       = $this->hojas[$hoja]['celdas'][$f1][$a];
            $estiloAncla = $this->listaEstilos[$ancla['s']] ?? null;
            $lados       = $estiloAncla ? ($this->listaBordes[$estiloAncla['borde']] ?? '') : '';

            if ($lados !== '' && !isset($this->hojas[$hoja]['celdas'][$f2][$b])) {
                $this->celda($hoja, $f2, $b, null, ['borde' => $lados]);
            }
        }

        $this->hojas[$hoja]['fusiones'][] =
            $this->letraCol($a) . $f1 . ':' .
            $this->letraCol($b) . $f2;
    }

    public function ancho(int $hoja, $col, float $ancho): void
    {
        $this->hojas[$hoja]['anchos'][$this->numeroCol($col)] = $ancho;
    }

    public function alto(int $hoja, int $fila, float $alto): void
    {
        $this->hojas[$hoja]['altos'][$fila] = $alto;
    }

    /** Ancho y alto en EMU (1 pulgada = 914400). */
    public function imagen(int $hoja, string $ruta, int $fila, $col, int $ancho, int $alto,
                           int $margenX = 57150, int $margenY = 28575): void
    {
        if (!is_file($ruta)) return;

        $ext  = strtolower(pathinfo($ruta, PATHINFO_EXTENSION));
        $tipo = ($ext === 'png') ? 'png' : (($ext === 'gif') ? 'gif' : 'jpeg');

        $datos = file_get_contents($ruta);
        if ($datos === false) return;

        $this->imagenDatos($hoja, $datos, $tipo, $fila, $col, $ancho, $alto, $margenX, $margenY);
    }

    /**
     * Igual que imagen(), pero a partir de los bytes ya en memoria (por
     * ejemplo una firma que viene de un BLOB), sin pasar por el disco.
     */
    public function imagenDatos(int $hoja, string $datos, string $tipo, int $fila, $col,
                                int $ancho, int $alto, int $margenX = 57150, int $margenY = 28575): void
    {
        if ($datos === '') return;
        $tipo  = ($tipo === 'png') ? 'png' : (($tipo === 'gif') ? 'gif' : 'jpeg');
        $clave = md5($datos) . '.' . $tipo;

        if (!isset($this->medios[$clave])) {
            $this->medios[$clave] = [
                'nombre' => 'imagen' . (count($this->medios) + 1) . '.' . $tipo,
                'tipo'   => $tipo,
                'datos'  => $datos,
            ];
        }

        $this->hojas[$hoja]['imagenes'][] = [
            'clave'   => $clave,
            'fila'    => $fila - 1,                       // el dibujo cuenta desde 0
            'col'     => $this->numeroCol($col) - 1,
            'ancho'   => $ancho,
            'alto'    => $alto,
            'margenX' => $margenX,
            'margenY' => $margenY,
        ];
    }

    /* ====================================================================
     *  Atajos que usan las dos plantillas
     * ================================================================== */

    /** Escribe una fila completa a partir de una columna. */
    public function fila(int $hoja, int $fila, $colInicio, array $valores, array $estilo = []): void
    {
        $c = $this->numeroCol($colInicio);
        foreach ($valores as $i => $v) {
            $this->celda($hoja, $fila, $c + $i, $v, $estilo);
        }
    }

    /** Marco vacío: útil para dejar renglones en blanco listos para firmar. */
    public function marco(int $hoja, int $f1, $c1, int $f2, $c2, array $estilo = []): void
    {
        $a = $this->numeroCol($c1);
        $b = $this->numeroCol($c2);
        for ($f = $f1; $f <= $f2; $f++) {
            for ($c = $a; $c <= $b; $c++) {
                if (!isset($this->hojas[$hoja]['celdas'][$f][$c])) {
                    $this->celda($hoja, $f, $c, null, $estilo);
                }
            }
        }
    }

    /* ====================================================================
     *  Salida
     * ================================================================== */

    public function bytes(): string
    {
        if (!$this->hojas) $this->hoja('Hoja1');

        $zip = new Zip();

        $zip->agregar('[Content_Types].xml', $this->xmlTipos());
        $zip->agregar('_rels/.rels', $this->xmlRelsRaiz());
        $zip->agregar('xl/workbook.xml', $this->xmlLibro());
        $zip->agregar('xl/_rels/workbook.xml.rels', $this->xmlRelsLibro());

        foreach ($this->hojas as $i => $h) {
            $n = $i + 1;
            $zip->agregar("xl/worksheets/sheet{$n}.xml", $this->xmlHoja($i));
            if ($h['imagenes']) {
                $zip->agregar("xl/worksheets/_rels/sheet{$n}.xml.rels", $this->xmlRelsHoja($n));
                $zip->agregar("xl/drawings/drawing{$n}.xml", $this->xmlDibujo($i));
                $zip->agregar("xl/drawings/_rels/drawing{$n}.xml.rels", $this->xmlRelsDibujo($i));
            }
        }

        // styles.xml va al final: recién ahí están registrados todos los estilos.
        $zip->agregar('xl/styles.xml', $this->xmlEstilos());

        foreach ($this->medios as $m) {
            $zip->agregar('xl/media/' . $m['nombre'], $m['datos']);
        }

        return $zip->bytes();
    }

    /* ====================================================================
     *  Estilos
     * ================================================================== */

    private function idFuente(array $e): int
    {
        $f = [
            'nombre'  => (string) ($e['fuente'] ?? 'Calibri'),
            'tam'     => (float)  ($e['tam'] ?? 11),
            'negrita' => (bool)   ($e['negrita'] ?? false),
            'cursiva' => (bool)   ($e['cursiva'] ?? false),
        ];
        $clave = $f['nombre'] . '|' . $f['tam'] . '|' . (int) $f['negrita'] . '|' . (int) $f['cursiva'];

        if (!isset($this->fuentes[$clave])) {
            $this->fuentes[$clave]  = count($this->listaFuentes);
            $this->listaFuentes[]   = $f;
        }
        return $this->fuentes[$clave];
    }

    private function idBorde(string $lados): int
    {
        // Se normaliza para que 'lrtb' y 'tblr' sean el mismo borde.
        $n = '';
        foreach (['t', 'b', 'l', 'r'] as $x) {
            if (strpos($lados, $x) !== false) $n .= $x;
        }
        if (!isset($this->bordes[$n])) {
            $this->bordes[$n]    = count($this->listaBordes);
            $this->listaBordes[] = $n;
        }
        return $this->bordes[$n];
    }

    private function idEstilo(array $e): int
    {
        $d = [
            'fuente' => $this->idFuente($e),
            'borde'  => $this->idBorde((string) ($e['borde'] ?? '')),
            'h'      => (string) ($e['h'] ?? ''),
            'v'      => (string) ($e['v'] ?? ''),
            'wrap'   => (bool)   ($e['wrap'] ?? false),
            'fmt'    => (string) ($e['fmt'] ?? ''),
        ];
        $clave = implode('|', [$d['fuente'], $d['borde'], $d['h'], $d['v'], (int) $d['wrap'], $d['fmt']]);

        if (!isset($this->estilos[$clave])) {
            $this->estilos[$clave] = count($this->listaEstilos);
            $this->listaEstilos[]  = $d;
        }
        return $this->estilos[$clave];
    }

    private function xmlEstilos(): string
    {
        $numFmts = '';
        foreach (self::FORMATOS as $f) {
            $numFmts .= '<numFmt numFmtId="' . $f['id'] . '" formatCode="' . $this->esc($f['codigo']) . '"/>';
        }

        $fuentes = '';
        foreach ($this->listaFuentes as $f) {
            $fuentes .= '<font>'
                . ($f['negrita'] ? '<b/>' : '')
                . ($f['cursiva'] ? '<i/>' : '')
                . '<sz val="' . $this->num($f['tam']) . '"/>'
                . '<color theme="1"/>'
                . '<name val="' . $this->esc($f['nombre']) . '"/>'
                . '<family val="2"/>'
                . '</font>';
        }

        $bordes = '';
        foreach ($this->listaBordes as $b) {
            $lado = function (string $x) use ($b): string {
                $etq = ['l' => 'left', 'r' => 'right', 't' => 'top', 'b' => 'bottom'][$x];
                return strpos($b, $x) !== false
                    ? "<{$etq} style=\"thin\"><color indexed=\"64\"/></{$etq}>"
                    : "<{$etq}/>";
            };
            $bordes .= '<border>' . $lado('l') . $lado('r') . $lado('t') . $lado('b') . '<diagonal/></border>';
        }

        $xfs = '';
        foreach ($this->listaEstilos as $d) {
            $numFmtId = $d['fmt'] !== '' && isset(self::FORMATOS[$d['fmt']])
                ? self::FORMATOS[$d['fmt']]['id'] : 0;

            $alin = '';
            if ($d['h'] !== '' || $d['v'] !== '' || $d['wrap']) {
                $alin = '<alignment'
                      . ($d['h'] !== '' ? ' horizontal="' . $d['h'] . '"' : '')
                      . ($d['v'] !== '' ? ' vertical="' . $d['v'] . '"' : '')
                      . ($d['wrap'] ? ' wrapText="1"' : '')
                      . '/>';
            }

            $xfs .= '<xf numFmtId="' . $numFmtId . '" fontId="' . $d['fuente'] . '"'
                  . ' fillId="0" borderId="' . $d['borde'] . '" xfId="0"'
                  . ' applyFont="1"'
                  . ($numFmtId ? ' applyNumberFormat="1"' : '')
                  . ($d['borde'] ? ' applyBorder="1"' : '')
                  . ($alin ? ' applyAlignment="1"' : '')
                  . ($alin ? '>' . $alin . '</xf>' : '/>');
        }

        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            . '<numFmts count="' . count(self::FORMATOS) . '">' . $numFmts . '</numFmts>'
            . '<fonts count="' . count($this->listaFuentes) . '">' . $fuentes . '</fonts>'
            . '<fills count="2">'
            .   '<fill><patternFill patternType="none"/></fill>'
            .   '<fill><patternFill patternType="gray125"/></fill>'
            . '</fills>'
            . '<borders count="' . count($this->listaBordes) . '">' . $bordes . '</borders>'
            . '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
            . '<cellXfs count="' . count($this->listaEstilos) . '">' . $xfs . '</cellXfs>'
            . '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
            . '<dxfs count="0"/>'
            . '</styleSheet>';
    }

    /* ====================================================================
     *  Partes del paquete
     * ================================================================== */

    private function xmlTipos(): string
    {
        $x = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
           . '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
           . '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
           . '<Default Extension="xml" ContentType="application/xml"/>';

        $extensiones = [];
        foreach ($this->medios as $m) $extensiones[$m['tipo']] = true;
        foreach (array_keys($extensiones) as $ext) {
            $x .= '<Default Extension="' . $ext . '" ContentType="image/' . $ext . '"/>';
        }

        $x .= '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
            . '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>';

        foreach ($this->hojas as $i => $h) {
            $n = $i + 1;
            $x .= '<Override PartName="/xl/worksheets/sheet' . $n . '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
            if ($h['imagenes']) {
                $x .= '<Override PartName="/xl/drawings/drawing' . $n . '.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>';
            }
        }

        return $x . '</Types>';
    }

    private function xmlRelsRaiz(): string
    {
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            . '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
            . '</Relationships>';
    }

    private function xmlLibro(): string
    {
        $hojas = '';
        foreach ($this->hojas as $i => $h) {
            $hojas .= '<sheet name="' . $this->esc($h['nombre']) . '" sheetId="' . ($i + 1) . '" r:id="rId' . ($i + 1) . '"/>';
        }
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
            . ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            . '<sheets>' . $hojas . '</sheets>'
            . '</workbook>';
    }

    private function xmlRelsLibro(): string
    {
        $r = '';
        $n = count($this->hojas);
        foreach ($this->hojas as $i => $h) {
            $r .= '<Relationship Id="rId' . ($i + 1) . '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' . ($i + 1) . '.xml"/>';
        }
        $r .= '<Relationship Id="rId' . ($n + 1) . '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>';

        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            . $r . '</Relationships>';
    }

    private function xmlHoja(int $i): string
    {
        $h = $this->hojas[$i];

        /* columnas */
        $cols = '';
        if ($h['anchos']) {
            ksort($h['anchos']);
            foreach ($h['anchos'] as $c => $w) {
                $cols .= '<col min="' . $c . '" max="' . $c . '" width="' . $this->num($w) . '" customWidth="1"/>';
            }
            $cols = '<cols>' . $cols . '</cols>';
        }

        /* filas y celdas
         *
         * Se recorren tanto las filas con celdas como las que solo tienen
         * alto. Una fila fusionada con la de arriba no escribe celdas
         * propias, y si no se emitiera su <row> perdería el alto pedido:
         * Excel le pondría el alto por defecto y el bloque quedaría más
         * bajo de lo previsto (por ejemplo el recuadro del logo). */
        $filas   = '';
        $numeros = array_keys($h['celdas'] + $h['altos']);
        sort($numeros, SORT_NUMERIC);

        foreach ($numeros as $f) {
            $celdas = $h['celdas'][$f] ?? [];
            ksort($celdas, SORT_NUMERIC);

            $cuerpo = '';
            foreach ($celdas as $c => $d) {
                $ref = $this->letraCol($c) . $f;
                if ($d['v'] === null) {
                    $cuerpo .= '<c r="' . $ref . '" s="' . $d['s'] . '"/>';
                } elseif ($d['t'] === 'n') {
                    $cuerpo .= '<c r="' . $ref . '" s="' . $d['s'] . '"><v>' . $d['v'] . '</v></c>';
                } else {
                    $cuerpo .= '<c r="' . $ref . '" s="' . $d['s'] . '" t="inlineStr">'
                             . '<is><t xml:space="preserve">' . $this->esc($d['v']) . '</t></is></c>';
                }
            }

            $alto = isset($h['altos'][$f])
                ? ' ht="' . $this->num($h['altos'][$f]) . '" customHeight="1"' : '';

            $filas .= '<row r="' . $f . '"' . $alto . '>' . $cuerpo . '</row>';
        }

        /* fusiones */
        $fus = '';
        if ($h['fusiones']) {
            foreach ($h['fusiones'] as $m) $fus .= '<mergeCell ref="' . $m . '"/>';
            $fus = '<mergeCells count="' . count($h['fusiones']) . '">' . $fus . '</mergeCells>';
        }

        /* impresión */
        $imp = '';
        $ajuste = '';
        if ($h['ajuste']) {
            $ajuste = '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>';
            $imp = '<pageMargins left="0.3" right="0.3" top="0.4" bottom="0.4" header="0.2" footer="0.2"/>'
                 . '<pageSetup orientation="' . $h['ajuste']['orientacion'] . '"'
                 . ' fitToWidth="' . $h['ajuste']['ancho'] . '" fitToHeight="0" paperSize="9"/>';
        }

        $dibujo = $h['imagenes'] ? '<drawing r:id="rId1"/>' : '';

        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
            . ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            . $ajuste
            . '<sheetViews><sheetView workbookViewId="0"/></sheetViews>'
            . '<sheetFormatPr defaultRowHeight="15"/>'
            . $cols
            . '<sheetData>' . $filas . '</sheetData>'
            . $fus
            . $imp
            . $dibujo
            . '</worksheet>';
    }

    private function xmlRelsHoja(int $n): string
    {
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            . '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing' . $n . '.xml"/>'
            . '</Relationships>';
    }

    private function xmlDibujo(int $i): string
    {
        $x = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
           . '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"'
           . ' xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"'
           . ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">';

        foreach ($this->hojas[$i]['imagenes'] as $k => $img) {
            $id = $k + 2;
            $x .= '<xdr:oneCellAnchor>'
                . '<xdr:from>'
                .   '<xdr:col>' . $img['col'] . '</xdr:col><xdr:colOff>' . $img['margenX'] . '</xdr:colOff>'
                .   '<xdr:row>' . $img['fila'] . '</xdr:row><xdr:rowOff>' . $img['margenY'] . '</xdr:rowOff>'
                . '</xdr:from>'
                . '<xdr:ext cx="' . $img['ancho'] . '" cy="' . $img['alto'] . '"/>'
                . '<xdr:pic>'
                .   '<xdr:nvPicPr>'
                .     '<xdr:cNvPr id="' . $id . '" name="Imagen ' . $id . '"/>'
                .     '<xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr>'
                .   '</xdr:nvPicPr>'
                .   '<xdr:blipFill>'
                .     '<a:blip r:embed="rId' . ($k + 1) . '"/>'
                .     '<a:stretch><a:fillRect/></a:stretch>'
                .   '</xdr:blipFill>'
                .   '<xdr:spPr>'
                .     '<a:xfrm><a:off x="0" y="0"/><a:ext cx="' . $img['ancho'] . '" cy="' . $img['alto'] . '"/></a:xfrm>'
                .     '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>'
                .   '</xdr:spPr>'
                . '</xdr:pic>'
                . '<xdr:clientData/>'
                . '</xdr:oneCellAnchor>';
        }

        return $x . '</xdr:wsDr>';
    }

    private function xmlRelsDibujo(int $i): string
    {
        $r = '';
        foreach ($this->hojas[$i]['imagenes'] as $k => $img) {
            $nombre = $this->medios[$img['clave']]['nombre'];
            $r .= '<Relationship Id="rId' . ($k + 1) . '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/' . $nombre . '"/>';
        }
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            . $r . '</Relationships>';
    }

    /* ====================================================================
     *  Utilidades
     * ================================================================== */

    /** @param string|int $col */
    public function numeroCol($col): int
    {
        if (is_int($col)) return $col;
        if (ctype_digit((string) $col)) return (int) $col;

        $n = 0;
        foreach (str_split(strtoupper((string) $col)) as $ch) {
            $n = $n * 26 + (ord($ch) - 64);
        }
        return $n;
    }

    public function letraCol(int $n): string
    {
        $s = '';
        while ($n > 0) {
            $r = ($n - 1) % 26;
            $s = chr(65 + $r) . $s;
            $n = (int) (($n - $r - 1) / 26);
        }
        return $s === '' ? 'A' : $s;
    }

    /** Días desde el 30-12-1899, que es el cero de Excel. */
    private function serieFecha(string $iso): ?int
    {
        if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})/', $iso, $m)) return null;
        $dias = gregoriantojd((int) $m[2], (int) $m[3], (int) $m[1]) - gregoriantojd(12, 30, 1899);
        return $dias > 0 ? $dias : null;
    }

    private function esc(string $s): string
    {
        // Se quitan los caracteres de control que el XML no admite; el salto
        // de línea sí se conserva porque los formatos lo usan.
        $s = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F]/u', '', $s) ?? '';
        $s = htmlspecialchars($s, ENT_QUOTES | ENT_XML1, 'UTF-8');
        return str_replace("\n", '&#10;', $s);
    }

    private function num(float $n): string
    {
        return rtrim(rtrim(number_format($n, 4, '.', ''), '0'), '.') ?: '0';
    }

    /** Excel no admite : \ / ? * [ ] en el nombre de la hoja, ni más de 31 caracteres. */
    private function nombreHoja(string $n): string
    {
        $n = str_replace([':', '\\', '/', '?', '*', '[', ']'], ' ', $n);
        $n = trim(preg_replace('/\s+/u', ' ', $n) ?? '');
        $n = mb_substr($n, 0, 31);

        if ($n === '') $n = 'Hoja';

        // Excel tampoco admite dos hojas con el mismo nombre.
        $usados = array_map(fn($h) => mb_strtolower($h['nombre']), $this->hojas);
        if (!in_array(mb_strtolower($n), $usados, true)) return $n;

        for ($i = 2; $i < 1000; $i++) {
            $sufijo = ' (' . $i . ')';
            $x = mb_substr($n, 0, 31 - mb_strlen($sufijo)) . $sufijo;
            if (!in_array(mb_strtolower($x), $usados, true)) return $x;
        }
        return mb_substr($n, 0, 27) . ' ' . random_int(100, 999);
    }
}
