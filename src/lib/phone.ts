/**
 * Phone numbers for the contact form, with the same library and full metadata as Trama's
 * PhoneInput (libphonenumber-js/max), so every number the site accepts Trama accepts too.
 * Loaded lazily by the form: the metadata is large.
 */
import {
  getCountries,
  getCountryCallingCode,
  getExampleNumber,
  isSupportedCountry,
  parsePhoneNumberFromString,
  validatePhoneNumberLength,
  type CountryCode,
} from 'libphonenumber-js/max';
import examples from 'libphonenumber-js/mobile/examples';

type Lang = 'pt' | 'en';

export const toCountry = (country?: string): CountryCode =>
  (country && isSupportedCountry(country) ? country : 'BR') as CountryCode;

const countryName = (country: CountryCode, lang: Lang) =>
  new Intl.DisplayNames([lang === 'pt' ? 'pt-BR' : 'en'], { type: 'region' }).of(country) ?? country;

/** What people paste instead of a number: wa.me / api.whatsapp.com links and the 00 international prefix. */
function rewrite(raw: string): string {
  const link = raw.match(/(?:wa\.me\/|[?&]phone=)\+?(\d{8,15})/i);
  if (link) return `+${link[1]}`;
  if (/^00[1-9]/.test(raw.replace(/[\s().-]/g, ''))) return `+${raw.replace(/^[\s(]*0\s*0/, '')}`;
  return raw;
}

/** E.164 (+5548999724312) or null. `country` is the form's country picker (ISO code, default BR). */
export function normalizePhone(raw: string, country?: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  const defaultCountry = toCountry(country);
  for (const candidate of [text, rewrite(text)]) {
    const phone = parsePhoneNumberFromString(candidate, { defaultCountry, extract: false });
    if (phone?.isValid()) return phone.number;
  }
  return null;
}

const PROBLEMS = {
  pt: {
    chars: 'Use só dígitos, espaços, parênteses ou hífen. Para outro país, comece com + e o código do país.',
    ninth: 'Celulares no Brasil têm 9 dígitos depois do DDD e começam com 9.',
    short: 'Número incompleto. Confira o DDD e o número.',
    long: 'Número longo demais para o país escolhido.',
    invalid: (name: string) => `Número inválido para ${name}. Confira os dígitos.`,
  },
  en: {
    chars: 'Use only digits, spaces, parentheses or hyphens. For another country, start with + and the country code.',
    ninth: 'Brazilian mobile numbers have 9 digits after the area code and start with 9.',
    short: 'The number is incomplete. Check the area code and the number.',
    long: 'The number is too long for the selected country.',
    invalid: (name: string) => `This is not a valid number for ${name}. Check the digits.`,
  },
} as const;

/** Why a typed number is not accepted, in the visitor's language; undefined when it is fine or empty. */
export function phoneProblem(raw: string, country?: string, lang: Lang = 'pt'): string | undefined {
  const text = raw.trim();
  if (!text || normalizePhone(text, country)) return undefined;
  const m = PROBLEMS[lang];
  const candidate = rewrite(text);
  if (!/^\+?[\p{Decimal_Number}\s().-]+$/u.test(candidate)) return m.chars;
  const defaultCountry = toCountry(country);
  // Mobile numbers written with the 8 digits Brazil used before 2016.
  if (defaultCountry === 'BR' && !candidate.startsWith('+') && /^\d{2}[6-9]\d{7}$/.test(candidate.replace(/\D/g, ''))) {
    return m.ninth;
  }
  const length = validatePhoneNumberLength(candidate, { defaultCountry });
  if (length === 'TOO_SHORT') return m.short;
  if (length === 'TOO_LONG') return m.long;
  return m.invalid(countryName(defaultCountry, lang));
}

/** National format for display after a valid entry, e.g. (48) 99972-4312. */
export function formatPhone(raw: string, country?: string): string | undefined {
  const e164 = normalizePhone(raw, country);
  if (!e164) return undefined;
  const phone = parsePhoneNumberFromString(e164)!;
  return phone.country === toCountry(country) ? phone.formatNational() : phone.formatInternational();
}

/** Country of a number typed with +, to keep the picker in sync. */
export function phoneCountry(raw: string): CountryCode | undefined {
  const text = rewrite(raw.trim());
  return text.startsWith('+') ? parsePhoneNumberFromString(text)?.country : undefined;
}

export const phoneExample = (country?: string) => getExampleNumber(toCountry(country), examples)?.formatNational();

const FIRST: CountryCode[] = ['BR', 'US', 'PT'];

/** Picker options: Brazil, United States and Portugal first, then every country by name. */
export function phoneCountries(lang: Lang) {
  const all = getCountries().map((country) => ({
    country,
    name: countryName(country, lang),
    code: getCountryCallingCode(country),
    flag: String.fromCodePoint(...[...country].map((letter) => 127397 + letter.charCodeAt(0))),
  }));
  const rest = all
    .filter((item) => !FIRST.includes(item.country))
    .sort((a, b) => a.name.localeCompare(b.name, lang === 'pt' ? 'pt-BR' : 'en'));
  return [...FIRST.map((country) => all.find((item) => item.country === country)!), ...rest];
}
