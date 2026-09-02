
(function () {
  'use strict';

  /* ---------------------------------------------------------------------
     ARRANQUE
     Si uno de los archivos del módulo no llega completo (subida a medias,
     caché que mezcla versiones, un 404), el resto no puede funcionar. Antes
     eso dejaba la pantalla del paso 1 en blanco, sin tarjetas y sin ninguna
     pista. El aviso lo pinta ascFalloCarga(), que vive en el HTML: así
     también aparece cuando el que no llegó completo fue este mismo archivo.
     --------------------------------------------------------------------- */
  const avisarFalla = (detalle) => {
    if (typeof window.ascFalloCarga === 'function') window.ascFalloCarga(detalle);
    else console.error('[Consentimiento] ' + detalle);
  };

  if (!window.CONSENT_CONFIG) {
    avisarFalla('no se cargó consentimiento-config.js');
    return;
  }
  if (typeof PDFDoc === 'undefined') {
    avisarFalla('no se cargó pdf-writer.js');
    return;
  }
  if (!document.getElementById('consentForm')) return;
  const CFG           = window.CONSENT_CONFIG;
  const MAX_MENORES   = CFG.MAX_MENORES;
  const LIMPIAR_SEDE  = CFG.LIMPIAR_SEDE;
  const TIPOS_DOC     = CFG.TIPOS_DOC;
  const TIPOS_DOC_MENOR = CFG.TIPOS_DOC_MENOR || [
    { id: 'TI', sigla: 'T.I.', label: 'Tarjeta de Identidad' }
  ];
  const ORGS          = CFG.ORGANIZACIONES  || [];
  const TIPOS_PERSONA = CFG.TIPOS_PERSONA   || [];
  const CONSENTS      = CFG.CONSENTIMIENTOS || [];

  let ORG     = null;   // entidad (Acción Salud / San Felipe)
  let PERSONA = null;   // tipo de persona que firma
  let CONSENT = null;   // tipo de consentimiento (imagen / datos)
  const sedesActuales = () => (ORG && ORG.sedes) ? ORG.sedes : [];

  // Cada entidad ofrece solo los consentimientos que tenga listados.
  const consentsDeOrg = () => {
    if (!ORG) return [];
    const permitidos = ORG.consentimientos || CONSENTS.map((c) => c.id);
    return CONSENTS.filter((c) => permitidos.indexOf(c.id) !== -1);
  };

  const CATEGORIAS = CFG.CATEGORIAS || [];
  let CATEGORIA = null;

  /* El rol manda sobre los formatos: TIPOS_PERSONA[].formatos dice cuáles
     puede firmar. Lo que no esté listado se permite, así que agregar un
     formato nuevo no obliga a tocar todos los roles. */
  const rolPermite = (c) => {
    const permisos = PERSONA && PERSONA.formatos;
    if (!permisos) return true;
    return permisos[c.id] !== false;
  };

  // Los formatos que quedan tras filtrar por entidad y por quién firma.
  const consentsDisponibles = () => consentsDeOrg().filter(rolPermite);

  /* Solo se ofrecen las categorías que queden con al menos un formato, en el
     orden del catálogo. Si el rol se queda sin ninguno de una categoría, esa
     categoría desaparece del paso 2. */
  const categoriasDeOrg = () => {
    const usadas = consentsDisponibles().map((c) => c.categoria);
    return CATEGORIAS.filter((cat) => usadas.indexOf(cat.id) !== -1);
  };

  const consentsDeCategoria = () => {
    if (!CATEGORIA) return consentsDisponibles();
    return consentsDisponibles().filter((c) => c.categoria === CATEGORIA.id);
  };

  /* Lo que el rol cambia para el formato elegido: campos extra y rótulos
     propios del PDF. */
  const ajusteRol = () => (PERSONA && PERSONA.porFormato && CONSENT &&
                           PERSONA.porFormato[CONSENT.id]) || {};

  /* Los campos los define el formato, pero el rol puede encender o apagar
     los suyos: un acompañante en el certificado necesita además los datos
     del paciente. */
  const campos = () => Object.assign({}, (CONSENT && CONSENT.campos) || {},
                                     ajusteRol().campos || {});
  const pide = (campo) => !!campos()[campo];

  // Rótulos del PDF: los del rol, con lo que cambie para este formato.
  const rotulosPdf = () => Object.assign({}, (PERSONA && PERSONA.pdf) || {},
                                         ajusteRol().pdf || {});

  const logoDelPdf = () => (CONSENT && CONSENT.logoPdf) || (ORG && ORG.logoPdf);
  const sedesVisibles = () => {
    const todas = sedesActuales();
    const fija = CONSENT && CONSENT.sedeFija;
    if (!fija) return todas;
    const encontrada = todas.filter((s) => s.id === fija);
    return encontrada.length ? encontrada : todas;
  };

  const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio',
                 'agosto','septiembre','octubre','noviembre','diciembre'];

  const $ = (id) => document.getElementById(id);

  function showError(input, msg) {
    input.classList.add('asc-invalid');
    let p = input.parentElement.querySelector('.asc-error-msg');
    if (!p) { p = document.createElement('p'); p.className = 'asc-error-msg'; input.parentElement.appendChild(p); }
    p.textContent = msg; p.classList.remove('asc-hidden');
  }
  function clearError(input) {
    input.classList.remove('asc-invalid');
    const p = input.parentElement.querySelector('.asc-error-msg');
    if (p) p.remove();
  }
  function bindLiveClear(input) {
    input.addEventListener('input', () => clearError(input));
    input.addEventListener('change', () => clearError(input));
  }
  const titleCase = (s) => s.replace(/\s+/g, ' ').trim();

  function filtrarEntrada(input, patron) {
    input.addEventListener('input', () => {
      const antes = input.value;
      const limpio = antes.replace(patron, '');
      if (antes === limpio) return;
      const pos = input.selectionStart;
      const quitados = antes.length - limpio.length;
      input.value = limpio;
      try {
        const p = Math.max(0, (pos === null ? limpio.length : pos) - quitados);
        input.setSelectionRange(p, p);
      } catch (e) { /* algunos navegadores no lo permiten en ciertos tipos */ }
    });
  }
  const NO_DIGITOS = /[^0-9]/g;
  const NO_ALFANUM = /[^0-9A-Za-z]/g;
  const NO_LUGAR   = /[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ .,'\-]/g;
  const PARTE_LUGAR = "[A-Za-zÁÉÍÓÚÜÑáéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ.'\\- ]{2,}";
  const RE_LUGAR = new RegExp('^' + PARTE_LUGAR + ',\\s*' + PARTE_LUGAR + '$');

  const PALABRAS_MINUS = ['de', 'del', 'la', 'las', 'los', 'y', 'el', 'en'];
  function tituloCase(s) {
    return s.toLowerCase().split(/\s+/).filter(Boolean).map((w, i) =>
      (i > 0 && PALABRAS_MINUS.indexOf(w) !== -1) ? w : w.charAt(0).toUpperCase() + w.slice(1)
    ).join(' ');
  }

  function normalizarLugar(v) {
    const partes = v.split(',').map((p) => p.trim()).filter(Boolean);
    if (partes.length < 2) return tituloCase(v);
    return tituloCase(partes[0]) + ', ' + tituloCase(partes.slice(1).join(' '));
  }

  const opcionesDoc = () =>
    '<option disabled selected value="">Seleccione…</option>' +
    TIPOS_DOC.map((t) => `<option value="${t.id}">${t.id} — ${t.label}</option>`).join('');

  const selTipo = $('tipoDoc');
  selTipo.innerHTML = opcionesDoc();

  // Mismo catálogo para el paciente, cuando lo firma otra persona.
  const selTipoPaciente = $('pacienteTipoDoc');
  selTipoPaciente.innerHTML = opcionesDoc();

  const selSede = $('sede');

  function poblarSedes() {
    const lista = sedesVisibles();
    selSede.innerHTML = '<option disabled selected value="">Seleccione una sede</option>' +
      lista.map((s) => `<option value="${s.id}">${s.nombre}</option>`).join('');
    if (lista.length === 1) {
      selSede.value = lista[0].id;
      selSede.disabled = !!(CONSENT && CONSENT.sedeFija);
      aplicarSede();
    } else {
      selSede.disabled = false;
      $('ciudad').value = '';
      $('departamento').value = '';
      $('ciudad').disabled = true;
      $('departamento').disabled = true;
    }
  }

  function aplicarSede() {
    const s = sedesActuales().find((x) => x.id === selSede.value);
    if (!s) return;
    const ciudad = $('ciudad'), departamento = $('departamento');
    const definidos = !!(s.ciudad && s.departamento);
    ciudad.value = s.ciudad || '';
    departamento.value = s.departamento || '';
    ciudad.disabled = definidos;
    departamento.disabled = definidos;
    clearError(ciudad); clearError(departamento);
  }

  selSede.addEventListener('change', aplicarSede);

  function refrescarFecha() {
    const f = new Date();
    $('currentDate').textContent = f.toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' });
    $('fechaISO').value = f.toISOString();
  }
  refrescarFecha();

  const inpDoc   = $('identificacion');
  const inpLugar = $('lugarExpedicion');

  function aplicarReglaDocumento() {
    const esPasaporte = selTipo.value === 'PA';
    inpDoc.placeholder = esPasaporte ? 'Ej. AV123456' : 'Ej. 123456789';
    inpDoc.inputMode = esPasaporte ? 'text' : 'numeric';
    inpDoc.value = inpDoc.value.replace(esPasaporte ? NO_ALFANUM : NO_DIGITOS, '');
    if (esPasaporte) inpDoc.value = inpDoc.value.toUpperCase();
  }
  selTipo.addEventListener('change', aplicarReglaDocumento);
  inpDoc.addEventListener('input', () => {
    const antes = inpDoc.value;
    const pos = inpDoc.selectionStart;
    const esPasaporte = selTipo.value === 'PA';
    let limpio = antes.replace(esPasaporte ? NO_ALFANUM : NO_DIGITOS, '');
    if (esPasaporte) limpio = limpio.toUpperCase();
    if (antes === limpio) return;
    inpDoc.value = limpio;
    try {
      const p = Math.max(0, (pos === null ? limpio.length : pos) - (antes.length - limpio.length));
      inpDoc.setSelectionRange(p, p);
    } catch (e) { /* noop */ }
  });

  filtrarEntrada(inpLugar, NO_LUGAR);
  inpLugar.addEventListener('blur', () => {
    if (inpLugar.value.trim()) inpLugar.value = normalizarLugar(inpLugar.value);
  });

  /* El documento del paciente sigue la misma regla: letras solo si es
     pasaporte. */
  const inpDocPaciente = $('pacienteDoc');
  const cardPaciente   = $('cardPaciente');

  function reglaDocPaciente() {
    const esPasaporte = selTipoPaciente.value === 'PA';
    inpDocPaciente.placeholder = esPasaporte ? 'Ej. AV123456' : 'Ej. 123456789';
    inpDocPaciente.inputMode = esPasaporte ? 'text' : 'numeric';
    inpDocPaciente.value = inpDocPaciente.value
      .replace(esPasaporte ? NO_ALFANUM : NO_DIGITOS, '');
    if (esPasaporte) inpDocPaciente.value = inpDocPaciente.value.toUpperCase();
  }
  selTipoPaciente.addEventListener('change', reglaDocPaciente);
  inpDocPaciente.addEventListener('input', reglaDocPaciente);

  const cardAtencion = $('cardAtencion');
  const plano = (t) => String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();

  function resaltar(texto, palabras) {
    const frag = document.createDocumentFragment();
    if (!palabras.length) { frag.appendChild(document.createTextNode(texto)); return frag; }
    const base = plano(texto);
    // Marca qué posiciones del texto forman parte de alguna coincidencia.
    const marcado = new Array(texto.length).fill(false);
    palabras.forEach((p) => {
      let desde = 0, i;
      while ((i = base.indexOf(p, desde)) !== -1) {
        for (let k = i; k < i + p.length && k < marcado.length; k++) marcado[k] = true;
        desde = i + p.length;
      }
    });
    let i = 0;
    while (i < texto.length) {
      const inicio = i;
      const estado = marcado[i];
      while (i < texto.length && marcado[i] === estado) i++;
      const trozo = texto.slice(inicio, i);
      if (estado) {
        const m = document.createElement('mark');
        m.textContent = trozo;
        frag.appendChild(m);
      } else {
        frag.appendChild(document.createTextNode(trozo));
      }
    }
    return frag;
  }


  function crearBuscador(input, fuente, nombrePlural) {
    const caja   = input.closest('.asc-buscador');
    const lista  = caja.querySelector('.asc-buscador-lista');
    const flecha = caja.querySelector('.asc-buscador-flecha');
    const pista  = $(input.id + 'Pista');
    let filas = [];      // [{ valor, libre }]
    let activo = -1;
    let abierto = false;
    let confirmado = '';  
    const get = () => input.dataset.valor || '';
    function set(v) {
      confirmado = v || '';
      restaurar();
      clearError(input);
    }
    function restaurar() {
      input.dataset.valor = confirmado;
      input.value = confirmado;
      pintarPista();
    }

    function pintarPista() {
      const v = get();
      const enLista = v && (fuente() || []).indexOf(v) !== -1;
      pista.textContent = (v && !enLista)
        ? 'Valor escrito a mano: no está en la lista.' : '';
    }

    function coincidencias(texto) {
      const todas = fuente() || [];
      const t = plano(texto).trim();
      if (!t) return { lista: todas.slice(), palabras: [] };
      const palabras = t.split(/\s+/);
      return {
        lista: todas.filter((v) => {
          const n = plano(v);
          return palabras.every((p) => n.indexOf(p) !== -1);
        }),
        palabras: palabras
      };
    }

    function pintar() {
      const texto = input.value.trim();
      const r = coincidencias(texto);
      const exacta = r.lista.some((v) => v === texto);

      filas = r.lista.map((v) => ({ valor: v, libre: false }));
      // "Otro": solo si escribieron algo que no es ya una opción.
      if (texto && !exacta) filas.push({ valor: texto, libre: true });

      lista.innerHTML = '';
      if (!filas.length) {
        const li = document.createElement('li');
        li.className = 'asc-buscador-vacio';
        li.textContent = (fuente() || []).length
          ? 'Ninguna opción coincide.'
          : 'No hay ' + nombrePlural + ' cargados. Escriba el valor y elija «Otro».';
        lista.appendChild(li);
        activo = -1;
        return;
      }

      filas.forEach((f, i) => {
        const li = document.createElement('li');
        li.className = 'asc-buscador-op' + (f.libre ? ' asc-buscador-op--otro' : '');
        li.id = input.id + '-op-' + i;
        li.setAttribute('role', 'option');
        li.setAttribute('aria-selected', 'false');
        if (f.libre) {
          li.appendChild(document.createTextNode('Otro — usar «'));
          const fuerte = document.createElement('strong');
          fuerte.textContent = f.valor;
          li.appendChild(fuerte);
          li.appendChild(document.createTextNode('»'));
        } else {
          li.appendChild(resaltar(f.valor, r.palabras));
        }
        li.addEventListener('mousedown', (e) => {
          // mousedown y no click: el blur del input llegaría antes.
          e.preventDefault();
          elegir(i);
        });
        lista.appendChild(li);
      });
      marcarActivo(filas.length ? 0 : -1);
    }

    function marcarActivo(i) {
      const ops = lista.querySelectorAll('.asc-buscador-op');
      ops.forEach((op) => op.setAttribute('aria-selected', 'false'));
      activo = i;
      if (i >= 0 && ops[i]) {
        ops[i].setAttribute('aria-selected', 'true');
        input.setAttribute('aria-activedescendant', ops[i].id);
        // Mantener a la vista la opción activa al moverse con el teclado.
        const r = ops[i].getBoundingClientRect(), rl = lista.getBoundingClientRect();
        if (r.top < rl.top) lista.scrollTop -= (rl.top - r.top);
        else if (r.bottom > rl.bottom) lista.scrollTop += (r.bottom - rl.bottom);
      } else {
        input.removeAttribute('aria-activedescendant');
      }
    }

    function abrir() {
      pintar();
      lista.classList.remove('asc-hidden');
      caja.dataset.abierto = '1';
      input.setAttribute('aria-expanded', 'true');
      abierto = true;
    }

    function cerrar() {
      lista.classList.add('asc-hidden');
      caja.dataset.abierto = '0';
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
      abierto = false;
      activo = -1;
    }

    function elegir(i) {
      const f = filas[i];
      if (!f) return;
      set(f.valor);
      cerrar();
      input.focus({ preventScroll: true });
    }

    input.addEventListener('focus', abrir);
    input.addEventListener('click', () => { if (!abierto) abrir(); });
    input.addEventListener('input', () => {
      // Escribir invalida la elección anterior hasta que confirmen una fila.
      input.dataset.valor = '';
      pista.textContent = '';
      if (!abierto) abrir(); else pintar();
    });

    flecha.addEventListener('mousedown', (e) => {
      e.preventDefault();
      if (abierto) { cerrar(); } else { input.focus({ preventScroll: true }); abrir(); }
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!abierto) { abrir(); return; }
        if (!filas.length) return;
        const paso = e.key === 'ArrowDown' ? 1 : -1;
        marcarActivo((activo + paso + filas.length) % filas.length);
      } else if (e.key === 'Enter') {
        if (abierto && activo >= 0) { e.preventDefault(); elegir(activo); }
      } else if (e.key === 'Escape') {
        if (abierto) { e.preventDefault(); cerrar(); restaurar(); }
      } else if (e.key === 'Tab') {
        cerrar();
      }
    });

    /* Al salir sin confirmar, el campo vuelve al último valor elegido: si
       no, quedaría un texto a la vista que no es el que se va a imprimir. */
    input.addEventListener('blur', () => {
      window.setTimeout(() => {
        if (document.activeElement === input) return;
        cerrar();
        if (input.value !== confirmado) restaurar();
      }, 0);
    });

    document.addEventListener('click', (e) => {
      if (abierto && !caja.contains(e.target)) cerrar();
    });

    return { get: get, set: set, limpiar: () => { set(''); cerrar(); } };
  }

  const buscaConvenio = crearBuscador($('convenio'),
    () => (CONSENT && CONSENT.CONVENIOS) || [], 'convenios');
  const buscaProcedimiento = crearBuscador($('procedimiento'),
    () => (CONSENT && CONSENT.PROCEDIMIENTOS) || [], 'procedimientos');

  // Responsables de la institución: se busca por nombre.
  const RESPONSABLES = () => (CONSENT && CONSENT.RESPONSABLES) || [];
  const buscaResponsable = crearBuscador($('responsable'),
    () => RESPONSABLES().map((r) => r.nombre), 'responsables');

  const CLAVE_USUARIO = 'asc_usuario';
  function recordarUsuario(v) {
    try { window.sessionStorage.setItem(CLAVE_USUARIO, v); } catch (e) { /* sin memoria */ }
  }
  function usuarioRecordado() {
    try { return window.sessionStorage.getItem(CLAVE_USUARIO) || ''; } catch (e) { return ''; }
  }
  $('usuario').value = usuarioRecordado();
  $('usuario').addEventListener('change', () => recordarUsuario($('usuario').value.trim()));

  const toggleMinor        = $('toggleMinor');
  const minorFormContainer = $('minorFormContainer');
  const minorsList         = $('minorsList');
  const addMinorBtn        = $('addMinorBtn');
  const minorCounter       = $('minorCounter');


  const getEntries = () => Array.from(minorsList.querySelectorAll('.asc-minor'));

  function createMinorEntry() {
    const entry = document.createElement('div');
    entry.className = 'asc-minor';
    entry.innerHTML =
      '<button type="button" class="asc-btn-x asc-minor-remove" aria-label="Remover menor">' +
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>' +
      '</button>' +
      '<p class="asc-minor-title">Menor</p>' +
      '<div class="asc-fields asc-fields--2">' +
        '<div class="asc-field">' +
          '<label class="asc-label">Nombres y apellidos del menor</label>' +
          '<input class="asc-input" type="text" data-field="nombre" placeholder="Nombres y apellidos"/>' +
        '</div>' +
        '<div class="asc-field">' +
          '<label class="asc-label">Tipo de documento</label>' +
          '<select class="asc-select" data-field="tipoDoc">' +
            TIPOS_DOC_MENOR.map((t) =>
              '<option value="' + t.id + '">' + t.sigla + ' — ' + t.label + '</option>').join('') +
          '</select>' +
        '</div>' +
        '<div class="asc-field asc-field--full">' +
          '<label class="asc-label">Número de documento</label>' +
          '<input class="asc-input" type="text" data-field="documento" inputmode="numeric" maxlength="15" placeholder="Número de documento"/>' +
        '</div>' +
      '</div>';
    entry.querySelector('.asc-minor-remove').addEventListener('click', () => { entry.remove(); refreshMinors(); });
    entry.querySelectorAll('input').forEach(bindLiveClear);
    // La tarjeta de identidad siempre es numérica
    filtrarEntrada(entry.querySelector('[data-field="documento"]'), NO_DIGITOS);
    return entry;
  }

  function refreshMinors() {
    const entries = getEntries();
    entries.forEach((entry, i) => {
      const n = i + 1;
      entry.querySelector('.asc-minor-title').textContent = 'MENOR ' + n;
      entry.querySelectorAll('[data-field]').forEach((input) => {
        const id = `menor_${input.dataset.field}_${n}`;
        input.id = id; input.name = `menores[${i}][${input.dataset.field}]`;
        const label = input.parentElement.querySelector('label');
        if (label) label.setAttribute('for', id);
      });
      entry.querySelector('.asc-minor-remove').classList.toggle('asc-hidden', entries.length <= 1);
    });
    const atMax = entries.length >= MAX_MENORES;
    addMinorBtn.disabled = atMax;
    minorCounter.textContent = `${entries.length} de ${MAX_MENORES} menores` + (atMax ? ' — límite alcanzado' : '');
    firmaPaciente.hint.textContent = entries.length
      ? (PERSONA ? PERSONA.hintFirmaMenores : 'Firma del padre, madre o acudiente que autoriza (es también el titular adulto).')
      : (PERSONA ? PERSONA.hintFirma : 'Firma del titular adulto.');
  }

  toggleMinor.addEventListener('change', function () {
    if (this.checked) {
      minorFormContainer.classList.remove('asc-hidden');
      if (getEntries().length === 0) minorsList.appendChild(createMinorEntry());
    } else {
      minorFormContainer.classList.add('asc-hidden');
      minorsList.innerHTML = '';
    }
    refreshMinors();
  });

  addMinorBtn.addEventListener('click', () => {
    if (getEntries().length >= MAX_MENORES) return;
    const entry = createMinorEntry();
    minorsList.appendChild(entry);
    refreshMinors();
    entry.querySelector('input').focus();
  });

  const FCFG = Object.assign({
    GROSOR: 2.0, USAR_PRESION: true,
    PRESION_MIN: 0.55, PRESION_MAX: 1.75
  }, CFG.FIRMA || {});

  /* Mecánica del trazo (puntero, presión del lápiz, redimensionado y
     recorte final). Vive una sola vez, en el lienzo grande del modal. */
  function crearLienzo(wrapper, canvas, placeholder) {
    const ctx = canvas.getContext('2d');

    let isDrawing = false, hasStrokes = false;
    let activeId = null;      // pointerId que está dibujando; el resto se ignora
    let prevPt   = null;      // último punto crudo
    let prevMid  = null;      // último punto medio (extremo de la curva anterior)
    let prevW    = 0;         // grosor actual, suavizado entre eventos

    let presionReal = false;  // el lápiz manda presión variable de verdad
    let modoLapiz   = false;  // ya se detectó un lápiz en este pad

    function applyStyle() {
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.strokeStyle = '#0f2b3d'; ctx.fillStyle = '#0f2b3d';
      ctx.lineWidth = FCFG.GROSOR;
    }

    let lastW = 0, lastH = 0;
    function resizeCanvas() {
      const rect = wrapper.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      if (Math.round(rect.width) === lastW && Math.round(rect.height) === lastH) return;
      lastW = Math.round(rect.width); lastH = Math.round(rect.height);
      const snapshot = hasStrokes ? canvas.toDataURL() : null;
      const dpr = Math.min(Math.max(window.devicePixelRatio || 1, 2), 3);
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      canvas.style.width = rect.width + 'px';
      canvas.style.height = rect.height + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      applyStyle();
      if (snapshot) {
        const img = new Image();
        img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height);
        img.src = snapshot;
      }
    }

    let resizeTimer;
    function scheduleResize() { clearTimeout(resizeTimer); resizeTimer = setTimeout(resizeCanvas, 120); }
    window.addEventListener('resize', scheduleResize);
    window.addEventListener('orientationchange', scheduleResize);
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(scheduleResize).observe(wrapper);
    resizeCanvas();

    function getPos(evt) {
      const rect = canvas.getBoundingClientRect();
      return { x: evt.clientX - rect.left, y: evt.clientY - rect.top };
    }
    function markDirty() {
      if (!hasStrokes) { hasStrokes = true; placeholder.style.display = 'none'; }
    }


    function activarModoLapiz() {
      if (modoLapiz || hasStrokes) return;
      modoLapiz = true;
      placeholder.textContent = 'Firme aquí con el lápiz';
    }

  
    function grosorDe(evt) {
      if (!FCFG.USAR_PRESION || evt.pointerType !== 'pen') return FCFG.GROSOR;
      const p = evt.pressure;
      if (p > 0 && Math.abs(p - 0.5) > 0.001) presionReal = true;
      if (!presionReal) return FCFG.GROSOR;
      const t = Math.max(0, Math.min(1, p));
      return FCFG.GROSOR * (FCFG.PRESION_MIN + (FCFG.PRESION_MAX - FCFG.PRESION_MIN) * t);
    }

    function segmento(pt, w) {
      const mid = { x: (prevPt.x + pt.x) / 2, y: (prevPt.y + pt.y) / 2 };
      ctx.beginPath();
      ctx.lineWidth = w;
      ctx.moveTo(prevMid.x, prevMid.y);
      ctx.quadraticCurveTo(prevPt.x, prevPt.y, mid.x, mid.y);
      ctx.stroke();
      prevMid = mid; prevPt = pt;
    }

    function anotar(evt) {
      const p = getPos(evt);
      const dx = p.x - prevPt.x, dy = p.y - prevPt.y;
      if (dx * dx + dy * dy < 0.16) return;          // < 0.4 px: ruido, se descarta
      const objetivo = grosorDe(evt);
      prevW += (objetivo - prevW) * 0.35;            // el grosor cambia sin escalones
      segmento(p, prevW);
    }

    function startDrawing(e) {
      if (activeId !== null) return;   // ya hay un trazo: palma o segundo dedo
      if (e.button !== 0) return;      // botón lateral del lápiz o clic derecho
      e.preventDefault();
      if (e.pointerType === 'pen') activarModoLapiz();

      activeId = e.pointerId; isDrawing = true;
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* sin captura */ }

      const p = getPos(e);
      prevPt = p; prevMid = p; prevW = grosorDe(e);
      ctx.beginPath();
      ctx.arc(p.x, p.y, prevW / 2, 0, Math.PI * 2);
      ctx.fill();
      markDirty();
    }

    function draw(e) {
      if (!isDrawing || e.pointerId !== activeId) return;
      e.preventDefault();
      if (e.buttons === 0) { stopDrawing(e); return; }

      let lote = null;
      try { if (e.getCoalescedEvents) lote = e.getCoalescedEvents(); } catch (err) { lote = null; }

      if (lote && lote.length) { for (let i = 0; i < lote.length; i++) anotar(lote[i]); }
      else anotar(e);
    }

    function stopDrawing(e) {
      if (!isDrawing) return;
      if (e && e.pointerId !== undefined && activeId !== null && e.pointerId !== activeId) return;
      isDrawing = false;
      if (activeId !== null) {
        try { canvas.releasePointerCapture(activeId); } catch (err) { /* ya liberado */ }
        activeId = null;
      }
      // Cierra el tramo final: si no, faltaría media curva en el remate.
      if (prevPt && prevMid) {
        ctx.beginPath();
        ctx.lineWidth = prevW || FCFG.GROSOR;
        ctx.moveTo(prevMid.x, prevMid.y);
        ctx.lineTo(prevPt.x, prevPt.y);
        ctx.stroke();
      }
      prevPt = null; prevMid = null;
    }

    canvas.addEventListener('pointerdown', startDrawing);
    canvas.addEventListener('pointermove', draw);
    canvas.addEventListener('pointerup', stopDrawing);
    canvas.addEventListener('pointercancel', stopDrawing);
    canvas.addEventListener('lostpointercapture', stopDrawing);
    window.addEventListener('pointerup', stopDrawing);
    canvas.addEventListener('pointerover', function (e) {
      if (e.pointerType === 'pen') activarModoLapiz();
    });

    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    function clearSignature() {
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.restore();
      hasStrokes = false;
      isDrawing = false; activeId = null; prevPt = null; prevMid = null;
      modoLapiz = false;
      placeholder.style.display = 'block';
      placeholder.textContent = 'Firme aquí';
    }

    function firmaJPEG() {
      const w = canvas.width, h = canvas.height;
      const data = ctx.getImageData(0, 0, w, h).data;
      let minX = w, minY = h, maxX = -1, maxY = -1;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (data[(y * w + x) * 4 + 3] > 8) {
            if (x < minX) minX = x; if (x > maxX) maxX = x;
            if (y < minY) minY = y; if (y > maxY) maxY = y;
          }
        }
      }
      if (maxX < 0) return null;
      const pad = Math.round(Math.min(w, h) * 0.03);
      minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
      maxX = Math.min(w - 1, maxX + pad); maxY = Math.min(h - 1, maxY + pad);
      const cw = maxX - minX + 1, ch = maxY - minY + 1;
      const off = document.createElement('canvas');
      off.width = cw; off.height = ch;
      const octx = off.getContext('2d');
      octx.fillStyle = '#ffffff'; octx.fillRect(0, 0, cw, ch);
      octx.drawImage(canvas, minX, minY, cw, ch, 0, 0, cw, ch);
      return {
        jpeg: { b64: off.toDataURL('image/jpeg', 0.92).split(',')[1], w: cw, h: ch },
        png: off.toDataURL('image/png')
      };
    }

    return {
      tieneTrazos: () => hasStrokes,
      limpiar: clearSignature,
      capturar: firmaJPEG,
      redimensionar: resizeCanvas
    };
  }



  /* =====================================================================
     PANTALLA DE FIRMA
     Un solo lienzo grande, compartido: se abre desde el botón de cada
     bloque y devuelve el trazo al bloque que lo pidió. En el formulario
     solo queda la vista previa, así nadie firma en un espacio pequeño.
     ===================================================================== */
  const modalFirma = $('firmaModal');
  const lienzo = crearLienzo($('firmaModalWrapper'), $('firmaModalCanvas'),
                             $('firmaModalPlaceholder'));
  const errorModal = $('firmaModalError');
  let panelActivo = null;

  function abrirModalFirma(panel) {
    panelActivo = panel;
    $('firmaModalTitulo').textContent = panel.etiqueta;
    errorModal.classList.add('asc-hidden');
    lienzo.limpiar();
    modalFirma.classList.remove('asc-hidden');
    // El lienzo estaba oculto: hasta ahora no tenía medidas.
    lienzo.redimensionar();
  }

  function cerrarModalFirma() {
    modalFirma.classList.add('asc-hidden');
    panelActivo = null;
  }

  $('firmaModalLimpiar').addEventListener('click', () => {
    lienzo.limpiar();
    errorModal.classList.add('asc-hidden');
  });
  $('firmaModalCancelar').addEventListener('click', cerrarModalFirma);

  $('firmaModalGuardar').addEventListener('click', () => {
    if (!lienzo.tieneTrazos()) {
      errorModal.textContent = 'Trace la firma antes de guardarla.';
      errorModal.classList.remove('asc-hidden');
      return;
    }
    const capturada = lienzo.capturar();
    if (panelActivo && capturada) panelActivo.recibir(capturada);
    cerrarModalFirma();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modalFirma.classList.contains('asc-hidden')) {
      cerrarModalFirma();
    }
  });

  /* Bloque de firma del formulario: vista previa + botón. Guardar en la
     pantalla grande ya confirma; aquí no hay un segundo paso. */
  function crearFirma(sufijo, etiquetaPorDefecto) {
    const caja    = $('firmaCaja' + sufijo);
    const previa  = $('firmaPrevia' + sufijo);
    const vacia   = $('firmaVacia' + sufijo);
    const btn     = $('firmarBtn' + sufijo);
    const btnBorrar = $('firmaBorrar' + sufijo);
    const sigError  = $('signatureError' + sufijo);
    const oculto    = $('firmaData' + sufijo);
    let firma = null;   // { jpeg:{b64,w,h}, png }

    function pintar() {
      const hay = !!firma;
      caja.classList.toggle('asc-firma-caja--llena', hay);
      previa.classList.toggle('asc-hidden', !hay);
      vacia.classList.toggle('asc-hidden', hay);
      btnBorrar.classList.toggle('asc-hidden', !hay);
      btn.textContent = hay ? 'Volver a firmar' : 'Generar firma';
      if (hay) { previa.src = firma.png; oculto.value = firma.png; }
      else { previa.removeAttribute('src'); oculto.value = ''; }
    }

    const panel = {
      etiqueta: btn.dataset.etiqueta || etiquetaPorDefecto,
      recibir: (capturada) => {
        firma = capturada;
        sigError.classList.add('asc-hidden');
        pintar();
      }
    };

    btn.addEventListener('click', () => abrirModalFirma(panel));
    btnBorrar.addEventListener('click', () => { firma = null; pintar(); });

    pintar();

    return {
      wrapper: caja,
      boton: btn,
      error: sigError,
      hint: $('signatureHint' + sufijo),
      tieneTrazos: () => !!firma,
      limpiar: () => { firma = null; sigError.classList.add('asc-hidden'); pintar(); },
      jpeg: () => (firma ? firma.jpeg : null),
      redimensionar: () => {}
    };
  }

  const firmaPaciente    = crearFirma('', 'Firma del paciente');
  const firmaResponsable = crearFirma('2', 'Firma del responsable de la institución');
  const FIRMAS = [firmaPaciente, firmaResponsable];

  const limpiarFirmas = () => FIRMAS.forEach((f) => f.limpiar());

  const M = {
    X0: 20, X1: 68, X2: 145.5, X3: 190,
    HY: [12.6, 15.9, 23.9, 36.0, 40.1, 44.1],
    CEL: [68, 98.3, 118.5, 137.4, 156.3, 174.4, 190],
    FY: [263.2, 268.0, 272.8],
    FX: [20, 78.9, 133.6, 190],
    BODY_TOP: 58, BODY_BOTTOM: 255
  };

  function dibujarEncabezado(doc, encabezadoSede, fechaElaboracion, logo) {
    const { X0, X1, X2, X3, HY, CEL } = M;
    doc.rect(X0, HY[0], X3 - X0, HY[5] - HY[0]);
    doc.line(X1, HY[0], X1, HY[5]);
    doc.line(X1, HY[1], X3, HY[1]);
    doc.line(X1, HY[3], X3, HY[3]);
    doc.line(X1, HY[4], X3, HY[4]);
    doc.line(X2, HY[1], X2, HY[3]);
    doc.line(X2, HY[2], X3, HY[2]);

    const cellW = X1 - X0 - 4, cellH = HY[5] - HY[0] - 4;
    let lw = cellW, lh = lw * logo.h / logo.w;
    if (lh > cellH) { lh = cellH; lw = lh * logo.w / logo.h; }
    doc.image('ImLogo', X0 + (X1 - X0 - lw) / 2, HY[0] + (HY[5] - HY[0] - lh) / 2, lw, lh);

    doc.text('SISTEMA INTEGRADO DE GESTIÓN DE LA CALIDAD', (X1 + X3) / 2, HY[1] - 1.1, { size: 7, bold: true, align: 'center' });

    const cx = (X1 + X2) / 2;
    doc.text('FORMATO', cx, 21.7, { size: 8, bold: true, align: 'center' });
    doc.text('AUTORIZACIÓN DE USO DE DERECHOS DE', cx, 24.8, { size: 8, bold: true, align: 'center' });
    doc.text('IMAGEN SOBRE FOTOGRAFÍAS Y', cx, 27.9, { size: 8, bold: true, align: 'center' });
    doc.text('PRODUCCIONES AUDIOVISUALES', cx, 31.0, { size: 8, bold: true, align: 'center' });
    doc.text('(VIDEOS).', cx, 34.1, { size: 8, bold: true, align: 'center' });

    const cx3 = (X2 + X3) / 2;
    doc.text('UNIDAD FUNCIONAL', cx3, 18.8, { size: 7.5, bold: true, align: 'center' });
    doc.text('ASISTENCIAL', cx3, 22.0, { size: 7.5, bold: true, align: 'center' });
    doc.text('Versión 1', cx3, 30.5, { size: 8, align: 'center' });

    doc.text(encabezadoSede, (X1 + X3) / 2, 38.9, { size: 7, align: 'center' });

    for (let i = 1; i < CEL.length - 1; i++) doc.line(CEL[i], M.HY[4], CEL[i], M.HY[5]);
    const y = 43.0;
    const mid = (a, b) => (CEL[a] + CEL[b]) / 2;
    doc.text('Fecha de Elaboración', mid(0, 1), y, { size: 7.5, bold: true, align: 'center' });
    doc.text(fechaElaboracion,      mid(1, 2), y, { size: 7.5, align: 'center' });
    doc.text('Código',              mid(2, 3), y, { size: 7.5, bold: true, align: 'center' });
    doc.text('ASI-FOR-018',         mid(3, 4), y, { size: 7.5, align: 'center' });
    doc.text('Página',              mid(4, 5), y, { size: 7.5, bold: true, align: 'center' });
    // El "X de N" se estampa al final, cuando ya se conoce el total.
  }

  function dibujarPie(doc) {
    const { FY, FX } = M;
    doc.rect(FX[0], FY[0], FX[3] - FX[0], FY[2] - FY[0]);
    doc.line(FX[0], FY[1], FX[3], FY[1]);
    for (let i = 1; i < 3; i++) doc.line(FX[i], FY[0], FX[i], FY[2]);
    const c = (i) => (FX[i] + FX[i + 1]) / 2;
    doc.text('Elaboró', c(0), 266.9, { size: 8.5, bold: true, align: 'center' });
    doc.text('Revisó',  c(1), 266.9, { size: 8.5, bold: true, align: 'center' });
    doc.text('Aprobó',  c(2), 266.9, { size: 8.5, bold: true, align: 'center' });
    doc.text('Coordinador de Calidad', c(0), 271.6, { size: 8.5, align: 'center' });
    doc.text('Coordinador Médico',     c(1), 271.6, { size: 8.5, align: 'center' });
    doc.text('Gerente',                c(2), 271.6, { size: 8.5, align: 'center' });
  }

  // "la IPS Acción salud…" -> "La IPS Acción salud…"
  const mayus1 = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  function generarPDF(d) {
    const doc = new PDFDoc({ width: 210, height: 297 });
    doc.addImage('ImLogo', d.logo.b64, d.logo.w, d.logo.h);
    if (d.firma) doc.addImage('ImFirma', d.firma.b64, d.firma.w, d.firma.h);

    const W = M.X3 - M.X0;
    let y;

    function nuevaPagina() {
      doc.addPage();
      dibujarEncabezado(doc, d.sedeEncabezado, d.fechaCorta, d.logo);
      dibujarPie(doc);
      y = M.BODY_TOP;
    }
    function espacio(alto) { if (y + alto > M.BODY_BOTTOM) nuevaPagina(); }

    nuevaPagina();

    y = doc.paragraph([
      { s: 'Yo, ' },
      { s: d.nombreCompleto, bold: true, underline: true },
      { s: ', identificado con ' },
      { s: d.tipoDocLabel, bold: true, underline: true },
      { s: ' No. ' },
      { s: d.numeroDoc, bold: true, underline: true },
      { s: ' de ' },
      { s: d.lugarExpedicion, bold: true, underline: true },
      { s: ', mediante el presente formato autorizo a ' + d.razonSocial + ', para que haga uso y tratamiento de mis derechos de imagen para incluirlos sobre fotografías y producciones audiovisuales (videos).' }
    ], M.X0, y, W, { size: 11 }) + 4;

    y = doc.paragraph([{ s: 'Esta autorización se regirá por las normas legales aplicables y en particular por las siguientes:' }],
      M.X0, y, W, { size: 11 }) + 4;

    const bullets = [
      'Este video/foto podrá ser utilizado con fines publicitarios e informativos en diferentes escenarios y plataformas ' + d.razonSocial + '.',
      'Este video/foto es sin ánimo de lucro y en ningún momento será utilizado para objetivos distintos. ' + mayus1(d.razonSocial) + ', queda exento de cualquier responsabilidad que se pueda derivar de la presente actividad con la firma de la autorización.',
      'La presente autorización tiene al departamento de ' + d.departamento + ' como ámbito geográfico determinado, por lo que las imágenes en las que aparezca podrán ser utilizadas en el territorio descrito, así mismo, tampoco tiene ningún límite de tiempo para su concesión, ni para explotación de las imágenes, o parte de estas, por lo que mi autorización se considera concedida por un plazo de tiempo ilimitado.'
    ];
    bullets.forEach((b) => {
      espacio(18);
      doc.text('•', M.X0, y, { size: 11 });
      y = doc.paragraph([{ s: b }], M.X0 + 4.5, y, W - 4.5, { size: 11 }) + 3.5;
    });

    if (d.menores.length) {
      espacio(34);
      y += 5;
      doc.text('Menor de edad', M.X0, y, { size: 11, bold: true });
      y += 7;

      const plural = d.menores.length > 1;
      const runs = [{ s: 'Atendiendo al ejercicio de la Patria Potestad, establecido en el Código Civil Colombiano en su artículo 288, el artículo 24 del Decreto 2820 de 1974 y la Ley de Infancia y Adolescencia, ' + d.razonSocial + ', solicita la autorización escrita del padre/madre de familia o acudiente ' +
        (plural ? 'de los menores de edad: ' : 'del menor de edad: ') }];
      d.menores.forEach((m, i) => {
        if (i > 0) runs.push({ s: i === d.menores.length - 1 ? ' y ' : ', ' });
        runs.push({ s: m.nombre, bold: true, underline: true });
        runs.push({ s: ', identificado(a) con ' + m.tipoDocLabel + ' número ' });
        runs.push({ s: m.documento, bold: true, underline: true });
      });
      runs.push({ s: (plural ? ', para que aparezcan ante la cámara' : ', para que aparezca ante la cámara') +
        ', en una videograbación o captura de imágenes fotográficas.' });
      y = doc.paragraph(runs, M.X0, y, W, { size: 11 });
    }

    nuevaPagina();

    doc.text(d.pdf.tituloBloque, M.X0, y, { size: 11, bold: true });
    y += 7;
    y = doc.paragraph([{ s: 'En mi calidad de persona natural autorizo el uso de derechos de imagen sobre fotografías y producción audiovisual (videos).' }],
      M.X0, y, W, { size: 11 }) + 4;

    y = doc.paragraph([
      { s: 'Para constancia de lo anterior se firma y otorga en la ciudad de ' },
      { s: d.ciudad, bold: true, underline: true },
      { s: ', el día ' }, { s: d.dia, bold: true, underline: true },
      { s: ' del mes ' }, { s: d.mes, bold: true, underline: true },
      { s: ' de ' }, { s: d.anio, bold: true, underline: true }, { s: '.' }
    ], M.X0, y, W, { size: 11 }) + 8;

    const LX0 = 20, LX1 = 110, RX0 = 125, RX1 = 190;
    function bloqueFirma(o) {
      espacio(o.firma ? 34 : 20);
      if (o.titulo) { doc.text(o.titulo, M.X0, y, { size: 11, bold: true }); y += 9; }
      if (o.firma) {
        let fh = 12, fw = fh * o.firma.w / o.firma.h;
        if (fw > LX1 - LX0 - 6) { fw = LX1 - LX0 - 6; fh = fw * o.firma.h / o.firma.w; }
        doc.image('ImFirma', LX0 + 3, y, fw, fh);
        y += fh + 4;   // aire para que el trazo no toque el nombre impreso
      }
      doc.text(o.izqValor, LX0 + 3, y, { size: 10, bold: true });
      doc.text(o.derValor, (RX0 + RX1) / 2, y, { size: 10, bold: true, align: 'center' });
      y += 1.6;
      doc.line(LX0, y, LX1, y, { width: 0.5 });
      doc.line(RX0, y, RX1, y, { width: 0.5 });
      y += 4.4;
      doc.text(o.izqCaption, LX0, y, { size: 9.5 });
      doc.text(o.derCaption, (RX0 + RX1) / 2, y, { size: 9.5, align: 'center' });
      y += 9;
    }

    if (d.menores.length) {
      bloqueFirma({
        titulo: 'Firma autorización para menor(es) de edad.',
        firma: d.firma,
        izqValor: d.nombreCompleto, izqCaption: 'Nombre del padre/madre de familia o acudiente',
        derValor: d.numeroDoc, derCaption: d.tipoDocLabel + '.'
      });
      d.menores.forEach((m) => {
        bloqueFirma({
          izqValor: m.nombre, izqCaption: 'Nombre del menor de edad',
          derValor: m.documento, derCaption: m.tipoDocLabel
        });
      });
      y += 3;
    }

    bloqueFirma({
      titulo: d.pdf.tituloFirma,
      firma: d.firma,
      izqValor: d.nombreCompleto, izqCaption: d.pdf.captionNombre,
      derValor: d.numeroDoc, derCaption: d.tipoDocLabel
    });

    espacio(14);
    y += 4;
    doc.text('Ciudad:', M.X0, y, { size: 11 });
    doc.text(d.ciudad, M.X0 + 16, y, { size: 11, bold: true });
    doc.line(M.X0 + 14, y + 1.4, 85, y + 1.4, { width: 0.4 });
    doc.text('Departamento:', 110, y, { size: 11 });
    doc.text(d.departamento, 137, y, { size: 11, bold: true });
    doc.line(135, y + 1.4, 190, y + 1.4, { width: 0.4 });

    /* ---------- Numeración final "X de N" ---------- */
    const N = doc.pageCount();
    const cellX = (M.CEL[5] + M.CEL[6]) / 2;
    for (let i = 0; i < N; i++) {
      doc.current = doc.pages[i];
      doc.text((i + 1) + ' de ' + N, cellX, 43.0, { size: 7.5, align: 'center' });
    }

    return doc.build();
  }

  const M14 = {
    HY: [12.6, 15.9, 23.9, 36.0, 40.1],   // sin la fila de la sede
    Y_PAGINA: 38.95,
    BODY_TOP: 49,
    BODY_BOTTOM: 258
  };

  function dibujarEncabezado14(doc, d) {
    const { X0, X1, X2, X3, CEL } = M;
    const HY = M14.HY, U = HY.length - 1;

    doc.rect(X0, HY[0], X3 - X0, HY[U] - HY[0]);
    doc.line(X1, HY[0], X1, HY[U]);
    doc.line(X1, HY[1], X3, HY[1]);
    doc.line(X1, HY[3], X3, HY[3]);
    doc.line(X2, HY[1], X2, HY[3]);
    doc.line(X2, HY[2], X3, HY[2]);

    const cellW = X1 - X0 - 4, cellH = HY[U] - HY[0] - 4;
    let lw = cellW, lh = lw * d.logo.h / d.logo.w;
    if (lh > cellH) { lh = cellH; lw = lh * d.logo.w / d.logo.h; }
    doc.image('ImLogo', X0 + (X1 - X0 - lw) / 2, HY[0] + (HY[U] - HY[0] - lh) / 2, lw, lh);

    doc.text('SISTEMA INTEGRADO DE GESTIÓN DE LA CALIDAD', (X1 + X3) / 2, HY[1] - 1.1,
             { size: 7, bold: true, align: 'center' });

    const cx = (X1 + X2) / 2;
    doc.text('FORMATO TRATAMIENTO DE DATOS', cx, 24.9, { size: 8, bold: true, align: 'center' });
    doc.text('PERSONALES',                   cx, 28.0, { size: 8, bold: true, align: 'center' });

    const cx3 = (X2 + X3) / 2;
    doc.text('UNIDAD FUNCIONAL', cx3, 18.8, { size: 7.5, bold: true, align: 'center' });
    doc.text('ASISTENCIAL',      cx3, 22.0, { size: 7.5, bold: true, align: 'center' });
    doc.text('Versión 1',        cx3, 30.5, { size: 8, align: 'center' });

    for (let i = 1; i < CEL.length - 1; i++) doc.line(CEL[i], HY[3], CEL[i], HY[4]);
    const y = M14.Y_PAGINA;
    const mid = (a, b) => (CEL[a] + CEL[b]) / 2;
    doc.text('Fecha de Elaboración', mid(0, 1), y, { size: 7.5, bold: true, align: 'center' });
    doc.text(d.consent.fechaElab || d.fechaCorta, mid(1, 2), y, { size: 7.5, align: 'center' });
    doc.text('Código',               mid(2, 3), y, { size: 7.5, bold: true, align: 'center' });
    doc.text(d.consent.codigo,       mid(3, 4), y, { size: 7.5, align: 'center' });
    doc.text('Página',               mid(4, 5), y, { size: 7.5, bold: true, align: 'center' });
  }

  const NUMERALES_14 = [
    'La IPS Acción Salud Para Todos SAS, actuará como responsable del Tratamiento de datos personales de los cuales soy titular y que, conjunta o separadamente podrá recolectar, usar y tratar mis datos personales conforme la Política de Tratamiento de Datos Personales la IPS Acción Salud Para Todos SAS, disponible en SGC en página web de la entidad.',
    null,
    'Es de carácter facultativo o voluntario responder preguntas que versen sobre Datos Sensibles o sobre menores de edad.',
    'Mis derechos como titular de los datos son los previstos en la Constitución y la ley, especialmente el derecho a conocer, actualizar, rectificar y suprimir mi información personal, así como el derecho a revocar el consentimiento otorgado para el tratamiento de datos personales.',
    'Los derechos pueden ser ejercidos a través de los canales dispuestos por la IPS Acción Salud Para Todos SAS y observando la Política de Tratamiento de Datos Personales la IPS.',
    null,  
    'La IPS Acción Salud Para Todos SAS, garantizará la confidencialidad, libertad, seguridad, veracidad, transparencia, acceso y circulación restringida de mis datos y se reservará el derecho de modificar su Política de Tratamiento de Datos Personales en cualquier momento. Cualquier cambio será informado y publicado oportunamente en la página web.',
    'Teniendo en cuenta lo anterior, autorizo de manera voluntaria, previa, explícita, informada e inequívoca a la IPS Acción Para Todos SAS, para tratar mis datos personales y tomar mi huella y fotografía de acuerdo con su Política de Tratamiento de Datos Personales para los fines relacionados con su objeto y en especial para fines legales, contractuales, misionales descritos en la Política de Tratamiento de Datos Personales de la IPS.',
    'La información obtenida para el Tratamiento de mis datos personales la he suministrado de forma voluntaria y es verídica.'
  ];

  function generarPDF14(d) {
    const doc = new PDFDoc({ width: 210, height: 297 });
    doc.addImage('ImLogo', d.logo.b64, d.logo.w, d.logo.h);
    if (d.firma) doc.addImage('ImFirma', d.firma.b64, d.firma.w, d.firma.h);

    const W = M.X3 - M.X0;
    const SZ = 9.6;                      
    let y;

    function nuevaPagina() {
      doc.addPage();
      dibujarEncabezado14(doc, d);
      dibujarPie(doc);
      y = M14.BODY_TOP;
    }
    function espacio(alto) { if (y + alto > M14.BODY_BOTTOM) nuevaPagina(); }

    nuevaPagina();

    y = doc.paragraph([{ s: 'Dando cumplimiento a lo dispuesto en la Ley 1581 de 2012, "Por el cual se dictan disposiciones generales para la protección de datos personales" y de conformidad con lo señalado en el Decreto 1377 de 2013, con la firma de este documento manifiesto que he sido informado por Acción Salud Para Todos SAS, de lo siguiente:' }],
      M.X0, y, W, { size: SZ }) + 4;

    NUMERALES_14.forEach((texto, i) => {
      const n = i + 1;
      espacio(16);
      let runs;
      if (n === 2) {
        runs = [
          { s: '2. Que me ha sido informada la (s) finalidad (es) de la recolección de los datos personales, la cual consiste en: ' },
          { s: d.finalidad, bold: true, underline: true },
          { s: '.' }
        ];
      } else if (n === 6) {
        const sitio = d.consent.sitioWeb;
        runs = [{ s: '6. Mediante la página web de la entidad' + (sitio ? ' (' + sitio + ')' : '') +
                     ', podré radicar cualquier tipo de requerimiento relacionado con el tratamiento de mis datos personales.' }];
      } else {
        runs = [{ s: n + '. ' + texto }];
      }
      y = doc.paragraph(runs, M.X0, y, W, { size: SZ }) + 1.2;
    });

    espacio(30);
    y += 4;
    y = doc.paragraph([{ s: 'Al firmar este formulario reconozco que comprendo perfectamente su contenido.' }],
      M.X0, y, W, { size: SZ, justify: false }) + 4;

    y = doc.paragraph([
      { s: 'Firmado en la ciudad de ' }, { s: d.ciudad, bold: true, underline: true },
      { s: ' a los ' },                  { s: d.dia,    bold: true, underline: true },
      { s: ' días del mes de ' },        { s: d.mes,    bold: true, underline: true },
      { s: ' del año ' },                { s: d.anio,   bold: true, underline: true }, { s: '.' }
    ], M.X0, y, W, { size: SZ, justify: false });

    /* ---------- Las dos firmas del formato ---------- */
    const LX0 = 20, LX1 = 100, RX0 = 110, RX1 = 190;
    const destino = (d.consent.bloqueFirma || {})[d.personaId] || 'paciente';
    const ALTO_FIRMA = 11;
    const SOBRE_LINEA = ALTO_FIRMA + 5;
    espacio(SOBRE_LINEA + 16);
    y += SOBRE_LINEA;
    const yFirma = y;

    function bloque14(x0, x1, rotulo, mio) {
      let yy = yFirma;
      if (mio && d.firma) {
        let fh = ALTO_FIRMA, fw = fh * d.firma.w / d.firma.h;
        if (fw > x1 - x0 - 6) { fw = x1 - x0 - 6; fh = fw * d.firma.h / d.firma.w; }
        doc.image('ImFirma', x0 + 3, yy - fh - 3.5, fw, fh);
      }
      if (mio) doc.text(d.nombreCompleto, x0 + 3, yy - 1.4, { size: 9, bold: true });
      doc.line(x0, yy, x1, yy, { width: 0.5 });
      yy += 4.6;
      doc.text(rotulo, x0, yy, { size: 9.5 });
      yy += 4.8;
      const etiqueta = 'C.C. o HUELLA ';
      const finEtiqueta = doc.text(etiqueta, x0, yy, { size: 9.5 });
      if (mio) doc.text(d.numeroDoc, finEtiqueta + 1.5, yy, { size: 9.5, bold: true });
      doc.line(finEtiqueta + 1, yy + 1.2, x1, yy + 1.2, { width: 0.4 });
      return yy + 6;
    }

    const yIzq = bloque14(LX0, LX1, 'PACIENTE',             destino === 'paciente');
    const yDer = bloque14(RX0, RX1, 'TESTIGO Y/O APODERADO', destino === 'testigo');
    y = Math.max(yIzq, yDer);

    /* ---------- Numeración final "X de N" ---------- */
    const N = doc.pageCount();
    const cellX = (M.CEL[5] + M.CEL[6]) / 2;
    for (let i = 0; i < N; i++) {
      doc.current = doc.pages[i];
      doc.text((i + 1) + ' de ' + N, cellX, M14.Y_PAGINA, { size: 7.5, align: 'center' });
    }

    return doc.build();
  }

  const M7 = {
    X0: 20, X1: 62, X2: 148, X3: 190,
    HY: [14, 22.5, 31, 39.5, 48],   
    BODY_TOP: 58,
    BODY_BOTTOM: 268
  };

  const NUMERALES_7 = [
    [{ s: 'Acción Salud Para Todos S.A.S., actuará como responsable del tratamiento de mis datos personales y podrá recolectar, almacenar, usar y tratar la información que suministre voluntariamente, de conformidad con su Política de Tratamiento de Datos Personales.' }],
    [{ s: 'La finalidad de la recolección de mis datos personales y de la información contenida en mi hoja de vida es participar en el proyecto ' },
     { s: 'CREAS CONECTA', bold: true },
     { s: ', mediante la creación de un banco de hojas de vida, identificación de oportunidades laborales, formativas o de emprendimiento, contacto para informar sobre dichas oportunidades y remisión de mi hoja de vida a empresas, entidades u organizaciones que puedan requerir perfiles relacionados con mi formación y experiencia.' }],
    [{ s: 'Entiendo que la remisión de mi hoja de vida no garantiza una contratación o vinculación y que mi participación en el proyecto ' },
     { s: 'CREAS CONECTA', bold: true },
     { s: ' es voluntaria y no afecta la atención en salud que recibo en ' },
     { s: 'Acción Salud Para Todos S.A.S.', bold: true }],
    [{ s: 'Mis derechos como titular de los datos son los previstos en la Constitución y la ley, especialmente el derecho a conocer, actualizar, rectificar y solicitar la supresión de mi información, así como revocar la autorización otorgada para el tratamiento de mis datos personales, cuando sea procedente.' }],
    [{ s: 'Acción Salud Para Todos S.A.S', bold: true },
     { s: '. garantizará la confidencialidad, seguridad, veracidad, transparencia y circulación restringida de mis datos personales, de acuerdo con su Política de Tratamiento de Datos Personales.' }],
    [{ s: 'Teniendo en cuenta lo anterior, autorizo de manera voluntaria, previa, explícita, informada e inequívoca a Acción Salud Para Todos S.A.S. para tratar mis datos personales y la información contenida en mi hoja de vida, de acuerdo con las finalidades descritas en el presente documento.' }],
    [{ s: 'La información suministrada para el proyecto ' },
     { s: 'CREAS CONECTA', bold: true },
     { s: ' la he proporcionado de manera voluntaria y es verídica. Al firmar este formulario reconozco que comprendo perfectamente su contenido.' }]
  ];

  function dibujarEncabezado7(doc, d) {
    const { X0, X1, X2, X3, HY } = M7;
    const U = HY.length - 1;
    const marco = { rgb: d.consent.colorMarco || [59, 191, 193], width: 0.9 };

    doc.rect(X0, HY[0], X3 - X0, HY[U] - HY[0], marco);
    doc.line(X1, HY[0], X1, HY[U], marco);
    doc.line(X2, HY[0], X2, HY[U], marco);
    for (let i = 1; i < U; i++) doc.line(X2, HY[i], X3, HY[i], marco);

    const cellW = X1 - X0 - 3, cellH = HY[U] - HY[0] - 3;
    let lw = cellW, lh = lw * d.logo.h / d.logo.w;
    if (lh > cellH) { lh = cellH; lw = lh * d.logo.w / d.logo.h; }
    doc.image('ImLogo', X0 + (X1 - X0 - lw) / 2, HY[0] + (HY[U] - HY[0] - lh) / 2, lw, lh);

    const cx = (X1 + X2) / 2;
    doc.text('CONSENTIMIENTO INFORMADO', cx, 29.4, { size: 9.5, bold: true, align: 'center' });
    doc.text('CREAS CONECTA – USO DE DATOS PERSONALES', cx, 33.4, { size: 9.5, bold: true, align: 'center' });

    const cx3 = (X2 + X3) / 2;
    const filas = [
      'VERSIÓN: ' + (d.consent.version || '001'),
      'CÓDIGO: ' + d.consent.codigo,
      'VIGENTE HASTA: ' + (d.consent.vigenteHasta || '')
    ];
    filas.forEach((t, i) => {
      doc.text(t, cx3, (HY[i] + HY[i + 1]) / 2 + 1.1, { size: 7.6, bold: true, align: 'center' });
    });
    return (HY[U - 1] + HY[U]) / 2 + 1.1;
  }

  function generarPDF7(d) {
    const doc = new PDFDoc({ width: 210, height: 297 });
    doc.addImage('ImLogo', d.logo.b64, d.logo.w, d.logo.h);
    if (d.firma) doc.addImage('ImFirma', d.firma.b64, d.firma.w, d.firma.h);

    const X0 = 25, W = 165;      // el cuerpo va más estrecho que el marco
    const SZ = 9.8;
    const SANGRIA = 6;           // el texto de cada numeral cuelga bajo su número
    let y, yPagina;

    function nuevaPagina() {
      doc.addPage();
      yPagina = dibujarEncabezado7(doc, d);
      y = M7.BODY_TOP;
    }
    function espacio(alto) { if (y + alto > M7.BODY_BOTTOM) nuevaPagina(); }

    nuevaPagina();

    y = doc.paragraph([{ s: 'Dando cumplimiento a lo dispuesto en la Ley 1581 de 2012, y demás normas aplicables a la protección de datos personales, con la firma de este documento manifiesto que he sido informado(a) por Acción Salud Para Todos S.A.S.., de lo siguiente:' }],
      X0, y, W, { size: SZ }) + 4;

    NUMERALES_7.forEach((runs, i) => {
      espacio(18);
      doc.text((i + 1) + '.', X0, y, { size: SZ, bold: true });
      y = doc.paragraph(runs, X0 + SANGRIA, y, W - SANGRIA, { size: SZ }) + 3;
    });

    y += 1;
    y = doc.paragraph([
      { s: 'Firmado en la ciudad de ' }, { s: d.ciudad, bold: true, underline: true },
      { s: ' a los ' },                  { s: d.dia,    bold: true, underline: true },
      { s: ' días del mes de ' },        { s: d.mes,    bold: true, underline: true },
      { s: ' del año ' },                { s: d.anio,   bold: true, underline: true }
    ], X0, y, W, { size: SZ, justify: false });

    /* ---------- Las dos firmas ---------- */
    const LX0 = 25, LX1 = 103, RX0 = 112, RX1 = 190;
    const destino = (d.consent.bloqueFirma || {})[d.personaId] || 'paciente';
    const ALTO_FIRMA = 11;
    const SOBRE_LINEA = ALTO_FIRMA + 5;

    espacio(SOBRE_LINEA + 18);
    y += SOBRE_LINEA + 4;
    const yFirma = y;

    function bloque7(x0, x1, rotulo, mio) {
      let yy = yFirma;
      if (mio && d.firma) {
        let fh = ALTO_FIRMA, fw = fh * d.firma.w / d.firma.h;
        if (fw > x1 - x0 - 6) { fw = x1 - x0 - 6; fh = fw * d.firma.h / d.firma.w; }
        doc.image('ImFirma', x0 + 3, yy - fh - 3.5, fw, fh);
      }
      if (mio) doc.text(d.nombreCompleto, x0 + 3, yy - 1.4, { size: 9, bold: true });
      doc.line(x0, yy, x1, yy, { width: 0.5 });
      yy += 4.6;
      doc.text(rotulo, x0, yy, { size: 9.5 });
      yy += 4.8;
      const fin = doc.text('C.C. o HUELLA ', x0, yy, { size: 9.5 });
      if (mio) doc.text(d.numeroDoc, fin + 1.5, yy, { size: 9.5, bold: true });
      doc.line(fin + 1, yy + 1.2, x1, yy + 1.2, { width: 0.4 });
      return yy + 6;
    }

    const yIzq = bloque7(LX0, LX1, 'PACIENTE',              destino === 'paciente');
    const yDer = bloque7(RX0, RX1, 'TESTIGO Y/O APODERADO',  destino === 'testigo');
    y = Math.max(yIzq, yDer);

    const N = doc.pageCount();
    const cx3 = (M7.X2 + M7.X3) / 2;
    for (let i = 0; i < N; i++) {
      doc.current = doc.pages[i];
      doc.text('Página ' + (i + 1) + ' de ' + N, cx3, yPagina, { size: 7.6, bold: true, align: 'center' });
    }

    return doc.build();
  }

  const CUERPO_SF = [
    { t: 'vineta', runs: [{ s: '1. Derechos del Usuario:', bold: true }] },
    { t: 'parrafo', runs: [{ s: 'Como usuario de la institución ' }, { s: 'UNIDAD SAN FELIPE S.A.S', bold: true, italic: true }, { s: '., tengo derecho a:' }] },
    { t: 'vineta', runs: [{ s: 'Acceder a servicios de atención médica, social y psicológica', bold: true }, { s: ' dentro de los límites establecidos por la institución.' }] },
    { t: 'vineta', runs: [{ s: 'Recibir información clara y oportuna', bold: true }, { s: ' sobre los tratamientos, procedimientos y actividades que se me asignen, de acuerdo con mi situación.' }] },
    { t: 'vineta', runs: [{ s: 'Permanecer en un entorno seguro y respetuoso', bold: true }, { s: ', libre de cualquier tipo de abuso, negligencia o trato inadecuado.' }] },
    { t: 'vineta', runs: [{ s: 'Solicitar y recibir orientación', bold: true }, { s: ', tanto médica como social, por parte de los profesionales responsables de la institución, conforme a los protocolos establecidos.' }] },
    { t: 'vineta', runs: [{ s: 'Acceder a las instalaciones del Hogar de Paso', bold: true }, { s: ', donde se me asignará una habitación de acuerdo con la disponibilidad, cumpliendo con las normativas y procedimientos internos.' }] },
    { t: 'vineta', runs: [{ s: '2. Deberes y Responsabilidades del Usuario:', bold: true }] },
    { t: 'parrafo', runs: [{ s: 'Como usuario, me comprometo a:' }] },
    { t: 'vineta', runs: [{ s: 'Respetar todas las normas y reglas internas de la institución', bold: true }, { s: ', las cuales están diseñadas para garantizar el buen funcionamiento de los servicios y el bienestar colectivo de los usuarios y el personal.' }] },
    { t: 'vineta', runs: [{ s: 'Cumplir con los horarios establecidos', bold: true }, { s: ' para el ingreso y salida del Hogar de Paso, así como los horarios de comida, actividades y atención médica.' }] },
    { t: 'vineta', runs: [{ s: 'Mantener una conducta respetuosa y cordial', bold: true }, { s: ' con el personal de la institución, así como con otros usuarios, fomentando un ambiente armónico y colaborativo.' }] },
    { t: 'vineta', runs: [{ s: 'Participar activamente en las actividades asignadas', bold: true }, { s: ' por los profesionales de la institución, en el marco de los servicios de consulta externa y tratamiento, cuando sea pertinente.' }] },
    { t: 'vineta', runs: [{ s: 'Informar oportunamente', bold: true }, { s: ' cualquier situación que considere relevante para su bienestar, ya sea física, psicológica o emocional.' }] },
    { t: 'vineta', runs: [{ s: '3. Normas de Convivencia y Funcionamiento del Hogar de Paso:', bold: true }] },
    { t: 'numero', marca: '1.', runs: [{ s: 'Horarios:', bold: true }] },
    { t: 'sub', runs: [{ s: 'El usuario debe cumplir con los horarios establecidos para las actividades de la institución, tales como el ingreso al hogar, las comidas, las actividades recreativas y de desarrollo personal, y las consultas médicas o psicológicas.' }] },
    { t: 'sub', runs: [{ s: 'El horario de salida y entrada será determinado según la normativa interna de la institución. Las llegadas tardías o ausencias injustificadas podrán ser motivo de suspensión temporal o definitiva de los servicios.' }] },
    { t: 'literal', marca: '1.0', runs: [{ s: 'Asignación de Habitaciones:', bold: true }] },
    { t: 'subplano', runs: [{ s: 'El Hogar de Paso proporciona habitaciones asignadas por el personal encargado, conforme a la disponibilidad y las necesidades del usuario. Estas habitaciones deben ser utilizadas exclusivamente por el usuario asignado.' }] },
    { t: 'sub', runs: [{ s: 'No se permite el ingreso de visitas o el uso de las habitaciones por otras personas sin la autorización previa del personal de la institución.' }] },
    { t: 'numero', marca: '2.', runs: [{ s: 'Uso de Espacios Comunes:', bold: true }] },
    { t: 'sub', runs: [{ s: 'Los usuarios deben respetar las normas de convivencia en las áreas comunes, tales como la cocina, los baños, los espacios recreativos, etc. El uso de estos espacios será supervisado para asegurar que todos los usuarios puedan disfrutar de ellos de manera ordenada y respetuosa.' }] },
    { t: 'numero', marca: '3.', runs: [{ s: 'Responsabilidad de las Pertenencias Personales:', bold: true }] },
    { t: 'sub', runs: [{ s: 'La institución no se hace responsable por la pérdida, robo o daño de las pertenencias personales que el usuario traiga a las instalaciones. Es responsabilidad del usuario tomar las precauciones necesarias para el cuidado de sus objetos personales.' }] },
    { t: 'sub', runs: [{ s: 'Se recomienda no traer objetos de valor, a fin de evitar riesgos innecesarios.' }] },
    { t: 'numero', marca: '4.', runs: [{ s: 'Normas de Seguridad y Comportamiento:', bold: true }] },
    { t: 'sub', runs: [{ s: 'El consumo de alcohol y/o sustancias psicoactivas (incluyendo drogas ilícitas, medicamentos sin receta médica, y otras sustancias que alteren el estado de conciencia)', bold: true }, { s: ' está estrictamente prohibido dentro de las instalaciones del Hogar de Paso. El incumplimiento de esta norma resultará en la inmediata expulsión del usuario de la institución y en la notificación a las autoridades pertinentes.' }] },
    { t: 'sub', runs: [{ s: 'El consumo de tabaco', bold: true }, { s: ' solo está permitido en las áreas específicas designadas para ello, de acuerdo con la normativa interna de la institución.' }] },
    { t: 'sub', runs: [{ s: 'El uso de armas u objetos peligrosos', bold: true }, { s: ' está prohibido en todas las instalaciones del Hogar de Paso.' }] },
    { t: 'vineta', runs: [{ s: '4. Consecuencias del Incumplimiento de las Normas:', bold: true }] },
    { t: 'vineta', runs: [{ s: 'Incumplir cualquiera de las normas mencionadas anteriormente podrá resultar en la suspensión temporal o definitiva de los servicios proporcionados por la institución.', bold: true }] },
    { t: 'vineta', runs: [{ s: 'La institución se reserva el derecho de notificar a las autoridades pertinentes', bold: true }, { s: ' (tales como organismos gubernamentales, entidades judiciales, o fuerzas de seguridad) en caso de que se infrinja la ley, o en situaciones donde la seguridad de los usuarios o el personal esté en peligro.' }] },
    { t: 'vineta', runs: [{ s: '5. Declaración de Uso para Fines Legales:', bold: true }] },
    { t: 'vineta', runs: [{ s: 'Este documento de consentimiento informado ' }, { s: 'será utilizado para fines legales', bold: true }, { s: ' y como base para la gestión administrativa interna de la institución. Cualquier incumplimiento de las normativas descritas en este documento puede ser objeto de sanciones y notificaciones a las autoridades competentes.' }] },
    { t: 'vineta', runs: [{ s: 'Al firmar este documento, el usuario reconoce y acepta todas las condiciones expuestas en el mismo', bold: true }, { s: ', con el entendimiento de que la firma implica el consentimiento para ser atendido y para que sus datos sean manejados de acuerdo con las leyes de protección de datos personales vigentes.' }] },
  ];

  const SANG_SF = {
    parrafo:   { marca: null, texto: 0 },
    vineta:    { marca: 6.1,  texto: 12.7, glifo: '\u2022' },
    numero:    { marca: 6.4,  texto: 12.8 },
    literal:   { marca: 19.1, texto: 25.4 },
    sub:       { marca: 19.1, texto: 25.4, glifo: 'o' },
    subplano:  { marca: null, texto: 25.4 }
  };

  const M_SF = {
    TX0: 11.2, TX1: 66.8, TX2: 204.7,
    TY:  [2.0, 6.6, 16.5, 26.1],
    CEL: [66.8, 76.5, 104.6, 123.7, 144.8, 164.6, 181.6, 204.7],
    BX: 30.2, BW: 155.5,
    BODY_TOP: 33.5,
    BODY_BOTTOM: 251.5,
    BANDA_X: 4.3, BANDA_W: 201.9
  };

  function dibujarEncabezadoSF(doc, d) {
    const { TX0, TX1, TX2, TY, CEL } = M_SF;
    const U = TY.length - 1;

    doc.rect(TX0, TY[0], TX2 - TX0, TY[U] - TY[0], { width: 0.9 });
    doc.line(TX1, TY[0], TX1, TY[U], { width: 0.9 });
    doc.line(TX1, TY[1], TX2, TY[1], { width: 0.6 });
    doc.line(TX1, TY[2], TX2, TY[2], { width: 0.6 });
    for (let i = 1; i < CEL.length - 1; i++) doc.line(CEL[i], TY[2], CEL[i], TY[3], { width: 0.6 });

    const cellW = TX1 - TX0 - 3, cellH = TY[U] - TY[0] - 3;
    let lw = cellW, lh = lw * d.logo.h / d.logo.w;
    if (lh > cellH) { lh = cellH; lw = lh * d.logo.w / d.logo.h; }
    doc.image('ImLogo', TX0 + (TX1 - TX0 - lw) / 2, TY[0] + (TY[U] - TY[0] - lh) / 2, lw, lh);

    const cx = (TX1 + TX2) / 2;
    doc.text('SISTEMA DE GESTIÓN DOCUMENTAL – UNIDAD SAN FELIPE S.A.S.', cx, TY[1] - 1.2,
             { size: 8.5, bold: true, align: 'center' });
    doc.text('CONSENTIMIENTO INFORMADO DE PACIENTES UNIDAD SAN', cx, 10.6, { size: 8.5, bold: true, align: 'center' });
    doc.text('FELIPE S.A.S.',                                    cx, 14.2, { size: 8.5, bold: true, align: 'center' });

    const y = (TY[2] + TY[3]) / 2 + 1.1;
    const mid = (a, b) => (CEL[a] + CEL[b]) / 2;
    doc.text('CÓD.',              mid(0, 1), y, { size: 7, bold: true, align: 'center' });
    doc.text(d.consent.codigo,    mid(1, 2), y, { size: 7, align: 'center' });
    doc.text('FECHA',             mid(2, 3), y, { size: 7, bold: true, align: 'center' });
    doc.text(d.consent.fechaFormato || d.fechaCorta, mid(3, 4), y, { size: 7, align: 'center' });
    doc.text('VERSIÓN',           mid(4, 5), y, { size: 7, bold: true, align: 'center' });
    doc.text(d.consent.version || '01', mid(5, 6), y, { size: 7, align: 'center' });
    // La última celda lleva el "Página X de N", que se estampa al cerrar.
    return y;
  }

  function dibujarBandaSF(doc, d, altoHoja) {
    if (!d.consent.banda) return;
    const b = d.consent.banda;
    const w = M_SF.BANDA_W;
    const h = w * b.h / b.w;
    doc.image('ImBanda', M_SF.BANDA_X, altoHoja - h, w, h);
  }

  function generarPDFSanFelipe(d) {
    const hoja = d.consent.hoja || { ancho: 215.9, alto: 279.4 };
    // El Word original está compuesto en Times New Roman, no en Arial.
    const doc = new PDFDoc({ width: hoja.ancho, height: hoja.alto, familia: 'times' });
    doc.addImage('ImLogo', d.logo.b64, d.logo.w, d.logo.h);
    if (d.consent.banda) doc.addImage('ImBanda', d.consent.banda.b64, d.consent.banda.w, d.consent.banda.h);
    if (d.firma) doc.addImage('ImFirma', d.firma.b64, d.firma.w, d.firma.h);
    if (d.firmaResponsable) {
      doc.addImage('ImFirmaResp', d.firmaResponsable.b64, d.firmaResponsable.w, d.firmaResponsable.h);
    }

    /* Times New Roman 10 con interlineado sencillo, medido sobre el Word
       original: a ese cuerpo las líneas cortan donde cortan allí. */
    const SZ = 10, LH = 4.06;
    const X = M_SF.BX, W = M_SF.BW;
    let y, yPagina;

    function nuevaPagina() {
      doc.addPage();
      yPagina = dibujarEncabezadoSF(doc, d);
      dibujarBandaSF(doc, d, hoja.alto);
      y = M_SF.BODY_TOP;
    }
    function espacio(alto) { if (y + alto > M_SF.BODY_BOTTOM) nuevaPagina(); }

    nuevaPagina();

    // Título
    y += 3.5;
    doc.text('CONSENTIMIENTO INFORMADO PARA TRATAMIENTOS DE PACIENTES UNIDAD', X + W / 2, y, { size: 10, bold: true, align: 'center' });
    doc.text('SAN FELIPE S.A.S.', X + W / 2, y + 4.3, { size: 10, bold: true, align: 'center' });
    y += 12;

    // Fecha y entidad
    const linea = (etiqueta, valor, x0, x1) => {
      const fin = doc.text(etiqueta, x0, y, { size: SZ });
      if (valor) doc.text(valor, fin + 1.5, y, { size: SZ, bold: true });
      doc.line(fin + 1, y + 1.3, x1, y + 1.3, { width: 0.4 });
    };
    linea('FECHA: ',   d.fechaCorta,        X,        X + 68);
    linea('ENTIDAD: ', d.entidadRemitente,  X + 78,   X + W);
    y += 9.5;

    // Encabezado declarativo, con los espacios del formato ya rellenos
    y = doc.paragraph([
      { s: 'Yo ' }, { s: d.nombreCompleto, bold: true, underline: true },
      { s: ', con cédula de ciudadanía ' }, { s: d.numeroDoc, bold: true, underline: true },
      { s: ', mayor de edad, en mi propio nombre y representación y/o como padre/madre o tutor legal y/o acompañante de ' },
      { s: d.representadoNombre || '____________________', bold: !!d.representadoNombre, underline: true },
      { s: ', con Identificación ' },
      { s: d.representadoDoc || '____________', bold: !!d.representadoDoc, underline: true },
      { s: ' en pleno uso de mis facultades al recibir los servicios prestados por ' },
      { s: 'UNIDAD SAN FELIPE S.A.S', bold: true, italic: true },
      { s: '., en calidad de usuario del Hogar de Paso y/o Consulta Externa, declaro que he sido debidamente informado sobre las normas, responsabilidades, derechos y prohibiciones relacionadas con mi estadía y participación en los servicios. En consecuencia, firmo el presente consentimiento informado de forma libre y voluntaria, y acepto las condiciones que se detallan a continuación:' }
    ], X, y, W, { size: SZ, lineHeight: LH }) + 2.5;

    // Cuerpo transcrito del Word
    CUERPO_SF.forEach((p) => {
      const s = SANG_SF[p.t] || SANG_SF.parrafo;
      const opts = { size: SZ, lineHeight: LH };
      if (p.t === 'subplano') y += 3.4;
      const alto = doc.paragraph(p.runs, X + s.texto, y, W - s.texto,
                                 Object.assign({ medir: true }, opts)) - y;
      espacio(alto);
      const glifo = p.marca || s.glifo;
      if (glifo && s.marca !== null) doc.text(glifo, X + s.marca, y, { size: SZ, bold: p.t === 'numero' });
      y = doc.paragraph(p.runs, X + s.texto, y, W - s.texto, opts) + 0.35;
    });

    espacio(16);
    y += 4;
    y = doc.paragraph([{ s: 'Declaro que he tenido la oportunidad de hacer preguntas sobre el procedimiento, que todas mis inquietudes han sido resueltas y que entiendo completamente la información proporcionada.', italic: true, underline: true }],
      X, y, W, { size: SZ, lineHeight: LH, justify: false });

    /* ---------- Las dos firmas ---------- */
    const LX0 = X, LX1 = X + 62, RX0 = X + 82, RX1 = X + W;
    const destino = (d.consent.bloqueFirma || {})[d.personaId] || 'paciente';
    const ALTO_FIRMA = 11;
    const SOBRE = ALTO_FIRMA + 5;

    espacio(SOBRE + 18);
    y += SOBRE + 6;
    const yFirma = y;

    /* Cada bloque recibe su propio firmante: `quien` trae nombre, documento
       e imagen de la firma, o null si esa línea se deja para llenar a mano. */
    function bloqueSF(x0, x1, rotulo, quien) {
      let yy = yFirma;
      const firma = quien && quien.firma;
      if (firma) {
        let fh = ALTO_FIRMA, fw = fh * firma.w / firma.h;
        if (fw > x1 - x0 - 6) { fw = x1 - x0 - 6; fh = fw * firma.h / firma.w; }
        doc.image(quien.img, x0 + 3, yy - fh - 3.5, fw, fh);
      }
      if (quien) doc.text(quien.nombre, x0 + 3, yy - 1.4, { size: 8.5, bold: true });
      doc.line(x0, yy, x1, yy, { width: 0.5 });
      yy += 4.4;
      doc.text(rotulo, x0, yy, { size: 8.5, bold: true });
      yy += 4.4;
      const fin = doc.text('IDENTIFICACIÓN: ', x0, yy, { size: 8.5, bold: true });
      if (quien && quien.documento) doc.text(quien.documento, fin + 1.5, yy, { size: 8.5 });
      doc.line(fin + 1, yy + 1.2, x1, yy + 1.2, { width: 0.4 });
      return yy + 6;
    }

    const elPaciente = (destino === 'paciente')
      ? { nombre: d.nombreCompleto, documento: d.numeroDoc, firma: d.firma, img: 'ImFirma' }
      : null;
    const elResponsable = d.responsable
      ? { nombre: d.responsable.nombre, documento: d.responsable.documento,
          firma: d.firmaResponsable, img: 'ImFirmaResp' }
      : null;

    const yIzq = bloqueSF(LX0, LX1, 'FIRMA DEL PACIENTE', elPaciente);
    const yDer = bloqueSF(RX0, RX1, 'FIRMA DEL RESPONSABLE DE LA INSTITUCION', elResponsable);
    y = Math.max(yIzq, yDer);

    const N = doc.pageCount();
    const cellX = (M_SF.CEL[6] + M_SF.CEL[7]) / 2;
    for (let i = 0; i < N; i++) {
      doc.current = doc.pages[i];
      doc.text('Página ' + (i + 1) + ' de ' + N, cellX, yPagina, { size: 7, align: 'center' });
    }

    return doc.build();
  }

  const C_CERT = {
    azul:      [0, 91, 142],     // reglas y rótulos destacados
    azulTexto: [0, 61, 92],      // razón social y título
    gris:      [74, 96, 112],    // NIT, dirección y pies de firma
    texto:     [26, 43, 56],     // cuerpo y tabla
    sepFuerte: [176, 207, 224],
    sepSuave:  [224, 236, 244],
    cajaFondo: [240, 248, 255],
    verde:     [0, 168, 120]     // la hora, como en el original
  };

  const M_CERT = {
    X0: 6.2, X1: 209.2,          // márgenes del cuerpo
    VALOR: 37,                   // columna de valores de la tabla
    FILA: 6.9                    // alto de cada fila
  };

  const DIAS  = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

  function generarPDFCertificado(d) {
    const hoja = d.consent.hoja || { ancho: 215.9, alto: 279.4 };
    const doc = new PDFDoc({ width: hoja.ancho, height: hoja.alto });
    doc.addImage('ImLogo', d.logo.b64, d.logo.w, d.logo.h);
    if (d.firma) doc.addImage('ImFirma', d.firma.b64, d.firma.w, d.firma.h);
    doc.addPage();

    const W = hoja.ancho, X0 = M_CERT.X0, X1 = M_CERT.X1;
    const membrete = d.consent.membrete || {};

    /* ---------- Membrete ---------- */
    // Logo más grande que en el documento de referencia, a la izquierda.
    const lw = 46, lh = lw * d.logo.h / d.logo.w;
    doc.image('ImLogo', 8, 10.5 - lh / 2, lw, lh);

    // El bloque de texto se centra en el espacio que queda a la derecha.
    const cxCab = (8 + lw + W) / 2;
    doc.text(membrete.razon || '', cxCab, 6.4, { size: 11.5, bold: true, align: 'center', rgb: C_CERT.azulTexto });
    doc.text(membrete.nit || '',       cxCab, 10.6, { size: 7.5, align: 'center', rgb: C_CERT.gris });
    doc.text(membrete.ciudad || '',    cxCab, 13.8, { size: 7.5, align: 'center', rgb: C_CERT.gris });
    doc.text(membrete.direccion || '', cxCab, 17.0, { size: 7.5, align: 'center', rgb: C_CERT.gris });

    doc.line(0, 20.0, W, 20.0, { width: 0.5, rgb: C_CERT.azul });
    doc.text('CERTIFICADO DE ATENCIÓN', W / 2, 26.9,
             { size: 13.5, bold: true, align: 'center', rgb: C_CERT.azulTexto, tracking: 0.6 });
    doc.line(0, 31.6, W, 31.6, { width: 0.9, rgb: C_CERT.azul });

    let sede = d.sedeNombre || '';
    const prefijo = (membrete.razon || '') + ' ';
    if (sede.indexOf(prefijo) === 0) sede = sede.slice(prefijo.length);

    /* ---------- Declaración ----------
       Con un acompañante la constancia es sobre otra persona: cambia el
       sujeto de la frase y el posesivo del final. */
    const declaracion = d.paciente ? [
      { s: 'Yo. ' }, { s: d.nombreCompleto },
      { s: ' identificado con ' + d.tipoDocId + ' - ' + d.numeroDoc +
           ', en calidad de ' + (d.calidad || 'acompañante o familiar') + ' de ' },
      { s: d.paciente.nombre },
      { s: ' identificado con ' + d.paciente.tipoDocId + ' - ' + d.paciente.numeroDoc +
           ', certifico que recibió a satisfacción los servicios antes descritos por ' },
      { s: sede },
      { s: ' quedando constancia de esto en su historia clínica.' }
    ] : [
      { s: 'Yo. ' }, { s: d.nombreCompleto },
      { s: ' identificado con ' + d.tipoDocId + ' - ' + d.numeroDoc +
           ', certifico haber recibido a satisfacción los servicios antes descritos por ' },
      { s: sede },
      { s: ' quedando constancia de esto en mi historia clínica.' }
    ];
    let y = doc.paragraph(declaracion, X0, 39.7, X1 - X0,
                          { size: 9.2, rgb: C_CERT.texto });

    /* ---------- Tabla ---------- */
    const filas = [
      ['Fecha:',          d.fechaAtencionLarga],
      ['Convenio:',       d.convenio],
      ['Procedimiento:',  d.procedimiento],
      ['Observaciones:',  d.observaciones],
      ['Usuario:',        d.usuario]
    ];
    /* La tabla arranca donde el documento de referencia, salvo que la
       declaración crezca (nombres largos, o la frase del acompañante, que
       lleva dos personas): entonces baja lo justo para no pisarla. */
    let yf = Math.max(50.1, y + 2.2);
    doc.line(0, yf, W, yf, { width: 0.35, rgb: C_CERT.sepFuerte });
    filas.forEach((f, i) => {
      const base = yf + M_CERT.FILA - 2.3;
      doc.text(f[0], 6.5, base, { size: 8.6, bold: true, rgb: C_CERT.texto });
      if (f[1]) doc.text(String(f[1]), M_CERT.VALOR, base, { size: 8.6, rgb: C_CERT.texto });
      yf += M_CERT.FILA;
      const ultima = (i === filas.length - 1);
      doc.line(0, yf, W, yf, { width: 0.35, rgb: ultima ? C_CERT.sepFuerte : C_CERT.sepSuave });
    });

    /* ---------- Firma ---------- */
    const yRegla = 120.6;
    if (d.firma) {
      let fh = 17, fw = fh * d.firma.w / d.firma.h;
      const maxW = 70;
      if (fw > maxW) { fw = maxW; fh = fw * d.firma.h / d.firma.w; }
      doc.image('ImFirma', W / 2 - fw / 2, yRegla - fh - 4, fw, fh);
    }
    doc.line(X0, yRegla, X1, yRegla, { width: 0.55, rgb: C_CERT.texto });
    // El rótulo lo puede cambiar el rol desde porFormato.pdf.
    doc.text((d.pdf && d.pdf.firmaCertificado) || 'FIRMA PACIENTE / RESPONSABLE',
             W / 2, 124.7,
             { size: 8.6, align: 'center', rgb: C_CERT.gris, tracking: 0.5 });
    doc.text(d.tipoDocId + ' ' + d.numeroDoc + ' - ' + d.nombreCompleto, W / 2, 128.8,
             { size: 7.4, align: 'center', rgb: C_CERT.gris });

    /* ---------- Recuadro de fecha de generación ---------- */
    const cajaY = 133.2, cajaH = 12.1;
    doc.rect(0.5, cajaY, W - 1, cajaH,
             { width: 0.35, rgb: C_CERT.sepFuerte, relleno: C_CERT.cajaFondo });
    doc.text('FECHA DE GENERACIÓN', W / 2, cajaY + 3.6,
             { size: 6.8, bold: true, align: 'center', rgb: C_CERT.azul, tracking: 0.8 });

    /* La fecha y la hora van pegadas con una barra en medio, así que se
       miden primero para centrar el conjunto. */
    const sep = '   |   ';
    const anchoF = doc.widthOf(d.generadaFecha, 9.4, true);
    const anchoS = doc.widthOf(sep, 9.4, true);
    const anchoH = doc.widthOf(d.generadaHora, 9.4, true);
    let xg = W / 2 - (anchoF + anchoS + anchoH) / 2;
    const yg = cajaY + 8.9;
    xg = doc.text(d.generadaFecha, xg, yg, { size: 9.4, bold: true, rgb: C_CERT.azulTexto });
    xg = doc.text(sep,             xg, yg, { size: 9.4, bold: true, rgb: C_CERT.sepFuerte });
    doc.text(d.generadaHora,       xg, yg, { size: 9.4, bold: true, rgb: C_CERT.verde });

    return doc.build();
  }

  // Cada consentimiento tiene su propio constructor de PDF.
  const CONSTRUCTORES = {
    imagen: generarPDF,
    datos: generarPDF14,
    creas_conecta: generarPDF7,
    pacientes_sf: generarPDFSanFelipe,
    certificado_atencion: generarPDFCertificado
  };

  const form = $('consentForm');
  const alertBox = $('formAlert');

  ['nombres', 'apellidos', 'tipoDoc', 'identificacion', 'lugarExpedicion', 'sede', 'ciudad', 'departamento']
    .forEach((id) => bindLiveClear($(id)));

  function setAlert(type, msg) {
    alertBox.textContent = msg;
    alertBox.className = 'asc-alert asc-alert--' + type;
    alertBox.classList.remove('asc-hidden');
  }

  function validar() {
    let primerError = null;
    const fail = (input, msg) => { showError(input, msg); if (!primerError) primerError = input; };

    const nombres = $('nombres'), apellidos = $('apellidos'), tipoDoc = $('tipoDoc');
    const identificacion = $('identificacion'), lugar = $('lugarExpedicion');
    const sede = $('sede'), ciudad = $('ciudad'), departamento = $('departamento');

    if (!nombres.value.trim())   fail(nombres, 'Ingrese los nombres.');
    if (!apellidos.value.trim()) fail(apellidos, 'Ingrese los apellidos.');
    if (!tipoDoc.value)          fail(tipoDoc, 'Seleccione el tipo de identificación.');

    const num = identificacion.value.trim();
    if (!num) {
      fail(identificacion, 'Ingrese el número de identificación.');
    } else if (tipoDoc.value === 'PA') {
      if (!/^[0-9A-Z]{5,15}$/.test(num)) fail(identificacion, 'Pasaporte inválido (5 a 15 letras o números).');
    } else if (!/^\d{5,15}$/.test(num)) {
      fail(identificacion, 'Debe contener solo números (5 a 15 dígitos).');
    }

    // El lugar de expedición solo lo pide el formato de uso de imagen.
    if (pide('lugarExpedicion')) {
      if (!lugar.value.trim()) {
        fail(lugar, 'Ingrese el lugar de expedición.');
      } else {
        lugar.value = normalizarLugar(lugar.value);
        if (!RE_LUGAR.test(lugar.value)) {
          fail(lugar, 'Use el formato "Ciudad, Departamento". Ej.: Montería, Córdoba');
        }
      }
    }

    /* Datos del paciente: los pide el rol, no el formato. Aparecen cuando
       quien firma no es el propio paciente (acompañante en el certificado). */
    let pacienteAparte = null;
    if (pide('paciente')) {
      const pn = $('pacienteNombre'), pt = $('pacienteTipoDoc'), pd = $('pacienteDoc');
      if (!pn.value.trim()) fail(pn, 'Ingrese el nombre del paciente.');
      if (!pt.value)        fail(pt, 'Seleccione el tipo de identificación del paciente.');

      const pnum = pd.value.trim();
      if (!pnum) {
        fail(pd, 'Ingrese el número de identificación del paciente.');
      } else if (pt.value === 'PA') {
        if (!/^[0-9A-Z]{5,15}$/.test(pnum)) fail(pd, 'Pasaporte inválido (5 a 15 letras o números).');
      } else if (!/^\d{5,15}$/.test(pnum)) {
        fail(pd, 'Debe contener solo números (5 a 15 dígitos).');
      }

      /* Firmar como acompañante de uno mismo no tiene sentido y suele ser
         un error de digitación. */
      if (pnum && pnum === num) {
        fail(pd, 'El paciente y quien firma no pueden tener el mismo documento.');
      }

      pacienteAparte = {
        nombre: titleCase(pn.value),
        tipoDocId: pt.value,
        tipoDocLabel: (TIPOS_DOC.find((t) => t.id === pt.value) || {}).label,
        numeroDoc: pnum
      };
    }

    /* La finalidad se imprime dentro del punto 2 del formato: si queda
       vacía, el consentimiento sale con una frase incompleta. */
    const finalidad = $('finalidad');
    if (pide('finalidad') && !finalidad.value.trim()) {
      fail(finalidad, 'Indique la finalidad de la recolección de los datos.');
    }

    /* Certificado: convenio, procedimiento y usuario son obligatorios;
       observaciones no, y la fecha ya viene puesta con la de hoy. */
    let convenio = '', procedimiento = '';
    if (pide('atencion')) {
      const fechaAt = $('fechaAtencion'), usuario = $('usuario');
      if (!fechaAt.value) fail(fechaAt, 'Indique la fecha de la atención.');

      /* El buscador solo da por bueno un valor cuando se elige una fila
         (de la lista o la de "Otro"): escribir sin confirmar no cuenta. */
      convenio = buscaConvenio.get();
      if (!convenio) fail($('convenio'), 'Elija el convenio de la lista, o «Otro» para usar lo escrito.');

      procedimiento = buscaProcedimiento.get();
      if (!procedimiento) fail($('procedimiento'), 'Elija el procedimiento de la lista, o «Otro» para usar lo escrito.');

      if (!usuario.value.trim()) fail(usuario, 'Indique el usuario que registra.');
    }

    if (!sede.value)                fail(sede, 'Seleccione una sede.');
    if (!ciudad.value.trim())       fail(ciudad, 'Indique la ciudad.');
    if (!departamento.value.trim()) fail(departamento, 'Indique el departamento.');

    const menores = [];
    if (toggleMinor.checked) {
      const entries = getEntries();
      if (entries.length === 0) { setAlert('error', 'Agregue al menos un menor o desactive la opción.'); return null; }
      entries.forEach((entry) => {
        const nom = entry.querySelector('[data-field="nombre"]');
        const td  = entry.querySelector('[data-field="documento"]');
        const sel = entry.querySelector('[data-field="tipoDoc"]');
        if (!nom.value.trim()) fail(nom, 'Ingrese el nombre del menor.');
        const t = td.value.trim();
        if (!t) fail(td, 'Ingrese el número de documento.');
        else if (!/^\d{5,15}$/.test(t)) fail(td, 'Debe contener solo números.');
        const tipo = TIPOS_DOC_MENOR.find((x) => x.id === sel.value) || TIPOS_DOC_MENOR[0];
        menores.push({
          nombre: titleCase(nom.value), documento: t,
          tipoDocId: tipo.id, tipoDoc: tipo.sigla, tipoDocLabel: tipo.label
        });
      });
    }

    /* Guardar en la pantalla grande ya confirma, así que basta con mirar
       si el panel tiene firma. */
    function revisarFirma(f, etiqueta) {
      if (!f.tieneTrazos()) {
        f.error.textContent = etiqueta + ' es obligatoria: pulse "Generar firma".';
        f.error.classList.remove('asc-hidden');
        if (!primerError) primerError = f.wrapper;
        return false;
      }
      return true;
    }
    revisarFirma(firmaPaciente, 'La firma');

    let responsable = null;
    if (pide('responsable')) {
      const nombreResp = buscaResponsable.get();
      if (!nombreResp) {
        fail($('responsable'), 'Elija el responsable de la institución.');
      } else {
        responsable = (RESPONSABLES().find((r) => r.nombre === nombreResp)) ||
                      { nombre: nombreResp, documento: '' };
      }
      revisarFirma(firmaResponsable, 'La firma del responsable');
    }

    if (primerError) {
      primerError.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (primerError.focus) primerError.focus({ preventScroll: true });
      return null;
    }

    const sedeObj = sedesActuales().find((s) => s.id === selSede.value) || {};
    const f = new Date();
    return {
      nombreCompleto: titleCase(nombres.value + ' ' + apellidos.value),
      tipoDocId: tipoDoc.value,
      tipoDocLabel: (TIPOS_DOC.find((t) => t.id === tipoDoc.value) || {}).label,
      numeroDoc: num,
      lugarExpedicion: titleCase(lugar.value),

      // Entidad, persona y consentimiento elegidos en la pantalla previa
      orgId: ORG.id,
      orgNombre: ORG.nombre,
      logo: logoDelPdf(),
      razonSocial: ORG.razonSocial,
      personaId: PERSONA.id,
      personaLabel: PERSONA.label,
      calidad: PERSONA.calidad || '',
      pdf: rotulosPdf(),
      paciente: pacienteAparte,
      consentId: CONSENT.id,
      consentLabel: CONSENT.label,
      consent: CONSENT,
      finalidad: finalidad.value.trim(),
      entidadRemitente: $('entidadRemitente').value.trim(),
      fechaAtencion: $('fechaAtencion').value,
      // dd/mm/aaaa para la tabla, sin pasar por Date (evita el corrimiento
      // de un día que produce interpretar 'aaaa-mm-dd' como UTC).
      fechaAtencionLarga: (function (v) {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || '');
        return m ? m[3] + '/' + m[2] + '/' + m[1] : '';
      })($('fechaAtencion').value),
      convenio: convenio,
      procedimiento: procedimiento,
      observaciones: $('observaciones').value.trim(),
      usuario: titleCase($('usuario').value),
      representadoNombre: titleCase($('representadoNombre').value),
      representadoDoc: $('representadoDoc').value.trim(),

      sedeId: sede.value,
      sedeNombre: sedeObj.nombre,
      sedeEncabezado: sedeObj.encabezado || ORG.encabezadoDefault,
      ciudad: titleCase(ciudad.value),
      departamento: titleCase(departamento.value),
      dia: String(f.getDate()),
      mes: MESES[f.getMonth()],
      anio: String(f.getFullYear()),
      // Momento en que se genera el documento, para el recuadro del pie.
      generadaFecha: DIAS[f.getDay()] + ', ' + f.getDate() + ' de ' +
                     MESES[f.getMonth()] + ' de ' + f.getFullYear(),
      generadaHora: f.toLocaleTimeString('es-CO', {
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
      }),
      fechaCorta: String(f.getDate()).padStart(2, '0') + '/' +
                  String(f.getMonth() + 1).padStart(2, '0') + '/' + f.getFullYear(),
      fechaISO: f.toISOString(),
      menores: menores,
      firma: firmaPaciente.jpeg(),
      responsable: responsable,
      firmaResponsable: pide('responsable') ? firmaResponsable.jpeg() : null
    };
  }


  function limpiarPaciente() {
    ['pacienteNombre', 'pacienteDoc'].forEach((id) => {
      const el = $(id); el.value = ''; clearError(el);
    });
    selTipoPaciente.value = '';
    clearError(selTipoPaciente);
    reglaDocPaciente();
  }

  function limpiarFormulario() {
    ['nombres', 'apellidos', 'identificacion', 'lugarExpedicion', 'finalidad',
     'entidadRemitente', 'representadoNombre', 'representadoDoc',
     'observaciones'].forEach((id) => {
      const el = $(id); el.value = ''; clearError(el);
    });
    $('tipoDoc').value = '';
    clearError($('tipoDoc'));
    aplicarReglaDocumento();
    limpiarPaciente();

    if (LIMPIAR_SEDE) {
      poblarSedes();   // vuelve al estado inicial de la entidad elegida
      [$('sede'), $('ciudad'), $('departamento')].forEach(clearError);
    }

    // Menores: apagar el interruptor y descartar las tarjetas
    toggleMinor.checked = false;
    minorFormContainer.classList.add('asc-hidden');
    minorsList.innerHTML = '';
    refreshMinors();
    buscaConvenio.limpiar();
    buscaProcedimiento.limpiar();
    limpiarSoportes();
    limpiarFirmas();
    buscaResponsable.limpiar();
    refrescarFecha(); 
    form.querySelectorAll('.asc-error-msg:not([id])').forEach((p) => p.remove());
    form.querySelectorAll('.asc-error-msg[id]').forEach((p) => p.classList.add('asc-hidden'));
    form.querySelectorAll('.asc-invalid').forEach((el) => el.classList.remove('asc-invalid'));

    $('nombres').focus({ preventScroll: true });
  }

  function descargar(bytes, nombreArchivo) {
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = nombreArchivo;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  function aBase64(bytes) {
    let bin = '';
    const paso = 0x8000;
    for (let i = 0; i < bytes.length; i += paso) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + paso));
    }
    return btoa(bin);
  }

  const submitBtn   = $('submitBtn');
  const submitLabel = $('submitLabel');
  let ultimoEnvio   = null;   // { bytes, nombreArchivo, datos } para reintentos

  function botonOcupado(ocupado, texto) {
    submitBtn.disabled = ocupado;
    submitLabel.textContent = texto;
  }

  /* A qué buzón va este documento. Cada formato puede desviarse poniendo su
     propio `correo`; el que no lo tenga usa el general. El Dropbox no cambia:
     es el mismo para todos. */
  const correoDestino = () =>
    ((CONSENT && CONSENT.correo) || CFG.ENVIO_CORREO || '').trim();

  function enviarPorCorreo(bytes, nombreArchivo, d) {
    const payload = {
      secreto: CFG.ENVIO_SECRETO || '',
      destinatario: correoDestino(),
      nombreArchivo: nombreArchivo,
      pdfBase64: aBase64(bytes),
      datos: {
        entidad: d.orgNombre,
        consentimiento: d.consentLabel,
        codigo: d.consent.codigo,
        tipoPersona: d.personaLabel,
        finalidad: d.finalidad || '',
        nombre: d.nombreCompleto,
        tipoDocumento: d.tipoDocLabel,
        documento: d.numeroDoc,
        lugarExpedicion: d.lugarExpedicion,
        sede: d.sedeNombre,
        ciudad: d.ciudad,
        departamento: d.departamento,
        fecha: d.fechaISO,
        menores: d.menores,
        soporte: soportes.map((s) => s.nombre),
        responsable: d.responsable ? (d.responsable.nombre + ' — C.C. ' + d.responsable.documento) : '',
        // Solo viaja cuando quien firma no es el propio paciente.
        paciente: d.paciente ? (d.paciente.nombre + ' — ' +
                  (d.paciente.tipoDocLabel || d.paciente.tipoDocId) + ' ' +
                  d.paciente.numeroDoc) : ''
      }
    };

    return fetch(CFG.ENVIO_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      redirect: 'follow'
    })
      .then((r) => r.text())
      .then((txt) => {
        let res;
        try { res = JSON.parse(txt); }
        catch (err) { throw new Error('Respuesta inesperada del servidor de envío.'); }
        if (!res.ok) throw new Error(res.error || 'El servidor rechazó el envío.');
        return res;
      });
  }

  function botonAviso(texto, onClick) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'asc-btn asc-btn--ghost';
    btn.style.margin = '12px 10px 0 0';
    btn.textContent = texto;
    btn.addEventListener('click', () => onClick(btn));
    alertBox.appendChild(btn);
    return btn;
  }

  function ofrecerDescargaCopia() {
    botonAviso('Descargar copia', (btn) => {
      if (!ultimoEnvio) return;
      descargar(ultimoEnvio.bytes, ultimoEnvio.nombreArchivo);
      btn.textContent = 'Copia descargada ✓';
    });
  }

  function ofrecerReintento() {
    botonAviso('Reintentar envío', (btn) => {
      if (!ultimoEnvio) return;
      btn.disabled = true;
      btn.textContent = 'Enviando…';
      enviarPorCorreo(ultimoEnvio.bytes, ultimoEnvio.nombreArchivo, ultimoEnvio.datos)
        .then(() => {
          const quien = ultimoEnvio.datos.nombreCompleto;
          mostrarGenerado(ultimoEnvio.bytes, ultimoEnvio.nombreArchivo);
          ultimoEnvio = null;
          setAlert('ok', 'Envío completado: el consentimiento de ' + quien +
            ' llegó al buzón. Pulse "Generar nuevo consentimiento" para el siguiente.');
        })
        .catch((err) => {
          setAlert('error', 'Sigue fallando el envío: ' + err.message +
            ' El registro sigue en memoria: no cierre ni recargue la página.');
          ofrecerReintento();
          ofrecerDescargaCopia();
        });
    });
  }

  const SOP = Object.assign({
    ACTIVO: true, OBLIGATORIO: false, MAX_ARCHIVOS: 4, MAX_MB: 18,
    TITULO: 'Copia del documento de identidad',
    NOTA: 'Adjunte el escaneo o la copia del documento. Sus páginas se anexan al final del consentimiento.'
  }, CFG.SOPORTE || {});

  const cardSoporte  = $('cardSoporte');
  const soporteInput = $('soporteInput');
  const soporteDrop  = $('soporteDrop');
  const soporteList  = $('soporteList');
  const soporteError = $('soporteError');

  // [{ nombre, tipo:'pdf'|'jpg'|'png', bytes:Uint8Array, paginas, peso }]
  let soportes = [];

  const MB = 1024 * 1024;
  const pesoLegible = (b) => (b < MB)
    ? Math.round(b / 1024) + ' KB'
    : (b / MB).toFixed(1).replace('.', ',') + ' MB';

  const hayPdfLib = () => (typeof PDFLib !== 'undefined' && PDFLib && PDFLib.PDFDocument);

  if (!SOP.ACTIVO) {
    cardSoporte.classList.add('asc-hidden');
  } else {
    $('tituloSoporte').textContent = SOP.TITULO;
    $('notaSoporte').textContent   = SOP.NOTA;
    $('soporteHint').textContent   = 'PDF, JPG o PNG · hasta ' + SOP.MAX_ARCHIVOS +
      (SOP.MAX_ARCHIVOS > 1 ? ' archivos' : ' archivo') +
      (SOP.OBLIGATORIO ? ' · obligatorio' : ' · opcional');
  }

  function tipoDeArchivo(file) {
    const n = String(file.name || '').toLowerCase();
    if (file.type === 'application/pdf' || n.endsWith('.pdf')) return 'pdf';
    if (file.type === 'image/png'       || n.endsWith('.png')) return 'png';
    if (file.type === 'image/jpeg'      || /\.jpe?g$/.test(n)) return 'jpg';
    return null;
  }

  const leerBytes = (file) => new Promise((resolver, rechazar) => {
    const fr = new FileReader();
    fr.onload  = () => resolver(new Uint8Array(fr.result));
    fr.onerror = () => rechazar(new Error('lectura fallida'));
    fr.readAsArrayBuffer(file);
  });

  function agregarArchivos(lista) {
    const errores = [];
    soporteError.classList.add('asc-hidden');

    // Se procesan en serie: abrir un PDF grande bloquea menos así, y el
    // orden en que quedan adjuntos es el que eligió el usuario.
    return lista.reduce((cadena, file) => cadena.then(() => {
      if (soportes.length >= SOP.MAX_ARCHIVOS) {
        if (errores.indexOf('tope') === -1) {
          errores.push('tope');
          errores.push('Solo se admiten ' + SOP.MAX_ARCHIVOS + ' archivos.');
        }
        return;
      }
      const tipo = tipoDeArchivo(file);
      if (!tipo) {
        errores.push('«' + file.name + '»: formato no admitido, use PDF, JPG o PNG.');
        return;
      }
      if (soportes.some((s) => s.nombre === file.name && s.peso === file.size)) {
        errores.push('«' + file.name + '» ya estaba adjunto.');
        return;
      }

      return leerBytes(file).then((bytes) => {
        if (tipo !== 'pdf') {
          soportes.push({ nombre: file.name, tipo: tipo, bytes: bytes, paginas: 1, peso: file.size });
          return;
        }
        if (!hayPdfLib()) {
          errores.push('No se cargó la librería para leer PDF. Revise la conexión a internet.');
          return;
        }
        /* Se abre aquí, no al enviar: si el PDF viene dañado o protegido
           conviene saberlo antes de tomar la firma. */
        return PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true })
          .then((doc) => {
            const paginas = doc.getPageCount();
            if (!paginas) throw new Error('sin páginas');
            soportes.push({ nombre: file.name, tipo: tipo, bytes: bytes, paginas: paginas, peso: file.size });
          })
          .catch(() => {
            errores.push('«' + file.name + '»: no se pudo abrir. Puede estar dañado o protegido con contraseña.');
          });
      }).catch(() => {
        errores.push('«' + file.name + '»: no se pudo leer el archivo.');
      });
    }), Promise.resolve()).then(() => {
      const visibles = errores.filter((t) => t !== 'tope');
      if (visibles.length) {
        soporteError.textContent = visibles.join(' ');
        soporteError.classList.remove('asc-hidden');
      }
      pintarSoportes();
    });
  }

  const IC_PDF = '<svg class="asc-file-ic" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h5"/></svg>';
  const IC_IMG = '<svg class="asc-file-ic" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>';

  function pintarSoportes() {
    soporteList.innerHTML = '';
    soportes.forEach((s, i) => {
      const fila = document.createElement('div');
      fila.className = 'asc-file';
      fila.innerHTML =
        (s.tipo === 'pdf' ? IC_PDF : IC_IMG) +
        '<span class="asc-file-info">' +
          '<span class="asc-file-name"></span>' +
          '<span class="asc-file-meta"></span>' +
        '</span>' +
        '<button type="button" class="asc-btn-x" aria-label="Quitar archivo">' +
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>' +
        '</button>';

      // textContent y no innerHTML: el nombre del archivo lo elige el usuario.
      fila.querySelector('.asc-file-name').textContent = s.nombre;
      fila.querySelector('.asc-file-meta').textContent =
        (s.tipo === 'pdf' ? 'PDF' : s.tipo.toUpperCase()) + ' · ' +
        s.paginas + (s.paginas === 1 ? ' página' : ' páginas') + ' · ' + pesoLegible(s.peso);

      fila.querySelector('.asc-btn-x').addEventListener('click', () => {
        soportes.splice(i, 1);
        soporteError.classList.add('asc-hidden');
        pintarSoportes();
      });
      soporteList.appendChild(fila);
    });

    // Al llegar al tope se esconde la zona de carga: no hay nada que soltar.
    soporteDrop.classList.toggle('asc-hidden', soportes.length >= SOP.MAX_ARCHIVOS);
  }

  soporteInput.addEventListener('change', () => {
    const archivos = Array.from(soporteInput.files || []);
    soporteInput.value = '';   // permite volver a elegir el mismo archivo
    if (archivos.length) agregarArchivos(archivos);
  });

  ['dragenter', 'dragover'].forEach((ev) =>
    soporteDrop.addEventListener(ev, () => soporteDrop.classList.add('asc-drop--over')));
  ['dragleave', 'drop'].forEach((ev) =>
    soporteDrop.addEventListener(ev, () => soporteDrop.classList.remove('asc-drop--over')));

  function limpiarSoportes() {
    soportes = [];
    soporteInput.value = '';
    soporteError.classList.add('asc-hidden');
    pintarSoportes();
  }

  /* Fusiona el consentimiento con lo adjunto. Devuelve los bytes finales. */
  function anexarSoportes(bytesBase) {
    if (!soportes.length) return Promise.resolve(bytesBase);
    if (!hayPdfLib()) {
      return Promise.reject(new Error('no se cargó pdf-lib; revise la conexión a internet'));
    }

    const PDFDocument = PDFLib.PDFDocument;
    return PDFDocument.load(bytesBase).then((doc) => {
      return soportes.reduce((cadena, s) => cadena.then(() => {
        if (s.tipo === 'pdf') {
          return PDFDocument.load(s.bytes, { ignoreEncryption: true })
            .then((origen) => doc.copyPages(origen, origen.getPageIndices()))
            .then((paginas) => paginas.forEach((p) => doc.addPage(p)));
        }
        const incrustar = (s.tipo === 'png') ? doc.embedPng(s.bytes) : doc.embedJpg(s.bytes);
        return incrustar.then((img) => {
          // Misma hoja que el formato (A4). La imagen se centra y se ajusta
          // sin deformarse, dejando un margen.
          const pagina = doc.addPage([595.28, 841.89]);
          const margen = 28;
          const escala = Math.min((pagina.getWidth()  - margen * 2) / img.width,
                                  (pagina.getHeight() - margen * 2) / img.height);
          const w = img.width * escala, h = img.height * escala;
          pagina.drawImage(img, {
            x: (pagina.getWidth()  - w) / 2,
            y: (pagina.getHeight() - h) / 2,
            width: w, height: h
          });
        });
      }), Promise.resolve()).then(() => doc.save());
    });
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    alertBox.classList.add('asc-hidden');

    const d = validar();
    if (!d) {
      if (alertBox.classList.contains('asc-hidden')) setAlert('error', 'Revise los campos marcados en rojo.');
      return;
    }

    if (SOP.ACTIVO && SOP.OBLIGATORIO && !soportes.length) {
      soporteError.textContent = 'Adjunte la copia del documento de identidad.';
      soporteError.classList.remove('asc-hidden');
      soporteDrop.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setAlert('error', 'Falta adjuntar la copia del documento de identidad.');
      return;
    }

    let bytes;
    try {
      const construir = CONSTRUCTORES[d.consentId];
      if (!construir) throw new Error('no hay formato definido para «' + d.consentLabel + '»');
      bytes = construir(d);
    } catch (err) {
      console.error(err);
      setAlert('error', 'No se pudo generar el documento: ' + err.message);
      return;
    }

    const fecha = d.fechaISO.slice(0, 10);

    const cedula = String(d.numeroDoc || '').replace(/\D/g, '') || 'sin-documento';
    const codigo = String(d.consent.codigo || 'CONSENTIMIENTO').replace(/[^\w.-]/g, '_');
    const nombreArchivo = `${codigo}_${cedula}_${fecha}.pdf`;

    window.__ultimoRegistro = d;

    const nm = d.menores.length;
    const resumen = `${d.consentLabel} de ${d.nombreCompleto}` +
      (nm ? ` y ${nm} menor${nm > 1 ? 'es' : ''} a cargo` : '') + ' generado.';
    botonOcupado(true, soportes.length ? 'Anexando documento…' : 'Preparando…');

    anexarSoportes(bytes)
      .then((completo) => {
        const limite = SOP.MAX_MB * MB;
        if (completo.length > limite) {
          throw new Error('el documento final pesa ' + pesoLegible(completo.length) +
            ' y el máximo son ' + SOP.MAX_MB + ' MB. Adjunte un escaneo más liviano ' +
            '(menor resolución, o en blanco y negro)');
        }
        continuarEnvio(completo, nombreArchivo, d, resumen);
      })
      .catch((err) => {
        console.error('[Consentimiento] Soporte:', err);
        botonOcupado(false, etiquetaEnvio());
        setAlert('error', 'No se pudo anexar la copia del documento: ' + err.message +
          '. El registro sigue en pantalla: corrija el archivo y vuelva a enviar.');
        alertBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
  });

  const MODOS = {
    enviar:    { envia: true,  descarga: false, corto: 'Enviar al buzón',        boton: 'Generar y enviar consentimiento' },
    descargar: { envia: false, descarga: true,  corto: 'Descargar en el equipo', boton: 'Generar y descargar consentimiento' },
    ambos:     { envia: true,  descarga: true,  corto: 'Enviar y descargar',     boton: 'Generar, enviar y descargar' }
  };

  const puedeEnviar = () => !!(CFG.ENVIAR_ACTIVO && CFG.ENVIO_URL);

  function modoInicial() {
    if (!puedeEnviar()) return 'descargar';
    return CFG.DESCARGA_LOCAL ? 'ambos' : 'enviar';
  }
  const CLAVE_MODO = 'asc_modo_entrega';
  function modoGuardado() {
    try {
      const v = window.sessionStorage.getItem(CLAVE_MODO);
      return MODOS[v] ? v : null;
    } catch (e) { return null; }
  }
  function guardarModo(v) {
    try { window.sessionStorage.setItem(CLAVE_MODO, v); } catch (e) { /* sin memoria */ }
  }

  let MODO = modoGuardado() || modoInicial();
  if (!puedeEnviar()) MODO = 'descargar';

  const modoWrap  = $('modoEntrega');
  const modoBtn   = $('modoBtn');
  const modoMenu  = $('modoMenu');
  const modoLabel = $('modoLabel');
  const submitLabelEl = $('submitLabel');
  const opcionesModo = Array.from(modoMenu.querySelectorAll('.asc-modo-op'));

  const etiquetaEnvio = () => MODOS[MODO].boton;

  function pintarModo() {
    modoLabel.textContent = MODOS[MODO].corto;
    opcionesModo.forEach((op) => {
      op.setAttribute('aria-checked', String(op.dataset.modo === MODO));
    });
    if (!submitBtn.disabled) submitLabelEl.textContent = etiquetaEnvio();
  }

  function abrirModo(abrir) {
    modoMenu.classList.toggle('asc-hidden', !abrir);
    modoBtn.setAttribute('aria-expanded', String(abrir));
    modoWrap.dataset.abierto = abrir ? '1' : '0';
  }

  modoBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    abrirModo(modoMenu.classList.contains('asc-hidden'));
  });

  opcionesModo.forEach((op) => {
    op.addEventListener('click', () => {
      if (op.disabled) return;
      MODO = op.dataset.modo;
      guardarModo(MODO);
      pintarModo();
      abrirModo(false);
      modoBtn.focus();
    });
  });

  // Cerrar al hacer clic fuera o con Escape.
  document.addEventListener('click', (e) => {
    if (!modoWrap.contains(e.target)) abrirModo(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modoMenu.classList.contains('asc-hidden')) {
      abrirModo(false);
      modoBtn.focus();
    }
  });

  if (!puedeEnviar()) {
    opcionesModo.forEach((op) => {
      if (MODOS[op.dataset.modo].envia) {
        op.disabled = true;
        op.title = 'Falta configurar ENVIO_URL / ENVIAR_ACTIVO en consentimiento-config.js';
      }
    });
    modoMenu.querySelector('.asc-modo-pie').textContent =
      'El envío al buzón no está configurado: falta ENVIO_URL en consentimiento-config.js.';
  }

  pintarModo();

  /* =====================================================================
     ESTADO "DOCUMENTO GENERADO"
     Al terminar, el formulario NO se limpia: queda tal cual para poder
     descargar el mismo documento las veces que haga falta. Solo se vacía
     al pulsar "Generar nuevo consentimiento".
     Mientras dura ese estado se esconde el botón de generar, para que un
     segundo clic no vuelva a mandar el mismo correo.
     ===================================================================== */
  let ultimoGenerado = null;   // { bytes, nombreArchivo }
  const btnOtraVez = $('btnDescargarOtraVez');
  const btnNuevo   = $('btnNuevoConsentimiento');

  function mostrarGenerado(bytes, nombreArchivo) {
    ultimoGenerado = { bytes: bytes, nombreArchivo: nombreArchivo };
    submitBtn.classList.add('asc-hidden');
    modoWrap.classList.add('asc-hidden');
    btnOtraVez.classList.remove('asc-hidden');
    btnNuevo.classList.remove('asc-hidden');
  }

  function volverAEditar() {
    ultimoGenerado = null;
    submitBtn.classList.remove('asc-hidden');
    modoWrap.classList.remove('asc-hidden');
    btnOtraVez.classList.add('asc-hidden');
    btnNuevo.classList.add('asc-hidden');
  }

  btnOtraVez.addEventListener('click', () => {
    if (!ultimoGenerado) return;
    descargar(ultimoGenerado.bytes, ultimoGenerado.nombreArchivo);
  });

  btnNuevo.addEventListener('click', () => {
    limpiarFormulario();
    volverAEditar();
    alertBox.classList.add('asc-hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    $('nombres').focus({ preventScroll: true });
  });

  function continuarEnvio(bytes, nombreArchivo, d, resumen) {
    const modo = MODOS[MODO];

    if (modo.descarga) descargar(bytes, nombreArchivo);

    // --- Solo descarga (elegido, o sin envío configurado) ----------------
    if (!modo.envia || !puedeEnviar()) {
      botonOcupado(false, etiquetaEnvio());
      if (modo.descarga) {
        mostrarGenerado(bytes, nombreArchivo);
        setAlert('ok', resumen + ' Descargado en este equipo. Puede descargarlo otra vez; ' +
          'pulse "Generar nuevo consentimiento" cuando vaya a registrar al siguiente.');
      } else {
        ultimoEnvio = { bytes: bytes, nombreArchivo: nombreArchivo, datos: d };
        setAlert('error', resumen + ' El envío todavía no está configurado ' +
          '(faltan ENVIO_URL / ENVIAR_ACTIVO en consentimiento-config.js), ' +
          'así que el documento NO ha salido a ninguna parte. Descargue la ' +
          'copia para no perder la firma.');
        ofrecerDescargaCopia();
      }
      alertBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    botonOcupado(true, 'Enviando…');
    setAlert('info', resumen + ' Enviando al buzón…');

    enviarPorCorreo(bytes, nombreArchivo, d)
      .then(() => {
        ultimoEnvio = null;
        mostrarGenerado(bytes, nombreArchivo);
        /* Si el formato tiene buzón propio se nombra: quien registra debe
           saber que ese documento no fue al correo de siempre. */
        const otroBuzon = CONSENT && CONSENT.correo &&
                          CONSENT.correo.trim() &&
                          CONSENT.correo.trim() !== (CFG.ENVIO_CORREO || '').trim();
        setAlert('ok', resumen + ' Enviado al buzón' +
          (otroBuzon ? ' ' + correoDestino() : '') +
          (modo.descarga ? ' y descargado en este equipo' : '') +
          '. Puede descargarlo otra vez; pulse "Generar nuevo consentimiento" ' +
          'cuando vaya a registrar al siguiente.');
      })
      .catch((err) => {
        console.error('[Consentimiento] Falló el envío:', err);
        // El registro queda en memoria: se puede reintentar o descargar.
        ultimoEnvio = { bytes: bytes, nombreArchivo: nombreArchivo, datos: d };
        setAlert('error', resumen + ' PERO NO se pudo enviar (' + err.message +
          '). El registro sigue en memoria: reintente el envío o descargue ' +
          'la copia. No cierre ni recargue la página hasta resolverlo.');
        ofrecerReintento();
        ofrecerDescargaCopia();
      })
      .then(() => {
        botonOcupado(false, etiquetaEnvio());
        alertBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
  }

  const setup       = $('ascSetup');
  const stepPersona = $('stepPersona');
  const stepConsent = $('stepConsent');
  const appLogo     = $('appLogo');
  const cardMenores = $('cardMenores');
  const stepCategoria = $('stepCategoria');
  const PASOS = [stepPersona, stepCategoria, stepConsent];

  /* La entidad ya no se elige: la fija la página. La secuencia depende solo
     de si esta entidad ofrece más de una categoría de documento. */
  function pasosVisibles() {
    const conCategoria = categoriasDeOrg().length > 1;
    return conCategoria ? [stepPersona, stepCategoria, stepConsent]
                        : [stepPersona, stepConsent];
  }

  function tarjeta(art, nombre, descripcion) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'asc-choice';
    b.innerHTML =
      '<span class="asc-choice-art">' + art + '</span>' +
      '<span>' +
        '<span class="asc-choice-name">' + nombre + '</span>' +
        (descripcion ? '<span class="asc-choice-desc">' + descripcion + '</span>' : '') +
      '</span>';
    return b;
  }

  const personaChoices = $('personaChoices');

  /* Solo se ofrecen los roles que tengan al menos un formato disponible en
     esta entidad: si a alguno se le apagan todos en TIPOS_PERSONA, deja de
     aparecer en el paso 1. */
  function poblarPersonas() {
    personaChoices.innerHTML = '';
    const antes = PERSONA;
    const lista = TIPOS_PERSONA.filter((t) => {
      PERSONA = t;
      const hay = consentsDisponibles().length > 0;
      PERSONA = antes;
      return hay;
    });
    personaChoices.className = 'asc-choices asc-choices--' + Math.min(lista.length, 4);
    lista.forEach((t) => {
      const b = tarjeta('<svg viewBox="0 0 96 96"><use href="#ic-' + t.id + '"/></svg>',
                        t.label, t.descripcion);
      b.addEventListener('click', () => elegirPersona(t));
      personaChoices.appendChild(b);
    });
  }

  const consentChoices = $('consentChoices');

  const categoriaChoices = $('categoriaChoices');

  function poblarCategorias() {
    categoriaChoices.innerHTML = '';
    const lista = categoriasDeOrg();
    categoriaChoices.className = 'asc-choices asc-choices--' + Math.min(lista.length, 4);
    lista.forEach((cat) => {
      const b = tarjeta('<svg viewBox="0 0 96 96"><use href="#' + cat.icono + '"/></svg>',
                        cat.label, cat.descripcion);
      b.addEventListener('click', () => elegirCategoria(cat));
      categoriaChoices.appendChild(b);
    });
  }

  function poblarConsentimientos() {
    consentChoices.innerHTML = '';
    const lista = consentsDeCategoria();
    consentChoices.className = 'asc-choices asc-choices--' + Math.min(lista.length, 4);
    lista.forEach((c) => {
      const b = tarjeta('<svg viewBox="0 0 96 96"><use href="#' + c.icono + '"/></svg>',
                        c.label, c.descripcion);
      b.addEventListener('click', () => elegirConsent(c));
      consentChoices.appendChild(b);
    });
  }

  /* La entidad viene del HTML (data-entidad en el <body>): cada página
     —consentimiento.html / consentimiento-u.html— fija la suya. */
  function fijarOrg(o) {
    ORG = o;
    appLogo.src = o.logoApp;
    appLogo.alt = o.nombre;
    $('chosenOrgLogo').src = o.logoApp;
    $('chosenOrg').textContent = o.nombre;
    poblarSedes();
    poblarPersonas();
    poblarCategorias();
    numerarPasos();
  }

  function elegirPersona(t) {
    PERSONA = t;
    $('tituloDatos').textContent = t.tituloDatos;
    $('chosenPersona').textContent = t.label;
    $('chosenPersonaIcon').setAttribute('href', '#ic-' + t.id);
    refreshMinors();

    /* El rol decide qué formatos quedan, así que las categorías y la
       numeración de los pasos se recalculan aquí. */
    poblarCategorias();
    numerarPasos();

    // Con una sola categoría no hay nada que elegir: se salta ese paso.
    const cats = categoriasDeOrg();
    if (cats.length <= 1) { elegirCategoria(cats[0] || null); return; }
    mostrarPaso(stepCategoria);
  }

  function elegirCategoria(cat) {
    CATEGORIA = cat;
    if (cat) {
      $('tituloPasoConsent').textContent = cat.titulo || '¿Qué documento va a firmar?';
      $('leadPasoConsent').textContent   = cat.lead || 'Cada formato pide datos distintos.';
    }
    // El botón de volver apunta al paso anterior real.
    const hayCategoria = categoriasDeOrg().length > 1;
    $('btnVolverCategoriaLabel').textContent =
      hayCategoria ? 'Cambiar tipo de documento' : 'Cambiar quién firma';
    poblarConsentimientos();
    mostrarPaso(stepConsent);
  }

  function elegirConsent(c) {
    CONSENT = c;
    $('chosenConsent').textContent = c.label;
    $('chosenConsentIcon').setAttribute('href', '#' + c.icono);
    $('tituloConsent').textContent = c.tituloApp;
    $('leadConsent').textContent   = c.leadApp;
    aplicarCampos();
    abrirFormulario();
  }

  
  function aplicarCampos() {
    poblarSedes();

    const lugar   = $('lugarExpedicion');
    const verLugar = pide('lugarExpedicion');
    $('campoLugarExpedicion').classList.toggle('asc-hidden', !verLugar);
    lugar.required = verLugar;
    if (!verLugar) { lugar.value = ''; clearError(lugar); }

    const verFinalidad = pide('finalidad');
    $('campoFinalidad').classList.toggle('asc-hidden', !verFinalidad);
    if (!verFinalidad) { $('finalidad').value = ''; clearError($('finalidad')); }

    const verEntidad = pide('entidad');
    $('campoEntidad').classList.toggle('asc-hidden', !verEntidad);
    if (!verEntidad) { $('entidadRemitente').value = ''; clearError($('entidadRemitente')); }

    const verRepresentado = pide('representado');
    ['campoRepresentadoNombre', 'campoRepresentadoDoc'].forEach((id) =>
      $(id).classList.toggle('asc-hidden', !verRepresentado));
    if (!verRepresentado) {
      ['representadoNombre', 'representadoDoc'].forEach((id) => {
        $(id).value = ''; clearError($(id));
      });
    }

    /* Datos del paciente aparte: lo enciende el rol desde porFormato. */
    const verPaciente = pide('paciente');
    cardPaciente.classList.toggle('asc-hidden', !verPaciente);
    if (verPaciente) {
      $('tituloDatosPaciente').textContent = 'Datos del paciente';
      $('notaDatosPaciente').textContent =
        'La persona que recibió la atención. ' +
        (PERSONA ? 'Quien firma lo hace en calidad de ' + (PERSONA.calidad || PERSONA.label.toLowerCase()) + '.' : '');
    } else {
      limpiarPaciente();
    }

    const verMenores = pide('menores') && PERSONA && PERSONA.permiteMenores;
    cardMenores.classList.toggle('asc-hidden', !verMenores);
    if (!verMenores && toggleMinor.checked) {
      toggleMinor.checked = false;
      minorFormContainer.classList.add('asc-hidden');
      minorsList.innerHTML = '';
    }
    refreshMinors();


    const verAtencion = pide('atencion');
    cardAtencion.classList.toggle('asc-hidden', !verAtencion);
    if (verAtencion) {
      buscaConvenio.limpiar();
      buscaProcedimiento.limpiar();
      if (!$('fechaAtencion').value) $('fechaAtencion').value = new Date().toISOString().slice(0, 10);
      if (!$('usuario').value) $('usuario').value = usuarioRecordado();
    } else {
      ['fechaAtencion', 'observaciones'].forEach((id) => {
        $(id).value = ''; clearError($(id));
      });
      buscaConvenio.limpiar();
      buscaProcedimiento.limpiar();
    }

    // Responsable de la institución: solo lo pide el formato de San Felipe.
    const verResponsable = pide('responsable');
    $('cardResponsable').classList.toggle('asc-hidden', !verResponsable);
    if (!verResponsable) {
      buscaResponsable.limpiar();
      firmaResponsable.limpiar();
    }

    const verSoporte = SOP.ACTIVO && pide('soporte');
    cardSoporte.classList.toggle('asc-hidden', !verSoporte);
    if (!verSoporte) limpiarSoportes();
  }

  function abrirFormulario() {
    setup.classList.add('asc-hidden');
    form.classList.remove('asc-hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    $('nombres').focus({ preventScroll: true });
  }

  function numerarPasos() {
    const visibles = pasosVisibles();
    visibles.forEach((paso, i) => {
      const eyebrow = paso.querySelector('.asc-setup-eyebrow');
      if (eyebrow) eyebrow.textContent = 'Paso ' + (i + 1) + ' de ' + visibles.length;
    });
  }

  function mostrarPaso(paso) {
    PASOS.forEach((s) => s.classList.toggle('asc-hidden', s !== paso));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function volverASeleccion() {
    CATEGORIA = null;
    form.classList.add('asc-hidden');
    setup.classList.remove('asc-hidden');
    mostrarPaso(stepPersona);
  }

  $('btnVolverPersona').addEventListener('click', () => mostrarPaso(stepPersona));
  $('btnVolverCategoria').addEventListener('click', () => {
    mostrarPaso(categoriasDeOrg().length > 1 ? stepCategoria : stepPersona);
  });
  $('btnCambiarSeleccion').addEventListener('click', () => {
    if (ultimoEnvio) {
      setAlert('error', 'Hay un consentimiento generado que todavía no salió. ' +
        'Reintente el envío o descargue la copia antes de cambiar la selección.');
      alertBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    const hayDatos = $('nombres').value.trim() || $('apellidos').value.trim() ||
                     $('identificacion').value.trim() ||
                     $('pacienteNombre').value.trim() || $('pacienteDoc').value.trim() ||
                     firmaPaciente.tieneTrazos() || soportes.length;
    if (hayDatos && !window.confirm('Se perderán los datos, la firma y los archivos adjuntos de este registro. ¿Continuar?')) return;
    alertBox.classList.add('asc-hidden');
    limpiarSeleccion();
    volverAEditar();
    volverASeleccion();
  });

  function limpiarSeleccion() {
    ['nombres', 'apellidos', 'identificacion', 'lugarExpedicion', 'finalidad',
     'entidadRemitente', 'representadoNombre', 'representadoDoc',
     'observaciones'].forEach((id) => {
      const el = $(id); el.value = ''; clearError(el);
    });
    $('tipoDoc').value = '';
    clearError($('tipoDoc'));
    limpiarPaciente();
    toggleMinor.checked = false;
    minorFormContainer.classList.add('asc-hidden');
    minorsList.innerHTML = '';
    buscaConvenio.limpiar();
    buscaProcedimiento.limpiar();
    buscaResponsable.limpiar();
    limpiarSoportes();
    limpiarFirmas();
    form.querySelectorAll('.asc-error-msg:not([id])').forEach((p) => p.remove());
    form.querySelectorAll('.asc-error-msg[id]').forEach((p) => p.classList.add('asc-hidden'));
    form.querySelectorAll('.asc-invalid').forEach((el) => el.classList.remove('asc-invalid'));
  }

  const idEntidad = document.body.dataset.entidad || '';
  const orgDeLaPagina = ORGS.filter((o) => o.id === idEntidad)[0] || ORGS[0];
  if (orgDeLaPagina) {
    fijarOrg(orgDeLaPagina);
    if (idEntidad && orgDeLaPagina.id !== idEntidad) {
      console.error('[Consentimiento] data-entidad="' + idEntidad + '" no existe ' +
        'en ORGANIZACIONES; se usó "' + orgDeLaPagina.id + '".');
    }
  }
  if (!ORGS.length || !TIPOS_PERSONA.length) {
    console.error('[Consentimiento] Faltan ORGANIZACIONES o TIPOS_PERSONA en consentimiento-config.js');
  }
  if (!puedeEnviar()) {
    console.warn('[Consentimiento] Sin envío configurado: el menú del pie ' +
      'queda fijo en "Descargar en el equipo". Complete ENVIO_URL / ' +
      'ENVIO_SECRETO / ENVIO_CORREO y ponga ENVIAR_ACTIVO en true dentro ' +
      'de consentimiento-config.js para habilitar el envío al buzón.');
  } else if (CFG.ENVIAR_ACTIVO && (!CFG.ENVIO_URL || !CFG.ENVIO_SECRETO)) {
    console.warn('[Consentimiento] ENVIAR_ACTIVO está en true pero falta ' +
      (CFG.ENVIO_URL ? 'ENVIO_SECRETO' : 'ENVIO_URL') + '.');
  }

  refreshMinors();
  aplicarReglaDocumento();

  // El HTML comprueba esta marca: si falta, es que el módulo no llegó al final.
  window.__ascListo = true;
})();
