// Ролик обложки (прототип syncHeroVideo, поведение Hero.astro SITE-10): сначала кадр-обложка .webp, ролик
// подключается после, без звука, по кругу, проявляется за .4s, когда реально пошёл; пауза вне экрана, на скрытой
// вкладке и по кнопке. «Меньше движения» и Save-Data — только кадр. Вариант — строго своего сочетания и формата
// (16:9 / 9:16 по ширине 768): при смене языка, валюты, темы или формата ролик меняется на свой вариант.
// Нет ролика у сочетания — снимок блока своего сочетания (₽ — t001, AED — t014) в рамке 2:1, как heroPanel 'shot'.
import { axes, onAxes, reduced, shotCode, shotUrl, type PageData } from './state';

type Handle = { key: string; v: HTMLVideoElement; btn: HTMLButtonElement; io: IntersectionObserver; paused: boolean; onScreen: boolean; sync: () => void; label: () => void };

export function initHeroVideo(D: PageData) {
  const fig = document.querySelector<HTMLElement>('[data-hero-fig]');
  const scr = document.querySelector<HTMLElement>('[data-hero-screen]');
  if (!fig || !scr) return;
  const img = scr.querySelector<HTMLImageElement>('[data-hero-poster]')!;
  const ph = scr.querySelector<HTMLElement>('[data-hero-ph]')!;
  const mq = matchMedia('(max-width: 767.98px)');
  let h: Handle | null = null;

  const drop = () => {
    if (!h) return;
    h.io.disconnect();
    h.v.pause();
    h.v.remove();
    h.btn.remove();
    h = null;
  };

  function sync() {
    const a = axes();
    const combo = `${a.cur}-${a.lang}-${a.theme}`;
    const mobile = mq.matches;
    const fmt = mobile ? '9x16' : '16x9';
    const code = (D.media.video[combo] || '00')[mobile ? 1 : 0];
    const base = `${D.media.base}video/hero-${combo}-${fmt}`;
    if (code !== '1') {
      // этап 1 выкладки: ролика сочетания нет — снимок блока этого же сочетания (heroPanel 'shot' прототипа)
      drop();
      const id = a.cur === 'rub' ? 't001' : 't014';
      const sc = shotCode(D, a, id);
      fig!.classList.add('is-shot');
      fig!.hidden = sc === '0';
      ph.hidden = sc !== 'p';
      ph.textContent = `${a.cur}/${a.lang}/${a.theme}/${id}`;
      if (sc !== '1') return img.removeAttribute('src');
      img.width = 1600;
      img.height = 800;
      const src = shotUrl(D, a, id);
      if (img.getAttribute('src') !== src) img.src = src;
      return;
    }
    fig!.classList.remove('is-shot');
    fig!.hidden = false;
    ph.hidden = true;
    img.width = mobile ? 720 : 1600;
    img.height = mobile ? 1280 : 900;
    if (img.getAttribute('src') !== `${base}.webp`) img.src = `${base}.webp`;
    if (h && h.key === base) return h.label();
    drop();
    if (reduced || (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData) return;
    const v = document.createElement('video');
    v.muted = true;
    v.defaultMuted = true;
    v.loop = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.setAttribute('muted', '');
    v.setAttribute('playsinline', '');
    v.setAttribute('aria-hidden', 'true');
    v.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity .4s cubic-bezier(0.23,1,0.32,1)';
    for (const [ext, type] of [['webm', 'video/webm'], ['mp4', 'video/mp4']]) {
      const so = document.createElement('source');
      so.src = `${base}.${ext}`;
      so.type = type;
      v.append(so);
    }
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.style.cssText =
      'position:absolute;right:12px;bottom:12px;z-index:2;display:grid;place-items:center;width:44px;height:44px;padding:0;border-radius:9999px;border:1px solid var(--hairS);background:color-mix(in srgb,var(--bg) 78%,transparent);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);color:var(--ink);cursor:pointer';
    btn.innerHTML =
      '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><path data-i="pause" d="M5.5 3.5v9M10.5 3.5v9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path data-i="play" d="M5.5 3.2v9.6L12.8 8z" fill="currentColor" style="display:none"/></svg>';
    const hh: Handle = {
      key: base, v, btn, paused: false, onScreen: true,
      io: new IntersectionObserver(([e]) => {
        hh.onScreen = e.isIntersecting;
        hh.sync();
      }),
      label: () => {
        const t = D.ui[axes().lang].video;
        btn.setAttribute('aria-label', hh.paused ? t.play : t.pause);
        btn.querySelector<SVGElement>('[data-i=pause]')!.style.display = hh.paused ? 'none' : '';
        btn.querySelector<SVGElement>('[data-i=play]')!.style.display = hh.paused ? '' : 'none';
      },
      sync: () => {
        if (hh.onScreen && !hh.paused && !document.hidden) v.play().catch(() => {});
        else v.pause();
        hh.label();
      },
    };
    v.addEventListener('playing', () => (v.style.opacity = '1'), { once: true });
    btn.addEventListener('click', () => {
      hh.paused = !hh.paused;
      hh.sync();
    });
    hh.io.observe(scr!);
    scr!.append(v, btn);
    h = hh;
    hh.sync();
  }

  document.addEventListener('visibilitychange', () => h?.sync());
  mq.addEventListener('change', sync);
  onAxes(() => sync());
  sync();
}
