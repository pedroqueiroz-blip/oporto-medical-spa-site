/* As duas páginas do site, montadas a partir do conteúdo do backoffice. */
import { esc, eur, minutes, picture, telHref } from './lib.mjs';
import { header, footer, mbar, page, title, maps, MAP_SVG } from './partes.mjs';
import { head, homeDescription, massagesDescription, homeLD, massagesLD } from './seo.mjs';

const NUM = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
const STARS = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
            <linearGradient id="omsGold" x1="0" y1="0" x2="0.3" y2="1"><stop offset="0" stop-color="#F6E2B8"/><stop offset=".55" stop-color="#D9A86C"/><stop offset="1" stop-color="#9C6E3C"/></linearGradient>
            <linearGradient id="omsSheen" x1="0" x2="1"><stop offset="0" stop-color="#FFF8EA" stop-opacity="0"/><stop offset=".5" stop-color="#FFF8EA" stop-opacity=".95"/><stop offset="1" stop-color="#FFF8EA" stop-opacity="0"/></linearGradient>
            <path id="omsStar" d="M12 1.6l2.75 6.55 7.05.6-5.35 4.65 1.6 6.95L12 16.65 5.95 20.35l1.6-6.95L2.2 8.75l7.05-.6z"/>
            <clipPath id="omsStarClip"><use href="#omsStar"/></clipPath>
          </defs></svg>
          <svg class="star" viewBox="0 0 24 24" aria-hidden="true"><use href="#omsStar" fill="url(#omsGold)"/></svg>
          <svg class="star" viewBox="0 0 24 24" aria-hidden="true"><use href="#omsStar" fill="url(#omsGold)"/></svg>
          <svg class="star" viewBox="0 0 24 24" aria-hidden="true"><use href="#omsStar" fill="url(#omsGold)"/></svg>
          <svg class="star" viewBox="0 0 24 24" aria-hidden="true"><use href="#omsStar" fill="url(#omsGold)"/></svg>
          <span class="star-lit" aria-hidden="true"><svg class="star" viewBox="0 0 24 24"><use href="#omsStar" fill="url(#omsGold)"/><g clip-path="url(#omsStarClip)"><g transform="rotate(22 12 12)"><rect class="star-sheen" x="-16" y="-6" width="9" height="36" fill="url(#omsSheen)"/></g></g></svg><span class="star-glint"></span></span>`;

function faqHtml(items, { id, firstOpen = true, collapse = true }) {
  const d = (x, open) => `<details${open ? ' open' : ''}><summary><h3>${esc(x.q)}</h3></summary><p>${x.html}</p></details>`;
  if (!collapse || items.length <= 1) return `<div class="faq"${id ? ' id="' + id + '"' : ''}>\n        ${items.map((x, i) => d(x, firstOpen && i === 0)).join('\n        ')}\n      </div>`;
  const [first, ...rest] = items;
  return `<div class="faq" id="${id}">
        ${d(first, firstOpen)}
        <div class="faq__more" id="${id}-more" hidden>
          ${rest.map((x) => d(x)).join('\n          ')}
        </div>
        <button type="button" class="more-btn" aria-expanded="false" aria-controls="${id}-more" data-toggle="${id}-more" data-open-label="Ver menos">Ver todas as perguntas</button>
      </div>`;
}

function campaignSection(m) {
  const c = m.campaign;
  if (!c) return '';
  const t = m.text;
  const img = c.imagem
    ? `<figure class="arch arch--photo">${picture(c.imagem, { widths: [480, 760, 1040], sizes: '(max-width: 860px) 86vw, 40vw', alt: c.imagem_alt || '' })}</figure>`
    : '<figure class="arch"><figcaption>Fotografia · <mark class="tbc">a enviar</mark></figcaption></figure>';
  const items = (c.inclui || []).map((x) => '<li>' + t.inline(x) + '</li>');
  if (c.duracao) items.push('<li>Duração: ' + minutes(c.duracao) + '</li>');
  else if (!items.some((x) => /Duração/.test(x))) items.push('<li><mark class="tbc">Duração: a confirmar</mark></li>');
  const book = c.tratamento ? `<button type="button" class="btn btn--primary" data-book="${esc(c.tratamento)}">Reservar</button>` : '<a class="btn btn--primary" href="#reservar">Reservar</a>';
  return `<section class="section month2" id="campanha">
    <div class="wrap split">
      ${img}
      <div style="display:grid;gap:24px">
        <p class="kicker" style="margin:0">${esc(c.etiqueta)}</p>
        <h2 class="d sig-title">${title(c.titulo, c.titulo_destaque)}${c.assinatura ? '<span class="sig-by">' + esc(c.assinatura) + '</span>' : ''}</h2>
        ${c.texto ? '<p style="margin:0;font-size:18px;max-width:46ch">' + t.inline(c.texto) + '</p>' : ''}
        ${c.selo ? `<p class="sig-seal"><span class="sig-seal__r" aria-hidden="true">®</span><span>${esc(c.selo_texto)}<br><b>${esc(c.selo_numero)}</b></span></p>` : ''}
        ${items.length ? '<ul>\n          ' + items.join('\n          ') + '\n        </ul>' : ''}
        <div style="display:flex;flex-wrap:wrap;align-items:center;gap:18px 28px">
          <span class="price-d">${c.preco ? esc(eur(c.preco)) : '<mark class="tbc">preço a confirmar</mark>'}</span>
          ${book}
          <a href="#oferecer" style="font-size:12px;letter-spacing:.2em;text-transform:uppercase;text-decoration:none;border-bottom:1px solid var(--flame);padding-bottom:3px">Oferecer</a>
        </div>
      </div>
    </div>
  </section>`;
}

function personCard(m, p, i) {
  const first = p.nome.split(' ')[0];
  const ph = p.foto
    ? `<div class="person__ph person__ph--photo">${picture(p.foto, { widths: [320, 640], sizes: '(max-width: 860px) 46vw, 22vw', alt: 'Retrato de ' + p.nome })}</div>`
    : `<div class="person__ph pms-tone-${(i % 4) + 1}">Retrato</div>`;
  return `<article class="person">${ph}<p class="person__role">${esc(p.funcao)}</p><h3>${esc(p.nome)}</h3><p>${esc(p.foco)}</p>${p.credencial ? '<p class="cred">' + m.text.inline(p.credencial) + '</p>' : ''}<button type="button" data-book-with="${esc(p.id)}">Marcar com ${esc(first)}</button></article>`;
}

export function home(m) {
  const I = m.inicio, t = m.text, s = m.s, mp = maps(m);
  const faqItems = m.faq(I.perguntas.lista);
  const names = m.treatments.map((x) => '<span>' + esc(x.nome) + '</span><i>✦</i>').join('');
  const marquee = m.campaign ? names + '<span>' + esc([m.campaign.titulo, m.campaign.titulo_destaque].filter(Boolean).join(' ')) + '</span><i>✦</i>' : names;
  const rituals = m.groups.map((g, gi) => `<p class="group-t"${gi ? ' style="padding-top:40px"' : ''}>${esc(g)}</p>
        ${m.inGroup(g).map((x) => `<article class="ritual">
          <h3>${x.grupo === 'Relaxar' ? '<a href="/massagens-porto/">' + esc(x.nome) + '</a>' : esc(x.nome)}</h3>
          <p>${t.inline(x.texto)}</p>
          <p class="ritual__price"><span>${minutes(x.duracao)}</span>${eur(x.preco)}</p>
          <button type="button" data-book="${esc(x.id)}" aria-label="Reservar ${esc(x.nome)}">→</button>
        </article>`).join('\n        ')}`).join('\n        ');
  const pillars = (I.casa.pilares || []).map((p, i) => `<li tabindex="0" aria-selected="false"><span class="pillars__n" aria-hidden="true">${NUM[i]}</span><h3>${esc(p.titulo)}</h3><p>${t.inline(p.texto)}</p>${p.tratamento ? `<button type="button" data-book="${esc(p.tratamento)}">${esc(p.botao)} <span aria-hidden="true">→</span></button>` : `<a href="#rituais">${esc(p.botao)} <span aria-hidden="true">→</span></a>`}</li>`).join('\n          ');
  const h = I.hero;

  const body = `${header(m, { home: true, current: '/' })}

