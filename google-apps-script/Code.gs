/**
 * Politics Hub APS — backend moduli sito (newsletter + iscrizione eventi + biglietti QR)
 *
 * COME SI USA (vedi docs/SETUP-MODULI.md per la guida completa):
 *  1. Crea un Google Sheet sul Drive dell'associazione.
 *  2. Estensioni → Apps Script → incolla questo file → salva.
 *  3. Esegui una volta la funzione `setup` (autorizza quando richiesto).
 *  4. Deploy → Nuova implementazione → App web → Esegui come: me,
 *     Chi ha accesso: Chiunque → copia l'URL in assets/js/config.js del sito.
 *
 * Il foglio viene organizzato automaticamente in queste schede:
 *  - MailingList:   timestamp | email | consenso | fonte | stato
 *  - Eventi:        event_id | titolo | data | ora | luogo | max_posti | iscrizioni_aperte
 *  - Registrazioni: registration_id | event_id | qr_id | biglietto_n | nome | cognome |
 *                   email | registrato_il | email_inviata | inviata_il | checkin | checkin_il
 *  - Log:           timestamp | tipo | messaggio
 *
 * I biglietti vengono inviati dal trigger `sendPendingTickets` che gira OGNI MINUTO:
 * dall'iscrizione all'email passano di norma meno di 2 minuti.
 */

var TABS = {
  mailing: { name: 'MailingList', headers: ['timestamp', 'email', 'consenso', 'fonte', 'stato'] },
  events: { name: 'Eventi', headers: ['event_id', 'titolo', 'data', 'ora', 'luogo', 'max_posti', 'iscrizioni_aperte'] },
  regs: { name: 'Registrazioni', headers: ['registration_id', 'event_id', 'qr_id', 'biglietto_n', 'nome', 'cognome', 'email', 'registrato_il', 'email_inviata', 'inviata_il', 'checkin', 'checkin_il', 'checkin_da'] },
  log: { name: 'Log', headers: ['timestamp', 'tipo', 'messaggio'] }
};
var MAX_TICKETS = 2;
var EMAIL_SENDER_NAME = 'Politics Hub APS';

/* ============================== SETUP ============================== */

/** Esegui questa funzione UNA VOLTA dall'editor per preparare tutto. */
function setup() {
  ensureTabs_();
  ensureSecret_();
  ensureTrigger_();
  Logger.log('Setup completato: schede create, chiave QR generata, trigger email attivo (ogni minuto).');
}

function ensureTabs_() {
  var ss = SpreadsheetApp.getActive();
  Object.keys(TABS).forEach(function (k) {
    var t = TABS[k];
    var sh = ss.getSheetByName(t.name);
    if (!sh) sh = ss.insertSheet(t.name);
    var first = sh.getRange(1, 1, 1, t.headers.length).getValues()[0];
    if (String(first[0]) !== t.headers[0]) {
      sh.getRange(1, 1, 1, t.headers.length).setValues([t.headers]);
      sh.setFrozenRows(1);
    }
  });
}

function ensureSecret_() {
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('QR_SECRET')) {
    props.setProperty('QR_SECRET', Utilities.getUuid() + Utilities.getUuid());
  }
  if (!props.getProperty('CHECKIN_PIN')) {
    props.setProperty('CHECKIN_PIN', String(Math.floor(100000 + Math.random() * 900000)));
  }
  Logger.log('PIN check-in (da inserire nell\'app dei volontari): ' + props.getProperty('CHECKIN_PIN') +
    ' — modificabile in Impostazioni progetto → Proprietà dello script.');
}

function ensureTrigger_() {
  var exists = ScriptApp.getProjectTriggers().some(function (t) {
    return t.getHandlerFunction() === 'sendPendingTickets';
  });
  if (!exists) {
    ScriptApp.newTrigger('sendPendingTickets').timeBased().everyMinutes(1).create();
  }
}

/* ============================== WEB APP ============================== */

function doGet() {
  return json_({ status: 'ok', service: 'politics-hub-forms' });
}

