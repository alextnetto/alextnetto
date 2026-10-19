import type { APIRoute } from 'astro';
import { parseLead, submitLead } from '../../lib/lead';

export const prerender = false;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export const POST: APIRoute = async ({ request }) => {
  const parsed = parseLead(await request.json().catch(() => null));
  if (parsed.status === 'spam') return json(200, { ok: true });
  if (parsed.status === 'invalid') return json(400, { error: parsed.error });

  const result = await submitLead(parsed.lead, process.env);
  if (!result.pipedrive.ok) console.error('[lead] pipedrive:', result.pipedrive.error);
  if (!result.email.ok) console.error('[lead] email:', result.email.error);
  if (!result.ok) return json(502, { error: 'Não consegui enviar agora.' });
  return json(200, { ok: true });
};
