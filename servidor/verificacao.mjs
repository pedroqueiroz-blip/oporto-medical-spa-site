// Verificação do email antes da marcação: código de 6 dígitos por email, válido 10 minutos.
// Confirmado o código, o browser recebe uma chave que acompanha o pedido (/api/pagamento) durante 1 hora.
// Sem Resend configurado (testes e pré-visualizações) o código volta na resposta, para se poder experimentar.
import crypto from "node:crypto";
import { store, STORES } from "./store.mjs";
import { emailAtivo, emailCodigo } from "./email.mjs";

export class ErroVerificacao extends Error {}

const VALIDADE_CODIGO = 10 * 60e3, VALIDADE_CHAVE = 60 * 60e3, ESPERA = 45e3, TENTATIVAS = 5;
const emailValido = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const normal = (e) => String(e || "").trim().toLowerCase().slice(0, 120);
const resumo = (c) => crypto.createHash("sha256").update(String(c)).digest("hex");
const chave = (email) => `email-${resumo(email)}`;

export async function pedirCodigo(emailBruto) {
  const email = normal(emailBruto);
  if (!emailValido(email)) throw new ErroVerificacao("Indique um email válido.");
  const s = await store(STORES.verificacoes);
  const atual = await s.get(chave(email), { type: "json" });
  if (atual?.enviado && Date.now() - Date.parse(atual.enviado) < ESPERA) throw new ErroVerificacao("Já enviámos um código há instantes. Veja o seu email (e a pasta de spam) ou tente de novo daqui a um minuto.");
  const codigo = String(crypto.randomInt(0, 1e6)).padStart(6, "0");
  await s.setJSON(chave(email), { codigo: resumo(codigo), enviado: new Date().toISOString(), tentativas: 0 });
  if (!emailAtivo()) return { enviado: false, codigoTeste: codigo };
  const r = await emailCodigo(email, codigo);
  if (!r.enviado) throw new Error("Não foi possível enviar o código. Tente de novo dentro de momentos.");
  return { enviado: true };
}

export async function confirmarCodigo(emailBruto, codigoBruto) {
  const email = normal(emailBruto), codigo = String(codigoBruto || "").replace(/\D/g, "");
  const s = await store(STORES.verificacoes);
  const v = await s.get(chave(email), { type: "json" });
  if (!v?.codigo || Date.now() - Date.parse(v.enviado) > VALIDADE_CODIGO) throw new ErroVerificacao("O código expirou. Peça um novo.");
  if (v.tentativas >= TENTATIVAS) throw new ErroVerificacao("Demasiadas tentativas. Peça um novo código.");
  if (resumo(codigo) !== v.codigo) {
    await s.setJSON(chave(email), { ...v, tentativas: v.tentativas + 1 });
    throw new ErroVerificacao("O código não está certo. Confirme os 6 dígitos do email.");
  }
  const token = crypto.randomBytes(16).toString("hex");
  await s.setJSON(chave(email), { verificado: resumo(token), ate: new Date(Date.now() + VALIDADE_CHAVE).toISOString() });
  return { verificacao: token };
}

// O pedido de marcação só segue com a chave da verificação deste email.
export async function emailVerificado(emailBruto, token) {
  if (!token) return false;
  const v = await (await store(STORES.verificacoes)).get(chave(normal(emailBruto)), { type: "json" });
  return Boolean(v?.verificado && v.verificado === resumo(String(token)) && Date.now() < Date.parse(v.ate));
}
