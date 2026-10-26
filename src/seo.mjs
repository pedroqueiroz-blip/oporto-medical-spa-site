/* SEO e GEO gerados a partir do conteúdo: título, descrição, Open Graph, JSON-LD, sitemap, robots e llms.txt.
   Nada aqui se edita à mão: muda quando mudam os preços, a equipa, a campanha ou os contactos. */
import { eur, minutes, telE164, esc, listPT } from './lib.mjs';

const clip = (s, n = 158) => {
  s = String(s || '').replace(/\s+/g, ' ').trim();
  if (s.length <= n) return s;
  return s.slice(0, s.lastIndexOf(' ', n - 1)).replace(/[,.;:·\s]+$/, '') + '…';
};
const abs = (m, p) => !p ? '' : /^https?:/.test(p) ? p : m.s.url + (p.startsWith('/') ? p : '/' + p);
const price2 = (n) => Number(n).toFixed(2);
/* Chave pública do IndexNow (Bing, que alimenta o Copilot e a pesquisa do ChatGPT): publicada em /<chave>.txt */
export const INDEXNOW_KEY = '5f0c2e8a9b6d4e31a7c3d18e2f94b6a0';

export function homeDescription(m) {
  const own = m.inicio.seo.descricao;
  if (own) return clip(own);
  const r = m.relaxRange;
  const camp = m.campaign && m.campaign.titulo ? ' ' + [m.campaign.titulo, m.campaign.titulo_destaque].filter(Boolean).join(' ') + '.' : '';
  if (m.en) {
    const others = [...new Set(m.treatments.filter((t) => t.grupo !== 'Relaxar').map((t) => t.tipo_servico).filter(Boolean))];
    const offer = (r ? ['relaxation massages from ' + eur(r.min)] : []).concat(others);
    const d = 'Medical spa in ' + m.s.localidade + (m.s.zona ? ', ' + m.s.zona : '') + '.' + (offer.length ? ' ' + m.list(offer).replace(/^./, (c) => c.toUpperCase()) + '.' : '');
    return fit([d + camp + ' Book online.', d + camp, d + ' Book online.', d]);
  }
  const lower = (x) => /^Pilates/.test(x) ? x : x.charAt(0).toLowerCase() + x.slice(1);
  const others = [...new Set(m.treatments.filter((t) => t.grupo !== 'Relaxar').map((t) => lower(t.tipo_servico)))];
  const offer = (r ? ['massagens de relaxamento desde ' + eur(r.min)] : []).concat(others);
  let d = 'Medical spa no ' + m.s.localidade + (m.s.zona ? ', ' + m.s.zona : '') + '.' +
    (offer.length ? ' ' + listPT(offer).replace(/^./, (c) => c.toUpperCase()) + '.' : '');
  return fit([d + camp + ' Reserve online.', d + camp, d + ' Reserve online.', d]);
}

/* Primeira versão que cabe no Google (cerca de 158 caracteres); se nenhuma couber, corta a última */
function fit(options) {
  return options.find((x) => x.length <= 158) || clip(options[options.length - 1]);
}

export function massagesDescription(m) {
  const own = m.massagens.seo.descricao;
  if (own) return clip(own);
  const relax = m.inGroup('Relaxar');
  const d = (m.en ? 'Relaxation massages in ' : 'Massagens de relaxamento no ') + m.s.localidade + (m.s.zona ? ', ' + m.s.zona : '');
  const list = relax.map((t) => t.nome + ' ' + eur(t.preco)).join(', ');
  const book = m.en ? ' Book online.' : ' Reserve online.';
  return fit([d + ': ' + list + '.' + book, d + ': ' + list + '.', d + '.' + book]);
}

export function areaDescription(m, P) {
  const own = P.seo && P.seo.descricao;
  if (own) return clip(own);
  const list = m.inGroup(P.grupo);
  const d = (P.resumo_tipo ? P.resumo_tipo.charAt(0).toUpperCase() + P.resumo_tipo.slice(1) : m.groupName(P.grupo)) + (m.en ? ' in ' : ' no ') + m.s.localidade + (m.s.zona ? ', ' + m.s.zona : '');
  const items = list.map((t) => t.nome + ' ' + eur(t.preco)).join(', ');
  const book = m.en ? ' Book online.' : ' Reserve online.';
  return fit([d + ': ' + items + '.' + book, d + ': ' + items + '.', d + '.' + book]);
}

