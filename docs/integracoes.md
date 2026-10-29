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
       └─ Zoho CRM              ficha do cliente (NIF/email) e evento na agenda da terapeuta
Newsletter (Netlify Forms) ──> submission-created: código de 10% por email
```

O email à equipa começa por um «Estado» com ✓/✗ para cada passo (reservado na agenda Zoho, euPago, fatura Moloni,
email ao cliente) e os erros. A página `/api/reservas` (palavra-passe do backoffice, botão «Reservas» no /admin) mostra
os últimos 50 pedidos com cliente, contactos, valor e o mesmo estado; os que têm erro ficam a vermelho.
A página `/api/vouchers` (botão «Vouchers» no /admin) mostra todos os vouchers comprados: número do voucher e se já foi
usado, oferta, dados da compra (pedido, data, valor, fatura, cliente), meio de pagamento e mensagem (para, de, entrega).
Pesquisa em todos os campos ou num só, sem ligar a acentos nem maiúsculas.

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
| `BACKOFFICE_PASSWORD`, `BACKOFFICE_GITHUB_TOKEN` | Entrada no backoffice (/admin) com palavra-passe (ver README) |
| `BUILD_HOOK_URL` | Reconstrução diária do site, para as campanhas mudarem nas datas (ver README) |
| `GOOGLE_PLACES_KEY` | Avaliações do Google (nota, número e as mais recentes) em cada build, pela Places API (New). Sem ela ficam as do backoffice |
| `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET` | Ligação ao Zoho CRM (agenda e clientes). Depois de publicar, abrir `/api/zoho/ligar` (ver «Agenda») |
| `ZOHO_CAMPO_NIF` | Opcional: nome API do campo do NIF nos Contactos do CRM (por omissão `NIF`) |
| `ZOHO_MODULO_AGENDA` | Opcional: módulo da agenda no CRM (por omissão `Events`, as Reuniões) |
| `ZOHO_REFRESH_TOKEN` | Opcional: chave de renovação gerada à mão, em vez da ligação por `/api/zoho/ligar` |

Na euPago, no canal: *Receber notificação para um URL* → `https://www.oportomedicalspa.com/api/eupago-notificacao`.

No Moloni ON: série `SPA`; artigos `TREAB` e `TPREV` isentos de IVA com o motivo de isenção;
meios de pagamento com «MB WAY», «Multibanco» e «Cartão» no nome; cliente n.º 1 Consumidor final.
A página `/admin-verificar` (palavra-passe do backoffice) confirma tudo isto no próprio site, sem criar nada;
`node scripts/verificar.mjs` faz o mesmo no computador, com as chaves no ambiente.

Enquanto a euPago estiver em modo de teste, as faturas ficam sempre em rascunho no Moloni ON.

## Dados do cliente nas marcações (Pedro, 27/10/2026)

- **Obrigatórios:** nome, email e telemóvel. O **NIF é opcional**, só para a fatura (com NIF, cliente próprio no Moloni ON).
- No Zoho CRM o cliente procura-se pelo NIF, quando o há, e senão pelo email.
- «Tenho um voucher para usar» mostra o campo para o código (voucher `OMS-XXXX-XXXX`, `VIP` ou o código de 10% da newsletter).
  O código valida-se logo (`/api/preco`) e o total atualiza-se; a 0 € a marcação confirma-se sem passo de pagamento.

## Agenda (Zoho CRM, conta zoho.eu)

Com o Zoho CRM ligado, a agenda do site usa a agenda do CRM:

- **Horas livres** (`GET /api/disponibilidade?tratamento=…&de=…&dias=…`): para cada pessoa da equipa que faz o tratamento,
  uma hora está livre quando ela não tem nenhuma marcação no módulo Tratamentos (nem evento em Reuniões) que se sobreponha à duração do tratamento
  (eventos de dia inteiro ocupam o dia; uma Reunião «Bloqueado (Profissionais:Spa:Nome)» ocupa a profissional do título, seja quem for o responsável). Horas de meia em meia hora, das 8:00 às 20:00 (ao sábado das 9:00 às 13:00, encerra ao domingo),
  com o tratamento inteiro dentro desse período, e nunca a menos de 1 hora.
- **Turnos de cada dia** (manda sobre o horário padrão): módulo «Horários de Colaborador», um registo por pessoa e dia
  (Name `2026-10-29|Catarina Silva`, Periodos `08:00-14:00, 15:00-20:00` ou `-`). Só aparecem horas em que o tratamento inteiro
  cabe num turno; com `-` não se marca nesse dia; sem registo nesse dia vale o «Horário padrão» do Prestadores
  (Pedro, 29/10/2026).
