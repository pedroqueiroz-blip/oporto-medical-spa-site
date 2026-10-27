/* As páginas do site, montadas a partir do conteúdo do backoffice. */
import { esc, eur, minutes, picture, telHref } from './lib.mjs';
import { header, footer, mbar, page, title, maps, MAP_SVG } from './partes.mjs';
import { head, homeDescription, massagesDescription, areaDescription, homeLD, massagesLD, areaLD } from './seo.mjs';

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

// Na página inicial mostram-se a primeira pergunta aberta e as duas seguintes fechadas; as restantes ficam atrás do botão
function faqHtml(m, items, { id, firstOpen = true, collapse = true, visible = 3 }) {
  const d = (x, open) => `<details${open ? ' open' : ''}><summary><h3>${esc(x.q)}</h3></summary><p>${x.html}</p></details>`;
  if (!collapse || items.length <= visible) return `<div class="faq"${id ? ' id="' + id + '"' : ''}>\n        ${items.map((x, i) => d(x, firstOpen && i === 0)).join('\n        ')}\n      </div>`;
  const shown = items.slice(0, visible), rest = items.slice(visible);
  return `<div class="faq" id="${id}">
        ${shown.map((x, i) => d(x, firstOpen && i === 0)).join('\n        ')}
        <div class="faq__more" id="${id}-more" hidden>
          ${rest.map((x) => d(x)).join('\n          ')}
        </div>
        <button type="button" class="more-btn" aria-expanded="false" aria-controls="${id}-more" data-toggle="${id}-more" data-open-label="${m.t('Ver menos')}">${m.t('Ver todas as perguntas')}</button>
      </div>`;
}

function campaignBlock(m, c, extra) {
  const t = m.text;
  const img = c.imagem
    ? `<figure class="arch arch--photo">${picture(c.imagem, { widths: [480, 760, 1040], sizes: '(max-width: 860px) 86vw, 40vw', alt: c.imagem_alt || '' })}</figure>`
    : '<figure class="arch"><figcaption>' + m.t('Fotografia') + ' · <mark class="tbc">' + m.t('a enviar') + '</mark></figcaption></figure>';
  const items = (c.inclui || []).map((x) => '<li>' + t.inline(x) + '</li>');
  if (c.duracao) items.push('<li>' + m.t('Duração') + ': ' + minutes(c.duracao) + '</li>');
  else if (!items.some((x) => /Duração|Duration/.test(x))) items.push('<li><mark class="tbc">' + m.t('Duração: a confirmar') + '</mark></li>');
  /* Campanha só de vouchers (Black Week, Natal…): o botão abre o voucher da campanha, ao preço de campanha */
  const book = c.so_vouchers && c.tratamento
    ? `<a class="btn btn--primary" href="#oferecer" data-voucher="c-${esc(c._id)}">${esc(c.botao || m.t('Oferecer voucher'))}</a>`
    : c.tratamento ? `<button type="button" class="btn btn--primary" data-book="${esc(c.tratamento)}">${esc(c.botao || m.t('Reservar'))}</button>` : `<a class="btn btn--primary" href="#reservar">${esc(c.botao || m.t('Reservar'))}</a>`;
  const cond = (c.condicoes || []).filter(Boolean);
  const h = extra ? 'h3' : 'h2';
  return `<div class="wrap split${extra ? ' camp-extra' : ''}">
      ${img}
      <div style="display:grid;gap:24px">
        ${c.etiqueta ? '<p class="kicker" style="margin:0">' + esc(c.etiqueta) + '</p>' : ''}
        <${h} class="d sig-title">${title(c.titulo, c.titulo_destaque)}${c.assinatura ? '<span class="sig-by">' + esc(c.assinatura) + '</span>' : ''}</${h}>
        ${c.texto ? '<p style="margin:0;font-size:18px;max-width:46ch">' + t.inline(c.texto) + '</p>' : ''}
        ${c.selo ? `<p class="sig-seal"><span class="sig-seal__r" aria-hidden="true">®</span><span>${esc(c.selo_texto)}<br><b>${esc(c.selo_numero)}</b></span></p>` : ''}
        ${items.length ? '<ul>\n          ' + items.join('\n          ') + '\n        </ul>' : ''}
        <div style="display:flex;flex-wrap:wrap;align-items:center;gap:18px 28px">
          <span class="price-d">${c.preco ? esc(eur(c.preco)) + (c.preco_antigo ? '<s><span class="sr-only">' + m.t('Preço normal') + ' </span>' + esc(eur(c.preco_antigo)) + '</s>' : '') : '<mark class="tbc">' + m.t('preço a confirmar') + '</mark>'}</span>
          ${book}
          ${c.so_vouchers ? '' : `<a href="#oferecer" style="font-size:12px;letter-spacing:.2em;text-transform:uppercase;text-decoration:none;border-bottom:1px solid var(--flame);padding-bottom:3px">${m.t('Oferecer')}</a>`}
        </div>
        ${cond.length ? '<ul class="camp-cond">' + cond.map((x) => '<li>' + t.inline(x) + '</li>').join('') + '</ul>' : ''}
      </div>
    </div>`;
}

