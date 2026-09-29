/* huella.js — captura de huella con el lector DigitalPersona (U.are.U 4500).
 *
 * El lector NO se habla por USB desde el navegador: el «Lite Client» de HID
 * instala un agente local y dos scripts (WebSdk + Fingerprint) que hacen de
 * puente. Aquí se cargan solo cuando alguien pide la huella, así la página
 * no depende de ellos para nada más.
 *
 * Uso:
 *     AscHuella.capturar({ etiqueta: 'Huella del paciente' })
 *       .then(function (r) { r ? r.imagen : 'canceló'; });
 *
 * Devuelve { imagen: 'data:image/jpeg;base64,...', jpeg: {b64,w,h}, tipo }
 * o null si se canceló. La huella va en JPEG y no en PNG a propósito: es una
 * imagen con grano, y en PNG pesa cinco o seis veces más.
 *
 * Mientras no haya lector conectado hay un respaldo: cargar una imagen desde
 * el disco. Sirve para probar todo el circuito (vista previa, base, PDF).
 *
 * Dos formas de tomar la huella, según el equipo:
 *   - PC con Windows: el lector DigitalPersona (lo de arriba).
 *   - Tablet o celular: la CÁMARA. Se le toma foto al dedo (o a la huella
 *     entintada en un papel), se recorta al recuadro guía, se pasa a gris y
 *     se sube el contraste. Sale igual que la del lector: un JPEG. No es una
 *     huella biométrica comparable, es la marca que va en el PDF.
 * Se elige sola (esTablet()), y hay un botón para cambiar a mano. También se
 * puede forzar con ?huella=camara o ?huella=lector en la dirección.
 */

