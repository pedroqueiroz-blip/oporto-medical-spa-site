/* Backoffice: acrescenta a cada ficha (e a cada item das listas) um bloco «English (EN)», fechado por defeito,
   com os mesmos campos de texto em inglês. Gera dist/admin/config.yml a partir de public/admin/config.yml no
   build, por isso um campo de texto novo em português ganha sozinho o seu par em inglês. */
import { parseDocument } from 'yaml';

const TEXTO = ['string', 'text', 'markdown'];
/* Campos que não se traduzem: códigos, contactos, nomes de pessoas, avaliações tal como foram escritas, lugares */
const FORA = new Set(['id', 'url', 'email', 'telefone', 'telemovel', 'whatsapp', 'rua', 'codigo_postal', 'localidade', 'regiao', 'pais',
  'latitude', 'longitude', 'cedula', 'nota_google', 'perfil_google', 'semana_abre', 'semana_fecha', 'sabado_abre', 'sabado_fecha',
  'registo_ers', 'instagram', 'redes', 'selo_numero', 'areas_servidas', 'afiliacoes']);
const FORA_EM = { equipa: ['nome'], 'inicio/avaliacoes': ['lista', 'nota_google'], 'definicoes/horario': ['*'], 'definicoes/google': ['*'], 'definicoes/contactos': ['*', '!zona'], indicacoes: ['*'] };

function fora(onde, nome) {
  const r = FORA_EM[onde] || FORA_EM[onde.split('/')[0]] || [];
  if (r.includes('!' + nome)) return false;
  return FORA.has(nome) || r.includes(nome) || r.includes('*');
}

/* Devolve os campos do bloco EN para esta lista de campos (e acrescenta blocos EN dentro das listas e objetos) */
function versao(fields, onde) {
  const en = [];
  for (const f of fields) {
    if (!f || fora(onde, f.name)) continue;
    if (TEXTO.includes(f.widget)) {
      const c = { name: f.name, label: f.label, widget: f.widget, required: false };
      if (f.name === 'endereco') Object.assign(c, { pattern: f.pattern, hint: 'Endereço em inglês, ex.: physiotherapy-porto (a página fica em /en/physiotherapy-porto/).' });
      en.push(c);
    } else if (f.widget === 'list' && f.field && TEXTO.includes(f.field.widget)) {
      en.push({ name: f.name, label: f.label, widget: 'list', required: false, field: { ...f.field } });
    } else if ((f.widget === 'list' || f.widget === 'object') && Array.isArray(f.fields)) {
      acrescenta(f.fields, onde);
    }
  }
  return en;
}

function acrescenta(fields, onde) {
  if (fields.some((f) => f && f.name === 'en')) return; /* campos partilhados (&perguntas) só uma vez */
  const en = versao(fields, onde);
  if (en.length) fields.push({ name: 'en', label: 'English (EN)', widget: 'object', collapsed: true, required: false,
    hint: 'Versão inglesa (/en/). O que ficar vazio aparece em português.', fields: en });
}

export function adminConfigEN(yamlText) {
  const doc = parseDocument(yamlText);
  const cfg = doc.toJS();
  for (const c of cfg.collections || []) {
    if (c.files) c.files.forEach((f) => acrescenta(f.fields, c.name + '/' + f.name));
    else if (c.fields) acrescenta(c.fields, c.name);
  }
  return '# Gerado no build (src/admin-en.mjs) a partir de public/admin/config.yml, com os blocos «English (EN)». Edite o original.\n' +
    new (doc.constructor)(cfg).toString({ lineWidth: 0 });
}
