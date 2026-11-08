import { useEffect, useRef, useState } from "react";
import "./LandingMotion.css";

const steps = [
  ["Collect", "The claim form only asks what the policy needs. “I’m not sure” stays blank - we never guess a fact."],
  ["Decide", "Written rules decide, in order. Every recommendation carries its rule and policy version. AI may help read documents; it never decides."],
  ["Review", "People handle the exceptions. Every correction is stored with the reviewer, the reason and the policy version."],
];

export function LandingSteps() {
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) {
      setVisible(true);
      return;
    }
    setReady(true);
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) { setVisible(true); observer.disconnect(); }
    }, { threshold: 0.25 });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return <div ref={ref} data-ready={ready} data-visible={visible} className="landing-steps mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
    <div aria-hidden="true" className="landing-step-line" />
    {steps.map(([title, text], i) => <div key={title} className={`landing-step landing-step-${i}`}>
      <span aria-hidden="true" className="relative block h-[15px] w-px bg-ink" />
      <div className="landing-step-copy"><p className="eyebrow mt-4 text-ink">{title}</p><p className="mt-3 leading-relaxed text-ink/80">{text}</p></div>
    </div>)}
  </div>;
}