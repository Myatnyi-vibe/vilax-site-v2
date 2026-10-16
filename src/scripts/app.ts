// Скрипт страницы — перенос логики класса Component прототипа (VILAX Site.dc.html) на обычный DOM.
// Три независимые оси на <html>: lang, data-currency, data-theme (выставляет <head> до отрисовки, см. Base.astro).
// Ручной выбор любой оси запоминает все три (localStorage vilax.prefs) и убирает оси из адреса — дальше ничего
// не пересчитывается и не сбрасывается. Тексты сочетаний переключает CSS (.v), здесь — атрибуты, медиа и состояние.
import { initBlocks } from './blocks';
import { initHeroVideo } from './hero-video';
import { initLeadForm } from './lead-form';

import { axes, listeners, reduced, scrollToId, type Axes, type Cur, type PageData, type Theme } from './state';

/** Атрибуты сочетания: data-va-<attr>-<cur>-<lang> → <attr> (src/lib/content.ts, va()). */
function applyVariantAttrs(a: Axes) {
  const suffix = `-${a.cur}-${a.lang}`;
  document.querySelectorAll<HTMLElement>('[data-va]').forEach((el) => {
    for (const at of Array.from(el.attributes)) {
      if (!at.name.startsWith('data-va-') || !at.name.endsWith(suffix)) continue;
      el.setAttribute(at.name.slice(8, -suffix.length), at.value);
    }
  });
}