/* hreflang: com a versão inglesa pública (m.enPublic), cada página aponta para a sua par na outra língua */
export function head(m, { title, description, path, ogTitle, ogDescription, ogImage, hreflang }) {
  const url = m.s.url + path;
  const img = abs(m, ogImage || m.s.imagem_partilha || '/img/massagem-pindas-760.webp');
  const alt = m.altPath && m.altPath(path);
  if (!hreflang && m.enPublic && alt) {
    const pt = m.s.url + (m.en ? alt : path), en = m.s.url + (m.en ? path : alt);
    hreflang = { 'pt-PT': pt, en, 'x-default': pt };
  }
  const indexar = m.s.indexar && (!m.en || m.enPublic);
  const tags = [
    '<meta charset="utf-8">',
    indexar ? '<meta name="robots" content="index, follow, max-image-preview:large">' : '<meta name="robots" content="noindex, nofollow">',
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
    '<title>' + esc(title) + '</title>',
    '<meta name="description" content="' + esc(description) + '">',
    '<link rel="canonical" href="' + esc(url) + '">',
    ...Object.entries(hreflang || { 'pt-PT': url, 'x-default': url }).map(([l, u]) => '<link rel="alternate" hreflang="' + l + '" href="' + esc(u) + '">'),
    '<meta property="og:type" content="website">',
    '<meta property="og:locale" content="' + (m.en ? 'en_GB' : 'pt_PT') + '">',
    '<meta property="og:site_name" content="' + esc(m.s.nome) + '">',
    '<meta property="og:title" content="' + esc(ogTitle || title) + '">',
    '<meta property="og:description" content="' + esc(ogDescription || description) + '">',
    '<meta property="og:url" content="' + esc(url) + '">',
    '<meta property="og:image" content="' + esc(img) + '">',
    '<meta name="twitter:card" content="summary_large_image">',
    '<meta name="theme-color" content="#0D0A08">',
    '<meta name="geo.region" content="' + esc(m.s.pais + '-13') + '">',
    '<meta name="geo.placename" content="' + esc(m.s.localidade) + '">'
  ];
  if (m.s.latitude && m.s.longitude) {
    tags.push('<meta name="geo.position" content="' + esc(m.s.latitude + ';' + m.s.longitude) + '">');
    tags.push('<meta name="ICBM" content="' + esc(m.s.latitude + ', ' + m.s.longitude) + '">');
  }
  return tags.join('\n');
}

function openingHours(m) {
  const h = m.s.horario || {};
  const out = [{ '@type': 'OpeningHoursSpecification', dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], opens: h.semana_abre, closes: h.semana_fecha }];
  if (h.sabado_aberto) out.push({ '@type': 'OpeningHoursSpecification', dayOfWeek: 'Saturday', opens: h.sabado_abre, closes: h.sabado_fecha });
  return out;
}

function offer(m, t) {
  const o = { '@type': 'Offer', itemOffered: { '@type': 'Service', name: t.nome_completo + (t.duracao ? ' (' + minutes(t.duracao) + ')' : ''), serviceType: t.tipo_servico } };
  if (t.descricao_seo) o.itemOffered.description = t.descricao_seo + (t.duracao ? ' ' + t.duracao + (m.en ? ' minutes.' : ' minutos.') : '');
  if (t.preco) { o.price = price2(t.preco); o.priceCurrency = 'EUR'; }
  return o;
}

function campaignOffer(m, c = m.campaign) {
  if (!c) return null;
  const name = [c.titulo, c.titulo_destaque, c.assinatura].filter(Boolean).join(' ');
  const o = { '@type': 'Offer', itemOffered: { '@type': 'Service', name, serviceType: c.tipo_servico || m.t('Massagem') } };
  const d = [m.text.plain(c.texto), c.selo && c.selo_texto ? c.selo_texto + (c.selo_numero ? ', ' + c.selo_numero : '') + '.' : ''].filter(Boolean).join(' ');
  if (d) o.itemOffered.description = d;
  if (c.preco) { o.price = price2(c.preco); o.priceCurrency = 'EUR'; }
  if (c.inicio) o.validFrom = c.inicio.slice(0, 10);
  if (c.fim) o.validThrough = c.fim.slice(0, 10);
  if (c.imagem) o.image = abs(m, c.imagem);
  return o;
}

