// Пересчёт калькулятора в браузере тем же расчётом, что и при сборке. Суммы округляются только при показе (Р-5).
// Модель задаёт версия (config.model): blocks — сеть РФ (блоки за локацию по тарифу + УК), v16 — своё заведение ОАЭ.
// Тип бизнеса берётся из контракта сегмента A (window.__vilaxSegment → data-segment на <html>); версия продаёт один тип,
// чужой тип модель не меняет (segmentFor).
import {
  quoteFor,
  lines,
  leadPayload,
  normalize,
  quoteBlocks,
  blocksLines,
  blocksLeadPayload,
  segmentFor,
  type BlocksVersion,
  type BlockKey,
  type CalcInput,
  type LocationLimits,
  type Segment,
} from '../../lib/pricing-calc';
import type { Commercial } from '../../lib/pricing';
import { formatPrice, type Currency } from '../../lib/pricing-text';

interface V16Config {
  model: 'v16';
  lang: 'ru' | 'en';
  currency: Currency;
  version: string | null;
  segment: Segment;
  locations: LocationLimits;
  commercial: Commercial;
  lines: Record<string, string>;
}

interface BlocksConfig {
  model: 'blocks';
  lang: 'ru' | 'en';
  price: BlocksVersion;
  names: Record<string, string>;
  tierTemplate: string;
  tierLabels: string[];
  year: string;
  yearDue: string;
}

/** Тип бизнеса из контракта A: window.__vilaxSegment → data-segment на <html>. */
function contractSegment(): unknown {
  const w = (window as unknown as { __vilaxSegment?: unknown }).__vilaxSegment;
  return w ?? document.documentElement.dataset.segment;
}

export function mount(root: HTMLElement): void {
  if (root.dataset.mounted) return;
  root.dataset.mounted = '1';
  const cfg = JSON.parse(root.dataset.config || '{}') as V16Config | BlocksConfig;
  if (cfg.model === 'blocks') mountBlocks(root, cfg);
  else mountV16(root, cfg);
}

/** Поле локаций: ползунок и число двигаются вместе, ввод держится в границах версии. */
function bindLocations(form: HTMLFormElement, limits: LocationLimits, render: () => void) {
  const range = form.querySelector<HTMLInputElement>('[name="locationsRange"]')!;
  const loc = form.querySelector<HTMLInputElement>('[name="locations"]')!;
  range.addEventListener('input', () => {
    loc.value = range.value;
    render();
  });
  loc.addEventListener('change', () => {
    const raw = Math.floor(Number(loc.value));
    const n = Number.isFinite(raw) ? Math.min(limits.max, Math.max(limits.min, raw)) : limits.start;
    loc.value = range.value = String(n);
    render();
  });
  form.addEventListener('input', (e) => {
    if (e.target !== range) render();
  });
  form.addEventListener('submit', (e) => e.preventDefault());
  return () => Number(loc.value);
}

/* ───────────── Сеть РФ: блоки за локацию по тарифу + УК ───────────── */

function mountBlocks(root: HTMLElement, cfg: BlocksConfig) {
  const p = cfg.price;
  const form = root.querySelector('form')!;
  const pr = root.closest<HTMLElement>('.pr');
  const out = (k: string) => root.querySelector<HTMLElement>(`[data-out="${k}"]`);
  const money = (n: number) => formatPrice(n, cfg.lang, p.currency);
  const MINUS = String.fromCharCode(0x2212);
  const signed = (n: number) => (n < 0 ? `${MINUS}${money(-n)}` : money(n));
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Сеть продаётся только в РФ: тип из контракта A, которого версия не продаёт, расчёт не меняет.
  const segment = segmentFor(p, contractSegment());

  // Плавная смена суммы: число докатывается до нового значения (без движения — сразу).
  const frames = new WeakMap<HTMLElement, number>();
  const tween = (el: HTMLElement, to: number) => {
    const from = Number(el.dataset.value ?? to);
    el.dataset.value = String(to);
    cancelAnimationFrame(frames.get(el) ?? 0);
    if (reduce || from === to) {
      el.textContent = money(to);
      return;
    }
    const t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / 320);
      el.textContent = money(from + (to - from) * (1 - Math.pow(1 - k, 3)));
      if (k < 1) frames.set(el, requestAnimationFrame(step));
    };
    frames.set(el, requestAnimationFrame(step));
  };

  // Озвучка итога — одна фраза, когда ползунок остановился, а не каждый кадр.
  let liveTimer = 0;
  const announce = (text: string) => {
    clearTimeout(liveTimer);
    liveTimer = window.setTimeout(() => (out('live')!.textContent = text), 500);
  };

  const render = () => {
    const blocks = [...form.querySelectorAll<HTMLInputElement>('[name="block"]')].filter((el) => el.checked).map((el) => el.value as BlockKey);
    const uk = form.querySelector<HTMLInputElement>('[name="uk"]')!.checked;
    const billing = form.querySelector<HTMLInputElement>('[name="billing"]:checked')?.value === 'annual' ? 'annual' : 'monthly';
    const q = quoteBlocks(p, { locations: getLocations(), blocks, uk, billing });

    tween(out('main')!, q.monthlyEquivalent);
    tween(out('bar')!, q.monthlyEquivalent);
    tween(out('perLocation')!, q.perLocationEquivalent);
    tween(out('year')!, q.yearly);
    out('yearLabel')!.textContent = q.annual ? cfg.yearDue : cfg.year;
    out('saving')!.parentElement!.hidden = !q.annual;
    out('saving')!.textContent = money(q.annualSaving);
    out('empty')!.hidden = q.blocks.length > 0 || q.uk;
    out('tier')!.textContent = cfg.tierTemplate.replace('{tier}', cfg.tierLabels[q.tierIndex]);

    // Цена блока у галочки и подсветка тарифа в таблице — по текущему размеру сети.
    for (const b of p.blocks) {
      const el = root.querySelector<HTMLElement>(`[data-block-price="${b.key}"]`);
      if (el) el.textContent = money(b.prices[q.tierIndex]);
    }
    pr?.querySelectorAll<HTMLElement>('[data-tier-col]').forEach((el) => el.classList.toggle('is-current', Number(el.dataset.tierCol) === q.tierIndex));

    out('lines')!.replaceChildren(
      ...blocksLines(p, q).map((l) => {
        const li = document.createElement('li');
        const name = document.createElement('span');
        name.textContent = cfg.names[l.key] ?? l.key;
        if (l.perLocation !== null) {
          const sub = document.createElement('span');
          sub.className = 'calc__line-sub num';
          sub.textContent = `${money(l.perLocation)} × ${q.locations}`;
          name.append(sub);
        }
        const sum = document.createElement('span');
        sum.className = 'num';
        sum.textContent = signed(l.amount);
        li.append(name, sum);
        return li;
      }),
    );
    announce(money(q.monthlyEquivalent));

    // Выбор и точные суммы уходят в заявку скрытым полем (форма C читает detail.calc события vilax:demo).
    const lead = JSON.stringify({ ...blocksLeadPayload(p, q), segment });
    root.querySelectorAll<HTMLElement>('[data-demo="pricing"]').forEach((a) => (a.dataset.demoCalc = lead));
  };

  const getLocations = bindLocations(form, p.locations, render);
  render();
}

