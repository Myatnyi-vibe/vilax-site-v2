import { test } from 'node:test';
import assert from 'node:assert/strict';
import { typo } from '../src/lib/typo.ts';

const NB = String.fromCharCode(0xa0);

test('русские предлоги приклеиваются к следующему слову', () => {
  assert.equal(typo('ru', 'сеть ресторанов в одной системе'), `сеть ресторанов в${NB}одной системе`);
  assert.equal(typo('ru', 'и в одной'), `и${NB}в${NB}одной`);
  assert.equal(typo('ru', 'VILAX — вся сеть'), `VILAX${NB}— вся сеть`);
});

test('короткие предлоги из трёх букв тоже не остаются в конце строки', () => {
  assert.equal(typo('ru', 'стоимость под вашу сеть'), `стоимость под${NB}вашу сеть`);
  assert.equal(typo('ru', 'Для сети без долгов'), `Для${NB}сети без${NB}долгов`);
  assert.equal(typo('ru', 'подход'), 'подход');
});

test('число не отрывается от слова после него', () => {
  assert.equal(typo('ru', 'на 50 сотрудников'), `на${NB}50${NB}сотрудников`);
  assert.equal(typo('ru', 'версия 2 Лояльность'), 'версия 2 Лояльность');
});

test('английский текст не меняется', () => {
  assert.equal(typo('en', 'one system in a day'), 'one system in a day');
});

test('число не отрывается от знака рубля и процента', () => {
  assert.equal(typo('ru', 'чек 494 ₽, НДС 22 %'), `чек 494${NB}₽, НДС 22${NB}%`);
  assert.equal(typo('en', 'AED 490, 5 %'), 'AED 490, 5 %');
});

test('SITE-47: заголовок обложки — «Вся сеть —» / «в одном окне»', () => {
  assert.equal(typo('ru', 'Вся сеть — в одном окне'), `Вся сеть${NB}— в${NB}одном окне`);
  assert.equal(typo('ru', '<p>Данные о вас и о ваших заказах — по запросу.</p>'), `<p>Данные о${NB}вас и${NB}о${NB}ваших заказах${NB}— по${NB}запросу.</p>`);
  assert.equal(typo('en', 'Your venues. One screen.'), 'Your venues. One screen.');
});

test('SITE-47: «что», «или», «через» тоже не висят', () => {
  assert.equal(typo('ru', 'что продвигать, что убрать'), `что${NB}продвигать, что${NB}убрать`);
  assert.equal(typo('ru', 'локаций или блоков через неделю'), `локаций или${NB}блоков через${NB}неделю`);
  assert.equal(typo('ru', 'Чтобы ничто'), 'Чтобы ничто');
});
