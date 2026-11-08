import { useEffect, useRef } from "react";
import seaAsset from "@/assets/pencil-sea-tile.jpg.asset.json";
const waterUrl = seaAsset.url;
import canoeUrl from "@/assets/graphite-canoe.png";
import { subscribeSea } from './sea-clock';
import { decodeSeaImage, rasterSeaLayer } from './sea-raster';
import {
  SESSION_KEY, canoeSpot, clamp, easeOut, easeOutBack, entryDuration, frontFrom,
  layerCount, layerTop, patternTile, crestPath, hazeOf, rockAngle, waveAmplitude, wavePath,
} from "./papercut";

const layers = Array.from({ length: layerCount }, (_, i) => i);
const SNIPPETS = 9;

function Layer({ i, setRef }: { i: number; setRef: (el: HTMLDivElement | null) => void }) {
  const depth = i / (layerCount - 1);
  const tile = patternTile(i);
  const haze = hazeOf(i);
  const fade = haze > 0 ? `linear-gradient(to bottom, rgba(0,0,0,${(1 - haze) * 0.5}) 0%, rgba(0,0,0,${1 - haze * 0.6}) 25%, #000 60%)` : undefined;
  return (
    <div ref={setRef} className="papercut-layer" style={{ top: `${layerTop(i) * 100}%`, zIndex: i < frontFrom ? i : 20 + i, maskImage: fade, WebkitMaskImage: fade }}>
      <canvas aria-hidden="true" style={{ display: 'none' }} />
      <svg viewBox="0 0 1000 300" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="pc-valley" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--paper)" stopOpacity="0.35" />
            <stop offset="0.12" stopColor="var(--paper)" stopOpacity="0" />
            <stop offset="0.3" stopColor="#1e1914" stopOpacity="0.12" />
            <stop offset="0.6" stopColor="#1e1914" stopOpacity="0" />
          </linearGradient>
          <pattern id={`pc-water-${i}`} patternUnits="userSpaceOnUse" width={tile.w} height={tile.h} x={tile.x} y={tile.y}>
            <image href={waterUrl} width={tile.w} height={tile.h} preserveAspectRatio="none" />
          </pattern>
        </defs>
        <path d={wavePath(i)} fill="var(--paper)" />
        <path d={wavePath(i)} fill={`url(#pc-water-${i})`} opacity={(0.35 + depth * 0.6) * (1 - haze * 0.7)} style={{ filter: `contrast(${(0.75 + depth * 0.65) * (1 - haze * 0.4)})` }} />
        {/* valley: darker trough falling away under the crest of this row */}
        <path d={wavePath(i)} fill={`url(#pc-valley)`} opacity={0.5 * (1 - haze)} />
        {/* thin pale highlight along the crest */}
        <path d={crestPath(i)} fill="none" stroke="var(--paper)" strokeWidth={0.6 + depth * 1.2} opacity={0.55 * (1 - haze * 0.8)} vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}