export function start() {
  const D: PageData = JSON.parse(document.getElementById('vlx-data')!.textContent || '{}');
  const home = D.page === 'home';
  let state = axes();
  let menuOpen = false;
  let platHover: string | null = null;

  const save = () => {
    try {
      localStorage.setItem(D.key, JSON.stringify(state));
    } catch {
      /* приватное окно: выбор живёт до перезагрузки */
    }
    // параметры адреса важнее запомненного — после ручного выбора убираем их, чтобы выбор пережил перезагрузку
    const q = new URLSearchParams(location.search);
    if (q.has('lang') || q.has('cur') || q.has('theme')) {
      q.delete('lang'); q.delete('cur'); q.delete('theme');
      const s = q.toString();
      history.replaceState(history.state, '', location.pathname + (s ? `?${s}` : '') + location.hash);
    }
  };

  const paintChrome = () => {
    const u = D.ui[state.lang];
    applyVariantAttrs(state);
    document.querySelectorAll<HTMLElement>('[data-set-lang]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.setLang === state.lang)));
    document.querySelectorAll<HTMLElement>('[data-set-cur]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.setCur === state.cur)));
    const tl = state.theme === 'dark' ? u.themeToLight : u.themeToDark;
    document.querySelectorAll<HTMLElement>('.hdr__theme[data-theme-toggle]').forEach((b) => {
      b.setAttribute('aria-label', tl);
      b.setAttribute('title', tl);
    });
    document.querySelectorAll<HTMLElement>('[data-menu-toggle]').forEach((b) => b.setAttribute('aria-label', menuOpen ? u.menuClose : u.menuOpen));
    const m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', state.theme === 'dark' ? '#020817' : '#F5F7FA');
    document.title = D.meta.titles[state.lang];
    document.querySelector('meta[name="description"]')?.setAttribute('content', D.meta.descriptions[state.lang]);
  };

  const set = (k: keyof Axes, v: string) => {
    if (state[k] === v) return;
    // правовая страница: валюта = набор документов → переход на тот же документ другой страны
    if (k === 'cur' && D.fixCur) {
      state = { ...state, cur: v as Cur };
      save();
      location.href = legalCounterpart(v as Cur);
      return;
    }
    state = { ...state, [k]: v } as Axes;
    const html = document.documentElement;
    if (k === 'lang') html.lang = state.lang;
    if (k === 'cur') html.dataset.currency = state.cur;
    if (k === 'theme') html.dataset.theme = state.theme;
    save();
    paintChrome();
    listeners.forEach((fn) => fn(state, k));
  };

  paintChrome();

  document.addEventListener('click', (e) => {
    const t = e.target as Element | null;
    const lb = t?.closest<HTMLElement>('[data-set-lang]');
    if (lb) return set('lang', lb.dataset.setLang!);
    const cb = t?.closest<HTMLElement>('[data-set-cur]');
    if (cb) return set('cur', cb.dataset.setCur!);
    if (t?.closest('[data-theme-toggle]')) return set('theme', state.theme === 'dark' ? 'light' : 'dark');
    if (t?.closest('[data-menu-toggle]')) return toggleMenu(!menuOpen);
    const go = t?.closest<HTMLAnchorElement>('[data-go]');
    if (go && home) {
      e.preventDefault();
      toggleMenu(false);
      requestAnimationFrame(() => scrollToId(go.dataset.go!));
      return;
    }
    const cta = t?.closest<HTMLAnchorElement>('[data-go-cta]');
    if (cta && home) {
      e.preventDefault();
      leadForm.section = cta.closest('section')?.id ?? (cta.closest('[data-fab]') ? 'fab' : 'header');
      toggleMenu(false);
      requestAnimationFrame(() => {
        scrollToId('pricing');
        const el = document.getElementById('lead-name');
        if (el && matchMedia('(pointer: fine)').matches) el.focus({ preventScroll: true });
      });
      return;
    }
    if (t?.closest('[data-go-home]') && home) {
      e.preventDefault();
      toggleMenu(false);
    }
  });

  // ── мобильное меню
  const menu = document.querySelector<HTMLElement>('[data-mmenu]');
  function toggleMenu(on: boolean) {
    if (menuOpen === on) return;
    menuOpen = on;
    if (menu) menu.hidden = !on;
    document.querySelectorAll<HTMLElement>('[data-menu-toggle]').forEach((b) => b.setAttribute('aria-expanded', String(on)));
    paintChrome();
  }

  // ── прокрутка: шапка над обложкой, плавающая кнопка, текст fusion
  const hdr = document.querySelector<HTMLElement>('[data-hdr]');
  const fab = document.querySelector<HTMLElement>('[data-fab]');
  const fusion = document.getElementById('fusion');
  let scrolled: boolean | null = null;
  let fabOn: boolean | null = null;
  const onScroll = () => {
    const y = scrollY, h = innerHeight;
    const s = y > 8;
    if (home && s !== scrolled) {
      scrolled = s;
      hdr?.classList.toggle('is-solid', s);
    }
    if (fab) {
      let f = y > h * 0.9 && innerWidth >= 768;
      if (f) for (const id of ['pricing', 'cta']) {
        const r = document.getElementById(id)?.getBoundingClientRect();
        if (r && r.top < h && r.bottom > 0) f = false;
      }
      if (f !== fabOn) {
        fabOn = f;
        fab.hidden = !f;
      }
    }
    if (fusion) {
      const r = fusion.getBoundingClientRect();
      if (r.bottom > 0 && r.top < h) paintFusion(fusion, Math.max(0, Math.min(1, -r.top / Math.max(1, r.height - h))));
    }
  };
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll);
  onScroll();

  // ── платформа: наведение раскрывает пункт и останавливает вращение 3D; клик открывает вкладку блока
  const platList = document.querySelector<HTMLElement>('[data-plat-list]');
  const paintPlat = () => {
    if (!platList) return;
    if (platHover) platList.dataset.hover = platHover;
    else delete platList.dataset.hover;
    platList.querySelectorAll<HTMLElement>('[data-plat]').forEach((li) => {
      const on = li.dataset.plat === platHover;
      li.classList.toggle('is-open', on);
      li.querySelector('a')?.setAttribute('aria-expanded', String(on));
    });
  };
  platList?.querySelectorAll<HTMLElement>('[data-plat]').forEach((li) => {
    const k = li.dataset.plat!;
    const enter = () => {
      if (platHover !== k) {
        platHover = k;
        paintPlat();
      }
    };
    const leave = () => {
      platHover = null;
      paintPlat();
    };
    li.addEventListener('mouseenter', enter);
    li.addEventListener('mouseleave', leave);
    const a = li.querySelector('a');
    a?.addEventListener('focus', enter);
    a?.addEventListener('blur', leave);
    a?.addEventListener('click', (e) => {
      e.preventDefault();
      blocks?.openTab(k);
      scrollToId('blocks');
    });
  });

  const blocks = home ? initBlocks(D) : null;
  const leadForm = initLeadForm(D);
  initHeroVideo(D);

  // перелив логотипа в шапке (SMIL) — стоп при «уменьшить движение»
  if (reduced) document.querySelectorAll<SVGSVGElement>('svg[data-logo-anim]').forEach((s) => s.pauseAnimations());
  if (!reduced) setupReveal();
  setup3d(() => ({ plat: platHover, theme: state.theme, reduced }));

  // открытие по ссылке с якорем (например, /#pricing с правовой страницы): шапка не закрывает начало секции
  if (home && location.hash.length > 1) {
    const id = decodeURIComponent(location.hash.slice(1));
    if (document.getElementById(id)) requestAnimationFrame(() => scrollToId(id, true));
  }

  function legalCounterpart(cur: Cur): string {
    const base = D.media.base.replace(/\/$/, '');
    const path = location.pathname.slice(base.length);
    const m = path.match(/^\/(?:(ru|en)\/)?(privacy|terms|support|consent)(?:\.html)?\/?$/);
    const doc = m ? m[2] : 'privacy';
    if (doc === 'consent') return `${base}/${cur === 'rub' ? 'ru' : 'en'}/consent`;
    return cur === 'rub' ? `${base}/ru/${doc}` : `${base}/${doc}`;
  }
}

/** Текст сцены fusion — прямая запись стилей по прогрессу p (прототип paintFusion). */
function paintFusion(fe: HTMLElement, fp: number) {
  const sm = (a: number, b: number, x: number) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  if (reduced) fp = 1;
  const q = (k: string) => fe.querySelector<HTMLElement>(`[data-f="${k}"]`);
  const lead = q('lead'), merge = q('merge'), logo = q('logo'), fin = q('final');
  const l = sm(0.1, 0.22, fp);
  if (lead) {
    lead.style.opacity = String(1 - l);
    lead.style.transform = `translateY(${(-l * 16).toFixed(1)}px)`;
  }
  if (merge) merge.style.opacity = String(sm(0.24, 0.32, fp) * (1 - sm(0.62, 0.7, fp)));
  if (logo) logo.style.opacity = String(sm(0.76, 0.86, fp));
  if (fin) fin.style.opacity = String(sm(0.82, 0.92, fp));
}

/**
 * Появление при прокрутке (прототип setupReveal): opacity 0 + translateY(32px) → на месте за .8s / 1s,
 * шаг 70 мс × индекс среди соседей (не больше 8), вложенные — вместе с родителем, H1 не прячется.
 * data-ri задаёт индекс явно там, где у переноса другие соседи по разметке (рамка ролика обложки).
 */
function setupReveal() {
  const io = new IntersectionObserver(
    (es) =>
      es.forEach((e) => {
        if (!e.isIntersecting && e.boundingClientRect.top > 0) return;
        const el = e.target as HTMLElement;
        io.unobserve(el);
        el.style.opacity = '';
        el.style.transform = 'none';
      }),
    { rootMargin: '0px 0px -6% 0px' },
  );
  let raf = 0;
  addEventListener(
    'scroll',
    () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() =>
        document.querySelectorAll<HTMLElement>('[data-revealed]').forEach((el) => {
          if (el.style.transform && el.style.transform !== 'none' && el.getBoundingClientRect().top < innerHeight * 0.94) {
            io.unobserve(el);
            el.style.opacity = '';
            el.style.transform = 'none';
          }
        }),
      );
    },
    { passive: true },
  );
  const SEL = [
    'main section h1', 'main section h2', 'main section h3', 'main section p', 'main section li', 'main section figure',
    'main section details', 'main section [role=tablist]', 'main section [data-reveal]', 'main section fieldset > label',
    'main section fieldset > legend', 'main section .bl__panel', 'main section [data-reveal-btn]', 'footer > div > div',
  ].join(', ');
  requestAnimationFrame(() => {
    const all = Array.from(document.querySelectorAll<HTMLElement>(SEL)).filter((el) => !el.closest('[data-noreveal]'));
    const set = new Set<Element>(all);
    all.forEach((el) => {
      for (let a = el.parentElement; a; a = a.parentElement) if (set.has(a)) return;
      if (el.dataset.revealed) return;
      el.dataset.revealed = '1';
      const sib = Array.from(el.parentNode!.children).filter((c) => set.has(c));
      const idx = el.dataset.ri ? Number(el.dataset.ri) : Math.max(0, sib.indexOf(el));
      if (el.tagName !== 'H1') el.style.opacity = '0';
      el.style.transform = 'translateY(32px)';
      el.style.transition = 'opacity .8s cubic-bezier(0.16,1,0.3,1), transform 1s cubic-bezier(0.16,1,0.3,1)';
      el.style.transitionDelay = `${Math.min(idx, 8) * 70}ms`;
      io.observe(el);
    });
  });
}

