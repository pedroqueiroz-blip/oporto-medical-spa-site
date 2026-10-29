/* Oporto Medical Spa: passo de pagamento das marcações e dos vouchers.
   OMS_PAGAR.abrir(root, pedido, { voltar }) mostra o resumo, o código (VIP, 10% da newsletter ou voucher),
   o NIF e o meio de pagamento (MB WAY, Multibanco, cartão). O valor é sempre calculado no servidor (/api).
   Na página /pagamento/ (regresso do cartão), OMS_PAGAR.estado(root, numero, token) mostra como ficou. */
(function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  // Páginas em inglês (/en/): textos, preços (€35) e datas em inglês; o servidor responde na mesma língua.
  var EN = (document.documentElement.lang || '').slice(0, 2) === 'en';
  function L(pt, en) { return EN ? en : pt; }
  function eur(n) {
    n = Number(n);
    if (EN) return '€' + n.toLocaleString('en-GB', n % 1 ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : {});
    return n.toLocaleString('pt-PT', n % 1 ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : {}) + ' €';
  }
  var MESES = EN ? ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
    : ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  function dataPT(iso) { var p = String(iso).split('-'); return +p[2] + L(' de ', ' ') + MESES[+p[1] - 1]; }

  function api(rota, dados) {
    if (EN) rota += (rota.indexOf('?') < 0 ? '?' : '&') + 'lingua=en';
    return fetch('/api' + rota, dados ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados) } : {})
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.erro || L('Ocorreu um erro. Tente de novo.', 'Something went wrong. Please try again.')); return j; }); });
  }

  /* Resultado final: marcação confirmada ou voucher pago. */
  function feito(root, p) {
    var voucher = p.tipo === 'voucher';
    root.innerHTML = '<div class="bk-panel bk-done"><p class="bk-done__mark" aria-hidden="true">✦</p>' +
      '<p class="bk-done__title">' + (voucher ? L('Obrigado. O voucher vai a caminho.', 'Thank you. Your voucher is on its way.') : L('Está marcado.', 'You’re booked.')) + '</p>' +
      '<p class="bk-done__text">' + (voucher
        ? L('Enviámos o voucher ' + esc(p.tratamento) + ', com o código para marcar, para o seu email.', 'We’ve emailed you the ' + esc(p.tratamento) + ' voucher, with the code to book.')
        : esc(p.tratamento) + (p.marcacao ? ', ' + dataPT(p.marcacao.data) + L(' às ', ' at ') + esc(p.marcacao.hora) : '') + L('. Enviámos a confirmação para o seu email. Chegue dez a quinze minutos antes: o chá fica à sua espera.', '. We’ve emailed you the confirmation. Please arrive ten to fifteen minutes early: your tea will be waiting.')) + '</p>' +
      (p.calendario ? '<div class="bk-cal">' +
        (p.calendario.google ? '<a class="btn btn--primary" href="' + esc(p.calendario.google) + '" target="_blank" rel="noopener">' + L('Adicionar ao Google Calendar', 'Add to Google Calendar') + '</a>' : '') +
        '<a class="btn btn--ghost" href="' + esc(p.calendario.ics) + '" download>' + L('Calendário do iPhone ou Outlook', 'iPhone or Outlook calendar') + '</a></div>' : '') +
      (p.total > 0 ? '<p class="bk-note">' + L('A fatura-recibo segue num email à parte.', 'Your invoice-receipt will follow in a separate email (in Portuguese).') + '</p>' : '') + '</div>';
  }

  function multibanco(root, p) {
    var mb = p.multibanco;
    root.innerHTML = '<div class="bk-panel"><p class="bk-q">' + L('Falta só o pagamento', 'Just the payment to go') + '</p><div class="bk-summary"><dl class="bk-summary__list">' +
      '<div><dt>' + L('Entidade', 'Entity') + '</dt><dd>' + esc(mb.entidade) + '</dd></div>' +
      '<div><dt>' + L('Referência', 'Reference') + '</dt><dd>' + esc(String(mb.referencia).replace(/(\d{3})(?=\d)/g, '$1 ')) + '</dd></div>' +
      '<div class="bk-summary__total"><dt>' + L('Valor', 'Amount') + '</dt><dd>' + eur(p.total) + '</dd></div>' +
      '<div><dt>' + L('Pagar até', 'Pay by') + '</dt><dd>' + dataPT(mb.validade.slice(0, 10)) + '</dd></div></dl></div>' +
      '<p class="bk-note">' + L('Enviámos estes dados para o seu email. ' + (p.tipo === 'voucher' ? 'O voucher segue' : 'A marcação fica confirmada') + ' assim que o pagamento chegar.',
        'We’ve emailed you these details. ' + (p.tipo === 'voucher' ? 'Your voucher will be sent' : 'Your booking will be confirmed') + ' as soon as the payment arrives.') + '</p></div>';
  }

  /* MB WAY e regresso do cartão: pergunta ao servidor até o pagamento chegar. */
  function esperar(root, numero, token, p) {
    root.innerHTML = '<div class="bk-panel"><p class="bk-q">' + (p.metodo === 'mb_way' ? L('Aceite o pagamento na app MB WAY', 'Accept the payment in the MB WAY app') : L('A confirmar o pagamento', 'Confirming your payment')) + '</p>' +
      '<p class="bk-note" role="status">' + (p.metodo === 'mb_way' ? L('Enviámos um pedido de ' + eur(p.total) + ' para o ' + esc(p.telemovel || 'seu telemóvel') + '. Tem 5 minutos para o aceitar.', 'We’ve sent a request for ' + eur(p.total) + ' to ' + esc(p.telemovel || 'your mobile') + '. You have 5 minutes to accept it.') : L('Só um momento.', 'Just a moment.')) + '</p></div>';
    var inicio = Date.now();
    (function volta() {
      api('/pedido?n=' + encodeURIComponent(numero) + '&t=' + encodeURIComponent(token)).then(function (q) {
        if (q.estado === 'pago' || q.estado === 'confirmado') return feito(root, q);
        if (Date.now() - inicio > 6 * 60000) {
          root.querySelector('.bk-note').textContent = L('Ainda não recebemos o pagamento. Se já pagou, a confirmação segue por email; se não, volte a tentar.', 'We haven’t received the payment yet. If you have paid, the confirmation will follow by email; if not, please try again.');
          return;
        }
        setTimeout(volta, 3000);
      }).catch(function () { setTimeout(volta, 5000); });
    })();
  }

  /* Um só conjunto de ouvintes por elemento; só atuam enquanto o passo de pagamento está à vista. */
  function ligar(root) {
    if (root._pgLigado) return;
    root._pgLigado = true;
    ['input', 'click', 'submit'].forEach(function (tipo) {
      root.addEventListener(tipo, function (e) { if (root._pg && root.querySelector('.pg')) root._pg[tipo](e); }, true);
    });
  }

  function abrir(root, pedido, opts) {
    opts = opts || {};
    var st = { codigo: pedido.codigo || '', conta: null, metodo: 'mb_way', telemovel: pedido.telefone || '', nif: pedido.nif || '', nome: pedido.nome || '', email: pedido.email || '', telefone: pedido.telefone || '', aEnviar: false };
    var pedeDados = !(pedido.nome && pedido.email);

    function total() { return st.conta ? st.conta.total : null; }
    function render(erro) {
      var t = total(), gratis = t === 0;
      root.innerHTML = '<div class="bk-panel bk-panel--confirm pg"><div class="bk-summary">' +
        '<p class="bk-summary__eyebrow">' + (pedido.tipo === 'voucher' ? L('Voucher oferta', 'Gift voucher') : L('A sua marcação', 'Your booking')) + '</p>' +
        '<p class="bk-summary__title">' + esc(pedido.nomeTratamento || '') + '</p><dl class="bk-summary__list">' +
        (pedido.marcacao ? '<div><dt>' + L('Quando', 'When') + '</dt><dd>' + esc(pedido.marcacao) + '</dd></div>' : '') +
        (pedido.para ? '<div><dt>' + L('Para', 'To') + '</dt><dd>' + esc(pedido.para) + '</dd></div>' : '') +
        (pedido.tipo === 'voucher' ? '<div><dt>' + L('Entrega', 'Delivery') + '</dt><dd>' + (pedido.formato === 'caixa' ? L('Caixa oferta, no SPA', 'Gift box, at the spa') : L('Digital, por email', 'Digital, by email')) + '</dd></div>' : '') +
        (st.conta && st.conta.desconto ? '<div><dt>' + L('Preço', 'Price') + '</dt><dd>' + eur(st.conta.precoBase) + '</dd></div><div><dt>' + esc(st.conta.codigo.texto) + '</dt><dd>−' + eur(st.conta.desconto) + '</dd></div>' : '') +
        '<div class="bk-summary__total"><dt>Total</dt><dd>' + (t == null ? '…' : eur(t)) + '</dd></div></dl></div>' +
        '<form class="bk-form" novalidate>' +
        (pedeDados ? '<label class="field"><span>' + L('O seu nome', 'Your name') + '</span><input id="pg-nome" autocomplete="name" value="' + esc(st.nome) + '" required></label>' +
          '<label class="field"><span>' + L('O seu email', 'Your email') + '</span><input id="pg-email" type="email" autocomplete="email" value="' + esc(st.email) + '" required></label>' : '') +
        (opts.semCodigo ? '<p class="bk-note">' + L('Preço de campanha, não acumulável com outros códigos ou descontos.', 'Offer price, cannot be combined with other codes or discounts.') + '</p>' : '<div class="pg-codigo"><label class="field"><span>' + (pedido.tipo === 'voucher' ? L('Código de desconto', 'Discount code') : L('Código de desconto ou de voucher', 'Discount or voucher code')) + '</span><input id="pg-codigo" autocomplete="off" autocapitalize="characters" value="' + esc(st.codigo) + '"></label>' +
        '<button type="button" class="btn btn--ghost" data-aplicar>' + L('Aplicar', 'Apply') + '</button></div>') +
        (gratis ? '' :
          '<div class="vc-row"><p class="vc-label">' + L('Como quer pagar', 'How would you like to pay?') + '</p><div class="vc-seg" role="group">' +
          [['mb_way', 'MB WAY'], ['multibanco', 'Multibanco'], ['card', L('Cartão', 'Card')]].filter(function (m) { return pedido.tipo !== 'marcacao' || m[0] !== 'multibanco'; }).map(function (m) {
            return '<button type="button" data-metodo="' + m[0] + '" aria-pressed="' + (st.metodo === m[0]) + '">' + m[1] + '</button>';
          }).join('') + '</div></div>' +
          (st.metodo === 'mb_way' ? '<label class="field"><span>' + L('Telemóvel MB WAY', 'MB WAY mobile number') + '</span><input id="pg-tel" type="tel" inputmode="tel" autocomplete="tel" value="' + esc(st.telemovel) + '"></label>' : '') +
          (pedido.tipo === 'marcacao' ? '' : '<label class="field"><span>' + L('NIF na fatura (opcional)', 'Tax number (NIF) for the invoice (optional)') + '</span><input id="pg-nif" inputmode="numeric" maxlength="9" value="' + esc(st.nif) + '"></label>')) +
        '<p class="bk-note pg-aceito">' + (EN ? 'By ' + (gratis ? 'confirming' : 'paying') + ', you accept the <a href="/en/terms/" target="_blank" rel="noopener">Terms and Conditions</a> and the <a href="/en/privacy/" target="_blank" rel="noopener">Privacy Policy</a>.'
          : 'Ao ' + (gratis ? 'confirmar' : 'pagar') + ', aceita os <a href="/termos/" target="_blank" rel="noopener">Termos e Condições</a> e a <a href="/privacidade/" target="_blank" rel="noopener">Política de Privacidade</a>.') + '</p>' +
        '<p class="bk-error" role="alert"' + (erro ? '' : ' hidden') + '>' + esc(erro || '') + '</p>' +
        '<button type="submit" class="btn btn--primary"' + (t == null || st.aEnviar ? ' disabled' : '') + '>' +
        (st.aEnviar ? L('Um momento…', 'One moment…') : gratis ? (pedido.tipo === 'voucher' ? L('Confirmar', 'Confirm') : L('Confirmar marcação', 'Confirm booking')) : L('Pagar ', 'Pay ') + (t == null ? '' : eur(t))) + '</button>' +
        (opts.voltar ? '<button type="button" class="btn btn--ghost" data-voltar>' + L('Voltar', 'Back') + '</button>' : '') +
        '</form></div>';
    }

    function calcular(codigo, focar) {
      return api('/preco', { tipo: pedido.tipo, tratamento: pedido.tratamento, campanha: pedido.campanha, codigo: codigo })
        .then(function (c) { st.conta = c; st.codigo = codigo; render(); })
        .catch(function (e) {
          // Código inválido: volta ao preço sem código e mostra porquê
          st.codigo = codigo;
          if (!codigo) return render(e.message);
          return api('/preco', { tipo: pedido.tipo, tratamento: pedido.tratamento, campanha: pedido.campanha }).then(function (c) { st.conta = c; }, function () {}).then(function () { render(e.message); });
        })
        .then(function () { if (focar) { var i = root.querySelector('#pg-codigo'); if (i) i.focus(); } });
    }

    var h = root._pg = {};
    h.input = function (e) {
      var id = e.target.id, v = e.target.value;
      if (id === 'pg-codigo') st.codigo = v;
      else if (id === 'pg-tel') st.telemovel = v;
      else if (id === 'pg-nif') st.nif = v.replace(/\D/g, '');
      else if (id === 'pg-nome') st.nome = v;
      else if (id === 'pg-email') st.email = v;
    };
    h.click = function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.hasAttribute('data-aplicar')) calcular(st.codigo.trim(), true);
      else if (b.dataset.metodo) { st.metodo = b.dataset.metodo; render(); }
      else if (b.hasAttribute('data-voltar')) opts.voltar();
    };
    h.submit = function (e) {
      e.preventDefault(); e.stopImmediatePropagation();
      if (!st.nome.trim() || !/.+@.+\..+/.test(st.email)) return render(L('Indique o seu nome e um email válido.', 'Please enter your name and a valid email address.'));
      st.aEnviar = true; render();
      var dados = {};
      for (var k in pedido) dados[k] = pedido[k];
      dados.nome = st.nome; dados.email = st.email; dados.telefone = st.telefone || st.telemovel;
      dados.codigo = st.codigo.trim(); dados.metodo = st.metodo; dados.telemovel = st.telemovel; dados.nif = st.nif;
      enviar(root, dados).catch(function (err) { st.aEnviar = false; render(err.message); });
    };
    ligar(root);

    render();
    calcular(st.codigo.trim(), opts.codigo);
  }

  /* Cria o pedido e segue para o resultado: cartão, MB WAY à espera, Multibanco ou já confirmado (0 €). */
  function enviar(root, dados) {
    return api('/pagamento', dados).then(function (p) {
      if (p.url) { location.href = p.url; return; }
      if (p.estado === 'confirmado' || p.estado === 'pago') return feito(root, p);
      if (p.metodo === 'multibanco') return multibanco(root, p);
      esperar(root, p.numero, p.token, p);
    });
  }

  /* Página /pagamento/: regresso do pagamento com cartão. */
  function estado(root, numero, token, falhou) {
    api('/pedido?n=' + encodeURIComponent(numero) + '&t=' + encodeURIComponent(token)).then(function (p) {
      if (p.estado === 'pago' || p.estado === 'confirmado') return feito(root, p);
      if (falhou) {
        root.innerHTML = '<div class="bk-panel"><p class="bk-q">' + L('O pagamento não foi concluído', 'The payment was not completed') + '</p><p class="bk-note">' + L('Nada foi cobrado. Pode voltar a tentar no site ou ligar-nos.', 'Nothing has been charged. You can try again on the website or call us.') + '</p><p><a class="btn btn--primary" href="' + L('/', '/en/') + '#reservar">' + L('Voltar a tentar', 'Try again') + '</a></p></div>';
        return;
      }
      if (p.metodo === 'multibanco' && p.multibanco) return multibanco(root, p);
      esperar(root, numero, token, p);
    }).catch(function (e) { root.innerHTML = '<div class="bk-panel"><p class="bk-note">' + esc(e.message) + '</p></div>'; });
  }

  window.OMS_PAGAR = { abrir: abrir, enviar: enviar, preco: function (dados) { return api('/preco', dados); }, estado: estado };

  var pg = document.getElementById('pagamento-estado');
  if (pg) {
    var q = new URLSearchParams(location.search);
    estado(pg, q.get('n'), q.get('t'), q.get('falhou'));
  }
})();