export function PapercutSea({ contained = false, onCanoeEntered }: { contained?: boolean; onCanoeEntered?: () => void }) {
  const sceneRef = useRef<HTMLDivElement>(null);
  const layerRefs = useRef<(HTMLDivElement | null)[]>([]);
  const canoeRef = useRef<HTMLDivElement>(null);
  const shadowRef = useRef<HTMLDivElement>(null);
  const snipRefs = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    let reduce = motion.matches;
    let seen = false;
    try { seen = sessionStorage.getItem(SESSION_KEY) === "1"; sessionStorage.setItem(SESSION_KEY, "1"); } catch { /* ignore */ }
    const animateEntry = !reduce && !seen;
    let start = 0, activeTime = 0, previous = 0;
    const snips = Array.from({ length: SNIPPETS }, () => ({ born: -1e9, vx: 0, vy: 0 }));
    let lastPitch = 0, sprayed = !animateEntry;
    let disposed = false, ready = false, visible = false;
    let entryNotified = false;
    let unsubscribe: (() => void) | undefined;
    let w = scene.clientWidth, h = scene.clientHeight;

    const render = (now: number) => {
      if (!start) start = now;
      if (previous && !document.hidden) activeTime += Math.min(now - previous, 50);
      previous = now;
      const t = animateEntry && !reduce ? activeTime : entryDuration + 1;
      if (t >= 2200 && !entryNotified && ready) {
        entryNotified = true;
        onCanoeEntered?.();
      }
      const s = reduce ? 0 : now / 1000;

      layers.forEach((i) => {
        const el = layerRefs.current[i];
        if (!el) return;
        const depth = i / (layerCount - 1);
        const amp = waveAmplitude * (0.25 + depth * 0.75);
        const p1 = 4 + (i * 0.83) % 5, p2 = 6 + (i * 1.37) % 3;
        const dy = reduce ? 0 : Math.sin((s * 2 * Math.PI) / p1 + i) * amp + Math.sin((s * 2 * Math.PI) / p2 + i * 2.1) * amp * 0.4;
        const dx = reduce ? 0 : Math.sin((s * 2 * Math.PI) / p2 + i) * amp * 1.6;
        // The final foreground layer lands without upward overshoot or a hull-covering swell.
        const land = i === layerCount - 1 ? easeOut((t - i * 90) / 600) : easeOutBack((t - i * 90) / 600);
        const rise = (1 - land) * h * 0.8;
        const k = clamp((t - 800) / 1400);
        const heave = i >= layerCount - 3 && i < layerCount - 1 && k > 0 && k < 1 ? -Math.sin(k * Math.PI) * (6 + (i - layerCount + 3) * 4) : 0;
        el.style.transform = `translate3d(${dx}px, ${dy + rise + heave}px, 0)`;
        el.style.opacity = '1';
      });

      // Canoe rides the layer just behind the front layers.
      const base = canoeSpot(now);
      const spot0 = w < 700 ? { ...base, x: Math.min(base.x, 0.62) } : base;
      // Same fractional waterline in both variants: the wave crests are fractional too,
      // so the visible hull above the front wave matches the contained hero.
      const spot = spot0;
      const cw = Math.min(560, w * (w < 700 ? 0.58 : 0.44), h * 0.95) * spot.scale; // keep the hull inside the front waves on short, wide screens
      const ch = cw * 0.4;
      const ls = (s * 2 * Math.PI) / 5.3;
      const pitch = reduce ? 0 : Math.sin(ls) * 0.75 + Math.sin((s * 2 * Math.PI) / 6.7 + 1) * 0.25;
      // Rise: hidden behind the front layers, bow down, then level; spring settle after.
      const k = animateEntry ? easeOut((t - 800) / 1400) : 1;
      const u = animateEntry ? clamp((t - 2200) / 800) : 1;
      const spring = u > 0 && u < 1 ? -7 * Math.exp(-4 * u) * Math.cos(u * Math.PI * 5) * (1 - u) : 0;
      const settle = u;
      const riseY = (1 - k) * ch * 1.15 + (u === 0 && animateEntry ? 0 : spring);
      const tilt = (1 - k) * -8;
      const roll = (1 - k) * 0.12;
      const bob = reduce ? 0 : Math.sin(ls - 0.4) * waveAmplitude * 0.75 * settle;
      const angle = pitch * rockAngle * settle + tilt;
      if (canoeRef.current) {
        canoeRef.current.style.width = `${cw}px`;
        canoeRef.current.style.height = `${ch}px`;
        canoeRef.current.style.transform = `translate3d(${spot.x * w - cw / 2}px, ${spot.y * h - ch * 0.9 + bob + riseY}px, 0) rotate(${angle}deg) scaleY(${1 - roll})`;
      }
      if (shadowRef.current) {
        const sw = cw * 0.95;
        shadowRef.current.style.width = `${sw}px`;
        shadowRef.current.style.transform = `translate3d(${spot.x * w - sw / 2}px, ${spot.y * h - 14 + bob * 0.6}px, 0)`;
        shadowRef.current.style.opacity = String(k);
      }
      if (!sprayed && t > 1300) {
        sprayed = true;
        snips.forEach((sn, n) => { sn.born = now + n * 70; sn.vx = -30 + Math.random() * cw * 0.5; sn.vy = 60 + Math.random() * 50; });
      }

      // Paper snippets pop at the bow (left) when it dips.
      if (!reduce && settle > 0.99 && lastPitch > -0.6 && pitch <= -0.6) {
        snips.forEach((sn, k) => { sn.born = now + k * 40; sn.vx = -20 - Math.random() * 30; sn.vy = 40 + Math.random() * 30; });
      }
      lastPitch = pitch;
      snips.forEach((sn, k) => {
        const el = snipRefs.current[k];
        if (!el) return;
        const age = (now - sn.born) / 1000;
        if (age < 0 || age > 0.9) { el.style.opacity = "0"; return; }
        const x = spot.x * w - cw * 0.42 + sn.vx * age;
        const y = spot.y * h + bob - sn.vy * age + 160 * age * age;
        el.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${age * 400 + k * 60}deg)`;
        el.style.opacity = String(1 - age / 0.9);
      });

    };
    const update = () => {
      unsubscribe?.(); unsubscribe = undefined; previous = 0;
      scene.dataset['active'] = String(ready && visible && !document.hidden && !reduce);
      if (!ready || !visible || document.hidden) return;
      if (reduce) render(performance.now());
      else unsubscribe = subscribeSea(render);
    };
    const observer = new IntersectionObserver(entries => {
      visible = entries.some(entry => entry.isIntersecting); update();
    });
    observer.observe(scene);
    const resize = new ResizeObserver(() => {
      w = scene.clientWidth; h = scene.clientHeight;
      if (ready) void prepare();
    });
    let generation = 0;
    const prepare = async () => {
      const ticket = ++generation;
      try {
        const [water] = await Promise.all([decodeSeaImage(waterUrl), decodeSeaImage(canoeUrl)]);
        await Promise.all(layerRefs.current.map((el, i) => el ? rasterSeaLayer(el, water, hazeOf(i)) : Promise.resolve()));
        if (disposed || ticket !== generation) return;
        ready = true; render(performance.now()); scene.dataset['ready'] = 'true'; update();
      } catch { /* Keep content usable if decorative artwork cannot be decoded. */ }
    };
    const onMotion = () => { reduce = motion.matches; update(); };
    motion.addEventListener('change', onMotion);
    document.addEventListener('visibilitychange', update);
    resize.observe(scene);
    // Two paints first, then idle work: never start animation during hydration.
    let idle = 0, timer = 0;
    const paint = requestAnimationFrame(() => {
      timer = window.setTimeout(() => {
        if ('requestIdleCallback' in window) idle = window.requestIdleCallback(() => void prepare(), { timeout: 500 });
        else void prepare();
      }, 0);
    });
    return () => {
      disposed = true; unsubscribe?.(); observer.disconnect(); resize.disconnect();
      cancelAnimationFrame(paint); clearTimeout(timer);
      if (idle) window.cancelIdleCallback(idle);
      motion.removeEventListener('change', onMotion); document.removeEventListener('visibilitychange', update);
    };
  }, [contained, onCanoeEntered]);

  return (
    <div ref={sceneRef} className={contained ? "papercut-sea papercut-sea--contained" : "papercut-sea"} aria-hidden="true">
      {layers.map((i) => <Layer key={i} i={i} setRef={(el) => { layerRefs.current[i] = el; }} />)}
      <div className="papercut-fog" style={{ zIndex: 5 }} />
      <div ref={shadowRef} className="papercut-contact" style={{ zIndex: frontFrom }}>
        <span className="papercut-ripple" /><span className="papercut-ripple papercut-ripple--2" /><span className="papercut-ripple papercut-ripple--3" />
      </div>
      <div ref={canoeRef} className="papercut-canoe" style={{ zIndex: frontFrom + 1 }}>
        <img src={canoeUrl} alt="" draggable={false} />
      </div>
      {Array.from({ length: SNIPPETS }, (_, k) => (
        <span key={k} ref={(el) => { snipRefs.current[k] = el; }} className={k % 2 ? "papercut-snip papercut-drop" : "papercut-snip"} style={{ zIndex: frontFrom }} />
      ))}
      <div className="papercut-grain" />
    </div>
  );
}
