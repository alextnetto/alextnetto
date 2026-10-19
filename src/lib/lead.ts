/**
 * Contact form (/contact) → Trama CRM deal + Google Sheet row.
 *
 * The form saves twice: a partial save as soon as the visitor leaves a valid
 * e-mail or WhatsApp, and the complete submission. Both carry the same leadId,
 * so Trama keeps one deal and the sheet keeps one row per lead. Every network
 * call takes an injected `fetch` so the flow is testable without the real CRM.
 */

export const LEAD_KINDS = ['palestra', 'advisor', 'empresa'] as const;
export type LeadKind = (typeof LEAD_KINDS)[number];

export const KIND_LABEL: Record<LeadKind, string> = {
  palestra: 'Palestra',
  advisor: 'Advisor',
  empresa: 'IA na empresa',
};

export type LeadStage = 'partial' | 'complete';
const STAGE_LABEL: Record<LeadStage, string> = { partial: 'Parcial', complete: 'Completo' };

/** CRM board "fator" in the Fator workspace: stage Qualificação, owner Alex. */
export const TRAMA = {
  url: 'https://tasks.fator.ai',
  boardId: '4b83e35a-4d6b-45c0-bb6b-e8626b662362',
  boardPath: 'blockful/fator',
  stageId: '3bf587be-dcd6-4724-9473-9c8c58a39eda',
  ownerId: 'dd8af093-f5cd-4751-b75b-c9f6eb461a18',
} as const;

/** What the browser keeps between saves. Trusted only after the deal's lead_id matches. */
export interface TramaRef {
  dealId: string;
}

export interface Lead {
  leadId: string;
  stage: LeadStage;
  kind: LeadKind;
  name?: string;
  /** E.164, e.g. +5548999724312 */
  whatsapp?: string;
  email?: string;
  /** Company, event or LinkedIn URL, as typed. */
  company?: string;
  message?: string;
  lang?: 'pt' | 'en';
  /** utm_source or referrer, as computed by the form. */
  origin?: string;
  ref?: TramaRef;
}

export type ParseResult =
  | { status: 'ok'; lead: Lead }
  | { status: 'invalid'; error: string }
  | { status: 'spam' };

export interface LeadEnv {
  TRAMA_API_KEY?: string;
  TRAMA_URL?: string;
  /** Apps Script web app of the "Leads alexnet.to" sheet (tools/leads-sheet/Code.gs). */
  LEADS_SHEET_URL?: string;
}

const MIN_FILL_MS = 3_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const text = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

/** Drops empty values so partial saves never overwrite what is already stored. */
function compact<T extends Record<string, unknown>>(record: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined && value !== null && value !== '')
  ) as Partial<T>;
}

function normalizeWhatsapp(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  // A leading + means the country code is already there (the form is also in English).
  if (raw.startsWith('+')) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  if (digits.length === 10 || digits.length === 11) return `+55${digits}`;
  if (digits.length >= 12 && digits.length <= 15) return `+${digits}`;
  return null;
}

function parseRef(value: unknown): TramaRef | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const dealId = (value as Record<string, unknown>).dealId;
  return typeof dealId === 'string' && UUID.test(dealId) ? { dealId } : undefined;
}

const invalid = (error: string): ParseResult => ({ status: 'invalid', error });

