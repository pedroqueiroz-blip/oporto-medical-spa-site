// Página de verificação do backoffice (/admin-verificar), protegida pela palavra-passe da equipa.
// Confirma, só com leituras, as ligações configuradas no Netlify: entrada no /admin, reconstrução diária,
// código VIP, emails (Resend), faturação (Moloni ON) e pagamentos (euPago). Não cria pagamentos nem faturas.
// Com «Enviar email de teste», manda um email para o endereço do site, para confirmar o envio de ponta a ponta.
import { createHash, timingSafeEqual } from "node:crypto";
import { verificarEupago } from "../../servidor/eupago.mjs";
import { verificarMoloni } from "../../servidor/moloni.mjs";
import { spa } from "../../servidor/catalogo.mjs";

export const config = { path: "/admin-verificar" };

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const resumo = (t) => createHash("sha256").update(String(t)).digest();
const certa = (dada, guardada) => Boolean(dada && guardada) && timingSafeEqual(resumo(dada), resumo(guardada));
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const env = (k) => String(process.env[k] || "").trim();

const pagina = (corpo, status = 200) => new Response(`<!doctype html>
<html lang="pt"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Verificar ligações · backoffice</title>
<style>
  body{margin:0;background:#F4EEE4;color:#24180F;font:15px/1.55 Manrope,system-ui,sans-serif}
  main{max-width:760px;margin:0 auto;padding:40px 16px 60px}
  h1{font:400 34px/1.15 "EB Garamond",Georgia,serif;color:#0D0A08;margin:0 0 6px}
  h2{font:400 24px/1.2 "EB Garamond",Georgia,serif;color:#3B2919;margin:30px 0 8px}
  .nota{color:#7A6650;margin:0 0 20px}
  form{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:18px 0}
  input[type=password]{flex:1 1 220px;padding:11px 14px;border:1px solid #E6DACA;border-radius:4px;background:#FFFCF7;font:inherit}
  button{padding:11px 22px;border:0;border-radius:999px;background:#3B2919;color:#E8DCC8;font:600 12px Manrope,system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase;cursor:pointer}
  label{font-size:14px;color:#3B2919}
  .erro{color:#a3442f;width:100%;margin:0}
  ul{list-style:none;margin:0;padding:0;background:#FFFCF7;border-radius:6px;box-shadow:0 1px 0 #E6DACA}
  li{display:grid;grid-template-columns:28px 1fr;gap:2px 8px;padding:10px 14px;border-bottom:1px solid #F1E6D6}
  li:last-child{border-bottom:0}
  .s{grid-row:span 2;font-weight:700;font-size:17px;line-height:1.3}
  .ok .s{color:#3d7a3a}.falha .s{color:#a3442f}.aviso .s{color:#b07a2a}
  .d{grid-column:2;color:#7A6650;font-size:13px;overflow-wrap:anywhere}
  .resumo{font-weight:600;margin:20px 0 0}
</style></head><body><main>${corpo}</main></body></html>`, {
  status,
  headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Frame-Options": "DENY", "Referrer-Policy": "no-referrer" }
});

const formulario = (erro = "") => pagina(`<h1>Verificar ligações</h1>
<p class="nota">Confirma as chaves gravadas no Netlify sem criar pagamentos nem faturas.</p>
<form method="post">
  <input type="password" name="senha" placeholder="Palavra-passe do backoffice" autocomplete="current-password" autofocus required>
  <button type="submit">Verificar</button>
  <label><input type="checkbox" name="email" value="1"> Enviar email de teste para ${esc(spa?.email || "o email do site")}</label>
  ${erro ? `<p class="erro">${esc(erro)}</p>` : ""}
</form>`, erro ? 401 : 200);

// estado: true (✓), false (✗) ou "aviso" (!)
const item = (texto, estado, detalhe = "") => ({ texto, estado, detalhe });

function backoffice() {
  const t = env("BACKOFFICE_GITHUB_TOKEN");
  return [
    item("Palavra-passe do backoffice (BACKOFFICE_PASSWORD)", true, "definida"),
    item("Chave do GitHub para o backoffice (BACKOFFICE_GITHUB_TOKEN)", Boolean(t), t ? `começa por "${t.slice(0, 11)}…"` : "não está definida"),
  ];
}

