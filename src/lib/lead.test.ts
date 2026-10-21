import { describe, expect, it } from 'vitest';
import { parseLead, saveToSheet, saveToTrama, submitLead, TRAMA, type Lead } from './lead';

const NOW = 1_800_000_000_000;
const LEAD_ID = '6f1c2d3e-4b5a-4c6d-8e7f-901a2b3c4d5e';
const TASK_ID = '11111111-1111-4111-8111-111111111111';
const SHEET_URL = 'https://script.google.com/macros/s/abc/exec';
const env = { TRAMA_API_KEY: 'tm_test', LEADS_SHEET_URL: SHEET_URL };

const completeBody = {
  leadId: LEAD_ID,
  stage: 'complete',
  kind: 'empresa',
  name: '  Maria Souza ',
  whatsapp: '(48) 99972-4312',
  phoneCountry: 'BR',
  email: 'Maria@Empresa.com.br',
  company: 'Distribuidora Sul',
  role: 'ceo',
  revenue: '10m_50m',
  linkedin: 'linkedin.com/in/maria-souza?utm_source=share',
  message: 'O comercial gasta 3 horas por dia montando propostas.',
  lang: 'pt',
  origin: 'instagram',
  page: '/links',
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
  role: 'ceo',
  revenue: '10m_50m',
  linkedin: 'https://www.linkedin.com/in/maria-souza',
  message: 'Evento para 200 gestores em março.',
  lang: 'pt',
  origin: 'instagram',
  page: '/contact',
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
const TASKS = `${T}/boards/${TRAMA.boardId}/tasks`;
const task = (over: Record<string, unknown> = {}) => ({
  id: TASK_ID,
  number: 41,
  statusId: TRAMA.status.partial,
  customFields: { lead_id: LEAD_ID },
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
        role: 'ceo',
        revenue: '10m_50m',
        linkedin: 'https://www.linkedin.com/in/maria-souza',
        message: 'O comercial gasta 3 horas por dia montando propostas.',
        lang: 'pt',
        origin: 'instagram',
        page: '/links',
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
    ['company that is only a LinkedIn link', { company: 'linkedin.com/in/maria', linkedin: '' }],
    ['role', { role: 'rei' }],
    ['missing role', { role: '' }],
    ['Other role without a description', { role: 'outro', roleOther: ' ' }],
    ['revenue', { revenue: '1bi' }],
    ['missing revenue', { revenue: '' }],
    ['LinkedIn', { linkedin: 'facebook.com/maria' }],
    ['message', { message: 'oi' }],
    ['revenue band no longer offered', { revenue: 'nao_informar' }],
  ])('rejects a complete submission with a bad %s', (_field, patch) => {
    expect(parseLead({ ...completeBody, ...patch }, NOW).status).toBe('invalid');
  });

  it('needs no consent box', () => {
    expect(parseLead({ ...completeBody, consent: undefined }, NOW).status).toBe('ok');
  });

  it('reads the number with the country the person chose', () => {
    const result = parseLead({ ...completeBody, whatsapp: '213-373-4253', phoneCountry: 'US' }, NOW);
    expect(result.status === 'ok' && result.lead.whatsapp).toBe('+12133734253');
  });

  it('says why a number is refused', () => {
    const result = parseLead({ ...completeBody, whatsapp: '48 9997-4312' }, NOW);
    expect(result.status === 'invalid' && result.error).toMatch(/9 dígitos/);
  });

  it('keeps the role typed under Other, and only then', () => {
    const other = parseLead({ ...completeBody, role: 'outro', roleOther: ' Head de Inovação ' }, NOW);
    expect(other.status === 'ok' && other.lead).toMatchObject({ role: 'outro', roleOther: 'Head de Inovação' });
    const ceo = parseLead({ ...completeBody, roleOther: 'Head de Inovação' }, NOW);
    expect(ceo.status === 'ok' && ceo.lead.roleOther).toBeUndefined();
  });

  it('keeps valid extras on a partial save and drops a bad LinkedIn link', () => {
    const result = parseLead(
      { leadId: LEAD_ID, stage: 'partial', kind: 'advisor', email: 'ana@x.com', role: 'ceo', linkedin: 'facebook.com/ana' },
      NOW
    );
    expect(result.status === 'ok' && result.lead).toMatchObject({ role: 'ceo' });
    expect(result.status === 'ok' && result.lead.linkedin).toBeUndefined();
  });

  it('moves a LinkedIn link typed in the company field to the LinkedIn field on a partial save', () => {
    const result = parseLead(
      { leadId: LEAD_ID, stage: 'partial', kind: 'advisor', email: 'ana@x.com', company: 'www.linkedin.com/in/ana-lima/' },
      NOW
    );
    expect(result.status === 'ok' && result.lead).toMatchObject({ linkedin: 'https://www.linkedin.com/in/ana-lima' });
    expect(result.status === 'ok' && result.lead.company).toBeUndefined();
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
    const ok = parseLead({ ...completeBody, ref: { taskId: TASK_ID, extra: 'x' } }, NOW);
    expect(ok.status === 'ok' && ok.lead.ref).toEqual({ taskId: TASK_ID });
    const bad = parseLead({ ...completeBody, ref: { taskId: '../admin' } }, NOW);
    expect(bad.status === 'ok' && bad.lead.ref).toBeUndefined();
  });

  it('keeps only a site path as the form page', () => {
    const bad = parseLead({ ...completeBody, page: 'https://evil.example' }, NOW);
    expect(bad.status === 'ok' && bad.lead.page).toBeUndefined();
  });
});