<main id="inicio">
  <section class="hero2" id="hero">
    <div class="hero2__bg" id="glow" aria-hidden="true"></div>
    <div class="wrap">
      <div class="hero2__grid">
        <div>
          <h1><span class="h1-kicker">${esc(h.etiqueta)}</span> <span class="h1-title">${title(h.titulo, h.titulo_destaque)}<span class="flame" aria-hidden="true"></span></span></h1>
          <p class="hero2__lead">${h.resumo ? '<strong>' + t.inline(h.resumo) + '</strong> ' : ''}${t.inline(h.texto)}</p>
          <div class="hero2__cta">
            <a class="btn btn--primary" href="#reservar">${esc(h.botao)} <span aria-hidden="true">→</span></a>
            <a class="btn btn--ghost" href="#oferecer">Oferecer</a>
          </div>
          <address class="hero2__facts">
            <span><i class="d" style="font-size:15px;color:var(--linen)">Spa</i> · do latim <i>sanus per aquam</i>, a saúde pela água</span>
            <a href="#como-chegar">${esc(s.rua.replace(/\s*-\s*S\/\d+/, '') + ' · ' + s.localidade)}</a>
            <span>${esc(m.hoursShort)}</span>
          </address>
        </div>
        <figure class="frame">
          <img class="frame__word" src="/wordmark.svg" alt="" width="90" height="100" aria-hidden="true">
          <div class="frame__img">${picture(h.imagem, { widths: [420, 760], sizes: '(max-width: 900px) 92vw, 34vw', alt: h.imagem_alt, high: true })}</div>
        </figure>
      </div>
    </div>
    <div class="marquee" aria-hidden="true">
      <div class="marquee__track">
        ${marquee}
        ${marquee}
      </div>
    </div>
  </section>

  <section class="section">
    <div class="wrap house2">
      <figure class="house2__fig">
        <div class="house2__arch">${picture(I.casa.imagem, { widths: [560, 1040], sizes: '(max-width: 860px) 86vw, 36vw', alt: I.casa.imagem_alt })}</div>
      </figure>
      <div class="house2__text">
        <p class="kicker">${esc(I.casa.etiqueta)}</p>
        <h2 class="d" style="font-size:clamp(40px,5vw,76px)">${title(I.casa.titulo, I.casa.titulo_destaque)}</h2>
        <p class="house2__lead">${t.inline(I.casa.texto)}</p>
        <ol class="pillars" data-select>
          ${pillars}
        </ol>
        ${I.casa.citacao ? '<blockquote class="d house2__quote">' + t.inline(I.casa.citacao) + '</blockquote>' : ''}
      </div>
    </div>
  </section>

  <section class="section" id="rituais" style="padding-top:0">
    <div class="wrap">
      <div class="rit-grid"><div class="rit-main">
      <div class="sh sh--stack">
        <div class="sh__text"><p class="kicker">${esc(I.rituais.etiqueta)}</p><h2 class="d">${title(I.rituais.titulo, I.rituais.titulo_destaque, true)}</h2>
        <p class="prose">${t.inline(I.rituais.texto)}</p></div>
      </div>
      <p class="answer">${esc(m.priceAnswer())}</p>

      <div class="rituals" style="margin-top:0">
        ${rituals}
      </div>
      </div>
      <figure class="rit-aside">${picture(I.rituais.imagem, { widths: [480, 728], sizes: '(max-width: 860px) 92vw, 300px', alt: I.rituais.imagem_alt })}</figure>
      </div>

      <div class="choose-head choose-head--solo">
        <div>
          <h2 class="d" style="font-size:clamp(30px,3.4vw,46px)">${title(I.rituais.escolher_titulo, I.rituais.escolher_destaque)}</h2>
          <p class="prose" style="margin:16px 0 0">${t.inline(I.rituais.escolher_texto)}</p>
          <button type="button" class="more-btn" aria-expanded="false" aria-controls="cmp" data-toggle="cmp" data-open-label="Fechar rituais e tratamentos">Conheça todos os rituais e tratamentos</button>
        </div>
      </div>
      <div class="cmp-wrap" id="cmp" tabindex="0" role="region" aria-label="Comparação de tratamentos" hidden>
        <table class="cmp">
          <caption>Preços e durações em vigor no ${esc(s.nome)}, ${esc(s.localidade)}.</caption>
          <thead><tr><th scope="col">Tratamento</th><th scope="col">Indicado para</th><th scope="col">Como é</th><th scope="col">Duração</th><th scope="col">Preço</th></tr></thead>
          <tbody>
            ${[...m.treatments].sort((a, b) => a.preco - b.preco || 0).sort((a, b) => m.groups.indexOf(a.grupo) - m.groups.indexOf(b.grupo)).map((x) => `<tr><th scope="row">${esc(x.nome)}</th><td>${esc(x.indicado_para)}</td><td>${esc(x.como_e)}</td><td class="num">${minutes(x.duracao)}</td><td class="num">${eur(x.preco)}</td></tr>`).join('\n            ')}
          </tbody>
        </table>
      </div>
    </div>
  </section>

  <section class="section visit" id="visita">
    <div class="wrap">
      <div class="visit2">
        <div class="visit2__text">
          <p class="kicker">${esc(I.visita.etiqueta)}</p><h2 class="d">${title(I.visita.titulo, I.visita.titulo_destaque)}</h2>
          <p class="prose">${t.inline(I.visita.texto)}</p>
          <ol class="steps-sm">
            ${(I.visita.passos || []).map((p, i) => `<li><span class="n" aria-hidden="true">${NUM[i]}</span><h3>${esc(p.titulo)}</h3><p>${t.inline(p.texto)}</p></li>`).join('\n            ')}
          </ol>
        </div>
        <figure class="tea">${picture(I.visita.imagem, { widths: [520, 960], sizes: '(max-width: 860px) 60vw, 300px', alt: I.visita.imagem_alt })}</figure>
      </div>
    </div>
  </section>

  ${campaignSection(m)}

  <section class="section" id="equipa" style="padding-top:0">
    <div class="wrap">
      <div class="sh">
        <div><p class="kicker">${esc(I.equipa.etiqueta)}</p><h2 class="d">${title(I.equipa.titulo, I.equipa.titulo_destaque)}</h2></div>
        <p class="prose">${t.inline(I.equipa.texto)}${m.teamConfirmed ? '' : ' <mark class="tbc">nomes e cédulas ilustrativos</mark>'}</p>
      </div>
      <div class="team">
        ${m.team.map((p, i) => personCard(m, p, i)).join('\n        ')}
      </div>
    </div>
  </section>

  <section class="section reserve" id="reservar">
    <div class="wrap">
      <div class="reserve__head">
        <div><p class="kicker">${esc(I.reservar.etiqueta)}</p><h2 class="d" style="font-size:clamp(36px,5vw,66px)">${title(I.reservar.titulo, I.reservar.titulo_destaque)}</h2></div>
        <p class="prose" style="margin:0">${t.inline(I.reservar.texto)}</p>
      </div>
      <div id="booking"></div>
    </div>
  </section>

  <section class="section" id="oferecer">
    <div class="wrap">
      <div class="sh" style="margin-bottom:0">
        <div><p class="kicker">${esc(I.oferecer.etiqueta)}</p><h2 class="d">${title(I.oferecer.titulo, I.oferecer.titulo_destaque)}</h2></div>
        <p class="prose">${t.inline(I.oferecer.texto)}</p>
      </div>
      <div id="voucher"></div>
      ${I.oferecer.nota ? '<p class="vc-redeem">' + t.inline(I.oferecer.nota) + '</p>' : ''}
    </div>
  </section>

  <section class="section" id="avaliacoes" style="padding-top:0">
    <div class="wrap">
      <div class="sh" style="margin-bottom:26px">
        <div><p class="kicker">Quem já esteve cá</p><h2 class="d">Nas palavras <em>de quem saiu mais leve.</em></h2></div>
      </div>
      <div class="reviews__head">
        <span class="reviews__score"><mark class="tbc">nota</mark></span>
        <span><span class="stars" role="img" aria-label="Classificação em estrelas">
          ${STARS}
        </span><br><span style="color:var(--oat);font-size:14px"><mark class="tbc">n.º</mark> avaliações no Google</span></span>
        <a class="btn btn--ghost" style="margin-left:auto" href="${esc(mp.reviews)}" rel="noopener" target="_blank">Ver todas no Google</a>
      </div>
      <div class="reviews__grid">
        <article class="review"><b>Avaliação mais recente</b><span>O texto real da avaliação, o nome como aparece no Google e a data. Puxada pela API do Google, sem edição.</span></article>
        <article class="review"><b>Segunda mais recente</b><span>Mostramos as mais recentes, não só as de cinco estrelas.</span></article>
        <article class="review"><b>Terceira mais recente</b><span>Cada cartão leva a atribuição “Google”, como as regras da API exigem.</span></article>
      </div>
      <p class="reviews__note">As avaliações são publicadas por clientes no Google e mostradas por ordem de data, sem seleção. O ${esc(s.nome)} não as edita.</p>
    </div>
  </section>

  <section class="section" style="padding-top:0">
    <div class="wrap trust">
      <div class="seals" aria-hidden="true">
        <div class="seal"><div>International<strong>IMSA</strong>Medical Spa</div></div>
        <div class="seal"><div><svg class="seal__lotus" viewBox="0 0 40 24" fill="none" stroke="currentColor" stroke-width="1.1"><path d="M20 2c-4 4-5 9-5 13s2 6 5 8c3-2 5-4 5-8s-1-9-5-13Z"/><path d="M14.6 7.5C10 9 8 13 8.5 17s5 6 11.5 6"/><path d="M25.4 7.5C30 9 32 13 31.5 17s-5 6-11.5 6"/><path d="M8.6 12.5C4 13 1.5 16 1 18.5c4 3 11 4.5 19 4.5"/><path d="M31.4 12.5c4.6.5 7.1 3.5 7.6 6-4 3-11 4.5-19 4.5"/></svg>Spa Industry<strong>SIA</strong>Association</div></div>
      </div>
      <p>${t.inline(I.confianca)}${I.confianca_nota ? ' <span>' + t.inline(I.confianca_nota) + '</span>' : ''}</p>
    </div>
  </section>

  <section class="section" id="perguntas" style="padding-top:0">
    <div class="wrap split" style="align-items:start">
      <div>
        <p class="kicker">${esc(I.perguntas.etiqueta)}</p>
        <h2 class="d" style="font-size:clamp(36px,4vw,60px)">${esc(I.perguntas.titulo)}</h2>
        <p class="prose">${t.inline(I.perguntas.texto)}</p>
      </div>
      ${faqHtml(faqItems, { id: 'faq' })}
    </div>
  </section>

  <section class="section visit" id="como-chegar">
    <div class="wrap visitus">
      <div>
        <p class="kicker">${esc(I.como_chegar.etiqueta)}</p>
        <h2 class="d" style="font-size:clamp(36px,4.6vw,64px)">${title(I.como_chegar.titulo, I.como_chegar.titulo_destaque)}</h2>
        <address>
          <strong style="font-weight:500">${esc(s.nome)}</strong>
          <span>${esc(s.rua)}</span>
          <span>${esc(s.codigo_postal + ' ' + s.localidade)}</span>
          <a href="${telHref(s.telefone)}">${esc(s.telefone)}</a>
          <a href="mailto:${esc(s.email)}">${esc(s.email)}</a>
        </address>
        ${I.como_chegar.texto ? '<p class="prose">' + t.inline(I.como_chegar.texto) + '</p>' : ''}
      </div>
      <div class="mapf">
        ${MAP_SVG}
        <span class="mapf__label">Mapa interativo carrega só depois de aceitar cookies</span>
        <div class="mapf__pin"><img src="/logo-beige.svg" alt="" width="29" height="53" loading="lazy"><span></span></div>
        <div class="mapf__go">
          <a href="${esc(mp.google)}" target="_blank" rel="noopener">Google Maps</a>
          <a href="${esc(mp.apple)}" target="_blank" rel="noopener">Apple Maps</a>
          <a href="${esc(mp.waze)}" target="_blank" rel="noopener">Waze</a>
        </div>
      </div>
    </div>
  </section>
