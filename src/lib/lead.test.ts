import { describe, expect, it } from 'vitest';
import { parseLead, saveToSheet, saveToTrama, submitLead, TRAMA, type Lead } from './lead';

const NOW = 1_800_000_000_000;
const LEAD_ID = '6f1c2d3e-4b5a-4c6d-8e7f-901a2b3c4d5e';
const DEAL_ID = '11111111-1111-4111-8111-111111111111';
const CONTACT_ID = '22222222-2222-4222-8222-222222222222';
const ORG_ID = '33333333-3333-4333-8333-333333333333';
const SHEET_URL = 'https://script.google.com/macros/s/abc/exec';
const env = { TRAMA_API_KEY: 'tm_test', LEADS_SHEET_URL: SHEET_URL };

const completeBody = {
  leadId: LEAD_ID,
  stage: 'complete',
  kind: 'empresa',
  name: '  Maria Souza ',
  whatsapp: '(48) 99972-4312',
  email: 'Maria@Empresa.com.br',
  company: 'Distribuidora Sul',
  message: 'O comercial gasta 3 horas por dia montando propostas.',
  lang: 'pt',
  origin: 'instagram',
  consent: true,
  website: '',
  startedAt: NOW - 30_000,
};

const lead: Lead = {
  leadId: LEAD_ID,
  stage: 'complete',
  kind: 'palestra',
  name: 'Maria Souza',
  whatsapp: '+5548999724312',
  email: 'maria@empresa.com.br',
  company: 'Distribuidora Sul',
  message: 'Evento para 200 gestores em março.',
  lang: 'pt',
  origin: 'instagram',
};

type Call = { method: string; path: string; url: URL; body?: any; headers: Record<string, string> };
type Route = (call: Call) => { status?: number; json: unknown };

/** Fake fetch that records calls and answers by "METHOD host/path". */
function fakeFetch(routes: Record<string, Route>) {
  const calls: Call[] = [];
  const fetchFn = async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const path = `${url.host}${url.pathname}`;
    const call: Call = {
      method,
      path,
      url,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
    };
    calls.push(call);
    const route = routes[`${method} ${path}`];
    if (!route) return new Response(JSON.stringify({ error: 'not found' }), { status: 404 });
    const { status = 200, json } = route(call);
    return new Response(JSON.stringify(json), { status, headers: { 'Content-Type': 'application/json' } });
  };
  return { calls, fetchFn: fetchFn as typeof fetch };
}

const T = 'tasks.fator.ai/v1';
const deal = (over: Record<string, unknown> = {}) => ({
  id: DEAL_ID,
  number: 41,
  contactId: CONTACT_ID,
  organizationId: ORG_ID,
  customFields: { lead_id: LEAD_ID, formulario: 'parcial' },
  ...over,
});

