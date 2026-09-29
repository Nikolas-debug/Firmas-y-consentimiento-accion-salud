
(function (global) {
  'use strict';

  /* Configuración */

  var RUTA = 'api/';

  var ESPERA_MS = 20000;

  function llamar(url, opciones) {
    var control = (typeof AbortController === 'function') ? new AbortController() : null;
    var ajustes = Object.assign({ credentials: 'same-origin' }, opciones || {});
    if (control) ajustes.signal = control.signal;

    var reloj = global.setTimeout(function () {
      if (control) control.abort();
    }, ESPERA_MS);

    return global.fetch(url, ajustes)
      .then(function (respuesta) {
        return respuesta.text().then(function (crudo) {
          var datos = null;
          try { datos = JSON.parse(crudo); } catch (e) { /* no vino JSON */ }

          if (datos === null) {
            console.error('[api] respuesta que no es JSON:', respuesta.status, crudo.slice(0, 400));
            throw nuevoError(
              respuesta.status === 404
                ? 'No se encontró el servicio de registro en el servidor.'
                : 'El servidor respondió algo inesperado.',
              respuesta.status, null);
          }

          if (!respuesta.ok || !datos.ok) {
            throw nuevoError(
              datos.error || 'No se pudo completar la operación.',
              respuesta.status, datos.campos || null);
          }

          return datos;
        });
      })
      .catch(function (err) {
        if (err && err.asc) throw err;

        if (err && err.name === 'AbortError') {
          throw nuevoError(
            'El servidor tardó demasiado en responder. El registro pudo no haberse guardado: ' +
            'revise en Reportes antes de volver a enviarlo.', 0, null);
        }
        console.error('[api]', err);
        throw nuevoError(
          'No se pudo conectar con el servidor. Revise la conexión a internet e intente de nuevo.',
          0, null);
      })
      .then(
        function (d) { global.clearTimeout(reloj); return d; },
        function (e) { global.clearTimeout(reloj); throw e; }
      );
  }

  function nuevoError(mensaje, estado, campos) {
    var e = new Error(mensaje);
    e.asc    = true;         // marca: el mensaje ya se puede mostrar tal cual
    e.estado = estado || 0;
    e.campos = campos || null;
    return e;
  }

  /** Quita acentos y espacios de más; el servidor vuelve a validar todo. */
  function limpio(v) {
    return String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  }

  function soloDocumento(v) {
    return String(v == null ? '' : v).replace(/[^0-9A-Za-z]/g, '').toUpperCase().slice(0, 10);
  }

  /** Raciones: devuelve null cuando la comida no se entregó. */
  function racion(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = parseInt(String(v).replace(/\D/g, ''), 10);
    return (isFinite(n) && n > 0) ? Math.min(n, 9999) : null;
  }

  /* --- Lo que usa el módulo -------------------------------------------- */

  var AscApi = {

    ruta: function (nueva) {
      if (typeof nueva === 'string' && nueva) RUTA = nueva;
      return RUTA;
    },
    registrarAlimentacion: function (d) {
      var cuerpo = {
        nombre:        limpio(d.nombre),
        tipoDocumento: limpio(d.tipoDocumento).toUpperCase(),
        documento:     soloDocumento(d.documento),
        recibe:        d.recibe === 'ACOMPANANTE' ? 'ACOMPANANTE' : 'PACIENTE',
        fecha:         limpio(d.fecha),
        desayuno:      racion(d.desayuno),
        almuerzo:      racion(d.almuerzo),
        cena:          racion(d.cena),
        destino:       limpio(d.destino).slice(0, 100),
        tipoPaciente:  limpio(d.tipoPaciente).toUpperCase(),
        direccion:     limpio(d.direccion).slice(0, 150),
        telefono:      limpio(d.telefono).slice(0, 30),
        eps:           limpio(d.eps).slice(0, 100),
        // Ya viene lista como data URL PNG (o null): la arma consentimiento.js
        // con firmaPaciente.png(). Aquí no se toca, el servidor la valida.
        firma:         d.firma || null
      };

      return llamar(RUTA + 'registrar.php', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(cuerpo)
      });
    },

    buscarUsuario: function (documento) {
      return llamar(RUTA + 'buscar-usuario.php?documento=' +
                    encodeURIComponent(soloDocumento(documento)));
    }
  };

  global.AscApi = AscApi;

}(window));