/* Ritual do mês: com mais de uma campanha ativa, rodam a cada 3 segundos, com pontos por baixo */
function campaignSection(m) {
  const list = [m.campaign, ...(m.extraCampaigns || [])].filter(Boolean);
  if (!list.length) return '';
  if (list.length === 1) return `<section class="section month2" id="campanha">
    ${campaignBlock(m, list[0], false)}
  </section>`;
  const slides = list.map((c, i) => `<div class="camp-slide${i ? '' : ' is-on'}" id="camp-${i + 1}" role="group" aria-roledescription="${m.t('campanha')}" aria-label="${i + 1} ${m.t('de')} ${list.length}">
    ${campaignBlock(m, c, i > 0)}
    </div>`).join('\n    ');
  const dots = list.map((c, i) => `<button type="button" class="camp-dot${i ? '' : ' is-on'}" data-slide="${i}" aria-controls="camp-${i + 1}" aria-label="${m.t('Campanha')} ${i + 1} ${m.t('de')} ${list.length}: ${esc([c.titulo, c.titulo_destaque].filter(Boolean).join(' '))}"${i ? '' : ' aria-current="true"'}></button>`).join('');
  return `<section class="section month2 camp-carousel" id="campanha" aria-roledescription="${m.t('carrossel')}" aria-label="${m.t('Campanhas do mês')}" data-carousel>
    <div class="camp-track">
    ${slides}
    </div>
    <div class="wrap camp-dots"><span class="camp-count" aria-live="polite" data-of="${m.t('de')}">1 ${m.t('de')} ${list.length}</span><span class="camp-dots__row">${dots}</span></div>
  </section>`;
}

function personCard(m, p) {
  const first = p.nome.split(' ')[0];
  const ph = p.foto
    ? `<div class="person__ph person__ph--photo">${picture(p.foto, { widths: [320, 640], sizes: '(max-width: 860px) 46vw, 22vw', alt: m.t('Retrato de') + ' ' + p.nome })}</div>`
    : '';
  return `<article class="person">${ph}<p class="person__role">${esc(p.funcao)}</p><h3>${esc(p.nome)}</h3><p>${esc(p.foco)}</p>${p.credencial ? '<p class="cred">' + m.text.inline(p.credencial) + '</p>' : ''}<button type="button" data-book-with="${esc(p.id)}">${m.t('Marcar com')} ${esc(first)}</button></article>`;
}

