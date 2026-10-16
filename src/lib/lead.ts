// Заявка «Запросить демо» (SITE-15, владелец — сессия C): чистая логика формы без DOM — телефон по стране, проверки
// полей теми же правилами, что у приёмника трекера (server/site-lead.ts), тело запроса, разбор ответа.
// Тексты сюда не попадают: форма берёт их из src/content/{ru,en}/legal/form.json, здесь — только коды.

export type SiteMode = 'local' | 'preview' | 'prod';
export type LeadSite = 'ru' | 'en';
/** Код страны телефона: Россия, ОАЭ или другая страна (номер целиком с кодом). */
export type Country = '7' | '971' | 'other';
export type LeadField = 'phone' | 'name' | 'city' | 'venue' | 'consent';
export type LeadErrors = Partial<Record<LeadField, 'required' | 'invalid'>>;

/** Версия сайта → регион CRM и код страны по умолчанию. */
export const SITE_REGION: Record<LeadSite, string> = { ru: 'RU', en: 'AE' };
export const DEFAULT_COUNTRY: Record<LeadSite, Country> = { ru: '7', en: '971' };
/** Пределы длины полей — как у приёмника трекера. */
export const LEAD_TEXT = { name: [2, 120], city: [2, 80], venue: [2, 160] } as const;
/** Форма, заполненная быстрее, — бот: приёмник ответит «принято», но ничего не запишет. */
export const MIN_FILL_MS = 3_000;
/** Локальный стенд трекера (ТЗ: «Локально форма шлёт заявки в локальный стенд трекера, порт 8890»). */
export const LOCAL_LEAD_URL = 'http://localhost:8890/api/site/demo-request';
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const;

/** Только цифры. */
export const digits = (s: string): string => s.replace(/\D+/g, '');

/**
 * Номер для отправки: только цифры с кодом страны или null — номер неполный. Россия — 10 цифр после +7 (ввод «8 …» или
 * «+7 …» тоже понимается), ОАЭ — 9 цифр после +971, другая страна — 10–15 цифр целиком.
 */
export function phoneDigits(country: Country, raw: string): string | null {
  let d = digits(raw);
  if (country === '7') {
    if (d.length === 11 && (d.startsWith('7') || d.startsWith('8'))) d = d.slice(1);
    return d.length === 10 ? `7${d}` : null;
  }
  if (country === '971') {
    if (d.startsWith('971') && d.length === 12) d = d.slice(3);
    if (d.startsWith('0') && d.length === 10) d = d.slice(1);
    return d.length === 9 ? `971${d}` : null;
  }
  if (d.length === 11 && d.startsWith('8') && !raw.trim().startsWith('+')) d = `7${d.slice(1)}`;
  return d.length >= 10 && d.length <= 15 && !d.startsWith('0') ? d : null;
}

/** Маска ввода по стране: Россия «900 000-00-00», ОАЭ «50 000 0000», другая страна — как ввели (цифры, пробелы, «+»). */
export function formatPhone(country: Country, raw: string): string {
  if (country === 'other') return raw.replace(/[^\d+\s()-]/g, '').slice(0, 24);
  let d = digits(raw);
  if (country === '7' && d.length === 11 && (d.startsWith('7') || d.startsWith('8'))) d = d.slice(1);
  if (country === '971' && d.startsWith('971')) d = d.slice(3);
  if (country === '7') {
    d = d.slice(0, 10);
    return [d.slice(0, 3), d.slice(3, 6), d.slice(6, 8), d.slice(8, 10)].filter(Boolean)
      .reduce((out, part, i) => (i === 0 ? part : i === 1 ? `${out} ${part}` : `${out}-${part}`), '');
  }
  d = d.slice(0, 9);
  return [d.slice(0, 2), d.slice(2, 5), d.slice(5, 9)].filter(Boolean).join(' ');
}

const LINK = /(?:https?:|www\.|:\/\/|\b[a-z0-9-]{2,}\.(?:ru|com|net|org|io|ai|me|biz|info|xyz|top|рф|online|site|shop|app)\b)/iu;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/u;

/** Текст поля: пробелы схлопнуты; null — не по правилам (пусто, длина, ссылка, разметка, ни одной буквы). */
export function cleanText(field: keyof typeof LEAD_TEXT, raw: string): string | null {
  const [min, max] = LEAD_TEXT[field];
  const s = raw.normalize('NFC').replace(/\s+/gu, ' ').trim();
  if (s.length < min || s.length > max || CONTROL.test(s) || /[<>{}]/.test(s) || LINK.test(s)) return null;
  return (field === 'venue' ? /[\p{L}\p{N}]/u : /\p{L}/u).test(s) ? s : null;
}

export interface LeadInput {
  country: Country; phone: string; name: string; city: string; venue: string; consent: boolean;
}

