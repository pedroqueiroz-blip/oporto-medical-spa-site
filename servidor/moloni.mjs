// Faturação no Moloni ON (API GraphQL). Quando um pedido fica pago na euPago, cria a fatura-recibo na
// série "SPA", fecha-a (fica numerada e comunicada à AT) e envia-a ao cliente por email.
//
// Artigos (pedido do Pedro, 22/10/2026), ambos isentos de IVA:
//   TPREV  Terapêuticas de Prevenção   tratamentos da área Relaxar
//   TREAB  Terapêuticas de Reabilitação todos os outros
// O valor da linha é o valor final do site, já com o desconto (campanha ou código de 10%).
// O motivo de isenção vem do próprio artigo no Moloni ON (ou de MOLONI_ISENCAO, por exemplo "M07").
//
// Variáveis de ambiente no Netlify:
//   MOLONI_API_KEY   chave da API (Moloni ON → Conta → API → API Keys)
//   MOLONI_FECHAR    "sim" para fechar e enviar a fatura. Sem isto, fica só um rascunho no Moloni ON
//                    (útil para testar: os rascunhos não têm valor fiscal e podem ser apagados).
//   MOLONI_EMPRESA   opcional: id da empresa, se a conta tiver mais do que uma
//   MOLONI_SERIE     opcional: outra série que não "SPA"
//   MOLONI_ISENCAO   opcional: código do motivo de isenção, se o artigo não o tiver no Moloni ON
import { modoTeste } from "./eupago.mjs";
import { TEXTO_TERAPEUTICA, spa } from "./catalogo.mjs";
import { dataPT } from "./datas.mjs";

const API = process.env.MOLONI_API_BASE || "https://api.molonion.pt/v1"; // substituível em testes
export const ARTIGOS = ["TREAB", "TPREV"];

export const moloniAtivo = () => Boolean(process.env.MOLONI_API_KEY);
// Com a euPago em modo de teste, nunca se fecham faturas (ficam só rascunhos).
const fecharAtivo = () => /^(sim|true|1)$/i.test(process.env.MOLONI_FECHAR || "") && !modoTeste();

