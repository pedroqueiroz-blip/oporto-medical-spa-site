# Pagamentos, faturação e agenda (planeado)

Ainda não implementado. Esta nota fixa como as peças se vão ligar, para que o backoffice
e o site de hoje já estejam preparados.

## Fluxo de compra (vouchers e massagens)

```
Site (agenda / vouchers)
  └─ POST /api/pagamento            Netlify Function: valida o pedido contra content/tratamentos.json
       └─ eupago                     MB WAY, Multibanco ou cartão → devolve referência / link de pagamento
eupago ── callback ──> /api/eupago-webhook
       ├─ Moloni                     emite fatura-recibo (cliente, NIF opcional, tratamento ou voucher)
       ├─ email ao cliente           voucher com código, ou confirmação da marcação
       └─ Zoho (fase seguinte)       cria a marcação na agenda
```

- O preço cobrado é sempre o de `content/tratamentos.json`, lido no servidor, nunca o que vem do browser.
- O **código** de cada tratamento no backoffice (`oil`, `fisio`, ...) é a chave comum: referência do artigo
  no Moloni e identificador do serviço na agenda Zoho.
- `dados.js` (gerado no build) já dá à agenda e aos vouchers os tratamentos, preços e equipa do backoffice.
  Quando a agenda Zoho entrar, a disponibilidade simulada em `public/prototype.js` passa a vir de `/api/disponibilidade`.

## Credenciais

Ficam só nas variáveis de ambiente do Netlify (*Site configuration → Environment variables*), nunca no repositório:

| Variável | Para quê |
| --- | --- |
| `EUPAGO_API_KEY` | Criar pagamentos MB WAY, Multibanco e cartão |
| `EUPAGO_WEBHOOK_SECRET` | Confirmar que o callback vem da eupago |
| `MOLONI_CLIENT_ID`, `MOLONI_CLIENT_SECRET`, `MOLONI_USERNAME`, `MOLONI_PASSWORD`, `MOLONI_COMPANY_ID` | Emitir faturas-recibo |
| `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REFRESH_TOKEN` | Agenda (fase seguinte) |
