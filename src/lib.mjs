/* Funções partilhadas pelo build: texto, preços, imagens e contactos. */
import fs from 'node:fs';
import path from 'node:path';

export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
export const PUBLIC = path.join(ROOT, 'public');

const CONTENT = path.join(ROOT, 'content');
const jsonFiles = (dir, lang) => fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort()
  .map((f) => ({ key: f.slice(0, -5), data: localize(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')), lang) }));
const byOrder = (a, b) => (Number(a.ordem) || 0) - (Number(b.ordem) || 0);

/* Versão inglesa: cada ficha (e cada item das listas) pode ter um objeto «en» com os mesmos campos de texto,
   escrito no backoffice em «English (EN)». Em inglês, o que estiver preenchido substitui o português;
   o que ficar vazio mantém o português. Em português, o «en» é ignorado. */
export function localize(data, lang) {
  if (Array.isArray(data)) return data.map((x) => localize(x, lang));
  if (!data || typeof data !== 'object') return data;
  const { en, ...out } = data;
  for (const k of Object.keys(out)) out[k] = localize(out[k], lang);
  if (lang === 'en' && en && typeof en === 'object') {
    for (const [k, v] of Object.entries(en)) {
      if (typeof v === 'string' ? v.trim() : Array.isArray(v) ? v.some((x) => typeof x === 'string' && x.trim()) : false) out[k] = v;
    }
  }
  return out;
}

/* Conteúdo do backoffice. Uma pasta (content/inicio/) junta-se num só objeto: cada ficheiro é uma
   secção com o nome do ficheiro (hero.json → hero); os que começam por _ juntam-se ao nível de cima. */
export function readJSON(name, lang = 'pt') {
  const dir = path.join(CONTENT, name);
  if (!fs.existsSync(dir)) return localize(JSON.parse(fs.readFileSync(dir + '.json', 'utf8')), lang);
  const out = {};
  for (const { key, data } of jsonFiles(dir, lang)) {
    if (key.startsWith('_')) Object.assign(out, data);
    else out[key] = data;
  }
  return out;
}

/* Lista com um ficheiro por item (content/tratamentos/oil.json), pela ordem do campo «ordem». */
export function readList(name, lang = 'pt') {
  return jsonFiles(path.join(CONTENT, name), lang).map((f) => ({ _id: f.key, ...f.data })).sort(byOrder);
}

/* Campanhas (content/campanhas/): a primeira em vigor pela ordem é a principal, as outras rodam por baixo.
   O selo dourado «Em campanha» vai para o tratamento da primeira campanha ligada que o tenha pedido. */
export function readCampaigns(isLive, lang = 'pt') {
  const all = readList('campanhas', lang);
  const [main = {}, ...extras] = [...all.filter(isLive), ...all.filter((c) => !isLive(c))];
  const badge = [main, ...extras].find((c) => c.selo_em_campanha && c.tratamento && isLive(c));
  return { ...main, extras, destaque_tratamento: badge ? badge.tratamento : null, destaque_preco: badge ? badge.preco : null };
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* Texto escrito no backoffice: [[a confirmar]], ==destaque==, *itálico*, **negrito**, [ligação](url) e {variáveis}. */
export function makeText(ctx) {
  function vars(s, html) {
    return s.replace(/\{(\w+)(?::(\w+))?\}/g, (m, k, id) => {
      const v = ctx.vars(k, id, html);
      return v == null ? m : v;
    });
  }
  function inline(s) {
    if (!s) return '';
    let out = esc(s);
    out = vars(out, true);
    out = out.replace(/\[\[(.+?)\]\]/g, '<mark class="tbc">$1</mark>');
    out = out.replace(/==(.+?)==/g, '<mark class="hl">$1</mark>');
    out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, t, u) => '<a href="' + u + '">' + t + '</a>');
    out = out.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    out = out.replace(/\*(.+?)\*/g, '<em>$1</em>');
    return out;
  }
  /* Versão sem marcação, para metadados e JSON-LD. Devolve '' se o texto ainda tem algo por confirmar. */
  function plain(s) {
    if (!s) return '';
    if (/\[\[/.test(s)) return '';
    return vars(s, false).replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/==(.+?)==/g, '$1').replace(/\*\*?(.+?)\*\*?/g, '$1').trim();
  }
  function hasTbc(s) { return /\[\[/.test(s || ''); }
  function stripTbc(s) { return (s || '').replace(/\s*\[\[.+?\]\]\s*/g, ' ').trim(); }
  return { inline, plain, hasTbc, stripTbc };
}

export function eur(n) {
  if (n == null || n === '') return '';
  const v = Number(n);
  return (Number.isInteger(v) ? String(v) : v.toFixed(2).replace('.', ',')) + ' €';
}
export function minutes(n) { return n ? n + ' min' : ''; }
export function telHref(t) { return 'tel:' + String(t).replace(/[^\d+]/g, ''); }
export function telE164(t) { return String(t).replace(/[^\d+]/g, ''); }
export function waHref(t) { return 'https://wa.me/' + String(t).replace(/\D/g, ''); }

/* "Seg a Sex 9h–20h" a partir de "09:00" */
export function hourShort(h) {
  const [hh, mm] = String(h).split(':');
  return String(Number(hh)) + 'h' + (mm && mm !== '00' ? mm : '');
}

export function listPT(items, and = 'e') {
  if (items.length <= 1) return items.join('');
  return items.slice(0, -1).join(', ') + ' ' + and + ' ' + items[items.length - 1];
}

/* Tamanho de imagens PNG, JPEG, GIF e WebP, lido do cabeçalho do ficheiro. */
export function imageSize(file) {
  let b;
  try { b = fs.readFileSync(file); } catch { return null; }
  if (b.slice(0, 8).toString('hex') === '89504e470d0a1a0a') return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  if (b.slice(0, 3).toString('ascii') === 'GIF') return { w: b.readUInt16LE(6), h: b.readUInt16LE(8) };
  if (b.slice(0, 4).toString('ascii') === 'RIFF' && b.slice(8, 12).toString('ascii') === 'WEBP') {
    const kind = b.slice(12, 16).toString('ascii');
    if (kind === 'VP8 ') return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
    if (kind === 'VP8L') { const n = b.readUInt32LE(21); return { w: (n & 0x3fff) + 1, h: ((n >> 14) & 0x3fff) + 1 }; }
    if (kind === 'VP8X') return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
  }
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1], len = b.readUInt16BE(i + 2);
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5) };
      i += 2 + len;
    }
  }
  if (/\.svg$/i.test(file)) {
    const vb = /viewBox="[\d.\s-]*?([\d.]+)\s+([\d.]+)"/.exec(b.toString('utf8'));
    if (vb) return { w: Math.round(+vb[1]), h: Math.round(+vb[2]) };
  }
  return null;
}

/*
  Atributos de uma imagem com srcset.
  - Imagens já otimizadas (img/nome-760.webp) usam as variantes que existirem na pasta (nome-420.webp, ...).
  - Imagens carregadas no backoffice (img/uploads/...) passam pelo Netlify Image CDN, que gera WebP/AVIF nos tamanhos pedidos.
*/
export function picture(src, { widths = [480, 960], sizes = '100vw', alt = '', lazy = true, high = false } = {}) {
  if (!src) return '';
  const rel = src.replace(/^\//, '');
  const file = path.join(PUBLIC, rel);
  const size = imageSize(file) || { w: widths[widths.length - 1], h: widths[widths.length - 1] };
  let srcset = '', main = '/' + rel, w = size.w, h = size.h;
  const m = /^(.*)-(\d+)\.(webp|jpe?g|png|avif)$/i.exec(rel);
  if (m && !rel.startsWith('img/uploads/')) {
    const dir = path.dirname(path.join(PUBLIC, rel));
    const base = path.basename(m[1]);
    const variants = fs.readdirSync(dir)
      .map((f) => new RegExp('^' + base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '-(\\d+)\\.' + m[3] + '$').exec(f))
      .filter(Boolean).map((x) => +x[1]).sort((a, b) => a - b);
    if (variants.length > 1) {
      srcset = variants.map((v) => '/' + path.posix.join(path.posix.dirname(rel), base + '-' + v + '.' + m[3]) + ' ' + v + 'w').join(', ');
      const smallest = imageSize(path.join(dir, base + '-' + variants[0] + '.' + m[3]));
      if (smallest) { w = smallest.w; h = smallest.h; main = '/' + path.posix.join(path.posix.dirname(rel), base + '-' + variants[0] + '.' + m[3]); }
    }
  } else if (!/\.svg$/i.test(rel)) {
    const cdn = (wd) => '/.netlify/images?url=' + encodeURIComponent('/' + rel) + '&w=' + wd;
    const ws = widths.filter((x) => x < size.w).concat([Math.min(size.w, widths[widths.length - 1])]);
    srcset = [...new Set(ws)].map((x) => cdn(x) + ' ' + x + 'w').join(', ');
    main = cdn(ws[0]);
    h = Math.round(size.h * ws[0] / size.w); w = ws[0];
  }
  return '<img src="' + esc(main) + '"' + (srcset ? ' srcset="' + esc(srcset) + '" sizes="' + esc(sizes) + '"' : '') +
    ' width="' + w + '" height="' + h + '" alt="' + esc(alt) + '"' +
    (high ? ' fetchpriority="high"' : '') + (lazy && !high ? ' loading="lazy"' : '') + ' decoding="async">';
}
