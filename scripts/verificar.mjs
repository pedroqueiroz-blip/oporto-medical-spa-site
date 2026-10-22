// Verifica as ligações à euPago e ao Moloni ON sem criar nada (só leituras).
// Uso, com as mesmas variáveis do Netlify:  node src/build.mjs && EUPAGO_API_KEY=... MOLONI_API_KEY=... node scripts/verificar.mjs
import { verificarEupago } from "../servidor/eupago.mjs";
import { verificarMoloni } from "../servidor/moloni.mjs";

for (const [nome, fn] of [["euPago", verificarEupago], ["Moloni ON", verificarMoloni]]) {
  console.log(`\n${nome}`);
  for (const p of await fn()) console.log(`${p.ok ? "✓" : "✗"} ${p.texto}${p.detalhe ? ` · ${p.detalhe}` : ""}`);
}
