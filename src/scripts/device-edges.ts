// Полосы экрана устройства (Macbook.astro, Iphone.astro) — цвет края картинки в экране: верхняя и нижняя строка,
// самый частый цвет из 64 замеров (у снимков по краю бывают столбики графика, кнопки и панель вкладок — средний цвет дал бы
// грязь). Ставит --dev-top / --dev-bot / --dev-side (боковые края) на [data-dev]; картинка — первый img внутри [data-dev-screen]. Новый src
// (переключение функции) — новый замер по событию load; картинку убрали (плейсхолдер) или чтение запрещено — цвет темы
// устройства (его задаёт сам компонент как запасной).
const cv = document.createElement('canvas');
cv.width = 64;
cv.height = 1;
const cx = cv.getContext('2d', { willReadFrequently: true });

// edge: верхняя строка, нижняя строка или боковые столбцы (по 32 замера слева и справа)
function mode(img: HTMLImageElement, edge: 'top' | 'bot' | 'side') {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  cx!.clearRect(0, 0, 64, 1);
  if (edge === 'side') {
    cx!.save();
    cx!.translate(0, 1);
    cx!.rotate(-Math.PI / 2);
    // столбец слева → x 0…32, справа → 32…64 (поворот: высота кадра ложится вдоль строки)
    cx!.drawImage(img, 0, 0, 2, h, 0, 0, 1, 32);
    cx!.drawImage(img, w - 2, 0, 2, h, 0, 32, 1, 32);
    cx!.restore();
  } else cx!.drawImage(img, 0, edge === 'top' ? 0 : h - 2, w, 2, 0, 0, 64, 1);
  const d = cx!.getImageData(0, 0, 64, 1).data;
  const bins = new Map<number, number[]>();
  for (let i = 0; i < 64; i++) {
    const [r, g, b] = [d[i * 4], d[i * 4 + 1], d[i * 4 + 2]];
    const k = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const s = bins.get(k) ?? [0, 0, 0, 0];
    s[0]++, (s[1] += r), (s[2] += g), (s[3] += b);
    bins.set(k, s);
  }
  const [n, r, g, b] = [...bins.values()].sort((x, y) => y[0] - x[0])[0];
  return `rgb(${Math.round(r / n)} ${Math.round(g / n)} ${Math.round(b / n)})`;
}

function watch(dev: HTMLElement) {
  const img = () => dev.querySelector<HTMLImageElement>('[data-dev-screen] img');
  const clear = () => {
    dev.style.removeProperty('--dev-top');
    dev.style.removeProperty('--dev-bot');
    dev.style.removeProperty('--dev-side');
  };
  const paint = () => {
    const im = img();
    if (!cx || !im || !im.getAttribute('src') || !im.complete || !im.naturalWidth) return;
    try {
      dev.style.setProperty('--dev-top', mode(im, 'top'));
      dev.style.setProperty('--dev-bot', mode(im, 'bot'));
      dev.style.setProperty('--dev-side', mode(im, 'side'));
    } catch {
      clear();
    }
  };
  dev.addEventListener('load', paint, true);
  new MutationObserver(() => img()?.getAttribute('src') || clear()).observe(dev, { subtree: true, attributes: true, attributeFilter: ['src'] });
  paint();
}

document.querySelectorAll<HTMLElement>('[data-dev]').forEach(watch);
