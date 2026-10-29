// Ligação ao Zoho CRM (conta europeia, zoho.eu): clientes (Contactos) e agenda (Eventos).
// A ligação faz-se uma vez em /api/zoho/ligar, com a palavra-passe do backoffice: o Zoho devolve uma chave
// de renovação que fica guardada no Netlify Blobs (ou em ZOHO_REFRESH_TOKEN). Sem ZOHO_CLIENT_ID e
// ZOHO_CLIENT_SECRET no Netlify, o site continua com a agenda simulada e as marcações seguem por email.
import crypto from "node:crypto";
import { store, STORES } from "./store.mjs";
import { lerHorario, descreverHorario } from "./horario.mjs";

const CONTAS = () => (process.env.ZOHO_ACCOUNTS_BASE || "https://accounts.zoho.eu").replace(/\/$/, "");
export const ESCOPOS = "ZohoCRM.modules.ALL,ZohoCRM.users.READ,ZohoCRM.coql.READ,ZohoCRM.settings.modules.READ,ZohoCRM.settings.fields.READ";

// Campo do NIF e módulo da agenda (Reuniões, só para ler horas ocupadas): variável no Netlify, senão o que a verificação
// (/api/zoho/verificar) encontrou nos metadados do CRM, senão os nomes habituais.
async function configuracao() {
  const g = (await (await gaveta()).get("config", { type: "json" })) || {};
  return {
    campoNif: process.env.ZOHO_CAMPO_NIF || g.campoNif || "NIF", moduloAgenda: process.env.ZOHO_MODULO_AGENDA || g.moduloAgenda || "Events",
  };
}

