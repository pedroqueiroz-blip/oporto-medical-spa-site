// Horário de trabalho de cada colaboradora, escrito no campo «Horário padrão» do módulo Prestadores do
// Zoho CRM (Pedro, 28/10/2026). Partes separadas por «;» ou mudança de linha, cada uma com dias e horas:
//   «seg-sex 08:00-14:00»   «qui-sex 14:30-20:00»   «seg, qua 9h-13h 14h-18h»
//   «sab 09:00-13:00 quinzenal 14-11-2026»  (sábado sim, sábado não, contando a semana de 14/11/2026)
const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];
const NOMES = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const simples = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const minutos = (h, m) => Number(h) * 60 + Number(m || 0);
const hhmm = (n) => `${String(n / 60 | 0).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
const diaSemana = (data) => new Date(`${data}T12:00:00Z`).getUTCDay();

// Texto → { regras: [{ dias: [1..5], faixas: [[480, 840]], quinzenal: "2026-11-14" | null }], erros: ["parte não lida"] }
export function lerHorario(texto) {
  const regras = [], erros = [];
  for (const parte of String(texto || "").split(/[;\n]+/).map((s) => s.trim()).filter(Boolean)) {
    let s = simples(parte), quinzenal = null;
    const q = s.match(/quinzena(?:l|lmente)?\s*(?:a partir de|desde|de)?\s*(?:(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}))?/);
    if (q) {
      if (!q[1]) { erros.push(`${parte} (falta a data de um dos sábados de trabalho, ex.: quinzenal 14-11-2026)`); continue; }
      quinzenal = `${q[3]}-${q[2].padStart(2, "0")}-${q[1].padStart(2, "0")}`;
      s = s.replace(q[0], " ");
    }
    const dias = new Set();
    const pre = s.split(/\d/)[0].replace(/-?feira/g, "").replace(/([a-z]{3})[a-z]*\s+(?:a|ate)\s+([a-z]{3})/g, "$1-$2");
    for (const tok of pre.split(/,|\s+e\s+|\s+/).map((x) => x.trim()).filter(Boolean)) {
      const [a, b] = tok.split(/[-–]|\ba\b/).map((x) => DIAS.indexOf(x.trim().slice(0, 3)));
      if (a < 0 || (tok.includes("-") && (b ?? -1) < 0)) continue;
      if (b == null || b < 0) dias.add(a);
      else for (let d = a; ; d = (d + 1) % 7) { dias.add(d); if (d === b) break; }
    }
    const faixas = [...s.matchAll(/(\d{1,2})(?:[:h](\d{2})?)?\s*(?:-|–|a|ate|as)\s*(\d{1,2})(?:[:h](\d{2})?)?/g)]
      .map((m) => [minutos(m[1], m[2]), minutos(m[3], m[4])]).filter(([a, b]) => a < b && b <= 24 * 60);
    if (!dias.size || !faixas.length) { erros.push(parte); continue; }
    regras.push({ dias: [...dias].sort(), faixas, quinzenal });
  }
  return { regras, erros };
}

// Trabalha nesse dia, da hora de início até ao fim do tratamento?
export function trabalha(regras, data, hora, duracao) {
  const d = diaSemana(data), ini = minutos(...hora.split(":")), fim = ini + duracao;
  return regras.some((r) => r.dias.includes(d)
    && (!r.quinzenal || Math.floor(Math.round((Date.parse(`${data}T12:00:00Z`) - Date.parse(`${r.quinzenal}T12:00:00Z`)) / 864e5) / 7) % 2 === 0)
    && r.faixas.some(([a, b]) => ini >= a && fim <= b));
}

// Para a página de verificação: «seg–sex 08:00–14:00 · sáb 09:00–13:00 (quinzenal, semana de 14/11/2026)»
export function descreverHorario(regras) {
  return regras.map((r) => {
    const seguidos = r.dias.length > 2 && r.dias.every((d, i) => !i || d === r.dias[i - 1] + 1);
    const dias = seguidos ? `${NOMES[r.dias[0]]}–${NOMES[r.dias.at(-1)]}` : r.dias.map((d) => NOMES[d]).join(", ");
    return `${dias} ${r.faixas.map(([a, b]) => `${hhmm(a)}–${hhmm(b)}`).join(", ")}${r.quinzenal ? ` (quinzenal, semana de ${r.quinzenal.split("-").reverse().join("/")})` : ""}`;
  }).join(" · ");
}