/** 3D: ленивая загрузка за 800 px до первого слота; без WebGL страница работает без 3D. */
function setup3d(getState: () => { plat: string | null; theme: Theme; reduced: boolean }) {
  const slots = document.querySelectorAll('[data-vlx3d]');
  if (!slots.length) return;
  let booting = false;
  // SITE-49 (скорость): сцены грузятся только после первого действия человека (прокрутка, касание, клавиша, колесо) —
  // при загрузке страницы слоты 3D всегда ниже первого экрана, поэтому вид не меняется, а поток не занят до начала
  // прокрутки (Lighthouse: TBT телефона 5,8 с из-за сцены, стартовавшей до первого действия).
  let near = false;
  let intent = false;
  const boot = () => {
    if (booting || !near || !intent) return;
    booting = true;
    io.disconnect();
    import('../scenes/vilax3d.js').then((m) => m.boot({ getState })).catch(() => {});
  };
  const io = new IntersectionObserver(
    (es) => {
      if (!es.some((e) => e.isIntersecting)) return;
      near = true;
      boot();
    },
    { rootMargin: '800px 0px' },
  );
  const onIntent = () => {
    intent = true;
    for (const t of INTENT) removeEventListener(t, onIntent);
    boot();
  };
  const INTENT = ['scroll', 'wheel', 'touchstart', 'pointerdown', 'keydown'] as const;
  for (const t of INTENT) addEventListener(t, onIntent, { passive: true });
  // открыли страницу уже прокрученной (якорь, возврат назад) — действие уже было
  if (scrollY > 0 || location.hash) onIntent();
  requestAnimationFrame(() => slots.forEach((el) => io.observe(el)));
}
