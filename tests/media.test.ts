// Медиа-слой (SITE-25, docs/media-contract.md): у каждого экрана и ролика все варианты своего сочетания —
// либо файл нужного размера, либо отметка «не прошёл» с причиной; в preview/prod без файлов сборка падает.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (p: string) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const req = read('src/data/media-required.json');
const site = (k: string) => read(`src/content/site/${k}.json`);

test('media-required: экраны каждой валюты = экраны блоков её словарей', () => {
  const sets = { rub: ['rub-ru', 'rub-en'], aed: ['aed-en', 'aed-ru'] } as const;
  for (const [cur, keys] of Object.entries(sets)) {
    const ids = new Set<string>();
    for (const k of keys)
      for (const b of site(k).blocks) {
        if (b.shot) ids.add(b.shot);
        for (const f of b.features) if (f.screen) ids.add(f.screen);
      }
    assert.deepEqual([...ids].sort(), [...req.shots[cur]].sort(), cur);
  }
});

function run(mode: string) {
  const dir = mkdtempSync(join(tmpdir(), 'vlx-media-'));
  try {
    const out = join(dir, 'media.json');
    const r = spawnSync(process.execPath, [join(ROOT, 'scripts/media.mjs'), '--mode', mode, '--out', out], { encoding: 'utf8' });
    let json = null;
    try {
      json = JSON.parse(readFileSync(out, 'utf8'));
    } catch {
      /* нет манифеста */
    }
    return { status: r.status, stderr: r.stderr, json };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('манифест полон: у каждого варианта — файл своего сочетания, заглушка (local) или «не прошёл» с причиной', () => {
  const { status, json } = run('local');
  assert.equal(status, 0);
  const failed = new Set(json.failed.map((f: { key: string }) => f.key));
  // этап 1 выкладки: ролика может не быть — тогда обложка показывает снимок блока своего сочетания
  const noVideo = new Set(json.missingVideo.map((f: { key: string }) => f.key));
  for (const cur of ['rub', 'aed'])
    for (const id of req.shots[cur])
      for (const lang of req.langs)
        for (const theme of req.themes) {
          const v = json.shots[cur][id][`${lang}-${theme}`];
          const key = `${cur}/${lang}/${theme}/${id}`;
          assert.ok(v || failed.has(key), `нет варианта ${key}`);
          if (v && !v.placeholder) assert.equal(v.src, `shots/${cur}/${lang}/${theme}/${id}.webp`, `чужой файл у ${key}`);
        }
  for (const cur of req.video.currencies)
    for (const lang of req.langs)
      for (const theme of req.themes)
        for (const fmt of Object.keys(req.video.formats)) {
          const combo = `${cur}-${lang}-${theme}`;
          const v = json.video[combo][fmt];
          assert.ok(v || failed.has(`${combo}/${fmt}`) || noVideo.has(`${combo}/${fmt}`), `ролик ${combo}/${fmt} не учтён`);
          if (v && !v.placeholder) assert.equal(v.mp4, `video/hero-${combo}-${fmt}.mp4`, `чужой ролик у ${combo}/${fmt}`);
        }
});

test('preview и prod: без настоящих снимков манифест не собирается (ролики — необязательны, этап 1)', () => {
  const local = run('local').json;
  for (const mode of ['preview', 'prod']) {
    const strict = run(mode);
    if (local.missing.length) {
      assert.notEqual(strict.status, 0, `сборка ${mode} прошла без файлов медиа`);
      assert.match(strict.stderr, /не хватает/);
    } else assert.equal(strict.status, 0);
  }
});

test('кадры приложения (SITE-55): только своего сочетания и экраны из media-required; необязательны — preview не падает без них', () => {
  const { status, json } = run('preview');
  assert.equal(status, 0);
  for (const cur of ['rub', 'aed'])
    for (const [id, vs] of Object.entries(json.app[cur] as Record<string, Record<string, { src: string; w: number; h: number }>>)) {
      assert.ok(req.shots[cur].includes(id), `кадр приложения ${cur}/${id} — нет такого экрана`);
      for (const [variant, v] of Object.entries(vs)) {
        const [lang, theme] = variant.split('-');
        assert.equal(v.src, `shots-app/${cur}/${lang}/${theme}/${id}.webp`, `чужой кадр у ${cur}/${variant}/${id}`);
        assert.deepEqual([v.w, v.h], [req.shotsApp.size.width, req.shotsApp.size.height]);
      }
    }
  for (const f of json.appFailed) assert.ok(f.reason, `кадр приложения ${f.key}: fail без причины`);
});
