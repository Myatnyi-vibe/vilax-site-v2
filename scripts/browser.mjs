// Путь к браузеру для снимков и Lighthouse: CHROME_PATH, иначе Chrome, иначе Edge.
// Edge 155 (обновление 10.10.2026) в headless на этой машине не стартует — поэтому Chrome первым.
import { existsSync } from 'node:fs';

export function browserPath() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].filter(Boolean);
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error('Не найден Chrome/Edge: задайте CHROME_PATH');
  return found;
}