function doPost(e) {
  try {
    var p = (e && e.parameter) || {};
    if (p.website) return json_({ status: 'ok' }); // honeypot anti-spam: fingiamo successo
    if (p.action === 'newsletter') return handleNewsletter_(p);
    if (p.action === 'event') return handleEvent_(p);
    // ---- azioni riservate all'app di check-in (richiedono PIN) ----
    if (p.action === 'checkin_events' || p.action === 'checkin_list' || p.action === 'checkin') {
      if (!validPin_(p.pin)) return json_({ status: 'unauthorized' });
      if (p.action === 'checkin_events') return handleCheckinEvents_();
      if (p.action === 'checkin_list') return handleCheckinList_(p);
      return handleCheckin_(p);
    }
    // ---- moduli app volontari: gestione eventi, drive, rubrica, statistiche (PIN) ----
    if (p.action === 'admin_event' || p.action === 'drive_tree' || p.action === 'directory' || p.action === 'stats') {
      if (!validPin_(p.pin)) return json_({ status: 'unauthorized' });
      if (p.action === 'admin_event') return handleAdminEvent_(p);
      if (p.action === 'drive_tree') return handleDriveTree_();
      if (p.action === 'directory') return handleDirectory_();
      return handleStats_();
    }
    return json_({ status: 'invalid', message: 'azione sconosciuta' });
  } catch (err) {
    log_('errore', String(err && err.stack || err));
    return json_({ status: 'error' });
  }
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ============================== NEWSLETTER ============================== */

function handleNewsletter_(p) {
  var email = cleanEmail_(p.email);
  if (!email) return json_({ status: 'invalid', field: 'email' });
  if (p.consent !== '1') return json_({ status: 'invalid', field: 'consent' });

  var sh = SpreadsheetApp.getActive().getSheetByName(TABS.mailing.name);
  var emails = sh.getLastRow() > 1
    ? sh.getRange(2, 2, sh.getLastRow() - 1, 2).getValues() : [];
  for (var i = 0; i < emails.length; i++) {
    if (String(emails[i][0]).toLowerCase() === email) {
      return json_({ status: 'ok', already: true }); // già iscritto: idempotente
    }
  }
  sh.appendRow([new Date(), email, 'TRUE', p.source || 'sito', 'attivo']);
  sendWelcomeEmail_(email, String(p.lang || 'it').slice(0, 2) === 'en'); // conferma immediata
  return json_({ status: 'ok' });
}

/** Email di benvenuto newsletter (best-effort: se fallisce, l'iscrizione resta comunque valida). */
function sendWelcomeEmail_(email, en) {
  try {
    var subject = en ? 'Welcome to Politics News' : 'Benvenuta/o in Politics News';
    var body = en
      ? '<p style="font-family:Arial,sans-serif;font-size:14px;margin:20px 4px">Your subscription to the Politics Hub newsletter is confirmed. You\'ll receive updates on our events, projects and articles — no party politics, only ideas.</p>' +
        '<p style="font-family:Arial,sans-serif;font-size:12px;color:#3d5670;margin:18px 4px">To unsubscribe, just reply to this email.<br>Privacy: https://www.politicshub.it/en/privacy-newsletter.html</p>'
      : '<p style="font-family:Arial,sans-serif;font-size:14px;margin:20px 4px">La tua iscrizione alla newsletter di Politics Hub è confermata. Riceverai aggiornamenti su eventi, progetti e articoli — nessuna logica di partito, solo idee.</p>' +
        '<p style="font-family:Arial,sans-serif;font-size:12px;color:#3d5670;margin:18px 4px">Per disiscriverti basta rispondere a questa email.<br>Privacy: https://www.politicshub.it/it/privacy-newsletter.html</p>';
    var html =
      '<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#0B2A45">' +
      '<div style="background:#0B2A45;color:#fff;border-radius:14px;padding:26px;text-align:center">' +
      '<div style="font-size:13px;letter-spacing:2px;color:#A9D4F0">POLITICS HUB APS</div>' +
      '<h2 style="margin:10px 0 0;font-weight:500">Politics News</h2></div>' + body + '</div>';
    MailApp.sendEmail({ to: email, subject: subject, htmlBody: html, name: EMAIL_SENDER_NAME });
  } catch (err) {
    log_('newsletter', email + ': ' + err); // es. quota email esaurita: iscrizione salvata comunque
  }
}

/* ============================== ISCRIZIONE EVENTO ============================== */

function handleEvent_(p) {
  var email = cleanEmail_(p.email);
  var g1 = cleanName_(p.nome1) && cleanName_(p.cognome1)
    ? { nome: cleanName_(p.nome1), cognome: cleanName_(p.cognome1) } : null;
  var has2a = !!cleanName_(p.nome2), has2b = !!cleanName_(p.cognome2);
  var g2 = (has2a && has2b) ? { nome: cleanName_(p.nome2), cognome: cleanName_(p.cognome2) } : null;

  if (!email) return json_({ status: 'invalid', field: 'email' });
  if (!g1) return json_({ status: 'invalid', field: 'nome1' });
  if (has2a !== has2b) return json_({ status: 'invalid', field: 'nome2' }); // secondo ospite a metà
  if (p.consent !== '1') return json_({ status: 'invalid', field: 'consent' });
  var eventId = String(p.event_id || '').trim();
  if (!eventId) return json_({ status: 'invalid', field: 'event_id' });

  var guests = g2 ? [g1, g2] : [g1];
  if (guests.length > MAX_TICKETS) return json_({ status: 'invalid', field: 'tickets' });

  // ---- sezione critica: capienza + scrittura, con lock anti-doppioni ----
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var ev = findEvent_(eventId);
    if (!ev || !ev.open) return json_({ status: 'closed' });

    var regsSh = SpreadsheetApp.getActive().getSheetByName(TABS.regs.name);
    var rows = regsSh.getLastRow() > 1
      ? regsSh.getRange(2, 1, regsSh.getLastRow() - 1, 12).getValues() : [];
    var taken = 0;
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i][1]) !== eventId) continue;
      if (String(rows[i][10]) === 'annullato') continue;
      taken++;
      if (String(rows[i][6]).toLowerCase() === email) {
        return json_({ status: 'already_registered' });
      }
    }
    if (ev.max && taken + guests.length > ev.max) {
      return json_({ status: 'sold_out', remaining: Math.max(0, ev.max - taken) });
    }

    var regId = 'REG-' + Utilities.formatDate(new Date(), 'Europe/Rome', 'yyMMdd-HHmmss') + '-' + randId_(4);
    var now = new Date();
    guests.forEach(function (g, idx) {
      regsSh.appendRow([
        regId, eventId, makeQrId_(), idx + 1, g.nome, g.cognome,
        email, now, 'FALSE', '', 'da_verificare', '', ''
      ]);
    });
    return json_({ status: 'ok', tickets: guests.length });
  } finally {
    lock.releaseLock();
  }
}

