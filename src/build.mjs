/* Build do site: content/*.json + public/ → dist/. Corre no Netlify a cada publicação (node src/build.mjs). */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, PUBLIC } from './lib.mjs';
import { loadModel } from './modelo.mjs';
import { home, massages } from './paginas.mjs';
import { robots, sitemap, headers, llms } from './seo.mjs';

const DIST = path.join(ROOT, 'dist');
fs.rmSync(DIST, { recursive: true, force: true });
fs.cpSync(PUBLIC, DIST, { recursive: true });

const m = loadModel();
const write = (rel, data) => {
  const f = path.join(DIST, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, data);
};

const h = home(m);
const ms = massages(m);
write('index.html', h.html);
write('massagens-porto/index.html', ms.html);

/* Dados para a agenda e os vouchers (prototype.js) */
const dados = {
  treatments: m.treatments.map((t) => {
    /* Tratamento em campanha: preço de campanha, com o normal guardado para aparecer riscado */
    const camp = t.id === m.campaignTreatment && m.campaignPrice && m.campaignPrice !== t.preco;
    return { id: t.id, area: t.grupo, name: t.nome, min: t.duracao, price: camp ? m.campaignPrice : t.preco, oldPrice: camp ? t.preco : null, camp: !!camp, text: t.texto };
  }),
  spa: (() => {
    const h = m.s.horario || {}, f = (x) => String(x || '').replace(/^0/, '').replace(':', 'h');
    return { telefone: m.s.telefone, horario: '2.ª a 6.ª ' + f(h.semana_abre) + '–' + f(h.semana_fecha) + (h.sabado_aberto ? ', sábado ' + f(h.sabado_abre) + '–' + f(h.sabado_fecha) : '') };
  })(),
  team: m.team.map((p, i) => ({ id: p.id, name: p.nome, role: p.funcao, focus: p.foco, bio: p.bio, does: p.faz || [], tone: (i % 4) + 1, photo: p.foto || '' }))
};
write('dados.js', '/* Gerado no build a partir do backoffice. Não editar. */\nwindow.OMS_DATA = ' + JSON.stringify(dados) + ';\n');

write('robots.txt', robots(m));
write('sitemap.xml', sitemap(m, ['/', '/massagens-porto/']));
write('_headers', headers(m));
write('llms.txt', llms(m, h.faqItems.concat(ms.faqItems)));

console.log('Site gerado em dist/ · ' + (m.s.indexar ? 'indexável' : 'noindex') + ' · campanha: ' + (m.campaign ? m.campaign.titulo + ' ' + (m.campaign.titulo_destaque || '') : 'nenhuma'));