export function home(m) {
  const A = m.inicio.avaliacoes || { etiqueta: m.t('Quem já esteve cá'), titulo: m.t('Nas palavras'), titulo_destaque: m.t('de quem saiu mais leve.') };
  const I = m.inicio, t = m.text, s = m.s, mp = maps(m);
  const faqItems = m.faq(I.perguntas.lista);
  const names = m.treatments.map((x) => '<span>' + esc(x.nome) + '</span><i>✦</i>').join('');
  const marquee = m.campaign ? names + '<span>' + esc([m.campaign.titulo, m.campaign.titulo_destaque].filter(Boolean).join(' ')) + '</span><i>✦</i>' : names;
  const ritual = (x) => `<article class="ritual" id="t-${esc(x.id)}">
          <h3>${esc(x.nome)}${x.id === m.campaignTreatment ? ' <a class="camp-badge" href="#campanha">' + m.t('Em campanha') + '</a>' : ''}</h3>
          <p>${t.inline(x.texto)}</p>
          <p class="ritual__price"><span>${minutes(x.duracao)}</span>${x.id === m.campaignTreatment && m.campaignPrice && m.campaignPrice !== x.preco ? '<b class="price-camp">' + eur(m.campaignPrice) + '<s><span class="sr-only">' + m.t('Preço normal') + ' </span>' + eur(x.preco) + '</s></b>' : eur(x.preco)}</p>
          <button type="button" data-book="${esc(x.id)}" aria-label="${m.t('Reservar')} ${esc(x.nome)}">→</button>
        </article>`;
  /* Em cada área mostram-se os primeiros; os restantes abrem com «Descubra todos» */
  const rituals = m.groups.map((g, gi) => {
    const all = m.inGroup(g), n = (g === 'Relaxar' ? I.rituais.mostrar_relaxar || 3 : I.rituais.mostrar || 2);
    const shown = all.slice(0, n), rest = all.slice(n), id = 'mais-' + gi;
    const pg = m.pageFor(g);
    return `<p class="group-t"${gi ? ' style="padding-top:40px"' : ''}>${esc(m.groupName(g))}${pg ? ' <a class="group-t__link" href="' + esc(pg.path) + '">' + esc(pg.nome_menu) + ' →</a>' : ''}</p>
        ${shown.map(ritual).join('\n        ')}${rest.length ? `
        <div class="rituals__more" id="${id}" hidden>
        ${rest.map(ritual).join('\n        ')}
        </div>
        <button type="button" class="more-btn rituals__btn" aria-expanded="false" aria-controls="${id}" data-toggle="${id}" data-open-label="${m.t('Ver menos')}">${esc(m.en ? (I.rituais.botao_todos || 'Discover all') + ' ' + m.groupName(g) + ' treatments' : (I.rituais.botao_todos || 'Descubra todos') + ' para ' + g.toLowerCase())}</button>` : ''}`;
  }).join('\n        ');
  const pillars = (I.casa.pilares || []).map((p, i) => `<li><a class="pillar" href="#${p.tratamento ? 't-' + esc(p.tratamento) : 'rituais'}">${p.imagem ? '<span class="pillar__img">' + picture(p.imagem, { widths: [420, 760], sizes: '(max-width: 640px) 86vw, (max-width: 1100px) 44vw, 22vw', alt: p.imagem_alt || '' }) + '</span>' : ''}<span class="pillars__n" aria-hidden="true">${NUM[i]}</span><h3>${esc(p.titulo)}</h3><p>${t.inline(p.texto)}</p><span class="pillar__cta">${esc(p.botao)} <span aria-hidden="true">→</span></span></a></li>`).join('\n          ');
  const h = I.hero;

  const body = `${header(m, { home: true, current: m.href('/'), alt: m.altPath(m.href('/')) })}

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
            <a class="btn btn--ghost" href="#oferecer">${m.t('Oferecer')}</a>
          </div>
          <address class="hero2__facts">
            ${h.frase_spa ? '<span><i class="d" style="font-size:15px;color:var(--linen)">Spa</i> · ' + t.inline(h.frase_spa).replace(/<em>/g, '<i>').replace(/<\/em>/g, '</i>') + '</span>' : ''}
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
    <div class="wrap house3">
      <div class="house3__head">
        <p class="kicker">${esc(I.casa.etiqueta)}</p>
        <h2 class="d" style="font-size:clamp(40px,5vw,76px)">${title(I.casa.titulo, I.casa.titulo_destaque)}</h2>
        <p class="house2__lead house3__lead">${t.inline(I.casa.texto)}</p>
      </div>
      <ol class="pillars pillars--cards">
          ${pillars}
      </ol>
      ${I.casa.citacao ? '<blockquote class="d house2__quote house3__quote">' + t.inline(I.casa.citacao) + '</blockquote>' : ''}
    </div>
  </section>

  <section class="section" id="rituais" style="padding-top:0">
    <div class="wrap">
      <div class="rit-grid"><div class="rit-main">
      <div class="sh sh--stack">
        <div class="sh__text"><p class="kicker">${esc(I.rituais.etiqueta)}</p><h2 class="d">${title(I.rituais.titulo, I.rituais.titulo_destaque, true)}</h2>
        <p class="prose">${t.inline(I.rituais.texto)}</p></div>
      </div>
      ${I.rituais.mostrar_resumo_precos === false ? '' : `<p class="answer">${I.rituais.resumo_precos ? t.inline(I.rituais.resumo_precos) : esc(m.priceAnswer())}</p>`}

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
          <button type="button" class="more-btn" aria-expanded="false" aria-controls="cmp" data-toggle="cmp" data-open-label="${m.t('Fechar rituais e tratamentos')}">${esc(I.rituais.botao_comparar || m.t('Conheça todos os rituais e tratamentos'))}</button>
        </div>
      </div>
      <div class="cmp-wrap" id="cmp" tabindex="0" role="region" aria-label="${m.t('Comparação de tratamentos')}" hidden>
        <table class="cmp">
          <caption>${m.t('Preços e durações em vigor no')} ${esc(s.nome)}, ${esc(s.localidade)}.</caption>
          <thead><tr><th scope="col">${m.t('Tratamento')}</th><th scope="col">${m.t('Indicado para')}</th><th scope="col">${m.t('Como é')}</th><th scope="col">${m.t('Duração')}</th><th scope="col">${m.t('Preço')}</th></tr></thead>
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
        <p class="prose">${t.inline(I.equipa.texto)}</p>
      </div>
      <div class="team">
        ${m.team.map((p) => personCard(m, p)).join('\n        ')}
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
        <div><p class="kicker">${esc(A.etiqueta)}</p><h2 class="d">${title(A.titulo, A.titulo_destaque)}</h2></div>
      </div>
      <div class="reviews__head">
        ${A.nota_google ? `<span class="reviews__score">${esc(A.nota_google)}</span>
        <span><span class="stars" role="img" aria-label="${esc(A.nota_google)} ${m.t('em 5 estrelas no Google')}">
          ${STARS}
        </span>${A.total_avaliacoes ? `<br><span style="color:var(--oat);font-size:14px">${esc(A.total_avaliacoes)} ${m.t('avaliações no Google')}</span>` : ''}</span>` : ''}
        <a class="btn btn--ghost" style="margin-left:auto" href="${esc(A.perfil_google || mp.reviews)}" rel="noopener" target="_blank">${esc(A.botao || m.t('Ver todas no Google'))}</a>
      </div>
      ${(A.lista || []).length ? `<div class="reviews__grid">
        ${A.lista.map((r) => `<figure class="review review--real">
          <figcaption><b>${r.perfil ? '<a href="' + esc(r.perfil) + '" rel="noopener nofollow" target="_blank">' + esc(r.nome) + '</a>' : esc(r.nome)}</b><span class="review__meta">${r.estrelas ? esc(r.estrelas) + '/5 · ' : ''}${r.data ? esc(r.data) + ' · ' : ''}Google</span></figcaption>
          <blockquote>${esc(r.texto)}</blockquote>
        </figure>`).join('\n        ')}
      </div>` : ''}
      <p class="reviews__note">${t.inline(A.nota || '')}</p>
    </div>
  </section>

  <section class="section trust-band">
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
      ${faqHtml(m, faqItems, { id: 'faq' })}
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
        ${I.como_chegar.referencia || I.como_chegar.texto ? '<details class="visit__more"><summary>' + m.t('+ indicações') + '</summary>' + [I.como_chegar.referencia, I.como_chegar.texto].filter(Boolean).map((x) => '<p class="prose">' + t.inline(x) + '</p>').join('') + '</details>' : ''}
      </div>
      <div class="mapf">
        ${MAP_SVG}
        <span class="mapf__label">${m.t('Mapa interativo carrega só depois de aceitar cookies')}</span>
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

  const path = m.href('/');
  return {
    faqItems,
    html: page(m, {
      headHtml: head(m, { title: I.seo.titulo, description: homeDescription(m), path, ogTitle: I.seo.titulo_partilha, ogDescription: I.seo.descricao_partilha, ogImage: s.imagem_partilha || h.imagem }),
      ld: homeLD(m, faqItems),
      body,
      scripts: [m.en ? '/en/dados.js' : '/dados.js', '/prototype.js', '/pagar.js', '/site.js']
    })
  };
}

export function massages(m) {
  const M = m.massagens, t = m.text, s = m.s, mp = maps(m);
  const relax = m.inGroup('Relaxar');
  const faqItems = m.faq(M.perguntas.lista);
  const path = m.pageFor('Relaxar').path;
  const p = m.range(relax, 'preco'), d = m.range(relax, 'duracao');
  const n = ['', 'uma', 'duas', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito'][relax.length] || String(relax.length);
  const nEN = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'][relax.length] || String(relax.length);
  const summary = !relax.length ? '' : m.en
    ? 'At ' + s.nome + ', in western ' + s.localidade + (s.zona ? ', ' + s.zona : '') + ', there ' + (relax.length > 1 ? 'are ' : 'is ') + nEN + ' relaxation massage' + (relax.length > 1 ? 's' : '') + ': ' +
      m.list(relax.map((x) => x.nome + ' (' + eur(x.preco) + ')')) +
      (d ? (d.min === d.max ? ', ' + d.min + ' minutes long.' : ', from ' + d.min + ' to ' + d.max + ' minutes.') : '.')
    : 'No ' + s.nome + ', no ' + s.localidade + ' ocidental' + (s.zona ? ', ' + s.zona : '') + ', há ' + n + ' massage' + (relax.length > 1 ? 'ns' : 'm') + ' de relaxamento: ' +
      relax.map((x) => x.nome + ' (' + eur(x.preco) + ')').join(', ').replace(/, ([^,]*)$/, ' e $1') +
      (d ? (d.min === d.max ? ', de ' + d.min + ' minutos.' : ', de ' + d.min + ' a ' + d.max + ' minutos.') : '.');

  const body = `${header(m, { home: false, current: path, alt: m.altPath(path) })}

<main>
  <nav class="crumbs wrap" aria-label="${m.t('Está aqui')}"><ol><li><a href="${m.href('/')}">${m.t('Início')}</a></li><li aria-current="page">${esc(m.pageFor('Relaxar').nome_menu)}</li></ol></nav>

  <section class="hero2" id="hero" style="padding-top:clamp(30px,5vw,70px)">
    <div class="hero2__bg" id="glow" aria-hidden="true"></div>
    <div class="wrap">
      <h1><span class="h1-kicker">${esc(M.hero.etiqueta)}</span> <span class="h1-title" style="font-size:clamp(48px,7.5vw,118px)">${title(M.hero.titulo, M.hero.titulo_destaque)}<span class="flame" aria-hidden="true"></span></span></h1>
      <p class="hero2__lead">${summary ? '<strong>' + esc(summary) + '</strong> ' : ''}${t.inline(M.hero.texto)}</p>
      <div class="hero2__cta">
        <a class="btn btn--primary" href="${m.href('/')}#reservar">${esc(M.hero.botao)} <span aria-hidden="true">→</span></a>
        <a class="btn btn--ghost" href="${m.href('/')}#oferecer">${esc(M.hero.botao_oferecer || m.t('Oferecer uma massagem'))}</a>
      </div>
    </div>
  </section>

  ${M.citacao ? `<section class="section" style="padding-top:0;padding-bottom:0">
    <div class="wrap"><blockquote class="d mq">${t.inline(M.citacao)}</blockquote></div>
  </section>` : ''}

  <section class="section" style="padding-top:0">
    <div class="wrap">
      <div class="rituals" style="margin-top:0">
        ${relax.map((x) => `<article class="ritual"><h2 class="d" style="font-size:clamp(26px,2.8vw,36px)">${esc(x.nome)}</h2><p>${t.inline(x.texto_massagens || x.texto)}</p><p class="ritual__price"><span>${minutes(x.duracao)}</span>${eur(x.preco)}</p><button type="button" data-book="${esc(x.id)}" aria-label="${m.t('Reservar')} ${esc(x.nome)}">→</button></article>`).join('\n        ')}
      </div>

      <h2 class="d" style="font-size:clamp(30px,3.4vw,46px);margin-top:80px">${title(M.escolher_titulo, M.escolher_destaque)}</h2>
      <div class="cmp-wrap" style="margin-top:24px" tabindex="0" role="region" aria-label="${m.t('Comparação de massagens')}">
        <table class="cmp">
          <caption>${m.t('Massagens de relaxamento no')} ${esc(s.nome)}, ${esc(s.localidade)}. ${m.t('Preços em vigor.')}</caption>
          <thead><tr><th scope="col">${m.t('Massagem')}</th><th scope="col">${m.t('Ideal para')}</th><th scope="col">${m.t('Pressão')}</th><th scope="col">${m.t('Duração')}</th><th scope="col">${m.t('Preço')}</th></tr></thead>
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
      ${faqHtml(m, faqItems, { collapse: false })}
    </div>
  </section>

  <section class="section">
    <div class="wrap visitus">
      <div>
        <p class="kicker">${m.t('Onde estamos')}</p>
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
        <div class="mapf__go"><a href="${esc(mp.google)}" target="_blank" rel="noopener">${m.t('Como chegar')}</a></div>
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

/* Página de uma área (fisioterapia, Pilates, drenagem…): resposta direta com preços, tratamentos, tabela, perguntas e morada */
export function areaPage(m, P) {
  const t = m.text, s = m.s, mp = maps(m), M = m.massagens;
  const list = m.inGroup(P.grupo);
  const faqItems = m.faq((P.perguntas || {}).lista, P.grupo);
  const path = P.path;
  const summary = areaSummary(m, P);
  const others = [m.pageFor('Relaxar'), ...m.areaPages].filter((x) => x && x.path !== path);

  const body = `${header(m, { home: false, current: path, alt: m.altPath(path) })}

<main>
  <nav class="crumbs wrap" aria-label="${m.t('Está aqui')}"><ol><li><a href="${m.href('/')}">${m.t('Início')}</a></li><li aria-current="page">${esc(P.nome_menu || P.titulo)}</li></ol></nav>

  <section class="hero2" id="hero" style="padding-top:clamp(30px,5vw,70px)">
    <div class="hero2__bg" id="glow" aria-hidden="true"></div>
    <div class="wrap">
      <h1><span class="h1-kicker">${esc(P.etiqueta)}</span> <span class="h1-title" style="font-size:clamp(44px,7vw,110px)">${title(P.titulo, P.titulo_destaque)}<span class="flame" aria-hidden="true"></span></span></h1>
      <p class="hero2__lead">${summary ? '<strong>' + esc(summary) + '</strong> ' : ''}${t.inline(P.texto)}</p>
      <div class="hero2__cta">
        <a class="btn btn--primary" href="${m.href('/')}#reservar">${esc(P.botao || m.t('Reservar'))} <span aria-hidden="true">→</span></a>
        <a class="btn btn--ghost" href="${m.href('/')}#oferecer">${esc(P.botao_oferecer || m.t('Oferecer'))}</a>
      </div>
    </div>
  </section>

  ${P.citacao ? `<section class="section" style="padding-top:0;padding-bottom:0">
    <div class="wrap"><blockquote class="d mq">${t.inline(P.citacao)}</blockquote></div>
  </section>` : ''}

  <section class="section" style="padding-top:0">
    <div class="wrap">
      <div class="rituals" style="margin-top:0">
        ${list.map((x) => `<article class="ritual" id="t-${esc(x.id)}"><h2 class="d" style="font-size:clamp(26px,2.8vw,36px)">${esc(x.nome)}</h2><p>${t.inline(x.texto_pagina || x.texto)}</p><p class="ritual__price"><span>${minutes(x.duracao)}</span>${eur(x.preco)}</p><button type="button" data-book="${esc(x.id)}" aria-label="${m.t('Reservar')} ${esc(x.nome)}">→</button></article>`).join('\n        ')}
      </div>

      ${list.length > 1 ? `<h2 class="d" style="font-size:clamp(30px,3.4vw,46px);margin-top:80px">${title(P.tabela_titulo || m.t('Que tratamento'), P.tabela_destaque || m.t('escolher?'))}</h2>
      <div class="cmp-wrap" style="margin-top:24px" tabindex="0" role="region" aria-label="${m.t('Comparação de tratamentos')}">
        <table class="cmp">
          <caption>${esc(cap(P.resumo_tipo || m.groupName(P.grupo)))} ${m.t('no')} ${esc(s.nome)}, ${esc(s.localidade)}. ${m.t('Preços em vigor.')}</caption>
          <thead><tr><th scope="col">${m.t('Tratamento')}</th><th scope="col">${m.t('Indicado para')}</th><th scope="col">${m.t('Como é')}</th><th scope="col">${m.t('Duração')}</th><th scope="col">${m.t('Preço')}</th></tr></thead>
          <tbody>
            ${[...list].sort((a, b) => a.preco - b.preco).map((x) => `<tr><th scope="row">${esc(x.nome)}</th><td>${esc(x.indicado_para || '')}</td><td>${esc(x.como_e || '')}</td><td class="num">${minutes(x.duracao)}</td><td class="num">${eur(x.preco)}</td></tr>`).join('\n            ')}
          </tbody>
        </table>
      </div>` : ''}
      ${P.nota ? '<p class="prose" style="max-width:70ch">' + t.inline(P.nota) + '</p>' : ''}
    </div>
  </section>

  ${faqItems.length ? `<section class="section visit" id="perguntas">
    <div class="wrap split" style="align-items:start">
      <div>
        <p class="kicker">${esc(P.perguntas.etiqueta || m.t('Perguntas'))}</p>
        <h2 class="d" style="font-size:clamp(34px,4vw,56px)">${esc(P.perguntas.titulo || m.t('Antes de reservar.'))}</h2>
      </div>
      ${faqHtml(m, faqItems, { collapse: false })}
    </div>
  </section>` : ''}

  <section class="section">
    <div class="wrap visitus">
      <div>
        <p class="kicker">${m.t('Onde estamos')}</p>
        <h2 class="d" style="font-size:clamp(32px,4vw,54px)">${title(M.onde_titulo, M.onde_destaque)}</h2>
        <address>
          <strong style="font-weight:500">${esc(s.nome)}</strong>
          <span>${esc(s.rua)}</span>
          <span>${esc(s.codigo_postal + ' ' + s.localidade)}</span>
          <a href="${telHref(s.telefone)}">${esc(s.telefone)}</a>
        </address>
        ${M.onde_texto ? '<p class="prose">' + t.inline(M.onde_texto) + '</p>' : ''}
        ${others.length ? '<p class="prose area-links">' + m.t('Também no') + ' ' + esc(s.nome) + ': ' + others.map((o) => '<a href="' + esc(o.path) + '">' + esc(o.nome_menu) + '</a>').join(' · ') + '</p>' : ''}
      </div>
      <div class="mapf">
        ${MAP_SVG}
        <div class="mapf__pin"><img src="/logo-beige.svg" alt="" width="29" height="53" loading="lazy"><span></span></div>
        <div class="mapf__go"><a href="${esc(mp.google)}" target="_blank" rel="noopener">${m.t('Como chegar')}</a></div>
      </div>
    </div>
  </section>
</main>

${footer(m, { home: false })}

${mbar(m, { home: false })}`;

  return {
    faqItems,
    html: page(m, {
      headHtml: head(m, { title: P.seo.titulo, description: areaDescription(m, P), path, ogTitle: P.seo.titulo_partilha }),
      ld: areaLD(m, P, faqItems),
      body,
      scripts: ['/site.js']
    })
  };
}

const cap = (x) => String(x || '').charAt(0).toUpperCase() + String(x || '').slice(1);

/* Frase-resposta do topo (BLUF), pensada para ser citada pelos motores de IA */
export function areaSummary(m, P) {
  const s = m.s, list = m.inGroup(P.grupo);
  if (!list.length) return '';
  const d = m.range(list, 'duracao');
  if (m.en) return 'At ' + s.nome + ', in western ' + s.localidade + (s.zona ? ', ' + s.zona : '') + ', ' +
    'our ' + (P.resumo_tipo || m.groupName(P.grupo).toLowerCase()) + ' treatments are ' +
    m.list(list.map((x) => x.nome + ' (' + eur(x.preco) + ')')) +
    (d ? (d.min === d.max ? ', in ' + d.min + '-minute sessions.' : ', in sessions of ' + d.min + ' to ' + d.max + ' minutes.') : '.');
  return 'No ' + s.nome + ', no ' + s.localidade + ' ocidental' + (s.zona ? ', ' + s.zona : '') + ', ' +
    'os tratamentos de ' + (P.resumo_tipo || P.grupo.toLowerCase()) + ' são ' +
    list.map((x) => x.nome + ' (' + eur(x.preco) + ')').join(', ').replace(/, ([^,]*)$/, ' e $1') +
    (d ? (d.min === d.max ? ', sessões de ' + d.min + ' minutos.' : ', sessões de ' + d.min + ' a ' + d.max + ' minutos.') : '.');
}

/* Privacidade e Termos (content/legais/), editados no backoffice. Cada secção: parágrafos separados por uma
   linha em branco; linhas começadas por «- » fazem uma lista. */
export function legalPage(m, L, path) {
  const t = m.text;
  const blocos = (txt) => String(txt || '').split(/\n\s*\n/).map((b) => {
    const linhas = b.split('\n').map((l) => l.trim()).filter(Boolean);
    return linhas.length && linhas.every((l) => l.startsWith('- '))
      ? '<ul>' + linhas.map((l) => '<li>' + t.inline(l.slice(2)) + '</li>').join('') + '</ul>'
      : '<p>' + linhas.map((l) => t.inline(l)).join('<br>') + '</p>';
  }).join('\n');
  const data = L.atualizado ? new Date(String(L.atualizado).slice(0, 10) + 'T12:00:00Z').toLocaleDateString(m.en ? 'en-GB' : 'pt-PT', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Lisbon' }) : '';
  const seccoes = (L.seccoes || []).map((s, i) => `<section><h2>${i + 1}. ${esc(s.titulo)}</h2>\n${blocos(s.texto)}</section>`).join('\n');
  const body = `${header(m, { home: false, current: path, alt: m.altPath(path) })}
<main class="wrap pg-pagina legal">
  <p class="kicker">${esc(m.s.nome)}</p>
  <h1 class="d">${esc(L.titulo)}</h1>
  ${data ? `<p class="legal__data">${m.t('Atualizado a')} ${esc(data)}</p>` : ''}
  ${L.introducao ? blocos(L.introducao) : ''}
  ${seccoes}
</main>
${footer(m, { home: false })}`;
  return page(m, {
    headHtml: head(m, { title: L.titulo + ' · ' + m.s.nome, description: t.plain(L.introducao || '').slice(0, 155) || L.titulo, path }),
    ld: '', body, scripts: []
  });
}
