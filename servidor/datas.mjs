// Datas no fuso de Lisboa.
const partes = (d) => Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon", year: "numeric", month: "2-digit", day: "2-digit" })
  .formatToParts(d).filter((p) => p.type !== "literal").map((p) => [p.type, Number(p.value)]));

export const hojeISO = (d = new Date()) => { const p = partes(d); return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`; };

// Validade dos vouchers: até ao último dia do mês, passados 12 meses (comprado a 22/10/2026 → 31/10/2027).
export function validadeVoucher(d = new Date()) {
  const p = partes(d);
  const ultimo = new Date(Date.UTC(p.year + 1, p.month, 0)); // dia 0 do mês seguinte = último dia do mês
  return ultimo.toISOString().slice(0, 10);
}

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const SEMANA = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
// "2027-10-31" → "31 de outubro de 2027"; com semana: "sábado, 31 de outubro"
export function dataPT(iso, { semana = false, ano = true } = {}) {
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return String(iso || "");
  const dia = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${semana ? SEMANA[dia] + ", " : ""}${d} de ${MESES[m - 1]}${ano ? ` de ${y}` : ""}`;
}
