// sitemap.xml: одна главная «/» и правовые страницы (документы РФ — /ru/…, ОАЭ — в корне).
import type { APIRoute } from 'astro';
import { SITE_URL, LEGAL_DOCS, legalPath, url } from '../lib/site';

const locs = [url('/'), ...LEGAL_DOCS.flatMap((d) => [legalPath('ru', d), legalPath('en', d)])];

export const GET: APIRoute = () =>
  new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${locs.map((l) => `<url><loc>${SITE_URL}${l}</loc></url>`).join('\n')}\n</urlset>\n`,
    { headers: { 'Content-Type': 'application/xml; charset=utf-8' } },
  );