function findEvent_(eventId) {
  var sh = SpreadsheetApp.getActive().getSheetByName(TABS.events.name);
  if (sh.getLastRow() < 2) return null;
  var rows = sh.getRange(2, 1, sh.getLastRow() - 1, 7).getValues();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === eventId) {
      return {
        id: eventId, title: rows[i][1], date: rows[i][2], time: rows[i][3],
        location: rows[i][4],
        max: parseInt(rows[i][5], 10) || 0,
        open: String(rows[i][6]).toUpperCase() === 'TRUE' || rows[i][6] === true
      };
    }
  }
  return null;
}

/* ============================== QR ============================== */

function makeQrId_() {
  var yy = Utilities.formatDate(new Date(), 'Europe/Rome', 'yy');
  var base = 'PH' + yy + '-' + randId_(4) + '-' + randId_(4);
  return base + '.' + sign_(base);
}

function sign_(base) {
  var secret = PropertiesService.getScriptProperties().getProperty('QR_SECRET');
  var mac = Utilities.computeHmacSha256Signature(base, secret);
  return Utilities.base64EncodeWebSafe(mac).replace(/[=_-]/g, '').slice(0, 8).toUpperCase();
}

/** Verifica un QR scansionato (servirà all'app di check-in). */
function verifyQrId(qrId) {
  var parts = String(qrId).split('.');
  return parts.length === 2 && sign_(parts[0]) === parts[1].toUpperCase();
}

