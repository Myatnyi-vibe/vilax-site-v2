// Разметка schema.org. Без цен: цены живут в справочнике и меняются отдельно.
import { BASE, SITE_URL, SUPPORT_EMAIL, url } from './site';

export function organizationLd(): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'VILAX',
    url: SITE_URL + BASE,
    logo: SITE_URL + url('/apple-touch-icon.png'),
    email: SUPPORT_EMAIL,
  };
}
