// Tratamentos e preços que o site mostra, gerados no build (src/build.mjs) a partir do backoffice.
// O preço cobrado vem sempre daqui, nunca do browser.
import catalogo from "./gerado/catalogo.json" with { type: "json" };

export const spa = catalogo.spa;
export const tratamento = (id) => catalogo.tratamentos.find((t) => t.id === id) || null;

// Textos do email de confirmação (pedido do Pedro, 22/10/2026). TPREV = área Relaxar, TREAB = todas as outras.
export const TEXTO_TERAPEUTICA = {
  TREAB: (nome) => `Somos um medical SPA. A fisioterapeuta no dia da sua marcação irá avaliar e indicar a melhor forma de cuidar da sua saúde. Iniciará de seguida a sua terapêutica de reabilitação: ${nome}.`,
  TPREV: (nome) => `Somos um medical SPA. A fisioterapeuta no dia da sua marcação irá avaliar e indicar a melhor forma de cuidar da sua saúde e bem-estar. Iniciará de seguida a sua terapêutica de prevenção: ${nome}.`,
};