function randId_(n) {
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // senza caratteri ambigui
  var out = '';
  for (var i = 0; i < n; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
  return out;
}

/* ============================== INVIO BIGLIETTI ============================== */

/** Gira ogni minuto (trigger creato da setup): invia i biglietti non ancora spediti. */
function sendPendingTickets() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return; // un invio alla volta
  try {
    var ss = SpreadsheetApp.getActive();
    var sh = ss.getSheetByName(TABS.regs.name);
    if (sh.getLastRow() < 2) return;
    var rows = sh.getRange(2, 1, sh.getLastRow() - 1, 12).getValues();

    // raggruppa i biglietti non inviati per registrazione (stessa email)
    var groups = {};
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i][8]) !== 'FALSE') continue;
      var regId = String(rows[i][0]);
      (groups[regId] = groups[regId] || []).push({ row: i + 2, data: rows[i] });
    }

    Object.keys(groups).forEach(function (regId) {
      var tickets = groups[regId];
      try {
        var ev = findEvent_(String(tickets[0].data[1])) || {};
        var email = String(tickets[0].data[6]);
        var inline = {}, listHtml = '';

        tickets.forEach(function (t, idx) {
          var qrId = String(t.data[2]);
          var png = UrlFetchApp.fetch(
            'https://quickchart.io/qr?size=320&margin=2&text=' + encodeURIComponent(qrId)
          ).getBlob().setName('qr' + idx + '.png');
          inline['qr' + idx] = png;
          listHtml +=
            '<div style="margin:22px 0;padding:18px;border:1px solid #DBE7F1;border-radius:12px;text-align:center">' +
            '<div style="font-size:15px;color:#0B2A45"><b>' + esc_(t.data[4] + ' ' + t.data[5]) + '</b></div>' +
            '<img src="cid:qr' + idx + '" width="220" height="220" alt="QR" style="margin:10px 0">' +
            '<div style="font-family:monospace;font-size:12px;color:#3d5670">' + esc_(qrId) + '</div>' +
            '</div>';
        });

        var when = [fmtDate_(ev.date), ev.time ? String(ev.time) : ''].filter(Boolean).join(' · ');
        var html =
          '<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#0B2A45">' +
          '<div style="background:#0B2A45;color:#fff;border-radius:14px;padding:26px;text-align:center">' +
          '<div style="font-size:13px;letter-spacing:2px;color:#A9D4F0">POLITICS HUB APS</div>' +
          '<h2 style="margin:10px 0 0;font-weight:500">' + esc_(ev.title || 'Il tuo biglietto') + '</h2>' +
          (when ? '<div style="margin-top:8px;color:#cfe6f7">📅 ' + esc_(when) + '</div>' : '') +
          (ev.location ? '<div style="color:#cfe6f7">📍 ' + esc_(ev.location) + '</div>' : '') +
          '</div>' +
          '<p style="font-family:Arial,sans-serif;font-size:14px;margin:20px 4px">Grazie per esserti iscritto! ' +
          'Presenta all\'ingresso ' + (tickets.length > 1 ? 'questi QR code (uno per persona)' : 'questo QR code') + ':</p>' +
          listHtml +
          '<p style="font-family:Arial,sans-serif;font-size:12px;color:#3d5670;margin:18px 4px">' +
          'Il biglietto è personale. Per qualsiasi problema scrivi a info@politicshub.it.<br>' +
          'Trattamento dati: https://www.politicshub.it/it/privacy-eventi.html</p></div>';

        MailApp.sendEmail({
          to: email,
          subject: '🎟️ Il tuo biglietto — ' + (ev.title || 'Politics Hub'),
          htmlBody: html,
          inlineImages: inline,
          name: EMAIL_SENDER_NAME
        });

        var sentAt = new Date();
        tickets.forEach(function (t) {
          sh.getRange(t.row, 9).setValue('TRUE');
          sh.getRange(t.row, 10).setValue(sentAt);
        });
      } catch (err) {
        // lascia email_inviata=FALSE: verrà ritentato al prossimo giro
        log_('invio', regId + ': ' + err);
      }
    });
  } finally {
    lock.releaseLock();
  }
}

/* ============================== CHECK-IN (app volontari) ============================== */

function validPin_(pin) {
  var real = PropertiesService.getScriptProperties().getProperty('CHECKIN_PIN') || '';
  return real !== '' && String(pin || '') === real;
}

