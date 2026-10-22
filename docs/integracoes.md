# Pagamentos, faturação e agenda

Marcações e vouchers pagam-se no site pela euPago (MB WAY, Multibanco, cartão). Depois de a euPago
confirmar o pagamento, o site emite a fatura-recibo no Moloni ON e envia os emails. Mesmo modelo do aquadrena.com.

## Fluxo

```
Site: Reservar (agenda) ou Oferecer (voucher)
  └─ public/pagar.js          resumo, código, NIF, MB WAY / Multibanco / cartão
       ├─ POST /api/preco       total com o código (o servidor calcula, nunca o browser)
       └─ POST /api/pagamento   cria o pedido OMS-AAMMDD-XXXX e o pagamento na euPago
                                (total 0 com VIP ou voucher: fica logo confirmado, sem pagamento nem fatura)
euPago ── notificação ──> /api/eupago-notificacao
       ├─ Moloni ON             fatura-recibo na série SPA, fechada e enviada ao cliente
       ├─ email ao cliente      confirmação da marcação, ou o voucher com o código
       ├─ email à equipa        aviso de cada marcação ou voucher (EMAIL_RESERVAS ou o email do site)
       └─ Zoho (fase seguinte)  cria a marcação na agenda
Newsletter (Netlify Forms) ──> submission-created: código de 10% por email
```

Código: `netlify/functions/` (rotas) e `servidor/` (euPago, Moloni ON, emails, códigos, pedidos).
Os pedidos e os códigos ficam no Netlify Blobs. Teste completo com serviços simulados: `npm test`.

## Regras de faturação (Pedro, 22/10/2026)

- Série **SPA**. Artigos, ambos **isentos de IVA**:
  - **TPREV** (Terapêuticas de Prevenção): todos os tratamentos da área *Relaxar*;
  - **TREAB** (Terapêuticas de Reabilitação): todos os outros.
- O valor na fatura é o valor final do site: o preço de campanha, quando há, e já com o desconto do código.
- Uma linha por pedido, com o nome do tratamento (e o dia e hora, nas marcações; «Voucher oferta», nos vouchers).
- Sem NIF, a fatura vai para o Consumidor final (cliente n.º 1). Com NIF, o cliente é criado no Moloni ON.
- O motivo de isenção vem do artigo no Moloni ON. Se o artigo não o tiver, a fatura não é emitida e a equipa
  recebe o erro no email do pedido (ou define-se `MOLONI_ISENCAO`, por exemplo `M10`).

## Códigos no passo de pagamento

| Código | Efeito |
| --- | --- |
| `VIP` (ou o de `CODIGO_VIP`) | Marcação a 0 €: sem pagamento e sem fatura. Não serve para vouchers. Não se gasta. |
| `BEMVINDO-XXXXXX` | 10% para quem subscreve a newsletter. Um por email, válido numa compra (marcação ou voucher). |
| `OMS-XXXX-XXXX` | Voucher comprado no site: paga a marcação do tratamento do voucher, uma vez, até à validade. |

O código `VIP` funciona para quem o souber: se for preciso mudá-lo, define-se outro em `CODIGO_VIP` no Netlify.

## Campanhas de vouchers (Black Week, Natal…)

- No backoffice, a campanha com «Campanha de vouchers» ligada vende vouchers do tratamento escolhido ao preço de campanha,
  com a duração da campanha, só entre as datas de início e fim (dia de Lisboa, confirmado no servidor no momento da compra).
- Não acumula com códigos (newsletter, VIP, vouchers). O preço normal da marcação não muda.
- «Limite de vouchers»: contados quando o pagamento é confirmado; depois do limite, o site responde que esgotaram.
- A fatura sai pelo valor de campanha, no artigo do tratamento (TPREV/TREAB).

## Vouchers

- Sempre de um tratamento (sem valor livre), só digitais.
- O código só aparece no email enviado a quem compra, nunca no ecrã.
- Válido até ao fim do mês, 12 meses depois da compra (comprado a 22/10/2026 → válido até 31/10/2027).

## Emails ao cliente

Marcação confirmada, com o texto da terapêutica:

- TREAB: «Somos um medical SPA. A fisioterapeuta no dia da sua marcação irá avaliar e indicar a melhor forma de cuidar
  da sua saúde. Iniciará de seguida a sua terapêutica de reabilitação: *tratamento*.»
- TPREV: «Somos um medical SPA. A fisioterapeuta no dia da sua marcação irá avaliar e indicar a melhor forma de cuidar
  da sua saúde e bem-estar. Iniciará de seguida a sua terapêutica de prevenção: *tratamento*.»

O mesmo texto vai na mensagem do email da fatura-recibo, enviado pelo Moloni ON.
Também há o email com a referência Multibanco, o do voucher e o do código de 10% da newsletter.

## Configuração (uma vez)

As chaves ficam só nas variáveis de ambiente do Netlify (*Site configuration → Environment variables*),
nunca no repositório. Depois de as criar, é preciso publicar de novo (*Deploys → Trigger deploy*).

| Variável | Para quê |
| --- | --- |
| `EUPAGO_API_KEY` | Chave da API do canal euPago (*Canais → Listagem de canais*) |
| `EUPAGO_MODO` | `teste` (sandbox) ou `real`. Sem ela, chaves `demo-…` usam o modo de teste |
| `MOLONI_API_KEY` | Chave da API do Moloni ON (*Conta → API → API Keys*) |
| `MOLONI_FECHAR` | `sim` para fechar e enviar as faturas. Sem isto ficam só rascunhos (para testar) |
| `MOLONI_EMPRESA` | Só se a conta Moloni ON tiver várias empresas |
| `RESEND_API_KEY`, `EMAIL_FROM` | Envio dos emails (Resend), por exemplo `Oporto Medical Spa <reservas@oportomedicalspa.com>` |
| `EMAIL_RESERVAS` | Opcional: outro email para os avisos à equipa |
| `CODIGO_VIP` | Opcional: outro código VIP |
| `BUILD_HOOK_URL` | Reconstrução diária do site, para as campanhas mudarem nas datas (ver README) |
| `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REFRESH_TOKEN` | Agenda (fase seguinte) |

Na euPago, no canal: *Receber notificação para um URL* → `https://www.oportomedicalspa.com/api/eupago-notificacao`.

No Moloni ON: série `SPA`; artigos `TREAB` e `TPREV` isentos de IVA com o motivo de isenção;
meios de pagamento com «MB WAY», «Multibanco» e «Cartão» no nome; cliente n.º 1 Consumidor final.
`node scripts/verificar.mjs` (com as chaves no ambiente) confirma tudo isto sem criar nada.

Enquanto a euPago estiver em modo de teste, as faturas ficam sempre em rascunho no Moloni ON.

## Agenda

A disponibilidade em `public/prototype.js` ainda é simulada: as marcações chegam por email à equipa.
Quando a agenda Zoho entrar, as horas livres passam a vir de `/api/disponibilidade` e cada pedido pago cria a marcação no Zoho.
O **código** de cada tratamento no backoffice (`oil`, `fisio`, ...) é a chave comum para o serviço na agenda.
