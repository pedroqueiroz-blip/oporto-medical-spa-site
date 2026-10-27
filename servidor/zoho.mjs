// Ligação ao Zoho CRM (conta europeia, zoho.eu): clientes (Contactos) e agenda (Eventos).
// A ligação faz-se uma vez em /api/zoho/ligar, com a palavra-passe do backoffice: o Zoho devolve uma chave
// de renovação que fica guardada no Netlify Blobs (ou em ZOHO_REFRESH_TOKEN). Sem ZOHO_CLIENT_ID e
// ZOHO_CLIENT_SECRET no Netlify, o site continua com a agenda simulada e as marcações seguem por email.
import crypto from "node:crypto";
import { store, STORES } from "./store.mjs";

const CONTAS = () => (process.env.ZOHO_ACCOUNTS_BASE || "https://accounts.zoho.eu").replace(/\/$/, "");
export const ESCOPOS = "ZohoCRM.modules.ALL,ZohoCRM.users.READ,ZohoCRM.coql.READ,ZohoCRM.settings.modules.READ,ZohoCRM.settings.fields.READ";

// Campo do NIF, módulo da agenda e campo do tratamento: variável no Netlify, senão o que a verificação
// (/api/zoho/verificar) encontrou nos metadados do CRM, senão os nomes habituais.
async function configuracao() {
  const g = (await (await gaveta()).get("config", { type: "json" })) || {};
  return {
    campoNif: process.env.ZOHO_CAMPO_NIF || g.campoNif || "NIF", moduloAgenda: process.env.ZOHO_MODULO_AGENDA || g.moduloAgenda || "Events",
    tratamento: g.tratamento?.campo && (!process.env.ZOHO_CAMPO_TRATAMENTO || process.env.ZOHO_CAMPO_TRATAMENTO === g.tratamento.campo) ? g.tratamento : null,
  };
}

const simples = (x) => String(x || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

// Valor do campo do tratamento na agenda: lista de escolha (valor com o mesmo nome), texto, ou ligação a
// um registo de outro módulo (p. ex. Produtos) com o mesmo nome. Sem correspondência, fica só no título.
async function valorTratamento(cfg, nome) {
  if (!cfg) return undefined;
  if (cfg.tipo === "picklist" || cfg.tipo === "multiselectpicklist") {
    const v = (cfg.valores || []).find((x) => simples(x) === simples(nome));
    return v === undefined ? undefined : cfg.tipo === "picklist" ? v : [v];
  }
  if (cfg.tipo === "lookup" && cfg.modulo) {
    const j = await crm("GET", `/${cfg.modulo}/search?word=${encodeURIComponent(nome)}`);
    const r = (j?.data || []).find((x) => Object.values(x).some((v) => typeof v === "string" && simples(v) === simples(nome)));
    return r ? { id: r.id } : undefined;
  }
  return ["text", "textarea"].includes(cfg.tipo) ? nome : undefined;
}

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
    const q = `select Owner, Start_DateTime, End_DateTime, All_day from ${moduloAgenda} where Start_DateTime between '${de}' and '${ate}' order by Start_DateTime limit ${offset}, 200`;
    const j = await crm("POST", "/coql", { select_query: q });
    const linhas = j?.data || [];
    out.push(...linhas.map((e) => ({ dono: e.Owner?.id || e.Owner, inicio: Date.parse(e.Start_DateTime), fim: Date.parse(e.End_DateTime), diaInteiro: Boolean(e.All_day), dia: String(e.Start_DateTime).slice(0, 10) })));
    if (!j?.info?.more_records) break;
  }
  return out;
}

export async function criarEvento({ titulo, inicio, fim, dono, cliente, descricao, tratamento }) {
  const cfg = await configuracao();
  const trat = tratamento ? await valorTratamento(cfg.tratamento, tratamento).catch(() => undefined) : undefined;
  const j = await crm("POST", `/${cfg.moduloAgenda}`, { data: [{
    Event_Title: titulo, Start_DateTime: inicio, End_DateTime: fim, Description: descricao, Origem_Marcacao: "Online",
    ...(dono ? { Owner: { id: dono } } : {}),
    ...(cliente ? { Who_Id: { id: cliente } } : {}),
    ...(trat !== undefined ? { [cfg.tratamento.campo]: trat } : {}),
  }] });
  return criado(j);
}

