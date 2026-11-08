import { useEffect, useId, useRef } from "react";
import { CanoeMark } from "./brand";
import "./ScrollWaves.css";

const waves = [{ x: 30, amplitude: 16, wavelength: 310 }, { x: 50, amplitude: 10, wavelength: 370 }, { x: 70, amplitude: 6, wavelength: 265 }];
const FADE = 160;

/** Decorative scroll position only, independent of claim and policy state.
 * Anchored in the document between the "Every claim..." headline ([data-waves-start])
 * and the "Steady through changing water." headline (#waves-end). */
export function ScrollWaves() {
  const root = useRef<HTMLDivElement>(null);
  const track = useRef<SVGSVGElement>(null);
  const logo = useRef<HTMLDivElement>(null);
  const filterId = `scroll-pencil-${useId().replace(/:/g, "")}`;
  useEffect(() => {
    const element = root.current;
    const svg = track.current;
    const mark = logo.current;
    if (!element || !svg || !mark) return;
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    const paths = Array.from(svg.querySelectorAll<SVGPathElement>(".scroll-wave-path"));
    let startY = 0, endY = 0, length = 0, current = -1, frame = 0, last = 0, time = 0;
    let active = false, measureNeeded = true;
    let accents: { element: HTMLElement; y: number }[] = [];
    const revealAccents = (boatY: number) => {
      for (const accent of accents) {
        if (motion.matches || boatY >= accent.y) accent.element.dataset["entered"] = "true";
      }
    };
    const measure = () => {
      measureNeeded = false;
      const start = document.querySelector<HTMLElement>("[data-waves-start]");
      const end = document.getElementById("waves-end");
      accents = Array.from(document.querySelectorAll<HTMLElement>("[data-canoe-accent]")).map(element => {
        const rect = element.getBoundingClientRect();
        return { element, y: scrollY + rect.top + rect.height / 2 };
      });
      active = !!start && !!end && innerWidth >= 1100;
      element.dataset["visible"] = String(active);
      if (!active || !start || !end) return;
      startY = start.getBoundingClientRect().top + scrollY;
      // Bottom of the last rendered line of the end headline.
      const rects = end.getClientRects();
      const lastRect = rects[rects.length - 1] ?? end.getBoundingClientRect();
      endY = lastRect.bottom + scrollY;
      length = Math.max(0, endY - startY);
      const parent = (element.offsetParent as HTMLElement | null) ?? document.body;
      const parentTop = parent.getBoundingClientRect().top + scrollY;
      element.style.top = `${startY - parentTop}px`;
      element.style.height = `${length}px`;
      // Centre the track in the gutter between the text column and the page edge.
      const textRight = end.getBoundingClientRect().right;
      element.style.left = `${Math.max(0, textRight + (innerWidth - textRight) * 0.8 - 50)}px`;
      svg.setAttribute("viewBox", `0 0 100 ${length}`);
    };
    const sample = (index: number, y: number, phase: number, boatY: number) => {
      const wave = waves[index];
      if (!wave) return 50;
      const local = Math.exp(-Math.pow((y - boatY) / 120, 2));
      const amplitude = wave.amplitude * (1 + 0.35 * local);
      const bend = index === 1 ? 0 : (index === 0 ? -5 : 5) * local;
      return wave.x + Math.sin(y * Math.PI * 2 / wave.wavelength + phase + index * 0.8) * amplitude + bend;
    };
    const render = (now: number) => {
      frame = 0;
      if (document.hidden) { last = 0; return; }
      if (measureNeeded) measure();
      if (!active || !length) {
        // Without a visible gutter canoe, use its screen-centre crossing instead.
        revealAccents(scrollY + innerHeight * 0.5);
        last = 0;
        return;
      }
      if (last) time += Math.min(now - last, 50);
      last = now;
      const reduced = motion.matches;
      // Sail with screen centre; once the end headline is on screen, glide to the end so "water" is reached.
      const endVisible = endY - scrollY < innerHeight * 0.9;
      const target = Math.max(0, Math.min(length, endVisible ? length : scrollY + innerHeight * 0.5 - startY));
      current = reduced || current < 0 ? target : current + (target - current) * 0.12;
      const phase = reduced ? 0 : time / 25000 * Math.PI * 2;
      const y = current;
      // Use the rendered (smoothed) canoe position, not viewport entry timing.
      revealAccents(startY + y);
      const x = sample(1, y, phase, y);
      const fade = Math.max(0, Math.min(1, y / FADE, (length - y) / FADE));
      mark.style.opacity = fade.toFixed(3);
      const tangent = Math.atan((sample(1, y + 1, phase, y) - sample(1, y - 1, phase, y)) / 2) * 180 / Math.PI;
      const angle = reduced ? 0 : Math.max(-12, Math.min(12, -tangent)) + Math.sin(time / 3000 * Math.PI * 2) * 1.5;
      mark.style.transform = `translate3d(${x - 20}px, ${y - 20}px, 0) rotate(${angle}deg)`;
      paths.forEach((path, index) => {
        const waveIndex = index % 3;
        const points: string[] = [];
        for (let py = 0; py <= length; py += 8) points.push(`${points.length ? "L" : "M"}${sample(waveIndex, py, phase, y).toFixed(2)},${py}`);
        path.setAttribute("d", points.join(" "));
      });
      // Keep drifting only while the track is on screen.
      const onScreen = startY < scrollY + innerHeight && endY > scrollY;
      if (!reduced && (onScreen || Math.abs(target - current) > 0.5)) frame = requestAnimationFrame(render);
    };
    const request = () => { if (!frame && !document.hidden) frame = requestAnimationFrame(render); };
    const update = () => { measureNeeded = true; request(); };
    const visibility = () => { if (document.hidden) { cancelAnimationFrame(frame); frame = 0; last = 0; } else update(); };
    const resize = new ResizeObserver(update);
    resize.observe(document.body);
    window.addEventListener("scroll", request, { passive: true });
    window.addEventListener("resize", update, { passive: true });
    document.addEventListener("visibilitychange", visibility);
    motion.addEventListener("change", update);
    document.fonts?.ready.then(update).catch(() => {});
    // Route changes swap page content; re-check the anchors.
    const mutations = new MutationObserver(update);
    mutations.observe(document.body, { childList: true, subtree: true });
    update();
    return () => {
      cancelAnimationFrame(frame); resize.disconnect(); mutations.disconnect();
      window.removeEventListener("scroll", request); window.removeEventListener("resize", update);
      document.removeEventListener("visibilitychange", visibility); motion.removeEventListener("change", update);
    };
  }, []);
  return <div ref={root} className="scroll-waves" aria-hidden="true">
    <svg ref={track} className="scroll-waves-track" fill="none" stroke="currentColor" strokeWidth="0.9" strokeLinecap="round" strokeLinejoin="round" preserveAspectRatio="none">
      <defs><filter id={filterId} x="-30%" y="-5%" width="160%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="1" seed="4" result="noise" /><feDisplacementMap in="SourceGraphic" in2="noise" scale="1.5" xChannelSelector="R" yChannelSelector="G" /></filter></defs>
      <g filter={`url(#${filterId})`} opacity="0.7">{waves.map((_, i) => <path key={i} className="scroll-wave-path" />)}<g className="scroll-waves-copy" transform="translate(0.6 0.6)">{waves.map((_, i) => <path key={i} className="scroll-wave-path" />)}</g></g>
    </svg>
    <div ref={logo} className="scroll-waves-logo"><CanoeMark size={40} /></div>
  </div>;
}
