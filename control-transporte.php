<?php

/* ============================================================================
 *  control-transporte.php — registro de viajes de transporte urbano.
 *
 *  Dejó de ser un «consentimiento» del formulario público: no genera
 *  documento, lo usa el personal de la Unidad y va detrás del mismo ingreso
 *  que la página de reportes.
 *
 *  El paciente no se digita aquí: se busca entre los que ya firmaron el
 *  consentimiento informado. Sin consentimiento previo no hay entrega.
 *
 *  Acá no se firma. El viaje queda PENDIENTE y se valida al cerrar el mes,
 *  desde reportes-transporte.php, con una sola firma por persona.
 * ========================================================================== */

declare(strict_types=1);

define('ASC_ENTRADA', true);
require __DIR__ . '/api/_lib/bootstrap.php';

$cfg = asc_cargar_config();
asc_sesion($cfg);

$entro = asc_hay_sesion();
$quien = $_SESSION['asc_usuario_reportes'] ?? '';

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
<title>Control de transporte — Unidad San Felipe</title>
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

.wrap{max-width:1000px;margin:0 auto;padding:40px 24px}
.wrap--angosto{max-width:440px}

h1{font-size:30px;line-height:1.25;font-weight:700;color:var(--primary);margin:0 0 6px;letter-spacing:-.01em}
h2{font-size:19px;font-weight:700;margin:0 0 4px}
.lead{color:var(--muted);margin:0 0 32px}

.barra{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:28px}
.quien{font-size:14px;color:var(--muted)}
.quien b{color:var(--label)}

.tarjeta{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:24px;margin-bottom:24px}
.tarjeta h2{margin-bottom:18px}

.campos{display:grid;gap:18px;grid-template-columns:repeat(auto-fit,minmax(190px,1fr))}
.campo{display:flex;flex-direction:column;gap:6px}
label{font-size:14px;font-weight:600;color:var(--label)}
input,select{
  width:100%;padding:11px 12px;font:inherit;font-size:15px;color:var(--text);
  background:var(--surface);border:1px solid var(--border-strong);border-radius:var(--radius);
}
input:focus,select:focus{outline:2px solid var(--primary);outline-offset:1px;border-color:var(--primary)}
input.mal,select.mal{border-color:var(--error)}
.pista{font-size:13px;color:var(--muted)}
.error-campo{font-size:13px;color:var(--error);margin:0}

