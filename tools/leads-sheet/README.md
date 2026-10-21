# Leads sheet

The contact form (on `/contact` and `/links`) sends every lead to two places: a card in the Trama funnel `alexnet.to` (tasks.fator.ai/blockful/alexnet-to) and a row in the Google Sheet "Leads alexnet.to" (tab `Leads`). The sheet is the backup: it keeps the lead even when Trama is down.

The sheet belongs to alex.netto@fator.ai (id `1FE8Pugf3nn4wKGUbpTXs09b3_4i5SQA30sAiTTRf51o`); its bound Apps Script project is "Receber leads do alexnet.to".

`Code.gs` is the Apps Script web app that writes the row. `@OnlyCurrentDoc` limits its access to this one spreadsheet. It keeps one row per `Lead ID`, so the final submission updates the row of an earlier partial save.

## Columns

Lead ID, Criado em, Atualizado em, Formulário (Parcial or Completo), Interesse, Nome, E-mail, WhatsApp, Empresa, evento ou LinkedIn, Mensagem, Idioma, Origem, Página, Trama (link to the card).

## Deploy

1. Open the sheet, then Extensions > Apps Script.
2. Replace the content of `Code.gs` with this folder's `Code.gs` and save.
3. Deploy > New deployment > type Web app. Execute as: Me. Who has access: Anyone. Authorize when Google asks.
4. Copy the web app URL (`https://script.google.com/macros/s/…/exec`) into the Vercel variable `LEADS_SHEET_URL`. The URL works as a password: keep it out of the repo.

After changing `Code.gs`, use Deploy > Manage deployments > Edit > New version, so the URL stays the same.

## Vercel variables for the form

| Variable | Use |
| --- | --- |
| `TRAMA_API_KEY` | Trama workspace API key (Settings > Integrations > API) |
| `LEADS_SHEET_URL` | web app URL from step 4 |
| `TRAMA_URL` | optional, default `https://tasks.fator.ai` |

Either destination is enough for the visitor to see "received"; failures are logged in Vercel as `[lead partial]` or `[lead complete]`.
