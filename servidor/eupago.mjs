// Pagamentos pela euPago (MB WAY, referência Multibanco e cartão), sem bibliotecas externas.
//
// Variáveis de ambiente no Netlify:
//   EUPAGO_API_KEY   chave da API do canal (backoffice euPago → Canais → Listagem de canais)
//   EUPAGO_MODO      "teste" (sandbox.eupago.pt) ou "real" (clientes.eupago.pt). Se faltar, as chaves
//                    de teste da euPago (começam por "demo-") usam o modo de teste e as outras o real.
//
// A confirmação do pagamento chega pela notificação da euPago (Webhook 1.0) em /api/eupago-notificacao,
// configurada no canal ("Receber notificação para um URL"). Traz a chave da API, que confirmamos.
import crypto from "node:crypto";

const KEY = () => String(process.env.EUPAGO_API_KEY || "").trim();
export const eupagoAtivo = () => Boolean(KEY());
export function modoTeste() {
  const m = String(process.env.EUPAGO_MODO || "").trim().toLowerCase();
  if (m) return m !== "real";
  return /^demo-/i.test(KEY());
}
const SERVIDORES = { teste: "https://sandbox.eupago.pt", real: "https://clientes.eupago.pt" };
const base = () => process.env.EUPAGO_API_BASE || (modoTeste() ? SERVIDORES.teste : SERVIDORES.real);
const chave = () => {
  const k = KEY();
  if (!k) throw new Error("Os pagamentos ainda não estão ligados (falta EUPAGO_API_KEY no Netlify).");
  return k;
};

// Prazo para pagar a referência Multibanco.
export const DIAS_MULTIBANCO = 3;
// Tempo que o cliente tem para aceitar na app MB WAY.
export const MINUTOS_MBWAY = 5;

