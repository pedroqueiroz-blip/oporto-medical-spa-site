/* Lê o conteúdo do backoffice (content/*.json) e calcula o que se repete pelo site:
   preços, intervalos, horário, respostas automáticas e a campanha em vigor. */
import { readJSON, makeText, eur, minutes, telHref, hourShort, listPT, esc } from './lib.mjs';

const GROUP_AREA = { Fortalecer: 'Fisioterapia', Recuperar: 'Pilates e postura', Cuidar: 'Corpo', Relaxar: 'Relaxamento' };

export function loadModel(today = new Date()) {
  const s = readJSON('definicoes');
  const inicio = readJSON('inicio');
  const massagens = readJSON('massagens');
  const camp = readJSON('campanha');
  const treatments = readJSON('tratamentos').lista.filter((t) => t.visivel !== false);
  const team = readJSON('equipa').lista;

  s.url = String(s.url || '').replace(/\/+$/, '');
  const byId = (id) => treatments.find((t) => t.id === id);
  const groups = [];
  treatments.forEach((t) => { if (!groups.includes(t.grupo)) groups.push(t.grupo); });
  const inGroup = (g) => treatments.filter((t) => t.grupo === g);

  function range(list, key) {
    const v = list.map((t) => Number(t[key])).filter((x) => x > 0);
    return v.length ? { min: Math.min(...v), max: Math.max(...v) } : null;
  }

  const h = s.horario || {};
  const hoursShort = 'Seg a Sex ' + hourShort(h.semana_abre) + '–' + hourShort(h.semana_fecha) +
    (h.sabado_aberto ? ' · Sáb ' + hourShort(h.sabado_abre) + '–' + hourShort(h.sabado_fecha) : '');
  const hoursLong = 'Abre de segunda a sexta das ' + hourShort(h.semana_abre) + ' às ' + hourShort(h.semana_fecha) +
    (h.sabado_aberto ? ' e ao sábado das ' + hourShort(h.sabado_abre) + ' às ' + hourShort(h.sabado_fecha) : '') + '.';
  const addressLine = s.rua + ', ' + s.codigo_postal + ' ' + s.localidade;

  function vars(k, id, html) {
    const link = (href, t) => html ? '<a href="' + href + '">' + esc(t) + '</a>' : t;
    const tel = (t) => t.replace(/^\+351\s*/, '');
    switch (k) {
      case 'telefone': return link(telHref(s.telefone), tel(s.telefone));
      case 'telemovel': return link(telHref(s.telemovel), tel(s.telemovel));
      case 'email': return link('mailto:' + s.email, s.email);
      case 'morada': return html ? esc(addressLine) : addressLine;
      case 'horario': return hoursShort;
      case 'preco': { const t = byId(id); return t ? eur(t.preco) : null; }
      case 'duracao': { const t = byId(id); return t ? minutes(t.duracao) : null; }
      case 'nome': { const t = byId(id); return t ? (html ? esc(t.nome) : t.nome) : null; }
    }
    return null;
  }
  const text = makeText({ vars });

  const art = (t) => t.artigo || 'a';
  const cap = (x) => x.charAt(0).toUpperCase() + x.slice(1);

  /* Respostas que se escrevem sozinhas a partir dos preços e da morada */
  function auto(kind) {
    const relax = inGroup('Relaxar');
    const rec = inGroup('Recuperar'), fort = inGroup('Fortalecer');
    switch (kind) {
      case 'morada':
        return 'Na ' + addressLine + (s.zona ? ', na zona ocidental da cidade, ' + s.zona : '') + '. ' + hoursLong;
      case 'precos_relaxar': {
        if (!relax.length) return '';
        const sorted = [...relax].sort((a, b) => a.preco - b.preco);
        const lo = sorted[0], hi = sorted[sorted.length - 1];
        let out = 'As massagens de relaxamento custam entre ' + eur(lo.preco) + ' (' + lo.nome + ', ' + minutes(lo.duracao) + ') e ' +
          eur(hi.preco) + ' (' + hi.nome + ', ' + minutes(hi.duracao) + ').';
        const mid = sorted.slice(1, -1);
        if (mid.length) out += ' ' + mid.map((t) => 'A ' + t.nome_completo + ' custa ' + eur(t.preco) + ' (' + minutes(t.duracao) + ')').join('. ') + '.';
        return out;
      }
      case 'intervalo_relaxar': {
        const p = range(relax, 'preco'), d = range(relax, 'duracao');
        if (!p) return '';
        return 'No ' + s.nome + ', ' + (p.min === p.max ? eur(p.min) : 'entre ' + eur(p.min) + ' e ' + eur(p.max)) +
          ', conforme o ritual e a duração (' + (d.min === d.max ? minutes(d.min) : d.min + ' ou ' + d.max + ' minutos') + ').';
      }
      case 'precos_fisio': {
        const all = rec.concat(fort);
        if (!all.length) return '';
        const [first, ...rest] = all;
        return 'Uma sessão de ' + first.nome_completo + ' custa ' + eur(first.preco) + ' e dura ' + first.duracao + ' minutos.' +
          (rest.length ? ' ' + cap(listPT(rest.map((t, i) => art(t) + ' ' + t.nome_completo + (i === 0 ? ' custa ' : ' ') + eur(t.preco) + ' (' + minutes(t.duracao) + ')'))) + '.' : '');
      }
    }
    return '';
  }
  function faq(list) {
    return (list || []).map((q) => {
      const base = q.automatica ? auto(q.automatica) : q.resposta;
      const full = [base, q.acrescento].filter(Boolean).join(' ');
      return { q: q.pergunta, qSeo: q.pergunta_seo || q.pergunta, html: text.inline(full), plain: text.plain(base) && !text.hasTbc(base) ? text.plain(base) : '' };
    }).filter((x) => x.html);
  }

  /* Frase-resposta de preços (pensada para ser citada por motores de IA) */
  function priceAnswer() {
    const relax = inGroup('Relaxar'), p = range(relax, 'preco'), d = range(relax, 'duracao');
    const parts = [];
    if (p) parts.push('As massagens de relaxamento custam ' + (p.min === p.max ? eur(p.min) : 'entre ' + eur(p.min) + ' e ' + eur(p.max)) +
      ' e duram ' + (d.min === d.max ? d.min + ' minutos' : d.min + ' a ' + d.max + ' minutos') + '.');
    const bits = [];
    const AREA_TXT = { Fortalecer: 'de fisioterapia e osteopatia', Recuperar: 'de Pilates e reeducação postural', Cuidar: 'de corpo' };
    groups.filter((g) => g !== 'Relaxar').forEach((g) => {
      const pr = range(inGroup(g), 'preco');
      if (pr) bits.push('os tratamentos ' + (AREA_TXT[g] || g.toLowerCase()) + ' custam ' + (pr.min === pr.max ? eur(pr.min) : 'entre ' + eur(pr.min) + ' e ' + eur(pr.max)) + ' por sessão');
    });
    if (bits.length) parts.push(cap(listPT(bits)) + '.');
    parts.push('Todos se reservam online, escolhendo a terapeuta e a hora.');
    return parts.join(' ');
  }

  /* Campanha em vigor: ativa e dentro das datas (as datas contam no momento do build) */
  const day = today.toISOString().slice(0, 10);
  const campaignOn = camp.ativa && (!camp.inicio || camp.inicio.slice(0, 10) <= day) && (!camp.fim || camp.fim.slice(0, 10) >= day);
  const campTreatment = camp.tratamento ? byId(camp.tratamento) : null;
  const campaign = campaignOn ? {
    ...camp,
    preco: camp.preco || (campTreatment && campTreatment.preco) || null,
    duracao: camp.duracao || (campTreatment && campTreatment.duracao) || null
  } : null;

  /* Campanhas extra: aparecem por baixo da principal, escondidas atrás do botão "Ver + campanhas do mês" */
  const live = (c) => c && c.ativa && (!c.inicio || c.inicio.slice(0, 10) <= day) && (!c.fim || c.fim.slice(0, 10) >= day);
  const withTreatment = (c) => {
    const tr = c.tratamento ? byId(c.tratamento) : null;
    return { ...c, preco: c.preco || (tr && tr.preco) || null, duracao: c.duracao || (tr && tr.duracao) || null };
  };
  const extraCampaigns = (camp.extras || []).filter(live).map(withTreatment);
  /* Tratamento da lista com o selo "Em campanha" (só com alguma campanha no site) */
  const campaignTreatment = (campaign || extraCampaigns.length) && camp.destaque_tratamento ? camp.destaque_tratamento : null;
  const campaignPrice = campaignTreatment && Number(camp.destaque_preco) > 0 ? Number(camp.destaque_preco) : null;

  const relaxRange = range(inGroup('Relaxar'), 'preco');
  const allRange = range(treatments, 'preco');
  const teamConfirmed = team.length > 0 && team.every((p) => p.confirmado);

  return {
    s, inicio, massagens, campaign, extraCampaigns, campaignTreatment, campaignPrice, treatments, team, groups, inGroup, byId, range, text, faq, auto, priceAnswer,
    hoursShort, hoursLong, addressLine, relaxRange, allRange, teamConfirmed, GROUP_AREA
  };
}
