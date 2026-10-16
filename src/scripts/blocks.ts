// Блоки платформы (прототип: tabs, feat, featHover). Снимок — строго своего сочетания валюта × язык × тема:
// функция → снимок блока → первая функция со снимком, всё в том же сочетании; функции без снимка — не кнопки (Р-22).
// SITE-55: на телефоне (< 768) снимок функции — кадр приложения в iPhone, если он есть у сочетания, иначе настольный
// снимок в MacBook; src ставится только нужной картинке — телефон не грузит настольные снимки, где есть кадр приложения.
import { appUrl, axes, hasApp, onAxes, shotCode, shotUrl, type Axes, type PageData } from './state';

export function initBlocks(D: PageData) {
  const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-tab]'));
  const panels = Array.from(document.querySelectorAll<HTMLElement>('[data-panel]'));
  if (!tabs.length) return null;
  const blockShots: Record<string, Record<string, string>> = JSON.parse(document.querySelector('[data-block-shots]')?.textContent || '{}');
  const keys = tabs.map((t) => t.dataset.tab!);
  let tab = keys[0];
  let feat = -1;
  let featHover: number | null = null;

  /**
   * Список функций активного сочетания в панели — именно обёртка списка .bl__vl: у заголовка и задачи блока
   * тоже есть span.v с теми же data-cur/data-lang, и первый .v в панели — это они (ошибка до 15.10.2026).
   */
  const featList = (panel: HTMLElement, a: Axes) => panel.querySelector<HTMLElement>(`.bl__vl[data-cur="${a.cur}"][data-lang="${a.lang}"]`);
  const items = (panel: HTMLElement, a: Axes) => Array.from(featList(panel, a)?.querySelectorAll<HTMLElement>('.bl__li') ?? []);
  const desk = (a: Axes, id: string | undefined) => !!id && shotCode(D, a, id) !== '0';
  const app = (a: Axes, id: string | undefined) => !!id && phone.matches && hasApp(D, a, id);
  const has = (a: Axes, id: string | undefined) => desk(a, id) || app(a, id);

  // SITE-43: полоса вкладок шире экрана только на телефоне — там края затухают (data-edge, стили в Blocks.astro),
  // а выбранная вкладка прокручивается к середине полосы (только < 768). Только по горизонтали: страница не сдвигается.
  const tablist = document.querySelector<HTMLElement>('[data-tablist]');
  const phone = matchMedia('(max-width: 767.98px)');
  const edges = () => {
    if (!tablist) return;
    const max = tablist.scrollWidth - tablist.clientWidth;
    tablist.dataset.edge = max <= 1 ? 'none' : tablist.scrollLeft <= 1 ? 'start' : tablist.scrollLeft >= max - 1 ? 'end' : 'mid';
  };
  const scrolls = () => phone.matches && !!tablist && tablist.scrollWidth > tablist.clientWidth + 1;
  const reveal = (k: string) => {
    const t = document.getElementById(`tab-${k}`);
    if (!tablist || !t || !scrolls()) return;
    const lr = tablist.getBoundingClientRect();
    const tr = t.getBoundingClientRect();
    const left = tablist.scrollLeft + tr.left - lr.left - (tablist.clientWidth - tr.width) / 2;
    tablist.scrollTo({ left, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  };

  function render() {
    const a = axes();
    tabs.forEach((t, i) => {
      const on = t.dataset.tab === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      panels[i].hidden = !on;
    });
    const panel = panels[keys.indexOf(tab)];
    const lis = items(panel, a);
    lis.forEach((li, i) => {
      const shot = has(a, li.dataset.screen);
      li.classList.toggle('is-shot', shot);
      li.classList.toggle('is-open', featHover === i);
      const b = li.querySelector('button');
      b?.setAttribute('aria-pressed', String(feat === i));
      b?.setAttribute('aria-expanded', String(featHover === i));
    });
    const af = feat >= 0 ? lis[feat] : null;
    const bshot = blockShots[a.cur]?.[tab];
    const id =
      (af && has(a, af.dataset.screen) ? af.dataset.screen : '') ||
      (has(a, bshot) ? bshot : '') ||
      lis.map((li) => li.dataset.screen).find((s) => has(a, s)) ||
      '';
    panel.classList.toggle('has-shot', !!id);
    panel.classList.toggle('has-app', !!id && (app(a, bshot) || lis.some((li) => app(a, li.dataset.screen))));
    const fig = panel.querySelector<HTMLElement>('.bl__fig')!;
    const img = fig.querySelector<HTMLImageElement>('[data-shot-img]')!;
    const aimg = fig.querySelector<HTMLImageElement>('[data-app-img]')!;
    const ph = fig.querySelector<HTMLElement>('[data-shot-ph]')!;
    fig.hidden = !id;
    if (!id) return;
    const title = (af?.querySelector<HTMLElement>('.bl__ft')?.innerText || panel.querySelector('h3')?.innerText || '').trim();
    const alt = D.ui[a.lang].shotAlt.replace('{title}', title);
    fig.classList.toggle('is-app', app(a, id));
    if (app(a, id)) {
      const src = appUrl(D, a, id);
      if (aimg.getAttribute('src') !== src) aimg.src = src;
      aimg.alt = alt;
      return;
    }
    if (shotCode(D, a, id) === 'p') {
      img.removeAttribute('src');
      ph.hidden = false;
      ph.textContent = `${a.cur}/${a.lang}/${a.theme}/${id}`;
    } else {
      ph.hidden = true;
      const src = shotUrl(D, a, id);
      if (img.getAttribute('src') !== src) img.src = src;
    }
    img.alt = alt;
  }

  function select(k: string, focus = false) {
    tab = k;
    feat = -1;
    featHover = null;
    render();
    reveal(k);
    if (focus) document.getElementById(`tab-${k}`)?.focus({ preventScroll: scrolls() });
  }

  tabs.forEach((t) => {
    t.addEventListener('click', () => select(t.dataset.tab!));
    t.addEventListener('keydown', (e) => {
      const n = keys.length;
      let k = keys.indexOf(tab);
      if (e.key === 'ArrowRight') k = (k + 1) % n;
      else if (e.key === 'ArrowLeft') k = (k - 1 + n) % n;
      else if (e.key === 'Home') k = 0;
      else if (e.key === 'End') k = n - 1;
      else return;
      e.preventDefault();
      select(keys[k], true);
    });
  });

  // функции: наведение/фокус раскрывает и меняет снимок, уход сворачивает (снимок остаётся), клик — закрепляет
  panels.forEach((panel) =>
    panel.querySelectorAll<HTMLElement>('.bl__li').forEach((li) => {
      const i = Number(li.dataset.fi);
      const enter = () => {
        const shot = has(axes(), li.dataset.screen);
        if (featHover !== i || (shot && feat !== i)) {
          featHover = i;
          if (shot) feat = i;
          render();
        }
      };
      const leave = () => {
        if (featHover === i) {
          featHover = null;
          render();
        }
      };
      li.addEventListener('mouseenter', enter);
      li.addEventListener('mouseleave', leave);
      const b = li.querySelector('button')!;
      b.addEventListener('focus', enter);
      b.addEventListener('blur', leave);
      b.addEventListener('click', () => {
        if (feat !== i || featHover !== i) {
          feat = i;
          featHover = i;
          render();
        }
      });
    }),
  );

  onAxes(() => {
    render();
    edges();
  });
  // телефон ↔ планшет/компьютер: другой слой снимков (iPhone с кадром приложения / MacBook)
  phone.addEventListener('change', () => render());
  tablist?.addEventListener('scroll', edges, { passive: true });
  addEventListener('resize', edges, { passive: true });
  render();
  edges();
  document.fonts?.ready.then(edges);
  return { openTab: (k: string) => select(k) };
}