- **Horário de cada colaboradora**: campo «Horário padrão» do módulo Prestadores (registo com o mesmo nome do site), por exemplo
  `seg-sex 12:30-20:00; sab 09:00-13:00 quinzenal 14-11-2026` (partes separadas por «;»; «quinzenal» = sábado sim, sábado não,
  contando a semana da data indicada). Só aparecem horas em que o tratamento inteiro cabe nesse horário. Quem tiver «Ativo» desligado
  fica fora da agenda online; sem registo ou com horário que não se consiga ler, valem só as horas do SPA. A página
  `/api/zoho/verificar` mostra como cada horário foi lido.
- **Equipa ↔ CRM**: cada pessoa liga-se ao utilizador do CRM com o mesmo nome; se o nome for diferente, indica-se o email
  do utilizador no backoffice (Equipa → «Utilizador no Zoho CRM»). Quem não estiver ligado não aparece na agenda online.
- **Antes de pagar** (`/api/pagamento`) o servidor confirma que a hora continua livre; «Sem preferência» fica com a pessoa livre a essa hora que tem menos marcações nesse dia (empate à sorte).
- **Só MB WAY ou cartão** nas marcações (Pedro, 27/10/2026): confirmam na hora, e a marcação entra logo no CRM. O Multibanco fica para os vouchers.
- Enquanto o pagamento não chega, a hora fica **guardada 10 minutos** (Netlify Blobs `reservas`): não aparece livre a mais ninguém.
  Pago, passa a evento no CRM; sem pagamento, volta a ficar livre.
- **Depois de pago** (ou a 0 €): o cliente procura-se nos Contactos pelo **NIF** e, se não houver, pelo **email**
  (uma ficha sem NIF recebe-o); sem ficha, cria-se uma. O email de uma ficha existente nunca muda: uma diferença fica como nota
  no evento e no aviso à equipa. Cria-se o evento na agenda da terapeuta, ligado à ficha, com o n.º do pedido, valor, email, telemóvel e NIF.
- Uma falha no CRM não trava o pagamento: o aviso à equipa diz «Não ficou na agenda… Marcar à mão».
- **Módulo «Tratamentos»** (Pedro, 27/10/2026): o SPA marca no módulo «Tratamentos» da Agenda do Zoho. A marcação paga cria lá
  um registo com Nome de Tratamento e Artigo (produto com o mesmo nome), Data do tratamento e Hora fim, a profissional na lista que
  tem o nome dela («Terapeutas» ou «Profissionais LC»), Estado = Agendado, Pagamento = Efetuado (Isento com o código VIP),
  Especialidade = Spa, Valor, Preferência pela terapeuta, Cliente, Origem_Marcacao = Online e Notas da Sessão a começar pelo
  n.º da marcação que o cliente recebe («OMS-261027-DBBD · Origem online»). As horas ocupadas somam os eventos de cada terapeuta e
  os registos do módulo com o nome dela (os cancelados não contam). Os campos encontram-se pelos nomes (nunca os do sistema, como
  a hora de criação). As marcações vão **só** para este módulo: sem ele pronto, a agenda do site fica simulada e uma marcação paga
  não entra no Zoho (a equipa recebe «Marcar à mão»). Tem agenda online quem está numa das listas de profissionais com o mesmo nome do site. `/api/zoho/verificar` mostra a correspondência.

Sem `ZOHO_CLIENT_ID`/`ZOHO_CLIENT_SECRET`, ou antes de ligar, `/api/disponibilidade` responde `{ fonte: "simulada" }`, a agenda
do site fica simulada e as marcações chegam só por email.

### Ligar (uma vez)

1. Em [api-console.zoho.eu](https://api-console.zoho.eu): *Add Client → Server-based Applications*. Redirect URIs: `https://<domínio>/api/zoho/retorno`
   para cada endereço onde se vai ligar (o domínio do site e, para testar, o da pré-visualização).
2. Pôr `ZOHO_CLIENT_ID` e `ZOHO_CLIENT_SECRET` no Netlify e publicar de novo.
3. Abrir `https://<domínio>/api/zoho/ligar`, escrever a palavra-passe do backoffice (`BACKOFFICE_PASSWORD`) e aceitar no Zoho.
   A chave de renovação fica no Netlify Blobs (`zoho`). Permissões pedidas: `ZohoCRM.modules.ALL, ZohoCRM.users.READ, ZohoCRM.coql.READ, ZohoCRM.settings.modules.READ, ZohoCRM.settings.fields.READ`.

4. Abrir `https://<domínio>/api/zoho/verificar` (mesma palavra-passe): confere pela API de metadados os módulos, o campo do NIF
   nos Contactos, os campos da agenda, a leitura dos eventos e o utilizador do CRM de cada pessoa da equipa. Se o campo do NIF
   tiver outro nome e houver um só candidato (NIF, contribuinte, fiscal…), o site passa a usá-lo; senão, indica-se em `ZOHO_CAMPO_NIF`.

O **código** de cada tratamento no backoffice (`oil`, `fisio`, ...) vai no título do evento pelo nome do tratamento.