/* ---------- Módulo das marcações (Agenda do Zoho → «Tratamentos») ---------- */

// O SPA marca no módulo «Tratamentos» (Pedro, 27/10/2026): cada registo tem tratamento, terapeuta, estado,
// pagamento, início e fim. O módulo e os campos encontram-se pelos nomes nos metadados do CRM (ou
// ZOHO_MODULO_MARCACOES) e ficam guardados um dia; a verificação volta a procurá-los. Sem o módulo,
// as marcações continuam como eventos (Reuniões).
const CANCELADA = /cancel|anulad|desmarc|falt/;
const resumo = (f) => ({ api: f.api_name, rotulo: f.field_label, tipo: f.data_type, valores: (f.pick_list_values || []).map((v) => v.display_value), modulo: f.lookup?.module?.api_name || "" });
function mapear(campos) {
  const r = campos.map(resumo), por = (re) => r.find((f) => re.test(simples(f.rotulo)));
  const datas = r.filter((f) => f.tipo === "datetime");
  const fim = datas.find((f) => /^(fim|termino|end|ate)/.test(simples(f.rotulo)));
  const inicio = datas.find((f) => f !== fim && /inicio|^data|^hora|start/.test(simples(f.rotulo))) || datas.find((f) => f !== fim);
  return {
    nome: r.find((f) => f.api === "Name"), inicio, fim,
    tratamento: por(/^tratamento/), terapeuta: por(/^terapeuta|^profissiona/),
    estado: por(/^estado/), pagamento: por(/^pagamento/), descricao: por(/^descri/),
    cliente: r.find((f) => f.tipo === "lookup" && f.modulo === "Contacts"),
    origem: r.find((f) => f.api === "Origem_Marcacao"),
  };
}
async function descobrirMarcacoes() {
  const out = { em: new Date().toISOString(), modulo: null };
  const mods = (await crm("GET", "/settings/modules"))?.modules || [];
  const pedido = process.env.ZOHO_MODULO_MARCACOES;
  const m = mods.find((x) => pedido ? x.api_name === pedido : x.api_name !== "Products" && (simples(x.plural_label) === "tratamentos" || simples(x.singular_label) === "tratamento"));
  if (!m) return out;
  const campos = (await crm("GET", `/settings/fields?module=${m.api_name}`))?.fields || [];
  return { ...out, modulo: m.api_name, nomeModulo: m.plural_label || m.api_name, campos: mapear(campos), todos: campos.map(resumo) };
}
export async function moduloMarcacoes() {
  const g = await gaveta(), cfg = (await g.get("config", { type: "json" })) || {};
  let mm = cfg.marcacoes;
  if (!mm || Date.now() - Date.parse(mm.em) > 864e5) {
    mm = await descobrirMarcacoes();
    await g.setJSON("config", { ...((await g.get("config", { type: "json" })) || {}), marcacoes: mm });
  }
  return mm.modulo && mm.campos?.inicio && mm.campos?.terapeuta ? mm : null;
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

export async function criarMarcacao(mm, { titulo, inicio, fim, dono, terapeuta, cliente, tratamento, descricao, semPagamento }) {
  const c = mm.campos, d = {};
  const por = async (f, v) => { const x = await v; if (f && x !== undefined) d[f.api] = x; };
  if (c.nome) d[c.nome.api] = titulo;
  d[c.inicio.api] = inicio;
  if (c.fim) d[c.fim.api] = fim;
  await por(c.tratamento, valorCampo(c.tratamento, tratamento).catch(() => undefined));
  await por(c.terapeuta, valorCampo(c.terapeuta, terapeuta, dono).catch(() => undefined));
  await por(c.estado, escolher(c.estado, "Agendado", /^agendad/, /^marcad/, /^confirmad/));
  await por(c.pagamento, semPagamento ? escolher(c.pagamento, "Voucher", /voucher|oferta|vip/, /^pag[oa]$/) : escolher(c.pagamento, "Pago", /^pag[oa]$/, /^pag[oa] /));
  await por(c.descricao, ["text", "textarea"].includes(c.descricao?.tipo) ? descricao : undefined);
  await por(c.cliente, cliente ? { id: cliente } : undefined);
  await por(c.origem, escolher(c.origem, "Online", /^online$/));
  return criado(await crm("POST", `/${mm.modulo}`, { data: [d] }));
}

// Marcações do módulo entre duas datas, com a terapeuta (utilizador ou nome); as canceladas não contam.
export async function marcacoesModulo(mm, de, ate) {
  const c = mm.campos, cols = [c.inicio, c.fim, c.terapeuta, c.estado].filter(Boolean).map((f) => f.api);
  const out = [];
  for (let offset = 0; offset < 2000; offset += 200) {
    const q = `select ${cols.join(", ")} from ${mm.modulo} where ${c.inicio.api} between '${de}' and '${ate}' order by ${c.inicio.api} limit ${offset}, 200`;
    const j = await crm("POST", "/coql", { select_query: q });
    for (const r of j?.data || []) {
      if (c.estado && CANCELADA.test(simples(r[c.estado.api]))) continue;
      const t = [].concat(r[c.terapeuta.api] ?? [])[0];
      const inicio = Date.parse(r[c.inicio.api]), fim = c.fim && r[c.fim.api] ? Date.parse(r[c.fim.api]) : inicio + 60 * 60e3;
      out.push({ dono: c.terapeuta.tipo === "userlookup" ? t?.id : null, nome: typeof t === "object" ? t?.name || "" : String(t || ""), inicio, fim, diaInteiro: false, dia: String(r[c.inicio.api]).slice(0, 10) });
    }
    if (!j?.info?.more_records) break;
  }
  return out;
}

// Tudo o que ocupa a agenda: eventos (Reuniões, por responsável) e marcações do módulo «Tratamentos».
export async function ocupacoes(de, ate) {
  const mm = await moduloMarcacoes();
  return [...await eventos(de, ate), ...(mm ? await marcacoesModulo(mm, de, ate) : [])];
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

  // Módulo da agenda e os campos usados
  const agenda = process.env.ZOHO_MODULO_AGENDA || guardado.moduloAgenda || "Events";
  if (!temModulo(agenda)) add(false, "Módulo da agenda", `Não existe «${agenda}». Indique o módulo certo em ZOHO_MODULO_AGENDA no Netlify.`);
  else try {
    const campos = (await crm("GET", `/settings/fields?module=${agenda}`))?.fields || [];
    const faltam = ["Event_Title", "Start_DateTime", "End_DateTime", "Owner", "Who_Id"].filter((n) => !campos.some((f) => f.api_name === n));
    add(!faltam.length, `Módulo da agenda (${agenda})`, faltam.length ? `Faltam os campos ${faltam.join(", ")}.` : "Título, início, fim, responsável e contacto disponíveis.");
    // Campos próprios da agenda (onde pode estar a terapeuta de cada marcação)
    const proprios = campos.filter((f) => f.custom_field || ["picklist", "multiselectpicklist", "lookup", "userlookup", "ownerlookup"].includes(f.data_type));
    // As marcações do site gravam Origem_Marcacao = «Online» (pedido do SPA).
    const origem = campos.find((f) => f.api_name === "Origem_Marcacao");
    const valoresOrigem = (origem?.pick_list_values || []).map((v) => v.display_value);
    add(Boolean(origem) && (!valoresOrigem.length || valoresOrigem.includes("Online")), "Origem da marcação", !origem ? "A agenda não tem o campo Origem_Marcacao." : valoresOrigem.length && !valoresOrigem.includes("Online") ? `A lista de «${origem.field_label}» não tem o valor «Online» (tem: ${valoresOrigem.join(" / ")}).` : `As marcações do site ficam com «${origem.field_label}» = Online.`);
    // Campo do tratamento: ZOHO_CAMPO_TRATAMENTO no Netlify, senão um único campo com nome parecido.
    const pedido = process.env.ZOHO_CAMPO_TRATAMENTO;
    const cand = pedido ? campos.filter((f) => f.api_name === pedido) : campos.filter((f) => /tratamento|servi[cç]o|treatment|service/i.test(`${f.api_name} ${f.field_label}`));
    if (cand.length === 1) {
      const f = cand[0], valores = (f.pick_list_values || []).map((v) => v.display_value);
      guardado.tratamento = { campo: f.api_name, tipo: f.data_type, valores, modulo: f.lookup?.module?.api_name || "" };
      const semValor = ["picklist", "multiselectpicklist"].includes(f.data_type) ? tratamentos.filter((t) => !valores.some((v) => simples(v) === simples(t.nome))) : [];
      add(!semValor.length, "Tratamento nas marcações", `As marcações do site preenchem «${f.field_label}» (${f.api_name}, ${f.data_type}${guardado.tratamento.modulo ? ` → ${guardado.tratamento.modulo}` : ""}) com o nome do tratamento.`
        + (semValor.length ? ` Sem valor igual na lista: ${semValor.map((t) => t.nome).join(", ")}. Acrescente-os à lista no Zoho (com o mesmo nome do site); até lá, nessas o tratamento fica só no título.` : ""));
    } else {
      delete guardado.tratamento;
      add(false, "Tratamento nas marcações", cand.length
        ? `Há vários campos possíveis: ${cand.map((f) => `«${f.field_label}» (${f.api_name})`).join(", ")}. Indique o certo em ZOHO_CAMPO_TRATAMENTO no Netlify.`
        : pedido ? `Não há o campo «${pedido}» na agenda.` : `A agenda não tem um campo «Tratamento»: o tratamento fica só no título e na descrição. Para o ter num campo próprio, crie em Reuniões um campo «Tratamento» (lista de escolha com os nomes do site, ou texto) e verifique de novo.`);
    }
    if (proprios.length) add(true, `Campos da agenda que podem indicar a terapeuta`, proprios.map((f) => `«${f.field_label}» (${f.api_name}, ${f.data_type}${f.pick_list_values?.length ? `: ${f.pick_list_values.map((v) => v.display_value).join(" / ")}` : ""}${f.lookup?.module?.api_name ? ` → ${f.lookup.module.api_name}` : ""})`).join("; "));
  } catch (e) { add(false, `Módulo da agenda (${agenda})`, e.message); }

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
    if (!mm.modulo) add(false, "Módulo das marcações (Tratamentos)", "Não há um módulo «Tratamentos»: as marcações vão para Reuniões. Se tiver outro nome, indique-o em ZOHO_MODULO_MARCACOES no Netlify.");
    else {
      const c = mm.campos, txt = (f) => `«${f.rotulo}» (${f.api}, ${f.tipo}${f.valores.length ? `: ${f.valores.join(" / ")}` : ""}${f.modulo ? ` → ${f.modulo}` : ""})`;
      const ok = Boolean(c.inicio && c.terapeuta);
      add(ok, `Módulo das marcações (${mm.nomeModulo})`, ok ? `As marcações do site são criadas em ${mm.modulo} e as horas ocupadas também se leem daqui.` : "Faltam os campos de início e/ou terapeuta: as marcações continuam em Reuniões.");
      const nomes = { inicio: "Início", fim: "Fim", tratamento: "Tratamento", terapeuta: "Terapeuta", estado: "Estado (Agendado)", pagamento: "Pagamento (Pago)", descricao: "Descrição", cliente: "Cliente (Contactos)", origem: "Origem_Marcacao (Online)" };
      for (const [k, n] of Object.entries(nomes)) add(Boolean(c[k]) || ["fim", "descricao", "origem"].includes(k), `${mm.nomeModulo}: ${n}`, c[k] ? txt(c[k]) : "Campo não encontrado.");
      if (c.tratamento?.valores.length) {
        const falta = tratamentos.filter((t) => !c.tratamento.valores.some((v) => simples(v) === simples(t.nome)));
        if (falta.length) add(false, `${mm.nomeModulo}: tratamentos sem valor igual na lista`, `${falta.map((t) => t.nome).join(", ")}. Acrescente-os à lista com o mesmo nome do site; até lá, nessas o tratamento fica só no nome e na descrição.`);
      }
      add(true, `${mm.nomeModulo}: todos os campos`, mm.todos.map(txt).join("; "));
    }
  } catch (e) { add(false, "Módulo das marcações (Tratamentos)", e.message); }

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