const simples = (x) => String(x || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

export const zohoConfigurado = () => Boolean(process.env.ZOHO_CLIENT_ID && process.env.ZOHO_CLIENT_SECRET);
const gaveta = () => store(STORES.zoho);

async function ligacao() {
  if (process.env.ZOHO_REFRESH_TOKEN) return { refresh_token: process.env.ZOHO_REFRESH_TOKEN };
  return (await gaveta()).get("ligacao", { type: "json" });
}
export const zohoLigado = async () => zohoConfigurado() && Boolean((await ligacao())?.refresh_token);
export async function estadoLigacao() {
  const l = zohoConfigurado() ? await ligacao() : null;
  return { configurado: zohoConfigurado(), ligado: Boolean(l?.refresh_token), em: l?.em || null };
}

// 1) Endereço da página de autorização do Zoho, com um "state" de uso único contra pedidos forjados.
export async function urlAutorizacao(retorno) {
  const state = crypto.randomBytes(16).toString("hex");
  await (await gaveta()).setJSON(`state-${state}`, { em: Date.now() });
  const q = new URLSearchParams({ scope: ESCOPOS, client_id: process.env.ZOHO_CLIENT_ID, response_type: "code", access_type: "offline", prompt: "consent", redirect_uri: retorno, state });
  return `${CONTAS()}/oauth/v2/auth?${q}`;
}

// 2) Regresso do Zoho: troca o código pela chave de renovação e guarda-a.
export async function concluirLigacao(retorno, code, state) {
  const g = await gaveta();
  const s = state && (await g.get(`state-${state}`, { type: "json" }));
  if (!s || Date.now() - s.em > 15 * 60e3) throw new Error("O pedido de ligação expirou. Volte a abrir /api/zoho/ligar.");
  await g.delete(`state-${state}`);
  const r = await pedirToken({ grant_type: "authorization_code", code, redirect_uri: retorno });
  if (!r.refresh_token) throw new Error("O Zoho não devolveu a chave de renovação. Volte a tentar a ligação.");
  await g.setJSON("ligacao", { refresh_token: r.refresh_token, api_domain: r.api_domain || null, em: new Date().toISOString() });
  cache = { token: r.access_token, ate: Date.now() + (Number(r.expires_in) || 3600) * 1000 - 60e3, api: r.api_domain };
}

async function pedirToken(campos) {
  const res = await fetch(`${CONTAS()}/oauth/v2/token`, {
    method: "POST", signal: AbortSignal.timeout(15000),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.ZOHO_CLIENT_ID, client_secret: process.env.ZOHO_CLIENT_SECRET, ...campos }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.error) throw new Error(`Zoho (token): ${j.error || res.status}`);
  return j;
}

// Chave de acesso (válida 1 hora), renovada quando falta.
let cache = null;
async function acesso() {
  if (cache?.token && Date.now() < cache.ate) return cache;
  const l = await ligacao();
  if (!l?.refresh_token) throw new Error("O Zoho CRM ainda não está ligado.");
  const r = await pedirToken({ grant_type: "refresh_token", refresh_token: l.refresh_token });
  cache = { token: r.access_token, ate: Date.now() + (Number(r.expires_in) || 3600) * 1000 - 60e3, api: r.api_domain || l.api_domain };
  return cache;
}

export async function crm(metodo, caminho, corpo) {
  const a = await acesso();
  const base = (process.env.ZOHO_API_BASE || a.api || "https://www.zohoapis.eu").replace(/\/$/, "");
  const res = await fetch(`${base}/crm/v6${caminho}`, {
    method: metodo, signal: AbortSignal.timeout(15000),
    headers: { Authorization: `Zoho-oauthtoken ${a.token}`, ...(corpo ? { "Content-Type": "application/json" } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  if (res.status === 204) return null; // pesquisa sem resultados
  const j = await res.json().catch(() => ({}));
  const linha = j.data?.[0];
  if (!res.ok || (linha?.status === "error")) throw new Error(`Zoho CRM ${caminho.split("?")[0]}: ${linha?.message || j.message || j.code || res.status}`);
  return j;
}
const criado = (j) => j?.data?.[0]?.details?.id;

/* ---------- Clientes ---------- */

// O cliente é reconhecido pelo NIF (campo do CRM) e, se não houver, pelo email. Sem ficha, cria-se uma.
// Nunca se muda o email de uma ficha existente: uma diferença fica como nota para a equipa.
export async function clienteCRM({ nome, email, telefone, nif }) {
  const campo = (await configuracao()).campoNif;
  let c = nif ? (await crm("GET", `/Contacts/search?criteria=${encodeURIComponent(`(${campo}:equals:${nif})`)}`))?.data?.[0] : null;
  if (c) {
    const diferente = c.Email && String(c.Email).toLowerCase() !== email;
    return { id: c.id, novo: false, nota: diferente ? `O email da marcação (${email}) é diferente do da ficha (${c.Email}).` : "" };
  }
  c = (await crm("GET", `/Contacts/search?email=${encodeURIComponent(email)}`))?.data?.[0];
  if (c) {
    if (nif && !c[campo]) await crm("PUT", "/Contacts", { data: [{ id: c.id, [campo]: nif }] });
    const outroNif = nif && c[campo] && String(c[campo]) !== nif;
    return { id: c.id, novo: false, nota: outroNif ? `A ficha com este email tem outro NIF (${c[campo]}); a marcação indicou ${nif}.` : "" };
  }
  const partes = String(nome).trim().split(/\s+/);
  const ultimo = partes.length > 1 ? partes.pop() : partes[0];
  const j = await crm("POST", "/Contacts", { data: [{ First_Name: partes.length ? partes.join(" ") : undefined, Last_Name: ultimo, Email: email, Phone: telefone || undefined, [campo]: nif || undefined, Lead_Source: "Site" }] });
  return { id: criado(j), novo: true, nota: "" };
}

/* ---------- Agenda ---------- */

// Utilizadores do CRM (as terapeutas), para ligar a equipa do site a quem tem os eventos na agenda.
export async function utilizadores() {
  const j = await crm("GET", "/users?type=ActiveUsers&per_page=200");
  return (j?.users || []).map((u) => ({ id: u.id, nome: u.full_name || "", email: String(u.email || "").toLowerCase() }));
}

// Eventos entre duas datas (ISO com fuso), de toda a equipa.
export async function eventos(de, ate) {
  const { moduloAgenda } = await configuracao();
  const out = [];
  for (let offset = 0; offset < 2000; offset += 200) {
    const q = `select Owner, Event_Title, Start_DateTime, End_DateTime, All_day from ${moduloAgenda} where Start_DateTime between '${de}' and '${ate}' order by Start_DateTime limit ${offset}, 200`;
    const j = await crm("POST", "/coql", { select_query: q });
    const linhas = j?.data || [];
    out.push(...linhas.map((e) => ({ origem: "Reuniões", titulo: `${e.Event_Title || ""} (responsável: ${e.Owner?.name || e.Owner?.id || "?"})`, dono: e.Owner?.id || e.Owner, inicio: Date.parse(e.Start_DateTime), fim: Date.parse(e.End_DateTime), diaInteiro: Boolean(e.All_day), dia: String(e.Start_DateTime).slice(0, 10) })));
    if (!j?.info?.more_records) break;
  }
  return out;
}

/* ---------- Módulo das marcações (Agenda do Zoho → «Tratamentos») ---------- */

// O SPA marca no módulo «Tratamentos» (Pedro, 27/10/2026): cada registo tem tratamento, terapeuta, estado,
// pagamento, início e fim. O módulo e os campos encontram-se pelos nomes nos metadados do CRM (ou
// ZOHO_MODULO_MARCACOES) e ficam guardados um dia; a verificação volta a procurá-los. As marcações vão só
// para este módulo: sem ele pronto, não entram no Zoho e a equipa é avisada para marcar à mão.
const CANCELADA = /cancel|anulad|desmarc|falt/;
const SISTEMA = /^(Created|Modified|Last_Activity|Last_Enriched|Unsubscribed)_(Time|By)$|^(Owner|Tag|Record_Image|Locked__s)$/;
const resumo = (f) => ({ api: f.api_name, rotulo: f.field_label, tipo: f.data_type, valores: (f.pick_list_values || []).map((v) => v.display_value), modulo: f.lookup?.module?.api_name || "" });
function mapear(campos) {
  // Campos do sistema (hora de criação, etc.) nunca contam como início ou outro campo da marcação.
  const r = campos.map(resumo).filter((f) => !SISTEMA.test(f.api)), por = (re) => r.find((f) => re.test(simples(f.rotulo)));
  const datas = r.filter((f) => f.tipo === "datetime");
  const fim = datas.find((f) => /(^|\s)(fim|termino|end)\b/.test(simples(f.rotulo)));
  const inicio = datas.find((f) => f !== fim && /inicio|start/.test(simples(f.rotulo))) || datas.find((f) => f !== fim && /^data|^hora/.test(simples(f.rotulo))) || (datas.length === 1 && datas[0] !== fim ? datas[0] : undefined);
  // A terapeuta pode estar em mais de uma lista («Terapeutas», «Profissionais LC»…): usa-se a que tem o nome dela.
  const terapeutas = r.filter((f) => /^terapeuta|^profissiona/.test(simples(f.rotulo)) && ["picklist", "multiselectpicklist", "userlookup", "text"].includes(f.tipo));
  return {
    nome: r.find((f) => f.api === "Name"), inicio, fim,
    tratamento: por(/^tratamento/), artigo: r.find((f) => f.tipo === "lookup" && f.modulo === "Products"),
    terapeuta: terapeutas[0], terapeutas,
    estado: por(/^estado/), pagamento: por(/^pagamento/), descricao: por(/^descri/) || por(/^notas/),
    especialidade: por(/^especialidade/), valor: por(/^valor$/), preferencia: por(/^preferencia/),
    cliente: r.find((f) => f.tipo === "lookup" && f.modulo === "Contacts"),
    origem: r.find((f) => f.api === "Origem_Marcacao"),
  };
}
async function descobrirMarcacoes() {
  const out = { versao: 3, em: new Date().toISOString(), modulo: null };
  const mods = (await crm("GET", "/settings/modules"))?.modules || [];
  const pedido = process.env.ZOHO_MODULO_MARCACOES;
  const m = mods.find((x) => pedido ? x.api_name === pedido : x.api_name !== "Products" && (simples(x.plural_label) === "tratamentos" || simples(x.singular_label) === "tratamento"));
  if (!m) return out;
  const campos = (await crm("GET", `/settings/fields?module=${m.api_name}`))?.fields || [];
  return { ...out, modulo: m.api_name, nomeModulo: m.plural_label || m.api_name, campos: mapear(campos), todos: campos.map(resumo) };
}
// O módulo está pronto quando se sabe onde vão o início, a terapeuta e o tratamento.
const completo = (mm) => Boolean(mm?.modulo && mm.campos?.inicio && mm.campos?.terapeutas?.length && (mm.campos.tratamento || mm.campos.nome));
export async function moduloMarcacoes() {
  const g = await gaveta(), cfg = (await g.get("config", { type: "json" })) || {};
  let mm = cfg.marcacoes;
  if (!mm || mm.versao !== 3 || Date.now() - Date.parse(mm.em) > 864e5) {
    mm = await descobrirMarcacoes();
    await g.setJSON("config", { ...((await g.get("config", { type: "json" })) || {}), marcacoes: mm });
  }
  return completo(mm) ? mm : null;
}

// Valor de um campo: lista de escolha (valor com o mesmo nome), utilizador, ligação a outro módulo
// (registo com o mesmo nome) ou texto. Sem correspondência, o campo fica por preencher.
async function valorCampo(f, texto, utilizador) {
  if (!f || texto == null) return undefined;
  if (f.tipo === "picklist" || f.tipo === "multiselectpicklist") {
    const v = f.valores.find((x) => simples(x) === simples(texto));
    return v === undefined ? undefined : f.tipo === "picklist" ? v : [v];
  }
  if (f.tipo === "userlookup" || f.tipo === "ownerlookup") return utilizador ? { id: utilizador } : undefined;
  if (f.tipo === "lookup" && f.modulo) {
    const j = await crm("GET", `/${f.modulo}/search?word=${encodeURIComponent(texto)}`);
    const r = (j?.data || []).find((x) => Object.values(x).some((v) => typeof v === "string" && simples(v) === simples(texto)));
    return r ? { id: r.id } : undefined;
  }
  return ["text", "textarea"].includes(f.tipo) ? texto : undefined;
}
// Primeiro valor da lista que case com uma das expressões (por ordem), ou o texto para campos de texto.
const escolher = (f, texto, ...res) => {
  if (!f) return undefined;
  if (!["picklist", "multiselectpicklist"].includes(f.tipo)) return texto;
  for (const re of res) { const v = f.valores.find((x) => re.test(simples(x))); if (v) return v; }
  return undefined;
};

export async function criarMarcacao(mm, { titulo, inicio, fim, dono, terapeuta, preferencia, cliente, tratamento, valor, descricao, semPagamento }) {
  const c = mm.campos, d = {};
  const por = async (f, v) => { const x = await v; if (f && x !== undefined) d[f.api] = x; };
  // O nome do registo é o tratamento (como nas marcações do SPA); sem campo próprio, vai o título.
  if (c.nome) d[c.nome.api] = c.tratamento ? titulo : tratamento;
  d[c.inicio.api] = inicio;
  if (c.fim) d[c.fim.api] = fim;
  await por(c.tratamento, valorCampo(c.tratamento, tratamento).catch(() => undefined));
  await por(c.artigo, valorCampo(c.artigo, tratamento).catch(() => undefined));
  for (const f of c.terapeutas || []) {
    const v = await valorCampo(f, terapeuta, dono).catch(() => undefined);
    if (v !== undefined) { d[f.api] = v; break; }
  }
  await por(c.especialidade, escolher(c.especialidade, "Spa", /^spa$/));
  await por(c.valor, ["currency", "double", "decimal"].includes(c.valor?.tipo) ? Number(valor) || 0 : undefined);
  await por(c.preferencia, c.preferencia?.tipo === "boolean" ? Boolean(preferencia) : undefined);
  await por(c.estado, escolher(c.estado, "Agendado", /^agendad/, /^marcad/, /^confirmad/));
  await por(c.pagamento, semPagamento === "isento" ? escolher(c.pagamento, "Isento", /^isent/, /vip|oferta/)
    : semPagamento ? escolher(c.pagamento, "Voucher", /voucher/, /^efetuad/, /^pag[oa]$/) : escolher(c.pagamento, "Pago", /^efetuad/, /^pag[oa]$/, /^pag[oa] /));
  await por(c.descricao, ["text", "textarea"].includes(c.descricao?.tipo) ? descricao : undefined);
  await por(c.cliente, cliente ? { id: cliente } : undefined);
  await por(c.origem, escolher(c.origem, "Online", /^online$/));
  return criado(await crm("POST", `/${mm.modulo}`, { data: [d] }));
}

// Marcações do módulo entre duas datas, com a terapeuta (utilizador ou nome); as canceladas não contam.
export async function marcacoesModulo(mm, de, ate, diag = null) {
  const c = mm.campos, ters = c.terapeutas || [c.terapeuta], cols = ["Name", ...[c.inicio, c.fim, ...ters, c.estado].filter(Boolean).map((f) => f.api)].filter((x, i, a) => a.indexOf(x) === i);
  const out = [];
  for (let offset = 0; offset < 2000; offset += 200) {
    const q = `select ${cols.join(", ")} from ${mm.modulo} where ${c.inicio.api} between '${de}' and '${ate}' order by ${c.inicio.api} limit ${offset}, 200`;
    const j = await crm("POST", "/coql", { select_query: q });
    for (const r of j?.data || []) {
      if (c.estado && CANCELADA.test(simples(r[c.estado.api]))) { if (diag) diag.push({ origem: mm.nomeModulo, titulo: `${r.Name || ""} · ${r[c.estado.api]} (não conta)`, nome: ters.map((f) => [].concat(r[f.api] ?? []).map((t) => t?.name || t).join(", ")).filter(Boolean).join(" / "), inicio: Date.parse(r[c.inicio.api]), fim: c.fim && r[c.fim.api] ? Date.parse(r[c.fim.api]) : null }); continue; }
      const inicio = Date.parse(r[c.inicio.api]), fim = c.fim && r[c.fim.api] ? Date.parse(r[c.fim.api]) : inicio + 60 * 60e3;
      // Uma marcação ocupa cada profissional indicado em qualquer das listas.
      if (diag && !ters.some((f) => [].concat(r[f.api] ?? []).length)) diag.push({ origem: mm.nomeModulo, titulo: `${r.Name || ""} · sem profissional em nenhuma lista (não ocupa ninguém)`, nome: "", inicio, fim });
      for (const f of ters) for (const t of [].concat(r[f.api] ?? [])) {
        out.push({ origem: mm.nomeModulo, titulo: `${r.Name || ""}${c.estado ? ` · ${r[c.estado.api] || "sem estado"}` : ""}`, dono: f.tipo === "userlookup" ? t?.id : null, nome: typeof t === "object" ? t?.name || "" : String(t || ""), inicio, fim, diaInteiro: false, dia: String(r[c.inicio.api]).slice(0, 10) });
      }
    }
    if (!j?.info?.more_records) break;
  }
  return out;
}

// Tudo o que ocupa a agenda: eventos (Reuniões, por responsável) e marcações do módulo «Tratamentos».
export async function ocupacoes(de, ate, diag = null) {
  const mm = await moduloMarcacoes();
  return [...await eventos(de, ate), ...(mm ? await marcacoesModulo(mm, de, ate, diag) : [])];
}

/* ---------- Módulo «Prestadores» (horário de cada colaboradora) ---------- */

// Cada colaboradora tem no módulo Prestadores o «Horário padrão» (texto, ver horario.mjs) e se está «Ativo»
// (Pedro, 28/10/2026). As horas livres do site são esse horário menos as marcações. Sem o módulo, devolve null.
export async function prestadores() {
  const mods = (await crm("GET", "/settings/modules"))?.modules || [];
  const m = mods.find((x) => /prestador/.test(simples(`${x.plural_label} ${x.singular_label} ${x.api_name}`)));
  if (!m) return null;
  const campos = ((await crm("GET", `/settings/fields?module=${m.api_name}`))?.fields || []).map(resumo).filter((f) => !SISTEMA.test(f.api));
  const horario = campos.find((f) => /horario/.test(simples(`${f.rotulo} ${f.api}`)) && /text/.test(f.tipo));
  const ativo = campos.find((f) => simples(f.rotulo) === "ativo" || f.api === "Ativo");
  const cols = ["Name", horario?.api, ativo?.api].filter(Boolean);
  const lista = [];
  for (let page = 1; page <= 10; page++) {
    const j = await crm("GET", `/${m.api_name}?fields=${cols.join(",")}&per_page=200&page=${page}`);
    lista.push(...(j?.data || []).map((r) => ({ nome: r.Name || "", texto: horario ? r[horario.api] || "" : "", ativo: ativo ? r[ativo.api] !== false : true })));
    if (!j?.info?.more_records) break;
  }
  return { modulo: m.api_name, campos, horario, ativo, lista: lista.map((x) => ({ ...x, ...lerHorario(x.texto) })) };
}

/* ---------- Turnos de cada dia («Horários de Colaborador») ---------- */

// Pedro (29/10/2026): antes de propor uma hora, ver os turnos da profissional nesse dia. Estão no módulo
// «Horários de Colaborador», um registo por pessoa e dia: Name «2026-10-29|Catarina Silva» e Periodos
// «08:00-14:00, 15:00-20:00» (turno 1 e turno 2) ou «-» (sem turno, a tracejado na agenda).
// Devolve Map «data|nome simplificado» → texto dos períodos, ou null se o módulo não existir.
let moduloTurnos = null;
async function apiTurnos() {
  if (process.env.ZOHO_MODULO_TURNOS) return process.env.ZOHO_MODULO_TURNOS;
  if (moduloTurnos) return moduloTurnos;
  const mods = (await crm("GET", "/settings/modules"))?.modules || [];
  const m = mods.find((x) => x.api_name === "Horario_Colaborador") || mods.find((x) => /horarios? de colaborador/.test(simples(`${x.plural_label} ${x.singular_label}`)));
  return (moduloTurnos = m?.api_name || null);
}
export async function turnos(datas, nomes) {
  const mod = await apiTurnos();
  if (!mod) return null;
  const chaves = datas.flatMap((d) => nomes.map((n) => `${d}|${n}`)), out = new Map();
  for (let i = 0; i < chaves.length; i += 50) {
    const lista = chaves.slice(i, i + 50).map((k) => `'${k.replace(/'/g, "\\'")}'`).join(", ");
    const j = await crm("POST", "/coql", { select_query: `select Name, Periodos from ${mod} where Name in (${lista}) limit 200` });
    for (const r of j?.data || []) {
      const [d, n] = String(r.Name || "").split("|");
      out.set(`${d}|${simples(n)}`, String(r.Periodos ?? "").trim());
    }
  }
  return out;
}

/* ---------- Turnos de cada dia (à procura do módulo) ---------- */

// Pedro (29/10/2026): cada profissional tem, para cada dia, o turno 1 e o turno 2; sem turno (a tracejado
// na agenda) não está disponível. Enquanto não se sabe em que módulo estão, mostra os módulos candidatos,
// os campos e os registos desse dia, para a página de verificação.
const CANDIDATO = /turno|horario|escala|disponib|ausenc|folga|feria|bloque|presenc|agenda/;
// Para a verificação: todos os campos preenchidos de cada marcação do dia, para ver onde está cada sinal
// da agenda (ex.: o coração da preferência pela terapeuta, Pedro 29/10/2026).
export async function camposMarcacoes(de, ate) {
  const mm = await moduloMarcacoes();
  if (!mm) return [];
  const c = mm.campos, rot = Object.fromEntries((mm.todos || []).map((f) => [f.api, f.rotulo]));
  const q = `select id, Name, ${c.inicio.api} from ${mm.modulo} where ${c.inicio.api} between '${de}' and '${ate}' order by ${c.inicio.api} limit 0, 30`;
  const out = [];
  for (const r of (await crm("POST", "/coql", { select_query: q }))?.data || []) {
    const x = (await crm("GET", `/${mm.modulo}/${r.id}`))?.data?.[0] || {};
    const val = (v) => (v && typeof v === "object" ? (Array.isArray(v) ? v.map(val).join(", ") : v.name ?? "") : String(v ?? ""));
    const campos = Object.entries(x).filter(([k, v]) => rot[k] && !SISTEMA.test(k) && v !== null && v !== false && v !== "" && !(Array.isArray(v) && !v.length))
      .map(([k, v]) => `${rot[k]} (${k}): ${v === true ? "sim" : val(v).slice(0, 80)}`);
    out.push({ inicio: Date.parse(r[c.inicio.api]), nome: r.Name || "", campos });
  }
  return out;
}

export async function procurarTurnos(dia) {
  const out = [], add = (ok, titulo, detalhe) => out.push({ ok, titulo, detalhe });
  const mods = (await crm("GET", "/settings/modules"))?.modules || [];
  add(true, "Módulos do CRM", mods.filter((x) => x.api_supported !== false).map((x) => `${x.plural_label || x.module_name} (${x.api_name})`).join(", "));
  const txt = (f) => `${f.rotulo} (${f.api}, ${f.tipo})`;
  for (const m of mods.filter((x) => x.api_supported !== false && x.api_name !== "Events" && CANDIDATO.test(simples(`${x.plural_label} ${x.singular_label} ${x.api_name}`)))) {
    try {
      const campos = ((await crm("GET", `/settings/fields?module=${m.api_name}`))?.fields || []).map(resumo).filter((f) => !SISTEMA.test(f.api));
      const data = campos.find((f) => /turno|^dia|^data/.test(simples(f.rotulo)) && /^(date|datetime)$/.test(f.tipo)) || campos.find((f) => /^(date|datetime)$/.test(f.tipo));
      const cols = ["Name", ...campos.map((f) => f.api).filter((a) => a !== "Name" && a !== "id")].slice(0, 45);
      let regs = [];
      if (data) {
        const cond = data.tipo === "date" ? `${data.api} = '${dia}'` : `${data.api} between '${dia}T00:00:00+00:00' and '${dia}T23:59:59+00:00'`;
        regs = (await crm("POST", "/coql", { select_query: `select ${cols.join(", ")} from ${m.api_name} where ${cond} limit 50` }))?.data || [];
      } else regs = (await crm("GET", `/${m.api_name}?fields=${cols.join(",")}&per_page=5`))?.data || [];
      const vazio = (v) => v == null || v === "" || (Array.isArray(v) && !v.length);
      const linha = (r) => Object.entries(r).filter(([k, v]) => k !== "id" && !vazio(v)).map(([k, v]) => `${k}: ${typeof v === "object" ? v.name || JSON.stringify(v) : v}`).join("; ");
      add(true, `${m.plural_label || m.api_name} (${m.api_name})`, `Campos: ${campos.map(txt).join("; ")}. ${data ? `Registos em ${dia} (por ${data.api}): ${regs.length}` : `Sem campo de data; primeiros registos: ${regs.length}`}${regs.length ? ` → ${regs.map(linha).join(" | ").slice(0, 3000)}` : ""}`);
    } catch (e) { add(false, `${m.plural_label || m.api_name} (${m.api_name})`, e.message); }
  }
  return out;
}

/* ---------- Verificação pela API de metadados ---------- */

// Confere no CRM real o que a integração precisa: módulos, campo do NIF, campos da agenda, utilizadores
// da equipa e leitura de eventos. Quando o campo do NIF não tem o nome habitual e há um só candidato,
// fica guardado para o site o usar. Devolve linhas { ok, titulo, detalhe } para a página de verificação.
export async function verificarCRM(equipa = [], tratamentos = []) {
  const linhas = [], add = (ok, titulo, detalhe = "") => linhas.push({ ok, titulo, detalhe });
  const g = await gaveta(), guardado = (await g.get("config", { type: "json" })) || {};
  try { await acesso(); add(true, "Ligação ao Zoho CRM", "Chave de acesso renovada com sucesso."); }
  catch (e) { add(false, "Ligação ao Zoho CRM", e.message); return linhas; }

  let modulos = [];
  try {
    modulos = (await crm("GET", "/settings/modules"))?.modules || [];
    add(true, "Módulos do CRM", `${modulos.length} módulos: ${modulos.filter((x) => x.api_supported !== false).map((x) => `${x.plural_label || x.module_name} (${x.api_name})`).join(", ")}`);
  } catch (e) { add(false, "Módulos do CRM", `${e.message}. Se pedir permissões, ligue de novo em /api/zoho/ligar.`); }
  const temModulo = (api) => !modulos.length || modulos.some((x) => x.api_name === api);
  add(temModulo("Contacts"), "Módulo de clientes (Contacts)", temModulo("Contacts") ? "" : "Não existe o módulo Contacts.");

  // Campo do NIF nos Contactos
  const cfg = await configuracao();
  try {
    const campos = (await crm("GET", "/settings/fields?module=Contacts"))?.fields || [];
    const atual = campos.find((f) => f.api_name === cfg.campoNif);
    if (atual) add(true, "Campo do NIF nos Contactos", `«${atual.field_label}» (${atual.api_name}, ${atual.data_type}).`);
    else {
      const cand = campos.filter((f) => /nif|contribuinte|fiscal|vat|tax/i.test(`${f.api_name} ${f.field_label}`));
      if (cand.length === 1 && !process.env.ZOHO_CAMPO_NIF) {
        guardado.campoNif = cand[0].api_name;
        add(true, "Campo do NIF nos Contactos", `Não há «${cfg.campoNif}»; encontrado «${cand[0].field_label}» (${cand[0].api_name}, ${cand[0].data_type}), que o site passa a usar.`);
      } else add(false, "Campo do NIF nos Contactos", cand.length
        ? `Não há «${cfg.campoNif}». Candidatos: ${cand.map((f) => `«${f.field_label}» (${f.api_name})`).join(", ")}. Indique o certo em ZOHO_CAMPO_NIF no Netlify.`
        : `Não há «${cfg.campoNif}» nem nenhum campo parecido nos Contactos. Campos: ${campos.map((f) => f.api_name).join(", ")}.`);
    }
  } catch (e) { add(false, "Campo do NIF nos Contactos", e.message); }

  // Reuniões: só se leem, para as horas ocupadas de quem é utilizador do CRM (bloqueios, ausências…)
  const agenda = process.env.ZOHO_MODULO_AGENDA || guardado.moduloAgenda || "Events";
  if (!temModulo(agenda)) add(false, "Reuniões (horas ocupadas)", `Não existe «${agenda}». Indique o módulo certo em ZOHO_MODULO_AGENDA no Netlify.`);
  else try {
    const campos = (await crm("GET", `/settings/fields?module=${agenda}`))?.fields || [];
    const faltam = ["Start_DateTime", "End_DateTime", "Owner"].filter((n) => !campos.some((f) => f.api_name === n));
    add(!faltam.length, `Reuniões (${agenda}), para horas ocupadas`, faltam.length ? `Faltam os campos ${faltam.join(", ")}.` : "Os eventos de cada terapeuta (utilizador do CRM) também ocupam a hora.");
  } catch (e) { add(false, `Reuniões (${agenda})`, e.message); }

  // Eventos dos próximos 14 dias (confirma a leitura por COQL)
  try {
    const agora = new Date(), ate = new Date(agora.getTime() + 14 * 864e5);
    const iso = (d) => d.toISOString().replace(/\.\d{3}Z$/, "+00:00");
    const evs = await eventos(iso(agora), iso(ate));
    const donos = {};
    for (const e of evs) donos[e.dono] = (donos[e.dono] || 0) + 1;
    const us = await utilizadores().catch(() => []);
    add(true, "Leitura da agenda", `${evs.length} eventos nos próximos 14 dias. Por responsável: ${Object.entries(donos).map(([id, n]) => `${us.find((u) => u.id === id)?.nome || id}: ${n}`).join(", ") || "nenhum"}.`);
  } catch (e) { add(false, "Leitura da agenda", e.message); }

  // Módulo das marcações («Tratamentos»)
  try {
    const mm = guardado.marcacoes = await descobrirMarcacoes();
    if (!mm.modulo) add(false, "Módulo das marcações (Tratamentos)", "Não há um módulo «Tratamentos»: as marcações do site não entram no Zoho. Se tiver outro nome, indique-o em ZOHO_MODULO_MARCACOES no Netlify.");
    else {
      const c = mm.campos, txt = (f) => `«${f.rotulo}» (${f.api}, ${f.tipo}${f.valores.length ? `: ${f.valores.join(" / ")}` : ""}${f.modulo ? ` → ${f.modulo}` : ""})`;
      const ok = completo(mm);
      add(ok, `Módulo das marcações (${mm.nomeModulo})`, ok ? `As marcações do site são criadas em ${mm.modulo} e as horas ocupadas também se leem daqui.` : "Falta saber o campo do início, da terapeuta ou do tratamento (abaixo): até lá, as marcações do site não entram no Zoho (a equipa recebe «Marcar à mão»).");
      const nomes = { inicio: "Início", fim: "Fim", nome: "Nome (tratamento)", artigo: "Artigo (Produtos)", estado: "Estado (Agendado)", pagamento: "Pagamento (Efetuado)", descricao: "Notas (n.º da marcação)", especialidade: "Especialidade (Spa)", valor: "Valor", preferencia: "Preferência pela terapeuta", cliente: "Cliente (Contactos)", origem: "Origem_Marcacao (Online)" };
      add(Boolean(c.terapeutas?.length), `${mm.nomeModulo}: Terapeuta`, c.terapeutas?.length ? `Na lista que tiver o nome dela: ${c.terapeutas.map(txt).join("; ")}` : "Campo não encontrado.");
      const semLista = (equipa || []).filter((p) => !(c.terapeutas || []).some((f) => !f.valores.length || f.valores.some((v) => simples(v) === simples(p.nome))));
      if (semLista.length) add(false, `${mm.nomeModulo}: terapeutas sem nome nas listas`, `${semLista.map((p) => p.nome).join(", ")}: as marcações delas ficam sem terapeuta no registo. Acrescente o nome (igual ao do site) a uma das listas.`);
      for (const [k, n] of Object.entries(nomes)) add(Boolean(c[k]), `${mm.nomeModulo}: ${n}`, c[k] ? txt(c[k]) : "Campo não encontrado.");
      if (c.tratamento?.valores.length) {
        const falta = tratamentos.filter((t) => !c.tratamento.valores.some((v) => simples(v) === simples(t.nome)));
        if (falta.length) add(false, `${mm.nomeModulo}: tratamentos sem valor igual na lista`, `${falta.map((t) => t.nome).join(", ")}. Acrescente-os à lista com o mesmo nome do site; até lá, nessas o tratamento fica só no nome e na descrição.`);
      }
      add(true, `${mm.nomeModulo}: todos os campos`, mm.todos.map(txt).join("; "));
    }
  } catch (e) { add(false, "Módulo das marcações (Tratamentos)", e.message); }

  // Módulo «Prestadores»: horário de cada colaboradora, que limita as horas livres do site
  try {
    const pr = await prestadores();
    if (!pr) add(false, "Módulo Prestadores", "Não encontrado: as horas livres do site seguem só o horário do SPA e as marcações.");
    else {
      const txt = (f) => `«${f.rotulo}» (${f.api}, ${f.tipo})`;
      add(Boolean(pr.horario), `Prestadores (${pr.modulo}): horário`, pr.horario ? `Lido de ${txt(pr.horario)}${pr.ativo ? `; só entra quem tiver ${txt(pr.ativo)}` : ""}.` : `Não há um campo de horário. Campos: ${pr.campos.map(txt).join("; ")}`);
      for (const p of equipa) {
        const r = pr.lista.find((x) => simples(x.nome) === simples(p.nome));
        if (!r) add(false, `Prestadores: ${p.nome}`, "Sem registo com este nome: as horas livres dela seguem só o horário do SPA.");
        else if (!r.ativo) add(false, `Prestadores: ${p.nome}`, "Não está ativa: fica fora da agenda online.");
        else if (!r.regras.length) add(false, `Prestadores: ${p.nome}`, `${r.texto ? `Não consegui ler «${r.texto}»` : "Horário padrão vazio"}: as horas livres dela seguem só o horário do SPA. Escreva, por exemplo, «seg-sex 09:00-18:00; sab 09:00-13:00 quinzenal 14-11-2026».`);
        else add(!r.erros.length, `Prestadores: ${p.nome}`, `${r.texto} → ${descreverHorario(r.regras)}${r.erros.length ? `. Não lido: ${r.erros.join("; ")}` : ""}`);
      }
    }
  } catch (e) { add(false, "Módulo Prestadores", e.message); }

  // Equipa do site ↔ utilizadores do CRM
  try {
    const us = await utilizadores();
    for (const p of equipa) {
      const u = us.find((x) => (p.zoho && x.email === simples(p.zoho)) || simples(x.nome) === simples(p.nome));
      add(Boolean(u), `Terapeuta: ${p.nome}`, u ? `Utilizador do CRM «${u.nome}» (${u.email}).` : `Sem utilizador no CRM com este nome. Utilizadores: ${us.map((x) => `${x.nome} (${x.email})`).join(", ")}. Indique o email no backoffice (Equipa → «Utilizador no Zoho CRM»).`);
    }
  } catch (e) { add(false, "Utilizadores do CRM", e.message); }

  await g.setJSON("config", { ...guardado, verificado: new Date().toISOString(), resultado: linhas });
  return linhas;
}
