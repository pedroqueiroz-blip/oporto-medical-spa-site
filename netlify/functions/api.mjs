// API de pagamentos do site (/api/*): preço com código, pagamento na euPago, estado do pedido
// e a notificação de pagamento da euPago. A fatura (Moloni ON) e os emails seguem do servidor.
import { calcular, criar, obter, publico, ErroCliente } from "../../servidor/pedidos.mjs";
import { pagar, notificacao } from "../../servidor/fluxo.mjs";
import { disponibilidade, confirmarHora, guardarHora, ultimasMarcacoes, repetirNoCRM, diaAgenda, ErroAgenda } from "../../servidor/agenda.mjs";
import { lingua, erroEN, codigoEN } from "../../servidor/ingles.mjs";
import { zohoConfigurado, estadoLigacao, urlAutorizacao, concluirLigacao, verificarCRM, procurarTurnos } from "../../servidor/zoho.mjs";
import { estados, simbolo, ultimosPedidos } from "../../servidor/estado.mjs";
import { dataPT, hojeISO } from "../../servidor/datas.mjs";
import catalogo from "../../servidor/gerado/catalogo.json" with { type: "json" };
import { createHash, timingSafeEqual } from "node:crypto";

export const config = { path: "/api/*" };

const json = (dados, status = 200) => new Response(JSON.stringify(dados), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
const pausa = (ms) => new Promise((r) => setTimeout(r, ms)); // trava tentativas de códigos em série

// Página simples (Zoho CRM, reservas), nas cores da marca.
const pagina = (html, status = 200, { titulo = "Ligar ao Zoho CRM", largura = 380 } = {}) => new Response(`<!doctype html><html lang="pt"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${titulo}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0D0A08;color:#E8DCC8;font:15px/1.6 Manrope,system-ui,sans-serif}main{width:min(${largura}px,calc(100vw - 32px));padding:24px 0;text-align:center}h1{font:400 26px "EB Garamond",Georgia,serif}input{box-sizing:border-box;width:100%;padding:12px 14px;border:1px solid rgba(232,220,200,.3);border-radius:4px;background:transparent;color:inherit;font:inherit}button{margin-top:14px;width:100%;padding:12px;border:0;border-radius:999px;background:#E8DCC8;color:#0D0A08;font:600 12px Manrope,system-ui,sans-serif;letter-spacing:.14em;text-transform:uppercase;cursor:pointer}.nota{font-size:13px;opacity:.8}.erro{color:#E0A58C}</style></head><body><main>${html}</main></body></html>`,
  { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Frame-Options": "DENY", "Referrer-Policy": "no-referrer" } });
const resumo = (t) => createHash("sha256").update(String(t)).digest();
// Palavra-passe do backoffice, ou a chave da sessão já aberta no /admin (botões «Reservas» e «Verificar ligações»).
const igual = (dada, guardada) => Boolean(guardada && dada) && timingSafeEqual(resumo(dada), resumo(guardada));
const senhaCerta = (dada) => Boolean(process.env.BACKOFFICE_PASSWORD) && (igual(dada, process.env.BACKOFFICE_PASSWORD) || igual(dada, process.env.BACKOFFICE_GITHUB_TOKEN));

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
      const form = m === "POST" ? new URLSearchParams(await req.text()) : new URLSearchParams();
      const senha = form.get("senha") || "";
      if (!senhaCerta(senha)) {
        if (m === "POST") await pausa(1500);
        return pagina(`<h1>Verificar o Zoho CRM</h1><p class="nota">Confere módulos, campo do NIF, agenda e equipa no CRM, e as últimas marcações do site.</p><form method="post"><input type="password" name="senha" placeholder="Palavra-passe do backoffice" required>${m === "POST" ? `<p class="erro">Palavra-passe errada.</p>` : ""}<button type="submit">Verificar</button></form>`, m === "POST" ? 401 : 200);
      }
      const e = (x) => String(x ?? "").replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
      const estado = await estadoLigacao();
      // «Pôr na agenda»: repete a marcação no CRM de um pedido pago (ou a 0 €) que não lá ficou.
      let aviso = "";
      if (form.get("repetir")) {
        try { aviso = `✓ ${e(form.get("repetir"))}: ${e(await repetirNoCRM(form.get("repetir")))}`; }
        catch (err) { aviso = `✗ ${e(form.get("repetir"))}: ${e(err.message)}`; }
      }
      const linhas = estado.ligado ? await verificarCRM(catalogo.equipa || [], catalogo.tratamentos || []) : [{ ok: false, titulo: "Ligação ao Zoho CRM", detalhe: estado.configurado ? "Por ligar neste site: abra /api/zoho/ligar." : "Faltam ZOHO_CLIENT_ID e ZOHO_CLIENT_SECRET neste site (Netlify, contexto de produção)." }];
      const marc = await ultimasMarcacoes(10);
      // Um dia da agenda como o site o vê (para conferir com o Zoho): o que leu e as horas livres de cada pessoa.
      const dia = /^\d{4}-\d{2}-\d{2}$/.test(form.get("dia") || "") ? form.get("dia") : hojeISO(new Date(Date.now() + 864e5));
      let blocoDia = "";
      if (estado.ligado) {
        const hm = (t) => (t ? new Date(t).toLocaleTimeString("pt-PT", { timeZone: "Europe/Lisbon", hour: "2-digit", minute: "2-digit" }) : "?");
        try {
          const d = await diaAgenda(dia);
          blocoDia = `<p class="nota"><b>Lido do Zoho para ${e(dataPT(dia, { semana: true }))}</b> (${d.lidos.length}):</p>${d.lidos.map((x) => `<p class="nota" style="margin:2px 0">${x.diaInteiro ? "dia inteiro" : `${hm(x.inicio)}–${hm(x.fim)}`} · ${e(x.origem || "hora guardada no site (pagamento)")} · ${e(x.nome || "")}${x.titulo ? ` · ${e(x.titulo)}` : ""}</p>`).join("") || `<p class="nota">Nada neste dia.</p>`}
<p class="nota" style="margin-top:14px"><b>Horas livres no site</b> (tratamento de 60 min):</p>${d.pessoas.map((p) => `<p class="nota" style="margin:2px 0"><b>${e(p.nome)}</b>: ${!p.agenda ? "sem agenda online (não está nas listas de profissionais ou está inativa)" : `${p.livres.join(", ") || "nenhuma"} · ${p.ocupada} ocupações lidas · ${p.turno === undefined ? (p.horario ? "com horário do Prestadores" : "sem horário do Prestadores") : p.turno === null ? "sem registo nos Horários de Colaborador (não está disponível)" : `turnos: ${p.turno}`}${p.dono ? " · utilizadora do CRM" : " · não é utilizadora do CRM (as Reuniões não contam para ela)"}`}</p>`).join("")}`;
        } catch (err) { blocoDia = `<p class="erro">Não consegui ler a agenda deste dia: ${e(err.message)}</p>`; }
        try {
          const t = await procurarTurnos(dia);
          blocoDia += `<p class="nota" style="margin-top:14px"><b>Turnos: módulos que podem ter o horário de cada dia</b></p>${t.map((l) => `<p class="nota" style="margin:4px 0"><b>${l.ok ? "✓" : "✗"} ${e(l.titulo)}</b><br>${e(l.detalhe)}</p>`).join("")}`;
        } catch (err) { blocoDia += `<p class="erro">Turnos: ${e(err.message)}</p>`; }
      }
      const formDia = `<form method="post" style="display:flex;gap:8px;align-items:center;margin:8px 0 14px"><input type="hidden" name="senha" value="${e(senha)}"><input type="date" name="dia" value="${e(dia)}" style="width:auto"><button type="submit" style="margin:0;width:auto;padding:10px 18px">Ver dia</button></form>`;
      const ESTADOS = { novo: "por pagar", aguarda_pagamento: "à espera do pagamento", pago: "pago", confirmado: "confirmado (0 €)" };
      const linhaMarc = (x) => {
        const zoho = x.zoho?.evento ? "✓ na agenda do Zoho" : x.zoho?.erro ? `✗ ${x.zoho.erro}` : ["pago", "confirmado"].includes(x.estado) ? "✗ não foi enviada ao Zoho" : "— só vai para o Zoho depois de pago";
        const botao = ["pago", "confirmado"].includes(x.estado) && !x.zoho?.evento && estado.ligado
          ? `<form method="post" style="margin:6px 0 0"><input type="hidden" name="senha" value="${e(senha)}"><input type="hidden" name="repetir" value="${e(x.numero)}"><button type="submit" style="margin:0;width:auto;padding:8px 16px">Pôr na agenda</button></form>` : "";
        return `<p><b>${e(x.numero)}</b> · ${e(x.data)} ${e(x.hora)} · ${e(x.tratamento)} · ${e(x.terapeuta || "")}<br><span class="nota">${e(x.cliente)} · ${e(ESTADOS[x.estado] || x.estado)}${x.metodo ? ` (${e(x.metodo)})` : ""} · ${e(zoho)}</span>${botao}</p>`;
      };
      return pagina(`<h1>Verificação do Zoho CRM</h1>${aviso ? `<p class="${aviso.startsWith("✓") ? "nota" : "erro"}">${aviso}</p>` : ""}<div style="text-align:left">${linhas.map((l) => `<p><b>${l.ok ? "✓" : "✗"} ${e(l.titulo)}</b><br><span class="nota">${e(l.detalhe)}</span></p>`).join("")}
<h2 style="font:400 20px 'EB Garamond',Georgia,serif;margin-top:28px">Agenda de um dia</h2>${formDia}${blocoDia}
<h2 style="font:400 20px 'EB Garamond',Georgia,serif;margin-top:28px">Últimas marcações do site</h2>${marc.length ? marc.map(linhaMarc).join("") : `<p class="nota">Ainda não há marcações.</p>`}</div>`);
    }

    // Reservas (backoffice): últimas marcações e vouchers com cliente, contactos, valor e o estado de cada passo,
    // erros incluídos (Pedro, 28/10/2026). Protegida pela palavra-passe do backoffice.
    if (rota === "/reservas") {
      const form = m === "POST" ? new URLSearchParams(await req.text()) : new URLSearchParams();
      const opc = { titulo: "Reservas · Oporto Medical Spa" };
      if (!process.env.BACKOFFICE_PASSWORD) return pagina(`<h1>Reservas</h1><p>Falta a palavra-passe do backoffice (BACKOFFICE_PASSWORD) no Netlify, que protege esta página.</p>`, 200, opc);
      if (!senhaCerta(form.get("senha") || "")) {
        if (m === "POST") await pausa(1500);
        return pagina(`<h1>Reservas</h1><p class="nota">Últimas marcações e vouchers do site, com o pagamento, a fatura e a agenda.</p><form method="post"><input type="password" name="senha" placeholder="Palavra-passe do backoffice" autocomplete="current-password" required>${m === "POST" ? `<p class="erro">Palavra-passe errada.</p>` : ""}<button type="submit">Entrar</button></form>`, m === "POST" ? 401 : 200, opc);
      }
      const e = (x) => String(x ?? "").replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
      const lista = await ultimosPedidos(50);
      const cor = (ok) => (ok === false ? "#E0A58C" : ok ? "#A8C99A" : "rgba(232,220,200,.6)");
      const cartao = (p) => {
        const st = estados(p), erro = st.some((x) => x.ok === false);
        const quando = p.marcacao ? `${dataPT(p.marcacao.data, { semana: true })}, ${p.marcacao.hora}` : `Voucher${p.voucher?.para ? ` para ${p.voucher.para}` : ""}`;
        return `<div style="text-align:left;border:1px solid ${erro ? "#E0A58C" : "rgba(232,220,200,.2)"};border-radius:6px;padding:14px 16px;margin:12px 0">
<p style="margin:0"><b>${e(quando)}</b> · ${e(p.tratamento?.nome)}${p.marcacao?.terapeuta ? ` · ${e(p.marcacao.terapeuta)}` : ""}</p>
<p class="nota" style="margin:2px 0 8px">${e(p.numero)} · pedido a ${e(String(p.criado || "").slice(0, 16).replace("T", " "))} · ${p.total > 0 ? `${e(Number(p.total).toFixed(2))} €` : "0 €"}${p.codigo ? ` (${e(p.codigo.texto)})` : ""}</p>
<p style="margin:0 0 8px">${e(p.cliente?.nome)} · <a href="mailto:${e(p.cliente?.email)}" style="color:inherit">${e(p.cliente?.email)}</a> · <a href="tel:${e(String(p.cliente?.telefone || "").replace(/\s/g, ""))}" style="color:inherit">${e(p.cliente?.telefone)}</a>${p.cliente?.nif ? ` · NIF ${e(p.cliente.nif)}` : ""}</p>
${st.map((x) => `<div style="font-size:13px;color:${cor(x.ok)}">${simbolo(x.ok)} ${e(x.texto)}</div>`).join("")}</div>`;
      };
      const comErro = lista.filter((p) => estados(p).some((x) => x.ok === false)).length;
      return pagina(`<h1>Reservas</h1><p class="nota">${lista.length} pedidos mais recentes${comErro ? ` · <span class="erro">${comErro} com erro (a vermelho)</span>` : " · sem erros"}. ✓ feito · ✗ erro a resolver · … a aguardar.</p>
${lista.length ? lista.map(cartao).join("") : `<p class="nota">Ainda não há pedidos.</p>`}`, 200, { ...opc, largura: 720 });
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
