/* Peças comuns a todas as páginas: cabeçalho, rodapé e barra do telemóvel. */
import { esc, telHref, waHref } from './lib.mjs';

export const WA_ICON = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.4.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.2c.2-.6.2-1.1.1-1.2l-.5-.3Z"/></svg>';
const PIN_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/></svg>';

const IG_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4.2"/><circle cx="17.4" cy="6.6" r="1" fill="currentColor" stroke="none"/></svg>';

export const tel = (t) => String(t).replace(/^\+351\s*/, '');

export function maps(m) {
  const q = m.s.nome + ', ' + m.s.rua.replace(/\s*-\s*S\/\d+/, '') + ', ' + m.s.codigo_postal + ' ' + m.s.localidade;
  const street = m.s.rua.replace(/\s*-\s*S\/\d+/, '');
  return {
    google: 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(q).replace(/%20/g, '+'),
    apple: 'https://maps.apple.com/?daddr=' + encodeURIComponent(street + ', ' + m.s.codigo_postal + ' ' + m.s.localidade).replace(/%20/g, '+'),
    waze: 'https://waze.com/ul?q=' + encodeURIComponent(street + ' ' + m.s.localidade) + '&navigate=yes',
    reviews: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(m.s.nome + ' ' + m.s.localidade).replace(/%20/g, '+')
  };
}

/* Título com a parte final em itálico bege: "Aqui o tempo <em>corre devagar</em>" */
export function title(t, em, br) {
  return esc(t || '') + (em ? (br ? '<br>' : ' ') + '<em>' + esc(em) + '</em>' : '');
}

export function header(m, { home, current }) {
  const b = home ? '' : '/';
  return `<header class="top">
  <div class="wrap">
    <nav aria-label="Principal">
      <a href="${b}#rituais">Rituais</a>
      <a href="${b}#equipa">Equipa</a>
      <a href="${b}#oferecer">Oferecer</a>
      <a href="${b}#como-chegar">Como chegar</a>
    </nav>
    <a class="mark mark--word" href="${home ? '#inicio' : '/'}" aria-label="${esc(m.s.nome)}, início"><img src="/wordmark.svg" alt="${esc(m.s.nome)}" width="90" height="100"${home ? ' fetchpriority="high"' : ''}></a>
    <div class="top__end">
      <span class="lang"><a href="${esc(current)}" hreflang="pt-PT" aria-current="page">PT</a> · <span class="soon" title="Versão inglesa por traduzir" hreflang="en">EN</span></span>
      ${m.s.instagram ? `<a class="top__ig" href="${esc(m.s.instagram)}" target="_blank" rel="noopener" aria-label="${esc(m.s.nome)} no Instagram">${IG_ICON}</a>` : ''}
      <a class="btn btn--ghost btn--wa" href="${waHref(m.s.whatsapp)}" target="_blank" rel="noopener" aria-label="Falar connosco por WhatsApp">${WA_ICON}WhatsApp</a>
      <a class="btn btn--primary" href="${b}#reservar">Reservar</a>
    </div>
  </div>
</header>`;
}