/** Ошибки полей: required — пусто, invalid — не по правилам. Пусто — можно отправлять. */
export function checkInput(x: LeadInput): LeadErrors {
  const e: LeadErrors = {};
  if (!x.phone.trim()) e.phone = 'required';
  else if (phoneDigits(x.country, x.phone) === null) e.phone = 'invalid';
  for (const f of ['name', 'city', 'venue'] as const) {
    if (!x[f].trim()) e[f] = 'required';
    else if (cleanText(f, x[f]) === null) e[f] = 'invalid';
  }
  if (!x.consent) e.consent = 'required';
  return e;
}

/** UTM-метки из строки адреса посадочной страницы: только utm_*, каждое до 100 знаков. Нет — null. */
export function utmOf(search: string): Record<string, string> | null {
  const q = new URLSearchParams(search);
  const out: Record<string, string> = {};
  for (const k of UTM_KEYS) {
    const v = (q.get(k) ?? '').replace(/[\u0000-\u001f<>{}]/g, '').trim().slice(0, 100);
    if (v) out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}

/** Адрес страницы без параметров и якоря — в тот вид, что принимает приёмник; не по виду — null. */
export function pageOf(pathname: string): string | null {
  return /^\/[A-Za-z0-9/_.~-]{0,199}$/.test(pathname) ? pathname : null;
}

/** Секция, где нажали «Запросить демо»: код; не по виду — null. */
export function sectionOf(v: unknown): string | null {
  return typeof v === 'string' && /^[a-z][a-z0-9_-]{0,31}$/.test(v) ? v : null;
}

/** Тип бизнеса (ТЗ 12.10.2026): «Своё заведение» (independent) или «Сеть» (chain). */
export const LEAD_SEGMENTS = ['independent', 'chain'] as const;
export type LeadSegment = typeof LEAD_SEGMENTS[number];
/** Тип бизнеса по версии сайта (решение Данила 12.10.2026, 16:45): РФ — только сети, ОАЭ — только своё заведение (1–9). */
export const SITE_SEGMENT: Record<LeadSite, LeadSegment> = { ru: 'chain', en: 'independent' };
/** Значение типа бизнеса из справочника; иное (в т.ч. не строка) — null. */
export function segmentOf(v: unknown): LeadSegment | null {
  return typeof v === 'string' && (LEAD_SEGMENTS as readonly string[]).includes(v) ? (v as LeadSegment) : null;
}

/**
 * Тип бизнеса из первого годного источника по порядку (контракт A: window.__vilaxSegment, затем <html data-segment> —
 * оба A ставит из региона). Ничего не подошло — тип по версии сайта (SITE_SEGMENT). ?segment= и localStorage
 * vilax.segment больше не источники: тип выбирали до 12.10.2026, старое значение противоречило бы региону.
 */
export function pickSegment(site: LeadSite, ...candidates: unknown[]): LeadSegment {
  for (const c of candidates) {
    const s = segmentOf(c);
    if (s) return s;
  }
  return SITE_SEGMENT[site];
}

const CALC_INT: Record<string, [number, number]> = { locations: [1, 10_000], staff_n: [0, 100_000], aura_packs: [0, 50], coord_packs: [0, 50] };
const CALC_CODES: Record<string, readonly string[]> = {
  staff: ['none', 'academy', 'hr'], period: ['month', 'year'], cur: ['AED', 'RUB'], tier: ['2-10', '11-25', '26-100', '101-200', '201+'],
};
/** Блоки РФ (цены за локацию, 12.10.2026) — коды приёмника: Основа и УК тоже блоки. */
export const LEAD_BLOCKS = ['base', 'guests', 'finance', 'loyalty', 'staff', 'uk'] as const;
/** Поля модели v16 (ОАЭ): у заявки с блоками РФ их нет — приёмник смешанный выбор принял бы, но менеджеру он ни к чему. */
const V16_ONLY = ['modules', 'all_in', 'staff', 'staff_n', 'aura_packs', 'coord_packs'];

/**
 * Выбор калькулятора B (src/lib/pricing-calc.ts, CalcLead) → имена полей приёмника: currency → cur, employees → staff_n,
 * billing monthly | annual → period month | year, staff people → hr, modules с bundle → all_in, auraBlocks / coordBlocks →
 * aura_packs / coord_packs, monthly → month_total. Блочная модель РФ (model 'blocks', запись B 12.10 20:18): blocks и tier —
 * как есть, флаг uk — блок uk. Поля уже в виде приёмника проходят как есть; model, segment, priceVersion, total — не нужны.
 */
function fromCalculator(src: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...src };
  const alias: Record<string, string> = { currency: 'cur', employees: 'staff_n', auraBlocks: 'aura_packs', coordBlocks: 'coord_packs', monthly: 'month_total' };
  for (const [from, to] of Object.entries(alias)) if (out[to] === undefined && src[from] !== undefined) out[to] = src[from];
  if (out.period === undefined && (src.billing === 'monthly' || src.billing === 'annual')) out.period = src.billing === 'annual' ? 'year' : 'month';
  if (src.staff === 'people') out.staff = 'hr';
  if (Array.isArray(src.modules) && src.modules.includes('bundle') && out.all_in === undefined) out.all_in = true;
  if (src.model === 'blocks' && !Array.isArray(out.blocks)) out.blocks = [];
  if (Array.isArray(out.blocks) && src.uk === true && !out.blocks.includes('uk')) out.blocks = [...out.blocks, 'uk'];
  return out;
}