</main>

${footer(m, { home: true })}

${mbar(m, { home: true })}

<div class="cart" id="cart" hidden></div>`;

  const path = '/';
  return {
    faqItems,
    html: page(m, {
      headHtml: head(m, { title: I.seo.titulo, description: homeDescription(m), path, ogTitle: I.seo.titulo_partilha, ogDescription: I.seo.descricao_partilha, ogImage: s.imagem_partilha || h.imagem }),
      ld: homeLD(m, faqItems),
      body,
      scripts: ['/dados.js', '/prototype.js', '/site.js']
    })
  };
}

export function massages(m) {
  const M = m.massagens, t = m.text, s = m.s, mp = maps(m);
  const relax = m.inGroup('Relaxar');
  const faqItems = m.faq(M.perguntas.lista);
  const path = '/massagens-porto/';
  const p = m.range(relax, 'preco'), d = m.range(relax, 'duracao');
  const n = ['', 'uma', 'duas', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito'][relax.length] || String(relax.length);
  const summary = relax.length
    ? 'No ' + s.nome + ', no ' + s.localidade + ' ocidental' + (s.zona ? ', ' + s.zona : '') + ', há ' + n + ' massage' + (relax.length > 1 ? 'ns' : 'm') + ' de relaxamento: ' +
      relax.map((x) => x.nome + ' (' + eur(x.preco) + ')').join(', ').replace(/, ([^,]*)$/, ' e $1') +
      (d ? (d.min === d.max ? ', de ' + d.min + ' minutos.' : ', de ' + d.min + ' a ' + d.max + ' minutos.') : '.')
    : '';

  const body = `${header(m, { home: false, current: path })}

