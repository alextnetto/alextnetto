/**
 * Contact form (/contact and /links) → card in the Trama funnel "alexnet.to" + Google Sheet row.
 *
 * The form saves twice: a partial save as soon as the visitor leaves a valid
 * e-mail or WhatsApp, and the complete submission. Both carry the same leadId,
 * so Trama keeps one card and the sheet keeps one row per lead. Every network
 * call takes an injected `fetch` so the flow is testable without the real CRM.
 */

import { looksLikeLinkedin, normalizeLinkedin } from './contact';
import { REVENUE_BANDS, ROLES, revenueLabel, roleLabel, type RevenueId, type RoleId } from './leadOptions';
import { normalizePhone, phoneProblem } from './phone';

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
  /** E.164, e.g. +5548999724312, read with the country the person picked. */
  whatsapp?: string;
  email?: string;
  /** Company or event name. */
  company?: string;
  role?: RoleId;
  /** What the person typed when the role is "outro". */
  roleOther?: string;
  revenue?: RevenueId;
  /** Canonical LinkedIn URL (see normalizeLinkedin). */
  linkedin?: string;
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
// One @, no spaces, a dotted domain ending in letters.
const EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[a-z]{2,}$/i;

const text = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

/** Drops empty values so partial saves never overwrite what is already stored. */
function compact<T extends Record<string, unknown>>(record: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined && value !== null && value !== '')
  ) as Partial<T>;
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

  const name = text(b.name, 120).replace(/\s+/g, ' ');
  const typedPhone = text(b.whatsapp, 80);
  const phoneCountry = text(b.phoneCountry, 2).toUpperCase() || 'BR';
  const whatsapp = normalizePhone(typedPhone, phoneCountry);
  const typedEmail = text(b.email, 200).toLowerCase();
  const email = EMAIL.test(typedEmail) ? typedEmail : null;
  let company = text(b.company, 200);
  let typedLinkedin = text(b.linkedin, 300);
  // A LinkedIn link pasted in the company field belongs in the LinkedIn field.
  if (looksLikeLinkedin(company)) {
    if (!typedLinkedin) typedLinkedin = company;
    company = '';
  }
  const linkedin = normalizeLinkedin(typedLinkedin);
  const role = ROLES.find((option) => option.id === text(b.role, 30))?.id;
  const roleOther = role === 'outro' ? text(b.roleOther, 80) : '';
  const revenue = REVENUE_BANDS.find((band) => band.id === text(b.revenue, 30))?.id;
  const message = text(b.message, 2000);

  if (stage === 'complete') {
    if (name.length < 2) return invalid('Informe seu nome.');
    if (!email) return invalid('Informe um e-mail válido.');
    if (!whatsapp) return invalid(phoneProblem(typedPhone, phoneCountry, 'pt') ?? 'Informe um WhatsApp com DDD.');
    if (!role) return invalid('Escolha o seu cargo.');
    if (role === 'outro' && roleOther.length < 2) return invalid('Conte qual é o seu cargo.');
    if (company.length < 2) return invalid('Informe o nome da empresa ou do evento.');
    if (!revenue) return invalid('Escolha a faixa de faturamento (ou "Prefiro não informar").');
    if (typedLinkedin && !linkedin) return invalid('Confira o link do LinkedIn, por exemplo linkedin.com/in/seu-nome.');
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
    role,
    roleOther,
    revenue,
    linkedin,
    message,
    lang: b.lang === 'pt' || b.lang === 'en' ? b.lang : undefined,
    origin: text(b.origin, 300),
    page: /^\/[a-z0-9/_-]*$/i.test(text(b.page, 100)) ? text(b.page, 100) : undefined,
    ref: parseRef(b.ref),
  }) as Lead;
  return { status: 'ok', lead };
}

const roleText = (lead: Lead) => (lead.role === 'outro' && lead.roleOther ? `Outro: ${lead.roleOther}` : roleLabel(lead.role));

/** Card description: everything the person wrote, in reading order. */
function describe(lead: Lead): string {
  const lines: [string, string | undefined][] = [
    ['Procura', KIND_LABEL[lead.kind]],
    ['Nome', lead.name],
    ['Cargo', roleText(lead)],
    ['WhatsApp', lead.whatsapp],
    ['E-mail', lead.email],
    ['Empresa ou evento', lead.company],
    ['Faturamento anual', revenueLabel(lead.revenue)],
    ['LinkedIn', lead.linkedin],
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

  const who = lead.company || lead.name || lead.email || lead.whatsapp;
  const fields = {
    title: `${who}: ${KIND_LABEL[lead.kind]}`.slice(0, 500),
    description: describe(lead),
    customFields: compact({
      interesse: lead.kind,
      email: lead.email,
      whatsapp: lead.whatsapp,
      empresa: lead.company,
      cargo: lead.role,
      faturamento: lead.revenue,
      linkedin: lead.linkedin,
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
      role: roleText(lead),
      email: lead.email,
      whatsapp: lead.whatsapp,
      company: lead.company,
      revenue: revenueLabel(lead.revenue),
      linkedin: lead.linkedin,
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
