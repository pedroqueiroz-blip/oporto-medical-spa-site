// API de pagamentos do site (/api/*): preço com código, pagamento na euPago, estado do pedido
// e a notificação de pagamento da euPago. A fatura (Moloni ON) e os emails seguem do servidor.
import { calcular, criar, obter, publico, ErroCliente } from "../../servidor/pedidos.mjs";
import { pagar, notificacao } from "../../servidor/fluxo.mjs";
import { disponibilidade, confirmarHora, guardarHora, ErroAgenda } from "../../servidor/agenda.mjs";
import { lingua, erroEN, codigoEN } from "../../servidor/ingles.mjs";
import { zohoConfigurado, estadoLigacao, urlAutorizacao, concluirLigacao, verificarCRM } from "../../servidor/zoho.mjs";
import catalogo from "../../servidor/gerado/catalogo.json" with { type: "json" };
import { createHash, timingSafeEqual } from "node:crypto";

export const config = { path: "/api/*" };

const json = (dados, status = 200) => new Response(JSON.stringify(dados), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
const pausa = (ms) => new Promise((r) => setTimeout(r, ms)); // trava tentativas de códigos em série

// Página simples (ligação ao Zoho CRM), nas cores da marca.
const pagina = (html, status = 200) => new Response(`<!doctype html><html lang="pt"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Ligar ao Zoho CRM</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0D0A08;color:#E8DCC8;font:15px/1.6 Manrope,system-ui,sans-serif}main{width:min(380px,calc(100vw - 32px));text-align:center}h1{font:400 26px "EB Garamond",Georgia,serif}input{box-sizing:border-box;width:100%;padding:12px 14px;border:1px solid rgba(232,220,200,.3);border-radius:4px;background:transparent;color:inherit;font:inherit}button{margin-top:14px;width:100%;padding:12px;border:0;border-radius:999px;background:#E8DCC8;color:#0D0A08;font:600 12px Manrope,system-ui,sans-serif;letter-spacing:.14em;text-transform:uppercase;cursor:pointer}.nota{font-size:13px;opacity:.8}.erro{color:#E0A58C}</style></head><body><main>${html}</main></body></html>`,
  { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Frame-Options": "DENY", "Referrer-Policy": "no-referrer" } });
const resumo = (t) => createHash("sha256").update(String(t)).digest();
const senhaCerta = (dada) => Boolean(process.env.BACKOFFICE_PASSWORD && dada) && timingSafeEqual(resumo(dada), resumo(process.env.BACKOFFICE_PASSWORD));

async function corpo(req) {
  const tipo = req.headers.get("content-type") || "";
  if (tipo.includes("json")) return req.json().catch(() => ({}));
  return Object.fromEntries(new URLSearchParams(await req.text()));
}

export default async (req) => {
  const url = new URL(req.url);
  const rota = url.pathname.replace(/^\/api/, "").replace(/\/$/, "");
  const m = req.method;
  // Páginas em inglês (/en/) pedem com ?lingua=en: erros, códigos e pedido em inglês.
  const en = lingua(url.searchParams.get("lingua")) === "en";
  const erro = (msg) => (en ? erroEN(msg) : msg);
  try {
    // Valor a pagar com um código (VIP, newsletter ou voucher), para a página de confirmação.
    if (rota === "/preco" && m === "POST") {
      const c = await corpo(req);
      if (c.codigo) await pausa(300);
      const r = await calcular({ tipo: c.tipo, tratamento: c.tratamento, codigo: c.codigo, campanha: c.campanha });
      return json({ precoBase: r.precoBase, desconto: r.desconto, total: r.total, codigo: r.codigo && { tipo: r.codigo.tipo, texto: (en ? codigoEN(r.codigo) : r.codigo).texto } });
    }

    // Ligação ao Zoho CRM (uma vez): palavra-passe do backoffice → autorização no Zoho → regresso com a chave.
    if (rota === "/zoho/ligar") {
      if (!zohoConfigurado()) return pagina(`<h1>Zoho CRM</h1><p>Falta pôr ZOHO_CLIENT_ID e ZOHO_CLIENT_SECRET nas variáveis do Netlify e publicar de novo.</p>`);
      if (!process.env.BACKOFFICE_PASSWORD) return pagina(`<h1>Zoho CRM</h1><p>Falta a palavra-passe do backoffice (BACKOFFICE_PASSWORD) no Netlify, que protege esta página.</p>`);
      if (m === "POST") {
        const senha = new URLSearchParams(await req.text()).get("senha") || "";
        if (senhaCerta(senha)) return Response.redirect(await urlAutorizacao(`${url.origin}/api/zoho/retorno`), 302);
        await pausa(1500);
      }
      const e = await estadoLigacao();
      return pagina(`<h1>Ligar ao Zoho CRM</h1><p class="nota">${e.ligado ? `Ligado${e.em ? ` desde ${new Date(e.em).toLocaleDateString("pt-PT")}` : ""}. Só precisa de ligar de novo se mudar de conta.` : "A agenda online fica ligada à agenda e às fichas de clientes do Zoho CRM."}</p>
<form method="post"><input type="password" name="senha" placeholder="Palavra-passe do backoffice" autocomplete="current-password" required>${m === "POST" ? `<p class="erro">Palavra-passe errada.</p>` : ""}<button type="submit">${e.ligado ? "Ligar de novo" : "Ligar"}</button></form>`, m === "POST" ? 401 : 200);
    }
    // Verificação da ligação pela API de metadados do CRM (protegida pela palavra-passe do backoffice).
    if (rota === "/zoho/verificar") {
      const ok = m === "POST" && senhaCerta(new URLSearchParams(await req.text()).get("senha") || "");
      if (!ok) {
        if (m === "POST") await pausa(1500);
        return pagina(`<h1>Verificar o Zoho CRM</h1><p class="nota">Confere módulos, campo do NIF, agenda e equipa no CRM.</p><form method="post"><input type="password" name="senha" placeholder="Palavra-passe do backoffice" required>${m === "POST" ? `<p class="erro">Palavra-passe errada.</p>` : ""}<button type="submit">Verificar</button></form>`, m === "POST" ? 401 : 200);
      }
      if (!(await estadoLigacao()).ligado) return pagina(`<h1>Zoho CRM por ligar</h1><p><a href="/api/zoho/ligar" style="color:inherit">Ligar primeiro</a>.</p>`);
      const linhas = await verificarCRM(catalogo.equipa || []);
      const e = (x) => String(x).replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
      return pagina(`<h1>Verificação do Zoho CRM</h1><div style="text-align:left">${linhas.map((l) => `<p><b>${l.ok ? "✓" : "✗"} ${e(l.titulo)}</b><br><span class="nota">${e(l.detalhe)}</span></p>`).join("")}</div>`);
    }

    if (rota === "/zoho/retorno" && m === "GET") {
      if (url.searchParams.get("error")) return pagina(`<h1>Ligação cancelada</h1><p>O Zoho não autorizou (${url.searchParams.get("error").replace(/[<>&"]/g, "")}). Pode voltar a <a href="/api/zoho/ligar" style="color:inherit">tentar</a>.</p>`, 400);
      try {
        await concluirLigacao(`${url.origin}/api/zoho/retorno`, url.searchParams.get("code"), url.searchParams.get("state"));
        return pagina(`<h1>Zoho CRM ligado</h1><p>A agenda do site passa a usar as horas livres do CRM e as marcações pagas entram na agenda, com a ficha do cliente.</p>`);
      } catch (e) {
        return pagina(`<h1>Não foi possível ligar</h1><p class="erro">${String(e.message).replace(/[<>&"]/g, "")}</p><p><a href="/api/zoho/ligar" style="color:inherit">Tentar de novo</a></p>`, 400);
      }
    }

    // Horas livres da agenda (Zoho CRM) para um tratamento; sem Zoho ligado responde { fonte: "simulada" }.
    if (rota === "/disponibilidade" && m === "GET") {
      return json(await disponibilidade({ tratamento: url.searchParams.get("tratamento"), de: url.searchParams.get("de"), dias: url.searchParams.get("dias") }));
    }

    // Cria o pedido e o pagamento. Com total 0 (VIP ou voucher) fica logo confirmado.
    if (rota === "/pagamento" && m === "POST") {
      const c = await corpo(req);
      if (c.codigo) await pausa(300);
      const p = await criar({ ...c, lingua: en ? "en" : "pt" });
      await confirmarHora(p, { terapeutaId: c.terapeutaId, qualquer: c.qualquer === true || c.qualquer === "true" });
      const r = await pagar(p, { metodo: c.metodo, telemovel: c.telemovel, base: url.origin });
      if (p.estado === "aguarda_pagamento") await guardarHora(p);
      return json({ ...publico(p), token: p.token, url: r.url || null });
    }

    // Estado do pedido (a página de pagamento pergunta até ficar pago).
    if (rota === "/pedido" && m === "GET") {
      const p = await obter(url.searchParams.get("n"));
      if (!p || p.token !== url.searchParams.get("t")) return json({ erro: erro("Pedido não encontrado.") }, 404);
      return json(publico(p));
    }

    // Notificação de pagamento da euPago (Webhook 1.0), configurada no canal da euPago.
    if (rota === "/eupago-notificacao" && (m === "GET" || m === "POST")) {
      const params = Object.fromEntries(url.searchParams);
      if (m === "POST") Object.assign(params, await corpo(req));
      const r = await notificacao(params);
      if (r.erro) { console.error("Notificação euPago recusada:", r.erro, params.identificador || ""); return json({ erro: r.erro }, r.status); }
      return json({ recebido: true });
    }

    return json({ erro: erro("Não encontrado.") }, 404);
  } catch (e) {
    if (e instanceof ErroCliente || e instanceof ErroAgenda) return json({ erro: erro(e.message) }, 400);
    console.error("API", rota, e);
    return json({ erro: en ? erroEN("") : e.message || "Ocorreu um erro. Tente de novo dentro de momentos." }, 502);
  }
};
