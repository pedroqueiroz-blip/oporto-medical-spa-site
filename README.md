# Oporto Medical Spa · site

Site do Oporto Medical Spa, publicado no Netlify a partir do ramo `main`.
Os textos, imagens, preços, equipa e a campanha do mês editam-se no backoffice em **`/admin`**.

Enquanto «Site visível no Google» estiver desligado (em *Contactos, horário e Google*),
o site não é indexado: `noindex` nas páginas e em `_headers`.

## O backoffice (`/admin`)

| Secção | O que muda |
| --- | --- |
| Campanha do mês | Destaque na página inicial: título, texto, fotografia, preço, datas, botão de reserva |
| Páginas | Títulos, textos e fotografias da página inicial e da página de massagens; perguntas frequentes |
| Tratamentos e preços | Lista de tratamentos (a ordem é a do site), durações e preços |
| Equipa | Pessoas, retratos, especialidades e os tratamentos que cada uma faz |
| Contactos, horário e Google | Nome, morada, telefones, horário, coordenadas, perfis e o interruptor de indexação |

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
- versões leves das fotografias carregadas no backoffice, via Netlify Image CDN.

Textos com `[[a confirmar]]` nunca entram nos dados estruturados.

## Pagamentos e faturação

Marcações e vouchers pagam-se no site (euPago: MB WAY, Multibanco, cartão) e a fatura-recibo é emitida
no Moloni ON (série SPA, artigos TPREV e TREAB isentos de IVA). Códigos `VIP`, 10% da newsletter e vouchers.
Regras, emails e configuração: [docs/integracoes.md](docs/integracoes.md).

## Configuração inicial (uma vez)

O backoffice entra com a conta GitHub de quem tem acesso a este repositório.

1. No GitHub: *Settings → Developer settings → OAuth Apps → New OAuth App*.
   *Homepage URL*: o endereço do site no Netlify. *Authorization callback URL*: `https://api.netlify.com/auth/done`.
2. No Netlify: *Site configuration → Access & security → OAuth → Install provider → GitHub*,
   com o *Client ID* e o *Client secret* criados no passo 1.
3. Confirmar que as *Deploy Previews* estão ligadas (*Site configuration → Build & deploy*), para os rascunhos terem pré-visualização.

## Estrutura

```
content/      conteúdo editado no backoffice (JSON)
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
