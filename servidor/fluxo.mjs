// Do pedido ao pagamento, e do pagamento à fatura e aos emails.
import * as E from "./eupago.mjs";
import { gravar, obter, ErroCliente, NUMERO } from "./pedidos.mjs";
import { gastarCodigo, criarVoucher } from "./codigos.mjs";
import { validadeVoucher } from "./datas.mjs";
import { emitirFatura } from "./moloni.mjs";
import * as M from "./email.mjs";

const METODOS = ["mb_way", "multibanco", "card"];

// Pagamento na euPago (ou nenhum, quando o código deixa o total a 0).
export async function pagar(p, { metodo, telemovel, base }) {
  if (p.total <= 0) {
    await concluir(p, "sem pagamento");
    return { estado: p.estado };
  }
  if (!METODOS.includes(metodo)) throw new ErroCliente("Escolha como quer pagar.");
  const tel = metodo === "mb_way" ? E.telemovelPT(telemovel || p.cliente.telefone) : "";
  if (metodo === "mb_way" && !tel) throw new ErroCliente("Indique um telemóvel português com 9 dígitos para o MB WAY.");
  const pagina = `${base}/pagamento/?n=${p.numero}&t=${p.token}`;
  p.pagamento = { metodo, id: p.numero, em: new Date().toISOString() };
  p.estado = "aguarda_pagamento";
  let url = null;
  if (metodo === "multibanco") {
    p.pagamento.multibanco = await E.criarMultibanco({ valor: p.total, id: p.numero });
  } else if (metodo === "mb_way") {
    const r = await E.criarMbway({ valor: p.total, id: p.numero, telemovel: tel, nome: p.cliente.nome, email: p.cliente.email });
    Object.assign(p.pagamento, { telemovel: tel, transacao: r.transacao, referencia: r.referencia });
  } else {
    const r = await E.criarCartao({ valor: p.total, id: p.numero, email: p.cliente.email, sucesso: pagina, falha: `${pagina}&falhou=1`, voltar: `${pagina}&falhou=1` });
    Object.assign(p.pagamento, { transacao: r.transacao, referencia: r.referencia });
    url = r.url;
  }
  await gravar(p);
  if (metodo === "multibanco") await registarEmail(p, "multibanco", () => M.emailMultibanco(p));
  return { estado: p.estado, url };
}

// Notificação da euPago (Webhook 1.0).
export async function notificacao(params) {
  if (!E.notificacaoValida(params)) return { status: 403, erro: "chave inválida" };
  const numero = String(params.identificador || "").toUpperCase().match(NUMERO)?.[0];
  const p = numero && (await obter(numero));
  if (!p) return { status: 404, erro: "pedido desconhecido" };
  const valor = Number(String(params.valor || "").replace(",", "."));
  const pago = { em: new Date().toISOString(), valor, transacao: String(params.transacao || ""), referencia: String(params.referencia || ""), mp: String(params.mp || "") };
  const nota = (texto) => { p.notas = [...(p.notas || []), { texto, em: pago.em }]; };
  if (p.pagamento?.pago) {
    if (p.pagamento.pago.transacao !== pago.transacao) { nota(`Segundo pagamento de ${valor.toFixed(2)} € (transação ${pago.transacao}). Reembolsar na euPago.`); await gravar(p); }
    return { pedido: p, mudou: false };
  }
  if (!(Math.abs(valor - Number(p.total)) <= 0.01)) {
    nota(`A euPago avisou ${valor.toFixed(2)} €, diferente do total ${Number(p.total).toFixed(2)} €. Confirmar na euPago.`);
    await gravar(p);
    await M.emailInterno(p, "Pagamento com valor diferente do pedido").catch(() => {});
    return { pedido: p, mudou: false };
  }
  p.pagamento = { ...(p.pagamento || {}), metodo: E.METODO_MP[pago.mp] || p.pagamento?.metodo || "", pago };
  await concluir(p, "euPago");
  return { pedido: p, mudou: true };
}

async function registarEmail(p, qual, fn) {
  const r = await fn().catch((e) => ({ enviado: false, erro: e.message }));
  p.emails = { ...(p.emails || {}), [qual]: r.enviado ? new Date().toISOString() : `falhou: ${r.erro || "email não configurado"}` };
  await gravar(p);
}

// Pedido pago (ou a 0 €): gasta o código, cria o voucher, emite a fatura e envia os emails.
export async function concluir(p, por) {
  if (["pago", "confirmado"].includes(p.estado)) return;
  p.estado = p.total > 0 ? "pago" : "confirmado";
  p.concluido = { em: new Date().toISOString(), por };
  if (p.codigo) await gastarCodigo(p.codigo.codigo, p.numero);
  if (p.tipo === "voucher" && !p.voucher.codigo) {
    p.voucher.validade = validadeVoucher();
    p.voucher.codigo = await criarVoucher({ tratamento: p.tratamento.id, nomeTratamento: p.tratamento.nome, validade: p.voucher.validade, pedido: p.numero, para: p.voucher.para, de: p.voucher.de });
  }
  await gravar(p);
  if (p.total > 0) await emitirFatura(p, { guardar: gravar });
  await registarEmail(p, "cliente", () => (p.tipo === "voucher" ? M.emailVoucher(p) : M.emailMarcacao(p)));
  await registarEmail(p, "interno", () => M.emailInterno(p));
}