/** Elenco eventi con conteggi, per il selettore dell'app. */
function handleCheckinEvents_() {
  var ss = SpreadsheetApp.getActive();
  var evSh = ss.getSheetByName(TABS.events.name);
  var events = [];
  if (evSh.getLastRow() > 1) {
    var rows = evSh.getRange(2, 1, evSh.getLastRow() - 1, 7).getValues();
    var counts = countByEvent_();
    rows.forEach(function (r) {
      var id = String(r[0]).trim();
      if (!id) return;
      events.push({
        id: id, title: String(r[1]), date: fmtDate_(r[2]), time: String(r[3] || ''),
        location: String(r[4] || ''), max: parseInt(r[5], 10) || 0,
        open: String(r[6]).toUpperCase() === 'TRUE' || r[6] === true,
        total: (counts[id] || {}).total || 0,
        entered: (counts[id] || {}).entered || 0
      });
    });
  }
  return json_({ status: 'ok', events: events.reverse() }); // più recenti prima
}

function countByEvent_() {
  var sh = SpreadsheetApp.getActive().getSheetByName(TABS.regs.name);
  var out = {};
  if (sh.getLastRow() < 2) return out;
  sh.getRange(2, 1, sh.getLastRow() - 1, 13).getValues().forEach(function (r) {
    var id = String(r[1]);
    if (String(r[10]) === 'annullato') return;
    out[id] = out[id] || { total: 0, entered: 0 };
    out[id].total++;
    if (String(r[10]) === 'entrato') out[id].entered++;
  });
  return out;
}

/** Lista partecipanti di un evento, per elenco/ricerca nell'app. */
function handleCheckinList_(p) {
  var eventId = String(p.event_id || '').trim();
  if (!eventId) return json_({ status: 'invalid', field: 'event_id' });
  var sh = SpreadsheetApp.getActive().getSheetByName(TABS.regs.name);
  var list = [];
  if (sh.getLastRow() > 1) {
    sh.getRange(2, 1, sh.getLastRow() - 1, 13).getValues().forEach(function (r) {
      if (String(r[1]) !== eventId || String(r[10]) === 'annullato') return;
      list.push({
        qr: String(r[2]), nome: String(r[4]), cognome: String(r[5]), email: String(r[6]),
        entrato: String(r[10]) === 'entrato',
        alle: r[11] ? Utilities.formatDate(new Date(r[11]), 'Europe/Rome', 'HH:mm') : '',
        da: String(r[12] || '')
      });
    });
  }
  var entered = list.filter(function (x) { return x.entrato; }).length;
  return json_({ status: 'ok', list: list, total: list.length, entered: entered });
}

/** Check-in atomico di un biglietto (da scansione QR o manuale). */
function handleCheckin_(p) {
  var qr = String(p.qr || '').trim();
  if (!qr) return json_({ status: 'invalid', field: 'qr' });
  if (!verifyQrId(qr)) return json_({ status: 'not_found' }); // firma non valida = biglietto falso/typo

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = SpreadsheetApp.getActive().getSheetByName(TABS.regs.name);
    if (sh.getLastRow() < 2) return json_({ status: 'not_found' });
    var rows = sh.getRange(2, 1, sh.getLastRow() - 1, 13).getValues();
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i][2]) !== qr) continue;
      var who = { nome: String(rows[i][4]), cognome: String(rows[i][5]) };
      if (String(rows[i][10]) === 'annullato') return json_({ status: 'cancelled', guest: who });
      if (String(rows[i][10]) === 'entrato') {
        return json_({
          status: 'already', guest: who,
          alle: rows[i][11] ? Utilities.formatDate(new Date(rows[i][11]), 'Europe/Rome', 'HH:mm') : '',
          da: String(rows[i][12] || '')
        });
      }
      var row = i + 2;
      sh.getRange(row, 11).setValue('entrato');
      sh.getRange(row, 12).setValue(new Date());
      sh.getRange(row, 13).setValue(String(p.operator || '').slice(0, 40));
      var counts = countByEvent_()[String(rows[i][1])] || {};
      return json_({ status: 'ok', guest: who, entered: counts.entered || 0, total: counts.total || 0 });
    }
    return json_({ status: 'not_found' });
  } finally {
    lock.releaseLock();
  }
}

