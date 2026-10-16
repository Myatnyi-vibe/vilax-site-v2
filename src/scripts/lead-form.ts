// Форма заявки (прототип submitLead/formVals) → приёмник SITE-15 (SITE-26). Поля читаются из DOM при отправке;
// в состоянии только «сеть» и степпер. Проверка — правила дизайна (src/lib/lead.ts, checkDesignLead), сообщения —
// словарь сочетания. Режимы сборки: local — стенд трекера (8890), preview — ничего не отправляет, prod — адрес сборки.
import { axes, onAxes, type PageData } from './state';
import { checkDesignLead, designBody, designPhoneShown, newRequestRef, outcomeOf, utmOf, pageOf, type DesignErrors, type DesignLead, type LeadCur } from '../lib/lead';

const FIELDS = ['name', 'phone', 'city', 'company'] as const;

export function initLeadForm(D: PageData) {
  const api = { section: 'pricing' as string };
  const form = document.querySelector<HTMLFormElement>('[data-lead-form]');
  const done = document.querySelector<HTMLElement>('[data-lead-done]');
  if (!form || !done) return api;
  const status = form.querySelector<HTMLElement>('[data-lead-status]')!;
  const chainCb = form.querySelector<HTMLInputElement>('[data-chain]')!;
  const box = document.getElementById('lead-loc-box')!;
  const loc = form.querySelector<HTMLInputElement>('#lead-loc')!;
  const dec = form.querySelector<HTMLButtonElement>('[data-loc-dec]')!;
  const inc = form.querySelector<HTMLButtonElement>('[data-loc-inc]')!;
  const submit = form.querySelector<HTMLButtonElement>('button[type=submit]')!;
  const started = performance.now();
  let requestRef = newRequestRef();
  let err: DesignErrors = {};
  let sendErr: string | null = null;
  let last: DesignLead | null = null;
  let lastCur: LeadCur = 'rub';
  let busy = false;

  const dict = () => {
    const a = axes();
    return D.lead[`${a.cur}-${a.lang}`];
  };

  function paintErrors() {
    const L = dict();
    for (const f of [...FIELDS, 'locations'] as const) {
      const input = document.getElementById(f === 'locations' ? 'lead-loc' : `lead-${f}`) as HTMLInputElement;
      const span = document.getElementById(f === 'locations' ? 'lead-loc-err' : `lead-${f}-err`)!;
      const code = err[f];
      input.setAttribute('aria-invalid', String(!!code));
      span.hidden = !code;
      span.textContent = code ? L.err[code] : '';
    }
    status.hidden = !sendErr;
    status.textContent = sendErr ? D.ui[axes().lang].send[sendErr] : '';
  }

  function paintChain() {
    const on = chainCb.checked;
    box.classList.toggle('is-open', on);
    chainCb.setAttribute('aria-expanded', String(on));
    for (const el of [loc, dec, inc]) el.disabled = !on;
  }

  function paintDone() {
    if (!last) return;
    const L = dict();
    const fill = (t: string) => t.replace('{name}', last!.name.trim()).replace('{phone}', designPhoneShown(lastCur, last!.phone));
    done!.querySelector('[data-done-title]')!.textContent = fill(L.doneTitle);
    done!.querySelector('[data-done-text]')!.textContent = fill(L.doneText);
  }

  chainCb.addEventListener('change', () => {
    if (chainCb.checked && !loc.value) loc.value = '2';
    err = { ...err, locations: undefined };
    paintChain();
    paintErrors();
  });
  const step = (d: number) => {
    loc.value = String(Math.max(2, (parseInt(loc.value, 10) || 1) + d));
    err = { ...err, locations: undefined };
    paintErrors();
  };
  dec.addEventListener('click', () => step(-1));
  inc.addEventListener('click', () => step(1));
  loc.addEventListener('change', () => {
    loc.value = loc.value.replace(/[^0-9]/g, '').slice(0, 5);
    err = { ...err, locations: undefined };
    paintErrors();
  });
  for (const f of FIELDS) {
    document.getElementById(`lead-${f}`)!.addEventListener('input', () => {
      if (err[f]) {
        err = { ...err, [f]: undefined };
        paintErrors();
      }
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (busy) return;
    const fd = new FormData(form);
    const v: DesignLead = {
      name: String(fd.get('name') || '').trim(),
      phone: String(fd.get('phone') || '').trim(),
      city: String(fd.get('city') || '').trim(),
      company: String(fd.get('company') || '').trim(),
      chain: chainCb.checked,
      locations: loc.value,
    };
    err = checkDesignLead(v, axes().cur);
    sendErr = null;
    paintErrors();
    const bad = (['name', 'phone', 'city', 'company', 'locations'] as const).find((k) => err[k]);
    if (bad) {
      document.getElementById(bad === 'locations' ? 'lead-loc' : `lead-${bad}`)?.focus();
      return;
    }
    const a = axes();
    const mode = form.dataset.mode;
    const url = form.dataset.url;
    if (mode !== 'preview') {
      if (!url) {
        sendErr = 'failed';
        return paintErrors();
      }
      busy = true;
      submit.setAttribute('aria-busy', 'true');
      try {
        const body = designBody(v, {
          cur: a.cur, lang: a.lang, section: api.section, page: pageOf(location.pathname), utm: utmOf(location.search),
          consentVersion: (a.cur === 'rub' ? form.dataset.consentRub : form.dataset.consentAed) || '',
          requestRef, honeypot: String(fd.get('website') || ''), elapsedMs: performance.now() - started,
        });
        const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const out = outcomeOf(r.status, await r.json().catch(() => null));
        if (out.kind !== 'ok') {
          sendErr = out.kind;
          return paintErrors();
        }
      } catch {
        sendErr = 'failed';
        return paintErrors();
      } finally {
        busy = false;
        submit.removeAttribute('aria-busy');
      }
    }
    last = v;
    lastCur = a.cur;
    requestRef = newRequestRef();
    dispatchEvent(new CustomEvent('vilax:lead', { detail: { stage: 'sent' } }));
    paintDone();
    form.hidden = true;
    done.hidden = false;
    done.focus({ preventScroll: true });
  });

  done.querySelector('[data-lead-edit]')!.addEventListener('click', () => {
    done.hidden = true;
    form.hidden = false;
  });

  onAxes(() => {
    paintErrors();
    paintDone();
  });
  paintChain();
  return api;
}
