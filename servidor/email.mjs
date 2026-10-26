// Emails do site através da Resend. Sem RESEND_API_KEY e EMAIL_FROM no Netlify, nada é enviado
// (o pagamento e a fatura funcionam na mesma; o cliente vê o resultado na página de pagamento).
import { spa, TEXTO_TERAPEUTICA } from "./catalogo.mjs";
import { dataPT } from "./datas.mjs";

export const emailAtivo = () => Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const eur = (v) => Number(v).toLocaleString("pt-PT", { minimumFractionDigits: Number(v) % 1 ? 2 : 0, maximumFractionDigits: 2 }) + " €";
const site = () => String(process.env.URL_SITE || spa.url || "").replace(/\/$/, "");

async function enviar({ para, assunto, html }) {
  if (!emailAtivo() || !para) return { enviado: false };
  try {
    const r = await fetch(process.env.RESEND_API_BASE || "https://api.resend.com/emails", {
      method: "POST",
      signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [para], subject: assunto, html, ...(spa.email ? { reply_to: spa.email } : {}) }),
    });
    if (r.ok) return { enviado: true };
    const j = await r.json().catch(() => ({}));
    return { enviado: false, erro: `Resend ${r.status}: ${j.message || j.name || "erro"}` };
  } catch {
    return { enviado: false, erro: "Não foi possível contactar a Resend." };
  }
}

// Cores da marca: fundo linho, texto noite, acento luz de vela.
const moldura = (conteudo) => `<!doctype html><html lang="pt-PT"><body style="margin:0;background:#E8DCC8;font-family:Manrope,Arial,Helvetica,sans-serif;color:#24180F">
<div style="max-width:560px;margin:0 auto;padding:28px 20px">
<p style="font-family:'EB Garamond',Georgia,serif;font-size:24px;letter-spacing:.04em;margin:0 0 18px;color:#0D0A08">${esc(spa.nome)}</p>
<div style="background:#fff;border-radius:4px;padding:26px;line-height:1.6;font-size:15px">${conteudo}</div>
<p style="font-size:12px;color:#3B2919;margin-top:16px">${esc(spa.nome)} · ${esc(spa.morada)} · ${esc(spa.telefone)} · ${esc(spa.email)}</p>
</div></body></html>`;
const h1 = (t) => `<h1 style="font-family:'EB Garamond',Georgia,serif;font-weight:400;font-size:26px;line-height:1.2;margin:0 0 14px;color:#0D0A08">${esc(t)}</h1>`;
const linhas = (pares) => `<table style="width:100%;border-collapse:collapse;font-size:14px;margin:14px 0">${pares.filter(Boolean).map(([k, v]) =>
  `<tr><td style="padding:7px 12px 7px 0;color:#7a6650;border-bottom:1px solid #eee;white-space:nowrap">${esc(k)}</td><td style="padding:7px 0;border-bottom:1px solid #eee"><b>${v}</b></td></tr>`).join("")}</table>`;
const valorPago = (p) => p.total > 0 ? eur(p.total) + (p.desconto ? ` <span style="color:#7a6650;font-weight:400">(${esc(p.codigo?.texto || "desconto")})</span>` : "")
  : p.codigo?.tipo === "voucher" ? `Voucher oferta ${esc(p.codigo.codigo)}` : "Sem custos";

// Confirmação da marcação, com o texto do Pedro para a terapêutica (TREAB ou TPREV).
export const emailMarcacao = (p) => enviar({
  para: p.cliente.email,
  assunto: `Marcação confirmada · ${p.tratamento.nome}`,
  html: moldura(`${h1(`Está marcado, ${p.cliente.nome.split(" ")[0]}.`)}
<p>${esc(TEXTO_TERAPEUTICA[p.tratamento.artigo](p.tratamento.nome))}</p>
${linhas([["Tratamento", esc(p.tratamento.nome)], ["Dia", esc(dataPT(p.marcacao.data, { semana: true }))], ["Hora", `${esc(p.marcacao.hora)} · ${esc(p.tratamento.duracao)} min`],
    p.marcacao.terapeuta && ["Terapeuta", esc(p.marcacao.terapeuta)], ["Valor", valorPago(p)], ["N.º da marcação", esc(p.numero)]])}
<p>Chegue dez a quinze minutos antes: o chá fica à sua espera. Pode alterar ou cancelar sem custos até 24 horas antes, respondendo a este email ou pelo ${esc(spa.telefone)}.</p>
${p.total > 0 ? `<p style="font-size:13px;color:#7a6650">A fatura-recibo segue num email à parte.</p>` : ""}`),
});

