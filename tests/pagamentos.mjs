// Teste de ponta a ponta dos pagamentos, contra euPago, Moloni ON e Resend simulados.
// Corre sozinho depois do build: npm test (node src/build.mjs && node tests/pagamentos.mjs).
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ok = (c, m) => { if (!c) throw new Error("FALHOU: " + m); console.log("✓ " + m); };
const PORTA = 9997, B = `http://localhost:${PORTA}`;
Object.assign(process.env, {
  LOCAL_BLOBS_DIR: fs.mkdtempSync(path.join(os.tmpdir(), "oms-pag-")),
  EUPAGO_API_KEY: "demo-chave-teste", EUPAGO_MODO: "real", EUPAGO_API_BASE: `${B}/eupago`,
  MOLONI_API_KEY: "apik:teste", MOLONI_API_BASE: `${B}/moloni`, MOLONI_FECHAR: "sim",
  RESEND_API_KEY: "re_teste", EMAIL_FROM: "Oporto Medical Spa <reservas@exemplo.pt>", RESEND_API_BASE: `${B}/resend`,
});

// --- Serviços simulados ---
const S = { mb: [], mbway: [], cartao: [], docs: {}, faturaEmails: [], emails: [], artigos: { TREAB: "M10", TPREV: "M10" } };
const r2 = (v) => Math.round(v * 100) / 100;
const esc = (s) => String(s).replace(/&/g, "&amp;");
const servidor = http.createServer(async (req, res) => {
  let body = ""; for await (const c of req) body += c;
  let j = {}; try { j = body ? JSON.parse(body) : {}; } catch { j = Object.fromEntries(new URLSearchParams(body)); }
  res.setHeader("Content-Type", "application/json");
  const out = (x) => res.end(JSON.stringify(x));
  if (req.url.startsWith("/zoho")) return zoho(req, body, j, res, out);
  if (req.url.startsWith("/resend")) { S.emails.push(j); return out({ id: "e" + S.emails.length }); }
  if (req.url === "/eupago/clientes/rest_api/multibanco/create") { S.mb.push(j); return out({ sucesso: true, entidade: "12345", referencia: "123456789", valor: j.valor, data_fim: j.data_fim }); }
  if (req.url === "/eupago/api/v1.02/mbway/create") { S.mbway.push(j); return out({ transactionStatus: "Success", transactionID: "mw" + S.mbway.length, reference: "r1" }); }
  if (req.url === "/eupago/api/v1.02/creditcard/create") { S.cartao.push(j); return out({ transactionStatus: "Success", transactionID: "cc1", reference: "r2", redirectUrl: "https://pagar.exemplo/cc1" }); }
  if (req.url.startsWith("/moloni")) {
    const { query, variables: v } = j;
    const nome = query.match(/\{\s*(\w+)\s*\(/)?.[1] || query.match(/\{\s*(\w+)\s*\{/)?.[1];
    const dados = (data) => out({ data: { [nome]: { errors: [], data } } });
    const f = v?.options?.filter?.[0];
    switch (nome) {
      case "me": return dados({ userCompanies: [{ companyId: 5 }] });
      case "documentSets": return dados([{ documentSetId: 1, name: "2026", isDefault: true }, { documentSetId: 7, name: "SPA" }]);
      case "paymentMethods": return dados([{ paymentMethodId: 1, name: "Numerário", isDefault: true }, { paymentMethodId: 2, name: "Cartão de crédito" }, { paymentMethodId: 3, name: "MB WAY" }, { paymentMethodId: 4, name: "Multibanco" }]);
      case "customers": return dados(f.field === "number" && f.value === "1" ? [{ customerId: 1, name: "Consumidor final", vat: "999999990" }] : f.field === "isDefault" ? [{ customerId: 1, name: "Consumidor final", country: { countryId: 1 }, language: { languageId: 1 } }] : []);
      case "customerNextNumber": return dados("2");
      case "customerCreate": return dados({ customerId: 50 });
      case "products": return dados(S.artigos[f.value] !== undefined ? [{ productId: f.value === "TREAB" ? 101 : 102, name: f.value, reference: f.value, exemptionReason: S.artigos[f.value] }] : []);
      case "invoiceReceiptCreate": {
        const id = 900 + Object.keys(S.docs).length;
        const total = r2(v.data.products.reduce((a, p) => a + p.qty * p.price * (1 + (p.taxes[0]?.value || 0) / 100), 0));
        S.docs[id] = { documentId: id, number: 0, status: 0, totalValue: total, documentSetName: "SPA", dados: v.data };
        return dados(S.docs[id]);
      }
      case "invoiceReceiptUpdate": Object.assign(S.docs[v.data.documentId], { status: 1, number: Object.values(S.docs).filter((d) => d.status === 1).length + 1 }); return dados(S.docs[v.data.documentId]);
      case "invoiceReceiptGetPDF": return out({ data: { invoiceReceiptGetPDF: true } });
      case "invoiceReceiptSendMail": S.faturaEmails.push(v.mailData); return out({ data: { invoiceReceiptSendMail: true } });
    }
  }
  res.statusCode = 404; out({ erro: "desconhecido " + req.url });
});
// Zoho (contas e CRM) simulado: utilizadores, eventos (COQL), contactos
// «where X between 'a' and 'b'» das leituras COQL; regista a maior janela pedida (em dias).
const entre = (q, v) => { const m = q.match(/between '([^']+)' and '([^']+)'/); if (!m) return true; Z.janela = Math.max(Z.janela || 0, (Date.parse(m[2]) - Date.parse(m[1])) / 864e5); return Date.parse(v) >= Date.parse(m[1]) && Date.parse(v) <= Date.parse(m[2]); };
const Z = { tokens: [], users: [{ id: "u1", full_name: "Luísa Pinto", email: "luisa@exemplo.pt" }], eventos: [], contactos: [], criados: [], falhaMarcacao: false, moduloTrat: false, marcacoes: [], produtos: [], prestadores: [], moduloTurnos: false, turnos: [] };
// Módulo «Tratamentos» da Agenda do Zoho (como o do SPA): tratamento, terapeuta, estado, pagamento, início e fim
const CAMPOS_TRAT = [
  { api_name: "Created_Time", field_label: "Hora de criação", data_type: "datetime" },
  { api_name: "Name", field_label: "Nome de Tratamento", data_type: "text" },
  { api_name: "Data_do_tratamento", field_label: "Data do tratamento", data_type: "datetime" },
  { api_name: "Pagamento", field_label: "Pagamento", data_type: "picklist", pick_list_values: ["-None-", "Efetuado", "Pendente", "Isento", "Faturado"].map((v) => ({ display_value: v })) },
  { api_name: "Estado", field_label: "Estado", data_type: "picklist", pick_list_values: ["-None-", "Agendado", "Realizado", "Cancelado"].map((v) => ({ display_value: v })) },
  { api_name: "Tipo_de_Tratamento", field_label: "Tipo de Tratamento", data_type: "picklist", pick_list_values: ["-None-", "Cavitação", "Vanquish"].map((v) => ({ display_value: v })) },
  { api_name: "Notas_da_Sessao", field_label: "Notas da Sessao", data_type: "textarea" },
  { api_name: "Cliente", field_label: "Cliente", data_type: "lookup", lookup: { module: { api_name: "Contacts" } } },
  { api_name: "Terapeutas", field_label: "Terapeutas", data_type: "multiselectpicklist", pick_list_values: ["Sofia Costa", "Maria Barroso"].map((v) => ({ display_value: v })) },
  { api_name: "Hora_fim_do_tratamento", field_label: "Hora fim do tratamento", data_type: "datetime" },
  { api_name: "Valor", field_label: "Valor", data_type: "currency" },
  { api_name: "Especialidade", field_label: "Especialidade", data_type: "picklist", pick_list_values: ["-None-", "Nutrição", "Laser Clinic", "Spa"].map((v) => ({ display_value: v })) },
  { api_name: "Artigo", field_label: "Artigo", data_type: "lookup", lookup: { module: { api_name: "Products" } } },
  { api_name: "Profissionais_LC", field_label: "Profissionais LC", data_type: "multiselectpicklist", pick_list_values: ["Ana Cruz", "Luísa Pinto", "Pedro Queiroz"].map((v) => ({ display_value: v })) },
  { api_name: "Preferencia_Terapeuta", field_label: "Preferência pela terapeuta", data_type: "boolean" },
  { api_name: "Origem_Marcacao", field_label: "Origem da marcação", data_type: "picklist", pick_list_values: ["-None-", "Backoffice", "Online", "Google"].map((v) => ({ display_value: v })) },
];
function zoho(req, body, j, res, out) {
  const u = new URL(req.url, B);
  if (u.pathname === "/zoho/contas/oauth/v2/token") {
    Z.tokens.push(j);
    if (j.grant_type === "authorization_code") return out(j.code === "bom" ? { access_token: "a1", refresh_token: "r1", expires_in: 3600, api_domain: `${B}/zoho/api` } : { error: "invalid_code" });
    return out({ access_token: "a2", expires_in: 3600 });
  }
  const cam = u.pathname.replace("/zoho/api/crm/v6", "");
  if (req.headers.authorization !== "Zoho-oauthtoken a1" && req.headers.authorization !== "Zoho-oauthtoken a2") { res.statusCode = 401; return out({ code: "INVALID_TOKEN" }); }
  if (cam === "/users") return out({ users: Z.users });
  if (cam === "/settings/modules") return out({ modules: [{ api_name: "Contacts", plural_label: "Contactos" }, { api_name: "Events", plural_label: "Reuniões" }, ...(Z.moduloTrat ? [{ api_name: "Tratamentos_SPA", plural_label: "Tratamentos", singular_label: "Tratamento" }] : []), { api_name: "Prestadores", plural_label: "Prestadores" }, ...(Z.moduloTurnos ? [{ api_name: "Horario_Colaborador", plural_label: "Horários de Colaborador" }] : [])] });
  if (cam === "/coql" && /from Horario_Colaborador/.test(j.select_query)) return out({ data: Z.turnos.filter((t) => j.select_query.includes(`'${t.Name}'`)), info: { more_records: false } });
  if (cam === "/settings/fields" && u.searchParams.get("module") === "Prestadores") return out({ fields: [{ api_name: "Name", field_label: "Nome de Prestador", data_type: "text" }, { api_name: "Ativo", field_label: "Ativo", data_type: "boolean" }, { api_name: "Horario_Padrao", field_label: "Horário padrão", data_type: "text" }, { api_name: "Created_Time", field_label: "Hora de criação", data_type: "datetime" }] });
  if (cam === "/Prestadores") return out({ data: Z.prestadores.map((x) => Object.fromEntries(Object.entries(x).filter(([k]) => u.searchParams.get("fields").split(",").includes(k)))), info: { more_records: false } });
  if (cam === "/settings/fields" && u.searchParams.get("module") === "Tratamentos_SPA") return out({ fields: CAMPOS_TRAT });
  if (cam === "/coql" && /from Tratamentos_SPA/.test(j.select_query)) return out({ data: Z.marcacoes.filter((m) => entre(j.select_query, m.Data_do_tratamento)), info: { more_records: false } });
  if (cam === "/Products/search") return out({ data: Z.produtos.filter((x) => x.Product_Name === u.searchParams.get("word")) });
  if (cam === "/Tratamentos_SPA" && req.method === "POST") { if (Z.falhaMarcacao) return out({ data: [{ status: "error", message: "required field not found" }] }); const m = { id: "t" + (Z.marcacoes.length + 1), ...j.data[0] }; Z.marcacoes.push(m); return out({ data: [{ status: "success", details: { id: m.id } }] }); }
  if (cam === "/settings/fields") return out({ fields: u.searchParams.get("module") === "Contacts"
    ? [{ api_name: "Last_Name", field_label: "Apelido", data_type: "text" }, { api_name: "Email", field_label: "Email", data_type: "email" }, { api_name: "Contribuinte", field_label: "N.º Contribuinte", data_type: "text" }]
    : [...["Event_Title", "Start_DateTime", "End_DateTime", "Owner", "Who_Id"].map((n) => ({ api_name: n, field_label: n, data_type: "text" }))] });
  if (cam === "/coql") return out({ data: Z.eventos.filter((e) => entre(j.select_query, e.Start_DateTime)), info: { more_records: false } });
  if (cam === "/Contacts/search") {
    const [, campo, nif] = u.searchParams.get("criteria")?.match(/\((\w+):equals:(\d+)\)/) || [], email = u.searchParams.get("email");
    const r = Z.contactos.filter((c) => (nif && c[campo] === nif) || (email && c.Email === email));
    if (!r.length) { res.statusCode = 204; return res.end(); }
    return out({ data: r });
  }
  if (cam === "/Contacts" && req.method === "POST") { const c = { id: "c" + (Z.contactos.length + 1), ...j.data[0] }; Z.contactos.push(c); Z.criados.push(c); return out({ data: [{ status: "success", details: { id: c.id } }] }); }
  if (cam === "/Contacts" && req.method === "PUT") { Object.assign(Z.contactos.find((c) => c.id === j.data[0].id), j.data[0]); return out({ data: [{ status: "success", details: { id: j.data[0].id } }] }); }
  if (cam === "/Events" && req.method === "POST") {
    const e = { id: "e" + (Z.eventos.length + 1), ...j.data[0] }; Z.eventos.push(e); return out({ data: [{ status: "success", details: { id: e.id } }] });
  }
  res.statusCode = 404; out({ erro: "zoho desconhecido " + cam });
}
await new Promise((r) => servidor.listen(PORTA, r));

const api = (await import("../netlify/functions/api.mjs")).default;
const newsFn = (await import("../netlify/functions/submission-created.mjs")).default;
const news = ({ body }) => newsFn(new Request("http://localhost/.netlify/functions/submission-created", { method: "POST", body }));
const cat = JSON.parse(fs.readFileSync(new URL("../servidor/gerado/catalogo.json", import.meta.url)));
const pedir = async (rota, dados, metodo = "POST") => {
  const r = await api(new Request("https://oms.exemplo" + rota, metodo === "POST" ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(dados) } : {}));
  return { status: r.status, j: await r.json() };
};
const notificar = (p, extra = {}) => pedir(`/api/eupago-notificacao?${new URLSearchParams({ chave_api: "demo-chave-teste", identificador: p.numero, valor: String(p.total), transacao: "t-" + p.numero, mp: "MW:PT", ...extra })}`, null, "GET");
const marcar = (d) => pedir("/api/pagamento", d);
const relax = cat.tratamentos.find((t) => t.grupo === "Relaxar"), outro = cat.tratamentos.find((t) => t.grupo !== "Relaxar");
const amanha = new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10);
const cliente = { nome: "Ana Teste", email: "ana@exemplo.pt", telefone: "912 345 678" };
const { validadeVoucher } = await import("../servidor/datas.mjs");

try {
  ok(relax.artigo === "TPREV" && outro.artigo === "TREAB" && cat.tratamentos.every((t) => t.artigo === (t.grupo === "Relaxar" ? "TPREV" : "TREAB")), "catálogo: Relaxar → TPREV, o resto → TREAB");
  ok(validadeVoucher(new Date("2026-10-22T12:00:00Z")) === "2027-10-31" && validadeVoucher(new Date("2026-02-10T12:00:00Z")) === "2027-02-28" && validadeVoucher(new Date("2026-06-30T23:30:00Z")) === "2027-07-31", "validade do voucher: fim do mês, 12 meses depois (fuso de Lisboa)");

  // 1) Marcação de fisioterapia (TREAB) por MB WAY
  let r = await marcar({ tipo: "marcacao", tratamento: outro.id, data: amanha, hora: "10:00", terapeuta: "Ana", ...cliente, metodo: "mb_way" });
  ok(r.status === 200 && r.j.estado === "aguarda_pagamento" && r.j.total === outro.preco, `marcação ${outro.nome}: MB WAY pedido por ${r.j.total} € (preço do site)`);
  ok(S.mbway[0].payment.customerPhone === "912345678" && S.mbway[0].payment.amount.value === outro.preco, "MB WAY com o telemóvel e o valor certos");
  const p1 = r.j;
  r = await pedir(`/api/pedido?n=${p1.numero}&t=errado`, null, "GET");
  ok(r.status === 404, "estado do pedido só com o token certo");
  r = await notificar({ ...p1, total: 1 });
  r = await pedir(`/api/pedido?n=${p1.numero}&t=${p1.token}`, null, "GET");
  ok(r.j.estado === "aguarda_pagamento" && !Object.keys(S.docs).length, "pagamento com valor diferente não confirma nem fatura");
  r = await pedir(`/api/eupago-notificacao?${new URLSearchParams({ chave_api: "outra", identificador: p1.numero, valor: String(p1.total) })}`, null, "GET");
  ok(r.status === 403, "notificação com chave errada é recusada");
  await notificar(p1);
  r = await pedir(`/api/pedido?n=${p1.numero}&t=${p1.token}`, null, "GET");
  ok(r.j.estado === "pago", "notificação da euPago: pedido pago");
  const d1 = Object.values(S.docs)[0];
  ok(d1.status === 1 && d1.dados.documentSetId === 7, "fatura-recibo fechada na série SPA");
  ok(d1.dados.products.length === 1 && d1.dados.products[0].productId === 101 && d1.dados.products[0].taxes.length === 0 && d1.dados.products[0].exemptionReason === "M10", "linha TREAB, sem IVA, com motivo de isenção");
  ok(d1.dados.products[0].price === outro.preco && d1.totalValue === outro.preco && d1.dados.payments[0].paymentMethodId === 3, "valor da fatura = valor pago, meio MB WAY");
  ok(d1.dados.customerId === 1, "sem NIF: Consumidor final");
  ok(S.faturaEmails[0].to.email === "ana@exemplo.pt" && S.faturaEmails[0].message.includes("terapêutica de reabilitação: " + outro.nome), "fatura enviada com o texto da terapêutica de reabilitação");
  const e1 = S.emails.find((e) => e.to[0] === "ana@exemplo.pt" && !e.subject.includes("código"));
  ok(e1 && e1.html.includes("Iniciará de seguida a sua terapêutica de reabilitação: " + esc(outro.nome)) && e1.subject.includes("Marcação confirmada"), "email de confirmação com o texto do Pedro (reabilitação)");
  ok(S.emails.some((e) => e.to[0] === cat.spa.email && e.subject.includes(p1.numero)), "aviso à equipa por email");
  await notificar(p1);
  ok(Object.keys(S.docs).length === 1, "notificação repetida não emite segunda fatura");

  // 2) Newsletter: código de 10%, usado numa massagem (TPREV) por Multibanco, com NIF
  const n1 = await news({ body: JSON.stringify({ payload: { form_name: "newsletter", data: { email: "Rui@Exemplo.pt" } } }) });
  const boas = S.emails.find((e) => e.to[0] === "rui@exemplo.pt");
  const codigo = boas?.html.match(/BEMVINDO-[A-Z0-9]{6}/)?.[0];
  ok(n1.status === 200 && codigo, `newsletter: código ${codigo} enviado por email`);
  await news({ body: JSON.stringify({ payload: { form_name: "newsletter", data: { email: "rui@exemplo.pt" } } }) });
  ok(S.emails.filter((e) => e.to[0] === "rui@exemplo.pt").length === 1, "reinscrever-se não gera outro código");
  r = await pedir("/api/preco", { tipo: "marcacao", tratamento: relax.id, codigo: codigo.toLowerCase() });
  const com10 = r2(relax.preco * 0.9);
  ok(r.j.total === com10 && r.j.codigo.tipo === "newsletter", `preço com o código: ${relax.preco} € → ${r.j.total} €`);
  r = await marcar({ tipo: "marcacao", tratamento: relax.id, data: amanha, hora: "15:00", nome: "Rui", email: "rui@exemplo.pt", telefone: "915000000", nif: "506651940", codigo, metodo: "multibanco" });
  ok(r.status === 400 && /MB WAY ou cartão/.test(r.j.erro), "marcações não se pagam por Multibanco (só MB WAY ou cartão, que confirmam na hora)");
  r = await pedir("/api/pagamento", { tipo: "voucher", tratamento: relax.id, nome: "Rui", email: "rui@exemplo.pt", nif: "506651940", codigo, metodo: "multibanco" });
  const p2 = r.j;
  ok(p2.total === com10 && p2.multibanco?.referencia === "123456789" && S.mb[0].valor === com10, "voucher por Multibanco: referência com o valor já com desconto");
  ok(S.emails.some((e) => e.to[0] === "rui@exemplo.pt" && e.subject.startsWith("Dados para pagamento") && e.html.includes("123 456 789")), "email com a referência Multibanco");
  await notificar(p2, { mp: "PC:PT" });
  const d2 = Object.values(S.docs)[1];
  ok(d2.dados.products[0].productId === 102 && d2.dados.products[0].price === com10 && d2.totalValue === com10, "fatura TPREV com o valor já com o desconto");
  ok(d2.dados.customerId === 50 && d2.dados.payments[0].paymentMethodId === 4, "com NIF: cliente criado no Moloni ON; meio Multibanco");
  r = await pedir("/api/preco", { tipo: "marcacao", tratamento: relax.id, codigo });
  ok(r.status === 400 && /já foi usado/.test(r.j.erro), "código de boas-vindas só serve uma vez");

  // 3) Código VIP: massagem a 0 €, sem pagamento nem fatura
  const docsAntes = Object.keys(S.docs).length, eupagoAntes = S.mb.length + S.mbway.length + S.cartao.length;
  r = await marcar({ tipo: "marcacao", tratamento: relax.id, data: amanha, hora: "11:00", nome: "Cliente VIP", email: "vip@exemplo.pt", telefone: "915000001", codigo: " vip " });
  ok(r.j.estado === "confirmado" && r.j.total === 0, "código VIP: marcação confirmada a 0 €");
  ok(Object.keys(S.docs).length === docsAntes && S.mb.length + S.mbway.length + S.cartao.length === eupagoAntes, "VIP: sem pagamento na euPago e sem fatura");
  ok(S.emails.some((e) => e.to[0] === "vip@exemplo.pt" && e.html.includes("terapêutica de prevenção") && e.html.includes("Sem custos")), "VIP: email de confirmação na mesma");
  r = await pedir("/api/preco", { tipo: "voucher", tratamento: relax.id, codigo: "VIP" });
  ok(r.status === 400, "VIP não serve para comprar vouchers");

  // 4) Voucher oferta: pago por cartão, código só no email, depois usado numa marcação
  r = await pedir("/api/pagamento", { tipo: "voucher", tratamento: relax.id, para: "Maria", de: "João", mensagem: "Para parares.", nome: "João", email: "joao@exemplo.pt", metodo: "card" });
  const p4 = r.j;
  ok(p4.url === "https://pagar.exemplo/cc1" && S.cartao[0].payment.amount.value === relax.preco && S.cartao[0].payment.successUrl.includes(`/pagamento/?n=${p4.numero}`), "voucher: segue para o pagamento com cartão e volta à página do pedido");
  await notificar(p4, { mp: "CC:PT" });
  const ev = S.emails.find((e) => e.to[0] === "joao@exemplo.pt" && e.subject.startsWith("O seu voucher"));
  const vcod = ev?.html.match(/OMS-[A-Z0-9]{4}-[A-Z0-9]{4}/)?.[0];
  ok(vcod && ev.html.includes("Válido até") && ev.html.includes(validadeVoucher().slice(0, 4)), `voucher: código ${vcod} e validade só no email`);
  ok(S.emails.some((e) => e.subject.includes(p4.numero) && e.html.includes("Digital, por email")), "voucher digital: a equipa vê a entrega por email");
  r = await pedir(`/api/pedido?n=${p4.numero}&t=${p4.token}`, null, "GET");
  ok(r.j.estado === "pago" && !JSON.stringify(r.j).includes(vcod), "a página do pedido não mostra o código do voucher");
  const d4 = Object.values(S.docs).at(-1);
  ok(d4.dados.products[0].name.startsWith("Voucher oferta") && d4.dados.products[0].productId === 102 && d4.dados.payments[0].paymentMethodId === 2, "fatura do voucher: TPREV, meio Cartão");
  r = await pedir("/api/preco", { tipo: "marcacao", tratamento: outro.id, codigo: vcod });
  ok(r.status === 400 && r.j.erro.includes(relax.nome), "voucher só para o tratamento dele");
  const docs5 = Object.keys(S.docs).length;
  r = await marcar({ tipo: "marcacao", tratamento: relax.id, data: amanha, hora: "17:00", nome: "Maria", email: "maria@exemplo.pt", telefone: "915000002", codigo: vcod });
  ok(r.j.estado === "confirmado" && r.j.total === 0 && Object.keys(S.docs).length === docs5, "marcação com o voucher: 0 €, sem segunda fatura");
  r = await pedir("/api/preco", { tipo: "marcacao", tratamento: relax.id, codigo: vcod });
  ok(r.status === 400 && /já foi usado/.test(r.j.erro), "voucher só serve uma vez");

  // 4b) Voucher em caixa oferta: mesmo preço, levantamento no spa
  const cartoes = S.cartao.length;
  r = await pedir("/api/pagamento", { tipo: "voucher", tratamento: relax.id, formato: "caixa", para: "Ana", nome: "Rui", email: "rui@exemplo.pt", metodo: "card" });
  ok(S.cartao.length === cartoes + 1 && S.cartao.at(-1).payment.amount.value === relax.preco, "caixa oferta: sem custo extra");
  await notificar(r.j, { mp: "CC:PT" });
  ok(S.emails.some((e) => e.to[0] === "rui@exemplo.pt" && e.subject.startsWith("O seu voucher") && e.html.includes("levantá-la no spa") && /OMS-[A-Z0-9]{4}-[A-Z0-9]{4}/.test(e.html)), "caixa oferta: código por email e aviso para levantar no spa");
  ok(S.emails.some((e) => e.subject.includes(r.j.numero) && e.html.includes("Caixa oferta, levanta no SPA")), "caixa oferta: a equipa é avisada para preparar a caixa");

  // 4c) Site em inglês (/en/): voucher, erros e emails em inglês; fatura e aviso à equipa em português
  await news({ body: JSON.stringify({ payload: { form_name: "newsletter", data: { email: "kim@exemplo.co.uk", lingua: "en" } } }) });
  ok(S.emails.some((e) => e.to[0] === "kim@exemplo.co.uk" && e.subject.startsWith("Your 10% code") && e.html.includes("/en/#reservar")), "inglês: newsletter subscrita em /en/ recebe o código em inglês");
  r = await pedir("/api/pagamento?lingua=en", { tipo: "voucher", tratamento: relax.id, formato: "caixa", para: "Sam", nome: "Jo Smith", email: "jo@exemplo.co.uk", metodo: "card" });
  ok(S.cartao.at(-1).payment.lang === "EN" && S.cartao.at(-1).payment.successUrl.includes(`/en/payment/?n=${r.j.numero}`) && r.j.tratamento === relax.nome_en, "inglês: cartão da euPago em inglês e regresso a /en/payment/");
  await notificar(r.j, { mp: "CC:PT" });
  const ven = S.emails.find((e) => e.to[0] === "jo@exemplo.co.uk");
  ok(ven && ven.subject === `Your gift voucher · ${relax.nome_en}` && ven.html.includes("Valid until") && ven.html.includes("Gift box") && ven.html.includes("/en/#reservar") && !/Válido até/.test(ven.html), "inglês: email do voucher em inglês, com a caixa oferta");
  ok(S.emails.some((e) => e.subject.includes(r.j.numero) && e.to[0] === cat.spa.email && e.html.includes("Caixa oferta, levanta no SPA") && e.html.includes("Inglês")), "inglês: aviso à equipa em português, com a língua do cliente");
  r = await pedir("/api/pagamento?lingua=en", { tipo: "marcacao", tratamento: outro.id, data: amanha, hora: "10:00", ...cliente, telefone: "", metodo: "card" });
  ok(r.status === 400 && r.j.erro === "Please enter your mobile number.", "inglês: erros em inglês");
  r = await pedir("/api/preco?lingua=en", { tipo: "marcacao", tratamento: relax.id, codigo: "NAO-EXISTE" });
  ok(r.status === 400 && r.j.erro === "This code isn’t valid.", "inglês: código inválido explicado em inglês");

  // 5) Validações
  r = await marcar({ tipo: "marcacao", tratamento: "nao-existe", data: amanha, hora: "10:00", ...cliente, metodo: "card" });
  ok(r.status === 400, "tratamento desconhecido é recusado");
  r = await marcar({ tipo: "marcacao", tratamento: outro.id, data: amanha, hora: "10:00", ...cliente, telefone: "123", metodo: "mb_way" });
  ok(r.status === 400 && /telemóvel/.test(r.j.erro), "MB WAY sem telemóvel válido é recusado");
  r = await marcar({ tipo: "marcacao", tratamento: outro.id, data: amanha, hora: "10:00", ...cliente, nif: "123456788", metodo: "card" });
  ok(r.status === 400 && /NIF/.test(r.j.erro), "NIF inválido é recusado");
  // Dados obrigatórios nas marcações: nome, email e telemóvel; o NIF é opcional
  r = await marcar({ tipo: "marcacao", tratamento: outro.id, data: amanha, hora: "10:00", ...cliente, telefone: "", metodo: "card" });
  ok(r.status === 400 && /telemóvel/.test(r.j.erro), "marcação sem telemóvel é recusada");
  r = await marcar({ tipo: "marcacao", tratamento: outro.id, data: amanha, hora: "09:00", ...cliente, metodo: "card" });
  ok(r.status === 200, "marcação sem NIF é aceite (o NIF só serve para a fatura)");
  r = await marcar({ tipo: "marcacao", tratamento: outro.id, data: "2020-01-01", hora: "10:00", ...cliente, metodo: "card" });
  ok(r.status === 400, "dia no passado é recusado");

  // 6) Artigo sem isenção no Moloni ON: a fatura fica por emitir com o erro guardado
  S.artigos.TREAB = null;
  r = await marcar({ tipo: "marcacao", tratamento: outro.id, data: amanha, hora: "12:00", ...cliente, metodo: "mb_way" });
  await notificar(r.j);
  const { obter } = await import("../servidor/pedidos.mjs");
  const p6 = await obter(r.j.numero);
  ok(p6.estado === "pago" && !p6.fatura && /isenção/.test(p6.moloni.erro) && S.emails.some((e) => e.subject.includes(p6.numero) && e.html.includes("isenção")), "artigo sem motivo de isenção: pago, sem fatura, e a equipa é avisada do erro");

  // 7) euPago em modo de teste: a fatura fica só em rascunho
  S.artigos.TREAB = "M10";
  process.env.EUPAGO_MODO = "teste";
  r = await marcar({ tipo: "marcacao", tratamento: outro.id, data: amanha, hora: "13:00", ...cliente, metodo: "mb_way" });
  await notificar(r.j);
  ok(Object.values(S.docs).at(-1).status === 0, "modo de teste: só rascunho no Moloni ON");

  // 8) Campanha de vouchers: preço de campanha só entre as datas, sem códigos, com limite de vendas
  const CAT = (await import("../servidor/gerado/catalogo.json", { with: { type: "json" } })).default;
  const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Lisbon" });
  CAT.campanhas = [...(CAT.campanhas || []),
    { id: "teste-ja", nome: "Teste · " + relax.nome, tratamento: relax.id, preco: 11, preco_antigo: relax.preco, duracao: 45, inicio: hoje, fim: hoje, limite: 1 },
    { id: "teste-futura", nome: "Futura", tratamento: relax.id, preco: 9, duracao: 45, inicio: "2099-01-01", fim: "2099-01-31", limite: 0 }];
  r = await pedir("/api/preco", { tipo: "voucher", tratamento: relax.id, campanha: "teste-ja" });
  ok(r.j.total === 11, "voucher de campanha ao preço de campanha");
  r = await pedir("/api/preco", { tipo: "voucher", tratamento: relax.id, campanha: "teste-futura" });
  ok(r.status === 400 && /vigor/.test(r.j.erro), "campanha fora das datas é recusada");
  r = await pedir("/api/preco", { tipo: "marcacao", tratamento: relax.id, campanha: "teste-ja" });
  ok(r.status === 400 && /vouchers/.test(r.j.erro), "preço de campanha de vouchers não vale para marcações");
  r = await pedir("/api/preco", { tipo: "voucher", tratamento: relax.id, campanha: "teste-ja", codigo });
  ok(r.status === 400 && /acumulam/.test(r.j.erro), "campanha não acumula com códigos");
  r = await pedir("/api/pagamento", { tipo: "voucher", tratamento: relax.id, campanha: "teste-ja", nome: "Eva", email: "eva@exemplo.pt", metodo: "mb_way", telemovel: "912345678" });
  ok(r.j.total === 11, "voucher de campanha pedido por 11 €");
  await notificar(r.j);
  const evc = S.emails.find((e) => e.to[0] === "eva@exemplo.pt" && e.subject.includes("voucher"));
  ok(evc && evc.html.includes("45 minutos") && evc.html.includes("Teste"), "email do voucher com a duração e a campanha");
  ok(Object.values(S.docs).at(-1).dados.products[0].price === 11, "fatura com o preço de campanha");
  r = await pedir("/api/preco", { tipo: "voucher", tratamento: relax.id, campanha: "teste-ja" });
  ok(r.status === 400 && /esgotaram/.test(r.j.erro), "depois do limite, a campanha esgota");

  // 9) Agenda no Zoho CRM
  const { lerHorario, trabalha } = await import("../servidor/horario.mjs");
  let h = lerHorario("seg-sex 12:30-20:00; sab 09:00-13:00 quinzenal 14-11-2026").regras;
  ok(!trabalha(h, "2026-11-02", "12:00", 60) && trabalha(h, "2026-11-02", "19:00", 60) && !trabalha(h, "2026-11-02", "19:00", 90), "horário padrão: de segunda a sexta das 12:30 às 20:00, o tratamento tem de caber até ao fim");
  ok(trabalha(h, "2026-11-14", "09:00", 60) && !trabalha(h, "2026-11-21", "09:00", 60) && trabalha(h, "2026-11-28", "12:00", 60) && !trabalha(h, "2026-11-28", "12:30", 60) && !trabalha(h, "2026-11-15", "09:00", 60), "sábado quinzenal: sábado sim, sábado não, a contar de 14/11/2026");
  h = lerHorario("qui-sex 14:30-20:00; blá");
  ok(h.regras.length === 1 && !trabalha(h.regras, "2026-11-04", "15:00", 60) && trabalha(h.regras, "2026-11-05", "15:00", 60) && h.erros[0] === "blá", "dias da semana escolhidos e partes ilegíveis assinaladas");
  r = await pedir("/api/disponibilidade?tratamento=" + outro.id, null, "GET");
  ok(r.j.fonte === "simulada", "sem Zoho ligado, a agenda fica simulada");
  Object.assign(process.env, { ZOHO_CLIENT_ID: "cid", ZOHO_CLIENT_SECRET: "seg", ZOHO_ACCOUNTS_BASE: `${B}/zoho/contas`, BACKOFFICE_PASSWORD: "senha-certa" });
  const pagina = async (rota, init) => { const x = await api(new Request("https://oms.exemplo" + rota, init)); return { status: x.status, local: x.headers.get("location"), txt: await x.text() }; };
  let pg = await pagina("/api/zoho/ligar");
  ok(pg.status === 200 && pg.txt.includes("Palavra-passe"), "página para ligar ao Zoho pede a palavra-passe");
  const form = (senha) => ({ method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "senha=" + senha });
  pg = await pagina("/api/zoho/ligar", form("errada"));
  ok(pg.status === 401, "palavra-passe errada não liga");
  pg = await pagina("/api/zoho/ligar", form("senha-certa"));
  const aut = new URL(pg.local);
  ok(pg.status === 302 && aut.origin + aut.pathname === `${B}/zoho/contas/oauth/v2/auth` && aut.searchParams.get("redirect_uri") === "https://oms.exemplo/api/zoho/retorno" && aut.searchParams.get("access_type") === "offline", "com a palavra-passe, segue para a autorização no Zoho");
  pg = await pagina("/api/zoho/retorno?code=bom&state=inventado");
  ok(pg.status === 400, "regresso com state desconhecido é recusado");
  pg = await pagina(`/api/zoho/retorno?code=bom&state=${aut.searchParams.get("state")}`);
  ok(pg.status === 200 && pg.txt.includes("ligado") && Z.tokens.at(-1).redirect_uri === "https://oms.exemplo/api/zoho/retorno", "regresso do Zoho guarda a ligação");
  pg = await pagina(`/api/zoho/retorno?code=bom&state=${aut.searchParams.get("state")}`);
  ok(pg.status === 400, "o mesmo state não serve duas vezes");

  // Horário da Luísa no módulo Prestadores: dias úteis 8:00–20:00 e sábados quinzenais (o primeiro sábado daqui a 3+ dias é de trabalho)
  let sab = new Date(Date.now() + 3 * 864e5); while (sab.getUTCDay() !== 6) sab = new Date(sab.getTime() + 864e5);
  const S6 = sab.toISOString().slice(0, 10), S13 = new Date(sab.getTime() + 7 * 864e5).toISOString().slice(0, 10);
  Z.prestadores.push({ Name: "Luísa Pinto", Ativo: true, Horario_Padrao: `seg-sex 08:00-20:00; sab 09:00-13:00 quinzenal ${S6.split("-").reverse().join("-")}`, Created_Time: "x" });
  pg = await pagina("/api/zoho/verificar", form("errada"));
  ok(pg.status === 401, "verificação do CRM pede a palavra-passe");
  pg = await pagina("/api/zoho/verificar", form("senha-certa"));
  ok(pg.status === 200 && pg.txt.includes("✓ Campo do NIF") && pg.txt.includes("Contribuinte") && pg.txt.includes("✓ Reuniões (Events)") && pg.txt.includes("✗ Módulo das marcações (Tratamentos)") && pg.txt.includes("não entram no Zoho"), "verificação pelos metadados: campo do NIF, Reuniões e falta do módulo Tratamentos");
  ok(pg.txt.includes("✓ Prestadores (Prestadores): horário") && pg.txt.includes("Horario_Padrao") && pg.txt.includes("seg–sex 08:00–20:00 · sáb 09:00–13:00 (quinzenal") && pg.txt.includes("✗ Prestadores: Beatriz Pena") && pg.txt.includes("Sem registo com este nome"), "verificação mostra o horário de cada colaboradora lido do módulo Prestadores");

  // Dia útil daqui a 3+ dias
  let dia = new Date(Date.now() + 3 * 864e5); while ([0, 6].includes(dia.getUTCDay())) dia = new Date(dia.getTime() + 864e5);
  const D = dia.toISOString().slice(0, 10);
  const { instanteLisboa } = await import("../servidor/datas.mjs");
  const luisa = cat.equipa.find((p) => p.nome === "Luísa Pinto");
  const tz = cat.tratamentos.find((t) => luisa.faz.includes(t.id) && t.duracao <= 60 && t.grupo !== "Relaxar") || cat.tratamentos.find((t) => luisa.faz.includes(t.id) && t.duracao <= 60);
  r = await pedir(`/api/disponibilidade?tratamento=${tz.id}&de=${D}&dias=1`, null, "GET");
  ok(r.j.fonte === "simulada" && /Tratamentos/.test(r.j.aviso), "sem módulo Tratamentos a agenda do site fica simulada");

  // Módulo «Tratamentos» (como o do SPA). Sem campo de data não está pronto; a hora de criação nunca serve de início.
  Z.moduloTrat = true;
  const semData = CAMPOS_TRAT.splice(2, 1);
  pg = await pagina("/api/zoho/verificar", form("senha-certa"));
  ok(pg.txt.includes("✗ Módulo das marcações (Tratamentos)") && !/Início<\/b><br><span class="nota">«Hora de criação/.test(pg.txt), "sem data do tratamento o módulo não está pronto; a hora de criação nunca é o início");
  CAMPOS_TRAT.splice(2, 0, ...semData);
  Z.produtos.push({ id: "p1", Product_Name: tz.nome });
  pg = await pagina("/api/zoho/verificar", form("senha-certa"));
  ok(pg.txt.includes("✓ Módulo das marcações (Tratamentos)") && pg.txt.includes("«Data do tratamento» (Data_do_tratamento") && pg.txt.includes("«Hora fim do tratamento»") && pg.txt.includes("Profissionais_LC") && pg.txt.includes("«Notas da Sessao»"), "verificação liga início, fim, terapeuta (várias listas) e notas aos campos certos");
  ok(pg.txt.includes("terapeutas sem nome nas listas") && pg.txt.includes("Beatriz Pena"), "verificação diz que terapeutas do site faltam nas listas do Zoho");

  // Horas ocupadas: evento da Luísa (utilizadora u1) às 10:00, marcação no módulo às 19:00 e uma cancelada às 08:00
  Z.eventos.push({ Owner: { id: "u1" }, Start_DateTime: instanteLisboa(D, "10:00").iso, End_DateTime: instanteLisboa(D, "11:00").iso, All_day: false });
  Z.marcacoes.push({ id: "t0", Terapeutas: ["Sofia Costa"], Profissionais_LC: ["Luísa Pinto"], Estado: "Agendado", Data_do_tratamento: instanteLisboa(D, "19:00").iso, Hora_fim_do_tratamento: instanteLisboa(D, "20:00").iso },
    { id: "tc", Profissionais_LC: ["Luísa Pinto"], Estado: "Cancelado", Data_do_tratamento: instanteLisboa(D, "08:00").iso, Hora_fim_do_tratamento: instanteLisboa(D, "09:00").iso });
  r = await pedir(`/api/disponibilidade?tratamento=${tz.id}&de=${D}&dias=1`, null, "GET");
  const livresL = r.j.livres?.[luisa.id]?.[D] || [];
  ok(r.j.fonte === "zoho" && !livresL.includes("10:00") && !livresL.includes("19:00") && livresL.includes("11:00") && livresL.includes("08:00"), `horas livres vêm das marcações do Zoho (${livresL.length} livres; 10:00 e 19:00 ocupadas, a cancelada não conta)`);
  Z.janela = 0;
  const r14 = await pedir(`/api/disponibilidade?tratamento=${tz.id}&de=${D}&dias=14`, null, "GET");
  ok(r14.j.fonte === "zoho" && Z.janela > 0 && Z.janela < 1 && !r14.j.livres[luisa.id][D].includes("10:00"), "a agenda do Zoho lê-se dia a dia, mesmo para 14 dias (sem páginas que saltem marcações)");
  ok(livresL.includes("11:30") && !livresL.includes("10:30") && livresL.includes("08:30") === (tz.duracao <= 90) && !livresL.includes(`${String(19 - Math.ceil(tz.duracao / 60) + 1).padStart(2, "0")}:30`) && !livresL.includes("19:30"), "marca-se às meias horas, desde que o tratamento caiba antes da marcação seguinte e do fecho");
  pg = await pagina("/api/zoho/verificar", { ...form("senha-certa"), body: "senha=senha-certa&dia=" + D });
  ok(pg.txt.includes("Lido do Zoho para") && pg.txt.includes("10:00–11:00 · Reuniões") && pg.txt.includes("19:00–20:00 · Tratamentos") && pg.txt.includes("Cancelado (não conta)") && pg.txt.includes("Turnos: módulos") && /<b>Luísa Pinto<\/b>: [^<]*11:00/.test(pg.txt), "verificação mostra um dia da agenda: o que leu do Zoho e as horas livres de cada pessoa");
  ok(Object.keys(r.j.livres).length === 1 && r.j.semAgenda.length >= 1, "quem não está nas listas de profissionais fica fora da agenda online");
  r = await pedir(`/api/disponibilidade?tratamento=${tz.id}&de=${S6}&dias=8`, null, "GET");
  ok(!r.j.livres[luisa.id][S6].includes("08:00") && r.j.livres[luisa.id][S6].includes("09:00") && !r.j.livres[luisa.id][S6].includes("14:00"), "ao sábado abre às 9:00 e fecha à tarde");
  ok(!r.j.livres[luisa.id][S13].length, "no sábado em que não trabalha (horário quinzenal do Prestadores) não há horas livres");
  const zc = { nome: "Carla Nova", email: "carla@exemplo.pt", telefone: "913000000", nif: "123456789" };
  r = await marcar({ tipo: "marcacao", tratamento: tz.id, data: D, hora: "10:00", terapeutaId: luisa.id, ...zc, metodo: "mb_way" });
  ok(r.status === 400 && /ocupada/.test(r.j.erro), "hora ocupada no Zoho é recusada antes de pagar");
  r = await marcar({ tipo: "marcacao", tratamento: tz.id, data: D, hora: "11:00", qualquer: true, ...zc, metodo: "mb_way" });
  ok(r.status === 200 && r.j.marcacao.terapeuta === "Luísa Pinto" && !("zohoDono" in r.j.marcacao), "«Sem preferência» fica com quem está livre no Zoho");
  const guardada = r.j;
  r = await marcar({ tipo: "marcacao", tratamento: tz.id, data: D, hora: "11:00", qualquer: true, nome: "Outra Pessoa", email: "outra@exemplo.pt", telefone: "916000000", nif: "506651940", metodo: "mb_way" });
  ok(r.status === 400 && /ocupada/.test(r.j.erro), "enquanto o MB WAY não chega, a hora fica guardada para quem a escolheu");
  r = await pedir(`/api/disponibilidade?tratamento=${tz.id}&de=${D}&dias=1`, null, "GET");
  ok(!r.j.livres[luisa.id][D].includes("11:00"), "a hora guardada não aparece livre no site");
  r = { j: guardada };
  const nEv0 = Z.eventos.length;
  await notificar(r.j);
  const mz = Z.marcacoes.at(-1);
  ok(Z.criados.length === 1 && Z.criados[0].Contribuinte === "123456789" && Z.criados[0].Email === "carla@exemplo.pt" && Z.criados[0].Last_Name === "Nova", "cliente novo: ficha criada no CRM com o NIF (no campo encontrado na verificação)");
  ok(Z.eventos.length === nEv0 && mz.Name === tz.nome && mz.Artigo.id === "p1" && !mz.Terapeutas && mz.Profissionais_LC[0] === "Luísa Pinto" && mz.Estado === "Agendado" && mz.Pagamento === "Efetuado"
    && mz.Especialidade === "Spa" && mz.Valor === tz.preco && mz.Preferencia_Terapeuta === false && mz.Origem_Marcacao === "Online" && !("Created_Time" in mz) && mz.Cliente.id === Z.criados[0].id
    && mz.Data_do_tratamento === instanteLisboa(D, "11:00").iso && mz.Hora_fim_do_tratamento === instanteLisboa(D, "11:00", tz.duracao).iso && mz.Notas_da_Sessao.startsWith(r.j.numero + " · Origem online"), "marcação paga criada só no módulo Tratamentos, nos campos do SPA (nome, artigo, profissional, estado, pagamento, especialidade, valor, notas)");
  ok(S.emails.some((e) => e.subject.includes(r.j.numero) && e.to[0] === cat.spa.email && e.html.includes("ficha de cliente nova")), "aviso à equipa diz que ficou na agenda");
  r = await marcar({ tipo: "marcacao", tratamento: tz.id, data: D, hora: "11:00", qualquer: true, ...zc, metodo: "mb_way" });
  ok(r.status === 400 && /ocupada/.test(r.j.erro), "a mesma hora já não se pode marcar");
  r = await marcar({ tipo: "marcacao", tratamento: tz.id, data: D, hora: "15:00", terapeutaId: luisa.id, ...zc, email: "carla.outro@exemplo.pt", metodo: "mb_way" });
  await notificar(r.j);
  ok(Z.criados.length === 1 && Z.marcacoes.at(-1).Cliente.id === Z.criados[0].id && Z.marcacoes.at(-1).Notas_da_Sessao.includes("diferente") && Z.marcacoes.at(-1).Preferencia_Terapeuta === true, "cliente existente reconhecido pelo NIF: sem ficha duplicada, com nota do email diferente; terapeuta escolhida fica como preferência");
  Z.contactos.push({ id: "c-antigo", Last_Name: "Antiga", Email: "antiga@exemplo.pt" });
  r = await marcar({ tipo: "marcacao", tratamento: tz.id, data: D, hora: "16:00", qualquer: true, nome: "Rita Antiga", email: "antiga@exemplo.pt", telefone: "914000000", nif: "506651940", metodo: "mb_way" });
  await notificar(r.j);
  ok(Z.criados.length === 1 && Z.contactos.find((c) => c.id === "c-antigo").Contribuinte === "506651940" && Z.marcacoes.at(-1).Cliente.id === "c-antigo", "ficha sem NIF encontrada pelo email recebe o NIF");
  Z.falhaMarcacao = true;
  r = await marcar({ tipo: "marcacao", tratamento: tz.id, data: D, hora: "17:00", qualquer: true, ...zc, metodo: "mb_way" });
  await notificar(r.j);
  const pz = await obter(r.j.numero);
  ok(pz.estado === "pago" && /required/.test(pz.zoho.erro) && S.emails.some((e) => e.subject.includes(pz.numero) && e.html.includes("Marcar à mão")), "falha no CRM não trava o pagamento e a equipa é avisada");
  const avisoZ = S.emails.find((e) => e.subject.includes(pz.numero) && e.to[0] === "reservas@oportomedicalspa.com");
  ok(avisoZ && avisoZ.html.includes("✗ Não ficou na agenda Zoho") && avisoZ.html.includes("✓ euPago OK") && avisoZ.html.includes("Moloni") && avisoZ.html.includes("✓ Email ao cliente enviado"), "email para reservas@ com o estado: agenda, euPago, Moloni e email ao cliente");
  pg = await pagina("/api/reservas");
  ok(pg.status === 200 && pg.txt.includes("Palavra-passe") && !pg.txt.includes(pz.numero), "página de reservas pede a palavra-passe");
  process.env.BACKOFFICE_GITHUB_TOKEN = "github_pat_sessao";
  pg = await pagina("/api/reservas", form("github_pat_sessao"));
  ok(pg.txt.includes(pz.numero), "com a sessão do backoffice aberta, a página de reservas entra sem pedir a palavra-passe");
  delete process.env.BACKOFFICE_GITHUB_TOKEN;
  pg = await pagina("/api/reservas", form("github_pat_sessao"));
  ok(!pg.txt.includes(pz.numero), "sem a chave do backoffice definida, essa chave não serve de palavra-passe");
  pg = await pagina("/api/reservas", form("senha-certa"));
  ok(pg.txt.includes(pz.numero) && pg.txt.includes("Carla Nova") && pg.txt.includes("913000000") && pg.txt.includes("✗ Não ficou na agenda Zoho") && pg.txt.includes("✓ euPago OK") && /\d+ com erro/.test(pg.txt), "página de reservas: cliente, contactos, estado de cada passo e erros à vista");
  pg = await pagina("/api/zoho/verificar", form("senha-certa"));
  ok(pg.txt.includes("Últimas marcações") && pg.txt.includes(pz.numero) && pg.txt.includes("Pôr na agenda"), "verificação mostra as últimas marcações e a que não ficou na agenda");
  Z.falhaMarcacao = false;
  const nM = Z.marcacoes.length;
  pg = await pagina("/api/zoho/verificar", { ...form("senha-certa"), body: "senha=senha-certa&repetir=" + pz.numero });
  ok(pg.txt.includes("✓ " + pz.numero) && Z.marcacoes.length === nM + 1 && (await obter(pz.numero)).zoho.evento, "«Pôr na agenda» volta a criar a marcação no Zoho");
  pg = await pagina("/api/zoho/verificar", { ...form("senha-certa"), body: "senha=senha-certa&repetir=" + pz.numero });
  ok(Z.marcacoes.length === nM + 1, "não duplica a marcação se já está na agenda");
  r = await marcar({ tipo: "marcacao", tratamento: tz.id, data: D, hora: "18:00", qualquer: true, ...zc, codigo: "VIP" });
  ok(r.j.estado === "confirmado" && Z.marcacoes.at(-1).Pagamento === "Isento", "marcação com código VIP fica com Pagamento = Isento");

  // Turnos do dia (Horários de Colaborador): só se marca dentro de um turno; «-» ou sem registo = horário padrão
  const mais = (d, n) => new Date(Date.parse(d + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
  const D2 = mais(D, 7), D3 = mais(D, 14), D4 = mais(D, 21);
  Z.moduloTurnos = true;
  Z.turnos.push({ Name: `${D2}|Luísa Pinto`, Periodos: "09:00-11:00, 15:00-18:00" }, { Name: `${D3}|Luísa Pinto`, Periodos: "-" });
  r = await pedir(`/api/disponibilidade?tratamento=${tz.id}&de=${D2}&dias=1`, null, "GET");
  const lt = r.j.livres[luisa.id][D2];
  ok(lt.includes("09:00") && lt.includes("15:00") && !lt.includes("08:00") && !lt.includes("12:00") && !lt.includes("18:00") && !lt.includes(tz.duracao > 60 ? "10:30" : "11:00"), `só há horas dentro dos turnos do dia (${lt.join(", ")})`);
  r = await pedir(`/api/disponibilidade?tratamento=${tz.id}&de=${D3}&dias=1`, null, "GET");
  const r4 = await pedir(`/api/disponibilidade?tratamento=${tz.id}&de=${D4}&dias=1`, null, "GET");
  ok(r.j.livres[luisa.id][D3].includes("08:00") && r.j.livres[luisa.id][D3].includes("18:00"), "com «-» nesse dia, vale o horário padrão do Prestadores");
  ok(r4.j.livres[luisa.id][D4].includes("08:00") && r4.j.livres[luisa.id][D4].includes("18:00"), "sem registo nesse dia, vale o horário padrão do Prestadores");
  r = await marcar({ tipo: "marcacao", tratamento: tz.id, data: D2, hora: "12:00", terapeutaId: luisa.id, ...zc, metodo: "mb_way" });
  ok(r.status === 400, "uma hora fora dos turnos é recusada antes de pagar, mesmo sem outra marcação");
  pg = await pagina("/api/zoho/verificar", { ...form("senha-certa"), body: "senha=senha-certa&dia=" + D2 });
  ok(pg.txt.includes("turnos: 09:00-11:00, 15:00-18:00"), "a verificação mostra os turnos de cada pessoa no dia");

  console.log("\nTudo certo.");
} finally {
  servidor.close();
}
