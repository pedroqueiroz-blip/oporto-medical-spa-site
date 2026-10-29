// Marcação no calendário do cliente: link «Adicionar ao Google Calendar» e ficheiro .ics (iPhone, Outlook).
// O site não escreve no calendário de ninguém: o cliente abre o link ou o ficheiro e guarda o evento.
import { spa } from "./catalogo.mjs";
import { instanteLisboa } from "./datas.mjs";
import { nomeEN, campanhaEN } from "./ingles.mjs";

const utc = (t) => new Date(t).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); // 20261030T090000Z

// Título, início/fim (UTC), local e notas do evento, na língua do cliente.
export function evento(p) {
  if (p.tipo !== "marcacao" || !p.marcacao?.data || !p.marcacao?.hora) return null;
  const en = p.lingua === "en";
  const nome = (en ? (p.campanha ? campanhaEN(p.campanha.id) : nomeEN(p.tratamento.id)) : "") || p.tratamento.nome;
  const inicio = instanteLisboa(p.marcacao.data, p.marcacao.hora).t;
  const fim = inicio + (Number(p.tratamento.duracao) || 60) * 60e3;
  const notas = [
    en ? `Booking no. ${p.numero}` : `N.º da marcação: ${p.numero}`,
    p.marcacao.terapeuta && (en ? `Therapist: ${p.marcacao.terapeuta}` : `Terapeuta: ${p.marcacao.terapeuta}`),
    en ? "Please arrive ten to fifteen minutes early: your tea will be waiting." : "Chegue dez a quinze minutos antes: o chá fica à sua espera.",
    en ? `To change or cancel (free of charge up to 24 hours beforehand): ${spa.telefone} · ${spa.email}` : `Alterar ou cancelar (sem custos até 24 horas antes): ${spa.telefone} · ${spa.email}`,
  ].filter(Boolean);
  return { uid: `${p.numero}@oportomedicalspa.com`, titulo: `${nome} · ${spa.nome}`, inicio, fim, local: `${spa.nome}, ${spa.morada}`, notas };
}

export function linkGoogle(p) {
  const e = evento(p);
  if (!e) return null;
  const q = new URLSearchParams({ action: "TEMPLATE", text: e.titulo, dates: `${utc(e.inicio)}/${utc(e.fim)}`, details: e.notas.join("\n"), location: e.local, ctz: "Europe/Lisbon" });
  return `https://calendar.google.com/calendar/render?${q}`;
}

// iCalendar (RFC 5545): texto escapado e linhas dobradas a 75 octetos.
const txt = (s) => String(s).replace(/[\\;,]/g, (c) => "\\" + c).replace(/\r?\n/g, "\\n");
function dobrar(linha) {
  const b = Buffer.from(linha, "utf8");
  if (b.length <= 75) return linha;
  const partes = [];
  let atual = "";
  for (const c of linha) {
    if (Buffer.byteLength(atual + c, "utf8") > (partes.length ? 74 : 75)) { partes.push(atual); atual = ""; }
    atual += c;
  }
  partes.push(atual);
  return partes.join("\r\n ");
}

export function ics(p) {
  const e = evento(p);
  if (!e) return null;
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Oporto Medical Spa//Marcacoes//PT", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VEVENT", `UID:${e.uid}`, `DTSTAMP:${utc(Date.now())}`, `DTSTART:${utc(e.inicio)}`, `DTEND:${utc(e.fim)}`,
    `SUMMARY:${txt(e.titulo)}`, `LOCATION:${txt(e.local)}`, `DESCRIPTION:${txt(e.notas.join("\n"))}`,
    "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${txt(e.titulo)}`, "TRIGGER:-PT2H", "END:VALARM",
    "END:VEVENT", "END:VCALENDAR", "",
  ].map(dobrar).join("\r\n");
}