/**
 * Выбор калькулятора из события vilax:demo → только поля справочника приёмника (коды и числа); лишнее отбрасывается,
 * а не ломает заявку. Пусто — null.
 */
export function calcOf(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const src = fromCalculator(v as Record<string, unknown>);
  const out: Record<string, unknown> = {};
  // РФ: блоки за локацию — поля v16 не берём, даже если пришли.
  const blocks = Array.isArray(src.blocks) ? (src.blocks as unknown[]) : null;
  if (blocks) for (const k of V16_ONLY) delete src[k];
  for (const [k, [min, max]] of Object.entries(CALC_INT)) {
    const n = src[k];
    if (typeof n === 'number' && Number.isInteger(n) && n >= min && n <= max) out[k] = n;
  }
  for (const [k, list] of Object.entries(CALC_CODES)) if (typeof src[k] === 'string' && list.includes(src[k] as string)) out[k] = src[k];
  if (Array.isArray(src.modules)) {
    const mods = ['guests', 'finance', 'loyalty'].filter((m) => (src.modules as unknown[]).includes(m));
    out.modules = mods;
  }
  if (blocks) out.blocks = LEAD_BLOCKS.filter((b) => blocks.includes(b));
  if (typeof src.all_in === 'boolean') out.all_in = src.all_in;
  const total = src.month_total;
  if (typeof total === 'number' && Number.isFinite(total) && total >= 0 && total <= 1e9) out.month_total = Math.round(total * 100) / 100;
  return Object.keys(out).length ? out : null;
}

export interface LeadMeta {
  site: LeadSite; segment: LeadSegment | null; section: string | null; page: string | null; utm: Record<string, string> | null;
  calc: Record<string, unknown> | null; consentVersion: string; requestRef: string; honeypot: string; elapsedMs: number;
}

/** Тело запроса к приёмнику: поля проверены (checkInput пуст). Тип бизнеса — скрытым полем, человек его не вводит. */
export function leadBody(x: LeadInput, m: LeadMeta): Record<string, unknown> {
  return {
    phone: `+${phoneDigits(x.country, x.phone)}`,
    name: cleanText('name', x.name), city: cleanText('city', x.city), venue: cleanText('venue', x.venue),
    consent: true, consent_version: m.consentVersion, request_ref: m.requestRef,
    site: m.site, region: SITE_REGION[m.site], segment: m.segment, section: m.section, page: m.page, utm: m.utm, calc: m.calc,
    website: m.honeypot, elapsed_ms: Math.max(0, Math.min(86_400_000, Math.round(m.elapsedMs))),
  };
}

/** Номер заявки: один на открытие формы — повтор после сбоя приёмник не задвоит. */
export function newRequestRef(rand: () => string = () => crypto.randomUUID()): string {
  return `web-${rand().replace(/[^A-Za-z0-9_-]/g, '')}`.slice(0, 64);
}

/** Куда слать: local — стенд (или адрес сборки), preview — никуда, prod — только адрес сборки (нет — null: честная ошибка). */
export function leadUrl(mode: SiteMode, built: string | undefined): string | null {
  if (mode === 'preview') return null;
  const url = (built ?? '').trim();
  if (url) return url;
  return mode === 'local' ? LOCAL_LEAD_URL : null;
}

/**
 * Исход отправки для экрана: ok — принято (202/200), invalid — приёмник отказал по полю, limited — слишком часто,
 * unavailable — заявки сейчас не принимаются (503), failed — сеть, адрес или любой другой ответ.
 */
export type Outcome = { kind: 'ok' } | { kind: 'invalid'; field: string | null } | { kind: 'limited' } | { kind: 'unavailable' } | { kind: 'failed' };

export function outcomeOf(status: number, body: unknown): Outcome {
  if (status === 202 || status === 200) return (body as { ok?: unknown } | null)?.ok === true ? { kind: 'ok' } : { kind: 'failed' };
  if (status === 429) return { kind: 'limited' };
  if (status === 503) return { kind: 'unavailable' };
  if (status === 400) {
    const field = (body as { field?: unknown } | null)?.field;
    return { kind: 'invalid', field: typeof field === 'string' ? field : null };
  }
  return { kind: 'failed' };
}

