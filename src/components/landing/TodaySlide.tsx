import { useEffect, useId, useRef, useState } from "react";
import "./TodaySlide.css";

const statements = [
  "3 minutes per simple claim, 9 per escalation.",
  "0% of claims pass without a person.",
  "A rule change takes weeks to months to reach production.",
];

// Writing-hand silhouette follows the supplied pencil-in-hand reference.
const pencilStrokes = [
  "M57 94 43 79C34 77 30 66 27 56L20 44C17 39 20 34 24 34C29 34 32 41 35 44C41 48 49 48 54 45 M85 83C72 75 68 68 67 52L66 40",
  "M22 33C23 26 28 22 36 20L44 17C50 15 56 20 62 23L68 28C71 30 73 34 73 37 M42 19C41 26 44 30 49 32L55 36 M32 25C34 30 37 32 42 32",
  "M20 37C14 38 15 43 20 44 M21 44C15 45 16 50 23 51 M24 51C19 54 22 58 29 57 M35 44C37 39 42 37 48 37 M32 62C33 57 36 54 40 53 M43 79C48 78 52 81 54 84",
  "M19 32 8 33 3 35 8 37 20 38 M28 34 89 37C92 37 92 42 89 42L34 39 M8 33 8 37 M28 36 89 39 M86 37 86 42 M89 37C87 38 87 41 89 42",
  "M25 34C29 32 32 35 35 39 M49 32 47 36 M57 30 54 36 M40 41C45 43 50 43 55 41",
];

function PencilHand({ filterId }: { filterId: string }) {
  return <svg viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="today-pencil">
    <defs><filter id={filterId} x="-15%" y="-15%" width="130%" height="130%"><feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="1" seed="7" result="pencil-noise" /><feDisplacementMap in="SourceGraphic" in2="pencil-noise" scale="0.65" xChannelSelector="R" yChannelSelector="G" /></filter></defs>
    <g filter={`url(#${filterId})`}>{pencilStrokes.map((d, i) => <path key={d} d={d} pathLength={1} className={`today-pencil-stroke today-pencil-stroke-${i}`} />)}
      <g className="today-pencil-copy" transform="translate(0.6 0.6) rotate(0.8 50 50)">{pencilStrokes.map((d, i) => <path key={d} d={d} pathLength={1} className={`today-pencil-stroke today-pencil-stroke-${i}`} />)}</g>
    </g>
  </svg>;
}

export function TodaySlide() {
  const section = useRef<HTMLElement>(null);
  const [ready, setReady] = useState(false);
  const [visible, setVisible] = useState(false);
  const pencilFilterId = `today-pencil-${useId().replace(/:/g, "")}`;
  useEffect(() => {
    const element = section.current;
    if (!element) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) {
      setVisible(true);
      return;
    }
    setReady(true);
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) { setVisible(true); observer.disconnect(); }
    }, { threshold: 0.12 });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <section ref={section} aria-labelledby="today-heading" data-ready={ready} data-visible={visible} className="today-slide relative z-10">
      <div className="mx-auto max-w-[1186px] px-5 py-20 md:px-8 md:py-28">
        <div className="today-intro">
          <p className="font-mono text-sm uppercase tracking-[0.14em] text-stone md:text-xl">TODAY</p>
          <h2 id="today-heading" data-waves-start="" aria-label="Every claim is handled by hand." className="today-headline mt-6 font-display text-[32px] font-bold leading-[1.12] tracking-[-0.02em] md:text-[44px]">
            <span aria-hidden="true"><span className="today-word today-word-0">Every</span>{" "}<span className="today-word today-word-1">claim</span>{" "}<span className="today-word today-word-2">is</span>{" "}<span className="today-word today-word-3">handled</span>{" "}<span className="today-hand-phrase"><span className="today-word today-word-4">by</span>{" "}<span className="today-word today-word-5">hand<span className="today-hand-period">.<span className="today-hand"><PencilHand filterId={pencilFilterId} /></span></span></span><svg className="today-hand-underline" viewBox="0 0 200 10" preserveAspectRatio="none" fill="none"><path pathLength="1" d="M2 6 Q18 2 34 6 T66 6 T98 6 T130 6 T162 6 T198 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg></span></span>
          </h2>
        </div>
        <ol className="mt-10 md:mt-14">
          {statements.map((text, i) => <li key={text} className={`today-row today-row-${i} relative`}>
            <div aria-hidden="true" className={`today-divider today-divider-${i} h-px w-full bg-border`} />
            <div className="grid grid-cols-[2rem_minmax(0,1fr)] items-baseline gap-3 py-5 md:grid-cols-[3rem_minmax(0,1fr)] md:gap-6 md:py-8">
              <span className="today-index font-mono text-sm text-cedar md:text-xl">0{i + 1}</span>
              <div className="today-statement min-w-0 pr-2"><p className="today-text font-display text-lg font-bold leading-[1.3] tracking-normal md:text-[28px]">{text}</p></div>
            </div>
          </li>)}
        </ol>
        <div aria-hidden="true" className="today-divider today-divider-3 h-px w-full bg-border" />
        <p className="today-footnote mt-6 text-sm leading-relaxed text-stone md:mt-8 md:text-lg">Assumed figures for a mid-sized European motor insurer, from our interview with the case team.</p>
      </div>
    </section>
  );
}