describe('parseLead', () => {
  it('accepts a complete submission and normalizes it', () => {
    expect(parseLead(completeBody, NOW)).toEqual({
      status: 'ok',
      lead: {
        leadId: LEAD_ID,
        stage: 'complete',
        kind: 'empresa',
        name: 'Maria Souza',
        whatsapp: '+5548999724312',
        email: 'maria@empresa.com.br',
        company: 'Distribuidora Sul',
        message: 'O comercial gasta 3 horas por dia montando propostas.',
        lang: 'pt',
        origin: 'instagram',
      },
    });
  });

  it('treats a filled honeypot or an instant submission as spam', () => {
    expect(parseLead({ ...completeBody, website: 'http://spam' }, NOW).status).toBe('spam');
    expect(parseLead({ ...completeBody, startedAt: NOW - 500 }, NOW).status).toBe('spam');
  });

  it.each([
    ['leadId', { leadId: 'abc' }],
    ['kind', { kind: 'curso' }],
    ['name', { name: ' ' }],
    ['whatsapp', { whatsapp: '9999' }],
    ['email', { email: 'nope' }],
    ['company', { company: '' }],
    ['message', { message: 'oi' }],
    ['consent', { consent: false }],
  ])('rejects a complete submission with a bad %s', (_field, patch) => {
    expect(parseLead({ ...completeBody, ...patch }, NOW).status).toBe('invalid');
  });

  it('keeps the country code of a number typed with +', () => {
    const result = parseLead({ ...completeBody, whatsapp: '+1 (415) 555-1234' }, NOW);
    expect(result.status === 'ok' && result.lead.whatsapp).toBe('+14155551234');
  });

  it('accepts a partial save with only an e-mail, without consent', () => {
    const result = parseLead(
      { leadId: LEAD_ID, stage: 'partial', kind: 'advisor', email: 'ana@x.com', startedAt: NOW - 30_000 },
      NOW
    );
    expect(result).toEqual({
      status: 'ok',
      lead: { leadId: LEAD_ID, stage: 'partial', kind: 'advisor', email: 'ana@x.com' },
    });
  });

  it('accepts a partial save with only a WhatsApp number', () => {
    const result = parseLead({ leadId: LEAD_ID, stage: 'partial', kind: 'advisor', whatsapp: '48 99972-4312' }, NOW);
    expect(result.status === 'ok' && result.lead.whatsapp).toBe('+5548999724312');
  });

  it('drops a half-typed e-mail on a partial save that has a valid number', () => {
    const result = parseLead(
      { leadId: LEAD_ID, stage: 'partial', kind: 'advisor', email: 'ana@', whatsapp: '48999724312' },
      NOW
    );
    expect(result.status === 'ok' && result.lead.email).toBeUndefined();
  });

  it('rejects a partial save without a valid e-mail or number', () => {
    const result = parseLead({ leadId: LEAD_ID, stage: 'partial', kind: 'advisor', email: 'ana@', name: 'Ana' }, NOW);
    expect(result.status).toBe('invalid');
  });

  it('keeps a well-formed Trama ref and drops a malformed one', () => {
    const ok = parseLead({ ...completeBody, ref: { dealId: DEAL_ID, extra: 'x' } }, NOW);
    expect(ok.status === 'ok' && ok.lead.ref).toEqual({ dealId: DEAL_ID });
    const bad = parseLead({ ...completeBody, ref: { dealId: '../admin' } }, NOW);
    expect(bad.status === 'ok' && bad.lead.ref).toBeUndefined();
  });
});

