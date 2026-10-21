/**
 * Contact form (/contact and /links) → card in the Trama funnel "alexnet.to" + Google Sheet row.
 *
 * The form saves twice: a partial save as soon as the visitor leaves a valid
 * e-mail or WhatsApp, and the complete submission. Both carry the same leadId,
 * so Trama keeps one card and the sheet keeps one row per lead. Every network
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

/**
 * Board "alexnet.to" (ALX) in the Fator workspace, owner Alex. A tasks board, not a CRM
 * board: creating a CRM board would create the workspace's shared contact lists before
 * the Pipedrive import, which does not merge pre-existing lists.
 */
export const TRAMA = {
  url: 'https://tasks.fator.ai',
  boardId: '99f62b0c-bad8-4482-91a5-a8ffab0e0b55',
  boardPath: 'blockful/alexnet-to',
  status: {
    partial: '3112a6b2-0384-4c88-ab89-15572651e958', // Formulário incompleto
    complete: '8496f426-4070-4e53-9d53-a9b04e0fb435', // Novo
  },
  ownerId: 'dd8af093-f5cd-4751-b75b-c9f6eb461a18',
} as const;

/** What the browser keeps between saves. Trusted only after the card's lead_id matches. */
export interface TramaRef {
  taskId: string;
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
  /** First touch of the visit (utm_source or referrer, plus landing path). */
  origin?: string;
  /** Page that holds the form: /contact or /links. */
  page?: string;
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
  const taskId = (value as Record<string, unknown>).taskId;
  return typeof taskId === 'string' && UUID.test(taskId) ? { taskId } : undefined;
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
    page: /^\/[a-z0-9/_-]*$/i.test(text(b.page, 100)) ? text(b.page, 100) : undefined,
    ref: parseRef(b.ref),
  }) as Lead;
  return { status: 'ok', lead };
}

const isLinkedin = (value?: string) => !!value && /linkedin\.com\//i.test(value);

/** Card description: everything the person wrote, in reading order. */
function describe(lead: Lead): string {
  const lines: [string, string | undefined][] = [
    ['Procura', KIND_LABEL[lead.kind]],
    ['Nome', lead.name],
    ['WhatsApp', lead.whatsapp],
    ['E-mail', lead.email],
    ['Empresa, evento ou LinkedIn', lead.company],
  ];
  return [
    ...lines.filter(([, value]) => value).map(([key, value]) => `**${key}:** ${value}`),
    '',
    lead.message ?? '',
  ]
    .join('\n')
    .trim()
    .slice(0, 20_000);
}

interface Card {
  id: string;
  number: number;
  statusId: string;
  customFields?: Record<string, unknown>;
}

/** Creates or updates the lead's card; returns the ref for the next save. */
export async function saveToTrama(
  lead: Lead,
  env: LeadEnv,
  fetchFn: typeof fetch = fetch
): Promise<{ ref: TramaRef; url: string }> {
  const key = env.TRAMA_API_KEY;
  if (!key) throw new Error('Trama não configurado (TRAMA_API_KEY).');
  const base = (env.TRAMA_URL || TRAMA.url).replace(/\/+$/, '');

  const call = async (step: string, method: 'GET' | 'POST' | 'PATCH', path: string, body?: unknown) => {
    const res = await fetchFn(`${base}/v1/boards/${TRAMA.boardId}/tasks${path}`, {
      method,
      headers: { Authorization: `Bearer ${key}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error(`Trama falhou em ${step} (HTTP ${res.status}).`);
    return json as Card;
  };
  const result = (card: Card) => ({ ref: { taskId: card.id }, url: `${base}/${TRAMA.boardPath}/${card.number}` });

  // A ref from the browser counts only when its card carries this leadId.
  let existing: Card | null = null;
  if (lead.ref) {
    const found = await call('leitura do card', 'GET', `/${lead.ref.taskId}`).catch(() => null);
    if (found?.customFields?.lead_id === lead.leadId) existing = found;
  }

  // Once Alex moves the card or the form is sent, late partial saves change nothing.
  const stillPartial = existing?.statusId === TRAMA.status.partial;
  if (existing && lead.stage === 'partial' && !stillPartial) return result(existing);

  const who = lead.company && !isLinkedin(lead.company) ? lead.company : lead.name || lead.email || lead.whatsapp;
  const fields = {
    title: `${who}: ${KIND_LABEL[lead.kind]}`.slice(0, 500),
    description: describe(lead),
    customFields: compact({
      interesse: lead.kind,
      email: lead.email,
      whatsapp: lead.whatsapp,
      empresa: lead.company,
      origem: lead.origin,
      pagina: lead.page,
      idioma: lead.lang,
      lead_id: lead.leadId,
    }),
  };

  const card = existing
    ? await call('atualização do card', 'PATCH', `/${existing.id}`, {
        ...fields,
        ...(lead.stage === 'complete' && stillPartial ? { statusId: TRAMA.status.complete } : {}),
      })
    : await call('criação do card', 'POST', '', {
        ...fields,
        statusId: TRAMA.status[lead.stage],
        assigneeId: TRAMA.ownerId,
      });
  return result(card);
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
      page: lead.page,
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

/** Trama first (so the sheet row links the card), then the sheet. Either one is enough. */
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
