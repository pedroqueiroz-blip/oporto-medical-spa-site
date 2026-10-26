// Ligação ao Zoho CRM (conta europeia, zoho.eu): clientes (Contactos) e agenda (Eventos).
// A ligação faz-se uma vez em /api/zoho/ligar, com a palavra-passe do backoffice: o Zoho devolve uma chave
// de renovação que fica guardada no Netlify Blobs (ou em ZOHO_REFRESH_TOKEN). Sem ZOHO_CLIENT_ID e
// ZOHO_CLIENT_SECRET no Netlify, o site continua com a agenda simulada e as marcações seguem por email.
import crypto from "node:crypto";
import { store, STORES } from "./store.mjs";

const CONTAS = () => (process.env.ZOHO_ACCOUNTS_BASE || "https://accounts.zoho.eu").replace(/\/$/, "");
export const ESCOPOS = "ZohoCRM.modules.ALL,ZohoCRM.users.READ,ZohoCRM.coql.READ,ZohoCRM.settings.modules.READ,ZohoCRM.settings.fields.READ";

// Campo do NIF e módulo da agenda: variável no Netlify, senão o que a verificação (/api/zoho/verificar)
// encontrou nos metadados do CRM, senão os nomes habituais.
async function configuracao() {
  const g = (await (await gaveta()).get("config", { type: "json" })) || {};
  return { campoNif: process.env.ZOHO_CAMPO_NIF || g.campoNif || "NIF", moduloAgenda: process.env.ZOHO_MODULO_AGENDA || g.moduloAgenda || "Events" };
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

export async function criarEvento({ titulo, inicio, fim, dono, cliente, descricao }) {
  const j = await crm("POST", `/${(await configuracao()).moduloAgenda}`, { data: [{
    Event_Title: titulo, Start_DateTime: inicio, End_DateTime: fim, Description: descricao,
    ...(dono ? { Owner: { id: dono } } : {}),
    ...(cliente ? { Who_Id: { id: cliente } } : {}),
  }] });
  return criado(j);
}

/* ---------- Verificação pela API de metadados ---------- */

// Confere no CRM real o que a integração precisa: módulos, campo do NIF, campos da agenda, utilizadores
// da equipa e leitura de eventos. Quando o campo do NIF não tem o nome habitual e há um só candidato,
// fica guardado para o site o usar. Devolve linhas { ok, titulo, detalhe } para a página de verificação.
export async function verificarCRM(equipa = []) {
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

  // Equipa do site ↔ utilizadores do CRM
  try {
    const us = await utilizadores();
    const simples = (x) => String(x || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
    for (const p of equipa) {
      const u = us.find((x) => (p.zoho && x.email === simples(p.zoho)) || simples(x.nome) === simples(p.nome));
      add(Boolean(u), `Terapeuta: ${p.nome}`, u ? `Utilizador do CRM «${u.nome}» (${u.email}).` : `Sem utilizador no CRM com este nome. Utilizadores: ${us.map((x) => `${x.nome} (${x.email})`).join(", ")}. Indique o email no backoffice (Equipa → «Utilizador no Zoho CRM»).`);
    }
  } catch (e) { add(false, "Utilizadores do CRM", e.message); }

  await g.setJSON("config", { ...guardado, verificado: new Date().toISOString(), resultado: linhas });
  return linhas;
}
