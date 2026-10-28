// Corre sozinha sempre que alguém envia um formulário do site (Netlify Forms).
// Newsletter: gera o código de 10% de boas-vindas (um por email) e envia-o por email.
// Formato novo do Netlify (export default), como a api.mjs: só assim os Netlify Blobs, onde ficam os códigos, funcionam.
import { codigoNewsletter, DESCONTO_NEWSLETTER } from "../../servidor/codigos.mjs";
import { emailBoasVindas } from "../../servidor/email.mjs";

export default async (req) => {
  const { payload } = await req.json().catch(() => ({}));
  if (payload?.form_name !== "newsletter") return new Response("ignorado");
  const email = String(payload.data?.email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || payload.data?.empresa) return new Response("ignorado");
  const { codigo, novo } = await codigoNewsletter(email);
  if (novo) {
    const r = await emailBoasVindas(email, codigo, DESCONTO_NEWSLETTER, payload.data?.lingua);
    if (!r.enviado) console.error("Newsletter: código", codigo, "não enviado", r.erro || "(email não configurado)");
  }
  return new Response("ok");
};
