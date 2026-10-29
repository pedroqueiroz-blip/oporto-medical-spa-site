// Vouchers comprados no site, para a página /api/vouchers do backoffice (Pedro, 29/10/2026): dados da compra,
// oferta, meio de pagamento, mensagem e número do voucher, com pesquisa por qualquer um destes campos.
import { store, STORES } from "./store.mjs";
import { hojeISO } from "./datas.mjs";

const METODOS = { mb_way: "MB WAY", card: "Cartão", multibanco: "Multibanco" };
const pago = (p) => ["pago", "confirmado"].includes(p.estado);

export const meioPagamento = (p) => !(p.total > 0) ? `Sem pagamento${p.codigo?.texto ? ` (${p.codigo.texto})` : ""}` : METODOS[p.pagamento?.metodo] || p.pagamento?.metodo || "—";
export const nomeOferta = (p) => p.campanha?.nome ? `${p.tratamento?.nome} · ${p.campanha.nome}` : p.tratamento?.nome || "";

// Estado do voucher: por pagar, por usar (dentro da validade), usado ou fora da validade.
export function estadoVoucher(p) {
  if (!p.voucher?.codigo) return pago(p) ? { chave: "erro", texto: "Pago, voucher por emitir" } : { chave: "pagar", texto: "À espera do pagamento" };
  if (p.usado) return { chave: "usado", texto: `Usado${p.usado.pedido ? ` na marcação ${p.usado.pedido}` : ""}` };
  if (p.voucher.validade && p.voucher.validade < hojeISO()) return { chave: "expirado", texto: "Fora da validade" };
  return { chave: "ativo", texto: "Por usar" };
}

// Todos os vouchers pedidos no site (pagos ou à espera do pagamento), mais recentes primeiro,
// com o uso de cada código (gaveta codigos).
export async function listarVouchers() {
  const s = await store(STORES.pedidos), c = await store(STORES.codigos);
  const chaves = (await s.list()).blobs.map((b) => b.key).filter((k) => k.startsWith("OMS-"));
  const out = [];
  for (let i = 0; i < chaves.length; i += 25) {
    const lote = await Promise.all(chaves.slice(i, i + 25).map((k) => s.get(k, { type: "json" }).catch(() => null)));
    out.push(...lote.filter((p) => p?.tipo === "voucher"));
  }
  await Promise.all(out.filter((p) => p.voucher?.codigo).map(async (p) => {
    const r = await c.get(`voucher/${p.voucher.codigo}`, { type: "json" }).catch(() => null);
    p.usado = r?.usado || null;
  }));
  return out.sort((a, b) => String(b.criado).localeCompare(String(a.criado)));
}

// Campos da pesquisa: o texto de cada um, sem acentos nem maiúsculas.
export const CAMPOS = {
  todos: "Todos os campos",
  voucher: "Número do voucher",
  compra: "Dados da compra",
  oferta: "Nome da oferta",
  pagamento: "Meio de pagamento",
  mensagem: "Mensagem do voucher",
};
const sem = (t) => String(t ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
function textos(p) {
  const c = p.cliente || {};
  return {
    voucher: [p.voucher?.codigo],
    compra: [p.numero, p.criado?.slice(0, 10), c.nome, c.email, c.telefone, String(c.telefone || "").replace(/\D/g, ""), c.nif, p.fatura?.numero, p.total != null && Number(p.total).toFixed(2), p.total != null && Number(p.total).toFixed(2).replace(".", ","), p.codigo?.codigo],
    oferta: [p.tratamento?.nome, p.campanha?.nome],
    pagamento: [meioPagamento(p), p.pagamento?.metodo, p.pagamento?.pago?.transacao, p.pagamento?.multibanco?.referencia],
    mensagem: [p.voucher?.mensagem, p.voucher?.para, p.voucher?.de],
  };
}

export function filtrar(lista, q, campo = "todos") {
  const termos = sem(q).split(/\s+/).filter(Boolean);
  if (!termos.length) return lista;
  return lista.filter((p) => {
    const t = textos(p);
    const alvo = sem((CAMPOS[campo] && campo !== "todos" ? t[campo] : Object.values(t).flat()).filter(Boolean).join(" "));
    return termos.every((x) => alvo.includes(x));
  });
}
