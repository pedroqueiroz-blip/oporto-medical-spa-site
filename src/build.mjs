/* Build do site: content/*.json + public/ → dist/. Corre no Netlify a cada publicação (node src/build.mjs). */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, PUBLIC, readList, readJSON } from './lib.mjs';
import { loadModel } from './modelo.mjs';
import { home, massages, areaPage, legalPage } from './paginas.mjs';
import { robots, sitemap, headers, llms, head, INDEXNOW_KEY } from './seo.mjs';
import { page, header, footer } from './partes.mjs';
import { withGoogle } from './google.mjs';
import { adminConfigEN } from './admin-en.mjs';

const DIST = path.join(ROOT, 'dist');
fs.rmSync(DIST, { recursive: true, force: true });
fs.cpSync(PUBLIC, DIST, { recursive: true });

/* OMS_HOJE=2026-11-25 node src/build.mjs gera o site como nesse dia (para ver campanhas futuras) */
const hoje = process.env.OMS_HOJE ? new Date(process.env.OMS_HOJE + 'T12:00:00Z') : undefined;
const m = loadModel(hoje);
const mEN = loadModel(hoje, 'en');
if (m.inicio.avaliacoes) m.inicio.avaliacoes = await withGoogle(m.inicio.avaliacoes, m);
/* As avaliações do Google ficam como foram escritas; em inglês só mudam a etiqueta, o título e o botão */
if (mEN.inicio.avaliacoes) mEN.inicio.avaliacoes = { ...m.inicio.avaliacoes, ...Object.fromEntries(['etiqueta', 'titulo', 'titulo_destaque', 'botao', 'nota'].map((k) => [k, mEN.inicio.avaliacoes[k]])),
  nota_google: String(m.inicio.avaliacoes.nota_google || '').replace(',', '.') };

/* Versão inglesa (/en/). Pública só com «Versão inglesa no site» ligada no backoffice: aí entra no Google e o
   botão EN fica ativo. Nas pré-visualizações do Netlify o botão EN funciona sempre, para rever antes de ligar. */
const enPublic = !!m.s.ingles;
const enLink = enPublic || process.env.CONTEXT !== 'production';
const LEGAIS = { privacidade: { pt: '/privacidade/', en: '/en/privacy/' }, termos: { pt: '/termos/', en: '/en/terms/' } };
const pares = [['/', '/en/'], [m.pageFor('Relaxar').path, mEN.pageFor('Relaxar').path],
  ...m.areaPages.map((P) => [P.path, (mEN.areaPages.find((x) => x._id === P._id) || {}).path]).filter((x) => x[1]),
  ...Object.values(LEGAIS).map((x) => [x.pt, x.en])];
for (const [mm, i, o] of [[m, 0, 1], [mEN, 1, 0]]) {
  Object.assign(mm, {
    enPublic, enLink,
    altPath: (p) => (pares.find((x) => x[i] === p) || [])[o] || null,
    legalPath: (nome) => (LEGAIS[nome] || { pt: '/' + nome + '/', en: '/en/' + nome + '/' })[mm.en ? 'en' : 'pt']
  });
}
const write = (rel, data) => {
  const f = path.join(DIST, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, data);
};

const h = home(m);
const ms = massages(m);
write('index.html', h.html);
write('massagens-porto/index.html', ms.html);
const areas = m.areaPages.map((P) => { const a = areaPage(m, P); write(P.path.slice(1) + 'index.html', a.html); return a; });

/* Privacidade e Termos (content/legais/) */
const legais = readJSON('legais');
for (const [nome, L] of Object.entries(legais)) write(nome + '/index.html', legalPage(m, L, m.legalPath(nome)));

/* Versão inglesa: as mesmas páginas por baixo de /en/, com os preços à inglesa (€35, €12.50) */
const writeEN = (rel, html) => write(rel, html.replace(/(\d+)(?:,(\d{2}))? €/g, (x, e, c) => '€' + e + (c ? '.' + c : '')));
writeEN('en/index.html', home(mEN).html);
writeEN(mEN.pageFor('Relaxar').path.slice(1) + 'index.html', massages(mEN).html);
mEN.areaPages.forEach((P) => writeEN(P.path.slice(1) + 'index.html', areaPage(mEN, P).html));
for (const [nome, L] of Object.entries(readJSON('legais', 'en'))) writeEN(mEN.legalPath(nome).slice(1) + 'index.html', legalPage(mEN, L, mEN.legalPath(nome)));

/* Página de regresso do pagamento com cartão (fora do Google) */
write('pagamento/index.html', page(m, {
  headHtml: head(m, { title: 'Pagamento · ' + m.s.nome, description: 'Estado do pagamento da sua marcação ou voucher.', path: '/pagamento/' })
    .replace(/<meta name="robots"[^>]*>/, '<meta name="robots" content="noindex, nofollow">'),
  ld: '',
  body: header(m, { home: false, current: '/' }) + '\n<main class="wrap pg-pagina"><div id="pagamento-estado"><p class="bk-note">A carregar…</p></div></main>\n' + footer(m, { home: false }),
  scripts: ['/pagar.js']
}));

