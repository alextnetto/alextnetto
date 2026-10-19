import { describe, expect, it } from 'vitest';
import { createPipedriveLead, parseLead, submitLead, type Lead } from './lead';

const NOW = 1_800_000_000_000;

const validBody = {
  kind: 'empresa',
  name: '  Maria Souza ',
  whatsapp: '(48) 99972-4312',
  email: 'Maria@Empresa.com.br',
  company: 'Distribuidora Sul',
  revenue: '10-50',
  message: 'O comercial gasta 3 horas por dia montando propostas.',
  consent: true,
  website: '',
  startedAt: NOW - 30_000,
};

const lead: Lead = {
  kind: 'palestra',
  name: 'Maria Souza',
  whatsapp: '+5548999724312',
  email: 'maria@empresa.com.br',
  company: 'Distribuidora Sul',
  revenue: '10-50',
  message: 'Evento para 200 gestores em março.',
};

type Call = { method: string; url: URL; body?: any };

/** Fake fetch that records calls and answers by "METHOD /path". */
function fakeFetch(routes: Record<string, (call: Call) => { status?: number; json: unknown }>) {
  const calls: Call[] = [];
  const fetchFn = async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const call: Call = { method, url, body: init?.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(call);
    const route = routes[`${method} ${url.host}${url.pathname}`];
    if (!route) return new Response(JSON.stringify({ success: false }), { status: 404 });
    const { status = 200, json } = route(call);
    return new Response(JSON.stringify(json), { status });
  };
  return { fetchFn: fetchFn as typeof fetch, calls };
}

const PD = 'api.pipedrive.com/v1';

const happyPipedrive = {
  [`GET ${PD}/persons/search`]: () => ({ json: { success: true, data: { items: [] } } }),
  [`POST ${PD}/persons`]: () => ({ json: { success: true, data: { id: 501 } } }),
  [`GET ${PD}/organizations/search`]: () => ({ json: { success: true, data: { items: [{ item: { id: 77 } }] } } }),
  [`POST ${PD}/organizations`]: () => ({ json: { success: true, data: { id: 78 } } }),
  [`POST ${PD}/leads`]: () => ({ json: { success: true, data: { id: 'lead-uuid' } } }),
  [`POST ${PD}/notes`]: () => ({ json: { success: true, data: { id: 9 } } }),
};

const env = { PIPEDRIVE_API_TOKEN: 'tok', RESEND_API_KEY: 're_key', LEAD_NOTIFY_TO: 'alex@example.com' };

describe('parseLead', () => {
  it('normalizes a valid submission', () => {
    const result = parseLead(validBody, NOW);
    expect(result).toEqual({
      status: 'ok',
      lead: {
        kind: 'empresa',
        name: 'Maria Souza',
        whatsapp: '+5548999724312',
        email: 'maria@empresa.com.br',
        company: 'Distribuidora Sul',
        revenue: '10-50',
        message: 'O comercial gasta 3 horas por dia montando propostas.',
      },
    });
  });

  it('keeps a number that already has the country code', () => {
    const result = parseLead({ ...validBody, whatsapp: '+55 48 99972-4312' }, NOW);
    expect(result.status === 'ok' && result.lead.whatsapp).toBe('+5548999724312');
  });

  it('reads a number typed with + as international, even with 11 digits', () => {
    const result = parseLead({ ...validBody, whatsapp: '+1 (415) 555-1234' }, NOW);
    expect(result.status === 'ok' && result.lead.whatsapp).toBe('+14155551234');
  });

  it('accepts a missing revenue', () => {
    const result = parseLead({ ...validBody, revenue: '' }, NOW);
    expect(result.status === 'ok' && result.lead.revenue).toBeUndefined();
  });

  it('flags the honeypot as spam', () => {
    expect(parseLead({ ...validBody, website: 'http://spam' }, NOW).status).toBe('spam');
  });

  it('flags submissions faster than 3 seconds as spam', () => {
    expect(parseLead({ ...validBody, startedAt: NOW - 1_000 }, NOW).status).toBe('spam');
  });

  it.each([
    ['kind', { kind: 'curso' }],
    ['name', { name: ' ' }],
    ['whatsapp', { whatsapp: '9999' }],
    ['email', { email: 'maria@' }],
    ['company', { company: '' }],
    ['revenue', { revenue: 'bilhões' }],
    ['message', { message: '' }],
    ['consent', { consent: false }],
  ])('rejects an invalid %s', (_field, patch) => {
    const result = parseLead({ ...validBody, ...patch }, NOW);
    expect(result.status).toBe('invalid');
    expect(result.status === 'invalid' && result.error).toMatch(/\S/);
  });

  it('rejects a non-object body', () => {
    expect(parseLead(null, NOW).status).toBe('invalid');
  });
});

