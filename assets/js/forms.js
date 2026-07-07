// Politics Hub APS — moduli newsletter e iscrizione eventi
// Invia i dati all'app web Google Apps Script (PH_CONFIG.FORMS_ENDPOINT in config.js).
(function () {
  var LANG = (document.documentElement.lang || 'it').slice(0, 2);
  var EP = (window.PH_CONFIG && window.PH_CONFIG.FORMS_ENDPOINT) || '';
  var T = {
    it: {
      sending: 'Invio in corso…',
      nlOk: 'Iscrizione avvenuta! Benvenuta/o in Politics News. 🎉',
      nlAlready: 'Questa email è già iscritta alla newsletter. Grazie!',
      consent: 'Per procedere devi accettare la privacy policy.',
      badEmail: 'Controlla l\'indirizzo email.',
      badNames: 'Inserisci nome e cognome di ogni partecipante.',
      netErr: 'Non è stato possibile inviare la richiesta. Riprova tra poco o scrivici a info@politicshub.it.',
      noEndpoint: 'Il modulo non è ancora attivo: scrivici a info@politicshub.it.',
      regOk1: 'Iscrizione confermata! Il biglietto con il QR code arriverà via email entro pochi minuti (controlla anche lo spam).',
      regOk2: 'Iscrizione confermata per 2 partecipanti! I biglietti con i QR code arriveranno via email entro pochi minuti (controlla anche lo spam).',
      soldOut: 'Purtroppo i posti sono esauriti.',
      soldOutLeft: 'Posti rimasti insufficienti: ne restano solo ',
      already: 'Questa email risulta già iscritta all\'evento. Se pensi sia un errore scrivici a info@politicshub.it.',
      closed: 'Le iscrizioni per questo evento non sono aperte.',
      noEvent: 'Al momento non c\'è nessun evento con iscrizioni aperte.',
      nextExpected: 'Prossimo evento previsto: ',
      backEvents: 'Vai alla pagina eventi'
    },
    en: {
      sending: 'Sending…',
      nlOk: 'Subscribed! Welcome to Politics News. 🎉',
      nlAlready: 'This email is already subscribed. Thank you!',
      consent: 'You must accept the privacy policy to proceed.',
      badEmail: 'Please check the email address.',
      badNames: 'Enter first name and surname for each participant.',
      netErr: 'The request could not be sent. Try again shortly or write to info@politicshub.it.',
      noEndpoint: 'The form is not active yet: write to info@politicshub.it.',
      regOk1: 'Registration confirmed! Your ticket with the QR code will arrive by email within a few minutes (check spam too).',
      regOk2: 'Registration confirmed for 2 participants! The tickets with QR codes will arrive by email within a few minutes (check spam too).',
      soldOut: 'Unfortunately the event is sold out.',
      soldOutLeft: 'Not enough places left: only ',
      already: 'This email is already registered for the event. If you think this is a mistake, write to info@politicshub.it.',
      closed: 'Registration for this event is not open.',
      noEvent: 'There is no event with open registration at the moment.',
      nextExpected: 'Next event expected: ',
      backEvents: 'Go to the events page'
    }
  }[LANG] || {};

  function post(data) {
    data.lang = LANG;
    var body = new URLSearchParams();
    Object.keys(data).forEach(function (k) { body.append(k, data[k]); });
    return fetch(EP, { method: 'POST', body: body }).then(function (r) { return r.json(); });
  }
  function setStatus(el, cls, text) {
    el.className = 'form-status show ' + cls;
    el.textContent = text;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmtMonth(ym) {
    var months = LANG === 'it'
      ? ['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre']
      : ['January','February','March','April','May','June','July','August','September','October','November','December'];
    var p = String(ym || '').split('-');
    return p.length >= 2 ? months[parseInt(p[1], 10) - 1] + ' ' + p[0] : '';
  }

  /* ---------------- Newsletter (pagina contatti) ---------------- */
  var nl = document.getElementById('ph-newsletter-form');
  if (nl) {
    nl.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var st = nl.querySelector('.form-status');
      var email = nl.email.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return setStatus(st, 'err', T.badEmail);
      if (!nl.consent.checked) return setStatus(st, 'err', T.consent);
      if (!EP) return setStatus(st, 'err', T.noEndpoint);
      setStatus(st, 'info', T.sending);
      nl.querySelector('button').disabled = true;
      post({ action: 'newsletter', email: email, consent: '1', source: 'sito', website: nl.website.value })
        .then(function (r) {
          if (r.status === 'ok') { setStatus(st, 'ok', r.already ? T.nlAlready : T.nlOk); nl.email.value = ''; }
          else setStatus(st, 'err', T.netErr);
        })
        .catch(function () { setStatus(st, 'err', T.netErr); })
        .finally(function () { nl.querySelector('button').disabled = false; });
    });
  }

  /* ---------------- Iscrizione evento (pagina iscrizione) ---------------- */
  var regForm = document.getElementById('ph-reg-form');
  var regEvent = document.getElementById('ph-reg-event');
  if (regForm && regEvent) {
    fetch('../data/events.json', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d.status !== 'scheduled' || !d.event) {
          var next = d.nextEventMonth
            ? '<p class="ev-next">' + esc(T.nextExpected) + '<b>' + esc(fmtMonth(d.nextEventMonth)) + '</b></p>' : '';
          regEvent.innerHTML = '<div class="event-empty"><h3>' + esc(T.noEvent) + '</h3>' + next +
            '<p class="mt-2"><a class="btn btn-outline" href="eventi.html">' + esc(T.backEvents) + '</a></p></div>';
          return;
        }
        var e = d.event;
        var title = e['title_' + LANG] || e.title_it || '';
        var desc = e['description_' + LANG] || e.description_it || '';
        var dateTxt = '';
        if (e.date) {
          var p = e.date.split('-');
          var mn = (LANG === 'it'
            ? ['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre']
            : ['January','February','March','April','May','June','July','August','September','October','November','December'])[parseInt(p[1], 10) - 1];
          dateTxt = LANG === 'it' ? parseInt(p[2], 10) + ' ' + mn + ' ' + p[0] : mn + ' ' + parseInt(p[2], 10) + ', ' + p[0];
        }
        regEvent.innerHTML =
          '<div class="event-panel layout-text"><div class="ev-body">' +
          '<span class="meta">Politics Hub</span>' +
          '<h3>' + esc(title) + '</h3>' +
          '<div class="ev-meta">' +
          (dateTxt ? '<span class="ev-pill">📅 ' + esc(dateTxt) + (e.time ? ' · ' + esc(e.time) : '') + '</span>' : '') +
          (e.location ? '<span class="ev-pill">📍 ' + esc(e.location) + '</span>' : '') +
          '</div>' +
          '<p>' + esc(desc) + '</p>' +
          '</div></div>';
        regForm.event_id.value = e.id || '';
        regForm.classList.remove('hide');
      })
      .catch(function () {
        regEvent.innerHTML = '<div class="event-empty"><p class="ev-hint">…</p></div>';
      });

    var toggle2 = document.getElementById('reg-add-guest2');
    var guest2 = document.getElementById('reg-guest2');
    if (toggle2 && guest2) {
      toggle2.addEventListener('change', function () {
        guest2.classList.toggle('hide', !toggle2.checked);
        if (!toggle2.checked) { regForm.nome2.value = ''; regForm.cognome2.value = ''; }
      });
    }

    regForm.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var st = document.getElementById('ph-reg-status');
      var email = regForm.email.value.trim();
      var n1 = regForm.nome1.value.trim(), c1 = regForm.cognome1.value.trim();
      var two = toggle2 && toggle2.checked;
      var n2 = two ? regForm.nome2.value.trim() : '', c2 = two ? regForm.cognome2.value.trim() : '';
      if (!n1 || !c1 || (two && (!n2 || !c2))) return setStatus(st, 'err', T.badNames);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return setStatus(st, 'err', T.badEmail);
      if (!regForm.consent.checked) return setStatus(st, 'err', T.consent);
      if (!EP) return setStatus(st, 'err', T.noEndpoint);
      setStatus(st, 'info', T.sending);
      var btn = regForm.querySelector('button[type="submit"]');
      btn.disabled = true;
      post({
        action: 'event', event_id: regForm.event_id.value,
        nome1: n1, cognome1: c1, nome2: n2, cognome2: c2,
        email: email, consent: '1', website: regForm.website.value
      }).then(function (r) {
        if (r.status === 'ok') {
          regForm.classList.add('hide');
          setStatus(st, 'ok', r.tickets === 2 ? T.regOk2 : T.regOk1);
        } else if (r.status === 'sold_out') {
          setStatus(st, 'err', r.remaining > 0 ? T.soldOutLeft + r.remaining + '.' : T.soldOut);
        } else if (r.status === 'already_registered') setStatus(st, 'err', T.already);
        else if (r.status === 'closed') setStatus(st, 'err', T.closed);
        else setStatus(st, 'err', T.netErr);
      }).catch(function () { setStatus(st, 'err', T.netErr); })
        .finally(function () { btn.disabled = false; });
    });
  }
})();
