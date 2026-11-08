const images = new Map<string, Promise<HTMLImageElement>>();
const tiles = new WeakMap<HTMLImageElement, string>();
export function decodeSeaImage(url: string) {
  let cached = images.get(url);
  if (!cached) {
    cached = (async () => {
      const image = new Image(); image.crossOrigin = 'anonymous'; image.src = url;
      await image.decode(); return image;
    })();
    images.set(url, cached);
  }
  return cached;
}
/** Bake the existing SVG artwork, contrast and haze once at the current size. */
export async function rasterSeaLayer(el: HTMLDivElement, water: HTMLImageElement, haze: number) {
  const svg = el.querySelector('svg');
  const canvas = el.querySelector('canvas');
  if (!svg || !canvas) return;
  const width = el.clientWidth, height = el.clientHeight;
  const dpr = Math.min(devicePixelRatio || 1, 1.5);
  let tileUrl = tiles.get(water);
  if (!tileUrl) {
    const tile = document.createElement('canvas'); tile.width = water.naturalWidth; tile.height = water.naturalHeight;
    const tileContext = tile.getContext('2d'); if (!tileContext) return;
    tileContext.drawImage(water, 0, 0);
    tileUrl = tile.toDataURL(); tiles.set(water, tileUrl);
  }
  const copy = svg.cloneNode(true) as SVGSVGElement;
  copy.style.removeProperty('display');
  copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  copy.setAttribute('width', String(width)); copy.setAttribute('height', String(height));
  const paper = getComputedStyle(el).getPropertyValue('--paper').trim();
  const decodedTile = tileUrl;
  copy.querySelectorAll('image').forEach(image => image.setAttribute('href', decodedTile));
  const source = new XMLSerializer().serializeToString(copy).replaceAll('var(--paper)', paper);
  const url = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml' }));
  try {
    const image = await decodeSeaImage(url);
    canvas.width = Math.ceil(width * dpr); canvas.height = Math.ceil(height * dpr);
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.filter = haze ? `blur(${haze * 1.2}px)` : 'none';
    if (!haze) { ctx.shadowColor = 'rgba(30,25,20,0.18)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = -3; }
    ctx.drawImage(image, 0, 0, width, height);
    svg.style.display = 'none'; canvas.style.display = 'block';
  } finally { images.delete(url); URL.revokeObjectURL(url); }
}