// Versão inglesa do site (/en/): mensagens de erro, datas e nomes dos tratamentos para quem marca ou compra em inglês.
// O pedido guarda a língua (p.lingua = "en"); a fatura e o aviso à equipa ficam em português.
import { tratamento as lerTratamento, campanha as lerCampanha } from "./catalogo.mjs";

export const lingua = (v) => (v === "en" ? "en" : "pt");

const ERROS = {
  "Pedido inválido.": "Invalid request.",
  "Escolha um tratamento.": "Please choose a treatment.",
  "Esta campanha já não está em vigor.": "This offer has ended.",
  "O preço desta campanha é só para vouchers.": "This offer price is for vouchers only.",
  "Os vouchers desta campanha esgotaram.": "The vouchers for this offer have sold out.",
  "Os vouchers de campanha não acumulam com outras campanhas ou descontos.": "Offer vouchers cannot be combined with other offers or discounts.",
  "O código VIP é só para marcações.": "The VIP code can only be used for bookings.",
  "Os vouchers usam-se ao marcar um tratamento.": "Vouchers are used when booking a treatment.",
  "Indique o seu nome.": "Please enter your name.",
  "Indique um email válido.": "Please enter a valid email address.",
  "O NIF não parece válido. Confirme os 9 dígitos ou deixe em branco.": "This tax number (NIF) doesn’t look right. Check the 9 digits or leave it blank.",
  "Escolha o dia da marcação.": "Please choose the day of your booking.",
  "Escolha a hora da marcação.": "Please choose the time of your booking.",
  "Indique o seu telemóvel.": "Please enter your mobile number.",
  "Escolha como quer pagar.": "Please choose how you would like to pay.",
  "As marcações pagam-se por MB WAY ou cartão, para ficarem confirmadas na hora.": "Bookings are paid by MB WAY or card, so they are confirmed straight away.",
  "Indique um telemóvel português com 9 dígitos para o MB WAY.": "Please enter a 9-digit Portuguese mobile number for MB WAY.",
  "Esta pessoa não tem agenda online para este tratamento. Escolha outra ou «Sem preferência».": "This therapist can’t be booked online for this treatment. Choose someone else or “No preference”.",
  "Esta hora acabou de ser ocupada. Escolha outra, por favor.": "This time has just been taken. Please choose another.",
  "Este código não existe. Confirme se o escreveu como o recebeu por email.": "This code doesn’t exist. Check that you typed it exactly as in the email.",
  "Este código de boas-vindas já foi usado.": "This welcome code has already been used.",
  "Este voucher não existe. Confirme se o escreveu como está no email.": "This voucher doesn’t exist. Check that you typed it exactly as in the email.",
  "Este voucher já foi usado.": "This voucher has already been used.",
  "Este voucher já passou da validade.": "This voucher has expired.",
  "Este código não é válido.": "This code isn’t valid.",
  "Pedido não encontrado.": "Order not found.",
  "Não encontrado.": "Not found.",
};

// Mensagem de erro para o cliente, na língua da página.
export function erroEN(msg) {
  const m = String(msg || "");
  if (ERROS[m]) return ERROS[m];
  const v = m.match(/^Este voucher é para (.+)\. Escolha esse tratamento para o usar\.$/);
  if (v) return `This voucher is for ${v[1]}. Choose that treatment to use it.`;
  return "Something went wrong. Please try again in a moment.";
}

// Textos dos códigos aplicados ao preço (resumo da marcação).
export function codigoEN(c) {
  if (!c) return c;
  const texto = c.tipo === "vip" ? "VIP code" : c.tipo === "voucher" ? "Gift voucher" : c.tipo === "newsletter" ? `Newsletter welcome (${c.percentagem}%)` : c.texto;
  return { ...c, texto };
}

// Nome do tratamento (ou da campanha) em inglês, como no site em /en/.
export const nomeEN = (id) => lerTratamento(id)?.nome_en || lerTratamento(id)?.nome || "";
export const campanhaEN = (id) => lerCampanha(id)?.nome_en || lerCampanha(id)?.nome || "";

const MESES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const SEMANA = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
// "2027-10-31" → "31 October 2027"; com semana: "Sunday, 31 October 2027"
export function dataEN(iso, { semana = false, ano = true } = {}) {
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return String(iso || "");
  const dia = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${semana ? SEMANA[dia] + ", " : ""}${d} ${MESES[m - 1]}${ano ? ` ${y}` : ""}`;
}

// Texto do email de confirmação (o mesmo do Pedro, em inglês). TPREV = área Relaxar, TREAB = todas as outras.
export const TEXTO_TERAPEUTICA_EN = {
  TREAB: (nome) => `We are a medical spa. On the day of your booking, the physiotherapist will assess you and advise on the best way to care for your health. Your rehabilitation therapy will then begin: ${nome}.`,
  TPREV: (nome) => `We are a medical spa. On the day of your booking, the physiotherapist will assess you and advise on the best way to care for your health and well-being. Your preventive therapy will then begin: ${nome}.`,
};
