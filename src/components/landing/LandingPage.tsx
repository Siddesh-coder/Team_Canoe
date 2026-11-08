import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { PencilBackdrop } from "@/components/canoe/PencilBackdrop";
import { Wordmark } from "@/components/canoe/brand";
import { useSiteTools } from "@/components/site-tools/SiteTools";
import { useDemoSession } from "@/components/demo-role/DemoSession";
import { ROLE_PAGE, type DemoRole } from "@/lib/demo-role/logic";
import { Button } from "@/components/ui/button";
import { WiringDiagram } from "./WiringDiagram";
import { TodaySlide } from "./TodaySlide";
import { LandingSteps } from "./LandingSteps";
import "./LandingMotion.css";

// Static landing mockup. No logic here; links only.
const navLink = "font-mono text-[11px] uppercase tracking-[0.14em] text-stone hover:text-ink";
const btnMain = "btn-cedar inline-flex items-center px-5 py-2.5 text-sm";
const btnGhost = "btn-quiet inline-flex items-center px-5 py-2.5 text-sm";

// In-page jump that never writes a hash into the address bar: a #section left
// there makes the browser reopen the site at that section instead of the hero.
function NavAnchor({ id, children }: { id: string; children: ReactNode }) {
  return (
    <a
      href={`#${id}`}
      className={navLink}
      onClick={(e) => {
        e.preventDefault();
        document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
      }}
    >
      {children}
    </a>
  );
}

function Section({ id, children, className = "" }: { id?: string; children: ReactNode; className?: string }) {
  return (
    <section id={id} className={`relative z-10 mx-auto max-w-[1120px] scroll-mt-20 px-5 py-20 md:px-8 md:py-28 ${className}`}>
      {children}
    </section>
  );
}

const H2 = ({ children }: { children: ReactNode }) => (
  <h2 className="font-display text-[32px] leading-[1.05] tracking-[-0.02em] md:text-[44px]">{children}</h2>
);

function CanoeAccent({ children }: { children: ReactNode }) {
  return <span className="landing-hold" data-canoe-accent><span className="relative inline-block not-italic">{children}<svg viewBox="0 0 200 10" preserveAspectRatio="none" aria-hidden="true" className="absolute -bottom-[0.14em] left-0 h-[0.14em] w-full text-cedar/60"><path pathLength="1" d="M2 6 Q26 1 50 6 T100 6 T150 6 T198 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" /></svg></span></span>;
}

function MainButtons() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Link to="/claim" className={btnMain}>Report a claim</Link>
      <Link to="/policy" className={btnGhost}>See a policy change</Link>
    </div>
  );
}

const team = [
  { name: "Mattis", line: "GTM Engineer", initials: "M" },
  { name: "Maximilian", line: "Sales", initials: "M" },
  { name: "Siddesh", line: "AI engineer", initials: "S" },
  { name: "Vineth", line: "AI engineer", initials: "V" },
];