export function business(m) {
  const s = m.s;
  const id = s.url + '/#spa';
  const images = [s.imagem_partilha, m.inicio.hero.imagem, m.inicio.visita.imagem, m.inicio.casa.imagem, ...m.campaigns.map((c) => c.imagem)].filter(Boolean).map((p) => abs(m, p));
  const b = {
    '@type': ['DaySpa', 'Physiotherapy'],
    '@id': id,
    name: s.nome,
    description: s.descricao_negocio,
    url: s.url + '/',
    logo: s.url + '/logo-brown.svg',
    image: [...new Set(images)],
    telephone: telE164(s.telefone),
    email: s.email,
    currenciesAccepted: 'EUR',
    address: { '@type': 'PostalAddress', streetAddress: s.rua, postalCode: s.codigo_postal, addressLocality: s.localidade, addressRegion: s.regiao, addressCountry: s.pais },
    hasMap: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(s.nome + ' ' + m.addressLine),
    openingHoursSpecification: openingHours(m),
    areaServed: (s.areas_servidas || []).map((a) => ({ '@type': /,/.test(a) ? 'Place' : 'City', name: a })),
    amenityFeature: (s.comodidades || []).filter((a) => !m.text.hasTbc(a)).map((a) => ({ '@type': 'LocationFeatureSpecification', name: a, value: true })),
    knowsAbout: s.conhecimentos || [],
    memberOf: (s.afiliacoes || []).map((a) => ({ '@type': 'Organization', name: a }))
  };
  if (m.allRange) b.priceRange = m.allRange.min === m.allRange.max ? eur(m.allRange.min) : eur(m.allRange.min) + ' – ' + eur(m.allRange.max);
  if (s.latitude && s.longitude) b.geo = { '@type': 'GeoCoordinates', latitude: Number(s.latitude), longitude: Number(s.longitude) };
  const same = (s.redes || []).map((r) => (typeof r === 'string' ? r : r.url)).filter((u) => /^https?:\/\//.test(u || ''));
  if (same.length) b.sameAs = same;
  if (s.telemovel) b.contactPoint = [{ '@type': 'ContactPoint', telephone: telE164(s.telemovel), contactType: 'reservations', availableLanguage: m.enPublic ? ['pt', 'en'] : ['pt'] }];
  const offers = [...m.campaigns.map((c) => campaignOffer(m, c)), ...m.treatments.map((t) => offer(m, t))].filter(Boolean);
  b.hasOfferCatalog = { '@type': 'OfferCatalog', name: m.t('Rituais e tratamentos'), itemListElement: offers };
  /* A equipa só entra nos dados estruturados quando os nomes estão confirmados */
  if (m.teamConfirmed) {
    b.employee = m.team.map((p) => {
      const o = { '@type': 'Person', name: p.nome, jobTitle: p.funcao };
      if (p.conhece && p.conhece.length) o.knowsAbout = p.conhece;
      if (p.foto) o.image = abs(m, p.foto);
      if (p.cedula) o.hasCredential = { '@type': 'EducationalOccupationalCredential', credentialCategory: m.t('Cédula profissional'), identifier: p.cedula, recognizedBy: { '@type': 'Organization', name: 'Ordem dos Fisioterapeutas' } };
      return o;
    });
  }
  return b;
}

function faqPage(id, items) {
  const qs = items.filter((x) => x.plain);
  if (!qs.length) return null;
  return { '@type': 'FAQPage', '@id': id, mainEntity: qs.map((x) => ({ '@type': 'Question', name: x.qSeo, acceptedAnswer: { '@type': 'Answer', text: x.plain } })) };
}

export function homeLD(m, faqItems) {
  const graph = [
    business(m),
    { '@type': 'WebSite', '@id': m.s.url + '/#site', url: m.s.url + '/', name: m.s.nome, inLanguage: m.enPublic ? ['pt-PT', 'en'] : ['pt-PT'], publisher: { '@id': m.s.url + '/#spa' } },
    faqPage(m.s.url + m.href('/') + '#faq', faqItems)
  ].filter(Boolean);
  return ld(graph);
}

export function massagesLD(m, faqItems, path) {
  const relax = m.inGroup('Relaxar');
  const url = m.s.url + path;
  const graph = [
    {
      '@type': 'Service',
      '@id': url + '#servico',
      name: m.t('Massagem de relaxamento') + (m.en ? ' in ' : ' no ') + m.s.localidade,
      serviceType: m.t('Massagem de relaxamento'),
      description: m.t('Massagens manuais de relaxamento em sala privada, com ritual do chá à chegada:') + ' ' + m.list(relax.map((t) => t.nome)) + '.',
      provider: { '@id': m.s.url + '/#spa' },
      areaServed: (m.s.areas_servidas || []).slice(0, 3).map((a) => ({ '@type': /,/.test(a) ? 'Place' : 'City', name: a })),
      offers: relax.map((t) => ({ '@type': 'Offer', name: t.nome_completo + ' (' + minutes(t.duracao) + ')', price: price2(t.preco), priceCurrency: 'EUR' }))
    },
    { '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: m.t('Início'), item: m.s.url + m.href('/') },
      { '@type': 'ListItem', position: 2, name: m.pageFor('Relaxar').nome_menu, item: url }
    ] },
    faqPage(url + '#perguntas', faqItems)
  ].filter(Boolean);
  return ld(graph);
}

