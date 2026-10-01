<?php

declare(strict_types=1);

define('ASC_ENTRADA', true);
require __DIR__ . '/api/_lib/bootstrap.php';

$cfg = asc_cargar_config();
asc_sesion($cfg);

$entro   = asc_hay_sesion();
$quien   = $_SESSION['asc_usuario_reportes'] ?? '';
$minutos = (int) ($cfg['sesion_minutos'] ?? 60);

header('Cache-Control: no-store, no-cache, must-revalidate');
header('X-Frame-Options: DENY');
header('Referrer-Policy: same-origin');
?>
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="robots" content="noindex, nofollow"/>
<title>Reportes de transporte — Unidad San Felipe</title>
<link rel="icon" href="images/favicon.ico"/>
<style>
:root{
  --primary:#5ec5cc; --primary-dark:#0b565b;
  --bg:#f9f9ff; --surface:#fff; --surface-2:#f2f3fc;
  --border:#c2c6d4; --border-strong:#9aa0b0;
  --text:#191c21; --muted:#6c757d; --label:#424752;
  --error:#ba1a1a; --error-bg:#ffdad6;
  --ok:#0f7a3d; --ok-bg:#daf5e3;
  --radius:8px;
}
*,*::before,*::after{box-sizing:border-box}
body{
  margin:0; background:var(--bg); color:var(--text);
  font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,
       "Helvetica Neue",Arial,"Noto Sans",sans-serif;
}
.oculto{display:none !important}

.wrap{max-width:1200px;margin:0 auto;padding:40px 24px}
.wrap--angosto{max-width:440px}

h1{font-size:30px;line-height:1.25;font-weight:700;color:var(--primary);margin:0 0 6px;letter-spacing:-.01em}
h2{font-size:19px;font-weight:700;margin:0 0 4px}
.lead{color:var(--muted);margin:0 0 32px}

.barra{
  display:flex;align-items:center;justify-content:space-between;gap:16px;
  flex-wrap:wrap;margin-bottom:28px;
}
.quien{font-size:14px;color:var(--muted)}
.quien b{color:var(--label)}

.tarjeta{
  background:var(--surface);border:1px solid var(--border);
  border-radius:var(--radius);padding:24px;margin-bottom:24px;
}

.campos{display:grid;gap:18px;grid-template-columns:repeat(auto-fit,minmax(190px,1fr))}
.campo{display:flex;flex-direction:column;gap:6px}
label{font-size:14px;font-weight:600;color:var(--label)}
input,select{
  width:100%;padding:11px 12px;font:inherit;font-size:15px;color:var(--text);
  background:var(--surface);border:1px solid var(--border-strong);
  border-radius:var(--radius);
}
input:focus,select:focus{outline:2px solid var(--primary);outline-offset:1px;border-color:var(--primary)}
.pista{font-size:13px;color:var(--muted)}