/* Dados para a agenda e os vouchers (prototype.js) */
const dados = {
  treatments: m.treatments.map((t) => {
    /* Tratamento em campanha: preço de campanha, com o normal guardado para aparecer riscado */
    const camp = t.id === m.campaignTreatment && m.campaignPrice && m.campaignPrice !== t.preco;
    return { id: t.id, area: t.grupo, name: t.nome, min: t.duracao, price: camp ? m.campaignPrice : t.preco, oldPrice: camp ? t.preco : null, camp: !!camp, text: t.texto };
  }),
  /* Indicação de cada área, igual à do cartão em «Cuidar de si» (aparece à frente da área na agenda, no computador) */
  areaText: Object.fromEntries(((m.inicio.casa || {}).pilares || []).filter((p) => p.titulo && p.texto).map((p) => [p.titulo, m.text.plain(p.texto)])),
  spa: (() => {
    const h = m.s.horario || {}, f = (x) => String(x || '').replace(/^0/, '').replace(':', 'h');
    return { telefone: m.s.telefone, horario: '2.ª a 6.ª ' + f(h.semana_abre) + '–' + f(h.semana_fecha) + (h.sabado_aberto ? ', sábado ' + f(h.sabado_abre) + '–' + f(h.sabado_fecha) : '') };
  })(),
  /* Vouchers de campanha em vigor (Black Week, Natal…): aparecem primeiro na escolha do voucher */
  campaignVouchers: [m.campaign, ...m.extraCampaigns].filter((c) => c && c.so_vouchers && c.tratamento && c.preco && m.byId(c.tratamento)).map((c) => {
    const t = m.byId(c.tratamento);
    return { id: 'c-' + c._id, camp: c._id, treatment: t.id, area: t.grupo, name: t.nome_completo || t.nome, label: (c.etiqueta || 'Campanha').split(' · ')[0], min: c.duracao || t.duracao, price: c.preco, oldPrice: c.preco_antigo || null, text: t.texto, camp_title: [c.titulo, c.titulo_destaque].filter(Boolean).join(' ') };
  }),
  team: m.team.map((p, i) => ({ id: p.id, name: p.nome, role: p.funcao, focus: p.foco, bio: p.bio, does: p.faz || [], tone: (i % 4) + 1, photo: p.foto || '' }))
};
write('dados.js', '/* Gerado no build a partir do backoffice. Não editar. */\nwindow.OMS_DATA = ' + JSON.stringify(dados) + ';\n');

/* Catálogo para o servidor de pagamentos (netlify/functions): os mesmos preços que o site mostra.
   Relaxar fatura como TPREV (Terapêuticas de Prevenção), o resto como TREAB (Reabilitação). */
const PAGINAS = ['/', '/massagens-porto/', ...m.areaPages.map((p) => p.path)];
const PAGINAS_EN = enPublic ? PAGINAS.map((p) => m.altPath(p)).filter(Boolean) : [];
const catalogo = {
  gerado: new Date().toISOString(),
  spa: { nome: m.s.nome, url: m.s.url, email: m.s.email, telefone: m.s.telefone, morada: m.addressLine || '' },
  tratamentos: dados.treatments.map((t) => ({ id: t.id, nome: t.name, grupo: t.area, duracao: t.min, preco: t.price, artigo: t.area === 'Relaxar' ? 'TPREV' : 'TREAB' })),
  /* Equipa para a agenda (servidor/agenda.mjs): cada pessoa liga-se a um utilizador do Zoho CRM pelo nome ou pelo email */
  equipa: m.team.map((p) => ({ id: p.id, nome: p.nome, faz: p.faz || [], zoho: p.zoho || '' })),
  /* Para avisar o Bing/IndexNow depois de cada publicação (netlify/functions/deploy-succeeded.mjs) */
  /* Campanhas de vouchers (todas as ligadas): o servidor confirma as datas e o limite no momento da compra */
  campanhas: readList('campanhas').filter((c) => c.ativa && c.so_vouchers && c.tratamento && c.preco && m.byId(c.tratamento)).map((c) => {
    const t = m.byId(c.tratamento);
    return { id: c._id, nome: (c.etiqueta ? c.etiqueta.split(' · ')[0] + ' · ' : '') + (t.nome_completo || t.nome), tratamento: t.id, preco: c.preco, preco_antigo: c.preco_antigo || t.preco, duracao: c.duracao || t.duracao,
      inicio: c.inicio ? c.inicio.slice(0, 10) : '', fim: c.fim ? c.fim.slice(0, 10) : '', limite: Number(c.limite_vouchers) || 0 };
  }),
  seo: { indexar: !!m.s.indexar, chave: INDEXNOW_KEY, paginas: PAGINAS.map((p) => m.s.url + p).concat(m.s.url + '/llms.txt') }
};
const CAT = path.join(ROOT, 'servidor', 'gerado', 'catalogo.json');
fs.mkdirSync(path.dirname(CAT), { recursive: true });
fs.writeFileSync(CAT, JSON.stringify(catalogo, null, 1));

write('admin/config.yml', adminConfigEN(fs.readFileSync(path.join(PUBLIC, 'admin', 'config.yml'), 'utf8')));
write('robots.txt', robots(m));
write('sitemap.xml', sitemap(m, PAGINAS.concat(PAGINAS_EN)));
write(INDEXNOW_KEY + '.txt', INDEXNOW_KEY);
write('_headers', headers(m) + (enPublic ? '' : '/en/*\n  X-Robots-Tag: noindex, nofollow\n'));
write('llms.txt', llms(m, h.faqItems.concat(ms.faqItems, ...areas.map((a) => a.faqItems))));

console.log('Site gerado em dist/ · ' + (m.s.indexar ? 'indexável' : 'noindex') + ' · campanha: ' + (m.campaign ? m.campaign.titulo + ' ' + (m.campaign.titulo_destaque || '') : 'nenhuma'));
