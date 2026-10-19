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

  // Selo "Em campanha": desce até às campanhas e abre as campanhas extra
  document.querySelectorAll('[data-open-campaigns]').forEach(function (a) {
    a.addEventListener('click', function () {
      var btn = document.querySelector('[data-toggle="campanhas-mais"]');
      if (btn && btn.getAttribute('aria-expanded') !== 'true') btn.click();
    });
  });
  if (location.hash === '#campanha') { var cb = document.querySelector('[data-toggle="campanhas-mais"]'); if (cb) cb.click(); }

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
