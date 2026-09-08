var CONFIG = {
  SECRETO: 'CLAVE-SECRETA-PARA-ENVIO-DE-CORREOS-CONSENTIMIENTOS',

  // Buzón por defecto: el que se usa si el formulario no pide otro.
  DESTINATARIO: 'accion.saludac@gmail.com',

  /* Buzones a los que este script acepta desviar un documento.
     El formulario puede pedir uno distinto (un formato con su propio
     `correo`, como CREAS Conecta), pero solo se le hace caso si el correo
     está en esta lista. Cualquier otro se descarta y se usa DESTINATARIO.

     Es a propósito: el secreto viaja en el JavaScript de un sitio público,
     así que cualquiera puede leerlo. Sin esta lista, el script serviría para
     mandar correo con adjuntos a donde fuera, en nombre de la cuenta que lo
     publicó.

     Para habilitar un buzón nuevo hay que ponerlo en los dos lados: aquí y
     en el `correo` del formato dentro de consentimiento-config.js. */
  DESTINATARIOS_PERMITIDOS: [
    'accion.saludac@gmail.com',
    'creasconecta@accionsalud.com.co'
  ],
 
  ASUNTO_PREFIJO: '[Consentimiento ASI-FOR-018]',
  GUARDAR_EN_DRIVE: false,
  CARPETA_DRIVE: 'Consentimientos ASI-FOR-018',
  /* El consentimiento puede traer anexado el escaneo del documento, así
     que pesa más que el formato solo. Gmail admite 25 MB; el formulario
     ya avisa a partir de 18 MB. */
  MAX_BYTES: 20 * 1024 * 1024,
  DROPBOX_ACTIVO: true,
  DROPBOX_CARPETA: '/Consentimientos'
};
var DBX_PROPS = {
  APP_KEY:       'DROPBOX_APP_KEY',
  APP_SECRET:    'DROPBOX_APP_SECRET',
  REFRESH_TOKEN: 'DROPBOX_REFRESH_TOKEN'
};

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return respuesta(false, 'Petición vacía.');
    }
 
    var datos;
    try {
      datos = JSON.parse(e.postData.contents);
    } catch (err) {
      return respuesta(false, 'El cuerpo no es JSON válido.');
    }
 
    // Un secreto vacío aceptaría cualquier petición: mejor fallar en seco.
    if (!CONFIG.SECRETO) {
      return respuesta(false, 'El servidor no tiene secreto configurado.');
    }
    if (String(datos.secreto || '') !== CONFIG.SECRETO) {
      return respuesta(false, 'No autorizado.');
    }
    if (!datos.pdfBase64) {
      return respuesta(false, 'Falta el documento.');
    }
 
    var destino = elegirDestino(datos.destinatario);
    if (!destino || destino.indexOf('@') === -1) {
      return respuesta(false, 'Destinatario no configurado.');
    }
 
    var bytes = Utilities.base64Decode(datos.pdfBase64);
    if (bytes.length > CONFIG.MAX_BYTES) {
      return respuesta(false, 'El documento excede el tamaño permitido.');
    }
 
    var nombreArchivo = limpiarNombre(datos.nombreArchivo || 'consentimiento.pdf');
    var pdf = Utilities.newBlob(bytes, 'application/pdf', nombreArchivo);
    var info = datos.datos || {};
 
    MailApp.sendEmail({
      to: destino,
      subject: '[Consentimiento ' + (info.codigo || 'ASI-FOR-018') + '] ' +
               (info.nombre || 'sin nombre') + ' — ' + (info.sede || 'sede sin definir'),
      body: cuerpoCorreo(info, nombreArchivo),
      attachments: [pdf],
      name: 'Consentimientos Acción Salud'
    });
 
    if (CONFIG.GUARDAR_EN_DRIVE) {
      guardarEnDrive(pdf);
    }

    var dropbox = { intentado: false, ok: false };
    if (CONFIG.DROPBOX_ACTIVO) {
      dropbox.intentado = true;
      try {
        dropbox.ruta = subirADropbox(pdf, nombreArchivo, info);
        dropbox.ok = true;
      } catch (err) {
        console.error('Dropbox: ' + err.message);
        dropbox.error = err.message;
        avisarFalloDropbox(destino, nombreArchivo, err.message);
      }
    }
 
    return respuesta(true, null, { archivo: nombreArchivo, dropbox: dropbox });
 
  } catch (err) {
    // Nunca devolvemos la traza completa al navegador
    console.error(err);
    return respuesta(false, 'Error interno al procesar el documento.');
  }
}
 