.botones{display:flex;gap:12px;flex-wrap:wrap;margin-top:22px}
button{font:inherit;font-size:15px;font-weight:600;padding:12px 22px;border-radius:var(--radius);border:1px solid transparent;cursor:pointer}
button:disabled{opacity:.55;cursor:default}
.btn{background:var(--primary);color:#06373a}
.btn:hover:not(:disabled){background:var(--primary-dark);color:#fff}
.btn-2{background:var(--surface);color:var(--label);border-color:var(--border-strong)}
.btn-2:hover:not(:disabled){background:var(--surface-2)}
.btn-link{background:none;border:none;color:var(--primary-dark);text-decoration:underline;padding:6px 0;font-weight:600}

.aviso{padding:13px 16px;border-radius:var(--radius);margin:18px 0 0;font-size:15px}
.aviso--mal{background:var(--error-bg);color:#410002;border:1px solid #f4b8b1}
.aviso--bien{background:var(--ok-bg);color:#05321a;border:1px solid #a9dfc0}

/* --- buscador --- */
.buscador{display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end}
.buscador .campo{flex:1 1 280px}
.resultados{margin-top:18px;border:1px solid var(--border);border-radius:var(--radius);overflow:hidden}
.resultado{
  display:flex;align-items:center;justify-content:space-between;gap:14px;
  width:100%;text-align:left;padding:13px 16px;background:var(--surface);
  border:none;border-bottom:1px solid var(--border);border-radius:0;font-weight:400;
}
.resultado:last-child{border-bottom:none}
.resultado:hover:not(:disabled){background:var(--surface-2)}
.resultado:disabled{opacity:1;cursor:not-allowed;background:var(--surface-2)}
.resultado .nom{font-weight:600}
.resultado .doc{font-size:13px;color:var(--muted)}
.marca{display:inline-block;font-size:11px;font-weight:700;padding:3px 9px;border-radius:99px;white-space:nowrap}
.marca--si{background:var(--ok-bg);color:#05321a;border:1px solid #a9dfc0}
.marca--no{background:var(--error-bg);color:#410002;border:1px solid #f4b8b1}

/* --- paciente elegido --- */
.elegido{background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius);padding:16px 18px;display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;align-items:center}
.elegido dl{margin:0;display:grid;gap:4px 22px;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));flex:1}
.elegido dt{font-size:12px;text-transform:uppercase;letter-spacing:.03em;color:var(--muted)}
.elegido dd{margin:0 0 6px;font-weight:600}

</style>
</head>
<body>

<!-- =====================  INGRESO  ===================================== -->
<div class="wrap wrap--angosto<?= $entro ? ' oculto' : '' ?>" id="zonaIngreso">
  <h1>Control de transporte</h1>
  <p class="lead">Ingrese con su usuario para registrar viajes.</p>

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
      <h1>Control de transporte</h1>
      <p class="lead" style="margin:0">Unidad San Felipe</p>
    </div>
    <div style="text-align:right">
      <p class="quien">Ingresó como <b id="nombreQuien"><?= htmlspecialchars($quien, ENT_QUOTES, 'UTF-8') ?></b></p>
      <a class="btn-link" href="reportes-transporte.php">Ir a Reportes</a>
      <button class="btn-link" type="button" id="btnSalir">Cerrar sesión</button>
    </div>
  </div>

  <!-- 1. Buscar al paciente -->
  <div class="tarjeta">
    <h2>1. Buscar al paciente</h2>
    <p class="pista" style="margin:-10px 0 16px">
      Solo aparecen quienes ya están en la base. Para registrar una entrega, la
      persona tiene que haber firmado antes el consentimiento informado.
    </p>

    <form class="buscador" id="formBuscar">
      <div class="campo">
        <label for="q">Nombre o documento</label>
        <input id="q" type="text" placeholder="Al menos 3 caracteres" autocomplete="off"/>
      </div>
      <div class="botones" style="margin:0">
        <button class="btn-2" type="submit" id="btnBuscar">Buscar</button>
      </div>
    </form>

    <div class="resultados oculto" id="resultados"></div>
    <p class="aviso aviso--mal oculto" id="avisoBuscar"></p>
  </div>

  <!-- 2. La entrega -->
  <form id="formEntrega" class="oculto">

    <div class="tarjeta">
      <h2>2. Paciente elegido</h2>
      <div class="elegido" id="elegido"></div>

      <h2 style="margin:26px 0 4px">Datos de la ficha</h2>
      <p class="pista" style="margin:0 0 16px">
        Si el consentimiento informado no los trajo, complételos aquí: quedan
        guardados en la ficha del paciente. Lo que deje en blanco se conserva
        como está — nunca se borra.
      </p>

      <div class="campos">
        <div class="campo">
          <label for="tipoPaciente">Tipo de paciente</label>
          <select id="tipoPaciente"></select>
        </div>
        <div class="campo">
          <label for="epsPaciente">Entidad prestadora de salud</label>
          <select id="epsPaciente"></select>
          <p class="pista oculto" id="pistaEps"></p>
        </div>
        <div class="campo">
          <label for="direccion">Dirección</label>
          <input id="direccion" type="text" maxlength="150" autocomplete="off"/>
        </div>
        <div class="campo">
          <label for="telefono">Teléfono</label>
          <input id="telefono" type="text" inputmode="tel" maxlength="30" autocomplete="off"/>
        </div>
      </div>
      <p class="error-campo oculto" id="errorFicha"></p>
    </div>

    <div class="tarjeta">
      <h2>3. Datos del viaje</h2>
      <div class="campos">
        <div class="campo">
          <label for="fecha">Fecha</label>
          <input id="fecha" type="date" required/>
        </div>
        <div class="campo">
          <label for="tipoTransporte">Tipo de transporte</label>
          <select id="tipoTransporte"></select>
          <p class="pista" id="pistaTransporte"></p>
        </div>
        <div class="campo">
          <label for="cantidad">Cantidad</label>
          <input id="cantidad" type="number" min="1" max="20" step="1" value="1" inputmode="numeric"/>
        </div>
        <div class="campo" style="grid-column:1/-1">
          <label for="observaciones">Observaciones <span class="pista">(opcional)</span></label>
          <input id="observaciones" type="text" maxlength="255" autocomplete="off"/>
        </div>
      </div>
      <p class="error-campo oculto" id="errorViaje"></p>
    </div>

    <div class="tarjeta">
      <div class="botones" style="margin:0">
        <button class="btn" type="submit" id="btnGuardar">Guardar el viaje</button>
        <button class="btn-2" type="button" id="btnOtro">Buscar otro paciente</button>
      </div>
      <p class="aviso oculto" id="avisoGuardar"></p>
    </div>

  </form>
</div>

<script src="js/script/consentimiento-config.js" defer></script>
<script>
window.addEventListener('DOMContentLoaded', function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var mostrar = function (el, si) { el.classList.toggle('oculto', !si); };

  function aviso(el, mensaje, bien) {
    el.textContent = mensaje;
    el.classList.remove('oculto', 'aviso--mal', 'aviso--bien');
    el.classList.add(bien ? 'aviso--bien' : 'aviso--mal');
  }
  function ocupado(boton, si, etiqueta) {
    boton.disabled = si;
    boton.textContent = etiqueta;
  }
  function escapar(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  /* La fecha de hoy en hora local. Con toISOString() se toma la de UTC, que
     en Colombia adelanta un día a partir de las 7 p.m. */
  function hoyISO() {
    var d = new Date(), m = d.getMonth() + 1, x = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (x < 10 ? '0' : '') + x;
  }

  function pedir(url, opciones) {
    return fetch(url, Object.assign({ credentials: 'same-origin' }, opciones || {}))
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (d) {
          if (r.status === 401) { location.reload(); throw new Error('sesión cerrada'); }
          if (!r.ok || !d.ok) {
            var e = new Error(d.error || 'No se pudo completar la operación.');
            e.campos = d.campos || null;
            throw e;
          }
          return d;
        });
      });
  }

  /* --- Ingreso ---------------------------------------------------------- */

  $('formIngreso').addEventListener('submit', function (e) {
    e.preventDefault();
    $('avisoIngreso').classList.add('oculto');
    ocupado($('btnIngresar'), true, 'Entrando…');

    pedir('api/login.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario: $('usuario').value, clave: $('clave').value })
    })
      .then(function (d) {
        $('nombreQuien').textContent = d.usuario || '';
        mostrar($('zonaIngreso'), false);
        mostrar($('zonaPanel'), true);
        arrancar();
      })
      .catch(function (err) { aviso($('avisoIngreso'), err.message, false); })
      .then(function () { ocupado($('btnIngresar'), false, 'Ingresar'); });
  });

  $('btnSalir').addEventListener('click', function () {
    pedir('api/logout.php', { method: 'POST' })
      .catch(function () { /* da igual: se sale de todas formas */ })
      .then(function () { location.reload(); });
  });

  /* --- Listas del config ------------------------------------------------
   *  Viven todas en el formato `alimentacion_sf`, que hace de bolsa de
   *  listas del módulo de San Felipe: EPS, tipos de paciente y, ahora,
   *  los tipos de transporte.
   * -------------------------------------------------------------------- */

  function listasDelModulo() {
    var cfg = window.CONSENT_CONFIG;
    if (!cfg || !cfg.CONSENTIMIENTOS) return null;
    for (var i = 0; i < cfg.CONSENTIMIENTOS.length; i++) {
      if (cfg.CONSENTIMIENTOS[i].id === 'alimentacion_sf') return cfg.CONSENTIMIENTOS[i];
    }
    return null;
  }

  /** Llena un <select> con una lista de textos o de {id,label}. */
  function llenarSelect(sel, lista, vacio) {
    sel.innerHTML = '';
    var o0 = document.createElement('option');
    o0.value = ''; o0.textContent = vacio;
    sel.appendChild(o0);

    (lista || []).forEach(function (v) {
      var o = document.createElement('option');
      o.value = (v && v.id !== undefined) ? v.id : v;
      o.textContent = (v && v.label !== undefined) ? v.label : v;
      sel.appendChild(o);
    });
  }

  function elegirValor(sel, valor) {
    var v = String(valor == null ? '' : valor);
    if (v !== '' && !sel.querySelector('option[value="' + v.replace(/"/g, '\\"') + '"]')) {
      var o = document.createElement('option');
      o.value = v; o.textContent = v + ' (ya estaba en la ficha)';
      sel.appendChild(o);
    }
    sel.value = v;
  }

  function llenarListas() {
    var f = listasDelModulo();
    var tipos = (f && f.TIPOS_TRANSPORTE) || ['TRANSPORTE REDONDO'];

    llenarSelect($('tipoTransporte'), tipos, '— Elija —');
    llenarSelect($('tipoPaciente'), (f && f.TIPOS_PACIENTE) || [], '— Sin indicar —');
    llenarSelect($('epsPaciente'), (f && f.ENTIDADES_SALUD) || [], '— Sin indicar —');

    // Con un solo tipo no hay nada que elegir: queda puesto.
    if (tipos.length === 1) $('tipoTransporte').value = tipos[0];
    mostrar($('pistaTransporte'), tipos.length <= 1);

    var entidades = (f && f.ENTIDADES_SALUD) || [];
    mostrar($('pistaEps'), entidades.length === 0);
    if (!entidades.length) {
      $('pistaEps').textContent =
        'Cárguela en ENTIDADES_SALUD, dentro de consentimiento-config.js.';
    }
  }

  function arrancar() {
    llenarListas();
    $('fecha').value = hoyISO();
    $('fecha').max   = hoyISO();
  }
  if (<?= $entro ? 'true' : 'false' ?>) arrancar();

  /* --- Buscador --------------------------------------------------------- */

  var elegido = null;

  $('formBuscar').addEventListener('submit', function (e) {
    e.preventDefault();
    var q = $('q').value.trim();
    $('avisoBuscar').classList.add('oculto');

    if (q.length < 3) {
      aviso($('avisoBuscar'), 'Escriba al menos 3 caracteres.', false);
      return;
    }

    ocupado($('btnBuscar'), true, 'Buscando…');
    pedir('api/buscar-usuario.php?q=' + encodeURIComponent(q))
      .then(function (d) { pintarResultados(d.resultados || []); })
      .catch(function (err) { aviso($('avisoBuscar'), err.message, false); })
      .then(function () { ocupado($('btnBuscar'), false, 'Buscar'); });
  });

  function pintarResultados(filas) {
    var caja = $('resultados');
    caja.innerHTML = '';

    if (!filas.length) {
      aviso($('avisoBuscar'),
        'Nadie coincide con esa búsqueda. Si es un paciente nuevo, primero ' +
        'hay que diligenciar su consentimiento informado.', false);
      mostrar(caja, false);
      return;
    }

    filas.forEach(function (f) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'resultado';
      b.disabled = !f.consentido;
      b.innerHTML =
        '<span><span class="nom">' + escapar(f.nombre_usuario) + '</span><br>' +
        '<span class="doc">' + escapar(f.tipo_documento) + ' ' + escapar(f.n_doc) +
        (f.eps ? ' · ' + escapar(f.eps) : '') + '</span></span>' +
        '<span class="marca ' + (f.consentido ? 'marca--si' : 'marca--no') + '">' +
        (f.consentido ? 'Con consentimiento' : 'Sin consentimiento') + '</span>';

      if (f.consentido) b.addEventListener('click', function () { elegir(f); });
      caja.appendChild(b);
    });

    mostrar(caja, true);
  }

  function elegir(f) {
    elegido = f;

    /* El nombre y el documento no se tocan acá: vienen del consentimiento
       informado y son la identidad del paciente. */
    $('elegido').innerHTML =
      '<dl>' +
        '<div><dt>Paciente</dt><dd>' + escapar(f.nombre_usuario) + '</dd></div>' +
        '<div><dt>Documento</dt><dd>' + escapar(f.tipo_documento) + ' ' + escapar(f.n_doc) + '</dd></div>' +
      '</dl>';

    pintarFicha(f);
    mostrar($('resultados'), false);
    mostrar($('formEntrega'), true);
    $('avisoGuardar').classList.add('oculto');
    $('formEntrega').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* --- La ficha del paciente -------------------------------------------- */

  function pintarFicha(f) {
    elegirValor($('tipoPaciente'), f.tipo_paciente);
    elegirValor($('epsPaciente'),  f.eps);
    $('direccion').value = f.direccion || '';
    $('telefono').value  = f.telefono  || '';
    $('errorFicha').classList.add('oculto');
  }

  /** Lo que se manda de la ficha. Lo vacío no viaja: no debe borrar nada. */
  function datosFicha() {
    var d = {
      tipoPaciente: $('tipoPaciente').value,
      eps:          $('epsPaciente').value,
      direccion:    $('direccion').value.trim(),
      telefono:     $('telefono').value.trim()
    };
    Object.keys(d).forEach(function (k) { if (!d[k]) delete d[k]; });
    return d;
  }

  $('btnOtro').addEventListener('click', function () {
    elegido = null;
    mostrar($('formEntrega'), false);
    $('q').value = '';
    $('q').focus();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  /* --- Guardar ---------------------------------------------------------- */

  function limpiarMarcas() {
    ['fecha', 'tipoTransporte', 'cantidad', 'tipoPaciente', 'epsPaciente',
     'direccion', 'telefono'].forEach(function (id) {
      $(id).classList.remove('mal');
    });
    $('errorViaje').classList.add('oculto');
    $('errorFicha').classList.add('oculto');
  }

  $('formEntrega').addEventListener('submit', function (e) {
    e.preventDefault();
    if (!elegido) return;

    limpiarMarcas();
    $('avisoGuardar').classList.add('oculto');

    var cuerpo = {
      idUsuario:      elegido.id_usuario,
      fecha:          $('fecha').value,
      tipoTransporte: $('tipoTransporte').value,
      cantidad:       parseInt($('cantidad').value, 10) || 1,
      observaciones:  $('observaciones').value.trim(),
      paciente:       datosFicha()           // lo que se completó de la ficha
    };

    ocupado($('btnGuardar'), true, 'Guardando…');

    pedir('api/registrar-transporte.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo)
    })
      .then(function (d) {
        // La ficha quedó con lo que se acabó de escribir: si registran otra
        // entrega seguida, los campos tienen que mostrar lo mismo.
        var ficha = datosFicha();
        if (ficha.tipoPaciente) elegido.tipo_paciente = ficha.tipoPaciente;
        if (ficha.eps)          elegido.eps           = ficha.eps;
        if (ficha.direccion)    elegido.direccion     = ficha.direccion;
        if (ficha.telefono)     elegido.telefono      = ficha.telefono;

        var completado = (d.fichaActualizada || []).length
          ? ' Se completó la ficha: ' + d.fichaActualizada.join(', ') + '.'
          : '';

        aviso($('avisoGuardar'),
          'Viaje guardado para ' + elegido.nombre_usuario + '.' + completado +
          ' Queda sin firmar hasta que cierre el mes en Reportes.', true);
        limpiarEntrega();
      })
      .catch(function (err) {
        pintarErrores(err.campos);
        aviso($('avisoGuardar'), 'NO se guardó: ' + err.message, false);
      })
      .then(function () {
        ocupado($('btnGuardar'), false, 'Guardar el viaje');
        $('avisoGuardar').scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
  });

  function pintarErrores(campos) {
    if (!campos) return;

    var DONDE = {
      fecha:          'fecha',
      tipoTransporte: 'tipoTransporte',
      cantidad:       'cantidad',
      tipoPaciente:   'tipoPaciente',
      eps:            'epsPaciente',
      direccion:      'direccion',
      telefono:       'telefono'
    };

    Object.keys(campos).forEach(function (k) {
      if (DONDE[k]) $(DONDE[k]).classList.add('mal');
    });

    if (campos.paciente) {
      $('errorViaje').textContent = campos.paciente;
      $('errorViaje').classList.remove('oculto');
    }
    if (campos.ficha) {
      $('errorFicha').textContent = campos.ficha;
      $('errorFicha').classList.remove('oculto');
    }
  }

  /* Tras guardar se limpia lo del viaje pero se deja al paciente elegido:
     lo habitual es registrarle otro día seguido. */
  function limpiarEntrega() {
    $('observaciones').value = '';
    $('cantidad').value = '1';
  }
});
</script>
</body>
</html>