<main>
  <nav class="crumbs wrap" aria-label="Está aqui"><ol><li><a href="/">Início</a></li><li aria-current="page">Massagens no ${esc(s.localidade)}</li></ol></nav>

  <section class="hero2" id="hero" style="padding-top:clamp(30px,5vw,70px)">
    <div class="hero2__bg" id="glow" aria-hidden="true"></div>
    <div class="wrap">
      <h1><span class="h1-kicker">${esc(M.hero.etiqueta)}</span> <span class="h1-title" style="font-size:clamp(48px,7.5vw,118px)">${title(M.hero.titulo, M.hero.titulo_destaque)}<span class="flame" aria-hidden="true"></span></span></h1>
      <p class="hero2__lead">${summary ? '<strong>' + esc(summary) + '</strong> ' : ''}${t.inline(M.hero.texto)}</p>
      <div class="hero2__cta">
        <a class="btn btn--primary" href="/#reservar">${esc(M.hero.botao)} <span aria-hidden="true">→</span></a>
        <a class="btn btn--ghost" href="/#oferecer">Oferecer uma massagem</a>
      </div>
    </div>
  </section>

  ${M.citacao ? `<section class="section" style="padding-top:0;padding-bottom:0">
    <div class="wrap"><blockquote class="d mq">${t.inline(M.citacao)}</blockquote></div>
  </section>` : ''}

  <section class="section" style="padding-top:0">
    <div class="wrap">
      <div class="rituals" style="margin-top:0">
        ${relax.map((x) => `<article class="ritual"><h2 class="d" style="font-size:clamp(26px,2.8vw,36px)">${esc(x.nome)}</h2><p>${t.inline(x.texto_massagens || x.texto)}</p><p class="ritual__price"><span>${minutes(x.duracao)}</span>${eur(x.preco)}</p><button type="button" data-book="${esc(x.id)}" aria-label="Reservar ${esc(x.nome)}">→</button></article>`).join('\n        ')}
      </div>

      <h2 class="d" style="font-size:clamp(30px,3.4vw,46px);margin-top:80px">${title(M.escolher_titulo, M.escolher_destaque)}</h2>
      <div class="cmp-wrap" style="margin-top:24px" tabindex="0" role="region" aria-label="Comparação de massagens">
        <table class="cmp">
          <caption>Massagens de relaxamento no ${esc(s.nome)}, ${esc(s.localidade)}. Preços em vigor.</caption>
          <thead><tr><th scope="col">Massagem</th><th scope="col">Ideal para</th><th scope="col">Pressão</th><th scope="col">Duração</th><th scope="col">Preço</th></tr></thead>
          <tbody>
            ${[...relax].sort((a, b) => a.preco - b.preco).map((x) => `<tr><th scope="row">${esc(x.nome)}</th><td>${esc(x.indicado_para)}</td><td>${esc(x.pressao || '')}</td><td class="num">${minutes(x.duracao)}</td><td class="num">${eur(x.preco)}</td></tr>`).join('\n            ')}
          </tbody>
        </table>
      </div>
      ${M.nota_fisio ? '<p class="prose" style="max-width:70ch">' + t.inline(M.nota_fisio) + '</p>' : ''}
    </div>
  </section>

  <section class="section visit" id="perguntas">
    <div class="wrap split" style="align-items:start">
      <div>
        <p class="kicker">${esc(M.perguntas.etiqueta)}</p>
        <h2 class="d" style="font-size:clamp(34px,4vw,56px)">${esc(M.perguntas.titulo)}</h2>
      </div>
      ${faqHtml(faqItems, { collapse: false })}
    </div>
  </section>

  <section class="section">
    <div class="wrap visitus">
      <div>
        <p class="kicker">Onde estamos</p>
        <h2 class="d" style="font-size:clamp(32px,4vw,54px)">${title(M.onde_titulo, M.onde_destaque)}</h2>
        <address>
          <strong style="font-weight:500">${esc(s.nome)}</strong>
          <span>${esc(s.rua)}</span>
          <span>${esc(s.codigo_postal + ' ' + s.localidade)}</span>
          <a href="${telHref(s.telefone)}">${esc(s.telefone)}</a>
        </address>
        ${M.onde_texto ? '<p class="prose">' + t.inline(M.onde_texto) + '</p>' : ''}
      </div>
      <div class="mapf">
        ${MAP_SVG}
        <div class="mapf__pin"><img src="/logo-beige.svg" alt="" width="29" height="53" loading="lazy"><span></span></div>
        <div class="mapf__go"><a href="${esc(mp.google)}" target="_blank" rel="noopener">Como chegar</a></div>
      </div>
    </div>
  </section>
</main>

${footer(m, { home: false })}

${mbar(m, { home: false })}`;

  return {
    faqItems,
    html: page(m, {
      headHtml: head(m, { title: M.seo.titulo, description: massagesDescription(m), path, ogTitle: M.seo.titulo_partilha }),
      ld: massagesLD(m, faqItems, path),
      body,
      scripts: ['/site.js']
    })
  };
}
