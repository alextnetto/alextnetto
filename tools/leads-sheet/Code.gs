/**
 * Receives contact-form leads from alexnet.to (/contact and /links, via /api/lead) and writes
 * them to the "Leads" tab of the "Leads alexnet.to" sheet.
 *
 * One row per leadId: the final submission updates the row of an earlier partial
 * save. Empty fields never erase what is already there, and a row marked
 * "Completo" never goes back to "Parcial".
 *
 * Deploy: Extensions > Apps Script, paste this file, Deploy > New deployment >
 * Web app, Execute as: Me, Who has access: Anyone. The web app URL goes in the
 * Vercel variable LEADS_SHEET_URL; treat it as a secret.
 *
 * @OnlyCurrentDoc  Limits the script's access to this one spreadsheet.
 */

const SHEET_NAME = 'Leads';
const COLUMNS = [
  'leadId', 'createdAt', 'updatedAt', 'stage', 'kind', 'name', 'email',
  'whatsapp', 'company', 'message', 'lang', 'origin', 'page', 'trama',
];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function doPost(e) {
  let lead;
  try {
    lead = JSON.parse(e.postData.contents);
  } catch (err) {
    return reply({ ok: false, error: 'json' });
  }
  if (!lead || typeof lead.leadId !== 'string' || !UUID.test(lead.leadId)) {
    return reply({ ok: false, error: 'leadId' });
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME);
    const found = sheet.getRange('A:A').createTextFinder(lead.leadId).matchEntireCell(true).findNext();
    const row = found ? found.getRow() : sheet.getLastRow() + 1;
    const current = found ? sheet.getRange(row, 1, 1, COLUMNS.length).getValues()[0] : [];
    const now = new Date();

    const values = COLUMNS.map((key, i) => {
      if (key === 'createdAt') return current[i] || now;
      if (key === 'updatedAt') return now;
      if (key === 'stage' && current[i] === 'Completo') return 'Completo';
      const value = lead[key];
      if (value === undefined || value === null || value === '') return keep(current[i]);
      return asText(String(value).slice(0, 5000));
    });
    sheet.getRange(row, 1, 1, COLUMNS.length).setValues([values]);
    sheet.getRange(row, 2, 1, 2).setNumberFormat('dd/mm/yyyy hh:mm');
    return reply({ ok: true, row: row });
  } finally {
    lock.releaseLock();
  }
}

/** Keeps "+55..." and anything starting with = + - @ as text, never as a formula. */
function asText(value) {
  return /^[=+\-@]/.test(value) ? "'" + value : value;
}

/** A kept cell comes back without its leading apostrophe, so text is protected again. */
function keep(value) {
  if (value === undefined) return '';
  return typeof value === 'string' ? asText(value) : value;
}

function reply(body) {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}
