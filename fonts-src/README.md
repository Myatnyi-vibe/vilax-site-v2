# Исходники шрифтов

Лицензия у обоих — SIL Open Font License 1.1 (https://openfontlicense.org/). Копии из платформы VILAX (`src/app/fonts/originals`).

| Файл | Источник |
|---|---|
| `InterVariable.woff2` | Inter 4.1, https://github.com/rsms/inter/releases/download/v4.1/Inter-4.1.zip (`web/InterVariable.woff2`), оси `wght` и `opsz` |
| `JetBrainsMono-Variable.ttf` | JetBrains Mono 2.304, https://github.com/JetBrains/JetBrainsMono/releases/download/v2.304/JetBrainsMono-2.304.zip (`fonts/variable/JetBrainsMono[wght].ttf`) |

В сборку попадают только подмножества из `public/fonts/` — их делает `python scripts/fonts-subset.py`.
