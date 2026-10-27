/* Oporto Medical Spa · protótipo partilhado pelas propostas A e B.
   Agenda (tratamento > terapeuta > dia e hora > dados), vouchers, equipa e guia.
   Dados ilustrativos: nomes da equipa, durações e horários são exemplos. */
(function () {
  'use strict';

  var DATA = window.OMS_DATA || {};
  var TREATMENTS = DATA.treatments || [
    { id: 'aroma', area: 'Relaxamento', name: 'Massagem com Aromaterapia', min: 60, price: 65,
      text: 'Óleos escolhidos de acordo com as suas preferências e um toque lento que devolve o corpo ao seu ritmo.' },
    { id: 'oil', area: 'Relaxamento', name: 'Massagem Oil & Candle', min: 60, price: 74,
      text: 'Óleo de vela morno, luz baixa e silêncio. Uma hora só sua.' },
    { id: 'world', area: 'Relaxamento', name: 'World Therapy', min: 75, price: 88,
      text: 'As melhores práticas do ocidente e antigos rituais orientais num só ritual, para soltar tensões profundas.' },
    { id: 'dren', area: 'Fisioterapia', name: 'Drenagem Linfática Manual', min: 60, price: 90,
      text: 'Movimentos suaves e precisos que aliviam o peso das pernas e reduzem o edema.' },
    { id: 'fisio', area: 'Fisioterapia', name: 'Fisioterapia e Reeducação Postural', min: 50, price: 90,
      text: 'Avaliação, tratamento e um plano para que a dor não volte.' },
    { id: 'pilates', area: 'Pilates', name: 'Pilates Clínico', min: 50, price: 50,
      text: 'Sessão individual orientada por fisioterapeuta, para uma coluna forte e um corpo consciente.' }
  ];

  var AREA_TEXT = DATA.areaText || {};
  var TEAM = DATA.team || [
    { id: 'ana', name: 'Ana Ribeiro', role: 'Fisioterapeuta', focus: 'Reeducação postural e Pilates clínico',
      bio: 'Acredita que cada corpo conta uma história. O trabalho dela é ouvi-la antes de a corrigir.',
      does: ['fisio', 'pilates'], tone: 1 },
    { id: 'marta', name: 'Marta Sousa', role: 'Fisioterapeuta', focus: 'Fisioterapia dermato-funcional',
      bio: 'Especialista em drenagem e recuperação pós-operatória, com mãos de uma precisão rara.',
      does: ['dren', 'fisio'], tone: 2 },
    { id: 'ines', name: 'Inês Carvalho', role: 'Massoterapeuta', focus: 'Rituais de tranquilidade',
      bio: 'Desenha cada ritual à medida de quem chega. Ninguém sai igual a como entrou.',
      does: ['aroma', 'oil', 'world'], tone: 3 },
    { id: 'sofia', name: 'Sofia Lemos', role: 'Massoterapeuta', focus: 'World Therapy e aromaterapia',
      bio: 'Formada em técnicas orientais e ocidentais. Trabalha com calma e com intenção.',
      does: ['aroma', 'world', 'oil'], tone: 4 }
  ];

  var HOURS = ['08:00', '09:00', '10:00', '11:00', '12:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00'];
  var WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  var MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function eur(n) { return n.toLocaleString('pt-PT', n % 1 ? { minimumFractionDigits: 2 } : {}) + ' €'; }
  function byId(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }
  function initials(name) { return name.split(' ').map(function (p) { return p[0]; }).join(''); }
  function hash(s) { var h = 7; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 1000003; return h; }
  function dayKey(d) { return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
  function longDate(d) { return WEEKDAYS[d.getDay()] + ', ' + d.getDate() + ' ' + MONTHS[d.getMonth()]; }

  function nextDays(n) {
    var out = [], d = new Date(); d.setHours(0, 0, 0, 0);
    while (out.length < n) { d = new Date(d.getTime() + 864e5); if (d.getDay() !== 0) out.push(d); }
    return out;
  }
  function isoDay(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }

  // Horas livres da agenda do Zoho CRM, por tratamento (/api/disponibilidade). Sem Zoho ligado, a resposta
  // é { fonte: 'simulada' } e fica a disponibilidade simulada, estável para o mesmo dia e terapeuta.
  var AGENDA = {};
  function loadAgenda(treatment, days, done) {
    if (AGENDA[treatment] || !window.fetch || !window.OMS_PAGAR) return;
    AGENDA[treatment] = { loading: true };
    var span = Math.round((days[days.length - 1] - days[0]) / 864e5) + 1;
    fetch('/api/disponibilidade?tratamento=' + encodeURIComponent(treatment) + '&de=' + isoDay(days[0]) + '&dias=' + span)
      .then(function (r) { return r.ok ? r.json() : { fonte: 'simulada' }; })
      .catch(function () { return { fonte: 'simulada' }; })
      .then(function (j) { AGENDA[treatment] = j; done(treatment); });
  }
  function isTaken(day, hour, therapistId, treatment) {
    var a = AGENDA[treatment];
    if (a && a.loading) return true;
    if (a && a.fonte === 'zoho') return ((a.livres[therapistId] || {})[isoDay(day)] || []).indexOf(hour) < 0;
    return hash(dayKey(day) + hour + therapistId) % 10 < 4 || (day.getDay() === 6 && hour > '13:00');
  }
  function freeFor(day, hour, treatment) {
    return TEAM.filter(function (t) { return t.does.indexOf(treatment) > -1 && !isTaken(day, hour, t.id, treatment); });
  }

  // NIF português: 9 dígitos com o dígito de controlo certo.
  function nifOk(n) {
    if (!/^\d{9}$/.test(n)) return false;
    var soma = 0; for (var i = 0; i < 8; i++) soma += +n[i] * (9 - i);
    var c = 11 - soma % 11; return (c >= 10 ? 0 : c) === +n[8];
  }

  function avatar(t, cls) {
    return '<span class="' + (cls || 'pms-avatar') + ' pms-tone-' + t.tone + '" aria-hidden="true">' + initials(t.name) + '</span>';
  }

  /* ---------- Agenda ---------- */
  function mountBooking(root, opts) {
    opts = opts || {};
    var labels = opts.labels || ['Tratamento', 'Terapeuta', 'Dia e hora', 'Confirmar'];
    var days = nextDays(12);
    var s = { step: 0, treatment: null, therapist: null, day: days[0], hour: null, done: false, name: '', email: '', phone: '', nif: '', hasVoucher: false, vcod: '' };

    function canGo(i) {
      if (i === 0) return true;
      if (i === 1) return !!s.treatment;
      if (i === 2) return !!s.treatment && !!s.therapist;
      return !!s.treatment && !!s.therapist && !!s.hour;
    }

    function stepsBar() {
      return '<ol class="bk-steps">' + labels.map(function (l, i) {
        var state = i === s.step ? ' aria-current="step"' : '';
        var dis = canGo(i) ? '' : ' disabled';
        return '<li><button type="button" class="bk-step' + (i < s.step ? ' is-done' : '') + '" data-go="' + i + '"' + state + dis + '>' +
          '<span class="bk-step__n">' + (i + 1) + '</span><span class="bk-step__l">' + esc(l) + '</span></button></li>';
      }).join('') + '</ol>';
    }

    function panelTreatment() {
      var areas = [];
      TREATMENTS.forEach(function (t) { if (areas.indexOf(t.area) < 0) areas.push(t.area); });
      var cur = s.treatment && byId(TREATMENTS, s.treatment);
      return '<div class="bk-panel"><p class="bk-q">Por onde quer começar?</p>' + areas.map(function (a, i) {
        // Cada área abre como lista suspensa (fica aberta a do tratamento escolhido)
        var open = !!(s.openAreas && s.openAreas[a]) || !!(cur && cur.area === a);
        return '<div class="bk-group' + (open ? ' is-open' : '') + '"><button type="button" class="bk-group__t" data-area="' + esc(a) + '" aria-expanded="' + open + '" aria-controls="bk-area-' + i + '">' + esc(a) + '<span class="bk-group__n">' + TREATMENTS.filter(function (t) { return t.area === a; }).length + '</span>' + (AREA_TEXT[a] ? '<span class="bk-group__d">- ' + esc(AREA_TEXT[a]) + '</span>' : '') + '</button><div class="bk-options bk-options--list" id="bk-area-' + i + '">' +
          TREATMENTS.filter(function (t) { return t.area === a; }).map(function (t) {
            return '<button type="button" class="bk-option bk-option--row" data-treat="' + t.id + '" aria-pressed="' + (s.treatment === t.id) + '">' +
              '<span class="bk-option__title">' + esc(t.name) + (t.camp ? ' <span class="bk-camp">Em campanha</span>' : '') + '</span>' +
              '<span class="bk-option__meta"><span>' + t.min + ' min</span><span class="bk-option__price' + (t.camp ? ' is-camp' : '') + '">' + eur(t.price) +
              (t.oldPrice ? '<s><span class="sr-only">Preço normal </span>' + eur(t.oldPrice) + '</s>' : '') + '</span></span></button>';
          }).join('') + '</div></div>';
      }).join('') + '</div>';
    }

    function panelTherapist() {
      var tr = byId(TREATMENTS, s.treatment);
      var list = TEAM.filter(function (t) { return t.does.indexOf(s.treatment) > -1; });
      return '<div class="bk-panel"><p class="bk-q">Com quem se sente melhor? <span class="bk-q__sub">' + esc(tr.name) + '</span></p><div class="bk-options bk-options--team">' +
        '<button type="button" class="bk-option bk-option--any" data-ther="any" aria-pressed="' + (s.therapist === 'any') + '">' +
        '<span class="pms-avatar pms-tone-0" aria-hidden="true">✦</span><span class="bk-option__title">Sem preferência</span>' +
        '<span class="bk-option__text">Mostramos todas as horas livres e escolhemos por si quem estiver disponível.</span></button>' +
        list.map(function (t) {
          return '<button type="button" class="bk-option bk-option--person" data-ther="' + t.id + '" aria-pressed="' + (s.therapist === t.id) + '">' +
            avatar(t) + '<span class="bk-option__title">' + esc(t.name) + '</span>' +
            '<span class="bk-option__role">' + esc(t.role) + ' · ' + esc(t.focus) + '</span>' +
            '<span class="bk-option__text">' + esc(t.bio) + '</span></button>';
        }).join('') + '</div></div>';
    }

    function slotFree(day, h) {
      if (s.therapist === 'any') return freeFor(day, h, s.treatment).length > 0;
      return !isTaken(day, h, s.therapist, s.treatment);
    }

    function agendaNote() {
      var a = AGENDA[s.treatment];
      if (a && a.loading) return 'A ver as horas livres…';
      if (a && a.fonte === 'zoho') return 'Horas livres neste momento. Encerra ao domingo.';
      return 'Horários ilustrativos. Encerra ao domingo.';
    }

    function panelTime() {
      var html = '<div class="bk-panel"><p class="bk-q">Quando lhe faz sentido parar?</p><div class="bk-days" role="listbox" aria-label="Dia">';
      html += days.map(function (d, i) {
        var sel = dayKey(d) === dayKey(s.day);
        var any = HOURS.some(function (h) { return slotFree(d, h); });
        return '<button type="button" class="bk-day" data-day="' + i + '" aria-pressed="' + sel + '"' + (any ? '' : ' disabled') + '>' +
          '<span class="bk-day__w">' + WEEKDAYS[d.getDay()] + '</span><span class="bk-day__n">' + d.getDate() + '</span><span class="bk-day__m">' + MONTHS[d.getMonth()] + '</span></button>';
      }).join('');
      html += '</div><div class="bk-slots">' + HOURS.map(function (h) {
        var free = slotFree(s.day, h);
        return '<button type="button" class="bk-slot" data-hour="' + h + '" aria-pressed="' + (s.hour === h) + '"' + (free ? '' : ' disabled') + '>' + h + '</button>';
      }).join('') + '</div><p class="bk-note">' + agendaNote() + '</p></div>';
      return html;
    }

    function chosenTherapist() {
      if (s.therapist !== 'any') return byId(TEAM, s.therapist);
      var f = freeFor(s.day, s.hour, s.treatment); return f[0] || null;
    }

    // Total com o código do voucher ou VIP já validado no servidor (/api/preco); sem código, o preço do tratamento.
    function total() { return s.conta ? s.conta.total : byId(TREATMENTS, s.treatment).price; }
    function applyCode(focus) {
      var code = s.vcod.trim();
      s.conta = null; s.vmsg = '';
      if (!code || !window.OMS_PAGAR) { render(); return; }
      OMS_PAGAR.preco({ tipo: 'marcacao', tratamento: s.treatment, codigo: code }).then(function (c) {
        s.conta = c; s.vmsg = c.total === 0 ? c.codigo.texto + ' aplicado: não há nada a pagar.' : c.codigo.texto + ' aplicado.';
      }, function (e) { s.vmsg = e.message; }).then(function () {
        render();
        var i = focus && root.querySelector('#bk-vcod'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
      });
    }

    function panelConfirm() {
      var tr = byId(TREATMENTS, s.treatment), th = chosenTherapist();
      return '<div class="bk-panel bk-panel--confirm"><div class="bk-summary">' +
        '<p class="bk-summary__eyebrow">A sua marcação</p>' +
        '<p class="bk-summary__title">' + esc(tr.name) + '</p>' +
        '<dl class="bk-summary__list">' +
        '<div><dt>Terapeuta</dt><dd>' + esc(th ? th.name : '') + (s.therapist === 'any' ? ' <small>(atribuída)</small>' : '') + '</dd></div>' +
        '<div><dt>Dia</dt><dd>' + longDate(s.day) + '</dd></div>' +
        '<div><dt>Hora</dt><dd>' + s.hour + ' · ' + tr.min + ' min</dd></div>' +
        (s.conta && s.conta.desconto ? '<div><dt>Preço</dt><dd>' + eur(s.conta.precoBase) + '</dd></div><div><dt>' + esc(s.conta.codigo.texto) + '</dt><dd>−' + eur(s.conta.desconto) + '</dd></div>' : '') +
        '<div class="bk-summary__total"><dt>Total</dt><dd>' + eur(total()) + '</dd></div></dl></div>' +
        '<form class="bk-form" novalidate>' +
        '<label class="field"><span>Nome</span><input id="bk-name" autocomplete="name" value="' + esc(s.name) + '" required></label>' +
        '<label class="field"><span>Email</span><input id="bk-email" type="email" autocomplete="email" value="' + esc(s.email) + '" required></label>' +
        '<label class="field"><span>Telemóvel</span><input id="bk-phone" type="tel" autocomplete="tel" value="' + esc(s.phone) + '" required></label>' +
        '<label class="field"><span>NIF para a fatura (opcional)</span><input id="bk-nif" inputmode="numeric" maxlength="9" value="' + esc(s.nif) + '"></label>' +
        '<label class="field field--check"><input id="bk-voucher" type="checkbox"' + (s.hasVoucher ? ' checked' : '') + '><span>Tenho um voucher para usar</span></label>' +
        (s.hasVoucher ? '<div class="pg-codigo"><label class="field"><span>Código do voucher ou VIP</span><input id="bk-vcod" autocomplete="off" autocapitalize="characters" placeholder="OMS-XXXX-XXXX" value="' + esc(s.vcod) + '"></label>' +
          '<button type="button" class="btn btn--ghost" data-vapply>Aplicar</button></div>' +
          (s.vmsg ? '<p class="' + (s.conta ? 'bk-note' : 'bk-error') + '" role="status">' + esc(s.vmsg) + '</p>' : '') : '') +
        '<p class="bk-error" role="alert" hidden>Indique o seu nome, um email válido e o telemóvel para recebermos a marcação. O NIF, se o indicar, tem 9 dígitos.</p>' +
        '<button type="submit" class="btn btn--primary"' + (s.sending ? ' disabled' : '') + '>' + (s.sending ? 'Um momento…' : total() === 0 ? 'Confirmar marcação' : 'Confirmar e pagar ' + eur(total())) + '</button>' +
        '<p class="bk-note">Pode cancelar ou alterar sem custos até 24 horas antes.</p></form></div>';
    }

    function panelDone() {
      var tr = byId(TREATMENTS, s.treatment), th = chosenTherapist();
      return '<div class="bk-panel bk-done"><p class="bk-done__mark" aria-hidden="true">✦</p>' +
        '<p class="bk-done__title">Está marcado, ' + esc(s.name.split(' ')[0]) + '.</p>' +
        '<p class="bk-done__text">' + esc(tr.name) + ' com ' + esc(th.name) + ', ' + longDate(s.day) + ' às ' + s.hour + '. ' +
        'Chegue dez a quinze minutos antes: o chá fica à sua espera.</p>' +
        '<p class="bk-note">Protótipo: nenhuma marcação foi enviada.</p>' +
        '<button type="button" class="btn btn--ghost" data-reset>Fazer outra marcação</button></div>';
    }

    function render() {
      var body = s.done ? panelDone() : [panelTreatment, panelTherapist, panelTime, panelConfirm][s.step]();
      var nav = '';
      if (!s.done && s.step < 3) {
        nav = '<div class="bk-actions">' +
          (s.step > 0 ? '<button type="button" class="btn btn--ghost" data-go="' + (s.step - 1) + '">Voltar</button>' : '<span></span>') +
          '<button type="button" class="btn btn--primary" data-go="' + (s.step + 1) + '"' + (canGo(s.step + 1) ? '' : ' disabled') + '>Continuar</button></div>';
      } else if (!s.done) {
        nav = '<div class="bk-actions"><button type="button" class="btn btn--ghost" data-go="2">Voltar</button><span></span></div>';
      }
      root.innerHTML = '<div class="bk">' + (s.done ? '' : stepsBar()) + body + nav + '</div>';
      if (s.treatment) loadAgenda(s.treatment, days, function (t) { if (s.treatment === t && !s.done && s.step === 2) render(); });
    }

    root.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b || b.disabled) return;
      if (b.hasAttribute('data-area')) {
        var g = b.parentNode, on = !g.classList.contains('is-open');
        g.classList.toggle('is-open', on); b.setAttribute('aria-expanded', on);
        s.openAreas = s.openAreas || {}; s.openAreas[b.getAttribute('data-area')] = on; return;
      }
      if (b.hasAttribute('data-vapply')) { applyCode(true); return; }
      if (b.hasAttribute('data-go')) { s.step = +b.getAttribute('data-go'); render(); return; }
      if (b.hasAttribute('data-treat')) {
        s.treatment = b.getAttribute('data-treat');
        if (s.therapist && s.therapist !== 'any' && byId(TEAM, s.therapist).does.indexOf(s.treatment) < 0) s.therapist = null;
        s.hour = null; s.step = 1; render(); return;
      }
      if (b.hasAttribute('data-ther')) { s.therapist = b.getAttribute('data-ther'); s.hour = null; s.step = 2; render(); return; }
      if (b.hasAttribute('data-day')) { s.day = days[+b.getAttribute('data-day')]; s.hour = null; render(); return; }
      if (b.hasAttribute('data-hour')) { s.hour = b.getAttribute('data-hour'); s.step = 3; render(); return; }
      if (b.hasAttribute('data-reset')) { s = { step: 0, treatment: null, therapist: null, day: days[0], hour: null, done: false, name: '', email: '', phone: '', nif: '', hasVoucher: false, vcod: '' }; render(); }
    });
    root.addEventListener('input', function (e) {
      if (e.target.id === 'bk-name') s.name = e.target.value;
      if (e.target.id === 'bk-email') s.email = e.target.value;
      if (e.target.id === 'bk-phone') s.phone = e.target.value;
      if (e.target.id === 'bk-nif') s.nif = e.target.value.replace(/\D/g, '');
      if (e.target.id === 'bk-vcod') { s.vcod = e.target.value; if (s.conta) { s.conta = null; s.vmsg = ''; } }
    });
    // «Tenho um voucher para usar» mostra o campo para o código.
    root.addEventListener('change', function (e) {
      if (e.target.id !== 'bk-voucher') return;
      s.hasVoucher = e.target.checked;
      if (!s.hasVoucher) { s.conta = null; s.vmsg = ''; }
      render();
      var c = root.querySelector(s.hasVoucher ? '#bk-vcod' : '#bk-voucher'); if (c) c.focus();
    });
    root.addEventListener('submit', function (e) {
      e.preventDefault();
      var ok = s.name.trim() && /.+@.+\..+/.test(s.email) && s.phone.replace(/\D/g, '').length >= 9 && (!s.nif || nifOk(s.nif));
      if (!ok) { root.querySelector('.bk-error').hidden = false; return; }
      // Pagamento (public/pagar.js): código, meio de pagamento e confirmação no servidor
      if (window.OMS_PAGAR) {
        var tr = byId(TREATMENTS, s.treatment), th = chosenTherapist(), d = s.day;
        var iso = isoDay(d);
        var dados = { tipo: 'marcacao', tratamento: tr.id, nomeTratamento: tr.name, terapeuta: th ? th.name : '', terapeutaId: th ? th.id : '', qualquer: s.therapist === 'any', data: iso, hora: s.hour,
          marcacao: longDate(d) + ', ' + s.hour, nome: s.name, email: s.email, telefone: s.phone, nif: s.nif, codigo: s.conta ? s.vcod.trim() : '' };
        // Código por validar: valida primeiro. Voucher ou VIP que deixa a 0 €: confirma logo, sem passo de pagamento.
        if (s.hasVoucher && s.vcod.trim() && !s.conta) { applyCode(false); return; }
        if (s.conta && s.conta.total === 0) {
          s.sending = true; render();
          OMS_PAGAR.enviar(root, dados).catch(function (err) { s.sending = false; s.conta = null; s.vmsg = err.message; render(); });
          return;
        }
        OMS_PAGAR.abrir(root, dados, { voltar: render });
        return;
      }
      s.done = true; render();
    });

    // Permite que outros pontos da página abram a agenda com um tratamento ou terapeuta já escolhido.
    function preset(p) {
      if (p.treatment) { s.treatment = p.treatment; s.step = 1; }
      if (p.therapist) {
        var t = byId(TEAM, p.therapist);
        s.therapist = p.therapist;
        if (!s.treatment || t.does.indexOf(s.treatment) < 0) s.treatment = t.does[0];
        s.step = 2;
      }
      s.hour = null; s.done = false; render();
    }
    render();
    return { preset: preset };
  }

  /* ---------- Vouchers ---------- */
  function mountVoucher(root, opts) {
    opts = opts || {};
    // Vouchers de campanha em vigor (Black Week, Natal…) aparecem primeiro, com o preço de campanha
    var CAMPS = DATA.campaignVouchers || [];
    var LIST = CAMPS.concat(TREATMENTS);
    var first = CAMPS.length ? CAMPS[0].id : byId(TREATMENTS, 'oil') ? 'oil' : TREATMENTS[0].id;
    var v = { exp: first, format: 'digital', to: '', from: '', msg: '' };
    var S = DATA.spa || {};
    function cur() { return byId(LIST, v.exp) || TREATMENTS[0]; }

    function value() { return cur().price; }
    function total() { return value(); } // a caixa oferta não tem custo extra
    // Válido até ao último dia do mês, daqui a 12 meses
    function validUntil() {
      var d = new Date(), end = new Date(d.getFullYear() + 1, d.getMonth() + 1, 0);
      return end.getDate() + ' de ' + ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'][end.getMonth()] + ' de ' + end.getFullYear();
    }

    function card() {
      var t = cur();
      return '<div class="vc-card' + (v.format === 'caixa' ? ' vc-card--box' : '') + '" aria-live="polite">' +
        '<img class="vc-card__logo" src="logo-brown.svg" alt="Oporto Medical Spa" width="140" height="258">' +
        '<div class="vc-card__top"><span class="vc-card__kind">Voucher oferta</span></div>' +
        (t.camp ? '<p class="vc-card__camp">' + esc(t.label) + '</p>' : '') + '<p class="vc-card__name">' + esc(t.name) + '</p>' +
        '<p class="vc-card__desc">' + esc(t.text || '') + (t.min ? ' (Reserve ' + t.min + ' min.)' : '') + '</p>' +
        '<p class="vc-card__msg">' + (v.msg ? '“' + esc(v.msg) + '”' : 'A sua mensagem aparece aqui.') + '</p>' +
        '<div class="vc-card__foot"><span>Para ' + esc(v.to || '…') + '</span><span>De ' + esc(v.from || '…') + '</span></div>' +
        '<p class="vc-card__info">Válido até ' + validUntil() + '.' + (S.telefone ? '<br>' + esc(S.telefone) : '') + '</p></div>';
    }

    function form() {
      var t = cur();
      return '<div class="vc-form">' +
        '<div class="vc-row"><label class="vc-label" for="vc-exp">Massagem ou ritual a oferecer</label><select id="vc-exp" class="vc-select">' + (CAMPS.length ? '<optgroup label="Campanhas">' + CAMPS.map(function (x) {
          return '<option value="' + x.id + '"' + (v.exp === x.id ? ' selected' : '') + '>' + esc(x.label) + ' · ' + esc(x.name) + ' ' + x.min + ' min · ' + eur(x.price) + (x.oldPrice ? ' (em vez de ' + eur(x.oldPrice) + ')' : '') + '</option>';
        }).join('') + '</optgroup><optgroup label="Massagens e tratamentos">' : '') + TREATMENTS.map(function (x) {
          return '<option value="' + x.id + '"' + (v.exp === x.id ? ' selected' : '') + '>' + esc(x.name) + ' · ' + eur(x.price) + '</option>';
        }).join('') + (CAMPS.length ? '</optgroup>' : '') + '</select><p class="vc-desc">' + esc(t.text || '') + '</p></div>' +
        '<div class="vc-row"><p class="vc-label">Entrega</p><div class="vc-seg" role="group">' +
        '<button type="button" data-format="digital" aria-pressed="' + (v.format === 'digital') + '">Digital, por email</button>' +
        '<button type="button" data-format="caixa" aria-pressed="' + (v.format === 'caixa') + '">Caixa oferta, no SPA</button></div></div>' +
        '<div class="vc-row vc-row--two"><label class="field"><span>Para</span><input id="vc-to" value="' + esc(v.to) + '" placeholder="Nome de quem recebe"></label>' +
        '<label class="field"><span>De</span><input id="vc-from" value="' + esc(v.from) + '" placeholder="O seu nome"></label></div>' +
        '<label class="field"><span>Mensagem</span><textarea id="vc-msg" rows="3" maxlength="140" placeholder="Para te lembrares de parar.">' + esc(v.msg) + '</textarea></label>' +
        '<div class="vc-buy"><p class="vc-total">Total <strong>' + eur(total()) + '</strong>' + (t.oldPrice ? ' <s>' + eur(t.oldPrice) + '</s>' : '') + '</p>' +
        '<button type="button" class="btn btn--primary" data-buy>Oferecer este voucher</button></div>' +
        '<p class="bk-note" data-bought hidden>Adicionado ao carrinho. Protótipo: nada foi cobrado.</p>' +
        '<p class="bk-note">Válido até ' + validUntil() + '. O número do voucher segue no email enviado com o voucher. ' + (v.format === 'digital' ? 'Enviado para o seu email logo após o pagamento.' : 'A caixa oferta, sem custo extra, fica à sua espera no SPA para levantar.') + '</p></div>';
    }

    function render(keepFocus) {
      var f = document.activeElement && document.activeElement.id;
      var pos = f && document.activeElement.selectionStart;
      root.innerHTML = '<div class="vc">' + form() + '<div class="vc-preview">' + card() + '</div></div>';
      if (keepFocus && f) { var el = document.getElementById(f); if (el) { el.focus(); try { el.setSelectionRange(pos, pos); } catch (e) {} } }
    }
    function soft() { // atualiza só o cartão e o total, sem refazer o formulário
      root.querySelector('.vc-preview').innerHTML = card();
      root.querySelector('.vc-total').innerHTML = 'Total <strong>' + eur(total()) + '</strong>' + (cur().oldPrice ? ' <s>' + eur(cur().oldPrice) + '</s>' : '');
      var d = root.querySelector('.vc-desc'); if (d) d.textContent = cur().text || '';
    }

    root.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.dataset.format) { v.format = b.dataset.format; render(); }
      else if (b.hasAttribute('data-buy')) {
        // Pagamento (public/pagar.js): o voucher é sempre de um tratamento; o código segue só por email
        if (window.OMS_PAGAR && v.mode !== 'valor') {
          var tr = cur();
          OMS_PAGAR.abrir(root, { tipo: 'voucher', tratamento: tr.treatment || tr.id, campanha: tr.camp || '', nomeTratamento: tr.name + (tr.camp ? ' · ' + tr.min + ' min' : ''), para: v.to, de: v.from, mensagem: v.msg, formato: v.format }, { voltar: render, semCodigo: !!tr.camp });
          return;
        }
        root.querySelector('[data-bought]').hidden = false;
        if (opts.onBuy) opts.onBuy(total());
      }
    });
    root.addEventListener('input', function (e) {
      var id = e.target.id;
      if (id === 'vc-to') v.to = e.target.value;
      else if (id === 'vc-from') v.from = e.target.value;
      else if (id === 'vc-msg') v.msg = e.target.value;
      else return;
      soft();
    });
    root.addEventListener('change', function (e) { if (e.target.id === 'vc-exp') { v.exp = e.target.value; soft(); } });
    render();
    return { preset: function (id) { if (byId(LIST, id)) { v.exp = id; render(); } } };
  }

  /* ---------- Equipa ---------- */
  function mountTeam(root, opts) {
    opts = opts || {};
    root.innerHTML = '<div class="tm">' + TEAM.map(function (t) {
      return '<article class="tm-card">' + '<div class="tm-card__photo pms-tone-' + t.tone + '"><span>' + initials(t.name) + '</span><small>fotografia</small></div>' +
        '<p class="tm-card__role">' + esc(t.role) + '</p><h3 class="tm-card__name">' + esc(t.name) + '</h3>' +
        '<p class="tm-card__focus">' + esc(t.focus) + '</p><p class="tm-card__bio">' + esc(t.bio) + '</p>' +
        '<button type="button" class="tm-card__cta" data-book-with="' + t.id + '">Marcar com ' + esc(t.name.split(' ')[0]) + '</button></article>';
    }).join('') + '</div>';
    root.addEventListener('click', function (e) {
      var b = e.target.closest('[data-book-with]'); if (b && opts.onBook) opts.onBook(b.getAttribute('data-book-with'));
    });
  }

  /* ---------- Guia "Comece a sua jornada" ---------- */
  function mountGuide(root, opts) {
    opts = opts || {};
    var Q = [
      { q: 'O que o traz até nós?', a: [['dor', 'Uma dor ou lesão que não passa'], ['tensao', 'Cansaço e tensão acumulada'], ['corpo', 'Quero fortalecer o corpo'], ['oferta', 'Quero oferecer a alguém']] },
      { q: 'Como gostaria de se sentir à saída?', a: [['leve', 'Mais leve'], ['forte', 'Mais forte'], ['calma', 'Em paz'], ['livre', 'Sem dor']] }
    ];
    var REC = {
      dor: { t: 'fisio', path: 'Fisioterapia e Reabilitação', why: 'Começamos por uma avaliação com fisioterapeuta e desenhamos um plano para que a dor não volte.' },
      tensao: { t: 'oil', path: 'Relaxamento', why: 'Uma hora de Oil & Candle para baixar o ritmo e devolver o corpo ao seu lugar.' },
      corpo: { t: 'pilates', path: 'Pilates Clínico', why: 'Sessões individuais com fisioterapeuta para uma coluna forte e um corpo consciente.' },
      oferta: { t: null, path: 'Vouchers oferta', why: 'Escolha um valor ou uma experiência e nós tratamos do resto, em digital ou numa caixa.' }
    };
    var g = { i: 0, ans: [] };
    function render() {
      if (g.i < Q.length) {
        var q = Q[g.i];
        root.innerHTML = '<div class="gd"><p class="gd__count">Pergunta ' + (g.i + 1) + ' de ' + Q.length + '</p><p class="gd__q">' + q.q + '</p><div class="gd__a">' +
          q.a.map(function (a) { return '<button type="button" data-a="' + a[0] + '">' + a[1] + '</button>'; }).join('') + '</div></div>';
      } else {
        var r = REC[g.ans[0]];
        root.innerHTML = '<div class="gd gd--res"><p class="gd__count">O nosso conselho</p><p class="gd__q">' + r.path + '</p><p class="gd__why">' + r.why + '</p>' +
          '<div class="gd__go"><button type="button" class="btn btn--primary" data-rec="' + (r.t || 'voucher') + '">' + (r.t ? 'Ver horários' : 'Escolher voucher') + '</button>' +
          '<button type="button" class="btn btn--ghost" data-restart>Recomeçar</button></div></div>';
      }
    }
    root.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.dataset.a) { g.ans.push(b.dataset.a); g.i++; render(); }
      else if (b.hasAttribute('data-restart')) { g = { i: 0, ans: [] }; render(); }
      else if (b.dataset.rec && opts.onPick) opts.onPick(b.dataset.rec === 'voucher' ? null : b.dataset.rec);
    });
    render();
  }

  window.PMS = { TREATMENTS: TREATMENTS, TEAM: TEAM, mountBooking: mountBooking, mountVoucher: mountVoucher, mountTeam: mountTeam, mountGuide: mountGuide, eur: eur };
})();
