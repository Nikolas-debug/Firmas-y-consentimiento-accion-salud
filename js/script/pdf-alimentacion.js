/* ============================================================================
 *  pdf-alimentacion.js — los dos formatos del control de alimentación, en PDF.
 *
 *  Reemplazan la exportación en Excel. El servidor ya no arma el archivo:
 *  `api/exportar.php` devuelve los registros en JSON y el PDF se dibuja aquí,
 *  con el mismo escritor que usan los consentimientos (pdf-writer.js).
 *
 *      AscPdfAlimentacion.minuta(datos).then(function (bytes) { ... });
 *      AscPdfAlimentacion.constancia(datos).then(function (bytes) { ... });
 *
 *  Devuelven una promesa porque las firmas hay que convertirlas: se guardan
 *  en PNG y pdf-writer.js solo sabe incrustar JPEG. La conversión va por un
 *  <canvas>, sin librerías.
 *
 *  Reparto cuando hubo acompañante: al paciente le corresponde UNA de cada
 *  comida y al acompañante el resto. Así dos desayunos son uno de cada quien
 *  y las sumas siguen cuadrando con lo que hay en la base.
 * ========================================================================== */

var AscPdfAlimentacion = (function (global) {
  'use strict';

  var LOGOS = {
    sanFelipe: 'images/logo-san-felipe.png',
    confort:   'images/logo-comfort-care.jpeg'
  };

  var COMIDAS = [
    { id: 'desayuno', etiqueta: 'DESAYUNO' },
    { id: 'almuerzo', etiqueta: 'ALMUERZO' },
    { id: 'cena',     etiqueta: 'CENA' }
  ];

  /* ======================================================================
   *  Imágenes
   * ==================================================================== */

  /** Cualquier imagen que el navegador sepa pintar -> JPEG base64. */
  function aJpeg(src) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () {
        try {
          var c = global.document.createElement('canvas');
          c.width = img.naturalWidth; c.height = img.naturalHeight;
          var ctx = c.getContext('2d');
          // Fondo blanco: el JPEG no tiene transparencia y sin esto lo
          // transparente sale negro.
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, c.width, c.height);
          ctx.drawImage(img, 0, 0);
          resolve({ b64: c.toDataURL('image/jpeg', 0.92).split(',')[1], w: c.width, h: c.height });
        } catch (e) { resolve(null); }
      };
      img.onerror = function () { resolve(null); };
      img.src = src;
    });
  }

  /* La columna guarda PNG (firma trazada) o JPEG (huella del lector), así
     que el tipo se saca de los primeros bytes en vez de suponerlo: un PNG
     en base64 empieza con «iVBORw0KGgo» y un JPEG con «/9j/». */
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
  function prepararImagenes(datos, cualLogo) {
    var regs = datos.registros || [];
    return Promise.all([
      aJpeg(LOGOS[cualLogo]),
      Promise.all(regs.map(function (r) { return firma(r.firma); })),
      Promise.all(regs.map(function (r) { return firma(r.firma_acompanante); }))
    ]).then(function (v) {
      return { logo: v[0], firmas: v[1], firmasA: v[2] };
    });
  }

  /* ======================================================================
   *  Utilidades
   * ==================================================================== */

  function cantidad(v) {
    var n = parseInt(v, 10);
    return (isFinite(n) && n > 0) ? n : 0;
  }

  function reparto(r) {
    var hayAcomp = !!r.acompanante_nombre;
    var paciente = {}, acompanante = {}, totalAcomp = 0;

    COMIDAS.forEach(function (c) {
      var n = cantidad(r[c.id]);
      var mio = hayAcomp ? Math.min(1, n) : n;
      paciente[c.id] = mio;
      acompanante[c.id] = n - mio;
      totalAcomp += n - mio;
    });

    return { paciente: paciente, acompanante: acompanante,
             hayAcomp: hayAcomp && totalAcomp > 0 };
  }

  function fecha(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    return m ? m[3] + '/' + m[2] + '/' + m[1] : String(iso || '');
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

  /** Texto centrado en una celda. */
  function enCelda(doc, txt, x, ancho, base, o) {
    o = o || {};
    var size = o.size || 8;
    doc.text(cabe(doc, txt, ancho - 3, size, o.bold), x + ancho / 2, base,
             { size: size, bold: o.bold, align: 'center' });
  }

  function verticales(doc, xs, y, alto) {
    xs.forEach(function (x) { doc.line(x, y, x, y + alto, { width: 0.3 }); });
  }

  /** La firma centrada en su celda, sin deformarse. */
  function firmaEnCelda(doc, nombre, img, x, ancho, y, alto) {
    if (!img) return;
    var h = alto - 2, w = h * (img.w / img.h);
    if (w > ancho - 3) { w = ancho - 3; h = w * (img.h / img.w); }
    doc.image(nombre, x + (ancho - w) / 2, y + (alto - h) / 2, w, h);
  }

  function acumula(xs, cols, inicio) {
    var r = [inicio];
    for (var i = 0; i < cols.length; i++) r.push(r[i] + cols[i]);
    return r;
  }

  /* ======================================================================
   *  1. MINUTA DE CONTROL DE ALIMENTOS  (A4 horizontal)
   * ==================================================================== */

  var MIN = {
    ancho: 297, alto: 210, margen: 10,
    // ITEM, FECHA, USUARIO, N° DOCUMENTO, DESAYUNO, ALMUERZO, CENA, FIRMA
    cols: [14, 26, 95, 32, 20, 20, 18, 52],
    altoFila: 11, filasPorHoja: 11
  };

  function encabezadoMinuta(doc, p, datos, pagina, total) {
    var M = MIN.margen, W = MIN.ancho - 2 * M, y = M;
    var altoTitulo = 24, anchoIzq = 40;

    doc.rect(M, y, W, altoTitulo, { width: 0.5 });
    doc.line(M + anchoIzq, y, M + anchoIzq, y + altoTitulo, { width: 0.5 });
    doc.image('Logo', M + 5, y + 2.5, anchoIzq - 10, altoTitulo - 5);
    doc.text('MINUTA  DE CONTROL DE ALIMENTOS',
             M + anchoIzq + (W - anchoIzq) / 2, y + 14,
             { size: 16, bold: true, align: 'center' });
    if (total > 1) {
      doc.text('Hoja ' + pagina + ' de ' + total, MIN.ancho - M - 2, y + altoTitulo - 2.5,
               { size: 7, align: 'right', gray: 0.35 });
    }
    y += altoTitulo;

    var h = 8;
    var xOpc = M + anchoIzq, xOtros = M + 150, xRot = M + 185, xVal = M + 225;
    var tipo = mayus(p.tipo_paciente);
    var marca = function (op) { return (tipo === op ? 'X   ' : '') + op; };

    // «TIPO DE PACIENTE» ocupa las dos primeras filas
    doc.rect(M, y, anchoIzq, h * 2, { width: 0.3 });
    doc.text('TIPO DE PACIENTE:', M + anchoIzq / 2, y + h + 1,
             { size: 7.5, bold: true, align: 'center' });

    doc.rect(xOpc, y, xOtros - xOpc, h, { width: 0.3 });
    doc.text(marca('EVENTO'), xOpc + 3, y + 5.5, { size: 8.5, bold: true });
    doc.rect(xOtros, y, xRot - xOtros, h, { width: 0.3 });
    enCelda(doc, marca('OTROS'), xOtros, xRot - xOtros, y + 5.5, { size: 8.5, bold: true });
    doc.rect(xRot, y, xVal - xRot, h, { width: 0.3 });
    enCelda(doc, 'DIRECION', xRot, xVal - xRot, y + 5.5, { size: 8.5, bold: true });
    doc.rect(xVal, y, MIN.ancho - M - xVal, h, { width: 0.3 });
    doc.text(cabe(doc, p.direccion || '', MIN.ancho - M - xVal - 4, 8), xVal + 2, y + 5.5, { size: 8 });
    y += h;

    doc.rect(xOpc, y, xOtros - xOpc, h, { width: 0.3 });
    doc.text(marca('HOGAR DE PASO'), xOpc + 3, y + 5.5, { size: 8.5, bold: true });
    doc.rect(xOtros, y, xRot - xOtros, h, { width: 0.3 });
    doc.text('TEL', xOtros + 3, y + 5.5, { size: 8.5, bold: true });
    // El ancho es lo que queda hasta el borde de la celda, no un número fijo:
    // con un fijo el teléfono se montaba sobre la línea.
    doc.text(cabe(doc, p.telefono || '', xRot - (xOtros + 16) - 2, 8),
             xOtros + 16, y + 5.5, { size: 8 });
    doc.rect(xRot, y, xVal - xRot, h, { width: 0.3 });
    enCelda(doc, 'DOCUMENTO', xRot, xVal - xRot, y + 5.5, { size: 8.5, bold: true });
    doc.rect(xVal, y, MIN.ancho - M - xVal, h, { width: 0.3 });
    enCelda(doc, String(p.n_doc || ''), xVal, MIN.ancho - M - xVal, y + 5.5, { size: 9.5 });
    y += h;

    doc.rect(M, y, anchoIzq, h, { width: 0.3 });
    enCelda(doc, 'NOMBRE', M, anchoIzq, y + 5.5, { size: 7.5, bold: true });
    doc.rect(M + anchoIzq, y, W - anchoIzq, h, { width: 0.3 });
    enCelda(doc, mayus(p.nombre_usuario), M + anchoIzq, W - anchoIzq, y + 5.5,
            { size: 10, bold: true });
    y += h;

    doc.rect(M, y, anchoIzq, h, { width: 0.3 });
    doc.text('ENTIDAD PRESTADORA', M + anchoIzq / 2, y + 3.4,
             { size: 6, bold: true, align: 'center' });
    doc.text('DE SALUD', M + anchoIzq / 2, y + 6.8, { size: 6, bold: true, align: 'center' });
    doc.rect(M + anchoIzq, y, xRot - (M + anchoIzq), h, { width: 0.3 });
    doc.text(cabe(doc, mayus(p.eps), xRot - M - anchoIzq - 6, 9, true),
             M + anchoIzq + 3, y + 5.5, { size: 9, bold: true });
    doc.rect(xRot, y, MIN.ancho - M - xRot, h, { width: 0.3 });
    enCelda(doc, 'FIRMA DEL USUARIO', xRot, MIN.ancho - M - xRot, y + 5.5,
            { size: 8, bold: true });
    y += h;

    var f = datos.filtros || {};
    doc.text('Rango exportado: ' + fecha(f.desde) + ' a ' + fecha(f.hasta),
             M, y + 4, { size: 6.5, gray: 0.4 });

    return y + 6.5;
  }

  function tablaMinuta(doc, trozo, img, y) {
    var M = MIN.margen, cols = MIN.cols;
    var xs = acumula(null, cols, M);
    var W = xs[xs.length - 1] - M;
    var h1 = 7, h2 = 5;

    doc.rect(M, y, W, h1 + h2, { width: 0.4 });
    ['ITEM', 'FECHA', 'USUARIO', 'N° DOCUMENTO', null, null, null, 'FIRMA'].forEach(function (t, c) {
      if (!t) return;
      if (c) doc.line(xs[c], y, xs[c], y + h1 + h2, { width: 0.3 });
      enCelda(doc, t, xs[c], cols[c], y + h1 - 1.5, { size: 7.5, bold: true });
    });

    var xC = xs[4], anchoC = cols[4] + cols[5] + cols[6];
    doc.line(xC, y, xC, y + h1 + h2, { width: 0.3 });
    doc.line(xs[7], y, xs[7], y + h1 + h2, { width: 0.3 });
    enCelda(doc, 'CANTIDAD', xC, anchoC, y + h1 - 1.5, { size: 7.5, bold: true });
    doc.line(xC, y + h1, xs[7], y + h1, { width: 0.3 });
    COMIDAS.forEach(function (c, k) {
      if (k) doc.line(xs[4 + k], y + h1, xs[4 + k], y + h1 + h2, { width: 0.3 });
      enCelda(doc, c.etiqueta, xs[4 + k], cols[4 + k], y + h1 + h2 - 1.4, { size: 5.8, bold: true });
    });
    y += h1 + h2;

    var alto = MIN.altoFila, item = 1;

    trozo.forEach(function (par) {
      var r = par.r, idx = par.i, rep = reparto(r);

      doc.rect(M, y, W, alto, { width: 0.3 });
      verticales(doc, xs.slice(1, -1), y, alto);
      var base = y + alto / 2 + 1.2;

      enCelda(doc, String(item), xs[0], cols[0], base, { size: 8 });
      enCelda(doc, fecha(r.fecha), xs[1], cols[1], base, { size: 8, bold: true });

      if (rep.hayAcomp) {
        enCelda(doc, mayus(r.nombre_usuario), xs[2], cols[2], y + alto / 2 - 0.4, { size: 7.5 });
        enCelda(doc, 'Acompañante: ' + mayus(r.acompanante_nombre) + ' — ' +
                     (r.acompanante_tipo_documento || '') + ' ' + (r.acompanante_n_doc || ''),
                xs[2], cols[2], y + alto / 2 + 3.6, { size: 5.8 });
      } else {
        enCelda(doc, mayus(r.nombre_usuario), xs[2], cols[2], base, { size: 7.5 });
      }

      enCelda(doc, String(r.n_doc || ''), xs[3], cols[3], base, { size: 8.5 });
      COMIDAS.forEach(function (c, k) {
        var n = cantidad(r[c.id]);
        enCelda(doc, n ? String(n) : '', xs[4 + k], cols[4 + k], base, { size: 8.5 });
      });

      // FIRMA: si hubo acompañante la celda se parte en dos, con su rótulo
      var xF = xs[7], anchoF = cols[7];
      if (rep.hayAcomp) {
        var mitad = anchoF / 2;
        doc.line(xF + mitad, y, xF + mitad, y + alto, { width: 0.2 });
        doc.text('P', xF + 1.4, y + 3.4, { size: 5.5, gray: 0.5 });
        doc.text('A', xF + mitad + 1.4, y + 3.4, { size: 5.5, gray: 0.5 });
        firmaEnCelda(doc, 'F' + idx, img.firmas[idx], xF, mitad, y, alto);
        firmaEnCelda(doc, 'FA' + idx, img.firmasA[idx], xF + mitad, mitad, y, alto);
      } else {
        firmaEnCelda(doc, 'F' + idx, img.firmas[idx], xF, anchoF, y, alto);
      }

      y += alto;
      item++;
    });

    // renglones en blanco, como en el formato impreso
    for (var f = trozo.length; f < MIN.filasPorHoja; f++) {
      doc.rect(M, y, W, alto, { width: 0.3 });
      verticales(doc, xs.slice(1, -1), y, alto);
      y += alto;
    }
  }

  function dibujarMinuta(datos, img) {
    var doc = new global.PDFDoc({ width: MIN.ancho, height: MIN.alto });

    if (img.logo) doc.addImage('Logo', img.logo.b64, img.logo.w, img.logo.h);
    (datos.registros || []).forEach(function (r, i) {
      if (img.firmas[i])  doc.addImage('F' + i,  img.firmas[i].b64,  img.firmas[i].w,  img.firmas[i].h);
      if (img.firmasA[i]) doc.addImage('FA' + i, img.firmasA[i].b64, img.firmasA[i].w, img.firmasA[i].h);
    });

    // Una hoja por persona: el encabezado lleva los datos de una sola.
    var porPersona = {}, orden = [];
    (datos.registros || []).forEach(function (r, i) {
      var k = String(r.id_usuario);
      if (!porPersona[k]) { porPersona[k] = []; orden.push(k); }
      porPersona[k].push({ r: r, i: i });
    });

    if (!orden.length) {
      doc.addPage();
      doc.text('No hay entregas registradas en el rango de fechas elegido.',
               MIN.margen, 30, { size: 12, bold: true });
      return doc.build();
    }

    orden.forEach(function (k) {
      var filas = porPersona[k], p = filas[0].r, trozos = [];
      for (var j = 0; j < filas.length; j += MIN.filasPorHoja) {
        trozos.push(filas.slice(j, j + MIN.filasPorHoja));
      }
      trozos.forEach(function (trozo, i) {
        doc.addPage();
        var y = encabezadoMinuta(doc, p, datos, i + 1, trozos.length);
        tablaMinuta(doc, trozo, img, y);
      });
    });

    return doc.build();
  }

  /* ======================================================================
   *  2. CONSTANCIA CONS-RVAS-005  (Confort Care, A4 vertical)
   *
   *  Una hoja por persona y tipo de comida, con una fila por ración. El
   *  acompañante va en su propia hoja, con su nombre y su documento: la
   *  constancia es de una sola persona, y mezclarlos contradiría el
   *  encabezado.
   * ==================================================================== */

  var CON = {
    ancho: 210, alto: 297, margen: 12,
    cols: [16, 34, 46, 50, 40],   // N°, FECHA, DESTINO, TIPO, FIRMA
    altoFila: 13, filasPorHoja: 13
  };

  /** Arma los bloques: una entrada por persona + comida, con sus raciones. */
  function bloquesConstancia(datos) {
    var mapa = {}, orden = [];

    (datos.registros || []).forEach(function (r, i) {
      var rep = reparto(r);

      var quienes = [{
        clave: 'P' + r.id_usuario,
        nombre: mayus(r.nombre_usuario),
        doc: r.n_doc,
        cant: rep.paciente,
        firmaImg: 'F' + i,
        idx: i, deAcomp: false
      }];

      if (rep.hayAcomp) {
        quienes.push({
          clave: 'A' + (r.id_acompanante || r.acompanante_n_doc),
          nombre: mayus(r.acompanante_nombre) + ' (ACOMPAÑANTE)',
          doc: r.acompanante_n_doc,
          cant: rep.acompanante,
          firmaImg: 'FA' + i,
          idx: i, deAcomp: true
        });
      }

      quienes.forEach(function (q) {
        COMIDAS.forEach(function (c) {
          var n = q.cant[c.id];
          if (!n) return;
          var k = q.clave + '|' + c.id;
          if (!mapa[k]) {
            mapa[k] = { nombre: q.nombre, doc: q.doc, comida: c.etiqueta, filas: [] };
            orden.push(k);
          }
          for (var t = 0; t < n; t++) {
            mapa[k].filas.push({
              fecha: r.fecha,
              destino: r.destino || '',
              firmaImg: q.firmaImg,
              idx: q.idx,
              deAcomp: q.deAcomp
            });
          }
        });
      });
    });

    return orden.map(function (k) { return mapa[k]; });
  }

  function hojaConstancia(doc, bloque, trozo, img, pagina, total) {
    var M = CON.margen, W = CON.ancho - 2 * M, y = M;

    /* --- encabezado: logo | título | código --- */
    var h = 22, anchoLogo = 45, anchoCod = 45;
    doc.rect(M, y, W, h, { width: 0.5 });
    doc.line(M + anchoLogo, y, M + anchoLogo, y + h, { width: 0.4 });
    doc.line(M + W - anchoCod, y, M + W - anchoCod, y + h, { width: 0.4 });
    if (img.logo) doc.image('Logo', M + 4, y + 5, anchoLogo - 8, h - 10);

    var xT = M + anchoLogo, anchoT = W - anchoLogo - anchoCod;
    doc.text('CONSTANCIA DE PRESTACIÓN DE SERVICIO', xT + anchoT / 2, y + 9,
             { size: 9, bold: true, align: 'center' });
    doc.text('DE ALIMENTACIÓN', xT + anchoT / 2, y + 14.5,
             { size: 9, bold: true, align: 'center' });

    var xC = M + W - anchoCod;
    doc.text('Codigo: CONS-RVAS-005', xC + 2, y + 6.5, { size: 6.5, bold: true });
    doc.text('Fecha de vigencia: 22-03-2024', xC + 2, y + 11.5, { size: 6.5, bold: true });
    doc.text('Versión: 01', xC + 2, y + 16.5, { size: 6.5, bold: true });
    y += h + 5;

    /* --- a quién --- */
    doc.rect(M, y, W, 10, { width: 0.3 });
    doc.text('NOMBRE: ' + cabe(doc, bloque.nombre, W - 26, 10, true), M + 3, y + 6.6,
             { size: 10, bold: true });
    y += 10;
    doc.rect(M, y, W, 10, { width: 0.3 });
    doc.text('N° ID: ' + String(bloque.doc || ''), M + 3, y + 6.6, { size: 10, bold: true });
    y += 10;

    if (total > 1) {
      doc.text('Hoja ' + pagina + ' de ' + total, M + W, y + 4,
               { size: 6.5, align: 'right', gray: 0.4 });
    }
    y += 6;

    /* --- tabla --- */
    var cols = CON.cols, xs = acumula(null, cols, M), hCab = 14;

    doc.rect(M, y, W, hCab, { width: 0.4 });
    ['N°', 'FECHA', 'DESTINO', null, 'FIRMA'].forEach(function (t, c) {
      if (c) doc.line(xs[c], y, xs[c], y + hCab, { width: 0.3 });
      if (t) enCelda(doc, t, xs[c], cols[c], y + hCab / 2 + 1.2, { size: 8, bold: true });
    });
    // el rótulo largo va en tres líneas
    enCelda(doc, 'TIPO DE ALIMENTACION', xs[3], cols[3], y + 5, { size: 6.5, bold: true });
    enCelda(doc, '(DESAYUNO /ALMERZO O', xs[3], cols[3], y + 9, { size: 6.5, bold: true });
    enCelda(doc, 'CENA)', xs[3], cols[3], y + 13, { size: 6.5, bold: true });
    y += hCab;

    var alto = CON.altoFila;
    trozo.forEach(function (fila, k) {
      doc.rect(M, y, W, alto, { width: 0.3 });
      verticales(doc, xs.slice(1, -1), y, alto);
      var base = y + alto / 2 + 1.2;

      enCelda(doc, String((pagina - 1) * CON.filasPorHoja + k + 1), xs[0], cols[0], base, { size: 8.5 });
      enCelda(doc, fecha(fila.fecha), xs[1], cols[1], base, { size: 8.5, bold: true });
      enCelda(doc, mayus(fila.destino), xs[2], cols[2], base, { size: 8 });
      enCelda(doc, bloque.comida, xs[3], cols[3], base, { size: 8.5, bold: true });

      var im = fila.deAcomp ? img.firmasA[fila.idx] : img.firmas[fila.idx];
      firmaEnCelda(doc, fila.firmaImg, im, xs[4], cols[4], y, alto);
      y += alto;
    });

    for (var f = trozo.length; f < CON.filasPorHoja; f++) {
      doc.rect(M, y, W, alto, { width: 0.3 });
      verticales(doc, xs.slice(1, -1), y, alto);
      y += alto;
    }
  }

  function dibujarConstancia(datos, img) {
    var doc = new global.PDFDoc({ width: CON.ancho, height: CON.alto });

    if (img.logo) doc.addImage('Logo', img.logo.b64, img.logo.w, img.logo.h);
    (datos.registros || []).forEach(function (r, i) {
      if (img.firmas[i])  doc.addImage('F' + i,  img.firmas[i].b64,  img.firmas[i].w,  img.firmas[i].h);
      if (img.firmasA[i]) doc.addImage('FA' + i, img.firmasA[i].b64, img.firmasA[i].w, img.firmasA[i].h);
    });

    var bloques = bloquesConstancia(datos);

    if (!bloques.length) {
      doc.addPage();
      doc.text('No hay entregas de Confort Care registradas en el rango elegido.',
               CON.margen, 30, { size: 11, bold: true });
      return doc.build();
    }

    bloques.forEach(function (b) {
      var trozos = [];
      for (var j = 0; j < b.filas.length; j += CON.filasPorHoja) {
        trozos.push(b.filas.slice(j, j + CON.filasPorHoja));
      }
      trozos.forEach(function (trozo, i) {
        doc.addPage();
        hojaConstancia(doc, b, trozo, img, i + 1, trozos.length);
      });
    });

    return doc.build();
  }

  /* ==================================================================== */

  return {
    minuta: function (datos) {
      return prepararImagenes(datos, 'sanFelipe').then(function (img) {
        return dibujarMinuta(datos, img);
      });
    },
    constancia: function (datos) {
      return prepararImagenes(datos, 'confort').then(function (img) {
        return dibujarConstancia(datos, img);
      });
    },
    // se exponen para las pruebas
    _reparto: reparto,
    _bloques: bloquesConstancia
  };

}(window));
