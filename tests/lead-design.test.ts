// Форма дизайна 14.10.2026 (SITE-26): проверки как в прототипе и поля приёмника SITE-15. Имена и телефоны — выдуманные.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkDesignLead, designBody, designPhone, designPhoneShown } from '../src/lib/lead.ts';

const meta = { section: 'pricing', page: '/', utm: null, consentVersion: 'v1', requestRef: 'web-1', honeypot: '', elapsedMs: 5000 };

test('форма дизайна: проверки как в прототипе', () => {
  assert.deepEqual(checkDesignLead({ name: '', phone: '', city: '', company: '', chain: true, locations: '1' }), { name: 'name', phone: 'phone', city: 'city', company: 'company', locations: 'locations' });
  assert.deepEqual(checkDesignLead({ name: 'А', phone: '123', city: 'х', company: 'К', chain: false, locations: '' }), { phone: 'phoneBad', city: 'cityBad' });
  assert.deepEqual(checkDesignLead({ name: 'А', phone: '+7 900 000-00-00', city: 'Тестоград', company: 'К', chain: true, locations: '2' }), {});
});

test('форма дизайна: телефон — по стране валюты, иначе как номер другой страны', () => {
  assert.equal(designPhone('rub', '900 000 00 00'), '79000000000');
  assert.equal(designPhone('rub', '8 900 000-00-00'), '79000000000');
  assert.equal(designPhone('aed', '050 000 0000'), '971500000000');
  assert.equal(designPhone('rub', '+971 50 000 0000'), '971500000000');
  assert.equal(designPhone('aed', '+44 20 7946 0958'), '442079460958');
});

test('форма дизайна → приёмник: company → venue, сеть → segment и calc.locations, region по валюте', () => {
  const ru = designBody({ name: ' Иван ', phone: '+7 900 000-00-00', city: ' Тестоград ', company: 'Кофейня', chain: true, locations: '12' }, { ...meta, cur: 'rub', lang: 'ru' });
  assert.equal(ru.venue, 'Кофейня');
  assert.equal(ru.name, 'Иван');
  assert.equal(ru.phone, '+79000000000');
  assert.equal(ru.region, 'RU');
  assert.equal(ru.site, 'ru');
  assert.equal(ru.segment, 'chain');
  assert.deepEqual(ru.calc, { locations: 12, cur: 'RUB' });
  assert.equal(ru.city, 'Тестоград');
  assert.equal(ru.consent, true);
  const ae = designBody({ name: 'Ann', phone: '+971 50 000 0000', city: 'Dubai', company: 'Cafe', chain: false, locations: '' }, { ...meta, cur: 'aed', lang: 'en' });
  assert.equal(ae.region, 'AE');
  assert.equal(ae.site, 'en');
  assert.equal(ae.segment, 'independent');
  assert.deepEqual(ae.calc, { locations: 1, cur: 'AED' });
  const mixed = designBody({ name: 'Ann', phone: '+7 900 000 0000', city: 'Moscow', company: 'Cafe', chain: false, locations: '' }, { ...meta, cur: 'rub', lang: 'en' });
  assert.equal(mixed.region, 'RU');
  assert.equal(mixed.site, 'en');
});

test('SITE-50: телефон ОАЭ без +971 верный в AED; ₽ — как было (10–15 цифр)', () => {
  const x = { name: 'Ann', city: 'Dubai', company: 'Cafe', chain: false, locations: '' };
  assert.deepEqual(checkDesignLead({ ...x, phone: '50 123 4567' }, 'aed'), {});
  assert.deepEqual(checkDesignLead({ ...x, phone: '050 123 4567' }, 'aed'), {});
  assert.deepEqual(checkDesignLead({ ...x, phone: '+971 50 123 4567' }, 'aed'), {});
  assert.deepEqual(checkDesignLead({ ...x, phone: '+44 20 7946 0958' }, 'aed'), {});
  assert.deepEqual(checkDesignLead({ ...x, phone: '50 123 45' }, 'aed'), { phone: 'phoneBad' });
  assert.deepEqual(checkDesignLead({ ...x, phone: '50 123 4567' }, 'rub'), { phone: 'phoneBad' });
  assert.deepEqual(checkDesignLead({ ...x, phone: '50 123 4567' }), { phone: 'phoneBad' });
  assert.deepEqual(checkDesignLead({ ...x, phone: '900 123 45 67' }, 'rub'), {});
  assert.deepEqual(checkDesignLead({ ...x, phone: '0123456789' }, 'rub'), {});
  assert.equal(designBody({ ...x, phone: '50 123 4567' }, { ...meta, cur: 'aed', lang: 'en' }).phone, '+971501234567');
});

test('SITE-50: «Спасибо» — номер в формате страны', () => {
  assert.equal(designPhoneShown('rub', '9001234567'), '+7 900 123-45-67');
  assert.equal(designPhoneShown('rub', '8 (900) 123-45-67'), '+7 900 123-45-67');
  assert.equal(designPhoneShown('aed', '50 123 4567'), '+971 50 123 4567');
  assert.equal(designPhoneShown('aed', '0501234567'), '+971 50 123 4567');
  assert.equal(designPhoneShown('rub', '+971 50 123 4567'), '+971 50 123 4567');
  assert.equal(designPhoneShown('aed', '+44 20 7946 0958'), '+442079460958');
  assert.equal(designPhoneShown('rub', ' 0123456789 '), '+7 012 345-67-89');
  assert.equal(designPhoneShown('aed', ' 12-34 '), '12-34');
});