async function gql(query, variables, op) {
  const r = await fetch(API, {
    signal: AbortSignal.timeout(15000),
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.MOLONI_API_KEY}` },
    body: JSON.stringify({ query, variables }),
  }).catch(() => { throw new Error("Não foi possível contactar o Moloni ON. Tente de novo daqui a pouco."); });
  if (r.status === 401) throw new Error("O Moloni ON recusou a chave da API (MOLONI_API_KEY). Confirme a chave no Netlify.");
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.errors?.length) throw new Error(`Moloni ON (${op}): ${j.errors?.map((e) => e.message).join("; ") || `erro ${r.status}`}`);
  const res = j.data?.[op];
  if (res?.errors?.length) throw new Error(`Moloni ON (${op}): ${res.errors.map((e) => (e.field && e.field !== "*" ? `${e.field}: ` : "") + e.msg).join("; ")}`);
  return res?.data ?? res;
}

const filtro = (field, value) => ({ filter: [{ field, comparison: "eq", value: String(value) }] });

async function empresa() {
  if (process.env.MOLONI_EMPRESA) return Number(process.env.MOLONI_EMPRESA);
  const me = await gql("query{ me{ errors{field msg} data{ userCompanies{ companyId } } } }", {}, "me");
  const lista = me?.userCompanies || [];
  if (!lista.length) throw new Error("A chave do Moloni ON não tem nenhuma empresa associada.");
  if (lista.length > 1) throw new Error(`A conta Moloni ON tem várias empresas (ids: ${lista.map((e) => e.companyId).join(", ")}). Indique a certa em MOLONI_EMPRESA.`);
  return lista[0].companyId;
}

const SERIE_SITE = "SPA";
async function serie(companyId) {
  const sets = await gql("query($companyId:Int!){ documentSets(companyId:$companyId){ errors{field msg} data{ documentSetId name isDefault } } }", { companyId }, "documentSets");
  // Série das faturas do site: "SPA" (pedido do Pedro, 22/10/2026), ou a indicada em MOLONI_SERIE.
  const nome = (process.env.MOLONI_SERIE || SERIE_SITE).trim().toLowerCase();
  const s = sets.find((x) => x.name.trim().toLowerCase() === nome);
  if (!s) throw new Error(`Não existe a série "${process.env.MOLONI_SERIE || SERIE_SITE}" no Moloni ON.`);
  return s.documentSetId;
}

async function meioPagamento(companyId, metodo) {
  const meios = await gql("query($companyId:Int!){ paymentMethods(companyId:$companyId){ errors{field msg} data{ paymentMethodId name isDefault } } }", { companyId }, "paymentMethods");
  const procura = { card: /cart[aã]o|card/i, mb_way: /mb ?way/i, multibanco: /multibanco/i }[metodo] || /cart[aã]o/i;
  const m = meios.find((x) => procura.test(x.name)) || meios.find((x) => x.isDefault) || meios[0];
  if (!m) throw new Error("Não há meios de pagamento no Moloni ON.");
  return m.paymentMethodId;
}

// Número para um cliente novo: o que o Moloni ON sugere ou, se não conseguir ("Failed to generate next customer
// number"), o seguinte ao do último cliente criado (ex.: 1234 → 1235, C0099 → C0100). Erros de ligação ou
// de chave param aqui; outros erros passam ao passo seguinte.
const naoFatal = (e) => { if (/contactar|recusou a chave/i.test(e.message)) throw e; return null; };
export function numeroSeguinte(numeros) {
  const partes = numeros.map((n) => String(n || "").trim().match(/^(.*?)(\d+)$/)).filter(Boolean);
  if (!partes.length) return "";
  const prefixo = partes[0][1];
  const max = partes.filter((p) => p[1] === prefixo).reduce((a, p) => (BigInt(p[2]) > BigInt(a) ? p[2] : a), "0");
  const seguinte = String(BigInt(max) + 1n);
  return prefixo + seguinte.padStart(max.length, "0");
}
async function proximoNumeroCliente(companyId) {
  const q = "query($companyId:Int!,$options:GetNextCustomerNumberOptions){ customerNextNumber(companyId:$companyId,options:$options){ errors{field msg} data } }";
  const sugerido = await gql(q, { companyId }, "customerNextNumber").catch(naoFatal);
  if (sugerido) return String(sugerido);
  const ultimos = await gql("query($companyId:Int!,$options:CustomerOptions){ customers(companyId:$companyId,options:$options){ errors{field msg} data{ customerId number } } }",
    { companyId, options: { order: { field: "customerId", sort: "DESC" }, pagination: { page: 1, qty: 50 } } }, "customers").catch(naoFatal);
  let n = numeroSeguinte((ultimos || []).filter((c) => c.number).sort((x, y) => y.customerId - x.customerId).map((c) => c.number));
  for (let i = 0; n && i < 20; i++) {
    const existe = await gql("query($companyId:Int!,$options:CustomerOptions){ customers(companyId:$companyId,options:$options){ errors{field msg} data{ customerId } } }",
      { companyId, options: filtro("number", n) }, "customers").catch(naoFatal);
    if (existe && !existe.length) return n;
    if (!existe) break;
    n = numeroSeguinte([n]);
  }
  return "";
}

const CAMPOS_CLIENTE = "customerId name vat email country{countryId} language{languageId}";
async function cliente(companyId, p) {
  const c = p.cliente || {};
  const procurar = (opts) => gql(`query($companyId:Int!,$options:CustomerOptions){ customers(companyId:$companyId,options:$options){ errors{field msg} data{ ${CAMPOS_CLIENTE} } } }`, { companyId, options: opts }, "customers");
  if (!c.nif) {
    // Sem NIF: fatura ao Consumidor final (cliente n.º 1 no Moloni ON), como no aquadrena.com.
    for (const f of [filtro("number", "1"), filtro("vat", "999999990")]) {
      const r = (await procurar(f)).filter((x) => !x.vat || x.vat === "999999990");
      if (r[0]) return r[0].customerId;
    }
    throw new Error("Não encontrei no Moloni ON o cliente Consumidor final (n.º 1, contribuinte 999999990).");
  }
  const r = await procurar(filtro("vat", c.nif));
  if (r[0]) return r[0].customerId;
  // País e língua: os do cliente predefinido da empresa (Portugal / Português).
  const pred = (await procurar(filtro("isDefault", "true")))[0];
  const countryId = pred?.country?.countryId, languageId = pred?.language?.languageId;
  if (!countryId || !languageId) throw new Error("Não consegui ler o país e a língua do cliente predefinido no Moloni ON.");
  const number = await proximoNumeroCliente(companyId);
  const novo = await gql("mutation($companyId:Int!,$data:CustomerInsert!){ customerCreate(companyId:$companyId,data:$data){ errors{field msg} data{ customerId } } }", {
    companyId,
    data: {
      number: String(number || p.numero), name: c.nome || c.email || "Cliente", email: c.email || undefined, vat: c.nif,
      phone: c.telefone || undefined, countryId, languageId,
    },
  }, "customerCreate");
  return novo.customerId;
}

async function artigo(companyId, referencia) {
  const r = await gql("query($companyId:Int!,$options:ProductOptions){ products(companyId:$companyId,options:$options){ errors{field msg} data{ productId name reference exemptionReason } } }",
    { companyId, options: filtro("reference", referencia) }, "products");
  const p = r.find((x) => x.reference === referencia);
  if (!p) throw new Error(`Falta criar no Moloni ON o artigo com a referência "${referencia}".`);
  const isencao = p.exemptionReason || process.env.MOLONI_ISENCAO || "";
  if (!isencao) throw new Error(`O artigo ${referencia} no Moloni ON não tem motivo de isenção de IVA. Indique-o no artigo (ou em MOLONI_ISENCAO no Netlify).`);
  return { productId: p.productId, isencao };
}

// Linha da fatura: TPREV ou TREAB, com o nome do tratamento.
const nomeLinha = (p) => p.tipo === "voucher"
  ? `Voucher oferta · ${p.tratamento.nome}`
  : `${p.tratamento.nome} · ${dataPT(p.marcacao.data, { ano: false })}, ${p.marcacao.hora}`;

// Mensagem do email da fatura: o texto do Pedro para marcações, uma nota simples para vouchers.
export const mensagemFatura = (p) => p.tipo === "voucher"
  ? `Obrigado por oferecer ${p.tratamento.nome}. O código do voucher segue noutro email.`
  : TEXTO_TERAPEUTICA[p.tratamento.artigo](p.tratamento.nome);

export async function emitirFatura(p, { autor = "Moloni ON (automático)", guardar, soRascunho = false } = {}) {
  if (!moloniAtivo() || !p || p.fatura?.numero) return { feito: false };
  if (p.estado !== "pago" || !(Number(p.total) > 0)) return { feito: false };
  if (p.moloni?.aEmitir && Date.now() - Date.parse(p.moloni.aEmitir) < 120000) return { feito: false }; // outro pedido está a tratar deste
  p.moloni = { ...(p.moloni || {}), aEmitir: new Date().toISOString(), erro: "" };
  await guardar(p);
  try {
    const companyId = await empresa();
    const [documentSetId, paymentMethodId, customerId, art] = await Promise.all([
      serie(companyId), meioPagamento(companyId, p.pagamento?.metodo), cliente(companyId, p), artigo(companyId, p.tratamento.artigo),
    ]);
    const linhas = [{ productId: art.productId, ordering: 1, qty: 1, name: nomeLinha(p), price: Number(p.total), discount: 0, taxes: [], exemptionReason: art.isencao }];

    let documentId = p.moloni?.rascunho;
    let doc;
    const CAMPOS_DOC = "documentId number status totalValue documentSetName";
    if (!documentId) {
      const hoje = new Date();
      doc = await gql(`mutation($companyId:Int!,$data:InvoiceReceiptInsert!){ invoiceReceiptCreate(companyId:$companyId,data:$data){ errors{field msg} data{ ${CAMPOS_DOC} } } }`, {
        companyId,
        data: {
          fiscalZone: "PT", documentSetId, customerId, date: hoje.toISOString(), expirationDate: hoje.toISOString().slice(0, 10), status: 0,
          ourReference: p.numero, yourReference: p.pagamento?.pago?.transacao || p.pagamento?.transacao || undefined,
          notes: `${p.tipo === "voucher" ? "Voucher" : "Marcação"} ${p.numero} em ${String(spa.url || "").replace(/^https?:\/\//, "")}`,
          products: linhas, payments: [{ paymentMethodId, value: Number(p.total), date: hoje.toISOString() }],
        },
      }, "invoiceReceiptCreate");
      documentId = doc.documentId;
      p.moloni.rascunho = documentId;
      await guardar(p);
    }
    const totalMoloni = Number(doc?.totalValue ?? p.moloni.totalMoloni);
    p.moloni.totalMoloni = totalMoloni;
    if (Number.isFinite(totalMoloni) && Math.abs(totalMoloni - Number(p.total)) > 0.01) {
      throw new Error(`O total do rascunho no Moloni ON (${totalMoloni.toFixed(2)} €) não bate com o pago (${Number(p.total).toFixed(2)} €). Confirme que o artigo ${p.tratamento.artigo} está isento de IVA, corrija o rascunho e feche-o lá.`);
    }
    if (soRascunho || !fecharAtivo()) {
      p.moloni = { ...p.moloni, aEmitir: "", estado: "rascunho", em: new Date().toISOString() };
      await guardar(p);
      return { feito: true, rascunho: true };
    }
    const fechado = await gql(`mutation($companyId:Int!,$data:InvoiceReceiptUpdate!){ invoiceReceiptUpdate(companyId:$companyId,data:$data){ errors{field msg} data{ ${CAMPOS_DOC} } } }`,
      { companyId, data: { documentId, status: 1 } }, "invoiceReceiptUpdate");
    const numero = `FR ${fechado.documentSetName || ""}/${fechado.number}`.replace(" /", " ");
    p.fatura = { numero, em: new Date().toISOString(), por: autor, moloniId: documentId };
    p.moloni = { ...p.moloni, aEmitir: "", estado: "fechada", rascunho: undefined };
    await guardar(p);
    // Envio por email (a fatura já está emitida; uma falha aqui não a anula).
    try {
      await gql("mutation($companyId:Int!,$documentId:Int!){ invoiceReceiptGetPDF(companyId:$companyId,documentId:$documentId) }", { companyId, documentId }, "invoiceReceiptGetPDF");
      await gql("mutation($companyId:Int!,$documents:[Int]!,$mailData:MailData){ invoiceReceiptSendMail(companyId:$companyId,documents:$documents,mailData:$mailData) }", {
        companyId, documents: [documentId],
        mailData: { to: { name: p.cliente.nome || "", email: p.cliente.email }, attachment: true, message: mensagemFatura(p) },
      }, "invoiceReceiptSendMail");
      p.moloni.emailEnviado = new Date().toISOString();
    } catch (e) {
      p.moloni.erro = `Fatura emitida, mas o email não seguiu: ${e.message}`;
    }
    await guardar(p);
    return { feito: true, numero };
  } catch (e) {
    p.moloni = { ...(p.moloni || {}), aEmitir: "", erro: e.message };
    await guardar(p);
    console.error("Moloni ON", p.numero, e.message);
    return { feito: false, erro: e.message };
  }
}

