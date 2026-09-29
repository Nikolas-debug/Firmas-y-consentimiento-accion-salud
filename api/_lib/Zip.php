<?php

declare(strict_types=1);

final class Zip
{
    /** @var array<int,array<string,mixed>> */
    private array $entradas = [];
    private string $cuerpo  = '';
    private int    $momento;

    public function __construct(?int $momento = null)
    {
        $this->momento = $momento ?? time();
    }

    public function agregar(string $nombre, string $contenido): void
    {
        $nombre = str_replace('\\', '/', $nombre);
        $crc    = crc32($contenido);
        $crudo  = strlen($contenido);

        $metodo     = 0;
        $comprimido = $contenido;

        if ($crudo > 0 && function_exists('gzdeflate')) {
            $intento = @gzdeflate($contenido, 6);
            if ($intento !== false && strlen($intento) < $crudo) {
                $metodo     = 8;
                $comprimido = $intento;
            }
        }

        $desplazamiento = strlen($this->cuerpo);

        $this->cuerpo .= pack('V', 0x04034b50)       // firma
                      .  pack('v', 20)               // versión necesaria
                      .  pack('v', 0)                // banderas
                      .  pack('v', $metodo)
                      .  pack('v', $this->hora())
                      .  pack('v', $this->dia())
                      .  pack('V', $crc)
                      .  pack('V', strlen($comprimido))
                      .  pack('V', $crudo)
                      .  pack('v', strlen($nombre))
                      .  pack('v', 0)                // extra
                      .  $nombre
                      .  $comprimido;

        $this->entradas[] = [
            'nombre'         => $nombre,
            'metodo'         => $metodo,
            'crc'            => $crc,
            'comprimido'     => strlen($comprimido),
            'crudo'          => $crudo,
            'desplazamiento' => $desplazamiento,
        ];
    }

    public function bytes(): string
    {
        $central = '';
        foreach ($this->entradas as $e) {
            $central .= pack('V', 0x02014b50)        // firma
                     .  pack('v', 0x031e)            // creado en
                     .  pack('v', 20)                // versión necesaria
                     .  pack('v', 0)                 // banderas
                     .  pack('v', $e['metodo'])
                     .  pack('v', $this->hora())
                     .  pack('v', $this->dia())
                     .  pack('V', $e['crc'])
                     .  pack('V', $e['comprimido'])
                     .  pack('V', $e['crudo'])
                     .  pack('v', strlen($e['nombre']))
                     .  pack('v', 0)                 // extra
                     .  pack('v', 0)                 // comentario
                     .  pack('v', 0)                 // disco
                     .  pack('v', 0)                 // atributos internos
                     .  pack('V', 0x81a40000)        // atributos externos (rw-r--r--)
                     .  pack('V', $e['desplazamiento'])
                     .  $e['nombre'];
        }

        $fin = pack('V', 0x06054b50)
             . pack('v', 0)
             . pack('v', 0)
             . pack('v', count($this->entradas))
             . pack('v', count($this->entradas))
             . pack('V', strlen($central))
             . pack('V', strlen($this->cuerpo))
             . pack('v', 0);

        return $this->cuerpo . $central . $fin;
    }

    /* --- fecha y hora en el formato de MS-DOS que pide el zip ----------- */

    private function hora(): int
    {
        $t = getdate($this->momento);
        return ($t['hours'] << 11) | ($t['minutes'] << 5) | ((int) ($t['seconds'] / 2));
    }

    private function dia(): int
    {
        $t   = getdate($this->momento);
        $ano = max(1980, $t['year']) - 1980;
        return ($ano << 9) | ($t['mon'] << 5) | $t['mday'];
    }
}
