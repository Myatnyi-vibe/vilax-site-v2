// deploy/public-audit.mjs: что запрещено, что только предупреждение, что не трогаем.
// Строки-образцы собираются из частей: страж читает и этот файл, целые образцы он принял бы за утечку.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scanText } from '../public-audit.mjs';

const j = (...p) => p.join('');
const kinds = (text, path = 'src/x.ts') => scanText(path, text).map((f) => `${f.level}:${f.what}`);

test('запрещено: рабочая и личная почта, стейдж, демо-аккаунт, служебная страница, документ, локальный путь', () => {
  assert.deepEqual(kinds(j('вход ', 'someone', '@', 'vilax', '.app')), ['block:рабочая почта']);
  assert.deepEqual(kinds(j('mail ', 'name', '@', 'gmail', '.com')), ['block:личная почта']);
  assert.deepEqual(kinds(j('https://', 'dev', '.vilax', '.ai/demo')), ['block:адрес стейджа']);
  assert.deepEqual(kinds(j('/loyalty/', 'samovar', '-ru-uk')), ['block:адрес демо-аккаунта стейджа']);
  assert.deepEqual(kinds(j('https://x', '.chatgpt', '.site/')), ['block:служебная страница']);
  assert.deepEqual(kinds(j('https://claude.ai/code/', 'artifact/1')), ['block:внутренний документ']);
  assert.deepEqual(kinds(j('C:', '\\', 'Users\\me')), ['block:локальный путь']);
  assert.deepEqual(kinds(j('Downloads', '\\', 'file.xlsx')), ['block:локальный путь']);
});

test('запрещено: токены и ключи', () => {
  assert.deepEqual(kinds(j('ghp', '_', 'a'.repeat(36))), ['block:токен GitHub']);
  assert.deepEqual(kinds(j('-----BEGIN ', 'RSA PRIVATE KEY', '-----')), ['block:закрытый ключ']);
  assert.deepEqual(kinds(j('pass', 'word', ' = "', 'hunter22', '"')), ['block:пароль или ключ в коде']);
  assert.deepEqual(kinds(j('server ', '10.20', '.30.40')), ['block:IP-адрес']);
});

test('можно: публичные адреса, приёмник заявок, 127.0.0.1, версии пакетов в lock-файле', () => {
  assert.deepEqual(kinds('support@vilax.ai https://app.vilax.ai https://tracker.vilax.ai/api/site/demo-request http://127.0.0.1:8890'), []);
  assert.deepEqual(kinds(j('"version": "10.20', '.30.40"'), 'package-lock.json'), []);
});

test('имя из команды — предупреждение, не запрет', () => {
  assert.deepEqual(kinds(j('решение ', 'Ильяс', 'а')), ['warn:имя человека из команды']);
});