// Verificação da ligação (só leituras, não cria nada no Moloni ON): node scripts/verificar.mjs
export async function verificarMoloni() {
  const res = [];
  const passo = async (texto, fn) => {
    try { res.push({ texto, ok: true, detalhe: (await fn()) || "" }); return true; } catch (e) { res.push({ texto, ok: false, detalhe: e.message }); return false; }
  };
  if (!moloniAtivo()) return [{ texto: "Chave da API (MOLONI_API_KEY)", ok: false, detalhe: "Não está definida." }];
  let companyId;
  if (!(await passo("Chave da API e empresa", async () => { companyId = await empresa(); return `empresa n.º ${companyId}`; }))) return res;
  await passo(`Série de documentos "${process.env.MOLONI_SERIE || SERIE_SITE}"`, async () => `série n.º ${await serie(companyId)}`);
  for (const [metodo, nome] of [["card", "Cartão"], ["mb_way", "MB WAY"], ["multibanco", "Multibanco"]]) {
    await passo(`Meio de pagamento ${nome}`, async () => `n.º ${await meioPagamento(companyId, metodo)}`);
  }
  await passo("Cliente Consumidor final (n.º 1), para quem não indica NIF", async () => `n.º ${await cliente(companyId, { cliente: {} })}`);
  for (const ref of ARTIGOS) await passo(`Artigo ${ref} (isento de IVA)`, async () => { const a = await artigo(companyId, ref); return `artigo n.º ${a.productId}, isenção ${a.isencao}`; });
  return res;
}