describe('saveToTrama', () => {
  it('creates a card in "Novo" for a new complete lead', async () => {
    const { calls, fetchFn } = fakeFetch({
      [`POST ${TASKS}`]: () => ({ json: task({ statusId: TRAMA.status.complete }) }),
    });

    const result = await saveToTrama(lead, env, fetchFn);

    expect(result).toEqual({ ref: { taskId: TASK_ID }, url: 'https://tasks.fator.ai/blockful/alexnet-to/41' });
    expect(calls).toHaveLength(1);
    expect(calls[0].headers.authorization).toBe('Bearer tm_test');
    const body = calls[0].body;
    expect(body).toMatchObject({
      title: 'Distribuidora Sul: Palestra',
      statusId: TRAMA.status.complete,
      assigneeId: TRAMA.ownerId,
      customFields: {
        interesse: 'palestra',
        email: 'maria@empresa.com.br',
        whatsapp: '+5548999724312',
        empresa: 'Distribuidora Sul',
        cargo: 'ceo',
        faturamento: '10m_50m',
        linkedin: 'https://www.linkedin.com/in/maria-souza',
        origem: 'instagram',
        pagina: '/contact',
        idioma: 'pt',
        lead_id: LEAD_ID,
      },
    });
    expect(body.description).toContain('Evento para 200 gestores em março.');
    expect(body.description).toContain('Maria Souza');
    expect(body.description).toContain('CEO ou presidente');
    expect(body.description).toContain('R$ 10 a 50 milhões');
  });

  it('writes the role typed under Other in the description', async () => {
    const { calls, fetchFn } = fakeFetch({ [`POST ${TASKS}`]: () => ({ json: task() }) });

    await saveToTrama({ ...lead, role: 'outro', roleOther: 'Head de Inovação' }, env, fetchFn);

    expect(calls[0].body.customFields.cargo).toBe('outro');
    expect(calls[0].body.description).toContain('Outro: Head de Inovação');
  });

  it('creates a partial lead in "Formulário incompleto", named by the number', async () => {
    const { calls, fetchFn } = fakeFetch({ [`POST ${TASKS}`]: () => ({ json: task() }) });

    await saveToTrama({ leadId: LEAD_ID, stage: 'partial', kind: 'advisor', whatsapp: '+5548999724312' }, env, fetchFn);

    expect(calls[0].body).toMatchObject({
      title: '+5548999724312: Advisor',
      statusId: TRAMA.status.partial,
      customFields: { interesse: 'advisor', whatsapp: '+5548999724312', lead_id: LEAD_ID },
    });
    expect(calls[0].body.customFields).not.toHaveProperty('email');
  });

  it('completes the card of an earlier partial save and moves it to "Novo"', async () => {
    const { calls, fetchFn } = fakeFetch({
      [`GET ${TASKS}/${TASK_ID}`]: () => ({ json: task() }),
      [`PATCH ${TASKS}/${TASK_ID}`]: () => ({ json: task({ statusId: TRAMA.status.complete }) }),
    });

    const result = await saveToTrama({ ...lead, ref: { taskId: TASK_ID } }, env, fetchFn);

    expect(result.ref).toEqual({ taskId: TASK_ID });
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
    const patch = calls.find((c) => c.method === 'PATCH')!.body;
    expect(patch.statusId).toBe(TRAMA.status.complete);
    expect(patch.title).toBe('Distribuidora Sul: Palestra');
    expect(patch.customFields.lead_id).toBe(LEAD_ID);
  });

  it('keeps the stage Alex chose when the form is completed later', async () => {
    const { calls, fetchFn } = fakeFetch({
      [`GET ${TASKS}/${TASK_ID}`]: () => ({ json: task({ statusId: 'em-conversa' }) }),
      [`PATCH ${TASKS}/${TASK_ID}`]: () => ({ json: task({ statusId: 'em-conversa' }) }),
    });

    await saveToTrama({ ...lead, ref: { taskId: TASK_ID } }, env, fetchFn);

    expect(calls.find((c) => c.method === 'PATCH')!.body).not.toHaveProperty('statusId');
  });

  it('leaves a card alone on a partial save once it left "Formulário incompleto"', async () => {
    const { calls, fetchFn } = fakeFetch({
      [`GET ${TASKS}/${TASK_ID}`]: () => ({ json: task({ statusId: TRAMA.status.complete }) }),
    });

    const result = await saveToTrama(
      { leadId: LEAD_ID, stage: 'partial', kind: 'advisor', email: 'ana@x.com', ref: { taskId: TASK_ID } },
      env,
      fetchFn
    );

    expect(result).toEqual({ ref: { taskId: TASK_ID }, url: 'https://tasks.fator.ai/blockful/alexnet-to/41' });
    expect(calls.map((c) => c.method)).toEqual(['GET']);
  });

  it('ignores a ref whose card belongs to another lead', async () => {
    const { calls, fetchFn } = fakeFetch({
      [`GET ${TASKS}/${TASK_ID}`]: () => ({ json: task({ customFields: { lead_id: 'someone-else' } }) }),
      [`POST ${TASKS}`]: () => ({ json: task({ id: 'new-task', number: 42 }) }),
    });

    const partial: Lead = { leadId: LEAD_ID, stage: 'partial', kind: 'advisor', email: 'ana@x.com' };
    const result = await saveToTrama({ ...partial, ref: { taskId: TASK_ID } }, env, fetchFn);

    expect(result.ref).toEqual({ taskId: 'new-task' });
    expect(calls.some((c) => c.method === 'PATCH')).toBe(false);
  });

  it('titles the card with the person name when there is no company', async () => {
    const { calls, fetchFn } = fakeFetch({ [`POST ${TASKS}`]: () => ({ json: task() }) });

    await saveToTrama({ ...lead, company: undefined }, env, fetchFn);

    expect(calls[0].body.title).toBe('Maria Souza: Palestra');
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

    await saveToSheet(lead, 'https://tasks.fator.ai/blockful/alexnet-to/41', env, fetchFn);

    expect(calls[0].body).toEqual({
      leadId: LEAD_ID,
      stage: 'Completo',
      kind: 'Palestra',
      name: 'Maria Souza',
      role: 'CEO ou presidente',
      email: 'maria@empresa.com.br',
      whatsapp: '+5548999724312',
      company: 'Distribuidora Sul',
      revenue: 'R$ 10 a 50 milhões',
      linkedin: 'https://www.linkedin.com/in/maria-souza',
      message: 'Evento para 200 gestores em março.',
      lang: 'pt',
      origin: 'instagram',
      page: '/contact',
      trama: 'https://tasks.fator.ai/blockful/alexnet-to/41',
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
  it('saves to Trama, then to the sheet with the card link', async () => {
    const { calls, fetchFn } = fakeFetch({
      [`POST ${TASKS}`]: () => ({ json: task() }),
      [`POST script.google.com/macros/s/abc/exec`]: () => ({ json: { ok: true } }),
    });

    const partial: Lead = { leadId: LEAD_ID, stage: 'partial', kind: 'advisor', email: 'ana@x.com' };
    const result = await submitLead(partial, env, fetchFn);

    expect(result).toMatchObject({ ok: true, ref: { taskId: TASK_ID }, trama: { ok: true }, sheet: { ok: true } });
    expect(calls.at(-1)!.body.trama).toBe('https://tasks.fator.ai/blockful/alexnet-to/41');
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
