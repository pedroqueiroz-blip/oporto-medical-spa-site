// Pedidos do site: marcações e vouchers. Cada um fica guardado no Netlify Blobs com o seu número
// (OMS-AAMMDD-XXXX), que é também o identificador do pagamento na euPago.
import crypto from "node:crypto";
import { store, STORES } from "./store.mjs";
import { tratamento as lerTratamento, campanha as lerCampanha } from "./catalogo.mjs";
import { lerCodigo } from "./codigos.mjs";
import { hojeISO } from "./datas.mjs";

export class ErroCliente extends Error {}

const r2 = (v) => Math.round(Number(v) * 100) / 100;
export const NUMERO = /^OMS-\d{6}-[A-Z0-9]{4}/;

export async function obter(numero) {
  const n = String(numero || "").toUpperCase().match(NUMERO)?.[0];
  return n ? (await store(STORES.pedidos)).get(n, { type: "json" }) : null;
}
export async function gravar(p) {
  p.atualizado = new Date().toISOString();
  await (await store(STORES.pedidos)).setJSON(p.numero, p);
}

// Vouchers de campanha vendidos (para o limite, ex.: 25 na Black Week)
const chaveVendidos = (id) => `campanha-${id}`;
export async function vendidos(id) {
  return Number((await (await store(STORES.pedidos)).get(chaveVendidos(id), { type: "json" }))?.vendidos || 0);
}
export async function contarVenda(id) {
  const s = await store(STORES.pedidos);
  await s.setJSON(chaveVendidos(id), { vendidos: (await vendidos(id)) + 1, atualizado: new Date().toISOString() });
}

// Campanha de vouchers em vigor hoje e com vouchers disponíveis
async function campanhaValida(id, tipo, tratamentoId) {
  const c = lerCampanha(id);
  const hoje = hojeISO();
  if (!c || (c.inicio && hoje < c.inicio) || (c.fim && hoje > c.fim)) throw new ErroCliente("Esta campanha já não está em vigor.");
  if (tipo !== "voucher") throw new ErroCliente("O preço desta campanha é só para vouchers.");
  if (c.tratamento !== tratamentoId) throw new ErroCliente("Pedido inválido.");
  if (c.limite && (await vendidos(c.id)) >= c.limite) throw new ErroCliente("Os vouchers desta campanha esgotaram.");
  return c;
}

// Valor a pagar, calculado no servidor: preço do site (ou da campanha), menos o código (VIP, newsletter ou voucher).
export async function calcular({ tipo, tratamento: id, codigo, campanha: campanhaId }) {
  if (!["marcacao", "voucher"].includes(tipo)) throw new ErroCliente("Pedido inválido.");
  const t = lerTratamento(id);
  if (!t) throw new ErroCliente("Escolha um tratamento.");
  const camp = campanhaId ? await campanhaValida(campanhaId, tipo, t.id) : null;
  const base = r2(camp ? camp.preco : t.preco);
  const out = { tratamento: t, campanha: camp, precoBase: base, desconto: 0, total: base, codigo: null };
  if (!String(codigo || "").trim()) return out;
  if (camp) throw new ErroCliente("Os vouchers de campanha não acumulam com outras campanhas ou descontos.");
  const c = await lerCodigo(codigo);
  if (c?.erro) throw new ErroCliente(c.erro);
  if (c.tipo === "vip") {
    if (tipo !== "marcacao") throw new ErroCliente("O código VIP é só para marcações.");
    return { ...out, desconto: base, total: 0, codigo: { tipo: "vip", codigo: c.codigo, texto: "Código VIP" } };
  }
  if (c.tipo === "voucher") {
    if (tipo !== "marcacao") throw new ErroCliente("Os vouchers usam-se ao marcar um tratamento.");
    if (c.tratamento !== t.id) throw new ErroCliente(`Este voucher é para ${c.nomeTratamento}. Escolha esse tratamento para o usar.`);
    return { ...out, desconto: base, total: 0, codigo: { tipo: "voucher", codigo: c.codigo, texto: "Voucher oferta" } };
  }
  const desconto = r2(base * c.percentagem / 100);
  return { ...out, desconto, total: r2(base - desconto), codigo: { tipo: "newsletter", codigo: c.codigo, percentagem: c.percentagem, texto: `Boas-vindas newsletter (${c.percentagem}%)` } };
}

