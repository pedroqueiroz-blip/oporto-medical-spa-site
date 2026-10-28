// Estado de cada pedido para a equipa (email de reservas e página /api/reservas do backoffice): reservado,
// pagamento euPago, fatura Moloni, emails e erros, cada um com ✓ (feito), ✗ (erro, a resolver) ou … (a aguardar).
import { store, STORES } from "./store.mjs";

const METODOS = { mb_way: "MB WAY", card: "cartão", multibanco: "Multibanco" };
const eur = (v) => Number(v).toLocaleString("pt-PT", { minimumFractionDigits: Number(v) % 1 ? 2 : 0, maximumFractionDigits: 2 }) + " €";
const pago = (p) => ["pago", "confirmado"].includes(p.estado);

// [{ ok: true | false | null, texto }]
export function estados(p) {
  const out = [], add = (ok, texto) => out.push({ ok, texto });
  if (p.tipo === "marcacao") {
    if (p.zoho?.evento) add(true, `Reservado na agenda Zoho${p.zoho.clienteNovo ? " · ficha de cliente nova" : " · cliente já existente"}${p.zoho.nota ? ` · ${p.zoho.nota}` : ""}`);
    else if (p.zoho?.erro) add(false, `Não ficou na agenda Zoho: ${p.zoho.erro}. Marcar à mão.`);
    else if (pago(p)) add(false, "Não ficou na agenda Zoho. Marcar à mão.");
    else add(null, "Hora guardada à espera do pagamento");
  } else if (p.voucher?.codigo) add(true, `Voucher ${p.voucher.codigo} emitido`);
  else add(pago(p) ? false : null, "Voucher por emitir");

  const metodo = METODOS[p.pagamento?.metodo] || p.pagamento?.metodo || "";
  if (!(p.total > 0)) add(true, `Sem pagamento (${p.codigo?.texto || "0 €"})`);
  else if (p.pagamento?.pago) add(true, `euPago OK · ${eur(p.pagamento.pago.valor ?? p.total)}${metodo ? ` · ${metodo}` : ""}${p.pagamento.pago.transacao ? ` · transação ${p.pagamento.pago.transacao}` : ""}`);
  else if (pago(p)) add(true, `Pago (${p.concluido?.por || "confirmado à mão"})`);
  else add(null, `Pagamento por receber${metodo ? ` (${metodo})` : ""}`);

  if (p.total > 0 && pago(p)) {
    if (p.fatura?.numero) add(true, `Moloni OK · fatura ${p.fatura.numero}`);
    else if (p.moloni?.erro) add(false, `Moloni: ${p.moloni.erro}`);
    else if (p.moloni?.estado === "rascunho") add(null, "Moloni: fatura em rascunho, fechar no Moloni ON");
    else add(false, "Moloni: fatura por emitir");
  }

  for (const [qual, nome] of [["cliente", "Email ao cliente"]]) {
    const v = p.emails?.[qual];
    if (v) add(!String(v).startsWith("falhou"), String(v).startsWith("falhou") ? `${nome} ${v}` : `${nome} enviado`);
  }
  for (const n of p.notas || []) add(false, n.texto);
  return out;
}

export const simbolo = (ok) => (ok === true ? "✓" : ok === false ? "✗" : "…");

// Últimos pedidos (marcações e vouchers), mais recentes primeiro.
export async function ultimosPedidos(n = 50) {
  const s = await store(STORES.pedidos);
  // O número leva a data (OMS-AAMMDD-XXXX): só se leem os mais recentes.
  const chaves = (await s.list()).blobs.map((b) => b.key).filter((k) => k.startsWith("OMS-")).sort().reverse().slice(0, n + 20);
  const out = [];
  for (const k of chaves) {
    const p = await s.get(k, { type: "json" });
    if (p?.tipo) out.push(p);
  }
  return out.sort((a, b) => String(b.criado).localeCompare(String(a.criado))).slice(0, n);
}
