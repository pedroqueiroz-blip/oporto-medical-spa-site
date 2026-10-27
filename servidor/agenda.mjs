// Agenda das marcações: horas livres e marcação no Zoho CRM.
// Cada pessoa da equipa liga-se a um utilizador do CRM pelo nome (igual nos dois lados) ou pelo email
// indicado no backoffice («Utilizador no Zoho CRM»). Uma hora está livre quando essa pessoa não tem
// nenhum evento no CRM que se sobreponha à duração do tratamento. Sem Zoho ligado, a agenda é simulada.
import catalogo from "./gerado/catalogo.json" with { type: "json" };
import { tratamento as lerTratamento } from "./catalogo.mjs";
import { instanteLisboa, hojeISO } from "./datas.mjs";
import { zohoLigado, utilizadores, eventos, criarEvento, clienteCRM } from "./zoho.mjs";
import { store, STORES } from "./store.mjs";

export class ErroAgenda extends Error {}

// As mesmas horas que a agenda do site mostra (public/prototype.js): encerra ao domingo e ao sábado à tarde.
export const HORAS = ["08:00", "09:00", "10:00", "11:00", "12:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00"];
const ANTECEDENCIA = 60 * 60e3; // não se marca para daqui a menos de uma hora
const diaSemana = (data) => new Date(`${data}T12:00:00Z`).getUTCDay();
const aberto = (data, hora) => diaSemana(data) !== 0 && !(diaSemana(data) === 6 && hora > "13:00");
const simples = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const somarDias = (data, n) => new Date(Date.parse(`${data}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

// Equipa do site com o utilizador do CRM de cada pessoa (guardado 10 minutos).
let mapa = null;
async function equipaCRM() {
  if (mapa && Date.now() < mapa.ate) return mapa.lista;
  const us = await utilizadores();
  const lista = (catalogo.equipa || []).map((p) => {
    const u = us.find((x) => (p.zoho && x.email === simples(p.zoho)) || simples(x.nome) === simples(p.nome));
    return { ...p, dono: u?.id || null };
  });
  mapa = { lista, ate: Date.now() + 10 * 60e3 };
  return lista;
}

// Horas guardadas durante o pagamento: contam como ocupadas 30 minutos ou até a marcação entrar no CRM.
const GUARDA = 30 * 60e3;
async function guardadas(excetoEmail = "") {
  const s = await store(STORES.reservas);
  const out = [];
  for (const { key } of (await s.list()).blobs) {
    const r = await s.get(key, { type: "json" });
    if (!r || Date.now() > r.ate) { await s.delete(key).catch(() => {}); continue; }
    if (r.email !== excetoEmail) out.push(r);
  }
  return out;
}
export async function guardarHora(p) {
  if (p.tipo !== "marcacao" || !p.marcacao?.zohoDono || !(await zohoLigado())) return;
  const { data, hora } = p.marcacao, ini = instanteLisboa(data, hora).t;
  await (await store(STORES.reservas)).setJSON(p.numero, { dono: p.marcacao.zohoDono, inicio: ini, fim: ini + (Number(p.tratamento.duracao) || 60) * 60e3, email: p.cliente.email, ate: Date.now() + GUARDA });
}

function livre(evs, dono, data, hora, duracao) {
  if (!aberto(data, hora)) return false;
  const ini = instanteLisboa(data, hora).t, fim = ini + duracao * 60e3;
  if (ini < Date.now() + ANTECEDENCIA) return false;
  return !evs.some((e) => e.dono === dono && (e.diaInteiro ? e.dia === data : e.inicio < fim && e.fim > ini));
}

// Horas livres de cada pessoa que faz o tratamento, dia a dia: { fonte, livres: { ana: { "2026-10-27": ["09:00"] } } }
export async function disponibilidade({ tratamento: id, de, dias = 14 }) {
  if (!(await zohoLigado())) return { fonte: "simulada" };
  const t = lerTratamento(id);
  if (!t) throw new ErroAgenda("Escolha um tratamento.");
  const inicio = /^\d{4}-\d{2}-\d{2}$/.test(de || "") && de > hojeISO() ? de : hojeISO();
  const n = Math.min(Math.max(Number(dias) || 14, 1), 31);
  const equipa = (await equipaCRM()).filter((p) => (p.faz || []).includes(t.id));
  const comAgenda = equipa.filter((p) => p.dono);
  if (!comAgenda.length) return { fonte: "simulada", aviso: "Ninguém da equipa deste tratamento está ligado a um utilizador do Zoho CRM." };
  const datas = Array.from({ length: n }, (_, i) => somarDias(inicio, i));
  const evs = [...await eventos(instanteLisboa(datas[0], "00:00").iso, instanteLisboa(datas.at(-1), "23:59").iso), ...await guardadas()];
  const livres = {};
  for (const p of comAgenda) {
    livres[p.id] = {};
    for (const d of datas) livres[p.id][d] = HORAS.filter((h) => livre(evs, p.dono, d, h, t.duracao));
  }
  return { fonte: "zoho", livres, semAgenda: equipa.filter((p) => !p.dono).map((p) => p.nome) };
}

// Antes de pagar: confirma que a hora continua livre e escolhe a pessoa («Sem preferência» = a primeira livre).
export async function confirmarHora(p, { terapeutaId, qualquer }) {
  if (p.tipo !== "marcacao" || !(await zohoLigado())) return;
  const { data, hora } = p.marcacao, dur = Number(p.tratamento.duracao) || 60;
  const equipa = (await equipaCRM()).filter((x) => x.dono && (x.faz || []).includes(p.tratamento.id));
  const candidatos = qualquer || !terapeutaId ? equipa : equipa.filter((x) => x.id === terapeutaId);
  if (!candidatos.length) throw new ErroAgenda("Esta pessoa não tem agenda online para este tratamento. Escolha outra ou «Sem preferência».");
  const evs = [...await eventos(instanteLisboa(data, "00:00").iso, instanteLisboa(data, "23:59").iso), ...await guardadas(p.cliente.email)];
  const escolhida = candidatos.find((x) => livre(evs, x.dono, data, hora, dur));
  if (!escolhida) throw new ErroAgenda("Esta hora acabou de ser ocupada. Escolha outra, por favor.");
  p.marcacao.terapeuta = escolhida.nome;
  p.marcacao.terapeutaId = escolhida.id;
  p.marcacao.zohoDono = escolhida.dono;
}

// Pedido pago (ou a 0 €): ficha do cliente (encontrada pelo NIF/email ou criada) e evento na agenda do CRM.
export async function marcarNoCRM(p) {
  if (p.tipo !== "marcacao" || p.zoho?.evento || !(await zohoLigado())) return;
  const { data, hora } = p.marcacao, dur = Number(p.tratamento.duracao) || 60;
  const cliente = await clienteCRM(p.cliente);
  const evento = await criarEvento({
    titulo: `${p.tratamento.nome} · ${p.cliente.nome}`,
    inicio: instanteLisboa(data, hora).iso, fim: instanteLisboa(data, hora, dur).iso,
    dono: p.marcacao.zohoDono, cliente: cliente.id,
    descricao: [`Marcação pelo site ${p.numero}`, `Valor: ${Number(p.total).toFixed(2)} €${p.codigo ? ` (${p.codigo.texto})` : ""}`,
      `Email: ${p.cliente.email}`, p.cliente.telefone && `Telemóvel: ${p.cliente.telefone}`, p.cliente.nif && `NIF: ${p.cliente.nif}`, cliente.nota].filter(Boolean).join("\n"),
  });
  p.zoho = { cliente: cliente.id, clienteNovo: cliente.novo, evento, nota: cliente.nota || "", em: new Date().toISOString() };
  await (await store(STORES.reservas)).delete(p.numero).catch(() => {});
}
