/**
 * Contact form (/contact) → Pipedrive lead + e-mail notice.
 *
 * Pipedrive is the Fator CRM: owner and custom field keys below are the same
 * ones the team uses by hand. Every network call takes an injected `fetch`
 * so the flow is testable without touching the real CRM.
 */

export const LEAD_KINDS = ['palestra', 'advisor', 'empresa'] as const;
export type LeadKind = (typeof LEAD_KINDS)[number];

export const KIND_LABEL: Record<LeadKind, string> = {
  palestra: 'Palestra',
  advisor: 'Advisor',
  empresa: 'IA na empresa',
};

export const REVENUE_BANDS = [
  { value: 'ate-1', label: 'Até R$ 1 mi' },
  { value: '1-10', label: 'R$ 1 a 10 mi' },
  { value: '10-50', label: 'R$ 10 a 50 mi' },
  { value: '50-100', label: 'R$ 50 a 100 mi' },
  { value: '100+', label: 'Acima de R$ 100 mi' },
] as const;

export interface Lead {
  kind: LeadKind;
  name: string;
  /** E.164, e.g. +5548999724312 */
  whatsapp: string;
  email: string;
  /** Company, event or LinkedIn URL, as typed. */
  company: string;
  revenue?: string;
  message: string;
}

export type ParseResult =
  | { status: 'ok'; lead: Lead }
  | { status: 'invalid'; error: string }
  | { status: 'spam' };

export interface LeadEnv {
  PIPEDRIVE_API_TOKEN?: string;
  PIPEDRIVE_OWNER_ID?: string;
  RESEND_API_KEY?: string;
  LEAD_NOTIFY_TO?: string;
  LEAD_NOTIFY_FROM?: string;
}

const MIN_FILL_MS = 3_000;
const PIPEDRIVE_API = 'https://api.pipedrive.com/v1';
const DEFAULT_OWNER_ID = 27928694; // Alex
const DEFAULT_FROM = 'alexnet.to <contact@fator.ai>';
const PERSON_ORIGIN_FIELD = 'cfd4b3301bd834a7816a1276eb56e7aeea9892eb';
const PERSON_LINKEDIN_FIELD = '912daabd805393f14676f58a212f19e191921647';

const text = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

function normalizeWhatsapp(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  // A leading + means the country code is already there (the form is also in English).
  if (raw.startsWith('+')) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  if (digits.length === 10 || digits.length === 11) return `+55${digits}`;
  if (digits.length >= 12 && digits.length <= 15) return `+${digits}`;
  return null;
}

export function parseLead(body: unknown, now = Date.now()): ParseResult {
  if (!body || typeof body !== 'object') return { status: 'invalid', error: 'Formulário inválido.' };
  const b = body as Record<string, unknown>;

  // Humans never see "website"; bots fill everything and submit instantly.
  if (text(b.website, 200) !== '') return { status: 'spam' };
  const startedAt = Number(b.startedAt);
  if (Number.isFinite(startedAt) && startedAt > 0 && now - startedAt < MIN_FILL_MS) return { status: 'spam' };

  const kind = text(b.kind, 20) as LeadKind;
  if (!LEAD_KINDS.includes(kind)) return { status: 'invalid', error: 'Escolha o que você procura.' };

  const name = text(b.name, 120);
  if (name.length < 2) return { status: 'invalid', error: 'Informe seu nome.' };

  const whatsapp = normalizeWhatsapp(text(b.whatsapp, 40));
  if (!whatsapp) return { status: 'invalid', error: 'Informe um WhatsApp com DDD.' };

  const email = text(b.email, 200).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { status: 'invalid', error: 'Informe um e-mail válido.' };

  const company = text(b.company, 200);
  if (company.length < 2) return { status: 'invalid', error: 'Informe a empresa, o evento ou o seu LinkedIn.' };

  const revenueRaw = text(b.revenue, 20);
  const revenue = revenueRaw === '' ? undefined : revenueRaw;
  if (revenue && !REVENUE_BANDS.some((band) => band.value === revenue)) {
    return { status: 'invalid', error: 'Escolha uma faixa de faturamento.' };
  }

  const message = text(b.message, 2000);
  if (message.length < 5) return { status: 'invalid', error: 'Conte em poucas linhas o que você precisa.' };

  if (b.consent !== true) return { status: 'invalid', error: 'Para enviar, aceite a política de privacidade.' };

  return { status: 'ok', lead: { kind, name, whatsapp, email, company, revenue, message } };
}

