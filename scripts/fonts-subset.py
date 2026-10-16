"""Подмножества шрифтов сайта (fonttools + brotli): python scripts/fonts-subset.py

Из fonts-src/ (исходники Inter 4.1 и JetBrains Mono 2.304, SIL OFL 1.1) в public/fonts/:
- inter-latin.woff2     — латиница и пунктуация, оси wght и opsz; грузится на всех страницах;
- inter-cyrillic.woff2  — кириллица, ₽ и №; браузер качает его только там, где есть русский текст (unicode-range);
- jbmono-num.woff2      — JetBrains Mono только для чисел: цифры, латиница для «AED», ₽, минус, пробелы.
Диапазоны ниже повторены в src/themes/base.css (unicode-range) — меняешь здесь, поменяй и там.
"""
import os
from fontTools.ttLib import TTFont
from fontTools import subset

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
SRC = os.path.join(ROOT, "fonts-src")
OUT = os.path.join(ROOT, "public", "fonts")

LATIN = "U+0020-007E,U+00A0-00FF,U+0131,U+0152-0153,U+02C6,U+02DA,U+02DC,U+2000-200B,U+2010-2027,U+202F,U+2030,U+2032-2033,U+2039-203A,U+2044,U+20AC,U+2122,U+2190-2193,U+2212,U+2215,U+2713"
CYRILLIC = "U+0400-045F,U+0490-0491,U+04D8-04D9,U+20BD,U+2116"
NUMBERS = "U+0020-007E,U+00A0,U+00D7,U+2009,U+2013,U+2014,U+202F,U+20BD,U+2212"

TEXT_FEATURES = "kern,liga,calt,ccmp,locl,mark,mkmk,tnum,case,ss01,cv11,frac,sups,subs"
NUMBER_FEATURES = "kern,tnum,zero,case"


def make(src, out, unicodes, features):
    font = TTFont(os.path.join(SRC, src), lazy=False)
    opts = subset.Options()
    opts.flavor = "woff2"
    opts.layout_features = features.split(",")
    opts.name_IDs = ["*"]
    opts.notdef_outline = True
    sub = subset.Subsetter(opts)
    sub.populate(unicodes=subset.parse_unicodes(unicodes))
    sub.subset(font)
    font.flavor = "woff2"
    path = os.path.join(OUT, out)
    font.save(path)
    print(f"{out}: {os.path.getsize(path) / 1024:.1f} KB")


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    make("InterVariable.woff2", "inter-latin.woff2", LATIN, TEXT_FEATURES)
    make("InterVariable.woff2", "inter-cyrillic.woff2", CYRILLIC, TEXT_FEATURES)
    make("JetBrainsMono-Variable.ttf", "jbmono-num.woff2", NUMBERS, NUMBER_FEATURES)
