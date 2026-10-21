/**
 * Small, dependency-free checks shared by the contact form and /api/lead:
 * LinkedIn links and likely e-mail typos. Phone numbers live in ./phone.
 */

const SLUG = /^[\p{L}\p{N}_-]{2,100}$/u;

const decode = (part: string) => {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
};

/**
 * Canonical LinkedIn URL (https://www.linkedin.com/in/<slug>) from whatever people paste:
 * app share links with tracking, country subdomains, /details/ pages, "in/slug", "@slug" or the bare slug.
 * Company and school pages and lnkd.in short links are kept. Anything else returns null.
 */
export function normalizeLinkedin(raw: string): string | null {
  let text = raw.trim();
  if (!text) return null;
  const bare = text.replace(/^@/, '');
  if (/^[\p{L}\p{N}_-]{3,100}$/u.test(bare)) return `https://www.linkedin.com/in/${encodeURIComponent(bare.toLowerCase())}`;
  if (/^(in|company|school)\//i.test(text)) text = `linkedin.com/${text}`;
  if (!/^https?:\/\//i.test(text)) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(text)) return null;
    text = `https://${text}`;
  }

  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (host === 'lnkd.in') return /^\/[A-Za-z0-9_-]{4,}$/.test(url.pathname) ? `https://lnkd.in${url.pathname}` : null;
  if (!/(^|\.)linkedin\.com$/.test(host)) return null;

  const parts = url.pathname.split('/').filter(Boolean).map(decode);
  if (parts[0]?.toLowerCase() === 'mwlite') parts.shift();
  const kind = parts[0]?.toLowerCase();
  const slug = parts[1]?.toLowerCase();
  if (!kind || !['in', 'company', 'school'].includes(kind) || !slug || !SLUG.test(slug)) return null;
  return `https://www.linkedin.com/${kind}/${encodeURIComponent(slug)}`;
}

/** Looks like a LinkedIn link (used to catch it in the company field). */
export const looksLikeLinkedin = (value: string) => /linkedin\.com\/|lnkd\.in\//i.test(value);

const DOMAINS = [
  'gmail.com',
  'hotmail.com',
  'hotmail.com.br',
  'outlook.com',
  'outlook.com.br',
  'live.com',
  'yahoo.com',
  'yahoo.com.br',
  'icloud.com',
  'uol.com.br',
  'bol.com.br',
  'terra.com.br',
];

function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const current = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length];
}

/** "maria@gmial.com" → "maria@gmail.com". Undefined when the domain is fine or unknown. */
export function suggestEmail(email: string): string | undefined {
  const [user, domain] = email.trim().toLowerCase().split('@');
  if (!user || !domain || DOMAINS.includes(domain)) return undefined;
  let best: { domain: string; score: number } | undefined;
  for (const candidate of DOMAINS) {
    const score = distance(domain, candidate);
    if (score <= 2 && (!best || score < best.score)) best = { domain: candidate, score };
  }
  return best ? `${user}@${best.domain}` : undefined;
}
