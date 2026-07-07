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
  regs: { name: 'Registrazioni', headers: ['registration_id', 'event_id', 'qr_id', 'biglietto_n', 'nome', 'cognome', 'email', 'registrato_il', 'email_inviata', 'inviata_il', 'checkin', 'checkin_il'] },
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
  return json_({ status: 'ok' });
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
        email, now, 'FALSE', '', 'da_verificare', ''
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