export function footer(m, { home }) {
  const s = m.s, h = s.horario || {};
  const hh = (x) => x.replace(/^0/, '').replace(':00', 'h').replace(':', 'h');
  const year = new Date().getFullYear();
  const n = s.newsletter;
  const news = n && n.mostrar ? `<section class="news" id="newsletter" aria-labelledby="news-t">
    <div class="wrap news__grid">
      <div><p class="kicker">Newsletter</p><h2 class="d" id="news-t">${title(n.titulo, n.titulo_destaque)}</h2>${n.texto ? '<p class="news__text">' + esc(n.texto) + '</p>' : ''}</div>
      <form class="news__form" name="newsletter" method="POST" action="/?newsletter=ok#newsletter" data-netlify="true" netlify-honeypot="empresa">
        <input type="hidden" name="form-name" value="newsletter">
        <p hidden><label>Não preencher <input name="empresa"></label></p>
        <div class="news__row"><label class="sr-only" for="news-email">Email</label><input id="news-email" type="email" name="email" placeholder="O seu email" autocomplete="email" required><button type="submit" class="btn btn--primary">${esc(n.botao || 'Subscrever')}</button></div>
        <label class="news__ok"><input type="checkbox" name="consentimento" value="sim" required> <span>${esc(n.consentimento)}</span></label>
        <p class="news__thanks" role="status" hidden>${esc(n.obrigado)}</p>
      </form>
    </div>
  </section>
` : '';
  return `${news}<footer class="foot">
  <div class="wrap">
    <div class="foot__grid">
      <div><a class="mark" href="${home ? '#inicio' : '/'}"><img src="/logo-beige.svg" alt="${esc(s.nome)}" width="54" height="100" style="height:100px" loading="lazy"></a>${s.frase_rodape ? '<p style="margin-top:20px;max-width:30ch">' + esc(s.frase_rodape) + '</p>' : ''}</div>
      <div><h4>Morada</h4><address><p>${esc(s.nome)}</p><p>${esc(s.rua)}</p><p>${esc(s.codigo_postal + ' ' + s.localidade)}</p><p><a href="${home ? '' : '/'}#como-chegar">Como chegar →</a></p></address></div>
      <div><h4>Contactos</h4><p><a href="${telHref(s.telefone)}">${esc(s.telefone)}</a></p>${s.telemovel ? `<p><a href="${telHref(s.telemovel)}">${esc(s.telemovel)}</a></p>` : ''}<p><a href="mailto:${esc(s.email)}">${esc(s.email)}</a></p></div>
      <div><h4>Horário</h4><p>Segunda a sexta · ${hh(h.semana_abre)} às ${hh(h.semana_fecha)}</p>${h.sabado_aberto ? `<p>Sábado · ${hh(h.sabado_abre)} às ${hh(h.sabado_fecha)}</p>` : '<p>Sábado · fechado</p>'}<p>Domingo · fechado</p></div>
    </div>
    ${m.areaPages && m.areaPages.length ? `<nav class="foot__areas" aria-label="Tratamentos">${[m.pageFor('Relaxar'), ...m.areaPages].map((p) => `<a href="${esc(p.path)}">${esc(p.nome_menu)}</a>`).join('')}</nav>` : ''}
    <div class="foot__legal"><span>© ${year} ${esc(s.nome)} · Registo ERS n.º ${s.registo_ers ? esc(s.registo_ers) : '<mark class="tbc">confirmar</mark>'}</span><span><a href="#">Privacidade</a> · <a href="#">Termos</a> · <a href="https://www.livroreclamacoes.pt/" target="_blank" rel="noopener">Livro de Reclamações</a></span></div>
  </div>
</footer>`;
}

export function mbar(m, { home }) {
  return `<nav class="mbar" aria-label="Ações rápidas">
  <a class="primary" href="${home ? '' : '/'}#reservar">Reservar</a>
  <a href="${waHref(m.s.whatsapp)}" target="_blank" rel="noopener">${WA_ICON}WhatsApp</a>
  <a href="${esc(maps(m).google)}" target="_blank" rel="noopener">${PIN_ICON}Chegar</a>
</nav>`;
}

export const MAP_SVG = `<svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <rect width="400" height="300" fill="#15100B"/>
          <path d="M-20 250 C 80 210 160 230 230 170 S 360 90 430 70" stroke="#2A1F15" stroke-width="16" fill="none"/>
          <path d="M-20 120 L 430 150" stroke="#251B12" stroke-width="10" fill="none"/>
          <path d="M120 -20 L 170 320" stroke="#251B12" stroke-width="8" fill="none"/>
          <path d="M260 -20 L 220 320" stroke="#3B2919" stroke-width="12" fill="none"/>
          <path d="M-20 40 L 430 20" stroke="#1E160F" stroke-width="6" fill="none"/>
          <path d="M330 -20 L 380 320" stroke="#1E160F" stroke-width="6" fill="none"/>
          <path d="M0 300 C 60 280 100 300 160 290 L 160 300 Z" fill="#1A1410"/>
        </svg>`;

export function page(m, { headHtml, ld, body, scripts }) {
  return `<!doctype html>
<html lang="pt-PT">
<head>
${headHtml}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500;1,400&family=Manrope:wght@300;400;500;600&display=swap">
<link rel="stylesheet" href="/site.css">
${ld}
</head>
<body>

${body}

${scripts.map((s) => '<script src="' + s + '"></script>').join('\n')}
</body>
</html>
`;
}