// ── Форма дизайна 14.10.2026 (SITE-26): имя, телефон, компания, «У меня сеть» + количество локаций. ──
// Поля → приёмник: company → venue; chain/locations → segment и calc.locations; region — по валюте (₽ → RU, AED → AE);
// site — язык страницы. «Город» — решение Данила 14.10.2026 по Р-23: поле добавлено тем же компонентом (приёмник его требует).

export type LeadCur = 'rub' | 'aed';
export const CUR_REGION: Record<LeadCur, string> = { rub: 'RU', aed: 'AE' };
const CUR_COUNTRY: Record<LeadCur, Country> = { rub: '7', aed: '971' };

export interface DesignLead {
  name: string; phone: string; city: string; company: string; chain: boolean; locations: string;
}
export type DesignField = 'name' | 'phone' | 'city' | 'company' | 'locations';
/**
 * Ошибки по правилам дизайна: пусто — 'name' | 'phone' | 'city' | 'company'; телефон не 10–15 цифр — 'phoneBad';
 * город не по правилам приёмника (2–80 знаков, буквы, без ссылок) — 'cityBad'; сеть < 2 — 'locations'.
 */
export type DesignErrors = Partial<Record<DesignField, 'name' | 'phone' | 'phoneBad' | 'city' | 'cityBad' | 'company' | 'locations'>>;

/**
 * Проверка как в прототипе (submitLead): имя, телефон, компания, при сети — от 2 локаций. Телефон: ₽ — 10–15 цифр, как
 * было; AED — по designPhone: номер ОАЭ без кода (50 123 4567, 9 цифр) тоже верный (SITE-50).
 */
export function checkDesignLead(x: DesignLead, cur: LeadCur = 'rub'): DesignErrors {
  const e: DesignErrors = {};
  const n = digits(x.phone).length;
  if (!x.name.trim()) e.name = 'name';
  if (!n) e.phone = 'phone';
  else if (cur === 'aed' ? designPhone(cur, x.phone) === null : n < 10 || n > 15) e.phone = 'phoneBad';
  if (!x.city.trim()) e.city = 'city';
  else if (cleanText('city', x.city) === null) e.city = 'cityBad';
  if (!x.company.trim()) e.company = 'company';
  if (x.chain && !(parseInt(x.locations, 10) >= 2)) e.locations = 'locations';
  return e;
}

/** Телефон для приёмника: сначала по стране валюты (+7 / +971), иначе как номер другой страны (10–15 цифр). */
export function designPhone(cur: LeadCur, raw: string): string | null {
  return phoneDigits(CUR_COUNTRY[cur], raw) ?? phoneDigits('other', raw);
}

/** Номер для «Спасибо» в формате страны: +7 900 123-45-67, +971 50 123 4567, другой — +цифры; не разобран — как ввели. */
export function designPhoneShown(cur: LeadCur, raw: string): string {
  const d = designPhone(cur, raw);
  if (!d) return raw.trim();
  if (d.length === 11 && d.startsWith('7')) return `+7 ${d.slice(1, 4)} ${d.slice(4, 7)}-${d.slice(7, 9)}-${d.slice(9)}`;
  if (d.length === 12 && d.startsWith('971')) return `+971 ${d.slice(3, 5)} ${d.slice(5, 8)} ${d.slice(8)}`;
  return `+${d}`;
}

export interface DesignMeta {
  cur: LeadCur; lang: LeadSite; section: string | null; page: string | null; utm: Record<string, string> | null;
  consentVersion: string; requestRef: string; honeypot: string; elapsedMs: number;
}

/** Тело запроса к приёмнику SITE-15 из формы дизайна (поля уже прошли checkDesignLead). */
export function designBody(x: DesignLead, m: DesignMeta): Record<string, unknown> {
  const phone = designPhone(m.cur, x.phone);
  const locations = x.chain ? Math.max(2, Math.min(10_000, parseInt(x.locations, 10) || 2)) : 1;
  return {
    phone: phone ? `+${phone}` : x.phone.trim(),
    name: x.name.normalize('NFC').replace(/\s+/gu, ' ').trim(),
    city: cleanText('city', x.city),
    venue: x.company.normalize('NFC').replace(/\s+/gu, ' ').trim(),
    consent: true, consent_version: m.consentVersion, request_ref: m.requestRef,
    site: m.lang, region: CUR_REGION[m.cur], segment: x.chain ? 'chain' : 'independent',
    section: m.section, page: m.page, utm: m.utm,
    calc: calcOf({ locations, cur: m.cur === 'rub' ? 'RUB' : 'AED' }),
    website: m.honeypot, elapsed_ms: Math.max(0, Math.min(86_400_000, Math.round(m.elapsedMs))),
  };
}