// Voucher pago: o código só aparece aqui.
export const emailVoucher = (p) => enviar({
  para: p.cliente.email,
  assunto: `O seu voucher oferta · ${p.tratamento.nome}`,
  html: moldura(`${h1("O seu voucher oferta")}
<p>Obrigado, ${esc(p.cliente.nome.split(" ")[0])}. Este é o voucher para oferecer${p.voucher.para ? ` a ${esc(p.voucher.para)}` : ""}:</p>
<div style="border:1px solid #D9A86C;padding:22px;text-align:center;margin:16px 0;background:#0D0A08;color:#E8DCC8">
<p style="margin:0 0 6px;font-size:11px;letter-spacing:.3em;text-transform:uppercase;color:#B5A288">Voucher oferta</p>
<p style="font-family:'EB Garamond',Georgia,serif;font-size:24px;margin:0 0 4px">${esc(p.tratamento.nome)}</p>
<p style="font-size:13px;color:#B5A288;margin:0 0 12px">${esc(p.tratamento.duracao)} minutos${p.campanha ? ` · ${esc(p.campanha.nome)}` : ""}</p>
${p.voucher.mensagem ? `<p style="font-style:italic;margin:0 0 12px">“${esc(p.voucher.mensagem)}”</p>` : ""}
${p.voucher.para || p.voucher.de ? `<p style="font-size:13px;color:#B5A288;margin:0 0 14px">${p.voucher.para ? `Para ${esc(p.voucher.para)}` : ""}${p.voucher.para && p.voucher.de ? " · " : ""}${p.voucher.de ? `De ${esc(p.voucher.de)}` : ""}</p>` : ""}
<p style="font-size:26px;letter-spacing:.12em;margin:0;color:#D9A86C"><b>${esc(p.voucher.codigo)}</b></p>
<p style="font-size:13px;margin:12px 0 0">Válido até ${esc(dataPT(p.voucher.validade))}</p></div>
${p.voucher.formato === "caixa" ? `<p><b>Caixa oferta:</b> preparamos a caixa com este voucher, sem custo extra. Pode levantá-la no spa${spa.morada ? `, em ${esc(spa.morada)}` : ""}, no horário de funcionamento. Indique o n.º do pedido, ${esc(p.numero)}.</p>` : ""}
<p>Para marcar, escolha ${esc(p.tratamento.nome)} em <a href="${esc(site())}/#reservar">${esc(site().replace(/^https?:\/\//, ""))}</a>, escreva o código no passo de confirmação e a marcação fica sem custos. Também pode marcar pelo ${esc(spa.telefone)}.</p>
<p style="font-size:13px;color:#7a6650">Válido para uma marcação. A fatura-recibo segue num email à parte.</p>`),
});

export const emailMultibanco = (p) => {
  const mb = p.pagamento.multibanco;
  return enviar({
    para: p.cliente.email,
    assunto: `Dados para pagamento · ${p.tratamento.nome}`,
    html: moldura(`${h1("Falta só o pagamento")}
<p>${p.tipo === "voucher" ? "O voucher segue para o seu email" : "A marcação fica confirmada"} assim que o pagamento chegar.</p>
${linhas([["Entidade", esc(mb.entidade)], ["Referência", esc(String(mb.referencia).replace(/(\d{3})(?=\d)/g, "$1 "))], ["Valor", eur(p.total)], ["Pagar até", esc(dataPT(mb.validade))]])}`),
  });
};

// Aviso para a equipa (reservas): cada marcação ou voucher confirmado.
export const emailInterno = (p, problema) => enviar({
  para: process.env.EMAIL_RESERVAS || spa.email,
  assunto: `${problema ? "Atenção · " : ""}${p.tipo === "voucher" ? "Voucher" : "Marcação"} ${p.numero} · ${p.tratamento.nome}${p.marcacao ? ` · ${p.marcacao.data} ${p.marcacao.hora}` : ""}`,
  html: moldura(`${problema ? `<p style="color:#a33"><b>${esc(problema)}</b></p>` : ""}${linhas([
    ["Pedido", esc(p.numero)], ["Tratamento", `${esc(p.tratamento.nome)} (${esc(p.tratamento.artigo)})`], ...(p.campanha ? [["Campanha", `${esc(p.campanha.nome)} · ${esc(p.tratamento.duracao)} min`]] : []),
    p.marcacao && ["Dia e hora", `${esc(dataPT(p.marcacao.data, { semana: true }))}, ${esc(p.marcacao.hora)}`],
    p.marcacao?.terapeuta && ["Terapeuta", esc(p.marcacao.terapeuta)],
    p.voucher?.codigo && ["Voucher", `${esc(p.voucher.codigo)} · válido até ${esc(dataPT(p.voucher.validade))}`],
    p.voucher?.para && ["Para", esc(p.voucher.para)],
    p.voucher && ["Entrega", p.voucher.formato === "caixa" ? "Caixa oferta, levanta no SPA (preparar a caixa)" : "Digital, por email"],
    ["Cliente", `${esc(p.cliente.nome)} · ${esc(p.cliente.email)} · ${esc(p.cliente.telefone)}${p.cliente.nif ? ` · NIF ${esc(p.cliente.nif)}` : ""}`],
    ["Valor", valorPago(p)], p.fatura?.numero && ["Fatura", esc(p.fatura.numero)], p.moloni?.erro && ["Moloni", esc(p.moloni.erro)],
  ])}`),
});

// Código de 10% para quem subscreve a newsletter.
export const emailBoasVindas = (email, codigo, pct) => enviar({
  para: email,
  assunto: `O seu código de ${pct}% no ${spa.nome}`,
  html: moldura(`${h1("Boas-vindas às cartas da casa")}
<p>Obrigado por subscrever as nossas cartas. Este é o seu código de ${pct}% de desconto na primeira marcação ou voucher:</p>
<p style="font-size:24px;letter-spacing:.12em;text-align:center;border:1px solid #D9A86C;padding:16px;margin:16px 0"><b>${esc(codigo)}</b></p>
<p>Escreva-o no passo de confirmação, antes de pagar. Vale para uma compra.</p>
<p><a href="${esc(site())}/#reservar" style="display:inline-block;background:#0D0A08;color:#E8DCC8;text-decoration:none;padding:12px 22px;font-size:12px;letter-spacing:.2em;text-transform:uppercase">Reservar</a></p>`),
});