describe('saveToTrama', () => {
  it('creates organization, contact, deal and note for a new complete lead', async () => {
    const { calls, fetchFn } = fakeFetch({
      [`GET ${T}/crm/contacts`]: () => ({ json: { data: [] } }),
      [`GET ${T}/crm/organizations`]: () => ({ json: { data: [{ id: 'x', name: 'Distribuidora Sul Ltda' }] } }),
      [`POST ${T}/crm/organizations`]: () => ({ json: { id: ORG_ID } }),
      [`POST ${T}/crm/contacts`]: () => ({ json: { id: CONTACT_ID } }),
      [`POST ${T}/boards/${TRAMA.boardId}/deals`]: () => ({ json: deal() }),
      [`POST ${T}/boards/${TRAMA.boardId}/deals/${DEAL_ID}/notes`]: () => ({ json: { id: 'n1' } }),
    });

    const result = await saveToTrama(lead, env, fetchFn);

    expect(result).toEqual({
      ref: { dealId: DEAL_ID },
      url: 'https://tasks.fator.ai/blockful/fator/41',
    });
    expect(calls[0].headers.authorization).toBe('Bearer tm_test');
    expect(calls.find((c) => c.path.endsWith('/crm/contacts') && c.method === 'GET')!.url.searchParams.get('q')).toBe(
      'maria@empresa.com.br'
    );
    expect(calls.find((c) => c.method === 'POST' && c.path.endsWith('/crm/organizations'))!.body).toEqual({
      name: 'Distribuidora Sul',
    });
    expect(calls.find((c) => c.method === 'POST' && c.path.endsWith('/crm/contacts'))!.body).toEqual({
      name: 'Maria Souza',
      email: 'maria@empresa.com.br',
      phone: '+5548999724312',
      organizationId: ORG_ID,
    });
    expect(calls.find((c) => c.method === 'POST' && c.path.endsWith('/deals'))!.body).toEqual({
      title: 'Distribuidora Sul: Palestra (alexnet.to)',
      stageId: TRAMA.stageId,
      currency: 'BRL',
      ownerId: TRAMA.ownerId,
      contactId: CONTACT_ID,
      organizationId: ORG_ID,
      customFields: { origem: 'alexnet.to', interesse: 'palestra', formulario: 'completo', lead_id: LEAD_ID },
    });
    const note = calls.find((c) => c.path.endsWith('/notes'))!.body.body as string;
    expect(note).toContain('Procura: Palestra');
    expect(note).toContain('Evento para 200 gestores em março.');
  });

  it('saves a partial lead with only a number, named by the number, without a note', async () => {
    const { calls, fetchFn } = fakeFetch({
      [`GET ${T}/crm/contacts`]: () => ({ json: { data: [] } }),
      [`POST ${T}/crm/contacts`]: () => ({ json: { id: CONTACT_ID } }),
      [`POST ${T}/boards/${TRAMA.boardId}/deals`]: () => ({ json: deal({ organizationId: null }) }),
    });

    await saveToTrama(
      { leadId: LEAD_ID, stage: 'partial', kind: 'advisor', whatsapp: '+5548999724312' },
      env,
      fetchFn
    );

    expect(calls.find((c) => c.method === 'GET')!.url.searchParams.get('q')).toBe('+5548999724312');
    expect(calls.find((c) => c.method === 'POST' && c.path.endsWith('/crm/contacts'))!.body).toEqual({
      name: '+5548999724312',
      phone: '+5548999724312',
    });
    const created = calls.find((c) => c.path.endsWith('/deals'))!.body;
    expect(created.title).toBe('+5548999724312: Advisor (alexnet.to)');
    expect(created.customFields.formulario).toBe('parcial');
    expect(calls.some((c) => c.path.includes('organizations') || c.path.endsWith('/notes'))).toBe(false);
  });

  it('reuses a contact found by e-mail and an organization with the same name', async () => {
    const { calls, fetchFn } = fakeFetch({
      [`GET ${T}/crm/contacts`]: () => ({
        json: { data: [{ id: CONTACT_ID, email: 'MARIA@empresa.com.br', phone: null, organizationId: null }] },
      }),
      [`GET ${T}/crm/organizations`]: () => ({ json: { data: [{ id: ORG_ID, name: 'distribuidora sul' }] } }),
      [`PATCH ${T}/crm/contacts/${CONTACT_ID}`]: () => ({ json: { id: CONTACT_ID } }),
      [`POST ${T}/boards/${TRAMA.boardId}/deals`]: () => ({ json: deal() }),
      [`POST ${T}/boards/${TRAMA.boardId}/deals/${DEAL_ID}/notes`]: () => ({ json: { id: 'n1' } }),
    });

    await saveToTrama(lead, env, fetchFn);

    expect(calls.some((c) => c.method === 'POST' && c.path.includes('/crm/'))).toBe(false);
    expect(calls.find((c) => c.method === 'PATCH')!.body).toEqual({
      name: 'Maria Souza',
      email: 'maria@empresa.com.br',
      phone: '+5548999724312',
      organizationId: ORG_ID,
    });
  });

  it('updates the deal from a verified ref instead of creating another', async () => {
    const { calls, fetchFn } = fakeFetch({
      [`GET ${T}/boards/${TRAMA.boardId}/deals/${DEAL_ID}`]: () => ({ json: deal() }),
      [`GET ${T}/crm/organizations`]: () => ({ json: { data: [{ id: ORG_ID, name: 'Distribuidora Sul' }] } }),
      [`PATCH ${T}/crm/contacts/${CONTACT_ID}`]: () => ({ json: { id: CONTACT_ID } }),
      [`PATCH ${T}/boards/${TRAMA.boardId}/deals/${DEAL_ID}`]: () => ({ json: deal() }),
      [`POST ${T}/boards/${TRAMA.boardId}/deals/${DEAL_ID}/notes`]: () => ({ json: { id: 'n1' } }),
    });

    const result = await saveToTrama({ ...lead, ref: { dealId: DEAL_ID } }, env, fetchFn);

    expect(result.ref).toEqual({ dealId: DEAL_ID });
    expect(calls.some((c) => c.method === 'POST' && c.path.endsWith('/deals'))).toBe(false);
    expect(calls.some((c) => c.path.endsWith('/crm/contacts') && c.method === 'GET')).toBe(false);
    const patch = calls.find((c) => c.method === 'PATCH' && c.path.includes('/deals/'))!.body;
    expect(patch).toEqual({
      title: 'Distribuidora Sul: Palestra (alexnet.to)',
      contactId: CONTACT_ID,
      organizationId: ORG_ID,
      customFields: { origem: 'alexnet.to', interesse: 'palestra', formulario: 'completo', lead_id: LEAD_ID },
    });
    expect(calls.some((c) => c.path.endsWith('/notes'))).toBe(true);
  });

  it('ignores a ref whose deal belongs to another lead', async () => {
    const { calls, fetchFn } = fakeFetch({
      [`GET ${T}/boards/${TRAMA.boardId}/deals/${DEAL_ID}`]: () => ({
        json: deal({ customFields: { lead_id: 'someone-else' } }),
      }),
      [`GET ${T}/crm/contacts`]: () => ({ json: { data: [] } }),
      [`POST ${T}/crm/contacts`]: () => ({ json: { id: CONTACT_ID } }),
      [`POST ${T}/boards/${TRAMA.boardId}/deals`]: () => ({ json: deal({ id: 'new-deal', number: 42 }) }),
    });

    const partial: Lead = { leadId: LEAD_ID, stage: 'partial', kind: 'advisor', email: 'ana@x.com' };
    const result = await saveToTrama({ ...partial, ref: { dealId: DEAL_ID } }, env, fetchFn);

    expect(result.ref).toEqual({ dealId: 'new-deal' });
    expect(calls.some((c) => c.method === 'PATCH')).toBe(false);
  });

  it('never turns a completed deal back into a partial one', async () => {
    const { calls, fetchFn } = fakeFetch({
      [`GET ${T}/boards/${TRAMA.boardId}/deals/${DEAL_ID}`]: () => ({
        json: deal({ organizationId: null, customFields: { lead_id: LEAD_ID, formulario: 'completo' } }),
      }),
      [`PATCH ${T}/crm/contacts/${CONTACT_ID}`]: () => ({ json: { id: CONTACT_ID } }),
      [`PATCH ${T}/boards/${TRAMA.boardId}/deals/${DEAL_ID}`]: () => ({ json: deal() }),
    });

    await saveToTrama(
      { leadId: LEAD_ID, stage: 'partial', kind: 'advisor', email: 'ana@x.com', ref: { dealId: DEAL_ID } },
      env,
      fetchFn
    );

    const patch = calls.find((c) => c.method === 'PATCH' && c.path.includes('/deals/'))!.body;
    expect(patch.customFields.formulario).toBe('completo');
  });

  it('uses the person name and no organization when the company field is a LinkedIn URL', async () => {
    const { calls, fetchFn } = fakeFetch({
      [`GET ${T}/crm/contacts`]: () => ({ json: { data: [] } }),
      [`POST ${T}/crm/contacts`]: () => ({ json: { id: CONTACT_ID } }),
      [`POST ${T}/boards/${TRAMA.boardId}/deals`]: () => ({ json: deal({ organizationId: null }) }),
      [`POST ${T}/boards/${TRAMA.boardId}/deals/${DEAL_ID}/notes`]: () => ({ json: { id: 'n1' } }),
    });

    await saveToTrama({ ...lead, company: 'linkedin.com/in/maria' }, env, fetchFn);

    expect(calls.some((c) => c.path.includes('organizations'))).toBe(false);
    expect(calls.find((c) => c.path.endsWith('/deals'))!.body.title).toBe('Maria Souza: Palestra (alexnet.to)');
  });

  it('fails clearly without an API key', async () => {
    await expect(saveToTrama(lead, {}, fakeFetch({}).fetchFn)).rejects.toThrow('TRAMA_API_KEY');
  });
});

