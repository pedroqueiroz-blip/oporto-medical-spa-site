// Códigos que mudam o valor a pagar:
//   VIP (ou o definido em CODIGO_VIP no Netlify): marcação sem custos.
//   BEMVINDO-XXXXXX: 10% na primeira compra para quem subscreve a newsletter. Um por email, usado uma só vez.
//   OMS-XXXX-XXXX: voucher oferta comprado no site. Paga a marcação do tratamento do voucher, uma só vez.
import crypto from "node:crypto";
import { store, STORES } from "./store.mjs";
import { hojeISO } from "./datas.mjs";

export const DESCONTO_NEWSLETTER = 10;
const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sem 0/O e 1/I, para ler e escrever sem enganos
const aleatorio = (n) => Array.from(crypto.randomBytes(n), (b) => ALFABETO[b % ALFABETO.length]).join("");
export const normalizar = (c) => String(c || "").trim().toUpperCase().replace(/\s+/g, "");
const codigoVip = () => normalizar(process.env.CODIGO_VIP || "VIP");
const chaveEmail = (email) => "newsletter-email/" + crypto.createHash("sha256").update(String(email).trim().toLowerCase()).digest("hex");

// Que código é, e se ainda vale. Devolve { tipo, ... } ou { erro }.
export async function lerCodigo(codigo) {
  const c = normalizar(codigo);
  if (!c) return null;
  if (c === codigoVip()) return { tipo: "vip", codigo: c };
  const s = await store(STORES.codigos);
  if (/^BEMVINDO-[A-Z0-9]{6}$/.test(c)) {
    const r = await s.get(`newsletter/${c}`, { type: "json" });
    if (!r) return { erro: "Este código não existe. Confirme se o escreveu como o recebeu por email." };
    if (r.usado) return { erro: "Este código de boas-vindas já foi usado." };
    return { tipo: "newsletter", codigo: c, percentagem: r.percentagem };
  }
  if (/^OMS-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(c)) {
    const r = await s.get(`voucher/${c}`, { type: "json" });
    if (!r) return { erro: "Este voucher não existe. Confirme se o escreveu como está no email." };
    if (r.usado) return { erro: "Este voucher já foi usado." };
    if (r.validade < hojeISO()) return { erro: "Este voucher já passou da validade." };
    return { tipo: "voucher", codigo: c, tratamento: r.tratamento, nomeTratamento: r.nomeTratamento, validade: r.validade };
  }
  return { erro: "Este código não é válido." };
}

// Marca o código como usado pelo pedido (os códigos VIP não se gastam).
export async function gastarCodigo(codigo, numero) {
  const c = normalizar(codigo);
  const chave = /^BEMVINDO-/.test(c) ? `newsletter/${c}` : /^OMS-/.test(c) ? `voucher/${c}` : null;
  if (!chave) return;
  const s = await store(STORES.codigos);
  const r = await s.get(chave, { type: "json" });
  if (!r || r.usado) return;
  r.usado = { pedido: numero, em: new Date().toISOString() };
  await s.setJSON(chave, r);
}

// Código de 10% para um email da newsletter (o mesmo se a pessoa se inscrever de novo).
export async function codigoNewsletter(email) {
  const s = await store(STORES.codigos);
  const existente = await s.get(chaveEmail(email), { type: "json" });
  if (existente?.codigo) return { codigo: existente.codigo, novo: false };
  const codigo = "BEMVINDO-" + aleatorio(6);
  await s.setJSON(`newsletter/${codigo}`, { codigo, email: String(email).trim().toLowerCase(), percentagem: DESCONTO_NEWSLETTER, criado: new Date().toISOString(), usado: null });
  await s.setJSON(chaveEmail(email), { codigo });
  return { codigo, novo: true };
}

// Voucher novo, depois de pago.
export async function criarVoucher({ tratamento, nomeTratamento, validade, pedido, para, de }) {
  const s = await store(STORES.codigos);
  for (let i = 0; i < 5; i++) {
    const codigo = `OMS-${aleatorio(4)}-${aleatorio(4)}`;
    if (await s.get(`voucher/${codigo}`)) continue;
    await s.setJSON(`voucher/${codigo}`, { codigo, tratamento, nomeTratamento, validade, pedido, para, de, criado: new Date().toISOString(), usado: null });
    return codigo;
  }
  throw new Error("Não foi possível gerar o código do voucher.");
}