.botones{display:flex;gap:12px;flex-wrap:wrap;margin-top:22px}
button{
  font:inherit;font-size:15px;font-weight:600;padding:12px 22px;
  border-radius:var(--radius);border:1px solid transparent;cursor:pointer;
}
button:disabled{opacity:.55;cursor:default}
.btn{background:var(--primary);color:#06373a}
.btn:hover:not(:disabled){background:var(--primary-dark);color:#fff}
.btn-2{background:var(--surface);color:var(--label);border-color:var(--border-strong)}
.btn-2:hover:not(:disabled){background:var(--surface-2)}
.btn-link{background:none;border:none;color:var(--primary-dark);text-decoration:underline;padding:6px 0;font-weight:600}

.aviso{padding:13px 16px;border-radius:var(--radius);margin:18px 0 0;font-size:15px}
.aviso--mal{background:var(--error-bg);color:#410002;border:1px solid #f4b8b1}
.aviso--bien{background:var(--ok-bg);color:#05321a;border:1px solid #a9dfc0}

.totales{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));margin-bottom:20px}
.total{background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius);padding:14px 16px}
.total b{display:block;font-size:26px;line-height:1.2;color:var(--primary-dark)}
.total span{font-size:13px;color:var(--muted)}

.tabla-caja{overflow-x:auto;border:1px solid var(--border);border-radius:var(--radius)}
table{border-collapse:collapse;width:100%;font-size:14px;background:var(--surface)}
th,td{padding:9px 12px;text-align:left;border-bottom:1px solid var(--border);white-space:nowrap}
th{background:var(--surface-2);font-size:12px;text-transform:uppercase;letter-spacing:.03em;color:var(--label)}
tbody tr:last-child td{border-bottom:none}
td.num{text-align:center}
.marca{
  display:inline-block;font-size:11px;font-weight:700;padding:2px 7px;border-radius:99px;
  background:var(--surface-2);border:1px solid var(--border);color:var(--label);
}
.vacio{padding:40px 24px;text-align:center;color:var(--muted)}
/* --- firmas del mes pendientes --- */
.pend{
  display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;
  padding:14px 16px;border:1px solid var(--border);border-radius:var(--radius);
  background:var(--surface);margin-bottom:10px;
}
.pend--lista{background:var(--surface-2)}
.pend b{font-size:15px}
.pend-sub{display:block;font-size:13px;color:var(--muted);margin-top:3px}
.pend-caja{
  border:1px solid var(--border);border-top:none;border-radius:0 0 var(--radius) var(--radius);
  padding:18px 16px;margin:-12px 0 10px;background:var(--surface);
}
.pend-caja .botones{margin-top:16px}
.marca--acomp{background:#eef2ff;color:#1e2a78;border:1px solid #c7d0f7}
.marca--ok{background:var(--ok-bg);color:#05321a;border:1px solid #a9dfc0}

/* --- firma y huella (lo que pintan firma.js y huella.js) --- */
.ascf-oculto{display:none !important}
.ascf-previa{
  position:relative;
  height:120px;border:1px dashed var(--border-strong);border-radius:var(--radius);
  display:flex;align-items:center;justify-content:center;background:var(--surface-2);overflow:hidden;
}
.ascf-sello{
  position:absolute;top:6px;right:8px;font-size:10px;font-weight:700;letter-spacing:.08em;
  padding:2px 8px;border-radius:99px;background:var(--surface-2);color:var(--label);
  border:1px solid var(--border-strong);
}
.ascf-previa--llena{border-style:solid;background:var(--surface)}
.ascf-img{max-width:100%;max-height:100%;object-fit:contain}
.ascf-vacia{font-size:13px;font-weight:700;letter-spacing:.06em;color:var(--muted)}
.ascf-acciones{display:flex;gap:14px;align-items:center;margin-top:12px;flex-wrap:wrap}
.ascf-btn{background:var(--primary);color:#06373a;font:inherit;font-size:15px;font-weight:600;padding:12px 22px;border:1px solid transparent;border-radius:var(--radius);cursor:pointer}
.ascf-btn:hover{background:var(--primary-dark);color:#fff}
.ascf-btn-2{background:var(--surface);color:var(--label);border:1px solid var(--border-strong);font:inherit;font-size:15px;font-weight:600;padding:11px 20px;border-radius:var(--radius);cursor:pointer}
.ascf-btn-2:hover{background:var(--surface-2)}
.ascf-btn-link{background:none;border:none;color:var(--primary-dark);text-decoration:underline;font:inherit;font-weight:600;cursor:pointer;padding:6px 0}
.ascf-error{font-size:13px;color:var(--error);margin:8px 0 0}

.ascf-fondo{position:fixed;inset:0;background:rgba(10,20,25,.55);display:flex;align-items:center;justify-content:center;padding:24px;z-index:900}
.ascf-panel{background:var(--surface);border-radius:12px;padding:22px;width:min(1100px,100%);height:min(720px,100%);display:flex;flex-direction:column;gap:14px}
.ascf-titulo{font-size:19px;font-weight:700;margin:0}
.ascf-lienzo-caja{position:relative;flex:1;border:1px dashed var(--border-strong);border-radius:var(--radius);background:var(--surface);overflow:hidden}
.ascf-lienzo{position:absolute;inset:0;touch-action:none;cursor:crosshair}
.ascf-marca{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:15px;color:var(--muted);pointer-events:none}
.ascf-botones{display:flex;gap:12px;justify-content:flex-end;flex-wrap:wrap}
.ascf-aviso{margin:0;font-size:14px;color:var(--error)}
@media (max-width:640px){ .ascf-fondo{padding:0} .ascf-panel{height:100%;width:100%;border-radius:0} }

/* La ventana de la huella es más chica que la de la firma: no hay que trazar
   nada, solo mirar la imagen que entregó el lector. */
.ascf-panel--corto{height:auto;max-height:100%;width:min(760px,100%);overflow:auto}
.asch-cuerpo{display:grid;gap:20px;grid-template-columns:260px 1fr;align-items:start}
.asch-previa{
  height:300px;border:1px dashed var(--border-strong);border-radius:var(--radius);
  display:flex;align-items:center;justify-content:center;background:var(--surface-2);overflow:hidden;
}
.asch-img{max-width:100%;max-height:100%;object-fit:contain}
.asch-vacia{font-size:13px;color:var(--muted);padding:0 14px;text-align:center}
.asch-estado{margin:0 0 10px;font-size:15px;color:var(--label)}
.asch-estado--bien{color:#05321a}
.asch-estado--mal{color:var(--error)}
.asch-dato{margin:0 0 14px;font-size:14px;color:var(--muted)}
.asch-tips{margin:0 0 16px;padding-left:20px;font-size:13px;color:var(--muted)}
.asch-tips li{margin-bottom:4px}
.asch-archivo{border-top:1px solid var(--border);padding-top:14px}
.asch-etiqueta{display:block;font-size:13px;font-weight:600;color:var(--label);margin-bottom:6px}
.asch-input{font-size:14px;padding:8px}
.asch-visor{position:relative;max-width:100%;max-height:100%;line-height:0}
.asch-video{display:block;max-width:100%;max-height:380px;background:#000}
.asch-guia{position:absolute;border:3px dashed #fff;border-radius:14px;box-shadow:0 0 0 999px rgba(0,0,0,.38);pointer-events:none}
.asch-cuerpo--camara{grid-template-columns:minmax(260px,380px) 1fr}
.asch-cuerpo--camara .asch-previa{height:380px}
.asch-nativa{border-top:1px solid var(--border);padding-top:14px;margin-bottom:14px}
.asch-filtro{display:flex;gap:8px;align-items:center;font-size:14px;font-weight:600;color:var(--label);margin:0 0 12px;cursor:pointer}
.asch-filtro input{width:18px;height:18px}
.asch-nota{margin:0 0 10px;padding:8px 12px;border-radius:var(--radius);background:var(--surface-2);font-size:14px;color:var(--label)}
@media (max-width:640px){ .asch-cuerpo{grid-template-columns:1fr} .asch-previa,.asch-cuerpo--camara .asch-previa{height:300px} .asch-cuerpo--camara{grid-template-columns:1fr} }
</style>
</head>
<body>

<!-- =====================  INGRESO  ===================================== -->
<div class="wrap wrap--angosto<?= $entro ? ' oculto' : '' ?>" id="zonaIngreso">
  <h1>Reportes de transporte</h1>
  <p class="lead">Unidad San Felipe</p>

  <form class="tarjeta" id="formIngreso" autocomplete="on">
    <div class="campos" style="grid-template-columns:1fr">
      <div class="campo">
        <label for="usuario">Usuario</label>
        <input id="usuario" name="username" type="text" autocomplete="username" required/>
      </div>
      <div class="campo">
        <label for="clave">Clave</label>
        <input id="clave" name="current-password" type="password" autocomplete="current-password" required/>
      </div>
    </div>
    <div class="botones">
      <button class="btn" type="submit" id="btnIngresar">Ingresar</button>
    </div>
    <p class="aviso aviso--mal oculto" id="avisoIngreso"></p>
  </form>
</div>

<!-- =====================  PANEL  ======================================= -->
<div class="wrap<?= $entro ? '' : ' oculto' ?>" id="zonaPanel">

  <div class="barra">
    <div>
      <h1>Reportes de transporte</h1>
      <p class="lead" style="margin:0">Consulte por rango de fechas y descargue la constancia en PDF.</p>
    </div>
    <div style="text-align:right">
      <p class="quien">Ingresó como <b id="nombreQuien"><?= htmlspecialchars($quien, ENT_QUOTES, 'UTF-8') ?></b></p>
      <a class="btn-link" href="control-transporte.php">Registrar viajes</a>
      <button class="btn-link" type="button" id="btnSalir">Cerrar sesión</button>
    </div>
  </div>

  <form class="tarjeta" id="formFiltros">
    <h2>Qué se va a exportar</h2>
    <p class="pista" style="margin-bottom:20px">
      Sale una hoja por persona y por mes, con sus 31 renglones, como el
      formato impreso. Los viajes que todavía no se han firmado salen con la
      casilla de firma vacía.
    </p>

    <div class="campos">
      <div class="campo">
        <label for="desde">Desde</label>
        <input id="desde" type="date" required/>
      </div>
      <div class="campo">
        <label for="hasta">Hasta</label>
        <input id="hasta" type="date" required/>
      </div>
      <div class="campo">
        <label for="documento">Documento <span style="font-weight:400;color:var(--muted)">(opcional)</span></label>
        <input id="documento" type="text" inputmode="numeric" maxlength="10" placeholder="Toda la lista"/>
        <span class="pista">Déjelo vacío para incluir a todos.</span>
      </div>
    </div>

    <div class="botones">
      <button class="btn-2" type="submit" id="btnVer">Ver los registros</button>
      <button class="btn" type="button" id="btnBajar" disabled>Descargar PDF</button>
    </div>

    <p class="aviso aviso--mal oculto" id="avisoPanel"></p>
  </form>

  <!-- Firmas del mes: lo que falta por firmar dentro del rango consultado -->
  <div class="tarjeta oculto" id="zonaFirmas">
    <h2>Firmas del mes</h2>
    <p class="pista" id="pistaFirmas" style="margin-bottom:18px"></p>
    <div id="listaFirmas"></div>
    <p class="aviso oculto" id="avisoFirmas"></p>
  </div>

  <div class="tarjeta oculto" id="zonaResultado">
    <h2 id="tituloResultado">Registros</h2>
    <p class="pista" id="rangoResultado" style="margin-bottom:20px"></p>

    <div class="totales" id="totales"></div>
    <div class="tabla-caja" id="tablaCaja"></div>
  </div>
</div>

<script src="js/script/firma.js"></script>
<script src="js/script/huella.js"></script>
<script src="js/script/pdf-writer.js"></script>
<script src="js/script/pdf-transporte.js"></script>
<script>
(function () {
  'use strict';

  var API = 'api/';
  var $ = function (id) { return document.getElementById(id); };

  /* --- utilidades ---------------------------------------------------- */

  function texto(el, t) { el.textContent = t; }

  function mostrar(el, si) { el.classList.toggle('oculto', !si); }

  function aviso(el, mensaje, bien) {
    if (!mensaje) { mostrar(el, false); return; }
    el.className = 'aviso ' + (bien ? 'aviso--bien' : 'aviso--mal');
    texto(el, mensaje);
    mostrar(el, true);
  }

  function ocupado(boton, si, etiqueta) {
    boton.disabled = si;
    if (etiqueta) boton.textContent = etiqueta;
  }

  function fechaLarga(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    return m ? m[3] + '/' + m[2] + '/' + m[1] : (iso || '');
  }

  function escapar(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /** Cualquier 401 devuelve a la pantalla de ingreso. */
  function alIngreso(mensaje) {
    mostrar($('zonaPanel'), false);
    mostrar($('zonaIngreso'), true);
    aviso($('avisoIngreso'), mensaje || 'Su sesión se cerró. Vuelva a ingresar.');
    $('usuario').focus();
  }

  function pedir(url, opciones) {
    return fetch(url, Object.assign({ credentials: 'same-origin' }, opciones || {}))
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (d) {
          if (r.status === 401) { alIngreso(d.error); throw new Error('sin sesión'); }
          if (!r.ok || !d.ok) throw new Error(d.error || 'No se pudo completar la consulta.');
          return d;
        });
      });
  }

  /* --- ingreso -------------------------------------------------------- */

  $('formIngreso').addEventListener('submit', function (e) {
    e.preventDefault();
    aviso($('avisoIngreso'), '');
    ocupado($('btnIngresar'), true, 'Entrando…');

    pedir(API + 'login.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario: $('usuario').value, clave: $('clave').value })
    })
      .then(function (d) {
        $('clave').value = '';
        texto($('nombreQuien'), d.usuario || '');
        mostrar($('zonaIngreso'), false);
        mostrar($('zonaPanel'), true);
        $('desde').focus();
      })
      .catch(function (err) {
        if (err.message !== 'sin sesión') aviso($('avisoIngreso'), err.message);
      })
      .then(function () { ocupado($('btnIngresar'), false, 'Ingresar'); });
  });

  $('btnSalir').addEventListener('click', function () {
    pedir(API + 'logout.php', { method: 'POST' })
      .catch(function () { /* da igual: se sale de todas formas */ })
      .then(function () { location.reload(); });
  });

  /* --- filtros -------------------------------------------------------- */

  var ultimos = null;   // los filtros de la última consulta que sí trajo datos

  function filtros() {
    return {
      desde:     $('desde').value,
      hasta:     $('hasta').value,
      documento: $('documento').value.replace(/[^0-9A-Za-z]/g, '')
    };
  }

  function comoUrl(f) {
    return 'desde=' + encodeURIComponent(f.desde) +
           '&hasta='  + encodeURIComponent(f.hasta) +
           (f.documento ? '&documento=' + encodeURIComponent(f.documento) : '');
  }

  $('formFiltros').addEventListener('submit', function (e) {
    e.preventDefault();
    var f = filtros();

    aviso($('avisoPanel'), '');
    if (!f.desde || !f.hasta) {
      aviso($('avisoPanel'), 'Indique el rango de fechas.');
      return;
    }

    ocupado($('btnVer'), true, 'Consultando…');
    $('btnBajar').disabled = true;

    pedir(API + 'listar-transporte.php?' + comoUrl(f))
      .then(function (d) {
        ultimos = d.filtros;
        pintar(d);
        $('btnBajar').disabled = d.totales.registros === 0;
        cargarPendientes(d.filtros);
        if (d.recortado) {
          aviso($('avisoPanel'),
            'Hay más de ' + d.maximo + ' registros en ese rango. Se muestran y se exportan ' +
            'los primeros ' + d.maximo + '. Acorte el rango de fechas para verlos todos.');
        }
      })
      .catch(function (err) {
        if (err.message !== 'sin sesión') aviso($('avisoPanel'), err.message);
      })
      .then(function () { ocupado($('btnVer'), false, 'Ver los registros'); });
  });

  /* Descargar: el servidor manda los registros en JSON y el PDF se dibuja
     aquí mismo con pdf-writer.js. Antes el servidor armaba un .xlsx. */
  function bajar(bytes, nombre) {
    var url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    var a = document.createElement('a');
    a.href = url; a.download = nombre;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  $('btnBajar').addEventListener('click', function () {
    if (!ultimos) return;

    if (!window.PDFDoc || !window.AscPdfTransporte) {
      aviso($('avisoPanel'), 'No se cargaron los archivos que arman el PDF. ' +
        'Recargue con Ctrl + F5 y, si vuelve a pasar, avise a soporte.', false);
      return;
    }

    ocupado($('btnBajar'), true, 'Armando el PDF...');
    aviso($('avisoPanel'), '');

    pedir(API + 'exportar-transporte.php?' + comoUrl(ultimos))
      .then(function (d) {
        return window.AscPdfTransporte.constancia(d).then(function (bytes) {
          bajar(bytes, 'constancia-transporte-urbano' +
                       '_' + ultimos.desde + '_a_' + ultimos.hasta +
                       (ultimos.documento ? '_' + ultimos.documento : '') + '.pdf');
          aviso($('avisoPanel'), 'PDF descargado con ' + d.registros.length +
            (d.registros.length === 1 ? ' registro.' : ' registros.'), true);
        });
      })
      .catch(function (err) {
        console.error('[Reportes] PDF:', err);
        aviso($('avisoPanel'), 'No se pudo armar el PDF: ' + err.message, false);
      })
      .then(function () { ocupado($('btnBajar'), false, 'Descargar PDF'); });
  });

  // Cambiar cualquier filtro invalida la descarga: así no se baja un PDF
  // que no corresponde a lo que está en pantalla.
  ['desde', 'hasta', 'documento'].forEach(function (id) {
    var invalidar = function () {
      $('btnBajar').disabled = true;
      // Los pendientes son los de la consulta anterior: esconderlos evita
      // firmar un mes creyendo que es el que está en pantalla.
      mostrar($('zonaFirmas'), false);
      aviso($('avisoFirmas'), '');
    };
    $(id).addEventListener('change', invalidar);
    $(id).addEventListener('input',  invalidar);
  });

  /* --- firmas del mes --------------------------------------------------
   *  La firma dejó de tomarse entrega por entrega. Acá se muestra lo que
   *  falta por firmar dentro del rango consultado, agrupado por persona y
   *  mes, y una sola firma valida todos los registros de esa persona en ese
   *  mes. La del acompañante va aparte, porque es otra persona.
   * -------------------------------------------------------------------- */

  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
               'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  function mesLargo(periodo) {
    var m = /^(\d{4})-(\d{2})$/.exec(periodo || '');
    return m ? MESES[Number(m[2]) - 1] + ' de ' + m[1] : (periodo || '');
  }

  var pendientes = [];
  var paneles = {};      // clave -> panel de AscFirma ya creado

  function clave(p) { return p.periodo + '|' + p.id_usuario + '|' + p.id_acompanante; }

  function cargarPendientes(f) {
    return pedir(API + 'pendientes.php?modulo=TRANSPORTE&' + comoUrl(f))
      .then(function (d) {
        pendientes = d.pendientes || [];
        paneles = {};
        pintarPendientes();
      })
      .catch(function (err) {
        // Que falle esto no debe tumbar la consulta: la tabla ya se pintó.
        if (err.message === 'sin sesión') return;
        pendientes = [];
        pintarPendientes();
        aviso($('avisoFirmas'), 'No se pudieron leer los pendientes: ' + err.message);
      });
  }

  function pintarPendientes() {
    var caja = $('listaFirmas');
    caja.innerHTML = '';

    if (!pendientes.length) {
      texto($('pistaFirmas'), 'No queda nada por firmar en este rango.');
      mostrar($('zonaFirmas'), true);
      return;
    }

    var registros = pendientes.reduce(function (n, p) { return n + p.registros; }, 0);
    texto($('pistaFirmas'),
      pendientes.length + (pendientes.length === 1 ? ' firma pendiente' : ' firmas pendientes') +
      ', ' + registros + (registros === 1 ? ' registro' : ' registros') + ' sin validar. ' +
      'Una firma vale para todo el mes de esa persona. Puede descargar el PDF sin ' +
      'firmar: esos renglones salen con la casilla vacía.');

    pendientes.forEach(function (p) {
      var k = clave(p);
      var esAcomp = p.quien === 'ACOMPANANTE';

      var fila = document.createElement('div');
      fila.className = 'pend';
      fila.innerHTML =
        '<div><b>' + escapar(String(p.nombre || '').toUpperCase()) + '</b>' +
        (esAcomp ? ' <span class="marca marca--acomp">Acompañante</span>' : '') +
        '<span class="pend-sub">' + escapar(p.tipo_documento || '') + ' ' +
        escapar(p.n_doc || '') + ' · ' + mesLargo(p.periodo) + ' · ' +
        p.registros + (p.registros === 1 ? ' registro' : ' registros') +
        ' (' + fechaLarga(p.primera) + ' a ' + fechaLarga(p.ultima) + ')</span>' +
        (esAcomp ? '<span class="pend-sub">Paciente: ' +
                   escapar(String(p.paciente || '').toUpperCase()) + '</span>' : '') +
        '</div>';

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn-2';
      btn.textContent = 'Firmar';
      fila.appendChild(btn);

      var panelCaja = document.createElement('div');
      panelCaja.className = 'pend-caja oculto';

      btn.addEventListener('click', function () {
        var abierto = !panelCaja.classList.contains('oculto');
        if (abierto) { mostrar(panelCaja, false); btn.textContent = 'Firmar'; return; }

        if (!paneles[k]) paneles[k] = armarPanel(panelCaja, p, fila, btn);
        mostrar(panelCaja, true);
        btn.textContent = 'Cerrar';
        panelCaja.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });

      caja.appendChild(fila);
      caja.appendChild(panelCaja);
    });

    mostrar($('zonaFirmas'), true);
  }

  /** El panel de firma o huella de un pendiente, con su botón de guardar. */
  function armarPanel(caja, p, fila, btnAbrir) {
    var quien = String(p.nombre || '').toUpperCase();
    var destino = document.createElement('div');
    caja.appendChild(destino);

    var panel = AscFirma.panel({
      contenedor: destino,
      etiqueta: 'Firma de ' + quien,
      etiquetaHuella: 'Huella de ' + quien
    });

    var botones = document.createElement('div');
    botones.className = 'botones';
    var guardar = document.createElement('button');
    guardar.type = 'button';
    guardar.className = 'btn';
    guardar.textContent = 'Guardar la firma de ' + mesLargo(p.periodo);
    botones.appendChild(guardar);
    caja.appendChild(botones);

    guardar.addEventListener('click', function () {
      if (!panel.tieneFirma()) {
        panel.marcarError('Primero capture la firma o la huella.');
        return;
      }
      ocupado(guardar, true, 'Guardando…');
      aviso($('avisoFirmas'), '');

      pedir(API + 'firmar-mes.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modulo: 'TRANSPORTE',
          periodo: p.periodo,
          idUsuario: p.id_usuario,
          idAcompanante: p.id_acompanante,
          firma: panel.imagen(),
          firmaTipo: panel.tipo()
        })
      })
        .then(function (d) {
          // Se quita de la lista: ya no está pendiente.
          pendientes = pendientes.filter(function (x) { return clave(x) !== clave(p); });
          delete paneles[clave(p)];
          pintarPendientes();
          aviso($('avisoFirmas'),
            'Firmado ' + mesLargo(p.periodo) + ' de ' + quien + ': ' +
            d.registros + (d.registros === 1 ? ' registro validado.' : ' registros validados.'),
            true);
          // Lo que está en pantalla quedó viejo: hay que volver a consultar.
          $('btnBajar').disabled = false;
        })
        .catch(function (err) {
          if (err.message !== 'sin sesión') {
            panel.marcarError('No se pudo guardar: ' + err.message);
          }
        })
        .then(function () {
          ocupado(guardar, false, 'Guardar la firma de ' + mesLargo(p.periodo));
        });
    });

    return panel;
  }

  /* --- resultado ------------------------------------------------------ */

  function pintar(d) {
    var t = d.totales;

    texto($('tituloResultado'), 'Constancia de transporte urbano — CONS-RVAS-005');

    texto($('rangoResultado'),
      'Del ' + fechaLarga(d.filtros.desde) + ' al ' + fechaLarga(d.filtros.hasta) +
      (d.filtros.documento ? ' · documento ' + d.filtros.documento : ''));

    $('totales').innerHTML = [
      ['Registros',  t.registros],
      ['Personas',   t.personas],
      ['Viajes',     t.viajes],
      ['Sin firmar', t.pendientes]
    ].map(function (p) {
      return '<div class="total"><b>' + p[1] + '</b><span>' + p[0] + '</span></div>';
    }).join('');

    if (!d.registros.length) {
      $('tablaCaja').innerHTML =
        '<p class="vacio">No hay viajes registrados en ese rango.</p>';
      mostrar($('zonaResultado'), true);
      return;
    }

    var cabeza = '<tr><th>Fecha</th><th>Nombre</th><th>Documento</th>' +
      '<th>Transporte</th><th>Cantidad</th><th>Estado</th><th>Observaciones</th></tr>';

    var cuerpo = d.registros.map(function (r) {
      var firmado = r.estado === 'FIRMADO';
      var celdas = [
        fechaLarga(r.fecha),
        escapar(r.nombre_usuario).toUpperCase(),
        escapar(r.tipo_documento) + ' ' + escapar(r.n_doc),
        escapar(r.tipo_transporte)
      ].map(function (v) { return '<td>' + v + '</td>'; });

      celdas.push('<td class="num">' + Number(r.cantidad || 1) + '</td>');
      celdas.push('<td><span class="marca ' + (firmado ? 'marca--ok' : '') + '">' +
                  (firmado ? 'Firmado' : 'Sin firmar') + '</span></td>');
      celdas.push('<td>' + escapar(r.observaciones || '—') + '</td>');

      return '<tr>' + celdas.join('') + '</tr>';
    }).join('');

    $('tablaCaja').innerHTML =
      '<table><thead>' + cabeza + '</thead><tbody>' + cuerpo + '</tbody></table>';

    mostrar($('zonaResultado'), true);
  }

  /* --- arranque ------------------------------------------------------- */

  // Rango por defecto: el mes en curso.
  (function () {
    var hoy = new Date();
    var primero = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    var iso = function (d) {
      return d.getFullYear() + '-' +
             String(d.getMonth() + 1).padStart(2, '0') + '-' +
             String(d.getDate()).padStart(2, '0');
    };
    $('desde').value = iso(primero);
    $('hasta').value = iso(hoy);

    // La fecha inicial no puede ser futura: no hay entregas por venir.
    // La final sí se deja libre, para poder sacar el formato del mes completo
    // antes de que el mes termine.
    $('desde').max = iso(hoy);
  })();

  // La sesión caduca por inactividad; se revisa de vez en cuando para no
  // dejar la pantalla mostrando datos con la sesión ya vencida.
  if (<?= $entro ? 'true' : 'false' ?>) {
    setInterval(function () {
      fetch(API + 'sesion.php', { credentials: 'same-origin' })
        .then(function (r) { return r.json(); })
        .then(function (d) { if (!d.abierta) alIngreso(); })
        .catch(function () { /* sin red: se deja como está */ });
    }, <?= max(60, $minutos * 60 / 4) ?> * 1000);
  }

  (<?= $entro ? '$("desde")' : '$("usuario")' ?>).focus();
}());
</script>
</body>
</html>