export function areaLD(m, P, faqItems) {
  const list = m.inGroup(P.grupo);
  const url = m.s.url + P.path;
  const graph = [
    {
      '@type': 'Service',
      '@id': url + '#servico',
      name: (P.nome_menu || P.titulo),
      serviceType: P.resumo_tipo || m.groupName(P.grupo),
      description: m.text.plain(P.texto),
      provider: { '@id': m.s.url + '/#spa' },
      areaServed: (m.s.areas_servidas || []).slice(0, 3).map((a) => ({ '@type': /,/.test(a) ? 'Place' : 'City', name: a })),
      offers: list.map((t) => offer(m, t))
    },
    { '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: m.t('Início'), item: m.s.url + m.href('/') },
      { '@type': 'ListItem', position: 2, name: P.nome_menu || P.titulo, item: url }
    ] },
    faqPage(url + '#perguntas', faqItems)
  ].filter(Boolean);
  return ld(graph);
}

function ld(graph) {
  const json = JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }, null, 2).replace(/</g, '\\u003c');
  return '<script type="application/ld+json">\n' + json + '\n</script>';
}

export function robots(m) {
  if (!m.s.indexar) return 'User-agent: *\nDisallow: /admin/\n';
  return 'User-agent: *\nAllow: /\nDisallow: /admin/\n\nSitemap: ' + m.s.url + '/sitemap.xml\n';
}

/* lastmod: o dia da última alteração publicada (backoffice ou código) ou, se for mais recente,
   o dia em que uma campanha entrou ou saiu. Não muda em reconstruções sem alterações. */
export function sitemap(m, pages) {
  const day = [m.changed, ...m.campaignDays].filter(Boolean).sort().pop() || m.day;
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    pages.map((p) => '  <url><loc>' + esc(m.s.url + p) + '</loc><lastmod>' + day + '</lastmod></url>').join('\n') + '\n</urlset>\n';
}

export function headers(m) {
  let out = '/admin/*\n  X-Robots-Tag: noindex, nofollow\n  Cache-Control: no-cache\n';
  if (!m.s.indexar) out = '/*\n  X-Robots-Tag: noindex, nofollow\n' + out;
  return out;
}

/* llms.txt: resumo factual do negócio para assistentes de IA (GEO) */
export function llms(m, faqItems) {
  const s = m.s;
  const lines = ['# ' + s.nome, '', '> ' + s.descricao_negocio, '',
    '## Contactos', '',
    '- Morada: ' + m.addressLine + (s.zona ? ' (' + s.zona + ')' : ''),
    '- Telefone: ' + s.telefone + (s.telemovel ? ' · Telemóvel: ' + s.telemovel : ''),
    '- Email: ' + s.email,
    '- Horário: ' + m.hoursShort + (s.horario && s.horario.sabado_aberto ? ' · Domingo fechado' : ' · Sábado e domingo fechado'),
    '- Reservas e vouchers: ' + s.url + '/#reservar', ''];
  if (m.campaigns.length) {
    lines.push(m.campaigns.length > 1 ? '## Campanhas em vigor' : '## Campanha em vigor', '');
    m.campaigns.forEach((c) => lines.push('- ' + [c.titulo, c.titulo_destaque, c.assinatura].filter(Boolean).join(' ') +
      (c.preco ? ': ' + eur(c.preco) : '') + (c.duracao ? ', ' + minutes(c.duracao) : '') + (c.fim ? ' (até ' + c.fim.slice(0, 10) + ')' : '')));
    lines.push('');
  }
  lines.push('## Tratamentos e preços', '');
  m.groups.forEach((g) => {
    m.inGroup(g).forEach((t) => lines.push('- ' + t.nome_completo + ' (' + g.toLowerCase() + '): ' + eur(t.preco) + ', ' + minutes(t.duracao) + '. ' + (t.descricao_seo || '')));
  });
  lines.push('', '## Páginas', '', '- [Início](' + s.url + '/)', '- [Massagens de relaxamento no Porto](' + s.url + '/massagens-porto/)',
    ...m.areaPages.map((p) => '- [' + p.nome_menu + '](' + s.url + p.path + ')'), '');
  const qs = faqItems.filter((x, i) => x.plain && faqItems.findIndex((y) => y.qSeo === x.qSeo) === i);
  if (qs.length) { lines.push('## Perguntas frequentes', ''); qs.forEach((x) => lines.push('**' + x.qSeo + '**', x.plain, '')); }
  return lines.join('\n');
}
