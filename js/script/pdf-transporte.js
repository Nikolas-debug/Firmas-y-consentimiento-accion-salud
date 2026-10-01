/* ============================================================================
 *  pdf-transporte.js — la constancia de prestación de servicio de transporte
 *  urbano (CONS-RVAS-005), en PDF.
 *
 *      AscPdfTransporte.constancia(datos).then(function (bytes) { ... });
 *
 *  `datos` es lo que devuelve api/exportar-transporte.php.
 *
 *  Una hoja por persona y mes, como el formato impreso: 31 renglones con
 *  N° | FECHA | TRANSPORTE | FIRMA | CANTIDAD, y las observaciones al pie.
 *  La firma es la del mes y se repite en cada renglón firmado; los que
 *  siguen pendientes salen con la casilla vacía.
 *
 *  Devuelve una promesa porque las firmas hay que convertirlas: pdf-writer.js
 *  solo sabe incrustar JPEG, y se guardan en PNG o JPEG según cómo se hayan
 *  tomado. La conversión va por un <canvas>, sin librerías.
 * ========================================================================== */

var AscPdfTransporte = (function (global) {
  'use strict';

  var LOGO = 'images/logo-san-felipe.png';

  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
               'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  /* El formato impreso trae 31 renglones fijos, uno por día del mes. Acá el
     número se ajusta a lo que haya: con pocos viajes la hoja trae menos
     renglones y cada uno queda más alto, que es lo que le da aire a la
     firma. Con el mes lleno vuelve a los 31 de 5.5 mm, que es lo máximo que
     cabe en carta.

       5 viajes  -> 12 renglones de 11 mm   -> firma de ~9.8 mm
      20 viajes  -> 25 renglones de 6.9 mm  -> firma de ~5.7 mm
      31 viajes  -> 31 renglones de 5.5 mm  -> firma de ~4.3 mm            */
  var TR = {
    ancho: 215.9, alto: 279.4, margen: 12,
    // N°, FECHA, TRANSPORTE, FIRMA, CANTIDAD
    cols: [14, 31, 63, 58, 26],
    encAlto: 26, encLogo: 36, encCod: 42,
    altoObs: 18,

    filasTope: 31,   // lo que trae el formato: un día del mes por renglón
    filasMin:  12,   // debajo de esto la hoja se ve vacía
    colchon:    5,   // renglones en blanco de más, para anotar a mano
    altoMax:   11,   // el mismo de la minuta de alimentación
    altoMin:  5.5,

    // Lo que queda para la tabla después del encabezado, los dos renglones
    // de identificación, la cabecera, el recuadro de observaciones y los
    // márgenes. Sale de los valores de arriba, no de un número a mano.
    disponible: function () {
      return this.alto - (this.margen + this.encAlto + 8 + 16 + 5 + 7 + 4 +
                          this.altoObs + this.margen);
    }
  };

  /** Cuántos renglones y de qué alto, para una hoja con `usados` viajes. */
  function layout(usados) {
    var filas = Math.max(TR.filasMin,
                         Math.min(TR.filasTope, usados + TR.colchon));
    var alto = Math.min(TR.altoMax, TR.disponible() / filas);
    if (alto < TR.altoMin) alto = TR.altoMin;
    return { filas: filas, alto: alto, firma: alto - 1.2 };
  }

  /* ======================================================================
   *  Imágenes
   * ==================================================================== */

  function aJpeg(src) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () {
        try {
          var c = global.document.createElement('canvas');
          c.width = img.naturalWidth; c.height = img.naturalHeight;
          var ctx = c.getContext('2d');
          // El JPEG no tiene transparencia: sin fondo blanco lo transparente
          // sale negro.
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, c.width, c.height);
          ctx.drawImage(img, 0, 0);
          resolve({ b64: c.toDataURL('image/jpeg', 0.92).split(',')[1],
                    w: c.width, h: c.height });
        } catch (e) { resolve(null); }
      };
      img.onerror = function () { resolve(null); };
      img.src = src;
    });
  }

  /* La columna guarda PNG (firma trazada) o JPEG (huella), así que el tipo
     se saca de los primeros bytes en vez de suponerlo. */
  function tipoDeImagen(b64) {
    if (b64.indexOf('iVBOR') === 0) return 'image/png';
    if (b64.indexOf('/9j/')  === 0) return 'image/jpeg';
    return 'image/png';
  }

  function firma(b64) {
    return b64 ? aJpeg('data:' + tipoDeImagen(b64) + ';base64,' + b64)
               : Promise.resolve(null);
  }

  /** Convierte de una sola vez el logo y todas las firmas del lote. */
  function prepararImagenes(datos) {
    var regs = datos.registros || [];
    return Promise.all([
      aJpeg(LOGO),
      Promise.all(regs.map(function (r) { return firma(r.firma); }))
    ]).then(function (v) {
      return { logo: v[0], firmas: v[1] };
    });
  }

  /* ======================================================================
   *  Utilidades
   * ==================================================================== */

  function fecha(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    return m ? m[3] + '/' + m[2] + '/' + m[1] : String(iso || '');
  }

  function periodoDe(iso) { return String(iso || '').slice(0, 7); }

  function mesLargo(periodo) {
    var m = /^(\d{4})-(\d{2})$/.exec(periodo || '');
    return m ? MESES[Number(m[2]) - 1] + ' de ' + m[1] : (periodo || '');
  }

  function mayus(s) { return String(s == null ? '' : s).toUpperCase(); }

  /** Recorta el texto para que no se salga del ancho dado. */
  function cabe(doc, txt, anchoMM, size, bold) {
    txt = String(txt == null ? '' : txt);
    if (doc.widthOf(txt, size, bold) <= anchoMM) return txt;
    while (txt.length > 1 && doc.widthOf(txt + '...', size, bold) > anchoMM) {
      txt = txt.slice(0, -1);
    }
    return txt + '...';
  }

  function enCelda(doc, txt, x, ancho, base, o) {
    o = o || {};
    var size = o.size || 8;
    doc.text(cabe(doc, txt, ancho - 3, size, o.bold), x + ancho / 2, base,
             { size: size, bold: o.bold, align: 'center' });
  }

  function acumula(cols, inicio) {
    var r = [inicio];
    for (var i = 0; i < cols.length; i++) r.push(r[i] + cols[i]);
    return r;
  }

  function firmaEnCelda(doc, nombre, img, x, ancho, y, alto) {
    if (!img) return;
    var h = alto - 1.2, w = h * (img.w / img.h);
    if (w > ancho - 3) { w = ancho - 3; h = w * (img.h / img.w); }
    doc.image(nombre, x + (ancho - w) / 2, y + (alto - h) / 2, w, h);
  }

  /* ======================================================================
   *  Agrupación: una hoja por persona y mes
   * ==================================================================== */

  function bloques(registros) {
    var mapa = {}, orden = [];

    registros.forEach(function (r, i) {
      var clave = r.id_usuario + '|' + periodoDe(r.fecha);
      if (!mapa[clave]) {
        mapa[clave] = { persona: r, periodo: periodoDe(r.fecha), filas: [] };
        orden.push(clave);
      }
      mapa[clave].filas.push({ r: r, idx: i });
    });

    return orden.map(function (k) { return mapa[k]; });
  }

  /* ======================================================================
   *  La hoja
   * ==================================================================== */

  function encabezado(doc, b) {
    var M = TR.margen, W = TR.ancho - 2 * M, y = M;
    var xTit = M + TR.encLogo, xCod = M + W - TR.encCod;

    doc.rect(M, y, W, TR.encAlto, { width: 0.5 });
    doc.line(xTit, y, xTit, y + TR.encAlto, { width: 0.5 });
    doc.line(xCod, y, xCod, y + TR.encAlto, { width: 0.5 });

    if (b.logo) {
      var cw = TR.encLogo - 4, ch = TR.encAlto - 4;
      var lw = cw, lh = lw * b.logo.h / b.logo.w;
      if (lh > ch) { lh = ch; lw = lh * b.logo.w / b.logo.h; }
      doc.image('ImLogo', M + (TR.encLogo - lw) / 2, y + (TR.encAlto - lh) / 2, lw, lh);
    }

    var cx = (xTit + xCod) / 2;
    doc.text('CONSTANCIA DE PRESTACIÓN DE SERVICIO DE', cx, y + 11, { size: 11, bold: true, align: 'center' });
    doc.text('TRANSPORTE URBANO',                        cx, y + 17.5, { size: 11, bold: true, align: 'center' });

    var xc = xCod + 2.4;
    doc.text('Codigo: CONS-RVAS-005',          xc, y + 8.5,  { size: 6.6, bold: true });
    doc.text('Fecha de vigencia: 01/04/2026',  xc, y + 14,   { size: 6.6, bold: true });
    doc.text('Versión: 01',                    xc, y + 19.5, { size: 6.6, bold: true });

    return y + TR.encAlto;
  }

  function hoja(doc, b, img, pagina, total, lay) {
    var M = TR.margen, W = TR.ancho - 2 * M;
    var p = b.persona;

    var y = encabezado(doc, b) + 8;

    /* NOMBRE y N° ID, cada uno sobre su línea, como en el formato. */
    var linea = function (etiqueta, valor) {
      var fin = doc.text(etiqueta, M, y, { size: 10, bold: true });
      if (valor) doc.text(valor, fin + 2, y, { size: 10, bold: true });
      doc.line(fin + 1, y + 1.4, M + W, y + 1.4, { width: 0.4 });
      y += 8;
    };
    linea('NOMBRE: ', mayus(p.nombre_usuario));
    linea('N° ID: ',  String(p.n_doc || ''));

    doc.text('Mes de ' + mesLargo(b.periodo), M, y, { size: 8.4, italic: true });
    if (total > 1) {
      doc.text('Hoja ' + pagina + ' de ' + total, M + W, y,
               { size: 8.4, italic: true, align: 'right' });
    }
    y += 5;

    /* --- la tabla --- */
    var xs = acumula(TR.cols, M);
    var ALTO_ENC = 7;

    doc.rect(M, y, W, ALTO_ENC, { width: 0.5 });
    ['  N°  ', 'FECHA', 'TRANSPORTE', 'FIRMA', 'CANTIDAD'].forEach(function (t, i) {
      enCelda(doc, t, xs[i], TR.cols[i], y + 4.8, { size: 8, bold: true });
      if (i) doc.line(xs[i], y, xs[i], y + ALTO_ENC, { width: 0.4 });
    });
    y += ALTO_ENC;

    var filas = b.filas;
    for (var i = 0; i < lay.filas; i++) {
      var f = filas[i];
      doc.rect(M, y, W, lay.alto, { width: 0.3 });
      for (var j = 1; j < xs.length - 1; j++) {
        doc.line(xs[j], y, xs[j], y + lay.alto, { width: 0.3 });
      }

      // El texto va centrado verticalmente en el renglón, que ya no siempre
      // mide lo mismo.
      var base = y + lay.alto / 2 + 1.3;

      enCelda(doc, String(i + 1), xs[0], TR.cols[0], base, { size: 7.6 });

      if (f) {
        var r = f.r;
        enCelda(doc, fecha(r.fecha),           xs[1], TR.cols[1], base, { size: 7.6 });
        enCelda(doc, mayus(r.tipo_transporte), xs[2], TR.cols[2], base, { size: 7.2 });
        enCelda(doc, String(r.cantidad || 1),  xs[4], TR.cols[4], base, { size: 7.6 });
        firmaEnCelda(doc, 'F' + f.idx, img.firmas[f.idx], xs[3], TR.cols[3], y, lay.alto);
      }

      y += lay.alto;
    }

    /* --- observaciones --- */
    y += 4;
    doc.rect(M, y, W, TR.altoObs, { width: 0.5 });
    doc.text('OBSERVACIONES:', M + 2, y + 5, { size: 8.4, bold: true });

    var obs = [];
    filas.forEach(function (f) {
      var t = String(f.r.observaciones || '').trim();
      if (t) obs.push(fecha(f.r.fecha) + ': ' + t);
    });
    if (obs.length) {
      doc.paragraph([{ s: obs.join('   ·   ') }], M + 2, y + 10, W - 4,
                    { size: 7.4, lineHeight: 3.4, justify: false });
    }

    /* Lo que todavía no se ha firmado, dicho en el pie: así nadie entrega un
       formato incompleto creyendo que está listo. */
    var pend = filas.filter(function (f) { return f.r.estado !== 'FIRMADO'; }).length;
    if (pend) {
      doc.text(pend === 1 ? '1 renglón sin firmar.' : pend + ' renglones sin firmar.',
               M + W, y + TR.altoObs + 4, { size: 7.4, italic: true, align: 'right' });
    }
  }

  /* ======================================================================
   *  Armado
   * ==================================================================== */

  function dibujar(datos, img) {
    var doc = new PDFDoc({ width: TR.ancho, height: TR.alto });
    if (img.logo) doc.addImage('ImLogo', img.logo.b64, img.logo.w, img.logo.h);

    (datos.registros || []).forEach(function (r, i) {
      if (img.firmas[i]) doc.addImage('F' + i, img.firmas[i].b64,
                                      img.firmas[i].w, img.firmas[i].h);
    });

    var grupos = bloques(datos.registros || []);

    if (!grupos.length) {
      doc.addPage();
      doc.text('No hay viajes registrados en el rango consultado.',
               TR.ancho / 2, 60, { size: 11, align: 'center' });
      return doc.build();
    }

    grupos.forEach(function (b) {
      b.logo = img.logo;
      // Si a alguien le caben más de 31 viajes en un mes, se parte en hojas.
      var trozos = [];
      for (var i = 0; i < b.filas.length; i += TR.filasTope) {
        trozos.push(b.filas.slice(i, i + TR.filasTope));
      }
      if (!trozos.length) trozos = [[]];

      /* Todas las hojas de una misma persona y mes llevan el mismo alto de
         renglón: lo manda la más llena, para que no se vean dispares. */
      var mayor = trozos.reduce(function (n, t) { return Math.max(n, t.length); }, 0);
      var lay = layout(mayor);

      trozos.forEach(function (trozo, i) {
        doc.addPage();
        hoja(doc, { persona: b.persona, periodo: b.periodo, filas: trozo, logo: img.logo },
             img, i + 1, trozos.length, lay);
      });
    });

    return doc.build();
  }

  /* ==================================================================== */

  return {
    constancia: function (datos) {
      return prepararImagenes(datos).then(function (img) {
        return dibujar(datos, img);
      });
    },
    // se exponen para las pruebas
    _bloques: bloques,
    _layout: layout
  };

}(window));
