import { useId } from "react";
import "./WiringDiagram.css";

/** Reference illustration only: fixed demo counts, never policy evaluation. */
export function WiringDiagram() {
  const grid = useId();
  return (
    <svg viewBox="0 0 1222 766" className="landing-wiring block h-auto w-full" role="img" aria-label="Policy flow: injury, quote over €1,200 and a new EV battery rule. Routine 3, down 5; review 17, up 6; info needed 4, down 1.">
      <defs>
        <pattern id={grid} x="53" y="62" width="51.4" height="51.4" patternUnits="userSpaceOnUse">
          <path d="M51.4 0H0V51.4" fill="none" stroke="var(--stone)" strokeOpacity="0.12" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="1222" height="766" fill="var(--paper)" />
      <rect x="20" y="29" width="1180" height="709" rx="32" fill="var(--mist)" stroke="var(--stone)" strokeOpacity="0.25" strokeWidth="2" />
      <rect x="53" y="62" width="1114" height="643" fill={`url(#${grid})`} />
      <g fill="none" strokeWidth="2">
        {Array.from({ length: 7 }, (_, i) => <path key={i} className="wiring-flow" d={`M74 ${233 + i * 5.3}H996`} stroke="var(--ink)" strokeOpacity="0.45" />)}
        <path className="wiring-flow" d="M288 265V460Q288 491 320 491H996" stroke="var(--ink)" strokeOpacity="0.45" />
        <path className="wiring-flow" d="M160 264V609Q160 640 192 640H996" stroke="var(--ink)" strokeOpacity="0.45" />
        <path className="wiring-flow" d="M74 212H580Q610 212 610 242V460Q610 491 642 491H996" stroke="var(--cedar)" strokeWidth="3" />
        <path className="wiring-flow wiring-ghost" d="M74 212H996" stroke="var(--cedar)" strokeOpacity="0.35" strokeWidth="1.6" />
      </g>
      <g className="wiring-gate">
        <rect x="203" y="173" width="214" height="112" rx="13" fill="var(--paper)" stroke="var(--ink)" strokeWidth="2.2" />
        <text x="220" y="210" fontFamily="var(--font-mono)" fontSize="18" fill="var(--stone)">R1.injury</text>
        <text x="220" y="244" fontFamily="var(--font-sans)" fontSize="24" fill="var(--ink)">Injury</text>
      </g>
      <g className="wiring-gate wiring-gate-quote">
        <rect x="460" y="173" width="214" height="112" rx="13" fill="var(--paper)" stroke="var(--ink)" strokeWidth="2.2" />
        <text x="477" y="210" fontFamily="var(--font-mono)" fontSize="18" fill="var(--stone)">R1.quote</text>
        <text x="477" y="244" fontFamily="var(--font-sans)" fontSize="24" fill="var(--cedar)">Quote &gt; €1,200</text>
      </g>
      <g className="wiring-gate wiring-gate-ev">
        <rect x="717" y="173" width="214" height="112" rx="13" fill="var(--paper)" stroke="var(--cedar)" strokeWidth="2.2" strokeDasharray="9 6" />
        <text x="734" y="210" fontFamily="var(--font-mono)" fontSize="18" fill="var(--stone)">R1.ev_battery</text>
        <text x="734" y="244" fontFamily="var(--font-sans)" fontSize="24" fill="var(--ink)">EV battery</text>
        <text x="734" y="272" fontFamily="var(--font-mono)" fontSize="16" fill="var(--cedar)" textDecoration="underline">new</text>
      </g>
      {[
        { y: 225, label: "ROUTINE", count: "3", delta: "−5" },
        { y: 478, label: "REVIEW", count: "17", delta: "+6" },
        { y: 629, label: "INFO NEEDED", count: "4", delta: "−1" },
      ].map(({ y, label, count, delta }) => <g key={label}>
        <text x="1013" y={y} fontFamily="var(--font-mono)" fontSize="20" fill="var(--stone)">{label}</text>
        <text x="1013" y={y + 47} fontFamily="var(--font-display)" fontSize="48" fontWeight="600" fill="var(--ink)">{count}</text>
        <text x="1077" y={y + 47} fontFamily="var(--font-mono)" fontSize="21" fill="var(--cedar)">{delta}</text>
      </g>)}
    </svg>
  );
}