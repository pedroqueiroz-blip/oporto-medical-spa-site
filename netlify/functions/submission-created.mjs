// Corre sozinha sempre que alguém envia um formulário do site (Netlify Forms).
// Newsletter: gera o código de 10% de boas-vindas (um por email) e envia-o por email.
import { codigoNewsletter, DESCONTO_NEWSLETTER } from "../../servidor/codigos.mjs";
import { emailBoasVindas } from "../../servidor/email.mjs";
import { connectLambda } from "@netlify/blobs";

export const handler = async (event) => {
  // Funções neste formato (handler) só chegam aos Netlify Blobs, onde ficam os códigos, depois disto.
  if (event.blobs) connectLambda(event);
  const { payload } = JSON.parse(event.body || "{}");
  if (payload?.form_name !== "newsletter") return { statusCode: 200, body: "ignorado" };
  const email = String(payload.data?.email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || payload.data?.empresa) return { statusCode: 200, body: "ignorado" };
  const { codigo, novo } = await codigoNewsletter(email);
  if (novo) {
    const r = await emailBoasVindas(email, codigo, DESCONTO_NEWSLETTER, payload.data?.lingua);
    if (!r.enviado) console.error("Newsletter: código", codigo, "não enviado", r.erro || "(email não configurado)");
  }
  return { statusCode: 200, body: "ok" };
};