/* ============================== MODULI APP VOLONTARI ==============================
 *
 * GESTIONE EVENTI (admin_event): crea/aggiorna la riga nella scheda Eventi
 *   e apre/chiude le iscrizioni direttamente dall'app (niente più passo manuale).
 *
 * DRIVE (drive_tree): restituisce l'albero del Drive dell'associazione.
 *   Configurazione (una volta): Apps Script → ⚙️ Impostazioni progetto →
 *   Proprietà dello script → aggiungi DRIVE_ROOT_ID = ID della cartella radice
 *   (dall'URL della cartella: drive.google.com/drive/folders/QUESTO_ID).
 *   NB: la prima volta lo script chiederà una nuova autorizzazione (accesso Drive):
 *   dopo aver incollato il codice, esegui una volta `setup` dall'editor.
 *
 * RUBRICA e LINK UTILI (directory): letti dalle schede Rubrica e LinkUtili del
 *   foglio (create automaticamente al primo uso). Compilale direttamente nel foglio.
 *
 * STATISTICHE (stats): iscritti newsletter per mese + iscritti/entrati per evento.
 */

var EXTRA_TABS = {
  rubrica: { name: 'Rubrica', headers: ['nome', 'ruolo', 'email', 'telefono', 'gruppo'] },
  link: { name: 'LinkUtili', headers: ['titolo', 'url', 'gruppo'] }
};

function extraSheet_(key) {
  var ss = SpreadsheetApp.getActive();
  var t = EXTRA_TABS[key];
  var sh = ss.getSheetByName(t.name);
  if (!sh) {
    sh = ss.insertSheet(t.name);
    sh.getRange(1, 1, 1, t.headers.length).setValues([t.headers]);
    sh.setFrozenRows(1);
  }
  return sh;
}

/** Crea/aggiorna una riga della scheda Eventi (op=upsert) o apre/chiude le iscrizioni (op=toggle). */
function handleAdminEvent_(p) {
  var id = String(p.event_id || '').trim();
  if (!id) return json_({ status: 'invalid', field: 'event_id' });
  var sh = SpreadsheetApp.getActive().getSheetByName(TABS.events.name);
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var rowIdx = 0, last = sh.getLastRow();
    if (last > 1) {
      var ids = sh.getRange(2, 1, last - 1, 1).getValues();
      for (var i = 0; i < ids.length; i++) {
        if (String(ids[i][0]).trim() === id) { rowIdx = i + 2; break; }
      }
    }
    if (p.op === 'toggle') {
      if (!rowIdx) return json_({ status: 'not_found' });
      sh.getRange(rowIdx, 7).setValue(p.aperte === '1' ? 'TRUE' : 'FALSE');
      log_('admin', 'iscrizioni ' + (p.aperte === '1' ? 'aperte' : 'chiuse') + ' per ' + id);
      return json_({ status: 'ok' });
    }
    var vals = [id, String(p.titolo || ''), String(p.data || ''), String(p.ora || ''),
      String(p.luogo || ''), parseInt(p.max_posti, 10) || 0, p.aperte === '1' ? 'TRUE' : 'FALSE'];
    if (rowIdx) sh.getRange(rowIdx, 1, 1, 7).setValues([vals]);
    else sh.appendRow(vals);
    log_('admin', (rowIdx ? 'aggiornato' : 'creato') + ' evento ' + id);
    return json_({ status: 'ok' });
  } finally {
    lock.releaseLock();
  }
}

/** Albero del Drive (cartelle + file, solo nomi e ID: i contenuti restano su Drive). */
function handleDriveTree_() {
  var rootId = PropertiesService.getScriptProperties().getProperty('DRIVE_ROOT_ID');
  if (!rootId) return json_({ status: 'no_root' });
  var root;
  try { root = DriveApp.getFolderById(rootId); }
  catch (e) { return json_({ status: 'bad_root' }); }
  var budget = { n: 0, max: 4000 }; // limite di sicurezza per i tempi di Apps Script
  var tree = folderNode_(root, 0, budget);
  return json_({ status: 'ok', updated: new Date().toISOString(), truncated: budget.n >= budget.max, tree: tree });
}