/* Decide a qué buzón va el documento: el que pide el formulario si está
   permitido, y si no el de siempre. */
function elegirDestino(pedido) {
  var porDefecto = CONFIG.DESTINATARIO || '';
  var quiere = String(pedido || '').trim().toLowerCase();
  if (!quiere || quiere === porDefecto.trim().toLowerCase()) return porDefecto;

  var permitidos = CONFIG.DESTINATARIOS_PERMITIDOS || [];
  for (var i = 0; i < permitidos.length; i++) {
    if (String(permitidos[i]).trim().toLowerCase() === quiere) return permitidos[i];
  }

  /* Queda en el registro del script (Ejecuciones): si un formato no llega a
     su buzón, aquí se ve por qué. */
  console.warn('Destino no permitido: ' + quiere + '. Se usó ' + porDefecto +
               '. Agréguelo a CONFIG.DESTINATARIOS_PERMITIDOS si es correcto.');
  return porDefecto;
}

function doGet() {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, servicio: 'Consentimientos ASI-FOR-018' }))
    .setMimeType(ContentService.MimeType.JSON);
}
 
 
function respuesta(ok, error, extra) {
  var cuerpo = { ok: ok };
  if (error) cuerpo.error = error;
  if (extra) for (var k in extra) cuerpo[k] = extra[k];
  return ContentService
    .createTextOutput(JSON.stringify(cuerpo))
    .setMimeType(ContentService.MimeType.JSON);
}
 