export function parseLead(body: unknown, now = Date.now()): ParseResult {
  if (!body || typeof body !== 'object') return invalid('Formulário inválido.');
  const b = body as Record<string, unknown>;

  // Humans never see "website"; bots fill everything and submit instantly.
  if (text(b.website, 200) !== '') return { status: 'spam' };
  const startedAt = Number(b.startedAt);
  if (Number.isFinite(startedAt) && startedAt > 0 && now - startedAt < MIN_FILL_MS) return { status: 'spam' };

  const leadId = text(b.leadId, 36);
  if (!UUID.test(leadId)) return invalid('Formulário inválido. Atualize a página e tente de novo.');
  const stage: LeadStage = b.stage === 'partial' ? 'partial' : 'complete';

  const kind = text(b.kind, 20) as LeadKind;
  if (!LEAD_KINDS.includes(kind)) return invalid('Escolha o que você procura.');

  const name = text(b.name, 120);
  const whatsapp = normalizeWhatsapp(text(b.whatsapp, 40));
  const typedEmail = text(b.email, 200).toLowerCase();
  const email = EMAIL.test(typedEmail) ? typedEmail : null;
  const company = text(b.company, 200);
  const message = text(b.message, 2000);

  if (stage === 'complete') {
    if (name.length < 2) return invalid('Informe seu nome.');
    if (!whatsapp) return invalid('Informe um WhatsApp com DDD.');
    if (!email) return invalid('Informe um e-mail válido.');
    if (company.length < 2) return invalid('Informe a empresa, o evento ou o seu LinkedIn.');
    if (message.length < 5) return invalid('Conte em poucas linhas o que você precisa.');
    if (b.consent !== true) return invalid('Para enviar, marque a caixa de consentimento.');
  } else if (!whatsapp && !email) {
    return invalid('Informe um e-mail ou WhatsApp.');
  }

  const lead = compact({
    leadId,
    stage,
    kind,
    name,
    whatsapp,
    email,
    company,
    message,
    lang: b.lang === 'pt' || b.lang === 'en' ? b.lang : undefined,
    origin: text(b.origin, 300),
    ref: parseRef(b.ref),
  }) as Lead;
  return { status: 'ok', lead };
}

const isLinkedin = (value?: string) => !!value && /linkedin\.com\//i.test(value);
const sameText = (a?: string | null, b?: string | null) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

function noteText(lead: Lead): string {
  const lines: [string, string | undefined][] = [
    ['Procura', KIND_LABEL[lead.kind]],
    ['Nome', lead.name],
    ['WhatsApp', lead.whatsapp],
    ['E-mail', lead.email],
    ['Empresa, evento ou LinkedIn', lead.company],
    ['Idioma', lead.lang],
    ['Origem', lead.origin],
  ];
  return [
    'Formulário do alexnet.to',
    ...lines.filter(([, value]) => value).map(([key, value]) => `${key}: ${value}`),
    '',
    lead.message ?? '',
  ]
    .join('\n')
    .trim()
    .slice(0, 5000);
}

interface Deal {
  id: string;
  number: number;
  contactId: string | null;
  organizationId: string | null;
  customFields?: Record<string, unknown>;
}

interface Party {
  id: string;
  name?: string;
  email?: string | null;
  phone?: string | null;
  organizationId?: string | null;
}

