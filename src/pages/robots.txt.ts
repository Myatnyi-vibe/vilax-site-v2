// robots.txt: боевой сайт открыт поисковикам; превью и локальная сборка — закрыты.
import type { APIRoute } from 'astro';
import { MODE } from '../lib/mode';
import { SITE_URL, url } from '../lib/site';

export const GET: APIRoute = () => {
  const body = MODE === 'prod' ? `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}${url('/sitemap.xml')}\n` : 'User-agent: *\nDisallow: /\n';
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
