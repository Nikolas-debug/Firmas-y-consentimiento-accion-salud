

var AscFirma = (function (global) {
  'use strict';

  var CFG = {
    GROSOR:       2.0,
    USAR_PRESION: true,
    PRESION_MIN:  0.55,
    PRESION_MAX:  1.75,
    COLOR:        '#0f2b3d'
  };

  var doc = global.document;

  function crear(tag, clase, texto) {
    var el = doc.createElement(tag);
    if (clase) el.className = clase;
    if (texto !== undefined && texto !== null) el.textContent = texto;
    return el;
  }

  /* ======================================================================
   *  El lienzo: toda la mecánica del trazo.
   *  Existe una sola vez, dentro de la pantalla grande.
   * ==================================================================== */

  function crearLienzo(wrapper, canvas, marcaDeAgua) {
    var ctx = canvas.getContext('2d');

    var dibujando = false, hayTrazos = false;
    var idActivo = null, ptPrevio = null, medioPrevio = null, grosorPrevio = 0;
    var presionReal = false;

    function aplicarEstilo() {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = CFG.COLOR;
      ctx.fillStyle   = CFG.COLOR;
      ctx.lineWidth   = CFG.GROSOR;
    }

    var anchoPrevio = 0, altoPrevio = 0;

    function redimensionar() {
      var caja = wrapper.getBoundingClientRect();
      if (!caja.width || !caja.height) return;
      if (Math.round(caja.width) === anchoPrevio && Math.round(caja.height) === altoPrevio) return;

      anchoPrevio = Math.round(caja.width);
      altoPrevio  = Math.round(caja.height);

      var copia = hayTrazos ? canvas.toDataURL() : null;

      // Se limita entre 2 y 3 para que la firma salga nítida sin volverse
      // una imagen enorme en pantallas de mucha densidad.
      var dpr = Math.min(Math.max(global.devicePixelRatio || 1, 2), 3);

      canvas.width  = Math.round(caja.width  * dpr);
      canvas.height = Math.round(caja.height * dpr);
      canvas.style.width  = caja.width  + 'px';
      canvas.style.height = caja.height + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      aplicarEstilo();

      if (copia) {
        var img = new Image();
        img.onload = function () { ctx.drawImage(img, 0, 0, caja.width, caja.height); };
        img.src = copia;
      }
    }

    var reloj;
    function programarRedimension() {
      global.clearTimeout(reloj);
      reloj = global.setTimeout(redimensionar, 120);
    }
    global.addEventListener('resize', programarRedimension);
    global.addEventListener('orientationchange', programarRedimension);
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(programarRedimension).observe(wrapper);

    function posicion(evt) {
      var caja = canvas.getBoundingClientRect();
      return { x: evt.clientX - caja.left, y: evt.clientY - caja.top };
    }

    function grosorDe(evt) {
      if (!CFG.USAR_PRESION || evt.pointerType !== 'pen') return CFG.GROSOR;
      var p = evt.pressure;
      // Muchos lápices reportan 0.5 fijo cuando no miden presión de verdad.
      if (p > 0 && Math.abs(p - 0.5) > 0.001) presionReal = true;
      if (!presionReal) return CFG.GROSOR;
      var t = Math.max(0, Math.min(1, p));
      return CFG.GROSOR * (CFG.PRESION_MIN + (CFG.PRESION_MAX - CFG.PRESION_MIN) * t);
    }

    function segmento(pt, ancho) {
      var medio = { x: (ptPrevio.x + pt.x) / 2, y: (ptPrevio.y + pt.y) / 2 };
      ctx.beginPath();
      ctx.lineWidth = ancho;
      ctx.moveTo(medioPrevio.x, medioPrevio.y);
      ctx.quadraticCurveTo(ptPrevio.x, ptPrevio.y, medio.x, medio.y);
      ctx.stroke();
      medioPrevio = medio;
      ptPrevio = pt;
    }

    function anotar(evt) {
      var p = posicion(evt);
      var dx = p.x - ptPrevio.x, dy = p.y - ptPrevio.y;
      if (dx * dx + dy * dy < 0.16) return;   // ruido del pulso
      var objetivo = grosorDe(evt);
      grosorPrevio += (objetivo - grosorPrevio) * 0.35;
      segmento(p, grosorPrevio);
    }

    function empezar(e) {
      if (idActivo !== null || e.button !== 0) return;
      e.preventDefault();

      idActivo = e.pointerId;
      dibujando = true;
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* sin captura */ }

      var p = posicion(e);
      ptPrevio = p; medioPrevio = p; grosorPrevio = grosorDe(e);

      ctx.beginPath();
      ctx.arc(p.x, p.y, grosorPrevio / 2, 0, Math.PI * 2);
      ctx.fill();

      if (!hayTrazos) { hayTrazos = true; marcaDeAgua.style.display = 'none'; }
    }

    function mover(e) {
      if (!dibujando || e.pointerId !== idActivo) return;
      e.preventDefault();
      if (e.buttons === 0) { soltar(e); return; }

      var lote = null;
      try { if (e.getCoalescedEvents) lote = e.getCoalescedEvents(); } catch (err) { lote = null; }

      if (lote && lote.length) { for (var i = 0; i < lote.length; i++) anotar(lote[i]); }
      else anotar(e);
    }

    function soltar(e) {
      if (!dibujando) return;
      if (e && e.pointerId !== undefined && idActivo !== null && e.pointerId !== idActivo) return;
      dibujando = false;
      if (idActivo !== null) {
        try { canvas.releasePointerCapture(idActivo); } catch (err) {}
        idActivo = null;
      }
      if (ptPrevio && medioPrevio) {
        ctx.beginPath();
        ctx.lineWidth = grosorPrevio || CFG.GROSOR;
        ctx.moveTo(medioPrevio.x, medioPrevio.y);
        ctx.lineTo(ptPrevio.x, ptPrevio.y);
        ctx.stroke();
      }
      ptPrevio = null; medioPrevio = null;
    }

    canvas.addEventListener('pointerdown', empezar);
    canvas.addEventListener('pointermove', mover);
    canvas.addEventListener('pointerup', soltar);
    canvas.addEventListener('pointercancel', soltar);
    canvas.addEventListener('lostpointercapture', soltar);
    global.addEventListener('pointerup', soltar);
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    function limpiar() {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
      hayTrazos = false; dibujando = false; idActivo = null;
      ptPrevio = null; medioPrevio = null;
      marcaDeAgua.style.display = 'block';
    }

    /* Recorta al rectángulo que ocupa la tinta, con un poco de aire, y
       devuelve la imagen sobre fondo blanco. Sin el recorte la firma
       quedaría perdida dentro de un lienzo enorme y casi todo vacío. */
    function capturar() {
      var w = canvas.width, h = canvas.height;
      var datos = ctx.getImageData(0, 0, w, h).data;
      var minX = w, minY = h, maxX = -1, maxY = -1;

      for (var y = 0; y < h; y++) {
        for (var x = 0; x < w; x++) {
          if (datos[(y * w + x) * 4 + 3] > 8) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      if (maxX < 0) return null;   // no se trazó nada

      var aire = Math.round(Math.min(w, h) * 0.03);
      minX = Math.max(0, minX - aire);
      minY = Math.max(0, minY - aire);
      maxX = Math.min(w - 1, maxX + aire);
      maxY = Math.min(h - 1, maxY + aire);

      var cw = maxX - minX + 1, ch = maxY - minY + 1;
      var fuera = doc.createElement('canvas');
      fuera.width = cw; fuera.height = ch;

      var octx = fuera.getContext('2d');
      octx.fillStyle = '#ffffff';
      octx.fillRect(0, 0, cw, ch);
      octx.drawImage(canvas, minX, minY, cw, ch, 0, 0, cw, ch);

      return {
        jpeg: { b64: fuera.toDataURL('image/jpeg', 0.92).split(',')[1], w: cw, h: ch },
        png:  fuera.toDataURL('image/png')
      };
    }

    return {
      redimensionar: redimensionar,
      limpiar: limpiar,
      capturar: capturar,
      hayTrazos: function () { return hayTrazos; }
    };
  }

  /* ======================================================================
   *  La pantalla grande. Se arma una sola vez y la comparten los paneles.
   * ==================================================================== */

  var modal = null;

  function armarModal() {
    if (modal) return modal;

    var fondo = crear('div', 'ascf-fondo ascf-oculto');
    fondo.innerHTML =
      '<div class="ascf-panel" role="dialog" aria-modal="true" aria-labelledby="ascfTitulo">' +
        '<h2 class="ascf-titulo" id="ascfTitulo">Firma</h2>' +
        '<div class="ascf-lienzo-caja">' +
          '<canvas class="ascf-lienzo"></canvas>' +
          '<span class="ascf-marca">Firme aquí</span>' +
        '</div>' +
        '<p class="ascf-aviso ascf-oculto"></p>' +
        '<div class="ascf-botones">' +
          '<button type="button" class="ascf-btn-2 ascf-limpiar">Limpiar</button>' +
          '<button type="button" class="ascf-btn-2 ascf-cancelar">Cancelar</button>' +
          '<button type="button" class="ascf-btn ascf-guardar">Guardar firma</button>' +
        '</div>' +
      '</div>';
    doc.body.appendChild(fondo);

    var caja    = fondo.querySelector('.ascf-lienzo-caja');
    var canvas  = fondo.querySelector('.ascf-lienzo');
    var marca   = fondo.querySelector('.ascf-marca');
    var titulo  = fondo.querySelector('.ascf-titulo');
    var aviso   = fondo.querySelector('.ascf-aviso');
    var lienzo  = crearLienzo(caja, canvas, marca);
    var pidio   = null;

    function cerrar() {
      fondo.classList.add('ascf-oculto');
      doc.body.style.overflow = '';
      lienzo.limpiar();
      aviso.classList.add('ascf-oculto');
      pidio = null;
    }

    fondo.querySelector('.ascf-limpiar').addEventListener('click', function () {
      lienzo.limpiar();
      aviso.classList.add('ascf-oculto');
    });
    fondo.querySelector('.ascf-cancelar').addEventListener('click', cerrar);

    fondo.querySelector('.ascf-guardar').addEventListener('click', function () {
      if (!lienzo.hayTrazos()) {
        aviso.textContent = 'Todavía no hay ningún trazo.';
        aviso.classList.remove('ascf-oculto');
        return;
      }
      var capturada = lienzo.capturar();
      if (capturada && pidio) pidio.recibir(capturada);
      cerrar();
    });

    // Clic por fuera del panel y Esc: cierran sin guardar.
    fondo.addEventListener('mousedown', function (e) { if (e.target === fondo) cerrar(); });
    doc.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !fondo.classList.contains('ascf-oculto')) cerrar();
    });

    modal = {
      abrir: function (panel) {
        pidio = panel;
        titulo.textContent = panel.etiqueta;
        fondo.classList.remove('ascf-oculto');
        doc.body.style.overflow = 'hidden';
        // El lienzo solo puede medirse cuando ya está visible.
        global.setTimeout(lienzo.redimensionar, 30);
      }
    };
    return modal;
  }

  /* ======================================================================
   *  El panel de la tarjeta: vista previa y botones.
   *  La marca es { imagen, jpeg, tipo }: venga de la pantalla o del lector,
   *  se guarda y se muestra igual.
   * ==================================================================== */

  function panel(opciones) {
    var contenedor = opciones.contenedor;
    var etiqueta   = opciones.etiqueta || 'Firma';
    var conHuella  = opciones.huella !== false;
    var etiquetaH  = opciones.etiquetaHuella ||
                     (/^firma/i.test(etiqueta) ? etiqueta.replace(/^firma/i, 'Huella') : 'Huella');
    var marca      = null;

    var caja    = crear('div', 'ascf-previa');
    var img     = crear('img', 'ascf-img ascf-oculto');
    var vacia   = crear('span', 'ascf-vacia', conHuella ? 'SIN FIRMA NI HUELLA' : 'SIN FIRMA');
    var sello   = crear('span', 'ascf-sello ascf-oculto');
    caja.appendChild(img);
    caja.appendChild(vacia);
    caja.appendChild(sello);

    var btnFirma = crear('button', 'ascf-btn-2', 'Firmar en pantalla');
    btnFirma.type = 'button';

    var btnHuella = null;
    if (conHuella) {
      btnHuella = crear('button', 'ascf-btn-2', 'Usar huella');
      btnHuella.type = 'button';
    }

    var borrar  = crear('button', 'ascf-btn-link ascf-oculto', 'Borrar');
    borrar.type = 'button';

    var fila    = crear('div', 'ascf-acciones');
    fila.appendChild(btnFirma);
    if (btnHuella) fila.appendChild(btnHuella);
    fila.appendChild(borrar);

    var error   = crear('p', 'ascf-error ascf-oculto');

    contenedor.appendChild(caja);
    contenedor.appendChild(fila);
    contenedor.appendChild(error);

    function pintar() {
      var hay = !!marca;
      var esHuella = hay && marca.tipo === 'HUELLA';

      caja.classList.toggle('ascf-previa--llena', hay);
      img.classList.toggle('ascf-oculto', !hay);
      vacia.classList.toggle('ascf-oculto', hay);
      borrar.classList.toggle('ascf-oculto', !hay);
      sello.classList.toggle('ascf-oculto', !hay);
      sello.textContent = esHuella ? 'HUELLA' : 'FIRMA';

      btnFirma.textContent = esHuella ? 'Firmar en pantalla'
                                      : (hay ? 'Volver a firmar' : 'Firmar en pantalla');
      if (btnHuella) {
        btnHuella.textContent = esHuella ? 'Volver a tomar la huella' : 'Usar huella';
      }

      if (hay) img.src = marca.imagen; else img.removeAttribute('src');
    }

    function guardarMarca(nueva) {
      if (!nueva) return;
      marca = nueva;
      error.classList.add('ascf-oculto');
      pintar();
    }

    /* Lo que le entrega la pantalla de firma. */
    var yo = {
      etiqueta: etiqueta,
      recibir: function (capturada) {
        guardarMarca({ imagen: capturada.png, jpeg: capturada.jpeg, tipo: 'FIRMA' });
      }
    };

    btnFirma.addEventListener('click', function () { armarModal().abrir(yo); });

    if (btnHuella) btnHuella.addEventListener('click', function () {
      if (!global.AscHuella) {
        error.textContent = 'Falta cargar js/script/huella.js en esta página.';
        error.classList.remove('ascf-oculto');
        return;
      }
      btnHuella.disabled = true;
      var soltar = function () { btnHuella.disabled = false; };
      global.AscHuella.capturar({ etiqueta: etiquetaH })
        .then(guardarMarca, function () { /* se ignora: ya se avisó en la ventana */ })
        .then(soltar, soltar);
    });

    borrar.addEventListener('click', function () { marca = null; pintar(); });

    pintar();

    return {
      elemento:    contenedor,
      tieneFirma:  function () { return !!marca; },
      imagen:      function () { return marca ? marca.imagen : null; },
      png:         function () { return marca ? marca.imagen : null; },  // nombre viejo
      jpeg:        function () { return marca ? marca.jpeg : null; },
      tipo:        function () { return marca ? marca.tipo : null; },
      limpiar:     function () { marca = null; error.classList.add('ascf-oculto'); pintar(); },
      marcarError: function (mensaje) {
        error.textContent = mensaje;
        error.classList.remove('ascf-oculto');
      },
      limpiarError: function () { error.classList.add('ascf-oculto'); }
    };
  }

  return { panel: panel, CFG: CFG };

}(window));
