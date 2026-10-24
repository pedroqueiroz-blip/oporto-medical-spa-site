/* Avaliações do Google no build: nota, número e as avaliações mais recentes, pela Places API (New).
   Precisa de GOOGLE_PLACES_KEY no Netlify. Sem a chave, ou se o Google falhar, ficam os campos
   preenchidos à mão no backoffice (Página inicial → Avaliações). Com a reconstrução diária
   (BUILD_HOOK_URL) os números atualizam-se todos os dias. */
const API = 'https://places.googleapis.com/v1/';
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

async function call(url, key, fields, body) {
  const r = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers: { 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': fields, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000)
  });
  if (!r.ok) throw new Error('Google ' + r.status + ': ' + (await r.text()).slice(0, 200));
  return r.json();
}

/* Devolve os campos de avaliacoes.json com os dados do Google por cima, ou os de origem se não der */
export async function withGoogle(A, m, { key = process.env.GOOGLE_PLACES_KEY, n = 3 } = {}) {
  if (!key) return A;
  try {
    let id = A.google_place_id || process.env.GOOGLE_PLACE_ID;
    if (!id) {
      const q = m.s.nome + ', ' + m.s.rua + ', ' + m.s.codigo_postal + ' ' + m.s.localidade;
      id = (await call(API + 'places:searchText', key, 'places.id', { textQuery: q, languageCode: 'pt-PT' })).places?.[0]?.id;
      if (!id) throw new Error('perfil não encontrado para «' + q + '»');
    }
    const p = await call(API + 'places/' + id + '?languageCode=pt-PT', key, 'rating,userRatingCount,googleMapsUri,reviews');
    const lista = (p.reviews || [])
      .filter((r) => (r.originalText || r.text)?.text)
      .sort((a, b) => String(b.publishTime).localeCompare(String(a.publishTime)))
      .slice(0, n)
      .map((r) => {
        const d = new Date(r.publishTime);
        return {
          nome: r.authorAttribution?.displayName || 'Cliente Google',
          perfil: r.authorAttribution?.uri || '',
          estrelas: r.rating,
          data: isNaN(d) ? r.relativePublishTimeDescription || '' : MESES[d.getUTCMonth()] + ' ' + d.getUTCFullYear(),
          texto: (r.originalText || r.text).text
        };
      });
    console.log('Avaliações Google: ' + p.rating + ' (' + p.userRatingCount + '), ' + lista.length + ' mostradas');
    return {
      ...A,
      nota_google: p.rating ? String(p.rating.toFixed(1)).replace('.', ',') : A.nota_google,
      total_avaliacoes: p.userRatingCount || A.total_avaliacoes,
      perfil_google: A.perfil_google || p.googleMapsUri,
      lista: lista.length ? lista : A.lista
    };
  } catch (e) {
    console.warn('Avaliações Google indisponíveis, ficam as do backoffice:', e.message);
    return A;
  }
}