/* ───────────── Своё заведение ОАЭ: модуль v16 ───────────── */

function mountV16(root: HTMLElement, cfg: V16Config) {
  const labels = JSON.parse(root.dataset.labels || '{}') as Record<string, string>;
  const form = root.querySelector('form')!;
  const out = (k: string) => root.querySelector<HTMLElement>(`[data-out="${k}"]`);
  const row = (k: string) => root.querySelector<HTMLElement>(`[data-row="${k}"]`);
  const money = (n: number) => formatPrice(n, cfg.lang, cfg.currency);
  const segment = segmentFor(cfg, contractSegment());

  // Галочки читаем через .checked самих input, а не FormData: при «Всё включено» модули disabled,
  // а FormData пропускает disabled-поля — иначе при снятии bundle они на миг считались снятыми (SITE-19).
  const checked = (name: string) => form.querySelector<HTMLInputElement>(`[name="${name}"]`)?.checked ?? false;
  const read = (): CalcInput => {
    const fd = new FormData(form);
    return normalize({
      locations: getLocations(),
      guests: checked('guests'),
      finance: checked('finance'),
      loyalty: checked('loyalty'),
      bundle: checked('bundle'),
      staff: (fd.get('staff') as CalcInput['staff']) || 'none',
      employees: Number(fd.get('employees')),
      billing: (fd.get('billing') as CalcInput['billing']) || 'monthly',
      auraBlocks: Number(fd.get('auraBlocks')),
      coordBlocks: Number(fd.get('coordBlocks')),
    });
  };

  const render = () => {
    const input = read();
    const q = quoteFor(cfg.commercial, input);
    const annual = input.billing === 'annual';

    // «Всё включено» включает дополнения и 50 HR-лицензий на локацию: галочки модулей не нужны.
    form.querySelectorAll<HTMLInputElement>('[data-module]').forEach((el) => (el.disabled = input.bundle));
    const showEmployees = input.bundle || input.staff !== 'none';
    root.querySelector<HTMLElement>('[data-employees]')!.hidden = !showEmployees;
    root.querySelector<HTMLElement>('[data-aura]')!.hidden = !(input.guests || input.bundle);

    out('main')!.textContent = money(q.monthly);
    out('bar')!.textContent = money(annual ? q.monthlyEquivalent : q.monthly);
    row('discounted')!.hidden = !annual;
    out('discounted')!.textContent = money(q.monthlyEquivalent);
    out('dueLabel')!.textContent = annual ? labels.dueYear : labels.dueMonth;
    out('due')!.textContent = money(q.subscriptionDue);
    row('saving')!.hidden = !annual;
    out('saving')!.textContent = money(q.monthly * 12 - q.subscriptionDue);
    row('topups')!.hidden = !q.topups;
    out('topups')!.textContent = money(q.topups);

    out('lines')!.replaceChildren(
      ...lines(cfg.commercial, q).map((l) => {
        const li = document.createElement('li');
        const name = document.createElement('span');
        const sum = document.createElement('span');
        name.textContent = cfg.lines[l.key] ?? l.key;
        sum.className = 'num';
        sum.textContent = money(l.amount);
        li.append(name, sum);
        return li;
      }),
    );

    // Выбор и точные суммы уходят в заявку скрытым полем (форма C читает detail.calc события vilax:demo).
    const lead = JSON.stringify(leadPayload(input, q, cfg.version ?? '', cfg.currency, segment));
    root.querySelectorAll<HTMLElement>('[data-demo="pricing"]').forEach((a) => (a.dataset.demoCalc = lead));
  };

  const getLocations = bindLocations(form, cfg.locations, render);
  render();
}
