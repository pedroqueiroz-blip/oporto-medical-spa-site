// Entrada no backoffice (/admin) com a palavra-passe da equipa, sem conta GitHub.
// O botão "Entrar" do /admin abre esta janela; com a palavra-passe certa, entrega ao backoffice
// a chave do GitHub guardada no Netlify, só para o próprio site, e a janela fecha.
// Variáveis no Netlify (marcadas como secretas):
//   BACKOFFICE_PASSWORD      palavra-passe da equipa
//   BACKOFFICE_GITHUB_TOKEN  chave fine-grained do GitHub, só deste repositório, com Contents e Pull requests em leitura e escrita
// Sem as duas, continua a entrada com conta GitHub pelo Netlify, como antes.
import { createHash, timingSafeEqual } from "node:crypto";

export const config = { path: "/admin-entrar" };

const pausa = (ms) => new Promise((r) => setTimeout(r, ms)); // trava tentativas em série
const resumo = (t) => createHash("sha256").update(String(t)).digest();
const certa = (dada, guardada) => timingSafeEqual(resumo(dada), resumo(guardada));

const pagina = (corpo, status = 200) => new Response(`<!doctype html>
<html lang="pt"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Entrar no backoffice</title>
<style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0D0A08;color:#E8DCC8;font:15px/1.5 Manrope,system-ui,sans-serif}
  form,.msg{width:min(320px,calc(100vw - 32px));text-align:center}
  img{width:150px;margin-bottom:26px}
  input{box-sizing:border-box;width:100%;padding:12px 14px;border:1px solid rgba(232,220,200,.3);border-radius:4px;background:transparent;color:inherit;font:inherit}
  button{margin-top:14px;width:100%;padding:12px;border:0;border-radius:999px;background:#E8DCC8;color:#0D0A08;font:600 12px Manrope,system-ui,sans-serif;letter-spacing:.14em;text-transform:uppercase;cursor:pointer}
  .erro{color:#E0A58C;font-size:13px;margin:10px 0 0}
</style></head><body>${corpo}</body></html>`, {
  status,
  headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Frame-Options": "DENY", "Referrer-Policy": "no-referrer" }
});

const formulario = (erro = "") => pagina(`<form method="post">
  <img src="/logo-beige.svg" alt="Oporto Medical Spa">
  <input type="password" name="senha" placeholder="Palavra-passe" autocomplete="current-password" autofocus required>
  ${erro ? `<p class="erro">${erro}</p>` : ""}
  <button type="submit">Entrar</button>
</form>`, erro ? 401 : 200);

// Protocolo do Decap: a janela anuncia-se, o backoffice responde e só então recebe a chave,
// e apenas se a resposta vier do próprio site (mesma origem desta janela).
const entregar = (token) => pagina(`<p class="msg">A entrar…</p>
<script>
  (function () {
    var dados = ${JSON.stringify(JSON.stringify({ token, provider: "github" }))};
    if (!window.opener) { document.querySelector(".msg").textContent = "Abra esta página a partir do botão Entrar em /admin."; return; }
    window.addEventListener("message", function (e) {
      if (e.origin !== location.origin || e.data !== "authorizing:github") return;
      window.opener.postMessage("authorization:github:success:" + dados, location.origin);
      setTimeout(function () { window.close(); }, 300);
    });
    window.opener.postMessage("authorizing:github", location.origin);
  })();
</script>`);

export default async (req) => {
  const senha = process.env.BACKOFFICE_PASSWORD;
  const token = process.env.BACKOFFICE_GITHUB_TOKEN;
  const url = new URL(req.url);

  // Sem palavra-passe configurada: entrada com conta GitHub pelo Netlify, como antes.
  if (!senha || !token) return Response.redirect("https://api.netlify.com/auth" + url.search, 302);

  if (req.method === "POST") {
    const dada = new URLSearchParams(await req.text()).get("senha") || "";
    if (dada && certa(dada, senha)) return entregar(token);
    await pausa(1500);
    return formulario("Palavra-passe errada.");
  }
  return formulario();
};
