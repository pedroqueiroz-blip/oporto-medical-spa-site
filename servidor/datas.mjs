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

// Dia e hora de Lisboa ("2026-10-27", "10:00") → instante e ISO com o fuso certo ("2026-10-27T10:00:00+00:00").
export function instanteLisboa(data, hora, somarMin = 0) {
  const [y, m, d] = data.split("-").map(Number), [h, mi] = hora.split(":").map(Number);
  const aprox = Date.UTC(y, m - 1, d, h, mi + somarMin);
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    .formatToParts(new Date(aprox)).filter((x) => x.type !== "literal").map((x) => [x.type, Number(x.value)]));
  const desvio = Math.round((Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - aprox) / 60e3); // 0 ou 60 minutos
  const t = aprox - desvio * 60e3;
  const local = new Date(aprox), z = (n) => String(n).padStart(2, "0");
  const iso = `${local.getUTCFullYear()}-${z(local.getUTCMonth() + 1)}-${z(local.getUTCDate())}T${z(local.getUTCHours())}:${z(local.getUTCMinutes())}:00${desvio >= 0 ? "+" : "-"}${z(Math.abs(desvio) / 60 | 0)}:${z(Math.abs(desvio) % 60)}`;
  return { t, iso };
}
