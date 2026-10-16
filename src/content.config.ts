// Коллекции Astro не используются: словари и правовые тексты читаются напрямую (src/i18n, src/lib/legal.ts).
// Пустые коллекции ru и en отключают автоматические коллекции из папок src/content/* (и предупреждение при сборке).
import { defineCollection } from 'astro:content';

const none = () => defineCollection({ loader: () => [] });

export const collections = { ru: none(), en: none() };
