// Corre sozinha no fim de cada publicação no Netlify.
// Com o site visível no Google, avisa o IndexNow (Bing, Copilot, pesquisa do ChatGPT) de que as páginas mudaram,
// para os motores e os assistentes de IA lerem os preços e as campanhas novas sem esperar pela visita seguinte.
// O Google não aceita estes avisos: lê o sitemap.xml sozinho.
import catalogo from "../../servidor/gerado/catalogo.json" with { type: "json" };

export const handler = async (event) => {
  const { payload } = JSON.parse(event.body || "{}");
  const seo = catalogo.seo;
  if (payload?.context !== "production" || !seo?.indexar) return { statusCode: 200, body: "ignorado" };
  const host = new URL(catalogo.spa.url).host;
  try {
    const r = await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ host, key: seo.chave, keyLocation: catalogo.spa.url + "/" + seo.chave + ".txt", urlList: seo.paginas })
    });
    console.log("IndexNow", r.status, seo.paginas.length, "páginas");
  } catch (e) {
    console.error("IndexNow falhou", e.message);
  }
  return { statusCode: 200, body: "ok" };
};
