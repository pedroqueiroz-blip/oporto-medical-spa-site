// Todos os dias de madrugada (00:10 em Lisboa no inverno, 01:10 no verão) o site volta a ser gerado,
// para as campanhas entrarem e saírem nas datas do backoffice, no site, no Google e no llms.txt.
// Precisa de BUILD_HOOK_URL no Netlify (Site configuration → Build & deploy → Build hooks). Sem ela não faz nada.
export default async () => {
  const hook = process.env.BUILD_HOOK_URL;
  if (!hook) { console.log("BUILD_HOOK_URL não definida: sem reconstrução diária"); return; }
  const r = await fetch(hook + (hook.includes("?") ? "&" : "?") + "trigger_title=" + encodeURIComponent("Reconstrução diária (campanhas)"), { method: "POST" });
  console.log("Reconstrução diária pedida:", r.status);
};

export const config = { schedule: "10 0 * * *" };