describe('saveToSheet', () => {
  it('posts one row keyed by the lead id, with labels and the Trama link', async () => {
    const { calls, fetchFn } = fakeFetch({
      [`POST script.google.com/macros/s/abc/exec`]: () => ({ json: { ok: true, row: 2 } }),
    });

    await saveToSheet(lead, 'https://tasks.fator.ai/blockful/fator/41', env, fetchFn);

    expect(calls[0].body).toEqual({
      leadId: LEAD_ID,
      stage: 'Completo',
      kind: 'Palestra',
      name: 'Maria Souza',
      email: 'maria@empresa.com.br',
      whatsapp: '+5548999724312',
      company: 'Distribuidora Sul',
      message: 'Evento para 200 gestores em março.',
      lang: 'pt',
      origin: 'instagram',
      trama: 'https://tasks.fator.ai/blockful/fator/41',
    });
  });

  it('fails when the script answers without ok', async () => {
    const { fetchFn } = fakeFetch({
      [`POST script.google.com/macros/s/abc/exec`]: () => ({ json: { ok: false, error: 'leadId' } }),
    });
    await expect(saveToSheet(lead, '', env, fetchFn)).rejects.toThrow('Planilha');
  });

  it('fails clearly without the script URL', async () => {
    await expect(saveToSheet(lead, '', {}, fakeFetch({}).fetchFn)).rejects.toThrow('LEADS_SHEET_URL');
  });
});