function limpiarNombre(nombre) {
  return String(nombre).replace(/[\/\\:*?"<>|\r\n]/g, '_').slice(0, 120);
}
 
function cuerpoCorreo(info, nombreArchivo) {
  var l = [];
  l.push('Nuevo consentimiento: ' + (info.consentimiento || 'uso de imagen') +
         ' (' + (info.codigo || 'ASI-FOR-018') + ').');
  l.push('');
  l.push('Entidad:        ' + (info.entidad || '—'));
  l.push('Firma:          ' + (info.tipoPersona || '—'));
  if (info.finalidad) l.push('Finalidad:      ' + info.finalidad);
  l.push('Nombre:         ' + (info.nombre || '—'));
  l.push('Documento:      ' + (info.tipoDocumento || '—') + ' ' + (info.documento || ''));
  if (info.paciente) l.push('Paciente:       ' + info.paciente);
  l.push('Expedido en:    ' + (info.lugarExpedicion || '—'));
  l.push('Sede:           ' + (info.sede || '—'));
  l.push('Ciudad:         ' + (info.ciudad || '—') + ', ' + (info.departamento || '—'));
  if (info.responsable) l.push('Responsable:    ' + info.responsable);
  l.push('Fecha:          ' + (info.fecha || '—'));
 
  var menores = info.menores || [];
  if (menores.length) {
    l.push('');
    l.push('Menores autorizados (' + menores.length + '):');
    for (var i = 0; i < menores.length; i++) {
      l.push('  ' + (i + 1) + '. ' + menores[i].nombre + ' — ' +
             (menores[i].tipoDoc || 'T.I.') + ' ' + menores[i].documento);
    }
  } else {
    l.push('');
    l.push('Sin menores asociados.');
  }
 
  var soporte = info.soporte || [];
  l.push('');
  l.push(soporte.length
    ? 'Copia del documento anexada al PDF: ' + soporte.join(', ')
    : 'Sin copia del documento anexada.');

  l.push('');
  l.push('Adjunto: ' + nombreArchivo);
  l.push('');
  l.push('— Mensaje automático del formulario de consentimientos.');
  return l.join('\n');
}
 
function guardarEnDrive(pdf) {
  var it = DriveApp.getFoldersByName(CONFIG.CARPETA_DRIVE);
  var carpeta = it.hasNext() ? it.next() : DriveApp.createFolder(CONFIG.CARPETA_DRIVE);
  carpeta.createFile(pdf);
}
 
/**
 * Sube el PDF a Dropbox y devuelve la ruta final.
 * @param {Blob} pdf Documento ya construido.
 * @param {string} nombreArchivo Nombre del archivo (ya saneado).
 * @param {Object} info Datos del registro; se usa la fecha para la carpeta.
 * @return {string} Ruta dentro de Dropbox donde quedó el archivo.
 */
function subirADropbox(pdf, nombreArchivo, info) {
  var token = obtenerTokenDropbox();
  var ruta  = rutaDropbox(nombreArchivo, info);
 
  var args = {
    path: ruta,
    mode: 'add',          // nunca sobrescribe un consentimiento existente
    autorename: true,     // si ya existe, Dropbox añade (1) al nombre
    mute: true,           // sin notificación push por cada archivo
    strict_conflict: false
  };
 
  var resp = UrlFetchApp.fetch('https://content.dropboxapi.com/2/files/upload', {
    method: 'post',
    contentType: 'application/octet-stream',
    headers: {
      'Authorization': 'Bearer ' + token,
      // El header debe ser ASCII puro: ver escaparASCII().
      'Dropbox-API-Arg': escaparASCII(JSON.stringify(args))
    },
    payload: pdf.getBytes(),
    muteHttpExceptions: true
  });
 
  var codigo = resp.getResponseCode();
  var cuerpo = resp.getContentText();
 
  if (codigo !== 200) {
    throw new Error('Dropbox rechazó la subida (HTTP ' + codigo + '): ' +
                    cuerpo.slice(0, 300));
  }
 
  var datos = JSON.parse(cuerpo);
  return datos.path_display || ruta;
}
 
function rutaDropbox(nombreArchivo, info) {
  var fecha = new Date();
  var iso = (info && (info.fechaISO || info.fecha)) || '';
  var m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
 
  var anio, mes;
  if (m) {
    anio = m[1];
    mes  = m[2];
  } else {
    anio = String(fecha.getFullYear());
    mes  = ('0' + (fecha.getMonth() + 1)).slice(-2);
  }
 
  // Una sola barra entre tramos, sin barra final.
  var raiz = ('/' + CONFIG.DROPBOX_CARPETA).replace(/\/+/g, '/').replace(/\/$/, '');
  return raiz + '/' + anio + '/' + mes + '/' + nombreArchivo;
}
 
/**
 * Cambia el refresh token por un access token de corta duración.
 * Se guarda en caché los 3 minutos siguientes: varias firmas seguidas
 * reutilizan el mismo token en lugar de pedir uno nuevo cada vez.
 */
function obtenerTokenDropbox() {
  var cache = CacheService.getScriptCache();
  var enCache = cache.get('dbx_token');
  if (enCache) return enCache;
 
  var props = PropertiesService.getScriptProperties();
  var appKey    = props.getProperty(DBX_PROPS.APP_KEY);
  var appSecret = props.getProperty(DBX_PROPS.APP_SECRET);
  var refresh   = props.getProperty(DBX_PROPS.REFRESH_TOKEN);
 
  if (!appKey || !appSecret || !refresh) {
    throw new Error('Faltan credenciales de Dropbox en las propiedades ' +
                    'del script. Repita los pasos 3 y 4 de GUIA-DROPBOX.md.');
  }

  var resp = UrlFetchApp.fetch('https://api.dropboxapi.com/oauth2/token', {
    method: 'post',
    headers: {
      'Authorization': 'Basic ' + Utilities.base64Encode(appKey + ':' + appSecret)
    },
    payload: {
      grant_type: 'refresh_token',
      refresh_token: refresh
    },
    muteHttpExceptions: true
  });
 
  if (resp.getResponseCode() !== 200) {
    throw new Error('No se pudo renovar el acceso a Dropbox (HTTP ' +
                    resp.getResponseCode() + '). Si dice "invalid_grant", ' +
                    'el refresh token fue revocado: genere uno nuevo.');
  }
 
  var datos = JSON.parse(resp.getContentText());
  if (!datos.access_token) {
    throw new Error('Dropbox no devolvió un token de acceso.');
  }
 
  // expires_in viene en segundos (típicamente 14400). Se cachea bastante
  // menos, para no usar jamás un token a punto de caducar.
  cache.put('dbx_token', datos.access_token, 180);
  return datos.access_token;
}
 
function escaparASCII(texto) {
  return String(texto).replace(/[\u007f-\uffff]/g, function (c) {
    return '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4);
  });
}
 
function avisarFalloDropbox(destino, nombreArchivo, mensajeError) {
  try {
    MailApp.sendEmail({
      to: destino,
      subject: CONFIG.ASUNTO_PREFIJO + ' ⚠ no se archivó en Dropbox',
      body: [
        'El consentimiento se envió por correo correctamente, pero NO se',
        'pudo archivar en Dropbox.',
        '',
        'Archivo:  ' + nombreArchivo,
        'Motivo:   ' + mensajeError,
        '',
        'El documento está a salvo: es el adjunto del correo anterior.',
        'Cuando se corrija el acceso a Dropbox, puede subirse a mano.',
        '',
        '— Mensaje automático del formulario de consentimientos.'
      ].join('\n'),
      name: 'Consentimientos Acción Salud'
    });
  } catch (err) {
    console.error('Tampoco se pudo avisar del fallo: ' + err.message);
  }
}

/*SET-UP DROPBOX*/
function dropboxPaso1_generarEnlace() {
  var APP_KEY = 'zaw4nhju7gwbgym';   // ← pegue aquí su App key

  if (!APP_KEY) throw new Error('Escriba su App key dentro de esta función.');
 
  var url = 'https://www.dropbox.com/oauth2/authorize' +
            '?client_id=' + encodeURIComponent(APP_KEY) +
            '&response_type=code' +
            '&token_access_type=offline';
 
  Logger.log('1. Abra este enlace en el navegador:\n\n' + url +
             '\n\n2. Autorice la app y copie el código que aparece.' +
             '\n3. Péguelo en dropboxPaso2_guardarCredenciales().');
}
 

function dropboxPaso2_guardarCredenciales() {
  var APP_KEY    = 'zaw4nhju7gwbgym';   // ← App key
  var APP_SECRET = 'ss44uut58miwz1t';   // ← App secret
  var CODIGO     = 'EhTIoYSWjvAAAAAAAAADtes9yXuKy4KsvMrKgpIL9ik';
 
  if (!APP_KEY || !APP_SECRET || !CODIGO) {
    throw new Error('Complete APP_KEY, APP_SECRET y CODIGO dentro de esta función.');
  }
 
  var resp = UrlFetchApp.fetch('https://api.dropboxapi.com/oauth2/token', {
    method: 'post',
    headers: {
      'Authorization': 'Basic ' + Utilities.base64Encode(APP_KEY + ':' + APP_SECRET)
    },
    payload: {
      code: CODIGO,
      grant_type: 'authorization_code'
    },
    muteHttpExceptions: true
  });
 
  if (resp.getResponseCode() !== 200) {
    throw new Error('Dropbox rechazó el código (HTTP ' + resp.getResponseCode() +
                    '): ' + resp.getContentText() +
                    '\nRecuerde que el código del paso 1 sirve una sola vez: ' +
                    'si ya lo usó, genere uno nuevo.');
  }
 
  var datos = JSON.parse(resp.getContentText());
  if (!datos.refresh_token) {
    throw new Error('Dropbox no devolvió refresh token. Verifique que el ' +
                    'enlace del paso 1 incluía token_access_type=offline.');
  }
 
  PropertiesService.getScriptProperties().setProperties({
    DROPBOX_APP_KEY:       APP_KEY,
    DROPBOX_APP_SECRET:    APP_SECRET,
    DROPBOX_REFRESH_TOKEN: datos.refresh_token
  });
 
  Logger.log('✓ Credenciales guardadas en las propiedades del script.\n\n' +
             'AHORA: borre los valores de APP_KEY, APP_SECRET y CODIGO de ' +
             'esta función y guarde. Ya no hacen falta aquí.\n\n' +
             'Después ponga DROPBOX_ACTIVO: true en CONFIG y ejecute ' +
             'dropboxPaso3_probar().');
}
 
/**
 * PASO 3. Sube un PDF de prueba para confirmar que todo funciona.
 * Deja el archivo en la carpeta del mes en curso.
 */
function dropboxPaso3_probar() {
  var pdf = Utilities.newBlob('Prueba de archivado.', 'application/pdf',
                              'PRUEBA_dropbox.pdf');
  var ruta = subirADropbox(pdf, 'PRUEBA_dropbox.pdf', {});
  Logger.log('✓ Subida correcta. El archivo quedó en:\n' + ruta +
             '\n\nPuede borrarlo desde Dropbox. Si ve esto, el archivado ' +
             'automático ya está funcionando.');
}
 
/** Ejecute esta función una vez desde el editor para probar el envío
 *  y para que Google le pida los permisos necesarios. */
function pruebaDeEnvio() {
  var destino = CONFIG.DESTINATARIO;
  if (!destino) throw new Error('Defina CONFIG.DESTINATARIO para la prueba.');
  MailApp.sendEmail({
    to: destino,
    subject: CONFIG.ASUNTO_PREFIJO + ' prueba de configuración',
    body: 'Si recibe este mensaje, el Apps Script está listo para enviar consentimientos.'
  });
  Logger.log('Correo de prueba enviado a ' + destino);
  Logger.log('Cuota de correos restante hoy: ' + MailApp.getRemainingDailyQuota());
}
