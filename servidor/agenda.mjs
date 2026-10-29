// Agenda das marcações: horas livres e marcação no Zoho CRM.
// Cada pessoa da equipa liga-se a um utilizador do CRM pelo nome (igual nos dois lados) ou pelo email
// indicado no backoffice («Utilizador no Zoho CRM»). Uma hora está livre quando essa pessoa não tem
// nenhum evento no CRM que se sobreponha à duração do tratamento e o tratamento cabe no horário dela
// (módulo Prestadores). Sem Zoho ligado, a agenda é simulada.
import catalogo from "./gerado/catalogo.json" with { type: "json" };
import { tratamento as lerTratamento } from "./catalogo.mjs";
import { instanteLisboa, hojeISO } from "./datas.mjs";
import { zohoLigado, utilizadores, ocupacoes, criarMarcacao, moduloMarcacoes, clienteCRM, prestadores, turnos } from "./zoho.mjs";
import { trabalha } from "./horario.mjs";
import { store, STORES } from "./store.mjs";

export class ErroAgenda extends Error {}

// As mesmas horas que a agenda do site mostra (public/prototype.js): de meia em meia hora (Pedro, 28/10/2026), das 8:00
// às 20:00; ao sábado das 9:00 às 13:00 (Pedro, 27/10/2026); encerra ao domingo. O tratamento inteiro tem de caber.
export const HORAS = Array.from({ length: 24 }, (_, i) => `${String(8 + (i >> 1)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`);
const ANTECEDENCIA = 60 * 60e3; // não se marca para daqui a menos de uma hora
const diaSemana = (data) => new Date(`${data}T12:00:00Z`).getUTCDay();
const minutos = (hora) => Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3, 5));
function aberto(data, hora, duracao) {
  const d = diaSemana(data), ini = minutos(hora), fim = ini + duracao;
  return d !== 0 && (d === 6 ? ini >= 9 * 60 && fim <= 13 * 60 : ini >= 8 * 60 && fim <= 20 * 60);
}
const simples = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const somarDias = (data, n) => new Date(Date.parse(`${data}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

// Equipa do site com o utilizador do CRM de cada pessoa e se tem agenda online (guardado 10 minutos).
// As marcações vão só para o módulo «Tratamentos» (Pedro, 27/10/2026): tem agenda online quem está numa
// das listas de profissionais do módulo («Terapeutas», «Profissionais LC»…), com o mesmo nome do site.
// O horário de cada uma vem do módulo «Prestadores» (Pedro, 28/10/2026): quem lá está inativa fica fora;
// sem registo ou sem horário legível, valem só as horas do SPA (a verificação avisa).
let mapa = null;
async function equipaCRM() {
  if (mapa && Date.now() < mapa.ate) return mapa.lista;
  const [us, mm, pr] = await Promise.all([utilizadores().catch(() => []), moduloMarcacoes(), prestadores().catch(() => null)]);
  const lista = (catalogo.equipa || []).map((p) => {
    const u = us.find((x) => (p.zoho && x.email === simples(p.zoho)) || simples(x.nome) === simples(p.nome));
    const reg = pr?.lista.find((x) => simples(x.nome) === simples(p.nome));
    const agenda = Boolean(mm) && reg?.ativo !== false && mm.campos.terapeutas.some((f) => !f.valores.length || f.valores.some((v) => simples(v) === simples(p.nome)));
    return { ...p, dono: u?.id || null, agenda, horario: reg?.regras.length ? reg.regras : null };
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
// Turnos do dia (Horários de Colaborador): «08:00-14:00, 15:00-20:00» → [[480, 840], [900, 1200]]; «-» → [].
const faixasTurno = (texto) => [...String(texto || "").matchAll(/(\d{1,2})[:h](\d{2})\s*[-–]\s*(\d{1,2})[:h](\d{2})/g)].map((m) => [m[1] * 60 + +m[2], m[3] * 60 + +m[4]]);
function noTurno(tur, p, data, hora, duracao) {
  const texto = tur.get(`${data}|${simples(p.nome)}`);
  const ini = minutos(hora), fim = ini + duracao;
  // Sem registo nesse dia vale o horário padrão do Prestadores (Pedro, 29/10/2026: a Beatriz Pena a 2/11);
  // com «-» não está disponível; a marcação inteira tem de caber num só turno.
  if (texto == null) return Boolean(p.horario) && trabalha(p.horario, data, hora, duracao);
  return faixasTurno(texto).some(([a, b]) => ini >= a && fim <= b);
}
const lerTurnos = (datas, pessoas) => turnos(datas, pessoas.map((p) => p.nome)).catch((e) => { console.error("Zoho turnos", e.message); return null; });

// tur: turnos do dia (Map) quando o módulo existe; mandam eles. Sem o módulo, vale o horário padrão do Prestadores.
function livre(evs, p, data, hora, duracao, tur = null) {
  if (!aberto(data, hora, duracao)) return false;
  if (tur ? !noTurno(tur, p, data, hora, duracao) : p.horario && !trabalha(p.horario, data, hora, duracao)) return false;
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
  const tur = await lerTurnos(datas, comAgenda);
  const livres = {};
  for (const p of comAgenda) {
    livres[p.id] = {};
    for (const d of datas) livres[p.id][d] = HORAS.filter((h) => livre(evs, p, d, h, t.duracao, tur));
  }
  return { fonte: "zoho", livres, semAgenda: equipa.filter((p) => !p.agenda).map((p) => p.nome) };
}

// Antes de pagar: confirma que a hora continua livre e escolhe a pessoa («Sem preferência» = a livre com menos marcações no dia).
export async function confirmarHora(p, { terapeutaId, qualquer }) {
  if (p.tipo !== "marcacao" || !(await zohoLigado()) || !(await moduloPronto())) return;
  const { data, hora } = p.marcacao, dur = Number(p.tratamento.duracao) || 60;
  const equipa = (await equipaCRM()).filter((x) => x.agenda && (x.faz || []).includes(p.tratamento.id));
  const candidatos = qualquer || !terapeutaId ? equipa : equipa.filter((x) => x.id === terapeutaId);
  if (!candidatos.length) throw new ErroAgenda("Esta pessoa não tem agenda online para este tratamento. Escolha outra ou «Sem preferência».");
  const evs = [...await ocupacoes(instanteLisboa(data, "00:00").iso, instanteLisboa(data, "23:59").iso), ...await guardadas(p.cliente.email)];
  // «Sem preferência»: das livres a essa hora, a que tem menos marcações nesse dia; empate à sorte (Pedro, 28/10/2026).
  const marcacoesDia = (x) => new Set(evs.filter((e) => dela(e, x)).map((e) => `${e.inicio}-${e.fim}`)).size;
  const tur = await lerTurnos([data], candidatos);
  const livres = candidatos.filter((x) => livre(evs, x, data, hora, dur, tur)).map((x) => ({ x, n: marcacoesDia(x), sorte: Math.random() }));
  const escolhida = livres.sort((a, b) => a.n - b.n || a.sorte - b.sorte)[0]?.x;
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

// Um dia da agenda como o site o vê: tudo o que leu do Zoho e as horas livres de cada pessoa (tratamento de 60 min).
export async function diaAgenda(data) {
  const diag = [];
  const evs = [...await ocupacoes(instanteLisboa(data, "00:00").iso, instanteLisboa(data, "23:59").iso, diag), ...await guardadas()];
  const equipa = await equipaCRM();
  const tur = await lerTurnos([data], equipa);
  return {
    lidos: [...evs, ...diag].sort((a, b) => a.inicio - b.inicio),
    pessoas: equipa.map((p) => ({ nome: p.nome, agenda: p.agenda, dono: p.dono, horario: Boolean(p.horario), turno: tur ? tur.get(`${data}|${simples(p.nome)}`) ?? null : undefined, livres: p.agenda ? HORAS.filter((h) => livre(evs, p, data, h, 60, tur)) : [],
      ocupada: evs.filter((e) => dela(e, p)).length })),
  };
}

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