async function pedido(path, body, { apiKey = false, servidor } = {}) {
  let r;
  try {
    r = await fetch((servidor || base()) + path, {
      method: "POST",
      signal: AbortSignal.timeout(20000),
      headers: { "Content-Type": "application/json", Accept: "application/json", ...(apiKey ? { Authorization: `ApiKey ${chave()}` } : {}) },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Não foi possível contactar o serviço de pagamentos. Tente de novo dentro de momentos.");
  }
  const texto = await r.text();
  let j;
  try { j = JSON.parse(texto); if (typeof j === "string") j = JSON.parse(j); } catch { j = {}; }
  return { status: r.status, j };
}

const MSG_CHAVE = () => `A euPago (${modoTeste() ? "área de testes" : "conta real"}) recusou a chave da API. Confirme no Netlify se a chave é de teste (sandbox) ou real e o valor de EUPAGO_MODO.`;
const v2 = (r, oQue) => {
  if (r.j.transactionStatus === "Success") return r.j;
  if (r.status === 401 || r.status === 403 || /APIKEY|AUTH/i.test(r.j.code || "")) throw new Error(`${MSG_CHAVE()}${r.j.text ? ` (${r.j.text})` : ""}`);
  throw new Error(`Não foi possível ${oQue}${r.j.text ? `: ${r.j.text}` : r.j.code ? ` (${r.j.code})` : ""}.`);
};

const dia = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const valor = (v) => Math.round(Number(v) * 100) / 100;

// Referência Multibanco para pagar uma só vez, com prazo.
export async function criarMultibanco({ valor: v, id }) {
  const hoje = new Date();
  const fim = new Date(hoje.getTime() + DIAS_MULTIBANCO * 86400000);
  const r = await pedido("/clientes/rest_api/multibanco/create", {
    chave: chave(), valor: valor(v), id, per_dup: 0, data_inicio: dia(hoje), data_fim: dia(fim),
  });
  if (!r.j.sucesso || r.j.entidade == null || r.j.referencia == null) {
    if (/chave/i.test(r.j.resposta || "")) throw new Error(MSG_CHAVE());
    throw new Error(`Não foi possível gerar a referência Multibanco${r.j.resposta ? `: ${r.j.resposta}` : ""}.`);
  }
  return { entidade: String(r.j.entidade), referencia: String(r.j.referencia), validade: `${r.j.data_fim && !/^2099/.test(r.j.data_fim) ? r.j.data_fim : dia(fim)}T23:59:00` };
}

// Pedido de pagamento na app MB WAY do cliente.
export async function criarMbway({ valor: v, id, telemovel, nome, email, lingua }) {
  const r = await pedido("/api/v1.02/mbway/create", {
    payment: { identifier: id, amount: { value: valor(v), currency: "EUR" }, customerPhone: telemovel, countryCode: "+351", lang: lingua === "en" ? "EN" : "PT" },
    customer: { notify: false, ...(nome ? { name: nome } : {}), ...(email ? { email } : {}) },
  }, { apiKey: true });
  const j = v2(r, "enviar o pedido MB WAY");
  return { transacao: String(j.transactionID || ""), referencia: String(j.reference || "") };
}

// Página de pagamento com cartão da euPago (o cliente é encaminhado para lá e volta ao site).
export async function criarCartao({ valor: v, id, email, lingua, sucesso, falha, voltar }) {
  const r = await pedido("/api/v1.02/creditcard/create", {
    payment: { identifier: id, amount: { value: valor(v), currency: "EUR" }, successUrl: sucesso, failUrl: falha, backUrl: voltar, lang: lingua === "en" ? "EN" : "PT", minutesFormUp: 60 },
    customer: { notify: false, email },
  }, { apiKey: true });
  const j = v2(r, "abrir o pagamento com cartão");
  if (!j.redirectUrl) throw new Error("A euPago não devolveu a página de pagamento com cartão.");
  return { url: j.redirectUrl, transacao: String(j.transactionID || ""), referencia: String(j.reference || "") };
}

// Telemóvel português de 9 dígitos começado por 9 (aceita +351, 00351, espaços).
export function telemovelPT(t) {
  const d = String(t || "").replace(/[\s().-]/g, "").replace(/^(\+|00)351/, "");
  return /^9\d{8}$/.test(d) ? d : "";
}

// Valida a notificação de pagamento da euPago (Webhook 1.0): a chave da API tem de ser a nossa.
export function notificacaoValida(params) {
  const k = KEY();
  const recebida = String(params.chave_api || "");
  return Boolean(k) && recebida.length === k.length && crypto.timingSafeEqual(Buffer.from(recebida), Buffer.from(k));
}

export const METODO_MP = { "PC:PT": "multibanco", "MW:PT": "mb_way", "CC:PT": "card", "GP:PT": "card", "PA:PT": "card" };
export const NOME_METODO = { multibanco: "Referência Multibanco", mb_way: "MB WAY", card: "Cartão" };

// Verificação da ligação (scripts/verificar.mjs): em que servidor (teste ou real) a chave é aceite. Só consulta uma
// referência inexistente, não cria nada.
export async function verificarEupago() {
  if (!eupagoAtivo()) return [{ texto: "Chave da API (EUPAGO_API_KEY)", ok: false, detalhe: "Não está definida no Netlify (ou falta publicar o site depois de a definir)." }];
  const k = KEY();
  const itens = [{ texto: "Chave da API (EUPAGO_API_KEY)", ok: true, detalhe: `${k.length} caracteres, começa por "${k.slice(0, 4)}…"${k !== String(process.env.EUPAGO_API_KEY) ? " (tinha espaços a mais, que o site ignora)" : ""}` }];
  const aceite = {};
  for (const [modo, url] of Object.entries(SERVIDORES)) {
    const r = await pedido("/clientes/rest_api/multibanco/info", { chave: k, referencia: "000000000" }, { servidor: process.env.EUPAGO_API_BASE || url }).catch((e) => ({ erro: e.message }));
    const resp = r.erro || r.j?.resposta || `resposta ${r.status}`;
    aceite[modo] = !r.erro && !/chave/i.test(resp) && r.status < 500;
    itens.push({ texto: `Chave aceite na ${modo === "teste" ? "área de testes (sandbox.eupago.pt)" : "conta real (clientes.eupago.pt)"}`, ok: aceite[modo], detalhe: resp });
  }
  const atual = modoTeste() ? "teste" : "real";
  const certo = aceite.teste && !aceite.real ? "teste" : aceite.real && !aceite.teste ? "real" : "";
  itens.push({ texto: `Modo configurado: ${atual}${process.env.EUPAGO_MODO ? "" : " (EUPAGO_MODO não definido)"}`, ok: aceite[atual], detalhe: aceite[atual] ? "certo" : certo ? `mude EUPAGO_MODO para ${certo} no Netlify e publique de novo` : "a chave não é aceite em nenhum dos dois: copie-a de novo da euPago (Canais → Listagem de canais)" });
  return itens;
}
