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
<title>Reportes de alimentación — Unidad San Felipe</title>
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
</style>
</head>
<body>

<!-- =====================  INGRESO  ===================================== -->
<div class="wrap wrap--angosto<?= $entro ? ' oculto' : '' ?>" id="zonaIngreso">
  <h1>Reportes de alimentación</h1>
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
      <h1>Reportes de alimentación</h1>
      <p class="lead" style="margin:0">Consulte por rango de fechas y descargue el formato en PDF.</p>
    </div>
    <div style="text-align:right">
      <p class="quien">Ingresó como <b id="nombreQuien"><?= htmlspecialchars($quien, ENT_QUOTES, 'UTF-8') ?></b></p>
      <button class="btn-link" type="button" id="btnSalir">Cerrar sesión</button>
    </div>
  </div>

  <form class="tarjeta" id="formFiltros">
    <h2>Qué se va a exportar</h2>
    <p class="pista" style="margin-bottom:20px">
      Los dos formatos salen de la misma tabla. Los separa el destino:
      Confort Care son las entregas que tienen IPS de destino; el control general, las que no.
    </p>

    <div class="campos">
      <div class="campo">
        <label for="formato">Formato</label>
        <select id="formato">
          <option value="general">Control general — Minuta de control de alimentos</option>
          <option value="confort">Confort Care — Constancia CONS-RVAS-005</option>
        </select>
      </div>
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

  <div class="tarjeta oculto" id="zonaResultado">
    <h2 id="tituloResultado">Registros</h2>
    <p class="pista" id="rangoResultado" style="margin-bottom:20px"></p>

    <div class="totales" id="totales"></div>
    <div class="tabla-caja" id="tablaCaja"></div>
  </div>
</div>

<script src="js/script/pdf-writer.js"></script>
<script src="js/script/pdf-alimentacion.js"></script>
<script>
(function () {
  'use strict';

  var API = 'api/';
  var $ = function (id) { return document.getElementById(id); };

  var COMIDAS = ['desayuno', 'almuerzo', 'cena'];

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
      formato:   $('formato').value,
      desde:     $('desde').value,
      hasta:     $('hasta').value,
      documento: $('documento').value.replace(/[^0-9A-Za-z]/g, '')
    };
  }

  function comoUrl(f) {
    return 'formato=' + encodeURIComponent(f.formato) +
           '&desde='  + encodeURIComponent(f.desde) +
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

    pedir(API + 'listar.php?' + comoUrl(f))
      .then(function (d) {
        ultimos = d.filtros;
        pintar(d);
        $('btnBajar').disabled = d.totales.registros === 0;
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

    if (!window.PDFDoc || !window.AscPdfAlimentacion) {
      aviso($('avisoPanel'), 'No se cargaron los archivos que arman el PDF. ' +
        'Recargue con Ctrl + F5 y, si vuelve a pasar, avise a soporte.', false);
      return;
    }

    ocupado($('btnBajar'), true, 'Armando el PDF...');
    aviso($('avisoPanel'), '');

    pedir(API + 'exportar.php?' + comoUrl(ultimos))
      .then(function (d) {
        var esConfort = ultimos.formato === 'confort';
        var armar = esConfort ? window.AscPdfAlimentacion.constancia
                              : window.AscPdfAlimentacion.minuta;
        return armar(d).then(function (bytes) {
          bajar(bytes, (esConfort ? 'constancia-alimentacion-confort-care'
                                  : 'minuta-control-alimentos') +
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
  ['formato', 'desde', 'hasta', 'documento'].forEach(function (id) {
    $(id).addEventListener('change', function () { $('btnBajar').disabled = true; });
    $(id).addEventListener('input',  function () { $('btnBajar').disabled = true; });
  });

  /* --- resultado ------------------------------------------------------ */

  function pintar(d) {
    var t = d.totales;
    var esConfort = d.filtros.formato === 'confort';

    texto($('tituloResultado'), esConfort
      ? 'Confort Care — Constancia CONS-RVAS-005'
      : 'Control general — Minuta de control de alimentos');

    texto($('rangoResultado'),
      'Del ' + fechaLarga(d.filtros.desde) + ' al ' + fechaLarga(d.filtros.hasta) +
      (d.filtros.documento ? ' · documento ' + d.filtros.documento : ''));

    $('totales').innerHTML = [
      ['Registros', t.registros],
      ['Personas',  t.personas],
      ['Desayunos', t.desayuno],
      ['Almuerzos', t.almuerzo],
      ['Cenas',     t.cena],
      ['Raciones',  t.raciones]
    ].map(function (p) {
      return '<div class="total"><b>' + p[1] + '</b><span>' + p[0] + '</span></div>';
    }).join('');

    if (!d.registros.length) {
      $('tablaCaja').innerHTML =
        '<p class="vacio">No hay entregas registradas en ese rango.</p>';
      mostrar($('zonaResultado'), true);
      return;
    }

    var cabeza = '<tr><th>Fecha</th><th>Nombre</th><th>Documento</th>' +
      (esConfort ? '<th>Destino</th>' : '<th>EPS</th>') +
      '<th>Desayuno</th><th>Almuerzo</th><th>Cena</th><th>Recibe</th></tr>';

    var cuerpo = d.registros.map(function (r) {
      var celdas = [
        fechaLarga(r.fecha),
        escapar(r.nombre_usuario).toUpperCase(),
        escapar(r.tipo_documento) + ' ' + escapar(r.n_doc),
        escapar(esConfort ? r.destino : (r.eps || '—'))
      ].map(function (v) { return '<td>' + v + '</td>'; });

      COMIDAS.forEach(function (c) {
        celdas.push('<td class="num">' + (Number(r[c]) > 0 ? Number(r[c]) : '—') + '</td>');
      });

      celdas.push('<td><span class="marca">' +
        (r.recibe === 'ACOMPANANTE' ? 'Acompañante' : 'Paciente') + '</span></td>');

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