/** Creates or updates contact, organization and deal; returns the ref for the next save. */
export async function saveToTrama(
  lead: Lead,
  env: LeadEnv,
  fetchFn: typeof fetch = fetch
): Promise<{ ref: TramaRef; url: string }> {
  const key = env.TRAMA_API_KEY;
  if (!key) throw new Error('Trama não configurado (TRAMA_API_KEY).');
  const base = (env.TRAMA_URL || TRAMA.url).replace(/\/+$/, '');

  const call = async (
    step: string,
    method: 'GET' | 'POST' | 'PATCH',
    path: string,
    { query, body }: { query?: Record<string, string>; body?: unknown } = {}
  ) => {
    const url = new URL(`${base}/v1${path}`);
    for (const [name, value] of Object.entries(query ?? {})) url.searchParams.set(name, value);
    const res = await fetchFn(url, {
      method,
      headers: { Authorization: `Bearer ${key}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error(`Trama falhou em ${step} (HTTP ${res.status}).`);
    return json;
  };
  const deals = `/boards/${TRAMA.boardId}/deals`;

  // A ref from the browser counts only when its deal carries this leadId.
  let existing: Deal | null = null;
  if (lead.ref) {
    const found: Deal | null = await call('leitura do deal', 'GET', `${deals}/${lead.ref.dealId}`).catch(() => null);
    if (found?.customFields?.lead_id === lead.leadId) existing = found;
  }

  const linkedin = isLinkedin(lead.company);
  let organizationId = existing?.organizationId ?? undefined;
  if (lead.company && !linkedin) {
    const { data } = await call('busca de organização', 'GET', '/crm/organizations', {
      query: { q: lead.company, limit: '20' },
    });
    const match = (data as Party[] | undefined)?.find((org) => sameText(org.name, lead.company));
    organizationId =
      match?.id ??
      (await call('criação de organização', 'POST', '/crm/organizations', { body: { name: lead.company } })).id;
  }

  let contactId = existing?.contactId ?? undefined;
  let contactHasOrganization = false;
  if (!contactId) {
    for (const q of [lead.email, lead.whatsapp].filter((value): value is string => !!value)) {
      const { data } = await call('busca de contato', 'GET', '/crm/contacts', { query: { q, limit: '20' } });
      const match = (data as Party[] | undefined)?.find(
        (contact) => sameText(contact.email, lead.email) || (!!lead.whatsapp && contact.phone === lead.whatsapp)
      );
      if (match) {
        contactId = match.id;
        contactHasOrganization = !!match.organizationId;
        break;
      }
    }
  }
  const contactFields = compact({ name: lead.name, email: lead.email, phone: lead.whatsapp });
  const linkOrganization = organizationId && !contactHasOrganization ? { organizationId } : {};
  if (!contactId) {
    const created = await call('criação de contato', 'POST', '/crm/contacts', {
      body: { ...contactFields, name: lead.name || lead.email || lead.whatsapp, ...linkOrganization },
    });
    contactId = created.id as string;
  } else {
    const patch = { ...contactFields, ...linkOrganization };
    if (Object.keys(patch).length) {
      await call('atualização de contato', 'PATCH', `/crm/contacts/${contactId}`, { body: patch });
    }
  }

  const completed = lead.stage === 'complete' || existing?.customFields?.formulario === 'completo';
  const customFields = {
    origem: 'alexnet.to',
    interesse: lead.kind,
    formulario: completed ? 'completo' : 'parcial',
    lead_id: lead.leadId,
  };
  const who = lead.company && !linkedin ? lead.company : lead.name || lead.email || lead.whatsapp;
  const title = `${who}: ${KIND_LABEL[lead.kind]} (alexnet.to)`.slice(0, 200);
  const deal: Deal = existing
    ? await call('atualização do deal', 'PATCH', `${deals}/${existing.id}`, {
        body: { title, contactId, organizationId, customFields },
      })
    : await call('criação do deal', 'POST', deals, {
        body: {
          title,
          stageId: TRAMA.stageId,
          currency: 'BRL',
          ownerId: TRAMA.ownerId,
          contactId,
          organizationId,
          customFields,
        },
      });

  // The note keeps everything the person wrote, once, when the form is sent.
  if (lead.stage === 'complete') {
    await call('criação da nota', 'POST', `${deals}/${deal.id}/notes`, { body: { body: noteText(lead) } });
  }

  return { ref: { dealId: deal.id }, url: `${base}/${TRAMA.boardPath}/${deal.number ?? existing?.number}` };
}

/** One row per leadId; the script updates the row of an earlier partial save. */
export async function saveToSheet(
  lead: Lead,
  tramaUrl: string,
  env: LeadEnv,
  fetchFn: typeof fetch = fetch
): Promise<void> {
  const url = env.LEADS_SHEET_URL;
  if (!url) throw new Error('Planilha não configurada (LEADS_SHEET_URL).');

  const row = {
    ...compact({
      leadId: lead.leadId,
      stage: STAGE_LABEL[lead.stage],
      kind: KIND_LABEL[lead.kind],
      name: lead.name,
      email: lead.email,
      whatsapp: lead.whatsapp,
      company: lead.company,
      message: lead.message,
      lang: lead.lang,
      origin: lead.origin,
    }),
    trama: tramaUrl,
  };
  // Apps Script answers with a redirect to the output; fetch follows it.
  const res = await fetchFn(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(row),
  });
  const json = (await res.json().catch(() => null)) as { ok?: boolean } | null;
  if (!res.ok || json?.ok !== true) throw new Error(`Planilha falhou (HTTP ${res.status}).`);
}

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Trama first (so the sheet row links the deal), then the sheet. Either one is enough. */
export async function submitLead(lead: Lead, env: LeadEnv, fetchFn: typeof fetch = fetch) {
  const trama = await saveToTrama(lead, env, fetchFn).then(
    (result) => ({ ok: true as const, ...result }),
    (e) => ({ ok: false as const, error: errorMessage(e) })
  );
  const sheet = await saveToSheet(lead, trama.ok ? trama.url : '', env, fetchFn).then(
    () => ({ ok: true as const }),
    (e) => ({ ok: false as const, error: errorMessage(e) })
  );
  return { ok: trama.ok || sheet.ok, ref: trama.ok ? trama.ref : lead.ref, trama, sheet };
}