export function LandingPage() {
  const { t } = useSiteTools();
  const { session } = useDemoSession();
  const [canoeEntered, setCanoeEntered] = useState(false);
  const onCanoeEntered = useCallback(() => setCanoeEntered(true), []);
  // A stale #section left in the address bar would land the visitor mid-page,
  // so drop it and open on the hero.
  useEffect(() => {
    if (!window.location.hash) return;
    history.replaceState(null, "", window.location.pathname + window.location.search);
    window.scrollTo({ top: 0 });
  }, []);
  const entries: [DemoRole, string][] = [["reviewer", "I'M A CLAIMS REVIEWER →"], ["policy_owner", "I'M A POLICY OWNER →"], ["operations", "I'M A OPERATIONS LEAD →"]];
  return (
    <div className="relative isolate overflow-hidden">
      {/* 1. HERO */}
      <div className="relative min-h-screen pb-[34vh] md:pb-0">
        {/* TODO(hero-boat): hero boat animation - swap in the redrawn canoe asset and its entrance here. */}
        <PencilBackdrop contained onCanoeEntered={onCanoeEntered} />
        <nav className="relative z-10 mx-auto flex max-w-[1120px] items-center justify-between gap-4 px-5 pt-6 md:px-8">
          <Wordmark />
          <div className="hidden items-center gap-6 md:flex">
            <NavAnchor id="how-it-works">How it works</NavAnchor>
            <NavAnchor id="policy-change">Policy change</NavAnchor>
            <NavAnchor id="team">Team</NavAnchor>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/track" className="text-xs text-ink underline underline-offset-4">{t("Track a claim")}</Link>
            <Link to="/claim" className="btn-cedar inline-flex px-4 py-2 text-sm">Report a claim</Link>
          </div>
        </nav>
        <Section className="!pt-12 md:!pt-14">
          <p className="eyebrow mb-5">Canoe / claims triage</p>
          <h1 className="max-w-[760px] font-display text-[44px] leading-[1.05] tracking-[-0.02em] md:text-[68px]">
            Decisions that <span className="landing-hold" data-entered={canoeEntered}><span className="relative inline-block not-italic">hold<svg viewBox="0 0 200 10" preserveAspectRatio="none" aria-hidden="true" className="absolute -bottom-[0.14em] left-0 h-[0.14em] w-full text-cedar/60"><path pathLength="1" d="M2 6 Q26 1 50 6 T100 6 T150 6 T198 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" /></svg></span></span> when the rules change.
          </h1>
          <p className="mt-6 max-w-[580px] text-[17px] leading-relaxed text-ink/80">
            Canoe reads a motor claim, applies your written policy and tells your team the next step - with the facts, the rule and the policy version behind every answer. When the policy changes, you see what moves before it goes live.
          </p>
          <div className="mt-6 space-y-4">
            <div className="flex flex-wrap items-center gap-5"><Button asChild><Link to="/claim">Report a claim</Link></Button><Button asChild variant="outline" className="hover:border-cedar hover:bg-transparent hover:text-cedar"><Link to="/batch">Batch version</Link></Button><Link to="/track" className="text-sm text-stone underline underline-offset-4 hover:text-cedar">{t("Track a claim")}</Link></div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {entries.map(([role, label]) => <Button key={role} asChild variant="outline" className="h-auto w-full justify-between whitespace-normal rounded-none border-ink bg-transparent px-5 py-5 text-left font-mono text-[11px] uppercase tracking-[0.18em] hover:border-cedar hover:bg-transparent hover:text-cedar">{session?.role === role ? <Link to={ROLE_PAGE[role]}>{label}</Link> : <Link to="/sign-in" search={{ role, next: ROLE_PAGE[role] }}>{label}</Link>}</Button>)}
            </div>
          </div>
        </Section>
      </div>

      {/* 2. PROBLEM */}
      <TodaySlide />

      {/* 3. HOW IT WORKS */}
      <Section id="how-it-works">
        <H2>Collect. <CanoeAccent>Decide</CanoeAccent>. Review.</H2>
        <LandingSteps />
      </Section>

      {/* 4. CHANGE MOMENT */}
      <Section id="policy-change">
        <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div>
            <p className="eyebrow mb-4">Policy v1 → v2</p>
            <H2>See what <CanoeAccent>moves</CanoeAccent> before it goes live.</H2>
            <p className="mt-6 leading-relaxed text-ink/80">Lower the review limit from €1,500 to €1,200 and send EV battery work to review. Canoe re-runs every open claim, shows exactly which ones change and leaves closed decisions as they were.</p>
            <p className="mt-5 font-mono text-xs uppercase tracking-[0.08em] text-stone">24 open claims re-run · 6 change · 2 closed, untouched</p>
            <Link to="/policy" className={`${btnMain} mt-8`}>Try it</Link>
          </div>
          <WiringDiagram />
        </div>
      </Section>

      {/* 5. FOR WHOM */}
      <Section className="!pt-0 md:!pt-4">
        <div className="grid gap-5 md:grid-cols-3">
          {[
            ["Reviewers", "Understand and decide in under a minute."],
            ["Policy owners", "Change rules safely, with an approver."],
            ["Operations", "See quality, workload and every decision’s history."],
          ].map(([h, t]) => (
            <div key={h} className="landing-role-card card-calm p-6">
              <h3 className="font-display text-2xl">{h}</h3>
              <p className="mt-3 text-ink/80">{t}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* 7. BUSINESS VALUE - figures from the business case (assumptions, base case 200K claims). */}
      <Section className="!pb-10 md:!pb-12">
        <H2>What it is <CanoeAccent>worth</CanoeAccent>.</H2>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {[
            { value: "€158K", label: "Net per year - 200K claims, base case" },
            { value: "1.9", label: "Months to pay back" },
            { value: "1-10 min", label: "Per rule change, instead of weeks" },
          ].map(({ value, label }) => (
            <div key={label} className="landing-role-card card-calm p-6">
              <p className="font-display text-5xl">{value}</p>
              <p className="mt-3 text-sm text-ink/80">{label}</p>
            </div>
          ))}
        </div>
        <p className="mt-5 text-sm text-stone">Assumed figures - the full model and its sources are on the business page.</p>
      </Section>

      {/* 8. PRINCIPLES */}
      <Section className="!pt-10 md:!pt-12">
        <div className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
          {["Rules decide. AI only assists.", "Blank stays blank.", "Closed stays closed.", "Every decision carries its version."].map((t, i) => (
            <div key={t} className="landing-principle flex items-baseline gap-5 border-t border-border pt-5">
              <span className="font-mono text-xs text-cedar">0{i + 1}</span>
              <p className="landing-principle-text min-w-0 font-display text-2xl">{t}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* 9. TEAM */}
      <Section id="team">
        <p className="eyebrow mb-4">About us</p>
        <H2>Four people, one <CanoeAccent>canoe</CanoeAccent>.</H2>
        <p className="mt-6 max-w-[620px] text-ink/80">Why Canoe: Filing a claim is stressful, and Canoe is built to make it feel like calm water. Every recommendation shows the rules behind it, so claimants and reviewers always know why a claim goes where it goes.</p>
        {/* TODO(portraits): replace the graphite circles with pencil-sketch portraits. */}
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {team.map((m, i) => (
            <div key={i} className="landing-role-card card-calm p-6">
              <div aria-hidden="true" className="flex h-20 w-20 items-center justify-center rounded-full border border-ink/40 bg-[radial-gradient(circle_at_35%_30%,var(--mist),color-mix(in_oklab,var(--stone)_35%,var(--paper)))] font-display text-xl text-ink/70">{m.initials}</div>
              <p className="mt-5 font-display text-xl">{m.name}</p>
              <p className="mt-2 text-sm text-ink/80">{m.line}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* 10. CLOSING */}
      <div className="relative min-h-[620px]">
        <PencilBackdrop contained />
        <Section className="text-left">
          <p id="waves-end" className="max-w-[760px] font-display text-[40px] leading-[1.05] tracking-[-0.02em] md:text-[60px]">Steady through changing <CanoeAccent>water</CanoeAccent>.</p>
          <div className="mt-8"><MainButtons /></div>
        </Section>
      </div>
      <footer className="relative z-10 border-t border-border bg-paper">
        <div className="mx-auto flex max-w-[1120px] flex-col gap-6 px-5 py-10 md:flex-row md:items-start md:justify-between md:px-8">
          <div className="max-w-[560px] space-y-3">
            <Wordmark />
            <p className="text-sm text-stone">Built for the Taktile case at thinc! Munich 2026. Fictional insurer and claims data. Canoe never approves or pays a claim.</p>
          </div>
          <div className="flex gap-6">
            <Link to="/review" className={navLink}>Review</Link>
            <Link to="/policy" className={navLink}>Policy</Link>
            <Link to="/claim" className={navLink}>Report a claim</Link>
            <Link to="/track" className={navLink}>{t("Track a claim")}</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
