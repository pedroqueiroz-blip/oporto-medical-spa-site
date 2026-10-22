# Oporto Medical Spa · site

Site do Oporto Medical Spa, publicado no Netlify a partir do ramo `main`.
Os textos, imagens, preços, equipa e a campanha do mês editam-se no backoffice em **`/admin`**.

Enquanto «Site visível no Google» estiver desligado (em *Contactos e horário → Google*),
o site não é indexado: `noindex` nas páginas e em `_headers`.

## O backoffice (`/admin`)

| Separador | O que muda |
| --- | --- |
| Campanhas | Uma ficha por campanha: título, texto, fotografia, preço, datas, botão, ligada ou desligada. A primeira pela ordem é a principal; o selo «Em campanha» marca o tratamento na lista |
| Página inicial | Uma ficha por secção (topo, cuidar, rituais, visita, equipa, reservar, oferecer, afiliações, avaliações, perguntas, como chegar, Google) |
| Página Massagens | Topo, tabela, perguntas, onde estamos e Google |
| Páginas de tratamentos | Uma página por área (fisioterapia, Pilates, drenagem): endereço, textos, perguntas e Google. Os tratamentos, preços e durações vêm da lista de tratamentos |
| Tratamentos e preços | Um tratamento por ficha, agrupados por área: nome, textos, duração, preço, fotografia e ordem |
| Equipa | Pessoas, retratos, especialidades e os tratamentos que cada uma faz |
| Contactos e horário | Contactos, horário, newsletter, a casa e o interruptor «Site visível no Google» |

Cada ficha tem uma pré-visualização ao lado, com as cores e os tipos de letra do site.
O conteúdo está em `content/<separador>/`: um ficheiro por ficha; os que começam por `_` juntam-se à ficha principal.

Cada alteração fica primeiro como **rascunho**, com uma pré-visualização do Netlify
(botão «Verificar se há pré-visualização»). Só vai para o site quando se carrega em **Publicar**.

Nos textos pode usar `*itálico*`, `**negrito**`, `[ligação](https://...)` e `[[a confirmar]]`
(aparece marcado no site e fica fora dos dados para o Google). `{telefone}`, `{email}`,
`{morada}`, `{horario}`, `{preco:fisio}` e `{duracao:fisio}` são substituídos pelos valores atuais.

### SEO e GEO automáticos

O build (`src/build.mjs`) gera tudo a partir do conteúdo, por isso nada disto se edita à mão:

- título, descrição (escrita sozinha com os preços e a campanha, se o campo ficar vazio), Open Graph e `canonical`;
- JSON-LD `DaySpa` + `Physiotherapy` com morada, horário, coordenadas, catálogo de tratamentos e preços,
  a campanha em vigor (com `validFrom`/`validThrough`), afiliações e, quando confirmada, a equipa;
- `FAQPage` com as perguntas frequentes (as respostas sobre preços e morada escrevem-se sozinhas);
- a frase-resposta de preços na secção de rituais e o resumo da página de massagens;
- `sitemap.xml`, `robots.txt`, `_headers` e `llms.txt` (resumo factual para assistentes de IA);
- versões leves das fotografias carregadas no backoffice, via Netlify Image CDN;
- todas as campanhas ligadas e dentro das datas entram nos dados para o Google e no `llms.txt`;
- `lastmod` do sitemap com o dia da última alteração publicada (ou da entrada/saída de uma campanha).

Depois de cada publicação, com o site visível no Google, o IndexNow (Bing, Copilot, pesquisa do ChatGPT) é avisado
das páginas alteradas (`netlify/functions/deploy-succeeded.mjs`). O Google lê o `sitemap.xml` sozinho.

Todos os dias de madrugada o site volta a ser gerado (`netlify/functions/reconstruir.mjs`), para as campanhas
entrarem e saírem nas datas marcadas sem ninguém publicar. Precisa de um *build hook* no Netlify
(*Site configuration → Build & deploy → Build hooks*, ramo `main`) guardado na variável `BUILD_HOOK_URL`.

Textos com `[[a confirmar]]` nunca entram nos dados estruturados.

## Pagamentos e faturação

Marcações e vouchers pagam-se no site (euPago: MB WAY, Multibanco, cartão) e a fatura-recibo é emitida
no Moloni ON (série SPA, artigos TPREV e TREAB isentos de IVA). Códigos `VIP`, 10% da newsletter e vouchers.
Regras, emails e configuração: [docs/integracoes.md](docs/integracoes.md).

## Configuração inicial (uma vez)

O backoffice entra com a palavra-passe da equipa (`netlify/functions/admin-entrar.mjs`).
Variáveis no Netlify (*Site configuration → Environment variables*, marcadas como secretas), e depois publicar de novo:

- `BACKOFFICE_PASSWORD`: a palavra-passe da equipa. Para tirar o acesso a alguém, mudar a palavra-passe.
- `BACKOFFICE_GITHUB_TOKEN`: no GitHub, *Settings → Developer settings → Personal access tokens → Fine-grained tokens*,
  só para o repositório `oporto-medical-spa-site`, com *Contents* e *Pull requests* em *Read and write*.
  Todas as alterações feitas no backoffice ficam em nome da conta que criou esta chave.

Sem estas duas variáveis, o backoffice entra com a conta GitHub de quem tem acesso a este repositório:

1. No GitHub: *Settings → Developer settings → OAuth Apps → New OAuth App*.
   *Homepage URL*: o endereço do site no Netlify. *Authorization callback URL*: `https://api.netlify.com/auth/done`.
2. No Netlify: *Site configuration → Access & security → OAuth → Install provider → GitHub*,
   com o *Client ID* e o *Client secret* criados no passo 1.
3. Confirmar que as *Deploy Previews* estão ligadas (*Site configuration → Build & deploy*), para os rascunhos terem pré-visualização.

## Estrutura

```
content/      conteúdo editado no backoffice (JSON, uma pasta por separador)
public/       ficheiros estáticos (CSS, JS, imagens, logótipos) e o backoffice em public/admin
src/          build: modelo de dados, páginas, SEO/GEO
servidor/     pagamentos (euPago), faturação (Moloni ON), emails e códigos
netlify/      funções do Netlify: /api/* e o código de 10% da newsletter
tests/        teste dos pagamentos com serviços simulados (npm test)
dist/         site gerado (não vai para o git)
docs/         notas de arquitetura (pagamentos, faturação, agenda)
```

## Trabalhar no computador

```
npm run dev      # gera o site e serve-o em http://localhost:8080
npm run cms      # noutro terminal: backoffice local em http://localhost:8080/admin/ (grava em content/)
npm test         # pagamentos, faturas e emails contra euPago, Moloni ON e Resend simulados
```
