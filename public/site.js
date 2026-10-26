/* Oporto Medical Spa: agenda, vouchers, brilho do hero e secções que abrem e fecham. */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };

  // Agenda e vouchers (só onde existem)
  var bookingEl = $('#booking'), booking = null;
  if (bookingEl && window.PMS) booking = PMS.mountBooking(bookingEl, { labels: ['Ritual', 'Terapeuta', 'Quando', 'Confirmar'] });
  function goBook(p) {
    if (booking) { booking.preset(p); $('#reservar').scrollIntoView(); }
    else location.href = '/#reservar';
  }
  var voucherEl = $('#voucher'), voucher = null;
  if (voucherEl && window.PMS) {
    var count = 0, sum = 0, cart = $('#cart');
    voucher = PMS.mountVoucher(voucherEl, { onBuy: function (v) {
      count++; sum += v; cart.hidden = false; cart.textContent = (document.documentElement.lang === 'en' ? 'Cart · ' : 'Carrinho · ') + count + ' · ' + PMS.eur(sum);
    } });
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-book]'); if (b) return goBook({ treatment: b.getAttribute('data-book') });
    // Botão de uma campanha de vouchers: abre o voucher dessa campanha
    var cv = e.target.closest('[data-voucher]');
    if (cv) { if (voucher) { e.preventDefault(); voucher.preset(cv.getAttribute('data-voucher')); $('#oferecer').scrollIntoView(); } return; }
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

  // Ligação para um tratamento escondido em «Descubra todos»: abre a área primeiro
  function openFor(hash) {
    var el = hash && hash.length > 1 && document.getElementById(hash.slice(1));
    var box = el && el.closest('.rituals__more');
    if (box && box.hidden) { var b = document.querySelector('[data-toggle="' + box.id + '"]'); if (b) b.click(); }
  }
  openFor(location.hash);
  window.addEventListener('hashchange', function () { openFor(location.hash); });

  // Campanhas do mês: rodam a cada 3 segundos; param com o rato por cima, com o foco ou com «reduzir movimento»
  document.querySelectorAll('[data-carousel]').forEach(function (box) {
    var slides = box.querySelectorAll('.camp-slide'), dots = box.querySelectorAll('.camp-dot'), count = box.querySelector('.camp-count');
    var cur = 0, timer = null, paused = false, still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    box.classList.add('is-js');
    function show(i) {
      cur = (i + slides.length) % slides.length;
      slides.forEach(function (s, k) { s.classList.toggle('is-on', k === cur); s.setAttribute('aria-hidden', k === cur ? 'false' : 'true'); s.inert = k !== cur; });
      dots.forEach(function (d, k) { d.classList.toggle('is-on', k === cur); if (k === cur) d.setAttribute('aria-current', 'true'); else d.removeAttribute('aria-current'); });
      if (count) count.textContent = (cur + 1) + ' ' + (count.getAttribute('data-of') || 'de') + ' ' + slides.length;
    }
    function start() { stop(); if (!still && !paused) timer = setInterval(function () { show(cur + 1); }, 3000); }
    function stop() { if (timer) clearInterval(timer); timer = null; }
    dots.forEach(function (d) { d.addEventListener('click', function () { show(+d.getAttribute('data-slide')); start(); }); });
    box.addEventListener('mouseenter', function () { paused = true; stop(); });
    box.addEventListener('mouseleave', function () { paused = false; start(); });
    box.addEventListener('focusin', function () { paused = true; stop(); });
    box.addEventListener('focusout', function () { paused = false; start(); });
    show(0); start();
  });

  // Newsletter: mensagem de agradecimento depois de subscrever
  if (/[?&]newsletter=ok/.test(location.search)) {
    var thanks = document.querySelector('.news__thanks'), row = document.querySelector('.news__row');
    if (thanks) { thanks.hidden = false; if (row) row.hidden = true; var ok = document.querySelector('.news__ok'); if (ok) ok.hidden = true; }
  }

  // Brilho de vela que segue o cursor
  var hero = $('#hero'), glow = $('#glow');
  if (hero && glow && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    hero.addEventListener('pointermove', function (e) {
      var r = hero.getBoundingClientRect();
      glow.style.setProperty('--x', ((e.clientX - r.left) / r.width * 100).toFixed(1) + '%');
      glow.style.setProperty('--y', ((e.clientY - r.top) / r.height * 100).toFixed(1) + '%');
    });
  }
})();