describe('createPipedriveLead', () => {
  it('creates person, reuses the organization, creates lead and note', async () => {
    const { fetchFn, calls } = fakeFetch(happyPipedrive);
    const result = await createPipedriveLead(lead, env, fetchFn);

    expect(result).toEqual({ leadId: 'lead-uuid', url: 'https://app.pipedrive.com/leads/inbox/lead-uuid' });
    expect(calls.every((c) => c.url.searchParams.get('api_token') === 'tok')).toBe(true);

    const search = calls.find((c) => c.url.pathname.endsWith('/persons/search'))!;
    expect(search.url.searchParams.get('term')).toBe('maria@empresa.com.br');
    expect(search.url.searchParams.get('exact_match')).toBe('true');

    const person = calls.find((c) => c.method === 'POST' && c.url.pathname.endsWith('/persons'))!;
    expect(person.body).toMatchObject({
      name: 'Maria Souza',
      owner_id: 27928694,
      email: [{ value: 'maria@empresa.com.br', primary: true }],
      phone: [{ value: '+5548999724312', primary: true }],
      cfd4b3301bd834a7816a1276eb56e7aeea9892eb: 'alexnet.to (Palestra)',
    });

    expect(calls.some((c) => c.method === 'POST' && c.url.pathname.endsWith('/organizations'))).toBe(false);

    const created = calls.find((c) => c.url.pathname.endsWith('/leads'))!;
    expect(created.body).toEqual({
      title: 'Distribuidora Sul: Palestra (alexnet.to)',
      owner_id: 27928694,
      person_id: 501,
      organization_id: 77,
    });

    const note = calls.find((c) => c.url.pathname.endsWith('/notes'))!;
    expect(note.body.lead_id).toBe('lead-uuid');
    expect(note.body.content).toContain('Evento para 200 gestores em março.');
    expect(note.body.content).toContain('R$ 10 a 50 mi');
  });

  it('reuses an existing person and creates a missing organization', async () => {
    const { fetchFn, calls } = fakeFetch({
      ...happyPipedrive,
      [`GET ${PD}/persons/search`]: () => ({ json: { success: true, data: { items: [{ item: { id: 42 } }] } } }),
      [`GET ${PD}/organizations/search`]: () => ({ json: { success: true, data: { items: [] } } }),
    });
    await createPipedriveLead(lead, env, fetchFn);

    expect(calls.some((c) => c.method === 'POST' && c.url.pathname.endsWith('/persons'))).toBe(false);
    const org = calls.find((c) => c.method === 'POST' && c.url.pathname.endsWith('/organizations'))!;
    expect(org.body).toEqual({ name: 'Distribuidora Sul', owner_id: 27928694 });
    const created = calls.find((c) => c.url.pathname.endsWith('/leads'))!;
    expect(created.body).toMatchObject({ person_id: 42, organization_id: 78 });
  });

  it('treats a LinkedIn URL as the person profile, not an organization', async () => {
    const { fetchFn, calls } = fakeFetch(happyPipedrive);
    await createPipedriveLead({ ...lead, company: 'linkedin.com/in/mariasouza' }, env, fetchFn);

    expect(calls.some((c) => c.url.pathname.includes('/organizations'))).toBe(false);
    const person = calls.find((c) => c.method === 'POST' && c.url.pathname.endsWith('/persons'))!;
    expect(person.body['912daabd805393f14676f58a212f19e191921647']).toBe('https://linkedin.com/in/mariasouza');
    const created = calls.find((c) => c.url.pathname.endsWith('/leads'))!;
    expect(created.body).toEqual({
      title: 'Maria Souza: Palestra (alexnet.to)',
      owner_id: 27928694,
      person_id: 501,
    });
  });

  it('escapes HTML in the note', async () => {
    const { fetchFn, calls } = fakeFetch(happyPipedrive);
    await createPipedriveLead({ ...lead, message: '<script>x</script>' }, env, fetchFn);
    const note = calls.find((c) => c.url.pathname.endsWith('/notes'))!;
    expect(note.body.content).not.toContain('<script>');
    expect(note.body.content).toContain('&lt;script&gt;');
  });

  it('fails with the step name when Pipedrive rejects a call', async () => {
    const { fetchFn } = fakeFetch({
      ...happyPipedrive,
      [`POST ${PD}/leads`]: () => ({ status: 400, json: { success: false, error: 'bad' } }),
    });
    await expect(createPipedriveLead(lead, env, fetchFn)).rejects.toThrow(/lead/);
  });
});

describe('submitLead', () => {
  const resendOk = { 'POST api.resend.com/emails': () => ({ json: { id: 'email-1' } }) };

  it('succeeds when Pipedrive and e-mail both work', async () => {
    const { fetchFn, calls } = fakeFetch({ ...happyPipedrive, ...resendOk });
    const result = await submitLead(lead, env, fetchFn);

    expect(result.ok).toBe(true);
    const email = calls.find((c) => c.url.host === 'api.resend.com')!;
    expect(email.body).toMatchObject({ to: ['alex@example.com'], reply_to: 'maria@empresa.com.br' });
    expect(email.body.from).toContain('contact@fator.ai');
    expect(email.body.subject).toBe('[alexnet.to] Palestra: Maria Souza (Distribuidora Sul)');
    expect(email.body.text).toContain('https://app.pipedrive.com/leads/inbox/lead-uuid');
    expect(email.body.text).toContain('+5548999724312');
  });

  it('still succeeds through e-mail when Pipedrive fails, and says so in the e-mail', async () => {
    const { fetchFn, calls } = fakeFetch({
      ...happyPipedrive,
      ...resendOk,
      [`GET ${PD}/persons/search`]: () => ({ status: 500, json: { success: false } }),
    });
    const result = await submitLead(lead, env, fetchFn);

    expect(result.ok).toBe(true);
    expect(result.pipedrive.ok).toBe(false);
    const email = calls.find((c) => c.url.host === 'api.resend.com')!;
    expect(email.body.text).toMatch(/Pipedrive falhou/);
  });

  it('succeeds through Pipedrive when e-mail is not configured', async () => {
    const { fetchFn } = fakeFetch(happyPipedrive);
    const result = await submitLead(lead, { PIPEDRIVE_API_TOKEN: 'tok' }, fetchFn);
    expect(result.ok).toBe(true);
    expect(result.email.ok).toBe(false);
  });

  it('fails when neither channel works', async () => {
    const { fetchFn } = fakeFetch({});
    const result = await submitLead(lead, {}, fetchFn);
    expect(result.ok).toBe(false);
  });
});