var AscHuella = (function (global) {
  'use strict';

  var CFG = {
    RUTAS: [
      ['js/vendor/websdk.client.bundle.min.js',
       'js/vendor/websdk.client.min.js',
       'js/vendor/websdk.client.ui.js'],
      // @digitalpersona/core: lo necesita index.umd.js (la de npm) para
      // decodificar lo que manda el agente. A la clásica no le estorba.
      ['js/vendor/dp.core.umd.js',
       'js/vendor/core.umd.js'],
      ['js/vendor/fingerprint.sdk.min.js',
       'js/vendor/index.umd.js',
       'js/vendor/devices.umd.js']
    ],
    CALIDAD_JPEG:     0.92,
    // Recuadro guía de la cámara, como fracción del cuadro (izq, arriba, ancho, alto).
    GUIA:             { x: 0.20, y: 0.10, w: 0.60, h: 0.80 },
    // La foto se procesa a este tamaño (las crestas necesitan resolución) y
    // se guarda a LADO_MAXIMO.
    LADO_PROCESO:     1400,
    // Convertir la foto del dedo en líneas negras sobre blanco. Con false se
    // guarda la foto en gris, como antes. La ventana deja cambiarlo.
    FILTRO_HUELLA:    true,
    // Debajo de esto la foto está borrosa: no se ven las crestas.
    CONTRASTE_MINIMO: 4,
    // La huella filtrada es puro detalle fino y en JPEG pesa mucho: se guarda
    // más chica (en la celda del PDF ocupa menos de 1 cm; 400 px sobran).
    LADO_HUELLA:      400,
    CALIDAD_HUELLA:   0.85,
    LADO_MAXIMO:      800,   // px; el 4500 entrega ~357x392, nunca recorta
    PERMITIR_ARCHIVO: true
  };

  var doc = global.document;

  function crear(tag, clase, texto) {
    var el = doc.createElement(tag);
    if (clase) el.className = clase;
    if (texto !== undefined && texto !== null) el.textContent = texto;
    return el;
  }

  function apiClasica() {
    return (global.Fingerprint && global.Fingerprint.WebApi) ? global.Fingerprint : null;
  }

  function esApiModerna(v) {
    return !!(v && typeof v === 'object' && v.FingerprintReader && v.SampleFormat);
  }

  function apiModerna() {
    var candidatos = [
      global.dp && global.dp.devices,
      global.dpDevices,
      global.digitalpersona && global.digitalpersona.devices,
      global.DPDevices,
      global.devices
    ];
    for (var i = 0; i < candidatos.length; i++) {
      if (esApiModerna(candidatos[i])) return candidatos[i];
    }
    var claves;
    try { claves = Object.keys(global); } catch (e) { return null; }

    for (var j = 0; j < claves.length; j++) {
      var v;
      try { v = global[claves[j]]; } catch (e) { continue; }  // algún getter revienta
      if (esApiModerna(v)) return v;
    }
    return null;
  }

  function haySdk() {
    return !!(apiClasica() || apiModerna());
  }

  function unScript(ruta) {
    return new Promise(function (listo) {
      var s = doc.createElement('script');
      s.src = ruta;
      s.async = false;                      
      s.onload  = function () { listo(true); };
      s.onerror = function () { listo(false); }; 
      doc.head.appendChild(s);
    });
  }

  /** La primera de varias rutas que cargue. */
  function unaDeVarias(rutas) {
    return [].concat(rutas).reduce(function (cadena, ruta) {
      return cadena.then(function (ya) { return ya ? true : unScript(ruta); });
    }, Promise.resolve(false));
  }

  var cargaEnCurso = null;

  function cargarSdk() {
    if (haySdk()) return Promise.resolve(true);
    if (cargaEnCurso) return cargaEnCurso;

    cargaEnCurso = CFG.RUTAS.reduce(function (cadena, grupo) {
      return cadena.then(function () { return unaDeVarias(grupo); });
    }, Promise.resolve()).then(haySdk);

    return cargaEnCurso;
  }

  /* Nombres que reporta el lector, en español. */
  var CALIDADES = {
    Good:              'Buena',
    NoImage:           'No alcanzó a tomar la imagen',
    TooLight:          'Muy clara: presione un poco más',
    TooDark:           'Muy oscura: limpie el vidrio y el dedo',
    TooNoisy:          'Con mucho ruido',
    LowContrast:       'Poco contraste',
    NotEnoughFeatures: 'Poco detalle: use la yema completa',
    NotCentered:       'Dedo descentrado',
    NoFingerDetected:  'No se detectó el dedo',
    FailureUnknown:    'Falló sin motivo claro'
  };

  function nombreCalidad(codigo, api) {
    var tabla = (api && api.QualityCode) || {};
    var nombre = tabla[codigo] || '';
    return CALIDADES[nombre] || nombre || '—';
  }

  /* La muestra llega en base64url (con «-» y «_»), que no es lo mismo que
     base64: hay que traducirla antes de metérsela a un <img>. */
  function aBase64(s, api) {
    if (api && typeof api.b64UrlTo64 === 'function') {
      try { return api.b64UrlTo64(s); } catch (e) { /* abajo */ }
    }
    return String(s).replace(/-/g, '+').replace(/_/g, '/');
  }

  function pngDeMuestra(evento, api) {
    var m = evento && evento.samples;
    if (typeof m === 'string') {
      try { m = JSON.parse(m); } catch (e) { m = [m]; }
    }
    if (!m || !m.length) return null;

    var dato = m[0];
    if (dato && typeof dato === 'object') dato = dato.Data || dato.data || '';
    dato = String(dato || '');

    return dato ? 'data:image/png;base64,' + aBase64(dato, api) : null;
  }

  function listaDeLectores(respuesta) {
    if (!respuesta) return [];
    if (Array.isArray(respuesta)) return respuesta;
    if (Array.isArray(respuesta.devices)) return respuesta.devices;
    return [];
  }

  /* «Communication failure» es el error del SDK cuando no logra hablar con el
     agente de HID. Lo primero que hace el WebSdk es un GET a
     https://127.0.0.1:52181/get_connection para que el agente le diga por
     dónde seguir; si eso no contesta, no hay nada que hacer del lado de la
     página. Abrir esa dirección en el navegador distingue las dos causas:
     el servicio apagado (no carga) o el certificado sin aceptar (avisa). */
  var AGENTE_URL = 'https://127.0.0.1:52181/get_connection';

  var AYUDA_AGENTE =
    'Sin comunicación con el agente de HID. El navegador le pregunta al ' +
    'servicio local en ' + AGENTE_URL + ' y no recibe respuesta. Abra esa ' +
    'dirección en este mismo navegador: si no carga, el HID Authentication ' +
    'Device Client (Lite Client) no está instalado o su servicio está ' +
    'apagado; si avisa del certificado, acéptelo y vuelva a intentar. Ojo ' +
    'que el lector y el agente tienen que estar en la misma máquina donde ' +
    'se abre la página.';

  /* En http:// Chrome no expone crypto.subtle, el WebSdk no puede cifrar con
     AES y el agente 5.x corta la conexión. Es la causa más común del fallo. */
  var AYUDA_HTTP =
    'La página está abierta con http://. El canal con el lector necesita ' +
    'HTTPS (o http://localhost): ábrala con https:// y vuelva a intentar. ' +
    'En cPanel: SSL/TLS Status → Run AutoSSL.';

  function ayudaAgente() {
    return global.isSecureContext === false ? AYUDA_HTTP : AYUDA_AGENTE;
  }

  function esFalloDeAgente(mensaje) {
    return /communication|comunicaci/i.test(String(mensaje || ''));
  }

  /* Lo que las dos librerías hacen igual: preguntar qué lectores hay, arrancar
     la captura y avisar si algo falló. */
  function arrancarCaptura(api, lector, formato, oyentes) {
    var vivo = true;

    Promise.resolve()
      .then(function () { return lector.enumerateDevices(); })
      .then(function (r) {
        var lectores = listaDeLectores(r);
        if (!vivo) return null;
        if (!lectores.length) {
          oyentes.estado('No se ve ningún lector conectado. Conéctelo y vuelva a abrir ' +
                         'esta ventana.', 'mal');
        }
        return lectores.length
          ? lector.startAcquisition(formato, lectores[0])
          : lector.startAcquisition(formato);
      })
      .then(function () {
        if (vivo && oyentes.listo) oyentes.listo();
      })
      .catch(function (e) {
        if (!vivo) return;
        var m = (e && e.message) ? String(e.message) : '';
        if (esFalloDeAgente(m)) { oyentes.estado(ayudaAgente(), 'mal'); return; }
        oyentes.estado('No se pudo abrir el lector' + (m ? ': ' + m : '.'), 'mal');
      });

    return {
      detener: function () {
        vivo = false;
        try { lector.stopAcquisition(); } catch (e) { /* ya estaba cerrado */ }
      }
    };
  }

  function sinImagen(oyentes) {
    oyentes.estado('El lector respondió sin imagen. Vuelva a poner el dedo.', 'mal');
  }

  /** La librería clásica: Fingerprint.WebApi con manejadores onAlgo. */
  function lectorClasico(F, oyentes) {
    var lector;
    try { lector = new F.WebApi(); } catch (e) { return null; }

    lector.onDeviceConnected     = function () { oyentes.estado('Lector conectado. Ponga el dedo en el vidrio.', 'bien'); };
    lector.onDeviceDisconnected  = function () { oyentes.estado('Se desconectó el lector.', 'mal'); };
    lector.onCommunicationFailed = function () { oyentes.estado(ayudaAgente(), 'mal'); };
    lector.onQualityReported = function (e) { oyentes.calidad(nombreCalidad(e && e.quality, F)); };
    lector.onSamplesAcquired = function (s) {
      var png = pngDeMuestra(s, F);
      if (png) oyentes.muestra(png); else sinImagen(oyentes);
    };

    return arrancarCaptura(F, lector, F.SampleFormat.PngImage, oyentes);
  }

  /** La de npm (@digitalpersona/devices): FingerprintReader con eventos. */
  function lectorModerno(M, oyentes) {
    if (!(global.dp && global.dp.core && global.dp.core.Utf8)) {
      oyentes.estado('Falta js/vendor/dp.core.umd.js (@digitalpersona/core): la ' +
                     'librería del lector la necesita para leer lo que manda el agente.', 'mal');
      return null;
    }
    if (M.SampleFormat.PngImage === undefined) {
      oyentes.estado('La librería que cargó no sabe entregar la huella como imagen ' +
                     'PNG. Use fingerprint.sdk.min.js, del SDK de Windows.', 'mal');
      return null;
    }

    var lector;
    try { lector = new M.FingerprintReader(); } catch (e) { return null; }

    var manejadores = {
      DeviceConnected:    function () { oyentes.estado('Lector conectado. Ponga el dedo en el vidrio.', 'bien'); },
      DeviceDisconnected: function () { oyentes.estado('Se desconectó el lector.', 'mal'); },
      ErrorOccurred:      function () { oyentes.estado(ayudaAgente(), 'mal'); },
      QualityReported:    function (e) { oyentes.calidad(nombreCalidad(e && e.quality, M)); },
      SamplesAcquired:    function (e) {
        var png = pngDeMuestra(e, M);
        if (png) oyentes.muestra(png); else sinImagen(oyentes);
      }
    };

    // Según la versión se suscribe con .on('Evento', fn) o asignando onEvento.
    Object.keys(manejadores).forEach(function (nombre) {
      if (typeof lector.on === 'function') {
        try { lector.on(nombre, manejadores[nombre]); return; } catch (e) { /* abajo */ }
      }
      lector['on' + nombre] = manejadores[nombre];
    });

    return arrancarCaptura(M, lector, M.SampleFormat.PngImage, oyentes);
  }

  /**
   * Abre el lector y empieza a escuchar, con la librería que esté cargada.
   * `oyentes` recibe estado(texto, clase), calidad(texto) y muestra(dataUrl).
   * Devuelve { detener } o null si no se pudo abrir.
   */
  function abrirLector(oyentes) {
    var F = apiClasica();
    if (F) return lectorClasico(F, oyentes);

    var M = apiModerna();
    if (M) return lectorModerno(M, oyentes);

    return null;
  }

  function recorte(ctx, w, h) {
    var d;
    try { d = ctx.getImageData(0, 0, w, h).data; } catch (e) { return null; }

    var UMBRAL = 235, minX = w, minY = h, maxX = -1, maxY = -1;

    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var i = (y * w + x) * 4;
        if (d[i] < UMBRAL || d[i + 1] < UMBRAL || d[i + 2] < UMBRAL) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return null;

    var aire = Math.round(Math.min(w, h) * 0.02);
    minX = Math.max(0, minX - aire);
    minY = Math.max(0, minY - aire);
    maxX = Math.min(w - 1, maxX + aire);
    maxY = Math.min(h - 1, maxY + aire);

    return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
  }

  /** Cualquier imagen que el navegador sepa pintar -> JPEG recortado sobre blanco. */
  function aJpeg(src) {
    return new Promise(function (resolve) {
      var img = new Image();

      img.onload = function () {
        try {
          var w0 = img.naturalWidth || img.width;
          var h0 = img.naturalHeight || img.height;
          if (!w0 || !h0) { resolve(null); return; }

          // 1. La imagen tal cual, sobre blanco: el JPEG no tiene
          //    transparencia y sin el fondo lo transparente sale negro.
          var uno = doc.createElement('canvas');
          uno.width = w0; uno.height = h0;
          var ctx1 = uno.getContext('2d');
          ctx1.fillStyle = '#ffffff';
          ctx1.fillRect(0, 0, w0, h0);
          ctx1.drawImage(img, 0, 0, w0, h0);

          // 2. Se recorta el borde vacío.
          var caja = recorte(ctx1, w0, h0) || { x: 0, y: 0, w: w0, h: h0 };

          // 3. Y se limita el tamaño: más de esto no aporta nada al PDF.
          var escala = Math.min(1, CFG.LADO_MAXIMO / Math.max(caja.w, caja.h));
          var w = Math.max(1, Math.round(caja.w * escala));
          var h = Math.max(1, Math.round(caja.h * escala));

          var dos = doc.createElement('canvas');
          dos.width = w; dos.height = h;
          var ctx2 = dos.getContext('2d');
          ctx2.fillStyle = '#ffffff';
          ctx2.fillRect(0, 0, w, h);
          ctx2.drawImage(uno, caja.x, caja.y, caja.w, caja.h, 0, 0, w, h);

          var url = dos.toDataURL('image/jpeg', CFG.CALIDAD_JPEG);
          resolve({ imagen: url, jpeg: { b64: url.split(',')[1], w: w, h: h }, tipo: 'HUELLA' });
        } catch (e) { resolve(null); }
      };

      img.onerror = function () { resolve(null); };
      img.src = src;
    });
  }

  function leerArchivo(archivo) {
    return new Promise(function (resolve) {
      if (!archivo) { resolve(null); return; }
      var fr = new FileReader();
      fr.onload  = function () { resolve(String(fr.result || '')); };
      fr.onerror = function () { resolve(null); };
      fr.readAsDataURL(archivo);
    });
  }

  /* ======================================================================
   *  Dispositivo y cámara
   * ==================================================================== */

  /** Android, iPad o iPhone (incluido el iPad que se hace pasar por Mac). */
  function esTablet() {
    var nav = global.navigator || {};
    var ua  = nav.userAgent || '';
    if (/Android|iPad|iPhone|iPod/i.test(ua)) return true;
    return nav.platform === 'MacIntel' && (nav.maxTouchPoints || 0) > 1;
  }

  function hayCamara() {
    var nav = global.navigator || {};
    return !!(nav.mediaDevices && nav.mediaDevices.getUserMedia);
  }

  /** 'camara' o 'lector': ?huella=... manda; si no, según el equipo. */
  function modoInicial() {
    var q = '';
    try { q = new URLSearchParams(global.location.search).get('huella') || ''; } catch (e) { /* viejo */ }
    q = q.toLowerCase();
    if (q === 'camara' || q === 'lector') return q;
    return (esTablet() && hayCamara()) ? 'camara' : 'lector';
  }

  function textoErrorCamara(e) {
    var n = (e && e.name) || '';
    if (!global.isSecureContext || !hayCamara()) {
      return 'El navegador solo deja usar la cámara en páginas con HTTPS. Abra la ' +
             'página con https:// (en cPanel: instale el certificado SSL del dominio). ' +
             'Mientras tanto use «Tomar con la cámara del equipo», abajo.';
    }
    if (n === 'NotAllowedError' || n === 'SecurityError') {
      return 'El navegador no tiene permiso para usar la cámara. Toque el candado junto ' +
             'a la dirección, permita la cámara y vuelva a intentar.';
    }
    if (n === 'NotFoundError' || n === 'OverconstrainedError') {
      return 'No se encontró una cámara en este equipo.';
    }
    if (n === 'NotReadableError') {
      return 'La cámara está ocupada por otra aplicación. Ciérrela y vuelva a intentar.';
    }
    return 'No se pudo abrir la cámara' + (e && e.message ? ': ' + e.message : '.');
  }

  /**
   * Foto del dedo -> líneas negras sobre blanco, como una huella entintada.
   * gris: Float32Array (0..255) de w×h. Devuelve { px: Uint8ClampedArray de
   * w×h (0 = tinta, 255 = papel), caja: {x,y,w,h} de la zona del dedo o null,
   * nitidez: número (≈ contraste de las crestas en niveles de gris),
   * contraste: cuánto más textura tiene el dedo que el resto (bajo = borrosa) }.
   *
   * 1. Pasa-banda: se quita el ruido fino (desenfoque de 1 px) y se resta la
   *    luz de fondo (desenfoque del tamaño de un par de crestas). Quedan las
   *    crestas y se van las sombras grandes y los brillos.
   * 2. Se normaliza por zonas: cada zona se compara con su propio contraste,
   *    así la parte en sombra del dedo sale igual de marcada que la iluminada.
   * 3. Umbral en cero: lo más oscuro que su vecindario es cresta (negro).
   * 4. Máscara: solo donde hay textura de crestas, con forma de yema; fuera
   *    de eso, blanco.
   */
  function filtroHuella(gris, w, h) {
    var n = w * h, i, x, y;

    // Desenfoque de caja con imagen integral: O(n) sin importar el radio.
    function caja(src, r) {
      var x, y, W1 = w + 1, integ = new Float64Array(W1 * (h + 1)), out = new Float32Array(n);
      for (y = 0; y < h; y++) {
        var fila = 0;
        for (x = 0; x < w; x++) {
          fila += src[y * w + x];
          integ[(y + 1) * W1 + x + 1] = integ[y * W1 + x + 1] + fila;
        }
      }
      for (y = 0; y < h; y++) {
        var y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
        for (x = 0; x < w; x++) {
          var x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
          var s = integ[y1 * W1 + x1] - integ[y0 * W1 + x1] - integ[y1 * W1 + x0] + integ[y0 * W1 + x0];
          out[y * w + x] = s / ((y1 - y0) * (x1 - x0));
        }
      }
      return out;
    }
    function suave(src, r) { return caja(caja(src, r), r); }   // casi gaussiano

    var lado = Math.max(w, h);
    var R  = Math.max(4, Math.round(lado / 150));   // ~ una cresta y media
    var fino = suave(gris, 1);
    var fondo = suave(gris, R);

    var hp = new Float32Array(n), hp2 = new Float32Array(n);
    for (i = 0; i < n; i++) { hp[i] = fino[i] - fondo[i]; hp2[i] = hp[i] * hp[i]; }

    // Energía local de las crestas (en una ventana de varias crestas).
    var energia = suave(hp2, R * 2);

    // Máscara: textura fuerte comparada con lo más texturado de la foto.
    var muestra = [];
    for (i = 0; i < n; i += 7) muestra.push(energia[i]);
    muestra.sort(function (a, b) { return a - b; });
    var p95 = muestra[Math.floor(muestra.length * 0.95)] || 1;
    var p50 = muestra[Math.floor(muestra.length * 0.50)] || 1;
    // Crestas nítidas: el dedo tiene mucha más textura que el resto de la
    // foto. En una foto movida o desenfocada todo queda parecido.
    var contrasteTextura = p95 / (p50 + 1e-6);
    var mascara = new Float32Array(n);
    for (i = 0; i < n; i++) mascara[i] = energia[i] > p95 * 0.18 ? 1 : 0;
    mascara = suave(mascara, R * 3);            // borde parejo, sin huecos
    // Se come el borde: la silueta del dedo contra el fondo no es huella.
    for (i = 0; i < n; i++) mascara[i] = mascara[i] > 0.5 ? 1 : 0;
    mascara = suave(mascara, R * 2);
    for (i = 0; i < n; i++) mascara[i] = mascara[i] > 0.97 ? 1 : 0;

    // Forma de yema: se queda con la punta del dedo (un óvalo de alto
    // ~1.4 veces el ancho, desde arriba), como sale una huella entintada.
    var bx0 = w, bx1 = -1, by0 = h;
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) if (mascara[y * w + x]) {
      if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y;
    }
    if (bx1 >= 0) {
      var ancho = bx1 - bx0 + 1, alto = ancho * 1.4;
      var ecx = (bx0 + bx1) / 2, ecy = by0 + alto / 2, ea = ancho / 2, eb = alto / 2;
      for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
        var ex = (x - ecx) / ea, ey = (y - ecy) / eb;
        if (ex * ex + ey * ey > 1) mascara[y * w + x] = 0;
      }
    }

    var px = new Uint8ClampedArray(n);
    var minX = w, minY = h, maxX = -1, maxY = -1, suma = 0, cuenta = 0;
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        i = y * w + x;
        if (mascara[i] < 0.5) { px[i] = 255; continue; }
        var z = hp[i] / (Math.sqrt(energia[i]) + 1e-3);
        px[i] = z < 0 ? 0 : 255;
        suma += energia[i]; cuenta++;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }

    // Limpieza: cada píxel toma lo que diga la mayoría de sus 3×3 vecinos.
    var limpio = new Uint8ClampedArray(px);
    for (y = 1; y < h - 1; y++) {
      for (x = 1; x < w - 1; x++) {
        var negros = 0;
        for (var dy = -1; dy <= 1; dy++)
          for (var dx = -1; dx <= 1; dx++)
            if (px[(y + dy) * w + x + dx] === 0) negros++;
        limpio[y * w + x] = negros >= 5 ? 0 : 255;
      }
    }

    var caja2 = null;
    if (maxX >= 0) {
      var aire = R * 2;
      minX = Math.max(0, minX - aire); minY = Math.max(0, minY - aire);
      maxX = Math.min(w - 1, maxX + aire); maxY = Math.min(h - 1, maxY + aire);
      caja2 = { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
    }
    return { px: limpio, caja: caja2, nitidez: cuenta ? Math.sqrt(suma / cuenta) : 0,
             contraste: contrasteTextura };
  }

  /**
   * El pedazo de la fuente (video o imagen) que se conserva, en un lienzo de
   * hasta CFG.LADO_PROCESO px. Es la «foto cruda»: se guarda para poder
   * cambiar entre foto normal y tipo huella sin volver a tomarla.
   */
  function fotoCruda(fuente, caja) {
    try {
      var escala = Math.min(1, CFG.LADO_PROCESO / Math.max(caja.w, caja.h));
      var w = Math.max(1, Math.round(caja.w * escala));
      var h = Math.max(1, Math.round(caja.h * escala));
      var lienzo = doc.createElement('canvas');
      lienzo.width = w; lienzo.height = h;
      var ctx = lienzo.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(fuente, caja.x, caja.y, caja.w, caja.h, 0, 0, w, h);
      return lienzo;
    } catch (e) { return null; }
  }

  function aGris(d, n) {
    var g = new Float32Array(n);
    for (var i = 0; i < n; i++) g[i] = (d[i * 4] * 299 + d[i * 4 + 1] * 587 + d[i * 4 + 2] * 114) / 1000;
    return g;
  }

  /** Un lienzo (o un pedazo) -> JPEG de hasta CFG.LADO_MAXIMO px. */
  function lienzoAJpeg(src, caja, extra, lado, calidad) {
    var escala = Math.min(1, (lado || CFG.LADO_MAXIMO) / Math.max(caja.w, caja.h));
    var w = Math.max(1, Math.round(caja.w * escala));
    var h = Math.max(1, Math.round(caja.h * escala));
    var out = doc.createElement('canvas');
    out.width = w; out.height = h;
    var ctx = out.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(src, caja.x, caja.y, caja.w, caja.h, 0, 0, w, h);
    var url = out.toDataURL('image/jpeg', calidad || CFG.CALIDAD_JPEG);
    var r = { imagen: url, jpeg: { b64: url.split(',')[1], w: w, h: h }, tipo: 'HUELLA', origen: 'CAMARA' };
    for (var k in extra) r[k] = extra[k];
    return r;
  }

  /**
   * Foto cruda -> JPEG listo para guardar.
   *   comoHuella = true: líneas negras sobre blanco (filtroHuella). Si la foto
   *     salió borrosa y no se ven las crestas, devuelve la foto normal con
   *     borrosa: true, para que la ventana avise.
   *   comoHuella = false: la foto en gris con el contraste estirado.
   */
  function procesarFoto(cruda, comoHuella) {
    try {
      var w = cruda.width, h = cruda.height, n = w * h;
      var ctx = cruda.getContext('2d');
      var im = ctx.getImageData(0, 0, w, h);
      var gris = aGris(im.data, n);

      if (comoHuella) {
        var f = filtroHuella(gris, w, h);
        if (f.caja && f.contraste >= CFG.CONTRASTE_MINIMO) {
          var tmp = doc.createElement('canvas');
          tmp.width = w; tmp.height = h;
          var t = tmp.getContext('2d');
          var salida = t.createImageData(w, h), o = salida.data;
          for (var j = 0; j < n; j++) {
            o[j * 4] = o[j * 4 + 1] = o[j * 4 + 2] = f.px[j];
            o[j * 4 + 3] = 255;
          }
          t.putImageData(salida, 0, 0);
          return lienzoAJpeg(tmp, f.caja, { filtro: 'HUELLA', contraste: f.contraste },
                             CFG.LADO_HUELLA, CFG.CALIDAD_HUELLA);
        }
        var normal = procesarFoto(cruda, false);
        if (normal) { normal.borrosa = true; normal.contraste = f.contraste; }
        return normal;
      }

      // Foto normal: gris con el contraste estirado (se ignora el 2% más
      // oscuro y el 2% más claro: reflejos, sombras duras).
      var hist = new Uint32Array(256), i, v;
      for (i = 0; i < n; i++) hist[gris[i] | 0]++;
      var lo = 0, hi = 255, acc = 0;
      for (; lo < 255; lo++) { acc += hist[lo]; if (acc >= n * 0.02) break; }
      acc = 0;
      for (; hi > 0; hi--)   { acc += hist[hi]; if (acc >= n * 0.02) break; }
      if (hi - lo < 20) { lo = 0; hi = 255; }   // imagen plana: no se toca

      var k = 255 / (hi - lo), d = im.data;
      var copia = doc.createElement('canvas');
      copia.width = w; copia.height = h;
      var c2 = copia.getContext('2d');
      for (i = 0; i < n; i++) {
        v = (gris[i] - lo) * k;
        v = v < 0 ? 0 : (v > 255 ? 255 : v | 0);
        d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v;
        d[i * 4 + 3] = 255;
      }
      c2.putImageData(im, 0, 0);
      return lienzoAJpeg(copia, { x: 0, y: 0, w: w, h: h }, { filtro: 'FOTO' });
    } catch (e) { return null; }
  }

  /** Una foto que ya existe (la de la cámara nativa) -> foto cruda entera. */
  function fotoDeArchivo(src) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () {
        var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
        resolve(w && h ? fotoCruda(img, { x: 0, y: 0, w: w, h: h }) : null);
      };
      img.onerror = function () { resolve(null); };
      img.src = src;
    });
  }

  /**
   * Abre la cámara trasera sobre un <video>. oyentes: listo(), error(e).
   * Devuelve { detener, foto } o null si el navegador no tiene cámara.
   */
  function abrirCamara(video, oyentes) {
    if (!hayCamara()) { oyentes.error(null); return null; }

    var vivo = true, flujo = null;

    function soltar() {
      if (flujo) flujo.getTracks().forEach(function (t) { try { t.stop(); } catch (e) { /* ya */ } });
      flujo = null;
      try { video.srcObject = null; } catch (e) { /* viejo */ }
    }

    global.navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false
    }).then(function (s) {
      if (!vivo) { s.getTracks().forEach(function (t) { t.stop(); }); return null; }
      flujo = s;
      video.srcObject = s;
      return video.play();
    }).then(function () {
      if (vivo) oyentes.listo();
    }).catch(function (e) {
      if (vivo) oyentes.error(e);
    });

    return {
      detener: function () { vivo = false; soltar(); },
      foto: function () {
        var w0 = video.videoWidth, h0 = video.videoHeight;
        if (!w0 || !h0) return null;
        var g = CFG.GUIA;
        return fotoCruda(video, { x: w0 * g.x, y: h0 * g.y, w: w0 * g.w, h: h0 * g.h });
      }
    };
  }

  /* ======================================================================
   *  La ventana de captura. Se arma una sola vez.
   * ==================================================================== */

  var ventana = null;

  function armarVentana() {
    if (ventana) return ventana;

    var fondo = crear('div', 'ascf-fondo ascf-oculto');
    fondo.innerHTML =
      '<div class="ascf-panel ascf-panel--corto" role="dialog" aria-modal="true" aria-labelledby="aschTitulo">' +
        '<h2 class="ascf-titulo" id="aschTitulo">Huella</h2>' +
        '<div class="asch-cuerpo">' +
          '<div class="asch-previa">' +
            '<img class="asch-img ascf-oculto" alt="Huella capturada"/>' +
            '<div class="asch-visor ascf-oculto">' +
              '<video class="asch-video" playsinline muted autoplay></video>' +
              '<div class="asch-guia"></div>' +
            '</div>' +
            '<span class="asch-vacia">Esperando la huella…</span>' +
          '</div>' +
          '<div class="asch-datos">' +
            '<p class="asch-estado">Abriendo el lector…</p>' +
            '<p class="asch-dato"><b>Calidad:</b> <span class="asch-calidad">—</span></p>' +
            '<label class="asch-filtro ascf-oculto"><input type="checkbox" class="asch-filtro-caja"/> ' +
              'Convertir en huella (líneas negras)</label>' +
            '<ul class="asch-tips"></ul>' +
            '<div class="asch-nativa ascf-oculto">' +
              '<label class="asch-etiqueta" for="aschNativa">Tomar con la cámara del equipo</label>' +
              '<input id="aschNativa" class="asch-input" type="file" accept="image/*" capture="environment"/>' +
            '</div>' +
            '<div class="asch-archivo ascf-oculto">' +
              '<label class="asch-etiqueta" for="aschArchivo">O cargue una imagen de la huella</label>' +
              '<input id="aschArchivo" class="asch-input" type="file" accept="image/*"/>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<p class="ascf-aviso ascf-oculto"></p>' +
        '<div class="ascf-botones">' +
          '<button type="button" class="ascf-btn-2 asch-modo ascf-oculto">Usar cámara</button>' +
          '<button type="button" class="ascf-btn-2 asch-limpiar">Limpiar</button>' +
          '<button type="button" class="ascf-btn-2 asch-cancelar">Cancelar</button>' +
          '<button type="button" class="ascf-btn-2 asch-foto ascf-oculto">Tomar foto</button>' +
          '<button type="button" class="ascf-btn asch-guardar" disabled>Usar esta huella</button>' +
        '</div>' +
      '</div>';
    doc.body.appendChild(fondo);

    var titulo   = fondo.querySelector('.ascf-titulo');
    var cuerpo   = fondo.querySelector('.asch-cuerpo');
    var img      = fondo.querySelector('.asch-img');
    var visor    = fondo.querySelector('.asch-visor');
    var video    = fondo.querySelector('.asch-video');
    var guia     = fondo.querySelector('.asch-guia');
    var vacia    = fondo.querySelector('.asch-vacia');
    var estado   = fondo.querySelector('.asch-estado');
    var datoCal  = fondo.querySelector('.asch-dato');
    var calidad  = fondo.querySelector('.asch-calidad');
    var tips     = fondo.querySelector('.asch-tips');
    var cajaNat  = fondo.querySelector('.asch-nativa');
    var nativa   = fondo.querySelector('.asch-nativa .asch-input');
    var cajaArch = fondo.querySelector('.asch-archivo');
    var archivo  = fondo.querySelector('.asch-archivo .asch-input');
    var aviso    = fondo.querySelector('.ascf-aviso');
    var guardar  = fondo.querySelector('.asch-guardar');
    var btnModo  = fondo.querySelector('.asch-modo');
    var btnFoto  = fondo.querySelector('.asch-foto');
    var filaFil  = fondo.querySelector('.asch-filtro');
    var casilla  = fondo.querySelector('.asch-filtro-caja');
    casilla.checked = !!CFG.FILTRO_HUELLA;
    var cruda = null;       // la última foto de la cámara, sin procesar

    var TIPS_LECTOR = [
      'Ponga la yema completa, sin rodar el dedo.',
      'Presione parejo y sostenga un segundo.',
      'Si sale muy clara, limpie el vidrio y vuelva a intentar.',
      'Puede repetir las veces que quiera: se queda la última.'
    ];
    var TIPS_CAMARA = [
      'Ponga la yema del dedo dentro del recuadro, con buena luz y sin flash.',
      'Mejor todavía: entinte el dedo, márquelo en un papel blanco y fotografíe el papel.',
      'Mantenga quieta la tablet y toque «Tomar foto».',
      'Puede repetir las veces que quiera: se queda la última.'
    ];

    var g = CFG.GUIA;
    guia.style.left   = (g.x * 100) + '%';
    guia.style.top    = (g.y * 100) + '%';
    guia.style.width  = (g.w * 100) + '%';
    guia.style.height = (g.h * 100) + '%';

    var activo = null;      // { detener } del lector o de la cámara
    var camara = null;      // lo mismo, pero con foto(): solo en modo cámara
    var camaraLista = false;
    var modo = 'lector';
    var tomada = null;      // { imagen, jpeg, tipo }
    var cerrarCon = null;   // resolve() de la promesa en curso

    function ponerEstado(texto, clase) {
      estado.textContent = texto;
      estado.className = 'asch-estado' + (clase ? ' asch-estado--' + clase : '');
    }

    function pintar() {
      var hay = !!tomada;
      var verVisor = modo === 'camara' && camaraLista && !hay;

      img.classList.toggle('ascf-oculto', !hay);
      visor.classList.toggle('ascf-oculto', !verVisor);
      vacia.classList.toggle('ascf-oculto', hay || verVisor);
      guardar.disabled = !hay;

      btnFoto.classList.toggle('ascf-oculto', !(modo === 'camara' && camaraLista));
      btnFoto.textContent = hay ? 'Tomar otra foto' : 'Tomar foto';

      if (hay) img.src = tomada.imagen; else img.removeAttribute('src');
    }

    function paramsDeModo() {
      var esCam = modo === 'camara';
      cuerpo.classList.toggle('asch-cuerpo--camara', esCam);
      datoCal.classList.toggle('ascf-oculto', esCam);
      filaFil.classList.toggle('ascf-oculto', !esCam);
      btnModo.textContent = esCam ? 'Usar lector' : 'Usar cámara';
      // Solo se ofrece el cambio si hay algo a qué cambiar.
      btnModo.classList.toggle('ascf-oculto', !hayCamara() && !esCam);
      var lista = esCam ? TIPS_CAMARA : TIPS_LECTOR;
      tips.innerHTML = '';
      lista.forEach(function (t) { tips.appendChild(crear('li', '', t)); });
    }

    function recibirResultado(r, texto) {
      aviso.classList.add('ascf-oculto');
      if (!r) {
        aviso.textContent = 'No se pudo leer esa imagen.';
        aviso.classList.remove('ascf-oculto');
        return;
      }
      tomada = r;
      pintar();
      ponerEstado(texto, 'bien');
    }

    /** La foto cruda -> vista previa, según la casilla. */
    function mostrarCruda() {
      if (!cruda) return;
      var r = procesarFoto(cruda, casilla.checked);
      if (r && r.borrosa) {
        recibirResultado(r, '');
        ponerEstado('La foto salió borrosa y no se ven las líneas del dedo. Acerque o aleje ' +
                    'la tablet hasta que enfoque y repítala, o use la huella entintada. ' +
                    'Si la guarda así, queda la foto normal.', 'mal');
        return;
      }
      recibirResultado(r, 'Foto tomada. Puede repetirla o guardarla.');
    }

    casilla.addEventListener('change', function () {
      if (cruda && tomada) mostrarCruda();
    });

    function recibirImagen(src, desdeArchivo) {
      aviso.classList.add('ascf-oculto');
      aJpeg(src).then(function (r) {
        recibirResultado(r, desdeArchivo
          ? 'Imagen cargada desde el disco.'
          : 'Huella capturada. Puede repetirla o guardarla.');
      });
    }

    function detenerTodo() {
      if (activo) { activo.detener(); activo = null; }
      cruda = null;
      camara = null;
      camaraLista = false;
    }

    function cerrar(resultado) {
      detenerTodo();
      fondo.classList.add('ascf-oculto');
      doc.body.style.overflow = '';

      tomada = null;
      archivo.value = '';
      nativa.value = '';
      calidad.textContent = '—';
      aviso.classList.add('ascf-oculto');
      pintar();

      var terminar = cerrarCon;
      cerrarCon = null;
      if (terminar) terminar(resultado || null);
    }

    /* ---- modo lector: lo de siempre ---- */
    function iniciarLector() {
      ponerEstado('Abriendo el lector…', '');
      cajaNat.classList.add('ascf-oculto');

      cargarSdk().then(function (listo) {
        if (!cerrarCon || modo !== 'lector') return;   // ya cerró o cambió de modo

        if (!listo) {
          ponerEstado('No se encontró el puente del lector en esta máquina. Hay que ' +
                      'instalar el Lite Client de HID y dejar los dos scripts del SDK ' +
                      'en js/vendor (ver INSTALAR-huellero.md).', 'mal');
          cajaArch.classList.toggle('ascf-oculto', !CFG.PERMITIR_ARCHIVO);
          return;
        }

        activo = abrirLector({
          estado:  ponerEstado,
          calidad: function (t) { calidad.textContent = t; },
          muestra: function (png) { recibirImagen(png, false); }
        });

        if (!activo && !/--mal/.test(estado.className)) {
          ponerEstado('El SDK cargó pero no se pudo abrir el lector.', 'mal');
        }
        // El respaldo por archivo queda a mano igual: a veces el lector
        // está, pero el dedo del paciente no da una lectura usable.
        cajaArch.classList.toggle('ascf-oculto', !CFG.PERMITIR_ARCHIVO);
      });
    }

    /* ---- modo cámara ---- */
    function iniciarCamara() {
      ponerEstado('Abriendo la cámara…', '');
      cajaArch.classList.toggle('ascf-oculto', !CFG.PERMITIR_ARCHIVO);

      var esteModo = modo;
      var c = abrirCamara(video, {
        listo: function () {
          if (modo !== esteModo || camara !== c) return;
          camaraLista = true;
          pintar();
          ponerEstado('Cámara lista. Ponga el dedo dentro del recuadro y toque «Tomar foto».', 'bien');
        },
        error: function (e) {
          if (modo !== esteModo) return;
          camaraLista = false;
          pintar();
          ponerEstado(textoErrorCamara(e), 'mal');
          // La cámara nativa (input capture) no exige HTTPS: sirve de salida.
          cajaNat.classList.remove('ascf-oculto');
        }
      });
      camara = c;
      activo = c;
      if (!c) cajaNat.classList.remove('ascf-oculto');
    }

    function iniciarModo(m) {
      detenerTodo();
      modo = m;
      tomada = null;
      cajaNat.classList.add('ascf-oculto');
      aviso.classList.add('ascf-oculto');
      paramsDeModo();
      pintar();
      if (m === 'camara') iniciarCamara(); else iniciarLector();
    }

    btnModo.addEventListener('click', function () {
      iniciarModo(modo === 'camara' ? 'lector' : 'camara');
    });

    btnFoto.addEventListener('click', function () {
      if (tomada) { tomada = null; pintar(); ponerEstado('Cámara lista. Toque «Tomar foto».', 'bien'); return; }
      if (!camara) return;
      cruda = camara.foto();
      if (!cruda) return;
      ponerEstado('Procesando la foto…', '');
      // Se deja pintar el aviso antes del cálculo (unos cientos de ms).
      global.setTimeout(mostrarCruda, 30);
    });

    fondo.querySelector('.asch-limpiar').addEventListener('click', function () {
      tomada = null;
      archivo.value = '';
      nativa.value = '';
      aviso.classList.add('ascf-oculto');
      pintar();
    });

    fondo.querySelector('.asch-cancelar').addEventListener('click', function () { cerrar(null); });

    guardar.addEventListener('click', function () {
      if (!tomada) return;
      cerrar(tomada);
    });

    archivo.addEventListener('change', function () {
      var f = archivo.files && archivo.files[0];
      if (!f) return;
      leerArchivo(f).then(function (src) {
        if (src) recibirImagen(src, true);
      });
    });

    nativa.addEventListener('change', function () {
      var f = nativa.files && nativa.files[0];
      if (!f) return;
      leerArchivo(f).then(function (src) {
        return src ? fotoDeArchivo(src) : null;
      }).then(function (c) {
        cruda = c;
        if (c) mostrarCruda(); else recibirResultado(null, '');
      });
    });

    fondo.addEventListener('mousedown', function (e) { if (e.target === fondo) cerrar(null); });
    doc.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !fondo.classList.contains('ascf-oculto')) cerrar(null);
    });

    ventana = {
      abrir: function (etiqueta) {
        return new Promise(function (resolve) {
          cerrarCon = resolve;
          titulo.textContent = etiqueta;
          fondo.classList.remove('ascf-oculto');
          doc.body.style.overflow = 'hidden';
          iniciarModo(modoInicial());
        });
      }
    };
    return ventana;
  }

  /* ======================================================================
   *  API
   * ==================================================================== */

  function capturar(opciones) {
    var o = opciones || {};
    return armarVentana().abrir(o.etiqueta || 'Huella');
  }

  return {
    capturar:  capturar,
    esTablet:  esTablet,
    modoInicial: modoInicial,
    haySdk:    haySdk,
    cargarSdk: cargarSdk,
    CFG:       CFG
  };

}(window));