const limpar = (v, n = 120) => String(v ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n);
const emailValido = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const nifValido = (n) => /^\d{9}$/.test(n) && (() => {
  const d = n.split("").map(Number);
  const soma = d.slice(0, 8).reduce((a, x, i) => a + x * (9 - i), 0);
  const ctl = 11 - (soma % 11);
  return (ctl >= 10 ? 0 : ctl) === d[8];
})();

// Cria o pedido a partir do que vem do site (ainda sem pagamento).
export async function criar(corpo) {
  const tipo = corpo.tipo;
  const conta = await calcular({ tipo, tratamento: corpo.tratamento, codigo: corpo.codigo, campanha: corpo.campanha });
  const cliente = { nome: limpar(corpo.nome, 80), email: limpar(corpo.email, 120).toLowerCase(), telefone: limpar(corpo.telefone, 30), nif: limpar(corpo.nif, 12).replace(/\D/g, "") };
  if (!cliente.nome) throw new ErroCliente("Indique o seu nome.");
  if (!emailValido(cliente.email)) throw new ErroCliente("Indique um email válido.");
  if (cliente.nif && !nifValido(cliente.nif)) throw new ErroCliente("O NIF não parece válido. Confirme os 9 dígitos ou deixe em branco.");

  const t = conta.tratamento;
  const p = {
    numero: `OMS-${hojeISO().slice(2).replace(/-/g, "")}-${crypto.randomBytes(3).toString("hex").slice(0, 4).toUpperCase()}`,
    token: crypto.randomBytes(12).toString("hex"),
    tipo, criado: new Date().toISOString(), estado: "novo",
    tratamento: { id: t.id, nome: t.nome, grupo: t.grupo, artigo: t.artigo, duracao: conta.campanha?.duracao || t.duracao },
    campanha: conta.campanha ? { id: conta.campanha.id, nome: conta.campanha.nome, precoNormal: conta.campanha.preco_antigo || null } : null,
    precoBase: conta.precoBase, desconto: conta.desconto, total: conta.total, codigo: conta.codigo,
    cliente,
  };
  if (tipo === "marcacao") {
    const data = limpar(corpo.data, 10), hora = limpar(corpo.hora, 5);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || data < hojeISO()) throw new ErroCliente("Escolha o dia da marcação.");
    if (!/^\d{2}:\d{2}$/.test(hora)) throw new ErroCliente("Escolha a hora da marcação.");
    // Marcações: nome, email e telemóvel obrigatórios (Pedro, 27/10/2026). O NIF é opcional, só para a fatura.
    if (!cliente.telefone.replace(/\D/g, "")) throw new ErroCliente("Indique o seu telemóvel.");
    p.marcacao = { data, hora, terapeuta: limpar(corpo.terapeuta, 80) };
  } else {
    // Entrega: digital (só o email) ou caixa oferta para levantar no spa, sem custo extra. O código segue sempre por email.
    p.voucher = { para: limpar(corpo.para, 60), de: limpar(corpo.de, 60), mensagem: limpar(corpo.mensagem, 200), formato: corpo.formato === "caixa" ? "caixa" : "digital" };
  }
  return p;
}

// O que o browser pode ver de um pedido (na página de pagamento).
export const publico = (p) => ({
  numero: p.numero, tipo: p.tipo, estado: p.estado, total: p.total, tratamento: p.tratamento.nome,
  marcacao: p.marcacao ? { data: p.marcacao.data, hora: p.marcacao.hora, terapeuta: p.marcacao.terapeuta } : null,
  metodo: p.pagamento?.metodo || null,
  multibanco: p.pagamento?.multibanco || null,
  telemovel: p.pagamento?.telemovel ? p.pagamento.telemovel.replace(/^(\d{3})\d{3}/, "$1 ***") : null,
});