describe('submitLead', () => {
  it('saves to Trama, then to the sheet with the deal link', async () => {
    const { calls, fetchFn } = fakeFetch({
      [`GET ${T}/crm/contacts`]: () => ({ json: { data: [] } }),
      [`POST ${T}/crm/contacts`]: () => ({ json: { id: CONTACT_ID } }),
      [`POST ${T}/boards/${TRAMA.boardId}/deals`]: () => ({ json: deal({ organizationId: null }) }),
      [`POST script.google.com/macros/s/abc/exec`]: () => ({ json: { ok: true } }),
    });

    const partial: Lead = { leadId: LEAD_ID, stage: 'partial', kind: 'advisor', email: 'ana@x.com' };
    const result = await submitLead(partial, env, fetchFn);

    expect(result).toMatchObject({ ok: true, ref: { dealId: DEAL_ID }, trama: { ok: true }, sheet: { ok: true } });
    expect(calls.at(-1)!.body.trama).toBe('https://tasks.fator.ai/blockful/fator/41');
  });

  it('still succeeds when only the sheet works', async () => {
    const { calls, fetchFn } = fakeFetch({
      [`POST script.google.com/macros/s/abc/exec`]: () => ({ json: { ok: true } }),
    });

    const result = await submitLead(lead, env, fetchFn);

    expect(result.ok).toBe(true);
    expect(result.trama.ok).toBe(false);
    expect(calls.at(-1)!.body.trama).toBe('');
  });

  it('fails when neither destination works', async () => {
    const result = await submitLead(lead, {}, fakeFetch({}).fetchFn);
    expect(result.ok).toBe(false);
  });
});