function folderNode_(folder, depth, budget) {
  var node = { id: folder.getId(), name: folder.getName(), type: 'folder', children: [] };
  if (depth >= 8 || budget.n >= budget.max) return node;
  var fs = folder.getFolders();
  while (fs.hasNext() && budget.n < budget.max) {
    budget.n++;
    node.children.push(folderNode_(fs.next(), depth + 1, budget));
  }
  var files = folder.getFiles();
  while (files.hasNext() && budget.n < budget.max) {
    budget.n++;
    var f = files.next();
    node.children.push({ id: f.getId(), name: f.getName(), type: 'file', mime: f.getMimeType() });
  }
  node.children.sort(function (a, b) {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return node;
}

/** Rubrica associati + link utili (schede Rubrica e LinkUtili del foglio). */
function handleDirectory_() {
  var rSh = extraSheet_('rubrica'), lSh = extraSheet_('link');
  var people = [], links = [];
  if (rSh.getLastRow() > 1) {
    rSh.getRange(2, 1, rSh.getLastRow() - 1, 5).getValues().forEach(function (r) {
      if (!String(r[0]).trim()) return;
      people.push({ nome: String(r[0]), ruolo: String(r[1] || ''), email: String(r[2] || ''),
        telefono: String(r[3] || ''), gruppo: String(r[4] || '') });
    });
  }
  if (lSh.getLastRow() > 1) {
    lSh.getRange(2, 1, lSh.getLastRow() - 1, 3).getValues().forEach(function (r) {
      if (!String(r[1]).trim()) return;
      links.push({ titolo: String(r[0] || r[1]), url: String(r[1]), gruppo: String(r[2] || '') });
    });
  }
  return json_({ status: 'ok', people: people, links: links });
}

/** Statistiche: newsletter per mese (ultimi 12) + iscritti/entrati per evento. */
function handleStats_() {
  var ss = SpreadsheetApp.getActive();
  var mSh = ss.getSheetByName(TABS.mailing.name);
  var total = 0, byMonth = {};
  if (mSh && mSh.getLastRow() > 1) {
    mSh.getRange(2, 1, mSh.getLastRow() - 1, 1).getValues().forEach(function (r) {
      if (Object.prototype.toString.call(r[0]) !== '[object Date]') return;
      total++;
      var k = Utilities.formatDate(r[0], 'Europe/Rome', 'yyyy-MM');
      byMonth[k] = (byMonth[k] || 0) + 1;
    });
  }
  var months = [], now = new Date();
  for (var i = 11; i >= 0; i--) {
    var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    var k2 = Utilities.formatDate(d, 'Europe/Rome', 'yyyy-MM');
    months.push({ mese: k2, iscritti: byMonth[k2] || 0 });
  }
  var counts = countByEvent_();
  var evSh = ss.getSheetByName(TABS.events.name);
  var events = [];
  if (evSh && evSh.getLastRow() > 1) {
    evSh.getRange(2, 1, evSh.getLastRow() - 1, 7).getValues().forEach(function (r) {
      var id = String(r[0]).trim();
      if (!id) return;
      events.push({ id: id, titolo: String(r[1] || ''), data: fmtDate_(r[2]),
        iscritti: (counts[id] || {}).total || 0, entrati: (counts[id] || {}).entered || 0 });
    });
  }
  return json_({ status: 'ok', newsletterTotale: total, newsletterMesi: months, eventi: events.reverse() });
}

/* ============================== UTILITÀ ============================== */

function cleanEmail_(v) {
  var e = String(v || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) ? e : '';
}
function cleanName_(v) {
  var s = String(v || '').replace(/\s+/g, ' ').trim();
  return (s.length >= 2 && s.length <= 60) ? s : '';
}
function fmtDate_(d) {
  if (!d) return '';
  if (Object.prototype.toString.call(d) === '[object Date]') {
    return Utilities.formatDate(d, 'Europe/Rome', 'dd/MM/yyyy');
  }
  return String(d);
}
function esc_(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function log_(tipo, msg) {
  try {
    SpreadsheetApp.getActive().getSheetByName(TABS.log.name).appendRow([new Date(), tipo, msg]);
  } catch (e) { /* niente */ }
}
