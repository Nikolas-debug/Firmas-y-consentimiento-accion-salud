const PDFDoc = (function () {
  'use strict';
  const WH = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,0,556,0,222,556,333,1000,556,556,333,1000,667,333,1000,0,611,0,0,222,222,333,333,350,556,1000,333,1000,500,333,944,0,500,667,278,333,556,556,556,556,260,556,333,737,370,556,584,278,737,333,400,584,333,333,333,556,537,278,333,333,365,556,834,834,834,611,667,667,667,667,667,667,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,500,556,556,556,556,278,278,278,278,556,556,556,556,556,556,556,584,611,556,556,556,556,500,556,500];
  const WB = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584,0,556,0,278,556,500,1000,556,556,333,1000,667,333,1000,0,611,0,0,278,278,500,500,350,556,1000,333,1000,556,333,944,0,500,667,278,333,556,556,556,556,280,556,333,737,370,556,584,278,737,333,400,584,333,333,333,611,556,278,333,333,365,556,834,834,834,611,722,722,722,722,722,722,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,556,556,556,556,556,278,278,278,278,611,611,611,611,611,611,611,584,611,611,611,611,611,556,611,556];
  const WTR = [250,333,408,500,500,833,778,180,333,333,500,564,250,333,250,278,500,500,500,500,500,500,500,500,500,500,278,278,564,564,564,444,921,722,667,667,722,611,556,722,722,333,389,722,611,889,722,722,556,722,667,556,611,722,722,944,722,722,611,333,278,333,469,500,333,444,500,444,500,444,333,500,500,278,278,500,278,778,500,500,500,500,333,389,278,500,500,722,500,500,444,480,200,480,541,0,500,0,333,500,444,1000,500,500,333,1000,556,333,889,0,611,0,0,333,333,444,444,350,500,1000,333,980,389,333,722,0,444,722,250,333,500,500,500,500,200,500,333,760,276,500,564,333,760,333,400,564,300,300,333,500,453,250,333,300,310,500,750,750,750,444,722,722,722,722,722,722,889,667,611,611,611,611,333,333,333,333,722,722,722,722,722,722,722,564,722,722,722,722,722,722,556,500,444,444,444,444,444,444,667,444,444,444,444,444,278,278,278,278,500,500,500,500,500,500,500,564,500,500,500,500,500,500,500,500];
  const WTB = [250,333,555,500,500,1000,833,278,333,333,500,570,250,333,250,278,500,500,500,500,500,500,500,500,500,500,333,333,570,570,570,500,930,722,667,722,722,667,611,778,778,389,500,778,667,944,722,778,611,778,722,556,667,722,722,1000,722,722,667,333,278,333,581,500,333,500,556,444,556,444,333,500,556,278,333,556,278,833,556,500,556,556,444,389,333,556,500,722,500,500,444,394,220,394,520,0,500,0,333,500,500,1000,500,500,333,1000,556,333,1000,0,667,0,0,333,333,500,500,350,500,1000,333,1000,389,333,722,0,444,722,250,333,500,500,500,500,220,500,333,747,300,500,570,333,747,333,400,570,300,300,333,556,540,250,333,300,330,500,750,750,750,500,722,722,722,722,722,722,1000,722,667,667,667,667,389,389,389,389,722,722,778,778,778,778,778,570,778,722,722,722,722,722,611,556,500,500,500,500,500,500,722,444,444,444,444,444,278,278,278,278,500,556,500,500,500,500,500,570,500,556,556,556,556,500,556,500];
  const WTI = [250,333,420,500,500,833,778,214,333,333,500,675,250,333,250,278,500,500,500,500,500,500,500,500,500,500,333,333,675,675,675,500,920,611,611,667,722,611,611,722,722,333,444,667,556,833,667,722,611,722,611,500,556,722,611,833,611,556,556,389,278,389,422,500,333,500,500,444,500,444,278,500,500,278,278,444,278,722,500,500,500,500,389,389,278,500,444,667,444,444,389,400,275,400,541,0,500,0,333,500,556,889,500,500,333,1000,500,333,944,0,556,0,0,333,333,556,556,350,500,889,333,980,389,333,667,0,389,556,250,389,500,500,500,500,275,500,333,760,276,500,675,333,760,333,400,675,300,300,333,500,523,250,333,300,310,500,750,750,750,500,611,611,611,611,611,611,889,667,611,611,611,611,333,333,333,333,722,667,722,722,722,722,722,675,722,722,722,722,722,556,611,500,500,500,500,500,500,500,667,444,444,444,444,444,278,278,278,278,500,500,500,500,500,500,500,675,500,500,500,500,500,444,500,444];
  const WTBI = [250,389,555,500,500,833,778,278,333,333,500,570,250,333,250,278,500,500,500,500,500,500,500,500,500,500,333,333,570,570,570,500,832,667,667,667,722,667,667,722,778,389,500,667,611,889,722,722,611,722,667,556,611,722,667,889,667,611,611,333,278,333,570,500,333,500,500,444,500,444,333,500,556,278,278,500,278,778,556,500,500,500,389,389,278,556,444,667,500,444,389,348,220,348,570,0,500,0,333,500,500,1000,500,500,333,1000,556,333,944,0,611,0,0,333,333,500,500,350,500,1000,333,1000,389,333,722,0,389,611,250,389,500,500,500,500,220,500,333,747,266,500,606,333,747,333,400,570,300,300,333,576,500,250,333,300,300,500,750,750,750,500,667,667,667,667,667,667,944,667,667,667,667,667,389,389,389,389,722,722,722,722,722,722,722,570,722,722,722,722,722,611,611,500,500,500,500,500,500,500,722,444,444,444,444,444,278,278,278,278,500,556,500,500,500,500,500,570,500,556,556,556,556,444,500,444];
  const FAMILIAS = {
    helvetica: {
      fuentes: ['Helvetica', 'Helvetica-Bold', 'Helvetica-Oblique', 'Helvetica-BoldOblique'],
      anchos:  [WH, WB, WH, WB]
    },
    times: {
      fuentes: ['Times-Roman', 'Times-Bold', 'Times-Italic', 'Times-BoldItalic'],
      anchos:  [WTR, WTB, WTI, WTBI]
    }
  };

  const variante = (bold, italic) => (bold ? 1 : 0) + (italic ? 2 : 0);

  const HIGH = { 0x20AC:128,0x201A:130,0x0192:131,0x201E:132,0x2026:133,0x2020:134,
    0x2021:135,0x02C6:136,0x2030:137,0x0160:138,0x2039:139,0x0152:140,0x017D:142,
    0x2018:145,0x2019:146,0x201C:147,0x201D:148,0x2022:149,0x2013:150,0x2014:151,
    0x02DC:152,0x2122:153,0x0161:154,0x203A:155,0x0153:156,0x017E:158,0x0178:159 };

  function toWinAnsi(str) {
    let out = '';
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      let b;
      if (c < 0x80) b = c;
      else if (HIGH[c] !== undefined) b = HIGH[c];
      else if (c <= 0xFF) b = c;
      else b = 63; // '?'
      out += String.fromCharCode(b);
    }
    return out;
  }

  function escapePDF(bin) {
    return bin.replace(/[\\()]/g, '\\$&').replace(/\r/g, '\\r');
  }

  const MM = 2.8346456693;

  function PDFDocument(opts) {
    opts = opts || {};
    this.wMM = opts.width || 210;
    this.hMM = opts.height || 297;
    this.pages = [];
    this.images = {};
    this.current = null;
    this.familia = FAMILIAS[opts.familia] ? opts.familia : 'helvetica';
  }

  PDFDocument.prototype.addPage = function () {
    this.current = { ops: '' };
    this.pages.push(this.current);
    return this.pages.length;
  };

  PDFDocument.prototype.pageCount = function () { return this.pages.length; };


  PDFDocument.prototype._y = function (yMM) { return (this.hMM - yMM) * MM; };
  PDFDocument.prototype._x = function (xMM) { return xMM * MM; };

  PDFDocument.prototype.widthOf = function (str, size, bold, italic) {
    const tbl = FAMILIAS[this.familia].anchos[variante(bold, italic)];
    const bin = toWinAnsi(str);
    let w = 0;
    for (let i = 0; i < bin.length; i++) {
      const c = bin.charCodeAt(i);
      w += (c >= 32 && c <= 255) ? (tbl[c - 32] || 0) : 0;
    }
    return w * size / 1000 / MM;
  };

  PDFDocument.prototype.text = function (str, xMM, yMM, o) {
    o = o || {};
    const size = o.size || 11;
    const bold = !!o.bold, italic = !!o.italic;
    let x = xMM;
    const tc = o.tracking || 0;
    const extra = tc * Math.max(0, str.length - 1) / MM;
    const anchoTotal = this.widthOf(str, size, bold, italic) + extra;
    if (o.align === 'center') x = xMM - anchoTotal / 2;
    else if (o.align === 'right') x = xMM - anchoTotal;
    const font = '/F' + (variante(bold, italic) + 1);
    const color = o.rgb ? colorRGB(o.rgb) + ' rg' : ((o.gray !== undefined ? o.gray : 0) + ' g');
    this.current.ops += 'BT ' + color + ' ' + font + ' ' + size + ' Tf ' +
      (tc ? tc + ' Tc ' : '') +
      this._x(x).toFixed(2) + ' ' + this._y(yMM).toFixed(2) + ' Td (' +
      escapePDF(toWinAnsi(str)) + ') Tj ' + (tc ? '0 Tc ' : '') + 'ET\n';
    return x + anchoTotal;
  };

  function colorRGB(rgb) {
    return rgb.map(function (v) {
      return (Math.max(0, Math.min(255, v)) / 255).toFixed(3);
    }).join(' ');
  }


  function trazo(o) {
    const ancho = (o.width || 0.35) + ' w ';
    if (o.rgb) return ancho + colorRGB(o.rgb) + ' RG ';
    return ancho + (o.gray !== undefined ? o.gray : 0) + ' G ';
  }

  PDFDocument.prototype.line = function (x1, y1, x2, y2, o) {
    o = o || {};
    this.current.ops += trazo(o) +
      this._x(x1).toFixed(2) + ' ' + this._y(y1).toFixed(2) + ' m ' +
      this._x(x2).toFixed(2) + ' ' + this._y(y2).toFixed(2) + ' l S\n';
  };

  PDFDocument.prototype.rect = function (x, y, w, h, o) {
    o = o || {};
    const relleno = o.relleno ? colorRGB(o.relleno) + ' rg ' : '';
    const pintar = o.relleno ? (o.sinBorde ? 'f' : 'B') : 'S';
    this.current.ops += (o.sinBorde ? '' : trazo(o)) + relleno +
      this._x(x).toFixed(2) + ' ' + this._y(y + h).toFixed(2) + ' ' +
      (w * MM).toFixed(2) + ' ' + (h * MM).toFixed(2) + ' re ' + pintar + '\n';
  };


  PDFDocument.prototype.addImage = function (name, jpegBase64, wPx, hPx) {
    this.images[name] = { data: atob(jpegBase64), w: wPx, h: hPx };
  };

  PDFDocument.prototype.image = function (name, xMM, yMM, wMM, hMM) {
    this.current.ops += 'q ' + (wMM * MM).toFixed(2) + ' 0 0 ' + (hMM * MM).toFixed(2) + ' ' +
      this._x(xMM).toFixed(2) + ' ' + this._y(yMM + hMM).toFixed(2) + ' cm /' + name + ' Do Q\n';
  };

  PDFDocument.prototype.paragraph = function (runs, xMM, yMM, widthMM, o) {
    o = o || {};
    const size = o.size || 11;
    const lh = o.lineHeight || (size * 1.35 / MM); 
    const justify = o.justify !== false;
    const indent = o.hangingIndent || 0;
    const medir = !!o.medir;

    const words = [];
    runs.forEach((r) => {
      const parts = String(r.s).split(/(\s+)/);
      parts.forEach((p) => {
        if (p === '' ) return;
        if (/^\s+$/.test(p)) { if (words.length) words[words.length - 1].space = true; return; }
        words.push({ t: p, bold: !!r.bold, it: !!r.italic, ul: !!r.underline, space: false });
      });
    });
    const spaceW = this.widthOf(' ', size, false);
    const lines = [];
    let line = [], lineW = 0;
    let avail = widthMM;
    words.forEach((w) => {
      const ww = this.widthOf(w.t, size, w.bold, w.it);
      const prev = line.length ? line[line.length - 1] : null;
      const gap = prev ? (prev.space ? spaceW : 0) : 0;
      if (line.length && lineW + gap + ww > avail) {
        lines.push({ words: line, w: lineW });
        line = [w]; lineW = ww;
        avail = widthMM - indent;
      } else {
        line.push(w); lineW += gap + ww;
      }
    });
    if (line.length) lines.push({ words: line, w: lineW });

    let y = yMM;
    lines.forEach((ln, li) => {
      const isLast = (li === lines.length - 1);
      const startX = xMM + (li === 0 ? 0 : indent);
      const maxW = widthMM - (li === 0 ? 0 : indent);
      const huecos = ln.words.slice(0, -1).filter((w) => w.space).length;
      const extra = (justify && !isLast && huecos > 0) ? (maxW - ln.w) / huecos : 0;
      let x = startX;
      let ulStart = null;
      ln.words.forEach((w, wi) => {
        const ww = this.widthOf(w.t, size, w.bold, w.it);
        if (!medir) this.text(w.t, x, y, { size: size, bold: w.bold, italic: w.it });
        const next = ln.words[wi + 1];
        if (w.ul && ulStart === null) ulStart = x;
        const gap = next ? (w.space ? spaceW + extra : 0) : 0;
        if (w.ul && !(next && next.ul)) {
          if (!medir) this.line(ulStart, y + 1.1, x + ww, y + 1.1, { width: 0.3 });
          ulStart = null;
        }
        x += ww + gap;
      });
      y += lh;
    });
    return y;
  };

  PDFDocument.prototype.build = function () {
    const objs = []; 
    const push = (s) => { objs.push(s); return objs.length; };

    const nCatalog = 1, nPages = 2;
    objs.push(''); objs.push('');

    const nFonts = FAMILIAS[this.familia].fuentes.map(function (nombre) {
      return push('<< /Type /Font /Subtype /Type1 /BaseFont /' + nombre +
                  ' /Encoding /WinAnsiEncoding >>');
    });

    const imgRefs = [];
    Object.keys(this.images).forEach((name) => {
      const im = this.images[name];
      const n = push('<< /Type /XObject /Subtype /Image /Width ' + im.w + ' /Height ' + im.h +
        ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' +
        im.data.length + ' >>\nstream\n' + im.data + '\nendstream');
      imgRefs.push({ name: name, n: n });
    });

    let xobj = '';
    imgRefs.forEach((r) => { xobj += '/' + r.name + ' ' + r.n + ' 0 R '; });
    const fuentes = nFonts.map(function (n, i) {
      return '/F' + (i + 1) + ' ' + n + ' 0 R';
    }).join(' ');
    const resources = '<< /Font << ' + fuentes + ' >>' +
      (xobj ? ' /XObject << ' + xobj + '>>' : '') + ' >>';

    const pageNums = [];
    this.pages.forEach((p) => {
      const nContent = push('<< /Length ' + p.ops.length + ' >>\nstream\n' + p.ops + 'endstream');
      const nPage = push('<< /Type /Page /Parent ' + nPages + ' 0 R /MediaBox [0 0 ' +
        (this.wMM * MM).toFixed(2) + ' ' + (this.hMM * MM).toFixed(2) + '] /Resources ' +
        resources + ' /Contents ' + nContent + ' 0 R >>');
      pageNums.push(nPage);
    });

    objs[0] = '<< /Type /Catalog /Pages ' + nPages + ' 0 R >>';
    objs[1] = '<< /Type /Pages /Kids [' + pageNums.map((n) => n + ' 0 R').join(' ') +
      '] /Count ' + pageNums.length + ' >>';

    let out = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
    const offsets = [];
    objs.forEach((body, i) => {
      offsets.push(out.length);
      out += (i + 1) + ' 0 obj\n' + body + '\nendobj\n';
    });
    const xrefPos = out.length;
    out += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n';
    offsets.forEach((off) => {
      out += ('0000000000' + off).slice(-10) + ' 00000 n \n';
    });
    out += 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root ' + nCatalog + ' 0 R >>\n' +
           'startxref\n' + xrefPos + '\n%%EOF';

    const bytes = new Uint8Array(out.length);
    for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xFF;
    return bytes;
  };

  return PDFDocument;
})();

window.PDFDoc = PDFDoc;