const isLinkedin = (value: string) => /linkedin\.com\//i.test(value);
const asUrl = (value: string) => (/^https?:\/\//i.test(value) ? value : `https://${value}`);
const revenueLabel = (value?: string) => REVENUE_BANDS.find((band) => band.value === value)?.label ?? 'Não informado';

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function summaryLines(lead: Lead): [string, string][] {
  return [
    ['Procura', KIND_LABEL[lead.kind]],
    ['Nome', lead.name],
    ['WhatsApp', lead.whatsapp],
    ['E-mail', lead.email],
    ['Empresa, evento ou LinkedIn', lead.company],
    ['Faturamento anual', revenueLabel(lead.revenue)],
  ];
}

export async function createPipedriveLead(
  lead: Lead,
  env: LeadEnv,
  fetchFn: typeof fetch = fetch
): Promise<{ leadId: string; url: string }> {
  const token = env.PIPEDRIVE_API_TOKEN;
  if (!token) throw new Error('Pipedrive não configurado (PIPEDRIVE_API_TOKEN).');
  const ownerId = Number(env.PIPEDRIVE_OWNER_ID) || DEFAULT_OWNER_ID;

  const call = async (step: string, method: 'GET' | 'POST', path: string, params: Record<string, string> = {}, body?: unknown) => {
    const url = new URL(`${PIPEDRIVE_API}${path}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    url.searchParams.set('api_token', token);
    const res = await fetchFn(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = (await res.json().catch(() => null)) as { success?: boolean; data?: any } | null;
    if (!res.ok || !json?.success) throw new Error(`Pipedrive falhou em ${step} (HTTP ${res.status}).`);
    return json.data;
  };

  const firstId = (data: any): number | undefined => data?.items?.[0]?.item?.id;
  const linkedin = isLinkedin(lead.company) ? asUrl(lead.company) : undefined;

  let personId = firstId(
    await call('busca de pessoa', 'GET', '/persons/search', {
      term: lead.email,
      fields: 'email',
      exact_match: 'true',
      limit: '1',
    })
  );
  if (!personId) {
    const person = await call('criação de pessoa', 'POST', '/persons', {}, {
      name: lead.name,
      owner_id: ownerId,
      email: [{ value: lead.email, primary: true, label: 'work' }],
      phone: [{ value: lead.whatsapp, primary: true, label: 'mobile' }],
      [PERSON_ORIGIN_FIELD]: `alexnet.to (${KIND_LABEL[lead.kind]})`,
      ...(linkedin ? { [PERSON_LINKEDIN_FIELD]: linkedin } : {}),
    });
    personId = person.id as number;
  }

  let organizationId: number | undefined;
  if (!linkedin) {
    organizationId = firstId(
      await call('busca de organização', 'GET', '/organizations/search', {
        term: lead.company,
        fields: 'name',
        exact_match: 'true',
        limit: '1',
      })
    );
    if (!organizationId) {
      const org = await call('criação de organização', 'POST', '/organizations', {}, { name: lead.company, owner_id: ownerId });
      organizationId = org.id as number;
    }
  }

  const created = await call('criação do lead', 'POST', '/leads', {}, {
    title: `${linkedin ? lead.name : lead.company}: ${KIND_LABEL[lead.kind]} (alexnet.to)`,
    owner_id: ownerId,
    person_id: personId,
    ...(organizationId ? { organization_id: organizationId } : {}),
  });
  const leadId = String(created.id);

  const content = [
    '<p><b>Formulário do alexnet.to</b></p>',
    `<ul>${summaryLines(lead).map(([k, v]) => `<li><b>${escapeHtml(k)}:</b> ${escapeHtml(v)}</li>`).join('')}</ul>`,
    `<p>${escapeHtml(lead.message).replace(/\n/g, '<br>')}</p>`,
  ].join('');
  await call('criação da nota', 'POST', '/notes', {}, { content, lead_id: leadId });

  return { leadId, url: `https://app.pipedrive.com/leads/inbox/${leadId}` };
}

type PipedriveOutcome = { ok: true; leadId: string; url: string } | { ok: false; error: string };

export async function sendNotification(
  lead: Lead,
  pipedrive: PipedriveOutcome,
  env: LeadEnv,
  fetchFn: typeof fetch = fetch
): Promise<void> {
  const key = env.RESEND_API_KEY;
  const to = env.LEAD_NOTIFY_TO;
  if (!key || !to) throw new Error('E-mail não configurado (RESEND_API_KEY, LEAD_NOTIFY_TO).');

  const body = [
    ...summaryLines(lead).map(([k, v]) => `${k}: ${v}`),
    '',
    lead.message,
    '',
    pipedrive.ok ? `Lead no Pipedrive: ${pipedrive.url}` : `ATENÇÃO: ${pipedrive.error} Cadastre à mão.`,
  ].join('\n');

  const res = await fetchFn('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env.LEAD_NOTIFY_FROM || DEFAULT_FROM,
      to: [to],
      reply_to: lead.email,
      subject: `[alexnet.to] ${KIND_LABEL[lead.kind]}: ${lead.name} (${lead.company})`,
      text: body,
    }),
  });
  if (!res.ok) throw new Error(`Resend falhou (HTTP ${res.status}).`);
}

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Pipedrive first (so the e-mail can link the lead), then the e-mail. Either one is enough. */
export async function submitLead(lead: Lead, env: LeadEnv, fetchFn: typeof fetch = fetch) {
  const pipedrive: PipedriveOutcome = await createPipedriveLead(lead, env, fetchFn).then(
    (r) => ({ ok: true as const, ...r }),
    (e) => ({ ok: false as const, error: errorMessage(e) })
  );
  const email = await sendNotification(lead, pipedrive, env, fetchFn).then(
    () => ({ ok: true as const }),
    (e) => ({ ok: false as const, error: errorMessage(e) })
  );
  return { ok: pipedrive.ok || email.ok, pipedrive, email };
}