async function github() {
  const t = env("BACKOFFICE_GITHUB_TOKEN");
  if (!t) return [];
  try {
    const r = await fetch("https://api.github.com/repos/pedroqueiroz-blip/oporto-medical-spa-site", {
      headers: { Authorization: `Bearer ${t}`, Accept: "application/vnd.github+json", "User-Agent": "oporto-medical-spa-site" },
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return [item("A chave do GitHub abre o repositório", false, `GitHub ${r.status}: crie uma chave nova (pode ter expirado)`)];
    const j = await r.json();
    const fim = r.headers.get("github-authentication-token-expiration");
    return [item("A chave do GitHub abre o repositório e pode gravar", Boolean(j.permissions?.push), (j.permissions?.push ? "leitura e escrita" : "só leitura: dê Contents em Read and write") + (fim ? ` · expira a ${fim.slice(0, 10)}` : ""))];
  } catch {
    return [item("A chave do GitHub abre o repositório", "aviso", "o GitHub não respondeu; tente de novo")];
  }
}

function reconstrucao() {
  const h = env("BUILD_HOOK_URL");
  if (!h) return [item("Reconstrução diária (BUILD_HOOK_URL)", false, "não está definida: as campanhas não mudam sozinhas nas datas")];
  const certo = /^https:\/\/api\.netlify\.com\/build_hooks\/[a-z0-9]+$/i.test(h);
  return [item("Reconstrução diária (BUILD_HOOK_URL)", certo || "aviso", certo ? "endereço de build hook do Netlify, todos os dias às 00:10" : "não parece um build hook do Netlify (https://api.netlify.com/build_hooks/…)")];
}

function vip() {
  const c = env("CODIGO_VIP");
  if (!c) return [item("Código VIP (CODIGO_VIP)", "aviso", "não definido: vale o código VIP, fácil de adivinhar")];
  const fraco = c.length < 6 || /^vip$/i.test(c);
  return [item("Código VIP (CODIGO_VIP)", fraco ? "aviso" : true, `${c.length} caracteres${fraco ? ": convém um código mais difícil de adivinhar" : ""}`)];
}

async function resend(enviarTeste) {
  const k = env("RESEND_API_KEY"), de = env("EMAIL_FROM");
  const res = [
    item("Chave da Resend (RESEND_API_KEY)", Boolean(k), k ? `começa por "${k.slice(0, 5)}…"` : "não está definida: nenhum email é enviado"),
    item("Remetente (EMAIL_FROM)", Boolean(de), de || "não está definido, ex.: Oporto Medical Spa <reservas@oportomedicalspa.com>"),
  ];
  if (!k || !de) return res;
  const dominio = (de.match(/@([^>\s]+)/) || [])[1]?.toLowerCase();
  try {
    const r = await fetch("https://api.resend.com/domains", { headers: { Authorization: `Bearer ${k}` }, signal: AbortSignal.timeout(10000) });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401 && /restricted/i.test(j.name || j.message || "")) {
      res.push(item(`Domínio ${dominio || ""} validado na Resend`, "aviso", "a chave só permite enviar e não deixa ver os domínios: use «Enviar email de teste» para confirmar"));
    } else if (!r.ok) {
      res.push(item("A Resend aceita a chave", false, `Resend ${r.status}: ${j.message || j.name || "erro"}`));
    } else {
      const d = (j.data || []).find((x) => x.name?.toLowerCase() === dominio);
      res.push(item(`Domínio ${dominio || "do remetente"} validado na Resend`, d?.status === "verified",
        d ? `estado: ${d.status}${d.status === "verified" ? "" : " (faltam registos DNS)"}` : `não está na conta (domínios: ${(j.data || []).map((x) => x.name).join(", ") || "nenhum"})`));
    }
  } catch {
    res.push(item("A Resend aceita a chave", "aviso", "a Resend não respondeu; tente de novo"));
  }
  if (enviarTeste && spa?.email) {
    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST", signal: AbortSignal.timeout(15000),
        headers: { Authorization: `Bearer ${k}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: de, to: [spa.email], subject: "Teste do site: os emails estão a funcionar", html: "<p>Este email foi enviado pela página de verificação do backoffice. Os emails de marcações, vouchers e newsletter saem deste remetente.</p>" }),
      });
      const j = await r.json().catch(() => ({}));
      res.push(item(`Email de teste enviado para ${spa.email}`, r.ok, r.ok ? "veja a caixa de entrada (e o spam)" : `Resend ${r.status}: ${j.message || j.name || "erro"}`));
    } catch {
      res.push(item("Email de teste", false, "a Resend não respondeu"));
    }
  }
  return res;
}

const conv = (lista) => lista.map((p) => item(p.texto, p.ok, p.detalhe));

async function moloni() {
  const res = conv(await verificarMoloni().catch((e) => [{ texto: "Moloni ON", ok: false, detalhe: e.message }]));
  if (env("MOLONI_API_KEY")) res.push(item("Faturas (MOLONI_FECHAR)", "aviso",
    /^sim$/i.test(env("MOLONI_FECHAR")) ? "sim: as faturas saem fechadas e são enviadas ao cliente" : "não definida: as faturas ficam em rascunho (bom para testar; antes de lançar, defina sim)"));
  return res;
}

async function eupago(origem) {
  const res = conv(await verificarEupago().catch((e) => [{ texto: "euPago", ok: false, detalhe: e.message }]));
  // O endereço principal do site (URL, definido pelo Netlify), e não o da pré-visualização: os pedidos são os mesmos.
  if (env("EUPAGO_API_KEY")) res.push(item("URL de notificação a pôr no canal euPago", "aviso", `${(env("URL") || origem).replace(/\/$/, "")}/api/eupago-notificacao`));
  return res;
}

function outras() {
  const z = env("ZOHO_CLIENT_ID") && env("ZOHO_CLIENT_SECRET");
  return [
    item("Zoho CRM (ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET)", z ? true : "aviso", z ? "definidas; a agenda verifica-se em /api/zoho/verificar quando estiver publicada" : "não definidas: a agenda do site fica simulada"),
    item("Avaliações Google automáticas (GOOGLE_PLACES_KEY)", env("GOOGLE_PLACES_KEY") ? true : "aviso", env("GOOGLE_PLACES_KEY") ? "definida" : "opcional: sem ela ficam as avaliações escritas no backoffice"),
  ];
}

const lista = (itens) => `<ul>${itens.map((i) => {
  const c = i.estado === true ? "ok" : i.estado === false ? "falha" : "aviso";
  return `<li class="${c}"><span class="s">${c === "ok" ? "✓" : c === "falha" ? "✗" : "!"}</span><span>${esc(i.texto)}</span><span class="d">${esc(i.detalhe)}</span></li>`;
}).join("")}</ul>`;

export default async (req) => {
  if (!env("BACKOFFICE_PASSWORD")) return pagina(`<h1>Verificar ligações</h1><p>Falta a palavra-passe do backoffice (BACKOFFICE_PASSWORD) no Netlify, que protege esta página.</p>`);
  if (req.method !== "POST") return formulario();
  const dados = new URLSearchParams(await req.text());
  // Palavra-passe, ou a chave da sessão já aberta no /admin (botão «Verificar ligações»).
  if (!certa(dados.get("senha") || "", env("BACKOFFICE_PASSWORD")) && !certa(dados.get("senha") || "", env("BACKOFFICE_GITHUB_TOKEN"))) { await pausa(1500); return formulario("Palavra-passe errada."); }

  const origem = new URL(req.url).origin;
  const [gh, em, mo, eu] = await Promise.all([github(), resend(dados.get("email") === "1"), moloni(), eupago(origem)]);
  const grupos = [
    ["Entrada no backoffice", [...backoffice(), ...gh]],
    ["Reconstrução diária e código VIP", [...reconstrucao(), ...vip()]],
    ["Emails (Resend)", em],
    ["Faturação (Moloni ON)", mo],
    ["Pagamentos (euPago)", eu],
    ["Outras ligações", outras()],
  ];
  const falhas = grupos.flatMap(([, i]) => i).filter((i) => i.estado === false).length;
  return pagina(`<h1>Verificar ligações</h1>
<p class="nota">${esc(origem)} · ${new Date().toLocaleString("pt-PT", { timeZone: "Europe/Lisbon" })}. Depois de mudar uma variável no Netlify, publique de novo (Deploys → Trigger deploy) antes de verificar.</p>
${grupos.map(([t, i]) => `<h2>${esc(t)}</h2>${lista(i)}`).join("")}
<p class="resumo">${falhas ? `${falhas} ${falhas === 1 ? "ponto por resolver" : "pontos por resolver"} (✗). Os ! são avisos.` : "Tudo ligado. Os ! são avisos."}</p>`);
};
