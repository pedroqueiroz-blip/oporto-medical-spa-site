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
  function eur(n) { n = Number(n); return n.toLocaleString('pt-PT', n % 1 ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : {}) + ' €'; }
  var MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  function dataPT(iso) { var p = String(iso).split('-'); return +p[2] + ' de ' + MESES[+p[1] - 1]; }

  function api(rota, dados) {
    return fetch('/api' + rota, dados ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados) } : {})
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.erro || 'Ocorreu um erro. Tente de novo.'); return j; }); });
  }

  /* Resultado final: marcação confirmada ou voucher pago. */
  function feito(root, p) {
    var voucher = p.tipo === 'voucher';
    root.innerHTML = '<div class="bk-panel bk-done"><p class="bk-done__mark" aria-hidden="true">✦</p>' +
      '<p class="bk-done__title">' + (voucher ? 'Obrigado. O voucher vai a caminho.' : 'Está marcado.') + '</p>' +
      '<p class="bk-done__text">' + (voucher
        ? 'Enviámos o voucher ' + esc(p.tratamento) + ', com o código para marcar, para o seu email.'
        : esc(p.tratamento) + (p.marcacao ? ', ' + dataPT(p.marcacao.data) + ' às ' + esc(p.marcacao.hora) : '') + '. Enviámos a confirmação para o seu email. Chegue dez a quinze minutos antes: o chá fica à sua espera.') + '</p>' +
      (p.total > 0 ? '<p class="bk-note">A fatura-recibo segue num email à parte.</p>' : '') + '</div>';
  }

  function multibanco(root, p) {
    var mb = p.multibanco;
    root.innerHTML = '<div class="bk-panel"><p class="bk-q">Falta só o pagamento</p><div class="bk-summary"><dl class="bk-summary__list">' +
      '<div><dt>Entidade</dt><dd>' + esc(mb.entidade) + '</dd></div>' +
      '<div><dt>Referência</dt><dd>' + esc(String(mb.referencia).replace(/(\d{3})(?=\d)/g, '$1 ')) + '</dd></div>' +
      '<div class="bk-summary__total"><dt>Valor</dt><dd>' + eur(p.total) + '</dd></div>' +
      '<div><dt>Pagar até</dt><dd>' + dataPT(mb.validade.slice(0, 10)) + '</dd></div></dl></div>' +
      '<p class="bk-note">Enviámos estes dados para o seu email. ' + (p.tipo === 'voucher' ? 'O voucher segue' : 'A marcação fica confirmada') + ' assim que o pagamento chegar.</p></div>';
  }

  /* MB WAY e regresso do cartão: pergunta ao servidor até o pagamento chegar. */
  function esperar(root, numero, token, p) {
    root.innerHTML = '<div class="bk-panel"><p class="bk-q">' + (p.metodo === 'mb_way' ? 'Aceite o pagamento na app MB WAY' : 'A confirmar o pagamento') + '</p>' +
      '<p class="bk-note" role="status">' + (p.metodo === 'mb_way' ? 'Enviámos um pedido de ' + eur(p.total) + ' para o ' + esc(p.telemovel || 'seu telemóvel') + '. Tem 5 minutos para o aceitar.' : 'Só um momento.') + '</p></div>';
    var inicio = Date.now();
    (function volta() {
      api('/pedido?n=' + encodeURIComponent(numero) + '&t=' + encodeURIComponent(token)).then(function (q) {
        if (q.estado === 'pago' || q.estado === 'confirmado') return feito(root, q);
        if (Date.now() - inicio > 6 * 60000) {
          root.querySelector('.bk-note').textContent = 'Ainda não recebemos o pagamento. Se já pagou, a confirmação segue por email; se não, volte a tentar.';
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
    var st = { codigo: pedido.codigo || '', conta: null, metodo: 'mb_way', telemovel: pedido.telefone || '', nif: '', nome: pedido.nome || '', email: pedido.email || '', telefone: pedido.telefone || '', aEnviar: false };
    var pedeDados = !(pedido.nome && pedido.email);

    function total() { return st.conta ? st.conta.total : null; }
    function render(erro) {
      var t = total(), gratis = t === 0;
      root.innerHTML = '<div class="bk-panel bk-panel--confirm pg"><div class="bk-summary">' +
        '<p class="bk-summary__eyebrow">' + (pedido.tipo === 'voucher' ? 'Voucher oferta' : 'A sua marcação') + '</p>' +
        '<p class="bk-summary__title">' + esc(pedido.nomeTratamento || '') + '</p><dl class="bk-summary__list">' +
        (pedido.marcacao ? '<div><dt>Quando</dt><dd>' + esc(pedido.marcacao) + '</dd></div>' : '') +
        (pedido.para ? '<div><dt>Para</dt><dd>' + esc(pedido.para) + '</dd></div>' : '') +
        (st.conta && st.conta.desconto ? '<div><dt>Preço</dt><dd>' + eur(st.conta.precoBase) + '</dd></div><div><dt>' + esc(st.conta.codigo.texto) + '</dt><dd>−' + eur(st.conta.desconto) + '</dd></div>' : '') +
        '<div class="bk-summary__total"><dt>Total</dt><dd>' + (t == null ? '…' : eur(t)) + '</dd></div></dl></div>' +
        '<form class="bk-form" novalidate>' +
        (pedeDados ? '<label class="field"><span>O seu nome</span><input id="pg-nome" autocomplete="name" value="' + esc(st.nome) + '" required></label>' +
          '<label class="field"><span>O seu email</span><input id="pg-email" type="email" autocomplete="email" value="' + esc(st.email) + '" required></label>' : '') +
        (opts.semCodigo ? '<p class="bk-note">Preço de campanha, não acumulável com outros códigos ou descontos.</p>' : '<div class="pg-codigo"><label class="field"><span>' + (pedido.tipo === 'voucher' ? 'Código de desconto' : 'Código VIP, de desconto ou de voucher') + '</span><input id="pg-codigo" autocomplete="off" autocapitalize="characters" value="' + esc(st.codigo) + '"></label>' +
        '<button type="button" class="btn btn--ghost" data-aplicar>Aplicar</button></div>') +
        (gratis ? '' :
          '<div class="vc-row"><p class="vc-label">Como quer pagar</p><div class="vc-seg" role="group">' +
          [['mb_way', 'MB WAY'], ['multibanco', 'Multibanco'], ['card', 'Cartão']].map(function (m) {
            return '<button type="button" data-metodo="' + m[0] + '" aria-pressed="' + (st.metodo === m[0]) + '">' + m[1] + '</button>';
          }).join('') + '</div></div>' +
          (st.metodo === 'mb_way' ? '<label class="field"><span>Telemóvel MB WAY</span><input id="pg-tel" type="tel" inputmode="tel" autocomplete="tel" value="' + esc(st.telemovel) + '"></label>' : '') +
          '<label class="field"><span>NIF na fatura (opcional)</span><input id="pg-nif" inputmode="numeric" maxlength="9" value="' + esc(st.nif) + '"></label>') +
        '<p class="bk-note pg-aceito">Ao ' + (gratis ? 'confirmar' : 'pagar') + ', aceita os <a href="/termos/" target="_blank" rel="noopener">Termos e Condições</a> e a <a href="/privacidade/" target="_blank" rel="noopener">Política de Privacidade</a>.</p>' +
        '<p class="bk-error" role="alert"' + (erro ? '' : ' hidden') + '>' + esc(erro || '') + '</p>' +
        '<button type="submit" class="btn btn--primary"' + (t == null || st.aEnviar ? ' disabled' : '') + '>' +
        (st.aEnviar ? 'Um momento…' : gratis ? (pedido.tipo === 'voucher' ? 'Confirmar' : 'Confirmar marcação') : 'Pagar ' + (t == null ? '' : eur(t))) + '</button>' +
        (opts.voltar ? '<button type="button" class="btn btn--ghost" data-voltar>Voltar</button>' : '') +
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
      if (!st.nome.trim() || !/.+@.+\..+/.test(st.email)) return render('Indique o seu nome e um email válido.');
      st.aEnviar = true; render();
      var dados = {};
      for (var k in pedido) dados[k] = pedido[k];
      dados.nome = st.nome; dados.email = st.email; dados.telefone = st.telefone || st.telemovel;
      dados.codigo = st.codigo.trim(); dados.metodo = st.metodo; dados.telemovel = st.telemovel; dados.nif = st.nif;
      api('/pagamento', dados).then(function (p) {
        if (p.url) { location.href = p.url; return; }
        if (p.estado === 'confirmado' || p.estado === 'pago') return feito(root, p);
        if (p.metodo === 'multibanco') return multibanco(root, p);
        esperar(root, p.numero, p.token, p);
      }).catch(function (err) { st.aEnviar = false; render(err.message); });
    };
    ligar(root);

    render();
    calcular(st.codigo.trim(), opts.codigo);
  }

  /* Página /pagamento/: regresso do pagamento com cartão. */
  function estado(root, numero, token, falhou) {
    api('/pedido?n=' + encodeURIComponent(numero) + '&t=' + encodeURIComponent(token)).then(function (p) {
      if (p.estado === 'pago' || p.estado === 'confirmado') return feito(root, p);
      if (falhou) {
        root.innerHTML = '<div class="bk-panel"><p class="bk-q">O pagamento não foi concluído</p><p class="bk-note">Nada foi cobrado. Pode voltar a tentar no site ou ligar-nos.</p><p><a class="btn btn--primary" href="/#reservar">Voltar a tentar</a></p></div>';
        return;
      }
      if (p.metodo === 'multibanco' && p.multibanco) return multibanco(root, p);
      esperar(root, numero, token, p);
    }).catch(function (e) { root.innerHTML = '<div class="bk-panel"><p class="bk-note">' + esc(e.message) + '</p></div>'; });
  }

  window.OMS_PAGAR = { abrir: abrir, estado: estado };

  var pg = document.getElementById('pagamento-estado');
  if (pg) {
    var q = new URLSearchParams(location.search);
    estado(pg, q.get('n'), q.get('t'), q.get('falhou'));
  }
})();
