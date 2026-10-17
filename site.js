/* Oporto Medical Spa · versão de teste: agenda, vouchers, brilho do hero e painel de SEO. */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };

  // Agenda e vouchers (só onde existem)
  var bookingEl = $('#booking'), booking = null;
  if (bookingEl && window.PMS) booking = PMS.mountBooking(bookingEl, { labels: ['Ritual', 'Terapeuta', 'Quando', 'Confirmar'] });
  function goBook(p) {
    if (booking) { booking.preset(p); $('#reservar').scrollIntoView(); }
    else location.href = 'index.html#reservar';
  }
  var voucherEl = $('#voucher');
  if (voucherEl && window.PMS) {
    var count = 0, sum = 0, cart = $('#cart');
    PMS.mountVoucher(voucherEl, { onBuy: function (v) {
      count++; sum += v; cart.hidden = false; cart.textContent = 'Carrinho · ' + count + ' · ' + PMS.eur(sum);
    } });
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-book]'); if (b) return goBook({ treatment: b.getAttribute('data-book') });
    var w = e.target.closest('[data-book-with]'); if (w && !w.closest('#booking')) goBook({ therapist: w.getAttribute('data-book-with') });
  });

  // Pilares de "A casa": um selecionado de cada vez, como as opções de Reservar
  document.querySelectorAll('[data-select]').forEach(function (list) {
    function pick(li) {
      list.querySelectorAll('li').forEach(function (x) { x.setAttribute('aria-selected', x === li ? 'true' : 'false'); });
    }
    list.addEventListener('click', function (e) { var li = e.target.closest('li'); if (li) pick(li); });
    list.addEventListener('keydown', function (e) {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.tagName === 'LI') { e.preventDefault(); pick(e.target); }
    });
  });

  // "Saiba +" e "Ver todas as perguntas": mostram e escondem o conteúdo
  document.querySelectorAll('[data-toggle]').forEach(function (btn) {
    var target = document.getElementById(btn.getAttribute('data-toggle')), closed = btn.textContent;
    btn.addEventListener('click', function () {
      var open = target.hidden;
      target.hidden = !open;
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      btn.textContent = open ? btn.getAttribute('data-open-label') : closed;
    });
  });

  // Brilho de vela que segue o cursor
  var hero = $('#hero'), glow = $('#glow');
  if (hero && glow && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    hero.addEventListener('pointermove', function (e) {
      var r = hero.getBoundingClientRect();
      glow.style.setProperty('--x', ((e.clientX - r.left) / r.width * 100).toFixed(1) + '%');
      glow.style.setProperty('--y', ((e.clientY - r.top) / r.height * 100).toFixed(1) + '%');
    });
  }

  // Painel de SEO: mostra o que o Google e as IAs leem nesta página
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function meta(sel, attr) { var m = document.querySelector(sel); return m ? m.getAttribute(attr || 'content') : ''; }
  function build() {
    var title = document.title, desc = meta('meta[name="description"]');
    var rows = [
      ['Título', title + ' <span class="' + (title.length <= 65 ? 'ok' : 'warn') + '">(' + title.length + ' car.)</span>'],
      ['Descrição', esc(desc) + ' <span class="' + (desc.length <= 160 ? 'ok' : 'warn') + '">(' + desc.length + ' car.)</span>'],
      ['Canónico', esc(meta('link[rel="canonical"]', 'href'))],
      ['Idioma', esc(document.documentElement.lang)]
    ];
    var alts = [].map.call(document.querySelectorAll('link[rel="alternate"][hreflang]'), function (l) {
      return '<li><b>' + esc(l.hreflang) + '</b>' + esc(l.href) + '</li>';
    }).join('');
    var heads = [].map.call(document.querySelectorAll('main h1, main h2, main h3'), function (h) {
      var lvl = +h.tagName[1];
      return '<li style="--lvl:' + (lvl - 1) + '"><b>H' + lvl + '</b>' + esc(h.textContent.replace(/\s+/g, ' ').trim()) + '</li>';
    }).join('');
    var ld = [].map.call(document.querySelectorAll('script[type="application/ld+json"]'), function (s) {
      try { return JSON.stringify(JSON.parse(s.textContent), null, 2); } catch (err) { return 'JSON inválido: ' + err.message; }
    }).join('\n\n');
    var todo = [];
    document.querySelectorAll('mark.tbc').forEach(function (m) {
      var sec = m.closest('section, footer, header'), h = sec && sec.querySelector('h1, h2, h3');
      todo.push((h ? h.textContent.replace(/\s+/g, ' ').trim().slice(0, 40) + ' · ' : '') + m.textContent);
    });
    (ld.match(/"CONFIRMAR[^"]*"/g) || []).forEach(function (s) { todo.push('JSON-LD · ' + s.replace(/"/g, '')); });
    var lcp = window.__lcp ? (window.__lcp / 1000).toFixed(2) + ' s' : 'a medir…';
    var cls = (window.__cls || 0).toFixed(3);
    return '<div class="seo__head"><h2>O que o Google e as IAs leem</h2><button type="button" data-close>Fechar</button></div>' +
      '<div class="seo__body">' +
      '<h3>Meta</h3><dl>' + rows.map(function (r) { return '<dt>' + r[0] + '</dt><dd>' + r[1] + '</dd>'; }).join('') + '</dl>' +
      '<h3>Desempenho neste navegador</h3><dl><dt>LCP</dt><dd>' + lcp + ' <span class="ok">(meta &lt; 1,5 s)</span></dd><dt>CLS</dt><dd>' + cls + ' <span class="ok">(meta &lt; 0,1)</span></dd></dl>' +
      '<h3>hreflang</h3><ul class="seo__outline">' + alts + '</ul>' +
      '<h3>Estrutura de títulos</h3><ul class="seo__outline">' + heads + '</ul>' +
      '<h3>Por confirmar (' + todo.length + ')</h3><ol>' + todo.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ol>' +
      '<h3>Dados estruturados (JSON-LD)</h3><pre>' + esc(ld) + '</pre></div>';
  }
  try {
    new PerformanceObserver(function (l) { var e = l.getEntries(); if (e.length) window.__lcp = e[e.length - 1].startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver(function (l) { l.getEntries().forEach(function (e) { if (!e.hadRecentInput) window.__cls = (window.__cls || 0) + e.value; }); }).observe({ type: 'layout-shift', buffered: true });
  } catch (err) { /* navegador sem PerformanceObserver */ }

  var btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'seo-btn'; btn.textContent = 'Ver SEO';
  var dlg = document.createElement('dialog'); dlg.className = 'seo'; dlg.setAttribute('aria-label', 'Painel de SEO da versão de teste');
  document.body.appendChild(btn); document.body.appendChild(dlg);
  btn.addEventListener('click', function () { dlg.innerHTML = build(); dlg.showModal(); });
  dlg.addEventListener('click', function (e) { if (e.target === dlg || e.target.closest('[data-close]')) dlg.close(); });
})();
