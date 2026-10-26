// API de pagamentos do site (/api/*): preço com código, pagamento na euPago, estado do pedido
// e a notificação de pagamento da euPago. A fatura (Moloni ON) e os emails seguem do servidor.
import { calcular, criar, obter, publico, ErroCliente } from "../../servidor/pedidos.mjs";
import { pagar, notificacao } from "../../servidor/fluxo.mjs";
import { pedirCodigo, confirmarCodigo, ErroVerificacao } from "../../servidor/verificacao.mjs";

export const config = { path: "/api/*" };

const json = (dados, status = 200) => new Response(JSON.stringify(dados), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
const pausa = (ms) => new Promise((r) => setTimeout(r, ms)); // trava tentativas de códigos em série

async function corpo(req) {
  const tipo = req.headers.get("content-type") || "";
  if (tipo.includes("json")) return req.json().catch(() => ({}));
  return Object.fromEntries(new URLSearchParams(await req.text()));
}

export default async (req) => {
  const url = new URL(req.url);
  const rota = url.pathname.replace(/^\/api/, "").replace(/\/$/, "");
  const m = req.method;
  try {
    // Valor a pagar com um código (VIP, newsletter ou voucher), para a página de confirmação.
    if (rota === "/preco" && m === "POST") {
      const c = await corpo(req);
      if (c.codigo) await pausa(300);
      const r = await calcular({ tipo: c.tipo, tratamento: c.tratamento, codigo: c.codigo, campanha: c.campanha });
      return json({ precoBase: r.precoBase, desconto: r.desconto, total: r.total, codigo: r.codigo && { tipo: r.codigo.tipo, texto: r.codigo.texto } });
    }

    // Verificação do email antes da marcação: envia o código e, depois, confirma-o.
    if (rota === "/verificacao" && m === "POST") {
      const c = await corpo(req);
      return json(await pedirCodigo(c.email));
    }
    if (rota === "/verificacao/confirmar" && m === "POST") {
      const c = await corpo(req);
      await pausa(300);
      return json(await confirmarCodigo(c.email, c.codigo));
    }

    // Cria o pedido e o pagamento. Com total 0 (VIP ou voucher) fica logo confirmado.
    if (rota === "/pagamento" && m === "POST") {
      const c = await corpo(req);
      if (c.codigo) await pausa(300);
      const p = await criar(c);
      const r = await pagar(p, { metodo: c.metodo, telemovel: c.telemovel, base: url.origin });
      return json({ ...publico(p), token: p.token, url: r.url || null });
    }

    // Estado do pedido (a página de pagamento pergunta até ficar pago).
    if (rota === "/pedido" && m === "GET") {
      const p = await obter(url.searchParams.get("n"));
      if (!p || p.token !== url.searchParams.get("t")) return json({ erro: "Pedido não encontrado." }, 404);
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

    return json({ erro: "Não encontrado." }, 404);
  } catch (e) {
    if (e instanceof ErroCliente || e instanceof ErroVerificacao) return json({ erro: e.message }, 400);
    console.error("API", rota, e);
    return json({ erro: e.message || "Ocorreu um erro. Tente de novo dentro de momentos." }, 502);
  }
};
