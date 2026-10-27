// Agenda das marcações: horas livres e marcação no Zoho CRM.
// Cada pessoa da equipa liga-se a um utilizador do CRM pelo nome (igual nos dois lados) ou pelo email
// indicado no backoffice («Utilizador no Zoho CRM»). Uma hora está livre quando essa pessoa não tem
// nenhum evento no CRM que se sobreponha à duração do tratamento. Sem Zoho ligado, a agenda é simulada.
import catalogo from "./gerado/catalogo.json" with { type: "json" };
import { tratamento as lerTratamento } from "./catalogo.mjs";
import { instanteLisboa, hojeISO } from "./datas.mjs";
import { zohoLigado, utilizadores, ocupacoes, criarMarcacao, moduloMarcacoes, clienteCRM } from "./zoho.mjs";
import { store, STORES } from "./store.mjs";

export class ErroAgenda extends Error {}

// As mesmas horas que a agenda do site mostra (public/prototype.js): encerra ao domingo e ao sábado à tarde.
export const HORAS = ["08:00", "09:00", "10:00", "11:00", "12:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00"];
const ANTECEDENCIA = 60 * 60e3; // não se marca para daqui a menos de uma hora
const diaSemana = (data) => new Date(`${data}T12:00:00Z`).getUTCDay();
const aberto = (data, hora) => diaSemana(data) !== 0 && !(diaSemana(data) === 6 && hora > "13:00");
const simples = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const somarDias = (data, n) => new Date(Date.parse(`${data}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

// Equipa do site com o utilizador do CRM de cada pessoa e se tem agenda online (guardado 10 minutos).
// As marcações vão só para o módulo «Tratamentos» (Pedro, 27/10/2026): tem agenda online quem está numa
// das listas de profissionais do módulo («Terapeutas», «Profissionais LC»…), com o mesmo nome do site.
let mapa = null;
async function equipaCRM() {
  if (mapa && Date.now() < mapa.ate) return mapa.lista;
  const [us, mm] = await Promise.all([utilizadores().catch(() => []), moduloMarcacoes()]);
  const lista = (catalogo.equipa || []).map((p) => {
    const u = us.find((x) => (p.zoho && x.email === simples(p.zoho)) || simples(x.nome) === simples(p.nome));
    const agenda = Boolean(mm) && mm.campos.terapeutas.some((f) => !f.valores.length || f.valores.some((v) => simples(v) === simples(p.nome)));
    return { ...p, dono: u?.id || null, agenda };
  });
  mapa = { lista, modulo: Boolean(mm), ate: Date.now() + (mm ? 10 * 60e3 : 0) }; // sem módulo pronto, volta a ver na próxima vez
  return lista;
}
const moduloPronto = async () => (await equipaCRM(), mapa.modulo);

// Horas guardadas durante o pagamento: contam como ocupadas 10 minutos (Pedro, 27/10/2026) ou até a marcação entrar no CRM.
const GUARDA = 10 * 60e3;
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
  if (p.tipo !== "marcacao" || !p.marcacao?.terapeuta || !(await zohoLigado())) return;
  const { data, hora } = p.marcacao, ini = instanteLisboa(data, hora).t;
  await (await store(STORES.reservas)).setJSON(p.numero, { dono: p.marcacao.zohoDono || null, nome: p.marcacao.terapeuta, inicio: ini, fim: ini + (Number(p.tratamento.duracao) || 60) * 60e3, email: p.cliente.email, ate: Date.now() + GUARDA });
}

// Ocupa a pessoa um evento seu (utilizador do CRM) ou uma marcação do módulo com o nome dela.
const dela = (e, p) => (e.dono && e.dono === p.dono) || (e.nome && simples(e.nome) === simples(p.nome));
function livre(evs, p, data, hora, duracao) {
  if (!aberto(data, hora)) return false;
  const ini = instanteLisboa(data, hora).t, fim = ini + duracao * 60e3;
  if (ini < Date.now() + ANTECEDENCIA) return false;
  return !evs.some((e) => dela(e, p) && (e.diaInteiro ? e.dia === data : e.inicio < fim && e.fim > ini));
}

// Horas livres de cada pessoa que faz o tratamento, dia a dia: { fonte, livres: { ana: { "2026-10-27": ["09:00"] } } }
export async function disponibilidade({ tratamento: id, de, dias = 14 }) {
  if (!(await zohoLigado())) return { fonte: "simulada" };
  const t = lerTratamento(id);
  if (!t) throw new ErroAgenda("Escolha um tratamento.");
  const inicio = /^\d{4}-\d{2}-\d{2}$/.test(de || "") && de > hojeISO() ? de : hojeISO();
  const n = Math.min(Math.max(Number(dias) || 14, 1), 31);
  const equipa = (await equipaCRM()).filter((p) => (p.faz || []).includes(t.id));
  if (!(await moduloPronto())) return { fonte: "simulada", aviso: "O módulo Tratamentos do Zoho CRM não está pronto (ver /api/zoho/verificar)." };
  const comAgenda = equipa.filter((p) => p.agenda);
  if (!comAgenda.length) return { fonte: "simulada", aviso: "Ninguém da equipa deste tratamento está nas listas de profissionais do módulo Tratamentos." };
  const datas = Array.from({ length: n }, (_, i) => somarDias(inicio, i));
  const evs = [...await ocupacoes(instanteLisboa(datas[0], "00:00").iso, instanteLisboa(datas.at(-1), "23:59").iso), ...await guardadas()];
  const livres = {};
  for (const p of comAgenda) {
    livres[p.id] = {};
    for (const d of datas) livres[p.id][d] = HORAS.filter((h) => livre(evs, p, d, h, t.duracao));
  }
  return { fonte: "zoho", livres, semAgenda: equipa.filter((p) => !p.agenda).map((p) => p.nome) };
}

// Antes de pagar: confirma que a hora continua livre e escolhe a pessoa («Sem preferência» = a primeira livre).
export async function confirmarHora(p, { terapeutaId, qualquer }) {
  if (p.tipo !== "marcacao" || !(await zohoLigado()) || !(await moduloPronto())) return;
  const { data, hora } = p.marcacao, dur = Number(p.tratamento.duracao) || 60;
  const equipa = (await equipaCRM()).filter((x) => x.agenda && (x.faz || []).includes(p.tratamento.id));
  const candidatos = qualquer || !terapeutaId ? equipa : equipa.filter((x) => x.id === terapeutaId);
  if (!candidatos.length) throw new ErroAgenda("Esta pessoa não tem agenda online para este tratamento. Escolha outra ou «Sem preferência».");
  const evs = [...await ocupacoes(instanteLisboa(data, "00:00").iso, instanteLisboa(data, "23:59").iso), ...await guardadas(p.cliente.email)];
  const escolhida = candidatos.find((x) => livre(evs, x, data, hora, dur));
  if (!escolhida) throw new ErroAgenda("Esta hora acabou de ser ocupada. Escolha outra, por favor.");
  p.marcacao.terapeuta = escolhida.nome;
  p.marcacao.terapeutaId = escolhida.id;
  p.marcacao.zohoDono = escolhida.dono;
  p.marcacao.preferencia = !(qualquer || !terapeutaId);
}

// Pedido pago (ou a 0 €): ficha do cliente (encontrada pelo NIF/email ou criada) e evento na agenda do CRM.
export async function marcarNoCRM(p) {
  if (p.tipo !== "marcacao" || p.zoho?.evento || !(await zohoLigado())) return;
  const { data, hora } = p.marcacao, dur = Number(p.tratamento.duracao) || 60;
  const mm = await moduloMarcacoes();
  if (!mm) throw new Error("O módulo Tratamentos do Zoho CRM não está pronto (ver /api/zoho/verificar).");
  const cliente = await clienteCRM(p.cliente);
  const evento = await criarMarcacao(mm, {
    titulo: `${p.tratamento.nome} · ${p.cliente.nome}`,
    inicio: instanteLisboa(data, hora).iso, fim: instanteLisboa(data, hora, dur).iso,
    dono: p.marcacao.zohoDono, terapeuta: p.marcacao.terapeuta, preferencia: p.marcacao.preferencia, cliente: cliente.id, tratamento: p.tratamento.nome, valor: p.total, semPagamento: Number(p.total) > 0 ? false : /vip/i.test(p.codigo?.texto || p.codigo?.tipo || "") ? "isento" : true,
    descricao: [`${p.numero} · Origem online`, `Tratamento: ${p.tratamento.nome} (${dur} min)`, `Valor: ${Number(p.total).toFixed(2)} €${p.codigo ? ` (${p.codigo.texto})` : ""}`,
      `Email: ${p.cliente.email}`, p.cliente.telefone && `Telemóvel: ${p.cliente.telefone}`, p.cliente.nif && `NIF: ${p.cliente.nif}`, cliente.nota].filter(Boolean).join("\n"),
  });
  p.zoho = { cliente: cliente.id, clienteNovo: cliente.novo, evento, modulo: mm.modulo, nota: cliente.nota || "", em: new Date().toISOString() };
  await (await store(STORES.reservas)).delete(p.numero).catch(() => {});
}

/* ---------- Diagnóstico (/api/zoho/verificar) ---------- */

// Últimas marcações do site, mais recentes primeiro, com o resultado no Zoho.
export async function ultimasMarcacoes(n = 10) {
  const s = await store(STORES.pedidos);
  const chaves = (await s.list()).blobs.map((b) => b.key).filter((k) => k.startsWith("OMS-"));
  const out = [];
  for (const k of chaves) {
    const p = await s.get(k, { type: "json" });
    if (p?.tipo !== "marcacao") continue;
    out.push({ numero: p.numero, criado: p.criado, data: p.marcacao?.data, hora: p.marcacao?.hora, tratamento: p.tratamento?.nome, terapeuta: p.marcacao?.terapeuta,
      cliente: `${p.cliente?.nome || ""} · ${p.cliente?.email || ""}`, estado: p.estado, metodo: p.pagamento?.metodo || (p.total > 0 ? "" : p.codigo?.texto || ""), zoho: p.zoho || null });
  }
  return out.sort((a, b) => String(b.criado).localeCompare(String(a.criado))).slice(0, n);
}

// Volta a pôr no CRM uma marcação paga (ou a 0 €) que lá não ficou.
export async function repetirNoCRM(numero) {
  const s = await store(STORES.pedidos);
  const p = await s.get(String(numero).toUpperCase(), { type: "json" });
  if (p?.tipo !== "marcacao") throw new Error("Marcação não encontrada.");
  if (!["pago", "confirmado"].includes(p.estado)) throw new Error("Só se põem na agenda marcações pagas ou a 0 €.");
  if (p.zoho?.evento) return "já estava na agenda.";
  if (!p.marcacao.zohoDono) {
    // Pedido criado antes de o Zoho estar ligado: escolhe a terapeuta pelo nome guardado.
    const t = (await equipaCRM()).find((x) => x.nome === p.marcacao.terapeuta);
    if (t?.dono) p.marcacao.zohoDono = t.dono;
  }
  delete p.zoho;
  await marcarNoCRM(p);
  if (!p.zoho?.evento) throw new Error("O Zoho CRM não está ligado neste site.");
  p.atualizado = new Date().toISOString();
  await s.setJSON(p.numero, p);
  return "posta na agenda do Zoho.";
}
